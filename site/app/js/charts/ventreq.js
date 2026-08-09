/* Entlüftungsbedarf über Füllzeit. */

import { series, line } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { total, afterGate, pistonArea } from '../core/physics.js';
import { theme } from '../core/theme.js';
import { frac } from './mathfmt.js';

export default {
  id: 'ventreq',
  title: 'Entlüftungsbedarf',
  desc: 'über Füllzeit',
  inputs: ['part', 'runner', 'overflow', 'density', 'tmax', 'vAirMax', 'vent', 'gate', 'vsel', 'diam'],

  calc(v) {
    const C = theme.chart;
    const Vm = total(v) / v.density;
    const f = t => Vm / (t / 1000) / v.vAirMax * 1e6;
    /* y-Achse knapp über der größten Referenz (Anschnittfläche / Ist-Entlüftung /
       Bedarf bei t_max) kappen — die Hyperbel explodiert sonst bei kleinen t
       und drückt den lesbaren Bereich zusammen. x beginnt, wo die Kurve ins
       Bild kommt. */
    const yCap = Math.max(v.gate, v.vent, f(v.tmax)) * 1.15;
    let t0 = 0.95 * 1e9 * Vm / (v.vAirMax * yCap);
    if (!isFinite(t0) || t0 < 1 || t0 >= v.tmax) t0 = 1;
    const x = seq(t0, v.tmax, 140);
    const q = line(x, [series('Erf. Entlüftung', C.series1, x, f)],
      'Füllzeit ms', 'Erf. Entlüftungsfläche mm²',
      'Luftvolumen ' + fmt(Vm * 1e6) + ' cm³ · ' + fmt(v.vAirMax) + ' m/s');
    q.y0 = 0;
    q.y1 = yCap;
    q.hrefs = [
      { y: v.vent, l: 'Ist Entlüftung ' + fmt(v.vent) + ' mm²' },
      { y: v.gate, l: 'Anschnittfläche ' + fmt(v.gate) + ' mm²', c: C.series2 }
    ];
    const tOp = 1e9 * (afterGate(v) / v.density) / (v.vsel * pistonArea(v));
    q.pt = [tOp, f(tOp)];
    q.ptl = fmt(tOp) + ' ms → ' + fmt(f(tOp)) + ' mm²';
    return q;
  },

  mathHTML() {
    return `
<h4>Erforderliche Entlüftungsfläche</h4>
<p class="math-note">Die Luft im Formhohlraum (≈ verdrängtes Gesamtvolumen der Füllung,
V<sub>luft</sub> = m<sub>ges</sub> / ρ) muss während der Füllzeit t<sub>f</sub> mit höchstens
v<sub>luft,max</sub> entweichen — sonst staut sie sich und wird eingeschlossen:</p>
<div class="eq">A<sub>ent,erf</sub>(t<sub>f</sub>) = ${frac('V<sub>luft</sub>', 't<sub>f</sub> · v<sub>luft,max</sub>')}</div>
<p class="math-note">Kurze Füllzeiten verlangen große Entlüftungsflächen (Hyperbel). Die gestrichelten Linien
zeigen die vorhandene Entlüftungsfläche und als Referenz die Anschnittfläche — die Entlüftung liegt
üblicherweise in deren Größenordnung (häufige Faustregel: rund die Hälfte der Anschnittfläche).</p>
<p class="math-note">Aktuell: V<sub>luft</sub> = <b data-m="V"></b> · Betriebspunkt t<sub>f</sub> = <b data-m="tf"></b>
(aus v<sub>sel</sub> und Kolben-Ø) ⇒ A<sub>ent,erf</sub> = <b data-m="Areq"></b> · vorhanden <b data-m="Avail"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const Vm = total(v) / v.density;
    const tOp = 1e9 * (afterGate(v) / v.density) / (v.vsel * pistonArea(v));
    const Areq = v.vAirMax > 0 && tOp > 0 ? Vm / (tOp / 1000) / v.vAirMax * 1e6 : NaN;
    set('V', fmt(Vm * 1e6) + ' cm³');
    set('tf', isFinite(tOp) ? fmt(tOp) + ' ms' : '—');
    set('Areq', isFinite(Areq) ? fmt(Areq) + ' mm²' : '—');
    set('Avail', fmt(v.vent) + ' mm²');
  }
};
