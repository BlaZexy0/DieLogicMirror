/* Wandstärkenanalyse im gemeinsamen Rahmen: Feld auf Knopfdruck mit
   Abbruch, Isofläche daraus, Schnitt und Wärmezentren als Modi, Entwurf
   und Datei. Die Fälle stammen aus viewer.test.mjs und wurden auf
   data-ui und die Modi übertragen.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/wandstaerke.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mountPage, wait, kpiText, same } from './fixture.mjs';

/* Felder NIE mit assert.equal vergleichen: schlägt der Vergleich fehl, baut
   Node einen Textvergleich beider Objekte — bei 14 Mio. Rasterwerten frisst
   das den ganzen Arbeitsspeicher (so geschehen: 25 GB, der Kernel räumte
   ab). Deshalb same() aus ./fixture.mjs: Identität prüfen, nur die Meldung
   ausgeben. */

const fmtDe = v => v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
let P;

before(async () => {
  P = await mountPage('wandstaerke.html', 'js/studio/pages/wandstaerke.js', { search: '?part=cover' });
});

test('Rahmen: Modi als Reiter, der Bauteil-Chip trägt den Namen, kein Feld ohne Knopf', async () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  assert.ok(s.model, 'Bauteil geladen');
  assert.deepEqual(doc.querySelectorAll('[role="tab"]').map(b => b.getAttribute('data-mode')),
    ['feld', 'isoflaeche', 'schnitt', 'waermezentren']);
  assert.equal(shell.mode, 'feld', 'die Seite beginnt beim Feld — dem ersten Schritt');
  assert.match(ui('part-name').textContent, /Getriebedeckel/);
  same(s.field, null, 'ohne Bestätigung wird kein Feld gerechnet');
  assert.equal(ui('primary').textContent, 'Feld berechnen');
  assert.ok(ui('field-cost').textContent.includes('Mio. Punkte'), 'die Kosten stehen VOR dem Rechnen da');
  const F = await import('../../../../web/tools/3d-studio/js/part/field.js');
  assert.equal(s.cell, F.suggestCell(s.model), 'Vorgabe halbe Wanddicke');
  assert.equal(ui('cell').value, fmtDe(s.cell).replace(/\./g, ''));
  /* Die abgeleiteten Modi sagen, was fehlt. */
  shell.setMode('isoflaeche');
  assert.equal(ui('primary').textContent, 'Feld berechnen');
  assert.match(ui('note').textContent, /Zuerst das Feld/);
  shell.setMode('feld');
});

