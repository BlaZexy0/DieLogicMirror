/* Luftblase unter Nachdruck: Durchmesserverhältnis vor/nach der
   Nachverdichtung über dem Nachdruck (ideales Gas, Zustand friert bei
   Formtemperatur ein). */

import { series, line } from './helpers.js';
import { seq, fmt, subHTML } from '../core/format.js';
import { theme } from '../core/theme.js';
import { pistonArea } from '../core/physics.js';
import { eq } from './mathfmt.js';

const P_ATM = 1.01325;                                  // Umgebungsdruck bar
const K = 273.15;

/* D_vor/D_nach = ((p_ND/p_atm) · (T_liq/T_form))^(1/3), Temperaturen in K. */
function ratio(v, p) {
  return Math.cbrt((p / P_ATM) * ((v.Tliq + K) / (v.Tdie + K)));
}

/* Maximaler Nachdruck mit dem montierten Kolben: volle Gießkraft auf der
   Kolbenfläche (statisch, wie p₀ im PQ²-Diagramm). */
function pMax(v) {
  const A = pistonArea(v);
  return v.injForce > 0 && A > 0 ? v.injForce * 1e4 / A : NaN;
}

export default {
  id: 'bubble',
  title: 'Luftblase unter Nachdruck',
  desc: 'Durchmesserverhältnis vor/nach Nachdruck',
  inputs: ['injForce', 'diam', 'psel', 'Tliq', 'Tdie'],

  calc(v) {
    const p0 = pMax(v);
    if (!(p0 > P_ATM)) return { err: 'braucht Gießkraft und Kolben-Ø (max. Nachdruck ≤ Umgebungsdruck).' };
    if (!(v.Tliq > v.Tdie) || !(v.Tdie > -K)) return { err: 'braucht Liquidus- über Formtemperatur.' };
    const x = seq(P_ATM, p0, 200);
    const q = line(x, [series('D_vor/D_nach', theme.chart.series1, x, p => ratio(v, p))],
      'Nachdruck p_ND in bar', 'Blasen-Ø-Verhältnis D_vor/D_nach',
      'T_liq ' + fmt(v.Tliq) + ' °C · T_Form ' + fmt(v.Tdie) + ' °C · max. Nachdruck (Ø ' + fmt(v.diam) + ') ' + fmt(p0) + ' bar');
    q.y0 = 0;
    if (v.psel >= P_ATM && v.psel <= p0) {
      q.pt = [v.psel, ratio(v, v.psel)];
      q.ptl = 'Auslegungsdruck ' + fmt(v.psel) + ' bar → Ø-Verhältnis ' + fmt(ratio(v, v.psel));
    }
    return q;
  },

  mathHTML() {
    return `
<h4>Warum der Nachdruck Poren schrumpft</h4>
<p class="math-note">Trotz Entlüftung bleibt Luft in der Füllung eingeschlossen — beim Füllende steht sie
als Blase etwa unter Umgebungsdruck p<sub>atm</sub> in der noch flüssigen Schmelze
(T ≈ T<sub>liq</sub>). Der Nachdruck presst diese Blase zusammen, bevor das Gefüge erstarrt; ihr
Zustand friert etwa bei Formtemperatur ein. Für die eingeschlossene Luft als ideales Gas gilt zwischen
„vor" (p<sub>atm</sub>, T<sub>liq</sub>) und „nach" (p<sub>ND</sub>, T<sub>Form</sub>):</p>
${eq('\\frac{p_{\\text{atm}} \\cdot V_{\\text{vor}}}{T_{\\text{liq}}} = \\frac{p_{\\text{ND}} \\cdot V_{\\text{nach}}}{T_{\\text{Form}}} \\qquad (T\\ \\text{in K})')}
<p class="math-note">Volumen geht mit der dritten Potenz des Durchmessers — auflösen und Wurzel ziehen
liefert das Durchmesserverhältnis, das die Kurve zeigt:</p>
${eq('\\frac{D_{\\text{vor}}}{D_{\\text{nach}}} = \\left( \\frac{p_{\\text{ND}}}{p_{\\text{atm}}} \\cdot \\frac{T_{\\text{liq}}}{T_{\\text{Form}}} \\right)^{1/3}')}
<p class="math-note">Die Kubikwurzel ist der Grund, warum viel Nachdruck nötig ist: das <em>Volumen</em>
schrumpft proportional zum Druck, der sichtbare Poren-Ø aber nur mit p<sup>1/3</sup> — eine Verzehnfachung
des Ø-Verhältnisses kostet das Tausendfache an Druck. Die x-Achse endet beim maximalen Nachdruck des
montierten Kolbens p<sub>max</sub> = F<sub>G</sub>/A<sub>K</sub> (volle Gießkraft, statisch — wie p₀ im
PQ²-Diagramm). Annahmen: ideales Gas, keine Lösung der Luft in der Schmelze, Blase bleibt kugelig.</p>
<p class="math-note">Aktuell: p<sub>max</sub>(Ø <span data-m="D"></span>) = <b data-m="pmax"></b> ·
T<sub>liq</sub>/T<sub>Form</sub> = <b data-m="Tratio"></b> (in K) ·
beim Auslegungsdruck <span data-m="psel"></span>: D<sub>vor</sub>/D<sub>nach</sub> = <b data-m="r"></b>
(Blasenvolumen auf <b data-m="vol"></b>)</p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const p0 = pMax(v);
    set('D', fmt(v.diam) + ' mm');
    set('pmax', isFinite(p0) ? fmt(p0) + ' bar' : '—');
    set('Tratio', fmt((v.Tliq + K) / (v.Tdie + K)));
    set('psel', fmt(v.psel) + ' bar');
    const r = ratio(v, v.psel);
    set('r', isFinite(r) ? fmt(r) : '—');
    set('vol', isFinite(r) ? fmt(100 / (r * r * r)) + ' %' : '—');
  }
};
