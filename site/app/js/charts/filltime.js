/* Füllzeit ab Anschnitt (Heatmap: Füllzeit × Kolben-Ø → Kolbengeschwindigkeit). */

import { heat } from './helpers.js';
import { fmt } from '../core/format.js';
import { afterGate } from '../core/physics.js';
import { frac } from './mathfmt.js';

const PI = Math.PI;

export default {
  id: 'filltime',
  title: 'Füllzeit ab Anschnitt',
  desc: 'Bauteil + Überlauf',
  heat: true,
  inputs: ['tmax', 'dmin', 'dmax', 'part', 'overflow', 'density', 'vsel', 'diam'],

  calc(v) {
    const q = heat(0.1, v.tmax, v.dmin, v.dmax,
      (t, d) => 1e9 * (afterGate(v) / v.density) / (t * 0.25 * PI * d * d),
      'Füllzeit ms', 'Kolben-Ø mm', 'Kolbengeschwindigkeit m/s', 1, 8, [1, 2, 3, 4, 5, 6, 7, 8]);
    q.info = 'Ab Anschnitt ' + fmt(afterGate(v)) + ' kg · Bauteil + Überlauf';
    const tOp = 1e9 * (afterGate(v) / v.density) / (v.vsel * 0.25 * PI * v.diam * v.diam);
    q.pt = [tOp, v.diam];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm · ' + fmt(v.vsel) + ' m/s → ' + fmt(tOp) + ' ms';
    return q;
  },

  mathHTML() {
    return `
<h4>Füllzeit, Kolben-Ø und Kolbengeschwindigkeit</h4>
<p class="math-note">Kontinuität: das Volumen ab Anschnitt V<sub>a</sub> (Bauteil + Überlauf, ohne Anguss und
Pressrest) muss in der Füllzeit t<sub>f</sub> vom Kolben gefördert werden:</p>
<div class="eq">V<sub>a</sub> = ${frac('m<sub>Bauteil</sub> + m<sub>Überlauf</sub>', 'ρ')}&emsp;&emsp;Q = ${frac('V<sub>a</sub>', 't<sub>f</sub>')} = A<sub>K</sub> · v<sub>p</sub></div>
<div class="eq">⇒&emsp;v<sub>p</sub>(t<sub>f</sub>, D) = ${frac('V<sub>a</sub>', 't<sub>f</sub> · A<sub>K</sub>')} = ${frac('4 · V<sub>a</sub>', 't<sub>f</sub> · π · D²')}</div>
<p class="math-note">Die Heatmap zeigt v<sub>p</sub> über (t<sub>f</sub>, D); die weißen Konturen sind Linien
konstanter Kolbengeschwindigkeit. Aktuell: V<sub>a</sub> = <b data-m="Va"></b> · bei Ø <span data-m="D"></span>
und v<sub>p</sub> = <span data-m="vsel"></span>: t<sub>f</sub> = <b data-m="tf"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const Va = afterGate(v) / v.density;
    set('Va', fmt(Va * 1e6) + ' cm³');
    set('D', fmt(v.diam) + ' mm');
    set('vsel', fmt(v.vsel) + ' m/s');
    const tf = 1e9 * Va / (v.vsel * 0.25 * PI * v.diam * v.diam);
    set('tf', isFinite(tf) ? fmt(tf) + ' ms' : '—');
  }
};