test('Feld: Zellkante, Kosten, Rechnen, Isofläche daraus; Untermaß in allen Schreibweisen', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  const cell = ui('cell');
  cell.value = '8'; cell.dispatch('change');
  assert.equal(s.cell, 8);
  assert.ok(ui('field-cost').textContent.includes('Punkte'), 'die Kennzahlen folgen');
  ui('primary').dispatch('click');
  await wait(() => s.field && !s.running);
  assert.equal(s.stale, false);
  /* Das erste Feld aus dem Modus „Feld": es geht von selbst zum Ergebnis.
     Dort gibt es nichts mehr zu tun — kein Knopf, kein leerer Streifen. */
  assert.equal(shell.mode, 'isoflaeche', 'nach dem ersten Feld zeigt die Seite das Ergebnis');
  assert.equal(ui('primary').hidden, true, 'ein aktuelles Feld braucht keinen Knopf');
  assert.equal(ui('actions').hidden, true, 'und die leere Leiste fällt weg');
  shell.setMode('feld');
  assert.equal(ui('primary').hidden, true);
  assert.match(ui('note').textContent, /Feld ist aktuell/);
  assert.equal(ui('actions').hidden, false, 'die Zeile sagt, wie es weitergeht');
  const b = s.model.bounds;
  for (let a = 0; a < 3; a++) {
    assert.ok(Math.abs(s.field.origin[a] - (b.min[a] - 2 * 8)) < 1e-6, 'Ursprung zwei Zellen vor dem Bauteil, Achse ' + a);
    assert.ok(s.field.origin[a] + (s.field.dims[a] - 1) * s.field.h >= b.max[a] + 2 * 8 - 1e-6, 'und zwei dahinter');
    assert.ok(s.field.origin[a] + (s.field.dims[a] - 1) * s.field.h < b.max[a] + 3 * 8 + 1e-6, 'aber nicht mehr');
  }
  assert.ok(s.field.fullInside, 'innen vollständig');
  assert.ok(s.offsetTris && s.offsetTris.length > 0, 'Isofläche sofort mit abgeleitet');
  assert.ok(Math.abs(s.under - Math.round(s.stats.maxIn) / 2) < 1e-9, 'Vorgabe maxIn/2');
  assert.equal(ui('under').value, fmtDe(s.under).replace(/\./g, ''));
  assert.match(kpiText(ui('field-kpis')), /größte Wandstärke/);

  const before = s.offsetTris.length, fieldRef = s.field;
  const d = ui('under');
  for (const [typed, want] of [['+4', 4], ['-3', 3], ['−2', 2], ['1,5', 1.5]]) {
    d.value = typed; d.dispatch('change');
    assert.equal(s.under, want, 'Eingabe „' + typed + '"');
  }
  same(s.field, fieldRef, 'dasselbe Feld — nur neu abgeleitet');
  assert.notEqual(s.offsetTris.length, before, 'andere Fläche');
  assert.equal(ui('under-slider').value, '1.5', 'der Regler folgt dem Feld');
  const sl = ui('under-slider');
  assert.equal(sl.getAttribute('min'), '0');
  assert.ok(Math.abs(+sl.max - Math.ceil(s.stats.maxIn * 2) / 2) < 1e-9, 'Reglerende = Maximum innen');
  const beforeSlider = s.offsetTris.length;
  sl.value = '4'; sl.dispatch('input');
  assert.equal(s.under, 4);
  assert.equal(ui('under').value, '4');
  await new Promise(r => setTimeout(r, 30));
  assert.notEqual(s.offsetTris.length, beforeSlider, 'und die Fläche ist neu abgeleitet');
  d.value = '99'; d.dispatch('change');
  assert.ok(Math.abs(s.under - s.stats.maxIn) < 1e-9, 'tiefer als das Maximum geht es nicht');
  assert.equal(s.stale, false);

  /* Eine andere Zellkante verlangt ein neues Feld; ein selbst gesetztes Untermaß überlebt es. */
  d.value = '2'; d.dispatch('change');
  cell.value = '10'; cell.dispatch('change');
  assert.equal(s.stale, true);
  assert.equal(ui('primary').textContent, 'Feld neu berechnen');
  assert.match(ui('note').textContent, /Zellkante geändert/);
  ui('primary').dispatch('click');
  await wait(() => !s.stale && !s.running);
  assert.equal(s.under, 2, 'ein selbst gesetztes Untermaß überlebt das neue Feld');
  assert.equal(shell.mode, 'feld', 'ein NEUES Feld lässt einen, wo man ist');
  /* Ein Wert außerhalb der Grenzen wird geklemmt — und gesagt. */
  cell.value = '999'; cell.dispatch('change');
  assert.equal(s.cell, 50);
  assert.match(cell.closest('.row').querySelector('.clamp-note').textContent, /begrenzt/);
  cell.value = '10'; cell.dispatch('change');
  ui('primary').dispatch('click');
  await wait(() => !s.stale && !s.running);
});

