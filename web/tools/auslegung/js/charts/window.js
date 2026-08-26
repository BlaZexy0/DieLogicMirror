/* Prozessfenster Anschnitt (Heatmap: Kolbengeschw. × Anschnittfläche → Anschnittgeschw.). */

import { heat, target } from './helpers.js';
import { fmt, subHTML } from '../core/format.js';
import { pistonArea } from '../core/physics.js';
import { eq } from './mathfmt.js';

export default {
  id: 'window',
  title: 'Prozessfenster Anschnitt',
  desc: 'Anschnittgeschw. als Feld',
  heat: true,
  inputs: ['vmax', 'gate', 'diam', 'gateMin', 'gateMax'],
  usesCurve: true,

  calc(v, o) {
    const Ap = pistonArea(v);
    const q = heat(0, v.vmax, v.gate * 0.3, v.gate * 2,
      (vp, Ag) => vp * Ap / Ag,
      'Kolbengeschwindigkeit in m/s', 'Anschnittfläche in mm²', 'Anschnittgeschwindigkeit in m/s',
      0, 80, [20, 40, 60]);
    /* Zielband v_a ∈ [gateMin, gateMax] ⇔ A_a zwischen zwei Hyperbeln */
    if (v.gateMin > 0 && v.gateMax > 0)
      q.limits = [target('gateBand', 'Ziel v_a ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s', 'y',
        vp => vp * Ap / v.gateMax, vp => vp * Ap / v.gateMin)];
    const v2 = o && o.shot && !o.shot.error ? o.shot.v2 : null;
    if (v2 > 0) {
      q.pt = [v2, v.gate];
      q.ptl = 'Ist v₂ ' + fmt(v2) + ' m/s · ' + fmt(v.gate) + ' mm²';
    }
    q.info = 'Zielband ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Prozessfenster Anschnitt</h4>
<p class="math-note">Anschnittgeschwindigkeit lässt sich über zwei Hebel stellen: schneller fahren (v<sub>p</sub>)
oder den Anschnitt verengen (A<sub>a</sub>). Dieses Feld zeigt beide Hebel gleichzeitig — dieselbe
Kontinuitätsbeziehung wie beim Anschnittflächen-Diagramm, ausgewertet über der (v<sub>p</sub>, A<sub>a</sub>)-Ebene;
das weiße Band ist das Ziel, alles außerhalb verlangt einen anderen Kompromiss aus Geschwindigkeit und Fläche:</p>
${eq('v_{a}(v_{p}, A_{a}) = v_{p} \\cdot \\frac{A_{K}}{A_{a}}')}
<p class="math-note">Die weißen Konturen sind Linien konstanter Anschnittgeschwindigkeit; das Zielband ist
v<sub>a</sub> = <span data-m="band"></span>. Aktuell: v<sub>a</sub>(v₂ = <span data-m="vsel"></span>,
A<sub>a</sub> = <span data-m="Ag"></span>) = <b data-m="va"></b> — v₂ ist das Mittel nach Anschnitt aus der Schusskurve.</p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const v2 = shot && !shot.error && shot.v2 != null ? shot.v2 : NaN;
    set('band', fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
    set('vsel', fmt(v2) + ' m/s');
    set('Ag', fmt(v.gate) + ' mm²');
    set('va', v.gate > 0 && isFinite(v2) ? fmt(v2 * pistonArea(v) / v.gate) + ' m/s' : '—');
  }
};
