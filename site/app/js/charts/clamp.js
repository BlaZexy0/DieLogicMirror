/* Zuhaltungs-Rechner: maximal möglicher Nachdruck bei außermittigem
   Schwerpunkt der Sprengfläche. Modell: starre Aufspannplatte auf vier
   Säulen im Abstand a_x × a_y, lineare Lastverteilung (Hebelgesetz) —
   die meistbelastete Säule begrenzt den zulässigen Metalldruck. */

import { heat } from './helpers.js';
import { fmt } from '../core/format.js';
import { frac } from './mathfmt.js';

/* Rechenkern kommt aus shared/clampmodel.js (klassisches Script, vor den
   Modulen geladen) — dieselbe Implementierung nutzt auch die STL-Analyse. */
function leverK(v, ex, ey) {
  return window.__CLAMP_MODEL__.leverK(ex, ey, v.tieX, v.tieY);
}

function pMax(v, ex, ey) {
  return window.__CLAMP_MODEL__.pMax(v.force, v.area, v.safety, leverK(v, ex, ey));
}

/* Größte „runde" Stufe ≤ x (für Konturlevels). */
function niceStep(x) {
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  for (const s of [10, 5, 2.5, 2, 1]) if (s * mag <= x) return s * mag;
  return mag;
}

export default {
  id: 'clamp',
  title: 'Max. Nachdruck (Zuhaltung)',
  desc: 'Säulenlast bei außermittigem Schwerpunkt',
  heat: true,
  inputs: ['force', 'area', 'safety', 'psel', 'tieX', 'tieY', 'eccX', 'eccY'],

  calc(v) {
    if (!(v.force > 0) || !(v.area > 0) || !(v.safety > 0) || !(v.tieX > 0) || !(v.tieY > 0))
      return { err: 'Maschinenkraft, Sprengfläche, Sicherheitsfaktor und Säulenabstände müssen > 0 sein.' };
    const exMax = v.tieX / 4, eyMax = v.tieY / 4;
    const hi = pMax(v, 0, 0);            // zentrisch (k = 1)
    const lo = pMax(v, exMax, eyMax);    // Ecke des Plots (k = 2)
    const step = niceStep((hi - lo) / 5);
    const levels = [];
    for (let L = Math.ceil(lo / step) * step; L < hi - 1e-9; L += step) levels.push(Number(L.toFixed(2)));

    const q = heat(0, exMax, 0, eyMax, (ex, ey) => pMax(v, ex, ey),
      'Außermittigkeit e_x mm', 'Außermittigkeit e_y mm', 'Max. Nachdruck bar', lo, hi, levels);
    const p = pMax(v, v.eccX, v.eccY);
    q.pt = [Math.abs(v.eccX), Math.abs(v.eccY)];
    q.ptl = 'e = (' + fmt(v.eccX) + ', ' + fmt(v.eccY) + ') mm → ' + fmt(p) + ' bar';
    q.info = 'F_s ' + fmt(v.force) + ' kN · Säulen ' + fmt(v.tieX) + ' × ' + fmt(v.tieY) + ' mm · S = ' + fmt(v.safety) + ' · zentrisch ' + fmt(hi) + ' bar';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Säulenlastverteilung (Hebelgesetz)</h4>
<p class="math-note">Die Aufdrückkraft F<sub>auf</sub> = p · A greift im Schwerpunkt der Sprengfläche an.
Liegt er um (e<sub>x</sub>, e<sub>y</sub>) außerhalb der Säulenmitte, verteilt sich die Last ungleich auf die
vier Säulen (Abstand a<sub>x</sub> × a<sub>y</sub>; starre Platte, lineare Verteilung):</p>
<div class="eq">F<sub>i</sub> = F<sub>auf</sub> · ( ¼ ± ${frac('e<sub>x</sub>', '2 · a<sub>x</sub>')} ± ${frac('e<sub>y</sub>', '2 · a<sub>y</sub>')} )</div>
<div class="eq">F<sub>Säule,max</sub> = ${frac('F<sub>auf</sub>', '4')} · k&emsp;mit&emsp;k = 1 + ${frac('2 · e<sub>x</sub>', 'a<sub>x</sub>')} + ${frac('2 · e<sub>y</sub>', 'a<sub>y</sub>')}</div>
<p class="math-note">Aktuell: k = <b data-m="k"></b> — die meistbelastete Säule trägt das k-fache einer
zentrisch belasteten Säule.</p>

<h4>2 · Zulässige Aufdrückkraft und maximaler Nachdruck</h4>
<p class="math-note">Jede Säule trägt nominell F<sub>s</sub>/4. Mit Sicherheitsfaktor S muss die
meistbelastete Säule darunter bleiben:</p>
<div class="eq">S · ${frac('F<sub>auf</sub>', '4')} · k ≤ ${frac('F<sub>s</sub>', '4')}&emsp;⇔&emsp;F<sub>auf,max</sub> = ${frac('F<sub>s</sub>', 'S · k')}</div>
<div class="eq">p<sub>max</sub> = ${frac('F<sub>auf,max</sub>', 'A')} = ${frac('F<sub>s</sub>', '100 · S · k · A')}&emsp;(p in bar, F in kN, A in m²)</div>
<p class="math-note">Bei e = 0 ist k = 1 — dann ist p<sub>max</sub> exakt die Beziehung aus „Zulässige
Sprengfläche" / „Erforderliche Maschinengröße". Aktuell: F<sub>auf,max</sub> = <b data-m="Fmax"></b> ·
p<sub>max</sub> = <b data-m="pmax"></b> ⇒ <b data-m="cmp"></b></p>

<h4>3 · Umkehrung und Abhebe-Prüfung</h4>
<div class="eq">A<sub>max</sub>(p) = ${frac('F<sub>s</sub>', '100 · S · k · p')}&emsp;(zulässige Sprengfläche bei Druck p)</div>
<div class="eq">Abheben, wenn&ensp;m = ${frac('2 · e<sub>x</sub>', 'a<sub>x</sub>')} + ${frac('2 · e<sub>y</sub>', 'a<sub>y</sub>')} ≥ 1&emsp;(F<sub>Säule,min</sub> ≤ 0 — die Form klafft an der gegenüberliegenden Ecke)</div>
<p class="math-note">Aktuell bei p = p<sub>sel</sub> = <span data-m="psel"></span>:
A<sub>max</sub> = <b data-m="Amax"></b> · Säulenkräfte max/min = <b data-m="Fs1"></b> / <b data-m="Fs4"></b> ·
m = <b data-m="m"></b> ⇒ <b data-m="lift"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    if (!(v.force > 0) || !(v.area > 0) || !(v.safety > 0) || !(v.tieX > 0) || !(v.tieY > 0)) {
      ['k', 'Fmax', 'pmax', 'cmp', 'psel', 'Amax', 'Fs1', 'Fs4', 'm', 'lift'].forEach(x => set(x, '—'));
      return;
    }
    const k = leverK(v, v.eccX, v.eccY);
    const m = k - 1;
    const pmax = pMax(v, v.eccX, v.eccY);
    const Fauf = 100 * v.area * v.psel;
    set('k', fmt(k));
    set('Fmax', fmt(v.force / (v.safety * k)) + ' kN');
    set('pmax', fmt(pmax) + ' bar');
    set('cmp', v.psel <= pmax
      ? '✓ p<sub>sel</sub> = ' + fmt(v.psel) + ' bar ≤ p<sub>max</sub>'
      : '✗ p<sub>sel</sub> = ' + fmt(v.psel) + ' bar > p<sub>max</sub> — Nachdruck reduzieren, zentrieren oder größere Maschine');
    set('psel', fmt(v.psel) + ' bar');
    set('Amax', v.psel > 0 ? fmt(v.force / (100 * v.safety * k * v.psel)) + ' m²' : '—');
    set('Fs1', fmt(Fauf / 4 * (1 + m)) + ' kN');
    set('Fs4', fmt(Fauf / 4 * (1 - m)) + ' kN');
    set('m', fmt(m));
    set('lift', m >= 1 ? '✗ Abheben — Schwerpunkt zu weit außermittig' : '✓ kein Abheben');
  }
};
