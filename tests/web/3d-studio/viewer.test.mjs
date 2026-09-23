/* Verdrahtungstest beider Viewer.

   Die Viewer laufen im Browser; Node hat weder DOM noch WebGL. Beides
   wird hier ersetzt (tests/web/3d-studio/stubs/): ein winziges DOM, das aus der
   ECHTEN HTML-Seite gebaut wird, und das echte Three.js mit einem
   Renderer-Platzhalter. Damit lässt sich prüfen, was ohne Browser sonst
   niemand prüft: dass jeder Regler, jeder Schalter und jede Legende
   wirklich am richtigen Element hängt und die Rückrufe durchlaufen.

   Aufruf:  node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/viewer.test.mjs
   (der Sammellauf in package.json / README macht das automatisch) */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildDocument, installGlobals } from './stubs/dom.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'tools', '3d-studio');
const read = f => readFileSync(resolve(ROOT, f), 'utf8');

/* Die Werkzeuge im gemeinsamen Rahmen (js/studio/) — Analysen, Designer und
   Simulationen — haben ihre Fälle in tools/<werkzeug>.test.mjs. Hier bleiben
   der Formaufbau und die Werkbank, die noch nicht im Rahmen laufen. */

/* ── Formaufbau-Viewer ───────────────────────────────────────── */

/* Ein Ersatzmodell mit den Registry-Namen — wie die ausgelieferte GLB
   ohne Metadaten; der Viewer sortiert es in die Standardgruppen ein. */
async function legacyDie() {
  const T = await import('three');
  const { COMPONENTS } = await import('../../../web/tools/3d-studio/js/registry.js');
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
  return { root, fixedRoot, movingRoot, COMPONENTS };
}

/* Ein Ersatzmodell nach Maß: je Teil ein Würfel { id, mat, size, at, side }. */
async function boxDie(parts) {
  const T = await import('three');
  const root = new T.Group(); root.name = 'die';
  const fixedRoot = new T.Group(); fixedRoot.name = 'fixedRoot';
  const movingRoot = new T.Group(); movingRoot.name = 'movingRoot';
  root.add(fixedRoot, movingRoot);
  for (const p of parts) {
    const g = new T.Group(); g.name = p.id;
    const mat = new T.MeshStandardMaterial({ color: 0x888888 });
    mat.name = p.mat;
    const mesh = new T.Mesh(new T.BoxGeometry(p.size, p.size, p.size), mat);
    if (p.at) mesh.position.set(...p.at);
    g.add(mesh);
    (p.side === 'fix' ? fixedRoot : movingRoot).add(g);
  }
  return { root, fixedRoot, movingRoot };
}

/* Die Seite mit einem Modell öffnen; jede Variante lädt die Module neu. */
async function openForm(variante, root, prepare = () => {}) {
  globalThis.__TEST_GLTF = root;
  const { doc: d } = buildDocument(read('form.html'));
  prepare(d);
  installGlobals(d);
  const mod = await import('../../../web/tools/3d-studio/js/die.js?variante=' + variante);
  await new Promise(r => setTimeout(r, 30));
  return { d, v: mod.__viewer };
}
const tick = () => new Promise(r => setTimeout(r, 5));

const readGlbJson = buf => {
  const dv = new DataView(buf);
  assert.equal(dv.getUint32(0, true), 0x46546c67, 'GLB-Kennung');
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len)));
};

