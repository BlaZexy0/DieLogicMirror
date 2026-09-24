/* Formaufbau im gemeinsamen Rahmen: die Reiter Teile · Schnitt · Öffnen, die
   Gruppen und Teile mit ihren Menüs, Hervorheben (der Heizkühlplan), Farben,
   Schnitt und Öffnen, GLB speichern und wieder laden — und was der Rahmen
   dazugibt: Rückgängig für jede Änderung an der Form, der Entwurf, „Speichern"
   als GLB, Esc, Ablegen. Die Fälle stammen aus viewer.test.mjs und wurden auf
   data-ui, Reiter und die Klappe „Form" übertragen.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/formaufbau.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { mountPage, ROOT, read, wait } from './fixture.mjs';

const MOD = '../../../../web/tools/3d-studio/js/';
const tick = () => new Promise(r => setTimeout(r, 5));

/* Ein Ersatzmodell mit den Registry-Namen — wie die ausgelieferte GLB
   ohne Metadaten; der Formaufbau sortiert es in die Standardgruppen ein.
   `extra` hängt an einen Teil-Knoten weitere Netze an: { sleeve: 'plunger' }
   gibt der Füllkammer einen Kolben wie in der Beispielform. */
async function legacyDie(extra = {}) {
  const T = await import('three');
  const { COMPONENTS } = await import(MOD + 'registry.js');
  const root = new T.Group(); root.name = 'die';
  const fixedRoot = new T.Group(); fixedRoot.name = 'fixedRoot';
  const movingRoot = new T.Group(); movingRoot.name = 'movingRoot';
  root.add(fixedRoot, movingRoot);
  for (const c of COMPONENTS) {
    const g = new T.Group(); g.name = c.id; g.userData.compId = c.id;
    const mat = new T.MeshStandardMaterial({ color: 0x888888 });
    mat.name = c.side === 'cast' ? c.id : 'steel';
    const mesh = new T.Mesh(new T.BoxGeometry(10, 10, 10), mat);
    mesh.name = c.id + '_' + mat.name;
    mesh.userData.compId = c.id;
    g.add(mesh);
    if (extra[c.id]) {
      const m2 = new T.MeshStandardMaterial({ color: 0x445566 });
      m2.name = extra[c.id];
      const inner = new T.Mesh(new T.BoxGeometry(4, 4, 4), m2);
      inner.name = c.id + '_' + extra[c.id];
      inner.userData.compId = c.id;
      g.add(inner);
    }
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

/* Die Seite mit einem Modell öffnen; jede Variante lädt das Modul der Seite
   neu. Entwürfe früherer Fälle räumt sie weg, außer `keep`. */
async function openForm(variante, root, { keep = false } = {}) {
  globalThis.__TEST_GLTF = root;
  if (!keep && globalThis.localStorage) globalThis.localStorage.clear();
  const P = await mountPage('form.html', 'js/studio/pages/formaufbau.js', { variant: variante });
  const list = P.ui('components');
  return {
    ...P, list,
    rowOf: id => list.querySelectorAll('[data-item]').find(r => r.getAttribute('data-item') === id),
    headOf: key => list.querySelectorAll('.group-head').find(h => h.getAttribute('data-group') === key),
    input: P.doc.getElementById('stl-input'),
    canvas: P.v.view.renderer.domElement
  };
}

/* Eine Datei, wie sie das Eingabefeld liefert. */
const fileOf = (name, buf) => ({ name, arrayBuffer: () => Promise.resolve(buf) });
async function stl(name, size = [40, 30, 20]) {
  const { writeSTL } = await import(MOD + 'part/stlio.js');
  const S = await import(MOD + 'solids.js');
  return fileOf(name, writeSTL(S.box(...size), name));
}
/* Die Bytes einer GLB, wie der Kopf sie ausweist — den Inhalt liefert die
   Attrappe des GLTFLoader (globalThis.__TEST_GLTF). */
const glb = name => { const b = new ArrayBuffer(20); new DataView(b).setUint32(0, 0x46546c67, true); return fileOf(name, b); };
/* Dateien in die Klappe „Form" (Datei öffnen …), wie aus dem Dialog. */
async function choose(P, files) {
  P.input.files = files;
  P.input.dispatch('change');
  await P.v.pending;
  await tick();
}
const readGlbJson = buf => {
  const dv = new DataView(buf);
  assert.equal(dv.getUint32(0, true), 0x46546c67, 'GLB-Kennung');
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len)));
};
const segBtn = (el, value) => el.querySelectorAll('button').find(b => b.dataset.value === value);
const slide = (el, value) => { el.value = String(value); el.dispatch('input'); };

