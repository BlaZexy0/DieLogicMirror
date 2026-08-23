/* Zulässige Sprengfläche über Druck — inkl. Außermittigkeit des
   Schwerpunkts (Hebelfaktor k aus shared/clampmodel.js, dieselbe
   Implementierung wie in der STL-Analyse). */

import { series, line, refline } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { pMaxMachine } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { frac } from './mathfmt.js';

const CLAMP = window.__CLAMP_MODEL__;
function leverK(v) {
  return (v.tieX > 0 && v.tieY > 0) ? CLAMP.leverK(v.eccX, v.eccY, v.tieX, v.tieY) : 1;
}

export default {
  id: 'area',
  title: 'Zulässige Sprengfläche',
  desc: 'Maschinenkraft, Druck und Außermittigkeit',
  inputs: ['force', 'safety', 'injForce', 'dmin', 'psel', 'area', 'eccX', 'eccY', 'tieX', 'tieY'],

  calc(v) {
    const C = theme.chart;
    const k = leverK(v);
    const lift = k - 1 >= 1;
    /* Druckachse bis zum max. spezifischen Gießdruck der Maschine; die
       Hyperbeln A(p) = F/(100·S·k·p) laufen für p → 0 gegen unendlich —
       y wird beim Säulenfeld a_x × a_y gekappt (mehr Sprengfläche passt
       physisch nicht zwischen die Säulen) und x beginnt, wo die oberste
       Kurve unter diese Kappe kommt. */
    const pMax = pMaxMachine(v);
    if (!(pMax > 0) || !isFinite(pMax)) return { err: 'Gießkraft und Kolben-Ø min. müssen > 0 sein.' };
    const yCap = v.tieX > 0 && v.tieY > 0 ? v.tieX * v.tieY * 1e-6 : CLAMP.areaMax(v.force, pMax / 50, 1, 1);
    let p0 = CLAMP.pMax(v.force, yCap, 1, 1);
    if (!isFinite(p0) || p0 <= 0 || p0 >= pMax) p0 = pMax / 100;
    const x = seq(p0, pMax, 140);
    const ss = [
      series('S=1,00 · zentrisch', C.series1, x, p => CLAMP.areaMax(v.force, p, 1, 1)),
      series('S=' + fmt(v.safety) + ' · zentrisch', C.series2, x, p => CLAMP.areaMax(v.force, p, v.safety, 1))
    ];
    if (k > 1) {
      ss.push(series('S=' + fmt(v.safety) + ' · k=' + fmt(k), C.series3, x,
        p => CLAMP.areaMax(v.force, p, v.safety, k)));
    }
    const q = line(x, ss, 'Druck in bar', 'Max. Sprengfläche m²',
      'Kraft ' + fmt(v.force) + ' kN · S=' + fmt(v.safety) +
      ' · e=(' + fmt(v.eccX) + ', ' + fmt(v.eccY) + ') mm · k=' + fmt(k) +
      (lift ? ' · ⚠ Abheben' : '') +
      ' · y gekappt beim Säulenfeld ' + fmt(yCap) + ' m²');
    q.y0 = 0;
    q.y1 = yCap;
    /* Gewählte Sprengfläche als Referenz: die Schnittpunkte mit den Kurven
       zeigen direkt den maximal zulässigen Druck je Sicherheitsfaktor. */
    if (v.area > 0)
      q.limits = [refline('areaSel', 'Sprengfläche ' + fmt(v.area) + ' m²', 'y', v.area)];
    q.pt = [v.psel, v.area];
    q.ptl = 'Auslegung: ' + fmt(v.psel) + ' bar / ' + fmt(v.area) + ' m²';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Kräftegleichgewicht an der Form</h4>
<p class="math-note">Der Metalldruck p wirkt auf die projizierte Fläche der Kavität in Öffnungsrichtung
(Sprengfläche A) und versucht, die Form aufzudrücken. Die Schließkraft muss mit Sicherheitsfaktor S
dagegenhalten:</p>
<div class="eq">F<sub>auf</sub> = p · A&emsp;&emsp;F<sub>schließ</sub> ≥ S · p · A</div>

<h4>2 · Außermittigkeit (Hebelfaktor k)</h4>
<p class="math-note">Liegt der Schwerpunkt der Sprengfläche um (e<sub>x</sub>, e<sub>y</sub>) außerhalb
der Säulenmitte (Säulenabstände a<sub>x</sub> × a<sub>y</sub>, starre Platte, lineare Lastverteilung),
trägt die meistbelastete Säule das k-fache einer zentrisch belasteten Säule:</p>
<div class="eq">k = 1 + ${frac('2 · |e<sub>x</sub>|', 'a<sub>x</sub>')} + ${frac('2 · |e<sub>y</sub>|', 'a<sub>y</sub>')}</div>
<p class="math-note">Bei zentrischem Schwerpunkt (e = 0) ist k = 1. Abheben, wenn k − 1 ≥ 1 —
dann klafft die Form an der gegenüberliegenden Ecke (F<sub>Säule,min</sub> ≤ 0).
Aktuell: k = <b data-m="k"></b> ⇒ <b data-m="lift"></b></p>

<h4>3 · Zulässige Sprengfläche</h4>
<div class="eq">A<sub>max</sub>(p) = ${frac('F<sub>schließ</sub>', '100 · S · k · p')}&emsp;&emsp;(A [m²], F [kN], p [bar] — 1 bar = 100 kN/m²)</div>
<p class="math-note">Aktuell bei p = <b data-m="psel"></b>: A<sub>max</sub>(S = 1, k = 1) = <b data-m="a1"></b> ·
A<sub>max</sub>(S = <span data-m="S"></span>, k = 1) = <b data-m="aS"></b> ·
A<sub>max</sub>(S = <span data-m="S2"></span>, k = <span data-m="k2"></span>) = <b data-m="aK"></b> ·
gewählt: A = <b data-m="asel"></b></p>`;
  },

  renderMath(el, v) {
    const set = (key, val) => { const s = el.querySelector('[data-m="' + key + '"]'); if (s) s.innerHTML = val; };
    const k = leverK(v);
    const ok = v.psel > 0 && v.safety > 0;
    set('k', fmt(k));
    set('k2', fmt(k));
    set('lift', k - 1 >= 1 ? '✗ Abheben — Schwerpunkt zu weit außermittig' : '✓ kein Abheben');
    set('psel', fmt(v.psel) + ' bar');
    set('S', fmt(v.safety));
    set('S2', fmt(v.safety));
    set('a1', v.psel > 0 ? fmt(CLAMP.areaMax(v.force, v.psel, 1, 1)) + ' m²' : '—');
    set('aS', ok ? fmt(CLAMP.areaMax(v.force, v.psel, v.safety, 1)) + ' m²' : '—');
    set('aK', ok ? fmt(CLAMP.areaMax(v.force, v.psel, v.safety, k)) + ' m²' : '—');
    set('asel', fmt(v.area) + ' m²');
  }
};