test('Modi besitzen ihren Viewport: Isofläche, Schnitt mit Skala, Wärmezentren nach Größe', async () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  const bar = doc.getElementById('colorbar');
  shell.setMode('isoflaeche');
  assert.ok(v.offsetMesh.visible && v.partMesh.visible, 'beide');
  assert.match(kpiText(ui('offset-kpis')), /Volumenanteil/);
  assert.match(kpiText(ui('offset-kpis')), /cm³/, 'das Volumen in der Isofläche');
  const seg = ui('show-seg').querySelectorAll('button');
  seg.find(b => b.dataset.value === 'offset').dispatch('click');
  assert.equal(v.partMesh.visible, false);
  assert.equal(v.offsetMesh.visible, true);
  seg.find(b => b.dataset.value === 'part').dispatch('click');
  assert.equal(v.offsetMesh.visible, false);
  seg.find(b => b.dataset.value === 'both').dispatch('click');
  assert.ok(v.partMesh.visible && v.offsetMesh.visible);
  assert.ok(!bar.classList.contains('on'), 'ohne Schnitt und Marken keine Skala');

  shell.setMode('schnitt');
  assert.equal(s.slice.on, true);
  assert.ok(v.sliceMesh.visible, 'Schnittebene sichtbar');
  assert.ok(v.sliceMesh.material.map, 'Rasterbild erzeugt');
  assert.ok(bar.classList.contains('on'), 'Skala eingeblendet');
  assert.equal(v.offsetMesh.visible, false, 'die Isofläche verdeckte den Schnitt');
  assert.ok(v.partMesh.visible && v.partMesh.material.transparent && v.partMesh.material.opacity <= 0.45, 'das Bauteil durchscheinend');
  assert.equal(doc.getElementById('cb-title').textContent, 'Wandstärke');
  const F = await import('../../../../web/tools/3d-studio/js/part/field.js');
  const st = F.fieldExtrema(s.field);
  assert.ok(s.stats && Math.abs(s.stats.maxIn - st.maxIn) < 1e-9, 'die Enden sind gerechnet');
  assert.ok(doc.getElementById('cb-ticks').innerHTML.includes(fmtDe(2 * st.maxIn).replace(/(\d),(\d)\d+/, '$1,$2')), 'oben die größte Wandstärke');
  assert.ok(doc.getElementById('cb-extra').innerHTML.includes('Bauteilkontur'));
  assert.equal(ui('slice-scale-seg'), null, 'keine Skalenwahl — außen gibt es nichts zu zeigen');
  const C = await import('../../../../web/tools/3d-studio/js/part/colors.js');
  /* Die feste Farbleiste `heat` (die der Auslegung): dünn blau, dick rot. */
  const lo = C.scaleRgb('heat', 0.25), hi = C.scaleRgb('heat', 0.85), mid = C.scaleRgb('heat', 0.5);
  assert.ok(lo[2] > 0.75 && lo[2] > lo[0] && hi[0] > 0.8 && hi[0] > hi[2] && mid[1] > mid[0] && mid[1] > mid[2], 'heat: blau → grün → rot');
  for (const ax of ['0', '1', '2']) {
    ui('slice-seg').querySelectorAll('button').find(b => b.dataset.value === ax).dispatch('click');
    assert.equal(s.slice.axis, +ax);
    assert.ok(v.sliceMesh.material.map.image.width > 1, 'Bild für Achse ' + ax);
  }
  const pos = ui('slice-pos');
  pos.value = '20'; pos.dispatch('input');
  assert.equal(s.slice.pos, 20);
  assert.ok(ui('slice-pos-val').textContent.includes('mm'), 'Lage in mm');

  shell.setMode('waermezentren');
  assert.equal(v.sliceMesh.visible, false, 'der Schnitt geht mit seinem Modus');
  assert.equal(v.hotGroup.visible, true);
  assert.equal(v.hotGroup.children.length, s.maxima.length, 'je Stelle eine Marke');
  assert.ok(s.maxima.length >= 1);
  assert.ok(bar.classList.contains('on') && doc.getElementById('cb-extra').innerHTML.includes('Marken'));
  assert.equal(doc.getElementById('cb-title').textContent, 'Wandstärke', 'die Skala erklärt die Farben');
  const m0 = v.hotGroup.children[0];
  assert.ok(Math.abs(m0.scale.x - s.maxima[0].r) < 1e-9, 'Radius = Feldwert');
  const want = C.hex2rgb(C.scale('heat', 0.08 + 0.84 * s.maxima[0].r / s.stats.maxIn)), got = C.hex2rgb('#' + m0.material.color.getHexString());
  assert.ok(want.every((x, i) => Math.abs(x - got[i]) < 0.01), 'die größte Marke trägt die Farbe ihrer Größe: ' + got + ' / ' + want);
  if (s.maxima.length > 1) {
    const last = v.hotGroup.children[s.maxima.length - 1];
    assert.ok(last.userData.r <= m0.userData.r, 'nach Größe sortiert');
    if (last.userData.r < 0.8 * m0.userData.r) assert.ok(last.material.color.b > m0.material.color.b, 'kleinere Marken bläulicher');
  }
  assert.equal(v.offsetMesh.visible, false, 'die Isofläche verdeckte die Marken');
  assert.ok(v.partMesh.material.transparent && v.partMesh.material.opacity <= 0.45);
  assert.match(kpiText(ui('hot-kpis')), /Stellen/);
  assert.match(kpiText(ui('hot-kpis')), /größte Wandstärke/);
  ui('hot-seg').querySelectorAll('button').find(b => b.dataset.value === 'kreise').dispatch('click');
  assert.equal(s.hot.shape, 'kreise');
  assert.ok(typeof v.hotGroup.children[0].onBeforeRender === 'function', 'Kreise drehen sich zur Kamera');
  const ring = C.hex2rgb('#' + v.hotGroup.children[0].material.color.getHexString());
  assert.ok(want.every((x, i) => Math.abs(x - ring[i]) < 0.01), 'gleiche Farbe wie die Kugel');
  const n75 = s.maxima.length;
  const min = ui('hot-min');
  min.value = '100'; min.dispatch('input');
  assert.ok(s.maxima.length <= n75 && s.maxima.length >= 1);
  assert.ok(s.maxima.every(m => m.r >= s.stats.maxIn - 1e-9), 'bei 100 % nur die dickste');
  min.value = '75'; min.dispatch('input');

  shell.setMode('feld');
  assert.equal(v.hotGroup.visible, false, 'die Marken gehen mit ihrem Modus');
  assert.ok(!bar.classList.contains('on'), 'und ihre Skala mit ihnen');
  assert.ok(v.partMesh.visible && v.partMesh.material.transparent, 'das Bauteil durchscheinend, wie in jedem Modus');
});