test('Formaufbau-Viewer verdrahtet Gruppen, Regler und Schnitt', async () => {
  const { root, movingRoot, COMPONENTS } = await legacyDie();
  globalThis.__TEST_GLTF = root;
  const { DEFAULT_GROUPS } = await import('../../../web/tools/3d-studio/js/assembly.js');

  const { doc: d2 } = buildDocument(read('form.html'));
  installGlobals(d2);
  const mod = await import('../../../web/tools/3d-studio/js/die.js');
  await new Promise(r => setTimeout(r, 30));
  const v = mod.__viewer;
  assert.ok(v.state.ready, 'das Modell steht');

  const list = d2.getElementById('components');
  const rows = list.querySelectorAll('[data-comp]');
  assert.equal(rows.length, COMPONENTS.length, 'eine Zeile je Teil');

  /* Standardgruppen, auch die leere für Schieber; je eine Glühbirne. */
  const heads = list.querySelectorAll('.group-head');
  assert.equal(heads.length, DEFAULT_GROUPS.length, 'alle Standardgruppen, auch leere');
  const bulbs = list.querySelectorAll('.bulb-btn');
  assert.equal(bulbs.length, DEFAULT_GROUPS.length);
  assert.ok(bulbs.every(b => b.classList.contains('on')), 'anfangs leuchten alle');
  assert.equal(list.querySelectorAll('.comp-empty').length, 1, 'die leere Schiebergruppe sagt es');
  assert.equal(d2.getElementById('stl-target').value, 'fix', 'Zielgruppe für STL steht auf der ersten Gruppe');

  /* Temperierung fest: eigene Gruppe, schaltet nur die Kreise. */
  const coolIds = COMPONENTS.filter(c => c.sub === 'Temperierung' && c.side === 'fix').map(c => c.id);
  assert.equal(coolIds.length, 2, 'zwei Kreise je Hälfte');
  const coolHead = heads.find(h => h.getAttribute('data-group') === 'coolFix');
  const coolBulb = coolHead.querySelector('.bulb-btn');
  coolBulb.dispatch('click');
  for (const id of coolIds) assert.equal(root.getObjectByName(id).visible, false, id + ' aus');
  assert.equal(root.getObjectByName('fixHalf').visible, true, 'der Rest bleibt sichtbar');
  assert.ok(!coolBulb.classList.contains('on'), 'Birne aus');
  coolBulb.dispatch('click');
  for (const id of coolIds) assert.equal(root.getObjectByName(id).visible, true);
  assert.ok(coolBulb.classList.contains('on'), 'Birne wieder an');

  /* Gruppenbirne der festen Seite: nur deren Teile. */
  const fixBulb = heads.find(h => h.getAttribute('data-group') === 'fix').querySelector('.bulb-btn');
  fixBulb.dispatch('click');
  for (const c of COMPONENTS.filter(c => c.side === 'fix' && !c.sub)) {
    assert.equal(root.getObjectByName(c.id).visible, false, c.id + ' aus');
  }
  assert.equal(root.getObjectByName('coolFixL').visible, true, 'die Temperierung ist eine eigene Gruppe');
  fixBulb.dispatch('click');
  assert.ok(fixBulb.classList.contains('on'));
  assert.equal(root.getObjectByName('movHalf').visible, true, 'die andere Seite ist unberührt');

  const first = rows[0];
  const obj = root.getObjectByName(first.getAttribute('data-comp'));
  assert.ok(obj.visible, 'anfangs sichtbar');
  first.checked = false;
  first.dispatch('change');
  assert.equal(obj.visible, false, 'Schalter blendet das Teil aus');
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
  root.traverse(o => { if (o.isMesh && o.material.name === 'steel' && !o.userData.stencilTwin) steel.push(o.material); });
  assert.ok(steel.length > 0 && Math.abs(steel[0].opacity - 0.6) < 1e-9, 'Deckkraft Stahl wirkt');
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

test('Formaufbau: STL laden, umbenennen, verschieben, entfernen, Gruppen anlegen', async () => {
  const { root, fixedRoot, movingRoot, COMPONENTS } = await legacyDie();
  globalThis.__TEST_GLTF = root;
  const { doc: d } = buildDocument(read('form.html'));
  installGlobals(d);
  const mod = await import('../../../web/tools/3d-studio/js/die.js?variante=bearbeiten');
  await new Promise(r => setTimeout(r, 30));
  const v = mod.__viewer;
  const asm = v.asm;
  const list = d.getElementById('components');
  const rowOf = id => list.querySelectorAll('[data-item]').find(r => r.getAttribute('data-item') === id);

  /* Zwei STL in die Schiebergruppe: neue Zeilen, Knoten unter movingRoot, Stahl. */
  const { writeSTL } = await import('../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../web/tools/3d-studio/js/solids.js');
  const file = (name, tris) => { const b = writeSTL(tris, name); return { name, arrayBuffer: () => Promise.resolve(b), byteLength: b.byteLength }; };
  const input = d.getElementById('stl-input');
  d.getElementById('stl-target').value = 'slider';
  input.files = [file('Schieber links.stl', S.box(40, 30, 20)), file('Schieber rechts.stl', S.box(40, 30, 20))];
  input.dispatch('change');
  await v.pending;
  assert.equal(asm.items.length, COMPONENTS.length + 2, 'zwei Teile mehr');
  const links = asm.items.find(i => i.label === 'Schieber links');
  assert.ok(links, 'die Datei heißt ohne Endung');
  assert.equal(links.group, 'slider');
  assert.equal(links.object.parent, movingRoot, 'Schieber hängen an der beweglichen Seite');
  assert.equal(links.object.children[0].material.name, 'steel', 'Werkstoffklasse der Gruppe');
  assert.ok(links.object.children[0].geometry.getAttribute('normal'), 'mit Normalen');
  assert.ok(rowOf(links.id), 'eine Zeile dafür');
  assert.equal(list.querySelectorAll('.comp-empty').length, 0, 'die Schiebergruppe ist nicht mehr leer');

  /* Öffnen: die Schieber fahren zusätzlich in +x heraus. */
  const open = d.getElementById('open');
  open.value = '100'; open.dispatch('input');
  assert.ok(links.object.position.x > 100, 'Schieber fährt in der Trennebene: x = ' + links.object.position.x);
  assert.equal(root.getObjectByName('movHalf').position.x, 0, 'die Hälfte selbst nicht');
  open.value = '0'; open.dispatch('input');
  assert.equal(links.object.position.x, 0);

  /* Umbenennen an Ort und Stelle. */
  rowOf(links.id).querySelector('[data-act="rename"]').dispatch('click');
  const edit = rowOf(links.id).querySelector('.inline-edit');
  assert.ok(edit, 'ein Eingabefeld erscheint');
  edit.value = 'Schieber −X';
  edit.dispatch('change');
  assert.equal(links.label, 'Schieber −X');
  assert.equal(rowOf(links.id).querySelector('.name').textContent, 'Schieber −X');
  assert.equal(asm.labelOf(links.id), 'Schieber −X', 'der Hover kennt den neuen Namen');

  /* Verschieben ins Gussteil: andere Werkstoffklasse; in die feste Seite: anderer Elternknoten. */
  let move = rowOf(links.id).querySelector('[data-act="move"]');
  move.value = 'cast'; move.dispatch('change');
  assert.equal(links.group, 'cast');
  assert.equal(links.object.children[0].material.name, 'castPart', 'Klasse folgt der Gruppe');
  move = rowOf(links.id).querySelector('[data-act="move"]');
  move.value = 'fix'; move.dispatch('change');
  assert.equal(links.object.parent, fixedRoot, 'jetzt an der festen Seite');
  assert.equal(links.object.children[0].material.name, 'steel');

  /* Entfernen. */
  const rechts = asm.items.find(i => i.label === 'Schieber rechts');
  rowOf(rechts.id).querySelector('[data-act="remove"]').dispatch('click');
  assert.ok(!asm.items.some(i => i.id === rechts.id), 'weg aus der Baugruppe');
  assert.equal(rechts.object.parent, null, 'weg aus der Szene');
  assert.ok(!rowOf(rechts.id), 'weg aus der Leiste');

  /* Gruppe anlegen: Schieber nach −Y mit 80 mm Weg. */
  d.getElementById('group-new').dispatch('click');
  assert.ok(!d.getElementById('group-form').classList.contains('hidden'));
  d.getElementById('group-title').value = 'Schieber −Y';
  d.getElementById('group-side').value = 'mov';
  d.getElementById('group-mat').value = 'steel';
  d.getElementById('group-slide').value = '-y';
  d.getElementById('group-travel').value = '80';
  d.getElementById('group-add').dispatch('click');
  const g = asm.groups.find(x => x.title === 'Schieber −Y');
  assert.ok(g, 'die Gruppe ist da');
  assert.deepEqual(g.slide, { axis: 'y', sign: -1, travel: 80 });
  assert.ok(d.getElementById('group-form').classList.contains('hidden'), 'das Formular schließt sich');
  const heads = () => list.querySelectorAll('.group-head');
  assert.ok(heads().some(h => h.getAttribute('data-group') === g.key), 'mit Kopf in der Leiste');
  assert.ok(d.getElementById('stl-target').innerHTML.includes(g.key), 'und als Ziel für STL');

  /* Ohne Namen keine Gruppe. */
  d.getElementById('group-new').dispatch('click');
  d.getElementById('group-title').value = '  ';
  d.getElementById('group-add').dispatch('click');
  assert.match(d.getElementById('group-warn').textContent, /Namen/, 'der Fehler steht im Formular, wo man gerade ist');
  assert.equal(d.getElementById('file-warn').textContent, '', 'nicht unten bei den Dateien');
  d.getElementById('group-cancel').dispatch('click');

  /* Gruppe umbenennen, leere Gruppe entfernen, volle nicht. */
  const head = heads().find(h => h.getAttribute('data-group') === g.key);
  head.querySelector('[data-act="rename-group"]').dispatch('click');
  const ge = head.querySelector('.inline-edit');
  ge.value = 'Schieber unten'; ge.dispatch('change');
  assert.equal(g.title, 'Schieber unten');
  assert.equal(heads().find(h => h.getAttribute('data-group') === 'fix').querySelector('[data-act="remove-group"]').disabled, true,
    'eine volle Gruppe lässt sich nicht entfernen');
  heads().find(h => h.getAttribute('data-group') === g.key).querySelector('[data-act="remove-group"]').dispatch('click');
  assert.ok(!asm.groups.some(x => x.key === g.key), 'die leere Gruppe ist weg');
});

test('Formaufbau: eine Gruppe zur Zeit aufgeklappt — der Kopf schaltet, die Zeilen der anderen bleiben da, eine Hervorhebung zieht ihre Gruppe auf', async () => {
  const { root } = await legacyDie();
  globalThis.__TEST_GLTF = root;
  const { doc: d } = buildDocument(read('form.html'));
  installGlobals(d);
  const mod = await import('../../../web/tools/3d-studio/js/die.js?variante=klappen');
  await new Promise(r => setTimeout(r, 30));
  const v = mod.__viewer;
  const asm = v.asm;
  const list = d.getElementById('components');
  const headOf = key => list.querySelectorAll('.group-head').find(h => h.getAttribute('data-group') === key);
  const rowOf = id => list.querySelectorAll('[data-item]').find(r => r.getAttribute('data-item') === id);
  const openKeys = () => list.querySelectorAll('.group-body').filter(b => !b.classList.contains('folded')).map(b => b.getAttribute('data-body'));
  const first = asm.groups.find(g => asm.items.some(i => i.group === g.key)).key;
  assert.deepEqual(openKeys(), [first], 'anfangs ist die erste Gruppe mit Teilen auf, alle anderen zu');
  assert.equal(list.querySelectorAll('.group-body').length, asm.groups.length, 'je Gruppe ein Zeilenblock');
  assert.equal(list.querySelectorAll('[data-comp]').length, asm.items.length, 'die Zeilen der zugeklappten Gruppen sind da, nur nicht zu sehen');
  assert.ok(headOf('coolFix').classList.contains('folded') && !headOf(first).classList.contains('folded'), 'der Kopf zeigt den Zustand');
  assert.equal(headOf('coolFix').querySelector('[data-act="fold"]').getAttribute('aria-expanded'), 'false');
  assert.match(headOf('coolFix').querySelector('.count').textContent, /^2 Teile$/, 'der Kopf zählt die Teile');
  const emptyKey = asm.groups.find(g => !asm.items.some(i => i.group === g.key)).key;
  assert.equal(headOf(emptyKey).querySelector('.count').textContent, 'leer', 'die leere Gruppe sagt es');

  /* Der Pfeil klappt auf und die vorige zu; ein zweiter Tipp klappt zu. */
  headOf('coolFix').querySelector('[data-act="fold"]').dispatch('click');
  assert.deepEqual(openKeys(), ['coolFix'], 'ein Tipp klappt die Gruppe auf und die vorige zu');
  assert.equal(headOf('coolFix').querySelector('[data-act="fold"]').getAttribute('aria-expanded'), 'true');
  headOf('coolFix').querySelector('[data-act="fold"]').dispatch('click');
  assert.deepEqual(openKeys(), [], 'ein zweiter Tipp klappt sie zu — alles kompakt');

  /* Die freie Fläche des Kopfes und die Zahl tun es auch — nicht aber
     Glühbirne, Name und „⋯", die ihr Eigenes tun. */
  headOf('mov').dispatch('click');
  assert.deepEqual(openKeys(), ['mov']);
  headOf('coolMov').querySelector('.count').dispatch('click');
  assert.deepEqual(openKeys(), ['coolMov']);
  headOf('coolMov').querySelector('.bulb-btn').dispatch('click');
  assert.deepEqual(openKeys(), ['coolMov'], 'die Glühbirne schaltet die Sichtbarkeit, nicht die Klappe');
  assert.match(headOf('coolMov').querySelector('.count').textContent, /2 Teile · 2 aus/, 'der Kopf sagt, wie viele aus sind');
  headOf('coolMov').querySelector('.bulb-btn').dispatch('click');
  assert.equal(headOf('coolMov').querySelector('.count').textContent, '2 Teile');
  headOf('coolMov').querySelector('[data-act="hl-group"]').dispatch('click');
  assert.deepEqual(openKeys(), ['coolMov'], 'der Name hebt hervor, klappt nicht');
  assert.equal(v.ui.highlight.size, 2);
  headOf('coolMov').querySelector('[data-act="group-menu"]').dispatch('click');
  assert.deepEqual(openKeys(), ['coolMov'], '„⋯" öffnet das Menü, klappt nicht');
  assert.ok(!headOf('coolMov').querySelector('.row-menu').classList.contains('hidden'));
  d.getElementById('hl-clear').dispatch('click');

  /* Eine neue Hervorhebung in einer zugeklappten Gruppe zieht sie auf;
     wer sie dann zuklappt, bekommt sie nicht wieder aufgedrängt. */
  assert.deepEqual(openKeys(), ['coolMov']);
  rowOf('coolFixL').querySelector('[data-act="hl"]').dispatch('click');
  assert.ok(v.ui.highlight.has('coolFixL'));
  assert.deepEqual(openKeys(), ['coolFix'], 'die Gruppe des hervorgehobenen Teils geht auf');
  assert.ok(rowOf('coolFixL').classList.contains('hl'));
  headOf('coolFix').querySelector('[data-act="fold"]').dispatch('click');
  assert.deepEqual(openKeys(), [], 'zugeklappt trotz Hervorhebung');
  v.setSteelOpacity(0.5);
  d.getElementById('show-all').dispatch('click');
  assert.deepEqual(openKeys(), [], 'und bleibt zu, solange die Hervorhebung sich nicht ändert');
  d.getElementById('hl-cooling').dispatch('click');
  assert.ok(v.ui.highlight.size === 4 && openKeys().length === 1 && ['coolFix', 'coolMov'].includes(openKeys()[0]), 'Temperierung: eine der Kreisgruppen geht auf');
});

test('Formaufbau: Hervorheben je Teil, Gruppe und Temperierung, Farben, Menüs statt Auswahl je Zeile', async () => {
  const { root } = await legacyDie();
  globalThis.__TEST_GLTF = root;
  const { doc: d } = buildDocument(read('form.html'));
  installGlobals(d);
  const mod = await import('../../../web/tools/3d-studio/js/die.js?variante=hervorheben');
  await new Promise(r => setTimeout(r, 30));
  const v = mod.__viewer;
  const asm = v.asm;
  const list = d.getElementById('components');
  const rowOf = id => list.querySelectorAll('[data-item]').find(r => r.getAttribute('data-item') === id);
  const headOf = key => list.querySelectorAll('.group-head').find(h => h.getAttribute('data-group') === key);
  const matOf = id => root.getObjectByName(id).children[0].material;

  /* Keine Auswahl je Zeile mehr: das Verschieben sitzt mit Umbenennen und
     Entfernen im Menü „⋯", das zu ist, bis man es öffnet. */
  const row = rowOf('coolFixL');
  assert.ok(row.querySelector('[data-act="menu"]'), 'ein Menüknopf je Zeile');
  const menu = row.querySelector('.row-menu');
  assert.ok(menu.classList.contains('hidden'), 'das Menü ist zu');
  row.querySelector('[data-act="menu"]').dispatch('click');
  assert.ok(!menu.classList.contains('hidden'), 'und geht auf');
  assert.ok(menu.querySelector('[data-act="move"]') && menu.querySelector('[data-act="rename"]') && menu.querySelector('[data-act="remove"]'),
    'Verschieben, Umbenennen, Entfernen im Menü');
  row.querySelector('[data-act="menu"]').dispatch('click');
  assert.ok(menu.classList.contains('hidden'), 'ein zweiter Tipp schließt es');
  const head = headOf('coolFix');
  assert.ok(head.querySelector('.row-menu').classList.contains('hidden'), 'auch das Gruppenmenü ist zu');
  assert.ok(head.querySelector('[data-act="group-color"]') && head.querySelector('[data-act="add-stl"]'), 'Farbe und Laden im Gruppenmenü');

  /* Ein Tipp auf den Namen hebt das Teil hervor: es bleibt deckend, alles
     andere wird blass — der Stahl unter seine Deckkraft, das Gussteil
     ebenso. Ein zweiter Tipp nimmt es wieder heraus. */
  row.querySelector('[data-act="hl"]').dispatch('click');
  assert.ok(v.ui.highlight.has('coolFixL') && v.ui.highlight.size === 1, 'ein Teil hervorgehoben');
  assert.ok(rowOf('coolFixL').classList.contains('hl'), 'die Zeile zeigt es');
  assert.ok(!rowOf('coolFixR').classList.contains('hl'));
  assert.equal(matOf('coolFixL').opacity, 1);
  assert.ok(matOf('fixHalf').opacity < 0.1, 'Stahl blass: ' + matOf('fixHalf').opacity);
  assert.ok(matOf('castPart').opacity < 0.2 && matOf('castPart').transparent, 'Gussteil blass: ' + matOf('castPart').opacity);
  assert.equal(d.getElementById('hl-clear').disabled, false);
  assert.match(d.getElementById('hl-clear').textContent, /\(1\)/);
  rowOf('coolFixL').querySelector('[data-act="hl"]').dispatch('click');
  assert.equal(v.ui.highlight.size, 0);
  assert.ok(Math.abs(matOf('fixHalf').opacity - 0.4) < 1e-9, 'Stahl wieder auf dem Regler');
  assert.equal(matOf('castPart').opacity, 1);
  assert.equal(d.getElementById('hl-clear').disabled, true);

  /* Der Gruppenname hebt alle Teile der Gruppe hervor; „Temperierung"
     alle Kreise beider Hälften; „Aufheben" räumt. */
  headOf('coolFix').querySelector('[data-act="hl-group"]').dispatch('click');
  assert.deepEqual([...v.ui.highlight].sort(), ['coolFixL', 'coolFixR']);
  assert.ok(headOf('coolFix').classList.contains('hl'), 'der Kopf zeigt es');
  assert.ok(!headOf('coolMov').classList.contains('hl'));
  d.getElementById('hl-cooling').dispatch('click');
  assert.deepEqual([...v.ui.highlight].sort(), ['coolFixL', 'coolFixR', 'coolMovL', 'coolMovR']);
  assert.ok(d.getElementById('hl-cooling').classList.contains('active'));
  d.getElementById('hl-cooling').dispatch('click');
  assert.equal(v.ui.highlight.size, 0, 'ein zweiter Tipp auf Temperierung nimmt sie heraus');
  d.getElementById('hl-cooling').dispatch('click');
  d.getElementById('hl-clear').dispatch('click');
  assert.equal(v.ui.highlight.size, 0);
  assert.ok(!d.getElementById('hl-cooling').classList.contains('active'));

  /* Tipp im Bild: das getroffene Teil wird hervorgehoben, ein Tipp ins
     Leere hebt auf, Ziehen ist kein Tipp. (Alle Ersatzteile sind Würfel
     im Ursprung — die Kamera schaut dorthin.) */
  const canvas = v.view.renderer.domElement;
  v.view.controls.target.set(0, 0, 0);
  v.view.camera.lookAt(0, 0, 0);
  v.view.camera.updateMatrixWorld(true);
  const tap = (x, y, x2 = x, y2 = y) => {
    canvas.dispatch('pointerdown', { button: 0, clientX: x, clientY: y });
    canvas.dispatch('pointerup', { button: 0, clientX: x2, clientY: y2 });
  };
  tap(400, 300);
  assert.equal(v.ui.highlight.size, 1, 'ein Tipp ins Bild hebt das Teil darunter hervor');
  tap(5, 5);
  assert.equal(v.ui.highlight.size, 0, 'ein Tipp ins Leere hebt auf');
  tap(400, 300, 470, 340);
  assert.equal(v.ui.highlight.size, 0, 'Ziehen hebt nichts hervor');

  /* Farbe: das Farbfeld der Zeile färbt Material und Metadatum — beides
     geht mit in die GLB. Die Gruppenfarbe färbt alle Teile der Gruppe. */
  const colorIn = rowOf('coolFixL').querySelector('[data-act="color"]');
  colorIn.value = '#00ff00'; colorIn.dispatch('input');
  assert.equal(asm.itemOf('coolFixL').color, '#00ff00');
  assert.equal(matOf('coolFixL').color.getHexString(), '00ff00');
  assert.ok(asm.metadata().items.some(i => i.id === 'coolFixL' && i.color === '#00ff00'), 'die Farbe steht in den Metadaten');
  assert.equal(rowOf('coolFixL').querySelector('.dot').style.background, '#00ff00', 'das Farbfeld folgt');
  const gcol = headOf('coolMov').querySelector('[data-act="group-color"]');
  gcol.value = '#123456'; gcol.dispatch('input');
  assert.equal(asm.itemOf('coolMovL').color, '#123456');
  assert.equal(asm.itemOf('coolMovR').color, '#123456');
  assert.equal(asm.groupOf('coolMov').color, '#123456');
  assert.equal(matOf('coolMovR').color.getHexString(), '123456');
  assert.equal(asm.setColor('coolMovR', 'rot'), false, 'nur #rrggbb');

  /* „Alle zeigen": versteckte Teile kommen zurück, die Hervorhebung geht. */
  rowOf('fixHalf').querySelector('[data-comp]').checked = false;
  rowOf('fixHalf').querySelector('[data-comp]').dispatch('change');
  v.toggleHighlight(['castPart']);
  assert.equal(root.getObjectByName('fixHalf').visible, false);
  d.getElementById('show-all').dispatch('click');
  assert.equal(root.getObjectByName('fixHalf').visible, true);
  assert.equal(v.ui.highlight.size, 0);
  assert.ok(list.querySelectorAll('.bulb-btn').every(b => b.classList.contains('on')), 'alle Birnen leuchten wieder');
});

test('Formaufbau: als GLB speichern und daraus wieder laden', async () => {
  const { root, COMPONENTS } = await legacyDie();
  globalThis.__TEST_GLTF = root;
  const { doc: d } = buildDocument(read('form.html'));
  installGlobals(d);
  const mod = await import('../../../web/tools/3d-studio/js/die.js?variante=speichern');
  await new Promise(r => setTimeout(r, 30));
  const v = mod.__viewer;
  const asm = v.asm;

  /* Etwas ändern, damit der Roundtrip etwas zu bewahren hat. */
  assert.ok(asm.renameItem('fixHalf', 'Feste Hälfte 900 × 1000'));
  const g = asm.addGroup({ title: 'Schieber +Y', side: 'mov', mat: 'steel', slide: { axis: 'y', sign: 1, travel: 60 } });
  const S = await import('../../../web/tools/3d-studio/js/solids.js');
  const neu = asm.addItem({ group: g.key, label: 'Kern oben', tris: S.box(20, 20, 20) });
  v.sidebar.render();

  /* Was die Ansicht an den Materialien einstellt, gehört nicht in die Datei:
     Deckkraft Stahl steht auf 40 %, ein Teil ist hervorgehoben (die anderen
     blass, es selbst leuchtet), ein Kreis ist umgefärbt. */
  assert.ok(asm.setColor('coolFixL', '#00ff00'));
  v.toggleHighlight(['castPart']);
  const look = id => root.getObjectByName(id).children[0].material;
  assert.ok(look('fixHalf').opacity < 0.1 && look('castPart').emissive.getHex() !== 0, 'die Ansicht ist blass und leuchtet');

  d.getElementById('glb-name').value = 'meine-form';
  d.getElementById('glb-save').dispatch('click');
  const buf = await v.pending;
  assert.ok(buf && buf.byteLength > 1000, 'eine GLB entsteht: ' + (buf && buf.byteLength));
  assert.match(d.getElementById('file-note').textContent, /meine-form\.glb/);

  const json = readGlbJson(buf);
  for (const m of json.materials) {
    const f = (m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor) || [1, 1, 1, 1];
    assert.equal(f[3], 1, m.name + ': deckend in der Datei, nicht mit der Deckkraft der Ansicht');
    assert.ok(!m.alphaMode || m.alphaMode === 'OPAQUE', m.name + ': alphaMode ' + m.alphaMode);
    assert.ok(!m.emissiveFactor || m.emissiveFactor.every(x => x === 0), m.name + ': leuchtet in der Datei');
  }
  const matOfNode = name => {
    const node = json.nodes.find(n => n.name === name);
    const meshNode = json.nodes[node.children[0]];
    return json.materials[json.meshes[meshNode.mesh].primitives[0].material];
  };
  assert.deepEqual(matOfNode('coolFixL').pbrMetallicRoughness.baseColorFactor, [0, 1, 0, 1], 'die echte Farbe des Teils');
  assert.ok(look('fixHalf').opacity < 0.1 && look('castPart').emissive.getHex() !== 0, 'das Speichern lässt die Ansicht, wie sie ist');
  v.clearHighlight();
  const names = new Set(json.nodes.map(n => n.name));
  for (const n of ['die', 'fixedRoot', 'movingRoot', 'fixHalf', 'castPart', neu.id]) assert.ok(names.has(n), 'Knoten ' + n);
  const die = json.nodes.find(n => n.name === 'die');
  const meta = die.extras && die.extras.formaufbau;
  assert.ok(meta, 'Metadaten am Wurzelknoten');
  assert.equal(meta.format, 'dielogic-formaufbau');
  assert.ok(meta.groups.some(x => x.key === g.key && x.slide && x.slide.travel === 60), 'Gruppe samt Schieberweg');
  assert.ok(meta.items.some(i => i.id === 'fixHalf' && i.label === 'Feste Hälfte 900 × 1000'), 'neuer Name');
  /* Farben: eine Voreinstellung steht als Rolle neben ihrem Wert, eine
     gewählte Farbe nur als Wert. */
  const R = await import('../../../web/tools/3d-studio/js/registry.js');
  const fixMeta = meta.items.find(i => i.id === 'fixHalf'), coolMeta = meta.items.find(i => i.id === 'coolFixL');
  assert.equal(fixMeta.role, R.BY_ID.fixHalf.role, 'die Voreinstellung als Rolle');
  assert.equal(fixMeta.color, R.roleColor(fixMeta.role), 'und ihr Wert daneben');
  assert.equal(coolMeta.color, '#00ff00');
  assert.ok(!('role' in coolMeta), 'eine gewählte Farbe ist ein Wert, keine Rolle');
  assert.ok(meta.items.some(i => i.id === neu.id && i.group === g.key), 'neues Teil in seiner Gruppe');
  const mats = new Set(json.materials.map(m => m.name));
  for (const m of ['steel', 'castPart']) assert.ok(mats.has(m), 'Material ' + m);
  assert.ok(json.nodes.filter(n => n.extras && n.extras.compId).length >= COMPONENTS.length + 1, 'compId in den extras');
  assert.ok(!json.nodes.some(n => n.extras && n.extras.stencilTwin), 'keine Stencil-Zwillinge in der Datei');

  /* Wieder laden: der Exportbaum steht für das, was der GLTFLoader aus der
     Datei machen würde (Namen und userData überleben den Roundtrip). */
  const T = await import('three');
  const wrapper = new T.Group();
  wrapper.add(asm.toExportRoot());
  globalThis.__TEST_GLTF = wrapper;
  const glbIn = d.getElementById('glb-input');
  glbIn.files = [{ name: 'meine-form.glb', arrayBuffer: () => Promise.resolve(buf) }];
  glbIn.dispatch('change');
  await v.pending;
  const asm2 = v.asm;
  assert.notEqual(asm2, asm, 'eine neue Baugruppe');
  assert.equal(asm2.items.length, asm.items.length);
  assert.equal(asm2.labelOf('fixHalf'), 'Feste Hälfte 900 × 1000', 'Name überlebt');
  assert.equal(asm2.itemOf('fixHalf').role, R.BY_ID.fixHalf.role, 'die Rolle überlebt');
  assert.equal(asm2.itemOf('coolFixL').role, null, 'die gewählte Farbe bleibt ein Wert');
  assert.equal(asm2.itemOf('coolFixL').color, '#00ff00');
  const g2 = asm2.groups.find(x => x.key === g.key);
  assert.ok(g2 && g2.slide && g2.slide.travel === 60, 'Gruppe und Schieberweg überleben');
  assert.equal(asm2.itemOf(neu.id).group, g.key);
  assert.match(d.getElementById('file-source').textContent, /meine-form\.glb/);
  const open = d.getElementById('open');
  open.value = '100'; open.dispatch('input');
  assert.ok(asm2.itemOf(neu.id).object.position.y > 50, 'der geladene Schieber fährt in +y');
});

test('Formaufbau: ein Tipp mit Schnittebene trifft, was zu sehen ist, nicht die weggeschnittene Platte davor', async () => {
  /* Eine Platte, in ihr ein Kreis; die Kamera schaut von +x in die Mitte. */
  const { root } = await boxDie([
    { id: 'fixHalf', mat: 'steel', size: 200, side: 'fix' },
    { id: 'coolFixL', mat: 'coolFix', size: 20, side: 'fix' }
  ]);
  const { d, v } = await openForm('schnitt-tipp', root);
  const cam = v.view.camera;
  cam.position.set(2000, 0, 0); cam.up.set(0, 1, 0);
  v.view.controls.target.set(0, 0, 0);
  cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
  const canvas = v.view.renderer.domElement;
  const tap = (x, y) => {
    canvas.dispatch('pointerdown', { button: 0, clientX: x, clientY: y });
    canvas.dispatch('pointerup', { button: 0, clientX: x, clientY: y });
  };
  const hl = () => [...v.ui.highlight];
  const clear = () => d.getElementById('hl-clear').dispatch('click');

  tap(400, 300);
  assert.deepEqual(hl(), ['fixHalf'], 'ohne Schnitt: die Platte vorn');
  clear();

  /* Schnitt in x = 0, weggeschnitten ist die Seite der Kamera: der Tipp
     in die Mitte trifft den Kreis, der dort im Schnitt zu sehen ist. */
  const clipOn = d.getElementById('clip-on');
  clipOn.checked = true; clipOn.dispatch('change');
  tap(400, 300);
  assert.deepEqual(hl(), ['coolFixL'], 'der Kreis im Schnitt, nicht die unsichtbare Platte davor');
  canvas.dispatch('pointermove', { clientX: 400, clientY: 300 });
  await tick();
  assert.equal(d.getElementById('status').textContent, 'Kreis links', 'der Hover sagt dasselbe');
  clear();
  /* 21 Bildpunkte höher liegt der Durchstoßpunkt bei y ≈ 50 mm: im Stahl,
     neben dem Kreis — die Schnittfläche der Platte. */
  tap(400, 279);
  assert.deepEqual(hl(), ['fixHalf'], 'die Schnittfläche der Platte');
  clear();
  tap(5, 5);
  assert.equal(v.ui.highlight.size, 0, 'daneben: nichts');
  /* Seite umkehren: jetzt steht die Kamera auf der stehenden Seite und
     sieht die Platte von außen. */
  const flip = d.getElementById('clip-flip');
  flip.checked = true; flip.dispatch('change');
  tap(400, 300);
  assert.deepEqual(hl(), ['fixHalf'], 'von der stehenden Seite: die Platte');
});

test('Formaufbau: ein hervorgehobenes Teil entfernen hebt die Hervorhebung auf, der Rest wird wieder deckend', async () => {
  const { root } = await legacyDie();
  const { d, v } = await openForm('entfernen', root);
  const list = d.getElementById('components');
  const rowOf = id => list.querySelectorAll('[data-item]').find(r => r.getAttribute('data-item') === id);
  const matOf = id => root.getObjectByName(id).children[0].material;
  rowOf('castPart').querySelector('[data-act="hl"]').dispatch('click');
  assert.ok(matOf('fixHalf').opacity < 0.1 && matOf('castRunner').opacity < 0.2, 'der Rest ist blass');
  rowOf('castPart').querySelector('[data-act="remove"]').dispatch('click');
  assert.ok(!v.asm.itemOf('castPart'), 'das Teil ist weg');
  assert.equal(v.ui.highlight.size, 0, 'und nicht mehr hervorgehoben');
  assert.equal(d.getElementById('hl-clear').textContent, 'Aufheben');
  assert.equal(d.getElementById('hl-clear').disabled, true);
  assert.ok(Math.abs(matOf('fixHalf').opacity - 0.4) < 1e-9, 'der Stahl steht wieder auf dem Regler');
  assert.equal(matOf('castRunner').opacity, 1, 'das Gussteil ist wieder deckend');
});

test('Formaufbau: was der Browser beim Neuladen in die Felder einsetzt, gilt auch, und form.html schaltet das Einsetzen ab', async () => {
  const html = read('form.html');
  for (const id of ['opacity', 'open', 'clip-on', 'clip-pos', 'clip-flip', 'group-title', 'group-travel', 'stl-target', 'glb-name']) {
    assert.match(html, new RegExp('id="' + id + '"[^>]*autocomplete="off"'), id + ' ohne autocomplete="off"');
  }
  assert.doesNotMatch(html, /Transparenz/, 'die Deckkraft heißt Deckkraft');
  const { root, movingRoot } = await legacyDie();
  /* So stünde es nach F5 in Firefox da, hätten die Felder kein autocomplete="off". */
  const { d, v } = await openForm('neu-geladen', root, doc => {
    doc.getElementById('clip-on').checked = true;
    doc.getElementById('clip-pos').value = '30';
    doc.getElementById('open').value = '50';
  });
  assert.ok(v.clip.activePlane(), 'der Haken steht, also wird geschnitten');
  assert.ok(!d.getElementById('clip-detail').classList.contains('disabled'));
  assert.equal(d.getElementById('clip-pos-val').textContent, '30 %');
  assert.ok(movingRoot.position.z > 100, 'der Regler steht auf 50 %, also ist die Form offen: z = ' + movingRoot.position.z);
});

test('Formaufbau: Schieberweg deutsch gelesen, Fehler stehen im Formular', async () => {
  const { root } = await legacyDie();
  const { d, v } = await openForm('schieberweg', root);
  const add = (title, slide, travel) => {
    d.getElementById('group-new').dispatch('click');
    d.getElementById('group-title').value = title;
    d.getElementById('group-slide').value = slide;
    d.getElementById('group-travel').value = travel;
    d.getElementById('group-add').dispatch('click');
    return v.asm.groups.find(g => g.title === title);
  };
  assert.equal(add('Schieber A', '+x', '1.500').slide.travel, 1500, '„1.500" sind 1500 mm, nicht 1,5');
  assert.equal(add('Schieber B', '-y', '1,5').slide.travel, 1.5);
  assert.equal(add('Schieber C', '+x', 'weit'), undefined, 'keine Zahl, keine Gruppe');
  assert.match(d.getElementById('group-warn').textContent, /Schieberweg/);
  assert.ok(!d.getElementById('group-form').classList.contains('hidden'), 'das Formular bleibt offen');
  d.getElementById('group-cancel').dispatch('click');
  assert.equal(d.getElementById('group-warn').textContent, '', 'Abbrechen räumt die Meldung');
  assert.equal(add('Ablage', '', 'weit').slide, null, 'ohne Schieber zählt der Weg nicht');
});

test('Formaufbau: Namen aus der Datei landen als Text in der Seitenleiste, nicht als HTML', async () => {
  const { root } = await legacyDie();
  const evil = '<img src=x onerror="window.__pwned=1">Schieber';
  const key = 'k"><img src=x onerror=alert(1)>';
  root.userData.formaufbau = {
    format: 'dielogic-formaufbau', version: 1,
    groups: [{ key: 'fix', title: 'Feste Seite', side: 'fix', mat: 'steel' },
      { key, title: evil, side: 'seitlich', mat: 'steel', color: 'red; background: url(x)', slide: { axis: 'q', sign: 1, travel: 5 } }],
    items: [{ id: 'fixHalf', label: '<b>Platte</b>', group: 'fix' }, { id: 'movHalf', label: 'Hälfte', group: key, color: 'javascript:1' }]
  };
  const { d, v } = await openForm('fremde-namen', root);
  const list = d.getElementById('components');
  assert.equal(list.querySelectorAll('img').length, 0, 'kein <img> aus dem Gruppennamen in der Leiste');
  assert.equal(d.getElementById('stl-target').querySelectorAll('img').length, 0, 'und keins in „STL laden in"');
  assert.ok(d.getElementById('stl-target').options.some(o => o.textContent === evil), 'der Name steht als Text da');
  assert.equal(v.asm.labelOf('fixHalf'), '<b>Platte</b>');
  const g = v.asm.groupOf(key);
  assert.equal(g.side, 'mov', 'eine unbekannte Seite wird die bewegliche');
  assert.equal(g.slide, null, 'ein Schieber ohne gültige Achse ist keiner');
  /* Keine brauchbare Farbe: die Gruppe bekommt die Voreinstellung ihrer
     Werkstoffklasse (eine Rolle, js/materials.js), das Teil die seiner Gruppe. */
  const M = await import('../../../web/tools/3d-studio/js/materials.js');
  assert.equal(g.color, M.classColor('steel'), 'nur #rrggbb als Farbe');
  assert.equal(g.role, M.CLASS_ROLE.steel, 'als Rolle, die dem Farbschema folgt');
  assert.equal(v.asm.itemOf('movHalf').color, g.color, 'das Teil ohne Farbe trägt die seiner Gruppe');
  assert.equal(v.asm.itemOf('movHalf').role, g.role);
});

test('Formaufbau: eine fremde GLB kommt ins Bild, behält ihre Lagen, und unbekannte Knoten werden Teile', async () => {
  const T = await import('three');
  const { root: demo } = await legacyDie();
  const { d, v } = await openForm('fremd', demo);
  assert.equal(v.view.controls.minDistance, 250, 'die Beispielform behält ihre Startansicht und Grenzen');

  /* Ein CAD-Export: Versätze an „die" und movingRoot, ein Registry-Teil mit
     gedrehter, skalierter Unterbaugruppe, Knoten mit eigenen Namen — einer
     sogar direkt unter „die" —, ein Mesh ohne Namen, eine Textur. */
  const mat = (name, color = 0x8899aa) => { const m = new T.MeshStandardMaterial({ color }); m.name = name; return m; };
  const box = (s, name) => { const m = new T.Mesh(new T.BoxGeometry(s, s, s), mat(name)); return m; };
  const scene = new T.Group();
  const die = new T.Group(); die.name = 'die'; die.position.set(0, 0, 3);
  const fixedRoot = new T.Group(); fixedRoot.name = 'fixedRoot';
  const movingRoot = new T.Group(); movingRoot.name = 'movingRoot'; movingRoot.position.set(0, 0, 5);
  scene.add(die); die.add(fixedRoot, movingRoot);
  const fh = new T.Group(); fh.name = 'fixHalf'; fh.position.set(10, 0, 0);
  const sub = new T.Group(); sub.name = 'Unterbaugruppe'; sub.rotation.z = Math.PI / 2; sub.scale.setScalar(2);
  const fhMesh = box(4, 'steel'); fhMesh.position.set(0, 5, 0);
  sub.add(fhMesh); fh.add(sub); fixedRoot.add(fh);
  const schraube = new T.Group(); schraube.name = 'Schraube'; schraube.position.set(0, 30, 0);
  const schraubeMesh = box(2, 'steel');
  const tex = new T.Texture();
  schraubeMesh.material.map = tex;
  let texFreed = false;
  tex.addEventListener('dispose', () => { texFreed = true; });
  schraube.add(schraubeMesh); fixedRoot.add(schraube);
  const kern = new T.Group(); kern.name = 'Kern'; kern.position.set(0, 0, 7);
  const kernMesh = box(3, 'steel');
  kern.add(kernMesh); movingRoot.add(kern);
  const boden = box(50, 'Material.001'); boden.name = 'Boden'; boden.position.set(0, -40, 0);
  die.add(boden);
  const anonym = box(1, 'steel');
  movingRoot.add(anonym);
  scene.updateMatrixWorld(true);
  const worldBefore = new Map([fhMesh, schraubeMesh, kernMesh, boden, anonym].map(m => [m, m.matrixWorld.clone()]));

  globalThis.__TEST_GLTF = scene;
  const glbIn = d.getElementById('glb-input');
  glbIn.files = [{ name: 'cad.glb', arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }];
  glbIn.dispatch('change');
  await v.pending;
  const asm = v.asm;
  assert.ok(asm.scene === scene, 'die fremde Datei steht');

  /* Unbekannte Knoten: eigene Gruppen je Seite, Teile wie alle anderen. */
  assert.equal(asm.itemOf('fixHalf').group, 'fix');
  assert.equal(asm.itemOf('Schraube').group, 'otherFix');
  assert.equal(asm.itemOf('Kern').group, 'otherMov');
  assert.equal(asm.itemOf('Boden').group, 'otherFix', 'ein Mesh direkt unter „die" steht fest');
  assert.ok(boden.parent === asm.fixedRoot, 'und hängt jetzt unter fixedRoot');
  const unnamed = asm.items.find(i => i.object === anonym);
  assert.ok(unnamed && unnamed.group === 'otherMov' && unnamed.id, 'auch ein Mesh ohne Namen: ' + (unnamed && unnamed.id));
  assert.ok(asm.groups.some(g => g.key === 'otherFix' && g.title === 'Sonstige Teile fest'));
  assert.ok(asm.groups.some(g => g.key === 'otherMov' && g.title === 'Sonstige Teile beweglich'));
  assert.equal(schraubeMesh.userData.compId, 'Schraube', 'antippbar');
  v.setHighlight(['fixHalf']);
  assert.ok(schraubeMesh.material.opacity < 0.1 && boden.material.opacity < 0.2, 'blass bei einer Hervorhebung');
  v.clearHighlight();

  /* Ins Bild geholt, die Zoomgrenzen nach der Datei. */
  const center = new T.Box3().setFromObject(scene).getCenter(new T.Vector3());
  assert.ok(v.view.controls.target.distanceTo(center) < 1e-6, 'das Ziel liegt in der Mitte der Datei');
  assert.ok(v.view.controls.minDistance < 250, 'minDistance nach der Größe: ' + v.view.controls.minDistance);

  /* Öffnen addiert den Weg auf die Lage aus der Datei. */
  const open = d.getElementById('open');
  open.value = '50'; open.dispatch('input');
  assert.ok(Math.abs(movingRoot.position.z - (5 + 0.5 * asm.openTravel)) < 1e-9, 'movingRoot: z = ' + movingRoot.position.z);
  assert.equal(kern.position.z, 7, 'der Versatz des Teils bleibt');
  assert.equal(fh.position.x, 10);
  assert.ok(asm.moveItem('Kern', 'slider'));
  open.value = '100'; open.dispatch('input');
  assert.ok(Math.abs(kern.position.x - 120) < 1e-9 && Math.abs(kern.position.z - 7) < 1e-9, 'der Schieber fährt dazu: ' + kern.position.toArray());
  open.value = '0'; open.dispatch('input');
  assert.equal(movingRoot.position.z, 5, 'geschlossen: wie in der Datei');

  /* Der Export schreibt die ganzen Lagen — auch bei offener Form geschlossen. */
  open.value = '100'; open.dispatch('input');
  const out = asm.toExportRoot();
  out.updateMatrixWorld(true);
  for (const [m, before] of worldBefore) {
    const id = m.userData.compId;
    const node = out.getObjectByName(id);
    assert.ok(node, 'Knoten ' + id);
    const copy = node.children[0];
    assert.ok(copy.matrixWorld.equals(before) || copy.matrixWorld.elements.every((x, k) => Math.abs(x - before.elements[k]) < 1e-9),
      id + ': Lage im Export ' + copy.matrixWorld.elements.map(x => +x.toFixed(3)) + ' statt ' + before.elements.map(x => +x.toFixed(3)));
  }
  assert.ok(out.getObjectByName('Schraube').parent.name === 'fixedRoot' && out.getObjectByName('Kern').parent.name === 'movingRoot');
  assert.ok(out.userData.formaufbau.items.some(i => i.id === 'Boden' && i.group === 'otherFix'), 'Sonstige Teile stehen in der Datei');
  assert.ok(Math.abs(movingRoot.position.z - (5 + asm.openTravel)) < 1e-9, 'nach dem Export wieder offen');

  /* Beim nächsten Modell wird alles freigegeben, auch Texturen. */
  const freed = [];
  for (const m of [schraubeMesh, boden, anonym]) m.geometry.addEventListener('dispose', () => freed.push(m));
  globalThis.__TEST_GLTF = (await legacyDie()).root;
  glbIn.dispatch('change');
  await v.pending;
  assert.equal(freed.length, 3, 'Geometrien der fremden Knoten freigegeben');
  assert.ok(texFreed, 'die Textur auch');
});

test('Formaufbau: der Schnitt zeichnet je Teil in dessen Farbe, nur wo die Ebene schneidet, und springt beim Öffnen nicht', async () => {
  const { root } = await legacyDie();
  const { d, v } = await openForm('schnitt-farben', root);
  const asm = v.asm;
  const caps = () => v.view.scene.children.filter(o => o.userData && o.userData.capOf !== undefined);
  const capOf = id => caps().find(c => c.userData.capOf === id);
  const twins = () => { const t = []; root.traverse(o => { if (o.userData.stencilTwin) t.push(o); }); return t; };
  const clipOn = d.getElementById('clip-on');
  clipOn.checked = true; clipOn.dispatch('change');
  assert.equal(caps().length, asm.items.length, 'eine Schnittfläche je Teil (hier ein Mesh je Teil)');
  assert.ok(caps().every(c => c.visible) && twins().every(t => t.visible), 'die Ebene in der Mitte schneidet alle Würfel');
  assert.ok(capOf('fixHalf').scale.x < 20, 'so groß wie der Schnitt durch das Teil, nicht 4,2 m: ' + capOf('fixHalf').scale.x);

  /* Jeder Kreis in seiner Farbe, auch nach dem Umfärben. */
  const list = d.getElementById('components');
  const rowOf = id => list.querySelectorAll('[data-item]').find(r => r.getAttribute('data-item') === id);
  const colorIn = rowOf('coolFixR').querySelector('[data-act="color"]');
  colorIn.value = '#00ff00'; colorIn.dispatch('input');
  assert.equal(capOf('coolFixR').material.color.getHexString(), '00ff00', 'die Schnittfläche folgt der Farbe des Teils');
  assert.equal(capOf('coolFixL').material.color.getHexString(), root.getObjectByName('coolFixL').children[0].material.color.getHexString(),
    'der andere Kreis behält seine');
  /* Hervorgehoben ist ein Kreis: seine Schnittfläche kräftig, die des anderen blass. */
  v.setHighlight(['coolFixR']);
  assert.equal(capOf('coolFixR').material.color.getHexString(), '00ff00');
  assert.notEqual(capOf('coolFixL').material.color.getHexString(), root.getObjectByName('coolFixL').children[0].material.color.getHexString());
  v.clearHighlight();

  /* Am Rand schneidet die Ebene nichts: keine Zwillinge, keine Flächen. */
  const pos = d.getElementById('clip-pos');
  pos.value = '100'; pos.dispatch('input');
  assert.ok(caps().every(c => !c.visible) && twins().every(t => !t.visible), 'nichts geschnitten, nichts gezeichnet');

  /* Z-Schnitt bei 50 %: Öffnen und ein neues Teil bei offener Form lassen
     die Ebene stehen. */
  d.querySelectorAll('[data-axis]').find(b => b.dataset.axis === 'z').dispatch('click');
  pos.value = '50'; pos.dispatch('input');
  const c0 = v.clip.activePlane().constant;
  const open = d.getElementById('open');
  open.value = '100'; open.dispatch('input');
  assert.equal(v.clip.activePlane().constant, c0);
  const S = await import('../../../web/tools/3d-studio/js/solids.js');
  const { writeSTL } = await import('../../../web/tools/3d-studio/js/part/stlio.js');
  const b = writeSTL(S.box(4, 4, 4), 'klein');
  const input = d.getElementById('stl-input');
  input.files = [{ name: 'klein.stl', arrayBuffer: () => Promise.resolve(b) }];
  input.dispatch('change');
  await v.pending;
  assert.equal(asm.items.length, 19, 'das Teil ist dazugekommen');
  assert.equal(v.clip.activePlane().constant, c0, 'die Ebene springt nicht, wenn sich bei offener Form etwas ändert');
});

test('Formaufbau: Hover höchstens einmal je Bild, nie beim Ziehen; Meldungen bleiben stehen', async () => {
  const T = await import('three');
  const { root } = await legacyDie();
  const { d, v } = await openForm('hover', root);
  const canvas = v.view.renderer.domElement;
  const status = d.getElementById('status');
  let casts = 0;
  const orig = T.Raycaster.prototype.setFromCamera;
  T.Raycaster.prototype.setFromCamera = function (...a) { casts++; return orig.apply(this, a); };
  try {
    for (let i = 0; i < 5; i++) canvas.dispatch('pointermove', { clientX: 400 + i, clientY: 300 });
    await tick();
    assert.equal(casts, 1, 'fünf Bewegungen in einem Bild, ein Treffertest');
    casts = 0;
    for (let i = 0; i < 5; i++) canvas.dispatch('pointermove', { clientX: 400 + i, clientY: 300, buttons: 1 });
    await tick();
    assert.equal(casts, 0, 'beim Drehen keiner');
  } finally { T.Raycaster.prototype.setFromCamera = orig; }

  /* Eine Datei ohne die Knoten der Baugruppe: die Meldung sagt, was sich
     laden lässt, und kein Zucken der Maus wischt sie weg. */
  const before = v.asm;
  const bad = new T.Group();
  bad.add(new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial()));
  globalThis.__TEST_GLTF = bad;
  const glbIn = d.getElementById('glb-input');
  glbIn.files = [{ name: 'fremd.glb', arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }];
  const quiet = console.error;
  console.error = () => {};              // der Viewer meldet den Fehler auch in der Konsole
  try {
    glbIn.dispatch('change');
    await v.pending;
  } finally { console.error = quiet; }
  const msg = status.textContent;
  assert.match(msg, /fixedRoot/);
  assert.doesNotMatch(msg, /openscad|render_die/, 'keine Anleitung für Entwickler');
  assert.ok(v.asm === before, 'die alte Form bleibt');
  canvas.dispatch('pointerleave');
  assert.equal(status.textContent, msg, 'der Zeiger verlässt das Bild: die Meldung bleibt');
  canvas.dispatch('pointermove', { clientX: 5, clientY: 5 });
  await tick();
  assert.equal(status.textContent, msg, 'der Hover ins Leere: die Meldung bleibt');
  assert.match(d.getElementById('file-warn').textContent, /fixedRoot/);
});

/* Die Wandstärkenanalyse läuft im gemeinsamen Rahmen (js/studio/); ihre
   Fälle stehen in tools/wandstaerke.test.mjs. */

/* Die Abstandsanalyse läuft im gemeinsamen Rahmen; ihre Fälle stehen in
   tools/abstand.test.mjs. */

test('Formaufbau: voreingestellte Farben folgen dem Farbschema, gewählte bleiben', async () => {
  const { root } = await legacyDie();
  const { d, v } = await openForm('farbschema', root);
  /* Wie im Browser: Palette und Schemata; ein Wechsel meldet sich am Dokument. */
  const require = createRequire(import.meta.url);
  globalThis.window = globalThis;
  const P = require(resolve(ROOT, '..', '..', 'shared', 'palette.js'));
  const S = require(resolve(ROOT, '..', '..', 'shared', 'schemes.js'));
  const M = await import('../../../web/tools/3d-studio/js/materials.js');
  const asm = v.asm;
  const mat = id => root.getObjectByName(id).children[0].material;
  const near = (a, b) => [1, 3, 5].every(i => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 1);
  const hexOf = m => '#' + m.color.getHexString();
  try {
    /* Eine Datei ohne Metadaten: die Teile der Registry tragen deren Rollen,
       auch wenn ihre Materialien etwas anderes mitbrachten. */
    assert.equal(asm.itemOf('castPart').role, 'melt');
    assert.ok(near(hexOf(mat('castPart')), P.melt), 'das Gussteil ist Schmelze: ' + hexOf(mat('castPart')));
    assert.ok(asm.setColor('coolFixL', '#00ff00'));
    S.set('graphit');
    const k = S.colors('graphit');
    assert.notEqual(k.melt, S.colors('teal').melt, 'Graphit hat eine eigene Schmelze');
    assert.equal(asm.itemOf('castPart').color, k.melt, 'die Voreinstellung folgt dem Schema');
    assert.ok(near(hexOf(mat('castPart')), k.melt), 'samt Material');
    assert.equal(asm.groupOf('cast').color, k.melt, 'und die Gruppe');
    assert.equal(asm.itemOf('coolFixL').color, '#00ff00', 'eine gewählte Farbe bleibt');
    assert.equal(mat('coolFixL').color.getHexString(), '00ff00');
    const list = d.getElementById('components');
    const rowOf = id => list.querySelectorAll('[data-item]').find(r => r.getAttribute('data-item') === id);
    assert.equal(rowOf('castPart').querySelector('.dot').style.background, k.melt, 'die Leiste zeichnet neu');
    assert.equal(rowOf('coolFixL').querySelector('.dot').style.background, '#00ff00');
    assert.equal(M.classColor('plunger'), k.piston, 'der Kolben ist Kolben');
    /* Die Schnittflächen tragen die Farbe ihres Teils, auch nach dem Wechsel. */
    const clipOn = d.getElementById('clip-on');
    clipOn.checked = true; clipOn.dispatch('change');
    const cap = v.view.scene.children.find(o => o.userData && o.userData.capOf === 'castPart');
    assert.ok(cap && near(hexOf(cap.material), k.melt), 'die Schnittfläche folgt');
    S.set('teal');
    assert.ok(near(hexOf(cap.material), P.melt), 'und zurück');
  } finally {
    S.set('teal');
  }
});
