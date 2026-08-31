/* Empfohlene Füllzeit nach NADCA über Wandstärke. */

import { series, line, limit } from './helpers.js';
import { seq, fmt, subHTML } from '../core/format.js';
import { theme } from '../core/theme.js';
import { eq } from './mathfmt.js';

export default {
  id: 'ftwall',
  title: 'Empfohlene Füllzeit',
  desc: 'NADCA über Wandstärke',
  inputs: ['wallMin', 'wallMax', 'kfill', 'Tcast', 'Tflow', 'Tdie', 'Sfrac', 'Zconst', 'tmax', 'wall'],

  calc(v) {
    /* Der Nenner ist die Temperaturspanne zwischen Fließ- und Formtemperatur.
       Ohne Prüfung lieferte die NADCA-Formel bei Gleichheit ±Infinity (und
       NaN bei s = 0) und das Diagramm zeichnete es. Dieselbe Formel steht an
       vier Stellen im Repo mit drei verschiedenen Nullschutz-Varianten —
       hier fehlte sie ganz. */
    if (!(v.Tflow > v.Tdie)) {
      return { err: 'Min. Fließtemperatur muss über der Formtemperatur liegen (' + fmt(v.Tflow) + ' °C ≤ ' + fmt(v.Tdie) + ' °C).' };
    }
    const x = seq(v.wallMin, v.wallMax, 140);
    const f = s => v.kfill * s * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / (v.Tflow - v.Tdie);
    const q = line(x, [series('Empf. Füllzeit', theme.chart.series1, x, f)],
      'Wandstärke in mm', 'Füllzeit in ms', 'Tguss ' + fmt(v.Tcast) + ' °C · Tform ' + fmt(v.Tdie) + ' °C');
    q.y0 = 0;
    q.limits = [limit('tmax', 't_f max ' + fmt(v.tmax) + ' ms', 'y', 'max', v.tmax, { note: 'Füllzeit zu lang' })];
    q.pt = [v.wall, f(v.wall)];
    q.ptl = fmt(v.wall) + ' mm → ' + fmt(f(v.wall)) + ' ms';
    return q;
  },

  mathHTML() {
    return `
<h4>Empfohlene Füllzeit nach NADCA</h4>
<p class="math-note">Warum gibt es überhaupt eine Füllzeit-Obergrenze? Die Schmelze kühlt beim Einströmen an
der Formwand ab; fällt sie unter die Mindest-Fließtemperatur, bevor die Kavität voll ist, entstehen Kaltläufe
und Bindefehler. Die NADCA-Empfehlung bilanziert das als Wärmebudget: dünne Wände haben viel Kontaktfläche je
Volumen und verlieren ihre Überhitzung schnell (t<sub>f</sub> ∝ s), mehr Überhitzung T<sub>guss</sub> −
T<sub>fließ</sub> kauft Zeit, eine kalte Form (großes Gefälle T<sub>fließ</sub> − T<sub>form</sub>) nimmt sie.
Dass unterwegs schon ein Anteil S<sub>zul</sub> erstarren darf, geht über die Z-Konstante als äquivalente
Temperaturspanne in den Zähler ein:</p>
${eq('t_{f}(s) = k \\cdot s \\cdot \\frac{T_{\\text{guss}} - T_{\\text{fließ}} + S_{\\text{zul}} \\cdot Z}{T_{\\text{fließ}} - T_{\\text{form}}}')}
<p class="math-note">Zähler: nutzbare thermische Reserve der Schmelze [°C] · Nenner: treibendes
Temperaturgefälle zur Form [°C] · k: NADCA-Faktor [ms/mm].</p>
<p class="math-note">Aktuell: Zähler = <b data-m="num"></b> · Nenner = <b data-m="den"></b> ·
t<sub>f</sub>(s = <span data-m="s"></span>) = <b data-m="tf"></b> · Limit t<sub>max</sub> = <b data-m="tmax"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const num = v.Tcast - v.Tflow + v.Sfrac * v.Zconst;
    const den = v.Tflow - v.Tdie;
    set('num', fmt(num) + ' °C');
    set('den', fmt(den) + ' °C');
    set('s', fmt(v.wall) + ' mm');
    set('tf', den !== 0 ? fmt(v.kfill * v.wall * num / den) + ' ms' : '—');
    set('tmax', fmt(v.tmax) + ' ms');
  }
};