test('Speichern und Entwurf: die Einstellungen als Datei, ein Entwurf im Browser', async () => {
  const { v, ui, host, shell } = P;
  const s = v.state;
  const doc = v.tool.toJSON();
  assert.equal(doc.format, 'dielogic-wandstaerke');
  assert.equal(doc.cell, s.cell);
  assert.equal(doc.hot.shape, 'kreise');
  /* Auf den STAND warten, nicht nur auf den Schlüssel: der Entwurf wird
     verzögert geschrieben, und unter Last stand hier der vorige drin. */
  const key = 'studio:wandstaerke:gearbox_cover';
  await wait(() => { const d = globalThis.localStorage.getItem(key); return d && JSON.parse(d).doc.cell === s.cell; }, 200);
  const draft = JSON.parse(globalThis.localStorage.getItem(key));
  assert.equal(draft.doc.cell, s.cell, 'die Einstellungen sind gemerkt');
  /* Nur Einstellungen, kein Plan: nichts gilt als ungesichert, die Seite
     fragt beim Verlassen nicht, und „Speichern" bleibt ruhig. */
  assert.equal(v.tool.settingsOnly, true);
  assert.equal(ui('save-state').textContent, '');
  assert.equal(host.store.dirty, false);
  assert.ok(!ui('save').classList.contains('dirty'));
  /* Eine Datei mit anderen Werten laden: die Felder folgen. */
  shell.setMode('feld');
  v.tool.fromJSON({ ...doc, cell: 9, under: 3, hot: { shape: 'kugeln', min: 60 } });
  assert.equal(s.cell, 9);
  assert.equal(ui('cell').value, '9');
  assert.equal(s.stale, true, 'eine andere Zellkante verlangt ein neues Feld');
  assert.equal(s.hot.min, 60);
  assert.equal(ui('hot-min').value, '60');
  assert.throws(() => v.tool.fromJSON({ format: 'dielogic-anguss', version: 1 }), /keine Datei der Wandstärkenanalyse/);
  /* Der Export ist erst mit einer Fläche möglich. */
  const ex = v.tool.exports[0];
  assert.match(ex.label, /Isofläche/);
  assert.equal(ex.enabled(), true);
});

