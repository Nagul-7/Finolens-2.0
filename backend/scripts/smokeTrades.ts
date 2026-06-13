/*
 * Integration smoke test for paper-trade evaluation (stop / target / timeout).
 * Inserts backdated signals + OPEN paper_trades using real paper closes, runs
 * the evaluator, and asserts each closes with the expected reason. Cleans up.
 *
 * Run with backend env (DATABASE_URL, BROKER_MODE=paper):
 *   ts-node --transpile-only scripts/smokeTrades.ts
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from '../src/db/pool';
import { evaluatePaperTrades } from '../src/services/tradeService';

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

async function seed(
  symbol: string,
  type: 'BUY' | 'SELL',
  fromEnd: number,
  stop: number,
  target: number,
): Promise<number> {
  const sym = paper.symbols[symbol];
  const candle = sym.candles[sym.candles.length - fromEnd];
  const entry = candle.close;
  const stock = await pool.query<{ id: number }>('SELECT id FROM stocks WHERE symbol=$1', [symbol]);
  const stockId = stock.rows[0].id;
  const sig = await pool.query<{ id: number }>(
    `INSERT INTO signals (stock_id, signal_type, confidence, entry_price,
        suggested_stop_loss, suggested_target, reasoning, generated_at)
     VALUES ($1,$2,75,$3,$4,$5,'smoke-trade',$6::date) RETURNING id`,
    [stockId, type, entry, stop, target, candle.date],
  );
  const trade = await pool.query<{ id: number }>(
    `INSERT INTO paper_trades (signal_id, stock_id, trade_type, quantity, entry_price,
        entry_time, status)
     VALUES ($1,$2,$3,10,$4,$5::date,'OPEN') RETURNING id`,
    [sig.rows[0].id, stockId, type, entry, candle.date],
  );
  return trade.rows[0].id;
}

async function tradeRow(id: number) {
  const { rows } = await pool.query<{
    status: string;
    exit_reason: string | null;
    pnl: string | null;
    exit_price: string | null;
  }>('SELECT status, exit_reason, pnl, exit_price FROM paper_trades WHERE id=$1', [id]);
  return rows[0];
}

async function main(): Promise<void> {
  const r = paper.symbols.RELIANCE;
  const entry = r.candles[r.candles.length - 30].close;

  // BUY, target just above entry -> TARGET_HIT; stop far below
  const win = await seed('RELIANCE', 'BUY', 30, entry * 0.5, entry + 0.01);
  // BUY, stop just below entry -> STOP_LOSS; target far above
  const loss = await seed('RELIANCE', 'BUY', 30, entry - 0.01, entry * 2);
  // BUY, both far away -> TIMEOUT after 10 days
  const timeout = await seed('RELIANCE', 'BUY', 30, entry * 0.5, entry * 2);

  const summary = await evaluatePaperTrades();
  console.log('  summary:', JSON.stringify(summary));

  const w = await tradeRow(win);
  const l = await tradeRow(loss);
  const t = await tradeRow(timeout);

  check('target hit -> CLOSED TARGET_HIT', () => {
    assert.strictEqual(w.status, 'CLOSED');
    assert.strictEqual(w.exit_reason, 'TARGET_HIT');
    assert.ok(Number(w.pnl) > 0, `pnl ${w.pnl} should be > 0`);
  });
  check('stop hit -> CLOSED STOP_LOSS', () => {
    assert.strictEqual(l.status, 'CLOSED');
    assert.strictEqual(l.exit_reason, 'STOP_LOSS');
    assert.ok(Number(l.pnl) < 0, `pnl ${l.pnl} should be < 0`);
  });
  check('neither -> CLOSED TIMEOUT', () => {
    assert.strictEqual(t.status, 'CLOSED');
    assert.strictEqual(t.exit_reason, 'TIMEOUT');
    assert.ok(t.exit_price !== null);
  });
  check('summary closed >= 3', () => assert.ok(summary.closed >= 3));

  // paper_trades.signal_id is ON DELETE SET NULL, so remove trades first.
  await pool.query('DELETE FROM paper_trades WHERE id = ANY($1)', [[win, loss, timeout]]);
  await pool.query("DELETE FROM signals WHERE reasoning = 'smoke-trade'");
  console.log(`\n${passed} checks passed`);
  await pool.end();
}

main().catch((err: Error) => {
  console.error(err);
  process.exit(1);
});
