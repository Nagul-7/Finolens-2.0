import { pool } from '../db/pool';
import { getBroker } from './kiteClient';
import { getQuotes } from './quoteService';
import { Candle } from './brokerTypes';
import { AppError } from '../middleware/errorHandler';

// Default notional per paper trade — quantity = whole shares that fit in this.
export const POSITION_SIZE_INR = 10_000;
// Hard cap: a single paper position may not exceed this notional.
export const MAX_POSITION_SIZE_INR = 100_000;
const HOLDING_DAYS = 10;

interface SignalForTrade {
  id: number;
  signal_type: 'BUY' | 'SELL' | 'NEUTRAL';
  entry_price: string;
  suggested_stop_loss: string | null;
  suggested_target: string | null;
  stock_id: number;
  symbol: string;
  exchange: string;
  instrument_token: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pnlFor(
  type: 'BUY' | 'SELL',
  entry: number,
  exit: number,
  qty: number,
): { pnl: number; pnl_pct: number } {
  const perShare = type === 'BUY' ? exit - entry : entry - exit;
  return { pnl: round2(perShare * qty), pnl_pct: round2((perShare / entry) * 100) };
}

// ─── Create a paper trade from a signal ───────────────────────────────────────
export async function createPaperTrade(
  signalId: number,
  quantityOverride?: number,
): Promise<{ id: number }> {
  const { rows } = await pool.query<SignalForTrade>(
    `SELECT sig.id, sig.signal_type, sig.entry_price, sig.suggested_stop_loss,
            sig.suggested_target, sig.stock_id, st.symbol, st.exchange, st.instrument_token
     FROM signals sig
     JOIN stocks st ON st.id = sig.stock_id
     WHERE sig.id = $1`,
    [signalId],
  );
  if (rows.length === 0) {
    throw new AppError(404, `Signal not found: ${signalId}`);
  }
  const sig = rows[0];
  if (sig.signal_type === 'NEUTRAL') {
    throw new AppError(400, 'Cannot paper-trade a NEUTRAL signal');
  }

  // One open position per symbol per direction — a real positions book, not a
  // log of duplicate fills.
  const existing = await pool.query(
    `SELECT id FROM paper_trades
     WHERE stock_id = $1 AND trade_type = $2 AND status = 'OPEN'`,
    [sig.stock_id, sig.signal_type],
  );
  if (existing.rows.length > 0) {
    throw new AppError(
      409,
      `You already hold an open ${sig.symbol} ${sig.signal_type} position`,
    );
  }

  const entry = Number(sig.entry_price);
  const maxQty = Math.max(1, Math.floor(MAX_POSITION_SIZE_INR / entry));
  const quantity = quantityOverride ?? Math.max(1, Math.floor(POSITION_SIZE_INR / entry));

  // Quantity must be a positive integer within the max position notional.
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, 'Quantity must be a positive integer');
  }
  if (quantity > maxQty) {
    throw new AppError(
      400,
      `Quantity ${quantity} exceeds the max position of ₹${MAX_POSITION_SIZE_INR.toLocaleString('en-IN')} ` +
        `(max ${maxQty} shares at ₹${entry.toFixed(2)})`,
    );
  }

  // Route the fill through the broker (paper mode). LIMIT at the signal's entry
  // so the recorded entry is deterministic and matches what the user confirmed.
  const broker = getBroker();
  const fill = await broker.placeOrder({
    tradingsymbol: sig.symbol,
    exchange: sig.exchange,
    transaction_type: sig.signal_type,
    quantity,
    order_type: 'LIMIT',
    product: 'CNC',
    price: entry,
  });

  const insert = await pool.query<{ id: number }>(
    `INSERT INTO paper_trades
       (signal_id, stock_id, trade_type, quantity, entry_price, status)
     VALUES ($1, $2, $3, $4, $5, 'OPEN')
     RETURNING id`,
    [signalId, sig.stock_id, sig.signal_type, quantity, fill.average_price],
  );
  return { id: insert.rows[0].id };
}

// ─── List trades (open enriched with live P&L) ────────────────────────────────
interface TradeRow {
  id: number;
  signal_id: number | null;
  symbol: string;
  name: string | null;
  trade_type: 'BUY' | 'SELL';
  quantity: number;
  entry_price: string;
  entry_time: Date;
  exit_price: string | null;
  exit_time: Date | null;
  exit_reason: string | null;
  pnl: string | null;
  pnl_pct: string | null;
  status: 'OPEN' | 'CLOSED';
  stop: string | null;
  target: string | null;
}

