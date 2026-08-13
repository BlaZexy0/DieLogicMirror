/* Kritische Kolbengeschwindigkeit der 1. Phase als Heatmap — nach Nogowizin,
   identisch zur Prüfung in der Schusskurve und zur v_krit-Grenze im
   (φ, λ)-Auslegungsfenster. */

import { heat, limit } from './helpers.js';
import { fmt } from '../core/format.js';
import { total, pistonArea, vCrit } from '../core/physics.js';
import { sqrt } from './mathfmt.js';

export default {
  id: 'slowshot',
  title: 'Kritische Kolbengeschw. 1. Phase',
  desc: 'Nogowizin — konsistent zur Schusskurve',
  heat: true,
  inputs: ['dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'diam', 'v1sel'],

  calc(v) {
    /* Farbskala an den Ø-Bereich anpassen: Maximum bei kleinstem Füllgrad und größtem Ø. */
    const hiRaw = vCrit(v.dmax / 1000, 0.02);
    const step = hiRaw > 3 ? 0.5 : hiRaw > 1.5 ? 0.25 : 0.1;
    const hi = Math.max(step, Math.ceil(hiRaw / step) * step);
    const levels = [];
    for (let L = step; L < hi - 1e-9; L += step) levels.push(Number(L.toFixed(2)));

    const q = heat(0, 100, v.dmin, v.dmax,
      (ff, d) => vCrit(d / 1000, ff / 100),
      'Füllgrad %', 'Kolben-Ø mm', 'Krit. Kolbengeschw. m/s', 0, hi, levels);
    /* Verletzungszone: unterhalb der Kurve v_krit(D, φ) = v₁ ist die gewählte
       1.-Phase-Geschwindigkeit zu schnell (Wellenüberschlag). v_krit steigt
       mit D — der Grenz-Ø je Füllgrad wird per Bisektion bestimmt. */
    if (v.v1sel > 0 && v.dmax > v.dmin) {
      const span = v.dmax - v.dmin;
      const Dstar = ff2 => {
        const phi = Math.min(Math.max(ff2 / 100, 0.001), 0.999);
        let lo = v.dmin, hi = v.dmax;
        if (vCrit(lo / 1000, phi) >= v.v1sel) return v.dmin - span;   // ganze Spalte ok
        if (vCrit(hi / 1000, phi) < v.v1sel) return v.dmax + span;    // ganze Spalte verletzt
        for (let i = 0; i < 40; i++) {
          const m = (lo + hi) / 2;
          if (vCrit(m / 1000, phi) < v.v1sel) lo = m; else hi = m;
        }
        return (lo + hi) / 2;
      };
      q.limits = [limit('vcrit', 'v_krit = v₁ ' + fmt(v.v1sel) + ' m/s', 'y', 'min', Dstar,
        { note: 'v₁ über v_krit (Wellenüberschlag)' })];
    }
    const ff = 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * pistonArea(v));
    q.pt = [ff, v.diam];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm · Füllgrad ' + fmt(ff) + ' %';
    q.info = 'Nogowizin — identisch zur Schusskurven-Prüfung · Füllgrad inkl. Pressrest · v₁ = ' + fmt(v.v1sel) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Kritische Kolbengeschwindigkeit der 1. Phase (Nogowizin)</h4>
<p class="math-note">Die langsame Phase soll eine Schmelzewelle vor dem Kolben herschieben, ohne sie zu
überschlagen und Luft einzuwirbeln. Die Grenzgeschwindigkeit skaliert mit der
Schwerewellen-Geschwindigkeit √(g·D) und fällt mit dem Füllgrad:</p>
<div class="eq">v<sub>krit</sub>(D, φ) = ${sqrt('9,81 · D')} · f(φ)&emsp;mit&emsp;f(φ) = 1,386 − 1,915·φ + 0,615·φ²</div>
<p class="math-note">Dieselbe Formel wird in der Schusskurven-Prüfung („1. Phase bis Kammer voll") und als
v<sub>krit</sub>-Grenze im (φ, λ)-Auslegungsfenster verwendet — alle drei Diagramme sind konsistent.
φ ist der Füllgrad inkl. Pressrest (Dosiergewicht).</p>
<p class="math-note">Aktuell: φ = <b data-m="phi"></b> · v<sub>krit</sub>(Ø <span data-m="D"></span>) = <b data-m="vc"></b> ·
gewählte v₁ = <b data-m="v1"></b> ⇒ <b data-m="cmp"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const ff = 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * pistonArea(v));
    const vc = vCrit(v.diam / 1000, ff / 100);
    set('phi', isFinite(ff) ? fmt(ff) + ' %' : '—');
    set('D', fmt(v.diam) + ' mm');
    set('vc', isFinite(vc) ? fmt(vc) + ' m/s' : '—');
    set('v1', fmt(v.v1sel) + ' m/s');
    set('cmp', isFinite(vc)
      ? (v.v1sel <= vc ? '✓ v₁ ≤ v<sub>krit</sub>' : '✗ v₁ > v<sub>krit</sub>')
      : '—');
  }
};
