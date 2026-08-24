/* Materialausbeute als Ringdiagramm (Anteile am Dosiergewicht). */

import { fmt, subHTML } from '../core/format.js';
import { theme } from '../core/theme.js';
import { eq } from './mathfmt.js';

export default {
  id: 'yield',
  title: 'Materialausbeute',
  desc: 'Ringdiagramm · Anteile am Dosiergewicht (inkl. Pressrest)',
  inputs: ['part', 'runner', 'overflow', 'biscuit'],

  calc(v) {
    const C = theme.chart;
    const segs = [
      { n: 'Bauteil',   kg: v.part,     c: C.series2 },
      { n: 'Anguss',    kg: v.runner,   c: C.series1 },
      { n: 'Überlauf',  kg: v.overflow, c: C.series3 },
      { n: 'Pressrest', kg: v.biscuit,  c: C.series4 }
    ].filter(s => s.kg > 0);
    let tot = 0;
    segs.forEach(s => { tot += s.kg; });
    return {
      kind: 'donut', segs, total: tot,
      share: tot > 0 ? 100 * v.part / tot : 0,
      info: 'Dosiergewicht ' + fmt(tot) + ' kg · Ausbeute = Bauteil / Dosiergewicht'
    };
  },

  mathHTML() {
    return `
<h4>Materialausbeute</h4>
${eq('m_{\\text{dos}} = m_{\\text{Bauteil}} + m_{\\text{Anguss}} + m_{\\text{Überlauf}} + m_{\\text{Pressrest}}')}
${eq('\\eta = \\frac{m_{\\text{Bauteil}}}{m_{\\text{dos}}} \\cdot 100 \\% \\qquad\\ \\text{Anteil}_{i} = \\frac{m_{i}}{m_{\\text{dos}}} \\cdot 100 \\%')}
<p class="math-note">η ist der Anteil der dosierten Schmelze, der im Bauteil landet; Anguss, Überlauf und
Pressrest gehen ins Recycling (Kreislaufmaterial kostet Energie und Ofenkapazität).</p>
<p class="math-note">Aktuell: m<sub>dos</sub> = <b data-m="mdos"></b> · η = <b data-m="eta"></b> ·
Anteile: Bauteil <b data-m="aB"></b> · Anguss <b data-m="aA"></b> · Überlauf <b data-m="aU"></b> ·
Pressrest <b data-m="aP"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const tot = v.part + v.runner + v.overflow + v.biscuit;
    const pct = m => tot > 0 ? fmt(100 * m / tot) + ' %' : '—';
    set('mdos', fmt(tot) + ' kg');
    set('eta', pct(v.part));
    set('aB', pct(v.part));
    set('aA', pct(v.runner));
    set('aU', pct(v.overflow));
    set('aP', pct(v.biscuit));
  }
};
