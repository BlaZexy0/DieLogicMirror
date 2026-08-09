/* Empfohlene Anschnittgeschwindigkeit über Wandstärke mit Zielband. */

import { series, line } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { frac } from './mathfmt.js';

export default {
  id: 'gvwall',
  title: 'Anschnittgeschw. über Wandstärke',
  desc: 'Empfehlung mit Zielband',
  inputs: ['wallMin', 'wallMax', 'gateMin', 'gateMax', 'wall'],

  calc(v) {
    const x = seq(v.wallMin, v.wallMax, 140);
    const f = s => v.gateMax - (v.gateMax - v.gateMin) * (s - v.wallMin) / (v.wallMax - v.wallMin);
    const q = line(x, [series('Empfehlung', theme.chart.series1, x, f)],
      'Wandstärke mm', 'Anschnittgeschw. m/s', 'Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
    q.band = [v.gateMin, v.gateMax];
    q.y0 = 0;
    q.pt = [v.wall, f(v.wall)];
    q.ptl = fmt(v.wall) + ' mm → ' + fmt(f(v.wall)) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Anschnittgeschwindigkeit über Wandstärke</h4>
<p class="math-note">Dünne Wände erstarren schnell und brauchen hohe Anschnittgeschwindigkeit, dicke Wände
vertragen langsamere Füllung. Zwischen den Grenzen des Wandstärkenbereichs wird linear interpoliert:</p>
<div class="eq">v<sub>a</sub>(s) = v<sub>a,max</sub> − ( v<sub>a,max</sub> − v<sub>a,min</sub> ) · ${frac('s − s<sub>min</sub>', 's<sub>max</sub> − s<sub>min</sub>')}</div>
<p class="math-note">Bei s = s<sub>min</sub> gilt v<sub>a,max</sub>, bei s = s<sub>max</sub> gilt
v<sub>a,min</sub>. Aktuell: v<sub>a</sub>(s = <span data-m="s"></span>) = <b data-m="va"></b> ·
Zielband <span data-m="band"></span></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const span = v.wallMax - v.wallMin;
    const va = span !== 0 ? v.gateMax - (v.gateMax - v.gateMin) * (v.wall - v.wallMin) / span : NaN;
    set('s', fmt(v.wall) + ' mm');
    set('va', isFinite(va) ? fmt(va) + ' m/s' : '—');
    set('band', fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
  }
};
