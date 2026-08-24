/* Anschnitt-Erstarrungszeit über Anschnittdicke. */

import { series, line, limit } from './helpers.js';
import { seq, fmt, subHTML } from '../core/format.js';
import { theme } from '../core/theme.js';
import { eq } from './mathfmt.js';

export default {
  id: 'gatesol',
  title: 'Anschnitt-Erstarrungszeit',
  desc: 'über Anschnittdicke',
  inputs: ['gateTh', 'solK', 'intTime'],

  calc(v) {
    const x = seq(0.5, v.gateTh * 2.5, 140);
    const f = s => v.solK * s * s;
    const q = line(x, [series('Erstarrungszeit', theme.chart.series1, x, f)],
      'Anschnittdicke mm', 'Erstarrungszeit ms', 'Konstante ' + fmt(v.solK) + ' ms/mm²');
    q.y0 = 0;
    q.limits = [limit('intTime', 'Nachdruckaufbauzeit ' + fmt(v.intTime) + ' ms', 'y', 'min', v.intTime, { note: 'Anschnitt erstarrt vor dem Nachdruckaufbau' })];
    q.pt = [v.gateTh, f(v.gateTh)];
    q.ptl = fmt(v.gateTh) + ' mm → ' + fmt(f(v.gateTh)) + ' ms';
    return q;
  },

  mathHTML() {
    return `
<h4>Erstarrungszeit des Anschnitts</h4>
<p class="math-note">Die Erstarrungszeit wächst quadratisch mit der Dicke (Chvorinov-artiger Ansatz mit der
Erstarrungskonstante k<sub>s</sub>):</p>
${eq('t_{\\text{erst}}(s) = k_{s} \\cdot s^{2}')}
<p class="math-note">Der Anschnitt darf erst nach der Nachdruckaufbauzeit t<sub>N</sub> zufrieren, sonst ist
die Kavität vom Nachdruck abgeschnitten, bevor die Schwindung ausgeglichen ist:</p>
${eq('t_{\\text{erst}} \\ge t_{N} \\; \\Leftrightarrow \\; s \\ge \\sqrt{\\frac{t_{N}}{k_{s}}}')}
<p class="math-note">Aktuell: t<sub>erst</sub>(s = <span data-m="s"></span>) = <b data-m="t"></b> ·
Nachdruckaufbauzeit t<sub>N</sub> = <b data-m="tN"></b> ⇒ Mindestdicke = <b data-m="smin"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    set('s', fmt(v.gateTh) + ' mm');
    set('t', fmt(v.solK * v.gateTh * v.gateTh) + ' ms');
    set('tN', fmt(v.intTime) + ' ms');
    set('smin', v.solK > 0 ? fmt(Math.sqrt(v.intTime / v.solK)) + ' mm' : '—');
  }
};
