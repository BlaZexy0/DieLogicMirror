/* Erforderliche Maschinengröße (Kraftbedarf über Druck). */

import { series, line, limit } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { pMaxMachine } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { eq, tex } from './mathfmt.js';

/* Kraftbilanz F = 100·p·A·S·k aus shared/clampmodel.js — eine Umrechnung für
   Dashboard, KPI-Zeile und STL-Analyse. */
const CLAMP = window.__CLAMP_MODEL__;

export default {
  id: 'machine',
  title: 'Erforderliche Maschinengröße',
  desc: 'Kraftbedarf über Druck',
  inputs: ['area', 'safety', 'injForce', 'pAcc', 'pAccOp', 'dmin', 'psel', 'force'],

  calc(v) {
    const C = theme.chart;
    /* Druckachse 0 … max. spezifischer Gießdruck der Maschine (Ø dmin) */
    const pMax = pMaxMachine(v);
    if (!(pMax > 0) || !isFinite(pMax)) return { err: 'Gießkraft und Kolben-Ø min. müssen > 0 sein.' };
    const x = seq(0, pMax, 140);
    const q = line(x, [
      series('S=1,00', C.series1, x, p => CLAMP.forceKN(p, v.area, 1, 1)),
      series('S=' + fmt(v.safety), C.series2, x, p => CLAMP.forceKN(p, v.area, v.safety, 1))
    ], 'Druck in bar', 'Maschinengröße kN', 'Fläche ' + fmt(v.area) + ' m² · S=' + fmt(v.safety));
    /* y knapp über Maschinenkraft und Betriebspunkt kappen — sonst dominiert
       bei großem pMax die Schraffur „über Maschinenkraft" das ganze Bild. */
    q.y0 = 0;
    const freq = CLAMP.forceKN(v.psel, v.area, v.safety, 1);
    q.y1 = Math.max(1.6 * v.force, 1.25 * freq) || undefined;
    q.pt = [v.psel, freq];
    q.ptl = 'Bedarf: ' + fmt(freq) + ' kN';
    q.limits = [limit('force', 'Verfügbar ' + fmt(v.force) + ' kN', 'y', 'max', v.force, { note: 'über Maschinenkraft' })];
    return q;
  },

  mathHTML() {
    return `
<h4>Erforderliche Schließkraft</h4>
<p class="math-note">Umkehrung der Sprengflächen-Beziehung: bei gegebener Sprengfläche A und Auslegungsdruck p
muss die Maschine mindestens aufbringen:</p>
${eq('F_{\\text{erf}}(p) = S \\cdot p \\cdot A \\cdot 100 \\quad (F\\ \\text{in kN,}\\ p\\ \\text{in bar,}\\ A\\ \\text{in}\\ m^{2} \\;\\text{—}\\; 1\\ \\text{bar}\\ = 100\\ \\text{kN}/\\text{m}^{2})')}
<p class="math-note">Die beiden Kurven zeigen S = 1 (physikalisches Minimum) und den gewählten
Sicherheitsfaktor; die gestrichelte Linie ist die verfügbare Maschinenkraft. Umstellung nach A liefert das
Diagramm „Zulässige Sprengfläche": A<sub>max</sub> = ${tex('\\frac{F_{\\text{schließ}}}{100 \\cdot S \\cdot p}')}.</p>
<p class="math-note">Aktuell bei p = <b data-m="psel"></b>: F<sub>erf</sub> = <b data-m="freq"></b> ·
verfügbar = <b data-m="favail"></b> · Auslastung = <b data-m="util"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const freq = CLAMP.forceKN(v.psel, v.area, v.safety, 1);
    set('psel', fmt(v.psel) + ' bar');
    set('freq', fmt(freq) + ' kN');
    set('favail', fmt(v.force) + ' kN');
    set('util', v.force > 0 ? fmt(100 * freq / v.force) + ' %' : '—');
  }
};
