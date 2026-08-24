/* Kritische Kolbengeschwindigkeit der 1. Phase als Heatmap — OpenFOAM-
   CFD-Tabelle (core/physics.js), identisch zur Prüfung in der Schusskurve
   und zur v_krit-Grenze im (φ, λ)-Auslegungsfenster. */

import { heat, limit } from './helpers.js';
import { fmt, subHTML } from '../core/format.js';
import { total, pistonArea, vCrit } from '../core/physics.js';
import { eq } from './mathfmt.js';

export default {
  id: 'slowshot',
  title: 'Kritische Kolbengeschw. 1. Phase',
  desc: 'OpenFOAM-CFD — konsistent zur Schusskurve',
  heat: true,
  inputs: ['dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'diam'],
  usesCurve: true,

  calc(v, o) {
    /* v1 = max. Kolbengeschwindigkeit bis „Kammer voll" aus der Schusskurve */
    const v1 = o && o.shot && !o.shot.error ? o.shot.v1 : null;
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
    if (v1 > 0 && v.dmax > v.dmin) {
      const span = v.dmax - v.dmin;
      const Dstar = ff2 => {
        const phi = Math.min(Math.max(ff2 / 100, 0.001), 0.999);
        let lo = v.dmin, hi = v.dmax;
        if (vCrit(lo / 1000, phi) >= v1) return v.dmin - span;   // ganze Spalte ok
        if (vCrit(hi / 1000, phi) < v1) return v.dmax + span;    // ganze Spalte verletzt
        for (let i = 0; i < 40; i++) {
          const m = (lo + hi) / 2;
          if (vCrit(m / 1000, phi) < v1) lo = m; else hi = m;
        }
        return (lo + hi) / 2;
      };
      q.limits = [limit('vcrit', 'v_krit = v₁ ' + fmt(v1) + ' m/s', 'y', 'min', Dstar,
        { note: 'v₁ über v_krit (Wellenüberschlag)' })];
    }
    const ff = 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * pistonArea(v));
    q.pt = [ff, v.diam];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm · Füllgrad ' + fmt(ff) + ' %';
    q.info = 'OpenFOAM-CFD-Tabelle — identisch zur Schusskurven-Prüfung · Füllgrad inkl. Pressrest · v₁ = '
      + (v1 == null ? '—' : fmt(v1)) + ' m/s (aus Schusskurve)';
    return q;
  },

  mathHTML() {
    return `
<h4>Kritische Kolbengeschwindigkeit der 1. Phase (OpenFOAM-CFD)</h4>
<p class="math-note">Die langsame Phase soll eine Schmelzewelle vor dem Kolben herschieben, ohne sie zu
überschlagen und Luft einzuwirbeln. Die Grenzgeschwindigkeit skaliert mit der
Schwerewellen-Geschwindigkeit √(g·D) und fällt mit dem Füllgrad. DieLogic interpoliert
die eigene OpenFOAM-CFD-Tabelle (Ø 60–300 mm × φ 0,1–0,9) bilinear:</p>
${eq('v_{\\text{krit}}(D, \\varphi) = \\sqrt{9{,}81 \\cdot D} \\cdot f(D, \\varphi) \\quad \\;\\text{—}\\; \\quad f\\ \\text{aus der CFD-Tabelle}\\\\ (\\text{v\\_krit\\_sim.csv})')}
<p class="math-note">Die Flachwassertheorie (Deckenkriterium) und die Nogowizin-Näherung sind ab
mittleren Füllgraden <b>optimistisch</b> — die 3D-Rechnung zeigt Brechen vor Deckenberührung
(bei φ = 0,7 rund +28 % Theorie-Überschätzung) und bei φ ≥ 0,8 einen zusätzlichen Abschlag für
kleine Kolben-Ø. Herleitung und Vergleich: Theorie-Artikel „Kritische Kolbengeschwindigkeit".</p>
<p class="math-note">Dieselbe Formel wird in der Schusskurven-Prüfung („1. Phase bis Kammer voll") und als
v<sub>krit</sub>-Grenze im (φ, λ)-Auslegungsfenster verwendet — alle drei Diagramme sind konsistent.
φ ist der Füllgrad inkl. Pressrest (Dosiergewicht).</p>
<p class="math-note">Aktuell: φ = <b data-m="phi"></b> · v<sub>krit</sub>(Ø <span data-m="D"></span>) = <b data-m="vc"></b> ·
v₁ = <b data-m="v1"></b> (max. bis „Kammer voll", aus der Schusskurve) ⇒ <b data-m="cmp"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const ff = 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * pistonArea(v));
    const vc = vCrit(v.diam / 1000, ff / 100);
    const v1 = shot && !shot.error ? shot.v1 : NaN;
    set('phi', isFinite(ff) ? fmt(ff) + ' %' : '—');
    set('D', fmt(v.diam) + ' mm');
    set('vc', isFinite(vc) ? fmt(vc) + ' m/s' : '—');
    set('v1', fmt(v1) + ' m/s');
    set('cmp', isFinite(vc) && isFinite(v1)
      ? (v1 <= vc ? '✓ v₁ ≤ v<sub>krit</sub>' : '✗ v₁ > v<sub>krit</sub>')
      : '—');
  }
};
