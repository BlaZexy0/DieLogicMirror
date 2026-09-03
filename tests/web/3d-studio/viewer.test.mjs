/* Verdrahtungstest beider Viewer.

   Die Viewer laufen im Browser; Node hat weder DOM noch WebGL. Beides
   wird hier ersetzt (tests/stubs/): ein winziges DOM, das aus der
   ECHTEN HTML-Seite gebaut wird, und das echte Three.js mit einem
   Renderer-Platzhalter. Damit lässt sich prüfen, was ohne Browser sonst
   niemand prüft: dass jeder Regler, jeder Schalter und jede Legende
   wirklich am richtigen Element hängt und die Rückrufe durchlaufen.

   Aufruf:  node --import ./tests/stubs/register.mjs --test tests/viewer.test.mjs
   (der Sammellauf in package.json / README macht das automatisch) */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocument, installGlobals } from './stubs/dom.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'tools', '3d-studio');
const read = f => readFileSync(resolve(ROOT, f), 'utf8');

/* Warten, bis die laufende Analyse fertig ist — sonst räumt der nächste
   Test das DOM unter ihr weg. */
/* Rechnen läuft nur auf Knopfdruck — der Test drückt ihn wie ein Mensch. */
async function analyse(d, mod, tries = 800) {
  d.getElementById('run-analysis').dispatch('click');
  for (let i = 0; i < tries; i++) {
    const s = mod.__viewer.state;
    if (!s.running && s.analysed && !s.stale) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('Analyse wurde nicht fertig');
}

async function ready(mod, name = null, tries = 600) {
  for (let i = 0; i < tries; i++) {
    const s = mod.__viewer.state;
    if (s.ready && (!name || s.name === name)) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('Analyse wurde nicht fertig' + (name ? ' für ' + name : ''));
}

/* ── Formteilungs-Viewer ─────────────────────────────────────── */
let app, doc, byId;

before(async () => {
  ({ doc, byId } = buildDocument(read('bauteilanalyse.html')));
  installGlobals(doc);
  app = await import('../../../web/tools/3d-studio/js/part/app.js');
  await ready(app);
  assert.ok(app.__viewer.state.model, 'Beispielteil wurde geladen');
  assert.equal(app.__viewer.state.analysed, false, 'ohne Bestätigung wird nicht gerechnet');
  await analyse(doc, app);
});

test('Kopfleiste, Ansichtsleiste und Viewport sind aufgebaut', () => {
  const nav = doc.body.children.find(c => c.className.includes('f3-nav'));
  assert.ok(nav, 'Kopfleiste eingehängt');
  assert.ok(nav.querySelectorAll('a').length >= 3, 'Navigationslinks');
  const bar = doc.getElementById('viewport').querySelector('.view-bar');
  assert.ok(bar, 'Ansichtsleiste im Viewport');
  assert.equal(bar.querySelectorAll('[data-view]').length, 4, 'X · Y · Z · Iso');
  assert.equal(bar.querySelectorAll('[data-proj]').length, 2, 'Persp · Parallel');
});

test('Ansichtsknöpfe schalten beim zweiten Klick auf die Gegenrichtung', () => {
  const bar = doc.getElementById('viewport').querySelector('.view-bar');
  const x = bar.querySelectorAll('[data-view]').find(b => b.dataset.view === 'x');
  const cam = () => app.__viewer.view.camera.position.clone();
  x.dispatch('click');
  const first = cam();
  assert.equal(x.textContent, 'X');
  assert.ok(first.x > 0 && Math.abs(first.y) < 1e-6, 'Kamera steht auf +X');
  x.dispatch('click');
  const second = cam();
  assert.equal(x.textContent, '−X', 'Beschriftung zeigt das Vorzeichen');
  assert.ok(second.x < 0, 'Kamera steht auf −X');
  x.dispatch('click');
  assert.equal(x.textContent, 'X', 'dritter Klick zurück');

  /* Ein anderer Knopf setzt die Beschriftung des alten zurück. */
  const y = bar.querySelectorAll('[data-view]').find(b => b.dataset.view === 'y');
  y.dispatch('click'); y.dispatch('click');
  assert.equal(y.textContent, '−Y');
  assert.equal(x.textContent, 'X');
  assert.ok(app.__viewer.view.camera.position.y < 0, 'Untersicht');
});

test('Parallelprojektion behält den Bildausschnitt', () => {
  const bar = doc.getElementById('viewport').querySelector('.view-bar');
  const [persp, ortho] = bar.querySelectorAll('[data-proj]');
  const view = app.__viewer.view;
  assert.equal(view.projection, 'persp');
  ortho.dispatch('click');
  assert.equal(view.projection, 'ortho');
  assert.ok(view.camera.isOrthographicCamera, 'orthografische Kamera aktiv');
  assert.ok(view.camera.top > 0 && view.camera.right > view.camera.top, 'Frustum folgt dem Seitenverhältnis');
  persp.dispatch('click');
  assert.equal(view.projection, 'persp');
  assert.ok(view.camera.isPerspectiveCamera);
});

test('Analyse läuft und die Legende füllt sich', () => {
  const s = app.__viewer.state;
  assert.ok(s.model.faceCount > 100, 'Netz vorhanden');
  assert.ok(s.vis.dot.length === s.model.faceCount * 6, 'Sichtbarkeit für sechs Richtungen');
  assert.ok(s.seg && s.draft, 'Zuordnung und Schrägen gerechnet');
  const legend = doc.getElementById('legend');
  assert.ok(legend.innerHTML.includes('%'), 'Legende zeigt Flächenanteile');
  assert.ok(doc.getElementById('model-facts').innerHTML.includes('cm³'), 'Kennzahlen des Bauteils');
  assert.ok(doc.getElementById('seg-facts').innerHTML.includes('Saat'), 'Stufen-Kennzahlen');
  assert.ok(+doc.getElementById('parting-count').textContent.replace(/\D/g, '') > 0, 'Trennlinie gefunden');
});

test('Stufenschalter blendet spätere Stufen aus', () => {
  const seg = doc.getElementById('stage-seg');
  const colorAt = f => {
    const c = app.__viewer.partMesh.geometry.getAttribute('color').array;
    return [c[f * 9], c[f * 9 + 1], c[f * 9 + 2]].map(v => +v.toFixed(3)).join(',');
  };
  const s = app.__viewer.state;
  const grown = [...s.seg.stage].findIndex(v => v === 3);
  assert.ok(grown >= 0, 'es gibt ausgebreitete Dreiecke');
  const full = colorAt(grown);
  seg.querySelectorAll('button').find(b => b.dataset.value === '1').dispatch('click');
  assert.equal(s.stageMax, 1);
  assert.notEqual(colorAt(grown), full, 'in Stufe 1 ist das Dreieck noch grau');
  seg.querySelectorAll('button').find(b => b.dataset.value === '3').dispatch('click');
  assert.equal(colorAt(grown), full, 'in Stufe 3 wieder eingefärbt');
});

test('Regler warten auf Bestätigung, dann rechnen sie neu', async () => {
  const s = app.__viewer.state;
  const btn = doc.getElementById('run-analysis');
  const note = doc.getElementById('analysis-state');
  assert.equal(btn.textContent, 'Analyse ist aktuell');
  assert.equal(btn.disabled, true, 'ohne Änderung gibt es nichts zu rechnen');

  const before = [...s.seg.areaByLabel];
  const el = doc.getElementById('min-draft');
  el.value = '3.5';
  el.dispatch('input');
  assert.equal(s.opts.minDraftDeg, 3.5);
  assert.equal(doc.getElementById('min-draft-val').textContent, '3,5 °');
  assert.equal(s.stale, true, 'als veraltet markiert');
  assert.deepEqual([...s.seg.areaByLabel], before, 'noch NICHT neu gerechnet');
  assert.equal(btn.textContent, 'Analyse aktualisieren');
  assert.ok(note.textContent.includes('geändert'), 'Hinweis erscheint');

  await analyse(doc, app);
  assert.notDeepEqual([...s.seg.areaByLabel], before, 'nach dem Bestätigen ist es neu');
  assert.equal(btn.textContent, 'Analyse ist aktuell');

  el.value = '0.5'; el.dispatch('input');
  const pen = doc.getElementById('slider-pen');
  pen.value = '1.2'; pen.dispatch('input');
  await analyse(doc, app);
  assert.equal(s.opts.minDraftDeg, 0.5);
  assert.equal(s.opts.sliderPenalty, 1.2, 'zurück auf die Standardwerte');
});

test('Einfärbungen und Formöffnungsrichtung schalten um', async () => {
  const s = app.__viewer.state;
  const modes = doc.getElementById('mode-seg').querySelectorAll('button');
  const draftBlock = doc.getElementById('draft-block');
  for (const b of modes) {
    b.dispatch('click');
    assert.equal(s.mode, b.dataset.value);
    assert.ok(doc.getElementById('legend').innerHTML.length > 0, 'Legende für ' + b.dataset.value);
    assert.equal(draftBlock.classList.contains('disabled'), b.dataset.value !== 'draft',
      'Grenzwert-Block ist nur bei „Schräge" bedienbar');
  }
  modes.find(b => b.dataset.value === 'regions').dispatch('click');

  const ax = doc.getElementById('axis-seg').querySelectorAll('button');
  ax.find(b => b.dataset.value === '0').dispatch('click');
  assert.equal(s.opts.mainAxis, 0);
  assert.equal(s.stale, true, 'auch die Formöffnung wartet auf Bestätigung');
  await analyse(doc, app);
  assert.ok(doc.getElementById('legend').innerHTML.includes('Schieber'), 'Rollen benannt');
  ax.find(b => b.dataset.value === '2').dispatch('click');
  await analyse(doc, app);
});

test('Farbskala erscheint nur bei geordneten Größen', () => {
  const modes = doc.getElementById('mode-seg').querySelectorAll('button');
  const bar = doc.getElementById('colorbar');

  modes.find(b => b.dataset.value === 'draft').dispatch('click');
  assert.ok(bar.classList.contains('on'), 'bei der Schräge sichtbar');
  assert.equal(doc.getElementById('cb-title').textContent, 'Entformschräge');
  assert.ok(doc.getElementById('cb-scale').style.background.includes('linear-gradient'));
  assert.ok(doc.getElementById('cb-ticks').innerHTML.includes('°'), 'Werte an der Skala');
  assert.ok(doc.getElementById('cb-extra').innerHTML.includes('Hinterschnitt'));

  /* Der Grenzwert wandert in die Beschriftung. */
  const lim = doc.getElementById('draft-limit');
  lim.value = '2'; lim.dispatch('input');
  assert.ok(doc.getElementById('cb-ticks').innerHTML.includes('6'), 'Skala reicht bis 3× Grenzwert');
  lim.value = '1.5'; lim.dispatch('input');

  modes.find(b => b.dataset.value === 'count').dispatch('click');
  assert.ok(bar.classList.contains('on'), 'bei der Sichtbarkeit sichtbar');
  assert.ok(doc.getElementById('cb-ticks').className.includes('bands'), 'abgestufte Skala');

  modes.find(b => b.dataset.value === 'regions').dispatch('click');
  assert.ok(!bar.classList.contains('on'), 'bei den Regionen aus — dort gibt es keine Reihenfolge');
});

test('Beispielteile lassen sich wechseln', async () => {
  const sel = doc.getElementById('demo-select');
  sel.value = 'undercut';
  sel.dispatch('change');
  await ready(app, 'Teil mit Hinterschnitt');
  const s = app.__viewer.state;
  assert.ok(s.name.includes('Hinterschnitt'), 'Teil gewechselt: ' + s.name);
  assert.equal(s.analysed, false, 'ein neues Teil startet ohne Analyse');
  assert.ok(doc.getElementById('legend').innerHTML.includes('Analyse starten'), 'Hinweis in der Legende');
  await analyse(doc, app);
  assert.ok(s.seg.areaByLabel[6] > 0, 'dieses Teil hat Hinterschnitte');
});

test('STL laden: Datei, Ziehen-und-Ablegen, kaputte Datei', async () => {
  const { writeSTL } = await import('../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../web/tools/3d-studio/js/solids.js');
  const buf = writeSTL(S.box(40, 30, 20), 'test');
  const file = { name: 'pruefwuerfel.stl', arrayBuffer: () => Promise.resolve(buf), byteLength: buf.byteLength };

  const input = doc.getElementById('stl-input');
  input.files = [file];
  input.dispatch('change');
  await ready(app, 'pruefwuerfel.stl');
  assert.equal(app.__viewer.state.model.faceCount, 12, 'Quader aus zwölf Dreiecken');
  await analyse(doc, app);
  assert.equal(app.__viewer.state.seg.counts.seed, 12, 'jede Seite eindeutig');

  /* Ziehen-und-Ablegen über dem Viewport. */
  const vp = doc.getElementById('viewport');
  vp.dispatch('dragover');
  assert.ok(vp.classList.contains('dragover'), 'Ablegefläche wird angezeigt');
  const buf2 = writeSTL(S.cyl(20, 0, 50, 24), 'test');
  vp.dispatch('drop', { dataTransfer: { files: [{ name: 'zylinder.stl', arrayBuffer: () => Promise.resolve(buf2), byteLength: buf2.byteLength }] } });
  assert.ok(!vp.classList.contains('dragover'));
  await ready(app, 'zylinder.stl');

  /* Unlesbare Datei: Hinweis statt Absturz. */
  const junk = new Uint8Array(20).buffer;
  input.files = [{ name: 'kaputt.stl', arrayBuffer: () => Promise.resolve(junk), byteLength: 20 }];
  input.dispatch('change');
  await new Promise(r => setTimeout(r, 60));
  assert.ok(doc.getElementById('model-warn').textContent.includes('STL'), 'Fehlermeldung erscheint');
  assert.equal(app.__viewer.state.name, 'zylinder.stl', 'das gute Modell bleibt stehen');
});

test('?part=… wählt das Beispielteil aus der Adresszeile', async () => {
  const { doc: d3 } = buildDocument(read('bauteilanalyse.html'));
  installGlobals(d3);
  globalThis.location = { search: '?part=bracket', href: 'http://test/bauteilanalyse.html?part=bracket' };
  const app2 = await import('../../../web/tools/3d-studio/js/part/app.js?variante=adresszeile');
  await ready(app2);
  assert.ok(app2.__viewer.state.name.includes('Halter'), 'Halter geladen: ' + app2.__viewer.state.name);
  await analyse(d3, app2);
  assert.ok(app2.__viewer.state.seg, 'Analyse auf Knopfdruck gelaufen');
  assert.equal(d3.getElementById('demo-select').value, 'bracket');
});

/* ── Formaufbau-Viewer ───────────────────────────────────────── */
test('Formaufbau-Viewer verdrahtet Baugruppen, Regler und Schnitt', async () => {
  const T = await import('three');
  const { COMPONENTS } = await import('../../../web/tools/3d-studio/js/registry.js');

  /* Ein Ersatzmodell mit denselben Namen wie die GLB. */
  const root = new T.Group(); root.name = 'die';
  const fixedRoot = new T.Group(); fixedRoot.name = 'fixedRoot';
  const movingRoot = new T.Group(); movingRoot.name = 'movingRoot';
  root.add(fixedRoot, movingRoot);
  for (const c of COMPONENTS) {
    const g = new T.Group(); g.name = c.id; g.userData.compId = c.id;
    const mat = new T.MeshStandardMaterial({ color: 0x888888 });
    mat.name = c.side === 'cast' ? c.id : 'steel';
    const mesh = new T.Mesh(new T.BoxGeometry(10, 10, 10), mat);
    mesh.userData.compId = c.id;
    g.add(mesh);
    (c.side === 'fix' ? fixedRoot : movingRoot).add(g);
  }
  globalThis.__TEST_GLTF = root;

  const { doc: d2 } = buildDocument(read('form.html'));
  installGlobals(d2);
  await import('../../../web/tools/3d-studio/js/die.js');
  await new Promise(r => setTimeout(r, 30));

  const list = d2.getElementById('components');
  const rows = list.querySelectorAll('[data-comp]');
  assert.equal(rows.length, COMPONENTS.length, 'eine Zeile je Baugruppe');

  /* Glühbirnen: eine je Gruppe plus eine je Untergruppe. */
  const bulbs = list.querySelectorAll('.bulb-btn');
  const subs = new Set(COMPONENTS.filter(c => c.sub).map(c => c.side + '/' + c.sub));
  assert.equal(bulbs.length, 3 + subs.size, 'Glühbirne je Gruppe und Untergruppe');
  assert.ok(bulbs.every(b => b.classList.contains('on')), 'anfangs leuchten alle');
  assert.equal(list.querySelectorAll('.sub-head').length, subs.size, 'Untergruppen-Überschriften');

  /* Untergruppe: schaltet nur die Temperierkreise. */
  const coolIds = COMPONENTS.filter(c => c.sub === 'Temperierung' && c.side === 'fix').map(c => c.id);
  assert.equal(coolIds.length, 2, 'zwei Kreise je Hälfte');
  const subBulb = list.querySelectorAll('.sub-head')[0].querySelector('.bulb-btn');
  subBulb.dispatch('click');
  for (const id of coolIds) assert.equal(root.getObjectByName(id).visible, false, id + ' aus');
  assert.equal(root.getObjectByName('fixHalf').visible, true, 'der Rest bleibt sichtbar');
  assert.ok(!subBulb.classList.contains('on'), 'Birne aus');
  subBulb.dispatch('click');
  for (const id of coolIds) assert.equal(root.getObjectByName(id).visible, true);
  assert.ok(subBulb.classList.contains('on'), 'Birne wieder an');

  /* Gruppenbirne: schaltet die ganze Seite, Untergruppe eingeschlossen. */
  const groupBulb = list.querySelectorAll('.group-head')[0].querySelector('.bulb-btn');
  groupBulb.dispatch('click');
  for (const c of COMPONENTS.filter(c => c.side === 'fix')) {
    assert.equal(root.getObjectByName(c.id).visible, false, c.id + ' aus');
  }
  assert.ok(!subBulb.classList.contains('on'), 'Untergruppen-Birne folgt');
  groupBulb.dispatch('click');
  assert.ok(groupBulb.classList.contains('on') && subBulb.classList.contains('on'));
  assert.equal(root.getObjectByName('movHalf').visible, true, 'die andere Seite ist unberührt');

  const first = rows[0];
  const compId = first.dataset.comp;
  const obj = root.getObjectByName(compId);
  assert.ok(obj.visible, 'anfangs sichtbar');
  first.checked = false;
  first.dispatch('change');
  assert.equal(obj.visible, false, 'Schalter blendet die Baugruppe aus');
  first.checked = true;
  first.dispatch('change');
  assert.equal(obj.visible, true);

  const open = d2.getElementById('open');
  open.value = '50';
  open.dispatch('input');
  assert.ok(movingRoot.position.z > 100, 'Form öffnet sich: z = ' + movingRoot.position.z);
  assert.equal(d2.getElementById('open-val').textContent, '50 %');

  const op = d2.getElementById('opacity');
  op.value = '60';
  op.dispatch('input');
  const steel = [];
  root.traverse(o => { if (o.isMesh && o.material.name === 'steel') steel.push(o.material); });
  assert.ok(steel.length > 0 && Math.abs(steel[0].opacity - 0.6) < 1e-9, 'Stahl-Transparenz wirkt');
  assert.equal(steel[0].transparent, true);

  const clipOn = d2.getElementById('clip-on');
  assert.ok(d2.getElementById('clip-detail').classList.contains('disabled'), 'Schnitt anfangs aus');
  clipOn.checked = true;
  clipOn.dispatch('change');
  assert.ok(!d2.getElementById('clip-detail').classList.contains('disabled'), 'Schnitt eingeschaltet');
  const axisY = d2.querySelectorAll('[data-axis]').find(b => b.dataset.axis === 'y');
  axisY.dispatch('click');
  assert.ok(axisY.classList.contains('active'), 'Achse Y aktiv');
  const pos = d2.getElementById('clip-pos');
  pos.value = '40';
  pos.dispatch('input');
  assert.equal(d2.getElementById('clip-pos-val').textContent, '40 %');
});

/* ── Offsetflächen-Viewer ────────────────────────────────────── */
test('Offsetseite: Feld auf Knopfdruck, Fläche daraus abgeleitet', async () => {
  const { doc: d4 } = buildDocument(read('offset.html'));
  installGlobals(d4);
  globalThis.location = { search: '?part=cover', href: 'http://test/offset.html' };
  const off = await import('../../../web/tools/3d-studio/js/part/offsetapp.js');
  await ready(off);
  const s = off.__viewer.state;
  assert.ok(s.model, 'Bauteil geladen');
  assert.equal(s.field, null, 'ohne Bestätigung wird kein Feld gerechnet');
  assert.equal(d4.getElementById('run-field').textContent, 'Feld berechnen');
  assert.ok(d4.getElementById('field-facts').innerHTML.includes('Zellgröße'),
    'die Kosten stehen VOR dem Rechnen da');

  /* Grobes Raster, damit der Test flott bleibt. */
  const res = d4.getElementById('res');
  res.value = '48'; res.dispatch('input');
  assert.equal(s.res, 48);
  const band = d4.getElementById('band');
  band.value = '8'; band.dispatch('change');
  assert.equal(s.band, 8);

  d4.getElementById('run-field').dispatch('click');
  for (let i = 0; i < 800 && !s.field; i++) await new Promise(r => setTimeout(r, 25));
  assert.ok(s.field, 'Feld gerechnet');
  assert.equal(s.stale, false);
  assert.equal(d4.getElementById('run-field').textContent, 'Feld ist aktuell');
  assert.ok(s.offsetTris && s.offsetTris.length > 0, 'Fläche sofort mit abgeleitet');
  assert.ok(d4.getElementById('offset-facts').innerHTML.includes('cm³'), 'Kennwerte');

  /* Aufmaß ändern: nur ableiten, kein neues Feld. */
  const before = s.offsetTris.length;
  const fieldRef = s.field;
  const d = d4.getElementById('delta');
  for (const [typed, want] of [['+5', 5], ['-3', -3], ['−2', -2], ['1,5', 1.5]]) {
    d.value = typed;
    d.dispatch('change');
    assert.equal(s.delta, want, 'Eingabe „' + typed + '"');
  }
  assert.equal(s.field, fieldRef, 'dasselbe Feld — nur neu abgeleitet');
  assert.equal(s.stale, false);
  assert.notEqual(s.offsetTris.length, before, 'andere Fläche');

  /* Außerhalb der Bandbreite: der Wert bleibt stehen, das Band wird
     mitgezogen und ein neues Feld verlangt. */
  d.value = '99'; d.dispatch('change');
  assert.equal(s.delta, 99, 'der Wunsch bleibt erhalten');
  assert.ok(s.band > 99, 'Bandbreite zieht mit: ' + s.band);
  assert.equal(s.stale, true, 'Feld muss größer werden');
  assert.ok(d4.getElementById('field-state').textContent.includes('Bandbreite'));
  d.value = '2'; d.dispatch('change');
  band.value = '8'; band.dispatch('change');
  d4.getElementById('run-field').dispatch('click');
  for (let i = 0; i < 800 && s.stale; i++) await new Promise(r => setTimeout(r, 25));
  assert.equal(s.stale, false, 'nach dem Neurechnen wieder aktuell');

  /* Anzeige-Umschalter. */
  const seg = d4.getElementById('show-seg').querySelectorAll('button');
  seg.find(b => b.dataset.value === 'offset').dispatch('click');
  assert.equal(off.__viewer.partMesh.visible, false);
  assert.equal(off.__viewer.offsetMesh.visible, true);
  seg.find(b => b.dataset.value === 'part').dispatch('click');
  assert.equal(off.__viewer.offsetMesh.visible, false);
  seg.find(b => b.dataset.value === 'both').dispatch('click');
  assert.ok(off.__viewer.partMesh.visible && off.__viewer.offsetMesh.visible);
});

test('Offsetseite: Feldschnitt und Farbskala', async () => {
  const off = await import('../../../web/tools/3d-studio/js/part/offsetapp.js');
  const d4 = globalThis.document;
  const s = off.__viewer.state;
  const bar = d4.getElementById('colorbar');
  assert.ok(!bar.classList.contains('on'), 'ohne Schnitt keine Skala');

  const on = d4.getElementById('slice-on');
  on.checked = true;
  on.dispatch('change');
  assert.equal(s.slice.on, true);
  assert.ok(off.__viewer.sliceMesh.visible, 'Schnittebene sichtbar');
  assert.ok(off.__viewer.sliceMesh.material.map, 'Rasterbild erzeugt');
  assert.ok(bar.classList.contains('on'), 'Skala eingeblendet');
  assert.equal(d4.getElementById('cb-title').textContent, 'Abstand zur Oberfläche');
  assert.ok(d4.getElementById('cb-extra').innerHTML.includes('Offset'), 'Höhenlinie benannt');

  /* Achse und Position wirken sofort. */
  for (const ax of ['0', '1', '2']) {
    d4.getElementById('slice-seg').querySelectorAll('button').find(b => b.dataset.value === ax).dispatch('click');
    assert.equal(s.slice.axis, +ax);
    assert.ok(off.__viewer.sliceMesh.material.map.image.width > 1, 'Bild für Achse ' + ax);
  }
  const pos = d4.getElementById('slice-pos');
  pos.value = '20'; pos.dispatch('input');
  assert.equal(s.slice.pos, 20);
  assert.ok(d4.getElementById('slice-pos-val').textContent.includes('mm'), 'Lage in mm');

  on.checked = false;
  on.dispatch('change');
  assert.equal(off.__viewer.sliceMesh.visible, false);
  assert.ok(!bar.classList.contains('on'));
});

/* ── Abstandsanalyse ─────────────────────────────────────────── */
test('Abstandsseite: zwei Dateien, Abstand auf Knopfdruck', async () => {
  const { doc: d5 } = buildDocument(read('abstand.html'));
  installGlobals(d5);
  globalThis.location = { search: '', href: 'http://test/abstand.html' };
  const dist = await import('../../../web/tools/3d-studio/js/part/distanceapp.js');
  await ready(dist);
  const s = dist.__viewer.state;

  assert.ok(s.a.model && s.b.model, 'beide Dateien geladen');
  assert.ok(s.a.name.includes('Gussteil'), 'A ist das Gussteil: ' + s.a.name);
  assert.ok(s.b.name.includes('Temperierung'), 'B ist die Temperierung: ' + s.b.name);
  assert.equal(s.analysed, false, 'ohne Bestätigung wird nicht gerechnet');
  assert.ok(d5.getElementById('model-facts-a').innerHTML.includes('cm²'), 'Kennzahlen A');
  assert.ok(d5.getElementById('model-facts-b').innerHTML.includes('cm²'), 'Kennzahlen B');

  /* Das Gegenstück darf nur hier in der Auswahl stehen. */
  const optsA = d5.getElementById('demo-select-a').innerHTML;
  assert.ok(optsA.includes('coolmov'), 'Gegenstücke sind hier wählbar');

  d5.getElementById('run-distance').dispatch('click');
  for (let i = 0; i < 1200 && !s.analysed; i++) await new Promise(r => setTimeout(r, 25));
  assert.ok(s.analysed, 'Abstand gerechnet');
  assert.ok(s.a.dist && s.a.dist.length === s.a.model.vertexCount, 'ein Wert je Punkt von A');
  assert.ok(s.b.dist && s.b.dist.length === s.b.model.vertexCount, 'ein Wert je Punkt von B');

  /* Beide Richtungen müssen denselben kleinsten Abstand finden — der
     kürzeste Weg zwischen zwei Flächen ist symmetrisch. */
  assert.ok(Math.abs(s.a.stats.min - s.b.stats.min) < 0.5,
    'kleinster Abstand von beiden Seiten gleich: ' + s.a.stats.min.toFixed(2) + ' / ' + s.b.stats.min.toFixed(2));
  assert.ok(s.a.stats.min > 0, 'die Körper berühren sich nicht');
  assert.ok(d5.getElementById('distance-facts').innerHTML.includes('mm'), 'Kennzahlen');
  assert.equal(d5.getElementById('run-distance').textContent, 'Abstand ist aktuell');
});

test('Abstandsseite: ein fehlgeschlagenes Beispielteil meldet sich, statt die Seite zu töten', async () => {
  const d5 = globalThis.document;
  const echt = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => null });
  try {
    const sel = d5.getElementById('demo-select-a');
    sel.value = sel.children[sel.children.length - 1].attrs.value;
    sel.dispatch('change');
    for (let i = 0; i < 40; i++) await new Promise(r => setTimeout(r, 5));
  } finally {
    globalThis.fetch = echt;
  }
  /* Vorher verdeckte der Parameter `id` den Suffix-Helfer: $('model-warn')
     traf hier ins Leere (das Feld heißt model-warn-a), und der TypeError
     ließ die Seite tot zurück. */
  const warn = d5.getElementById('model-warn-a').textContent;
  assert.match(warn, /konnte nicht geladen werden|fehlt/,
    'die Meldung muss im Feld MIT Suffix stehen, ist: „' + warn + '"');
});

