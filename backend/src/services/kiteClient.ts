import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  Broker,
  Candle,
  Holding,
  Interval,
  LTPQuote,
  OrderParams,
  OrderResponse,
} from './brokerTypes';

// ─── Paper data (loaded once, lazily) ─────────────────────────────────────────
interface PaperFile {
  generated_at: string;
  interval: string;
  symbols: Record<string, { instrument_token: number; candles: Candle[] }>;
}

let paperData: PaperFile | null = null;
let tokenToSymbol: Map<number, string> | null = null;

function loadPaperData(): PaperFile {
  if (paperData) return paperData;
  const file = join(__dirname, '..', 'data', 'nse_paper_data.json');
  paperData = JSON.parse(readFileSync(file, 'utf-8')) as PaperFile;
  tokenToSymbol = new Map(
    Object.entries(paperData.symbols).map(([sym, v]) => [v.instrument_token, sym]),
  );
  return paperData;
}

// ─── Paper broker ──────────────────────────────────────────────────────────────
export class PaperBroker implements Broker {
  readonly mode = 'paper' as const;

  async getHistoricalData(
    instrumentToken: number,
    from: string,
    to: string,
    interval: Interval,
  ): Promise<Candle[]> {
    if (interval !== 'day') {
      throw new Error(`Paper mode only supports daily data, got '${interval}'`);
    }
    const data = loadPaperData();
    const symbol = tokenToSymbol?.get(instrumentToken);
    if (!symbol) {
      throw new Error(`No paper data for instrument_token ${instrumentToken}`);
    }
    return data.symbols[symbol].candles.filter(
      (c) => c.date >= from && c.date <= to,
    );
  }

  async getLTP(symbols: string[]): Promise<LTPQuote> {
    const data = loadPaperData();
    const quote: LTPQuote = {};
    for (const sym of symbols) {
      const entry = data.symbols[sym];
      if (!entry) {
        throw new Error(`No paper data for symbol '${sym}'`);
      }
      quote[sym] = entry.candles[entry.candles.length - 1].close;
    }
    return quote;
  }

  async placeOrder(params: OrderParams): Promise<OrderResponse> {
    // Simulate immediate fill: MARKET at last close, LIMIT at the given price.
    let fillPrice = params.price ?? 0;
    if (params.order_type === 'MARKET') {
      const ltp = await this.getLTP([params.tradingsymbol]);
      fillPrice = ltp[params.tradingsymbol];
    }
    if (params.order_type === 'LIMIT' && params.price === undefined) {
      throw new Error('LIMIT order requires a price');
    }
    return {
      order_id: `PAPER-${randomUUID()}`,
      status: 'COMPLETE',
      filled_quantity: params.quantity,
      average_price: fillPrice,
    };
  }

  async getHoldings(): Promise<Holding[]> {
    // Paper holdings are derived from the paper_trades table (Section 8),
    // not from the broker. The broker itself holds no positions.
    return [];
  }
}

// ─── Live broker (Kite Connect) ───────────────────────────────────────────────
export interface KiteSession {
  accessToken: string;
  expiresAt: Date;
}

// Minimal shape of the parts of the KiteConnect SDK we use (no bundled types).
interface KiteSDK {
  setAccessToken(token: string): void;
  getHistoricalData(
    token: number,
    interval: string,
    from: string,
    to: string,
  ): Promise<Candle[]>;
  getLTP(instruments: string[]): Promise<Record<string, { last_price: number }>>;
  placeOrder(variety: string, params: Record<string, unknown>): Promise<{ order_id: string }>;
  getHoldings(): Promise<
    Array<{ tradingsymbol: string; exchange: string; quantity: number; average_price: number; last_price: number; pnl: number }>
  >;
}

export class LiveBroker implements Broker {
  readonly mode = 'live' as const;
  private kite: KiteSDK;
  private session: KiteSession | null = null;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('KITE_API_KEY is required for live mode');
    }
    // Lazy require — keep the SDK out of the paper-mode code path.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { KiteConnect } = require('kiteconnect') as {
      KiteConnect: new (opts: { api_key: string }) => KiteSDK;
    };
    this.kite = new KiteConnect({ api_key: apiKey });
  }

  setSession(session: KiteSession): void {
    this.session = session;
    this.kite.setAccessToken(session.accessToken);
  }

  private assertSession(): void {
    if (!this.session) {
      throw new Error('Kite session not set — authenticate first');
    }
    if (Date.now() >= this.session.expiresAt.getTime()) {
      throw new Error('Kite session expired — re-authenticate (tokens expire ~6 AM IST)');
    }
  }

  async getHistoricalData(
    instrumentToken: number,
    from: string,
    to: string,
    interval: Interval,
  ): Promise<Candle[]> {
    this.assertSession();
    return this.kite.getHistoricalData(instrumentToken, interval, from, to);
  }

  async getLTP(symbols: string[]): Promise<LTPQuote> {
    this.assertSession();
    const instruments = symbols.map((s) => `NSE:${s}`);
    const raw = await this.kite.getLTP(instruments);
    const quote: LTPQuote = {};
    for (const sym of symbols) {
      const entry = raw[`NSE:${sym}`];
      if (entry) quote[sym] = entry.last_price;
    }
    return quote;
  }

  async placeOrder(params: OrderParams): Promise<OrderResponse> {
    this.assertSession();
    const res = await this.kite.placeOrder('regular', {
      tradingsymbol: params.tradingsymbol,
      exchange: params.exchange,
      transaction_type: params.transaction_type,
      quantity: params.quantity,
      order_type: params.order_type,
      product: params.product,
      ...(params.price !== undefined ? { price: params.price } : {}),
    });
    return {
      order_id: res.order_id,
      status: 'OPEN', // live orders are async; poll order status for fills
      filled_quantity: 0,
      average_price: 0,
    };
  }

  async getHoldings(): Promise<Holding[]> {
    this.assertSession();
    return this.kite.getHoldings();
  }
}

// ─── Factory — one env variable selects the implementation ────────────────────
let broker: Broker | null = null;

export function getBroker(): Broker {
  if (broker) return broker;
  const mode = process.env.BROKER_MODE ?? 'paper';
  if (mode === 'live') {
    broker = new LiveBroker(process.env.KITE_API_KEY ?? '');
  } else {
    broker = new PaperBroker();
  }
  return broker;
}

// Test seam — reset the cached singleton.
export function _resetBroker(): void {
  broker = null;
}
