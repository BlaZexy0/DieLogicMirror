/* DieLogic – zyklus/zyklus-logic.js
   Reine Rechenlogik der Zyklusanalyse — Auflösung der Zyklus-Zeitleiste.
   Der Hauptzyklus ist eine feste Kette (Erstarren folgt immer auf den
   Schuss usw.): nur die Dauern sind einstellbar, Spur und Reihenfolge
   liegen fest. Parallelvorgänge (Kernzüge, Ablage, …) ankern an den
   Phasengrenzen des Hauptzyklus. Kein DOM: die Seite
   (zyklus-analyse.html) ruft nur noch auf und rendert.
   Klassisches Script: Browser-Global window.__ZYKLUS_LOGIC__,
   CommonJS-Export für Tests. */
(function (root) {
  'use strict';

  /* Spuren (Gruppen) der Zeitleiste — Reihenfolge = Reihenfolge im
     Diagramm. Der Hauptzyklus ist eine Zeile; die übrigen Gruppen tragen
     je Eintrag eine eigene Zeile (z. B. Schieber 1, Schieber 2, …). */
  var TRACKS = [
    ['haupt', 'Hauptzyklus'],
    ['kern', 'Kernzüge'],
    ['handling', 'Bauteilhandling'],
    ['spray', 'Sprühroboter'],
    ['cooling', 'Kühlung']
  ];

  /* Hauptzyklus: feste Reihenfolge auf einer Spur — jede Phase startet am
     Ende der vorigen. */
  var MAIN_PHASES = [
    { id: 'dosieren',   label: 'Dosieren',               track: 'haupt' },
    { id: 'schuss',     label: 'Schuss (1. + 2. Phase)', track: 'haupt' },
    { id: 'halten',     label: 'Erstarren & Halten',     track: 'haupt' },
    { id: 'oeffnen',    label: 'Form öffnen',            track: 'haupt' },
    { id: 'entnahme',   label: 'Entnahme',               track: 'haupt' },
    { id: 'spruehen',   label: 'Sprühen & Ausblasen',    track: 'haupt' },
    { id: 'schliessen', label: 'Form schließen',         track: 'haupt' },
    { id: 'neben',      label: 'Nebenzeiten / Puffer',   track: 'haupt' }
  ];

  function cleanDur(x) { return isFinite(x) && x > 0 ? Number(x) : 0; }

  /* Zeitplan auflösen.
     durs: { Phasen-id: Dauer [s] } für den Hauptzyklus.
     extras: [{ label, track, anchor, lag [s], dur [s] }] — anchor ist
     'start' (Zyklusstart), eine Phasen-id (= Beginn dieser Phase) oder
     'mainEnd' (Ende des Hauptzyklus); negativer Versatz zieht vor, der
     Start bleibt ≥ 0. Dauer < 0 oder nicht endlich zählt als 0.
     Rückgabe: { items: [{ id, label, track, start, end, dur, main }],
     total, mainEnd, die: { openStart, open, closeStart, closed }, errors }
     — die.open…closeStart ist die Zeit mit offener Form. */
  function layoutCycle(durs, extras) {
    var items = [], anchors = { start: 0 }, errors = [];
    var t = 0;
    MAIN_PHASES.forEach(function (p) {
      var d = cleanDur(durs ? durs[p.id] : 0);
      anchors[p.id] = t;
      items.push({ id: p.id, label: p.label, track: p.track, start: t, end: t + d, dur: d, main: true });
      t += d;
    });
    anchors.mainEnd = t;

    (extras || []).forEach(function (e, i) {
      var base = anchors[e.anchor];
      if (base === undefined) {
        errors.push('Unbekannter Bezugspunkt bei „' + e.label + '" — Start am Zyklusstart.');
        base = 0;
      }
      var start = Math.max(base + (isFinite(e.lag) ? Number(e.lag) : 0), 0);
      var d = cleanDur(e.dur);
      items.push({ id: 'x' + i, label: e.label, track: e.track, start: start, end: start + d, dur: d, main: false });
    });

    var total = 0;
    items.forEach(function (it) { if (it.end > total) total = it.end; });
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    return {
      items: items, total: total, mainEnd: t, errors: errors,
      die: {
        openStart: byId.oeffnen.start,     // Form beginnt zu öffnen
        open: byId.oeffnen.end,            // Form ist offen
        closeStart: byId.schliessen.start, // Form beginnt zu schließen
        closed: byId.schliessen.end        // Form ist geschlossen & verriegelt
      }
    };
  }

  var api = { TRACKS: TRACKS, MAIN_PHASES: MAIN_PHASES, layoutCycle: layoutCycle };
  root.__ZYKLUS_LOGIC__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
