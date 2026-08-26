/* Entlüftungsgeschwindigkeit über Kolbengeschwindigkeit. */

import { series, line, limit } from './helpers.js';
import { seq, fmt, subHTML } from '../core/format.js';
import { pistonArea } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { eq } from './mathfmt.js';

export default {
  id: 'vent',
  title: 'Entlüftungsgeschwindigkeit',
  desc: 'Querschnittsverhältnis',
  inputs: ['vmax', 'diam', 'vent', 'vAirMax'],
  usesCurve: true,

  calc(v, o) {
    const A = pistonArea(v);
    const x = seq(0, v.vmax, 140);
    const q = line(x, [series('Entlüftung', theme.chart.series1, x, s => s * A / v.vent)],
      'Kolbengeschwindigkeit in m/s', 'Entlüftungsgeschwindigkeit in m/s',
      'Ø ' + fmt(v.diam) + ' mm · Entlüftung ' + fmt(v.vent) + ' mm²');
    if (v.vAirMax > 0)
      q.limits = [limit('vAirMax', 'v_luft max ' + fmt(v.vAirMax) + ' m/s', 'y', 'max', v.vAirMax,
        { note: 'über zulässiger Luftgeschwindigkeit' })];
    const v2 = o && o.shot && !o.shot.error ? o.shot.v2 : null;
    if (v2 > 0) {
      q.pt = [v2, v2 * A / v.vent];
      q.ptl = 'v₂ ' + fmt(v2) + ' m/s → ' + fmt(v2 * A / v.vent) + ' m/s';
    }
    return q;
  },

  mathHTML() {
    return `
<h4>Entlüftungsgeschwindigkeit</h4>
<p class="math-note">Bevor die Schmelze kommt, muss die Luft raus — und sie hat nur die Entlüftungskanäle.
Deren Fläche wirkt wie eine Düse für die Luft: die Kontinuität übersetzt die Kolbengeschwindigkeit mit dem
Verhältnis A<sub>K</sub>/A<sub>ent</sub> in die Luftgeschwindigkeit. Wird sie zu hoch (Richtwert
v<sub>luft,max</sub>, deutlich unter der Schallgrenze), drosselt der Kanal, die Luft staut sich vor der
Schmelzefront und wird eingeschlossen:</p>
${eq('v_{\\text{ent}} = v_{p} \\cdot \\frac{A_{K}}{A_{\\text{ent}}}')}
<p class="math-note">Aktuell: A<sub>K</sub> = <b data-m="AK"></b> · Übersetzung A<sub>K</sub>/A<sub>ent</sub> = <b data-m="ratio"></b> ·
bei v₂ = <span data-m="vsel"></span> (Mittel nach Anschnitt, aus der Schusskurve): v<sub>ent</sub> = <b data-m="vent"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const A = pistonArea(v);
    const v2 = shot && !shot.error && shot.v2 != null ? shot.v2 : NaN;
    set('AK', fmt(A) + ' mm²');
    set('ratio', v.vent > 0 ? fmt(A / v.vent) : '—');
    set('vsel', fmt(v2) + ' m/s');
    set('vent', v.vent > 0 && isFinite(v2) ? fmt(v2 * A / v.vent) + ' m/s' : '—');
  }
};