test('Abbruch: das Feld lässt sich unterbrechen, das vorige bleibt', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  shell.setMode('feld');
  const cell = ui('cell');
  cell.value = '1'; cell.dispatch('change');
  assert.equal(s.stale, true);
  const previous = s.field;
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen', 'der Hauptknopf wird zum Abbrechen');
  ui('primary').dispatch('click');
  await wait(() => !s.running, 400);
  same(s.field, previous, 'das vorige Feld bleibt');
  assert.match(ui('note').textContent, /Abgebrochen/);
  assert.equal(ui('primary').textContent, 'Feld neu berechnen');
});

test('Einstellungen kommen mit dem Bauteil zurück — still, sichtbar, umkehrbar', async () => {
  const { v, ui, host, doc } = P;
  const s = v.state;
  const KEY = 'studio:wandstaerke:gearbox_cover';
  const cell = ui('cell');
  cell.value = '7'; cell.dispatch('change');
  ui('hot-min').value = '60'; ui('hot-min').dispatch('input');
  await wait(() => { const d = globalThis.localStorage.getItem(KEY); return d && JSON.parse(d).doc.cell === 7 && JSON.parse(d).doc.hot.min === 60; }, 200);
  /* Ein neuer Besuch: die Seite beginnt mit ihren Vorgaben (hier: zurück-
     gesetzt, das Gemerkte bleibt liegen) und lädt dasselbe Bauteil. */
  v.tool.resetSettings();
  assert.notEqual(s.cell, 7);
  assert.ok(globalThis.localStorage.getItem(KEY), 'Zurücksetzen der Felder lässt das Gemerkte liegen');
  await host.part.pickDemo('gearbox_cover');
  await wait(() => s.ready);
  same(s.field, null, 'ein neues Bauteil beginnt ohne Feld');
  assert.equal(s.cell, 7, 'die Zellkante vom letzten Mal');
  assert.equal(ui('cell').value, '7');
  assert.equal(s.hot.min, 60);
  assert.equal(ui('banner').hidden, true, 'keine Rückfrage — es sind nur Einstellungen');
  const toast = ui('toast');
  assert.equal(toast.hidden, false);
  assert.match(toast.textContent, /Einstellungen vom .* übernommen/);
  /* Zurücksetzen: die Vorgaben, und das Gemerkte ist weg. */
  toast.querySelector('.st-toast-act').dispatch('click');
  const F = await import('../../../../web/tools/3d-studio/js/part/field.js');
  assert.equal(s.cell, F.suggestCell(s.model), 'wieder die halbe Wanddicke');
  assert.equal(s.hot.min, 75);
  assert.equal(globalThis.localStorage.getItem(KEY), null);
  assert.equal(doc.getElementById('status').textContent.includes('drehen'), true, 'die Bedienhinweise stellt der Rahmen');
});

/* Ein frisches Teil ohne Feld, mit grober Zelle — die folgenden Fälle
   rechnen schnell und beginnen alle ohne Feld. */
async function fresh(id = 'gearbox_cover', cell = '8') {
  const { v, ui, host } = P;
  await host.part.pickDemo(id);
  await wait(() => v.state.ready && !v.state.running);
  const c = ui('cell');
  c.value = cell; c.dispatch('change');
  return v.state;
}

test('Feld aus dem Schnitt: dessen Felder sind sofort scharf, die Seite bleibt dort', async () => {
  const { v, ui, shell } = P;
  const s = await fresh();
  same(s.field, null, 'ohne Feld');
  shell.setMode('schnitt');
  const sec = shell.modeSection('schnitt');
  const gated = () => sec.children.filter(c => c.classList.contains('disabled')).length;
  assert.ok(gated() > 0, 'ohne Feld sind die Felder gedämpft');
  ui('primary').dispatch('click');
  await wait(() => s.field && !s.running);
  assert.equal(shell.mode, 'schnitt', 'aus dem Schnitt gerechnet: kein Sprung zur Isofläche');
  assert.equal(gated(), 0, 'die Felder des Schnitts sind scharf, ohne den Modus zu verlassen');
  assert.ok(v.sliceMesh.visible, 'und der Schnitt steht da');
  for (const id of ['isoflaeche', 'waermezentren']) {
    assert.equal(shell.modeSection(id).children.filter(c => c.classList.contains('disabled')).length, 0, id + ' ebenso');
  }
});

