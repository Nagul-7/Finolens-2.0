import { pool } from '../db/pool';
import { getBroker } from './kiteClient';

export interface Quote {
  symbol: string;
  ltp: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  sparkline: number[]; // recent closes (oldest -> newest)
}

const SPARK_DAYS = 30;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build quotes (last price, day change, 30-point sparkline) for the given
 * symbols from the broker. Symbols without an instrument_token or candle data
 * come back with null fields rather than failing the whole batch.
 */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};
  const { rows } = await pool.query<{ symbol: string; instrument_token: string | null }>(
    'SELECT symbol, instrument_token FROM stocks WHERE symbol = ANY($1)',
    [symbols],
  );
  const tokenBySymbol = new Map(rows.map((r) => [r.symbol, r.instrument_token]));
  const broker = getBroker();
  const out: Record<string, Quote> = {};

  // Fetch enough calendar days to cover ~30 trading days plus weekends.
  const from = isoDaysAgo(SPARK_DAYS * 2 + 10);
  const to = isoDaysAgo(0);

  for (const symbol of symbols) {
    const token = tokenBySymbol.get(symbol);
    const empty: Quote = {
      symbol,
      ltp: null,
      prev_close: null,
      change: null,
      change_pct: null,
      sparkline: [],
    };
    if (!token) {
      out[symbol] = empty;
      continue;
    }
    try {
      const candles = await broker.getHistoricalData(Number(token), from, to, 'day');
      if (candles.length === 0) {
        out[symbol] = empty;
        continue;
      }
      const closes = candles.map((c) => c.close);
      const ltp = closes[closes.length - 1];
      const prev = closes.length > 1 ? closes[closes.length - 2] : null;
      const change = prev === null ? null : round2(ltp - prev);
      const changePct = prev === null ? null : round2(((ltp - prev) / prev) * 100);
      out[symbol] = {
        symbol,
        ltp: round2(ltp),
        prev_close: prev === null ? null : round2(prev),
        change,
        change_pct: changePct,
        sparkline: closes.slice(-SPARK_DAYS).map(round2),
      };
    } catch {
      out[symbol] = empty;
    }
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
