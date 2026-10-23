# Hitra runda

Spletna kviz igra v slovenščini. Igraš solo ali z drugimi, izbiraš kategorije in se meriš na lestvici.

Začetek je možen kot gost z vzdevkom; z računom rezultati ostanejo na profilu in javni lestvici.

## Načini igre

| Način | Opis |
| --- | --- |
| **Hitra runda** | Kratke solo runde (5–15 vprašanj). Brez jokerjev — šteje hitrost. |
| **Ala milijonar** | 15 stopenj z jokerji (polovička, glas ljudstva, klic v sili), 90 s na vprašanje, težavnost 1→5. |
| **Hitra tekma** | Več igralcev v sobi. Ista vprašanja za vse, zmaga najhitrejši. |
| **Dirka** | Dirka do ciljnih točk. Bonusi, varna zona, AI boti. Naprej, ko vsi odgovorijo. |
| **60 sekund** | Solo način s skupnim časom. Pravilno +2 s, napačno −5 s, preskok −2 s. |

Vsak način ima svojo lestvico. V profilu vidiš najboljše rezultate, povprečja in uvrstitev na skupni lestvici.

## Tehnologije

- **Frontend:** React, TypeScript, Vite
- **Backend:** Django, Django Channels (WebSocket)
- **Podatki:** PostgreSQL, Redis
- **Zagon:** Docker Compose

## Hitri zagon

Potrebuješ Docker in Docker Compose.

```bash
cp .env.example .env   # po želji prilagodi
docker compose up --build
```

Aplikacija teče na [http://localhost:5008](http://localhost:5008) (ali `APP_PORT` iz `.env`).

Privzeti admin (samo za razvoj):

- e-pošta: `admin@hitrarunda.local`
- geslo: `admin12345`

## Produkcija (HTTP ali HTTPS)

Potrebuješ Docker. Nastaviš eno `.env` datoteko in zaženeš en ukaz.

```bash
cp .env.prod.example .env
# uredi: APP_URL, gesla, DJANGO_SECRET_KEY
chmod +x deploy/install.sh

# HTTP (npr. LAN / IP:port)
./deploy/install.sh http

# ali HTTPS (domena + Let's Encrypt)
# APP_URL=https://igra.primer.si
# APP_DOMAIN=igra.primer.si
# TLS_EMAIL=admin@primer.si
./deploy/install.sh https
```

Na Windowsu: `.\deploy\install.ps1 http` ali `.\deploy\install.ps1 https`.

| | HTTP | HTTPS |
| --- | --- | --- |
| `APP_URL` | `http://IP:5008` | `https://domena.si` |
| Port | `APP_PORT` (privzeto 5008) | 80 + 443 |
| TLS | ne | Caddy + Let's Encrypt |

`APP_URL` sam nastavi dovoljene hoste, CSRF in varne piškotke. Dodatni `DJANGO_*` overridei so opcijski.

## Struktura

```
backend/     Django API, igralni motorji, WebSocket
frontend/    React odjemalec
deploy/      Produkcijski install (HTTP/HTTPS)
questions.json   Vsebina vprašanj (uvoz prek admina)
```

## Admin

Staff uporabniki imajo nadzorno ploščo za vprašanja, kategorije, bonuse, bote, sobe, seje in uporabnike.

## Licenca

Zasebni projekt — glej lastnika repozitorija glede uporabe.