test('Schnitt: jedes Texel sitzt MIT SEINER MITTE auf seinem Rasterpunkt', async () => {
  const { v, ui, shell } = P;
  const s = v.state, f = s.field;
  shell.setMode('schnitt');
  const axisBtn = ax => ui('slice-seg').querySelectorAll('button').find(b => b.dataset.value === ax);
  /* Achse Z: u = x, v = y. Texel i liegt bei links + (i + ½)·Breite/w. */
  axisBtn('2').dispatch('click');
  const g = v.sliceMesh.geometry.parameters, tex = v.sliceMesh.material.map.image;
  assert.equal(tex.width, f.dims[0]);
  assert.equal(tex.height, f.dims[1]);
  assert.ok(Math.abs(g.width - f.dims[0] * f.h) < 1e-9 && Math.abs(g.height - f.dims[1] * f.h) < 1e-9, 'w Zellen breit, nicht w − 1');
  const left = v.sliceMesh.position.x - g.width / 2, bottom = v.sliceMesh.position.y - g.height / 2;
  for (const i of [0, f.dims[0] - 1]) {
    assert.ok(Math.abs(left + (i + 0.5) * g.width / tex.width - (f.origin[0] + i * f.h)) < 1e-9, 'Texel ' + i + ' auf seinem Punkt (x)');
  }
  for (const j of [0, f.dims[1] - 1]) {
    assert.ok(Math.abs(bottom + (j + 0.5) * g.height / tex.height - (f.origin[1] + j * f.h)) < 1e-9, 'Texel ' + j + ' auf seinem Punkt (y)');
  }
  /* Achse X: die Ebene dreht sich, die Breite folgt z. */
  axisBtn('0').dispatch('click');
  assert.ok(Math.abs(v.sliceMesh.geometry.parameters.width - f.dims[2] * f.h) < 1e-9, 'X-Schnitt: Breite über z');
  axisBtn('2').dispatch('click');
  shell.setMode('feld');
});

test('Wer während der ersten Rechnung den Modus wechselt, bleibt dort', async () => {
  const { ui, shell } = P;
  const s = await fresh();
  shell.setMode('feld');
  ui('primary').dispatch('click');
  assert.equal(s.running, true, 'die Rechnung läuft');
  shell.setMode('waermezentren');
  await wait(() => s.field && !s.running);
  assert.equal(shell.mode, 'waermezentren', 'kein Sprung zurück zur Isofläche');
  /* Wer im Modus „Feld" bleibt, landet wie bisher beim Ergebnis. */
  const t = await fresh();
  shell.setMode('feld');
  ui('primary').dispatch('click');
  await wait(() => t.field && !t.running);
  assert.equal(shell.mode, 'isoflaeche');
  shell.setMode('feld');
});

test('Zellkante während der Rechnung geändert: das Feld gilt als veraltet', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  shell.setMode('feld');
  const cell = ui('cell');
  cell.value = '9'; cell.dispatch('change');
  ui('primary').dispatch('click');
  assert.equal(s.running, true);
  cell.value = '10'; cell.dispatch('change');           // umentschieden, während gerechnet wird
  await wait(() => !s.running && s.field && s.fieldCell === 9);
  assert.equal(s.field.h, 9, 'gerechnet wurde mit der Zelle vom Start');
  assert.equal(s.stale, true, 'und das Feld passt nicht mehr zur Eingabe');
  assert.equal(ui('primary').textContent, 'Feld neu berechnen');
  assert.match(ui('note').textContent, /Zellkante geändert/);
  assert.doesNotMatch(kpiText(ui('field-kpis')), /9 mm/, 'keine Kennzahl „Feld … · 9 mm" neben der Eingabe 10');
  /* Zurück zur Zelle des Feldes: dann ist es wieder aktuell. */
  cell.value = '9'; cell.dispatch('change');
  assert.equal(s.stale, false);
  assert.match(ui('note').textContent, /Feld ist aktuell/);
});

