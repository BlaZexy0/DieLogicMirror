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
| `cycle`    | Zyklusanalyse                    | Zykluszeit                                          |
| `cost`     | Teilekosten                      | — (bezieht Massen aus `design`, t_Z aus `cycle`)    |

`site/app/shared/project.js` hält den Speicher (localStorage, mehrere
Projekte, Migration des alten Dashboard-Schlüssels), `derived()` die
Querbezüge; `projectbar.js` ist die Projektleiste auf jeder Werkzeugseite
(wechseln, anlegen, bearbeiten, JSON-Export/-Import, ☁ Speichern).
Mit Konto ist die **Datenbank der Stand der Wahrheit**: jede Änderung wird
automatisch als Arbeitsstand synchronisiert (der Browser ist nur Cache),
lokale Projekte werden beim Anmelden übernommen, und „Revision" legt einen
benannten Schnappschuss (Autor, Zeit, Notiz) an. Projekte gehören der
Organisation, nicht der Person (B2B). Ohne Konto bleibt alles im Browser.
Verwaltung (Verlauf, Kopie, Export/Import, Zurücksetzen, Archivieren,
Mitglieder, Einladungen): `/app/konto.html`.

**Stammdaten der Organisation:** Maschinen, Legierungen, Bauteiltypen und
Kosten & Sätze (Legierungspreis, Strompreis, Stundensätze …) pflegt ein
Admin auf der Konto-Seite; sie ersetzen in allen Werkzeugen die
Beispielwerte aus `app/config/*.js` (`shared/orgpresets.js` legt sie beim
Laden über die Globals, Backend `/api/org/settings`).

## Struktur

```
dielogic/
├── site/            die statische Website — dieser Ordner ist der Webspace-Inhalt
│   ├── index.html       Landingpage (Hero, Schritte, Werkzeuge, Katalog, Theorie, Preise)
│   ├── theorie/         Theorie-Artikel (Kurzfassungen als Mockup, Formeln im
│   │                    .eq-Markup — keine externen Abhängigkeiten)
│   ├── recht/           Rechts-/Unternehmensseiten — Mustertexte mit [Platzhaltern]!
│   │   ├── kontakt.html      Kontaktseite
│   │   ├── ueber-uns.html    Über-uns-Seite (Teamfoto-Mockup + [Platzhalter]-Team)
│   │   ├── impressum.html    Impressum (§ 5 DDG)
│   │   ├── datenschutz.html  Datenschutzerklärung (DSGVO)
│   │   ├── agb.html          Allgemeine Geschäftsbedingungen
│   │   └── widerruf.html     Widerrufsbelehrung + Musterformular
│   ├── stl/             STL-Analyse — clientseitig: Volumen, Oberfläche,
│   │                    projizierte Fläche (X/Y/Z) je Datei + Summen, max.
│   │                    Nachdruck je Maschinen-Preset (Zuhaltungs-Modell)
│   │   ├── stl-analyse.html  Seite (Markup + Styles)
│   │   ├── stl-math.js       Netz-Kennwerte (Parser, Volumen, Fläche) — getestet
│   │   ├── stl-logic.js      Zuordnung/Massenbilanz/Maschinentabelle — getestet
│   │   └── stl-app.js        Ansicht + Verdrahtung (Canvas, Tabellen, Events)
│   ├── kosten/          Teilekosten-Kalkulation (Abschnitt cost, verknüpfte Felder)
│   ├── zyklus/          Zyklusanalyse (Abschnitt cycle, Zeitleiste)
│   ├── shared.css       Basis-Styles; :root-Tokens = Spiegel von app/config/palette.js
│   ├── tools/           Generatoren: gen-theory-svgs, gen-vkrit-table, gen-palette
│   │                    (assets/palette.svg + .png — Farbtafel mit Kontrastwerten)
│   ├── nav.js           injiziert Site-Navigation + Footer (selbstversorgend)
│   ├── assets/          logo.svg (Vektor-Logo), icon-*.png (Favicons,
│   │                    aus logo.svg gerendert), site.webmanifest, team-mockup.svg
│   └── app/             das Dashboard (Port von ../hpdc-dashboard)
│       ├── index.html       Gesamt-Dashboard (Schusskurve inkl. Luftdruck-Simulation)
│       ├── chart.html       Diagramm-Einzelseite
│       ├── konto.html       Konto: Einladung einlösen, Anmelden, Projekte/Revisionen,
│       │                    Mitglieder, Einladungen (Admin)
│       ├── config/          palette.js (DIE Farbquelle — CSS-Tokens, theme.js und die
│       │                    JS-Konstanten in nav.js/projectbar.js spiegeln sie; Test
│       │                    palette.test.mjs prüft Gleichheit + WCAG-Kontrast),
│       │                    theme.js (Diagramm-Farben), machines/alloys/parts/kosten
│       ├── shared/          project.js (Projektspeicher + Querbezüge), projectbar.js,
│       │                    orgpresets.js (Stammdaten der Organisation über die Presets),
│       │                    (Projektleiste), contract.js (STL → design), clampmodel.js
│       ├── css/site.css     Layout-Offsets für die 56px-Navigation
│       └── js/…             u. a. core/simapi.js + core/simstore.js (Backend-Anbindung;
│                            Luftdruck-Serie mit 2. Achse in der Schusskurve)
├── backend/         FastAPI: /api/auth (Einladung, Sitzung), /api/org (Mitglieder,
│   │                Einladungen, Stammdaten), /api/projects (Revisionen),
│   │                /api/sim/shot (hpdcsim) + statische Auslieferung
│   ├── app.py  db.py  auth.py  projects.py  orgsettings.py  manage.py  sim.py  core.py  convert.py
│   └── tests/       API-Tests (TestClient, SQLite), convert-Unit-Tests, Physik-Fixtures
├── packages/
│   └── hpdcsim/     Simulationspaket (eigenes pyproject, pytest-Suite)
├── fixtures/
│   └── physics/     geteilte Referenzfälle: bekannte Eingaben + Sollwerte,
│                    geprüft von physics.js UND hpdcsim (siehe README dort)
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
cd dielogic/site && python3 -m http.server 8000
```

