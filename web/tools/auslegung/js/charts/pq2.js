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
import { seq, fmt } from '../core/format.js';
import { pistonArea, afterGate, total } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { eq } from './mathfmt.js';

const PI = Math.PI, S3 = Math.sqrt(3);

/* Gemeinsame Kerngrößen für calc(), renderMath() und die KPI-Zeile
   (ui/kpis.js) — die eine Implementierung des Arbeitspunkts. null bei
   ungültigen Eingaben. */
export function pqCore(v) {
  if (!(v.gate > 0) || !(v.Cd > 0) || !(v.vmax > 0) || !(v.injForce > 0) || !(v.density > 0) || !(v.diam > 0)) return null;
  const Ap = pistonArea(v) * 1e-6;                              // Kolbenfläche m²
  const p0 = v.injForce * 1e4 / pistonArea(v);                  // statischer Metalldruck bar (= P_acc·A_h/A_K)
  const Qmax = Ap * v.vmax;                                     // Trockenschuss-Volumenstrom m³/s
  const Ag = v.gate * 1e-6;                                     // Anschnittfläche m²
  const Cdie = v.density / (2 * v.Cd * v.Cd * Ag * Ag) / 1e5;   // Werkzeugkonstante C_t/A_g² in bar/(m³/s)²
  const Qs = Math.sqrt(p0 / (Cdie + p0 / (Qmax * Qmax)));       // Arbeitspunkt m³/s
  const Vag = afterGate(v) / v.density;                         // Volumen ab Anschnitt m³
  /* Machine Performance Envelope (Pego Guerra Gl. 2.13/2.14):
     P = a/Q mit a = (2√3/9)·F_G·v_dry — Leistungskonstante des Akkumulators.
     Gültig zwischen den Berührpunkten Q_t = A_K·v_dry/√3 von Ø min und Ø max. */
  const aMPE = (2 * S3 / 9) * (v.injForce * 1e3) * v.vmax;      // W
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
       graue Maske hinein. */
    const rc = Q / Qmax;
    const pA = v.injForce * 1e3 / (A * 1e5) * (1 - r * r), pM = p0 * (1 - rc * rc);
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
  const tVent = (v.vent > 0 && v.vAirMax > 0) ? (total(v) / v.density) / (v.vent * 1e-6 * v.vAirMax) : NaN;
  return { Ap, p0, Qmax, Ag, Cdie, Qs, Vag, ps: Cdie * Qs * Qs, aMPE, pEnv, pReach, aReach, QtLo, QtHi, Alo, Ahi, vaHydr, vaAtom, vaAtomMax, tVent };
}