test('Ein neues Bauteil beendet die laufende Rechnung des alten, still', async () => {
  const { ui, shell, host } = P;
  const s = await fresh('gearbox_cover', '1,5');       // fein: die Rechnung dauert Sekunden
  shell.setMode('feld');
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  const gear = s.model;
  await host.part.pickDemo('u_channel_ribbed');
  await new Promise(r => setTimeout(r, 30));
  assert.ok(s.model !== gear, 'das neue Teil ist da');
  assert.equal(host.jobs.running, false, 'die Rechnung des alten Teils ist beendet, nicht erst nach Sekunden');
  assert.equal(shell.busy, false);
  same(s.field, null, 'das neue Teil beginnt ohne Feld');
  assert.equal(s.cancelled, false, 'das war kein Abbruch des Anwenders');
  assert.equal(ui('primary').textContent, 'Feld berechnen');
  assert.doesNotMatch(ui('note').textContent, /Abgebrochen|rastern/);
  /* Und das neue Teil lässt sich sofort rechnen. */
  const cell = ui('cell');
  cell.value = '6'; cell.dispatch('change');
  ui('primary').dispatch('click');
  await wait(() => s.field && !s.running);
  const F = await import('../../../../web/tools/3d-studio/js/part/field.js');
  assert.deepEqual(s.field.dims, F.fieldSize(s.model, 0, 18, { h: 6, pad: 12 }).dims, 'das Feld gehört zum neuen Teil');
  shell.setMode('feld');
});

test('Über 16 Mio. Punkten: die Seite sagt vorher, mit welcher Zelle sie rastert, und meldet danach keine Änderung', async () => {
  const { v, ui, shell, host } = P;
  const s = v.state;
  const S = await import('../../../../web/tools/3d-studio/js/solids.js');
  const F = await import('../../../../web/tools/3d-studio/js/part/field.js');
  await host.part.load(S.box(600, 400, 300), 'block.stl', 'test');
  await wait(() => s.ready && s.model && s.model.faceCount === 12);
  shell.setMode('feld');
  const cell = ui('cell');
  cell.value = '1,5'; cell.dispatch('change');
  /* Was der Gastgeber tut (js/studio/host.js): in Schritten von 10 % anheben. */
  let h = 1.5, est = F.fieldSize(s.model, 0, 4.5, { h, pad: 3 });
  const asked = est.samples;
  while (est.samples > 16e6) { h = Math.round(h * 110) / 100; est = F.fieldSize(s.model, 0, 4.5, { h, pad: 3 }); }
  assert.ok(asked > 16e6 && h > 1.5, 'der Klotz ist zu groß für 1,5 mm: ' + asked);
  const cost = ui('field-cost').textContent;
  assert.ok(cost.includes(est.dims.join(' × ')), 'die Kosten nennen das Raster, das entsteht: ' + cost);
  assert.ok(!cost.includes((asked / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 })), 'nicht das verlangte');
  const hTxt = h.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  assert.match(ui('field-warn').textContent, new RegExp('^Gerastert wird mit ' + hTxt + ' mm: Mit 1,5 mm wären es \\d+ Mio. Rasterpunkte, die Grenze sind 16 Mio.$'), 'und warum');
  ui('primary').dispatch('click');
  await wait(() => s.field && !s.running, 1200);
  assert.equal(s.field.h, h, 'gerastert mit der angehobenen Zelle');
  assert.equal(s.stale, false, 'das ist das Feld zu 1,5 mm, keine geänderte Zellkante');
  shell.setMode('feld');
  assert.equal(ui('primary').hidden, true);
  assert.match(ui('note').textContent, /Feld ist aktuell/);
  assert.match(kpiText(ui('field-kpis')), new RegExp(hTxt + ' mm'), 'die Kennzahl nennt die echte Zelle');
  assert.match(ui('field-warn').textContent, /Gerastert wird mit/, 'der Hinweis bleibt stehen');
  /* Dieselben Einstellungen noch einmal (Datei, gemerkte Einstellungen): nichts veraltet. */
  v.tool.fromJSON(v.tool.toJSON());
  assert.equal(s.stale, false);
  assert.match(ui('note').textContent, /Feld ist aktuell/);
  await host.part.pickDemo('gearbox_cover');
  await wait(() => s.ready);
});
