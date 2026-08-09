/* Prozessfenster Anschnitt (Heatmap: Kolbengeschw. × Anschnittfläche → Anschnittgeschw.). */

import { heat } from './helpers.js';
import { fmt } from '../core/format.js';
import { pistonArea } from '../core/physics.js';
import { frac } from './mathfmt.js';

export default {
  id: 'window',
  title: 'Prozessfenster Anschnitt',
  desc: 'Anschnittgeschw. als Feld',
  heat: true,
  inputs: ['vmin', 'vmax', 'gate', 'diam', 'gateMin', 'gateMax', 'vsel'],

  calc(v) {
    const Ap = pistonArea(v);
    const q = heat(v.vmin, v.vmax, v.gate * 0.3, v.gate * 2,
      (vp, Ag) => vp * Ap / Ag,
      'Kolbengeschw. m/s', 'Anschnittfläche mm²', 'Anschnittgeschw. m/s',
      0, 80, [v.gateMin, 40, v.gateMax, 60, 70]);
    q.pt = [v.vsel, v.gate];
    q.ptl = 'Ist ' + fmt(v.vsel) + ' m/s · ' + fmt(v.gate) + ' mm²';
    q.info = 'Zielband ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Prozessfenster Anschnitt</h4>
<p class="math-note">Dieselbe Kontinuitätsbeziehung wie beim Anschnittflächen-Diagramm, hier als Feld über
Kolbengeschwindigkeit und Anschnittfläche:</p>
<div class="eq">v<sub>a</sub>(v<sub>p</sub>, A<sub>a</sub>) = v<sub>p</sub> · ${frac('A<sub>K</sub>', 'A<sub>a</sub>')}</div>
<p class="math-note">Die weißen Konturen sind Linien konstanter Anschnittgeschwindigkeit; das Zielband ist
v<sub>a</sub> = <span data-m="band"></span>. Aktuell: v<sub>a</sub>(v<sub>p</sub> = <span data-m="vsel"></span>,
A<sub>a</sub> = <span data-m="Ag"></span>) = <b data-m="va"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    set('band', fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
    set('vsel', fmt(v.vsel) + ' m/s');
    set('Ag', fmt(v.gate) + ' mm²');
    set('va', v.gate > 0 ? fmt(v.vsel * pistonArea(v) / v.gate) + ' m/s' : '—');
  }
};
