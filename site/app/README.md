# DieLogic Dashboard

Gießtechnische Auslegung + Schusskurve für den Druckguss (HPDC),
vorbereitet für die Integration in eine Website. Reines Vanilla-JS mit
ES-Modulen — kein Build-Schritt, keine Abhängigkeiten.

## Starten

Zwei gleichwertige Wege — die Seiten wählen automatisch den passenden:

- **Doppelklick (file://):** `index.html` direkt öffnen. Dann läuft die
  gebündelte Fassung `dist/app.js`. Nach Änderungen an Dateien unter `js/`
  einmal `python3 build.py` ausführen, um das Bundle zu aktualisieren
  (kein Node/npm nötig — reines Python ohne Abhängigkeiten).
- **Webserver / Website:** Ordner in den Webspace legen oder lokal
  `python3 -m http.server 8000` starten. Über http laden die Seiten die
  ES-Module direkt aus `js/` — Quellcode-Änderungen wirken sofort, kein Build.

Die Konfiguration (`config/theme.js`, `config/machines.js`) wird in beiden
Modi als klassisches Skript geladen und ist ohne Build direkt editierbar.

## Seiten

- **`index.html`** — komplettes Dashboard: alle Eingaben, KPI-Zeile, alle Diagramme.
- **`chart.html?id=<diagramm-id>`** — Einzelseite pro Diagramm. Zeigt nur die
  Eingaben, die dieses Diagramm beeinflussen. Über das ↗-Symbol auf jeder
  Diagrammkarte bzw. das Auswahlmenü im Kopf erreichbar.
  Gültige IDs: `shotcurve`, `pq2`, `phild`, `area`, `machine`, `clamp`,
  `filltime`, `fill`, `vent`, `sleeve`, `gate`, `slowshot`, `pspec`, `window`,
  `ftwall`, `gvwall`, `ventreq`, `yield`, `gatesol`.

## Konfiguration (ohne Code-Änderung, ohne Build)

- **`config/machines.js`** — Maschinen-Presets (`window.__MACHINES__`).
  Neuer Eintrag in der Liste = neue Maschine im Auswahlmenü. Die Feldnamen
  unter `fields` entsprechen den Eingabefeld-Keys (siehe `js/config/fields.js`).
- **`config/theme.js`** — komplettes Farbschema (`window.__THEME__`):
  UI-Farben (werden als CSS-Variablen gesetzt), Diagrammfarben (Serien, Marker,
  Grenzlinien, Zielbänder), Farben/Linienfarben des (φ, L/D)-Fensters und die
  Heatmap-Farbrampe. Bei eigenen Farben auf Kontrast und unterscheidbare
  Helligkeit der Serienfarben achten (Farbfehlsichtigkeit).

Beide Dateien sind JSON-Daten in einer `window.__…`-Zuweisung — so sind sie
per `<script>`-Tag auch über `file://` ladbar (fetch von JSON wäre dort
blockiert).

## Funktionen pro Diagrammkarte

- **🎯 (Fadenkreuz-Button)** — hebt in der Seitenleiste genau die Eingabefelder
  hervor, die in dieses Diagramm eingehen, und scrollt dorthin. Erneut klicken
  hebt die Markierung auf.
- **↗** — öffnet das Diagramm als Einzelseite.
- **PNG-Button** — kopiert das Diagramm hochauflösend in die Zwischenablage
  (Fallback: Download).
- **CSV ⬇** (nur Schusskurve) — exportiert Kurven-Samples und Ereignisse.
- **↺ Zurücksetzen (Kopfzeile)** — alles zurück auf die Standardwerte.
  (Die früheren 💾-Speichern/📂-Laden-Buttons wurden entfernt; die
  JSON-Funktionen `saveStateJSON`/`loadStateJSON` liegen weiter in
  `js/ui/export.js` und können von einem künftigen Auslegungs-Manager
  wiederverwendet werden.)
- **Automatische Persistenz** — der Zustand wird in `localStorage` gespiegelt:
  Dashboard und Einzelseiten teilen dieselbe Auslegung, ein Reload verliert
  nichts.

## Architektur

```
config/            Daten, die man ohne Code-Kenntnis ändert (kein Build nötig)
  machines.js        Maschinen-Presets  (window.__MACHINES__)
  theme.js           Farbschema         (window.__THEME__)
build.py           Mini-Bundler (Python, ohne Abhängigkeiten) → dist/app.js
dist/app.js        gebündelte file://-Fassung (generiert, nicht editieren)
css/main.css       Layout/Komponenten (Farben via CSS-Variablen aus dem Theme)
js/
  config/fields.js   Eingabegruppen: Keys, Labels, Einheiten, Defaults
  core/              Logik ohne DOM
    format.js          Zahlformat (de-DE), seq()
    physics.js         HPDC-Mathematik: Profil, Schussmodell, v_krit, Prüfungen
    state.js           zentraler Zustand + subscribe/notify
    theme.js           übernimmt window.__THEME__, setzt CSS-Variablen
    machines.js        übernimmt window.__MACHINES__
  render/            Canvas-Renderer (theme-gesteuert)
    base.js            Rahmen, Achsen, Marker, Farbrampe, Konturen
    line.js / heat.js / map.js / donut.js / draw.js / hover.js
  charts/            EIN Modul pro Diagramm
    registry.js        Liste aller Diagramme (Reihenfolge = Anordnung)
    shotcurve.js …     je: id, Titel, inputs-Liste, calc(v, {shot})
  ui/                DOM-Aufbau und Interaktion
    inputs.js          Sidebar, Validierung, Eingabe-Hervorhebung
    presets.js         Maschinen-Preset-Auswahl
    curveTable.js      Schusskurven-Editor
    kpis.js            KPI-Kacheln
    cards.js           Diagrammkarten (Tabs, Buttons, Zeichnen)
    export.js          PNG / CSV / JSON-Speichern+Laden
  main.js            Einstieg Dashboard (index.html)
  single.js          Einstieg Einzelseite (chart.html)
```

## Mathe-Erklärung auf Einzelseiten

Ein Diagrammmodul kann optional `mathHTML()` (statisches Gleichungs-Markup) und
`renderMath(el, v)` (füllt `data-m`-Platzhalter mit live berechneten Werten)
exportieren. `chart.html` zeigt diesen Abschnitt dann als Karte
„Mathematik & Herleitung" unter dem Diagramm — derzeit beim
(φ, L/D)-Auslegungsfenster umgesetzt. Das Auslegungsfenster wird geometrisch
gezeichnet: das machbare Band ist ein analytisch berechnetes Polygon
(r_lo(φ) ≤ r ≤ r_hi(φ)), die Grenzen sind beschriftete Kurven, der Hover wertet
die Formeln exakt aus.

## Neues Diagramm hinzufügen

1. Datei in `js/charts/` anlegen (z. B. `mychart.js`), Default-Export mit
   `id`, `title`, `desc`, `inputs` (Feld-Keys für die Hervorhebung) und
   `calc(v, {shot})`, das eine Linien-/Heat-/Map-/Donut-Spezifikation liefert
   (siehe bestehende Module und `js/charts/helpers.js`).
2. In `js/charts/registry.js` importieren und in die Liste aufnehmen.
   Dashboard-Karte und Einzelseite entstehen automatisch.
