/* Füllkammer-Auswahl: Füllgrad über Kolben-Ø mit Zielband. */

import { series, line } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { total } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { frac, sqrt } from './mathfmt.js';

const PI = Math.PI;

export default {
  id: 'sleeve',
  title: 'Füllkammer-Auswahl',
  desc: 'Füllgrad (inkl. Pressrest) mit Zielbereich',
  inputs: ['dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'fillMin', 'fillMax', 'diam'],

  calc(v) {
    const x = seq(v.dmin, v.dmax, 140);
    const q = line(x, [series('Füllgrad', theme.chart.series1, x,
      d => 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * 0.25 * PI * d * d))],
      'Kolben-Ø mm', 'Füllgrad %',
      'Dosiert ' + fmt(total(v) + v.biscuit) + ' kg (inkl. Pressrest) · Kammer ' + fmt(v.length) + ' mm');
    q.band = [v.fillMin, v.fillMax];
    q.y0 = 0; q.y1 = 100;
    const fOp = 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * 0.25 * PI * v.diam * v.diam);
    q.pt = [v.diam, fOp];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm → ' + fmt(fOp) + ' %';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Füllgrad über Kolben-Ø</h4>
<p class="math-note">Bei fester Kammerlänge L sinkt der Füllgrad quadratisch mit dem Kolben-Ø:</p>
<div class="eq">φ(D) = ${frac('V<sub>dos</sub>', 'A<sub>K</sub>(D) · L')} · 100 % = ${frac('4 · V<sub>dos</sub>', 'π · D² · L')} · 100 %</div>

<h4>2 · Umkehrung: Ø-Bereich für das Zielband</h4>
<div class="eq">D(φ) = ${sqrt(frac('4 · V<sub>dos</sub>', 'π · φ · L'), true)}&emsp;— hoher Ziel-Füllgrad verlangt einen kleinen Kolben und umgekehrt</div>
<p class="math-note">Aktuell: φ(Ø <span data-m="D"></span>) = <b data-m="phi"></b> · Zielband
<span data-m="band"></span> ⇒ zulässiger Ø-Bereich <b data-m="Dband"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const Vdos = (total(v) + v.biscuit) / v.density;
    const phi = 100e9 * Vdos / (v.length * 0.25 * PI * v.diam * v.diam);
    const Dof = phiPct => Math.sqrt(100e9 * Vdos / (v.length * 0.25 * PI * phiPct));
    set('D', fmt(v.diam) + ' mm');
    set('phi', isFinite(phi) ? fmt(phi) + ' %' : '—');
    set('band', fmt(v.fillMin) + '–' + fmt(v.fillMax) + ' %');
    set('Dband', (v.fillMin > 0 && v.fillMax > 0)
      ? 'Ø ' + fmt(Dof(v.fillMax)) + '–' + fmt(Dof(v.fillMin)) + ' mm'
      : '—');
  }
};
