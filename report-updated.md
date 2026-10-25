# Hitra runda — stanje popravkov iz `report.md`

Datum preverjanja: 25. 10. 2026
Preverjena komita: `f6aa017` (seed/invite/proxy) in `82d1ec3` (Wave 2–3), primerjano s stanjem ob pisanju `report.md` (`f5fdbc5`).
Backend testi: **74/74 uspešnih** (`manage.py test --exclude-tag=slow`, v Dockerju). Regresij iz poglavja 1 testi ne ujamejo.

---

## 0. Drugo preverjanje (komit `0e56311`, 25. 10. 2026 dopoldne)

Backend testi: **77/77 uspešnih** (dodan `tests_snapshot_finished.py`).

| Opazka | Stanje | Kaj je narejeno / kaj manjka |
| --- | --- | --- |
| N1 Končana tekma kot lobby | Narejeno | `_lock(..., include_finished=True)` + consumer; glej tudi N5. |
| N2 HTTPS: skupen IP za throttle | Narejeno (Caddy) | Caddy `/api`/`ws`/`admin`/`static` → backend. HTTP+Apache: glej N6. |
| N3 Backup v produkciji | Narejeno | `db-backup` v prod compose (profil `backup`). |
| N4 CSP blokira Sentry | Narejeno | `connect-src` vključuje Sentry domene. |
| N5 Finish REST 400 | Narejeno | `RoomDetailView`: članom `finished` → 200; `closed`/nečlani → 400. Test `rooms.tests_room_detail`. |
| N6 Apache → http profil XFF | Narejeno | nginx `real_ip` + `$forwarded_proto` od zaupanega peerja; Apache mora poslati XFF/Proto (ops.md). |
| Boti izbirajo iz živih opcij | Ni (nizka prioriteta) | `_bot_answer_message` še vedno bere `question.options`. |
| Povratna informacija ob povabilu | Narejeno | Lobby: "Če igralec obstaja, je povabljen." (brez enumeracije). |
| Povabila se ne brišejo | Narejeno | Odstranitev ob join, start igre, close sobe. |

### N5 — Osvežitev zaključnega zaslona (REST) — **narejeno**

`RoomDetailView` za `finished` članu vrne `room_payload` (200); 400 samo za `closed` ali nečlane. Frontend veja `finished` se izvede; WS snapshot se ne prepiše z "Soba je zaprta".

### N6 — Apache pred `http` profilom — **narejeno**

nginx: `set_real_ip_from` (private) + `real_ip_header X-Forwarded-For`; `X-Forwarded-Proto` samo od zaupanega peerja. Zahteva: Apache pošlje XFF + `X-Forwarded-Proto https` (opisano v `docs/ops.md`).

### Manjše ob drugem preverjanju

- Caddy `/admin/`: dodani CSP, Permissions-Policy, XFO, nosniff, Referrer-Policy.
- HSTS: Caddy `Strict-Transport-Security` (HTTPS profil). Pri Apache TLS naj HSTS nastavi Apache.

---

## 1. Novi problemi, ki so jih uvedli popravki (prvo preverjanje)

### N1 — Končana tekma se ob ponovni povezavi prikaže kot lobby (regresija H4)

`_lock()` v `engine.py` po prehodu na več sej na sobo vrne **samo živo sejo** (`preparing`/`active`). Vse `snapshot_*` funkcije pa na `session is None` vrnejo lobby/waiting in do veje `if session.status == "finished"` nikoli ne pridejo.

Preverjeno na živi bazi (končane sobe):

| Način | Soba | `snapshot()` vrne | Pričakovano |
| --- | --- | --- | --- |
| Hitra tekma | 82UCNV | `lobby` | `game_finished` |
| Dirka | HV6P9Z | `lobby` | `game_finished` |
| Hitra runda | 4M5GJG | `waiting` | `game_finished` |
| 60 sekund | 4EUEB8 | `waiting` | `game_finished` |

