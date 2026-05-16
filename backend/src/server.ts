import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import { pool } from './db/pool.js';
import { redis } from './db/redis.js';
import healthRouter from './routes/health.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/health', healthRouter);

// Placeholder mount points — filled in Section 7
// app.use('/api/auth',      authRouter);
// app.use('/api/stocks',    stocksRouter);
// app.use('/api/watchlist', watchlistRouter);
// app.use('/api/signals',   signalsRouter);
// app.use('/api/outcomes',  outcomesRouter);

// ─── Catch-all ───────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Startup ─────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await redis.connect();

  const pgClient = await pool.connect();
  await pgClient.query('SELECT 1');
  pgClient.release();
  console.log('[postgres] connected');

  app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`);
  });
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.log(`[server] ${signal} received — shutting down`);
  await redis.quit();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start().catch((err: Error) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
