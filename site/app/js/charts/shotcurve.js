/* Schusskurve: Kolbenbewegung (t–v / t–s / s–v) mit Prozessereignissen,
   Ereignistabelle und Plausibilitätsprüfungen. */

import { series, line } from './helpers.js';
import { fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { frac, sqrt } from './mathfmt.js';

export default {
  id: 'shotcurve',
  title: 'Schusskurve',
  desc: 'Kolbenbewegung mit Prozessereignissen',
  wide: true,
  aspect: 0.42,
  tab: 'sv',
  tabs: [['tv', 't–v'], ['ts', 't–s'], ['sv', 's–v']],
  usesCurve: true,
  csv: true,
  inputs: ['part', 'runner', 'overflow', 'biscuit', 'density', 'diam', 'length', 'gate', 'vmax', 'amax', 'tmax', 'biscuitMin', 'gateMin', 'gateMax'],

  calc(v, { shot }) {
    if (shot.error) return { err: shot.error, title: this.title };
    const C = theme.chart;
    const sm = shot.samples, tb = this.tab;
    let x, y, xl, yl;
    if (tb === 'tv') { x = sm.t; y = sm.v; xl = 'Zeit in s'; yl = 'Kolbengeschwindigkeit m/s'; }
    else if (tb === 'ts') { x = sm.t; y = sm.s; xl = 'Zeit in s'; yl = 'Weg in mm'; }
    else { x = sm.s; y = sm.v; xl = 'Weg in mm'; yl = 'Kolbengeschwindigkeit m/s'; }

    const q = line(x, [series('Kolben', C.series1, x, (_, i) => y[i])], xl, yl,
      'Dosiert ' + fmt(shot.Vdose * 1e6) + ' cm³ · Füllgrad ' + fmt(shot.phi * 100) + ' % · Kammer voll bei ' + fmt(shot.sFill * 1000) + ' mm');
    q.ys[0].y = y;
    q.area = 1;
    q.y0 = 0;

    q.events = shot.events.filter(e => e.inP).map((e, i) => ({
      x: tb === 'sv' ? e.s : e.t,
      y: tb === 'ts' ? e.s : e.v,
      n: i + 1, l: e.name
    }));

    if (tb !== 'ts') {
      q.hrefs = [{ y: shot.vcrit, l: 'v_krit 1. Phase ' + fmt(shot.vcrit) + ' m/s', c: C.crit }];
      if (v.vmax <= Math.max.apply(null, q.ys[0].y) * 1.35)
        q.hrefs.push({ y: v.vmax, l: 'v_max Maschine ' + fmt(v.vmax) + ' m/s', c: C.limit });
      q.y1 = Math.max(Math.max.apply(null, q.ys[0].y), shot.vcrit) * 1.12;
    } else {
      q.hrefs = [{ y: shot.totalStroke * 1000, l: 'Gesamthub ' + fmt(shot.totalStroke * 1000) + ' mm', c: C.limit }];
    }

    const nodes = shot.profile;
    q.pts = [];
    for (let i = 0; i < nodes.s.length; i++) {
      q.pts.push({ x: tb === 'sv' ? nodes.s[i] * 1000 : nodes.t[i], y: tb === 'ts' ? nodes.s[i] * 1000 : nodes.v[i] });
    }
    return q;
  },

  /* Zusätzliches Markup unter dem Canvas: Ereignistabelle + Prüfliste. */
  extraHTML() {
    return '<div class="sc-extra"><table class="ev-table"><thead><tr><th></th><th>Ereignis</th><th>Hub [mm]</th><th>Zeit [s]</th><th>Kolben-v [m/s]</th><th>Anschnitt-v [m/s]</th></tr></thead><tbody class="sc-events"></tbody></table><ul class="checks sc-checks"></ul></div>';
  },

  renderExtras(card, shot) {
    const eb = card.querySelector('.sc-events'), cl = card.querySelector('.sc-checks');
    if (!eb) return;
    eb.textContent = ''; cl.textContent = '';
    if (shot.error) {
      eb.innerHTML = '<tr><td colspan="6" class="ev-off">' + shot.error + '</td></tr>';
      return;
    }
    shot.events.forEach((e, i) => {
      const tr = document.createElement('tr'), c0 = document.createElement('td');
      const chip = document.createElement('span');
      chip.className = 'ev-chip'; chip.textContent = i + 1;
      c0.appendChild(chip); tr.appendChild(c0);
      let cells = [e.name, fmt(e.s)];
      if (e.inP) cells = cells.concat([fmt(e.t), fmt(e.v), e.gv === null ? '—' : fmt(e.gv)]);
      cells.forEach(val => {
        const td = document.createElement('td');
        td.textContent = val; tr.appendChild(td);
      });
      if (!e.inP) {
        const td = document.createElement('td');
        td.colSpan = 3; td.className = 'ev-off'; td.textContent = 'außerhalb der Kurve';
        tr.appendChild(td);
      }
      eb.appendChild(tr);
    });
    shot.checks.forEach(c => {
      const li = document.createElement('li'), ic = document.createElement('span');
      ic.className = 'ck ' + (c[0] ? 'ok' : 'bad');
      ic.textContent = c[0] ? '✓' : '✗';
      li.appendChild(ic);
      const sp = document.createElement('span');
      sp.textContent = c[1];
      li.appendChild(sp);
      cl.appendChild(li);
    });
  },

  mathHTML() {
    return `
<h4>1 · Bewegungsprofil (stückweise konstante Beschleunigung)</h4>
<p class="math-note">Die Schusskurve wird durch Wegpunkte (s<sub>i</sub>, v<sub>i</sub>) definiert; der Ursprung
(0 mm, 0 m/s) wird automatisch ergänzt. Zwischen zwei Punkten ist die Beschleunigung konstant — aus den
Kinematikbeziehungen folgt je Segment:</p>
<div class="eq">a<sub>i</sub> = ${frac('v<sub>i</sub>² − v<sub>i−1</sub>²', '2 · (s<sub>i</sub> − s<sub>i−1</sub>)')}&emsp;&emsp;Δt<sub>i</sub> = ${frac('2 · (s<sub>i</sub> − s<sub>i−1</sub>)', 'v<sub>i−1</sub> + v<sub>i</sub>')}</div>
<div class="eq">v(s) = ${sqrt('v<sub>i−1</sub>² + 2 · a<sub>i</sub> · (s − s<sub>i−1</sub>)')}&emsp;&emsp;s(t) = s<sub>i−1</sub> + v<sub>i−1</sub> · Δt + ½ · a<sub>i</sub> · Δt²</div>
<p class="math-note">Aktuell: Schusszeit = <b data-m="tEnd"></b> · Kurvenhub = <b data-m="hub"></b> ·
Spitzengeschwindigkeit = <b data-m="vpk"></b> · Spitzenbeschleunigung = <b data-m="apk"></b></p>

<h4>2 · Füllkammer und Prozessereignisse</h4>
<p class="math-note">Der Füllgrad bestimmt, wo die Kammer voll ist; jedes weitere Ereignis folgt aus der
Kontinuität (kumuliertes Volumen durch Kolbenfläche):</p>
<div class="eq">φ = ${frac('V<sub>dos</sub>', 'A<sub>K</sub> · L')}&emsp;⇒&emsp;s<sub>voll</sub> = (1 − φ) · L</div>
<div class="eq">s<sub>Ereignis</sub> = s<sub>voll</sub> + ${frac('ΣV<sub>i</sub>', 'A<sub>K</sub>')}&emsp;(nacheinander: Anguss, Bauteil, Überlauf)&emsp;·&emsp;l<sub>Pressrest</sub> = ${frac('V<sub>b</sub>', 'A<sub>K</sub>')}</div>
<p class="math-note">Aktuell: φ = <b data-m="phi"></b> · Kammer voll bei <b data-m="sfill"></b> ·
Gesamthub = <b data-m="stroke"></b> · Pressrest = <b data-m="lb"></b></p>

<h4>3 · Abgeleitete Größen und Prüfungen</h4>
<div class="eq">v<sub>a</sub> = v<sub>p</sub> · ${frac('A<sub>K</sub>', 'A<sub>a</sub>')}&emsp;(Anschnittgeschwindigkeit aus der Kolbengeschwindigkeit)</div>
<div class="eq">t<sub>f</sub> = t(Überlauf gefüllt) − t(Anguss gefüllt)&emsp;(Füllzeit ab Anschnitt)</div>
<div class="eq">v<sub>krit</sub>(D, φ) = ${sqrt('9,81 · D')} · f(φ)&emsp;mit&emsp;f(φ) = 1,386 − 1,915·φ + 0,615·φ²&emsp;(Nogowizin — Grenze der 1. Phase bis „Kammer voll")</div>
<p class="math-note">Aktuell: A<sub>K</sub>/A<sub>a</sub> = <b data-m="ratio"></b> · t<sub>f</sub> = <b data-m="tf"></b> ·
v<sub>krit</sub> = <b data-m="vcrit"></b> · max. v der 1. Phase = <b data-m="vslow"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    if (!shot || shot.error) {
      ['tEnd', 'hub', 'vpk', 'apk', 'phi', 'sfill', 'stroke', 'lb', 'ratio', 'tf', 'vcrit', 'vslow']
        .forEach(k => set(k, '—'));
      return;
    }
    const p = shot.profile;
    set('tEnd', fmt(p.endTime) + ' s');
    set('hub', fmt(p.travel * 1000) + ' mm');
    set('vpk', fmt(p.vmax) + ' m/s');
    set('apk', fmt(Math.max(p.amax, -p.amin, 0)) + ' m/s²');
    set('phi', fmt(shot.phi * 100) + ' %');
    set('sfill', fmt(shot.sFill * 1000) + ' mm');
    set('stroke', fmt(shot.totalStroke * 1000) + ' mm');
    set('lb', fmt(shot.biscLen * 1000) + ' mm');
    set('ratio', shot.gateR ? fmt(shot.gateR) : '—');
    set('tf', shot.fill === null ? '—' : fmt(shot.fill) + ' ms');
    set('vcrit', fmt(shot.vcrit) + ' m/s');
    set('vslow', fmt(shot.vSlow) + ' m/s');
  }
};
