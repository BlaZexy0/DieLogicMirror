/* Empfohlene Füllzeit nach NADCA über Wandstärke. */

import { series, line, limit } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { eq } from './mathfmt.js';

export default {
  id: 'ftwall',
  title: 'Empfohlene Füllzeit',
  desc: 'NADCA über Wandstärke',
  inputs: ['wallMin', 'wallMax', 'kfill', 'Tcast', 'Tflow', 'Tdie', 'Sfrac', 'Zconst', 'tmax', 'wall'],

  calc(v) {
    const x = seq(v.wallMin, v.wallMax, 140);
    const f = s => v.kfill * s * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / (v.Tflow - v.Tdie);
    const q = line(x, [series('Empf. Füllzeit', theme.chart.series1, x, f)],
      'Wandstärke mm', 'Füllzeit ms', 'Tguss ' + fmt(v.Tcast) + ' °C · Tform ' + fmt(v.Tdie) + ' °C');
    q.y0 = 0;
    q.limits = [limit('tmax', 't_f max ' + fmt(v.tmax) + ' ms', 'y', 'max', v.tmax, { note: 'Füllzeit zu lang' })];
    q.pt = [v.wall, f(v.wall)];
    q.ptl = fmt(v.wall) + ' mm → ' + fmt(f(v.wall)) + ' ms';
    return q;
  },

  mathHTML() {
    return `
<h4>Empfohlene Füllzeit nach NADCA</h4>
<p class="math-note">Die zulässige Füllzeit wächst linear mit der Wandstärke s und mit der Überhitzung der
Schmelze und sinkt mit kälterer Form. Der zulässige erstarrte Anteil S<sub>zul</sub> geht über die
Z-Konstante als äquivalente Temperaturspanne ein:</p>
${eq('t_{f}(s) = k \\cdot s \\cdot \\frac{T_{\\text{guss}} - T_{\\text{fließ}} + S_{\\text{zul}} \\cdot Z}{T_{\\text{fließ}} - T_{\\text{form}}}')}
<p class="math-note">Zähler: nutzbare thermische Reserve der Schmelze [°C] · Nenner: treibendes
Temperaturgefälle zur Form [°C] · k: NADCA-Faktor [ms/mm].</p>
<p class="math-note">Aktuell: Zähler = <b data-m="num"></b> · Nenner = <b data-m="den"></b> ·
t<sub>f</sub>(s = <span data-m="s"></span>) = <b data-m="tf"></b> · Limit t<sub>max</sub> = <b data-m="tmax"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const num = v.Tcast - v.Tflow + v.Sfrac * v.Zconst;
    const den = v.Tflow - v.Tdie;
    set('num', fmt(num) + ' °C');
    set('den', fmt(den) + ' °C');
    set('s', fmt(v.wall) + ' mm');
    set('tf', den !== 0 ? fmt(v.kfill * v.wall * num / den) + ' ms' : '—');
    set('tmax', fmt(v.tmax) + ' ms');
  }
};
