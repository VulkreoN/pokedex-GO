#!/usr/bin/env bash
# Packs a Docker Compose instance's data to move it elsewhere (e.g. to Kubernetes, see k8s/import.sh):
#   the database (accounts, lists, friends, manager edits; not the sessions: everyone logs in again on the new
#   address) and the history files kept next to the Pokédex data (events archive, "new" dates, species seen live,
#   push keys if any).
# Run from the folder with the compose file: ./deploy/export-compose-data.sh [compose file] -> mydexpogo-export-<date>.tar.gz
# The archive holds password hashes: hand it over privately, delete it once imported.
set -euo pipefail
FILE="${1:-docker-compose.yml}"
COMPOSE=(docker compose -f "$FILE")
OUT="mydexpogo-export-$(date +%Y%m%d-%H%M)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/$OUT/data"

# --clean --if-exists: the dump replaces whatever a fresh instance created on its first start.
"${COMPOSE[@]}" exec -T db pg_dump -U mydex -d mydex --clean --if-exists --no-owner --no-privileges \
  --exclude-table-data=sessions | gzip > "$TMP/$OUT/db.sql.gz"
for f in events-archive.json first-seen.json seen-species.json vapid.json; do
  "${COMPOSE[@]}" exec -T api sh -c "test -f /data/$f && cat /data/$f" > "$TMP/$OUT/data/$f" 2>/dev/null || rm -f "$TMP/$OUT/data/$f"
done
tar -czf "$OUT.tar.gz" -C "$TMP" "$OUT"
chmod 600 "$OUT.tar.gz"
echo "export: $OUT.tar.gz ($(du -h "$OUT.tar.gz" | cut -f1)): $(ls "$TMP/$OUT/data" | tr '\n' ' ')"
