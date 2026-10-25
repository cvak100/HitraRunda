# Ops (minimal)

## Verzija

Globalna verzija je v `VERSION` (in `backend/VERSION`): **`0.5.<število komitov>`**.

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
git fetch --tags
git checkout v0.X.Y   # ali main
./deploy/install.sh https   # ali http
./deploy/smoke.sh "$APP_URL"
```

## Jenkins (ročni deploy + rollback)

Na Fedori (isti host kot app). Backupi: `/opt/dockerapps/hitrarunda-backups/`.

### Predpogoji

- Jenkins user v skupini `docker` (`usermod -aG docker jenkins` + restart Jenkins).
- SSH do GitHuba dela za uporabnika, pod katerim teče agent (`ssh -T git@github.com`).
- Produkcija v `/opt/dockerapps/hitrarunda` z veljavnim `.env`.
- Če **httpd/nginx** že drži 80/443: `INSTALL_MODE=http`, `APP_URL=https://…` (TLS zunaj, app na `APP_PORT`).
  Apache mora na `APP_PORT` poslati odjemalčev IP in shemo, npr.:
  `RequestHeader set X-Forwarded-Proto "https"` + `ProxyAddHeaders On` (ali `X-Forwarded-For`).
  Frontend nginx z `real_ip` potem obnovi pravi IP za Django throttle.
- Če porta 80/443 prosta: `INSTALL_MODE=https` (Caddy v compose; API gre naravnost na backend).

### Job 1: HitraRunda-Deploy

1. **New Item** → ime `HitraRunda-Deploy` → **Pipeline**.
2. **Build Triggers**: nič (samo ročno).
3. **Pipeline** → *Pipeline script from SCM* → Git  
   - URL: `git@github.com:cvak100/HitraRunda.git`  
   - Branch: `*/main` (Jenkinsfile; ne spreminjaj ob feature deployih)  
   - Script Path: `Jenkinsfile.deploy`
4. Shrani. Zaženi **Build with Parameters**:
   - `DEPLOY_REF` = `main`, `feature/0.7`, ali tag (`v0.5.38`) — to je edino, kar menjaš
   - `INSTALL_MODE` = `http` (Apache na tem hostu) ali `https`
   - `APP_DIR` / `BACKUP_ROOT` pusti privzeto

Potek: pg_dump → git checkout v `APP_DIR` → `install.sh $INSTALL_MODE` → smoke → Django testi (`--exclude-tag=slow`).

### Job 2: HitraRunda-Rollback

1. Enako kot zgoraj, Script Path: `Jenkinsfile.rollback`.
2. Parameter `RESTORE_DB` = `true` (privzeto) obnovi tudi dump pred zadnjim deployem.

Prvi rollback deluje šele **po enem uspešnem Deploy** jobu (ustvari `previous-ref`).

### Ročno (brez Jenkins UI)

```bash
export APP_DIR=/opt/dockerapps/hitrarunda
export BACKUP_ROOT=/opt/dockerapps/hitrarunda-backups
export DEPLOY_REF=main
bash /opt/dockerapps/hitrarunda/deploy/jenkins/deploy.sh
# rollback:
export RESTORE_DB=true
bash /opt/dockerapps/hitrarunda/deploy/jenkins/rollback.sh
```

## Backup Postgres

Avtomatski dnevni dump (dev + prod compose, profil `backup`, ohrani 7 dni v volumenu `pgbackups`):

```bash
# produkcija
docker compose -f docker-compose.prod.yml --env-file .env --profile backup up -d db-backup
# lokalno
docker compose --profile backup up -d db-backup
```

Ročno:

```bash
docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).sql
```

Jenkins deploy shrani gzip dump v `/opt/dockerapps/hitrarunda-backups/<timestamp>/dump.sql.gz`.

Obnovitev iz Jenkins backupa:

```bash
gunzip -c /opt/dockerapps/hitrarunda-backups/YYYYMMDD-HHMMSS/dump.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
```
