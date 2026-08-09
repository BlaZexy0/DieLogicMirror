/* Anschnittfläche für Zielgeschwindigkeit. */

import { series, line } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { pistonArea } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { frac } from './mathfmt.js';

export default {
  id: 'gate',
  title: 'Anschnittfläche für Zielgeschwindigkeit',
  desc: 'Auslegung Anschnittfenster',
  inputs: ['vmin', 'vmax', 'diam', 'gateMin', 'gateMax', 'gate', 'vsel'],

  calc(v) {
    const C = theme.chart;
    const A = pistonArea(v);
    const x = seq(v.vmin, v.vmax, 140);
    const q = line(x, [
      series(fmt(v.gateMin) + ' m/s', C.series1, x, s => s * A / v.gateMin),
      series(fmt(v.gateMax) + ' m/s', C.series2, x, s => s * A / v.gateMax)
    ], 'Kolbengeschwindigkeit m/s', 'Anschnittfläche mm²',
      'Ø ' + fmt(v.diam) + ' mm · Auswahl ' + fmt(v.gate) + ' mm²');
    q.pt = [v.vsel, v.gate];
    q.ptl = 'Auswahl ' + fmt(v.gate) + ' mm² bei ' + fmt(v.vsel) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Anschnittfläche aus der Zielgeschwindigkeit</h4>
<p class="math-note">Kontinuität: derselbe Volumenstrom fließt durch Kolben und Anschnitt,
Q = A<sub>K</sub> · v<sub>p</sub> = A<sub>a</sub> · v<sub>a</sub>. Für eine Ziel-Anschnittgeschwindigkeit
v<sub>a</sub> folgt die nötige Fläche:</p>
<div class="eq">A<sub>a</sub>(v<sub>p</sub>) = ${frac('A<sub>K</sub> · v<sub>p</sub>', 'v<sub>a</sub>')}</div>
<p class="math-note">Die beiden Kurven gelten für v<sub>a</sub> = Ziel-min (obere Kurve — langsame Zielgeschwindigkeit
braucht große Fläche) und Ziel-max (untere Kurve); dazwischen liegt das zulässige Fenster.</p>
<p class="math-note">Aktuell bei v<sub>p</sub> = <span data-m="vsel"></span>:
A<sub>a</sub>(v<sub>a</sub> = <span data-m="gmin"></span>) = <b data-m="Amax"></b> ·
A<sub>a</sub>(v<sub>a</sub> = <span data-m="gmax"></span>) = <b data-m="Amin"></b> ·
Auswahl A<sub>a</sub> = <b data-m="Asel"></b> ⇒ v<sub>a</sub> = <b data-m="va"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const A = pistonArea(v);
    set('vsel', fmt(v.vsel) + ' m/s');
    set('gmin', fmt(v.gateMin) + ' m/s');
    set('gmax', fmt(v.gateMax) + ' m/s');
    set('Amax', v.gateMin > 0 ? fmt(A * v.vsel / v.gateMin) + ' mm²' : '—');
    set('Amin', v.gateMax > 0 ? fmt(A * v.vsel / v.gateMax) + ' mm²' : '—');
    set('Asel', fmt(v.gate) + ' mm²');
    set('va', v.gate > 0 ? fmt(v.vsel * A / v.gate) + ' m/s' : '—');
  }
};