Posledice (po kodi):
- Osvežitev zaključnega zaslona v Hitri tekmi/Dirki: `GameConsumer.connect` dobi `phase=lobby` → pokliče `_broadcast_lobby()` → ker je soba `finished`, se **vsem v sobi** pošlje "Soba je zaprta".
- Solo: po osvežitvi se pokaže lažno odštevanje 3-2-1, šele nato zaključni zaslon (prek `start_game`).
- Veje `finished` v `snapshot_multiplayer`, `snapshot_dirka`, `snapshot_sixty`, `next_multiplayer`, `next_dirka` so mrtva koda.

Popravek: v `snapshot_*` (in kjer je smiselno) ob `session is None` poiskati zadnjo sejo sobe (`order_by("-created_at").first()`), če je soba v statusu `finished`. Ali pa dodati `_lock(member_id, include_finished=True)`. Dodati test "snapshot po koncu igre" za vse načine.

### N2 — HTTPS profil: vsi uporabniki si delijo isto omejitev zahtev (regresija V1)

nginx zdaj nastavi `X-Forwarded-For $remote_addr`. V HTTPS profilu je pred nginx še Caddy, zato je `$remote_addr` vedno **IP Caddy containerja**. Glava, ki jo pošlje Caddy (s pravim IP-jem), se prepiše. `DJANGO_NUM_PROXIES=2` ne pomaga, ker je v glavi samo en naslov.

Posledica: vsi obiskovalci so za DRF en sam "IP":
- `register` 5/uro → po 5 registracijah na uro se **nihče** več ne more registrirati (tudi pretvorba gost → račun),
- `password_reset` 5/uro, `auth` 20/min (prijava), `guest` 10/min — globalno za vse.

Hkrati nginx prepiše `X-Forwarded-Proto` z `$scheme` (= `http`), zato Django za HTTPS zahteve misli, da so HTTP (`SECURE_PROXY_SSL_HEADER` ne deluje). CSRF zaradi `CSRF_TRUSTED_ORIGINS` še dela, `request.is_secure()` in absolutni URL-ji pa so napačni.

Popravek (ena od možnosti):
- v nginx za HTTPS profil `set_real_ip_from <docker subnet>; real_ip_header X-Forwarded-For;` → `$remote_addr` postane pravi IP odjemalca, in `X-Forwarded-Proto` vzemi od Caddyja (ločen `nginx.tls.conf` ali `map`, ki zaupa glavi samo iz Docker omrežja),
- ali Caddy usmeri `/api`, `/ws`, `/admin` neposredno na `backend:8000` in nastavi `DJANGO_NUM_PROXIES=1`.

HTTP profil (brez Caddyja) je zdaj pravilen.

### N3 — Dokumentacija obljublja backup, ki ga v produkciji ni

`docs/ops.md` pravi, da je servis `db-backup` v `docker-compose.yml` **in** `docker-compose.prod.yml`. V resnici je samo v razvojnem `docker-compose.yml`. Produkcija (kjer je 10.105 vprašanj) še vedno nima avtomatskega backupa. Poleg tega servis zahteva `--profile backup`, kar komentar v compose ne omenja.

### N4 — CSP bo blokiral Sentry na frontendu

`Content-Security-Policy` ima `connect-src 'self' ws: wss:`. Če se nastavi `VITE_SENTRY_DSN`, bo brskalnik blokiral pošiljanje napak na Sentry. Ob vklopu dodaj domeno Sentryja v `connect-src`.

### Manjše

- Boti v Hitri tekmi (`_bot_answer_message`) izbirajo odgovor iz *živih* opcij, ocenjevanje pa poteka iz zamrznjenega posnetka. Če admin med igro uredi vprašanje, bot lahko "pravilno" odgovori napačno. Redko, a nedosledno.
- Povabilo zdaj tiho uspe tudi, če vzdevek ne obstaja (zaradi V7). Varno, a host ne dobi povratne informacije ob tipkarski napaki — UI naj pove "Če igralec obstaja, je povabljen."
- Povabljen uporabnik lahko vstopi v zasebno sobo brez gesla (namerno), povabila pa se iz `room.settings["invites"]` nikoli ne odstranijo.

