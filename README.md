# DieLogic — Website + Backend

Die DieLogic-Website mit integriertem Dashboard und optionalem Backend:
Landingpage, das vollständige HPDC-Dashboard (clientseitig, ohne
Abhängigkeiten), die Werkzeuge Sprengflächenanalyse, Teilekosten und
Zyklusanalyse — alle auf einem gemeinsamen **Projekt** — sowie ein
FastAPI-Backend für Konten (auf Einladung), Projektablage mit Revisionen
und die serverseitige Schuss-Simulation mit `hpdcsim`.

## Projekte: die gemeinsame Klammer

Jedes Werkzeug arbeitet auf dem **aktuellen Projekt** (z. B. „DieCastPartA"
mit Beschreibung, Kunde, Teilenummer). Das Projekt ist ein JSON-Dokument mit
einem Abschnitt je Werkzeug:

| Abschnitt  | Werkzeug                         | liefert an andere                                   |
|------------|----------------------------------|-----------------------------------------------------|
| `design`   | Dashboard + alle Diagramme       | Bauteil-/Schussgewicht, Maschinen-Preset            |
| `geometry` | Sprengflächenanalyse (STL)       | schreibt Massen, Sprengfläche, Maschine nach `design` |
| `cycle`    | Zyklusanalyse (Zeitleiste + Wärmebilanz) | Zykluszeit (bezieht Schussgewicht, Legierung, Temperaturen, Sprengfläche, Maschine aus `design`, Gravurfläche aus `geometry`) |
| `cost`     | Teilekosten                      | — (bezieht Massen aus `design`, t_Z aus `cycle`)    |

`web/shared/project.js` hält den Browser-Cache der Projekte und mit
`derived()` die Querbezüge; `projectbar.js` ist die Projektleiste auf jeder
Werkzeugseite (wechseln, anlegen, bearbeiten, Revision) und synchronisiert
mit dem Server. Die Werkzeuge setzen ein Konto voraus — ohne Anmeldung
leitet die Leiste zur Konto-Seite um.
Mit Konto ist die **Datenbank der Stand der Wahrheit**: jede Änderung wird
automatisch als Arbeitsstand synchronisiert (der Browser ist nur Cache),
lokale Projekte werden beim Anmelden übernommen, und „Revision" legt einen
benannten Schnappschuss (Autor, Zeit, Notiz) an. Projekte gehören der
Organisation, nicht der Person (B2B). Ohne Konto bleibt alles im Browser.
Verwaltung (Verlauf, Kopie, Export/Import, Zurücksetzen, Archivieren,
Mitglieder, Einladungen): `/konto/`.

**Stammdaten der Organisation:** Maschinen, Legierungen, Bauteiltypen und
Kosten & Sätze (Legierungspreis, Strompreis, Stundensätze …) pflegt ein
Admin auf der Konto-Seite; sie ersetzen in allen Werkzeugen die
Beispielwerte aus `web/shared/examples/*.js` (`web/shared/orgpresets.js` legt sie beim
Laden über die Globals, Backend `/api/org/settings`).

## Struktur

