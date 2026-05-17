import { Router, Request, Response } from 'express';
import { checkPostgres } from '../db/pool';
import { checkRedis } from '../db/redis';
import { ApiResponse, HealthStatus } from '../types/index';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const [pgOk, redisOk] = await Promise.all([checkPostgres(), checkRedis()]);

  const health: HealthStatus = {
    status: pgOk && redisOk ? 'ok' : pgOk || redisOk ? 'degraded' : 'down',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      postgres: pgOk ? 'ok' : 'down',
      redis: redisOk ? 'ok' : 'down',
    },
  };

  const statusCode = health.status === 'down' ? 503 : 200;
  const body: ApiResponse<HealthStatus> = { success: health.status !== 'down', data: health };
  res.status(statusCode).json(body);
});

export default router;
