// Shared broker interface — paper and live modes implement the same contract,
// so switching is a single env variable (BROKER_MODE).

export type Interval = 'day' | '60minute' | '15minute' | '5minute';
export type TransactionType = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type Product = 'CNC' | 'MIS' | 'NRML';

export interface Candle {
  date: string; // ISO date (YYYY-MM-DD for daily)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderParams {
  tradingsymbol: string;
  exchange: string;
  transaction_type: TransactionType;
  quantity: number;
  order_type: OrderType;
  product: Product;
  price?: number; // required for LIMIT orders
}

export interface OrderResponse {
  order_id: string;
  status: 'COMPLETE' | 'OPEN' | 'REJECTED';
  filled_quantity: number;
  average_price: number;
}

export interface Holding {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
}

export type LTPQuote = Record<string, number>;

// Every broker implementation — paper or live — satisfies this interface.
export interface Broker {
  readonly mode: 'paper' | 'live';
  getHistoricalData(
    instrumentToken: number,
    from: string,
    to: string,
    interval: Interval,
  ): Promise<Candle[]>;
  getLTP(symbols: string[]): Promise<LTPQuote>;
  placeOrder(params: OrderParams): Promise<OrderResponse>;
  getHoldings(): Promise<Holding[]>;
}
