#!/usr/bin/env bash
#
# FinoLens — one-command startup.
# Brings up Docker infra (postgres, redis) + signal-service, backend, frontend,
# waits for health, then opens the browser. Safe to re-run (won't double-start).
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

# ─── Config ───────────────────────────────────────────────────────────────────
PG_CONTAINER="finolens_v2_postgres"
REDIS_CONTAINER="finolens_v2_redis"
PG_PORT=5434
REDIS_PORT=6381
SIGNAL_PORT=8001
BACKEND_PORT=3001
FRONTEND_PORT=5173
PG_PW="finolens_dev"
REDIS_PW="redis_dev"
DB_URL="postgres://finolens:${PG_PW}@localhost:${PG_PORT}/finolens_db"
REDIS_URL="redis://:${REDIS_PW}@localhost:${REDIS_PORT}"
SIGNAL_URL="http://localhost:${SIGNAL_PORT}"

# ─── Pretty output ────────────────────────────────────────────────────────────
if [ -t 1 ]; then G='\033[0;32m'; Y='\033[0;33m'; R='\033[0;31m'; B='\033[1m'; N='\033[0m'; else G=''; Y=''; R=''; B=''; N=''; fi
ok()   { echo -e "  ${G}✓${N} $1"; }
info() { echo -e "  ${Y}…${N} $1"; }
err()  { echo -e "  ${R}✗${N} $1"; }
hr()   { echo -e "${B}$1${N}"; }

http_ok() { curl -fs -o /dev/null --max-time 3 "$1"; }

# wait_for "name" "command that returns 0 when ready" timeout_seconds
wait_for() {
  local name="$1" probe="$2" timeout="${3:-60}" waited=0
  while ! eval "$probe" >/dev/null 2>&1; do
    if [ "$waited" -ge "$timeout" ]; then
      err "$name did not become healthy within ${timeout}s (see $RUN_DIR/*.log)"
      return 1
    fi
    info "waiting for $name... (${waited}s)"
    sleep 2; waited=$((waited + 2))
  done
  ok "$name is up"
}

# ─── Preconditions ────────────────────────────────────────────────────────────
hr "FinoLens — starting up"
if ! command -v docker >/dev/null 2>&1; then
  err "docker not found. Install Docker and retry."; exit 1
fi
if ! docker info >/dev/null 2>&1; then
  err "docker daemon not running. Start it (sudo systemctl start docker) and retry."; exit 1
fi

# ─── 1. Docker infra (postgres, redis) ────────────────────────────────────────
hr "Infra (Docker)"
ensure_container() {
  local name="$1"; shift
  if docker ps --format '{{.Names}}' | grep -qx "$name"; then
    ok "$name already running"
  elif docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    docker start "$name" >/dev/null && ok "$name started"
  else
    info "$name not found — creating"
    "$@" >/dev/null && ok "$name created"
  fi
}

ensure_container "$PG_CONTAINER" \
  docker run -d --name "$PG_CONTAINER" \
    -e POSTGRES_DB=finolens_db -e POSTGRES_USER=finolens -e POSTGRES_PASSWORD="$PG_PW" \
    -p "${PG_PORT}:5432" \
    -v "$ROOT/db/schema.sql:/docker-entrypoint-initdb.d/01_schema.sql:ro" \
    postgres:16-alpine

ensure_container "$REDIS_CONTAINER" \
  docker run -d --name "$REDIS_CONTAINER" \
    -p "${REDIS_PORT}:6379" \
    redis:7-alpine redis-server --requirepass "$REDIS_PW"

wait_for "postgres" "docker exec $PG_CONTAINER pg_isready -U finolens -d finolens_db | grep -q accepting" 40 || exit 1
wait_for "redis" "docker exec $REDIS_CONTAINER redis-cli --pass $REDIS_PW ping | grep -q PONG" 30 || exit 1

# Idempotent: ensure instrument tokens are populated (no-op if already set).
DATABASE_URL="$DB_URL" node "$ROOT/backend/scripts/populateInstrumentTokens.cjs" >/dev/null 2>&1 \
  && ok "instrument tokens populated" || info "instrument token populate skipped"

# ─── 2. Dependency guards (first run on a fresh clone) ─────────────────────────
hr "Dependencies"
if [ ! -d "$ROOT/backend/node_modules" ]; then
  info "installing backend deps (first run)"; (cd "$ROOT/backend" && npm install >/dev/null 2>&1) && ok "backend deps installed"
else ok "backend deps present"; fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  info "installing frontend deps (first run)"; (cd "$ROOT/frontend" && npm install >/dev/null 2>&1) && ok "frontend deps installed"
else ok "frontend deps present"; fi
if ! python3 -c "import yfinance, fastapi, uvicorn" >/dev/null 2>&1; then
  info "installing Python deps (first run)"
  pip install --break-system-packages -q -r "$ROOT/signal-service/requirements.txt" >/dev/null 2>&1 \
    && ok "Python deps installed" || err "Python dep install failed — check pip"
else ok "Python deps present"; fi

# ─── 3. App services ──────────────────────────────────────────────────────────
hr "Services"

# start_service name port pidfile logfile "command..."
start_service() {
  local name="$1" port="$2" pidfile="$3" logfile="$4"; shift 4
  if http_ok "http://localhost:${port}/health" || http_ok "http://localhost:${port}/"; then
    ok "$name already running (:${port})"
    return 0
  fi
  info "starting $name (:${port})"
  nohup "$@" >"$logfile" 2>&1 < /dev/null &
  echo $! > "$pidfile"
}

start_service "signal-service" "$SIGNAL_PORT" "$RUN_DIR/signal.pid" "$RUN_DIR/signal.log" \
  bash -c "cd '$ROOT/signal-service' && exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port $SIGNAL_PORT --log-level warning"

start_service "backend" "$BACKEND_PORT" "$RUN_DIR/backend.pid" "$RUN_DIR/backend.log" \
  env DATABASE_URL="$DB_URL" REDIS_URL="$REDIS_URL" PORT="$BACKEND_PORT" NODE_ENV=development \
      BROKER_MODE=paper SIGNAL_SERVICE_URL="$SIGNAL_URL" \
  bash -c "cd '$ROOT/backend' && exec ./node_modules/.bin/ts-node-dev --respawn --transpile-only src/server.ts"

start_service "frontend" "$FRONTEND_PORT" "$RUN_DIR/frontend.pid" "$RUN_DIR/frontend.log" \
  bash -c "cd '$ROOT/frontend' && exec npm run dev"

wait_for "signal-service" "http_ok http://localhost:${SIGNAL_PORT}/health" 60 || exit 1
wait_for "backend"        "http_ok http://localhost:${BACKEND_PORT}/health" 60 || exit 1
wait_for "frontend"       "http_ok http://localhost:${FRONTEND_PORT}/" 60 || exit 1

# ─── 4. Open browser ──────────────────────────────────────────────────────────
APP_URL="http://localhost:${FRONTEND_PORT}"
if command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
  xdg-open "$APP_URL" >/dev/null 2>&1 &
  ok "opened $APP_URL in browser"
else
  info "open $APP_URL in your browser"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo
hr "FinoLens is up"
echo "  App         $APP_URL"
echo "  Backend     http://localhost:${BACKEND_PORT}/health"
echo "  Signals     http://localhost:${SIGNAL_PORT}/health"
echo "  Postgres    localhost:${PG_PORT}   Redis  localhost:${REDIS_PORT}"
echo "  Logs        $RUN_DIR/*.log"
echo
echo "  Stop everything:  ./stop.sh"
echo
