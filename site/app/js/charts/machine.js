/* Erforderliche Maschinengröße (Kraftbedarf über Druck). */

import { series, line, limit } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { frac } from './mathfmt.js';

export default {
  id: 'machine',
  title: 'Erforderliche Maschinengröße',
  desc: 'Kraftbedarf über Druck',
  inputs: ['area', 'safety', 'pmin', 'pmax', 'psel', 'force'],

  calc(v) {
    const C = theme.chart;
    const x = seq(v.pmin, v.pmax, 140);
    const q = line(x, [
      series('S=1,00', C.series1, x, p => v.area * p / 0.01),
      series('S=' + fmt(v.safety), C.series2, x, p => v.area * v.safety * p / 0.01)
    ], 'Druck in bar', 'Maschinengröße kN', 'Fläche ' + fmt(v.area) + ' m² · S=' + fmt(v.safety));
    q.pt = [v.psel, v.area * v.safety * v.psel / 0.01];
    q.ptl = 'Bedarf: ' + fmt(v.area * v.safety * v.psel / 0.01) + ' kN';
    q.limits = [limit('force', 'Verfügbar ' + fmt(v.force) + ' kN', 'y', 'max', v.force, { note: 'über Maschinenkraft' })];
    return q;
  },

  mathHTML() {
    return `
<h4>Erforderliche Schließkraft</h4>
<p class="math-note">Umkehrung der Sprengflächen-Beziehung: bei gegebener Sprengfläche A und Auslegungsdruck p
muss die Maschine mindestens aufbringen:</p>
<div class="eq">F<sub>erf</sub>(p) = S · p · A · 100&emsp;(F in kN, p in bar, A in m² — 1 bar = 100 kN/m²)</div>
<p class="math-note">Die beiden Kurven zeigen S = 1 (physikalisches Minimum) und den gewählten
Sicherheitsfaktor; die gestrichelte Linie ist die verfügbare Maschinenkraft. Umstellung nach A liefert das
Diagramm „Zulässige Sprengfläche": A<sub>max</sub> = ${frac('F<sub>schließ</sub>', '100 · S · p')}.</p>
<p class="math-note">Aktuell bei p = <b data-m="psel"></b>: F<sub>erf</sub> = <b data-m="freq"></b> ·
verfügbar = <b data-m="favail"></b> · Auslastung = <b data-m="util"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const freq = v.area * v.safety * v.psel * 100;
    set('psel', fmt(v.psel) + ' bar');
    set('freq', fmt(freq) + ' kN');
    set('favail', fmt(v.force) + ' kN');
    set('util', v.force > 0 ? fmt(100 * freq / v.force) + ' %' : '—');
  }
};
