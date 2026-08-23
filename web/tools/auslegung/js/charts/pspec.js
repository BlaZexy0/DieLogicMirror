/* Spezifischer Gießdruck über Kolben-Ø. Das Zielband ist abgeleitet:
   Untergrenze = Auslegungsdruck psel (das muss der Kolben liefern),
   Obergrenze = max. Nachdruck der Zuhaltung (shared/clampmodel.js) —
   keine freien Ziel-Gießdruck-Eingaben mehr. */

import { series, line, target } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { injForceEff } from '../core/physics.js';
import { eq } from './mathfmt.js';

const PI = Math.PI;

function clampMax(v) {
  const k = (v.tieX > 0 && v.tieY > 0)
    ? window.__CLAMP_MODEL__.leverK(v.eccX, v.eccY, v.tieX, v.tieY) : 1;
  return window.__CLAMP_MODEL__.pMax(v.force, v.area, v.safety, k);
}

export default {
  id: 'pspec',
  title: 'Spezifischer Gießdruck',
  desc: 'über Kolben-Ø',
  inputs: ['dmin', 'dmax', 'injForce', 'pAcc', 'pAccOp', 'diam', 'psel', 'force', 'area', 'safety', 'eccX', 'eccY', 'tieX', 'tieY'],

  calc(v) {
    const x = seq(v.dmin, v.dmax, 140);
    const F = injForceEff(v);
    const f = d => F * 1e4 / (0.25 * PI * d * d);
    const pClamp = clampMax(v);
    const q = line(x, [series('Gießdruck', theme.chart.series1, x, f)],
      'Kolben-Ø mm', 'Spez. Gießdruck bar', 'Gießkraft ' + fmt(F) + ' kN bei ' + fmt(v.pAccOp) + ' bar Akkumulatordruck');
    if (v.psel > 0 && isFinite(pClamp)) {
      const lo = Math.min(v.psel, pClamp), hi = Math.max(v.psel, pClamp);
      q.limits = [target('pspecBand', 'Bedarf ' + fmt(v.psel) + ' – Zuhaltung ' + fmt(pClamp) + ' bar', 'y', lo, hi)];
    }
    q.y0 = 0;
    q.pt = [v.diam, f(v.diam)];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm → ' + fmt(f(v.diam)) + ' bar';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Spezifischer Gießdruck</h4>
<p class="math-note">Die dynamische Gießkraft F<sub>G</sub> wirkt über die Kolbenfläche auf die Schmelze —
das ist derselbe statische Metalldruck p₀ wie im PQ²-Diagramm:</p>
${eq('p_{\\text{spez}}(D) = \\frac{F_{G}}{A_{K}} = \\frac{4 \\cdot F_{G}}{\\pi \\cdot D^{2}} \\quad\\ (\\text{in Einheiten:}\\ p [\\text{bar}] = 10^{4} \\cdot F [\\text{kN}] / A [\\text{mm}^{2}])')}

<h4>2 · Abgeleitetes Zielband</h4>
<p class="math-note">Untergrenze ist der Auslegungsdruck p<sub>sel</sub> — weniger liefert der Kolben, als die
Auslegung verlangt. Obergrenze ist der maximale Nachdruck der Zuhaltung
p<sub>max</sub> = F<sub>s</sub> / (100 · S · k · A) — mehr hält die Form nicht zu.</p>
${eq('D(p) = \\sqrt{\\frac{4 \\cdot F_{G}}{\\pi \\cdot p}} \\quad \\Rightarrow \\quad\\ \\text{Band}\\ p_{\\text{sel}} \\dots p_{\\max} \\Leftrightarrow \\text{Ø}\\ \\text{von}\\ D(p_{\\max})\\ \\text{bis}\\ D(p_{\\text{sel}})')}
<p class="math-note">Aktuell: p<sub>spez</sub>(Ø <span data-m="D"></span>) = <b data-m="p"></b> ·
Band <span data-m="band"></span> ⇒ Ø-Bereich <b data-m="Dband"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const F = injForceEff(v);
    const p = F * 1e4 / (0.25 * PI * v.diam * v.diam);
    const Dof = pb => Math.sqrt(F * 1e4 / (0.25 * PI * pb));
    const pClamp = clampMax(v);
    set('D', fmt(v.diam) + ' mm');
    set('p', isFinite(p) ? fmt(p) + ' bar' : '—');
    set('band', fmt(v.psel) + '–' + fmt(pClamp) + ' bar');
    set('Dband', (v.psel > 0 && pClamp > 0 && isFinite(pClamp))
      ? 'Ø ' + fmt(Dof(pClamp)) + '–' + fmt(Dof(v.psel)) + ' mm'
      : '—');
  }
};
