# DieLogic Dashboard

Gießtechnische Auslegung + Schusskurve für den Druckguss (HPDC) — das
Herz der DieLogic-Website. Reines Vanilla-JS mit ES-Modulen, kein
Build-Schritt. Arbeitet auf dem aktuellen Projekt (`/shared/project.js`)
und setzt ein Konto voraus (Projektleiste `/shared/projectbar.js`).

## Starten

Die Seiten laden die ES-Module direkt aus `js/` — kein Build-Schritt,
Quellcode-Änderungen wirken sofort. Es braucht nur einen Webserver:
das DieLogic-Backend (`uvicorn backend.app:app`, mit Konto und
Projektablage) oder lokal `python3 -m http.server 8000` im `web/`-Ordner.
Gerechnet wird in beiden Fällen vollständig im Browser. Direktes Öffnen per Doppelklick (file://) wird nicht mehr
unterstützt (Browser blockieren ES-Module über file://; der frühere
Python-Bundler `build.py` → `dist/app.js` wurde dafür entfernt).

Farben (`/shared/palette.js`), Diagrammfarben (`/shared/theme.js`) und die
Beispiel-Presets (`/shared/examples/*.js`) werden als klassische Skripte vor
den Modulen geladen; produktiv überlagern die Stammdaten der Organisation
(`/shared/orgpresets.js`) die Beispiel-Presets.

Formeln in den Mathe-Erklärungen sind TeX und werden über das lokal
eingebundene KaTeX gerendert (`/shared/vendor/katex`, Helfer `eq()`/`tex()` in
`js/charts/mathfmt.js`; ohne KaTeX bleibt die TeX-Quelle als `<code>` stehen).

## Seiten

- **`index.html`** — komplettes Dashboard: alle Eingaben, KPI-Zeile, alle Diagramme.
- **`chart.html?id=<diagramm-id>`** — Einzelseite pro Diagramm. Zeigt nur die
  Eingaben, die dieses Diagramm beeinflussen. Über das ↗-Symbol auf jeder
  Diagrammkarte bzw. das Auswahlmenü im Kopf erreichbar.
  Gültige IDs: `shotcurve`, `pq2`, `phild`, `area`, `machine`, `clamp`,
  `filltime`, `fill`, `vent`, `sleeve`, `gate`, `slowshot`, `pspec`, `window`,
  `ftwall`, `gvwall`, `ventreq`, `yield`, `gatesol`.

## Konfiguration (ohne Code-Änderung, ohne Build)

- **`/shared/examples/machines.js`** — Maschinen-Presets (`window.__MACHINES__`), Beispielwerte.
  Neuer Eintrag in der Liste = neue Maschine im Auswahlmenü. Die Feldnamen
  unter `fields` entsprechen den Eingabefeld-Keys (siehe `js/config/fields.js`).
- **`/shared/examples/alloys.js`** — Legierungs-Presets (`window.__ALLOYS__`): Dichte,
  Gieß-/Fließtemperatur, Z- und Erstarrungskonstante je Legierung; dazu die
  Thermik für die Wärmebilanz der Zyklusanalyse (Tliq, Tsol, hf, cp20, cpS, cpL —
  im Dashboard hinter „Erweiterte Optionen").
- **`/shared/examples/parts.js`** — Bauteiltyp-Presets (`window.__PARTS__`), z. B.
  Strukturgussteil: Wandstärken, Formtemperatur, zul. Erstarrung, NADCA-Faktor.

Alle drei Preset-Domänen funktionieren gleich (definiert in
`js/config/fields.js`, `PRESET_DOMAINS`): bei gewähltem Preset ist die
zugehörige Feldgruppe ausgeblendet und eine Zusammenfassung unter dem Select
zeigt die übernommenen Werte; Handänderung eines Preset-Felds springt zurück
auf „manuell". Eine neue Domäne = Eintrag in `PRESET_DOMAINS`, Feldgruppe mit
`preset: '<id>'`, config-Datei und Select in beiden HTML-Seiten.
- **`/shared/palette.js`** — alle Farben als Rollen (einzige Quelle, siehe
  ../../README): Ampel (gut, knapp, schlecht) nur für Urteile, `mark` für
  den Arbeitspunkt, Sachfarben für Dinge (Schmelze, Anguss, Werkzeug,
  Maschine, Luft, Vakuum …). Dazu die festen Farbleisten (`LEISTEN`), in
  jedem Schema gleich: `heat` für die Heatmaps.
- **`/shared/theme.js`** — Diagrammfarben (`window.__THEME__`), aus der
  Palette abgeleitet, keine eigenen Werte: `chart` (Rollen wie `ink`,
  `die`, `machine`, `feasible`, `target`, `mask`, `mark`, `ref`),
  `limits` (Farbe einer Grenze = ihre Familie: Maschine, Werkzeug, Prozess,
  Luft, Schmelze), `map`/`mapLines` fürs (φ, λ)-Fenster, `heatStops`
  (die feste Leiste `heat`, sieben Stützstellen aus Turbo) für die Heatmaps.
- **`/shared/schemes.js`** — das Farbschema. Beim Wechsel füllt
  `__THEME__.derive()` diese Objekte an Ort und Stelle neu und feuert
  `dielogic:scheme`; `main.js`/`single.js` zeichnen darauf Diagramme und
  Füllkammer neu (die Diagrammdaten tragen Rollennamen, `farbe()` in
  `core/theme.js` löst sie beim Zeichnen auf). Varianten derselben Größe
  unterscheiden Strichmuster (`dash`) und Deckkraft (`alpha`), nie
  Mischfarben: aus diesen Diagrammen entstehen die Theorie-Bilder.

Alle drei Dateien sind klassische `<script>`-Tags und laufen ohne Build.

## Funktionen pro Diagrammkarte

- **🎯 (Fadenkreuz-Button)** — hebt in der Seitenleiste genau die Eingabefelder
  hervor, die in dieses Diagramm eingehen, und scrollt dorthin. Erneut klicken
  hebt die Markierung auf.
- **↗** — öffnet das Diagramm als Einzelseite.
- **PNG-Button** — kopiert das Diagramm hochauflösend in die Zwischenablage
  (Fallback: Download).
- **CSV ⬇** (nur Schusskurve) — exportiert Kurven-Samples und Ereignisse.
- **Projektleiste (Kopfzeile)** — Projekt wechseln/anlegen/bearbeiten,
  Revision anlegen; Zurücksetzen, Export/Import, Verlauf auf der Konto-Seite.
- **Automatische Persistenz** — der Zustand ist der `design`-Abschnitt des
  aktuellen Projekts und wird laufend in die Datenbank synchronisiert.

## Zwei Dichten: flüssig in der Kammer, fest in der Kavität

Alle Massen (Bauteil, Anguss, Überlauf, Pressrest) sind gewogene Festmassen
— so liefert sie auch die Sprengflächenanalyse (ρ_s · V_STL). Daraus folgen
zwei Arten von Volumen (`core/physics.js`):

- **flüssig (`density`)** — die Dosierung in der Füllkammer: Füllgrad φ,
  „Kammer voll", die Schmelzesäule, das (φ, λ)-Fenster, v_krit.
- **fest (`rhoSolidus`)** — die Kavitäten sind Werkzeuggeometrie: das
  Werkzeug ist um das lineare Schwindmaß s größer als das kalte Bauteil,
  fasst also V = m·(1+s)³/ρ_s = m/ρ_sol. Damit rechnen die Ereignisse
  Anguss/Bauteil/Überlauf gefüllt, Füllzeit, NADCA-Vergleich, Entlüftung,
  PQ²-Füllzeit, die Kurvengeneratoren und die Auto-Flächen
  (`cavityVolume`, `cavityTravel`).
- **Nachverdichtungshub** `intensStroke` = Flüssigsäule − Kavität − Pressrest
  fest: der Weg vom Füllende bis zur Endlage, auf dem der Kolben den
  Erstarrungsschwund nachschiebt. Der **Pressrest** wird fest
  (`biscuitSolid`, Endlage) gegen das Minimum geprüft; `shot.biscLiquid`
  ist der Schmelzerest beim Füllende.

Ohne `densitySolid` (alte Projekte) fällt alles auf die Flüssigdichte
zurück — die Luftsimulation (`js/core/airsim/config.js`) folgt derselben
Konvention über dieselbe Funktion `rhoSolidus`, die Fixtures in
`fixtures/physics/` halten beide Rechenwege aneinander
(`feststoffdichte.json`).

## Architektur

```
/shared/           Daten, die man ohne Code-Kenntnis ändert (kein Build nötig) — seitenweit
  palette.js         UI-Farben          (window.__PALETTE__)
  theme.js           Diagrammfarben     (window.__THEME__)
  examples/          Beispiel-Presets   (window.__MACHINES__/__ALLOYS__/__PARTS__/__KOSTEN__)
css/main.css       Layout/Komponenten (Farb-Tokens aus /shared/shared.css)
js/
  config/fields.js   Eingabegruppen: Keys, Labels, Einheiten, Defaults, Grenzen
  core/              Logik ohne DOM
    format.js          Zahlformat (de-DE), seq()
    physics.js         HPDC-Mathematik: Profil, Schussmodell, v_krit, Prüfungen
    vkritTable.js      CFD-Tabelle der kritischen Geschwindigkeit (GENERIERT)
    curvegen.js        Schusskurven-Generatoren (Wegpunkte aus v₁/a₁/v₂/a₂)
    autofit.js         Auto-Schalter: ideale Anschnitt- und Entlüftungsfläche
    domain.js          die Eingabedomäne, angewandt (welche Werte überhaupt rechnen dürfen)
    limits.js          Grenzen (Ungleichungs-Restriktionen) als Daten
    state.js           zentraler Zustand + subscribe/notify
    theme.js           dieselben Objekte wie window.__THEME__ + farbe(Rolle)
    airsim/            Luftsimulation der Füllkammer (siehe unten)
    simstore.js        hält ihr Ergebnis; rechnet bei jeder Eingabe synchron neu
  render/            Canvas-Renderer (theme-gesteuert)
    base.js            Rahmen, Achsen, Marker, Farbskala (ramp), Konturen
    limits.js          zeichnet Grenzen: Schraffuren, Zielbänder, Legende
    line.js / heat.js / map.js / donut.js / draw.js / hover.js
  charts/            EIN Modul pro Diagramm
    registry.js        Liste aller Diagramme (Reihenfolge = Anordnung)
    shotcurve.js …     je: id, Titel, inputs-Liste, calc(v, {shot})
  ui/                DOM-Aufbau und Interaktion
    inputs.js          Sidebar, Validierung, Eingabe-Hervorhebung
    chamber.js         Füllkammer-Schema über den Kennwerten
    presets.js         Maschinen-Preset-Auswahl
    curveTable.js      Schusskurven-Editor
    kpis.js            Prüfpanels (Kennwerte, Prüfzeilen, Kolbenweg-Lineal, Prüfleiste)
    cards.js           Diagrammkarten (Tabs, Buttons, Zeichnen)
    export.js          PNG / CSV / JSON-Speichern+Laden
  main.js            Einstieg Dashboard (index.html)
  single.js          Einstieg Einzelseite (chart.html)
```

## Luftsimulation (`js/core/airsim/`)

Der Luftdruck in der Form über den Schuss: alles Gas — Kammerraum über der
Schmelze plus die ungefüllten Teile von Anguss, Bauteil und Überlauf — ist
EIN Volumen, das der Kolben verdichtet und das Vakuumventil absaugt. Die
Schusskurve zeichnet das Ergebnis auf der zweiten Achse (beim Tankmodell
dazu den Tankdruck), „Luftblase unter Nachdruck" liest den Restdruck beim
Füllende, das Kolbenweg-Lineal den Ventilschluss nach Offenzeit.

| Modul | Inhalt |
|---|---|
| `simulate.js` | Einstieg `simulateAir(values, curve)` → `{meta, samples, events, critical_crossing}`; wirft `SimError` mit einer Meldung für den Anwender |
| `config.js` | Dashboard-Werte → SI-Konfiguration: Prüfungen, Einheiten, Kappen der Kurve 1 µm vor dem Füllende |
| `process.js` | Zeitachse Dosieren → Beruhigen → Schuss; Hübe, Ereignisse, Füllzustand, kritischer Übergang |
| `motion.js` | Kolbenbewegung in SI (bewusst getrennt von `buildProfile` — Begründung im Kopf der Datei) |
| `models.js` | Druckmodelle: `sealed` · `ideal` (Sofort-Enddruck) · `conductance` (Drossel gegen Pumpe) · `tank` (Drossel gegen Tank, dessen Druck steigt) |
| `solver.js` | Integration der Luftmasse für die gedrosselten Modelle (4000 Schritte — Teil der Numerik) |
| `gas.js` | Massenstrom durch Blende und Kanal mit Wandreibung, Verblockung |
| `numeric.js` | linspace, interp, brentq mit der Semantik von numpy/scipy |

Die Simulation war bis September 2026 das Python-Paket `hpdcsim` auf dem
Server. Die Referenzfälle in `fixtures/airsim/` sind dessen Ergebnisse;
`tests/web/airsim.test.mjs` hält die Portierung auf 1e-8 daran fest. An zwei
Stellen hängt eine Entscheidung am letzten Bit (Ventilschluss am letzten
Rasterpunkt, Abbruch der Nullstellensuche) — deshalb bildet `numeric.js` die
Rechenreihenfolge von numpy und scipy nach, statt „das Naheliegende" zu tun.
Eine Rechnung kostet wenige Millisekunden und läuft synchron bei jeder
Eingabe: kein Ladezustand, kein veraltetes Ergebnis.

## Mathe-Erklärung auf Einzelseiten

Ein Diagrammmodul kann optional `mathHTML()` (statisches Gleichungs-Markup) und
`renderMath(el, v)` (füllt `data-m`-Platzhalter mit live berechneten Werten)
exportieren. `chart.html` zeigt diesen Abschnitt dann als Karte
„Mathematik & Herleitung" unter dem Diagramm — derzeit beim
(φ, λ)-Auslegungsfenster umgesetzt. Das Auslegungsfenster wird geometrisch
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
  Ausschlussseite ist prinzipiell unerreichbar und wird deckend gefüllt
  (`theme.chart.mask`), die Frontlinie durchgezogen gezeichnet;
  alle anderen Grenzen des Diagramms werden auf die erreichbare Seite
  geclippt (z. B. die Hüllkurve im PQ²).
- `q.feasible = 'Label'` — füllt die Schnittmenge der erlaubten Seiten
  aller harten Grenzen (`theme.chart.feasible`, wie das machbare Band
  im (φ, λ)-Fenster) und setzt einen Legendeneintrag. Optional teilt
  `q.feasibleSplit = { fn, label }` das Band an einer Kurve: oberhalb
  heller gefüllt (z. B. Maschinenlinie im PQ² — Fenster erfüllt, aber
  nicht mit dem aktuellen Kolben-Ø erreichbar).
- `q.limitText = 'legend'` — unterdrückt alle Grenzen-Texte im Diagramm
  (Flächen-Notizen und Linien-Labels); die Grenzen sind dann nur über die
  Legende benannt.

Linien- und Heatmap-Renderer zeichnen daraus Linien, Schraffuren und die
Legende (render/limits.js); der Heatmap-Hover meldet verletzte Grenzen am
Mauspunkt. Die Farbe kommt aus `theme.limits[id]` (/shared/theme.js): die
Familie, aus der die Grenze stammt (Maschine, Werkzeug, Prozess, Luft,
Schmelze), gleiche id = gleiche Farbe in jedem Diagramm. Glieder einer
Familie unterscheidet das Strichmuster (`limitDash` in render/limits.js)
und die Seite der Schraffur, die auch der Legendeneintrag zeigt. Für
machbare Bänder zwischen mehreren Kurvenschranken (wie im (φ, λ)-Fenster) liefert
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
(`vcrit` hängt an Sim-Zustand + Tab; das (φ, λ)-Band geht über
`feasibleBand()`). Noch nicht entschieden.

## Neues Diagramm hinzufügen

1. Datei in `js/charts/` anlegen (z. B. `mychart.js`), Default-Export mit
   `id`, `title`, `desc`, `inputs` (Feld-Keys für die Hervorhebung) und
   `calc(v, {shot})`, das eine Linien-/Heat-/Map-/Donut-Spezifikation liefert
   (siehe bestehende Module und `js/charts/helpers.js`); Grenzen als
   `q.limits` (siehe oben).
2. In `js/charts/registry.js` importieren und in die Liste aufnehmen.
   Dashboard-Karte und Einzelseite entstehen automatisch.
