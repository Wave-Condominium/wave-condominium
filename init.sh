#!/bin/bash
# Session bootstrap — run at the start of every working session, BEFORE any new
# work. The goal: dependencies installed, Prisma client generated, tests green,
# app responding. A failure here means the previous session left the project
# broken; fix that first (see the session protocol in AGENTS.md).
#
# Usage:
#   ./init.sh                      full bring-up + health check
#   SKIP_HEALTHCHECK=1 ./init.sh   skip starting the dev server
#   HEALTH_PORT=3200 ./init.sh     use another port for the health check
set -euo pipefail
cd "$(dirname "$0")"

echo "== GAIDE init: bring-up + health check =="

# 1. Dependencies (postinstall already runs `prisma generate`)
echo "-- deps: npm install"
npm install --no-audit --no-fund --silent

# 2. Prisma client — explicit, so a schema change since the last install is picked up
echo "-- prisma generate"
npx prisma generate >/dev/null

# 3. Test suite — red at session start means broken inherited state
echo "-- tests: npm test"
npm test --silent

# 4. Types — the same check CI enforces, cheap enough to run at bring-up
echo "-- typecheck: tsc --noEmit"
npx tsc --noEmit

# 5. Health check — start the app and hit it as a user would.
# Needs a local environment (DATABASE_URL, WAVE_SESSION_SECRET): see .env.example.
if [ "${SKIP_HEALTHCHECK:-0}" = "1" ]; then
  echo "-- health check skipped (SKIP_HEALTHCHECK=1)"
elif [ ! -f .env ] && [ ! -f .env.local ]; then
  echo "-- health check skipped: no .env / .env.local (copy .env.example and fill it in)" >&2
else
  PORT="${HEALTH_PORT:-3100}"
  echo "-- health check: next dev on port $PORT"
  npx next dev --port "$PORT" >/tmp/wave-init-dev.log 2>&1 &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

  STATUS=""
  for _ in $(seq 1 40); do
    STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/login" || true)"
    case "$STATUS" in 2??|3??) break ;; esac
    sleep 1
  done

  case "$STATUS" in
    2??|3??) echo "-- /login responded $STATUS" ;;
    *)
      echo "Health check failed: /login did not respond (last status: ${STATUS:-none}). Dev server log:" >&2
      tail -20 /tmp/wave-init-dev.log >&2
      exit 1
      ;;
  esac
fi

echo "== init OK =="