test('Abstandsseite: Skalengrenzen, Sichtbarkeit, Farbskala', async () => {
  const dist = await import('../../../web/tools/3d-studio/js/part/distanceapp.js');
  const d5 = globalThis.document;
  const s = dist.__viewer.state;
  const colorAt = (mesh, f) => {
    const c = mesh.geometry.getAttribute('color').array;
    return [c[f * 9], c[f * 9 + 1], c[f * 9 + 2]].map(v => +v.toFixed(3)).join(',');
  };

  /* Grenzen wirken sofort — ohne neue Rechnung. */
  /* Über viele Dreiecke vergleichen — ein einzelnes kann in beiden
     Skalen am Anschlag liegen und sich daher nicht ändern. */
  const fingerprint = mesh => {
    const c = mesh.geometry.getAttribute('color').array;
    let h = 0;
    for (let i = 0; i < c.length; i += 97) h = (h * 31 + Math.round(c[i] * 255)) | 0;
    return h;
  };
  const before = fingerprint(dist.__viewer.meshA);
  const distRef = s.a.dist;
  const mn = d5.getElementById('scale-min'), mx = d5.getElementById('scale-max');
  mn.value = '5'; mn.dispatch('change');
  mx.value = '40'; mx.dispatch('change');
  assert.equal(s.scale.min, 5);
  assert.equal(s.scale.max, 40);
  assert.equal(s.stale, false, 'Umfärben ist keine neue Rechnung');
  assert.equal(s.a.dist, distRef, 'dieselben Messwerte');
  assert.notEqual(fingerprint(dist.__viewer.meshA), before, 'andere Einfärbung');

  /* Grenzen aus den Messwerten. */
  d5.getElementById('scale-auto').dispatch('click');
  assert.ok(Math.abs(s.scale.min - s.a.stats.min) < 0.2 || Math.abs(s.scale.min - s.b.stats.min) < 0.2,
    'Minimum übernommen: ' + s.scale.min);
  assert.ok(s.scale.max >= s.scale.min, 'Grenzen in der richtigen Reihenfolge');
  assert.equal(d5.getElementById('scale-min').value, String(s.scale.min).replace('.', ','));

  /* Einfärbung umschalten: das ungefärbte Netz wird einfarbig. */
  const seg = d5.getElementById('color-seg').querySelectorAll('button');
  seg.find(b => b.dataset.value === 'b').dispatch('click');
  assert.equal(s.color, 'b');
  const cA = colorAt(dist.__viewer.meshA, 0).split(',');
  assert.ok(cA[0] === cA[1] && cA[1] === cA[2], 'A ist jetzt grau: ' + cA.join(','));
  seg.find(b => b.dataset.value === 'both').dispatch('click');

  /* Ausblenden. */
  const showB = d5.getElementById('show-b');
  showB.checked = false; showB.dispatch('change');
  assert.equal(dist.__viewer.meshB.visible, false, 'B ausgeblendet');
  assert.equal(dist.__viewer.meshA.visible, true, 'A bleibt');
  showB.checked = true; showB.dispatch('change');
  assert.equal(dist.__viewer.meshB.visible, true);

  /* Farbskala mit den gesetzten Grenzen. */
  const bar = d5.getElementById('colorbar');
  assert.ok(bar.classList.contains('on'), 'Skala sichtbar');
  assert.equal(d5.getElementById('cb-title').textContent, 'Abstand A ↔ B');
  assert.ok(d5.getElementById('cb-ticks').innerHTML.includes('≥'), 'oberes Ende als „ab" beschriftet');
  assert.ok(d5.getElementById('cb-scale').style.background.includes('linear-gradient'));

  /* Suchgrenze gehört zur Rechnung, nicht zur Anzeige. */
  const reach = d5.getElementById('reach');
  reach.value = '12'; reach.dispatch('change');
  assert.equal(s.reach, 12);
  assert.equal(s.stale, true, 'die Suchgrenze verlangt eine neue Rechnung');
  assert.ok(d5.getElementById('distance-state').textContent.includes('Suchgrenze'));
});

