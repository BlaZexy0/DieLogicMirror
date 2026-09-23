/* Entlüftungsbedarf über Füllzeit. */

import { series, line, limit, refline } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { total, cavityVolume, fillTimeAt, ventAreaFor, shotSpeed } from '../core/physics.js';
import { eq, mathSetter } from './mathfmt.js';

export default {
  id: 'ventreq',
  title: 'Entlüftungsbedarf',
  desc: 'über Füllzeit',
  inputs: ['part', 'runner', 'overflow', 'densitySolid', 'shrink', 'tmax', 'vAirMax', 'vent', 'gate', 'diam'],
  usesCurve: true,

  calc(v, o) {
    const Vm = cavityVolume(total(v), v);
    const f = t => ventAreaFor(v, t);
    /* y-Achse knapp über der größten Referenz (Anschnittfläche / Ist-Entlüftung /
       Bedarf bei t_max) kappen — die Hyperbel explodiert sonst bei kleinen t
       und drückt den lesbaren Bereich zusammen. x beginnt, wo die Kurve ins
       Bild kommt. */
    const yCap = Math.max(v.gate, v.vent, f(v.tmax)) * 1.15;
    let t0 = 0.95 * 1e9 * Vm / (v.vAirMax * yCap);
    if (!isFinite(t0) || t0 < 1 || t0 >= v.tmax) t0 = 1;
    const x = seq(t0, v.tmax, 140);
    const q = line(x, [series('Erf. Entlüftung', 'ink', x, f)],
      'Füllzeit in ms', 'Erf. Entlüftungsfläche in mm²',
      'Luftvolumen ' + fmt(Vm * 1e6) + ' cm³ · ' + fmt(v.vAirMax) + ' m/s');
    q.y0 = 0;
    q.y1 = yCap;
    q.limits = [
      /* Als Kurvenschranke formuliert: Schraffur nur dort, wo der Bedarf die
         vorhandene Entlüftung tatsächlich übersteigt (links vom Schnittpunkt) */
      limit('ventAvail', 'Ist Entlüftung ' + fmt(v.vent) + ' mm²', 'y', 'max',
        t => f(t) > v.vent ? v.vent : Infinity, { note: 'Bedarf über vorhandener Entlüftung' }),
      /* Die Anschnittfläche ist eine Größe des Werkzeugs: Referenz in dessen Farbe */
      refline('gateRef', 'Anschnittfläche ' + fmt(v.gate) + ' mm²', 'y', v.gate, { c: 'die' })
    ];
    const v2 = shotSpeed(o && o.shot, 'v2');
    if (v2 > 0) {
      const tOp = fillTimeAt(v, v2);
      q.pt = [tOp, f(tOp)];
      q.ptl = fmt(tOp) + ' ms → ' + fmt(f(tOp)) + ' mm²';
    }
    return q;
  },

  mathHTML() {
    return `
<h4>Erforderliche Entlüftungsfläche</h4>
<p class="math-note">Dieselbe Physik wie bei der Entlüftungsgeschwindigkeit, nur als Auslegungsfrage gestellt:
<em>Wie viel Entlüftungsfläche braucht diese Füllzeit?</em> Das zu verdrängende Luftvolumen ist die gesamte
Kavität (V<sub>luft</sub> = Σ m<sub>i</sub>/ρ<sub>sol</sub>); es muss während der Füllzeit t<sub>f</sub> mit
höchstens v<sub>luft,max</sub> durch die Kanäle, sonst staut sich die Luft und wird eingeschlossen. Fläche =
Volumenstrom durch zulässige Geschwindigkeit:</p>
${eq('A_{\\text{ent},\\text{erf}}(t_{f}) = \\frac{V_{\\text{luft}}}{t_{f} \\cdot v_{\\text{luft},\\max}}')}
<p class="math-note">Kurze Füllzeiten verlangen große Entlüftungsflächen (Hyperbel). Die gestrichelten Linien
zeigen die vorhandene Entlüftungsfläche und als Referenz die Anschnittfläche; die Entlüftung liegt
üblicherweise in deren Größenordnung (häufige Faustregel: rund die Hälfte der Anschnittfläche).</p>
<p class="math-note">Aktuell: V<sub>luft</sub> = <b data-m="V"></b> · Betriebspunkt t<sub>f</sub> = <b data-m="tf"></b>
(aus v₂, dem Mittel nach Anschnitt aus der Schusskurve, und Kolben-Ø) ⇒ A<sub>ent,erf</sub> = <b data-m="Areq"></b> · vorhanden <b data-m="Avail"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = mathSetter(el);
    const tOp = fillTimeAt(v, shotSpeed(shot, 'v2'));
    const Areq = ventAreaFor(v, tOp);
    set('V', fmt(cavityVolume(total(v), v) * 1e6) + ' cm³');
    set('tf', isFinite(tOp) ? fmt(tOp) + ' ms' : '—');
    set('Areq', isFinite(Areq) ? fmt(Areq) + ' mm²' : '—');
    set('Avail', fmt(v.vent) + ' mm²');
  }
};
