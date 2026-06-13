import cron from 'node-cron';
import { pool } from '../db/pool';
import { getBroker } from './kiteClient';
import { evaluateOpenOutcomes } from './outcomeTracker';
import { evaluatePaperTrades } from './tradeService';

// ─── Config ───────────────────────────────────────────────────────────────────
// NSE closes 15:30 IST; run the post-close job at 16:00 IST on weekdays.
export const SCHEDULE_CRON = '0 16 * * 1-5';
export const SCHEDULE_TZ = 'Asia/Kolkata';

// NSE trading holidays (IST, YYYY-MM-DD). Update yearly. Weekends are already
// excluded by the cron day-of-week field (1-5).
export const NSE_HOLIDAYS = new Set<string>([
  '2026-01-26', // Republic Day
  '2026-03-04', // Holi
  '2026-03-21', // Eid-ul-Fitr
  '2026-04-01', // Annual bank closing
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-08-15', // Independence Day
  '2026-10-02', // Gandhi Jayanti
  '2026-11-09', // Diwali (approx)
  '2026-12-25', // Christmas
]);

function todayIST(): string {
  // en-CA gives YYYY-MM-DD; force the IST timezone.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isHolidayToday(): boolean {
  return NSE_HOLIDAYS.has(todayIST());
}

// ─── Cache warming ────────────────────────────────────────────────────────────
// Pull fresh candles for every active stock (covers watchlist + seed) so the
// first request after midnight is served from cache, not a live yfinance fetch.
async function warmCache(): Promise<{ warmed: number; failed: number }> {
  const { rows } = await pool.query<{ instrument_token: string }>(
    'SELECT instrument_token FROM stocks WHERE is_active = true AND instrument_token IS NOT NULL',
  );
  const broker = getBroker();
  let warmed = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await broker.getHistoricalData(Number(r.instrument_token), '2000-01-01', '2100-01-01', 'day');
      warmed += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[scheduler] cache warm failed for token ${r.instrument_token}: ${(err as Error).message}`);
    }
  }
  return { warmed, failed };
}

// ─── The daily job ────────────────────────────────────────────────────────────
export async function runDailyJob(): Promise<void> {
  if (isHolidayToday()) {
    console.log(`[scheduler] ${todayIST()} is an NSE holiday — skipping`);
    return;
  }
  console.log(`[scheduler] daily post-close job starting (${todayIST()} IST)`);
  const cache = await warmCache();
  const outcomes = await evaluateOpenOutcomes();
  const trades = await evaluatePaperTrades();
  console.log(
    `[scheduler] done — cache warmed ${cache.warmed} (failed ${cache.failed}); ` +
      `outcomes scanned ${outcomes.scanned}, terminal ${outcomes.terminal}; ` +
      `trades scanned ${trades.scanned}, closed ${trades.closed}`,
  );
}

// ─── Registration ─────────────────────────────────────────────────────────────
export function startScheduler(): void {
  if (!cron.validate(SCHEDULE_CRON)) {
    console.error(`[scheduler] invalid cron expression: ${SCHEDULE_CRON}`);
    return;
  }
  cron.schedule(
    SCHEDULE_CRON,
    () => {
      runDailyJob().catch((err: Error) => console.error('[scheduler] job failed:', err.message));
    },
    { timezone: SCHEDULE_TZ },
  );
  console.log(`[scheduler] registered "${SCHEDULE_CRON}" (${SCHEDULE_TZ})`);
}
