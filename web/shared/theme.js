/* DieLogic – web/shared/theme.js
   Die Farben der Diagramme, abgeleitet aus der Palette (shared/palette.js)
   und damit aus dem gewählten Farbschema. Hier steht keine einzige feste
   Farbe: derive() liest __PALETTE__ und schreibt die Rollen der Diagramme.
   shared/schemes.js ruft derive() bei jedem Wechsel des Schemas; wer
   zeichnet, zeichnet auf das Ereignis „dielogic:scheme" neu und liest die
   Werte dabei frisch.

   Die Schlüssel sind Rollen, keine Plätze (früher series1 … series4, die je
   Diagramm etwas anderes bedeuteten):
     Fläche und Schrift   surface, text, muted, grid, axis
     Hauptkurve           ink — die eine Größe, um die es im Diagramm geht
     Sachfarben           die (Werkzeug), machine, air, vacuum, melt, runner,
                          overflow, biscuit, piston, cool, process
     Urteil (Ampel)       ok, caution, bad, okText, cautionText, badText
     Flächen des Urteils  feasible (machbar), feasibleAlt (machbar mit anderem
                          Kolben), target (Zielband) + targetLine, mask
                          (unerreichbar), zone (Sperrbereich: die Schraffur
                          jeder Fläche, die eine Grenze ausschließt, in
                          jedem Diagramm dieselbe)
     Punkte und Linien    mark (Arbeitspunkt, Ist-Wert), ref (Referenzpunkt
                          und -linie), event (Prozessereignisse), chip
                          (Nummern der Ereignisse)
     Nebenflächen         areaFill, isoLine
   `limits` färbt die Grenzen nach ihrer Herkunft (Maschine, Werkzeug und
   Anschnitt, Prozess, Luft, Schmelze): die Farbe sagt, woher eine Grenze
   kommt. `mapLines` dasselbe für das (φ, λ)-Fenster. `heatStops` sind die
   Stützstellen der Heatmaps (RGB 0 … 255, von niedrig nach hoch): die feste
   Farbleiste `heat` der Palette, in jedem Schema dieselbe.

   Klassisches Script; lädt nach palette.js und schemes.js. */
(function (root) {
  'use strict';

  var T = root.__THEME__ = root.__THEME__ || {};
  T.name = 'aus der Palette';
  T.chart = T.chart || {};
  T.limits = T.limits || {};
  T.map = T.map || {};
  T.mapLines = T.mapLines || {};

  /* Welche Grenze zu welcher Familie gehört. */
  var FAMILIE = {
    machine: ['hydr', 'vmax', 'force', 'mpe'],
    die: ['gateMin', 'gateMax', 'atom', 'atomMax'],
    process: ['tmax', 'vcrit', 'intTime'],
    air: ['vent', 'vAirMax', 'ventAvail'],
    melt: ['fill100']
  };

  /* Die Felder werden an Ort und Stelle gefüllt, nicht ersetzt: wer eine
     Referenz auf T.chart hält (core/theme.js der Auslegung), sieht nach
     einem Wechsel die neuen Werte. */
  function stuetzen(P, name, out) {
    out.length = 0;
    P.leisten[name].forEach(function (s) {
      out.push(P.hexRgb(s[1]).map(function (v) { return Math.round(v * 255); }));
    });
    return out;
  }

  function derive() {
    var P = root.__PALETTE__;
    if (!P) return T;
    var C = T.chart;
    C.surface = P.surface; C.text = P.text; C.muted = P.muted;
    C.grid = P.borderLight; C.axis = P.border;
    C.ink = P.text;
    C.die = P.die; C.machine = P.machine; C.air = P.air; C.vacuum = P.vacuum;
    C.melt = P.melt; C.runner = P.runner; C.overflow = P.overflow; C.biscuit = P.biscuit;
    C.piston = P.piston; C.cool = P.cool; C.process = P.process;
    C.ok = P.ok; C.caution = P.caution; C.bad = P.bad;
    C.okText = P.okText; C.cautionText = P.cautionText; C.badText = P.badText;
    C.feasible = P.rgba('ok', 0.26);
    C.feasibleAlt = P.rgba('ok', 0.11);
    C.target = P.rgba('ok', 0.14);
    C.targetLine = P.rgba('ok', 0.75);
    C.mask = P.rgba('borderLight', 0.93);
    /* Ein Sperrbereich ist ein Urteil („hier nicht"): rot schraffiert, gleich,
       welche Grenze ihn zieht. Die Grenzlinie selbst trägt ihre Herkunft. */
    C.zone = P.bad;
    C.mark = P.mark; C.ref = P.muted; C.event = P.mutedLight; C.chip = P.primary;
    C.areaFill = P.rgba('text', 0.07);
    C.isoLine = P.rgba('muted', 0.6);

    for (var fam in FAMILIE) {
      for (var i = 0; i < FAMILIE[fam].length; i++) T.limits[FAMILIE[fam][i]] = P[fam];
    }
    /* Glieder einer Familie (v_a min und max, Zerstäubung) unterscheidet
       der Renderer über Strichart und Schraffurseite, nicht über
       Mischfarben: jede Farbe hier ist genau eine Rolle der Palette, auch
       in den Theorie-Bildern, die aus diesen Diagrammen entstehen. */

    T.map.ok = C.feasible;
    T.mapLines.bore = P.machine;       // Kolben-Ø: aus der Maschine
    T.mapLines.len = P.machine;        // Kammerlänge: auch (gestrichelt)
    T.mapLines.bisc = P.biscuit;       // Pressrest
    T.mapLines.crit = P.process;       // v_krit

    stuetzen(P, 'heat', T.heatStops = T.heatStops || []);
    return T;
  }

  T.derive = derive;
  derive();
})(typeof window !== 'undefined' ? window : globalThis);
