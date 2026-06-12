# FinoLens v2 — Deferred Fix Tracker

## Hard Rules (never break these)

- ~~Add ESLint rule to enforce no `.js` extensions on local imports~~ ✅ done
- **No `.js` extensions on local TypeScript imports in `backend/`.** The backend
  uses `"module": "CommonJS"` and ts-node-dev (CJS mode) does not remap `.js`
  to `.ts` source files — it causes `Cannot find module` at startup.
  Use bare relative paths: `from './db/pool'` not `from './db/pool.js'`.
  `no-restricted-imports` ESLint rule enforces this — `npm run lint` will catch it.
  If a code generator or template adds `.js` extensions, strip them before committing.

## Fix Before Section 7 (Routes)

- [ ] Add 2-second timeout to `checkPostgres()` and `checkRedis()` — shorter than
      Docker's 5s health check default to avoid the race where both timeouts expire
      simultaneously (`backend/src/db/pool.ts`, `backend/src/db/redis.ts`)

- [ ] Add retry loop around `redis.connect()` with exponential backoff —
      3 attempts at 1s / 2s / 4s delays so a slow Redis startup doesn't fail
      the backend on first boot (`backend/src/server.ts` `start()`)

- [ ] Build instrument_token populator — call Kite `getInstruments()` once a day,
      update `stocks.instrument_token` so live mode can fetch historical data.
      Paper mode uses synthetic tokens in `nse_paper_data.json`; live needs the
      real ones (`backend/src/services/kiteClient.ts` LiveBroker, Section 7).

## Fix Before Going Live (Production)

- [ ] Auto-refresh Kite token at ~5:30 AM IST (before the ~6 AM expiry) so the
      app isn't dead each morning until a manual re-auth. LiveBroker already
      rejects expired sessions (`assertSession`); this is the refresh side.

- [ ] Add range guard to `AppError` constructor — reject `statusCode` outside
      400–599 to prevent malformed HTTP responses
      (`backend/src/middleware/errorHandler.ts`)

- [ ] Call `server.close()` before `redis.quit()` / `pool.end()` in `shutdown()`
      to drain in-flight HTTP requests before closing connections — critical when
      a rollout could interrupt active paper trades
      (`backend/src/server.ts` `shutdown()`)

- [ ] Distinguish `NotImplementedError` (return 501) from unhandled runtime errors
      (return 500 with masked message) in `global_exception_handler`
      (`signal-service/app/main.py`)

- [ ] Disable `/docs` in production — set `docs_url=None` when `ENV=production`
      to prevent API schema exposure (`signal-service/app/main.py`)

- [ ] Add request body size limit middleware — cap at 100KB to prevent oversized
      candle payloads; apply to all routes (`signal-service/app/main.py`)

- [ ] Replace `time.monotonic()` `START_TIME` with a value read from an env var
      set at container launch so uptime is consistent across uvicorn workers
      (`signal-service/app/main.py`)

- [ ] Change `backend/Dockerfile` to 2-stage build — Stage 1: `npm run build`
      (produces `dist/`); Stage 2: `node dist/server.js` with no ts-node-dev.
      Currently runs JIT transpilation in prod which is slow and memory-hungry.

- [ ] Apply same 2-stage pattern to `signal-service/Dockerfile` — Stage 1:
      install deps; Stage 2: `uvicorn app.main:app` without `--reload`.
      `--reload` watches the filesystem and recompiles on every change, unsafe in prod.

- [ ] Add `backend` and `signal-service` to `docker-compose.yml` with proper
      `depends_on` health checks so both services survive terminal close and reboot.
      Currently running as bare background processes (`&`) that die on shell exit.
