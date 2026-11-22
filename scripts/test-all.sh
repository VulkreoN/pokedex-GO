#!/usr/bin/env bash
# Full test battery. Touches nothing in your dev or production data:
#   1. static: typecheck, unit tests, production build of the web app
#   2. a throwaway API (port 3100) on a fresh database "mydex_test" in the dev Postgres container
#   3. API integration tests against it
#   4. browser end-to-end tests (Playwright) against the production build served on port 4173
#   5. read-only checks of the deployed stack, when DEPLOY_URL is set (e.g. DEPLOY_URL=http://192.168.1.29:8080)
# Everything it starts is stopped and the test database is dropped at the end, even on failure.
#
# Usage: scripts/test-all.sh [--no-e2e] [--keep]   (--keep leaves the test API, preview and database up for debugging)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
API_PORT=3100
WEB_PORT=4173
TEST_DB=mydex_test
DB_CONTAINER=mydexpogo-dev-db-1
export API_URL="http://localhost:$API_PORT"
E2E=1
KEEP=0
for a in "$@"; do
  case "$a" in
    --no-e2e) E2E=0 ;;
    --keep) KEEP=1 ;;
    *) echo "unknown option $a" >&2; exit 2 ;;
  esac
done

WORK="$(mktemp -d)"
API_PID=""
WEB_PID=""
cleanup() {
  local code=$?
  if [ "$KEEP" = 1 ]; then
    echo "kept: API $API_URL (pid $API_PID), preview http://localhost:$WEB_PORT (pid $WEB_PID), database $TEST_DB, logs in $WORK"
    exit $code
  fi
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  docker exec "$DB_CONTAINER" psql -q -U mydex -d mydex -c "DROP DATABASE IF EXISTS $TEST_DB WITH (FORCE)" >/dev/null 2>&1 || true
  if [ $code -ne 0 ]; then
    echo; echo "FAILED. Last API log lines:"; tail -n 30 "$WORK/api.log" 2>/dev/null || true
  fi
  rm -rf "$WORK"
  exit $code
}
trap cleanup EXIT INT TERM

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "1/5 Typecheck, unit tests, production build"
pnpm -r typecheck
pnpm -r test
pnpm --filter @mydexpogo/web build >/dev/null
echo "build ok"

step "2/5 Throwaway API on a fresh database"
docker compose -f docker-compose.dev.yml up -d db >/dev/null
for _ in $(seq 1 30); do docker exec "$DB_CONTAINER" pg_isready -q -U mydex && break; sleep 1; done
docker exec "$DB_CONTAINER" psql -q -U mydex -d mydex -c "DROP DATABASE IF EXISTS $TEST_DB WITH (FORCE)" -c "CREATE DATABASE $TEST_DB" >/dev/null
export DATABASE_URL="postgres://mydex:mydex@localhost:5432/$TEST_DB"
pnpm --filter @mydexpogo/api db:migrate >/dev/null
# Reuse the dev source cache so the dataset builds in seconds instead of downloading everything.
mkdir -p "$WORK/data"
[ -d apps/api/.data/cache ] && cp -R apps/api/.data/cache "$WORK/data/cache"
(cd apps/api && PORT=$API_PORT DATA_DIR="$WORK/data" NEWS_LOCALES= DATA_REFRESH_HOURS=1000 ADMIN_USERNAMES=e2eadmin PUSH_DRY_RUN=1 exec node --import tsx src/index.ts) >"$WORK/api.log" 2>&1 &
API_PID=$!
for _ in $(seq 1 60); do curl -sf "$API_URL/api/health" >/dev/null && break; sleep 1; done
curl -sf "$API_URL/api/health" >/dev/null || { echo "API did not start"; exit 1; }
for _ in $(seq 1 120); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/data/pokedex.json")" = 200 ] && break; sleep 2; done
echo "API up on $API_URL with dataset ready"

step "3/5 API integration tests"
pnpm --filter @mydexpogo/api test:int

if [ "$E2E" = 1 ]; then
  step "4/5 Browser end-to-end tests"
  (cd apps/web && exec node node_modules/vite/bin/vite.js preview --strictPort --port $WEB_PORT) >"$WORK/web.log" 2>&1 &
  WEB_PID=$!
  for _ in $(seq 1 30); do curl -sf "http://localhost:$WEB_PORT/" >/dev/null && break; sleep 1; done
  BASE_URL="http://localhost:$WEB_PORT" pnpm --filter @mydexpogo/e2e e2e
else
  step "4/5 Browser end-to-end tests: skipped (--no-e2e)"
fi

if [ -n "${DEPLOY_URL:-}" ]; then
  step "5/5 Deployed stack at $DEPLOY_URL (read-only)"
  DEPLOY_URL="$DEPLOY_URL" pnpm --filter @mydexpogo/e2e e2e:deploy
else
  step "5/5 Deployed stack: skipped (set DEPLOY_URL)"
fi

printf '\n\033[1;32mAll tests passed.\033[0m\n'
