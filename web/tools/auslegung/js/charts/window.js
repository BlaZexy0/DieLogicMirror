/* Prozessfenster Anschnitt (Heatmap: Kolbengeschw. × Anschnittfläche → Anschnittgeschw.). */

import { heat, target } from './helpers.js';
import { fmt, subHTML } from '../core/format.js';
import { pistonArea } from '../core/physics.js';
import { eq } from './mathfmt.js';

export default {
  id: 'window',
  title: 'Prozessfenster Anschnitt',
  desc: 'Anschnittgeschw. als Feld',
  heat: true,
  inputs: ['vmax', 'gate', 'diam', 'gateMin', 'gateMax'],
  usesCurve: true,

  calc(v, o) {
    const Ap = pistonArea(v);
    /* Ohne Anschnittfläche hat das Feld die Breite null und jede Zelle wird
       0·Ap/0 = NaN. inputs.js markiert die leere Eingabe nur als ungültig, es
       blockiert sie nicht — hier ist der Ort, an dem das auffallen muss. */
    if (!(v.gate > 0)) return { err: 'Anschnittfläche muss > 0 mm² sein.' };
    if (!(v.vmax > 0)) return { err: 'Kolbengeschw. max. muss > 0 sein.' };
    if (!(Ap > 0)) return { err: 'Kolben-Ø muss > 0 sein.' };
    /* Die Farbskala endete fest bei 80 m/s — unabhängig vom Zielband des
       Anwenders. Mit den Defaults sind dadurch 16,0 % des Feldes gesättigt,
       bei einem viertelgroßen Anschnitt 72,2 % (Feldmaximum 1112,6 m/s):
       die Farbe sagt dort nichts mehr aus. Die Skala folgt jetzt dem
       Zielband mit Luft nach oben, und der Anteil oberhalb wird benannt
       statt verschwiegen. */
    const band = v.gateMax > 0 ? v.gateMax : 60;
    const hi = Math.max(20, Math.ceil(band * 1.5 / 10) * 10);
    const levels = [0.25, 0.5, 0.75].map(t => Math.round(hi * t / 5) * 5)
      .filter((z, i, a) => z > 0 && z < hi && a.indexOf(z) === i);
    const q = heat(0, v.vmax, v.gate * 0.3, v.gate * 2,
      (vp, Ag) => vp * Ap / Ag,
      'Kolbengeschwindigkeit in m/s', 'Anschnittfläche in mm²', 'Anschnittgeschwindigkeit in m/s',
      0, hi, levels);
    /* Zielband v_a ∈ [gateMin, gateMax] ⇔ A_a zwischen zwei Hyperbeln */
    if (v.gateMin > 0 && v.gateMax > 0)
      q.limits = [target('gateBand', 'Ziel v_a ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s', 'y',
        vp => vp * Ap / v.gateMax, vp => vp * Ap / v.gateMin)];
    const v2 = o && o.shot && !o.shot.error ? o.shot.v2 : null;
    if (v2 > 0) {
      q.pt = [v2, v.gate];
      q.ptl = 'Ist v₂ ' + fmt(v2) + ' m/s · ' + fmt(v.gate) + ' mm²';
    }
    let n = 0, over = 0;
    for (const row of q.z) for (const z of row) { if (isFinite(z)) { n++; if (z > hi) over++; } }
    q.info = 'Zielband ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s · Farbskala 0–' + fmt(hi) + ' m/s'
      + (over ? ' · ' + fmt(100 * over / n) + ' % des Feldes liegen darüber' : '');
    return q;
  },

  mathHTML() {
    return `
<h4>Prozessfenster Anschnitt</h4>
<p class="math-note">Anschnittgeschwindigkeit lässt sich über zwei Hebel stellen: schneller fahren (v<sub>p</sub>)
oder den Anschnitt verengen (A<sub>a</sub>). Dieses Feld zeigt beide Hebel gleichzeitig: dieselbe
Kontinuitätsbeziehung wie beim Anschnittflächen-Diagramm, ausgewertet über der (v<sub>p</sub>, A<sub>a</sub>)-Ebene;
das Band mit den gestrichelten Rändern ist das Ziel, alles außerhalb verlangt einen anderen Kompromiss aus
Geschwindigkeit und Fläche:</p>
${eq('v_{a}(v_{p}, A_{a}) = v_{p} \\cdot \\frac{A_{K}}{A_{a}}')}
<p class="math-note">Die Konturen sind Linien konstanter Anschnittgeschwindigkeit, je dunkler das Feld, desto schneller; das Zielband ist
v<sub>a</sub> = <span data-m="band"></span>. Aktuell: v<sub>a</sub>(v₂ = <span data-m="vsel"></span>,
A<sub>a</sub> = <span data-m="Ag"></span>) = <b data-m="va"></b>; v₂ ist das Mittel nach Anschnitt aus der Schusskurve.</p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const v2 = shot && !shot.error && shot.v2 != null ? shot.v2 : NaN;
    set('band', fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
    set('vsel', fmt(v2) + ' m/s');
    set('Ag', fmt(v.gate) + ' mm²');
    set('va', v.gate > 0 && isFinite(v2) ? fmt(v2 * pistonArea(v) / v.gate) + ' m/s' : '—');
  }
};
