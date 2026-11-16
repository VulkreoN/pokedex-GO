#!/usr/bin/env bash
# End-to-end smoke test against a running API. Usage: API=http://localhost:3000 scripts/smoke.sh
set -euo pipefail
API=${API:-http://localhost:3000}
S=$(mktemp -d)
A="$S/a.jar"; B="$S/b.jar"
U="smoke$RANDOM"
j() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1"; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
expect() { local want=$1; shift; local got; got=$(status "$@"); [ "$got" = "$want" ] || { echo "expected $want got $got for $*"; exit 1; }; }

echo "# register two users"
curl -sf -c "$A" -H 'content-type: application/json' -d "{\"username\":\"${U}a\",\"password\":\"password123\"}" "$API/api/auth/register" > "$S/ra.json"
curl -sf -c "$B" -H 'content-type: application/json' -d "{\"username\":\"${U}b\",\"password\":\"password123\"}" "$API/api/auth/register" > "$S/rb.json"
CODE_B=$(j "['user']['friendCode']" < "$S/rb.json")
ID_B=$(j "['user']['id']" < "$S/rb.json")
echo "  b friend code $CODE_B"

echo "# duplicate username -> 409"
expect 409 -H 'content-type: application/json' -d "{\"username\":\"${U}A\",\"password\":\"password123\"}" "$API/api/auth/register"

echo "# a creates a list and adds entries"
LIST=$(curl -sf -b "$A" -H 'content-type: application/json' -d '{"name":"Shinies manquants","visibility":"friends"}' "$API/api/lists" | j "['list']['id']")
curl -sf -b "$A" -X PUT -H 'content-type: application/json' -d '{"entries":[{"variantKey":"25","shiny":true},{"variantKey":"41.fHALLOWEEN_2026_01.g2","shiny":false},{"variantKey":"19.fALOLA","shiny":true,"done":true}]}' "$API/api/lists/$LIST/entries" > "$S/l.json"
test "$(j "['list']['entryCount']" < "$S/l.json")" = 3
test "$(j "['list']['doneCount']" < "$S/l.json")" = 1
echo "# invalid key -> 400"
expect 400 -b "$A" -X PUT -H 'content-type: application/json' -d '{"entries":[{"variantKey":"25;drop"}]}' "$API/api/lists/$LIST/entries"

echo "# b cannot see it before friendship"
expect 403 -b "$B" "$API/api/lists/$LIST"

echo "# a sends a friend request to b, b accepts"
curl -sf -b "$A" -H 'content-type: application/json' -d "{\"friendCode\":\"$CODE_B\"}" "$API/api/friends/requests" > /dev/null
REQ=$(curl -sf -b "$B" "$API/api/friends/requests" | j "['requests'][0]['id']")
curl -sf -b "$B" -X POST "$API/api/friends/requests/$REQ/accept" > /dev/null
test "$(curl -sf -b "$A" "$API/api/friends" | j "['friends'][0]['username']")" = "${U}b"

echo "# b sees a's lists and the list itself"
ID_A=$(j "['user']['id']" < "$S/ra.json")
test "$(curl -sf -b "$B" "$API/api/friends/$ID_A/lists" | j "['lists'][0]['name']")" = "Shinies manquants"
test "$(curl -sf -b "$B" "$API/api/lists/$LIST" | j "['access']")" = friend

echo "# b copies the list; entries reset to not done"
COPY=$(curl -sf -b "$B" -X POST "$API/api/lists/$LIST/copy" | j "['list']['doneCount']")
test "$COPY" = 0

echo "# share link works logged out"
TOKEN=$(curl -sf -b "$A" -X POST "$API/api/lists/$LIST/share" | j "['shareToken']")
test "$(curl -sf "$API/api/shared/$TOKEN" | j "['list']['entryCount']")" = 3
curl -sf -b "$A" -X DELETE "$API/api/lists/$LIST/share" > /dev/null
expect 404 "$API/api/shared/$TOKEN"

echo "# remove an entry, toggle done"
test "$(curl -sf -b "$A" -X DELETE -H 'content-type: application/json' -d '{"entries":[{"variantKey":"25","shiny":true}]}' "$API/api/lists/$LIST/entries" | j "['list']['entryCount']")" = 2
test "$(curl -sf -b "$A" -X PUT -H 'content-type: application/json' -d '{"entries":[{"variantKey":"41.fHALLOWEEN_2026_01.g2","shiny":false,"done":true}]}' "$API/api/lists/$LIST/entries" | j "['list']['doneCount']")" = 2

echo "# unfriend -> list hidden again"
curl -sf -b "$B" -X DELETE "$API/api/friends/$ID_A" > /dev/null
expect 403 -b "$B" "$API/api/lists/$LIST"

echo "# logout and account deletion"
curl -sf -b "$A" -c "$A" -X POST "$API/api/auth/logout" > /dev/null
test "$(curl -sf -b "$A" "$API/api/auth/me" | j "['user']")" = None
curl -sf -c "$B" -b "$B" -H 'content-type: application/json' -d "{\"username\":\"${U}b\",\"password\":\"password123\"}" "$API/api/auth/login" > /dev/null
curl -sf -b "$B" -X DELETE -H 'content-type: application/json' -d '{"password":"password123"}' "$API/api/auth/me" > /dev/null
curl -sf -c "$A" -b "$A" -H 'content-type: application/json' -d "{\"username\":\"${U}a\",\"password\":\"password123\"}" "$API/api/auth/login" > /dev/null
curl -sf -b "$A" -X DELETE -H 'content-type: application/json' -d '{"password":"password123"}' "$API/api/auth/me" > /dev/null
echo "all good (test accounts removed)"
