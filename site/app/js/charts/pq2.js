/* PQ²-Diagramm nach dem Formalismus von M. A. Pego Guerra, „Die Casting
   Design. A Parametric Approach", Carleton University 1997 (Kap. 2–3),
   dort nach CSIRO [23] und Karni [13]:
   – Werkzeuglinie (Die Line):      P = (C_t/A_g²)·Q²,  C_t = ρ/(2·C_d²)
   – Maschinenlinie (CSIRO-Form):   P = p₀·(1 − Q²/Q_dry²)
   – Machine Performance Envelope:  P = a/Q,  a = (2√3/9)·F_G·v_dry
   – Operational Window: t_f- und v_a-Grenzen inkl. Entlüftungsbedingung.
   Achsenmodi Q / Q² / v_p / t_f. */

import { series, line } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { pistonArea, afterGate, total } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { frac, sqrt } from './mathfmt.js';

const PI = Math.PI, S3 = Math.sqrt(3);

/* Gemeinsame Kerngrößen für calc() und renderMath(). null bei ungültigen Eingaben. */
function pqCore(v) {
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
  /* Hydraulische v_a-Grenze (J-Faktor, J = C_d): v_a = J·√(2·p₀/ρ) */
  const vaHydr = v.Cd * Math.sqrt(2 * p0 * 1e5 / v.density);
  /* Minimale Füllzeit aus der Entlüftungsbedingung (Operational Window, Zone C):
     die verdrängte Luft V_luft muss durch A_ent mit höchstens v_luft,max entweichen. */
  const tVent = (v.vent > 0 && v.vAirMax > 0) ? (total(v) / v.density) / (v.vent * 1e-6 * v.vAirMax) : NaN;
  return { Ap, p0, Qmax, Ag, Cdie, Qs, Vag, ps: Cdie * Qs * Qs, aMPE, pEnv, QtLo, QtHi, vaHydr, tVent };
}

