/* PQ²-Diagramm nach dem Formalismus von M. A. Pego Guerra, „Die Casting
   Design. A Parametric Approach", Carleton University 1997 (Kap. 2–3),
   dort nach CSIRO [23] und Karni [13]:
   – Werkzeuglinie (Die Line):      P = (C_t/A_g²)·Q²,  C_t = ρ/(2·C_d²)
   – Maschinenlinie (CSIRO-Form):   P = p₀·(1 − Q²/Q_dry²)
   – Machine Performance Envelope:  P = a/Q,  a = (2√3/9)·F_G·v_dry
   – Operational Window als Rechteck nach dem UPCT-TFG „Optimización de la
     cámara de inyección en procesos FIAP" (sources/PQ2.pdf, Gl. 2.25–2.27):
     t_f-Grenzen auf der Q-Achse (Q = V_a/t_f), v_a-Grenzen auf der
     Druckachse (P = ρ/2·(v_a/C_d)², unabhängig von A_a) — plus
     Entlüftungsbedingung und hydraulisches Limit.
   Achsenmodi x: Q / Q² / v_p / t_f.
   Achsenmodi y: Metalldruck / Hydraulikdruck (P_h = P·P_acc/p₀) / Leistung
   P·Q — dort wird die Hüllkurve zur Horizontalen y = a. */

import { series, line, limit } from './helpers.js';
import { seq, fmt, subHTML } from '../core/format.js';
import { pistonArea, afterGate, total, injForceEff, cavityVolume } from '../core/physics.js';
import { eq } from './mathfmt.js';

const PI = Math.PI, S3 = Math.sqrt(3);

/* Gemeinsame Kerngrößen für calc(), renderMath() und die KPI-Zeile
   (ui/kpis.js) — die eine Implementierung des Arbeitspunkts. null bei
   ungültigen Eingaben. */
export function pqCore(v) {
  const FG = injForceEff(v);                                    // Gießkraft kN beim eingestellten Akkumulatordruck
  if (!(v.gate > 0) || !(v.Cd > 0) || !(v.vmax > 0) || !(FG > 0) || !(v.density > 0) || !(v.diam > 0)) return null;
  const Ap = pistonArea(v) * 1e-6;                              // Kolbenfläche m²
  const p0 = FG * 1e4 / pistonArea(v);                          // statischer Metalldruck bar (= P_acc·A_h/A_K)
  const Qmax = Ap * v.vmax;                                     // Trockenschuss-Volumenstrom m³/s
  const Ag = v.gate * 1e-6;                                     // Anschnittfläche m²
  const Cdie = v.density / (2 * v.Cd * v.Cd * Ag * Ag) / 1e5;   // Werkzeugkonstante C_t/A_g² in bar/(m³/s)²
  const Qs = Math.sqrt(p0 / (Cdie + p0 / (Qmax * Qmax)));       // Arbeitspunkt m³/s
  const Vag = cavityVolume(afterGate(v), v);                    // Kavität ab Anschnitt m³ (fest, ρ_sol)
  /* Machine Performance Envelope (Pego Guerra Gl. 2.13/2.14):
     P = a/Q mit a = (2√3/9)·F_G·v_dry — Leistungskonstante des Akkumulators.
     Gültig zwischen den Berührpunkten Q_t = A_K·v_dry/√3 von Ø min und Ø max. */
  const aMPE = (2 * S3 / 9) * (FG * 1e3) * v.vmax;              // W
  const pEnv = Q => aMPE / Q / 1e5;                             // bar
  const QtLo = 0.25 * PI * Math.pow(v.dmin / 1000, 2) * v.vmax / S3;
  const QtHi = 0.25 * PI * Math.pow(v.dmax / 1000, 2) * v.vmax / S3;
  /* Erreichbarkeitsgrenze über ALLE Kolben-Ø: innerhalb der Berührpunkte
     die Hüllkurve a/Q, außerhalb die Parabel des Grenz-Kolbens (Ø min bzw.
     Ø max) — oberhalb davon ist kein Betriebspunkt erreichbar. */
  const Alo = 0.25 * PI * Math.pow(v.dmin / 1000, 2);
  const Ahi = 0.25 * PI * Math.pow(v.dmax / 1000, 2);
  const reach = Q => {
    let A = S3 * Q / v.vmax;                 // unbeschränktes Optimum A_opt(Q)
    if (Alo > 0 && A < Alo) A = Alo;
    if (Ahi > 0 && A > Ahi) A = Ahi;
    if (!(A > 0)) return { p: Infinity, A: Ap };
    const r = Q / (A * v.vmax);
    /* Der montierte Kolben zählt immer zur Erreichbarkeit — auch wenn sein Ø
       außerhalb dmin–dmax liegt; sonst liefe seine Maschinenlinie in die
       Maske hinein. */
    const rc = Q / Qmax;
    const pA = FG * 1e3 / (A * 1e5) * (1 - r * r), pM = p0 * (1 - rc * rc);
    return pM >= pA ? { p: Math.max(pM, 0), A: Ap } : { p: Math.max(pA, 0), A };
  };
  const pReach = Q => reach(Q).p;
  const aReach = Q => reach(Q).A;
  /* Hydraulische v_a-Grenze (Pego Guerra, dort „J" = C_d): v_a = C_d·√(2·p₀/ρ) */
  const vaHydr = v.Cd * Math.sqrt(2 * p0 * 1e5 / v.density);
  /* Zerstäubung nach Herman/NADCA (UPCT Gl. 2.38): J = v_a^1.71 · e_p · ρ —
     empirisch in inch-pound-Einheiten (v [in/s], e_p [in], ρ [lb/in³]).
     J_min (≈ 750, konservativ) ist die Untergrenze der Anschnittgeschwindig-
     keit (keine Zerstäubung darunter), J_max (≈ 6000) die Obergrenze
     (Überzerstäubung/Erosion darüber). */
  const vaOfJ = J => (J > 0 && v.gateTh > 0)
    ? Math.pow(J / ((v.gateTh / 25.4) * (v.density * 3.6127e-5)), 1 / 1.71) * 0.0254
    : NaN;
  const vaAtom = vaOfJ(v.JatomMin), vaAtomMax = vaOfJ(v.JatomMax);
  /* Minimale Füllzeit aus der Entlüftungsbedingung (Operational Window, Zone C):
     die verdrängte Luft V_luft muss durch A_ent mit höchstens v_luft,max entweichen. */
  const tVent = (v.vent > 0 && v.vAirMax > 0) ? cavityVolume(total(v), v) / (v.vent * 1e-6 * v.vAirMax) : NaN;
  return { FG, Ap, p0, Qmax, Ag, Cdie, Qs, Vag, ps: Cdie * Qs * Qs, aMPE, pEnv, pReach, aReach, QtLo, QtHi, Alo, Ahi, vaHydr, vaAtom, vaAtomMax, tVent };
}

