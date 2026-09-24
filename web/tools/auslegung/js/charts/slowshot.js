/* Kritische Kolbengeschwindigkeit der 1. Phase als Heatmap — OpenFOAM-
   CFD-Tabelle (core/physics.js), identisch zur Prüfung in der Schusskurve
   und zur v_krit-Grenze im (φ, λ)-Auslegungsfenster. */

import { heat, limit } from './helpers.js';
import { fmt } from '../core/format.js';
import { fillRatio, vCrit, critDiameter, shotSpeed } from '../core/physics.js';
import { eq, mathSetter } from './mathfmt.js';

export default {
  id: 'slowshot',
  title: 'Kritische Kolbengeschw. 1. Phase',
  desc: 'OpenFOAM-CFD, konsistent zur Schusskurve',
  inputs: ['dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'diam'],
  usesCurve: true,

  calc(v, o) {
    /* v1 = max. Kolbengeschwindigkeit bis „Kammer voll" aus der Schusskurve */
    const v1 = shotSpeed(o && o.shot, 'v1');
    /* Farbskala an den Ø-Bereich anpassen: Maximum bei kleinstem Füllgrad und größtem Ø. */
    const hiRaw = vCrit(v.dmax / 1000, 0.02);
    const step = hiRaw > 3 ? 0.5 : hiRaw > 1.5 ? 0.25 : 0.1;
    const hi = Math.max(step, Math.ceil(hiRaw / step) * step);
    const levels = [];
    for (let L = step; L < hi - 1e-9; L += step) levels.push(Number(L.toFixed(2)));

    const q = heat(0, 100, v.dmin, v.dmax,
      (ff, d) => vCrit(d / 1000, ff / 100),
      'Füllgrad in %', 'Kolben-Ø in mm', 'Krit. Kolbengeschwindigkeit in m/s', 0, hi, levels);
    /* Verletzungszone: unterhalb der Kurve v_krit(D, φ) = v₁ ist die gewählte
       1.-Phase-Geschwindigkeit zu schnell (Wellenüberschlag). v_krit steigt
       mit D — der Grenz-Ø je Füllgrad (core/physics.js critDiameter); liegt
       er außerhalb des Ø-Bereichs, ist die ganze Spalte erlaubt bzw.
       verletzt und die Grenze läuft außerhalb des Bildes. */
    if (v1 > 0 && v.dmax > v.dmin) {
      const span = v.dmax - v.dmin;
      const Dstar = ff2 => {
        const phi = Math.min(Math.max(ff2 / 100, 0.001), 0.999);
        const D = critDiameter(v1, phi, v.dmin / 1000, v.dmax / 1000);
        return D === -Infinity ? v.dmin - span : D === Infinity ? v.dmax + span : D * 1000;
      };
      q.limits = [limit('vcrit', 'v_krit = v₁ ' + fmt(v1) + ' m/s', 'y', 'min', Dstar,
        { note: 'v₁ über v_krit (Wellenüberschlag)' })];
    }
    const ff = 100 * fillRatio(v);
    q.pt = [ff, v.diam];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm · Füllgrad ' + fmt(ff) + ' %';
    q.info = 'OpenFOAM-CFD-Tabelle, identisch zur Schusskurven-Prüfung · Füllgrad inkl. Pressrest · v₁ = '
      + fmt(v1) + ' m/s (aus Schusskurve)';
    return q;
  },

  mathHTML() {
    return `
<h4>Kritische Kolbengeschwindigkeit der 1. Phase (OpenFOAM-CFD)</h4>
<p class="math-note">Die langsame Phase soll eine Schmelzewelle vor dem Kolben herschieben, ohne sie zu
überschlagen und Luft einzuwirbeln. Die Grenzgeschwindigkeit skaliert mit der
Schwerewellen-Geschwindigkeit √(g·D) und fällt mit dem Füllgrad. DieLogic interpoliert
die eigene OpenFOAM-CFD-Tabelle (Ø 60–300 mm × φ 0,1–0,9) bilinear:</p>
${eq('v_{\\text{krit}}(D, \\varphi) = \\sqrt{9{,}81 \\cdot D} \\cdot f(D, \\varphi) \\qquad \\text{mit}\\ f\\ \\text{aus der CFD-Tabelle}\\\\ (\\text{v\\_krit\\_sim.csv})')}
<p class="math-note">Die Flachwassertheorie (Deckenkriterium) und die Nogowizin-Näherung sind ab
mittleren Füllgraden <b>optimistisch</b>: die 3D-Rechnung zeigt Brechen vor Deckenberührung
(bei φ = 0,7 rund +28 % Theorie-Überschätzung) und bei φ ≥ 0,8 einen zusätzlichen Abschlag für
kleine Kolben-Ø. Herleitung und Vergleich: Theorie-Artikel „Kritische Kolbengeschwindigkeit".</p>
<p class="math-note">Dieselbe Formel wird in der Schusskurven-Prüfung („1. Phase bis Kammer voll") und als
v<sub>krit</sub>-Grenze im (φ, λ)-Auslegungsfenster verwendet; alle drei Diagramme sind konsistent.
φ ist der Füllgrad inkl. Pressrest (Dosiergewicht).</p>
<p class="math-note">Aktuell: φ = <b data-m="phi"></b> · v<sub>krit</sub>(Ø <span data-m="D"></span>) = <b data-m="vc"></b> ·
v₁ = <b data-m="v1"></b> (max. bis „Kammer voll", aus der Schusskurve) ⇒ <b data-m="cmp"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = mathSetter(el);
    const phi = fillRatio(v);
    const vc = vCrit(v.diam / 1000, phi);
    const v1 = shotSpeed(shot, 'v1');
    set('phi', isFinite(phi) ? fmt(100 * phi) + ' %' : '—');
    set('D', fmt(v.diam) + ' mm');
    set('vc', isFinite(vc) ? fmt(vc) + ' m/s' : '—');
    set('v1', fmt(v1) + ' m/s');
    set('cmp', isFinite(vc) && isFinite(v1)
      ? (v1 <= vc ? '✓ v₁ ≤ v<sub>krit</sub>' : '✗ v₁ > v<sub>krit</sub>')
      : '—');
  }
};
