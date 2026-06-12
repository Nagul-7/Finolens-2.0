/*
 * Generates deterministic synthetic daily OHLCV for paper-trading mode.
 * Geometric-Brownian-motion-ish walk per symbol, seeded so the output is
 * reproducible. Base prices are roughly realistic for each NSE stock.
 *
 * Usage: node scripts/generatePaperData.cjs
 * Writes: src/data/nse_paper_data.json
 */
const fs = require('fs');
const path = require('path');

const DAYS = 260; // ~1 trading year, enough for 200-candle signal requests
const END_DATE = new Date('2026-06-12');

// symbol -> [base price, annual drift, daily vol, synthetic instrument token]
const SYMBOLS = {
  RELIANCE:   [2900, 0.12, 0.014, 738561],
  TCS:        [3850, 0.08, 0.012, 2953217],
  HDFCBANK:   [1680, 0.10, 0.013, 341249],
  INFY:       [1550, 0.06, 0.015, 408065],
  ICICIBANK:  [1180, 0.14, 0.014, 1270529],
  HINDUNILVR: [2350, 0.03, 0.011, 356865],
  ITC:        [430,  0.05, 0.012, 424961],
  SBIN:       [820,  0.16, 0.017, 779521],
  BAJFINANCE: [7100, 0.11, 0.019, 81153],
  BHARTIARTL: [1480, 0.18, 0.015, 2714625],
  KOTAKBANK:  [1760, 0.04, 0.013, 492033],
  LT:         [3600, 0.13, 0.014, 2939649],
  HCLTECH:    [1620, 0.09, 0.015, 1850625],
  ASIANPAINT: [2280, -0.05, 0.013, 60417],
  AXISBANK:   [1120, 0.10, 0.016, 1510401],
  MARUTI:     [12800, 0.07, 0.015, 2815745],
  SUNPHARMA:  [1780, 0.15, 0.014, 857857],
  TITAN:      [3250, 0.06, 0.016, 897537],
  WIPRO:      [540,  0.04, 0.015, 969473],
  ULTRACEMCO: [11500, 0.09, 0.014, 2952193],
};

// Mulberry32 — small deterministic PRNG so output is identical run-to-run.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform — standard normal from two uniforms.
function gauss(rand) {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function tradingDates(days, end) {
  const dates = [];
  const d = new Date(end);
  while (dates.length < days) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(d.toISOString().slice(0, 10));
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return dates.reverse();
}

function generateSymbol(base, drift, vol, seed) {
  const rand = mulberry32(seed);
  const dailyDrift = drift / 252;
  const dates = tradingDates(DAYS, END_DATE);
  const candles = [];
  let price = base;

  for (const date of dates) {
    const ret = dailyDrift + vol * gauss(rand);
    const open = price;
    const close = Math.max(open * (1 + ret), 1);
    const intraday = vol * 0.6;
    const high = Math.max(open, close) * (1 + Math.abs(gauss(rand)) * intraday);
    const low = Math.min(open, close) * (1 - Math.abs(gauss(rand)) * intraday);
    const volume = Math.round(500_000 + Math.abs(gauss(rand)) * 1_500_000);

    candles.push({
      date,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
    });
    price = close;
  }
  return candles;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function main() {
  const symbols = {};
  let seed = 1000;
  for (const [sym, [base, drift, vol, token]] of Object.entries(SYMBOLS)) {
    symbols[sym] = {
      instrument_token: token,
      candles: generateSymbol(base, drift, vol, seed++),
    };
  }

  const out = {
    generated_at: END_DATE.toISOString().slice(0, 10),
    interval: 'day',
    note: 'Synthetic data for paper mode. Instrument tokens are placeholders.',
    symbols,
  };

  const dir = path.join(__dirname, '..', 'src', 'data');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'nse_paper_data.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 0));
  const count = Object.keys(symbols).length;
  console.log(`Wrote ${count} symbols x ${DAYS} candles -> ${file}`);
}

main();
