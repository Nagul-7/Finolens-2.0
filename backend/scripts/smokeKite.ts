/*
 * Smoke test for the Kite client (paper mode + live token-expiry guard).
 * Paper mode now reads REAL NSE data via the Python data service, so this is an
 * integration test: the signal-service must be running and reachable at
 * SIGNAL_SERVICE_URL (default http://localhost:8000).
 *
 * Run: SIGNAL_SERVICE_URL=http://localhost:8001 \
 *      ts-node --transpile-only scripts/smokeKite.ts
 */
import assert from 'assert';
import { PaperBroker, LiveBroker, getBroker, _resetBroker } from '../src/services/kiteClient';

const RELIANCE_TOKEN = 738561;

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

  let all: Awaited<ReturnType<PaperBroker['getHistoricalData']>> = [];
  await check('getHistoricalData returns real daily candles for RELIANCE', async () => {
    all = await paper.getHistoricalData(RELIANCE_TOKEN, '2000-01-01', '2100-01-01', 'day');
    assert.ok(all.length > 100, `got ${all.length}`);
    const c = all[all.length - 1];
    assert.ok('open' in c && 'high' in c && 'low' in c && 'close' in c && c.close > 0);
  });

  await check('date filter narrows the range', async () => {
    const from = all[all.length - 20].date;
    const sub = await paper.getHistoricalData(RELIANCE_TOKEN, from, '2100-01-01', 'day');
    assert.ok(sub.length <= 20 && sub.length > 0, `got ${sub.length}`);
    assert.ok(sub.every((c) => c.date >= from));
  });

  await check('getHistoricalData rejects non-daily interval', async () => {
    await assert.rejects(() => paper.getHistoricalData(RELIANCE_TOKEN, '2025-01-01', '2026-12-31', '5minute'));
  });

  await check('getHistoricalData rejects unknown token', async () => {
    await assert.rejects(() => paper.getHistoricalData(999999, '2025-01-01', '2026-12-31', 'day'), /Unknown instrument_token/);
  });

  await check('getLTP returns positive prices for known symbols', async () => {
    const ltp = await paper.getLTP(['RELIANCE', 'TCS']);
    assert.ok(ltp.RELIANCE > 0 && ltp.TCS > 0);
  });

  await check('getLTP omits symbols with no data', async () => {
    const ltp = await paper.getLTP(['NOTASTOCKXYZ']);
    assert.strictEqual(ltp.NOTASTOCKXYZ, undefined);
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

  await check('factory returns PaperBroker when BROKER_MODE=paper', () => {
    _resetBroker();
    process.env.BROKER_MODE = 'paper';
    assert.strictEqual(getBroker().mode, 'paper');
  });

  await check('factory caches singleton', () => {
    _resetBroker();
    assert.strictEqual(getBroker(), getBroker());
  });

  console.log(`\n${passed} checks passed`);
}

main();
