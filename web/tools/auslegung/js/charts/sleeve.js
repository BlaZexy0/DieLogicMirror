/* Füllkammer-Auswahl: Füllgrad über Kolben-Ø mit Zielband. */

import { series, line, target } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { doseMass, fillRatio, fillDiameter } from '../core/physics.js';
import { eq, mathSetter } from './mathfmt.js';

export default {
  id: 'sleeve',
  title: 'Füllkammer-Auswahl',
  desc: 'Füllgrad (inkl. Pressrest) mit Zielbereich',
  inputs: ['dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'fillMin', 'fillMax', 'diam'],

  calc(v) {
    const x = seq(v.dmin, v.dmax, 140);
    const q = line(x, [series('Füllgrad', 'ink', x, d => 100 * fillRatio(v, d))],
      'Kolben-Ø in mm', 'Füllgrad in %',
      'Dosiert ' + fmt(doseMass(v)) + ' kg (inkl. Pressrest) · Kammer ' + fmt(v.length) + ' mm');
    q.limits = [target('fillBand', 'Ziel φ ' + fmt(v.fillMin) + '–' + fmt(v.fillMax) + ' %', 'y', v.fillMin, v.fillMax)];
    q.y0 = 0; q.y1 = 100;
    const fOp = 100 * fillRatio(v);
    q.pt = [v.diam, fOp];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm → ' + fmt(fOp) + ' %';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Füllgrad über Kolben-Ø</h4>
<p class="math-note">Der Kolben-Ø ist der stärkste Hebel auf den Füllgrad, denn er geht quadratisch in die
Kammerquerschnittsfläche ein, die Kammerlänge nur linear. Dieses Diagramm beantwortet deshalb die
Auswahlfrage: <em>Welche Kolben-Ø aus dem Maschinenbereich bringen den Füllgrad ins Zielband?</em> Bei fester
Kammerlänge L gilt:</p>
${eq('\\varphi (D) = \\frac{V_{\\text{dos}}}{A_{K}(D) \\cdot L} \\cdot 100 \\% = \\frac{4 \\cdot V_{\\text{dos}}}{\\pi \\cdot D^{2} \\cdot L} \\cdot 100 \\%')}

<h4>2 · Umkehrung: Ø-Bereich für das Zielband</h4>
${eq('D(\\varphi) = \\sqrt{\\frac{4 \\cdot V_{\\text{dos}}}{\\pi \\cdot \\varphi \\cdot L}} \\qquad \\text{hoher Ziel-Füllgrad verlangt einen kleinen Kolben und umgekehrt}')}
<p class="math-note">Aktuell: φ(Ø <span data-m="D"></span>) = <b data-m="phi"></b> · Zielband
<span data-m="band"></span> ⇒ zulässiger Ø-Bereich <b data-m="Dband"></b></p>`;
  },

  renderMath(el, v) {
    const set = mathSetter(el);
    const phi = 100 * fillRatio(v);
    const Dof = phiPct => fillDiameter(v, phiPct / 100);
    set('D', fmt(v.diam) + ' mm');
    set('phi', isFinite(phi) ? fmt(phi) + ' %' : '—');
    set('band', fmt(v.fillMin) + '–' + fmt(v.fillMax) + ' %');
    set('Dband', (v.fillMin > 0 && v.fillMax > 0)
      ? 'Ø ' + fmt(Dof(v.fillMax)) + '–' + fmt(Dof(v.fillMin)) + ' mm'
      : '—');
  }
};
