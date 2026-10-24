#!/usr/bin/env sh
# HTTP smoke po deployu: health, verzija, game-config, gost.
set -e
BASE="${1:-http://localhost:5008}"
BASE="${BASE%/}"

echo "Smoke → $BASE"

health=$(curl -fsS "$BASE/api/health/")
echo "health: $health"
echo "$health" | grep -q '"ok":\s*true\|"ok": true' || {
  echo "FAIL: health ni ok"
  exit 1
}
echo "$health" | grep -q '"version"' || {
  echo "FAIL: manjka version"
  exit 1
}

cfg=$(curl -fsS "$BASE/api/game-config/")
echo "$cfg" | grep -q '"enabled_modes"' || {
  echo "FAIL: game-config"
  exit 1
}
echo "$cfg" | grep -q '"version"' || {
  echo "FAIL: game-config brez version"
  exit 1
}

# Gost prek cookie jar (CSRF + session).
jar=$(mktemp)
trap 'rm -f "$jar"' EXIT
curl -fsS -c "$jar" -b "$jar" "$BASE/api/auth/csrf/" >/dev/null || true
# CSRF cookie ime je lahko csrftoken
token=$(grep -i csrftoken "$jar" 2>/dev/null | awk '{print $NF}' | tail -n1 || true)
guest=$(curl -fsS -c "$jar" -b "$jar" \
  -H "Content-Type: application/json" \
  ${token:+-H "X-CSRFToken: $token"} \
  ${token:+-H "Referer: $BASE/"} \
  -d '{"nickname":"Smoke bot"}' \
  "$BASE/api/auth/guest/")
echo "$guest" | grep -q '"user"' || {
  echo "FAIL: guest"
  echo "$guest"
  exit 1
}

echo "OK — smoke prešel ($BASE)."
