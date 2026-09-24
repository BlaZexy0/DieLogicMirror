/* Entlüftungsgeschwindigkeit über Kolbengeschwindigkeit. */

import { series, line, limit } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { pistonArea, shotSpeed } from '../core/physics.js';
import { eq, mathSetter } from './mathfmt.js';

export default {
  id: 'vent',
  title: 'Entlüftungsgeschwindigkeit',
  desc: 'Querschnittsverhältnis',
  inputs: ['vmax', 'diam', 'vent', 'vAirMax'],
  usesCurve: true,

  calc(v, o) {
    const A = pistonArea(v);
    const x = seq(0, v.vmax, 140);
    const q = line(x, [series('Entlüftung', 'ink', x, s => s * A / v.vent)],
      'Kolbengeschwindigkeit in m/s', 'Entlüftungsgeschwindigkeit in m/s',
      'Ø ' + fmt(v.diam) + ' mm · Entlüftung ' + fmt(v.vent) + ' mm²');
    if (v.vAirMax > 0)
      q.limits = [limit('vAirMax', 'v_luft max ' + fmt(v.vAirMax) + ' m/s', 'y', 'max', v.vAirMax,
        { note: 'über zulässiger Luftgeschwindigkeit' })];
    const v2 = shotSpeed(o && o.shot, 'v2');
    if (v2 > 0) {
      q.pt = [v2, v2 * A / v.vent];
      q.ptl = 'v₂ ' + fmt(v2) + ' m/s → ' + fmt(v2 * A / v.vent) + ' m/s';
    }
    return q;
  },

  mathHTML() {
    return `
<h4>Entlüftungsgeschwindigkeit</h4>
<p class="math-note">Bevor die Schmelze kommt, muss die Luft raus, und sie hat nur die Entlüftungskanäle.
Deren Fläche wirkt wie eine Düse für die Luft: die Kontinuität übersetzt die Kolbengeschwindigkeit mit dem
Verhältnis A<sub>K</sub>/A<sub>ent</sub> in die Luftgeschwindigkeit. Wird sie zu hoch (Richtwert
v<sub>luft,max</sub>, deutlich unter der Schallgrenze), drosselt der Kanal, die Luft staut sich vor der
Schmelzefront und wird eingeschlossen:</p>
${eq('v_{\\text{ent}} = v_{p} \\cdot \\frac{A_{K}}{A_{\\text{ent}}}')}
<p class="math-note">Aktuell: A<sub>K</sub> = <b data-m="AK"></b> · Übersetzung A<sub>K</sub>/A<sub>ent</sub> = <b data-m="ratio"></b> ·
bei v₂ = <span data-m="vsel"></span> (Mittel nach Anschnitt, aus der Schusskurve): v<sub>ent</sub> = <b data-m="vent"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = mathSetter(el);
    const A = pistonArea(v);
    const v2 = shotSpeed(shot, 'v2');
    set('AK', fmt(A) + ' mm²');
    set('ratio', v.vent > 0 ? fmt(A / v.vent) : '—');
    set('vsel', fmt(v2) + ' m/s');
    set('vent', v.vent > 0 && isFinite(v2) ? fmt(v2 * A / v.vent) + ' m/s' : '—');
  }
};
