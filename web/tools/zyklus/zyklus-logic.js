/* DieLogic – zyklus/zyklus-logic.js
   Reine Rechenlogik der Zyklusanalyse — Auflösung der Zyklus-Zeitleiste.
   Der Hauptzyklus ist eine feste Kette (Erstarren folgt immer auf den
   Schuss usw.): nur die Dauern sind einstellbar, Spur und Reihenfolge
   liegen fest. Parallelvorgänge (Kernzüge, Ablage, …) ankern an den
   Phasengrenzen des Hauptzyklus. Kein DOM: die Seite
   (index.html) ruft nur noch auf und rendert.
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

  /* Abschnitte der Parallelvorgänge (ohne Kernzüge — die kommen aus den
     Schiebern). Reihenfolge = Reihenfolge auf der Seite. */
  var SECTION_META = [
    ['handling', 'Bauteilhandling'],
    ['spray', 'Sprühroboter'],
    ['cooling', 'Kühlung']
  ];

  /* Beispielzyklus — Ausgangszustand der Seite und Fallback eines Projekts
     ohne cycle-Abschnitt. */
  function defaultState() {
    return {
      durs: { dosieren: 8, schuss: 4, halten: 15, oeffnen: 5, entnahme: 6, spruehen: 8, schliessen: 4, neben: 2 },
      schieber: [{ name: 'Schieber 1', pullLag: 1, pullDur: 3, pushLag: -3, pushDur: 3 }],
      sections: {
        handling: [{ label: 'Ablage & Kühlstrecke', anchor: 'spruehen', lag: 0, dur: 6 }],
        spray: [],
        cooling: [{ label: 'Intensivkühlung Werkzeug', anchor: 'halten', lag: 0, dur: 15 }]
      }
    };
  }

  /* Fremden Zustand (Projekt-Abschnitt, Import) in einen vollständigen
     Zustand überführen: fehlende Teile aus dem Beispiel, Zahlen erzwungen. */
  function sanitizeState(src) {
    var d = defaultState();
    if (!src || typeof src !== 'object') return d;
    var out = { durs: {}, schieber: [], sections: {} };
    MAIN_PHASES.forEach(function (p) {
      var x = src.durs ? Number(src.durs[p.id]) : NaN;
      out.durs[p.id] = isFinite(x) && x >= 0 ? x : d.durs[p.id];
    });
    var num = function (x, def) { x = Number(x); return isFinite(x) ? x : def; };
    (Array.isArray(src.schieber) ? src.schieber : d.schieber).slice(0, 50).forEach(function (s, i) {
      if (!s || typeof s !== 'object') return;
      out.schieber.push({ name: typeof s.name === 'string' ? s.name.slice(0, 80) : 'Schieber ' + (i + 1),
        pullLag: num(s.pullLag, 0), pullDur: num(s.pullDur, 0), pushLag: num(s.pushLag, 0), pushDur: num(s.pushDur, 0) });
    });
    SECTION_META.forEach(function (m) {
      var list = src.sections && Array.isArray(src.sections[m[0]]) ? src.sections[m[0]] : d.sections[m[0]];
      out.sections[m[0]] = list.slice(0, 50).filter(function (e) { return e && typeof e === 'object'; }).map(function (e) {
        return { label: typeof e.label === 'string' ? e.label.slice(0, 80) : 'Vorgang',
          anchor: typeof e.anchor === 'string' ? e.anchor : 'start', lag: num(e.lag, 0), dur: num(e.dur, 0) };
      });
    });
    return out;
  }

  /* Schieber → je zwei Vorgänge (ziehen/einfahren), Abschnitte flach —
     die extras-Liste für layoutCycle(). */
  function extrasFromState(st) {
    var list = [];
    (st.schieber || []).forEach(function (s) {
      list.push({ label: s.name + ' — ziehen', track: 'kern', anchor: 'oeffnen', lag: s.pullLag, dur: s.pullDur, short: 'ziehen' });
      list.push({ label: s.name + ' — einfahren', track: 'kern', anchor: 'schliessen', lag: s.pushLag, dur: s.pushDur, short: 'einfahren' });
    });
    SECTION_META.forEach(function (m) {
      ((st.sections || {})[m[0]] || []).forEach(function (e) {
        list.push({ label: e.label, track: m[0], anchor: e.anchor, lag: e.lag, dur: e.dur, short: '' });
      });
    });
    return list;
  }

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

  var api = { TRACKS: TRACKS, MAIN_PHASES: MAIN_PHASES, SECTION_META: SECTION_META,
    defaultState: defaultState, sanitizeState: sanitizeState,
    extrasFromState: extrasFromState, layoutCycle: layoutCycle };
  root.__ZYKLUS_LOGIC__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
