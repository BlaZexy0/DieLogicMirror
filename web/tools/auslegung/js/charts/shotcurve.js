/* Schusskurve: Kolbenbewegung (t–v / t–s / s–v) mit Prozessereignissen,
   Ereignistabelle und Plausibilitätsprüfungen. */

import { series, line, limit, refline } from './helpers.js';
import { fmt, subHTML } from '../core/format.js';
import { theme } from '../core/theme.js';
import { sim } from '../core/simstore.js';
import { eq } from './mathfmt.js';

/* Anzeige der Simulations-Luftdruckkurve kappen: nahe der vollständigen
   Füllung divergiert das Modell (Restluftvolumen → 0). */
const P_CLIP_MBAR = 10000;

/* Simulations-Samples (eigenes Zeit-/Wegraster) linear auf das Chart-Raster
   interpolieren; außerhalb des Simulationsbereichs NaN (= Lücke). */
function interpSim(xs, ys, xv) {
  if (!xs.length || xv < xs[0] || xv > xs[xs.length - 1]) return NaN;
  for (let i = 1; i < xs.length; i++) {
    if (xv <= xs[i]) {
      return ys[i - 1] + (ys[i] - ys[i - 1]) * (xv - xs[i - 1]) / (xs[i] - xs[i - 1]);
    }
  }
  return NaN;
}

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
  inputs: ['part', 'runner', 'overflow', 'biscuit', 'density', 'densitySolid', 'shrink', 'diam', 'length', 'gate', 'vent', 'vmax', 'amax', 'tmax', 'biscuitMin', 'gateMin', 'gateMax', 'vacModel', 'vacPump', 'vacStart'],

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
      /* v_krit gilt nur in der 1. Phase (bis „Kammer voll") — als Kurven-
         schranke endet Grenze samt Schraffur genau dort. */
      const xFill = tb === 'sv' ? shot.sFill * 1000
        : (shot.events[0].inP ? shot.events[0].t : Infinity);
      q.limits = [limit('vcrit', 'v_krit 1. Phase ' + fmt(shot.vcrit) + ' m/s', 'y', 'max',
        xv => xv <= xFill ? shot.vcrit : Infinity, { note: 'Wellenüberschlag' })];
      if (v.vmax <= Math.max.apply(null, q.ys[0].y) * 1.35)
        q.limits.push(limit('vmax', 'v_max Maschine ' + fmt(v.vmax) + ' m/s', 'y', 'max', v.vmax));
      q.y1 = Math.max(Math.max.apply(null, q.ys[0].y), shot.vcrit) * 1.12;
    } else {
      q.limits = [refline('stroke', 'Füllende ' + fmt(shot.totalStroke * 1000) + ' mm', 'y', shot.totalStroke * 1000),
        refline('endpos', 'Endlage ' + fmt((shot.totalStroke + shot.intens) * 1000) + ' mm (nach Nachverdichtung)', 'y', (shot.totalStroke + shot.intens) * 1000)];
    }

    const nodes = shot.profile;
    q.pts = [];
    for (let i = 0; i < nodes.s.length; i++) {
      q.pts.push({ x: tb === 'sv' ? nodes.s[i] * 1000 : nodes.t[i], y: tb === 'ts' ? nodes.s[i] * 1000 : nodes.v[i] });
    }

    /* Luftdruck in der Kammer (Backend-Simulation, hpdcsim) — zweite Achse. */
    const sd = sim.data;
    if (sd && sd.samples) {
      const sx = [], sp = [];
      const src = tb === 'sv' ? sd.samples.s_mm : sd.samples.t;
      for (let i = 0; i < src.length; i++) {
        const xv = src[i], pv = sd.samples.p_air_mbar[i];
        if (xv === null || pv === null || !isFinite(xv) || !isFinite(pv)) continue;
        if (pv > P_CLIP_MBAR) break;
        sx.push(xv); sp.push(pv);
      }
      if (sx.length > 1) {
        q.ys.push({
          n: 'Luftdruck Kammer (Simulation)', u: 'mbar', c: C.series4,
          axis: 'right', y: x.map(xv => interpSim(sx, sp, xv))
        });
        q.rl = 'Luftdruck in mbar (Anzeige ≤ ' + fmt(P_CLIP_MBAR) + ')';
      }
    } else if (sim.status === 'error') {
      /* Auch fachliche 422-Meldungen des Backends (convert.py) anzeigen —
         sonst verschwände die Luftdruck-Serie kommentarlos. */
      const msg = sim.error === 'offline' ? 'Backend nicht erreichbar' : (sim.error || 'Fehler');
      q.info += ' · Luftdruck-Simulation: ' + (msg.length > 90 ? msg.slice(0, 87) + '…' : msg);
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
      sp.innerHTML = subHTML(c[1]);   // Prüftexte tragen Indizes (v_krit, a_max)
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
${eq('a_{i} = \\frac{v_{i}^{2} - v_{i - 1}^{2}}{2 \\cdot (s_{i} - s_{i - 1})} \\qquad \\Delta t_{i} = \\frac{2 \\cdot (s_{i} - s_{i - 1})}{v_{i - 1} + v_{i}}')}
${eq('v(s) = \\sqrt{v_{i - 1}^{2} + 2 \\cdot a_{i} \\cdot (s - s_{i - 1})} \\qquad s(t) = s_{i - 1} + v_{i - 1} \\cdot \\Delta t + \\tfrac{1}{2} \\cdot a_{i} \\cdot \\Delta t^{2}')}
<p class="math-note">Aktuell: Schusszeit = <b data-m="tEnd"></b> · Kurvenhub = <b data-m="hub"></b> ·
Spitzengeschwindigkeit = <b data-m="vpk"></b> · Spitzenbeschleunigung = <b data-m="apk"></b></p>

<h4>2 · Füllkammer und Prozessereignisse</h4>
<p class="math-note">Der Füllgrad bestimmt, wo die Kammer voll ist; jedes weitere Ereignis folgt aus der
Kontinuität (kumuliertes Volumen durch Kolbenfläche):</p>
${eq('\\varphi = \\frac{V_{\\text{dos}}}{A_{K} \\cdot L} \\quad \\Rightarrow \\quad s_{\\text{voll}} = (1 - \\varphi) \\cdot L')}
${eq('s_{\\text{Ereignis}} = s_{\\text{voll}} + \\frac{\\sum V_{i}}{A_{K}} \\quad\\ (\\text{nacheinander: Anguss, Bauteil, Überlauf}) \\qquad V_{i} = \\frac{m_{i}}{\\rho_{\\text{sol}}},\\ \\rho_{\\text{sol}} = \\frac{\\rho_{s}}{(1+s)^{3}}')}
${eq('\\Delta s_{\\text{NV}} = \\frac{m_{\\text{dos}}}{\\rho_{l} A_{K}} - \\frac{\\sum V_{i}}{A_{K}} - l_{\\text{Pressrest}} \\qquad l_{\\text{Pressrest}} = \\frac{m_{b}}{\\rho_{\\text{sol}} A_{K}}')}
<p class="math-note">Die Kammer wird flüssig dosiert (ρ<sub>l</sub>), die Kavitäten sind feste Geometrie: das Werkzeug
ist um das Schwindmaß s größer als das kalte Bauteil (ρ<sub>s</sub>), fasst also V = m/ρ<sub>sol</sub>. Was die Kavität
beim Füllende flüssig nicht aufnimmt, schiebt der Kolben in der Nachverdichtung Δs<sub>NV</sub> nach — bis zur Endlage
mit festem Pressrest.</p>
<p class="math-note">Aktuell: φ = <b data-m="phi"></b> · Kammer voll bei <b data-m="sfill"></b> ·
Füllende = <b data-m="stroke"></b> · Nachverdichtungshub = <b data-m="intens"></b> · Pressrest fest = <b data-m="lb"></b></p>

<h4>3 · Abgeleitete Größen und Prüfungen</h4>
${eq('v_{a} = v_{p} \\cdot \\frac{A_{K}}{A_{a}} \\quad\\ (\\text{Anschnittgeschwindigkeit aus der Kolbengeschwindigkeit})')}
${eq('t_{f} = t(\\text{Überlauf gefüllt}) - t(\\text{Anguss gefüllt}) \\quad\\ (\\text{Füllzeit ab Anschnitt})')}
${eq('v_{\\text{krit}}(D, \\varphi) = \\sqrt{9{,}81 \\cdot D} \\cdot f(D, \\varphi) \\quad \\;\\text{—}\\; \\quad f\\ \\text{aus der OpenFOAM-CFD-Tabelle, bilinear interpoliert}\\ \\quad\\ (\\text{Grenze der 1. Phase bis}\\ \\text{“Kammer voll”})')}
<p class="math-note">Aktuell: A<sub>K</sub>/A<sub>a</sub> = <b data-m="ratio"></b> · t<sub>f</sub> = <b data-m="tf"></b> ·
v<sub>krit</sub> = <b data-m="vcrit"></b> · max. v der 1. Phase = <b data-m="vslow"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    if (!shot || shot.error) {
      ['tEnd', 'hub', 'vpk', 'apk', 'phi', 'sfill', 'stroke', 'intens', 'lb', 'ratio', 'tf', 'vcrit', 'vslow']
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
    set('intens', fmt(shot.intens * 1000) + ' mm');
    set('lb', fmt(shot.biscLen * 1000) + ' mm');
    set('ratio', shot.gateR ? fmt(shot.gateR) : '—');
    set('tf', shot.fill === null ? '—' : fmt(shot.fill) + ' ms');
    set('vcrit', fmt(shot.vcrit) + ' m/s');
    set('vslow', fmt(shot.v1) + ' m/s');
  }
};
