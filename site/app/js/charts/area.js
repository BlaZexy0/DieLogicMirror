/* Zulässige Sprengfläche über Druck — inkl. Außermittigkeit des
   Schwerpunkts (Hebelfaktor k aus shared/clampmodel.js, dieselbe
   Implementierung wie in der STL-Analyse). */

import { series, line } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { frac } from './mathfmt.js';

function leverK(v) {
  return (v.tieX > 0 && v.tieY > 0)
    ? window.__CLAMP_MODEL__.leverK(v.eccX, v.eccY, v.tieX, v.tieY)
    : 1;
}

export default {
  id: 'area',
  title: 'Zulässige Sprengfläche',
  desc: 'Maschinenkraft, Druck und Außermittigkeit',
  inputs: ['force', 'safety', 'pmin', 'pmax', 'psel', 'area', 'eccX', 'eccY', 'tieX', 'tieY'],

  calc(v) {
    const C = theme.chart;
    const k = leverK(v);
    const lift = k - 1 >= 1;
    const x = seq(v.pmin, v.pmax, 140);
    const ss = [
      series('S=1,00 · zentrisch', C.series1, x, p => 0.01 * v.force / p),
      series('S=' + fmt(v.safety) + ' · zentrisch', C.series2, x, p => 0.01 * v.force / (v.safety * p))
    ];
    if (k > 1) {
      ss.push(series('S=' + fmt(v.safety) + ' · k=' + fmt(k), C.series3, x,
        p => 0.01 * v.force / (v.safety * k * p)));
    }
    const q = line(x, ss, 'Druck in bar', 'Max. Sprengfläche m²',
      'Kraft ' + fmt(v.force) + ' kN · S=' + fmt(v.safety) +
      ' · e=(' + fmt(v.eccX) + ', ' + fmt(v.eccY) + ') mm · k=' + fmt(k) +
      (lift ? ' · ⚠ Abheben' : ''));
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
    set('a1', v.psel > 0 ? fmt(0.01 * v.force / v.psel) + ' m²' : '—');
    set('aS', ok ? fmt(0.01 * v.force / (v.safety * v.psel)) + ' m²' : '—');
    set('aK', ok ? fmt(0.01 * v.force / (v.safety * k * v.psel)) + ' m²' : '—');
    set('asel', fmt(v.area) + ' m²');
  }
};
