#!/usr/bin/env bash
# Ročni rollback na prejšnji uspešni deploy (git + opcijsko DB).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/dockerapps/hitrarunda}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/dockerapps/hitrarunda-backups}"
RESTORE_DB="${RESTORE_DB:-true}"

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

if [[ ! -f "$BACKUP_ROOT/previous-ref" ]]; then
  echo "Ni previous-ref — še ni bilo uspešnega deploya prek Jenkins skripte."
  exit 1
fi

TARGET_REF=$(tr -d '[:space:]' <"$BACKUP_ROOT/previous-ref")
BACKUP_DIR=""
if [[ -f "$BACKUP_ROOT/previous-backup" ]]; then
  BACKUP_DIR=$(tr -d '[:space:]' <"$BACKUP_ROOT/previous-backup")
fi

BEFORE_REF=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "Rollback $BEFORE_REF → $TARGET_REF (RESTORE_DB=$RESTORE_DB)"

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

git fetch --tags origin
git checkout --force "$TARGET_REF"
git reset --hard "$TARGET_REF"

if [[ "$RESTORE_DB" == "true" || "$RESTORE_DB" == "1" || "$RESTORE_DB" == "yes" ]]; then
  if [[ -z "$BACKUP_DIR" || ! -f "$BACKUP_DIR/dump.sql.gz" ]]; then
    echo "Manjka dump za previous-backup ($BACKUP_DIR)"
    exit 1
  fi
  echo "Obnavljam DB iz $BACKUP_DIR/dump.sql.gz …"
  gunzip -c "$BACKUP_DIR/dump.sql.gz" \
    | "${COMPOSE[@]}" exec -T db \
      psql -U "${POSTGRES_USER:-hitrarunda}" -d "${POSTGRES_DB:-hitrarunda}" -v ON_ERROR_STOP=1
fi

chmod +x deploy/install.sh deploy/smoke.sh 2>/dev/null || true
./deploy/install.sh https

echo "Smoke…"
./deploy/smoke.sh "$APP_URL"

# Po rollbacku: current = target; previous = kar smo zapustili (za ponovni "undo").
echo "$BEFORE_REF" >"$BACKUP_ROOT/previous-ref"
echo "$TARGET_REF" >"$BACKUP_ROOT/current-ref"
# previous-backup pusti kot je (dump, ki smo ga ravnokar morebiti obnovili)

echo "OK — rollback na $TARGET_REF"
