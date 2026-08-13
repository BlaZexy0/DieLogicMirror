# DieLogic Dashboard

Gießtechnische Auslegung + Schusskurve für den Druckguss (HPDC),
vorbereitet für die Integration in eine Website. Reines Vanilla-JS mit
ES-Modulen — kein Build-Schritt, keine Abhängigkeiten.

## Starten

Die Seiten laden die ES-Module direkt aus `js/` — kein Build-Schritt,
Quellcode-Änderungen wirken sofort. Es braucht nur einen Webserver:
das DieLogic-Backend (`uvicorn backend.app:app`, liefert zusätzlich die
Simulationskarte) oder lokal `python3 -m http.server 8000` im
`site/`-Ordner. Direktes Öffnen per Doppelklick (file://) wird nicht mehr
unterstützt (Browser blockieren ES-Module über file://; der frühere
Python-Bundler `build.py` → `dist/app.js` wurde dafür entfernt).

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

Beide Dateien sind JSON-Daten in einer `window.__…`-Zuweisung und werden als
klassische `<script>`-Tags geladen — ohne Build direkt editierbar.

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
    limits.js          zeichnet Grenzen: Schraffuren, Zielbänder, Legende
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

## Grenzen (Restriktionen) in Diagrammen

Fast jedes Diagramm hat Grenzen: Zielbänder, Maximal-/Minimalwerte, teils
von anderen Eingaben abhängige Kurven. Sie werden deklarativ beschrieben —
ein Objekt pro Restriktion in `q.limits = [ … ]` (Erzeuger in
`js/charts/helpers.js`, Objektmodell in `js/core/limits.js`):

- `limit(id, label, on, kind, bound, {note})` — harte Grenze. `bound` ist
  eine Zahl (konstante Schranke auf Achse `on: 'x'|'y'`) oder eine Funktion
  `x → y` (Kurvenschranke). `kind: 'min'|'max'` sagt, auf welcher Seite der
  zulässige Bereich liegt; `fn` darf `Infinity` liefern, wo die Grenze nicht
  gilt (z. B. v_krit nur bis „Kammer voll"). Gezeichnet als gestrichelte
  Linie/Kurve, die Ausschlussseite schraffiert, `note` steht in der Fläche.
- `target(id, label, on, min, max)` — Zielband (weiche Empfehlung), gefüllt
  statt schraffiert; bei `on:'y'` dürfen `min`/`max` Funktionen sein
  (Band zwischen Kurven, z. B. das v_a-Fenster im Prozessfenster).
- `refline(id, label, on, value)` — reine Referenzlinie ohne Fläche.
- Maske: `limit(…, fn, { mask: true })` (Kurvenschranke auf `y`) — die
  Ausschlussseite ist prinzipiell unerreichbar und wird deckend grau
  gefüllt (`theme.chart.maskFill`), die Frontlinie durchgezogen gezeichnet;
  alle anderen Grenzen des Diagramms werden auf die erreichbare Seite
  geclippt (z. B. die Hüllkurve im PQ²).
- `q.feasible = 'Label'` — füllt die Schnittmenge der erlaubten Seiten
  aller harten Grenzen grün (`theme.chart.okFill`, wie das machbare Band
  im (φ, L/D)-Fenster) und setzt einen Legendeneintrag. Optional teilt
  `q.feasibleSplit = { fn, label }` das Band an einer Kurve: oberhalb
  heller gefüllt (z. B. Maschinenlinie im PQ² — Fenster erfüllt, aber
  nicht mit dem aktuellen Kolben-Ø erreichbar).
- `q.limitText = 'legend'` — unterdrückt alle Grenzen-Texte im Diagramm
  (Flächen-Notizen und Linien-Labels); die Grenzen sind dann nur über die
  Legende benannt.

Linien- und Heatmap-Renderer zeichnen daraus Linien, Schraffuren und die
Legende (render/limits.js); der Heatmap-Hover meldet verletzte Grenzen am
Mauspunkt. Die Farbe kommt aus `theme.limits[id]` (config/theme.js) —
gleiche id = gleiche Farbe in jedem Diagramm. Für machbare Bänder zwischen
mehreren Kurvenschranken (wie im (φ, L/D)-Fenster) liefert
`feasibleBand()` aus `js/core/limits.js` die Polygone samt bindender
Grenze je Stützstelle. Eine neue Restriktion ist damit ein weiterer
Eintrag im Array — Zeichnung, Legende und Hover kommen automatisch.

**Offene Frage — zentraler Grenzen-Katalog?** Derzeit definiert jedes
Diagramm seine Grenzen selbst (eine Zeile pro Grenze in `calc()`). Dieselbe
physikalische Grenze taucht dadurch mehrfach in verschiedener Geometrie auf
(z. B. `vmax`: Horizontale in der Schusskurve, Kurve D(t) in der Füllzeit;
`gateMin`/`gateMax`: Band, Hyperbeln, x-Grenzen im PQ²). Alternative: ein
Katalog `config/limits.js`, gruppiert nach Grenzen-id mit einer Projektions-
Variante pro Diagramm — Label/Note/Farbe einmal, Diagramme rufen nur noch
`limitsFor(chartId, v, ctx)`. Neue Grenze = ein Varianten-Block in einer
Datei, kein Diagramm-Code. Kosten: Projektionen brauchen diagramm-lokale
Zwischenwerte per `ctx` (Kopplung), und die geometrische Herleitung steht
dann nicht mehr im Diagramm-Modul. Ausnahmen blieben ohnehin lokal
(`vcrit` hängt an Sim-Zustand + Tab; das (φ, L/D)-Band geht über
`feasibleBand()`). Noch nicht entschieden.

## Neues Diagramm hinzufügen

1. Datei in `js/charts/` anlegen (z. B. `mychart.js`), Default-Export mit
   `id`, `title`, `desc`, `inputs` (Feld-Keys für die Hervorhebung) und
   `calc(v, {shot})`, das eine Linien-/Heat-/Map-/Donut-Spezifikation liefert
   (siehe bestehende Module und `js/charts/helpers.js`); Grenzen als
   `q.limits` (siehe oben).
2. In `js/charts/registry.js` importieren und in die Liste aufnehmen.
   Dashboard-Karte und Einzelseite entstehen automatisch.
