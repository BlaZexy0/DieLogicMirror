/* DieLogic – web/shared/palette.js
   DIE Farbquelle der Website. Jede Farbe hat genau einen Namen; die
   CSS-Tokens in shared/shared.css (:root) und tools/auslegung/css/main.css (:root) sowie der
   ui-Block in shared/theme.js sind Spiegel derselben Werte — der Test
   tests/web/palette.test.mjs prüft, dass nichts auseinanderläuft.
   JS-Konsumenten (Zyklus-Zeitleiste, Kosten-SVGs, STL-Farben) lesen
   window.__PALETTE__, weil exportierte SVG/PNG keine CSS-Variablen kennen.

   Kontrast (WCAG): Textfarben auf Weiß ≥ 4.5:1 — dark, dark2, dark3,
   primary (4.1:1, nur fett/groß), primary2, primaryDeep, textBody, muted,
   warn, warnText, ok, bad, catSlate, noteText. NICHT als Text auf
   Weiß: primaryLight, accent, gold, warnBorder, mutedLight, catPurple,
   catOrange — nur als Fläche, Linie oder Text auf dunklem Grund.
   Klassisches Script (file:// und http), CommonJS-Export für Tests/Tools. */
(function (root) {
  'use strict';

  var colors = {
    /* Marke */
    dark:         '#002733',   // Petrol — Kopf, Hero, Fließtext
    dark2:        '#0a3945',   // Petrol, Verlauf/Dropdowns
    dark3:        '#1b4a57',   // Petrol, Karten auf dunkel, Zyklus „geschlossen"
    primary:      '#008c82',   // DieLogic Teal — Buttons, Links, Serien
    primary2:     '#00726a',   // Teal hover
    primaryDeep:  '#00534d',   // Teal dunkel — Verlaufsende Kopfzeile/Hero
    primaryLight: '#3fc2b6',   // Teal hell — Akzent auf dunklem Grund, Flächen
    pale:         '#e5f3f2',   // Teal-Tint — Flächen, bevorzugte Zeilen
    paleBorder:   '#b8ddd2',   // Rahmen auf Teal-Tint
    accent:       '#8cbee6',   // Hellblau — Serie 3, Flächen
    /* Status */
    ok:           '#0d7a3c',   // erfüllt
    okBorder:     '#12a150',
    okBg:         '#dcefe3',
    warn:         '#c2447e',   // Magenta — Grenzen, Warnung, Löschen
    warnSoft:     '#eec3d4',   // Rahmen auf Magenta-Tint
    warnBg:       '#fdf2f6',   // Magenta-Tint
    warnText:     '#8a6d00',   // Amber als Text (knapp) — 4.9:1 auf Weiß
    warnBorder:   '#e0a400',   // Amber-Rahmen, Serie 4 (nicht als Text)
    gold:         '#d4a908',   // Gold — Kategorie/Sprühen/Energie (nicht als Text)
    noteBg:       '#fff8e1',   // Hinweisbox
    noteBorder:   '#e6c34a',
    noteText:     '#6b5307',
    bad:          '#b42318',   // verletzt
    badBg:        '#fff2f0',
    /* Flächen & Linien */
    bg:           '#f3f6f6',   // Seitenhintergrund
    surface:      '#ffffff',   // Karten
    surface2:     '#f8fafa',   // Zebra, Fußzeilen, Eingabefelder
    border:       '#ccd4d6',   // Rahmen, Achsen
    borderLight:  '#e5e9eb',   // Trennlinien, Diagrammgitter
    /* Text */
    text:         '#002733',   // = dark
    textBody:     '#2a3f4a',   // Fließtext in Prosa-Blöcken
    muted:        '#4c6870',   // Nebentext, Achsbeschriftung — 6.0:1 auf Weiß
    mutedLight:   '#9aacb4',   // nur Flächen/Linien (Nebenzeiten-Balken)
    ondark:       '#8fb8c4',   // Text auf dunklem Grund — 7.3:1
    ondark2:      '#7a9aa6',   // Fußzeilen-Links auf dunkel — 4.6:1
    /* Kategorien: Werkzeuge (Landingpage), Zyklus-Spuren, STL-Rollen */
    catPurple:    '#9a77e8',   // Kernzüge / Zyklusanalyse
    catGreen:     '#4c9f70',   // Kühlung / Teilekosten (Fläche, nicht als Text)
    catSlate:     '#557786',   // Form öffnen/schließen, Nebentext auf Landing — 4.5:1
    catOrange:    '#e07b39'    // STL: Datei ohne Rolle
  };

  /* Zuordnung Name → CSS-Variable (kebab-case) */
  function cssName(key) { return '--' + key.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }

  var api = { colors: colors, cssName: cssName };
  for (var k in colors) api[k] = colors[k];
  root.__PALETTE__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