test('Rahmen: Reiter Teile · Schnitt · Öffnen, die Klappe „Form", Gruppen mit Glühbirnen, Schalter je Teil', async () => {
  const { root, COMPONENTS } = await legacyDie();
  const { DEFAULT_GROUPS } = await import(MOD + 'assembly.js');
  const P = await openForm('verdrahtung', root);
  const { v, ui, doc, shell, list, headOf } = P;
  assert.ok(v.state.ready, 'das Modell steht');
  assert.equal(globalThis.__form3d, v, 'der Testgriff heißt weiter __form3d');
  assert.equal(globalThis.__formaufbau, v, 'und __formaufbau');
  assert.deepEqual(doc.querySelectorAll('[role="tab"]').map(t => t.getAttribute('data-mode')), ['teile', 'schnitt', 'oeffnen']);
  assert.equal(shell.mode, 'teile');
  assert.equal(ui('part-label').textContent, 'Form', 'der Chip der Kopfzeile ist der der Form');
  assert.match(ui('part-name').textContent, /Ölwanne/);
  assert.equal(doc.getElementById('demo-select').value, 'beispiel');
  assert.ok(doc.getElementById('stl-input').hasAttribute('multiple'), '„Datei öffnen …" nimmt mehrere Dateien');
  assert.match(ui('save').title, /GLB/, 'Speichern schreibt die GLB');
  assert.ok(ui('export').hidden, 'kein Exportieren: die GLB ist das Dokument');
  assert.ok(!ui('undo-group').hidden && ui('undo').disabled, 'Rückgängig ist da und hat nichts zu tun');
  assert.equal(ui('save-state').textContent, '', 'nichts Ungespeichertes');
  assert.ok(doc.querySelector('[data-chip="stl"]'), 'der Chip „STL laden" über dem Bild');
  assert.equal(ui('primary').textContent, 'Gruppe anlegen');
  assert.match(ui('note').textContent, /^19 Teile in 6 Gruppen$/, 'unter dem Knopf, was die Form hat');

  const rows = list.querySelectorAll('[data-comp]');
  assert.equal(rows.length, COMPONENTS.length, 'eine Zeile je Teil');
  const heads = list.querySelectorAll('.group-head');
  assert.equal(heads.length, DEFAULT_GROUPS.length, 'alle Standardgruppen, auch leere');
  const bulbs = list.querySelectorAll('.bulb-btn');
  assert.equal(bulbs.length, DEFAULT_GROUPS.length);
  assert.ok(bulbs.every(b => b.classList.contains('on')), 'anfangs leuchten alle');
  assert.equal(list.querySelectorAll('.comp-empty').length, 1, 'die leere Schiebergruppe sagt es');
  assert.equal(v.list.openGroup, 'fix', 'aufgeklappt (und Ziel für STL) ist die erste Gruppe');

  /* Temperierung fest: eigene Gruppe, schaltet nur die Kreise. */
  const coolIds = COMPONENTS.filter(c => c.sub === 'Temperierung' && c.side === 'fix').map(c => c.id);
  assert.equal(coolIds.length, 2, 'zwei Kreise je Hälfte');
  const coolBulb = headOf('coolFix').querySelector('.bulb-btn');
  coolBulb.dispatch('click');
  for (const id of coolIds) assert.equal(root.getObjectByName(id).visible, false, id + ' aus');
  assert.equal(root.getObjectByName('fixHalf').visible, true, 'der Rest bleibt sichtbar');
  assert.ok(!coolBulb.classList.contains('on'), 'Birne aus');
  assert.match(ui('note').textContent, /2 ausgeblendet/, 'die Zeile unter dem Knopf zählt mit');
  headOf('coolFix').querySelector('.bulb-btn').dispatch('click');
  for (const id of coolIds) assert.equal(root.getObjectByName(id).visible, true);
  assert.ok(headOf('coolFix').querySelector('.bulb-btn').classList.contains('on'), 'Birne wieder an');

  /* Gruppenbirne der festen Seite: nur deren Teile. */
  headOf('fix').querySelector('.bulb-btn').dispatch('click');
  for (const c of COMPONENTS.filter(c => c.side === 'fix' && !c.sub)) assert.equal(root.getObjectByName(c.id).visible, false, c.id + ' aus');
  assert.equal(root.getObjectByName('coolFixL').visible, true, 'die Temperierung ist eine eigene Gruppe');
  headOf('fix').querySelector('.bulb-btn').dispatch('click');
  assert.equal(root.getObjectByName('movHalf').visible, true, 'die andere Seite ist unberührt');

  const first = list.querySelectorAll('[data-comp]')[0];
  const obj = root.getObjectByName(first.getAttribute('data-comp'));
  assert.ok(first.closest('label'), 'der Schalter sitzt in einem Label (das Ziel für den Finger)');
  first.checked = false;
  first.dispatch('change');
  assert.equal(obj.visible, false, 'Schalter blendet das Teil aus');
  first.checked = true;
  first.dispatch('change');
  assert.equal(obj.visible, true);
  assert.ok(ui('undo').disabled, 'Ein- und Ausblenden ist Ansicht, kein Schritt');

  /* Schnitt: der Reiter BESITZT die Schnittebene — kein eigener Schalter. */
  assert.equal(v.clip.activePlane(), null, 'unter Teile ist nichts geschnitten');
  shell.setMode('schnitt');
  assert.ok(v.clip.activePlane(), 'der Reiter Schnitt schneidet');
  const axisY = segBtn(ui('clip-axis'), 'y');
  axisY.dispatch('click');
  assert.ok(axisY.classList.contains('active'), 'Achse Y aktiv');
  slide(ui('clip-pos'), 40);
  const { fmtUnit } = await import(MOD + 'studio/format.js');
  assert.equal(ui('clip-pos-val').textContent, fmtUnit(0.4 * v.clip.extent('y'), 'mm'), 'die Lage in mm entlang der Achse');
  assert.ok(Math.abs(v.clip.activePlane().normal.y + 1) < 1e-9, 'senkrecht zu Y');
  shell.setMode('teile');
  assert.equal(v.clip.activePlane(), null, 'wer den Reiter verlässt, nimmt den Schnitt mit');
  shell.setMode('schnitt');
  assert.ok(Math.abs(v.clip.activePlane().normal.y + 1) < 1e-9 && ui('clip-pos').value === '40', 'Achse und Lage bleiben eingestellt');

  /* Öffnen: der Reiter BESITZT den Weg. */
  const { movingRoot } = v.asm;
  shell.setMode('oeffnen');
  assert.equal(v.clip.activePlane(), null, 'beim Öffnen ist nichts geschnitten');
  assert.ok(Math.abs(movingRoot.position.z - 0.6 * 420) < 1e-9, 'die Form steht offen, sobald der Reiter gewählt ist: z = ' + movingRoot.position.z);
  slide(ui('open'), 50);
  assert.ok(Math.abs(movingRoot.position.z - 210) < 1e-9, 'der Regler fährt sie: z = ' + movingRoot.position.z);
  assert.equal(ui('open-val').textContent, '210 mm');
  assert.match(ui('open-facts').textContent, /Bewegliche Hälfte210 von 420 mm/);
  assert.match(ui('open-facts').textContent, /Schieber \(\+X\)60 von 120 mm/, 'und nennt, was die Schieber fahren');
  shell.setMode('teile');
  assert.equal(movingRoot.position.z, 0, 'wer den Reiter verlässt, schließt die Form');
  shell.setMode('oeffnen');
  assert.ok(Math.abs(movingRoot.position.z - 210) < 1e-9, 'der Weg bleibt eingestellt');
  shell.setMode('teile');

  /* Deckkraft Stahl steht unter „Darstellung" und gilt in jedem Reiter. */
  const pop = doc.querySelector('[data-ui="darstellung"]');
  assert.ok(!doc.querySelector('[data-darstellung]').hidden, 'es gibt „Darstellung"');
  const op = pop.querySelector('[data-ui="opacity"]');
  assert.equal(op.value, '40');
  slide(op, 60);
  const steel = [];
  root.traverse(o => { if (o.isMesh && o.material.name === 'steel' && !o.userData.stencilTwin) steel.push(o.material); });
  assert.ok(steel.length > 0 && Math.abs(steel[0].opacity - 0.6) < 1e-9, 'Deckkraft Stahl wirkt');
  assert.equal(steel[0].transparent, true);
  assert.equal(pop.querySelector('[data-ui="opacity-val"]').textContent, '60 %');
  assert.ok(ui('undo').disabled, 'Schnitt, Öffnen und Deckkraft sind Ansicht, kein Schritt');
});

