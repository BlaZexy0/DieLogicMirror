/* Füllgrad der Füllkammer (Heatmap: Kammerlänge × Kolben-Ø → Füllgrad). */

import { heat } from './helpers.js';
import { fmt } from '../core/format.js';
import { total } from '../core/physics.js';
import { frac } from './mathfmt.js';

const PI = Math.PI;

export default {
  id: 'fill',
  title: 'Füllgrad der Füllkammer',
  desc: 'Dosiergewicht inkl. Pressrest',
  heat: true,
  inputs: ['lmin', 'lmax', 'dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'diam'],

  calc(v) {
    const q = heat(v.lmin, v.lmax, v.dmin, v.dmax,
      (L, d) => 100e9 * ((total(v) + v.biscuit) / v.density) / (L * 0.25 * PI * d * d),
      'Kammerlänge mm', 'Kolben-Ø mm', 'Füllgrad %', 0, 100, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    q.capHi = true;
    q.info = 'Dosiergewicht ' + fmt(total(v) + v.biscuit) + ' kg (inkl. Pressrest) · grau: Füllgrad über 100 %';
    q.pt = [v.length, v.diam];
    q.ptl = 'Kammer ' + fmt(v.length) + ' mm · Ø ' + fmt(v.diam) + ' mm';
    return q;
  },

  mathHTML() {
    return `
<h4>Füllgrad der Füllkammer</h4>
<p class="math-note">Das Dosiervolumen (inkl. Pressrest — siehe Konvention in der Seitenleiste) im Verhältnis
zum Kammervolumen:</p>
<div class="eq">V<sub>dos</sub> = ${frac('m<sub>Bauteil</sub> + m<sub>Anguss</sub> + m<sub>Überlauf</sub> + m<sub>Pressrest</sub>', 'ρ')}</div>
<div class="eq">φ(L, D) = ${frac('V<sub>dos</sub>', 'A<sub>K</sub> · L')} · 100 % = ${frac('4 · V<sub>dos</sub>', 'π · D² · L')} · 100 %</div>
<p class="math-note">Die Heatmap zeigt φ über (L, D); niedriger Füllgrad heißt viel Luft in der Kammer,
hoher Füllgrad wenig Reserve für die 1. Phase. Graue Bereiche liegen über 100 % — das Dosiervolumen
passt dort nicht in die Kammer. Aktuell: V<sub>dos</sub> = <b data-m="Vdos"></b> ·
φ(Ø <span data-m="D"></span>, L <span data-m="L"></span>) = <b data-m="phi"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const Vdos = (total(v) + v.biscuit) / v.density;
    set('Vdos', fmt(Vdos * 1e6) + ' cm³');
    set('D', fmt(v.diam) + ' mm');
    set('L', fmt(v.length) + ' mm');
    const phi = 100e9 * Vdos / (v.length * 0.25 * PI * v.diam * v.diam);
    set('phi', isFinite(phi) ? fmt(phi) + ' %' : '—');
  }
};
