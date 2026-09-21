/* DieLogic – web/shared/schemes.js
   Farbschemata der Website. Ein Schema ist KEINE zweite Palette, sondern
   eine Liste von Abweichungen von shared/palette.js: nur was anders ist,
   steht hier. Alles Übrige bleibt der Standard — so bleibt die Palette die
   eine Quelle, und ein neuer Farbname wirkt sofort in jedem Schema.

   Was beim Umschalten passiert:
     1. die CSS-Tokens auf <html> (überschreiben :root aus shared.css),
     2. window.__PALETTE__ selbst (Canvas, SVG-Export, three.js lesen es),
     3. window.__THEME__.chart, falls schon geladen (Diagramm-Renderer),
     4. <meta name="theme-color"> und das Attribut data-scheme auf <html>,
     5. ein Ereignis „dielogic:scheme" auf document — shared/nav.js baut
        daraufhin seine eingespritzten Styles neu.

   Geladen wird die Datei auf JEDER Seite direkt NACH shared/palette.js und
   VOR nav.js: nav.js und projectbar.js lesen die Farben beim Laden einmal
   aus __PALETTE__, sie müssen bis dahin stimmen. Der Test
   tests/web/schemes.test.mjs prüft beides — die Reihenfolge auf jeder Seite
   und den Kontrast jedes Schemas.

   Zwölf Stück, in zwei Gruppen: `zweck` löst eine Aufgabe (Hochkontrast für
   die Halle, Rot-Grün-sicher, Abendschicht, Graphit fürs Studio), `farbe` ist
   nur eine andere Farbwelt. Der Standard steht an erster Stelle.

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
     `colors`: Namen aus palette.js. `css`: Tokens, die keine Farbe der
     Palette sind (Ring, Schatten). `viewport`: die Fläche hinter dem Körper
     im 3D-Studio — sie steht in keiner CSS-Datei, sondern in der Szene
     (js/scene.js). Kontrastregeln wie bei der Palette:
     Text auf `surface` ≥ 4,5:1, Text auf `dark` ≥ 4,5:1 — der Test rechnet
     das für jedes Schema nach, nicht nur für den Standard. */
  var SCHEMES = [
    {
      id: 'teal',
      group: 'zweck',
      name: 'DieLogic Teal',
      note: 'Der Standard: Petrol und Teal auf kühlem Grau.',
      colors: {},
      css: {}
    },
    {
      id: 'kontrast',
      group: 'zweck',
      name: 'Hochkontrast',
      note: 'Für helle Hallen und Beamer: kräftige Rahmen, dunklerer Text, keine zarten Tönungen.',
      viewport: '#dde5e7',
      colors: {
        dark:         '#001820',
        dark2:        '#002733',
        dark3:        '#083f4f',
        primary:      '#00665e',
        primary2:     '#004f49',
        primaryDeep:  '#003b36',
        primaryLight: '#62d6c9',
        pale:         '#d9efec',
        paleBorder:   '#7fbfb6',
        accent:       '#2e6fa8',
        bg:           '#eaf0f1',
        surface2:     '#f1f5f5',
        border:       '#7a8a8f',
        borderLight:  '#b9c4c7',
        text:         '#001218',
        textBody:     '#14232a',
        muted:        '#3c545c',
        mutedLight:   '#6b7f86',
        ondark:       '#cfe3e8',
        ondark2:      '#bcd6dd',
        ok:           '#0a6b33',
        okBorder:     '#0d8b43',
        okBg:         '#d3ead9',
        warn:         '#a8336b',
        warnSoft:     '#e4aac6',
        warnBg:       '#fbe9f1',
        warnText:     '#6f5700',
        warnBorder:   '#b98d05',
        gold:         '#b98d05',
        noteBg:       '#fff6d6',
        noteBorder:   '#c9a636',
        noteText:     '#55420a',
        bad:          '#9b1c12',
        badBg:        '#fde9e6',
        catPurple:    '#6b47c4',
        catGreen:     '#2f7d52',
        catSlate:     '#3e5f6e',
        catOrange:    '#b4541c'
      },
      /* Ring und Schatten folgen sonst den Kanälen (--primary-rgb,
         --dark-rgb) von allein; hier sollen sie kräftiger sein. */
      css: {
        '--ring': '0 0 0 3px rgba(var(--primary-rgb), .45)',
        '--shadow': '0 1px 2px rgba(var(--dark-rgb), .10), 0 8px 24px -8px rgba(var(--dark-rgb), .20)',
        '--shadow-lg': '0 2px 4px rgba(var(--dark-rgb), .12), 0 20px 48px -16px rgba(var(--dark-rgb), .32)'
      }
    },
    {
      id: 'sicht',
      group: 'zweck',
      name: 'Rot-Grün-sicher',
      note: 'Die Marke bleibt, die Prüffarben wechseln: „erfüllt" blaugrün, „verletzt" zinnoberrot (nach Okabe-Ito) — auch bei Rot-Grün-Sehschwäche unterscheidbar.',
      colors: {
        /* Nur die Farben, die etwas BEDEUTEN. Petrol und Teal bleiben, wie
           sie sind — wer dieses Schema wählt, will keine andere Marke,
           sondern eine Ampel, die er lesen kann. Beide Ampelfarben sind für
           Text auf Weiß nachgedunkelt: die Originalwerte der Reihe sind für
           Linien und Flächen gedacht, nicht für Schrift. */
        ok:           '#00785c',
        okBorder:     '#009e73',
        okBg:         '#dcf0ea',
        bad:          '#b04000',
        badBg:        '#fdece2',
        warn:         '#a34d84',
        warnSoft:     '#e8c3da',
        warnBg:       '#fbf1f7',
        warnText:     '#7a5c00',
        warnBorder:   '#e69f00',
        gold:         '#e69f00',
        accent:       '#56b4e9',
        catGreen:     '#00785c',
        catPurple:    '#8a5fa8',
        catOrange:    '#d55e00',
        catSlate:     '#4e6e8c'
      },
      css: {}
    },
    {
      id: 'abend',
      group: 'zweck',
      name: 'Abendschicht',
      note: 'Warmes Papier statt Weiß, wenig Blau: für die späte Schicht und dunkle Räume, in denen ein weißer Schirm blendet.',
      viewport: '#eae4d8',
      colors: {
        dark:         '#2b2823',
        dark2:        '#3b372f',
        dark3:        '#4e493f',
        primary:      '#4f7264',
        primary2:     '#3f5c50',
        primaryDeep:  '#324a40',
        primaryLight: '#9cc4b2',
        pale:         '#e6efe9',
        paleBorder:   '#c2d6c8',
        accent:       '#b5793a',
        bg:           '#f0eade',
        surface:      '#fdfaf5',
        surface2:     '#f7f2e9',
        border:       '#d6cdbd',
        borderLight:  '#e9e2d4',
        text:         '#2b2823',
        textBody:     '#443f36',
        muted:        '#655d50',
        mutedLight:   '#aca291',
        ondark:       '#cfc3ad',
        ondark2:      '#bdb098',
        catSlate:     '#66625a'
      },
      css: {}
    },
    {
      id: 'graphit',
      group: 'zweck',
      name: 'Graphit',
      note: 'Die Marke tritt zurück: neutrale Grautöne, ein einziger warmer Akzent — damit im 3D-Studio die Farben des Bauteils sprechen.',
      viewport: '#e9ebec',
      colors: {
        dark:         '#202326',
        dark2:        '#2e3235',
        dark3:        '#3f4448',
        primary:      '#4d5760',
        primary2:     '#3e474f',
        primaryDeep:  '#2f373d',
        primaryLight: '#9fb0bd',
        pale:         '#eceef0',
        paleBorder:   '#ccd2d6',
        accent:       '#b07d0a',
        bg:           '#f2f3f4',
        surface2:     '#f8f9f9',
        border:       '#ccd0d3',
        borderLight:  '#e6e8ea',
        text:         '#202326',
        textBody:     '#34383c',
        muted:        '#545b60',
        mutedLight:   '#9aa1a6',
        ondark:       '#b5bec4',
        ondark2:      '#a2abb2',
        catSlate:     '#5a646b'
      },
      css: {}
    },
    {
      id: 'stahl',
      group: 'farbe',
      name: 'Stahlblau',
      note: 'Kühl und technisch: Stahlblau statt Teal, der Grund bleibt kühlgrau.',
      viewport: '#e4eaf1',
      colors: {
        dark:         '#0f2438',
        dark2:        '#1b3a55',
        dark3:        '#26496a',
        primary:      '#1f6fb2',
        primary2:     '#195a91',
        primaryDeep:  '#12456f',
        primaryLight: '#6fb6e8',
        pale:         '#e6f0f8',
        paleBorder:   '#b5d1e8',
        accent:       '#8a9be0',
        bg:           '#f1f4f7',
        surface2:     '#f7f9fc',
        border:       '#c8d3de',
        borderLight:  '#e3e9ef',
        text:         '#0f2438',
        textBody:     '#27394b',
        muted:        '#4a6274',
        mutedLight:   '#94a6b6',
        ondark:       '#a4c3dc',
        ondark2:      '#88a9c6',
        catSlate:     '#4f7288'
      },
      css: {}
    },
    {
      id: 'blaupause',
      group: 'farbe',
      name: 'Blaupause',
      note: 'Preußischblau auf kühlem Papier, warmer Akzent dazu — die Seite liest sich wie eine technische Zeichnung.',
      viewport: '#e6eaf4',
      colors: {
        dark:         '#10203f',
        dark2:        '#1b3260',
        dark3:        '#29457c',
        primary:      '#1f5fc4',
        primary2:     '#184fa6',
        primaryDeep:  '#123d80',
        primaryLight: '#7fb0f5',
        pale:         '#e8eefb',
        paleBorder:   '#bdd0f0',
        accent:       '#c2892d',
        bg:           '#eef1f8',
        surface2:     '#f6f8fd',
        border:       '#c6cfe2',
        borderLight:  '#e2e7f2',
        text:         '#10203f',
        textBody:     '#26365a',
        muted:        '#4a5a7d',
        mutedLight:   '#94a0bb',
        ondark:       '#a8bde0',
        ondark2:      '#8fa6ce',
        catSlate:     '#556890'
      },
      css: {}
    },
    {
      id: 'anlass',
      group: 'farbe',
      name: 'Anlassfarbe',
      note: 'Das Violettblau angelassenen Werkzeugstahls: kühl und ruhig, ohne dass Blau die ganze Seite bestimmt.',
      viewport: '#eceaf2',
      colors: {
        dark:         '#251c3d',
        dark2:        '#342a55',
        dark3:        '#463a6d',
        primary:      '#5b46a8',
        primary2:     '#4a3990',
        primaryDeep:  '#3a2c73',
        primaryLight: '#a894e8',
        pale:         '#eeeaf9',
        paleBorder:   '#cfc4ec',
        accent:       '#3f9ab5',
        bg:           '#f2f1f7',
        surface2:     '#f8f7fc',
        border:       '#d0ccdd',
        borderLight:  '#e7e4ef',
        text:         '#251c3d',
        textBody:     '#3a3155',
        muted:        '#5b5376',
        mutedLight:   '#a49dba',
        ondark:       '#bdb2dd',
        ondark2:      '#a79ace',
        catSlate:     '#655e7e'
      },
      css: {}
    },
    {
      id: 'aluminium',
      group: 'farbe',
      name: 'Aluminium',
      note: 'Kühles Silber mit wenig Farbe im Grau — metallisch und zurückhaltend, wie die Legierung selbst.',
      viewport: '#e7ecef',
      colors: {
        dark:         '#1f2a30',
        dark2:        '#2c3a42',
        dark3:        '#3d4e57',
        primary:      '#476a80',
        primary2:     '#3a5668',
        primaryDeep:  '#2e4453',
        primaryLight: '#8fb6cc',
        pale:         '#e9eef1',
        paleBorder:   '#c2d2da',
        accent:       '#9a86c4',
        bg:           '#eff2f4',
        surface2:     '#f7f9fa',
        border:       '#c8d2d7',
        borderLight:  '#e4e9ec',
        text:         '#1f2a30',
        textBody:     '#33424a',
        muted:        '#53646e',
        mutedLight:   '#9dabb3',
        ondark:       '#b2c7d2',
        ondark2:      '#9db5c2',
        catSlate:     '#566c78'
      },
      css: {}
    },
    {
      id: 'messing',
      group: 'farbe',
      name: 'Messing',
      note: 'Gold statt Kupfer: warm, aber gelblich — dunkler Grund ins Braune, Akzent in kühlem Blau.',
      viewport: '#efeade',
      colors: {
        dark:         '#2b2412',
        dark2:        '#3d3419',
        dark3:        '#524726',
        primary:      '#856a12',
        primary2:     '#6e570e',
        primaryDeep:  '#574409',
        primaryLight: '#d9b95e',
        pale:         '#f6f0dd',
        paleBorder:   '#ddcb9c',
        accent:       '#4f7d94',
        bg:           '#f6f3ea',
        surface2:     '#faf8f2',
        border:       '#ddd5c0',
        borderLight:  '#ece7d8',
        text:         '#2b2412',
        textBody:     '#3f3823',
        muted:        '#655c42',
        mutedLight:   '#b2a98f',
        ondark:       '#d5c69a',
        ondark2:      '#c0b083',
        catSlate:     '#66634f'
      },
      css: {}
    },
    {
      id: 'kupfer',
      group: 'farbe',
      name: 'Kupfer',
      note: 'Warm wie die Gießerei: Kupfer auf Sand, das Dunkel geht ins Braune.',
      viewport: '#efe8df',
      colors: {
        dark:         '#2a1c13',
        dark2:        '#3c2a1d',
        dark3:        '#513b29',
        primary:      '#a25325',
        primary2:     '#8a4620',
        primaryDeep:  '#6d3718',
        primaryLight: '#e2a271',
        pale:         '#f7ebe1',
        paleBorder:   '#e0c3a8',
        accent:       '#5e8ea6',
        bg:           '#f7f4ef',
        surface2:     '#faf7f2',
        border:       '#ddd1c4',
        borderLight:  '#ece4d9',
        text:         '#2a1c13',
        textBody:     '#3f2f23',
        muted:        '#6b5748',
        mutedLight:   '#b3a495',
        ondark:       '#d9c0a6',
        ondark2:      '#c3a78b',
        catSlate:     '#6f6257'
      },
      css: {}
    },
    {
      id: 'oliv',
      group: 'farbe',
      name: 'Olivgrün',
      note: 'Grün, aber bewusst gelblicher als das Grün von „erfüllt" — damit Marke und Prüfergebnis nicht dasselbe sagen.',
      viewport: '#eaefe6',
      colors: {
        dark:         '#1e2a14',
        dark2:        '#2d3d1e',
        dark3:        '#3f522b',
        primary:      '#5f7d24',
        primary2:     '#4e681d',
        primaryDeep:  '#3e5317',
        primaryLight: '#a9c96e',
        pale:         '#eef3e4',
        paleBorder:   '#cbdcae',
        accent:       '#4a89a8',
        bg:           '#f1f4ec',
        surface2:     '#f7f9f3',
        border:       '#ccd5c0',
        borderLight:  '#e6ebdd',
        text:         '#1e2a14',
        textBody:     '#35422b',
        muted:        '#55634a',
        mutedLight:   '#a3ad95',
        ondark:       '#bccca6',
        ondark2:      '#a8ba8f',
        catSlate:     '#5d6e62'
      },
      css: {}
    }
  ];

  /* Zwei Sorten: die einen lösen eine Aufgabe (Halle, Sehschwäche, späte
     Schicht), die anderen sind schlicht eine andere Farbwelt. Der Umschalter
     stellt sie getrennt hin — bei zwölf Kacheln findet man sonst nichts. */
  var GROUPS = [
    { id: 'zweck', label: 'Für eine Aufgabe' },
    { id: 'farbe', label: 'Farbwelt' }
  ];

  var BY_ID = {};
  for (var i = 0; i < SCHEMES.length; i++) BY_ID[SCHEMES[i].id] = SCHEMES[i];
  var DEFAULT = SCHEMES[0].id;

  /* ── Auflösen ─────────────────────────────────────────────── */
  function scheme(id) { return BY_ID[id] || BY_ID[DEFAULT]; }

  /* Alle Farben eines Schemas: Grundpalette plus seine Abweichungen.
     Für die Farbtupfer des Umschalters und für den Test. */
  function colors(id) {
    var s = scheme(id), out = {}, key;
    for (key in BASE) out[key] = BASE[key];
    for (key in s.colors) out[key] = s.colors[key];
    return out;
  }

  /* Diagrammfarben aus der Palette ableiten: was die Renderer über
     window.__THEME__.chart lesen, folgt denselben Farben wie die Seite.
     Der Standard bleibt unangetastet — seine Werte stehen in theme.js und
     weichen an zwei Stellen (event, maskFill) um zwei Stufen ab; die sollen
     bleiben, wie sie sind. */
  function chartFor(id) {
    if (id === DEFAULT) return null;
    var c = colors(id);
    return {
      surface: c.surface, text: c.text, grid: c.borderLight, axis: c.border,
      series1: c.text, series2: c.primary, series3: c.accent, series4: c.warnBorder,
      marker: c.bad, crit: c.warn, event: c.mutedLight, iso: c.muted,
      areaFill: rgba(c.text, 0.07),
      band: rgba(c.primary, 0.30), bandLine: rgba(c.primary, 0.65),
      isoLine: rgba(c.muted, 0.6),
      maskFill: rgba(c.borderLight, 0.93),
      okFill: rgba(c.primary, 0.30)
    };
  }

  function kanaele(hex) {
    return parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16)
      + ',' + parseInt(hex.slice(5, 7), 16);
  }

  function rgba(hex, a) { return 'rgba(' + kanaele(hex) + ',' + a + ')'; }

  /* Welche Farben es auch als Kanäle gibt (shared.css, :root). */
  var KANAELE = { dark: '--dark-rgb', primary: '--primary-rgb', primaryLight: '--primary-light-rgb' };

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

    if (root.__THEME__) applyChart(root.__THEME__, s.id);
    return s.id;
  }

  /* Wird auch von shared/theme.js aufgerufen: die Datei lädt NACH dieser
     hier, ihr Objekt gibt es beim Umschalten also noch nicht. */
  function applyChart(theme, id) {
    var over = chartFor(id || current());
    if (!theme || !theme.chart || !over) return theme;
    for (var key in over) theme.chart[key] = over[key];
    return theme;
  }

  /* ── Merken ───────────────────────────────────────────────── */
  function stored() {
    try { return root.localStorage ? root.localStorage.getItem(KEY) : null; }
    catch (e) { return null; }          /* Speicher gesperrt (privates Fenster) */
  }

  var active = scheme(stored()).id;

  function current() { return active; }

  /* Die Fläche hinter dem Körper im 3D-Studio: js/scene.js fragt sie beim
     Aufbau ab. Ohne eigenen Wert (Standard) bleibt es beim Wert dort. */
  function viewport() { return scheme(active).viewport || null; }

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
    groups: GROUPS,
    base: BASE,
    default: DEFAULT,
    colors: colors,
    chartFor: chartFor,
    current: current,
    viewport: viewport,
    set: set,
    apply: apply,
    applyChart: applyChart
  };
  root.__SCHEMES__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
