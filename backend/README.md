# DieLogic Backend

FastAPI-Backend: liefert die statische Website (`../web/`) aus und stellt
unter `/api/…` Konten (nur auf Einladung), die Projektablage mit Revisionen
und die Stammdaten der Organisation bereit. Der Server rechnet nichts: alle
Auslegungsrechnungen, auch die Luftsimulation der Schusskurve, laufen im
Browser (`../web/tools/auslegung/js/core/`).
Die Werkzeugseiten unter `/tools/` (Verzeichnisse und `.html`, nicht die
Skripte und Modelle darunter) gibt es nur mit Sitzung: ohne
`dl_session`-Cookie antwortet `login_gate` mit 302 auf `/konto/?next=…`,
das HTML verlässt den Server nicht.
Tests: `pytest backend/tests -q` (conftest.py setzt eine temporäre SQLite).

## Datenbank & Konten

- `DATABASE_URL` (Postgres, z. B. Render: `postgres://…` wird automatisch zu
  `postgresql+psycopg://`); ohne Variable eine SQLite-Datei `data/dielogic.db`.
  Das Schema wird beim Start angelegt (`create_all`).
- **Mandanten:** `orgs` → `users` (Rolle `admin`/`member`) → `projects`
  (mit `draft` = laufend synchronisierter Arbeitsstand) → `project_revisions`
  (benannte, unveränderliche Schnappschüsse mit Autor/Notiz).
- **Einladung statt Registrierung:** ein Einladungslink
  `/konto/?token=…` ist 14 Tage gültig und einmal einlösbar.
- **Erster Admin ohne Shell** (Render Free): `DIELOGIC_ADMIN_EMAIL` und
  `DIELOGIC_ADMIN_TOKEN` (24–64 Zeichen, z. B. `openssl rand -base64 33`)
  setzen — solange kein Benutzer existiert, legt der Start die Organisation
  `DIELOGIC_ORG` (Standard `dielogic`) an und eine Admin-Einladung mit genau
  diesem Token; sie ist wie jede Einladung 14 Tage gültig und wird bei jedem
  Start erneuert, solange sie nicht eingelöst ist. Danach im Browser
  `https://<host>/konto/?token=<DIELOGIC_ADMIN_TOKEN>` öffnen,
  Namen/Passwort setzen. Ein zu kurzer Token oder eine fehlerhafte Adresse
  hält den Start nicht mehr auf — es steht dann eine Warnung im Server-Log. Weitere Personen lädt man auf der Konto-Seite ein
  (Link kopieren und weitergeben).
- **Schema-Explorer:** `/docs`, `/redoc` und `/openapi.json` sind
  standardmäßig ZU — sie listen jeden Endpunkt samt Feldern und laden zum
  Ausprobieren ein. Zum Entwickeln `DIELOGIC_DOCS=1` setzen.
- **Sicherheits-Header:** jede Antwort trägt CSP, `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy` und `Permissions-Policy`;
  über TLS zusätzlich HSTS. Die CSP erlaubt `'unsafe-inline'` für Skripte
  und Styles, weil die Seiten ihre Logik in Inline-Blöcken tragen — alles
  Übrige ist auf `'self'` beschränkt und wird mitgeliefert.
- **Demo-Konto:** `DIELOGIC_DEMO_PASSWORD=<mind. 10 Zeichen>` setzen → beim
  Start entsteht die Organisation „Demo" mit Admin `demo@dielogic.de`; die
  Login-Seite zeigt dann „Als Demo anmelden" mit der Adresse (das Passwort
  steht nirgends in der Seite, `POST /api/auth/demo/login` meldet an). Nur zum
  Ausprobieren — in Produktion weglassen. Prüfen: `GET /api/auth/demo`
  liefert `{}`, solange die Variable fehlt oder zu kurz ist (dann steht
  eine Warnung im Server-Log); auf Render die Variable im Dashboard unter
  *Environment* setzen (`sync: false` im Blueprint), der Dienst startet
  danach neu.
