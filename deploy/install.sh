#!/usr/bin/env sh
# Enostaven produkcijski zagon: ./deploy/install.sh http|https
set -e
cd "$(dirname "$0")/.."

MODE="${1:-}"
if [ "$MODE" != "http" ] && [ "$MODE" != "https" ]; then
  echo "Uporaba: ./deploy/install.sh http|https"
  echo ""
  echo "  http   — odpri APP_PORT (privzeto 5008), brez TLS"
  echo "  https  — Caddy + Let's Encrypt (potrebujeta APP_DOMAIN in TLS_EMAIL)"
  exit 1
fi

if [ ! -f .env ]; then
  if [ -f .env.prod.example ]; then
    cp .env.prod.example .env
    echo "Ustvarjena .env iz .env.prod.example — uredi gesla in APP_URL, nato znova zaženi."
    exit 1
  fi
  echo "Manjka .env — kopiraj .env.prod.example v .env."
  exit 1
fi

# Preberi .env (preprosto KEY=VALUE, brez export posebnosti).
set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ -z "${APP_URL:-}" ]; then
  echo "V .env nastavi APP_URL (npr. http://IP:5008 ali https://domena.si)."
  exit 1
fi
if [ -z "${POSTGRES_PASSWORD:-}" ] || [ -z "${DJANGO_SECRET_KEY:-}" ]; then
  echo "V .env nastavi POSTGRES_PASSWORD in DJANGO_SECRET_KEY."
  exit 1
fi

if [ "$MODE" = "https" ]; then
  case "$APP_URL" in
    https://*) ;;
    *)
      echo "Za https način mora APP_URL začeti z https://"
      exit 1
      ;;
  esac
  if [ -z "${APP_DOMAIN:-}" ]; then
    # Izpelji domeno iz APP_URL, če APP_DOMAIN ni nastavljen.
    APP_DOMAIN=$(printf '%s' "$APP_URL" | sed -E 's#https://([^/:]+).*#\1#')
    export APP_DOMAIN
    echo "APP_DOMAIN=$APP_DOMAIN (iz APP_URL)"
  fi
  if [ -z "${TLS_EMAIL:-}" ]; then
    echo "Za Let's Encrypt v .env nastavi TLS_EMAIL."
    exit 1
  fi
else
  case "$APP_URL" in
    http://*) ;;
    *)
      echo "Opozorilo: HTTP način, APP_URL pa ni http://… — preveri piškotke/CSRF."
      ;;
  esac
fi

export COMPOSE_PROFILES="$MODE"
echo "Zagon (profil=$MODE)…"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo ""
echo "Pripravljeno."
if [ "$MODE" = "http" ]; then
  echo "Odpri: ${APP_URL:-http://localhost:${APP_PORT:-5008}}"
else
  echo "Odpri: $APP_URL"
  echo "DNS A/AAAA za $APP_DOMAIN mora kazati na ta strežnik; porta 80 in 443 odprta."
fi
echo "Logi: docker compose -f docker-compose.prod.yml --env-file .env logs -f"
