/* Zulässige Sprengfläche über Druck. */

import { series, line } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { frac } from './mathfmt.js';

export default {
  id: 'area',
  title: 'Zulässige Sprengfläche',
  desc: 'Maschinenkraft und Druck',
  inputs: ['force', 'safety', 'pmin', 'pmax', 'psel', 'area'],

  calc(v) {
    const C = theme.chart;
    const x = seq(v.pmin, v.pmax, 140);
    const q = line(x, [
      series('S=1,00', C.series1, x, p => 0.01 * v.force / p),
      series('S=' + fmt(v.safety), C.series2, x, p => 0.01 * v.force / (v.safety * p))
    ], 'Druck in bar', 'Max. Sprengfläche m²', 'Kraft ' + fmt(v.force) + ' kN · S=' + fmt(v.safety));
    q.pt = [v.psel, v.area];
    q.ptl = 'Auslegung: ' + fmt(v.psel) + ' bar / ' + fmt(v.area) + ' m²';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Kräftegleichgewicht an der Form</h4>
<p class="math-note">Der Metalldruck p wirkt auf die projizierte Fläche der Kavität in Öffnungsrichtung
(Sprengfläche A) und versucht, die Form aufzudrücken. Die Schließkraft muss mit Sicherheitsfaktor S
dagegenhalten:</p>
<div class="eq">F<sub>auf</sub> = p · A&emsp;&emsp;F<sub>schließ</sub> ≥ S · p · A</div>

<h4>2 · Zulässige Sprengfläche</h4>
<div class="eq">A<sub>max</sub>(p) = ${frac('F<sub>schließ</sub>', 'S · p')}&emsp;&emsp;in Einheiten: A [m²] = ${frac('F [kN]', '100 · S · p [bar]')}&ensp;(1 bar = 100 kN/m²)</div>
<p class="math-note">Aktuell bei p = <b data-m="psel"></b>: A<sub>max</sub>(S = 1) = <b data-m="a1"></b> ·
A<sub>max</sub>(S = <span data-m="S"></span>) = <b data-m="aS"></b> · gewählt: A = <b data-m="asel"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    set('psel', fmt(v.psel) + ' bar');
    set('S', fmt(v.safety));
    set('a1', v.psel > 0 ? fmt(0.01 * v.force / v.psel) + ' m²' : '—');
    set('aS', v.psel > 0 && v.safety > 0 ? fmt(0.01 * v.force / (v.safety * v.psel)) + ' m²' : '—');
    set('asel', fmt(v.area) + ' m²');
  }
};
