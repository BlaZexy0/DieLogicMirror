/* DieLogic – web/shared/schemes.js
   Farbschemata der Website. Ein Schema ist KEINE zweite Palette, sondern
   eine Liste von Abweichungen von shared/palette.js: nur was anders ist,
   steht hier. Alles Übrige bleibt der Standard — so bleibt die Palette die
   eine Quelle, und ein neuer Farbname wirkt sofort in jedem Schema.

   Was beim Umschalten passiert:
     1. die CSS-Tokens auf <html> (überschreiben :root aus shared.css),
     2. window.__PALETTE__ selbst (Canvas, SVG, three.js lesen es; mix
        und rgba dort rechnen dann schon mit den neuen Werten),
     3. window.__THEME__.derive(), falls geladen: die Diagrammfarben werden
        aus der Palette neu abgeleitet (shared/theme.js),
     4. <meta name="theme-color"> und das Attribut data-scheme auf <html>,
     5. ein Ereignis „dielogic:scheme" auf document — wer selbst zeichnet
        (nav.js, Diagramme, 3D-Studio), zeichnet darauf neu.

   Geladen wird die Datei auf JEDER Seite direkt NACH shared/palette.js und
   VOR nav.js: nav.js und projectbar.js lesen die Farben beim Laden einmal
   aus __PALETTE__, sie müssen bis dahin stimmen. Der Test
   tests/web/schemes.test.mjs prüft beides — die Reihenfolge auf jeder Seite
   und die Regeln jedes Schemas.

   Drei Stück: DieLogic Teal (der Standard, an erster Stelle), Stahlblau und
   Graphit. Ein Schema belegt ALLE Rollen der Palette, nicht nur die Marke:
   Flächen und Schrift, die Ampel (gut, knapp, schlecht), die Hervorhebung
   und die Sachfarben (Schmelze, Werkzeug, Maschine, Luft …). So passt jede
   Farbe auf der Seite, im Diagramm, im 3D-Studio und in den Bildern der
   Theorie zum gewählten Schema, und dieselbe Sache hat überall dieselbe
   Farbe. Nicht dazu gehören die Farbleisten (Heatmaps, Felder im
   3D-Studio): sie sind ein Maßstab und in jedem Schema gleich
   (palette.js, LEISTEN). Die Regeln, die der Test für jedes Schema
   nachrechnet:
     · Die Ampel ist lesbar (Text ≥ 4,5:1) und in sich unterscheidbar.
     · Keine Sachfarbe liegt nahe am Ampelverlauf: nichts, was kein Urteil
       ist, darf wie eines aussehen. Warme Töne (Gelb, Orange, Rot) und das
       Grün gehören darum der Ampel; die Sachfarben sind kühl.
     · Die Sachfarben liegen untereinander weit genug auseinander.
   Teal gehört dem Standard: in Stahlblau und Graphit trägt die Schmelze
   ein Stahlblau, die übrigen kühlen Sachfarben sind dafür verschoben
   (Rückmeldung vom 23.09.).
   Die Werte kommen aus einem Rechenskript (wenige Anker je Schema, der Rest
   abgeleitet), stehen hier aber ausgeschrieben: was gilt, sieht man hier.
   Am 22.09. gingen Blaupause, Aluminium und Messing in anderen auf, am
   23.09. fielen Hochkontrast, Rot-Grün-sicher, Abendschicht, Anlassfarbe,
   Kupfer und Oliv weg. Wer eines davon gewählt hatte, bekommt das nächste
   der drei (ALIAS).

   Gemerkt wird das Schema im localStorage, also je Browser und Gerät, nicht
   je Konto: es ist eine Einstellung der Ansicht, kein Projektinhalt.
   Klassisches Script (file:// und http), CommonJS-Export für Tests. */
