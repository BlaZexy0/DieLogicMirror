/* DieLogic – zyklus/zyklus-logic.js
   Reine Rechenlogik der Zyklusanalyse — zwei Teile:
   1. Zeitleiste: der Hauptzyklus ist eine feste Kette (Erstarren folgt
      immer auf den Schuss usw.), nur die Dauern sind einstellbar;
      Parallelvorgänge (Kernzüge, Ablage, …) ankern an den Phasengrenzen.
   2. Wärmebilanz je Zyklus: Wärmeeintrag des Gussstücks aus Legierung
      und Temperaturen, natürliche Verluste an die Umgebung, Rest =
      Temperiersystem (Temperierleistung). Gleichungen
      nach [A] Temperiersystem der Druckgießform, Kap. 5 und [B] Heizung
      und Kühlung der Druckgießformen mit Temperiergeräten, Kap. 12 —
      Nummern in Klammern sind die Quellen-Gleichungen, Herleitung und
      Abgleich mit den Scans in docs/heat_flow_hpd_die.md.
   Kein DOM: die Seite (index.html) ruft nur noch auf und rendert.
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
      },
      heat: heatDefaults()
    };
  }

  /* Fremden Zustand (Projekt-Abschnitt, Import) in einen vollständigen
     Zustand überführen: fehlende Teile aus dem Beispiel, Zahlen erzwungen. */
  function sanitizeState(src) {
    var d = defaultState();
    if (!src || typeof src !== 'object') return d;
    var out = { durs: {}, schieber: [], sections: {}, heat: sanitizeHeat(src.heat) };
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


  /* ── Wärmebilanz ──────────────────────────────────────────── */

  /* Erfahrungswerte der Quellen, die das Modell fest verwendet (keine Eingaben):
     Temperaturen [B] Tab. 12.7 / [A] Tab. 5.4, Wärmeübergang [B] 12.4.2, [A] S. 303. */
  var HEAT = {
    Tair: 20,          // Umgebungsluft °C
    TairOpen: 80,      // Luft zwischen den geöffneten Formhälften °C
    Tplaten: 55,       // Aufspannplatten der Maschine °C (40–60)
    dTsurf: 30,        // Gravur vor dem Gießen = Formtemperatur + 30 K (200–250 bei 180–220)
    Tsurfmax: 480,     // maximale Gravurtemperatur (Kontakt) °C (470–520)
    alphaKonStr: 9.7,  // freie Konvektion 7 + Strahlung 2,7 W/(m²·K)
    alphaK: 100,       // Kontakt Form → Aufspannplatte W/(m²·K)
    alphaBl: 40,       // Ausblasen W/(m²·K) (10–20 m/s Luft)
    x0: 0.010,         // Tiefe der beim Sprühen abgekühlten Schicht m (12.21)
    hSpray: 2594       // Formtrennstoff: Erwärmen + Verdampfen kJ/kg (12.22)
  };

  /* Legierung, wenn das Projekt keine hat: EN AC-AlSi9Cu3(Fe) ([B] 12.4.1). */
  var ALLOY_FALLBACK = { name: 'AlSi9Cu3(Fe) — Beispielwerte', Tcast: 660, Tliq: 593, Tsol: 521, hf: 403, cp20: 846, cpS: 1034, cpL: 1056 };

  /* Eingaben der Wärmebilanz (cycle.heat). Alles Übrige kommt aus dem
     Projekt (Auslegung: Schussgewicht, Legierung, Gießtemperatur, Form-
     temperatur, Sprengfläche, Maschine; Sprengflächenanalyse: Gravur-
     oberfläche) oder aus der Zeitleiste (Zykluszeit, Blasphase).
       Teject  Entformungstemperatur °C
       die     Formabmessungen B, H, L mm — null = aus dem Säulenabstand der
               Maschine geschätzt (B = H = 0,8·Säulenabstand, L = 0,5·B) */
  function heatDefaults() {
    return { Teject: 300, die: { B: null, H: null, L: null } };
  }

  function sanitizeHeat(src) {
    var d = heatDefaults();
    if (!src || typeof src !== 'object') return d;
    var num = function (x, def) { x = Number(x); return isFinite(x) ? x : def; };
    var pos = function (x) { x = Number(x); return isFinite(x) && x > 0 ? x : null; };
    var die = src.die && typeof src.die === 'object' ? src.die : {};
    return { Teject: num(src.Teject, d.Teject), die: { B: pos(die.B), H: pos(die.H), L: pos(die.L) } };
  }

  /* Mittlere spezifische Wärmekapazitäten ([B] 12.4.1): cl halbflüssig,
     cm zwischen Solidus und Entformung. a: { Tsol, cp20, cpS, cpL }. */
  function meanHeatCapacities(a, Teject) {
    return { cl: 0.5 * (a.cpS + a.cpL),
      cm: a.cp20 + (a.Tsol + Teject - 40) / (2 * a.Tsol - 40) * (a.cpS - a.cp20) };
  }

  /* Wärmeeintrag je Zyklus in kJ ([B] 12.2, erweitert um die Überhitzung):
       Qsuper  Überhitzung Gießtemperatur → Liquidus (geht laut [B] in Gieß-
               kammer und feste Aufspannplatte, nicht in die Formgravur)
       Qlat    Erstarrungswärme       Qsemi  Abkühlung im Erstarrungsintervall
       Qcool   Abkühlung Solidus → Entformung
       Qdie    = Qlat + Qsemi + Qcool — das, was die Form aufnimmt (12.2)
     o: { mdose kg, Tcast, Tliq, Tsol, Teject °C, hf kJ/kg, cp20, cpS, cpL J/(kg·K) }.
     null bei unbrauchbaren Eingaben. */
  function heatInput(o) {
    var ok = ['mdose', 'Tcast', 'Tliq', 'Tsol', 'Teject', 'hf', 'cp20', 'cpS', 'cpL'].every(function (k) { return isFinite(o[k]); });
    if (!ok || o.mdose <= 0 || o.Tliq <= o.Tsol || o.Tsol <= 40) return null;
    var c = meanHeatCapacities(o, o.Teject);
    var Qsuper = o.mdose * o.cpL * Math.max(o.Tcast - o.Tliq, 0) / 1000;
    var Qlat = o.mdose * o.hf;
    var Qsemi = o.mdose * c.cl * (o.Tliq - o.Tsol) / 1000;
    var Qcool = o.mdose * c.cm * (o.Tsol - o.Teject) / 1000;
    var Qdie = Qlat + Qsemi + Qcool;
    return { Qsuper: Qsuper, Qlat: Qlat, Qsemi: Qsemi, Qcool: Qcool, Qdie: Qdie, Qtotal: Qdie + Qsuper,
      q: Qdie / o.mdose, cl: c.cl, cm: c.cm };
  }

  /* Natürliche Verluste je Zyklus in kJ ([B] 12.3, 12.6–12.22; [A] 5.12–5.13):
       Qkon  freie Konvektion + Strahlung der Außenflächen Afa = 2·L·(B+H)
       Qpl   Wärmeleitung in beide Aufspannplatten, Ak = B·H je Seite
       Qluft erwärmte Luft zwischen den geöffneten Hälften, Vluft = B·H·L
       Qbl   Ausblasen der Gravur während der Blasphase
       Qspr  Formtrennstoff — Masse nach (12.21) aus Gravurfläche und
             Abkühlung der Randschicht von Teject auf Tdie, Wärme nach (12.22)
     o: { tz s, tauBl s, Tdie, Teject °C, Acav m², B, H, L m } */
  function heatLosses(o) {
    var tfa = HEAT.Tair + 0.6 * (o.Tdie - 20);                        // (12.3)
    var Afa = 2 * o.L * (o.B + o.H), Ak = o.B * o.H, Vluft = o.B * o.H * o.L;
    var Tsurf0 = o.Tdie + HEAT.dTsurf;
    var Qkon = HEAT.alphaKonStr * Afa * o.tz * (tfa - HEAT.Tair) / 1000;                    // (12.7 + 12.9)
    var Qpl = HEAT.alphaK * o.tz * 2 * Ak * (tfa - HEAT.Tplaten) / 1000;                   // (12.10)
    var Qluft = Vluft * (HEAT.TairOpen - HEAT.Tair);                                         // (12.14)
    var Qbl = HEAT.alphaBl * o.Acav * o.tauBl * ((o.Teject + Tsurf0) / 2 - HEAT.Tair) / 1000; // (12.15)
    var mSpray = 0.744 * o.Acav * HEAT.x0 * Math.max(o.Teject - o.Tdie, 0);                 // (12.21)
    var Qspr = HEAT.hSpray * mSpray;                                                         // (12.22)
    var parts = [Qkon, Qpl, Qluft, Qbl, Qspr].map(function (x) { return isFinite(x) ? Math.max(x, 0) : 0; });
    return { tfa: tfa, Afa: Afa, Ak: Ak, Vluft: Vluft, mSpray: mSpray,
      Qkon: parts[0], Qpl: parts[1], Qluft: parts[2], Qbl: parts[3], Qspr: parts[4],
      QU: parts[0] + parts[1] + parts[2] + parts[3] + parts[4] };
  }

  /* Gesamte Wärmebilanz. v (flach, wie computeCost in der Teilekosten-Logik):
       mdose kg · Tcast °C · alloy { Tliq, Tsol, hf, cp20, cpS, cpL } · Tdie °C
       Teject °C · Acav m² · die { B, H, L } mm · tz s · tauBl s
     Rückgabe: input (heatInput), losses (heatLosses), QT, PT kW, k = QT/Qdie,
     deficit (Verluste > Eintrag → Form muss beheizt werden). */
  function computeHeat(v) {
    var al = v.alloy || ALLOY_FALLBACK;
    var input = heatInput({ mdose: v.mdose, Tcast: v.Tcast, Tliq: al.Tliq, Tsol: al.Tsol, Teject: v.Teject,
      hf: al.hf, cp20: al.cp20, cpS: al.cpS, cpL: al.cpL });
    var B = v.die.B / 1000, H = v.die.H / 1000, L = v.die.L / 1000;
    var losses = heatLosses({ tz: v.tz, tauBl: v.tauBl, Tdie: v.Tdie, Teject: v.Teject, Acav: v.Acav, B: B, H: H, L: L });
    if (!input) return { input: null, losses: losses, QT: NaN, PT: NaN, k: NaN, deficit: false };
    var QT = input.Qdie - losses.QU;
    return { input: input, losses: losses, QT: QT, PT: v.tz > 0 ? QT / v.tz : NaN, k: QT / input.Qdie, deficit: QT < 0 };
  }

  /* Formabmessungen aus dem Säulenabstand der Maschine schätzen (mm). */
  function dieFromMachine(fields) {
    var tx = fields && Number(fields.tieX), ty = fields && Number(fields.tieY);
    if (!(tx > 0) || !(ty > 0)) return { B: 1000, H: 1000, L: 500 };
    var B = Math.round(0.8 * tx / 10) * 10, H = Math.round(0.8 * ty / 10) * 10;
    return { B: B, H: H, L: Math.round(0.5 * Math.max(B, H) / 10) * 10 };
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
    extrasFromState: extrasFromState, layoutCycle: layoutCycle,
    HEAT: HEAT, ALLOY_FALLBACK: ALLOY_FALLBACK,
    heatDefaults: heatDefaults, sanitizeHeat: sanitizeHeat, dieFromMachine: dieFromMachine,
    meanHeatCapacities: meanHeatCapacities, heatInput: heatInput, heatLosses: heatLosses,
    computeHeat: computeHeat };
  root.__ZYKLUS_LOGIC__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