```
dielogic/
├── web/             die statische Website — dieser Ordner ist 1:1 der Webspace-Inhalt
│   │                (Backend mountet ihn unter /). Alle seitenübergreifenden Pfade sind
│   │                wurzel-absolut (/shared/…, /assets/…, /tools/…), Verschachtelung ist egal.
│   ├── index.html       Landingpage (Hero, Schritte, Werkzeuge, Katalog, Theorie, Preise)
│   ├── shared/          Laufzeit-Bausteine aller Seiten (klassische Scripts, vor den Modulen):
│   │   ├── palette.js       DIE Farbquelle (window.__PALETTE__; shared.css spiegelt sie,
│   │   │                    Test prüft Gleichheit + WCAG-Kontrast)
│   │   ├── shared.css       Basis-Styles + :root-Tokens
│   │   ├── nav.js           injiziert Site-Navigation + Footer (selbstversorgend)
│   │   ├── version.js       Versionsnummer (Nav-Badge + /api/health)
│   │   ├── project.js       Projekt-Cache im Browser + Querbezüge (derived())
│   │   ├── projectbar.js    Projektleiste auf jeder Werkzeugseite, Sync mit dem Server
│   │   ├── orgpresets.js    Stammdaten der Organisation überlagern die Beispiel-Presets
│   │   └── clampmodel.js    Zuhaltungs-Modell (Dashboard-Diagramm + STL-Maschinentabelle)
│   ├── tools/           ein Ordner je Werkzeug, gleiche Form: index.html + eigene Scripts
│   │   ├── auslegung/       das Dashboard: index.html (alle Diagramme), chart.html?id=…
│   │   │                    (Einzelseite), config/ (theme.js Diagrammfarben, examples/
│   │   │                    Beispiel-Presets machines/alloys/parts/kosten), css/, js/…
│   │   │                    (core/simapi.js + simstore.js = Backend-Anbindung)
│   │   ├── sprengflaeche/   STL-Analyse: stl-math.js (Netz-Kennwerte, getestet),
│   │   │                    stl-logic.js (Massenbilanz/Maschinentabelle, getestet), stl-app.js
│   │   ├── teilekosten/     Teilekosten-Kalkulation (Abschnitt cost, verknüpfte Felder)
│   │   └── zyklus/          Zyklusanalyse (Abschnitt cycle): Zeitleiste + Wärmebilanz je Zyklus
│   │                        (zyklus-logic.js, getestet gegen die Zahlenbeispiele der Quellen —
│   │                        docs/heat_flow_hpd_die.md)
│   ├── konto/           Konto: Einladung einlösen, Anmelden, Projekte/Revisionen,
│   │                    Mitglieder, Einladungen, Stammdaten (Admin)
│   ├── theorie/         Theorie-Artikel (Formeln im .eq-Markup, statische SVGs aus assets/)
│   ├── recht/           Rechts-/Unternehmensseiten — Mustertexte mit [Platzhaltern]!
│   │                    kontakt, ueber-uns, impressum (§ 5 DDG), datenschutz (DSGVO),
│   │                    agb, widerruf (+ Musterformular)
│   ├── assets/          logo.svg, icon-*.png (aus logo.svg gerendert), site.webmanifest,
│   │                    team-mockup.svg, palette.svg/.png (generiert), theorie/*.svg (generiert)
│   └── examples/        Beispiel-STLs für die Sprengflächenanalyse (auch von Tests genutzt)
├── backend/         FastAPI: /api/auth (Einladung, Sitzung), /api/org (Mitglieder,
│   │                Einladungen, Stammdaten), /api/projects (Revisionen),
│   │                /api/sim/shot (hpdcsim) + statische Auslieferung von web/
│   ├── app.py  db.py  auth.py  projects.py  orgsettings.py  manage.py  sim.py  simcore.py  convert.py
│   └── tests/       API-Tests (TestClient, SQLite), convert-Unit-Tests, Physik-Fixtures
├── packages/
│   └── hpdcsim/     Simulationspaket (eigenes pyproject, pytest-Suite)
├── fixtures/        Referenzdaten, die JS UND Python prüfen
│   ├── physics/     Referenzfälle: bekannte Eingaben + Sollwerte (siehe README dort)
│   └── vkrit/       v_krit_sim.csv — OpenFOAM-CFD-Tabelle, Quelle für beide v_krit-Tabellen
├── docs/            Quellen-Notizen (heat_flow_hpd_die.md: Wärmebilanz-Gleichungen + Abgleich)
├── tests/web/       Node-Tests der Website (nicht ausgeliefert)
├── scripts/         Generatoren: gen-theory-svgs, gen-vkrit-table, gen-palette (nicht ausgeliefert)
├── render.yaml      Render-Blueprint (Web Service: Build, Start, Healthcheck)
└── .venv/           lokale Python-Umgebung (nicht einchecken)
```

## Starten

**Mit Backend (Website + Simulation):**

```bash
cd dielogic
python3 -m venv .venv                       # einmalig
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/pip install -e ./packages/hpdcsim
.venv/bin/uvicorn backend.app:app --reload
```

→ http://127.0.0.1:8000/ — die Luftdruck-Kurve in der Schusskurve rechnet über
`/api/sim/shot` (Details: `backend/README.md`).

**Nur statisch (ohne Simulation):**

```bash
cd dielogic/web && python3 -m http.server 8000
```

