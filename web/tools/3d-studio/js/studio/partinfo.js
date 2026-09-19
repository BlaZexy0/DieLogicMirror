/* Der Modus „Bauteil" — in jedem Werkzeug derselbe: drei Kennzahlen, die
   man vom Teil wissen will (Abmessungen, Volumen, Wanddicke), eine
   Warnzeile für das, was am Netz nicht stimmt (offen, gegenläufig, riesig —
   die Meldungen aus js/part/partsource.js, die sonst nur in der
   Bauteil-Klappe der Kopfzeile stünden), und zugeklappt das Netz selbst.
   Ein Werkzeug hängt an, was bei ihm zum Bauteil gehört (`extra`, z. B.
   „Netzkanten zeigen"). */

import { kpiBlock, kpis, detailsBlock, factsBlock, warnLine } from './rows.js';
import { facts } from '../ui/controls.js';
import { fmt, fmtUnit } from './format.js';

export const partMode = (extra = '') => ({
  id: 'bauteil', label: 'Bauteil',
  hint: 'Das Bauteil, wie es geladen ist. Ein anderes: oben über den Bauteil-Chip — oder eine STL/GLB ins Bild ziehen.',
  html: kpiBlock('part-kpis') + warnLine('part-warn') + extra
    + detailsBlock('part-details', 'Netz', factsBlock('part-facts') + '<div class="st-hintline" data-ui="part-note"></div>')
});

/** Die Felder füllen. `part` ist das Bauteil des Gastgebers (js/studio/part.js). */
export function fillPartMode(ui, part) {
  const m = part && part.model;
  if (!m) { kpis(ui('part-kpis'), []); facts(ui('part-facts'), []); ui('part-warn').textContent = ''; ui('part-note').textContent = ''; return; }
  const s = m.bounds.size;
  kpis(ui('part-kpis'), [
    { label: 'Abmessungen', value: s.map(v => fmt(v, 0)).join(' × ') + ' mm' },
    { label: 'Volumen', value: fmtUnit(m.volume / 1000, 'cm³') },
    { label: 'Wanddicke 2V/A', value: m.totalArea > 0 ? fmtUnit(2 * m.volume / m.totalArea, 'mm') : '—' }
  ]);
  ui('part-warn').textContent = part.warning || '';
  facts(ui('part-facts'), [
    ['Dreiecke', fmt(m.faceCount, 0) + (m.faceCount !== m.rawFaceCount ? ' (roh ' + fmt(m.rawFaceCount, 0) + ')' : '')],
    ['Oberfläche', fmtUnit(m.surface / 100, 'cm²')]
  ]);
  /* Die Beschreibung des Beispielteils (oder „STL-Datei · 412 kB") — ein Satz,
     der umbrechen darf; in der Wertespalte liefe er aus der Seitenleiste. */
  ui('part-note').textContent = part.note || '';
}
