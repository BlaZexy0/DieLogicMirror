/* Export: PNG in die Zwischenablage, Schusskurven-CSV. */

import { drawAny } from '../render/draw.js';

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/* Diagramm als PNG kopieren (Fallback: Download). Gezeichnet wird in der
   logischen Größe des Bildschirm-Canvas mit 2× Auflösung — der Export sieht
   exakt aus wie die Karte auf dem Bildschirm, nur schärfer. */
export function copyChart(card, def) {
  const d = card.data;
  const cv = card.querySelector('canvas');
  const W = (cv && cv.clientWidth) || 1000;
  const H = (cv && cv.clientHeight) || Math.round(W * ((def && def.aspect) || 0.8));
  const S = 2;
  const o = document.createElement('canvas');
  o.width = W * S; o.height = H * S;
  const x = o.getContext('2d');
  x.setTransform(S, 0, 0, S, 0, 0);
  drawAny(x, W, H, d, def);
  o.toBlob(blob => {
    const b = card.querySelector('.png-btn'), old = b.innerHTML;
    const ok = () => { b.classList.add('copied'); b.innerHTML = CHECK_SVG; };
    if (navigator.clipboard && window.ClipboardItem)
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(ok, () => { download(blob, 'DieLogic_' + def.id + '.png'); ok(); });
    else { download(blob, 'DieLogic_' + def.id + '.png'); ok(); }
    setTimeout(() => { b.classList.remove('copied'); b.innerHTML = old; }, 1400);
  }, 'image/png');
}

/* Schusskurven-Samples + Ereignisse als CSV. */
export function exportShotCSV(shot) {
  if (!shot || shot.error) { alert('Schusskurve ungültig, kein Export möglich.'); return; }
  const sm = shot.samples, gate = !!shot.gateR;
  let csv = 'zeit_s,weg_mm,geschwindigkeit_m_s,beschleunigung_m_s2' + (gate ? ',anschnittgeschwindigkeit_m_s' : '') + '\n';
  for (let i = 0; i < sm.t.length; i++) {
    csv += sm.t[i].toFixed(6) + ',' + sm.s[i].toFixed(3) + ',' + sm.v[i].toFixed(4) + ',' + sm.a[i].toFixed(3)
      + (gate ? ',' + (sm.v[i] * shot.gateR).toFixed(3) : '') + '\n';
  }
  csv += '\nereignis,hub_mm,zeit_s,kolben_v_m_s,anschnitt_v_m_s\n';
  shot.events.forEach(e => {
    csv += e.name.replace(/,/g, ';') + ',' + e.s.toFixed(2) + ','
      + (e.inP ? e.t.toFixed(4) : '') + ',' + (e.inP ? e.v.toFixed(4) : '') + ','
      + (e.inP && e.gv !== null ? e.gv.toFixed(3) : '') + '\n';
  });
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'DieLogic_Schusskurve.csv');
}
