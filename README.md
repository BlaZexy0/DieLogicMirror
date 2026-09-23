# DieLogic — Website + Backend

Die DieLogic-Website mit integriertem Dashboard und optionalem Backend:
Landingpage, das vollständige HPDC-Dashboard (clientseitig, ohne
Abhängigkeiten), die Werkzeuge Sprengflächenanalyse, Teilekosten und
Zyklusanalyse — alle auf einem gemeinsamen **Projekt** — sowie ein
FastAPI-Backend für Konten (auf Einladung) und die Projektablage mit
Revisionen. Gerechnet wird ausschließlich im Browser — der Server speichert
Projekte und liefert die Seiten aus.

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

Das **3D-Studio** steht daneben: es rechnet rein clientseitig auf einem
Bauteil (STL oder GLB) und braucht kein Projekt — deshalb trägt es keine
Projektleiste; ein Konto braucht es wie jedes andere Werkzeug. Die Anbindung wäre naheliegend (Maße aus
`design`, STL aus `geometry`, Entformschrägen zurück nach `geometry`), ist
aber noch nicht verdrahtet.

`web/shared/project.js` hält den Browser-Cache der Projekte und mit
`derived()` die Querbezüge; `projectbar.js` ist die Projektleiste auf jeder
Werkzeugseite (wechseln, anlegen, bearbeiten, Revision) und synchronisiert
mit dem Server. Alle Werkzeugseiten (`/tools/…`, auch das 3D-Studio) setzen
ein Konto voraus: das Backend liefert sie ohne Sitzung gar nicht erst aus,
sondern leitet auf die Konto-Seite um und danach zurück (`login_gate` in
`backend/app.py`). Läuft eine Sitzung auf der Seite ab, führt die Leiste
zurück zur Anmeldung.
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
│   │   ├── vendor/katex/    KaTeX (lokal, MIT) — rendert alle Formeln der Site; siehe README dort
│   │   ├── palette.js       DIE Farbquelle: Rollen statt Farben (window.__PALETTE__,
│   │   │                    mix/rgba; feste Farbleisten scale/lut; shared.css spiegelt die Rollen)
│   │   ├── schemes.js       drei Farbschemata: jedes belegt alle Rollen (Umschalter auf der
│   │   │                    Konto-Seite; lädt direkt nach palette.js, vor nav.js)
│   │   ├── theme.js         Diagrammfarben, aus der Palette abgeleitet (derive())
│   │   ├── svgfarben.js     setzt die Theorie-Bilder als SVG ein, damit sie dem Schema folgen
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
│   │   │                    (core/airsim/ = Luftsimulation der Füllkammer, simstore.js hält
│   │   │                    ihr Ergebnis für die Diagramme)
│   │   ├── sprengflaeche/   STL-Analyse: stl-math.js (Netz-Kennwerte, getestet),
│   │   │                    stl-logic.js (Massenbilanz/Maschinentabelle, getestet), stl-app.js
│   │   ├── teilekosten/     Teilekosten-Kalkulation (Abschnitt cost, verknüpfte Felder)
│   │   ├── 3d-studio/       acht 3D-Werkzeuge unter EINEM Nav-Reiter — Formaufbau (Schnittmodell
│   │   │                    der Druckgießform), Entformungsanalyse, Wandstärkenanalyse
│   │   │                    (Abstandsfeld), Abstandsanalyse, Füllabschätzung, Angussdesigner
│   │   │                    (js/runner/), Überlaufdesigner, Temperierkanal-Designer — und die
│   │   │                    Werkbank (js/werkbank/), die sie als sechs Schritte an einem Bauteil
│   │   │                    aneinanderreiht, mit der Auslegung als letztem Schritt.
│   │   │                    Bringt Three.js in vendor/ mit — die einzige
│   │   │                    Fremdbibliothek, die nur dieses Werkzeug braucht.
│   │   │                    Eigenes README dort; Modelle erzeugt scripts/3d-studio/.
│   │   └── zyklus/          Zyklusanalyse (Abschnitt cycle): Zeitleiste + Wärmebilanz je Zyklus
│   │                        (zyklus-logic.js, getestet gegen die Zahlenbeispiele der Quellen —
│   │                        docs/waermebilanz.md)
│   ├── konto/           Konto: Einladung einlösen, Anmelden, Projekte/Revisionen,
│   │                    Mitglieder, Einladungen, Stammdaten (Admin)
│   ├── theorie/         Theorie-Artikel (Formeln als TeX über KaTeX, statische SVGs aus assets/)
│   ├── recht/           Rechts-/Unternehmensseiten — Mustertexte mit [Platzhaltern]!
│   │                    kontakt, ueber-uns, impressum (§ 5 DDG), datenschutz (DSGVO),
│   │                    agb, widerruf (+ Musterformular)
│   ├── assets/          logo.svg, icon-*.png (aus logo.svg gerendert), site.webmanifest,
│   │                    team-mockup.svg, palette.svg (generiert), theorie/*.svg (generiert)
│   │                    icons/*.svg: Piktogramme der Startseite (Schritte, Werkzeuge) —
│   │                    per <use href="…svg#icon"> eingebunden, Farben var(--…, Fallback)
│   └── examples/        Beispiel-STLs für die Sprengflächenanalyse (auch von Tests genutzt)
├── backend/         FastAPI: /api/auth (Einladung, Sitzung), /api/org (Mitglieder,
│   │                Einladungen, Stammdaten), /api/projects (Revisionen)
│   │                + statische Auslieferung von web/ (Werkzeugseiten nur mit Sitzung)
│   ├── app.py  db.py  auth.py  projects.py  orgsettings.py  manage.py
│   ├── _domain.py   Eingabedomäne, GENERIERT aus fields.js (scripts/gen-domain-doc.mjs)
│   └── tests/       API-Tests (TestClient, SQLite)
├── fixtures/        Referenzdaten der Node-Tests
│   ├── physics/     von Hand hergeleitete Fälle: Auslegung UND Luftsimulation (README dort)
│   ├── airsim/      Referenzfälle der Luftsimulation aus dem früheren Python-Paket (README dort)
│   └── vkrit/       v_krit_sim.csv — OpenFOAM-CFD-Tabelle, Quelle der v_krit-Tabelle
├── docs/            eingabegrenzen.md (GENERIERT: jede Eingabe mit ihren Grenzen),
│   │                waermebilanz.md (Zyklusanalyse: Gleichungen, Abgleich mit den Quellen),
│   │                3d-studio-grundlagen.md (Koordinatenrahmen, Beispielteile, Dateiformate)
├── tests/web/       Node-Tests der Website (nicht ausgeliefert)
├── scripts/         Generatoren (nicht ausgeliefert): gen-theory-svgs, gen-vkrit-table,
│   │                gen-palette, gen-icon-sprite, gen-domain-doc und 3d-studio/ (die
│   │                glTF-Modelle des 3D-Studios); serve.py (statischer Server, npm run serve)
├── render.yaml      Render-Blueprint (Web Service: Build, Start, Healthcheck)
└── .venv/           lokale Python-Umgebung (nicht einchecken)
```

## Starten

**Mit Backend (Konten, Projekte, Stammdaten):**

```bash
cd dielogic
python3 -m venv .venv                       # einmalig
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn backend.app:app --reload
```

→ http://127.0.0.1:8000/ (Details: `backend/README.md`).

**Nur statisch (ohne Konto):**

```bash
npm run serve                               # oder: cd web && python3 -m http.server 8000
```

Das Dashboard lädt seine ES-Module direkt aus `tools/auslegung/js/` — kein
Build-Schritt, aber ein Webserver ist nötig (file://-Doppelklick wird
nicht unterstützt). Alle Diagramme rechnen im Browser, auch die
Luftdruck-Serie der Schusskurve; ohne Backend fehlen nur Anmeldung und
Projektablage, die Projekte bleiben dann im Browser.

## Tests

Kurz, über `package.json` (einmal `npm install` für ESLint und Playwright):

```bash
npm test          # Syntaxcheck + alle Node-Tests (wie unten)
npm run lint      # ESLint: no-undef, ungenutzte Variablen … (eslint.config.mjs)
npm run check     # beides
npm run browser   # Playwright: jede Seite des 3D-Studios im kopflosen Chromium
                  # (tests/browser/, startet selbst einen statischen Server auf 8130)
```

Der Linter fängt, was der Syntaxcheck nicht sieht — etwa den Aufruf einer
beim Umbau gelöschten Funktion, den die Node-Tests nie erreichen. Die
Browser-Tests prüfen, was nur der Browser weiß: WebGL, Zeigerereignisse,
Ereignisreihenfolge. Hinweis: `package.json` trägt absichtlich kein
`"type": "module"` — die klassischen Skripte unter `web/shared` und
`web/tools/*` werden in den Tests als CommonJS geladen.

Wie in CI (`.github/workflows/ci.yml`):

```bash
node tests/web/syntax-check.mjs                 # Syntax aller JS + Inline-Scripts
node --import ./tests/web/3d-studio/stubs/register.mjs \
     --test tests/web/*.test.mjs tests/web/3d-studio/*.test.mjs \
            tests/web/3d-studio/tools/*.test.mjs
                                                # Frontend, Physik-Fixtures, Luftsimulation gegen ihre
                                                # Referenzfälle, Grenzen, Render-Rauchtest
                                                # und das 3D-Studio (Geometrie, CSG, Formteilung,
                                                # Abstandsfeld, Angussdesigner, Verdrahtung aller Viewer)
node scripts/gen-theory-svgs.mjs                # statische SVGs der Theorie-Artikel neu erzeugen
                                                # (web/assets/theorie/ — nach Änderungen an Charts/Defaults)
node scripts/gen-vkrit-table.mjs                # v_krit-CFD-Tabelle aus
                                                # fixtures/vkrit/v_krit_sim.csv neu erzeugen
.venv/bin/python -m pytest backend/tests -q     # braucht zusätzlich httpx + pytest
```

Zwei Sätze Referenzdaten halten die Physik fest. Die Physik-Fixtures
(`fixtures/physics/`) sind von Hand hergeleitet und laufen gegen beide
Rechenwege des Dashboards — die Auslegung (`core/physics.js`) und die
Kinematik der Luftsimulation (`core/airsim/`). Die Referenzfälle
(`fixtures/airsim/`) sind die Ergebnisse des früheren Python-Pakets `hpdcsim`
und halten die Druckverläufe der Luftsimulation auf 1e-8 fest.

## Vor dem Livegang (Rechtsseiten)

Impressum, Datenschutzerklärung, AGB und Widerrufsbelehrung sind
**Mustertexte**: alle gelb markierten `[Platzhalter]` (Name, Anschrift,
Hoster, USt-IdNr., Zahlungsweg, Stand-Datum …) ausfüllen, die Texte an das
tatsächliche Geschäftsmodell anpassen und anwaltlich prüfen lassen — die
Vorlagen sind keine Rechtsberatung. Der gelbe Hinweiskasten oben auf jeder
Seite wird danach gelöscht. Die Preise auf der Landingpage
(`web/index.html#preise`) sind ebenfalls Beispielwerte. Die
Datenschutzerklärung sagt zu, dass der Server nichts berechnet: wer je wieder
eine Rechnung auf den Server legt, muss sie dort ergänzen.

## Anpassen

- **Navigation/Footer:** `web/shared/nav.js` — Linkliste (`NAV_LINKS`),
  Diagrammliste (`CHARTS`, Reihenfolge = `web/tools/auslegung/js/charts/registry.js`).
- **Farben:** Jede Farbe der Website ist eine ROLLE der Palette
  (`web/shared/palette.js`, einzige Quelle; `shared/shared.css` spiegelt sie
  als Tokens). Der Code nennt nur Rollen: ein Token (`var(--melt)`), einen
  Schlüssel von `window.__PALETTE__` (`P.melt`) oder eine Diagrammrolle
  (`theme.chart.die`, abgeleitet in `web/shared/theme.js`). Die Familien:
  · **Marke und Flächen** für die Bedienung (Knöpfe, Links, Auswahl, Fokus).
  · **Ampel** `ok` / `caution` / `bad` (gut, knapp, schlecht) nur für Urteile:
    Prüfungen, machbare Bereiche, Verstöße, Hinterschnitt, Fehler; je Stufe
    Signalfarbe, Text (`okText` …), Grund und Rand.
  · **Hervorhebung** `mark`: Arbeitspunkt, Ist-Wert, Kennpunkt.
  · **Sachfarben**: dieselbe Sache hat überall dieselbe Farbe, im Diagramm, im
    3D-Studio und in den Bildern der Theorie: Schmelze und was aus ihr wird
    (`melt`, `runner`, `overflow`, `biscuit`), Werkzeug (`die`), Maschine und
    Hydraulik (`machine`), Luft und Vakuum, Temperierung (`cool`), Prozess und
    Zeit (`process`), Stahl, Kolben, das Bauteil im 3D-Studio, die Achsen.
    Keine Sachfarbe liegt nahe am Ampelverlauf; Gelb, Orange, Rot und Grün
    gehören der Ampel, darum sind die Sachfarben kühl.
  In den Diagrammen ist jeder **Sperrbereich** (die Seite, die eine harte
  Grenze ausschließt) gleich gezeichnet: deckend, rot schraffiert
  (`theme.chart.zone` = Ampel „schlecht"); die Grenzlinie an der Kante trägt
  die Farbe ihrer Herkunft. Farben, die im selben Diagramm als Linien
  stehen (PQ²: Maschine, Werkzeug, Luft, Prozess; Schusskurve und
  Luftblase: Luft, Vakuum, Prozess, Schrift), liegen weit auseinander.
  Keine Rollen sind die **Farbleisten** (`LEISTEN` in palette.js,
  `P.scale(name, t)`, `P.lut`, `P.gradient`): die Skalen, an denen man einen
  Wert abliest. Sie sind in jedem Schema gleich: `heat` für die Heatmaps der
  Auslegung, `turbo` für die Felder im 3D-Studio (Wandstärke, Abstand,
  Füllgrad, Ankunft, Geschwindigkeit, Haftung), `draft` für die
  Entformschräge, `speed` für das Flussschema des Angussdesigners.
  Drei Schemata in `web/shared/schemes.js` belegen jede Rolle mit eigenen
  Werten: DieLogic Teal (Standard), Stahlblau und Graphit. Wer eines der
  früheren gewählt hatte (Hochkontrast, Rot-Grün-sicher, Abendschicht,
  Anlassfarbe, Kupfer, Oliv, davor Blaupause, Aluminium, Messing), landet
  über `ALIAS` beim nächsten der drei. Gewählt wird unter „Projekte & Konto",
  gemerkt im localStorage dieses Browsers. Ein Wechsel schreibt die Tokens,
  ändert `__PALETTE__` an Ort und Stelle, leitet die Diagrammfarben neu ab und
  meldet `dielogic:scheme`: wer selbst zeichnet (Diagramme, 3D-Studio,
  Zyklus, Sprengfläche, Hero), zeichnet darauf neu und liest die Werte frisch.
  Die Theorie-Bilder tragen zu jeder Farbe ihre Rolle als Klasse (`f-melt`,
  `s-steel-dark`) neben dem Standardwert; `web/shared/svgfarben.js` setzt sie
  als SVG in die Seite, dann greifen die Tokens. Die aus Diagrammen erzeugten
  Bilder schreibt `scripts/gen-theory-svgs.mjs` (rendert mit Platzhalterfarben
  und ordnet jede Farbe ihrer Rolle zu).
  Die Werte der Schemata kommen aus einem Rechenskript (wenige Anker je
  Schema, der Rest abgeleitet) und stehen ausgeschrieben in schemes.js.
  Geprüft wird das an drei Stellen: `tests/web/farbrollen.test.mjs` findet
  jeden Farbwert ohne Rolle, jeden alten Namen und jedes Theorie-Bild ohne
  Rollenklassen; `tests/web/schemes.test.mjs` rechnet für jedes Schema
  Kontrast, Trennung der Ampel und Abstand der Sachfarben zur Ampel und
  untereinander nach, dazu die Abstände der Linien, die im selben Diagramm
  stehen, und dass kein Schema eine Farbleiste verändert;
  `tests/web/render-smoke.test.mjs` prüft, dass jede Schraffur jedes
  Diagramms dieselbe Sperrbereichsfarbe trägt;
  `tests/web/palette.test.mjs` die Spiegelung in shared.css, die
  Rechenhilfen und die Farbleisten. Farbtafel des Standards:
  `web/assets/palette.svg` (`scripts/gen-palette.mjs`).
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
- **3D-Studio:** eigenes README unter `web/tools/3d-studio/`. Nach
  Änderungen an der Geometrie die Modelle neu erzeugen:
  `node scripts/3d-studio/build-glb.mjs` (Formmodell); die Beispielteile
  kommen fertig aus dem Schwesterprojekt openscad_parts.
  Der Angussdesigner braucht keine erzeugten Modelle — seine Beispiele
  entstehen im Code (`js/runner/presets.js`). Nach Änderungen an Kamera,
  Steuerwerk oder Sichtbarkeit einmal in einem echten Browser nachsehen:
  ohne WebGL zeichnen die Tests nichts, und ein leerer Viewport bei
  tadellosen Kennzahlen fällt sonst niemandem auf.
- **Luftsimulation:** `web/tools/auslegung/js/core/airsim/` — Einheiten-
  Übersetzung, Prüfungen und Vorgaben in `config.js`, die Modelle in
  `models.js`/`solver.js`. `core/simstore.js` rechnet sie bei jeder Eingabe
  synchron neu; die Schusskurve zeichnet den Luftdruck auf der zweiten Achse.
  Jede Änderung muss `tests/web/airsim.test.mjs` bestehen.

## Herkunft

- `web/tools/auslegung/` ist der Port des früheren eigenständigen `hpdc-dashboard`
  (dieser Ordner ist die gepflegte Fassung).
- Die Luftsimulation war bis September 2026 das Python-Paket `hpdcsim`
  hinter `POST /api/sim/shot`. `core/airsim/` ist dessen Portierung; Paket und
  Server-Anbindung liegen vollständig im Git-Verlauf (Tag `v1-final`), eine
  Kopie des Pakets außerhalb des Repositorys unter
  `~/DieLogic/backup/hpdcsim-2026-09-19/`.
