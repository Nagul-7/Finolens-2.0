import axios from 'axios';
import { pool } from '../db/pool';
import { getBroker } from './kiteClient';
import { AppError } from '../middleware/errorHandler';

const SIGNAL_SERVICE_URL = process.env.SIGNAL_SERVICE_URL ?? 'http://localhost:8000';
const LOOKBACK_DAYS = 400; // enough to cover the 260-candle paper window

interface StockRow {
  id: number;
  symbol: string;
  instrument_token: string | null; // pg returns BIGINT as a string
}

interface EngineIndicators {
  rsi: number | null;
  macd: number | null;
  ema_20: number | null;
  ema_50: number | null;
  adx: number | null;
  bb_position: 'UPPER' | 'MIDDLE' | 'LOWER' | null;
  supertrend: 'UP' | 'DOWN' | null;
}

interface EngineSignal {
  symbol: string;
  signal_type: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;
  entry_price: number;
  stop_loss: number | null;
  target: number | null;
  reasoning: string;
  indicators: EngineIndicators;
}

export interface StoredSignal extends EngineSignal {
  id: number;
  stock_id: number;
  generated_at: string;
  outcome_id: number;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function getStock(symbol: string): Promise<StockRow> {
  const { rows } = await pool.query<StockRow>(
    'SELECT id, symbol, instrument_token FROM stocks WHERE symbol = $1 AND is_active = true',
    [symbol],
  );
  if (rows.length === 0) {
    throw new AppError(404, `Unknown or inactive symbol: ${symbol}`);
  }
  return rows[0];
}

/**
 * Generate a signal for a symbol: fetch candles from the broker, run them
 * through the Python engine, and persist the signal together with its OPEN
 * outcome record in a single transaction (outcome tracking from day one).
 */
export async function generateSignalForSymbol(symbol: string): Promise<StoredSignal> {
  const stock = await getStock(symbol);
  if (stock.instrument_token === null) {
    throw new AppError(
      409,
      `No instrument_token for ${symbol} — run the instrument populator first`,
    );
  }

  const broker = getBroker();
  const candles = await broker.getHistoricalData(
    Number(stock.instrument_token),
    isoDaysAgo(LOOKBACK_DAYS),
    isoDaysAgo(0),
    'day',
  );
  if (candles.length < 60) {
    throw new AppError(
      422,
      `Only ${candles.length} candles available for ${symbol}; need at least 60`,
    );
  }

  // Call the Python signal engine.
  let engine: EngineSignal;
  try {
    const resp = await axios.post(
      `${SIGNAL_SERVICE_URL}/signal`,
      { symbol, candles },
      { timeout: 10_000 },
    );
    if (!resp.data?.success) {
      throw new AppError(502, `Signal service error: ${resp.data?.error ?? 'unknown'}`);
    }
    engine = resp.data.data as EngineSignal;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = axios.isAxiosError(err)
      ? err.code ?? err.message ?? 'no response'
      : String(err);
    throw new AppError(502, `Signal service unreachable: ${msg}`);
  }

  // Persist signal + OPEN outcome atomically.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ind = engine.indicators;
    const signalRes = await client.query<{ id: number; generated_at: string }>(
      `INSERT INTO signals
         (stock_id, signal_type, confidence, entry_price, suggested_stop_loss,
          suggested_target, rsi_value, macd_value, ema_20, ema_50, adx_value,
          bb_position, supertrend_signal, reasoning)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, generated_at`,
      [
        stock.id,
        engine.signal_type,
        engine.confidence,
        engine.entry_price,
        engine.stop_loss,
        engine.target,
        ind.rsi,
        ind.macd,
        ind.ema_20,
        ind.ema_50,
        ind.adx,
        ind.bb_position,
        ind.supertrend,
        engine.reasoning,
      ],
    );
    const signalId = signalRes.rows[0].id;

    const outcomeRes = await client.query<{ id: number }>(
      `INSERT INTO signal_outcomes (signal_id, outcome, last_checked_at)
       VALUES ($1, 'OPEN', NOW())
       RETURNING id`,
      [signalId],
    );

    await client.query('COMMIT');

    return {
      ...engine,
      id: signalId,
      stock_id: stock.id,
      generated_at: signalRes.rows[0].generated_at,
      outcome_id: outcomeRes.rows[0].id,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
