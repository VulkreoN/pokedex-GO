#!/usr/bin/env bash
# Database dump + the API's own state (push keys, first-seen dates, event archive). Keeps the last 14 nightly and 10
# pre-deploy backups. Usage: ./backup.sh [label]   (cron runs it nightly, deploy.sh before each release)
set -euo pipefail
cd "$(dirname "$0")"
LABEL="${1:-nightly}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p backups
COMPOSE=(docker compose -f docker-compose.prod.yml)
if ! "${COMPOSE[@]}" ps --status running db | grep -q db; then
  echo "backup: database not running, nothing to save"
  exit 0
fi
"${COMPOSE[@]}" exec -T db pg_dump -U mydex -d mydex --no-owner | gzip > "backups/$STAMP-$LABEL.sql.gz"
"${COMPOSE[@]}" exec -T api sh -c 'cd /data && tar -cz $(ls vapid.json first-seen.json seen-species.json events-archive.json status.json 2>/dev/null)' \
  > "backups/$STAMP-$LABEL-appdata.tar.gz" || rm -f "backups/$STAMP-$LABEL-appdata.tar.gz"
# "|| true": no old backup yet is not an error.
prune() { { ls -1t backups/*-"$1".sql.gz 2>/dev/null || true; } | tail -n +"$(($2 + 1))" | while read -r f; do rm -f "$f" "${f%.sql.gz}-appdata.tar.gz"; done; }
prune nightly 14
{ ls -1t backups/*-pre-deploy-*.sql.gz 2>/dev/null || true; } | tail -n +11 | while read -r f; do rm -f "$f" "${f%.sql.gz}-appdata.tar.gz"; done
echo "backup: backups/$STAMP-$LABEL.sql.gz ($(du -h "backups/$STAMP-$LABEL.sql.gz" | cut -f1))"
