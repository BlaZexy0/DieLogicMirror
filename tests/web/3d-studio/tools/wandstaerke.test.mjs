/* Wandstärkenanalyse im gemeinsamen Rahmen: Feld auf Knopfdruck mit
   Abbruch, Isofläche daraus, Schnitt und Wärmezentren als Modi, Entwurf
   und Datei. Die Fälle stammen aus viewer.test.mjs und wurden auf
   data-ui und die Modi übertragen.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/wandstaerke.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mountPage, wait, kpiText } from './fixture.mjs';

/* Felder NIE mit assert.equal vergleichen: schlägt der Vergleich fehl, baut
   Node einen Textvergleich beider Objekte — bei 14 Mio. Rasterwerten frisst
   das den ganzen Arbeitsspeicher (so geschehen: 25 GB, der Kernel räumte
   ab). Deshalb same(): Identität prüfen, nur die Meldung ausgeben. */
const same = (a, b, msg) => assert.ok(a === b, msg);

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
    ['bauteil', 'feld', 'isoflaeche', 'schnitt', 'waermezentren']);
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
  const lo = C.turbo(0.15), hi = C.turbo(0.85), mid = C.turbo(0.5);
  assert.ok(lo[2] > 0.9 && lo[2] > lo[0] && hi[0] > 0.8 && hi[0] > hi[2] && mid[1] > mid[0] && mid[1] > mid[2], 'Turbo: blau → grün → rot');
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
  const top = C.turbo(0.08 + 0.84 * s.maxima[0].r / s.stats.maxIn);
  assert.ok(Math.abs(m0.material.color.r - top[0]) < 0.02 && Math.abs(m0.material.color.b - top[2]) < 0.02, 'die größte Marke trägt die Farbe ihrer Größe');
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
  assert.ok(Math.abs(v.hotGroup.children[0].material.color.r - top[0]) < 0.02, 'gleiche Farbe wie die Kugel');
  const n75 = s.maxima.length;
  const min = ui('hot-min');
  min.value = '100'; min.dispatch('input');
  assert.ok(s.maxima.length <= n75 && s.maxima.length >= 1);
  assert.ok(s.maxima.every(m => m.r >= s.stats.maxIn - 1e-9), 'bei 100 % nur die dickste');
  min.value = '75'; min.dispatch('input');

  shell.setMode('bauteil');
  assert.equal(v.hotGroup.visible, false, 'die Marken gehen mit ihrem Modus');
  assert.ok(!bar.classList.contains('on'));
  assert.ok(v.partMesh.visible && !v.partMesh.material.transparent, 'das Bauteil deckend');
  assert.match(kpiText(ui('part-kpis')), /Wanddicke 2V\/A/);
});

test('Speichern und Entwurf: die Einstellungen als Datei, ein Entwurf im Browser', async () => {
  const { v, ui, host, shell } = P;
  const s = v.state;
  const doc = v.tool.toJSON();
  assert.equal(doc.format, 'dielogic-wandstaerke');
  assert.equal(doc.cell, s.cell);
  assert.equal(doc.hot.shape, 'kreise');
  await wait(() => !!globalThis.localStorage.getItem('studio:wandstaerke:gearbox_cover'), 200);
  const draft = JSON.parse(globalThis.localStorage.getItem('studio:wandstaerke:gearbox_cover'));
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