export default {
  id: 'pq2',
  title: 'PQ²-Diagramm (Arbeitspunkt)',
  desc: 'Maschine × Werkzeug · Hüllkurve · Operational Window · x: Q, Q², v_p, t_f · y: p_m, p_hyd, P·Q',
  tab: 'q',
  tabs: [['q', 'Q'], ['q2', 'Q²'], ['vp', 'v<sub>p</sub>'], ['tf', 't<sub>f</sub>']],
  tab2: 'pm',
  tabs2: [['pm', 'p<sub>m</sub>'], ['ph', 'p<sub>hyd</sub>'], ['pw', 'P·Q']],
  inputs: ['gate', 'Cd', 'vmax', 'injForce', 'diam', 'dmin', 'dmax', 'density', 'densitySolid', 'shrink', 'part', 'runner', 'overflow', 'vent', 'vAirMax', 'tmax', 'gateMin', 'gateMax', 'pAcc', 'pAccOp', 'gateTh', 'JatomMin', 'JatomMax'],
  /* Der Arbeitspunkt der Schusskurve (v₂) kommt aus der Kurve: die
     Einzelseite zeigt dafür den Kurveneditor, 🎯 markiert die Kurve mit. */
  usesCurve: true,

  calc(v, o) {
    const c = pqCore(v);
    if (!c) return { err: 'Anschnittfläche, Cd, v_max und Gießkraft müssen > 0 sein.' };
    const { Ap, p0, Qmax, Ag, Cdie, Qs, Vag, tVent } = c;
    const tb = this.tab, yb = this.tab2 || 'pm';

    const tfOp = Vag / Qs * 1000;
    const tfPlot = 2.5 * Math.max(tfOp, v.tmax || 0) || 500;

    /* Die v_p-Achse ist die Geschwindigkeit des MONTIERTEN Kolbens — andere
       Kolben-Ø haben bei gleichem Q eine andere v_p. Dieser Modus zeigt
       deshalb nur den montierten Kolben: x bis v_max, Grenze = seine
       Maschinenlinie. Die übrigen Achsen zeigen die GESAMTE Erreichbarkeits-
       grenze: x bis zum Nullpunkt der Ø-max-Parabel (Q_dry des größten
       Kolbens), y bis zum statischen Druck des kleinsten Kolbens. */
    const pistonOnly = tb === 'vp';
    /* x-Bereich: Q- und Q²-Achse enden bei Q_dry des montierten Kolbens —
       bis zum größten Kolben-Ø liefe die Achse weit über den relevanten
       Bereich hinaus und das machbare Band würde zusammengedrückt. Die
       Hüllkurve anderer Ø bleibt innerhalb dieses Bereichs sichtbar; nur
       die t_f-Achse zeigt weiter die gesamte Erreichbarkeit. */
    /* xFull (Opt-in der Theorieseite): Q-/Q²-Achse bis Q_dry des größten
       Kolbens festhalten — beim Spielen mit dem Kolben-Ø verschiebt sich
       dann sichtbar die Maschinenlinie statt der Achse. */
    const Qfull = Math.max(Qmax, c.Ahi > 0 ? c.Ahi * v.vmax : 0);
    const QmaxAll = (tb === 'tf' || this.xFull) ? Qfull : Qmax;
    const pTop = pistonOnly ? p0 : Math.max(p0, c.Alo > 0 ? c.FG * 1e3 / (c.Alo * 1e5) : p0);

    /* x-Achse: fx bildet Q → Achsenwert ab, ix ist die Umkehrung (für
       Kurvenschranken, die als Funktion des Achsenwerts ausgewertet werden). */
    let fx, ix, xl, Qlo = 0;
    if (tb === 'q') { fx = Q => Q * 1000; ix = x => x / 1000; xl = 'Durchfluss Q in l/s'; }
    else if (tb === 'q2') { fx = Q => Q * Q * 1e6; ix = x => Math.sqrt(Math.max(x, 0)) / 1000; xl = 'Q² in (l/s)² (Maschinenlinie wird Gerade)'; }
    else if (tb === 'vp') { fx = Q => Q / Ap; ix = x => x * Ap; xl = 'Kolbengeschwindigkeit v_p in m/s'; }
    else { fx = Q => Q > 0 ? Vag / Q * 1000 : Infinity; ix = x => x > 0 ? Vag / (x / 1000) : Infinity; xl = 'Füllzeit ab Anschnitt t_f in ms (Bauteil + Überlauf)'; Qlo = Vag / (tfPlot / 1000); }

    /* y-Achse: Metalldruck [bar], Hydraulikdruck der Antriebsseite oder
       Leistung P·Q [MW] — dort wird die Hüllkurve P·Q = a zur Horizontalen.
       Hydraulik: P_h = P·A_K/A_h mit A_h = F_G/P_acc, also P_h = 100·P·A·P_acc/F_G
       (P bar, A m², F_G kN). A ist die Fläche des Kolbens, der den Punkt
       erreicht — für den montierten Kolben A_K (statischer Schnittpunkt =
       P_acc), für die Hüllkurve die jeweils optimale Fläche; so bleibt die
       Antriebsseite immer ≤ P_acc. */
    let fy, yl, yUnit, y1;
    if (yb === 'ph') {
      if (!(v.pAcc > 0) || !(v.pAccOp > 0)) return { err: 'Akkumulatordruck (max. und eingestellt) muss > 0 sein für die Hydraulikdruck-Achse.' };
      /* A_h = F_max/P_max (fest); statisch liegt der montierte Kolben beim eingestellten Druck */
      fy = (P, Q, A = Ap) => 100 * P * A * v.pAcc / v.injForce;
      yl = 'Hydraulikdruck (Antriebsseite) in bar'; yUnit = ' bar'; y1 = Math.min(v.pAccOp, v.pAcc) * 1.05;
    } else if (yb === 'pw') {
      fy = (P, Q) => P * 1e5 * Q / 1e6; yl = 'Leistung P·Q in MW'; yUnit = ' MW'; y1 = c.aMPE / 1e6 * 1.15;
    } else {
      fy = P => P; yl = 'Metalldruck in bar'; yUnit = ' bar'; y1 = pTop * 1.05;
    }

    const Qarr = seq(Math.max(Qlo, QmaxAll * 1e-4), QmaxAll, 200);
    /* Q_dry des montierten Kolbens als Stützstelle: dort endet die
       Maschinenlinie exakt auf der Achse (sonst bricht sie eine Stützstelle
       davor ab und hängt über dem Nullpunkt). */
    if (Qmax > Qarr[0] && Qmax < Qarr[Qarr.length - 1]) { Qarr.push(Qmax); Qarr.sort((a, b) => a - b); }
    if (tb === 'tf') Qarr.reverse();
    const x = Qarr.map(fx);

    /* Hüllkurve/Erreichbarkeitsgrenze ist keine Serie mehr, sondern die
       Masken-Grenze unten (deckende Fläche oberhalb, durchgezogene
       Frontlinie in der Farbe der Maschine). */
    const machineLine = Q => p0 * (1 - (Q / Qmax) * (Q / Qmax));
    const ys = [
      /* Maschinenlinie endet bei Q_dry des gewählten Kolbens (NaN dahinter).
         Im v_p-Modus fällt sie mit der Maskengrenze zusammen — sie bleibt
         trotzdem eine Serie, damit sie in jedem Modus gleich aussieht
         (Serien werden über den Grenzen gezeichnet). Die Farben sind die
         Sachfarben: Maschine und Werkzeug, wie ihre Grenzen. */
      series('Maschine (Ø ' + fmt(v.diam) + ' mm)', 'machine', Qarr,
        Q => Q <= Qmax ? fy(machineLine(Q), Q) : NaN),
      series('Werkzeug', 'die', Qarr, Q => fy(Cdie * Q * Q, Q))
    ];

    const q = line(x, ys, xl, yl,
      'Statisch ' + fmt(p0) + ' bar · Q_dry ' + fmt(Qmax * 1000) + ' l/s · Cd=' + fmt(v.Cd)
      + (pistonOnly ? ' · nur Kolben Ø ' + fmt(v.diam) + ' (v_p ≤ v_max ' + fmt(v.vmax) + ' m/s)'
        : ' · Hüllkurve a = ' + fmt(c.aMPE / 1e6) + ' MW (Ø ' + fmt(v.dmin) + '–' + fmt(v.dmax) + ')')
      + ' · P_acc ' + fmt(Math.min(v.pAccOp, v.pAcc)) + ' bar' + (v.pAccOp < v.pAcc ? ' (max. ' + fmt(v.pAcc) + ')' : ''));
    q.y0 = 0; q.y1 = y1;

    /* ── Operational Window (UPCT Gl. 2.25–2.27) als deklarative Grenzen ──
       t_f-Grenzen in Q formuliert (x-Achse); im t_f-Modus dreht sich die
       Richtung um, deshalb kippt kind dort von min↔max. */
    q.limits = [];
    const qlim = (id, label, kindQ, Qv, note) => {
      if (!(Qv > 0) || !isFinite(Qv)) return;
      const kind = tb === 'tf' ? (kindQ === 'min' ? 'max' : 'min') : kindQ;
      q.limits.push(limit(id, label, 'x', kind, fx(Qv), { note }));
    };
    if (v.tmax > 0) qlim('tmax', 't_f max ' + fmt(v.tmax) + ' ms', 'min', Vag / (v.tmax / 1000), 'Füllung zu langsam');
    if (c.vaHydr > 0 && Ag > 0) qlim('hydr', 'hydraul. Limit ' + fmt(c.vaHydr) + ' m/s', 'max', c.vaHydr * Ag);
    if (isFinite(tVent) && tVent > 0) qlim('vent', 'Entlüftung: t_f ≥ ' + fmt(tVent * 1000) + ' ms', 'max', Vag / tVent, 'Entlüftung überfordert');

    /* v_a-Grenzen auf der Druckachse: P(v_a) = ρ/2·(v_a/C_d)² — unabhängig
       von der Anschnittfläche (UPCT Gl. 2.26). In den Druckmodi Horizontalen,
       im Leistungsmodus Kurven y = P(v_a)·Q(x). */
    const Pg = vg => v.density * (vg / v.Cd) * (vg / v.Cd) / 2 / 1e5;   // bar
    const ylim = (id, label, kind, Pbar, note) => {
      if (!(Pbar > 0) || !isFinite(Pbar)) return;
      q.limits.push(yb === 'pw'
        ? limit(id, label, 'y', kind, xv => fy(Pbar, ix(xv)), { note })
        : limit(id, label, 'y', kind, fy(Pbar, 0), { note }));
    };
    if (v.gateMin > 0) ylim('gateMin', 'v_a min ' + fmt(v.gateMin) + ' m/s', 'min', Pg(v.gateMin), 'unter NADCA-Ziel');
    if (v.gateMax > 0) ylim('gateMax', 'v_a max ' + fmt(v.gateMax) + ' m/s', 'max', Pg(v.gateMax), 'Erosionsrisiko');
    /* Zerstäubungsband aus dem J-Faktor (UPCT Gl. 2.38) — unabhängig vom
       NADCA-Zielband; je Seite gewinnt die schärfere Grenze. */
    if (isFinite(c.vaAtom)) ylim('atom', 'Zerstäubung J ≥ ' + fmt(v.JatomMin) + ': v_a ≥ ' + fmt(c.vaAtom) + ' m/s', 'min', Pg(c.vaAtom), 'keine Zerstäubung');
    if (isFinite(c.vaAtomMax)) ylim('atomMax', 'Zerstäubung J ≤ ' + fmt(v.JatomMax) + ': v_a ≤ ' + fmt(c.vaAtomMax) + ' m/s', 'max', Pg(c.vaAtomMax), 'Überzerstäubung / Erosion');

    /* Erreichbarkeitsgrenze als Maske: oberhalb deckend (für keinen
       Kolben-Ø erreichbar), alle anderen Grenzen werden darauf gestutzt. Im
       Leistungsmodus wird die Hüllkurve dabei zur Horizontalen y = a. */
    if (pistonOnly) {
      q.limits.push(limit('mpe', 'darüber unerreichbar (Ø ' + fmt(v.diam) + ')', 'y', 'max',
        xv => { const Q = ix(xv); return Q <= Qmax ? fy(machineLine(Q), Q) : 0; }, { mask: true, note: 'unerreichbar (Ø ' + fmt(v.diam) + ')' }));
    } else {
      q.limits.push(limit('mpe', 'Hüllkurve a = ' + fmt(c.aMPE / 1e6) + ' MW', 'y', 'max',
        xv => { const Q = ix(xv); return fy(c.pReach(Q), Q, c.aReach(Q)); }, { mask: true, note: 'unerreichbar (alle Ø)' }));
    }

    /* Machbares Band (wie im (φ, λ)-Fenster): Schnittmenge aller harten
       Grenzen, in der Ampelfarbe „gut". Oberhalb der Maschinenlinie des
       aktuellen Kolbens heller — Fenster erfüllt, aber nur mit anderem Ø
       erreichbar (entfällt im v_p-Modus, der nur den montierten Kolben
       zeigt). Grenzen sind nur in der Legende benannt (kein Text im
       Diagramm). */
    q.feasible = 'machbares Band';
    if (!pistonOnly) q.feasibleSplit = {
      fn: xv => fy(machineLine(ix(xv)), ix(xv)),
      label: 'machbar (anderer Kolben-Ø)'
    };
    q.limitText = 'legend';

    /* Arbeitspunkt: der Schnittpunkt Maschine × Werkzeug ist der Punkt, auf
       den sich die UNGEDROSSELTE Maschine einstellt. Die Schusskurve fährt
       in der 2. Phase v₂ — der reale Betriebspunkt liegt auf der Werkzeug-
       linie bei Q = A_K·v₂ (darunter, wenn die Maschine gedrosselt wird);
       die Differenz zur Maschinenlinie ist der Drosselverlust. */
    const unit = tb === 'q' ? ' l/s' : tb === 'q2' ? ' (l/s)²' : tb === 'vp' ? ' m/s' : ' ms';
    const v2 = o && o.shot && !o.shot.error && o.shot.v2 > 0 ? o.shot.v2 : null;
    const sx = fx(Qs), sy = fy(Cdie * Qs * Qs, Qs);
    if (v2 !== null) {
      const Qop = Ap * v2, pOp = Cdie * Qop * Qop;
      const ox = fx(Qop), oy = fy(pOp, Qop);
      q.pt = [ox, oy];
      q.ptl = 'Arbeitspunkt Schusskurve (v₂ ' + fmt(v2) + ' m/s) ' + fmt(ox) + unit + ' / ' + fmt(oy) + yUnit;
      q.pt2 = [sx, sy];
      q.ptl2 = 'Schnittpunkt ungedrosselt ' + fmt(sx) + unit + ' / ' + fmt(sy) + yUnit;
      if (Qop < Qmax) {
        const pM = machineLine(Qop);
        if (pM > pOp) q.segs = [{ x1: ox, y1: oy, x2: ox, y2: fy(pM, Qop), c: 'ref',
          label: 'gedrosselt Δp ' + fmt(fy(pM, Qop) - oy) + yUnit }];
      }
    } else {
      q.pt = [sx, sy];
      q.ptl = 'Schnittpunkt Maschine × Werkzeug ' + fmt(sx) + unit + ' / ' + fmt(sy) + yUnit + ' (keine Schusskurve)';
    }
    return q;
  },

  /* Mathe-Erklärung nach Pego Guerra (1997), Kap. 2–3. Live-Werte via data-m. */
  mathHTML() {
    return `
<p class="math-note"><b>Quelle:</b> M. A. Pego Guerra, <i>Die Casting Design. A Parametric Approach</i>,
Carleton University, 1997, Kap. 2–3; dort nach CSIRO (P–Q², 1977) und Karni (Machine Performance
Envelope). Gleichungsnummern unten beziehen sich auf diese Arbeit.</p>

<h4>1 · Grundgrößen</h4>
${eq('A_{K} = \\frac{\\pi \\cdot D^{2}}{4} \\qquad p_{0} = \\frac{F_{G}}{A_{K}} = P_{\\text{acc}} \\cdot \\frac{A_{h}}{A_{K}} \\qquad Q_{\\text{dry}} = A_{K} \\cdot v_{\\text{dry}} \\qquad V_{a} = \\frac{m_{\\text{Bauteil}} + m_{\\text{Überlauf}}}{\\rho }')}
<p class="math-note">Die Gießkraft F<sub>G</sub> = P<sub>acc</sub>·A<sub>h</sub> stammt aus Akkumulatordruck × Antriebskolbenfläche;
die Maschinenkonstante ist der Antriebskolben A<sub>h</sub> = F<sub>max</sub>/P<sub>max</sub> (Preset: Gießkraft bei
max. Akkumulatordruck). Der <em>eingestellte</em> Akkumulatordruck (höchstens das Maximum) bestimmt die Gießkraft:
weniger Druck, weniger p₀ und weniger Leistung a. Aktuell F<sub>G</sub> = <b data-m="FG"></b>;
v<sub>dry</sub> ist die <b>Trockenschuss-Geschwindigkeit</b> (Kolben ohne Metall, alle Verluste im Schusskreis),
unser Eingabefeld „Kolbengeschw. max.". Aktuell: A<sub>K</sub> = <b data-m="AK"></b> · p₀ = <b data-m="p0"></b> ·
Q<sub>dry</sub> = <b data-m="Qmax"></b> · V<sub>a</sub> = <b data-m="Va"></b></p>

<h4>2 · Werkzeuglinie (Die Line) · Gl. 2.3/2.5</h4>
<p class="math-note">Energieerhaltung (Bernoulli) vom Kolben bis zum Anschnitt, Kavitätsdruck ≈ 0 bei
funktionierender Entlüftung. Alle Verluste stecken im zusammengesetzten Durchflussbeiwert:</p>
${eq('P = C_{t} \\cdot v_{a}^{2} \\quad (2.3) \\quad \\Rightarrow \\quad\\ \\text{mit}\\ v_{a} = Q/A_{a}: \\quad P_{W}(Q) = \\frac{C_{t}}{A_{a}^{2}} \\cdot Q^{2} \\quad (2.5) \\quad\\ \\text{mit}\\ \\quad C_{t} = \\frac{\\rho }{2 \\cdot C_{d}^{2}}')}
<p class="math-note">C<sub>d</sub> ≈ 0,5 für Aluminium, 0,5–0,6 für Zink; C<sub>t</sub> misst die Effizienz des
Lauf-/Anschnittsystems und wird in der Praxis aus Messungen bestimmt. Steigung der Geraden im Q²-Modus:
C<sub>W</sub> = C<sub>t</sub>/A<sub>a</sub>². Aktuell: C<sub>W</sub> = <b data-m="CW"></b></p>

<h4>3 · Maschinenlinie · Gl. 2.6–2.9</h4>
<p class="math-note">Hydraulikseite: P<sub>h</sub> = P<sub>acc</sub> − K<sub>v</sub>·v² (2.6); Kräftegleichgewicht am
Kolben P = P<sub>h</sub>·A<sub>h</sub>/A<sub>K</sub> (2.7). Mit v = Q/A<sub>K</sub> folgt die Karni-Form und daraus die
von CSIRO experimentell bestätigte Form über die Trockenschuss-Geschwindigkeit:</p>
${eq('P_{M}(Q) = P_{\\text{acc}} \\cdot \\frac{A_{h}}{A_{K}} - K_{t} \\cdot Q^{2} \\quad (2.8) \\quad \\Leftrightarrow \\quad P_{M}(Q) = p_{0} \\cdot \\left( 1 - \\frac{Q^{2}}{Q_{\\text{dry}}^{2}} \\right) \\quad (2.9)')}
<p class="math-note">Nullstellen: Q = 0 → voller statischer Druck p₀; Q = Q<sub>dry</sub> → alle Leistung geht in
die Kolbenbewegung, kein Druck aufs Metall. Im Q²-Modus eine Gerade mit Steigung −p₀/Q<sub>dry</sub>².</p>

<h4>4 · Hüllkurve (Machine Performance Envelope) · Gl. 2.10–2.14</h4>
<p class="math-note">Jeder Kolben-Ø liefert eine eigene Maschinenlinie. Die Hüllkurve ist die Einhüllende aller
dieser Linien. <b>Herleitung A (Karni, physikalisch)</b>: Die Leistung des Akkumulators ist näherungsweise
konstant, Power = P·A<sub>K</sub>·v = P<sub>acc</sub>·A<sub>h</sub>·v ≈ const (2.10–2.12), also eine Hyperbel P·Q = const:</p>
${eq('P_{\\text{env}}(Q) = \\frac{a}{Q} \\quad (2.13) \\quad\\ \\text{mit}\\ \\quad a = \\frac{2 \\cdot \\sqrt{3}}{9} \\cdot A_{h} \\cdot P_{\\text{acc}} \\cdot v_{\\text{dry}} = \\frac{2 \\cdot \\sqrt{3}}{9} \\cdot F_{G} \\cdot v_{\\text{dry}} \\quad (2.14)')}
<p class="math-note"><b>Herleitung B (formal)</b>: p<sub>M</sub>(Q; A<sub>K</sub>) = F<sub>G</sub>/A<sub>K</sub> − F<sub>G</sub>·Q²/(A<sub>K</sub>³·v<sub>dry</sub>²)
nach dem Scharparameter A<sub>K</sub> maximieren: ∂p/∂A<sub>K</sub> = 0 ⇒ A<sub>K,opt</sub>(Q) = √3·Q/v<sub>dry</sub>;
Einsetzen liefert dieselbe Hyperbel. Jede Kolbenparabel berührt die Hüllkurve genau einmal, bei
v<sub>p</sub> = v<sub>dry</sub>/√3 ≈ 0,577·v<sub>dry</sub> und P = ⅔·p₀(D). Die Hüllkurve ist eine reine
Maschineneigenschaft (unabhängig von Kolben und Werkzeug); a hat die Dimension einer Leistung: die
Energie, die der Akkumulator während der Einspritzphase an die Schmelze abgibt.</p>
<p class="math-note">Im Diagramm ist die Fläche <b>oberhalb</b> der Erreichbarkeitsgrenze
abgedeckt (Legende „Hüllkurve"): zwischen den Berührpunkten Q<sub>t</sub> = A<sub>K</sub>·v<sub>dry</sub>/√3 von Ø<sub>min</sub> und
Ø<sub>max</sub> ist das die Hüllkurve a/Q, außerhalb die Parabel des Grenz-Kolbens; dort kommt kein
Betriebspunkt hin, egal welcher Kolben montiert ist; alle anderen Grenzflächen sind darauf gestutzt. Aktuell:
a = <b data-m="aMPE"></b> · gültig für Q = <b data-m="Qt"></b> · Berührpunkt aktueller Kolben bei
<b data-m="Qtcur"></b> · optimaler Kolben-Ø am Arbeitspunkt: <b data-m="Dopt"></b></p>
<p class="math-note"><b>Achsen mit Kolbenbezug:</b> Die x-Achse v<sub>p</sub> = Q/A<sub>K</sub> ist die
Geschwindigkeit des <em>montierten</em> Kolbens; ein anderer Ø hätte bei gleichem Q eine andere v<sub>p</sub>.
Dieser Modus zeigt deshalb nur den montierten Kolben: die Achse endet bei v<sub>max</sub>, die Grenze der abgedeckten
Fläche ist seine Maschinenlinie, das hellere Band „anderer Kolben-Ø" entfällt. Auf der Hydraulikdruck-Achse wird jeder Punkt
mit der Fläche des Kolbens umgerechnet, der ihn erreicht (P<sub>h</sub> = P·A/A<sub>h</sub>,
A<sub>h</sub> = F<sub>G</sub>/P<sub>acc</sub>); die Antriebsseite bleibt so immer ≤ P<sub>acc</sub>, auch entlang
der Hüllkurve.</p>

<h4>5 · Arbeitspunkt · Gl. 2.15/2.16</h4>
<p class="math-note">Schnittpunkt Maschinen- × Werkzeuglinie. Mit der Hüllkurven-Konstante a lässt sich die
Maschinenlinie äquivalent schreiben und der Arbeitspunkt lösen:</p>
${eq('P_{M} = p_{0} \\cdot \\left( 1 - \\frac{4}{27} \\cdot \\frac{p_{0}^{2} \\cdot Q^{2}}{a^{2}} \\right) \\quad (2.15) \\quad \\Rightarrow \\quad Q_{s}^{2} = \\frac{p_{0}}{C_{t}/A_{a}^{2} + (4/27) \\cdot p_{0}^{2}/a^{2}} \\quad (2.16)')}
${eq('\\text{gleichwertig:}\\ \\quad Q_{s} = \\sqrt{\\frac{p_{0}}{C_{W} + p_{0} / Q_{\\text{dry}}^{2}}} \\qquad p_{s} = C_{W} \\cdot Q_{s}^{2}')}
<p class="math-note">Aktuell: Q<sub>s</sub> = <b data-m="Qs"></b> · p<sub>s</sub> = <b data-m="ps"></b></p>
<p class="math-note"><b>Schnittpunkt ≠ Betriebspunkt:</b> Der Schnittpunkt ist der Punkt, auf den sich die
<em>ungedrosselte</em> Maschine bei vollem Akkumulatordruck einstellt. Tatsächlich fährt die Schusskurve in der
2. Phase v₂; der reale Arbeitspunkt liegt auf der Werkzeuglinie bei Q = A<sub>K</sub>·v₂ mit
p = C<sub>W</sub>·Q²; liegt er unter dem Schnittpunkt, wird die Maschine gedrosselt (Ventil), und der Abstand zur
Maschinenlinie ist der verlorene Druck. Liegt er darüber, kann die Maschine diese v₂ nicht liefern.
Aktuell: v₂ = <b data-m="v2"></b> · Q = <b data-m="Qop"></b> · p = <b data-m="pOp"></b> ·
Maschinenlinie dort <b data-m="pMop"></b> · Drosselverlust <b data-m="dpOp"></b> · t<sub>f</sub> = <b data-m="tfop"></b></p>

<h4>6 · Achsenmodi und Operational Window · Gl. 3.1–3.3</h4>
<p class="math-note">Die Druckachse lässt sich in Anschnittgeschwindigkeit übersetzen, die
Volumenstromachse in Füllzeit: dieselben zwei Linien in vier Koordinaten:</p>
${eq('v_{a}(P) = C_{d} \\cdot \\sqrt{\\frac{2 \\cdot P}{\\rho }} \\quad (3.1) \\qquad v_{p} = \\frac{Q}{A_{K}} \\qquad t_{f} = \\frac{V_{a}}{Q} \\quad (3.3)')}
<p class="math-note">Das <b>Operational Window</b> ist das Rechteck [t<sub>f,min</sub>, t<sub>f,max</sub>] ×
[v<sub>a,min</sub>, v<sub>a,max</sub>]. Im PQ²-Plan wird es nach dem UPCT-TFG (Gl. 2.25–2.27) konvertiert:
die t<sub>f</sub>-Seiten sind Vertikalen bei Q = V<sub>a</sub>/t<sub>f</sub>, die v<sub>a</sub>-Seiten
Horizontalen auf der Druckachse, <b>unabhängig von der Anschnittfläche</b>:</p>
${eq('P(v_{a}) = \\frac{\\rho }{2} \\cdot \\left( \\frac{v_{a}}{C_{d}} \\right)^{2} \\quad\\ (\\text{UPCT 2.26}) \\qquad Q(t_{f}) = \\frac{V_{a}}{t_{f}} \\quad\\ (\\text{UPCT 2.27})')}
<p class="math-note">Die Werkzeuglinie schneidet die v<sub>a</sub>-Horizontale genau bei Q = v<sub>a</sub>·A<sub>a</sub>;
die alte Darstellung als Vertikale ist der Spezialfall „A<sub>a</sub> fest". Verletzungsfolgen (Fig. 3.1/3.2):
über t<sub>f,max</sub> (Zone A) kalte Läufe und schlechte Oberflächen, unter v<sub>a,min</sub> (B) poröser Guss
(keine Zerstäubung), unter t<sub>f,min</sub> (C) unvollständige Entlüftung, über v<sub>a,max</sub> (D) Formerosion
und Kleben. Aktuell: P(v<sub>a,min</sub>) = <b data-m="Pgmin"></b> · P(v<sub>a,max</sub>) = <b data-m="Pgmax"></b> ·
am Arbeitspunkt: v<sub>p</sub> = <b data-m="vp"></b> · v<sub>a</sub> = <b data-m="va"></b> ·
t<sub>f</sub> = <b data-m="tf"></b></p>

<h4>6b · y-Achsenmodi: Hydraulikdruck und Leistung</h4>
${eq('P_{h} = P \\cdot \\frac{A_{K}}{A_{h}} = P \\cdot \\frac{P_{\\text{acc}}}{p_{0}} \\qquad\\ \\text{Leistung}\\ = P \\cdot Q \\quad \\Rightarrow \\quad\\ \\text{Hüllkurve}\\ P \\cdot Q = a\\ \\text{wird die Horizontale}\\ y = a')}
<p class="math-note">Der Hydraulikdruck-Modus skaliert die Druckachse aufs Antriebssystem (Kräftegleichgewicht
am Kolben, statischer Achsenabschnitt = P<sub>acc</sub>); der Leistungsmodus zeigt P·Q; die Maschinenkurve
jedes Kolben-Ø berührt dort ihr Maximum exakt auf der a-Linie (bei v<sub>p</sub> = v<sub>dry</sub>/√3), die
v<sub>a</sub>-Fenstergrenzen werden zu Ursprungsgeraden y = P(v<sub>a</sub>)·Q.
<b>Hinweis:</b> auf der Hydraulik-Achse wird jeder Punkt mit der Fläche des Kolbens umgerechnet, der ihn
erreicht: der montierte Kolben liegt statisch beim eingestellten Akkumulatordruck, die Hüllkurve anderer Ø
bei ⅔ davon; nichts liegt über dem Akkumulatordruck. Aktuell:
P<sub>acc</sub> = <b data-m="pAccM"></b> · a = <b data-m="aMPE2"></b></p>

<h4>7 · Füllzeit- und v<sub>a</sub>-Grenzen</h4>
<p class="math-note">Untergrenzen der Füllzeit aus drei unabhängigen Bedingungen; die schärfste gilt:</p>
${eq('\\text{Entlüftung}\\\\ (\\text{Zone}\\ C): \\; t_{f} \\ge t_{\\text{vent}} = \\frac{V_{\\text{luft}}}{A_{\\text{ent}} \\cdot v_{\\text{luft},\\max}} \\qquad\\ \\text{Erosion:}\\ \\; t_{f} \\ge \\frac{V_{a}}{A_{a} \\cdot v_{a,\\max}} \\qquad\\ \\text{Hydraulik:}\\ \\; t_{f} \\ge \\frac{V_{a}}{A_{a} \\cdot v_{a,\\text{hydr}}} \\;\\ \\text{mit}\\ \\; v_{a,\\text{hydr}} = C_{d} \\cdot \\sqrt{\\frac{2 \\cdot p_{0}}{\\rho }}')}
${eq('\\text{Obergrenzen:}\\ \\; t_{f} \\le \\frac{V_{a}}{A_{a} \\cdot v_{a,\\min}} \\;\\ (\\text{Zerstäubung}) \\quad\\ \\text{und}\\ \\quad t_{f} \\le t_{\\max} \\;\\ (\\text{thermisch:}\\ \\text{NADCA-Formel, siehe}\\ \\text{“Empfohlene Füllzeit”})')}
<p class="math-note"><b>Zerstäubungsband (Herman-J-Faktor, UPCT Gl. 2.38):</b> unabhängig vom NADCA-Zielband
liefert das Atomisierungs-Kriterium ein Band der Anschnittgeschwindigkeit: unter J<sub>min</sub> zerstäubt der
Strahl nicht, über J<sub>max</sub> drohen Überzerstäubung und Formerosion:</p>
${eq('J = v_{a}^{1.71} \\cdot e_{p} \\cdot \\rho \\quad \\Rightarrow \\quad v_{a}(J) = \\left( \\frac{J}{\\rho \\cdot e_{p}} \\right)^{1/1.71} \\qquad J_{\\min} \\le J \\le J_{\\max}')}
<p class="math-note">Empirische Formel in inch-pound-Einheiten (v in in/s, Anschnittdicke e<sub>p</sub> in inch,
ρ in lb/in³); J<sub>min</sub> ≈ 750 gilt als konservativ (Herman [5], UPCT §2.3.3), J<sub>max</sub> ≈ 6000 als
Erosionsgrenze. Im Fenster wirkt je Seite die schärfere Grenze. Aktuell: J = <b data-m="Jat"></b> ·
e<sub>p</sub> = <b data-m="ep"></b> · v<sub>a</sub>(J<sub>min</sub>) = <b data-m="vaAtom"></b> ·
v<sub>a</sub>(J<sub>max</sub>) = <b data-m="vaAtomMax"></b></p>
<p class="math-note"><b>Volumen-Konvention:</b> V<sub>luft</sub> = Dosiervolumen ohne Pressrest (Bauteil + Anguss +
Überlauf), also die verdrängte Luft aus Kavität und Lauf; die Füllzeit-Achse rechnet dagegen ab Anschnitt mit
V<sub>a</sub> (Bauteil + Überlauf). Das UPCT-TFG nutzt für beides V<sub>m</sub> inkl. Anguss (Gl. 2.27);
hier gilt die App-Konvention (siehe Seitenleiste).
Aktuell: t<sub>vent</sub> = <b data-m="tVent"></b> · t<sub>min,Erosion</sub> = <b data-m="tminE"></b> ·
t<sub>min,J</sub> = <b data-m="tminJ"></b> (v<sub>a,hydr</sub> = <b data-m="vah"></b>) ·
t<sub>max,Zerstäubung</sub> = <b data-m="tmaxZ"></b> · Arbeitspunkt t<sub>f</sub> = <b data-m="tf2"></b></p>

<h4>8 · Extremwerte der Anschnittfläche · Kap. 3.3</h4>
<p class="math-note">Werkzeuglinien durch die Ecken des Operational Window liefern die zulässige Spanne der
Anschnittfläche (Fig. 3.3): steilste Linie durch (t<sub>f,max</sub>, v<sub>a,max</sub>), flachste durch
(t<sub>f,min</sub>, v<sub>a,min</sub>):</p>
${eq('A_{a,\\min} = \\frac{V_{a}}{t_{f,\\max} \\cdot v_{a,\\max}} \\qquad A_{a,\\max} = \\frac{V_{a}}{t_{f,\\min} \\cdot v_{a,\\min}} \\quad\\ \\text{mit}\\ \\; t_{f,\\min} = \\max(t_{\\text{vent}}, t_{\\min,J})')}
<p class="math-note">Die Länge der Werkzeuglinie innerhalb von Fenster und Hüllkurve ist nach Karni ein Maß für die
<b>Flexibilität</b> der Auslegung. Aktuell: zulässige Spanne <b data-m="AgRange"></b> · gewählt
A<sub>a</sub> = <b data-m="AgSel"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const c = pqCore(v);
    if (!c) {
      ['AK', 'p0', 'Qmax', 'Va', 'CW', 'Qs', 'ps', 'vp', 'va', 'tf', 'tf2', 'Qt', 'Qtcur', 'Dopt', 'aMPE',
        'vah', 'tminJ', 'tminE', 'tmaxZ', 'tVent', 'AgRange', 'AgSel', 'Pgmin', 'Pgmax', 'pAccM', 'aMPE2', 'FG',
        'Jat', 'ep', 'vaAtom', 'vaAtomMax', 'v2', 'Qop', 'pOp', 'pMop', 'dpOp', 'tfop'].forEach(k => set(k, '—'));
      return;
    }
    set('AK', fmt(pistonArea(v)) + ' mm²');
    set('p0', fmt(c.p0) + ' bar');
    set('Qmax', fmt(c.Qmax * 1000) + ' l/s');
    set('Va', fmt(c.Vag * 1e6) + ' cm³');
    const cw = c.Cdie / 1e6;
    set('CW', Number(cw.toPrecision(3)).toLocaleString('de-DE', { maximumFractionDigits: 6 }) + ' bar/(l/s)²');
    set('Qs', fmt(c.Qs * 1000) + ' l/s');
    set('ps', fmt(c.ps) + ' bar');
    set('vp', fmt(c.Qs / c.Ap) + ' m/s');
    set('va', fmt(c.Qs / c.Ag) + ' m/s');
    const tf = c.Vag / c.Qs * 1000;
    set('tf', fmt(tf) + ' ms');
    set('tf2', fmt(tf) + ' ms');
    /* Realer Betriebspunkt aus der Schusskurve */
    const v2 = shot && !shot.error && shot.v2 > 0 ? shot.v2 : null;
    if (v2 !== null) {
      const Qop = c.Ap * v2, pOp = c.Cdie * Qop * Qop;
      const pM = Qop < c.Qmax ? c.p0 * (1 - (Qop / c.Qmax) ** 2) : 0;
      set('v2', fmt(v2) + ' m/s'); set('Qop', fmt(Qop * 1000) + ' l/s'); set('pOp', fmt(pOp) + ' bar');
      set('pMop', Qop < c.Qmax ? fmt(pM) + ' bar' : '(über Q_dry)');
      set('dpOp', pM > pOp ? fmt(pM - pOp) + ' bar' : (Qop < c.Qmax ? 'keiner: v₂ über dem Schnittpunkt, nicht erreichbar' : 'nicht erreichbar'));
      set('tfop', fmt(c.Vag / Qop * 1000) + ' ms');
    } else ['v2', 'Qop', 'pOp', 'pMop', 'dpOp', 'tfop'].forEach(k => set(k, '(keine Schusskurve)'));
    /* Operational Window auf der Druckachse + y-Modi */
    const Pg = vg => v.density * (vg / v.Cd) * (vg / v.Cd) / 2 / 1e5;
    set('Pgmin', v.gateMin > 0 ? fmt(Pg(v.gateMin)) + ' bar' : '—');
    set('Pgmax', v.gateMax > 0 ? fmt(Pg(v.gateMax)) + ' bar' : '—');
    set('pAccM', v.pAcc > 0 ? fmt(Math.min(v.pAccOp, v.pAcc)) + ' bar eingestellt (max. ' + fmt(v.pAcc) + ' bar, A_h = ' + fmt(v.injForce / v.pAcc * 100) + ' cm²)' : '—');
    set('FG', fmt(c.FG) + ' kN (max. ' + fmt(v.injForce) + ' kN bei ' + fmt(v.pAcc) + ' bar)');
    set('aMPE2', fmt(c.aMPE / 1e6) + ' MW');
    /* Hüllkurve */
    set('aMPE', fmt(c.aMPE / 1e6) + ' MW');
    set('Qt', fmt(c.QtLo * 1000) + '–' + fmt(c.QtHi * 1000) + ' l/s (Ø ' + fmt(v.dmin) + '–' + fmt(v.dmax) + ')');
    set('Qtcur', fmt(c.Ap * v.vmax / S3 * 1000) + ' l/s (v_p = ' + fmt(v.vmax / S3) + ' m/s, P = ' + fmt(2 * c.p0 / 3) + ' bar)');
    const Dopt = Math.sqrt(4 * S3 * c.Qs / (PI * v.vmax)) * 1000;
    set('Dopt', 'Ø ' + fmt(Dopt) + ' mm (A_opt = √3·Q_s/v_dry)');
    /* Füllzeitgrenzen */
    set('vah', fmt(c.vaHydr) + ' m/s');
    set('Jat', v.JatomMin > 0 ? fmt(v.JatomMin) + '–' + fmt(v.JatomMax) : '—');
    set('ep', v.gateTh > 0 ? fmt(v.gateTh) + ' mm (' + fmt(v.gateTh / 25.4) + ' in)' : '—');
    set('vaAtom', isFinite(c.vaAtom) ? fmt(c.vaAtom) + ' m/s (' + fmt(c.vaAtom / 0.0254) + ' in/s)' : '—');
    set('vaAtomMax', isFinite(c.vaAtomMax) ? fmt(c.vaAtomMax) + ' m/s' : '—');
    const tminJ = c.Vag / (c.Ag * c.vaHydr) * 1000;
    set('tminJ', fmt(tminJ) + ' ms');
    set('tminE', v.gateMax > 0 ? fmt(c.Vag / (c.Ag * v.gateMax) * 1000) + ' ms' : '—');
    set('tmaxZ', v.gateMin > 0 ? fmt(c.Vag / (c.Ag * v.gateMin) * 1000) + ' ms' : '—');
    set('tVent', isFinite(c.tVent) ? fmt(c.tVent * 1000) + ' ms' : '—');
    /* Extremwerte der Anschnittfläche */
    const tfMinS = Math.max(isFinite(c.tVent) ? c.tVent : 0, tminJ / 1000);
    const tfMaxS = v.tmax > 0 ? v.tmax / 1000 : NaN;
    if (tfMaxS > 0 && tfMinS > 0 && v.gateMin > 0 && v.gateMax > 0) {
      const AgMin = c.Vag / (tfMaxS * v.gateMax) * 1e6;
      const AgMax = c.Vag / (tfMinS * v.gateMin) * 1e6;
      const ok = v.gate >= AgMin && v.gate <= AgMax;
      set('AgRange', fmt(AgMin) + '–' + fmt(AgMax) + ' mm²');
      set('AgSel', fmt(v.gate) + ' mm² ' + (ok ? '✓ innerhalb' : '✗ außerhalb'));
    } else {
      set('AgRange', '—'); set('AgSel', fmt(v.gate) + ' mm²');
    }
  }
};
