#!/usr/bin/env bash
#
# FinoLens — stop everything start.sh launched.
# Stops the app processes (by pidfile, with a port-based fallback) and the
# Docker infra containers. Data volumes are preserved (containers are stopped,
# not removed), so the next start.sh keeps your trades and signals.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"

PG_CONTAINER="finolens_v2_postgres"
REDIS_CONTAINER="finolens_v2_redis"
SIGNAL_PORT=8001
BACKEND_PORT=3001
FRONTEND_PORT=5173

if [ -t 1 ]; then G='\033[0;32m'; Y='\033[0;33m'; B='\033[1m'; N='\033[0m'; else G=''; Y=''; B=''; N=''; fi
ok()   { echo -e "  ${G}✓${N} $1"; }
info() { echo -e "  ${Y}…${N} $1"; }
hr()   { echo -e "${B}$1${N}"; }

hr "FinoLens — shutting down"

# ─── App processes ────────────────────────────────────────────────────────────
# Kill the pidfile process tree, then free the port (catches ts-node-dev respawn
# children that hold the listener under a different PID).
stop_proc() {
  local name="$1" port="$2" pidfile="$3"
  if [ -f "$pidfile" ]; then
    local pid; pid="$(cat "$pidfile" 2>/dev/null)"
    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      pkill -P "$pid" >/dev/null 2>&1 || true
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$pidfile"
  fi
  # Port fallback — whatever still holds the port.
  local held; held="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [ -n "$held" ]; then
    echo "$held" | xargs kill >/dev/null 2>&1 || true
  fi
  ok "$name stopped (:${port})"
}

hr "Services"
stop_proc "frontend"       "$FRONTEND_PORT" "$RUN_DIR/frontend.pid"
stop_proc "backend"        "$BACKEND_PORT"  "$RUN_DIR/backend.pid"
stop_proc "signal-service" "$SIGNAL_PORT"   "$RUN_DIR/signal.pid"

# ─── Docker infra ─────────────────────────────────────────────────────────────
hr "Infra (Docker)"
for c in "$PG_CONTAINER" "$REDIS_CONTAINER"; do
  if docker ps --format '{{.Names}}' | grep -qx "$c"; then
    docker stop "$c" >/dev/null && ok "$c stopped"
  else
    info "$c not running"
  fi
done

echo
ok "All FinoLens services stopped. Run ./start.sh to bring it back."
