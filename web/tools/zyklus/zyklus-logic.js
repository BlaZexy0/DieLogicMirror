/* DieLogic – zyklus/zyklus-logic.js
   Reine Rechenlogik der Zyklusanalyse — zwei Teile:
   1. Zeitleiste: der Hauptzyklus ist eine feste Kette (Erstarren folgt
      immer auf den Schuss usw.), nur die Dauern sind einstellbar;
      Parallelvorgänge (Kernzüge, Ablage, …) ankern an den Phasengrenzen.
   2. Wärmebilanz je Zyklus: Wärmeeintrag des Gussstücks, natürliche
      Verluste an die Umgebung, Rest = Temperiersystem; dazu die drei
      Kapazitätsprüfungen des Temperierkreises (Wärmeleitung zum Kanal,
      Übergang Kanalwand → Fluid, Abtransport im Fluid). Gleichungen
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
      thermal: thermalDefaults()
    };
  }

  /* Fremden Zustand (Projekt-Abschnitt, Import) in einen vollständigen
     Zustand überführen: fehlende Teile aus dem Beispiel, Zahlen erzwungen. */
  function sanitizeState(src) {
    var d = defaultState();
    if (!src || typeof src !== 'object') return d;
    var out = { durs: {}, schieber: [], sections: {}, thermal: sanitizeThermal(src.thermal) };
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


  /* ── Wärmebilanz: Zustand ─────────────────────────────────── */

  /* Wärmeträgerflüssigkeiten: Stoffwerte bei typischer Betriebstemperatur
     ([B] Tab. 12.4 Wasser 80 °C; [A] Tab. 5.2 Marlotherm SH 140 °C).
     rho kg/m³, c J/(kg·K), lambda W/(m·K), nu m²/s, Pr −. */
  var FLUIDS = {
    wasser:     { label: 'Wasser (≈ 80 °C)',        rho: 971.8, c: 4195, lambda: 0.668, nu: 0.365e-6, Pr: 2.23, TV: 80 },
    marlotherm: { label: 'Wärmeträgeröl (≈ 140 °C)', rho: 958,   c: 1990, lambda: 0.115, nu: 1.4e-6,  Pr: 24.0, TV: 140 }
  };

  /* Legierungs-Thermik als Fallback, wenn das Projekt keine Auslegung
     hat: EN AC-AlSi9Cu3(Fe) nach [B] 12.4.1. */
  var ALLOY_FALLBACK = { Tliq: 593, Tsol: 521, hf: 403, cp20: 846, cpS: 1034, cpL: 1056 };

  /* Eingaben der Wärmebilanz (cycle.thermal). Verknüpfte Werte (mdose,
     Tdie, Afgr) folgen dem Projekt, solange linked[k] gesetzt ist; der
     gespeicherte Wert ist dann nur der letzte Stand. Temperaturen °C,
     Längen mm, Flächen m², Massen kg, Koeffizienten W/(m²·K). */
  function thermalDefaults() {
    return {
      linked: { mdose: true, Tdie: true, Afgr: true },
      /* Beispiel: 18,2 kg Schuss auf einer 1600-t-Maschine — Form ≈ 1,2 m,
         ≈ 22 Wasserkreisläufe. Temperaturen nach [B] Tab. 12.7 / [A] Tab. 5.4. */
      mdose: 18.2, Tdie: 200, Afgr: 0.6,
      te: 300, tfomin: 230, TFomax: 480,
      tluft: 20, tluft1: 80, tpl1: 60, tpl2: 50,
      dieB: 1200, dieH: 1200, dieL: 800, sOpen: 800,
      alphaKonStr: 9.7, alphaK: 100, alphaBl: 40,
      mSpray: 0.15,
      temp: {
        fluid: 'wasser', TV: 80, dT: 10, d: 12, w: 2.5, lambdaF: 28, share: 50,
        halves: [
          { n: 12, lK: 1.5, LK: 5, a: 15, b: 40 },
          { n: 10, lK: 1.2, LK: 4, a: 15, b: 40 }
        ]
      }
    };
  }

  function sanitizeThermal(src) {
    var d = thermalDefaults();
    if (!src || typeof src !== 'object') return d;
    var num = function (x, def) { x = Number(x); return isFinite(x) ? x : def; };
    var out = {};
    Object.keys(d).forEach(function (k) {
      if (k === 'linked' || k === 'temp') return;
      out[k] = num(src[k], d[k]);
    });
    out.linked = {};
    Object.keys(d.linked).forEach(function (k) {
      out.linked[k] = src.linked && typeof src.linked[k] === 'boolean' ? src.linked[k] : true;
    });
    var ts = src.temp && typeof src.temp === 'object' ? src.temp : {};
    out.temp = {
      fluid: FLUIDS[ts.fluid] ? ts.fluid : d.temp.fluid,
      TV: num(ts.TV, d.temp.TV), dT: num(ts.dT, d.temp.dT), d: num(ts.d, d.temp.d), w: num(ts.w, d.temp.w),
      lambdaF: num(ts.lambdaF, d.temp.lambdaF), share: Math.min(Math.max(num(ts.share, d.temp.share), 0), 100),
      halves: [0, 1].map(function (i) {
        var h = Array.isArray(ts.halves) && ts.halves[i] && typeof ts.halves[i] === 'object' ? ts.halves[i] : {};
        var dh = d.temp.halves[i];
        return { n: num(h.n, dh.n), lK: num(h.lK, dh.lK), LK: num(h.LK, dh.LK), a: num(h.a, dh.a), b: num(h.b, dh.b) };
      })
    };
    return out;
  }

  /* ── Wärmebilanz: Rechnung ────────────────────────────────── */

  /* Mittlere spezifische Wärmekapazitäten der Legierung ([B] 12.4.1):
     cl im halbflüssigen Bereich, cm zwischen Solidus und Entformung.
     a: { Tsol, cp20, cpS, cpL } in °C bzw. J/(kg·K); te Entformung °C. */
  function meanHeatCapacities(a, te) {
    var cl = 0.5 * (a.cpS + a.cpL);
    var cm = a.cp20 + (a.Tsol + te - 40) / (2 * a.Tsol - 40) * (a.cpS - a.cp20);
    return { cl: cl, cm: cm };
  }

  /* Wärmeeintrag des Gussstücks je Zyklus ([B] 12.2): von Liquidus bis
     Entformung — Überhitzung geht laut Quelle in Gießkammer/Aufspannplatte.
     o: { mdose kg, Tliq, Tsol, te °C, hf kJ/kg, cp20, cpS, cpL J/(kg·K) }.
     Rückgabe { Q kJ, q kJ/kg, cl, cm } oder null bei unbrauchbaren Eingaben. */
  function heatInput(o) {
    var ok = ['mdose', 'Tliq', 'Tsol', 'te', 'hf', 'cp20', 'cpS', 'cpL'].every(function (k) { return isFinite(o[k]); });
    if (!ok || o.mdose <= 0 || o.Tliq <= o.Tsol || o.Tsol <= 40) return null;
    var c = meanHeatCapacities(o, o.te);
    var q = (o.hf * 1000 + c.cl * (o.Tliq - o.Tsol) + c.cm * (o.Tsol - o.te)) / 1000;  // kJ/kg
    return { Q: o.mdose * q, q: q, cl: c.cl, cm: c.cm };
  }

  /* Außenflächentemperatur der Form aus der Formtemperatur ([B] 12.3). */
  function outerSurfaceTemp(tf, tluft) { return tluft + 0.6 * (tf - 20); }

  /* Natürliche Verluste je Zyklus in kJ ([B] 12.6–12.22):
       Qkon  freie Konvektion + Strahlung der Außenflächen (12.7 + 12.9, ein
             Summenkoeffizient alphaKonStr)
       Qpl   Wärmeleitung in die Aufspannplatten (12.10)
       Qluft erwärmte Luft zwischen den geöffneten Formhälften (12.14,
             ρ·c der Luft = 1 kJ/(m³·K))
       Qbl   Ausblasen/Nachblasen der Formgravur (12.15)
       Qspr  Erwärmen + Verdampfen des Formtrennstoffs (12.22, 2594 kJ/kg)
     o: { tz s, Afa m², alphaKonStr, tfa, tluft, alphaK, Ak1, tfa1, tpl1,
          Ak2, tfa2, tpl2, Vluft m³, tluft1, alphaBl, Afgr m², tauBl s, te,
          tfomin, tluft2, mSpray kg } */
  function heatLosses(o) {
    var Qkon = o.Afa * o.tz * o.alphaKonStr * (o.tfa - o.tluft) / 1000;
    var Qpl = o.alphaK * o.tz * (o.Ak1 * (o.tfa1 - o.tpl1) + o.Ak2 * (o.tfa2 - o.tpl2)) / 1000;
    var Qluft = o.Vluft * (o.tluft1 - o.tluft);
    var Qbl = o.alphaBl * o.Afgr * o.tauBl * ((o.te + o.tfomin) / 2 - o.tluft2) / 1000;
    var Qspr = 2594 * o.mSpray;
    var parts = [Qkon, Qpl, Qluft, Qbl, Qspr].map(function (x) { return isFinite(x) ? Math.max(x, 0) : 0; });
    return { Qkon: parts[0], Qpl: parts[1], Qluft: parts[2], Qbl: parts[3], Qspr: parts[4],
      QU: parts.reduce(function (s, x) { return s + x; }, 0) };
  }

  /* Bilanz ([A] 5.2/5.19, [B] 12.1): Q = QU + QT. Rückgabe QT kJ, PT kW
     (5.4: mittlere Temperierleistung über die Zykluszeit) und k = QT/Q. */
  function heatBalance(Q, QU, tz) {
    var QT = Q - QU;
    return { Q: Q, QU: QU, QT: QT, PT: tz > 0 ? QT / tz : NaN, k: Q > 0 ? QT / Q : NaN,
      deficit: QT < 0 };   // Verluste übersteigen den Eintrag: Form muss geheizt werden
  }

  /* Kapazität des Temperierkreises einer Formhälfte ([A] 5.8–5.9, 5.20–5.25):
     o: { QT kJ (Anteil dieser Hälfte), tz s, fluid {rho,c,lambda,nu,Pr},
          d mm, w m/s, n Kreisläufe, lK m (wirksame Länge im Formhohlraum,
          je Kreislauf), LK m (Gesamtlänge je Kreislauf), a mm (Abstand
          Kanalmitte–Gravur), b mm (Kanalteilung; 0 = Einzelkanal 5.20),
          lambdaF W/(m·K), TFomax, TF, TV °C, dT K }.
     Rückgabe: Re, wMin (5.8 für Re = 10⁴), alpha (5.24), Vdot m³/s,
     QKlambda/QKalpha/QKdT kJ je Zyklus und ok-Flags gegen QT. */
  function temperingCapacity(o) {
    var f = o.fluid, d = o.d / 1000, a = o.a / 1000, b = o.b / 1000;
    var A = Math.PI / 4 * d * d;
    var Re = o.w * d / f.nu;
    var wMin = 1e4 * f.nu / d;
    var alpha = 0.023 * f.lambda / d * Math.pow(Re, 0.8) * Math.pow(f.Pr, 0.4);
    var Vdot = o.n * A * o.w;
    var TFo = (o.TFomax + o.TF) / 2;                       // (5.21)
    var TFl = o.TV + o.dT / 2;
    var R = b > 0 ? 2 * Math.PI * a / b + Math.log(b / (Math.PI * d)) : Math.log(4 * a / d);
    var QKlambda = R > 0 ? 2 * Math.PI * o.lambdaF * (o.n * o.lK) * o.tz / R * (TFo - o.TF) / 1000 : 0;
    var AK = o.n * Math.PI * d * o.LK;
    var QKalpha = alpha * AK * o.tz * (o.TF - TFl) / 1000;
    var QKdT = f.rho * f.c * Vdot * o.tz * o.dT / 1000;
    return {
      Re: Re, turbulent: Re >= 1e4, wMin: wMin, alpha: alpha, A: A, Vdot: Vdot, VdotLmin: Vdot * 6e4,
      TFo: TFo, TFl: TFl, AK: AK,
      QKlambda: QKlambda, QKalpha: QKalpha, QKdT: QKdT,
      okLambda: QKlambda >= o.QT, okAlpha: QKalpha >= o.QT, okDT: QKdT >= o.QT,
      QT: o.QT
    };
  }

  /* Komplette Bilanz aus dem thermal-Zustand, der Zeitleiste und den
     Projektbezügen. th: sanitizeThermal(); layout: layoutCycle()-Ergebnis;
     durs: Phasendauern; alloy: { Tliq, Tsol, hf, cp20, cpS, cpL } oder null. */
  function thermalReport(th, layout, durs, alloy) {
    var al = alloy || ALLOY_FALLBACK;
    var tz = layout.total;
    var tauBl = cleanDur(durs ? durs.spruehen : 0);
    var tauHz = cleanDur(durs ? durs.schuss : 0) + cleanDur(durs ? durs.halten : 0);
    var inp = heatInput({ mdose: th.mdose, Tliq: al.Tliq, Tsol: al.Tsol, te: th.te, hf: al.hf, cp20: al.cp20, cpS: al.cpS, cpL: al.cpL });
    var tfa = outerSurfaceTemp(th.Tdie, th.tluft);
    var Afa = 2 * th.dieL * (th.dieB + th.dieH) * 1e-6;
    var Ak = th.dieB * th.dieH * 1e-6;
    var Vluft = th.dieB * th.dieH * th.sOpen * 1e-9;
    var loss = heatLosses({ tz: tz, Afa: Afa, alphaKonStr: th.alphaKonStr, tfa: tfa, tluft: th.tluft,
      alphaK: th.alphaK, Ak1: Ak, tfa1: tfa, tpl1: th.tpl1, Ak2: Ak, tfa2: tfa, tpl2: th.tpl2,
      Vluft: Vluft, tluft1: th.tluft1, alphaBl: th.alphaBl, Afgr: th.Afgr, tauBl: tauBl,
      te: th.te, tfomin: th.tfomin, tluft2: th.tluft, mSpray: th.mSpray });
    var bal = inp ? heatBalance(inp.Q, loss.QU, tz) : null;
    var fluid = FLUIDS[th.temp.fluid] || FLUIDS.wasser;
    var halves = null;
    if (bal) {
      var QTpos = Math.max(bal.QT, 0);
      halves = th.temp.halves.map(function (h, i) {
        var share = i === 0 ? th.temp.share / 100 : 1 - th.temp.share / 100;
        return temperingCapacity({ QT: QTpos * share, tz: tz, fluid: fluid, d: th.temp.d, w: th.temp.w,
          n: h.n, lK: h.lK, LK: h.LK, a: h.a, b: h.b, lambdaF: th.temp.lambdaF,
          TFomax: th.TFomax, TF: th.Tdie, TV: th.temp.TV, dT: th.temp.dT });
      });
    }
    return { tz: tz, tauHz: tauHz, tauNz: Math.max(tz - tauHz, 0), tauBl: tauBl,
      alloy: al, input: inp, tfa: tfa, Afa: Afa, Ak: Ak, Vluft: Vluft, losses: loss, balance: bal,
      fluid: fluid, halves: halves,
      total: halves ? {
        Vdot: halves[0].Vdot + halves[1].Vdot,
        okLambda: halves[0].okLambda && halves[1].okLambda,
        okAlpha: halves[0].okAlpha && halves[1].okAlpha,
        okDT: halves[0].okDT && halves[1].okDT
      } : null };
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
    FLUIDS: FLUIDS, ALLOY_FALLBACK: ALLOY_FALLBACK,
    thermalDefaults: thermalDefaults, sanitizeThermal: sanitizeThermal,
    meanHeatCapacities: meanHeatCapacities, heatInput: heatInput, outerSurfaceTemp: outerSurfaceTemp,
    heatLosses: heatLosses, heatBalance: heatBalance, temperingCapacity: temperingCapacity,
    thermalReport: thermalReport };
  root.__ZYKLUS_LOGIC__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
