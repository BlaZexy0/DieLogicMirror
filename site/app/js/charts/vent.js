/* Entlüftungsgeschwindigkeit über Kolbengeschwindigkeit. */

import { series, line } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { pistonArea } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { frac } from './mathfmt.js';

export default {
  id: 'vent',
  title: 'Entlüftungsgeschwindigkeit',
  desc: 'Querschnittsverhältnis',
  inputs: ['vmin', 'vmax', 'diam', 'vent', 'vsel'],

  calc(v) {
    const A = pistonArea(v);
    const x = seq(v.vmin, v.vmax, 140);
    const q = line(x, [series('Entlüftung', theme.chart.series1, x, s => s * A / v.vent)],
      'Kolbengeschwindigkeit m/s', 'Entlüftungsgeschwindigkeit m/s',
      'Ø ' + fmt(v.diam) + ' mm · Entlüftung ' + fmt(v.vent) + ' mm²');
    q.pt = [v.vsel, v.vsel * A / v.vent];
    q.ptl = fmt(v.vsel) + ' m/s → ' + fmt(v.vsel * A / v.vent) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Entlüftungsgeschwindigkeit</h4>
<p class="math-note">Kontinuität: die vom Kolben verdrängte Luft muss durch die Entlüftungsfläche
A<sub>ent</sub> entweichen — je kleiner die Fläche im Verhältnis zur Kolbenfläche, desto schneller die
Luftströmung:</p>
<div class="eq">v<sub>ent</sub> = v<sub>p</sub> · ${frac('A<sub>K</sub>', 'A<sub>ent</sub>')}</div>
<p class="math-note">Aktuell: A<sub>K</sub> = <b data-m="AK"></b> · Übersetzung A<sub>K</sub>/A<sub>ent</sub> = <b data-m="ratio"></b> ·
bei v<sub>p</sub> = <span data-m="vsel"></span>: v<sub>ent</sub> = <b data-m="vent"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const A = pistonArea(v);
    set('AK', fmt(A) + ' mm²');
    set('ratio', v.vent > 0 ? fmt(A / v.vent) : '—');
    set('vsel', fmt(v.vsel) + ' m/s');
    set('vent', v.vent > 0 ? fmt(v.vsel * A / v.vent) + ' m/s' : '—');
  }
};
