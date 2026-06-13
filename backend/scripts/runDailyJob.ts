/*
 * Manually run the daily post-close job (cache warm + both evaluators).
 * Useful for verification and ad-hoc runs outside the 16:00 IST schedule.
 *
 * Run with backend env (DATABASE_URL, BROKER_MODE=paper, SIGNAL_SERVICE_URL):
 *   ts-node --transpile-only scripts/runDailyJob.ts
 */
import { pool } from '../src/db/pool';
import { runDailyJob } from '../src/services/scheduler';

runDailyJob()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err: Error) => {
    console.error('daily job failed:', err.message);
    process.exit(1);
  });
