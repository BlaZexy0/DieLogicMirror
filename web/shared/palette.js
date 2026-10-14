/* DieLogic – web/shared/palette.js
   DIE Farbquelle der Website. Jede Farbe hat genau einen Namen, und jeder
   Name ist eine ROLLE: er sagt, wofür die Farbe steht, nicht wie sie
   aussieht. Ein Farbschema (shared/schemes.js) belegt dieselben Rollen mit
   anderen Werten; der Code nennt nur Rollen. Die CSS-Tokens in
   shared/shared.css (:root) spiegeln die Werte, der Test
   tests/web/palette.test.mjs prüft, dass nichts auseinanderläuft.

   Die Familien:
     Marke        dark … accent: Kopfzeilen, Knöpfe, Links, Auswahl, Fokus.
                  Bedienung, keine Daten.
     Flächen      bg, surface …, Rahmen und Schrift.
     Ampel        ok / caution / bad: gut, knapp, schlecht. NUR für Urteile
                  (Prüfungen, machbare Bereiche, Verstöße, Hinterschnitt …).
                  Je Stufe die Signalfarbe (Linie, Fläche, Punkt), Text,
                  Grund und Rand.
     Hervorhebung mark: der Arbeitspunkt, der Ist-Wert, ein Kennpunkt.
                  markLime (Limette) und markCool (Himmelblau): die
                  weiteren Punktarten der 3D-Designer neben mark, in jedem
                  Schema gleich und weit weg voneinander, von der Schmelze
                  und dem Anguss, vom Werkzeug-Blau und von der Ampel
                  (Verzweigung und Waschbrett Limette, Spiegelpunkt
                  Himmelblau). Bis 24.09. war die dritte Koralle; auf dem
                  orangen Anguss verschwand sie.
     Licht        lamp: die leuchtende Glühbirne eines Sichtbarkeits-
                  Schalters (Formaufbau). Warm und in jedem Schema gleich:
                  „an" soll nach Licht aussehen, auch wo die Marke grau ist.
     Formhälften  halfMov (Rose) und halfFix (Gelb): die bewegliche und die
                  feste Seite der Form in der Entformung, in jedem Schema
                  gleich. Weit weg voneinander, auch bei Rot-Grün-Schwäche,
                  von den Richtungen der Schieber (Achsenfarben) und vom
                  Hinterschnitt (bad).
     Sachfarben   Dinge, die überall dieselbe Farbe haben: die Schmelze und
                  was aus ihr wird (Anguss, Überlauf, Pressrest), Werkzeug,
                  Maschine, Luft und Vakuum, Temperierung, Prozess (Zeit),
                  Stahl, Kolben, das Bauteil im 3D-Studio, die Achsen.
                  Sie liegen weit weg vom Ampelverlauf: keine Sachfarbe darf
                  wie ein Urteil aussehen. Die Ausnahme ist die Schmelze: sie
                  ist Orange (Wunsch vom 24.09., heißes Metall), und Orange
                  liegt zwischen „knapp" und „schlecht". Sie hält dafür zu
                  beiden Stufen selbst Abstand (ΔE ≥ 14), der Anguss als
                  Kupferbraun und der Überlauf als Apricot ebenso.
   Dazu die Farbleisten (unten, LEISTEN): die Skalen, an denen man einen
   Wert abliest. Sie sind KEINE Rollen und in jedem Schema gleich.

   Kontrast (WCAG): Text auf surface ≥ 4,5:1 — dark, dark2, dark3, primary2,
   primaryDeep, text, textBody, muted, okText, cautionText, badText, mark.
   primary 4,1:1 nur fett/groß. Signal- und Sachfarben sind Linien und
   Flächen, keine Schrift. Die Tests rechnen das für jedes Schema nach.
   Klassisches Script (file:// und http), CommonJS-Export für Tests/Tools. */