export default {
  id: 'pq2',
  title: 'PQ²-Diagramm (Arbeitspunkt)',
  desc: 'Maschine × Werkzeug · Hüllkurve · Operational Window · x: Q, Q², v_p, t_f · y: p_m, p_hyd, P·Q',
  tab: 'q',
  tabs: [['q', 'Q'], ['q2', 'Q²'], ['vp', 'v<sub>p</sub>'], ['tf', 't<sub>f</sub>']],
  tab2: 'pm',
  tabs2: [['pm', 'p<sub>m</sub>'], ['ph', 'p<sub>hyd</sub>'], ['pw', 'P·Q']],
  inputs: ['gate', 'Cd', 'vmax', 'injForce', 'diam', 'dmin', 'dmax', 'density', 'part', 'runner', 'overflow', 'vent', 'vAirMax', 'tmax', 'gateMin', 'gateMax', 'pAcc', 'gateTh', 'JatomMin', 'JatomMax'],

  calc(v) {
    const c = pqCore(v);
    if (!c) return { err: 'Anschnittfläche, Cd, v_max und Gießkraft müssen > 0 sein.' };
    const C = theme.chart;
    const { Ap, p0, Qmax, Ag, Cdie, Qs, Vag, pEnv, QtLo, QtHi, tVent } = c;
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
    const QmaxAll = pistonOnly ? Qmax : Math.max(Qmax, c.Ahi > 0 ? c.Ahi * v.vmax : 0);
    const pTop = pistonOnly ? p0 : Math.max(p0, c.Alo > 0 ? v.injForce * 1e3 / (c.Alo * 1e5) : p0);

    /* x-Achse: fx bildet Q → Achsenwert ab, ix ist die Umkehrung (für
       Kurvenschranken, die als Funktion des Achsenwerts ausgewertet werden). */
    let fx, ix, xl, Qlo = 0;
    if (tb === 'q') { fx = Q => Q * 1000; ix = x => x / 1000; xl = 'Durchfluss Q in l/s'; }
    else if (tb === 'q2') { fx = Q => Q * Q * 1e6; ix = x => Math.sqrt(Math.max(x, 0)) / 1000; xl = 'Q² in (l/s)² — Maschinenlinie wird Gerade'; }
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
      if (!(v.pAcc > 0)) return { err: 'Akkumulatordruck muss > 0 sein für die Hydraulikdruck-Achse.' };
      fy = (P, Q, A = Ap) => 100 * P * A * v.pAcc / v.injForce;
      yl = 'Hydraulikdruck (Antriebsseite) in bar'; yUnit = ' bar'; y1 = v.pAcc * 1.05;
    } else if (yb === 'pw') {
      fy = (P, Q) => P * 1e5 * Q / 1e6; yl = 'Leistung P·Q in MW'; yUnit = ' MW'; y1 = c.aMPE / 1e6 * 1.15;
    } else {
      fy = P => P; yl = 'Metalldruck in bar'; yUnit = ' bar'; y1 = pTop * 1.05;
    }

    const Qarr = seq(Math.max(Qlo, QmaxAll * 1e-4), QmaxAll, 200);
    if (tb === 'tf') Qarr.reverse();
    const x = Qarr.map(fx);

    /* Hüllkurve/Erreichbarkeitsgrenze ist keine Serie mehr, sondern die
       Masken-Grenze unten (graue Deckfläche oberhalb, schwarze Frontlinie). */
    const machineLine = Q => p0 * (1 - (Q / Qmax) * (Q / Qmax));
    const ys = [
      /* Maschinenlinie endet bei Q_dry des gewählten Kolbens (NaN dahinter);
         im v_p-Modus ist sie die Grenzlinie der Maske selbst. */
      ...(pistonOnly ? [] : [series('Maschine (Ø ' + fmt(v.diam) + ')', C.series4, Qarr,
        Q => Q <= Qmax ? fy(machineLine(Q), Q) : NaN)]),
      series('Werkzeug', C.series2, Qarr, Q => fy(Cdie * Q * Q, Q))
    ];

    const q = line(x, ys, xl, yl,
      'Statisch ' + fmt(p0) + ' bar · Q_dry ' + fmt(Qmax * 1000) + ' l/s · Cd=' + fmt(v.Cd)
      + (pistonOnly ? ' · nur Kolben Ø ' + fmt(v.diam) + ' (v_p ≤ v_max ' + fmt(v.vmax) + ' m/s)'
        : ' · Hüllkurve a = ' + fmt(c.aMPE / 1e6) + ' MW (Ø ' + fmt(v.dmin) + '–' + fmt(v.dmax) + ')')
      + (yb === 'ph' ? ' · P_acc ' + fmt(v.pAcc) + ' bar' : ''));
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

    /* Erreichbarkeitsgrenze als Maske: oberhalb grau (für keinen Kolben-Ø
       erreichbar), alle anderen Grenzen werden darauf gestutzt. Im
       Leistungsmodus wird die Hüllkurve dabei zur Horizontalen y = a. */
    if (pistonOnly) {
      q.limits.push(limit('mpe', 'Maschine Ø ' + fmt(v.diam) + ' (darüber unerreichbar)', 'y', 'max',
        xv => { const Q = ix(xv); return Q <= Qmax ? fy(machineLine(Q), Q) : 0; }, { mask: true, note: 'unerreichbar (Ø ' + fmt(v.diam) + ')' }));
    } else {
      q.limits.push(limit('mpe', 'Hüllkurve a = ' + fmt(c.aMPE / 1e6) + ' MW', 'y', 'max',
        xv => { const Q = ix(xv); return fy(c.pReach(Q), Q, c.aReach(Q)); }, { mask: true, note: 'unerreichbar (alle Ø)' }));
    }

    /* Grünes machbares Band (wie im (φ, λ)-Fenster): Schnittmenge aller
       harten Grenzen. Oberhalb der Maschinenlinie des aktuellen Kolbens
       heller — Fenster erfüllt, aber nur mit anderem Ø erreichbar (entfällt
       im v_p-Modus, der nur den montierten Kolben zeigt).
       Grenzen sind nur in der Legende benannt (kein Text im Diagramm). */
    q.feasible = 'machbares Band';
    if (!pistonOnly) q.feasibleSplit = {
      fn: xv => fy(machineLine(ix(xv)), ix(xv)),
      label: 'machbar (anderer Kolben-Ø)'
    };
    q.limitText = 'legend';

    const opx = fx(Qs), opy = fy(Cdie * Qs * Qs, Qs);
    const unit = tb === 'q' ? ' l/s' : tb === 'q2' ? ' (l/s)²' : tb === 'vp' ? ' m/s' : ' ms';
    q.pt = [opx, opy];
    q.ptl = 'Arbeitspunkt ' + fmt(opx) + unit + ' / ' + fmt(opy) + yUnit;
    return q;
  },

  /* Mathe-Erklärung nach Pego Guerra (1997), Kap. 2–3. Live-Werte via data-m. */
  mathHTML() {
    return `
<p class="math-note"><b>Quelle:</b> M. A. Pego Guerra, <i>Die Casting Design. A Parametric Approach</i>,
Carleton University, 1997, Kap. 2–3 — dort nach CSIRO (P–Q², 1977) und Karni (Machine Performance
Envelope). Gleichungsnummern unten beziehen sich auf diese Arbeit.</p>

<h4>1 · Grundgrößen</h4>
${eq('A_{K} = \\frac{\\pi \\cdot D^{2}}{4} \\qquad p_{0} = \\frac{F_{G}}{A_{K}} = P_{\\text{acc}} \\cdot \\frac{A_{h}}{A_{K}} \\qquad Q_{\\text{dry}} = A_{K} \\cdot v_{\\text{dry}} \\qquad V_{a} = \\frac{m_{\\text{Bauteil}} + m_{\\text{Überlauf}}}{\\rho }')}
<p class="math-note">Die Gießkraft F<sub>G</sub> = P<sub>acc</sub>·A<sub>h</sub> stammt aus Akkumulatordruck × Antriebskolbenfläche;
v<sub>dry</sub> ist die <b>Trockenschuss-Geschwindigkeit</b> (Kolben ohne Metall, alle Verluste im Schusskreis) —
unser Eingabefeld „Kolbengeschw. max.". Aktuell: A<sub>K</sub> = <b data-m="AK"></b> · p₀ = <b data-m="p0"></b> ·
Q<sub>dry</sub> = <b data-m="Qmax"></b> · V<sub>a</sub> = <b data-m="Va"></b></p>

<h4>2 · Werkzeuglinie (Die Line) — Gl. 2.3/2.5</h4>
<p class="math-note">Energieerhaltung (Bernoulli) vom Kolben bis zum Anschnitt, Kavitätsdruck ≈ 0 bei
funktionierender Entlüftung. Alle Verluste stecken im zusammengesetzten Durchflussbeiwert:</p>
${eq('P = C_{t} \\cdot v_{a}^{2} \\quad (2.3) \\quad \\Rightarrow \\quad\\ \\text{mit}\\ v_{a} = Q/A_{a}: \\quad P_{W}(Q) = \\frac{C_{t}}{A_{a}^{2}} \\cdot Q^{2} \\quad (2.5) \\quad\\ \\text{mit}\\ \\quad C_{t} = \\frac{\\rho }{2 \\cdot C_{d}^{2}}')}
<p class="math-note">C<sub>d</sub> ≈ 0,5 für Aluminium, 0,5–0,6 für Zink; C<sub>t</sub> misst die Effizienz des
Lauf-/Anschnittsystems und wird in der Praxis aus Messungen bestimmt. Steigung der Geraden im Q²-Modus:
C<sub>W</sub> = C<sub>t</sub>/A<sub>a</sub>². Aktuell: C<sub>W</sub> = <b data-m="CW"></b></p>

<h4>3 · Maschinenlinie — Gl. 2.6–2.9</h4>
<p class="math-note">Hydraulikseite: P<sub>h</sub> = P<sub>acc</sub> − K<sub>v</sub>·v² (2.6); Kräftegleichgewicht am
Kolben P = P<sub>h</sub>·A<sub>h</sub>/A<sub>K</sub> (2.7). Mit v = Q/A<sub>K</sub> folgt die Karni-Form und daraus die
von CSIRO experimentell bestätigte Form über die Trockenschuss-Geschwindigkeit:</p>
${eq('P_{M}(Q) = P_{\\text{acc}} \\cdot \\frac{A_{h}}{A_{K}} - K_{t} \\cdot Q^{2} \\quad (2.8) \\quad \\Leftrightarrow \\quad P_{M}(Q) = p_{0} \\cdot \\left( 1 - \\frac{Q^{2}}{Q_{\\text{dry}}^{2}} \\right) \\quad (2.9)')}
<p class="math-note">Nullstellen: Q = 0 → voller statischer Druck p₀; Q = Q<sub>dry</sub> → alle Leistung geht in
die Kolbenbewegung, kein Druck aufs Metall. Im Q²-Modus eine Gerade mit Steigung −p₀/Q<sub>dry</sub>².</p>

<h4>4 · Hüllkurve (Machine Performance Envelope) — Gl. 2.10–2.14</h4>
<p class="math-note">Jeder Kolben-Ø liefert eine eigene Maschinenlinie. Die Hüllkurve ist die Einhüllende aller
dieser Linien — <b>Herleitung A (Karni, physikalisch)</b>: Die Leistung des Akkumulators ist näherungsweise
konstant, Power = P·A<sub>K</sub>·v = P<sub>acc</sub>·A<sub>h</sub>·v ≈ const (2.10–2.12) — eine Hyperbel P·Q = const:</p>
${eq('P_{\\text{env}}(Q) = \\frac{a}{Q} \\quad (2.13) \\quad\\ \\text{mit}\\ \\quad a = \\frac{2 \\cdot \\sqrt{3}}{9} \\cdot A_{h} \\cdot P_{\\text{acc}} \\cdot v_{\\text{dry}} = \\frac{2 \\cdot \\sqrt{3}}{9} \\cdot F_{G} \\cdot v_{\\text{dry}} \\quad (2.14)')}
<p class="math-note"><b>Herleitung B (formal)</b>: p<sub>M</sub>(Q; A<sub>K</sub>) = F<sub>G</sub>/A<sub>K</sub> − F<sub>G</sub>·Q²/(A<sub>K</sub>³·v<sub>dry</sub>²)
nach dem Scharparameter A<sub>K</sub> maximieren: ∂p/∂A<sub>K</sub> = 0 ⇒ A<sub>K,opt</sub>(Q) = √3·Q/v<sub>dry</sub>;
Einsetzen liefert dieselbe Hyperbel. Jede Kolbenparabel berührt die Hüllkurve genau einmal — bei
v<sub>p</sub> = v<sub>dry</sub>/√3 ≈ 0,577·v<sub>dry</sub> und P = ⅔·p₀(D). Die Hüllkurve ist eine reine
Maschineneigenschaft (unabhängig von Kolben und Werkzeug); a hat die Dimension einer Leistung — die
Energie, die der Akkumulator während der Einspritzphase an die Schmelze abgibt.</p>
<p class="math-note">Im Diagramm ist die Fläche <b>oberhalb</b> der Erreichbarkeitsgrenze grau
maskiert: zwischen den Berührpunkten Q<sub>t</sub> = A<sub>K</sub>·v<sub>dry</sub>/√3 von Ø<sub>min</sub> und
Ø<sub>max</sub> ist das die Hüllkurve a/Q, außerhalb die Parabel des Grenz-Kolbens — dort kommt kein
Betriebspunkt hin, egal welcher Kolben montiert ist; alle anderen Grenzflächen sind darauf gestutzt. Aktuell:
a = <b data-m="aMPE"></b> · gültig für Q = <b data-m="Qt"></b> · Berührpunkt aktueller Kolben bei
<b data-m="Qtcur"></b> · optimaler Kolben-Ø am Arbeitspunkt: <b data-m="Dopt"></b></p>
<p class="math-note"><b>Achsen mit Kolbenbezug:</b> Die x-Achse v<sub>p</sub> = Q/A<sub>K</sub> ist die
Geschwindigkeit des <em>montierten</em> Kolbens — ein anderer Ø hätte bei gleichem Q eine andere v<sub>p</sub>.
Dieser Modus zeigt deshalb nur den montierten Kolben: die Achse endet bei v<sub>max</sub>, die graue Grenze ist
seine Maschinenlinie, das hellere Band „anderer Kolben-Ø" entfällt. Auf der Hydraulikdruck-Achse wird jeder Punkt
mit der Fläche des Kolbens umgerechnet, der ihn erreicht (P<sub>h</sub> = P·A/A<sub>h</sub>,
A<sub>h</sub> = F<sub>G</sub>/P<sub>acc</sub>) — die Antriebsseite bleibt so immer ≤ P<sub>acc</sub>, auch entlang
der Hüllkurve.</p>

<h4>5 · Arbeitspunkt — Gl. 2.15/2.16</h4>
<p class="math-note">Schnittpunkt Maschinen- × Werkzeuglinie. Mit der Hüllkurven-Konstante a lässt sich die
Maschinenlinie äquivalent schreiben und der Arbeitspunkt lösen:</p>
${eq('P_{M} = p_{0} \\cdot \\left( 1 - \\frac{4}{27} \\cdot \\frac{p_{0}^{2} \\cdot Q^{2}}{a^{2}} \\right) \\quad (2.15) \\quad \\Rightarrow \\quad Q_{s}^{2} = \\frac{p_{0}}{C_{t}/A_{a}^{2} + (4/27) \\cdot p_{0}^{2}/a^{2}} \\quad (2.16)')}
${eq('\\text{gleichwertig:}\\ \\quad Q_{s} = \\sqrt{\\frac{p_{0}}{C_{W} + p_{0} / Q_{\\text{dry}}^{2}}} \\qquad p_{s} = C_{W} \\cdot Q_{s}^{2}')}
<p class="math-note">Aktuell: Q<sub>s</sub> = <b data-m="Qs"></b> · p<sub>s</sub> = <b data-m="ps"></b></p>

<h4>6 · Achsenmodi und Operational Window — Gl. 3.1–3.3</h4>
<p class="math-note">Die Druckachse lässt sich in Anschnittgeschwindigkeit übersetzen, die
Volumenstromachse in Füllzeit — dieselben zwei Linien in vier Koordinaten:</p>
${eq('v_{a}(P) = C_{d} \\cdot \\sqrt{\\frac{2 \\cdot P}{\\rho }} \\quad (3.1) \\qquad v_{p} = \\frac{Q}{A_{K}} \\qquad t_{f} = \\frac{V_{a}}{Q} \\quad (3.3)')}
<p class="math-note">Das <b>Operational Window</b> ist das Rechteck [t<sub>f,min</sub>, t<sub>f,max</sub>] ×
[v<sub>a,min</sub>, v<sub>a,max</sub>]. Im PQ²-Plan wird es nach dem UPCT-TFG (Gl. 2.25–2.27) konvertiert:
die t<sub>f</sub>-Seiten sind Vertikalen bei Q = V<sub>a</sub>/t<sub>f</sub>, die v<sub>a</sub>-Seiten
Horizontalen auf der Druckachse — <b>unabhängig von der Anschnittfläche</b>:</p>
${eq('P(v_{a}) = \\frac{\\rho }{2} \\cdot \\left( \\frac{v_{a}}{C_{d}} \\right)^{2} \\quad\\ (\\text{UPCT 2.26}) \\qquad Q(t_{f}) = \\frac{V_{a}}{t_{f}} \\quad\\ (\\text{UPCT 2.27})')}
<p class="math-note">Die Werkzeuglinie schneidet die v<sub>a</sub>-Horizontale genau bei Q = v<sub>a</sub>·A<sub>a</sub> —
die alte Darstellung als Vertikale ist der Spezialfall „A<sub>a</sub> fest". Verletzungsfolgen (Fig. 3.1/3.2):
über t<sub>f,max</sub> (Zone A) kalte Läufe und schlechte Oberflächen, unter v<sub>a,min</sub> (B) poröser Guss
(keine Zerstäubung), unter t<sub>f,min</sub> (C) unvollständige Entlüftung, über v<sub>a,max</sub> (D) Formerosion
und Kleben. Aktuell: P(v<sub>a,min</sub>) = <b data-m="Pgmin"></b> · P(v<sub>a,max</sub>) = <b data-m="Pgmax"></b> ·
am Arbeitspunkt: v<sub>p</sub> = <b data-m="vp"></b> · v<sub>a</sub> = <b data-m="va"></b> ·
t<sub>f</sub> = <b data-m="tf"></b></p>

<h4>6b · y-Achsenmodi: Hydraulikdruck und Leistung</h4>
${eq('P_{h} = P \\cdot \\frac{A_{K}}{A_{h}} = P \\cdot \\frac{P_{\\text{acc}}}{p_{0}} \\qquad\\ \\text{Leistung}\\ = P \\cdot Q \\quad \\Rightarrow \\quad\\ \\text{Hüllkurve}\\ P \\cdot Q = a\\ \\text{wird die Horizontale}\\ y = a')}
<p class="math-note">Der Hydraulikdruck-Modus skaliert die Druckachse aufs Antriebssystem (Kräftegleichgewicht
am Kolben, statischer Achsenabschnitt = P<sub>acc</sub>); der Leistungsmodus zeigt P·Q — die Maschinenkurve
jedes Kolben-Ø berührt dort ihr Maximum exakt auf der a-Linie (bei v<sub>p</sub> = v<sub>dry</sub>/√3), die
v<sub>a</sub>-Fenstergrenzen werden zu Ursprungsgeraden y = P(v<sub>a</sub>)·Q.
<b>Hinweis:</b> die Hydraulik-Achse ist exakt für den gewählten Kolben; Kurven anderer Ø (Erreichbarkeits-
grenze) sind auf dieser Achse nur umskalierter Metalldruck — ihre Werte oberhalb P<sub>acc</sub> sind
Äquivalenzwerte, keine realen Hydraulikdrücke (ein kleinerer Kolben erzeugt mehr Metalldruck bei
gleichem P<sub>acc</sub>). Aktuell:
P<sub>acc</sub> = <b data-m="pAccM"></b> · a = <b data-m="aMPE2"></b></p>

<h4>7 · Füllzeit- und v_a-Grenzen</h4>
<p class="math-note">Untergrenzen der Füllzeit aus drei unabhängigen Bedingungen; die schärfste gilt:</p>
${eq('\\text{Entlüftung}\\\\ (\\text{Zone}\\ C): \\; t_{f} \\ge t_{\\text{vent}} = \\frac{V_{\\text{luft}}}{A_{\\text{ent}} \\cdot v_{\\text{luft},\\max}} \\qquad\\ \\text{Erosion:}\\ \\; t_{f} \\ge \\frac{V_{a}}{A_{a} \\cdot v_{a,\\max}} \\qquad\\ \\text{Hydraulik:}\\ \\; t_{f} \\ge \\frac{V_{a}}{A_{a} \\cdot v_{a,\\text{hydr}}} \\;\\ \\text{mit}\\ \\; v_{a,\\text{hydr}} = C_{d} \\cdot \\sqrt{\\frac{2 \\cdot p_{0}}{\\rho }}')}
${eq('\\text{Obergrenzen:}\\ \\; t_{f} \\le \\frac{V_{a}}{A_{a} \\cdot v_{a,\\min}} \\;\\ (\\text{Zerstäubung}) \\quad\\ \\text{und}\\ \\quad t_{f} \\le t_{\\max} \\;\\ (\\text{thermisch}\\ \\;\\text{—}\\; \\ \\text{NADCA-Formel, siehe}\\ \\text{“Empfohlene Füllzeit”})')}
<p class="math-note"><b>Zerstäubungsband (Herman-J-Faktor, UPCT Gl. 2.38):</b> unabhängig vom NADCA-Zielband
liefert das Atomisierungs-Kriterium ein Band der Anschnittgeschwindigkeit — unter J<sub>min</sub> zerstäubt der
Strahl nicht, über J<sub>max</sub> drohen Überzerstäubung und Formerosion:</p>
${eq('J = v_{a}^{1.71} \\cdot e_{p} \\cdot \\rho \\quad \\Rightarrow \\quad v_{a}(J) = \\left( \\frac{J}{\\rho \\cdot e_{p}} \\right)^{1/1.71} \\qquad J_{\\min} \\le J \\le J_{\\max}')}
<p class="math-note">Empirische Formel in inch-pound-Einheiten (v in in/s, Anschnittdicke e<sub>p</sub> in inch,
ρ in lb/in³); J<sub>min</sub> ≈ 750 gilt als konservativ (Herman [5], UPCT §2.3.3), J<sub>max</sub> ≈ 6000 als
Erosionsgrenze. Im Fenster wirkt je Seite die schärfere Grenze. Aktuell: J = <b data-m="Jat"></b> ·
e<sub>p</sub> = <b data-m="ep"></b> · v<sub>a</sub>(J<sub>min</sub>) = <b data-m="vaAtom"></b> ·
v<sub>a</sub>(J<sub>max</sub>) = <b data-m="vaAtomMax"></b></p>
<p class="math-note"><b>Volumen-Konvention:</b> V<sub>luft</sub> = Dosiervolumen ohne Pressrest (Bauteil + Anguss +
Überlauf) — die verdrängte Luft aus Kavität und Lauf; die Füllzeit-Achse rechnet dagegen ab Anschnitt mit
V<sub>a</sub> (Bauteil + Überlauf). Das UPCT-TFG nutzt für beides V<sub>m</sub> inkl. Anguss (Gl. 2.27) —
hier gilt die App-Konvention (siehe Seitenleiste).
Aktuell: t<sub>vent</sub> = <b data-m="tVent"></b> · t<sub>min,Erosion</sub> = <b data-m="tminE"></b> ·
t<sub>min,J</sub> = <b data-m="tminJ"></b> (v<sub>a,hydr</sub> = <b data-m="vah"></b>) ·
t<sub>max,Zerstäubung</sub> = <b data-m="tmaxZ"></b> · Arbeitspunkt t<sub>f</sub> = <b data-m="tf2"></b></p>

<h4>8 · Extremwerte der Anschnittfläche — Kap. 3.3</h4>
<p class="math-note">Werkzeuglinien durch die Ecken des Operational Window liefern die zulässige Spanne der
Anschnittfläche (Fig. 3.3): steilste Linie durch (t<sub>f,max</sub>, v<sub>a,max</sub>), flachste durch
(t<sub>f,min</sub>, v<sub>a,min</sub>):</p>
${eq('A_{a,\\min} = \\frac{V_{a}}{t_{f,\\max} \\cdot v_{a,\\max}} \\qquad A_{a,\\max} = \\frac{V_{a}}{t_{f,\\min} \\cdot v_{a,\\min}} \\quad\\ \\text{mit}\\ \\; t_{f,\\min} = \\max(t_{\\text{vent}}, t_{\\min,J})')}
<p class="math-note">Die Länge der Werkzeuglinie innerhalb von Fenster und Hüllkurve ist nach Karni ein Maß für die
<b>Flexibilität</b> der Auslegung. Aktuell: zulässige Spanne <b data-m="AgRange"></b> · gewählt
A<sub>a</sub> = <b data-m="AgSel"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const c = pqCore(v);
    if (!c) {
      ['AK', 'p0', 'Qmax', 'Va', 'CW', 'Qs', 'ps', 'vp', 'va', 'tf', 'tf2', 'Qt', 'Qtcur', 'Dopt', 'aMPE',
        'vah', 'tminJ', 'tminE', 'tmaxZ', 'tVent', 'AgRange', 'AgSel', 'Pgmin', 'Pgmax', 'pAccM', 'aMPE2',
        'Jat', 'ep', 'vaAtom', 'vaAtomMax'].forEach(k => set(k, '—'));
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
    /* Operational Window auf der Druckachse + y-Modi */
    const Pg = vg => v.density * (vg / v.Cd) * (vg / v.Cd) / 2 / 1e5;
    set('Pgmin', v.gateMin > 0 ? fmt(Pg(v.gateMin)) + ' bar' : '—');
    set('Pgmax', v.gateMax > 0 ? fmt(Pg(v.gateMax)) + ' bar' : '—');
    set('pAccM', v.pAcc > 0 ? fmt(v.pAcc) + ' bar (A_h = ' + fmt(v.injForce / v.pAcc * 100) + ' cm²)' : '—');
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
