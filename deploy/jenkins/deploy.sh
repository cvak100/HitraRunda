#!/usr/bin/env bash
# Ročni produkcijski deploy (Jenkins): backup → git → install https → smoke → testi.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/dockerapps/hitrarunda}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/dockerapps/hitrarunda-backups}"
DEPLOY_REF="${DEPLOY_REF:-main}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
# http = APP_PORT (privzeto 5008) za zunanji reverse proxy; https = Caddy na 80/443.
INSTALL_MODE="${INSTALL_MODE:-http}"

# Jenkins Branch Specifier je "*/feature/0.5" — za git checkout rabimo brez */.
DEPLOY_REF="${DEPLOY_REF#\*/}"

cd "$APP_DIR"
if [[ ! -f .env ]]; then
  echo "Manjka $APP_DIR/.env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source ./.env
set +a

if [[ -z "${APP_URL:-}" ]]; then
  echo "V .env nastavi APP_URL"
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

mkdir -p "$BACKUP_ROOT"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
mkdir -p "$BACKUP_DIR"

OLD_REF=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "$OLD_REF" >"$BACKUP_DIR/REF"
echo "Backup → $BACKUP_DIR (ref=$OLD_REF)"

echo "Postgres dump…"
"${COMPOSE[@]}" exec -T db \
  pg_dump -U "${POSTGRES_USER:-hitrarunda}" "${POSTGRES_DB:-hitrarunda}" \
  | gzip >"$BACKUP_DIR/dump.sql.gz"

# Obdrži zadnjih N timestamp map.
mapfile -t OLD_BACKUPS < <(ls -1dt "$BACKUP_ROOT"/[0-9]* 2>/dev/null || true)
if ((${#OLD_BACKUPS[@]} > KEEP_BACKUPS)); then
  for old in "${OLD_BACKUPS[@]:KEEP_BACKUPS}"; do
    rm -rf "$old"
  done
fi

echo "Git fetch / checkout $DEPLOY_REF…"
git fetch --tags origin
if git show-ref --verify --quiet "refs/remotes/origin/$DEPLOY_REF"; then
  git checkout -B "$DEPLOY_REF" "origin/$DEPLOY_REF"
  git reset --hard "origin/$DEPLOY_REF"
elif git rev-parse --verify "refs/tags/$DEPLOY_REF" >/dev/null 2>&1; then
  git checkout --force "refs/tags/$DEPLOY_REF"
else
  # Tag morda pravkar prinesen
  git fetch origin "refs/tags/$DEPLOY_REF:refs/tags/$DEPLOY_REF" 2>/dev/null || true
  if git rev-parse --verify "refs/tags/$DEPLOY_REF" >/dev/null 2>&1; then
    git checkout --force "refs/tags/$DEPLOY_REF"
  else
    git checkout --force "$DEPLOY_REF"
  fi
fi
NEW_REF=$(git rev-parse HEAD)
echo "Deploying $NEW_REF ($(git describe --tags --always 2>/dev/null || true))"

chmod +x deploy/install.sh deploy/smoke.sh deploy/jenkins/*.sh 2>/dev/null || true
./deploy/install.sh "$INSTALL_MODE"

echo "Smoke…"
./deploy/smoke.sh "$APP_URL"

echo "Django testi (brez slow)…"
"${COMPOSE[@]}" exec -T backend python manage.py test --exclude-tag=slow -v1

# Uspeh: previous = stanje pred tem deployem; current = novo.
echo "$OLD_REF" >"$BACKUP_ROOT/previous-ref"
echo "$BACKUP_DIR" >"$BACKUP_ROOT/previous-backup"
echo "$NEW_REF" >"$BACKUP_ROOT/current-ref"
echo "$BACKUP_DIR" >"$BACKUP_ROOT/current-backup"

echo "OK — deploy $NEW_REF (previous=$OLD_REF, backup=$BACKUP_DIR)"
