#!/usr/bin/env sh
# Zapiše VERSION = 0.3.<git rev-list --count HEAD>
# Zaženi PO komitu, ali z NEXT=1 pred komitom (count+1).
set -e
cd "$(dirname "$0")/.."
COUNT=$(git rev-list --count HEAD)
if [ "${NEXT:-0}" = "1" ]; then
  COUNT=$((COUNT + 1))
fi
VER="0.3.$COUNT"
printf '%s\n' "$VER" > VERSION
printf '%s\n' "$VER" > backend/VERSION
echo "VERSION=$VER"
