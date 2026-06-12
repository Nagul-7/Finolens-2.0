/*
 * Integration smoke test for the outcome tracker.
 * Inserts backdated signals (so the paper data has future candles), runs the
 * tracker, and asserts each reaches the expected terminal state. Cleans up after.
 *
 * Run with backend env (DATABASE_URL, BROKER_MODE=paper):
 *   ts-node --transpile-only scripts/smokeOutcomes.ts
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from '../src/db/pool';
import { evaluateOpenOutcomes } from '../src/services/outcomeTracker';

interface PaperFile {
  symbols: Record<string, { instrument_token: number; candles: { date: string; close: number }[] }>;
}

const paper = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'data', 'nse_paper_data.json'), 'utf-8'),
) as PaperFile;

let passed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

async function insertSignal(
  symbol: string,
  type: 'BUY' | 'SELL' | 'NEUTRAL',
  dateIndexFromEnd: number,
  stop: number | null,
  target: number | null,
): Promise<number> {
  const sym = paper.symbols[symbol];
  const candle = sym.candles[sym.candles.length - dateIndexFromEnd];
  const entry = candle.close;
  const stockRes = await pool.query<{ id: number }>('SELECT id FROM stocks WHERE symbol = $1', [symbol]);
  const stockId = stockRes.rows[0].id;
  const sigRes = await pool.query<{ id: number }>(
    `INSERT INTO signals (stock_id, signal_type, confidence, entry_price,
        suggested_stop_loss, suggested_target, reasoning, generated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'smoke-test',$7::date)
     RETURNING id`,
    [stockId, type, 75, entry, stop, target, candle.date],
  );
  const signalId = sigRes.rows[0].id;
  await pool.query(
    `INSERT INTO signal_outcomes (signal_id, outcome, last_checked_at) VALUES ($1,'OPEN',NOW())`,
    [signalId],
  );
  return signalId;
}

async function outcomeOf(signalId: number): Promise<{ outcome: string; p1: number | null; evaluated: boolean }> {
  const { rows } = await pool.query<{ outcome: string; price_after_1d: string | null; evaluated_at: Date | null }>(
    'SELECT outcome, price_after_1d, evaluated_at FROM signal_outcomes WHERE signal_id = $1',
    [signalId],
  );
  return {
    outcome: rows[0].outcome,
    p1: rows[0].price_after_1d === null ? null : Number(rows[0].price_after_1d),
    evaluated: rows[0].evaluated_at !== null,
  };
}

async function main(): Promise<void> {
  const reliance = paper.symbols.RELIANCE;
  const entryWin = reliance.candles[reliance.candles.length - 30].close;
  const entryLoss = reliance.candles[reliance.candles.length - 30].close;

  // BUY, target just above entry (first up-tick wins), stop far below
  const buyWin = await insertSignal('RELIANCE', 'BUY', 30, entryLoss * 0.5, entryWin + 0.01);
  // BUY, stop just below entry (first down-tick loses), target far above
  const buyLoss = await insertSignal('RELIANCE', 'BUY', 30, entryLoss - 0.01, entryWin * 2);
  // NEUTRAL, backdated 30 candles -> window elapsed -> BREAKEVEN
  const neutral = await insertSignal('RELIANCE', 'NEUTRAL', 30, null, null);
  // BUY dated at the very last candle -> no future candles -> stays OPEN
  const noData = await insertSignal('RELIANCE', 'BUY', 1, 1, 1_000_000);

  const summary = await evaluateOpenOutcomes();
  console.log('  summary:', JSON.stringify(summary));

  const win = await outcomeOf(buyWin);
  const loss = await outcomeOf(buyLoss);
  const neu = await outcomeOf(neutral);
  const nd = await outcomeOf(noData);

  check('BUY with reachable target -> WIN', () => assert.strictEqual(win.outcome, 'WIN'));
  check('WIN has price_after_1d populated', () => assert.ok(win.p1 !== null && win.p1 > 0));
  check('WIN has evaluated_at set', () => assert.ok(win.evaluated));
  check('BUY with tight stop -> LOSS', () => assert.strictEqual(loss.outcome, 'LOSS'));
  check('NEUTRAL elapsed -> BREAKEVEN', () => assert.strictEqual(neu.outcome, 'BREAKEVEN'));
  check('signal with no future candles stays OPEN', () => assert.strictEqual(nd.outcome, 'OPEN'));
  check('OPEN row has no evaluated_at', () => assert.ok(!nd.evaluated));
  check('summary scanned >= 4', () => assert.ok(summary.scanned >= 4));

  // Cleanup — remove only the smoke-test signals (cascade deletes outcomes).
  await pool.query("DELETE FROM signals WHERE reasoning = 'smoke-test'");
  console.log(`\n${passed} checks passed`);
  await pool.end();
}

main().catch((err: Error) => {
  console.error(err);
  process.exit(1);
});
