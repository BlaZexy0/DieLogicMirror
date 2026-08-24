/* Anschnittfläche für Zielgeschwindigkeit. */

import { series, line, target } from './helpers.js';
import { seq, fmt, subHTML } from '../core/format.js';
import { pistonArea } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { eq } from './mathfmt.js';

export default {
  id: 'gate',
  title: 'Anschnittfläche für Zielgeschwindigkeit',
  desc: 'Auslegung Anschnittfenster',
  inputs: ['vmax', 'diam', 'gateMin', 'gateMax', 'gate'],
  usesCurve: true,

  calc(v, o) {
    const C = theme.chart;
    const A = pistonArea(v);
    const x = seq(0, v.vmax, 140);
    /* Kurvenfarben = Fensterfarben von v_a min/max (wie im PQ²/Prozessfenster) */
    const cMin = (theme.limits && theme.limits.gateMin) || C.series1;
    const cMax = (theme.limits && theme.limits.gateMax) || C.series2;
    const q = line(x, [
      series(fmt(v.gateMin) + ' m/s', cMin, x, s => s * A / v.gateMin),
      series(fmt(v.gateMax) + ' m/s', cMax, x, s => s * A / v.gateMax)
    ], 'Kolbengeschwindigkeit m/s', 'Anschnittfläche mm²',
      'Ø ' + fmt(v.diam) + ' mm · Auswahl ' + fmt(v.gate) + ' mm²');
    /* Zulässiges Fenster zwischen den beiden Kurven als Zielband */
    if (v.gateMin > 0 && v.gateMax > 0)
      q.limits = [target('gateBand', 'Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s', 'y',
        s => s * A / v.gateMax, s => s * A / v.gateMin)];
    const v2 = o && o.shot && !o.shot.error ? o.shot.v2 : null;
    if (v2 > 0) {
      q.pt = [v2, v.gate];
      q.ptl = 'Auswahl ' + fmt(v.gate) + ' mm² bei v₂ ' + fmt(v2) + ' m/s';
    }
    return q;
  },

  mathHTML() {
    return `
<h4>Anschnittfläche aus der Zielgeschwindigkeit</h4>
<p class="math-note">Die Anschnittgeschwindigkeit bestimmt, wie die Schmelze in die Kavität eintritt — zu
langsam füllt schlecht und bindet nicht, zu schnell erodiert Form und Kerne (das Zielband kommt aus dem
Prozessfenster). Direkt einstellen kann man v<sub>a</sub> aber nicht: gefahren wird der Kolben. Das Bindeglied
ist wieder die Kontinuität — derselbe Volumenstrom fließt durch Kolben und Anschnitt,
Q = A<sub>K</sub> · v<sub>p</sub> = A<sub>a</sub> · v<sub>a</sub>, der Anschnitt wirkt als Düse mit dem
Übersetzungsverhältnis A<sub>K</sub>/A<sub>a</sub>. Für eine Ziel-Anschnittgeschwindigkeit folgt die nötige
Fläche:</p>
${eq('A_{a}(v_{p}) = \\frac{A_{K} \\cdot v_{p}}{v_{a}}')}
<p class="math-note">Die beiden Kurven gelten für v<sub>a</sub> = Ziel-min (obere Kurve — langsame Zielgeschwindigkeit
braucht große Fläche) und Ziel-max (untere Kurve); dazwischen liegt das zulässige Fenster.</p>
<p class="math-note">Aktuell bei v₂ = <span data-m="vsel"></span> (Mittel nach Anschnitt, aus der Schusskurve):
A<sub>a</sub>(v<sub>a</sub> = <span data-m="gmin"></span>) = <b data-m="Amax"></b> ·
A<sub>a</sub>(v<sub>a</sub> = <span data-m="gmax"></span>) = <b data-m="Amin"></b> ·
Auswahl A<sub>a</sub> = <b data-m="Asel"></b> ⇒ v<sub>a</sub> = <b data-m="va"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const A = pistonArea(v);
    const v2 = shot && !shot.error && shot.v2 != null ? shot.v2 : NaN;
    set('vsel', fmt(v2) + ' m/s');
    set('gmin', fmt(v.gateMin) + ' m/s');
    set('gmax', fmt(v.gateMax) + ' m/s');
    set('Amax', v.gateMin > 0 && isFinite(v2) ? fmt(A * v2 / v.gateMin) + ' mm²' : '—');
    set('Amin', v.gateMax > 0 && isFinite(v2) ? fmt(A * v2 / v.gateMax) + ' mm²' : '—');
    set('Asel', fmt(v.gate) + ' mm²');
    set('va', v.gate > 0 && isFinite(v2) ? fmt(v2 * A / v.gate) + ' m/s' : '—');
  }
};
