/* Spezifischer Gießdruck über Kolben-Ø. */

import { series, line } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { frac, sqrt } from './mathfmt.js';

const PI = Math.PI;

export default {
  id: 'pspec',
  title: 'Spezifischer Gießdruck',
  desc: 'über Kolben-Ø',
  inputs: ['dmin', 'dmax', 'injForce', 'pSpecMin', 'pSpecMax', 'diam'],

  calc(v) {
    const x = seq(v.dmin, v.dmax, 140);
    const f = d => v.injForce * 1e4 / (0.25 * PI * d * d);
    const q = line(x, [series('Gießdruck', theme.chart.series1, x, f)],
      'Kolben-Ø mm', 'Spez. Gießdruck bar', 'Gießkraft ' + fmt(v.injForce) + ' kN');
    q.band = [v.pSpecMin, v.pSpecMax];
    q.y0 = 0;
    q.pt = [v.diam, f(v.diam)];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm → ' + fmt(f(v.diam)) + ' bar';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Spezifischer Gießdruck</h4>
<p class="math-note">Die dynamische Gießkraft F<sub>G</sub> wirkt über die Kolbenfläche auf die Schmelze —
das ist derselbe statische Metalldruck p₀ wie im PQ²-Diagramm:</p>
<div class="eq">p<sub>spez</sub>(D) = ${frac('F<sub>G</sub>', 'A<sub>K</sub>')} = ${frac('4 · F<sub>G</sub>', 'π · D²')}&emsp;(in Einheiten: p [bar] = 10⁴ · F [kN] / A [mm²])</div>

<h4>2 · Ø-Bereich für das Zielband</h4>
<div class="eq">D(p) = ${sqrt(frac('4 · F<sub>G</sub>', 'π · p'), true)}&emsp;⇒&emsp;Zielband p<sub>min</sub> … p<sub>max</sub> ⇔ Ø von D(p<sub>max</sub>) bis D(p<sub>min</sub>)</div>
<p class="math-note">Aktuell: p<sub>spez</sub>(Ø <span data-m="D"></span>) = <b data-m="p"></b> ·
Zielband <span data-m="band"></span> ⇒ Ø-Bereich <b data-m="Dband"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const p = v.injForce * 1e4 / (0.25 * PI * v.diam * v.diam);
    const Dof = pb => Math.sqrt(v.injForce * 1e4 / (0.25 * PI * pb));
    set('D', fmt(v.diam) + ' mm');
    set('p', isFinite(p) ? fmt(p) + ' bar' : '—');
    set('band', fmt(v.pSpecMin) + '–' + fmt(v.pSpecMax) + ' bar');
    set('Dband', (v.pSpecMin > 0 && v.pSpecMax > 0)
      ? 'Ø ' + fmt(Dof(v.pSpecMax)) + '–' + fmt(Dof(v.pSpecMin)) + ' mm'
      : '—');
  }
};