Das Dashboard lädt seine ES-Module direkt aus `app/js/` — kein
Build-Schritt, aber ein Webserver ist nötig (file://-Doppelklick wird
nicht unterstützt). Ohne Backend entfällt nur die Luftdruck-Serie mit einem
Hinweis in der Schusskurve — alle 19 Diagramme rechnen unabhängig davon im Browser.

## Tests

Wie in CI (`.github/workflows/ci.yml`):

```bash
node site/tests/syntax-check.mjs                # Syntax aller JS + Inline-Scripts
node --test site/tests/*.test.mjs               # Frontend, Physik-Fixtures, Grenzen, Render-Rauchtest
node site/tools/gen-theory-svgs.mjs             # statische SVGs der Theorie-Artikel neu erzeugen
                                                # (site/assets/theorie/ — nach Änderungen an Charts/Defaults)
node site/tools/gen-vkrit-table.mjs             # v_krit-CFD-Tabelle (JS + Python) aus
                                                # site/assets/v_krit_sim.csv neu erzeugen
.venv/bin/python packages/hpdcsim/tests/run_tests.py
.venv/bin/python backend/tests/run_tests.py     # braucht zusätzlich httpx (TestClient)
```

Die Physik-Fixtures (`fixtures/physics/`) sind der Anker zwischen beiden
Physik-Implementierungen: dieselben Eingabe-/Sollwert-Dateien laufen gegen
`site/app/js/core/physics.js` (Node) und gegen `backend/convert.py` →
`hpdcsim` (Python).

## Vor dem Livegang (Rechtsseiten)

Impressum, Datenschutzerklärung, AGB und Widerrufsbelehrung sind
**Mustertexte**: alle gelb markierten `[Platzhalter]` (Name, Anschrift,
Hoster, USt-IdNr., Zahlungsweg, Stand-Datum …) ausfüllen, die Texte an das
tatsächliche Geschäftsmodell anpassen und anwaltlich prüfen lassen — die
Vorlagen sind keine Rechtsberatung. Der gelbe Hinweiskasten oben auf jeder
Seite wird danach gelöscht. Die Preise auf der Landingpage
(`site/index.html#preise`) sind ebenfalls Beispielwerte. Geht das Backend
mit ins Netz, muss die Datenschutzerklärung um die Verarbeitung der
Simulations-Requests ergänzt werden.

## Anpassen

- **Navigation/Footer:** `site/nav.js` — Linkliste (`NAV_LINKS`),
  Diagrammliste (`CHARTS`, Reihenfolge = `site/app/js/charts/registry.js`).
- **Farbschema:** Tokens in `site/shared.css`; das Dashboard hat sein
  eigenes Schema in `site/app/config/theme.js` (beide DieLogic Teal:
  `#008c82` auf Petrol `#002733`).
- **Maschinen-Presets:** `site/app/config/machines.js`.
- **Logo/Icons:** `site/assets/logo.svg` bearbeiten, danach PNGs rendern:
  ```bash
  cd site/assets
  for s in 32 192 512; do inkscape logo.svg -w $s -h $s -o icon-$s.png; done
  inkscape logo.svg -w 180 -h 180 -b '#002733' -y 1 -o icon-180.png   # Apple: ohne Transparenz
  ```
- **Neues Diagramm:** wie in `site/app/README.md`; danach in `site/nav.js`
  (`CHARTS`) und im Katalog auf `site/index.html` verlinken.
- **Simulation:** Einheiten-Übersetzung und Defaults in
  `backend/convert.py`; im Frontend holt `site/app/js/core/simstore.js` das
  Ergebnis, die Schusskurve zeichnet den Luftdruck auf der zweiten Achse.

## Herkunft

- `site/app/` ist der Port von `../hpdc-dashboard` (dieser Ordner ist die
  gepflegte Fassung).
- Arbeitsteilung des Backends: das Frontend zeichnet, Python rechnet —
  die Simulation liefert `hpdcsim`.
