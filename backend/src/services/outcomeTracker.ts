import { pool } from '../db/pool';
import { getBroker } from './kiteClient';
import { Candle } from './brokerTypes';

const HOLDING_DAYS = 10; // swing-trade evaluation window
const FLAT_BAND = 0.005; // +/-0.5% final drift counts as BREAKEVEN

interface OpenSignalRow {
  signal_id: number;
  signal_type: 'BUY' | 'SELL' | 'NEUTRAL';
  entry_price: string;
  suggested_stop_loss: string | null;
  suggested_target: string | null;
  generated_at: Date;
  instrument_token: string | null;
}

interface Evaluation {
  price_after_1d: number | null;
  price_after_3d: number | null;
  price_after_5d: number | null;
  price_after_10d: number | null;
  max_profit_pct: number | null;
  max_loss_pct: number | null;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN';
}

export interface EvaluationSummary {
  scanned: number;
  terminal: number; // moved to WIN/LOSS/BREAKEVEN this run
  stillOpen: number;
  noData: number; // no future candles yet
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nth(window: Candle[], i: number): number | null {
  return i < window.length ? window[i].close : null;
}

/**
 * Decide the outcome for one BUY/SELL signal given the candles that occurred
 * after it. Iterates in chronological order so whichever of target/stop is
 * touched first wins; if a candle could hit both, the stop is assumed first
 * (conservative). NEUTRAL signals carry no position and settle to BREAKEVEN
 * once the holding window has fully elapsed.
 */
function evaluate(sig: OpenSignalRow, future: Candle[]): Evaluation {
  const window = future.slice(0, HOLDING_DAYS);
  const entry = Number(sig.entry_price);
  const base: Evaluation = {
    price_after_1d: nth(window, 0),
    price_after_3d: nth(window, 2),
    price_after_5d: nth(window, 4),
    price_after_10d: nth(window, 9),
    max_profit_pct: null,
    max_loss_pct: null,
    outcome: 'OPEN',
  };

  if (window.length === 0) return base; // nothing to evaluate yet

  const elapsed = window.length >= HOLDING_DAYS;

  if (sig.signal_type === 'NEUTRAL') {
    // No trade taken — no P&L. Settle to BREAKEVEN only once the window elapses.
    base.outcome = elapsed ? 'BREAKEVEN' : 'OPEN';
    return base;
  }

  const stop = sig.suggested_stop_loss === null ? null : Number(sig.suggested_stop_loss);
  const target = sig.suggested_target === null ? null : Number(sig.suggested_target);
  const maxHigh = Math.max(...window.map((c) => c.high));
  const minLow = Math.min(...window.map((c) => c.low));

  if (sig.signal_type === 'BUY') {
    base.max_profit_pct = round2(((maxHigh - entry) / entry) * 100);
    base.max_loss_pct = round2(((minLow - entry) / entry) * 100);
    for (const c of window) {
      if (stop !== null && c.low <= stop) {
        base.outcome = 'LOSS';
        return base;
      }
      if (target !== null && c.high >= target) {
        base.outcome = 'WIN';
        return base;
      }
    }
  } else {
    // SELL — favourable excursion is price falling.
    base.max_profit_pct = round2(((entry - minLow) / entry) * 100);
    base.max_loss_pct = round2(((entry - maxHigh) / entry) * 100);
    for (const c of window) {
      if (stop !== null && c.high >= stop) {
        base.outcome = 'LOSS';
        return base;
      }
      if (target !== null && c.low <= target) {
        base.outcome = 'WIN';
        return base;
      }
    }
  }

  // Neither stop nor target touched.
  if (elapsed) {
    const final = base.price_after_10d ?? window[window.length - 1].close;
    const ret = sig.signal_type === 'BUY' ? (final - entry) / entry : (entry - final) / entry;
    base.outcome = ret > FLAT_BAND ? 'WIN' : ret < -FLAT_BAND ? 'LOSS' : 'BREAKEVEN';
  }
  return base;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Scan all OPEN outcomes, fetch the price action after each signal, and update
 * the outcome rows. last_checked_at is bumped on every scan (so genuinely
 * abandoned rows can be told apart from intentionally-open ones); evaluated_at
 * is set only when a row reaches a terminal state.
 */
export async function evaluateOpenOutcomes(): Promise<EvaluationSummary> {
  const broker = getBroker();
  const { rows } = await pool.query<OpenSignalRow>(
    `SELECT so.signal_id, sig.signal_type, sig.entry_price,
            sig.suggested_stop_loss, sig.suggested_target, sig.generated_at,
            st.instrument_token
     FROM signal_outcomes so
     JOIN signals sig ON sig.id = so.signal_id
     JOIN stocks st ON st.id = sig.stock_id
     WHERE so.outcome = 'OPEN'`,
  );

  const summary: EvaluationSummary = { scanned: rows.length, terminal: 0, stillOpen: 0, noData: 0 };

  for (const sig of rows) {
    const signalDate = isoDate(sig.generated_at);
    let future: Candle[] = [];
    if (sig.instrument_token !== null) {
      const to = new Date(sig.generated_at);
      to.setUTCDate(to.getUTCDate() + HOLDING_DAYS * 3); // calendar buffer for weekends
      const candles = await broker.getHistoricalData(
        Number(sig.instrument_token),
        signalDate,
        isoDate(to),
        'day',
      );
      future = candles.filter((c) => c.date > signalDate);
    }

    const evalResult = evaluate(sig, future);
    const isTerminal = evalResult.outcome !== 'OPEN';

    await pool.query(
      `UPDATE signal_outcomes
       SET price_after_1d = $2, price_after_3d = $3, price_after_5d = $4,
           price_after_10d = $5, max_profit_pct = $6, max_loss_pct = $7,
           outcome = $8, last_checked_at = NOW(),
           evaluated_at = CASE WHEN $9 THEN NOW() ELSE evaluated_at END
       WHERE signal_id = $1`,
      [
        sig.signal_id,
        evalResult.price_after_1d,
        evalResult.price_after_3d,
        evalResult.price_after_5d,
        evalResult.price_after_10d,
        evalResult.max_profit_pct,
        evalResult.max_loss_pct,
        evalResult.outcome,
        isTerminal,
      ],
    );

    if (isTerminal) summary.terminal += 1;
    else if (future.length === 0) summary.noData += 1;
    else summary.stillOpen += 1;
  }

  return summary;
}