/* ── Angussdesigner ──────────────────────────────────────────────
   Die Seite rechnet ohne Bestätigung: jeder Zug am Regler geht durch die
   ganze Kette (Graph → Abtasten → Strömung → Netz). Hier wird sie
   angestoßen wie von Hand — Punkte anfügen, Regler ziehen, Beispiel
   wechseln, Referenzteil laden. */
test('Angussseite: Graph bearbeiten, Regeln, Flussschema, Referenzteil', async () => {
  const { doc: d6 } = buildDocument(read('anguss.html'));
  installGlobals(d6);
  globalThis.location = { search: '', href: 'http://test/anguss.html' };
  const mod = await import('../../../web/tools/3d-studio/js/runner/app.js');
  const v = mod.__viewer;
  assert.ok(v.state.ready, 'das Beispiel steht');

  /* Ansichtsleiste und Punktmenü */
  const bar = d6.getElementById('viewport').querySelector('.view-bar');
  assert.equal(bar.querySelectorAll('[data-view]').length, 4);
  assert.ok(d6.getElementById('add-point'), 'das Punktmenü liegt im Viewport');
  assert.ok(d6.getElementById('sel-block'), 'und der ganze Auswahlblock mit ihm');
  assert.ok(d6.getElementById('pt-legend'), 'Legende der Punktarten');

  /* Kennzahlen und Prüfliste sind gefüllt, das Beispiel ist sauber */
  /* Die Kennzahlen stehen beim Flussschema, nicht in der Seitenleiste. */
  assert.match(d6.getElementById('chart-facts').innerHTML, /Anschnitte/);
  assert.match(d6.getElementById('chart-facts').innerHTML, /Druckbedarf/);
  assert.equal(d6.getElementById('graph-facts'), null);
  assert.equal(d6.getElementById('flow-facts'), null);
  assert.ok(v.state.rules.length >= 6, 'jede Regel meldet sich');
  assert.deepEqual(v.state.rules.filter(r => r.level !== 'ok').map(r => r.title), [],
    'das Beispiel verletzt keine Regel');

  /* Ein Punkt hängt sich an — und das Netz wächst mit */
  const before = Object.keys(v.state.graph.nodes).length;
  const tail = v.state.graph.nodes[v.state.graph.rootId].children[0];
  v.editor.select(tail);
  /* Was gewählt ist, steht im Menü im Viewport — nicht in der Seitenleiste. */
  assert.match(d6.getElementById('pt-sel').innerHTML, /Punkt/);
  assert.equal(d6.getElementById('sel-title'), null, 'die Seitenleiste hat keinen Auswahlkopf mehr');
  d6.getElementById('add-point').dispatch('click');
  assert.equal(Object.keys(v.state.graph.nodes).length, before + 1);
  assert.equal(v.state.net.edges.length, before, 'eine Kante mehr');

  /* … und verschwindet wieder */
  d6.getElementById('del-node').dispatch('click');
  assert.equal(Object.keys(v.state.graph.nodes).length, before);

  /* Der Pressrest bringt seine eigenen Maße mit — und keine Arbeitsebene:
     seine Ebene IST die Ausstoßrichtung. */
  v.editor.select(v.state.graph.rootId);
  assert.ok(!d6.getElementById('bisc-block').classList.contains('hidden'));
  assert.ok(d6.getElementById('plane-block').classList.contains('hidden'));
  assert.match(d6.getElementById('sel-facts').innerHTML, /Pressrest-Volumen/);
  const dInput = d6.getElementById('bisc-d');
  assert.equal(dInput.value, String(v.state.graph.biscuit.d), 'der Wert steht im Feld');
  dInput.value = '120';
  dInput.dispatch('change');
  assert.equal(v.state.graph.biscuit.d, 120);

  /* Der Pressrest zieht beim Verschieben das ganze System mit. */
  const vorher = Object.values(v.state.graph.nodes).map(n => n.pos.slice());
  const zx = d6.getElementById('sel-x');
  zx.value = '40';
  zx.dispatch('change');
  const nachher = Object.values(v.state.graph.nodes).map(n => n.pos.slice());
  assert.equal(v.state.graph.biscuit.pos[0], 40);
  nachher.forEach((p, i) => {
    assert.ok(Math.abs(p[0] - vorher[i][0] - 40) < 1e-9, 'alle Punkte um 40 mm versetzt');
    assert.deepEqual([p[1], p[2]], [vorher[i][1], vorher[i][2]]);
  });
  zx.value = '0';
  zx.dispatch('change');

  /* Ein Anschnitt zeigt seine eigenen Felder */
  const gate = Object.values(v.state.graph.nodes).find(n => n.type === 'gate');
  v.editor.select(gate.id);
  assert.ok(!d6.getElementById('gate-block').classList.contains('hidden'));
  assert.ok(d6.getElementById('branch-block').classList.contains('hidden'));
  assert.ok(d6.getElementById('bisc-block').classList.contains('hidden'));
  assert.ok(!d6.getElementById('plane-block').classList.contains('hidden'));
  assert.equal(d6.getElementById('sel-gw').disabled, true, 'automatische Breite ist gesperrt');
  /* Der Pfeil am Anschnitt ohne Bauteil: kein Zielmodus, aber ein Hinweis. */
  assert.equal(d6.getElementById('gate-aim'), null, 'kein Knopf mehr — der Pfeil ist der Griff');
  v.startAim(gate.id);
  assert.ok(!v.editor.aiming, 'ohne Bauteil gibt es nichts zu treffen');
  assert.ok(!d6.getElementById('aim-banner').classList.contains('hidden'));
  assert.match(d6.getElementById('aim-text').textContent, /Referenzbauteil laden/);

  /* Die Anschnitthöhe unter „Kanalform" gilt für jeden Anschnitt ohne
     eigene; ein eigener Wert im Auswahlfeld löst ihn davon. */
  const gh = d6.getElementById('gate-h');
  assert.equal(gh.value, '2,2', 'die Vorgabe steht im Feld');
  gh.value = '1,6';
  gh.dispatch('change');
  assert.equal(v.state.graph.gateH, 1.6);
  assert.equal(gate.gate.h, 1.6, 'der gewählte Anschnitt folgt der Vorgabe');
  assert.equal(d6.getElementById('sel-gh').value, '1,6');
  const own = d6.getElementById('sel-gh');
  own.value = '3';
  own.dispatch('change');
  assert.equal(gate.gate.h, 3);
  assert.equal(gate.gate.hAuto, false, 'eigener Wert: aus der Vorgabe heraus');
  gh.value = '2';
  gh.dispatch('change');
  assert.equal(gate.gate.h, 3, 'die Vorgabe lässt ihn in Ruhe');
  own.value = '2';
  own.dispatch('change');
  assert.equal(gate.gate.hAuto, true, 'genau die Vorgabe: wieder dabei');

  /* Regler wirken sofort */
  const draft = d6.getElementById('draft');
  const areaBefore = v.state.net.edges[0].sections[0].area;
  draft.value = '12';
  draft.dispatch('input');
  assert.equal(v.state.graph.draft, 12);
  assert.ok(v.state.net.edges[0].sections[0].area < areaBefore, 'mehr Schräge, weniger Fläche');

  /* Ein anderes Beispiel */
  const sel6 = d6.getElementById('demo-select');
  sel6.value = 'vier';
  sel6.dispatch('change');
  assert.equal(Object.values(v.state.graph.nodes).filter(n => n.type === 'gate').length, 4);

  /* Flussschema */
  assert.equal(d6.getElementById('chart-on'), null, 'kein Häkchen in der Seitenleiste mehr');
  d6.getElementById('chart-btn').dispatch('click');
  assert.ok(d6.getElementById('chart-panel').classList.contains('on'), 'der Knopf öffnet das Schema');
  assert.ok(v.state.chartOpen);
  assert.match(d6.getElementById('chart-body').innerHTML, /^<svg /);
  assert.match(d6.getElementById('chart-body').innerHTML, /Ankunft [\d,]+ ms/, 'die Ankunft der Schmelze steht am Anschnitt');
  assert.match(d6.getElementById('chart-body').innerHTML, /Soll \d+ % · Ist \d+ %/, 'Soll und Ist groß');
  assert.match(d6.getElementById('chart-body').innerHTML, /<path d="M[^"]* C[^"]*"/, 'die Bänder sind Bögen, keine Geraden');
  assert.match(d6.getElementById('chart-facts').innerHTML, /Ankunft/);
  d6.getElementById('chart-close').dispatch('click');
  assert.ok(!d6.getElementById('chart-panel').classList.contains('on'), 'das × schließt es');

  /* Referenzbauteil: sein Volumen wird als Gussvolumen übernommen — die
     Zahl, aus der Volumenstrom, Anschnittflächen und damit jeder
     Querschnitt folgen. */
  const { writeSTL: writeSTL6 } = await import('../../../web/tools/3d-studio/js/part/stlio.js');
  const S6 = await import('../../../web/tools/3d-studio/js/solids.js');
  const wuerfel = writeSTL6(S6.box(100, 100, 100), 'test');     // 1000 cm³
  const volVorher = v.state.proc.volume;
  const refIn = d6.getElementById('ref-input');
  refIn.files = [{ name: 'bauteil.stl', arrayBuffer: () => Promise.resolve(wuerfel), byteLength: wuerfel.byteLength }];
  refIn.dispatch('change');
  await new Promise(r => setTimeout(r, 80));
  assert.notEqual(v.state.proc.volume, volVorher);
  assert.ok(Math.abs(v.state.proc.volume - 1000) < 0.2, 'Volumen ' + v.state.proc.volume + ' cm³');
  assert.equal(d6.getElementById('vol').value, '1000', 'ohne Tausenderpunkt — sonst liest es sich falsch zurück');
  assert.match(d6.getElementById('ref-note').textContent, /bauteil\.stl · 1\.000 cm³/);
  assert.ok(!d6.getElementById('ref-file').classList.contains('hidden'));
  assert.ok(v.refMesh.visible);
  /* Und die Kette hängt daran: mehr Volumen, mehr Strom. */
  assert.ok(v.state.flow.Q > 0);

  /* Ein Griff wird mit dem ZEIGER angeklickt — durch dieselben Ereignisse
     wie in der Seite. Hier hängt die ganze Bedienung dran; wer nur
     editor.select() prüft, merkt nicht, wenn der Strahl auf die Griffe
     kaputt ist. */
  {
    const T3 = await import('three');
    const rootPos = v.state.graph.nodes[v.state.graph.rootId].pos;
    v.view.camera.position.set(0, 400, 0);
    v.view.camera.up.set(0, 0, -1);
    v.view.camera.lookAt(0, 0, 0);
    v.view.camera.updateMatrixWorld(true);
    const pr = new T3.Vector3(...rootPos).project(v.view.camera);
    const cv = v.view.renderer.domElement;
    const at = { x: (pr.x + 1) / 2 * 800, y: (1 - pr.y) / 2 * 600 };
    const ev = { button: 0, clientX: at.x, clientY: at.y, stopPropagation() {}, preventDefault() {} };
    v.editor.select(null);
    v.view.scene.updateMatrixWorld(true);             // sonst tut das der Renderer vor jedem Bild
    cv.dispatch('pointerdown', ev);
    cv.dispatch('pointerup', ev);
    assert.equal(v.editor.selected, v.state.graph.rootId, 'der Klick auf den Griff wählt den Pressrest');
    assert.match(d6.getElementById('pt-sel').innerHTML, /Pressrest/);
  }

  /* Mündung ans Bauteil: eine Stelle am Referenzteil anklicken setzt den
     Anschnitt dorthin UND hält seine Richtung fest. Der Klick läuft hier
     durch dieselbe Kette wie in der Seite — Knopf, Zielmodus, Strahl auf
     das Netz —, nur wird die Kamera von Hand gestellt, damit der Strahl
     durch die Bildmitte die gewünschte Fläche des Würfels trifft. */
  const g2 = Object.values(v.state.graph.nodes).find(n => n.type === 'gate');
  v.editor.select(g2.id);
  const banner = d6.getElementById('aim-banner');
  assert.ok(banner.classList.contains('hidden'), 'ohne Zielmodus kein Hinweis im Viewport');

  /* Der Pfeil am Anschnitt ist der Griff für die Bindung: ihn anklicken
     schaltet den Zielmodus scharf. Sein Ort kommt aus dem Editor. */
  const T3b = await import('three');
  const tip = v.editor.arrowTip(g2.id);
  assert.ok(tip, 'der Anschnitt trägt einen Pfeil');
  v.view.camera.position.set(0, 400, 0);
  v.view.camera.up.set(0, 0, -1);
  v.view.camera.lookAt(0, 0, 0);
  v.view.camera.updateMatrixWorld(true);
  v.view.scene.updateMatrixWorld(true);
  const tipPx = new T3b.Vector3(...tip).project(v.view.camera);
  const cv2 = v.view.renderer.domElement;
  const evTip = { button: 0, clientX: (tipPx.x + 1) / 2 * 800, clientY: (1 - tipPx.y) / 2 * 600, stopPropagation() {}, preventDefault() {} };
  cv2.dispatch('pointerdown', evTip);
  cv2.dispatch('pointerup', evTip);
  assert.equal(v.editor.selected, g2.id, 'der Pfeil wählt seinen Anschnitt');
  assert.ok(!v.editor.dragging, 'und zieht ihn nicht');
  assert.ok(v.editor.aiming, 'der Zielmodus ist scharf');
  assert.ok(!banner.classList.contains('hidden'), 'der Viewport sagt, was zu tun ist');
  assert.match(d6.getElementById('aim-text').textContent, /Esc/, 'und wie man ihn wieder los wird');

  /* Ein zweiter Klick auf den Pfeil schaltet NICHT ab. */
  v.editor.aimFor(g2.id);
  assert.ok(v.editor.aiming, 'ein zweiter Klick lässt den Modus scharf');

  const canvas = v.view.renderer.domElement;
  const zeiger = (t, x, y) => canvas.dispatch(t,
    { button: 0, clientX: x, clientY: y, stopPropagation() {}, preventDefault() {} });
  const klick = (x, y) => { zeiger('pointerdown', x, y); zeiger('pointerup', x, y); };

  /* Daneben: kein Treffer, kein Abbruch — aber eine Antwort. */
  klick(2, 2);
  assert.ok(v.editor.aiming, 'ein Fehlklick lässt den Modus stehen');
  assert.ok(banner.classList.contains('miss'), 'und wird als Fehlschuss benannt');
  assert.match(d6.getElementById('aim-text').textContent, /Daneben/);

  /* Auf dem Bauteil GEZOGEN heißt gedreht, nicht gebunden. */
  zeiger('pointerdown', 400, 300);
  zeiger('pointerup', 460, 340);
  assert.ok(v.editor.aiming, 'ein Zug über das Bauteil bindet nichts');

  /* Die Vorschau: unter dem Zeiger steht die Marke auf dem Bauteil. */
  zeiger('pointermove', 400, 300);
  await new Promise(r => setTimeout(r, 30));
  const marke = v.editor.aimMark;
  assert.ok(marke && Math.abs(marke[1] - 50) < 1e-6, 'die Marke sitzt auf der Deckfläche: ' + marke);

  /* Erst die Wand: von +X her auf die Seitenfläche, 40 mm ÜBER der
     Trennebene angeklickt. Der Anschnitt kommt GENAU dorthin — auch in
     der Höhe; die Kante davor wird zur Rampe. Nur seine Richtung bleibt
     waagerecht: die Schräge der Wand kippt ihn nicht. */
  v.view.camera.position.set(400, 40, 0);
  v.view.camera.up.set(0, 1, 0);
  v.view.camera.lookAt(0, 40, 0);
  v.view.camera.updateMatrixWorld(true);
  klick(400, 300);
  assert.ok(!v.editor.aiming, 'der Treffer schaltet ihn ab');
  assert.ok(banner.classList.contains('hidden'), 'und der Hinweis ist weg');
  let gs = v.state.graph.nodes[g2.id];
  assert.ok(Math.abs(gs.pos[0] - 50) < 1e-6 && Math.abs(gs.pos[1] - 40) < 1e-6 && Math.abs(gs.pos[2]) < 1e-6,
    'der Anschnitt sitzt am geklickten Punkt, 40 mm über der Trennebene: ' + gs.pos);
  assert.ok(gs.aim[0] < -0.999 && Math.abs(gs.aim[1]) < 1e-9, 'und mündet waagerecht nach innen: ' + gs.aim);
  assert.match(d6.getElementById('sel-facts').innerHTML, /Mündung.*−X · gebunden/, 'die Kennzahlen sagen es');
  assert.match(d6.getElementById('sel-facts').innerHTML, /Ankunft.*ms/, 'und wann die Schmelze da ist');
  assert.match(d6.getElementById('pt-sel').innerHTML, /ans Bauteil gebunden/, 'die Kopfzeile auch');
  assert.ok(!v.state.rules.find(r => /Trennebene/.test(r.title)), 'in der Ebene: keine Beanstandung');
  assert.equal(d6.getElementById('sel-x').value, '50', 'die Lage steht im Feld');
  assert.equal(d6.getElementById('sel-x').disabled, false, 'und bleibt frei — gebunden ist die Richtung, nicht der Punkt');

  /* Dann die Deckfläche von oben: die Normale steht senkrecht zur
     Ebene, da gibt es nichts zu projizieren — der Treffer bleibt roh,
     und die Prüfliste sagt, dass so ein Anschnitt nicht zu bauen ist. */
  v.editor.aimFor(g2.id);
  v.view.camera.position.set(0, 400, 0);
  v.view.camera.up.set(0, 0, -1);
  v.view.camera.lookAt(0, 0, 0);
  v.view.camera.updateMatrixWorld(true);
  klick(400, 300);
  gs = v.state.graph.nodes[g2.id];
  assert.ok(Math.abs(gs.pos[1] - 50) < 1e-6, 'der Anschnitt sitzt auf der Deckfläche: ' + gs.pos[1]);
  assert.ok(Math.hypot(gs.pos[0], gs.pos[2]) < 1e-6, 'mittig getroffen');
  assert.ok(gs.aim[1] < -0.999, 'und mündet nach innen, also −Y: ' + gs.aim);
  assert.match(d6.getElementById('sel-facts').innerHTML, /−Y · gebunden, 90° aus der Ebene/);
  const quer = v.state.rules.find(r => /Mündung aus der Trennebene/.test(r.title));
  assert.ok(quer && quer.level === 'bad', 'die Prüfliste beanstandet es: ' + JSON.stringify(quer));
  assert.match(quer.text, /90°/);

  /* Gebunden ist die RICHTUNG, nicht der Punkt: der Griff lässt sich
     weiter ziehen, die Mündung zeigt danach noch dorthin. */
  const vorZug = v.state.graph.nodes[g2.id].pos.slice();
  v.editor.select(null);
  v.view.scene.updateMatrixWorld(true);
  zeiger('pointerdown', 400, 300);                    // der Anschnitt liegt in der Bildmitte
  assert.equal(v.editor.selected, g2.id, 'anklicken wählt');
  assert.ok(v.editor.dragging, 'und der Zug beginnt');
  zeiger('pointermove', 460, 300);
  await new Promise(r => setTimeout(r, 30));          // der Zug wirkt einmal je Bild
  zeiger('pointerup', 460, 300);
  const nachZug = v.state.graph.nodes[g2.id].pos;
  assert.ok(Math.hypot(nachZug[0] - vorZug[0], nachZug[2] - vorZug[2]) > 5, 'der Anschnitt wandert: ' + vorZug + ' → ' + nachZug);
  assert.ok(v.state.graph.nodes[g2.id].aim && v.state.graph.nodes[g2.id].aim[1] < -0.999, 'die Richtung bleibt gebunden');
  const G6b = await import('../../../web/tools/3d-studio/js/runner/graph.js');
  G6b.aimAt(v.state.graph, g2.id, [0, 50, 0], [0, -1, 0]);   // zurück auf die Deckfläche
  v.rebuild();

  /* Jetzt hält die Richtung: der Punkt davor darf wandern, die letzte
     Tangente des Anschnitts bleibt, wo sie ist. Vorher drehte sie mit. */
  const tangente = () => {
    const e = v.state.net.edges.find(x => x.toId === g2.id);
    return e.sections[e.sections.length - 1].t;
  };
  const t0 = tangente().slice();
  const G6 = await import('../../../web/tools/3d-studio/js/runner/graph.js');
  const vor = v.state.graph.nodes[gs.parent];
  G6.setPos(v.state.graph, vor.id, [vor.pos[0] + 30, vor.pos[1], vor.pos[2] + 25]);
  v.rebuild();
  const t1 = tangente();
  assert.ok(Math.hypot(t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]) < 1e-9,
    'die Mündungsrichtung bleibt: ' + t0 + ' → ' + t1);

  /* Ohne Bindung folgt sie wieder der Sehne. */
  G6.clearAim(v.state.graph, g2.id);
  v.rebuild();
  v.editor.select(g2.id);
  assert.ok(!v.state.graph.nodes[g2.id].aim, 'die Bindung ist weg');
  const t2 = tangente();
  assert.ok(Math.hypot(t2[0] - t0[0], t2[1] - t0[1], t2[2] - t0[2]) > 1e-3,
    'ohne Bindung zeigt sie wieder zum Vorgänger');
  assert.ok(!v.state.rules.find(r => /Trennebene/.test(r.title)), 'und die Beanstandung mit ihr');
  assert.doesNotMatch(d6.getElementById('pt-sel').innerHTML, /gebunden/);
  assert.match(d6.getElementById('sel-facts').innerHTML, /folgt dem Kanal/);

  /* Ein unbrauchbares Netz ändert das Gussvolumen nicht. */
  const flach = writeSTL6(new Float64Array(9), 'leer');
  refIn.files = [{ name: 'flach.stl', arrayBuffer: () => Promise.resolve(flach), byteLength: flach.byteLength }];
  refIn.dispatch('change');
  await new Promise(r => setTimeout(r, 80));
  assert.ok(Math.abs(v.state.proc.volume - 1000) < 0.2, 'das gute Volumen bleibt stehen');
  assert.match(d6.getElementById('ref-note').textContent, /unbrauchbar/);

  /* Das × nimmt es wieder weg. */
  d6.getElementById('ref-clear').dispatch('click');
  assert.ok(d6.getElementById('ref-file').classList.contains('hidden'));
  assert.ok(!v.refMesh.visible);

  /* Achsenkreuz: es hängt an scene.onBeforeRender, das ohne WebGL
     niemand ruft — hier von Hand. Nach dem Schwenk auf X zeigt die
     X-Achse in die Kamera und fällt auf den Mittelpunkt zusammen. */
  const gizmo = d6.querySelector('.axis-gizmo');
  assert.ok(gizmo, 'Achsenkreuz im Viewport');
  /* Das winzige DOM übernimmt keinen Textinhalt — die Beschriftung wird
     deshalb an der Markup-Zeichenkette geprüft. */
  assert.equal(gizmo.querySelectorAll('text').length, 3);
  for (const t of ['X', 'Y', 'Z']) assert.ok(gizmo.innerHTML.includes('>' + t + '</text>'), t);
  bar.querySelectorAll('[data-view]').find(b => b.dataset.view === 'x').dispatch('click');
  v.view.scene.onBeforeRender(null, null, v.view.camera);
  const ax = gizmo.querySelectorAll('line');
  assert.equal(ax.length, 3);
  assert.ok(Math.hypot(+ax[0].getAttribute('x2') - 37, +ax[0].getAttribute('y2') - 37) < 0.5,
    'X zeigt in die Kamera: ' + ax[0].getAttribute('x2') + '/' + ax[0].getAttribute('y2'));
  assert.ok(+ax[1].getAttribute('y2') < 20, 'Y zeigt nach oben');
  assert.ok(+ax[2].getAttribute('x2') < 20, 'Z zeigt nach links');

  /* Griffe werden doppelt gezeichnet, damit sie hinter dem Körper nicht
     verschwinden: einmal mit Tiefenprüfung, einmal blass ohne. */
  const kugeln = v.editor.group.children.filter(
    c => c.type === 'Mesh' && c.geometry.type === 'SphereGeometry');
  const knoten = Object.keys(v.state.graph.nodes).length;
  assert.equal(kugeln.length, knoten * 2, 'je Punkt zwei Kugeln');
  assert.equal(kugeln.filter(m => m.material.depthTest === false).length, knoten);

  /* Import und Export: der Graph als JSON, die Geometrie als STL. */
  d6.getElementById('json-save').dispatch('click');
  d6.getElementById('stl-save').dispatch('click');
  assert.equal(d6.getElementById('run-merge'), null, 'aber kein Verschmelzen mehr');
});