---

## 2. Kaj je narejeno

### Hrošči

| # | Stanje | Kaj je bilo narejeno |
| --- | --- | --- |
| H1 Povabila (`is_guest`) | Narejeno | Filter `email__isnull=False`, iskanje samo po vzdevku, test `rooms/tests_invite.py`. Dodana še obvestila prek `/ws/notify/` in zvonček v UI. |
| H2 Admin iskanje sej | Narejeno | `results__nickname` + `distinct()`, hkrati odpravljen N+1 s `Prefetch`. |
| H3 Seed prepiše admin popravke | Narejeno | Entrypoint seed požene samo na prazni bazi; `seed_questions --only-new`, privzeto ne prepiše `is_active`. |
| H4 Rematch izbriše zgodovino | Delno | `GameSession.room` je `ForeignKey`, rematch ne briše več sej. **Uvedel regresijo N1.** |
| H5 Urejanje spremeni preteklost | Narejeno | `presentation` v2 zamrzne tekst, opcije, pravilnost, razlago in drsnik; ocenjevanje in replay bereta posnetek. Ni uhajanja pravilnih odgovorov v `public_question`. Test `tests_presentation.py`. |
| H6 Countdown start pade tiho | Narejeno | `claim_commit_lobby_start` ob `GameError` vrne napako v lobby. |
| H7 `close_stale_rooms` ob vsakem branju | Narejeno | Omejeno na enkrat na 45 s prek cache. |

### Varnost

