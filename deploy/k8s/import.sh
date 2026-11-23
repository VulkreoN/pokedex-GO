#!/usr/bin/env bash
# Loads an export of a former instance (../export-compose-data.sh) into the running Kubernetes deployment:
# ./deploy/k8s/import.sh mydexpogo-export-<date>.tar.gz [namespace]
# Replaces the database contents and the history files, then restarts the API. Run it once, right after the first
# sync, before people start using the new address (anything created there in between is replaced).
set -euo pipefail
ARCHIVE="${1:?usage: import.sh <export.tar.gz> [namespace]}"
NS="${2:-mydexpogo}"
K=(kubectl -n "$NS")
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$ARCHIVE" -C "$TMP"
DIR="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
test -f "$DIR/db.sql.gz" || { echo "import: no db.sql.gz in $ARCHIVE"; exit 1; }

echo "import: waiting for the database and the API"
"${K[@]}" rollout status statefulset/db --timeout=300s
"${K[@]}" rollout status deploy/api --timeout=600s

echo "import: database"
gunzip -c "$DIR/db.sql.gz" | "${K[@]}" exec -i db-0 -- sh -c 'psql -v ON_ERROR_STOP=1 -q -U mydex -d mydex' >/dev/null

echo "import: history files"
POD="$("${K[@]}" get pod -l app=api -o jsonpath='{.items[0].metadata.name}')"
for f in "$DIR"/data/*.json; do
  [ -e "$f" ] || continue
  "${K[@]}" exec -i "$POD" -- sh -c "cat > /data/$(basename "$f")" < "$f"
  echo "  $(basename "$f")"
done

echo "import: restarting the API"
"${K[@]}" rollout restart deploy/api
"${K[@]}" rollout status deploy/api --timeout=600s
echo "import: done. Users: $("${K[@]}" exec db-0 -- psql -U mydex -d mydex -Atc 'select count(*) from users'), lists: $("${K[@]}" exec db-0 -- psql -U mydex -d mydex -Atc 'select count(*) from lists')"
