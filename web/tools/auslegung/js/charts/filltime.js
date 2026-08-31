/* Füllzeit ab Anschnitt (Heatmap: Füllzeit × Kolben-Ø → Kolbengeschwindigkeit). */

import { heat, limit } from './helpers.js';
import { fmt, subHTML } from '../core/format.js';
import { afterGate, cavityVolume } from '../core/physics.js';
import { eq } from './mathfmt.js';

const PI = Math.PI;

export default {
  id: 'filltime',
  title: 'Füllzeit ab Anschnitt',
  desc: 'Bauteil + Überlauf',
  heat: true,
  inputs: ['tmax', 'dmin', 'dmax', 'part', 'overflow', 'densitySolid', 'shrink', 'diam', 'vmax'],
  usesCurve: true,

  calc(v, o) {
    if (!(v.vmax > 0)) return { err: 'Kolbengeschw. max. muss > 0 sein.' };
    /* Farbskala endet bei v_max der Maschine — schnellere Bereiche sind
       mit dieser Maschine nicht fahrbar und werden grau dargestellt.
       Eine Stufe je 1 m/s, aber höchstens MAX_LEVELS: bis v_max = 40 m/s
       (jede reale Maschine) ändert das nichts, ein vertippter Wert legt aber
       sonst den Tab mit einer Milliarden-Allokation lahm. */
    const MAX_LEVELS = 40;
    const step = Math.max(1, Math.ceil(v.vmax / MAX_LEVELS));
    const levels = [];
    for (let L = step; L <= v.vmax; L += step) levels.push(L);
    const q = heat(0.1, v.tmax, v.dmin, v.dmax,
      (t, d) => 1e9 * cavityVolume(afterGate(v), v) / (t * 0.25 * PI * d * d),
      'Füllzeit in ms', 'Kolben-Ø in mm', 'Kolbengeschwindigkeit in m/s', 0, v.vmax, levels);
    /* v_p ≤ v_max ⇔ D ≥ √(4·V_a/(π·t·v_max)) — als Kurvengrenze */
    const Va = cavityVolume(afterGate(v), v);
    q.limits = [limit('vmax', 'v_max ' + fmt(v.vmax) + ' m/s', 'y', 'min',
      t => Math.sqrt(4e9 * Va / (PI * t * v.vmax)), { note: 'über v_max der Maschine' })];
    q.info = 'Ab Anschnitt ' + fmt(afterGate(v)) + ' kg · Bauteil + Überlauf · schraffiert: über vₘₐₓ = ' + fmt(v.vmax) + ' m/s';
    /* Betriebspunkt mit v2 = mittlere Kolbengeschw. nach Anschnitt (Schusskurve) */
    const v2 = o && o.shot && !o.shot.error ? o.shot.v2 : null;
    if (v2 > 0) {
      const tOp = 1e9 * cavityVolume(afterGate(v), v) / (v2 * 0.25 * PI * v.diam * v.diam);
      q.pt = [tOp, v.diam];
      q.ptl = 'Ø ' + fmt(v.diam) + ' mm · v₂ ' + fmt(v2) + ' m/s → ' + fmt(tOp) + ' ms';
    }
    return q;
  },

  mathHTML() {
    return `
<h4>Füllzeit, Kolben-Ø und Kolbengeschwindigkeit</h4>
<p class="math-note">Die Frage hinter diesem Diagramm: <em>Wie schnell muss der Kolben fahren, damit die Form in
der gewünschten Zeit voll ist — und schafft das die Maschine?</em> Weil die Schmelze inkompressibel ist, genügt
dafür die Kontinuität: was vorne in der Kavität ankommt, muss der Kolben hinten verdrängen. Das Volumen ab
Anschnitt V<sub>a</sub> (Kavität von Bauteil + Überlauf, ohne Anguss und Pressrest) geteilt durch die Füllzeit
t<sub>f</sub> ist der nötige Volumenstrom, und der ist Kolbenfläche mal Kolbengeschwindigkeit:</p>
${eq('V_{a} = \\frac{m_{\\text{Bauteil}} + m_{\\text{Überlauf}}}{\\rho } \\qquad Q = \\frac{V_{a}}{t_{f}} = A_{K} \\cdot v_{p}')}
${eq('\\Rightarrow \\quad v_{p}(t_{f}, D) = \\frac{V_{a}}{t_{f} \\cdot A_{K}} = \\frac{4 \\cdot V_{a}}{t_{f} \\cdot \\pi \\cdot D^{2}}')}
<p class="math-note">Die Heatmap zeigt v<sub>p</sub> über (t<sub>f</sub>, D); die weißen Konturen sind Linien
konstanter Kolbengeschwindigkeit. Die Farbskala endet bei v<sub>max</sub> der Maschine — schraffierte Bereiche
verlangen mehr Kolbengeschwindigkeit, als die Maschine kann; die Grenzkurve ist D(t) = √(4·V<sub>a</sub>/(π·t·v<sub>max</sub>)). Aktuell: V<sub>a</sub> = <b data-m="Va"></b> ·
bei Ø <span data-m="D"></span> und v₂ = <span data-m="vsel"></span> (Mittel nach Anschnitt, aus der Schusskurve): t<sub>f</sub> = <b data-m="tf"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const Va = cavityVolume(afterGate(v), v);
    const v2 = shot && !shot.error && shot.v2 != null ? shot.v2 : NaN;
    set('Va', fmt(Va * 1e6) + ' cm³');
    set('D', fmt(v.diam) + ' mm');
    set('vsel', fmt(v2) + ' m/s');
    const tf = 1e9 * Va / (v2 * 0.25 * PI * v.diam * v.diam);
    set('tf', isFinite(tf) ? fmt(tf) + ' ms' : '—');
  }
};