export default {
  id: 'pq2',
  title: 'PQ²-Diagramm (Arbeitspunkt)',
  desc: 'Maschine × Werkzeug · Hüllkurve · Operational Window · Achsenmodi Q, Q², v_p, t_f',
  tab: 'q',
  tabs: [['q', 'Q'], ['q2', 'Q²'], ['vp', 'v_p'], ['tf', 't_f']],
  inputs: ['gate', 'Cd', 'vmax', 'injForce', 'diam', 'dmin', 'dmax', 'density', 'part', 'runner', 'overflow', 'vent', 'vAirMax', 'tmax', 'gateMin', 'gateMax'],

  calc(v) {
    const c = pqCore(v);
    if (!c) return { err: 'Anschnittfläche, Cd, v_max und Gießkraft müssen > 0 sein.' };
    const C = theme.chart;
    const { Ap, p0, Qmax, Ag, Cdie, Qs, Vag, pEnv, QtLo, QtHi, tVent } = c;
    const tb = this.tab;

    const tfOp = Vag / Qs * 1000;
    const tfPlot = 2.5 * Math.max(tfOp, v.tmax || 0) || 500;

    let fx, xl, Qlo = 0;
    if (tb === 'q') { fx = Q => Q * 1000; xl = 'Durchfluss Q in l/s'; }
    else if (tb === 'q2') { fx = Q => Q * Q * 1e6; xl = 'Q² in (l/s)² — Maschinenlinie wird Gerade'; }
    else if (tb === 'vp') { fx = Q => Q / Ap; xl = 'Kolbengeschwindigkeit v_p in m/s'; }
    else { fx = Q => Q > 0 ? Vag / Q * 1000 : Infinity; xl = 'Füllzeit ab Anschnitt t_f in ms (Bauteil + Überlauf)'; Qlo = Vag / (tfPlot / 1000); }

    const Qarr = seq(Math.max(Qlo, Qmax * 1e-4), Qmax, 160);
    if (tb === 'tf') Qarr.reverse();
    const x = Qarr.map(fx);

    const ys = [
      series('Maschine (Ø ' + fmt(v.diam) + ')', C.series1, Qarr, Q => p0 * (1 - (Q / Qmax) * (Q / Qmax))),
      series('Werkzeug', C.series2, Qarr, Q => Cdie * Q * Q)
    ];
    if (isFinite(QtLo) && isFinite(QtHi) && QtHi > QtLo)
      ys.push(series('Hüllkurve (alle Ø)', C.series4, Qarr, Q => (Q >= QtLo && Q <= QtHi) ? pEnv(Q) : NaN));

    const q = line(x, ys, xl, 'Metalldruck in bar',
      'Statisch ' + fmt(p0) + ' bar · Q_dry ' + fmt(Qmax * 1000) + ' l/s · Cd=' + fmt(v.Cd) + ' · Hüllkurve a = ' + fmt(c.aMPE / 1e6) + ' MW (Ø ' + fmt(v.dmin) + '–' + fmt(v.dmax) + ')');
    q.y0 = 0; q.y1 = p0 * 1.05;

    const xMinD = Math.min(x[0], x[x.length - 1]), xMaxD = Math.max(x[0], x[x.length - 1]);
    function band(qa, qb, c2, l) {
      let a = fx(Math.max(qa, 1e-9));
      let b = qb === null ? (tb === 'tf' ? xMinD : xMaxD) : fx(qb);
      if (qa <= 0) a = tb === 'tf' ? xMaxD : xMinD;
      let lo = Math.min(a, b), hi = Math.max(a, b);
      lo = Math.max(lo, xMinD); hi = Math.min(hi, xMaxD);
      if (hi > lo) return { x0: lo, x1: hi, c: c2, l };
    }
    q.vbands = [];
    let b;
    if (v.gateMin > 0 && Ag > 0) { b = band(0, v.gateMin * Ag, C.bandNoAtom, 'keine Zerstäubung'); if (b) q.vbands.push(b); }
    if (v.gateMax > 0 && Ag > 0) { b = band(v.gateMax * Ag, null, C.bandErosion, 'Erosionsrisiko'); if (b) q.vbands.push(b); }
    if (v.tmax > 0) { b = band(0, Vag / (v.tmax / 1000), C.bandSlow, 'Füllung zu langsam'); if (b) q.vbands.push(b); }

    /* Grenzlinien: v_a-Fenster, hydraulisches Limit (J), Entlüftungsbedingung (OW Zone C) */
    const cMin = (theme.mapLines && theme.mapLines.len) || '#7b5cd6';
    q.vlines = [];
    if (v.gateMin > 0 && Ag > 0) q.vlines.push({ x: fx(v.gateMin * Ag), l: 'v_a min ' + fmt(v.gateMin) + ' m/s', c: cMin });
    if (v.gateMax > 0 && Ag > 0) q.vlines.push({ x: fx(v.gateMax * Ag), l: 'v_a max ' + fmt(v.gateMax) + ' m/s', c: C.crit });
    if (c.vaHydr > 0) q.vlines.push({ x: fx(c.vaHydr * Ag), l: 'hydraul. Limit (J) ' + fmt(c.vaHydr) + ' m/s', c: C.limit });
    if (isFinite(tVent) && tVent > 0) q.vlines.push({ x: fx(Vag / tVent), l: 'Entlüftung: t_f ≥ ' + fmt(tVent * 1000) + ' ms', c: C.iso });

    const opx = fx(Qs);
    const unit = tb === 'q' ? ' l/s' : tb === 'q2' ? ' (l/s)²' : tb === 'vp' ? ' m/s' : ' ms';
    q.pt = [opx, Cdie * Qs * Qs];
    q.ptl = 'Arbeitspunkt ' + fmt(opx) + unit + ' / ' + fmt(Cdie * Qs * Qs) + ' bar';
    return q;
  },

  /* Mathe-Erklärung nach Pego Guerra (1997), Kap. 2–3. Live-Werte via data-m. */
  mathHTML() {
    return `
<p class="math-note"><b>Quelle:</b> M. A. Pego Guerra, <i>Die Casting Design. A Parametric Approach</i>,
Carleton University, 1997, Kap. 2–3 — dort nach CSIRO (P–Q², 1977) und Karni (Machine Performance
Envelope). Gleichungsnummern unten beziehen sich auf diese Arbeit.</p>

<h4>1 · Grundgrößen</h4>
<div class="eq">A<sub>K</sub> = ${frac('π · D²', '4')}&emsp;·&emsp;p₀ = ${frac('F<sub>G</sub>', 'A<sub>K</sub>')} = P<sub>acc</sub> · ${frac('A<sub>h</sub>', 'A<sub>K</sub>')}&emsp;·&emsp;Q<sub>dry</sub> = A<sub>K</sub> · v<sub>dry</sub>&emsp;·&emsp;V<sub>a</sub> = ${frac('m<sub>Bauteil</sub> + m<sub>Überlauf</sub>', 'ρ')}</div>
<p class="math-note">Die Gießkraft F<sub>G</sub> = P<sub>acc</sub>·A<sub>h</sub> stammt aus Akkumulatordruck × Antriebskolbenfläche;
v<sub>dry</sub> ist die <b>Trockenschuss-Geschwindigkeit</b> (Kolben ohne Metall, alle Verluste im Schusskreis) —
unser Eingabefeld „Kolbengeschw. max.". Aktuell: A<sub>K</sub> = <b data-m="AK"></b> · p₀ = <b data-m="p0"></b> ·
Q<sub>dry</sub> = <b data-m="Qmax"></b> · V<sub>a</sub> = <b data-m="Va"></b></p>

<h4>2 · Werkzeuglinie (Die Line) — Gl. 2.3/2.5</h4>
<p class="math-note">Energieerhaltung (Bernoulli) vom Kolben bis zum Anschnitt, Kavitätsdruck ≈ 0 bei
funktionierender Entlüftung. Alle Verluste stecken im zusammengesetzten Durchflussbeiwert:</p>
<div class="eq">P = C<sub>t</sub> · v<sub>a</sub>²&emsp;(2.3)&emsp;⇒&emsp;mit v<sub>a</sub> = Q/A<sub>a</sub>:&emsp;P<sub>W</sub>(Q) = ${frac('C<sub>t</sub>', 'A<sub>a</sub>²')} · Q²&emsp;(2.5)&emsp;mit&emsp;C<sub>t</sub> = ${frac('ρ', '2 · C<sub>d</sub>²')}</div>
<p class="math-note">C<sub>d</sub> ≈ 0,5 für Aluminium, 0,5–0,6 für Zink; C<sub>t</sub> misst die Effizienz des
Lauf-/Anschnittsystems und wird in der Praxis aus Messungen bestimmt. Steigung der Geraden im Q²-Modus:
C<sub>W</sub> = C<sub>t</sub>/A<sub>a</sub>². Aktuell: C<sub>W</sub> = <b data-m="CW"></b></p>

<h4>3 · Maschinenlinie — Gl. 2.6–2.9</h4>
<p class="math-note">Hydraulikseite: P<sub>h</sub> = P<sub>acc</sub> − K<sub>v</sub>·v² (2.6); Kräftegleichgewicht am
Kolben P = P<sub>h</sub>·A<sub>h</sub>/A<sub>K</sub> (2.7). Mit v = Q/A<sub>K</sub> folgt die Karni-Form und daraus die
von CSIRO experimentell bestätigte Form über die Trockenschuss-Geschwindigkeit:</p>
<div class="eq">P<sub>M</sub>(Q) = P<sub>acc</sub> · ${frac('A<sub>h</sub>', 'A<sub>K</sub>')} − K<sub>t</sub> · Q²&emsp;(2.8)&emsp;⇔&emsp;P<sub>M</sub>(Q) = p₀ · ( 1 − ${frac('Q²', 'Q<sub>dry</sub>²')} )&emsp;(2.9)</div>
<p class="math-note">Nullstellen: Q = 0 → voller statischer Druck p₀; Q = Q<sub>dry</sub> → alle Leistung geht in
die Kolbenbewegung, kein Druck aufs Metall. Im Q²-Modus eine Gerade mit Steigung −p₀/Q<sub>dry</sub>².</p>

<h4>4 · Hüllkurve (Machine Performance Envelope) — Gl. 2.10–2.14</h4>
<p class="math-note">Jeder Kolben-Ø liefert eine eigene Maschinenlinie. Die Hüllkurve ist die Einhüllende aller
dieser Linien — <b>Herleitung A (Karni, physikalisch)</b>: Die Leistung des Akkumulators ist näherungsweise
konstant, Power = P·A<sub>K</sub>·v = P<sub>acc</sub>·A<sub>h</sub>·v ≈ const (2.10–2.12) — eine Hyperbel P·Q = const:</p>
<div class="eq">P<sub>env</sub>(Q) = ${frac('a', 'Q')}&emsp;(2.13)&emsp;mit&emsp;a = ${frac('2·√3', '9')} · A<sub>h</sub> · P<sub>acc</sub> · v<sub>dry</sub> = ${frac('2·√3', '9')} · F<sub>G</sub> · v<sub>dry</sub>&emsp;(2.14)</div>
<p class="math-note"><b>Herleitung B (formal)</b>: p<sub>M</sub>(Q; A<sub>K</sub>) = F<sub>G</sub>/A<sub>K</sub> − F<sub>G</sub>·Q²/(A<sub>K</sub>³·v<sub>dry</sub>²)
nach dem Scharparameter A<sub>K</sub> maximieren: ∂p/∂A<sub>K</sub> = 0 ⇒ A<sub>K,opt</sub>(Q) = √3·Q/v<sub>dry</sub>;
Einsetzen liefert dieselbe Hyperbel. Jede Kolbenparabel berührt die Hüllkurve genau einmal — bei
v<sub>p</sub> = v<sub>dry</sub>/√3 ≈ 0,577·v<sub>dry</sub> und P = ⅔·p₀(D). Die Hüllkurve ist eine reine
Maschineneigenschaft (unabhängig von Kolben und Werkzeug); a hat die Dimension einer Leistung — die
Energie, die der Akkumulator während der Einspritzphase an die Schmelze abgibt.</p>
<p class="math-note">Gezeichnet zwischen den Berührpunkten Q<sub>t</sub> = A<sub>K</sub>·v<sub>dry</sub>/√3 von
Ø<sub>min</sub> und Ø<sub>max</sub>; außerhalb gilt die Parabel des Grenz-Kolbens. Aktuell:
a = <b data-m="aMPE"></b> · gültig für Q = <b data-m="Qt"></b> · Berührpunkt aktueller Kolben bei
<b data-m="Qtcur"></b> · optimaler Kolben-Ø am Arbeitspunkt: <b data-m="Dopt"></b></p>

<h4>5 · Arbeitspunkt — Gl. 2.15/2.16</h4>
<p class="math-note">Schnittpunkt Maschinen- × Werkzeuglinie. Mit der Hüllkurven-Konstante a lässt sich die
Maschinenlinie äquivalent schreiben und der Arbeitspunkt lösen:</p>
<div class="eq">P<sub>M</sub> = p₀ · ( 1 − ${frac('4', '27')} · ${frac('p₀² · Q²', 'a²')} )&emsp;(2.15)&emsp;⇒&emsp;Q<sub>s</sub>² = ${frac('p₀', 'C<sub>t</sub>/A<sub>a</sub>² + (4/27) · p₀²/a²')}&emsp;(2.16)</div>
<div class="eq">gleichwertig:&emsp;Q<sub>s</sub> = ${sqrt(frac('p₀', 'C<sub>W</sub> + p₀ / Q<sub>dry</sub>²'), true)}&emsp;&emsp;p<sub>s</sub> = C<sub>W</sub> · Q<sub>s</sub>²</div>
<p class="math-note">Aktuell: Q<sub>s</sub> = <b data-m="Qs"></b> · p<sub>s</sub> = <b data-m="ps"></b></p>

<h4>6 · Achsenmodi und Operational Window — Gl. 3.1–3.3</h4>
<p class="math-note">Die Druckachse lässt sich in Anschnittgeschwindigkeit übersetzen, die
Volumenstromachse in Füllzeit — dieselben zwei Linien in vier Koordinaten:</p>
<div class="eq">v<sub>a</sub>(P) = C<sub>d</sub> · ${sqrt(frac('2 · P', 'ρ'), true)}&emsp;(3.1)&emsp;·&emsp;v<sub>p</sub> = ${frac('Q', 'A<sub>K</sub>')}&emsp;·&emsp;t<sub>f</sub> = ${frac('V<sub>a</sub>', 'Q')}&emsp;(3.3)</div>
<p class="math-note">Das <b>Operational Window</b> ist das Rechteck [t<sub>f,min</sub>, t<sub>f,max</sub>] ×
[v<sub>a,min</sub>, v<sub>a,max</sub>]. Verletzungsfolgen (Fig. 3.1/3.2): über t<sub>f,max</sub> (Zone A) kalte
Läufe und schlechte Oberflächen, unter v<sub>a,min</sub> (B) poröser Guss (keine Zerstäubung), unter
t<sub>f,min</sub> (C) unvollständige Entlüftung, über v<sub>a,max</sub> (D) Formerosion und Kleben.
Aktuell am Arbeitspunkt: v<sub>p</sub> = <b data-m="vp"></b> · v<sub>a</sub> = <b data-m="va"></b> ·
t<sub>f</sub> = <b data-m="tf"></b></p>

<h4>7 · Füllzeit- und v_a-Grenzen</h4>
<p class="math-note">Untergrenzen der Füllzeit aus drei unabhängigen Bedingungen; die schärfste gilt:</p>
<div class="eq">Entlüftung (Zone C):&ensp;t<sub>f</sub> ≥ t<sub>vent</sub> = ${frac('V<sub>luft</sub>', 'A<sub>ent</sub> · v<sub>luft,max</sub>')}&emsp;·&emsp;Erosion:&ensp;t<sub>f</sub> ≥ ${frac('V<sub>a</sub>', 'A<sub>a</sub> · v<sub>a,max</sub>')}&emsp;·&emsp;Hydraulik (J = C<sub>d</sub>):&ensp;t<sub>f</sub> ≥ ${frac('V<sub>a</sub>', 'A<sub>a</sub> · v<sub>a,hydr</sub>')}&ensp;mit&ensp;v<sub>a,hydr</sub> = J · ${sqrt(frac('2 · p₀', 'ρ'), true)}</div>
<div class="eq">Obergrenzen:&ensp;t<sub>f</sub> ≤ ${frac('V<sub>a</sub>', 'A<sub>a</sub> · v<sub>a,min</sub>')}&ensp;(Zerstäubung)&emsp;und&emsp;t<sub>f</sub> ≤ t<sub>max</sub>&ensp;(thermisch — NADCA-Formel, siehe „Empfohlene Füllzeit")</div>
<p class="math-note">Aktuell: t<sub>vent</sub> = <b data-m="tVent"></b> · t<sub>min,Erosion</sub> = <b data-m="tminE"></b> ·
t<sub>min,J</sub> = <b data-m="tminJ"></b> (v<sub>a,hydr</sub> = <b data-m="vah"></b>) ·
t<sub>max,Zerstäubung</sub> = <b data-m="tmaxZ"></b> · Arbeitspunkt t<sub>f</sub> = <b data-m="tf2"></b></p>

<h4>8 · Extremwerte der Anschnittfläche — Kap. 3.3</h4>
<p class="math-note">Werkzeuglinien durch die Ecken des Operational Window liefern die zulässige Spanne der
Anschnittfläche (Fig. 3.3): steilste Linie durch (t<sub>f,max</sub>, v<sub>a,max</sub>), flachste durch
(t<sub>f,min</sub>, v<sub>a,min</sub>):</p>
<div class="eq">A<sub>a,min</sub> = ${frac('V<sub>a</sub>', 't<sub>f,max</sub> · v<sub>a,max</sub>')}&emsp;&emsp;A<sub>a,max</sub> = ${frac('V<sub>a</sub>', 't<sub>f,min</sub> · v<sub>a,min</sub>')}&emsp;mit&ensp;t<sub>f,min</sub> = max(t<sub>vent</sub>, t<sub>min,J</sub>)</div>
<p class="math-note">Die Länge der Werkzeuglinie innerhalb von Fenster und Hüllkurve ist nach Karni ein Maß für die
<b>Flexibilität</b> der Auslegung. Aktuell: zulässige Spanne <b data-m="AgRange"></b> · gewählt
A<sub>a</sub> = <b data-m="AgSel"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const c = pqCore(v);
    if (!c) {
      ['AK', 'p0', 'Qmax', 'Va', 'CW', 'Qs', 'ps', 'vp', 'va', 'tf', 'tf2', 'Qt', 'Qtcur', 'Dopt', 'aMPE',
        'vah', 'tminJ', 'tminE', 'tmaxZ', 'tVent', 'AgRange', 'AgSel'].forEach(k => set(k, '—'));
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
    /* Hüllkurve */
    set('aMPE', fmt(c.aMPE / 1e6) + ' MW');
    set('Qt', fmt(c.QtLo * 1000) + '–' + fmt(c.QtHi * 1000) + ' l/s (Ø ' + fmt(v.dmin) + '–' + fmt(v.dmax) + ')');
    set('Qtcur', fmt(c.Ap * v.vmax / S3 * 1000) + ' l/s (v_p = ' + fmt(v.vmax / S3) + ' m/s, P = ' + fmt(2 * c.p0 / 3) + ' bar)');
    const Dopt = Math.sqrt(4 * S3 * c.Qs / (PI * v.vmax)) * 1000;
    set('Dopt', 'Ø ' + fmt(Dopt) + ' mm (A_opt = √3·Q_s/v_dry)');
    /* Füllzeitgrenzen */
    set('vah', fmt(c.vaHydr) + ' m/s');
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
