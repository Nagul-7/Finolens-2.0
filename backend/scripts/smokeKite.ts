/*
 * Smoke test for the Kite client (paper mode + live token-expiry guard).
 * Run: node_modules/.bin/ts-node --transpile-only scripts/smokeKite.ts
 */
import assert from 'assert';
import { PaperBroker, LiveBroker, getBroker, _resetBroker } from '../src/services/kiteClient';

let passed = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ok  ${name}`);
    })
    .catch((err: Error) => {
      console.error(`FAIL  ${name}: ${err.message}`);
      process.exitCode = 1;
    });
}

async function main(): Promise<void> {
  const paper = new PaperBroker();

  await check('mode is paper', () => {
    assert.strictEqual(paper.mode, 'paper');
  });

  await check('getHistoricalData returns 200+ daily candles for RELIANCE (token 738561)', async () => {
    const candles = await paper.getHistoricalData(738561, '2025-01-01', '2026-12-31', 'day');
    assert.ok(candles.length >= 200, `got ${candles.length}`);
    assert.ok('open' in candles[0] && 'close' in candles[0]);
  });

  await check('getHistoricalData date filter narrows the range', async () => {
    const all = await paper.getHistoricalData(738561, '2025-01-01', '2026-12-31', 'day');
    const sub = await paper.getHistoricalData(738561, '2026-01-01', '2026-03-31', 'day');
    assert.ok(sub.length < all.length && sub.length > 0);
    assert.ok(sub.every((c) => c.date >= '2026-01-01' && c.date <= '2026-03-31'));
  });

  await check('getHistoricalData rejects non-daily interval', async () => {
    await assert.rejects(() => paper.getHistoricalData(738561, '2025-01-01', '2026-12-31', '5minute'));
  });

  await check('getHistoricalData rejects unknown token', async () => {
    await assert.rejects(() => paper.getHistoricalData(999999, '2025-01-01', '2026-12-31', 'day'));
  });

  await check('getLTP returns last close for known symbols', async () => {
    const ltp = await paper.getLTP(['RELIANCE', 'TCS']);
    assert.ok(ltp.RELIANCE > 0 && ltp.TCS > 0);
  });

  await check('getLTP rejects unknown symbol', async () => {
    await assert.rejects(() => paper.getLTP(['NOTASTOCK']));
  });

  await check('placeOrder MARKET fills at LTP, returns COMPLETE', async () => {
    const res = await paper.placeOrder({
      tradingsymbol: 'RELIANCE',
      exchange: 'NSE',
      transaction_type: 'BUY',
      quantity: 10,
      order_type: 'MARKET',
      product: 'CNC',
    });
    assert.ok(res.order_id.startsWith('PAPER-'));
    assert.strictEqual(res.status, 'COMPLETE');
    assert.strictEqual(res.filled_quantity, 10);
    assert.ok(res.average_price > 0);
  });

  await check('placeOrder LIMIT without price rejects', async () => {
    await assert.rejects(() =>
      paper.placeOrder({
        tradingsymbol: 'RELIANCE',
        exchange: 'NSE',
        transaction_type: 'BUY',
        quantity: 10,
        order_type: 'LIMIT',
        product: 'CNC',
      }),
    );
  });

  await check('getHoldings returns empty array in paper mode', async () => {
    assert.deepStrictEqual(await paper.getHoldings(), []);
  });

  // ── Live broker token-expiry guard (no network — guard throws first) ────────
  await check('live broker without session rejects', async () => {
    const live = new LiveBroker('fake_key');
    await assert.rejects(() => live.getHoldings(), /session not set/);
  });

  await check('live broker with expired session rejects', async () => {
    const live = new LiveBroker('fake_key');
    live.setSession({ accessToken: 'tok', expiresAt: new Date(Date.now() - 1000) });
    await assert.rejects(() => live.getHoldings(), /expired/);
  });

  await check('live broker constructor rejects empty api key', () => {
    assert.throws(() => new LiveBroker(''), /KITE_API_KEY/);
  });

  // ── Factory ─────────────────────────────────────────────────────────────────
  await check('factory returns PaperBroker when BROKER_MODE=paper', () => {
    _resetBroker();
    process.env.BROKER_MODE = 'paper';
    assert.strictEqual(getBroker().mode, 'paper');
  });

  await check('factory caches singleton', () => {
    _resetBroker();
    const a = getBroker();
    const b = getBroker();
    assert.strictEqual(a, b);
  });

  console.log(`\n${passed} checks passed`);
}

main();