- **CLI** (lokal oder mit Shell-Zugang):

  ```bash
  python -m backend.manage create-org acme "ACME Druckguss GmbH"
  python -m backend.manage invite jane@acme.de --org acme --admin --base-url https://dielogic.de
  python -m backend.manage disable jane@acme.de
  ```

- Sitzungen: zufälliger Token im HttpOnly-Cookie `dl_session` (30 Tage,
  serverseitig in `sessions`, `Secure` hinter HTTPS). Passwörter: scrypt.

## Setup & Start

```bash
cd dielogic
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn backend.app:app --reload
```

→ http://127.0.0.1:8000/ ist die Website. Ohne laufendes Backend (statisches
Hosting) fehlen Anmeldung und Projektablage — die Werkzeuge rechnen
unverändert im Browser, die Projekte bleiben dann dort.

## API

- `GET /api/health` — Lebenszeichen.
- Konto: `GET /api/auth/invite/{token}`, `POST /api/auth/register`
  `{token, name, password}`, `POST /api/auth/login` `{email, password}`,
  `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password`
  (eigenes Passwort ändern), `GET /api/auth/demo` und
  `POST /api/auth/demo/login` (Demo-Konto, wenn eingerichtet).
- Stammdaten: `GET /api/org/settings` (alle Mitglieder) → `{machines|alloys|parts|kosten: {data, updated_at}}`;
  Admin: `PUT /api/org/settings/{key}` `{data}` (Listen: `[{id, name, fields{…}}]`,
  kosten: `{pAl, pE, …}`), `DELETE /api/org/settings/{key}` = zurück auf Beispielwerte.
- Organisation: `GET /api/org/members`; Admin: `GET|POST /api/org/invites`
  `{email, role}`, `DELETE /api/org/invites/{id}`,
  `POST /api/org/members/{id}/disable`, `POST /api/org/members/{id}/enable`,
  `POST /api/org/members/{id}/password` (Passwort eines Mitglieds neu setzen).
  Die Werte der Stammdaten prüft der Server gegen dieselben Grenzen wie die
  Werkzeuge (`_domain.py`, erzeugt von `scripts/gen-domain-doc.mjs`): Felder
  der Presets samt den Regeln zwischen zwei Feldern, die Kostensätze.
- Projekte (auf die eigene Organisation beschränkt): `GET|POST /api/projects`,
  `GET|PUT|DELETE /api/projects/{id}` (DELETE = archivieren),
  `PUT /api/projects/{id}/draft` `{data}` (Autosave des Arbeitsstands),
  `GET|POST /api/projects/{id}/revisions` (`{data: {design, geometry, cycle,
  cost}, note}`, max. 1 MB), `GET /api/projects/{id}/revisions/{rev}`.

## Aufbau

| Datei | Inhalt |
|---|---|
| `app.py` | FastAPI-App: API-Router, Anmeldeschranke für `/tools/…` (`login_gate`), Cache-/Sicherheits-Header, statische Website |
| `db.py` | Engine, Session und ORM-Modelle — Mandantenmodell: Projekte gehören der Organisation, jede Speicherung ist eine unveränderliche Revision |
| `auth.py` | Anmeldung nur auf Einladung: Einladungen, Registrierung, Sitzungen, Passwörter (scrypt), Bootstrap des ersten Admins aus der Umgebung |
| `projects.py` | Projekte mit ihren Werkzeug-Abschnitten (design, geometry, cycle, cost), Arbeitsstand (Autosave) und Revisionen |
| `orgsettings.py` | Stammdaten der Organisation (Maschinen, Legierungen, Bauteiltypen, Kosten & Sätze), geprüft gegen die Eingabedomäne |
| `_domain.py` | die Eingabedomäne — GENERIERT aus `web/tools/auslegung/js/config/fields.js` (`node scripts/gen-domain-doc.mjs`), damit der Server dieselben Grenzen prüft wie der Browser |
| `manage.py` | Verwaltungs-CLI: Organisationen, Einladungen, Benutzer (`python -m backend.manage …`) |