Das Dashboard lädt seine ES-Module direkt aus `tools/auslegung/js/` — kein
Build-Schritt, aber ein Webserver ist nötig (file://-Doppelklick wird
nicht unterstützt). Ohne Backend entfällt nur die Luftdruck-Serie mit einem
Hinweis in der Schusskurve — alle 19 Diagramme rechnen unabhängig davon im Browser.

## Tests

Wie in CI (`.github/workflows/ci.yml`):

```bash
node tests/web/syntax-check.mjs                 # Syntax aller JS + Inline-Scripts
node --test tests/web/*.test.mjs                # Frontend, Physik-Fixtures, Grenzen, Render-Rauchtest
node scripts/gen-theory-svgs.mjs                # statische SVGs der Theorie-Artikel neu erzeugen
                                                # (web/assets/theorie/ — nach Änderungen an Charts/Defaults)
node scripts/gen-vkrit-table.mjs                # v_krit-CFD-Tabelle (JS + Python) aus
                                                # fixtures/vkrit/v_krit_sim.csv neu erzeugen
.venv/bin/python packages/hpdcsim/tests/run_tests.py
.venv/bin/python -m pytest backend/tests -q     # braucht zusätzlich httpx + pytest
```

Die Physik-Fixtures (`fixtures/physics/`) sind der Anker zwischen beiden
Physik-Implementierungen: dieselben Eingabe-/Sollwert-Dateien laufen gegen
`web/tools/auslegung/js/core/physics.js` (Node) und gegen `backend/convert.py` →
`hpdcsim` (Python).

## Vor dem Livegang (Rechtsseiten)

Impressum, Datenschutzerklärung, AGB und Widerrufsbelehrung sind
**Mustertexte**: alle gelb markierten `[Platzhalter]` (Name, Anschrift,
Hoster, USt-IdNr., Zahlungsweg, Stand-Datum …) ausfüllen, die Texte an das
tatsächliche Geschäftsmodell anpassen und anwaltlich prüfen lassen — die
Vorlagen sind keine Rechtsberatung. Der gelbe Hinweiskasten oben auf jeder
Seite wird danach gelöscht. Die Preise auf der Landingpage
(`web/index.html#preise`) sind ebenfalls Beispielwerte. Geht das Backend
mit ins Netz, muss die Datenschutzerklärung um die Verarbeitung der
Simulations-Requests ergänzt werden.

## Anpassen

- **Navigation/Footer:** `web/shared/nav.js` — Linkliste (`NAV_LINKS`),
  Diagrammliste (`CHARTS`, Reihenfolge = `web/tools/auslegung/js/charts/registry.js`).
- **Farbschema:** `web/shared/palette.js` (einzige Quelle; `shared/shared.css`
  spiegelt sie als Tokens, Test prüft Gleichheit). Diagrammfarben:
  `web/shared/theme.js`. Farbtafel: `web/assets/palette.svg`.
- **Version:** `web/shared/version.js` (Nav-Badge und `/api/health`).
- **Presets (Beispielwerte):** `web/shared/examples/*.js` — produktiv
  pflegt jede Organisation ihre eigenen als Stammdaten auf der Konto-Seite.
- **Logo/Icons:** `web/assets/logo.svg` bearbeiten, danach PNGs rendern:
  ```bash
  cd web/assets
  for s in 32 192 512; do inkscape logo.svg -w $s -h $s -o icon-$s.png; done
  inkscape logo.svg -w 180 -h 180 -b '#002733' -y 1 -o icon-180.png   # Apple: ohne Transparenz
  ```
- **Neues Diagramm:** wie in `web/tools/auslegung/README.md`; danach in `web/shared/nav.js`
  (`CHARTS`) und im Katalog auf `web/index.html` verlinken.
- **Simulation:** Einheiten-Übersetzung und Defaults in
  `backend/convert.py`; im Frontend holt `web/tools/auslegung/js/core/simstore.js` das
  Ergebnis, die Schusskurve zeichnet den Luftdruck auf der zweiten Achse.

## Herkunft

- `web/tools/auslegung/` ist der Port des früheren eigenständigen `hpdc-dashboard`
  (dieser Ordner ist die gepflegte Fassung).
- Arbeitsteilung des Backends: das Frontend zeichnet, Python rechnet —
  die Simulation liefert `hpdcsim`.