| # | Stanje | Opomba |
| --- | --- | --- |
| V1 Obid throttla z XFF | Delno | HTTP profil OK, `NUM_PROXIES` nastavljiv. **HTTPS profil pokvarjen (N2).** |
| V2 LocMem cache | Narejeno | Redis cache na ločeni bazi (`/1`). |
| V3 Reset/registracija | Delno | Throttle `register` 5/uro in `password_reset` 5/uro. **Potrditve e-pošte še ni.** |
| V4 Geslo 4 znaki | Ni | Namerno ohranjeno (komit `f6aa017`). |
| V5 WS zloraba | Narejeno | Največ 8 KB na sporočilo, 10 sporočil/s na povezavo. |
| V6 `limit=all` na lestvici | Narejeno | Odstranjeno. |
| V7 Enumeracija prek povabil | Narejeno | Samo vzdevek, enak odgovor ne glede na obstoj. |
| V8 Varnostne glave | Delno | CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` dodani. **Ni HSTS**, slike so še vedno zunanji URL-ji, glej N4. |
| V9 `X-Forwarded-Host/Proto` | Delno | Odjemalčeve glave se ne prenašajo več; v HTTPS je Proto zdaj napačen (N2). |
| V10 `/admin/` javno, brez 2FA | Ni | |
| V11 Container kot root | Narejeno | Uporabnik `app` (uid 10001). |
| V12 Nepripete odvisnosti | Ni | `requirements.txt` še vedno samo razponi. |
| V13 Dev admin geslo | Ni | Ostaja (samo dev). |
| V14 `DebugLanCsrfMiddleware` mutira settings | Ni | Ostaja (samo DEBUG). |
| V15 Brute-force gesla sobe | Narejeno | Throttle `room_join` 30/min na REST join. |

### Zmogljivost, podatki, kakovost

| Točka | Stanje | Opomba |
| --- | --- | --- |
| `select_questions` nalaga vse objekte | Narejeno | Najprej samo `(id, difficulty)`, nato naloži izbrane. |
| Indeksi na `GameResult` / `GameSession` | Narejeno | Migracija `0013`. |
| `CategoryListView` brez cache | Narejeno | Cache 60 s. |
| N+1 v `AdminSessionListView` | Narejeno | |
| N+1 / 25× `count()` v `AdminSummaryView` | Ni | |
| Podvojen `questions.json` | Narejeno | Kanoničen je `backend/questions/data/seed.json` (zdaj združen paket). |
| CI | Narejeno | GitHub Actions: ruff, migracije, backend testi s Postgres/Redis, frontend testi in build. |
| Linter | Delno | Ruff samo s kritičnimi pravili (`E9, F63, F7, F82`); ni formatterja, ni ESLint/Prettier. |
| Lazy loading admin strani | Narejeno | `React.lazy` + `Suspense` v `App.tsx`. |
| Backup baze | Delno | Samo v dev compose (N3). |
| Podvojene konstante (`modes.py` ↔ `site_settings`) | Delno | Produkcijska koda zdaj bere `site_settings` (dodanih ~12 Dirka/MP nastavitev, npr. `mp_min_players`, `dirka_question_pool`). Stare konstante v `modes.py` so ostale in jih uporabljajo le še testi — lahko se razideta z defaulti (npr. `ALA_SAFE_ORDERS = (4, 9)` vs. default `[4, 9, 14]`). |
| Pravila načinov iz konfiguracije | Delno | `rulesFromConfig` v `gameModes.tsx` vstavi vrednosti iz `game-config`, a z iskanjem/zamenjavo besedila (`line.includes("100 točk")`) — krhko ob vsaki spremembi besedila. |

---

## 3. Kaj je še potrebno

### Takoj (blokira normalno uporabo)

1. ~~N1~~ backend narejen → **N5**: `RoomDetailView` naj članu vrne 200 za `finished`.
2. ~~N2~~ narejeno za Caddy → **N6**: pravi IP in Proto za postavitev Apache → nginx (privzeti Jenkins deploy).
3. ~~N3~~ narejeno → še offsite kopija backupov.

### Kratkoročno

4. Potrditev e-pošte ob registraciji (V3).
5. HSTS za HTTPS (`SECURE_HSTS_SECONDS`), CSP prilagoditev za Sentry (N4).
6. Zaščita `/admin/` (IP allowlist ali basic-auth v proxyju), 2FA za staff, audit log (V10).
7. Pripete odvisnosti z lock datoteko + Dependabot (V12).
8. Odstrani mrtve konstante iz `modes.py`; testi naj berejo `site_settings`.
9. `AdminSummaryView` — združi štetja, odpravi N+1.
10. Razširi ruff pravila (vsaj `F`, `E`, `B`), dodaj ESLint/Prettier.
11. Odločitev o minimalni dolžini gesla (V4) — če ostane 4, vsaj blokiraj pogosta gesla in ponujaj 2FA za staff.

### Srednjeročno (arhitektura iz `report.md`, poglavje 5 — nič od tega še ni narejeno)

12. R1 — register načinov igre (zdaj se je dispatch `if mode == …` še razširil, npr. `lobby_countdown`).
13. R2 — strežniški "room runner" namesto timerjev v `GameConsumer` in `bot_only` threada.
14. R3 — tipizirano stanje seje.
15. R4 — razbitje `dirka.py`, `engine.py`, `site_settings.py`, `rooms/services.py`, `GamePage.tsx`, `styles.css` (večinoma so se še povečale).
16. R6 — tipiziran WS protokol, OpenAPI.
17. Pravila načinov kot predloge z vrednostmi (namesto zamenjave besedila).

### Vsebina (iz `report-ideas.md`, poglavje 4.0 — še ni narejeno)

18. Odstranitev 52 podvojenih tekstov in izločanje duplikatov v `select_questions`.
19. Prazne kategorije Politika, Kultura, Literatura.
20. Več interaktivnih tipov in slik.