test('STL laden, umbenennen, verschieben, entfernen, Gruppen anlegen', async () => {
  const { root, fixedRoot, movingRoot, COMPONENTS } = await legacyDie();
  const P = await openForm('bearbeiten', root);
  const { v, ui, shell, list, rowOf, headOf } = P;
  const asm = v.asm;

  /* Zwei STL in die Schiebergruppe (über ihr Menü): neue Zeilen, Knoten unter
     movingRoot, Stahl — und EIN Schritt. */
  headOf('slider').querySelector('[data-act="add-stl"]').dispatch('click');
  await choose(P, [await stl('Schieber links.stl'), await stl('Schieber rechts.stl')]);
  assert.equal(asm.items.length, COMPONENTS.length + 2, 'zwei Teile mehr');
  const links = asm.items.find(i => i.label === 'Schieber links');
  assert.ok(links, 'die Datei heißt ohne Endung');
  assert.equal(links.group, 'slider');
  assert.equal(links.object.parent, movingRoot, 'Schieber hängen an der beweglichen Seite');
  assert.equal(links.object.children[0].material.name, 'steel', 'Werkstoffklasse der Gruppe');
  assert.ok(links.object.children[0].geometry.getAttribute('normal'), 'mit Normalen');
  assert.ok(rowOf(links.id), 'eine Zeile dafür');
  assert.equal(list.querySelectorAll('.comp-empty').length, 0, 'die Schiebergruppe ist nicht mehr leer');
  assert.equal(v.list.openGroup, 'slider', 'ihre Gruppe ist aufgeklappt: man sieht, was kam');
  assert.match(ui('toast').textContent, /2 Teile in „Schieber" geladen/);
  assert.match(ui('undo').title, /2 Teile geladen/, 'ein Schritt für beide');
  assert.equal(ui('save-state').textContent, 'Ungespeichert');

  /* Öffnen: die Schieber fahren zusätzlich in +x heraus. */
  shell.setMode('oeffnen');
  slide(ui('open'), 100);
  assert.ok(links.object.position.x > 100, 'Schieber fährt in der Trennebene: x = ' + links.object.position.x);
  assert.equal(root.getObjectByName('movHalf').position.x, 0, 'die Hälfte selbst nicht');
  shell.setMode('teile');
  assert.equal(links.object.position.x, 0);

  /* Umbenennen an Ort und Stelle. */
  rowOf(links.id).querySelector('[data-act="menu"]').dispatch('click');
  rowOf(links.id).querySelector('[data-act="rename"]').dispatch('click');
  const edit = rowOf(links.id).querySelector('.inline-edit');
  assert.ok(edit, 'ein Eingabefeld erscheint');
  assert.ok(rowOf(links.id).querySelector('.name').hidden, 'an der Stelle des Namens');
  edit.value = 'Schieber −X';
  edit.dispatch('change');
  assert.equal(links.label, 'Schieber −X');
  assert.equal(rowOf(links.id).querySelector('.name').textContent, 'Schieber −X');
  assert.equal(asm.labelOf(links.id), 'Schieber −X', 'der Hover kennt den neuen Namen');
  assert.match(ui('undo').title, /„Schieber links" umbenannt/);

  /* Verschieben ins Gussteil: andere Werkstoffklasse; in die feste Seite: anderer Elternknoten. */
  let move = rowOf(links.id).querySelector('[data-act="move"]');
  move.value = 'cast'; move.dispatch('change');
  assert.equal(links.group, 'cast');
  assert.equal(links.object.children[0].material.name, 'castPart', 'Klasse folgt der Gruppe');
  assert.equal(v.list.openGroup, 'cast', 'die Liste folgt dem Teil');
  assert.match(ui('undo').title, /nach „Gussteil" verschoben/);
  move = rowOf(links.id).querySelector('[data-act="move"]');
  move.value = 'fix'; move.dispatch('change');
  assert.equal(links.object.parent, fixedRoot, 'jetzt an der festen Seite');
  assert.equal(links.object.children[0].material.name, 'steel');

  /* Entfernen: ohne Nachfrage, der Toast bietet den Rückweg. */
  const rechts = asm.items.find(i => i.label === 'Schieber rechts');
  rowOf(rechts.id).querySelector('[data-act="remove"]').dispatch('click');
  assert.ok(!asm.items.some(i => i.id === rechts.id), 'weg aus der Baugruppe');
  assert.equal(rechts.object.parent, null, 'weg aus der Szene');
  assert.ok(!rowOf(rechts.id), 'weg aus der Leiste');
  assert.match(ui('toast').textContent, /„Schieber rechts" entfernt/);
  assert.ok(ui('toast').querySelector('.st-toast-act'), 'mit „Rückgängig"');

  /* Gruppe anlegen: der Hauptknopf öffnet das Formular an der Stelle der
     Liste und heißt dann „Anlegen". Schieber nach −Y mit 80 mm Weg. */
  ui('primary').dispatch('click');
  assert.ok(!ui('group-form').hidden, 'das Formular steht da');
  assert.ok(ui('components').hidden && ui('quick').hidden, 'an der Stelle der Liste');
  assert.equal(ui('primary').textContent, 'Anlegen');
  assert.ok(ui('travel-row').hidden, 'ohne Schieber kein Weg');
  ui('group-title').value = 'Schieber −Y';
  segBtn(ui('group-side'), 'mov').dispatch('click');
  ui('group-mat').value = 'steel';
  ui('group-slide').value = '-y'; ui('group-slide').dispatch('change');
  assert.ok(!ui('travel-row').hidden, 'mit Schieber der Weg');
  ui('group-travel').value = '80';
  ui('primary').dispatch('click');
  const g = asm.groups.find(x => x.title === 'Schieber −Y');
  assert.ok(g, 'die Gruppe ist da');
  assert.deepEqual(g.slide, { axis: 'y', sign: -1, travel: 80 });
  assert.equal(g.side, 'mov');
  assert.ok(ui('group-form').hidden && !ui('components').hidden, 'das Formular schließt sich, die Liste ist zurück');
  assert.equal(ui('primary').textContent, 'Gruppe anlegen');
  assert.ok(headOf(g.key), 'mit Kopf in der Leiste');
  assert.equal(v.list.openGroup, g.key, 'aufgeklappt: das Ziel für die nächsten STL');
  assert.ok(rowOf(links.id).querySelector('[data-act="move"]').innerHTML.includes(g.key), 'und als Ziel zum Verschieben');
  assert.match(ui('undo').title, /Gruppe „Schieber −Y" angelegt/);

  /* Ohne Namen keine Gruppe; der Fehler steht im Formular. */
  ui('primary').dispatch('click');
  ui('group-title').value = '  ';
  ui('primary').dispatch('click');
  assert.match(ui('group-warn').textContent, /Namen/, 'der Fehler steht im Formular, wo man gerade ist');
  assert.equal(P.doc.getElementById('model-warn').textContent, '', 'nicht in der Klappe der Form');
  ui('group-cancel').dispatch('click');
  assert.ok(ui('group-form').hidden);

  /* Gruppe umbenennen, leere Gruppe entfernen, volle nicht. */
  headOf(g.key).querySelector('[data-act="rename-group"]').dispatch('click');
  const ge = headOf(g.key).querySelector('.inline-edit');
  ge.value = 'Schieber unten'; ge.dispatch('change');
  assert.equal(g.title, 'Schieber unten');
  assert.equal(headOf('fix').querySelector('[data-act="remove-group"]').disabled, true, 'eine volle Gruppe lässt sich nicht entfernen');
  headOf(g.key).querySelector('[data-act="remove-group"]').dispatch('click');
  assert.ok(!asm.groups.some(x => x.key === g.key), 'die leere Gruppe ist weg');
  assert.match(ui('toast').textContent, /Gruppe „Schieber unten" entfernt/);
});

test('Rückgängig: jede Änderung an der Form ist ein Schritt und kommt zurück — ein Entferntes samt Geometrie und Materialien', async () => {
  const { root, fixedRoot } = await legacyDie({ sleeve: 'plunger' });
  const P = await openForm('rueckgaengig', root);
  const { v, ui, host, rowOf, headOf } = P;
  const asm = v.asm;
  const undo = () => ui('undo').dispatch('click');
  const redo = () => ui('redo').dispatch('click');
  /* Die Netze eines Teils — ohne die Stencil-Zwillinge des Schnitts, die daneben hängen. */
  const netze = id => asm.itemOf(id).object.children.filter(m => m.isMesh && !m.userData.stencilTwin);
  const matsOf = id => netze(id).map(m => m.material);

  /* Umbenennen. */
  rowOf('fixHalf').querySelector('[data-act="rename"]').dispatch('click');
  const edit = rowOf('fixHalf').querySelector('.inline-edit');
  edit.value = 'Platte fest'; edit.dispatch('change');
  assert.equal(asm.labelOf('fixHalf'), 'Platte fest');
  undo();
  assert.equal(asm.labelOf('fixHalf'), 'Feste Formhälfte', 'Rückgängig: der alte Name');
  assert.equal(rowOf('fixHalf').querySelector('.name').textContent, 'Feste Formhälfte', 'auch in der Liste');
  redo();
  assert.equal(asm.labelOf('fixHalf'), 'Platte fest', 'Wiederholen');

  /* Farbe: der Wähler färbt, solange er offen ist — EIN Schritt beim Schließen. */
  const tiefe = host.history.depth;
  const col = rowOf('coolFixL').querySelector('[data-act="color"]');
  for (const c of ['#ff0000', '#00ff00', '#0000ff']) { col.value = c; col.dispatch('input'); }
  assert.equal(host.history.depth, tiefe, 'während des Ziehens kein Schritt');
  col.value = '#0000ff'; col.dispatch('change');
  assert.equal(host.history.depth, tiefe + 1, 'beim Schließen genau einer');
  assert.match(ui('undo').title, /Farbe von „Kreis links"/);
  undo();
  const R = await import(MOD + 'registry.js');
  assert.equal(asm.itemOf('coolFixL').role, R.BY_ID.coolFixL.role, 'die Farbe ist wieder eine Rolle');
  assert.equal('#' + matsOf('coolFixL')[0].color.getHexString(), asm.itemOf('coolFixL').color.toLowerCase(), 'und das Material trägt sie');
  redo();
  assert.equal(asm.itemOf('coolFixL').color, '#0000ff');

  /* Verschieben: ein Teil mit Kolben ins Gussteil und zurück — mit
     Rückgängig trägt es wieder GENAU seine Materialien, der Kolben bleibt
     Kolben. */
  const vorher = matsOf('sleeve');
  const names = netze('sleeve').map(m => m.name);
  assert.deepEqual(vorher.map(m => m.name), ['steel', 'plunger']);
  const move = rowOf('sleeve').querySelector('[data-act="move"]');
  move.value = 'cast'; move.dispatch('change');
  assert.deepEqual(matsOf('sleeve').map(m => m.name), ['castPart', 'castPart'], 'im Gussteil ist alles Gussteil');
  undo();
  assert.equal(asm.itemOf('sleeve').group, 'fix');
  assert.ok(matsOf('sleeve').every((m, i) => m === vorher[i]), 'die eigenen Materialien, nicht neue');
  assert.deepEqual(netze('sleeve').map(m => m.name), names, 'und die Namen der Netze');
  redo();
  assert.equal(asm.itemOf('sleeve').group, 'cast');
  undo();

  /* In die andere Seite und zurück: der Elternknoten wechselt mit. */
  const mv = rowOf('fixInsert').querySelector('[data-act="move"]');
  mv.value = 'mov'; mv.dispatch('change');
  assert.equal(asm.itemOf('fixInsert').object.parent, asm.movingRoot);
  undo();
  assert.equal(asm.itemOf('fixInsert').object.parent, fixedRoot, 'Rückgängig: wieder an der festen Seite');

  /* Entfernen: Rückgängig holt das Teil samt Geometrie zurück (dasselbe
     Objekt), auch über den Knopf im Toast. */
  const obj = asm.itemOf('coolFixR').object;
  const geo = obj.children[0].geometry;
  rowOf('coolFixR').querySelector('[data-act="remove"]').dispatch('click');
  assert.ok(!asm.itemOf('coolFixR'));
  ui('toast').querySelector('.st-toast-act').dispatch('click');
  assert.ok(asm.itemOf('coolFixR'), '„Rückgängig" im Toast');
  assert.equal(asm.itemOf('coolFixR').object, obj, 'dasselbe Objekt');
  assert.equal(obj.children[0].geometry, geo, 'mit seiner Geometrie');
  assert.equal(obj.parent, fixedRoot, 'wieder an seiner Seite');
  assert.equal(asm.items.findIndex(i => i.id === 'coolFixR'), asm.items.findIndex(i => i.id === 'coolFixL') + 1, 'an seiner Stelle in der Liste');
  assert.ok(rowOf('coolFixR'), 'mit seiner Zeile');
  assert.equal(v.list.openGroup, 'coolFix', 'seine Gruppe ist aufgeklappt');
  redo();
  assert.ok(!asm.itemOf('coolFixR'), 'Wiederholen entfernt es wieder');
  undo();

  /* STL laden: Rückgängig nimmt das Teil heraus, Wiederholen bringt DASSELBE. */
  await choose(P, [await stl('Kern.stl')]);
  const kern = asm.items.find(i => i.label === 'Kern');
  assert.ok(kern);
  undo();
  assert.ok(!asm.itemOf(kern.id), 'Rückgängig: das geladene Teil ist weg');
  redo();
  assert.equal(asm.itemOf(kern.id) && asm.itemOf(kern.id).object, kern.object, 'Wiederholen: dasselbe Teil, keine neue Datei nötig');

  /* Gruppe anlegen und entfernen. */
  ui('primary').dispatch('click');
  ui('group-title').value = 'Ablage';
  ui('primary').dispatch('click');
  const g = asm.groups.find(x => x.title === 'Ablage');
  assert.ok(g);
  headOf(g.key).querySelector('[data-act="remove-group"]').dispatch('click');
  assert.ok(!asm.groupOf(g.key));
  P.doc.dispatch('keydown', { key: 'z', ctrlKey: true, target: P.canvas, preventDefault() {} });
  assert.ok(asm.groupOf(g.key), 'Strg+Z holt die Gruppe zurück');
  P.doc.dispatch('keydown', { key: 'z', ctrlKey: true, target: P.canvas, preventDefault() {} });
  assert.ok(!asm.groupOf(g.key), 'noch einmal: nicht angelegt');

  /* Hervorheben ist kein Schritt. */
  const d0 = host.history.depth;
  ui('hl-cooling').dispatch('click');
  ui('hl-clear').dispatch('click');
  assert.equal(host.history.depth, d0, 'Hervorheben ist Ansicht');
});

test('Entwurf: nach dem Neuladen angeboten, nie still übernommen — Teile aus STL-Dateien stehen nur in der GLB', async () => {
  const { root } = await legacyDie();
  let P = await openForm('entwurf-1', root);
  P.rowOf('fixHalf').querySelector('[data-act="rename"]').dispatch('click');
  const e = P.rowOf('fixHalf').querySelector('.inline-edit');
  e.value = 'Platte fest'; e.dispatch('change');
  const col = P.rowOf('coolFixL').querySelector('[data-act="color"]');
  col.value = '#00ff00'; col.dispatch('change');
  P.rowOf('castOverflow').querySelector('[data-act="remove"]').dispatch('click');
  P.headOf('cast').querySelector('[data-act="add-stl"]').dispatch('click');
  await choose(P, [await stl('Einlegeteil.stl')]);
  P.host.store.flushPending();
  const raw = globalThis.localStorage.getItem('studio:formaufbau:beispielform');
  assert.ok(raw, 'der Entwurf liegt unter der Beispielform');
  assert.ok(P.host.store.dirty, 'und gilt als ungespeichert (die Seite fragt beim Verlassen)');

  /* Neu laden: dieselbe Form, der Entwurf wird angeboten. */
  const { root: root2 } = await legacyDie();
  P = await openForm('entwurf-2', root2, { keep: true });
  const asm = P.v.asm;
  assert.equal(asm.labelOf('fixHalf'), 'Feste Formhälfte', 'nicht still übernommen');
  assert.ok(!P.ui('banner').hidden, 'der Streifen bietet ihn an');
  assert.match(P.ui('banner').textContent, /Entwurf vom .* wiederherstellen/);
  P.ui('banner').querySelector('.btn-primary').dispatch('click');
  assert.equal(asm.labelOf('fixHalf'), 'Platte fest', 'der Name kommt zurück');
  assert.equal(asm.itemOf('coolFixL').color, '#00ff00', 'die Farbe');
  assert.ok(!asm.itemOf('castOverflow'), 'das Entfernte bleibt weg');
  assert.ok(!asm.items.some(i => i.label === 'Einlegeteil'), 'das STL-Teil gibt es nicht: seine Geometrie stand nie im Entwurf');
  assert.match(P.doc.getElementById('status').textContent, /fehlt ein Teil aus einer STL-Datei/, 'und das wird gesagt');
  assert.ok(P.host.history.canUndo, 'Wiederherstellen ist ein Schritt');
  P.ui('undo').dispatch('click');
  assert.equal(asm.labelOf('fixHalf'), 'Feste Formhälfte');
  assert.ok(asm.itemOf('castOverflow'), 'Rückgängig: der Stand vor dem Entwurf');
});

test('Speichern schreibt die GLB: gespeichert heißt, die Datei ist da', async () => {
  const { root } = await legacyDie();
  const P = await openForm('speichern-knopf', root);
  const { v, ui, host } = P;
  const col = P.rowOf('coolFixL').querySelector('[data-act="color"]');
  col.value = '#00ff00'; col.dispatch('change');
  assert.equal(ui('save-state').textContent, 'Ungespeichert');
  assert.ok(ui('save').classList.contains('dirty'), 'Speichern ist der gefüllte Knopf');
  const names = [];
  const make = P.doc.createElement;
  P.doc.createElement = tag => { const el = make(tag); if (tag === 'a') el.click = () => names.push(el.download); return el; };
  try {
    ui('save').dispatch('click');
    await v.pending;
    await tick();
  } finally { P.doc.createElement = make; }
  assert.deepEqual(names, ['formaufbau.glb'], 'die Beispielform heißt formaufbau.glb');
  assert.ok(v.lastExport && v.lastExport.byteLength > 1000, 'eine GLB entsteht');
  assert.match(ui('toast').textContent, /Gespeichert: formaufbau\.glb · .* kB · 19 Teile in 6 Gruppen/);
  assert.match(ui('save-state').textContent, /^Gespeichert /);
  assert.ok(!host.store.dirty, 'die Seite fragt beim Verlassen nicht mehr');
});

test('eine Gruppe zur Zeit aufgeklappt — der Kopf schaltet, die Zeilen der anderen bleiben da, eine Hervorhebung zieht ihre Gruppe auf', async () => {
  const { root } = await legacyDie();
  const P = await openForm('klappen', root);
  const { v, ui, list, rowOf, headOf } = P;
  const asm = v.asm;
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

  /* Der Pfeil klappt auf und die vorige zu; ein zweiter Tipp klappt zu. Die
     Liste zeichnet dabei neu — der Fokus der Tastatur bleibt am Pfeil. */
  headOf('coolFix').querySelector('[data-act="fold"]').focus();
  headOf('coolFix').querySelector('[data-act="fold"]').dispatch('click');
  assert.deepEqual(openKeys(), ['coolFix'], 'ein Tipp klappt die Gruppe auf und die vorige zu');
  assert.equal(P.doc.activeElement, headOf('coolFix').querySelector('[data-act="fold"]'), 'der Fokus bleibt am neu gezeichneten Pfeil');
  assert.equal(headOf('coolFix').querySelector('[data-act="fold"]').getAttribute('aria-expanded'), 'true');
  headOf('coolFix').querySelector('[data-act="fold"]').dispatch('click');
  assert.deepEqual(openKeys(), [], 'ein zweiter Tipp klappt sie zu — alles kompakt');
  assert.equal(v.list.openGroup, null);

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
  assert.equal(v.state.highlight.size, 2);
  headOf('coolMov').querySelector('[data-act="group-menu"]').dispatch('click');
  assert.deepEqual(openKeys(), ['coolMov'], '„⋯" öffnet das Menü, klappt nicht');
  assert.ok(!headOf('coolMov').querySelector('.row-menu').classList.contains('hidden'));
  assert.equal(headOf('coolMov').querySelector('[data-act="group-menu"]').getAttribute('aria-expanded'), 'true');
  ui('hl-clear').dispatch('click');

  /* Eine neue Hervorhebung in einer zugeklappten Gruppe zieht sie auf;
     wer sie dann zuklappt, bekommt sie nicht wieder aufgedrängt. */
  assert.deepEqual(openKeys(), ['coolMov']);
  rowOf('coolFixL').querySelector('[data-act="hl"]').dispatch('click');
  assert.ok(v.state.highlight.has('coolFixL'));
  assert.deepEqual(openKeys(), ['coolFix'], 'die Gruppe des hervorgehobenen Teils geht auf');
  assert.ok(rowOf('coolFixL').classList.contains('hl'));
  headOf('coolFix').querySelector('[data-act="fold"]').dispatch('click');
  assert.deepEqual(openKeys(), [], 'zugeklappt trotz Hervorhebung');
  v.setSteelOpacity(0.5);
  ui('show-all').dispatch('click');
  assert.deepEqual(openKeys(), [], 'und bleibt zu, solange die Hervorhebung sich nicht ändert');
  ui('hl-cooling').dispatch('click');
  assert.ok(v.state.highlight.size === 4 && openKeys().length === 1 && ['coolFix', 'coolMov'].includes(openKeys()[0]), 'Temperierung: eine der Kreisgruppen geht auf');
});

test('Hervorheben je Teil, Gruppe und Temperierung, Farben, Menüs statt Auswahl je Zeile; Esc', async () => {
  const { root } = await legacyDie();
  const P = await openForm('hervorheben', root);
  const { v, ui, rowOf, headOf, canvas } = P;
  const asm = v.asm;
  const matOf = id => root.getObjectByName(id).children[0].material;
  const esc = () => P.doc.dispatch('keydown', { key: 'Escape', target: canvas, preventDefault() {} });

  /* Keine Auswahl je Zeile: das Verschieben sitzt mit Umbenennen und
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
  row.querySelector('[data-act="menu"]').dispatch('click');
  esc();
  assert.ok(menu.classList.contains('hidden'), 'Esc schließt es auch');
  const head = headOf('coolFix');
  assert.ok(head.querySelector('.row-menu').classList.contains('hidden'), 'auch das Gruppenmenü ist zu');
  assert.ok(head.querySelector('[data-act="group-color"]') && head.querySelector('[data-act="add-stl"]'), 'Farbe und Laden im Gruppenmenü');
  assert.equal(row.querySelector('[data-act="hl"]').tagName, 'BUTTON', 'der Name ist ein Knopf (Tastatur)');

  /* Ein Tipp auf den Namen hebt das Teil hervor: es bleibt deckend, alles
     andere wird blass — der Stahl unter seine Deckkraft, das Gussteil
     ebenso. Ein zweiter Tipp nimmt es wieder heraus. */
  row.querySelector('[data-act="hl"]').dispatch('click');
  assert.ok(v.state.highlight.has('coolFixL') && v.state.highlight.size === 1, 'ein Teil hervorgehoben');
  assert.ok(rowOf('coolFixL').classList.contains('hl'), 'die Zeile zeigt es');
  assert.ok(!rowOf('coolFixR').classList.contains('hl'));
  assert.equal(matOf('coolFixL').opacity, 1);
  assert.ok(matOf('fixHalf').opacity < 0.1, 'Stahl blass: ' + matOf('fixHalf').opacity);
  assert.ok(matOf('castPart').opacity < 0.2 && matOf('castPart').transparent, 'Gussteil blass: ' + matOf('castPart').opacity);
  assert.equal(ui('hl-clear').disabled, false);
  assert.match(ui('hl-clear').textContent, /\(1\)/);
  rowOf('coolFixL').querySelector('[data-act="hl"]').dispatch('click');
  assert.equal(v.state.highlight.size, 0);
  assert.ok(Math.abs(matOf('fixHalf').opacity - 0.4) < 1e-9, 'Stahl wieder auf dem Regler');
  assert.equal(matOf('castPart').opacity, 1);
  assert.equal(ui('hl-clear').disabled, true);

  /* Der Gruppenname hebt alle Teile der Gruppe hervor; „Temperierung"
     alle Kreise beider Hälften; „Aufheben" räumt, Esc auch. */
  headOf('coolFix').querySelector('[data-act="hl-group"]').dispatch('click');
  assert.deepEqual([...v.state.highlight].sort(), ['coolFixL', 'coolFixR']);
  assert.ok(headOf('coolFix').classList.contains('hl'), 'der Kopf zeigt es');
  assert.ok(!headOf('coolMov').classList.contains('hl'));
  ui('hl-cooling').dispatch('click');
  assert.deepEqual([...v.state.highlight].sort(), ['coolFixL', 'coolFixR', 'coolMovL', 'coolMovR']);
  assert.ok(ui('hl-cooling').classList.contains('active'));
  ui('hl-cooling').dispatch('click');
  assert.equal(v.state.highlight.size, 0, 'ein zweiter Tipp auf Temperierung nimmt sie heraus');
  ui('hl-cooling').dispatch('click');
  ui('hl-clear').dispatch('click');
  assert.equal(v.state.highlight.size, 0);
  assert.ok(!ui('hl-cooling').classList.contains('active'));
  ui('hl-cooling').dispatch('click');
  esc();
  assert.equal(v.state.highlight.size, 0, 'Esc hebt die Hervorhebung auf');

  /* Die Hervorhebung ist Ansicht und gilt in jedem Reiter. */
  ui('hl-cooling').dispatch('click');
  P.shell.setMode('schnitt');
  assert.equal(v.state.highlight.size, 4, 'im Schnitt bleibt sie');
  assert.ok(matOf('fixHalf').opacity < 0.1);
  P.shell.setMode('teile');
  ui('hl-clear').dispatch('click');

  /* Tipp im Bild: das getroffene Teil wird hervorgehoben, ein Tipp ins
     Leere hebt auf, Ziehen ist kein Tipp. (Alle Ersatzteile sind Würfel
     im Ursprung — die Kamera schaut dorthin.) */
  v.view.controls.target.set(0, 0, 0);
  v.view.camera.lookAt(0, 0, 0);
  v.view.camera.updateMatrixWorld(true);
  const tap = (x, y, x2 = x, y2 = y) => {
    canvas.dispatch('pointerdown', { button: 0, clientX: x, clientY: y });
    canvas.dispatch('pointerup', { button: 0, clientX: x2, clientY: y2 });
  };
  tap(400, 300);
  assert.equal(v.state.highlight.size, 1, 'ein Tipp ins Bild hebt das Teil darunter hervor');
  tap(5, 5);
  assert.equal(v.state.highlight.size, 0, 'ein Tipp ins Leere hebt auf');
  tap(400, 300, 470, 340);
  assert.equal(v.state.highlight.size, 0, 'Ziehen hebt nichts hervor');

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
  ui('show-all').dispatch('click');
  assert.equal(root.getObjectByName('fixHalf').visible, true);
  assert.equal(v.state.highlight.size, 0);
  assert.ok(P.list.querySelectorAll('.bulb-btn').every(b => b.classList.contains('on')), 'alle Birnen leuchten wieder');
});

test('als GLB speichern und daraus wieder laden', async () => {
  const { root, COMPONENTS } = await legacyDie();
  const P = await openForm('speichern', root);
  const { v, ui, shell } = P;
  const asm = v.asm;

  /* Etwas ändern, damit der Roundtrip etwas zu bewahren hat. */
  assert.ok(asm.renameItem('fixHalf', 'Feste Hälfte 900 × 1000'));
  const g = asm.addGroup({ title: 'Schieber +Y', side: 'mov', mat: 'steel', slide: { axis: 'y', sign: 1, travel: 60 } });
  const S = await import(MOD + 'solids.js');
  const neu = asm.addItem({ group: g.key, label: 'Kern oben', tris: S.box(20, 20, 20) });
  v.list.render();

  /* Was die Ansicht an den Materialien einstellt, gehört nicht in die Datei:
     Deckkraft Stahl steht auf 40 %, ein Teil ist hervorgehoben (die anderen
     blass, es selbst leuchtet), ein Kreis ist umgefärbt. */
  assert.ok(asm.setColor('coolFixL', '#00ff00'));
  v.toggleHighlight(['castPart']);
  const look = id => root.getObjectByName(id).children[0].material;
  assert.ok(look('fixHalf').opacity < 0.1 && look('castPart').emissive.getHex() !== 0, 'die Ansicht ist blass und leuchtet');

  ui('save').dispatch('click');
  await v.pending;
  await tick();
  const buf = v.lastExport;
  assert.ok(buf && buf.byteLength > 1000, 'eine GLB entsteht: ' + (buf && buf.byteLength));
  assert.match(ui('toast').textContent, /formaufbau\.glb/);

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
  const R = await import(MOD + 'registry.js');
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
  await choose(P, [fileOf('meine-form.glb', buf)]);
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
  assert.equal(ui('part-name').textContent, 'meine-form.glb', 'der Chip nennt die Datei');
  assert.equal(P.doc.getElementById('demo-select').selectedIndex, -1, 'kein Beispiel gewählt');
  assert.ok(ui('undo').disabled, 'eine neue Form ist ein neuer Anfang');
  shell.setMode('oeffnen');
  slide(ui('open'), 100);
  assert.ok(asm2.itemOf(neu.id).object.position.y > 50, 'der geladene Schieber fährt in +y');
  shell.setMode('teile');
  assert.equal(v.tool.docName(), 'meine-form', 'gespeichert wird sie unter ihrem Namen');
});

test('ein Tipp mit Schnittebene trifft, was zu sehen ist, nicht die weggeschnittene Platte davor', async () => {
  /* Eine Platte, in ihr ein Kreis; die Kamera schaut von +x in die Mitte. */
  const { root } = await boxDie([
    { id: 'fixHalf', mat: 'steel', size: 200, side: 'fix' },
    { id: 'coolFixL', mat: 'coolFix', size: 20, side: 'fix' }
  ]);
  const P = await openForm('schnitt-tipp', root);
  const { v, ui, canvas, shell } = P;
  const cam = v.view.camera;
  cam.position.set(2000, 0, 0); cam.up.set(0, 1, 0);
  v.view.controls.target.set(0, 0, 0);
  cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
  const tap = (x, y) => {
    canvas.dispatch('pointerdown', { button: 0, clientX: x, clientY: y });
    canvas.dispatch('pointerup', { button: 0, clientX: x, clientY: y });
  };
  const hl = () => [...v.state.highlight];
  const clear = () => ui('hl-clear').dispatch('click');

  tap(400, 300);
  assert.deepEqual(hl(), ['fixHalf'], 'ohne Schnitt: die Platte vorn');
  clear();

  /* Schnitt in x = 0, weggeschnitten ist die Seite der Kamera: der Tipp
     in die Mitte trifft den Kreis, der dort im Schnitt zu sehen ist. */
  shell.setMode('schnitt');
  tap(400, 300);
  assert.deepEqual(hl(), ['coolFixL'], 'der Kreis im Schnitt, nicht die unsichtbare Platte davor');
  canvas.dispatch('pointermove', { clientX: 400, clientY: 300 });
  await tick();
  assert.equal(P.doc.getElementById('status').textContent, 'Kreis links', 'der Hover sagt dasselbe');
  clear();
  /* 21 Bildpunkte höher liegt der Durchstoßpunkt bei y ≈ 50 mm: im Stahl,
     neben dem Kreis — die Schnittfläche der Platte. */
  tap(400, 279);
  assert.deepEqual(hl(), ['fixHalf'], 'die Schnittfläche der Platte');
  clear();
  tap(5, 5);
  assert.equal(v.state.highlight.size, 0, 'daneben: nichts');
  /* Seite umkehren: jetzt steht die Kamera auf der stehenden Seite und
     sieht die Platte von außen. */
  const flip = ui('clip-flip');
  flip.checked = true; flip.dispatch('change');
  tap(400, 300);
  assert.deepEqual(hl(), ['fixHalf'], 'von der stehenden Seite: die Platte');
});

test('ein hervorgehobenes Teil entfernen hebt die Hervorhebung auf, der Rest wird wieder deckend', async () => {
  const { root } = await legacyDie();
  const P = await openForm('entfernen', root);
  const { v, ui, rowOf } = P;
  const matOf = id => root.getObjectByName(id).children[0].material;
  rowOf('castPart').querySelector('[data-act="hl"]').dispatch('click');
  assert.ok(matOf('fixHalf').opacity < 0.1 && matOf('castRunner').opacity < 0.2, 'der Rest ist blass');
  rowOf('castPart').querySelector('[data-act="remove"]').dispatch('click');
  assert.ok(!v.asm.itemOf('castPart'), 'das Teil ist weg');
  assert.equal(v.state.highlight.size, 0, 'und nicht mehr hervorgehoben');
  assert.equal(ui('hl-clear').textContent, 'Aufheben');
  assert.equal(ui('hl-clear').disabled, true);
  assert.ok(Math.abs(matOf('fixHalf').opacity - 0.4) < 1e-9, 'der Stahl steht wieder auf dem Regler');
  assert.equal(matOf('castRunner').opacity, 1, 'das Gussteil ist wieder deckend');
});

test('die Felder baut der Rahmen: form.html hat keine, die der Browser nach dem Neuladen füllen könnte — und nichts heißt Transparenz', () => {
  /* Vorher standen Regler und Häkchen im HTML, und Firefox setzte nach F5
     die alten Werte ein: „Schnittebene zeigen" stand angehakt da, geschnitten
     war nichts. Jetzt baut der Rahmen die Felder zur Laufzeit, und der
     Schnitt gehört seinem Reiter — es gibt kein Häkchen mehr, das lügen
     könnte. */
  const html = read('form.html');
  assert.doesNotMatch(html, /<input|<select/, 'keine Felder im HTML');
  assert.match(html, /js\/studio\/pages\/formaufbau\.js/);
  assert.doesNotMatch(html, /viewer\.css/, 'der Formaufbau trägt css/studio.css, nicht mehr viewer.css');
  for (const f of ['js/formaufbau/panel.js', 'js/formaufbau/help.js', 'js/formaufbau/tool.js', 'js/formaufbau/list.js']) {
    assert.doesNotMatch(read(f), /Transparenz/, f + ': die Deckkraft heißt Deckkraft');
  }
});

test('Schieberweg deutsch gelesen, Fehler stehen im Formular', async () => {
  const { root } = await legacyDie();
  const P = await openForm('schieberweg', root);
  const { v, ui } = P;
  const add = (title, slideKey, travel) => {
    if (ui('group-form').hidden) ui('primary').dispatch('click');
    ui('group-title').value = title;
    ui('group-slide').value = slideKey; ui('group-slide').dispatch('change');
    ui('group-travel').value = travel;
    ui('primary').dispatch('click');
    return v.asm.groups.find(g => g.title === title);
  };
  assert.equal(add('Schieber A', '+x', '1.500').slide.travel, 1500, '„1.500" sind 1500 mm, nicht 1,5');
  assert.equal(add('Schieber B', '-y', '1,5').slide.travel, 1.5);
  assert.equal(add('Schieber C', '+x', 'weit'), undefined, 'keine Zahl, keine Gruppe');
  assert.match(ui('group-warn').textContent, /Schieberweg/);
  assert.ok(!ui('group-form').hidden, 'das Formular bleibt offen');
  ui('group-cancel').dispatch('click');
  assert.equal(ui('group-warn').textContent, '', 'Abbrechen räumt die Meldung');
  assert.equal(add('Ablage', '', 'weit').slide, null, 'ohne Schieber zählt der Weg nicht');
  /* Esc schließt das Formular (außerhalb eines Felds). */
  ui('primary').dispatch('click');
  assert.ok(!ui('group-form').hidden);
  P.doc.dispatch('keydown', { key: 'Escape', target: P.canvas, preventDefault() {} });
  assert.ok(ui('group-form').hidden, 'Esc schließt es');
  /* Wer den Reiter wechselt, lässt das Formular zurück. */
  ui('primary').dispatch('click');
  P.shell.setMode('schnitt');
  P.shell.setMode('teile');
  assert.ok(ui('group-form').hidden && ui('primary').textContent === 'Gruppe anlegen', 'der Reiter Teile beginnt mit der Liste');
});

test('Namen aus der Datei landen als Text in Liste, Klappe und Bild, nicht als HTML', async () => {
  const { root } = await legacyDie();
  const evil = '<img src=x onerror="window.__pwned=1">Schieber';
  const key = 'k"><img src=x onerror=alert(1)>';
  root.userData.formaufbau = {
    format: 'dielogic-formaufbau', version: 1,
    groups: [{ key: 'fix', title: 'Feste Seite', side: 'fix', mat: 'steel' },
      { key, title: evil, side: 'seitlich', mat: 'steel', color: 'red; background: url(x)', slide: { axis: 'q', sign: 1, travel: 5 } },
      { key: 'sl', title: evil, side: 'mov', mat: 'steel', slide: { axis: 'x', sign: 1, travel: 5 } }],
    items: [{ id: 'fixHalf', label: '<b>Platte</b>', group: 'fix' }, { id: 'movHalf', label: 'Hälfte', group: key, color: 'javascript:1' }]
  };
  const P = await openForm('fremde-namen', root);
  const { v, ui, list, rowOf, canvas, shell } = P;
  assert.equal(list.querySelectorAll('img').length, 0, 'kein <img> aus dem Gruppennamen in der Liste');
  const move = rowOf('fixHalf').querySelector('[data-act="move"]');
  assert.equal(move.querySelectorAll('img').length, 0, 'und keins im Menü „Verschieben nach"');
  assert.ok(move.options.some(o => o.textContent === evil), 'der Name steht als Text da');
  assert.equal(v.asm.labelOf('fixHalf'), '<b>Platte</b>');
  assert.equal(rowOf('fixHalf').querySelector('.name').textContent, '<b>Platte</b>');
  const g = v.asm.groupOf(key);
  assert.equal(g.side, 'mov', 'eine unbekannte Seite wird die bewegliche');
  assert.equal(g.slide, null, 'ein Schieber ohne gültige Achse ist keiner');
  /* Keine brauchbare Farbe: die Gruppe bekommt die Voreinstellung ihrer
     Werkstoffklasse (eine Rolle, js/materials.js), das Teil die seiner Gruppe. */
  const M = await import(MOD + 'materials.js');
  assert.equal(g.color, M.classColor('steel'), 'nur #rrggbb als Farbe');
  assert.equal(g.role, M.CLASS_ROLE.steel, 'als Rolle, die dem Farbschema folgt');
  assert.equal(v.asm.itemOf('movHalf').color, g.color, 'das Teil ohne Farbe trägt die seiner Gruppe');
  assert.equal(v.asm.itemOf('movHalf').role, g.role);
  shell.setMode('oeffnen');
  assert.equal(ui('open-facts').querySelectorAll('img').length, 0, 'kein <img> unter „Öffnen"');
  assert.ok(ui('open-facts').textContent.includes(evil), 'der Schieber steht als Text da');
  shell.setMode('teile');
  /* Der Hover schreibt den Namen als Text ins Bild. */
  v.view.controls.target.set(0, 0, 0);
  v.view.camera.lookAt(0, 0, 0);
  v.view.camera.updateMatrixWorld(true);
  v.setHighlight(['fixHalf']);
  canvas.dispatch('pointermove', { clientX: 400, clientY: 300 });
  await tick();
  const status = P.doc.getElementById('status');
  assert.equal(status.textContent, '<b>Platte</b>');
  assert.equal(status.querySelectorAll('b').length, 0, 'als Text, nicht als HTML');
});

test('eine fremde GLB kommt ins Bild, behält ihre Lagen, und unbekannte Knoten werden Teile', async () => {
  const T = await import('three');
  const { root: demo } = await legacyDie();
  const P = await openForm('fremd', demo);
  const { v, ui, shell } = P;
  /* Auch die Beispielform ist eingepasst — in der Blickrichtung von der
     festen Seite, mit der sie immer begann. */
  const dir = v.view.camera.position.clone().sub(v.view.controls.target).normalize();
  assert.ok(dir.dot(new T.Vector3(2000, 900, -1920).normalize()) > 0.999, 'die Blickrichtung der Beispielform: ' + dir.toArray());

  /* Ein CAD-Export: Versätze an „die" und movingRoot, ein Registry-Teil mit
     gedrehter, skalierter Unterbaugruppe, Knoten mit eigenen Namen — einer
     sogar direkt unter „die" —, ein Mesh ohne Namen, eine Textur. */
  const mat = (name, color = 0x8899aa) => { const m = new T.MeshStandardMaterial({ color }); m.name = name; return m; };
  const box = (s, name) => new T.Mesh(new T.BoxGeometry(s, s, s), mat(name));
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
  await choose(P, [glb('cad.glb')]);
  const asm = v.asm;
  assert.ok(asm.scene === scene, 'die fremde Datei steht');
  assert.equal(ui('part-name').textContent, 'cad.glb');

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
  assert.ok(v.view.controls.minDistance < 10, 'minDistance nach der Größe: ' + v.view.controls.minDistance);

  /* Öffnen addiert den Weg auf die Lage aus der Datei. */
  shell.setMode('oeffnen');
  slide(ui('open'), 50);
  assert.ok(Math.abs(movingRoot.position.z - (5 + 0.5 * asm.openTravel)) < 1e-9, 'movingRoot: z = ' + movingRoot.position.z);
  assert.equal(kern.position.z, 7, 'der Versatz des Teils bleibt');
  assert.equal(fh.position.x, 10);
  assert.ok(asm.moveItem('Kern', 'slider'));
  slide(ui('open'), 100);
  assert.ok(Math.abs(kern.position.x - 120) < 1e-9 && Math.abs(kern.position.z - 7) < 1e-9, 'der Schieber fährt dazu: ' + kern.position.toArray());
  slide(ui('open'), 0);
  assert.equal(movingRoot.position.z, 5, 'geschlossen: wie in der Datei');

  /* Der Export schreibt die ganzen Lagen — auch bei offener Form geschlossen. */
  slide(ui('open'), 100);
  const out = asm.toExportRoot();
  out.updateMatrixWorld(true);
  for (const [m, before] of worldBefore) {
    const id = m.userData.compId;
    const node = out.getObjectByName(id);
    assert.ok(node, 'Knoten ' + id);
    const copy = node.children[0];
    assert.ok(copy.matrixWorld.elements.every((x, k) => Math.abs(x - before.elements[k]) < 1e-9),
      id + ': Lage im Export ' + copy.matrixWorld.elements.map(x => +x.toFixed(3)) + ' statt ' + before.elements.map(x => +x.toFixed(3)));
  }
  assert.ok(out.getObjectByName('Schraube').parent.name === 'fixedRoot' && out.getObjectByName('Kern').parent.name === 'movingRoot');
  assert.ok(out.userData.formaufbau.items.some(i => i.id === 'Boden' && i.group === 'otherFix'), 'Sonstige Teile stehen in der Datei');
  assert.ok(Math.abs(movingRoot.position.z - (5 + asm.openTravel)) < 1e-9, 'nach dem Export wieder offen');
  shell.setMode('teile');

  /* Beim nächsten Modell wird alles freigegeben, auch Texturen — und was in
     der Ablage liegt. */
  const freed = [];
  for (const m of [schraubeMesh, boden, anonym]) m.geometry.addEventListener('dispose', () => freed.push(m));
  assert.ok(asm.removeItem('Schraube'), 'die Schraube liegt in der Ablage');
  globalThis.__TEST_GLTF = (await legacyDie()).root;
  await choose(P, [glb('noch-eine.glb')]);
  assert.equal(freed.length, 3, 'Geometrien der fremden Knoten freigegeben, auch der entfernten');
  assert.ok(texFreed, 'die Textur auch');
});

test('der Schnitt zeichnet je Teil in dessen Farbe, nur wo die Ebene schneidet, und springt beim Öffnen nicht', async () => {
  const { root } = await legacyDie();
  const P = await openForm('schnitt-farben', root);
  const { v, ui, rowOf, shell } = P;
  const asm = v.asm;
  const caps = () => v.view.scene.children.filter(o => o.userData && o.userData.capOf !== undefined);
  const capOf = id => caps().find(c => c.userData.capOf === id);
  const twins = () => { const t = []; root.traverse(o => { if (o.userData.stencilTwin) t.push(o); }); return t; };
  shell.setMode('schnitt');
  assert.equal(caps().length, asm.items.length, 'eine Schnittfläche je Teil (hier ein Mesh je Teil)');
  assert.ok(caps().every(c => c.visible) && twins().every(t => t.visible), 'die Ebene in der Mitte schneidet alle Würfel');
  assert.ok(capOf('fixHalf').scale.x < 20, 'so groß wie der Schnitt durch das Teil, nicht 4,2 m: ' + capOf('fixHalf').scale.x);

  /* Jeder Kreis in seiner Farbe, auch nach dem Umfärben. */
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
  slide(ui('clip-pos'), 100);
  assert.ok(caps().every(c => !c.visible) && twins().every(t => !t.visible), 'nichts geschnitten, nichts gezeichnet');

  /* Z-Schnitt bei 50 %: Öffnen, ein neues Teil bei offener Form und der Weg
     zurück in den Schnitt lassen die Ebene stehen. */
  segBtn(ui('clip-axis'), 'z').dispatch('click');
  slide(ui('clip-pos'), 50);
  const c0 = v.clip.activePlane().constant;
  shell.setMode('oeffnen');
  slide(ui('open'), 100);
  await choose(P, [await stl('klein.stl', [4, 4, 4])]);
  assert.equal(asm.items.length, 20, 'das Teil ist dazugekommen');
  shell.setMode('schnitt');
  assert.equal(v.clip.activePlane().constant, c0, 'die Ebene springt nicht, wenn sich bei offener Form etwas ändert');
  assert.ok(caps().some(c => c.userData.capOf === asm.items[18].id), 'und das neue Teil hat seine Schnittfläche');
});

test('Hover höchstens einmal je Bild, nie beim Ziehen; Meldungen bleiben stehen', async () => {
  const T = await import('three');
  const { root } = await legacyDie();
  const P = await openForm('hover', root);
  const { v, canvas } = P;
  const status = P.doc.getElementById('status');
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
  const quiet = console.error;
  console.error = () => {};              // der Formaufbau meldet den Fehler auch in der Konsole
  try { await choose(P, [glb('fremd.glb')]); } finally { console.error = quiet; }
  const msg = status.textContent;
  assert.match(msg, /fixedRoot/);
  assert.doesNotMatch(msg, /openscad|render_die/, 'keine Anleitung für Entwickler');
  assert.ok(v.asm === before, 'die alte Form bleibt');
  assert.ok(v.state.ready, 'und gilt weiter');
  canvas.dispatch('pointerleave');
  assert.equal(status.textContent, msg, 'der Zeiger verlässt das Bild: die Meldung bleibt');
  canvas.dispatch('pointermove', { clientX: 5, clientY: 5 });
  await tick();
  assert.equal(status.textContent, msg, 'der Hover ins Leere: die Meldung bleibt');
  assert.match(P.doc.getElementById('model-warn').textContent, /fixedRoot/, 'auch in der Klappe der Form');
  assert.match(P.ui('toast').textContent, /fixedRoot/, 'und im Toast');
});

test('Ablegen: mehrere STL auf einmal in die aufgeklappte Gruppe, eine GLB ersetzt die Form', async () => {
  const { root, COMPONENTS } = await legacyDie();
  const P = await openForm('ablegen', root);
  const { v, ui } = P;
  P.headOf('coolMov').querySelector('[data-act="fold"]').dispatch('click');
  assert.equal(v.list.openGroup, 'coolMov');
  const drop = files => ui('viewport').dispatch('drop', { dataTransfer: { files }, preventDefault() {} });
  drop([await stl('Kreis 3.stl'), await stl('Kreis 4.stl')]);
  await v.pending;
  assert.equal(v.asm.items.length, COMPONENTS.length + 2, 'beide abgelegten Dateien');
  assert.ok(v.asm.items.filter(i => /^Kreis [34]$/.test(i.label)).every(i => i.group === 'coolMov'), 'in die aufgeklappte Gruppe');
  assert.match(ui('undo').title, /2 Teile geladen/);
  /* Der Chip über dem Bild lädt ebenso in die aufgeklappte Gruppe. */
  P.doc.querySelector('[data-chip="stl"]').dispatch('click');
  await choose(P, [await stl('Kreis 5.stl')]);
  assert.equal(v.asm.items.find(i => i.label === 'Kreis 5').group, 'coolMov');
  /* Eine GLB ersetzt die Form. */
  const { root: other } = await boxDie([{ id: 'fixHalf', mat: 'steel', size: 100, side: 'fix' }]);
  globalThis.__TEST_GLTF = other;
  drop([glb('andere.glb')]);
  await v.pending;
  await wait(() => v.state.ready);
  assert.equal(v.asm.items.length, 1, 'die neue Form steht');
  assert.equal(ui('part-name').textContent, 'andere.glb');
});

test('voreingestellte Farben folgen dem Farbschema, gewählte bleiben', async () => {
  const { root } = await legacyDie();
  const P = await openForm('farbschema', root);
  const { v, rowOf, shell } = P;
  /* Wie im Browser: Palette und Schemata; ein Wechsel meldet sich am Dokument. */
  const require = createRequire(import.meta.url);
  globalThis.window = globalThis;
  const Pal = require(resolve(ROOT, '..', '..', 'shared', 'palette.js'));
  const S = require(resolve(ROOT, '..', '..', 'shared', 'schemes.js'));
  const M = await import(MOD + 'materials.js');
  const asm = v.asm;
  const mat = id => root.getObjectByName(id).children[0].material;
  const near = (a, b) => [1, 3, 5].every(i => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 1);
  const hexOf = m => '#' + m.color.getHexString();
  try {
    /* Eine Datei ohne Metadaten: die Teile der Registry tragen deren Rollen,
       auch wenn ihre Materialien etwas anderes mitbrachten. */
    assert.equal(asm.itemOf('castPart').role, 'melt');
    assert.ok(near(hexOf(mat('castPart')), Pal.melt), 'das Gussteil ist Schmelze: ' + hexOf(mat('castPart')));
    assert.ok(asm.setColor('coolFixL', '#00ff00'));
    S.set('graphit');
    const k = S.colors('graphit');
    assert.notEqual(k.melt, S.colors('teal').melt, 'Graphit hat eine eigene Schmelze');
    assert.equal(asm.itemOf('castPart').color, k.melt, 'die Voreinstellung folgt dem Schema');
    assert.ok(near(hexOf(mat('castPart')), k.melt), 'samt Material');
    assert.equal(asm.groupOf('cast').color, k.melt, 'und die Gruppe');
    assert.equal(asm.itemOf('coolFixL').color, '#00ff00', 'eine gewählte Farbe bleibt');
    assert.equal(mat('coolFixL').color.getHexString(), '00ff00');
    assert.equal(rowOf('castPart').querySelector('.dot').style.background, k.melt, 'die Liste zeichnet neu');
    assert.equal(rowOf('coolFixL').querySelector('.dot').style.background, '#00ff00');
    assert.equal(M.classColor('plunger'), k.piston, 'der Kolben ist Kolben');
    /* Die Schnittflächen tragen die Farbe ihres Teils, auch nach dem Wechsel. */
    shell.setMode('schnitt');
    const cap = v.view.scene.children.find(o => o.userData && o.userData.capOf === 'castPart');
    assert.ok(cap && near(hexOf(cap.material), k.melt), 'die Schnittfläche folgt');
    S.set('teal');
    assert.ok(near(hexOf(cap.material), Pal.melt), 'und zurück');
  } finally {
    S.set('teal');
  }
});
