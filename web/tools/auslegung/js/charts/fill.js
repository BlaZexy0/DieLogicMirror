/* Füllgrad der Füllkammer (Heatmap: Kammerlänge × Kolben-Ø → Füllgrad). */

import { heat, limit } from './helpers.js';
import { fmt } from '../core/format.js';
import { doseMass, doseVolume, fillRatio, fillDiameter } from '../core/physics.js';
import { eq, mathSetter } from './mathfmt.js';

export default {
  id: 'fill',
  title: 'Füllgrad der Füllkammer',
  desc: 'Dosiergewicht inkl. Pressrest',
  inputs: ['lmin', 'lmax', 'dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'diam'],

  calc(v) {
    const q = heat(v.lmin, v.lmax, v.dmin, v.dmax,
      (L, d) => 100 * fillRatio(v, d, L),
      'Kammerlänge in mm', 'Kolben-Ø in mm', 'Füllgrad in %', 0, 100, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    /* Füllgrad ≤ 100 % ⇔ D ≥ D₁₀₀(L) = √(4·V_dos/(π·L)) — als Kurvengrenze */
    q.limits = [limit('fill100', 'φ = 100 %', 'y', 'min',
      L => fillDiameter(v, 1, L), { note: 'Dosiervolumen passt nicht in die Kammer' })];
    q.info = 'Dosiergewicht ' + fmt(doseMass(v)) + ' kg (inkl. Pressrest) · schraffiert: Füllgrad über 100 %';
    q.pt = [v.length, v.diam];
    q.ptl = 'Kammer ' + fmt(v.length) + ' mm · Ø ' + fmt(v.diam) + ' mm';
    return q;
  },

  mathHTML() {
    return `
<h4>Füllgrad der Füllkammer</h4>
<p class="math-note">Der Füllgrad entscheidet über die ganze 1. Phase: über der Schmelze steht Luft, die der
Kolben vor sich herschiebt und die rechtzeitig entweichen muss. Und je voller die Kammer, desto weniger
Geschwindigkeit verträgt die Schmelzewelle, ohne zu brechen (v<sub>krit</sub> fällt mit φ). Zu leer ist auch
schlecht: viel Luft heißt langer Vorlauf und mehr Gas, das durch die Entlüftung muss. Die Rechnung selbst ist
reine Geometrie: dosiertes Volumen (flüssig, inkl. Pressrest, Konvention in der Seitenleiste) durch
Kammervolumen:</p>
${eq('V_{\\text{dos}} = \\frac{m_{\\text{Bauteil}} + m_{\\text{Anguss}} + m_{\\text{Überlauf}} + m_{\\text{Pressrest}}}{\\rho }')}
${eq('\\varphi (L, D) = \\frac{V_{\\text{dos}}}{A_{K} \\cdot L} \\cdot 100 \\% = \\frac{4 \\cdot V_{\\text{dos}}}{\\pi \\cdot D^{2} \\cdot L} \\cdot 100 \\%')}
<p class="math-note">Die Heatmap zeigt φ über (L, D); niedriger Füllgrad heißt viel Luft in der Kammer,
hoher Füllgrad wenig Reserve für die 1. Phase. Schraffierte Bereiche liegen über 100 %: das Dosiervolumen
passt dort nicht in die Kammer; die Grenzkurve ist D₁₀₀(L) = √(4·V<sub>dos</sub>/(π·L)). Aktuell: V<sub>dos</sub> = <b data-m="Vdos"></b> ·
φ(Ø <span data-m="D"></span>, L <span data-m="L"></span>) = <b data-m="phi"></b></p>`;
  },

  renderMath(el, v) {
    const set = mathSetter(el);
    set('Vdos', fmt(doseVolume(v) * 1e6) + ' cm³');
    set('D', fmt(v.diam) + ' mm');
    set('L', fmt(v.length) + ' mm');
    const phi = 100 * fillRatio(v);
    set('phi', isFinite(phi) ? fmt(phi) + ' %' : '—');
  }
};
