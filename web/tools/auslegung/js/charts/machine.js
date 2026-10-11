/* Erforderliche Maschinengröße (Kraftbedarf über Druck). */

import { series, line, limit } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { pMaxMachine, clampForceNeeded, leverFactor } from '../core/physics.js';
import { eq, tex, mathSetter } from './mathfmt.js';

/* Kraftbilanz F = 100·p·A·S·k aus shared/clampmodel.js — eine Umrechnung für
   Dashboard, KPI-Zeile und STL-Analyse. */
const CLAMP = window.__CLAMP_MODEL__;

export default {
  id: 'machine',
  title: 'Erforderliche Maschinengröße',
  desc: 'Kraftbedarf über Druck',
  inputs: ['area', 'safety', 'injForce', 'pAcc', 'pAccOp', 'dmin', 'psel', 'force', 'eccX', 'eccY', 'tieX', 'tieY'],

  calc(v) {
    /* Druckachse 0 … max. spezifischer Gießdruck der Maschine (Ø dmin) */
    const pMax = pMaxMachine(v);
    if (!(pMax > 0) || !isFinite(pMax)) return { err: 'Gießkraft und Kolben-Ø min. müssen > 0 sein.' };
    const x = seq(0, pMax, 140);
    const k = leverFactor(v);
    /* Dieselbe Größe bei zwei Sicherheiten: das Minimum S = 1 blass */
    const q = line(x, [
      series('S=1,00', 'ink', x, p => CLAMP.forceKN(p, v.area, 1, k), { alpha: 0.4 }),
      series('S=' + fmt(v.safety), 'ink', x, p => CLAMP.forceKN(p, v.area, v.safety, k))
    ], 'Druck in bar', 'Maschinengröße in kN', 'Fläche ' + fmt(v.area) + ' m² · S=' + fmt(v.safety) + (k > 1 ? ' · k=' + fmt(k) : ''));
    /* y knapp über Maschinenkraft und Betriebspunkt kappen — sonst dominiert
       bei großem pMax die Schraffur „über Maschinenkraft" das ganze Bild. */
    q.y0 = 0;
    const freq = clampForceNeeded(v);
    q.y1 = Math.max(1.6 * v.force, 1.25 * freq) || undefined;
    q.pt = [v.psel, freq];
    q.ptl = 'Bedarf: ' + fmt(freq) + ' kN';
    q.limits = [limit('force', 'Verfügbar ' + fmt(v.force) + ' kN', 'y', 'max', v.force, { note: 'über Maschinenkraft' })];
    return q;
  },

  mathHTML() {
    return `
<h4>Erforderliche Schließkraft</h4>
<p class="math-note">Die Frage hier: <em>Welche Maschinengröße braucht dieses Bauteil?</em> Es ist die Umkehrung
der Sprengflächen-Beziehung (Aufdrückkraft = Metalldruck mal projizierte Fläche); bei gegebener Sprengfläche A
und metallseitigem Nachdruck p muss die Maschine mindestens aufbringen:</p>
${eq('F_{\\text{erf}}(p) = S \\cdot k \\cdot p \\cdot A \\cdot 100 \\quad (F\\ \\text{in kN,}\\ p\\ \\text{in bar,}\\ A\\ \\text{in}\\ m^{2};\\ \\; 1\\ \\text{bar}\\ = 100\\ \\text{kN}/\\text{m}^{2})')}
<p class="math-note">k ist der Hebelfaktor der Außermittigkeit (Diagramm „Zulässige Sprengfläche";
zentrisch k = 1): die meistbelastete Säule trägt k-mal ihren Anteil. Die beiden Kurven zeigen S = 1 (physikalisches Minimum) und den gewählten
Sicherheitsfaktor; die gestrichelte Linie ist die verfügbare Maschinenkraft. Umstellung nach A liefert das
Diagramm „Zulässige Sprengfläche": A<sub>max</sub> = ${tex('\\frac{F_{\\text{schließ}}}{100 \\cdot S \\cdot p}')}.</p>
<p class="math-note">Aktuell bei p = <b data-m="psel"></b>: F<sub>erf</sub> = <b data-m="freq"></b> ·
verfügbar = <b data-m="favail"></b> · Auslastung = <b data-m="util"></b></p>`;
  },

  renderMath(el, v) {
    const set = mathSetter(el);
    const freq = clampForceNeeded(v);
    set('psel', fmt(v.psel) + ' bar');
    set('freq', fmt(freq) + ' kN' + (leverFactor(v) > 1 ? ' (k = ' + fmt(leverFactor(v)) + ')' : ''));
    set('favail', fmt(v.force) + ' kN');
    set('util', v.force > 0 ? fmt(100 * freq / v.force) + ' %' : '—');
  }
};
