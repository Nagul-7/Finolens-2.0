# FinoLens v2

Personal stock-market intelligence and paper-trading platform for NSE India
swing trading. Clean rebuild: corrected signal engine (ADX, no VWAP), outcome
tracking baked in from day one, and a minimal Kite-inspired dark UI.

## Stack

| Service | Tech | Port |
|---|---|---|
| frontend | React 18 + Vite + Tailwind | 5173 |
| backend | Node + Express + TypeScript (CommonJS) | 3001 |
| signal-service | Python + FastAPI + pandas/numpy | 8000 |
| db | PostgreSQL 16 | 5432 |
| cache | Redis 7 | 6379 |

## Quick start (Docker)

```bash
docker compose up -d            # postgres, redis, backend, signal-service, frontend
```

## Quick start (local dev)

```bash
# 1. Infra
docker run -d --name fl_pg -e POSTGRES_DB=finolens_db -e POSTGRES_USER=finolens \
  -e POSTGRES_PASSWORD=finolens_dev -p 5432:5432 \
  -v $PWD/db/schema.sql:/docker-entrypoint-initdb.d/01_schema.sql postgres:16-alpine
docker run -d --name fl_redis -p 6379:6379 redis:7-alpine redis-server --requirepass redis_dev

# 2. Signal service
cd signal-service && pip install -r requirements.txt && uvicorn app.main:app --port 8000

# 3. Backend
cd backend && npm install
cp .env.example .env            # adjust DATABASE_URL / REDIS_URL if needed
npm run gen:paper               # generate synthetic paper data
DATABASE_URL=... node scripts/populateInstrumentTokens.cjs
npm run dev

# 4. Frontend
cd frontend && npm install && npm run dev
```

Open http://localhost:5173.

## Modes

`BROKER_MODE=paper` (default) serves **real NSE daily data** via yfinance: the
Python signal-service fetches and caches it (`/data/candles`, `/data/ltp`, daily
disk cache under `signal-service/.cache/`), and the Node `PaperBroker` consumes
it over HTTP. Symbols map to `.NS` tickers via `backend/src/data/nse_instruments.json`.
Still paper trading — real prices, no real orders, no money. `BROKER_MODE=live`
uses Kite Connect (requires `KITE_API_KEY` + auth flow).

The old synthetic generator (`scripts/generatePaperData.cjs`,
`nse_paper_data.json`) is legacy and no longer wired in.

## Tests

```bash
cd signal-service && pytest           # 57 tests (indicators + engine)
cd backend && npm run smoke:kite      # Kite client (paper + live guard)
cd backend && npm run smoke:outcomes  # outcome tracker (needs DB)
```

## Key design notes

- **No VWAP.** ADX gates signals — choppy markets (ADX < 20) return NEUTRAL.
- **Outcome tracking from day one.** Every signal auto-creates an OPEN outcome
  row in the same transaction; the tracker evaluates it against later prices.
- **Trend-aware scoring.** In a confirmed trend, the mean-reverting RSI and
  Bollinger scores are clamped so they don't fade the trend.
- **CommonJS backend.** No `.js` extensions on local TS imports (enforced by
  ESLint). See `NOTES.md` for the full rule and deferred-fix tracker.