(function (root) {
  'use strict';

  var KEY = 'dielogic-scheme-v1';
  var P = root.__PALETTE__;
  if (!P) return;                       /* ohne Palette kein Schema */

  /* Die Grundwerte, bevor irgendein Schema sie verstellt. */
  var BASE = {};
  for (var k in P.colors) BASE[k] = P.colors[k];

  /* ── Die Schemata ──────────────────────────────────────────
     `colors`: Rollen aus palette.js (auch `viewport`, die Fläche hinter dem
     Körper im 3D-Studio). `css`: Tokens, die keine Farbe der Palette sind
     (Ring, Schatten). Kontrastregeln wie bei der Palette:
     Text auf `surface` ≥ 4,5:1, Text auf `dark` ≥ 4,5:1 — der Test rechnet
     das für jedes Schema nach, nicht nur für den Standard. */
  var SCHEMES = [
    {
      id: 'teal',
      name: 'DieLogic Teal',
      note: 'Der Standard: Petrol und Teal auf kühlem Grau.',
      colors: {},
      css: {}
    },
    {
      id: 'stahl',
      name: 'Stahlblau',
      note: 'Kühl und technisch: Stahlblau statt Teal auf kühlgrauem Grund, wie eine technische Zeichnung.',
      colors: {
        viewport:      '#e4eaf1',
        dark:          '#0f2438',
        dark2:         '#1b3a55',
        dark3:         '#26496a',
        primary:       '#1f6fb2',
        primary2:      '#195a91',
        primaryDeep:   '#12456f',
        primaryLight:  '#6fb6e8',
        pale:          '#e6f0f8',
        paleBorder:    '#b5d1e8',
        accent:        '#8a9be0',
        bg:            '#f1f4f7',
        surface2:      '#f7f9fc',
        border:        '#c8d3de',
        borderLight:   '#e3e9ef',
        text:          '#0f2438',
        textBody:      '#27394b',
        muted:         '#4a6274',
        mutedLight:    '#94a6b6',
        ondark:        '#a4c3dc',
        ondark2:       '#88a9c6',
        /* Die Schmelze trägt hier das Stahlblau der Marke, wie im Standard
           das Teal; Anguss dunkler, Überlauf heller. Damit sie Platz hat,
           rückt das Werkzeug ins Ultramarin und das Vakuum ins Schiefer-
           indigo. */
        ok:            '#2a8f45',
        okText:        '#0c7d33',
        okBg:          '#ebf4ec',
        okBorder:      '#9bc7a0',
        caution:       '#dca300',
        cautionText:   '#8d6703',
        cautionBg:     '#fcf6eb',
        cautionBorder: '#eed29c',
        bad:           '#b3261e',
        badText:       '#b3261e',
        badBg:         '#faeae8',
        badBorder:     '#e1998e',
        mark:          '#b03c95',
        melt:          '#3383ad',
        runner:        '#37576b',
        overflow:      '#98b6c6',
        biscuit:       '#7d91a2',
        die:           '#3658ac',
        machine:       '#b769ef',
        air:           '#68a4d9',
        vacuum:        '#2c5a84',
        cool:          '#1e3a71',
        process:       '#5b3926',
        steel:         '#d8dee4',
        steelDark:     '#798b9a',
        piston:        '#374f61',
        part:          '#bcc6ce',
        axisX:         '#b769ef',
        axisY:         '#68a4d9',
        axisZ:         '#3658ac'
      },
      css: {}
    },
    {
      id: 'graphit',
      name: 'Graphit',
      note: 'Die Marke tritt zurück: neutrale Grautöne und ein warmer Akzent. Im 3D-Studio sprechen dann die Farben des Bauteils.',
      colors: {
        viewport:      '#e9ebec',
        dark:          '#202326',
        dark2:         '#2e3235',
        dark3:         '#3f4448',
        primary:       '#4d5760',
        primary2:      '#3e474f',
        primaryDeep:   '#2f373d',
        primaryLight:  '#9fb0bd',
        pale:          '#eceef0',
        paleBorder:    '#ccd2d6',
        accent:        '#b07d0a',
        bg:            '#f2f3f4',
        surface2:      '#f8f9f9',
        border:        '#ccd0d3',
        borderLight:   '#e6e8ea',
        text:          '#202326',
        textBody:      '#34383c',
        muted:         '#545b60',
        mutedLight:    '#9aa1a6',
        ondark:        '#b5bec4',
        ondark2:       '#a2abb2',
        /* Sachfarben gedämpft, das Bild bleibt ruhig. Die Schmelze ist ein
           kühles Stahlblau statt Teal, das Werkzeug rückt ins Indigo, das
           Vakuum wird ein neutrales Grau mit Mauve-Stich. */
        ok:            '#2f8a4d',
        okText:        '#1b7b3f',
        okBg:          '#ebf3ec',
        okBorder:      '#9bc4a4',
        caution:       '#d9a21c',
        cautionText:   '#8f6903',
        cautionBg:     '#fbf6ec',
        cautionBorder: '#edd19e',
        bad:           '#b0332a',
        badText:       '#b0332a',
        badBg:         '#faebe9',
        badBorder:     '#de9c92',
        mark:          '#a34e8d',
        melt:          '#357da1',
        runner:        '#39566c',
        overflow:      '#8fbee0',
        biscuit:       '#848b90',
        die:           '#4c52ab',
        machine:       '#c074ee',
        air:           '#6da0be',
        vacuum:        '#1c5e7b',
        cool:          '#2e3671',
        process:       '#6b4128',
        steel:         '#dadcde',
        steelDark:     '#80868a',
        piston:        '#44494e',
        part:          '#c0c3c5',
        axisX:         '#c074ee',
        axisY:         '#6da0be',
        axisZ:         '#4c52ab'
      },
      css: {}
    }
  ];

  var BY_ID = {};
  for (var i = 0; i < SCHEMES.length; i++) BY_ID[SCHEMES[i].id] = SCHEMES[i];
  var DEFAULT = SCHEMES[0].id;

  /* Zusammengelegte und entfallene Schemata: die gemerkte Wahl landet beim
     nächsten der drei. */
  var ALIAS = {
    kontrast: 'teal', sicht: 'teal', oliv: 'teal',
    anlass: 'stahl', blaupause: 'stahl',
    abend: 'graphit', kupfer: 'graphit', messing: 'graphit', aluminium: 'graphit'
  };

  /* ── Auflösen ─────────────────────────────────────────────── */
  function scheme(id) { return BY_ID[id] || BY_ID[ALIAS[id]] || BY_ID[DEFAULT]; }

  /* Alle Farben eines Schemas: Grundpalette plus seine Abweichungen.
     Für die Farbtupfer des Umschalters und für den Test. */
  function colors(id) {
    var s = scheme(id), out = {}, key;
    for (key in BASE) out[key] = BASE[key];
    for (key in s.colors) out[key] = s.colors[key];
    return out;
  }

  function kanaele(hex) {
    return parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16)
      + ',' + parseInt(hex.slice(5, 7), 16);
  }

  /* Welche Farben es auch als Kanäle gibt (shared.css, :root). */
  var KANAELE = { dark: '--dark-rgb', primary: '--primary-rgb', primaryLight: '--primary-light-rgb',
    surface: '--surface-rgb', bg: '--bg-rgb' };

  /* ── Anwenden ─────────────────────────────────────────────── */
  var applied = [];   /* gesetzte CSS-Tokens, damit sie beim Wechsel weichen */

  function apply(id) {
    var s = scheme(id), key;

    /* window.__PALETTE__ wird verändert, nicht ersetzt: nav.js und
       projectbar.js halten eine Referenz darauf. */
    for (key in BASE) {
      var v = Object.prototype.hasOwnProperty.call(s.colors, key) ? s.colors[key] : BASE[key];
      P.colors[key] = v;
      P[key] = v;
    }

    if (typeof document !== 'undefined' && document.documentElement) {
      var el = document.documentElement, j;
      for (j = 0; j < applied.length; j++) el.style.removeProperty(applied[j]);
      applied = [];
      for (key in s.colors) {
        var name = P.cssName(key);
        el.style.setProperty(name, s.colors[key]);
        applied.push(name);
        /* Tönungen, Ringe und Schatten stehen als rgba(var(--…-rgb), .25)
           im CSS — die Kanäle müssen mitwandern (shared.css, :root). */
        if (KANAELE[key]) {
          el.style.setProperty(KANAELE[key], kanaele(s.colors[key]));
          applied.push(KANAELE[key]);
        }
      }
      for (key in s.css) {
        el.style.setProperty(key, s.css[key]);
        applied.push(key);
      }
      el.setAttribute('data-scheme', s.id);

      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', P.dark);
    }

    /* Die Diagrammfarben leitet theme.js aus der Palette ab. */
    if (root.__THEME__ && typeof root.__THEME__.derive === 'function') root.__THEME__.derive();
    return s.id;
  }

  /* ── Merken ───────────────────────────────────────────────── */
  function stored() {
    try { return root.localStorage ? root.localStorage.getItem(KEY) : null; }
    catch (e) { return null; }          /* Speicher gesperrt (privates Fenster) */
  }

  var active = scheme(stored()).id;

  function current() { return active; }

  /* Die Fläche hinter dem Körper im 3D-Studio (Rolle `viewport`). */
  function viewport() { return P.viewport; }

  /* Wer eigene Styles ins Dokument gespritzt hat (nav.js, projectbar.js),
     baut sie hierauf neu — CSS-Variablen allein erreichen sie nicht. */
  function melden() {
    if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
    document.dispatchEvent(new CustomEvent('dielogic:scheme', { detail: { id: active } }));
  }

  function set(id) {
    active = scheme(id).id;
    try { if (root.localStorage) root.localStorage.setItem(KEY, active); } catch (e) { /* egal */ }
    apply(active);
    melden();
    return active;
  }

  /* Ein zweiter Tab hat umgeschaltet: hier mitziehen, ohne Neuladen. */
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('storage', function (ev) {
      if (ev.key !== KEY) return;
      var id = scheme(ev.newValue).id;    /* gelöscht oder unbekannt: Standard */
      if (id === active) return;
      active = id;
      apply(active);
      melden();
    });
  }

  apply(active);

  var api = {
    key: KEY,
    list: SCHEMES,
    alias: ALIAS,
    base: BASE,
    default: DEFAULT,
    colors: colors,
    current: current,
    viewport: viewport,
    set: set,
    apply: apply
  };
  root.__SCHEMES__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