export async function getTrades(status?: 'open' | 'closed'): Promise<unknown[]> {
  const params: unknown[] = [];
  let where = '';
  if (status === 'open') where = "WHERE pt.status = 'OPEN'";
  else if (status === 'closed') where = "WHERE pt.status = 'CLOSED'";

  const { rows } = await pool.query<TradeRow>(
    `SELECT pt.id, pt.signal_id, st.symbol, st.name, pt.trade_type, pt.quantity,
            pt.entry_price, pt.entry_time, pt.exit_price, pt.exit_time, pt.exit_reason,
            pt.pnl, pt.pnl_pct, pt.status,
            sig.suggested_stop_loss AS stop, sig.suggested_target AS target
     FROM paper_trades pt
     JOIN stocks st ON st.id = pt.stock_id
     LEFT JOIN signals sig ON sig.id = pt.signal_id
     ${where}
     ORDER BY pt.entry_time DESC`,
    params,
  );

  const openSymbols = rows.filter((r) => r.status === 'OPEN').map((r) => r.symbol);
  const quotes = openSymbols.length > 0 ? await getQuotes(openSymbols) : {};

  return rows.map((r) => {
    const entry = Number(r.entry_price);
    const stop = r.stop === null ? null : Number(r.stop);
    const target = r.target === null ? null : Number(r.target);
    const base = {
      id: r.id,
      signal_id: r.signal_id,
      symbol: r.symbol,
      name: r.name,
      trade_type: r.trade_type,
      quantity: r.quantity,
      entry_price: entry,
      entry_time: r.entry_time,
      exit_price: r.exit_price === null ? null : Number(r.exit_price),
      exit_time: r.exit_time,
      exit_reason: r.exit_reason,
      pnl: r.pnl === null ? null : Number(r.pnl),
      pnl_pct: r.pnl_pct === null ? null : Number(r.pnl_pct),
      status: r.status,
      stop,
      target,
    };
    if (r.status !== 'OPEN') return base;

    const ltp = quotes[r.symbol]?.ltp ?? null;
    if (ltp === null) return { ...base, current_price: null };
    const { pnl, pnl_pct } = pnlFor(r.trade_type, entry, ltp, r.quantity);
    return {
      ...base,
      current_price: ltp,
      unrealized_pnl: pnl,
      unrealized_pnl_pct: pnl_pct,
      dist_to_stop_pct: stop === null ? null : round2(((ltp - stop) / ltp) * 100),
      dist_to_target_pct: target === null ? null : round2(((target - ltp) / ltp) * 100),
    };
  });
}

// ─── Manual close at current LTP ──────────────────────────────────────────────
export async function closeTrade(
  id: number,
  reason: 'MANUAL' | 'TARGET_HIT' | 'STOP_LOSS' | 'TIMEOUT' = 'MANUAL',
  exitPriceOverride?: number,
): Promise<unknown> {
  const { rows } = await pool.query<{
    trade_type: 'BUY' | 'SELL';
    entry_price: string;
    quantity: number;
    status: string;
    symbol: string;
  }>(
    `SELECT pt.trade_type, pt.entry_price, pt.quantity, pt.status, st.symbol
     FROM paper_trades pt JOIN stocks st ON st.id = pt.stock_id
     WHERE pt.id = $1`,
    [id],
  );
  if (rows.length === 0) throw new AppError(404, `Trade not found: ${id}`);
  const t = rows[0];
  if (t.status !== 'OPEN') throw new AppError(409, 'Trade is already closed');

  let exit = exitPriceOverride;
  if (exit === undefined) {
    const q = await getQuotes([t.symbol]);
    const ltp = q[t.symbol]?.ltp;
    if (ltp == null) throw new AppError(502, `No live price for ${t.symbol}`);
    exit = ltp;
  }
  const { pnl, pnl_pct } = pnlFor(t.trade_type, Number(t.entry_price), exit, t.quantity);

  const upd = await pool.query(
    `UPDATE paper_trades
     SET status = 'CLOSED', exit_price = $2, exit_time = NOW(),
         exit_reason = $3, pnl = $4, pnl_pct = $5
     WHERE id = $1
     RETURNING id, exit_price, pnl, pnl_pct, exit_reason`,
    [id, exit, reason, pnl, pnl_pct],
  );
  return upd.rows[0];
}

// ─── Evaluate OPEN trades against subsequent candles ──────────────────────────
export interface TradeEvalSummary {
  scanned: number;
  closed: number;
  stillOpen: number;
}