(function (root) {
  'use strict';

  var colors = {
    /* Marke */
    dark:          '#002733',   // Petrol — Kopf, Hero, Fließtext
    dark2:         '#0a3945',   // Petrol, Verlauf/Dropdowns
    dark3:         '#1b4a57',   // Petrol, Karten auf dunkel
    primary:       '#008c82',   // DieLogic Teal — Knöpfe, Links, Auswahl
    primary2:      '#00726a',   // Teal hover
    primaryDeep:   '#00534d',   // Teal dunkel — Verlaufsende Kopfzeile/Hero
    primaryLight:  '#3fc2b6',   // Teal hell — Akzent auf dunklem Grund, Arbeitsebene
    pale:          '#e5f3f2',   // Teal-Tint — Flächen, bevorzugte Zeilen
    paleBorder:    '#b8ddd2',   // Rahmen auf Teal-Tint
    accent:        '#8cbee6',   // Hellblau — zweite Akzentfarbe der Bedienung
    /* Flächen & Linien */
    bg:            '#f3f6f6',   // Seitenhintergrund
    surface:       '#ffffff',   // Karten
    surface2:      '#f8fafa',   // Zebra, Fußzeilen, Eingabefelder
    border:        '#ccd4d6',   // Rahmen, Achsen
    borderLight:   '#e5e9eb',   // Trennlinien, Diagrammgitter
    viewport:      '#e8eef0',   // Fläche hinter dem Körper im 3D-Studio
    /* Text */
    text:          '#002733',   // = dark
    textBody:      '#2a3f4a',   // Fließtext in Prosa-Blöcken
    muted:         '#4c6870',   // Nebentext, Achsbeschriftung, Referenzen — 6,0:1
    mutedLight:    '#9aacb4',   // nur Flächen/Linien (Ereignislinien, Nebenzeiten)
    ondark:        '#8fb8c4',   // Text auf dunklem Grund — 7,3:1
    ondark2:       '#7a9aa6',   // Fußzeilen-Links auf dunkel — 4,6:1
    /* Ampel: gut, knapp, schlecht */
    ok:            '#159a4c',   // gut: Linie, Fläche, Punkt, Balken
    okText:        '#0d7a3c',   // „erfüllt" als Text
    okBg:          '#dcefe3',
    okBorder:      '#99cda4',
    caution:       '#e0a400',   // knapp: Linie, Fläche, Punkt, Balken (nicht als Text)
    cautionText:   '#8a6d00',   // „knapp" als Text — 4,9:1
    cautionBg:     '#fff8e1',   // auch Hinweis- und Warnkästen
    cautionBorder: '#e6c34a',
    bad:           '#b42318',   // schlecht: verletzt, Fehler, Hinterschnitt, Löschen
    badText:       '#b42318',
    badBg:         '#fff2f0',
    badBorder:     '#e2988c',
    /* Hervorhebung */
    mark:          '#b23797',   // Arbeitspunkt, Ist-Wert, Kennpunkt (Schwerpunkt, Zykluszeit)
    markLime:      '#9fd83a',   // Punktart Limette: Verzweigung, Waschbrett
    markCool:      '#19bdfc',   // Punktart kühl: Spiegelpunkt
    /* Licht */
    lamp:          '#f2b200',   // leuchtende Glühbirne (Sichtbarkeit an)
    /* Formhälften */
    halfMov:       '#e66685',   // bewegliche Seite der Form (Entformung)
    halfFix:       '#fbde4e',   // feste Seite der Form (Entformung)
    /* Sachfarben */
    melt:          '#e85f08',   // Schmelze und Gussteil: Orange, in jedem Schema
    runner:        '#9f6403',   // Anguss (Schmelze, dunkel: Kupferbraun)
    overflow:      '#f6b48f',   // Überlauf (Schmelze, hell: Apricot)
    biscuit:       '#82979f',   // Pressrest (grau: der Rest in der Kammer)
    die:           '#2e65a0',   // Werkzeug: Werkzeuglinie, Anschnitt, Formhälften
    machine:       '#ac6eef',   // Maschine: Maschinenlinie, Maschinengrenzen
    air:           '#68a7cc',   // Luft: Luftdruck, Entlüftung
    vacuum:        '#296485',   // Vakuum: Tankdruck, Vakuumweg
    cool:          '#1e3a71',   // Temperierung: Kühlstich, Kanal, Kreise
    process:       '#5c3824',   // Prozess und Zeit: Füllzeit, v_krit, Nachdruck
    steel:         '#dae1e2',   // Stahl als Fläche (Kammer, Form)
    steelDark:     '#7b9096',   // Stahl als Kante, Schnitt, Schraffur
    piston:        '#36545d',   // Kolben und Kolbenstange
    part:          '#bec9cc',   // das Bauteil im 3D-Studio (neutral, trägt die Analysefarben)
    axisX:         '#ac6eef',   // Achse X (= Maschine)
    axisY:         '#68a7cc',   // Achse Y (= Luft)
    axisZ:         '#2e65a0'    // Achse Z, die Formöffnung (= Werkzeug)
  };

  /* Zuordnung Name → CSS-Variable (kebab-case) */
  function cssName(key) { return '--' + key.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }

  var api = { colors: colors, cssName: cssName };
  for (var k in colors) api[k] = colors[k];

  /* ── Rechnen mit Farben ──────────────────────────────────────
     Tönungen entstehen hier, nicht in den Werkzeugen: so folgen sie dem
     Schema von selbst (die Schlüssel oben ändert schemes.js an Ort und
     Stelle), und jedes Werkzeug mischt gleich. Gemischt wird im
     OK-Lab-Raum: dort liegen gleiche Schritte auch gleich weit
     auseinander, und keine Mischung wird in der Mitte grau. */
  function hexRgb(h) {
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  }
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function gam(x) { return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055; }
  function oklab(h) {
    var c = hexRgb(h).map(lin);
    var l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
    var m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
    var s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function rgbAus(lab) {
    var l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3);
    var m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3);
    var s = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2], 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(gam);
  }
  function hex(rgb) {
    return '#' + rgb.map(function (v) {
      var n = Math.round(Math.min(1, Math.max(0, v)) * 255);
      return (n < 16 ? '0' : '') + n.toString(16);
    }).join('');
  }
  /* Farbe als Hex: ein Schlüssel der Palette oder schon ein Hexwert. */
  function wert(x) { return typeof x === 'string' && x.charAt(0) === '#' ? x : api[x]; }

  /** Zwischen zwei Farben mischen, t = 0 … 1 (OK-Lab). a, b: Schlüssel oder Hex. */
  function mix(a, b, t) {
    var p = oklab(wert(a)), q = oklab(wert(b));
    t = Math.max(0, Math.min(1, t));
    return hex(rgbAus([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]));
  }

  /** [r,g,b] 0…255 (ganzzahlig) — aus einem Schlüssel oder Hexwert. */
  function rgb255(x) {
    var c = hexRgb(wert(x));
    return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
  }

  /** Mit Deckkraft als rgba(r,g,b,a) — aus einem Schlüssel oder Hexwert. */
  function rgba(x, a) {
    var c = rgb255(x);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  /* ── Kontrast (WCAG) ──────────────────────────────────────────
     Eigene, flachere Kennlinie als lin() oben: der WCAG-2.x-Standard
     rechnet mit der Schwelle 0,03928 (ein historischer Rundungswert),
     lin() mit der genaueren 0,04045 der eigentlichen sRGB-Kennlinie, die
     für die Mischung im OK-Lab-Raum richtig ist. Zwei Zwecke, zwei
     Konstanten — nicht zusammenlegen. */
  function luminance(x) {
    var c = hexRgb(wert(x)).map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  /** Kontrastverhältnis nach WCAG 2.x, immer ≥ 1. a, b: Schlüssel oder Hex. */
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** Abstand im OK-Lab-Raum ×100 (ΔE_ok): gleich große Zahlen sehen gleich
      verschieden aus. a, b: Hexwerte (wie oklab()). */
  function deltaE(a, b) {
    var p = oklab(a), q = oklab(b);
    return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }

  /* ── Farbleisten ─────────────────────────────────────────────
     Die stufenlosen Skalen, an denen man einen Wert abliest: die Heatmaps
     der Auslegung, die Felder im 3D-Studio, das Flussschema des
     Angussdesigners, die Entformschräge. Eine Farbleiste ist ein Maßstab,
     sie sieht darum in jedem Schema gleich aus: keine Rolle, kein Schema
     erreicht sie (Wunsch vom 23.09.: keine eigene Gestaltung je Schema,
     zurück zu den Leisten von vorher). Sie stehen nur hier; das 3D-Studio
     hat für die Tests unter Node eine Abschrift (js/part/colors.js), der
     Test farbrollen hält sie gleich.
       heat    Jeder Messwert: die Heatmaps der Auslegung, die Felder im
               3D-Studio (Wandstärke, Abstand, Füllgrad, Ankunft,
               Geschwindigkeit, Haftung) und das Flussschema des
               Angussdesigners. Sieben Stützstellen aus Turbo (Google,
               2019): Dunkelviolett über Blau, Grün und Gelb nach Dunkelrot.
       draft   Entformschräge, t = Winkel / dreifacher Grenzwert: bis zum
               Grenzwert (t = 1/3) von Rot nach Gold, darüber von hellem zu
               sattem Grün. Die Stufe am Grenzwert ist gewollt.
     Bis 24.09. hatte das 3D-Studio eine eigene Leiste (`turbo`, das
     Polynom nach Popov) und das Flussschema noch eine (`speed`: Blau, Teal,
     Gold, Rot). Seitdem liest jeder Messwert die Leiste der Auslegung.
     Seit 13.10. (Wunsch) dazu zwei für die Bilder der Simulation, je mit
     der Vorgabe von ParaView, mit der render die Bilder färbt:
       rainbow Geschwindigkeit der Schmelze, 0 … 50 m/s: Blau über Cyan,
               Grün und Gelb nach Rot („Blue to Red Rainbow", in HSV
               gemischt — zwischen den reinen Farbtönen ist das dasselbe
               wie linear in sRGB). Darüber die Farbe UEBER.rainbow.
       bgo     Mitgerissene Luft, linear: „Blue - Green - Orange" mit
               allen 50 Stützstellen von ParaView 5.13.
     Seit 14.10. (Wunsch: „simulationsübergreifend einheitliche Farbskalen
     je Kriterium", Temperatur wie eine Wärmebildkamera) je Kriterium eine
     Leiste für alle Bilder der Simulation, aus ParaView 5.13 abgetastet:
       inferno     Temperatur (Schmelze, Form, Kammer, Formtemperatur):
                   „Inferno (matplotlib)", 33 Stützstellen
       viridis     Zeitpunkte: Füllzeit, Erstarrungszeit, „Viridis (matplotlib)"
       plasma      Oxide, „Plasma (matplotlib)"
       blues       Druck eingeschlossener Luft, „Blues"
       coolwarm    Klebeindex, „Cool to Warm" (Mitte bei 1)
       festanteil  Festphasenanteil: bis 0,2 flüssig in der Farbe der
                   Schmelze, dann von dunklem zu hellem Grau (fest)
       porositaet  Porosität: vom Grau des festen Gussteils zu mark
     Dieselben Skalen stehen für die Werkzeuge außerhalb der Seite in
     ~/DieLogic/webseite-faelle/_werkzeuge/farbskalen.json.
     Stützstellen [t, Farbe]; zwei an derselben Stelle sind eine Stufe.
     Gemischt wird linear in sRGB, wie die Leisten es immer taten. */
  var LEISTEN = {
    heat: [[0, '#30123b'], [1 / 6, '#3775c5'], [2 / 6, '#1dacd5'], [3 / 6, '#67eb73'],
      [4 / 6, '#f5c225'], [5 / 6, '#fa7e1d'], [1, '#7a0403']],
    draft: [[0, '#b42318'], [1 / 3, '#d4a908'], [1 / 3, '#7cc4a0'], [1, '#0d7a3c']],
    rainbow: [[0, '#0000ff'], [0.25, '#00ffff'], [0.5, '#00ff00'], [0.75, '#ffff00'], [1, '#ff0000']],
    bgo: [[0, '#d4e8fa'], [0.0125, '#bfdcf5'], [0.025, '#b1d3f0'], [0.05, '#91c2eb'], [0.075, '#73b4e6'], [0.1, '#58a4db'],
      [0.125, '#3f92d1'], [0.15, '#2e85c7'], [0.16, '#267dbf'], [0.18, '#2172b5'], [0.2, '#1a6db0'], [0.21, '#1867a8'],
      [0.22, '#1764a3'], [0.23, '#155e9e'], [0.24, '#125a99'], [0.25, '#115491'], [0.26, '#13508a'], [0.27, '#164e82'],
      [0.28, '#18497a'], [0.29, '#1a4773'], [0.3, '#1c4469'], [0.31, '#1d4261'], [0.32, '#1d4059'], [0.33, '#1c4452'],
      [0.34, '#1b4d43'], [0.35, '#184f3e'], [0.36, '#15523a'], [0.37, '#135738'], [0.38, '#125c36'], [0.39, '#116137'],
      [0.4, '#10662d'], [0.425, '#136b25'], [0.45, '#16701e'], [0.475, '#1f781e'], [0.5, '#2f8026'], [0.525, '#418a30'],
      [0.55, '#53943b'], [0.575, '#679e47'], [0.6, '#80ab55'], [0.63, '#97ba66'], [0.65, '#bdc97d'], [0.67, '#dbdb9a'],
      [0.7, '#ebd594'], [0.75, '#e6ba7e'], [0.8, '#db9563'], [0.85, '#cc7052'], [0.9, '#ad4c34'], [0.95, '#8c2b1c'],
      [0.975, '#7a150c'], [1, '#730200']],
    inferno: [
      [0, '#000004'], [0.03125, '#040312'], [0.0625, '#0b0724'], [0.09375, '#150b37'], [0.125, '#210c4a'],
      [0.15625, '#2f0a5b'], [0.1875, '#3d0965'], [0.21875, '#4a0c6b'], [0.25, '#57106e'], [0.28125, '#64156e'],
      [0.3125, '#71196e'], [0.34375, '#7d1e6d'], [0.375, '#8a226a'], [0.40625, '#972766'], [0.4375, '#a32c61'],
      [0.46875, '#b0315b'], [0.5, '#bc3754'], [0.53125, '#c73e4c'], [0.5625, '#d24644'], [0.59375, '#db503b'],
      [0.625, '#e45a31'], [0.65625, '#eb6628'], [0.6875, '#f1731d'], [0.71875, '#f68013'], [0.75, '#f98e09'],
      [0.78125, '#fb9d07'], [0.8125, '#fcac11'], [0.84375, '#fbbc21'], [0.875, '#f9cb35'], [0.90625, '#f5db4c'],
      [0.9375, '#f2ea69'], [0.96875, '#f3f68a'], [1, '#fcffa4']],
    viridis: [
      [0, '#440154'], [0.03125, '#470d60'], [0.0625, '#48186a'], [0.09375, '#482374'], [0.125, '#472d7b'],
      [0.15625, '#453781'], [0.1875, '#424086'], [0.21875, '#3e4989'], [0.25, '#3b528b'], [0.28125, '#375b8d'],
      [0.3125, '#33638d'], [0.34375, '#2f6b8e'], [0.375, '#2c728e'], [0.40625, '#297a8e'], [0.4375, '#26828e'],
      [0.46875, '#23898e'], [0.5, '#21918c'], [0.53125, '#1f988b'], [0.5625, '#1fa088'], [0.59375, '#22a785'],
      [0.625, '#28ae80'], [0.65625, '#32b67a'], [0.6875, '#3fbc73'], [0.71875, '#4ec36b'], [0.75, '#5ec962'],
      [0.78125, '#70cf57'], [0.8125, '#84d44b'], [0.84375, '#98d83e'], [0.875, '#addc30'], [0.90625, '#c2df23'],
      [0.9375, '#d8e219'], [0.96875, '#ece51b'], [1, '#fde725']],
    plasma: [
      [0, '#0d0887'], [0.03125, '#220690'], [0.0625, '#310597'], [0.09375, '#3f049c'], [0.125, '#4c02a1'],
      [0.15625, '#5901a5'], [0.1875, '#6600a7'], [0.21875, '#7201a8'], [0.25, '#7e03a8'], [0.28125, '#8a09a5'],
      [0.3125, '#9511a1'], [0.34375, '#a01a9c'], [0.375, '#aa2395'], [0.40625, '#b32c8e'], [0.4375, '#bc3587'],
      [0.46875, '#c43e7f'], [0.5, '#cc4778'], [0.53125, '#d35171'], [0.5625, '#da5a6a'], [0.59375, '#e06363'],
      [0.625, '#e66c5c'], [0.65625, '#eb7655'], [0.6875, '#f0804e'], [0.71875, '#f58b47'], [0.75, '#f89540'],
      [0.78125, '#fba139'], [0.8125, '#fdac33'], [0.84375, '#feb82c'], [0.875, '#fdc527'], [0.90625, '#fcd225'],
      [0.9375, '#f8df25'], [0.96875, '#f4ed27'], [1, '#f0f922']],
    blues: [
      [0, '#08306b'], [0.0625, '#084184'], [0.125, '#08519c'], [0.1875, '#1561a9'], [0.25, '#2171b5'],
      [0.3125, '#3282be'], [0.375, '#4292c6'], [0.4375, '#57a0ce'], [0.5, '#6caed6'], [0.5625, '#85bcdc'],
      [0.625, '#9fcae1'], [0.6875, '#b3d3e8'], [0.75, '#c7dbef'], [0.8125, '#d3e3f3'], [0.875, '#dfebf7'],
      [0.9375, '#ebf3fb'], [1, '#f7fbff']],
    coolwarm: [
      [0, '#3b4cc0'], [0.0625, '#4e68d7'], [0.125, '#6282ea'], [0.1875, '#779af7'], [0.25, '#8db0fe'],
      [0.3125, '#a3c2fe'], [0.375, '#b9d0f9'], [0.4375, '#ccd9ed'], [0.5, '#dddcdc'], [0.5625, '#ecd2c5'],
      [0.625, '#f5c4ac'], [0.6875, '#f7b093'], [0.75, '#f4997a'], [0.8125, '#eb7d62'], [0.875, '#dd5f4b'],
      [0.9375, '#ca3b37'], [1, '#b40426']],
    festanteil: [
      [0, '#e85f08'], [0.2, '#e85f08'], [0.2001, '#546d77'], [1, '#e3e8e9']],
    porositaet: [
      [0, '#e3e8e9'], [1, '#b23797']]
  };
  /* Was über dem Bereich einer Leiste liegt, wenn es eine eigene Farbe hat:
     die Geschwindigkeit über 50 m/s in Pink (Wunsch vom 13.10.). */
  var UEBER = { rainbow: '#ff69b4' };

  /** Farbe auf einer Farbleiste als [r, g, b] mit 0 … 1, t = 0 … 1; NaN gibt null. */
  function scaleRgb(name, t) {
    if (!(t === t)) return null;             // NaN: keine Farbe
    var l = LEISTEN[name];
    t = Math.max(0, Math.min(1, t));
    var i = l.length - 2;
    while (i > 0 && t < l[i][0]) i--;       // von oben: an einer Stufe gilt die obere Seite
    var a = hexRgb(l[i][1]), b = hexRgb(l[i + 1][1]), w = l[i + 1][0] - l[i][0];
    var u = w > 0 ? Math.min(1, (t - l[i][0]) / w) : 1;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }
  /** Dasselbe als Hex; NaN gibt null. */
  function scale(name, t) {
    var c = scaleRgb(name, t);
    return c ? hex(c) : null;
  }
  /* Für viele Werte je Bild (Heatmaps, Felder): eine Tafel mit n Farben,
     r, g, b je Eintrag 0 … 255. Die Leisten sind fest, gemerkt wird je
     Leiste und Größe. */
  var TAFELN = {};
  function lut(name, n) {
    n = n || 256;
    var schluessel = name + '/' + n;
    if (TAFELN[schluessel]) return TAFELN[schluessel];
    var out = new Uint8ClampedArray(n * 3);
    for (var i = 0; i < n; i++) {
      var c = scaleRgb(name, n > 1 ? i / (n - 1) : 0);
      out[3 * i] = Math.round(c[0] * 255); out[3 * i + 1] = Math.round(c[1] * 255); out[3 * i + 2] = Math.round(c[2] * 255);
    }
    return (TAFELN[schluessel] = out);
  }
  /** CSS-Verlauf für eine Farbleiste in der Legende: linear-gradient(90deg, …). */
  function gradient(name, richtung) {
    var stops = [];
    for (var i = 0; i <= 20; i++) stops.push(scale(name, i / 20));
    return 'linear-gradient(' + (richtung || '90deg') + ', ' + stops.join(', ') + ')';
  }

  api.hexRgb = hexRgb;
  api.rgb255 = rgb255;
  api.oklab = oklab;
  api.mix = mix;
  api.luminance = luminance;
  api.contrast = contrast;
  api.deltaE = deltaE;
  api.rgba = rgba;
  api.leisten = LEISTEN;
  api.ueber = UEBER;
  api.scale = scale;
  api.scaleRgb = scaleRgb;
  api.lut = lut;
  api.gradient = gradient;

  root.__PALETTE__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
