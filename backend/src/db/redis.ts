import Redis from 'ioredis';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is not set');
}

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

redis.on('ready', () => {
  console.log('[redis] connected');
});

const HEALTH_TIMEOUT_MS = 2_000; // shorter than Docker's 5s health-check timeout

export async function checkRedis(): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), HEALTH_TIMEOUT_MS),
  );
  const ping = redis
    .ping()
    .then((r) => r === 'PONG')
    .catch(() => false);
  return Promise.race([ping, timeout]);
}

// Connect with exponential backoff so a slow Redis startup doesn't kill the
// backend on first boot. 3 attempts at 1s / 2s / 4s.
export async function connectRedisWithRetry(attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await redis.connect();
      return;
    } catch (err) {
      const delay = 1000 * 2 ** i;
      const msg = err instanceof Error ? err.message : String(err);
      if (i === attempts - 1) {
        throw new Error(`Redis connect failed after ${attempts} attempts: ${msg}`);
      }
      console.warn(`[redis] connect attempt ${i + 1} failed (${msg}); retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
