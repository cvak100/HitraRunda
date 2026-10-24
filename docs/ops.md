# Ops (minimal)

## Verzija

Globalna verzija je v `VERSION` (in `backend/VERSION`): **`0.4.<število komitov>`**.

```bash
# po komitu na HEAD
./scripts/write-version.sh          # Linux/macOS
.\scripts\write-version.ps1         # Windows
```

Preveri v teku: `GET /api/health/` → `{ "ok": true, "version": "0.4.…" }`. V UI je badge v nogi (`v0.4.…`).

## Zagon (dev)

```bash
cp .env.example .env
docker compose up --build
```

Odpri http://localhost:5008 — `DJANGO_DEBUG=1`.

## Produkcija

```bash
cp .env.prod.example .env
# uredi APP_URL, POSTGRES_PASSWORD, DJANGO_SECRET_KEY
./deploy/install.sh http    # ali https
```

Produkcijski compose ima **`DJANGO_DEBUG=0`**. Healthcheck na backendu kliče `/api/health/`.

## Smoke po deployu

```bash
./deploy/smoke.sh http://localhost:5008
# ali
.\deploy\smoke.ps1 http://localhost:5008
```

Preveri: health + verzija + game-config + gost.

Django E2E smoke (lobby → finish → lestvica, vsi načini prek simulate):

```bash
docker compose exec backend python manage.py test game.tests_smoke -v1
```

Ali v adminu: **Nadzor → Testi → Smoke**.

## Logi / restart

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env restart backend
```

## Posodobitev

```bash
git pull
# po potrebi: ./scripts/write-version.sh  (če greš v nov release commit)
./deploy/install.sh http   # rebuild + up
./deploy/smoke.sh "$APP_URL"
```

## Backup Postgres

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).sql
```
