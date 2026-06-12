import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[postgres] unexpected client error:', err.message);
});

const HEALTH_TIMEOUT_MS = 2_000; // shorter than Docker's 5s health-check timeout

async function probe(): Promise<boolean> {
  const client = await pool.connect().catch(() => null);
  if (!client) return false;
  try {
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    client.release(); // releases even if the outer timeout already resolved
  }
}

export async function checkPostgres(): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), HEALTH_TIMEOUT_MS),
  );
  return Promise.race([probe(), timeout]);
}
