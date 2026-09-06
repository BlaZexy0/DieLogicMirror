# DieLogic Backend

FastAPI-Backend: liefert die statische Website (`../web/`) aus und stellt
unter `/api/…` Konten (nur auf Einladung), die Projektablage mit Revisionen
und die serverseitige Simulation mit [`hpdcsim`](../packages/hpdcsim) bereit.
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
  Login-Seite zeigt dann „Als Demo anmelden" samt Zugangsdaten. Nur zum
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
.venv/bin/pip install -e ./packages/hpdcsim
.venv/bin/uvicorn backend.app:app --reload
```

→ http://127.0.0.1:8000/ ist die Website, das Dashboard unter
`/tools/auslegung/` zeigt den simulierten Luftdruck auf der zweiten Achse der Schusskurve. Ohne laufendes
Backend (statisches Hosting) entfällt nur diese Serie mit einem Hinweis — alles
andere rechnet weiter im Browser.

## API

- `GET /api/health` — Lebenszeichen.
- Konto: `GET /api/auth/invite/{token}`, `POST /api/auth/register`
  `{token, name, password}`, `POST /api/auth/login` `{email, password}`,
  `POST /api/auth/logout`, `GET /api/auth/me`.
- Stammdaten: `GET /api/org/settings` (alle Mitglieder) → `{machines|alloys|parts|kosten: {data, updated_at}}`;
  Admin: `PUT /api/org/settings/{key}` `{data}` (Listen: `[{id, name, fields{…}}]`,
  kosten: `{pAl, pE, …}`), `DELETE /api/org/settings/{key}` = zurück auf Beispielwerte.
- Organisation: `GET /api/org/members`; Admin: `GET|POST /api/org/invites`
  `{email, role}`, `DELETE /api/org/invites/{id}`,
  `POST /api/org/members/{id}/disable`.
- Projekte (auf die eigene Organisation beschränkt): `GET|POST /api/projects`,
  `GET|PUT|DELETE /api/projects/{id}` (DELETE = archivieren),
  `PUT /api/projects/{id}/draft` `{data}` (Autosave des Arbeitsstands),
  `GET|POST /api/projects/{id}/revisions` (`{data: {design, geometry, cycle,
  cost}, note}`, max. 1 MB), `GET /api/projects/{id}/revisions/{rev}`.
- `POST /api/sim/shot` — Body:

  ```json
  {
    "values": { "part": 12, "runner": 3, "overflow": 2, "biscuit": 1.2,
                "density": 2700, "diam": 150, "length": 700,
                "gate": 1800, "vent": 800, "Tcast": 660 },
    "curve": [[60, 0.4], [318, 0.4], [470, 4], [675, 4]],
    "count": 400,
    "process": {"dosing_time": 4.0, "dwell_time": 1.0},
    "vacuum": {"model": "ideal", "pump_mbar": 80,
                "valve_mm2": 100, "start_mm": 150}
  }
  ```

  `values`/`curve` sind 1:1 der Dashboard-Zustand (Browser-Einheiten:
  mm, kg, °C); `process` und `vacuum` sind optional. `vacuum` kommt
  ebenfalls in Browser-Einheiten (`model`: `ideal` | `conductance` |
  `aus`, `pump_mbar`, `valve_mm2`, `start_mm`) und wird in `convert.py`
  ins SI-Schema von hpdcsim übersetzt; beim `conductance`-Modell wirken
  zusätzlich die Entlüftungsfläche (`values.vent` → `casting.vent_area`)
  und der Einguss als Drosselquerschnitte. Antwort: `meta`
  (φ, Füllende-Hub, Pressrestlänge, ob die Kurve gekappt wurde), `samples`
  über die Schussphase (t, s_mm, v, gate_v, p_air_mbar, T_melt, part_fill),
  `events` (Einguss dicht, Kammer voll, …) und `critical_crossing`
  (erste Überschreitung der kritischen Geschwindigkeit nach Garber/López).

## Aufbau

| Datei | Inhalt |
|---|---|
| `app.py` | FastAPI-App: API-Router, Anmeldeschranke für `/tools/…` (`login_gate`), Cache-/Sicherheits-Header, statische Website |
| `sim.py` | dünne HTTP-Schicht (`/api/sim/shot`, Pydantic-Validierung) |
| `core.py` | löst den hpdcsim-Prozess, tastet die Schussphase ab, JSON-tauglich (NaN/Inf → null) |
| `convert.py` | Einheiten-Übersetzung Browser ↔ SI, Füllgrad, Kurven-Kappung am Füllende-Hub — ohne Web-Abhängigkeiten testbar |

Wissenswertes zur Übersetzung (`convert.py`):

- Volumina aus Massen/Dichte wie im Dashboard; φ = V_dose/(A·L).
- hpdcsim verweigert Profile, die über den Füllende-Hub (L − Pressrest)
  hinausfahren — die Schusskurve wird dort gekappt (`meta.curve_clamped`).
- Die Einfüllöffnung schließt bei `values.sealStroke` (Dashboard-Feld
  „Einfüllöffnung verschlossen", mm) — dort beginnt die Luftkompression.
- Ohne eigene Felder gesetzt: Eingusslage 0,2·L (falls `sealStroke` fehlt),
  c_p = 1050 J/(kg·K), Dosierzeit 4 s, Beruhigungszeit 1 s.

## Schnelltest ohne Server

```bash
PYTHONPATH=packages/hpdcsim python3 -c "
from backend.simcore import run_shot_simulation
print(run_shot_simulation({'part':12,'runner':3,'overflow':2,'biscuit':1.2,
  'density':2700,'diam':150,'length':700,'gate':1800},
  [[60,.4],[318,.4],[470,4],[675,4]])['meta'])"
```
