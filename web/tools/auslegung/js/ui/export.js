/* Export: PNG in die Zwischenablage, Schusskurven-CSV. Der PNG-Weg (Symbol,
   Kopieren, Rückfall auf Download, Rückmeldung am Knopf) gilt für die
   Diagrammkarten (ui/cards.js) und die Füllkammer (ui/chamber.js). */

import { drawAny } from '../render/draw.js';

/* Knopfsymbol „Als PNG kopieren" und die kurze Bestätigung danach. */
export const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
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

/* Ein fertiges PNG in die Zwischenablage (ohne Clipboard-API oder bei
   Ablehnung: Download unter name); der Knopf zeigt 1,4 s lang ✓. */
export function copyPngBlob(blob, btn, name) {
  const old = btn.innerHTML;
  const ok = () => { btn.classList.add('copied'); btn.innerHTML = CHECK_SVG; };
  if (navigator.clipboard && window.ClipboardItem)
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(ok, () => { download(blob, name); ok(); });
  else { download(blob, name); ok(); }
  setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = old; }, 1400);
}

/* Diagramm als PNG kopieren. Gezeichnet wird in der logischen Größe des
   Bildschirm-Canvas mit 2× Auflösung — der Export sieht exakt aus wie die
   Karte auf dem Bildschirm, nur schärfer. */
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
  drawAny(x, W, H, d);
  o.toBlob(blob => copyPngBlob(blob, card.querySelector('.png-btn'), 'DieLogic_' + def.id + '.png'), 'image/png');
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
