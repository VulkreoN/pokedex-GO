#!/usr/bin/env bash
# Releases one version on the VPS, called by CI over SSH: ./deploy.sh <git sha>
# Backup, pull, restart, then wait until https://$DOMAIN/api/health reports that version.
# If it never does, the previous version is put back (the database backup taken before is kept).
set -euo pipefail
cd "$(dirname "$0")"
TAG="${1:?usage: deploy.sh <tag>}"
set -a; . ./.env; set +a
COMPOSE=(docker compose -f docker-compose.prod.yml)
PREV="$(cat .current-tag 2>/dev/null || true)"

echo "deploy: $PREV -> $TAG"
./backup.sh "pre-deploy-${TAG:0:7}"
export TAG
"${COMPOSE[@]}" pull api web
"${COMPOSE[@]}" up -d --remove-orphans

# DEPLOY_TRIES (x5 s, default 60) and DEPLOY_INSECURE_TLS=1 (local test with DOMAIN=localhost) are for testing.
TLS_OPTS=()
[ "${DEPLOY_INSECURE_TLS:-0}" = 1 ] && TLS_OPTS=(--insecure)
healthy() {
  # Ask the server itself for the domain, so a DNS change in progress does not matter.
  curl -fsS ${TLS_OPTS[@]+"${TLS_OPTS[@]}"} --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" 2>/dev/null | grep -q "\"version\":\"$1\""
}
for _ in $(seq 1 "${DEPLOY_TRIES:-60}"); do
  if healthy "$TAG"; then
    echo "$TAG" > .current-tag
    docker image prune -f >/dev/null
    echo "deploy: $TAG is live on https://$DOMAIN"
    exit 0
  fi
  sleep 5
done

echo "deploy: $TAG did not become healthy"
"${COMPOSE[@]}" logs --tail 80 api web || true
if [ -n "$PREV" ]; then
  echo "deploy: rolling back to $PREV"
  TAG="$PREV" "${COMPOSE[@]}" up -d --remove-orphans
fi
exit 1
