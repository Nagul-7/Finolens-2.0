# FinoLens v2 — Deferred Fix Tracker

## Fix Before Section 7 (Routes)

- [ ] Add 2-second timeout to `checkPostgres()` and `checkRedis()` — shorter than
      Docker's 5s health check default to avoid the race where both timeouts expire
      simultaneously (`backend/src/db/pool.ts`, `backend/src/db/redis.ts`)

- [ ] Add retry loop around `redis.connect()` with exponential backoff —
      3 attempts at 1s / 2s / 4s delays so a slow Redis startup doesn't fail
      the backend on first boot (`backend/src/server.ts` `start()`)

## Fix Before Going Live (Production)

- [ ] Add range guard to `AppError` constructor — reject `statusCode` outside
      400–599 to prevent malformed HTTP responses
      (`backend/src/middleware/errorHandler.ts`)

- [ ] Call `server.close()` before `redis.quit()` / `pool.end()` in `shutdown()`
      to drain in-flight HTTP requests before closing connections — critical when
      a rollout could interrupt active paper trades
      (`backend/src/server.ts` `shutdown()`)
