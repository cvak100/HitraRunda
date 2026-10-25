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

# Verzija iz VERSION (če APP_VERSION ni v .env).
if [ -z "${APP_VERSION:-}" ] && [ -f VERSION ]; then
  APP_VERSION=$(head -n1 VERSION | tr -d '\r')
  export APP_VERSION
fi

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"

# Ob menjavi profila ustavi nasprotni frontend, da ne ostane orphan.
if [ "$MODE" = "https" ]; then
  COMPOSE_PROFILES=http $COMPOSE stop frontend 2>/dev/null || true
  COMPOSE_PROFILES=http $COMPOSE rm -f frontend 2>/dev/null || true
else
  COMPOSE_PROFILES=https $COMPOSE stop caddy frontend_tls 2>/dev/null || true
  COMPOSE_PROFILES=https $COMPOSE rm -f caddy frontend_tls 2>/dev/null || true
fi

export COMPOSE_PROFILES="$MODE"
echo "Zagon (profil=$MODE${APP_VERSION:+, verzija=$APP_VERSION})…"
if ! $COMPOSE up -d --build; then
  echo ""
  echo "Zagon spodletel. Če je 'address already in use' na 80/443:"
  echo "  ss -tlnp | grep -E ':80|:443' || true"
  echo "  docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep -E '80|443' || true"
  echo "Ustavi tuj reverse proxy / star Caddy, ali uporabi ./deploy/install.sh http za APP_PORT za obstoječi TLS proxy."
  exit 1
fi

echo ""
echo "Pripravljeno."
if [ "$MODE" = "http" ]; then
  echo "Odpri: ${APP_URL:-http://localhost:${APP_PORT:-5008}}"
else
  echo "Odpri: $APP_URL"
  echo "DNS A/AAAA za $APP_DOMAIN mora kazati na ta strežnik; porta 80 in 443 odprta."
fi
echo "Logi: docker compose -f docker-compose.prod.yml --env-file .env logs -f"
echo "Smoke: ./deploy/smoke.sh \"$APP_URL\""