export async function evaluatePaperTrades(): Promise<TradeEvalSummary> {
  const broker = getBroker();
  const { rows } = await pool.query<{
    id: number;
    trade_type: 'BUY' | 'SELL';
    entry_price: string;
    quantity: number;
    entry_time: Date;
    stop: string | null;
    target: string | null;
    instrument_token: string | null;
  }>(
    `SELECT pt.id, pt.trade_type, pt.entry_price, pt.quantity, pt.entry_time,
            sig.suggested_stop_loss AS stop, sig.suggested_target AS target,
            st.instrument_token
     FROM paper_trades pt
     JOIN stocks st ON st.id = pt.stock_id
     LEFT JOIN signals sig ON sig.id = pt.signal_id
     WHERE pt.status = 'OPEN'`,
  );

  const summary: TradeEvalSummary = { scanned: rows.length, closed: 0, stillOpen: 0 };

  for (const t of rows) {
    if (t.instrument_token === null) {
      summary.stillOpen += 1;
      continue;
    }
    const entryDate = isoDate(t.entry_time);
    const to = new Date(t.entry_time);
    to.setUTCDate(to.getUTCDate() + HOLDING_DAYS * 3);
    const candles = await broker.getHistoricalData(
      Number(t.instrument_token),
      entryDate,
      isoDate(to),
      'day',
    );
    const future: Candle[] = candles.filter((c) => c.date > entryDate).slice(0, HOLDING_DAYS);
    if (future.length === 0) {
      summary.stillOpen += 1;
      continue;
    }

    const stop = t.stop === null ? null : Number(t.stop);
    const target = t.target === null ? null : Number(t.target);
    let exitPrice: number | null = null;
    let reason: 'STOP_LOSS' | 'TARGET_HIT' | 'TIMEOUT' | null = null;
    let exitDate: string | null = null;

    for (const c of future) {
      if (t.trade_type === 'BUY') {
        if (stop !== null && c.low <= stop) {
          exitPrice = stop;
          reason = 'STOP_LOSS';
        } else if (target !== null && c.high >= target) {
          exitPrice = target;
          reason = 'TARGET_HIT';
        }
      } else {
        if (stop !== null && c.high >= stop) {
          exitPrice = stop;
          reason = 'STOP_LOSS';
        } else if (target !== null && c.low <= target) {
          exitPrice = target;
          reason = 'TARGET_HIT';
        }
      }
      if (reason) {
        exitDate = c.date;
        break;
      }
    }

    if (!reason && future.length >= HOLDING_DAYS) {
      exitPrice = future[future.length - 1].close;
      exitDate = future[future.length - 1].date;
      reason = 'TIMEOUT';
    }

    if (reason && exitPrice !== null) {
      const { pnl, pnl_pct } = pnlFor(t.trade_type, Number(t.entry_price), exitPrice, t.quantity);
      await pool.query(
        `UPDATE paper_trades
         SET status = 'CLOSED', exit_price = $2, exit_time = $3::date,
             exit_reason = $4, pnl = $5, pnl_pct = $6
         WHERE id = $1`,
        [t.id, exitPrice, exitDate, reason, pnl, pnl_pct],
      );
      summary.closed += 1;
    } else {
      summary.stillOpen += 1;
    }
  }
  return summary;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getTradeStats(): Promise<unknown> {
  const { rows } = await pool.query<{
    open_count: string;
    closed_count: string;
    realized_pnl: string | null;
    wins: string;
    losses: string;
    avg_win: string | null;
    avg_loss: string | null;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'OPEN')::text   AS open_count,
       COUNT(*) FILTER (WHERE status = 'CLOSED')::text AS closed_count,
       COALESCE(SUM(pnl) FILTER (WHERE status = 'CLOSED'), 0)::text AS realized_pnl,
       COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0)::text  AS wins,
       COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl <= 0)::text AS losses,
       AVG(pnl) FILTER (WHERE status = 'CLOSED' AND pnl > 0)::text  AS avg_win,
       AVG(pnl) FILTER (WHERE status = 'CLOSED' AND pnl <= 0)::text AS avg_loss
     FROM paper_trades`,
  );
  const r = rows[0];
  const closed = parseInt(r.closed_count, 10);
  const wins = parseInt(r.wins, 10);
  return {
    open_count: parseInt(r.open_count, 10),
    closed_count: closed,
    realized_pnl: round2(Number(r.realized_pnl ?? 0)),
    wins,
    losses: parseInt(r.losses, 10),
    win_rate_pct: closed > 0 ? Math.round((wins / closed) * 1000) / 10 : null,
    avg_win: r.avg_win === null ? null : round2(Number(r.avg_win)),
    avg_loss: r.avg_loss === null ? null : round2(Number(r.avg_loss)),
  };
}
