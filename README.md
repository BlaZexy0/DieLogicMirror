# DieLogic — Website + Backend

Die DieLogic-Website mit integriertem Dashboard und optionalem
Simulations-Backend: Landingpage, das vollständige HPDC-Dashboard
(clientseitig, ohne Abhängigkeiten) und ein FastAPI-Backend, das die
serverseitige Schuss-Simulation mit `hpdcsim` bereitstellt.

## Struktur

```
dielogic/
├── site/            die statische Website — dieser Ordner ist der Webspace-Inhalt
│   ├── index.html       Landingpage (Hero, Schritte, Werkzeuge, Katalog, Theorie, Preise)
│   ├── kontakt.html     Kontaktseite
│   ├── ueber-uns.html   Über-uns-Seite (Teamfoto-Mockup + [Platzhalter]-Team)
│   ├── theorie/         Theorie-Artikel (Kurzfassungen als Mockup, Formeln im
│   │                    .eq-Markup — keine externen Abhängigkeiten)
│   ├── recht/           Rechtsseiten — Mustertexte mit [Platzhaltern]!
│   │   ├── impressum.html    Impressum (§ 5 DDG)
│   │   ├── datenschutz.html  Datenschutzerklärung (DSGVO)
│   │   ├── agb.html          Allgemeine Geschäftsbedingungen
│   │   └── widerruf.html     Widerrufsbelehrung + Musterformular
│   ├── shared.css       Design-Tokens + Basis-Styles (DieLogic Teal)
│   ├── nav.js           injiziert Site-Navigation + Footer (selbstversorgend)
│   ├── assets/          logo.svg (Vektor-Logo), icon-*.png (Favicons,
│   │                    aus logo.svg gerendert), site.webmanifest, team-mockup.svg
│   └── app/             das Dashboard (Port von ../hpdc-dashboard)
│       ├── index.html       Gesamt-Dashboard + Simulationskarte (Backend)
│       ├── chart.html       Diagramm-Einzelseite
│       ├── css/site.css     Layout-Offsets für die 56px-Navigation
│       └── js/…             u. a. core/simapi.js + ui/simcard.js (Backend-Anbindung)
├── backend/         FastAPI: /api/sim/shot (hpdcsim) + statische Auslieferung
│   ├── app.py  sim.py  core.py  convert.py  requirements.txt  README.md
├── packages/
│   └── hpdcsim/     Simulationspaket (eigenes pyproject, pytest-Suite)
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

→ http://127.0.0.1:8000/ — die Simulationskarte im Dashboard rechnet über
`/api/sim/shot` (Details: `backend/README.md`).

**Nur statisch (ohne Simulation):**

```bash
cd dielogic/site && python3 -m http.server 8000
```

Auch `file://`-Doppelklick funktioniert (Dashboard nutzt dann
`app/dist/app.js`; nach Änderungen unter `app/js/` einmal
`python3 app/build.py`). Ohne Backend zeigt die Simulationskarte einen
Hinweis — alle 19 Diagramme rechnen unabhängig davon im Browser.

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
  `backend/convert.py`; die Karte im Dashboard ist `site/app/js/ui/simcard.js`.

## Herkunft

- `site/app/` ist der Port von `../hpdc-dashboard` (dieser Ordner ist die
  gepflegte Fassung).
- Arbeitsteilung des Backends: das Frontend zeichnet, Python rechnet —
  die Simulation liefert `hpdcsim`.
