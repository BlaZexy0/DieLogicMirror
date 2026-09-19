/* Überlaufdesigner im gemeinsamen Rahmen: setzen über die Chips, ziehen,
   drehen, neu setzen, Kanalpunkte, Datei — und was der Rahmen dazugibt:
   Rückgängig, „Entfernen" ohne Nachfrage, ungespeicherter Plan. Die Fälle
   stammen aus viewer.test.mjs und wurden auf data-ui, Chips und das
   Auswahlfeld übertragen.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/ueberlauf.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mountPage, kpiText } from './fixture.mjs';

let P, T3, G, it, cam, canvas, b, c;
const zeiger = (t, x, y, extra = {}) => canvas.dispatch(t, { button: 0, clientX: x, clientY: y, stopPropagation() {}, preventDefault() {}, ...extra });
const klick = (x, y) => { zeiger('pointerdown', x, y); zeiger('pointerup', x, y); };
const px = p => { const q = new T3.Vector3(...p).project(cam); return [(q.x + 1) / 2 * 800, (1 - q.y) / 2 * 600]; };
const schauAuf = (from, to) => { cam.position.set(...from); cam.up.set(0, 1, 0); cam.lookAt(...to); cam.updateMatrixWorld(true); P.v.view.scene.updateMatrixWorld(true); };
const chip = id => P.doc.querySelector('[data-chip="' + id + '"]');
const param = k => P.ui('sel-params').querySelector('[data-param="' + k + '"]');
const griff = id => P.v.handles.group.children.find(m => m.userData && m.userData.id === id);
const taste = (key, extra = {}) => P.doc.dispatch('keydown', { key, target: canvas, preventDefault() {}, ...extra });
const anzahl = () => Object.keys(P.v.state.plan.items).length;

before(async () => {
  P = await mountPage('ueberlauf.html', 'js/studio/pages/ueberlauf.js');
  T3 = await import('three');
  G = await import('../../../../web/tools/3d-studio/js/vents/model.js');
  cam = P.v.view.camera;
  canvas = P.v.view.renderer.domElement;
  b = P.host.part.model.bounds;
  c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
});

test('Rahmen: Modi, Chips je Art, leerer Plan, nichts Ungespeichertes', () => {
  const { doc, v, ui, shell, host } = P;
  assert.ok(v.state.ready && host.part.model, 'das Beispielteil steht');
  assert.ok(v.partMesh.visible);
  assert.deepEqual(doc.querySelectorAll('[role="tab"]').map(t => t.getAttribute('data-mode')), ['elemente', 'volumen']);
  assert.equal(shell.mode, 'elemente', 'die Seite beginnt dort, wo gearbeitet wird');
  assert.match(ui('part-name').textContent, /Getriebedeckel/);
  assert.equal(anzahl(), 0, 'ohne Plan keine Elemente');
  assert.deepEqual(doc.querySelectorAll('[data-chip]').map(x => x.getAttribute('data-chip')), Object.keys(G.TYPES), 'ein Chip je Art');
  assert.ok(!ui('chips').hidden);
  assert.ok(ui('inspector').hidden, 'ohne Auswahl kein Auswahlfeld');
  assert.ok(!ui('item-empty').hidden, '„Noch nichts gesetzt."');
  assert.match(kpiText(ui('plan-kpis')), /Bauteil.*Überläufe \(0\).*Gesamt/, 'das Bauteilvolumen steht da');
  assert.ok(ui('primary').hidden, 'kein Hauptknopf: gesetzt wird über die Chips');
  assert.ok(!ui('undo-group').hidden && ui('undo').disabled, 'Rückgängig ist da und hat nichts zu tun');
  assert.equal(ui('save-state').textContent, '', 'nichts Ungespeichertes');
  assert.ok(v.view.axes, 'das Achsenkreuz hängt an der Szene');
  assert.equal(doc.querySelector('[data-ui="opacity"]').value, '100', 'das Bauteil ist deckend');
});

test('Setzen: Chip wählen, aufs Bauteil klicken — die Bohne wächst nach außen', () => {
  const { v, ui, shell } = P;
  /* Die Kamera schaut von +X waagerecht auf die Bauteilmitte — der Strahl
     trifft eine Wand, die Bohne wächst entlang deren Normale nach außen (+X). */
  schauAuf([b.max[0] + 400, c[1], c[2]], c);
  chip('bohne').dispatch('click');
  assert.ok(v.handles.aiming, 'der Zielmodus ist scharf');
  assert.ok(chip('bohne').classList.contains('active'), 'der Chip zeigt, was gesetzt wird');
  assert.ok(!P.doc.getElementById('aim-banner').classList.contains('hidden'));
  klick(400, 300);
  assert.ok(!v.handles.aiming, 'der Treffer setzt die Bohne');
  assert.ok(!chip('bohne').classList.contains('active'));
  assert.equal(anzahl(), 1);
  it = Object.values(v.state.plan.items)[0];
  assert.equal(it.type, 'bohne');
  assert.ok(it.pos[0] > c[0], 'auf der +X-Seite des Bauteils: ' + it.pos);
  assert.ok(it.dir[0] > 0.9, 'sie wächst nach außen, entlang der Wandnormalen: ' + it.dir);
  assert.equal(v.handles.selected, it.id, 'und ist gewählt');
  assert.ok(!ui('inspector').hidden, 'das Auswahlfeld steht neben dem Bild');
  assert.match(ui('inspector-title').innerHTML, /Überlaufbohne/);
  assert.ok(param('wellD'), 'die Maße der Art stehen im Feld');
  /* Die Maße in Gruppen: eine Reiterzeile, darunter nur die gewählte Gruppe. */
  const reiter = ui('sel-groups').querySelectorAll('[data-group-tab]');
  assert.deepEqual(reiter.map(r => r.getAttribute('data-group-tab')), ['Steg', 'Bohne', 'Details']);
  assert.ok(!param('stegW').closest('[data-group]').hidden, 'die erste Gruppe (Steg) ist zu sehen');
  assert.ok(param('wellD').closest('[data-group]').hidden, 'die zweite nicht');
  assert.ok(ui('sel-facts').hidden, 'und die Details auch nicht');
  reiter[1].dispatch('click');
  assert.ok(param('stegW').closest('[data-group]').hidden && !param('wellD').closest('[data-group]').hidden, 'ein Klick auf Bohne wechselt');
  reiter[2].dispatch('click');
  assert.ok(!ui('sel-facts').hidden && param('wellD').closest('[data-group]').hidden, 'Details zeigt die abgeleiteten Zahlen');
  reiter[0].dispatch('click');
  assert.match(kpiText(ui('plan-kpis')), /Überläufe \(1\)/);
  assert.equal(P.doc.querySelector('[data-badge="elemente"]').textContent, '1', 'der Reiter zählt mit');
  assert.equal(ui('item-list').querySelectorAll('[data-item]').length, 1, 'und die Liste nennt es');
  assert.ok(ui('item-empty').hidden);
  assert.ok(v.group.children.some(m => m.visible && m.geometry.attributes.position && m.geometry.attributes.position.count > 0), 'ein Körper steht im Viewport');
  /* Der Rahmen: ein Schritt im Verlauf, der Plan ist ungespeichert. */
  assert.ok(!ui('undo').disabled, 'Rückgängig hat etwas zu tun');
  assert.match(ui('undo').title, /Überlaufbohne .* gesetzt/);
  assert.equal(ui('save-state').textContent, 'Ungespeichert');
  assert.equal(shell.mode, 'elemente', 'das Setzen wechselt den Modus nicht');
});

test('Rückgängig und Wiederholen: der Plan geht hin und her, die Auswahl folgt', () => {
  const { v, ui, host } = P;
  const id = it.id;
  ui('undo').dispatch('click');
  assert.equal(anzahl(), 0, 'zurück: nichts gesetzt');
  assert.equal(v.handles.selected, null);
  assert.ok(ui('inspector').hidden);
  assert.ok(ui('undo').disabled && !ui('redo').disabled);
  taste('y', { ctrlKey: true });
  assert.equal(anzahl(), 1, 'Strg+Y holt sie wieder');
  assert.ok(v.state.plan.items[id], 'mit derselben Kennung');
  it = v.state.plan.items[id];
  v.handles.select(id);
  assert.ok(host.history.canUndo && !host.history.canRedo);
});

test('Ziehen: in der Tangentialebene der Wand — ein Zug ist EIN Schritt', async () => {
  const { v, host } = P;
  /* Schräg von oben auf den Punkt geschaut — genau entlang der Normalen läge
     der Pfeil vor der Kugel und der Klick träfe ihn; so liegt er daneben. */
  schauAuf([it.pos[0] + 300, it.pos[1] + 300, it.pos[2]], it.pos);
  const p0 = it.pos.slice();
  const tiefe = host.history.depth;
  const [hx, hy] = px(it.pos);
  zeiger('pointerdown', hx, hy);
  assert.ok(v.handles.dragging, 'der Zug beginnt am Punkt');
  zeiger('pointermove', hx + 35, hy);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointermove', hx + 70, hy);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', hx + 70, hy);
  assert.ok(Math.hypot(it.pos[1] - p0[1], it.pos[2] - p0[2]) > 5, 'der Punkt wandert auf der Wand: ' + p0 + ' → ' + it.pos);
  /* Die Wand hat 1,5° Schräge: in x nur, was die Schräge zum Weg in z
     vorgibt — plus ein Zehntel für die Facetten der Wandfläche. */
  assert.ok(Math.abs(it.pos[0] - p0[0]) <= Math.abs(it.pos[2] - p0[2]) * Math.tan(1.5 * Math.PI / 180) + 0.1, 'aber nicht von ihr weg: ' + p0 + ' → ' + it.pos);
  assert.equal(host.history.depth, tiefe + 1, 'viele Mausschritte, ein Eintrag');
  assert.equal(host.history.undoLabel, 'Element verschoben');
});

test('Drehen um die Normale: ein Regler, ein Schritt', () => {
  const { ui, host } = P;
  const d0 = G.frameOf(it).d.slice(), n0 = it.dir.slice();
  const tiefe = host.history.depth;
  const rot = ui('sel-rot');
  for (const w of ['30', '60', '90']) { rot.value = w; rot.dispatch('input'); }
  assert.equal(it.rot, 90);
  const f = G.frameOf(it);
  assert.deepEqual(f.n, n0, 'oben bleibt die Wandnormale');
  assert.ok(Math.abs(f.d[0] * d0[0] + f.d[1] * d0[1] + f.d[2] * d0[2]) < 1e-9, 'längs um 90° gedreht: ' + f.d);
  assert.ok(Math.abs(f.d[0] * n0[0] + f.d[1] * n0[1] + f.d[2] * n0[2]) < 1e-9, 'und noch in der Wand');
  assert.match(ui('sel-rot-val').textContent, /90/);
  assert.equal(host.history.depth, tiefe + 1, 'drei Reglerschritte, ein Eintrag');
});

test('Neu setzen: der Pfeil zielt, der Klick versetzt das Element samt Richtung', () => {
  const { v, doc } = P;
  schauAuf([b.max[0] + 400, c[1], c[2] + 20], [c[0], c[1], c[2] + 20]);
  v.rebuild();
  v.view.scene.updateMatrixWorld(true);
  assert.ok(v.handles.arrowTip(it.id), 'die Bohne trägt einen Pfeil');
  v.handles.aimFor(it.id);
  assert.ok(v.handles.aiming, 'der Pfeil zielt');
  assert.match(doc.getElementById('aim-text').textContent, /neue Stelle/);
  klick(400, 300);
  assert.ok(!v.handles.aiming);
  assert.ok(Math.abs(it.pos[2] - (c[2] + 20)) < 1e-6, 'versetzt: ' + it.pos);
  assert.equal(it.rot, 90, 'die Drehung bleibt');
  /* Esc bricht ein begonnenes Zielen ab — und nur das. */
  v.handles.aimFor(it.id);
  taste('Escape');
  assert.ok(!v.handles.aiming, 'Esc bricht das Zielen ab');
  assert.equal(v.handles.selected, it.id, 'die Auswahl bleibt dabei stehen');
});

test('Art wechseln, Maß ändern — das Volumen zieht nach, Grenzen werden angesagt', () => {
  const { ui } = P;
  const typeSel = ui('sel-type');
  typeSel.value = 'entlueftet';
  typeSel.dispatch('change');
  assert.equal(it.type, 'entlueftet');
  const vh = param('ventH');
  assert.ok(vh, 'der Kanal hat eine Höhe');
  const before = kpiText(ui('plan-kpis'));
  vh.value = '0,4';
  vh.dispatch('change');
  assert.equal(it.p.ventH, 0.4);
  assert.notEqual(kpiText(ui('plan-kpis')), before, 'mehr Kanal, mehr Volumen');
  assert.ok(param('draft') && param('wellR'), 'Schräge und Radius stehen im Feld');
  assert.ok(!param('ventL'), 'der Kanal hat keine Länge als Maß');
  /* Über die Grenze hinaus: geklemmt, und das Feld sagt es. */
  const max = G.PARAM_META.ventH.max;
  vh.value = String(max * 10).replace('.', ',');
  vh.dispatch('change');
  assert.equal(it.p.ventH, max, 'auf die Obergrenze geklemmt');
});

test('Entlüftungskanal: Kugel am Bohnenende, Punkte anhängen, in der Wandebene ziehen, Entf', async () => {
  const { v, ui } = P;
  assert.ok(griff(it.id + ':v0'), 'die Kugel am Bohnenende');
  assert.ok(griff(it.id + ':v1'), 'und der erste Kanalpunkt');
  assert.ok(!v.handles.arrowTip(it.id + ':v1'), 'ein Kanalpunkt hat keinen Pfeil');
  assert.ok(ui('vent-block').hidden, 'das Kanalfeld gehört zur Gruppe Kanal');
  ui('sel-groups').querySelector('[data-group-tab="Kanal"]').dispatch('click');
  assert.ok(!ui('vent-block').hidden, 'dort ist es da');
  ui('vent-add').dispatch('click');
  assert.equal(it.vent.length, 2, '+ Punkt hängt einen an');
  assert.equal(v.handles.selected, it.id + ':v2', 'und wählt ihn');
  assert.match(ui('inspector-title').innerHTML, /Kanalpunkt 2/);
  assert.match(ui('vent-note').textContent, /2 Punkte/);
  const w1 = G.ventWorld(it);
  const g0 = griff(it.id + ':v0').position;
  assert.ok(Math.hypot(w1.exit[0] - g0.x, w1.exit[1] - g0.y, w1.exit[2] - g0.z) < 1e-9, 'die Kugel sitzt am Bohnenende');

  const q0 = w1.points[1].slice(), e0 = it.pos.slice();
  schauAuf([q0[0] + 300, q0[1] + 300, q0[2]], q0);
  v.rebuild();
  v.view.scene.updateMatrixWorld(true);
  const [qx, qy] = px(q0);
  zeiger('pointerdown', qx, qy);
  assert.ok(v.handles.dragging, 'der Zug beginnt am Kanalpunkt');
  zeiger('pointermove', qx + 60, qy - 25);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', qx + 60, qy - 25);
  const q1 = G.ventWorld(it).points[1];
  const n1 = it.dir;
  const ausDerEbene = q => Math.abs((q[0] - it.pos[0]) * n1[0] + (q[1] - it.pos[1]) * n1[1] + (q[2] - it.pos[2]) * n1[2]);
  assert.ok(Math.hypot(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]) > 5, 'der Punkt wandert: ' + q0 + ' → ' + q1);
  assert.ok(ausDerEbene(q1) < 1e-6, 'aber in der Wandebene des Elements');
  assert.deepEqual(it.pos, e0, 'das Element selbst blieb, wo es war');
  /* Das Lagefeld zeigt den Punkt und setzt ihn — in die Ebene gelotet. */
  assert.equal(ui('sel-x').value, q1[0].toFixed(1).replace('.', ',').replace(/,0$/, ''));
  const sy = ui('sel-y');
  sy.value = String(Math.round(q1[1] + 30));
  sy.dispatch('change');
  const q2 = G.ventWorld(it).points[1];
  assert.ok(Math.abs(q2[1] - Math.round(q1[1] + 30)) < 0.5, 'nach y versetzt: ' + q2);
  assert.ok(ausDerEbene(q2) < 1e-6, 'und noch in der Ebene');

  /* Entf entfernt den gewählten Punkt, nicht das Element; der letzte bleibt. */
  taste('Delete');
  assert.equal(it.vent.length, 1, 'ein Punkt weniger');
  assert.ok(v.state.plan.items[it.id], 'das Element steht noch');
  assert.equal(v.handles.selected, it.id + ':v1');
  assert.ok(ui('vent-del').disabled, 'der letzte Punkt lässt sich nicht entfernen');
  assert.ok(ui('del-item').disabled, 'auch „Punkt entfernen" ist aus');
  taste('Delete');
  assert.equal(it.vent.length, 1, 'er bleibt');
  assert.ok(v.state.plan.items[it.id], 'und das Element auch — Entf auf dem letzten Punkt entfernt nicht die Bohne');
  ui('vent-add').dispatch('click');
  ui('vent-del').dispatch('click');
  assert.equal(it.vent.length, 1, '− Punkt nimmt ihn wieder weg');
  /* Das Bohnenende sitzt fest: seine Lage ist nicht einzugeben. */
  v.handles.select(it.id + ':v0');
  assert.ok(ui('sel-x').disabled, 'das Lagefeld des Bohnenendes ist gesperrt');
  v.handles.select(it.id);
  assert.ok(!ui('sel-x').disabled);
});

test('Liste und Auswahlfeld: ein Klick in der Liste wählt, ✕ und Esc heben die Auswahl auf', () => {
  const { v, ui } = P;
  v.handles.select(null);
  assert.ok(ui('inspector').hidden);
  ui('item-list').querySelector('[data-item="' + it.id + '"]').dispatch('click');
  assert.equal(v.handles.selected, it.id, 'die Liste wählt');
  assert.ok(ui('item-list').querySelector('[data-item="' + it.id + '"]').classList.contains('active'));
  ui('inspector-close').dispatch('click');
  assert.equal(v.handles.selected, null, '✕ hebt die Auswahl auf');
  v.handles.select(it.id);
  taste('Escape');
  assert.equal(v.handles.selected, null, 'Esc auch');
});

test('Datei hin und zurück; Entfernen fragt nicht und lässt sich zurückholen', () => {
  const { v, ui, host, tool } = P;
  const json = JSON.parse(JSON.stringify(tool.toJSON()));
  assert.equal(json.format, 'dielogic-luft');
  assert.equal(json.items[0].vent.length, 1, 'der Kanal steht in der Datei');
  tool.fromJSON(json);
  assert.equal(anzahl(), 1);
  assert.ok(griff(it.id + ':v0') && griff(it.id + ':v1'), 'Kugeln nach dem Laden');
  assert.ok(tool.exports[0].enabled(), 'der STL-Export ist frei');

  v.handles.select(it.id);
  assert.equal(ui('del-item').textContent, 'Entfernen');
  ui('del-item').dispatch('click');
  assert.equal(anzahl(), 0, 'entfernt — ohne Nachfrage');
  assert.equal(v.handles.selected, null);
  assert.ok(ui('inspector').hidden);
  assert.ok(!tool.exports[0].enabled(), 'ohne Elemente kein STL');
  const toast = ui('toast');
  assert.ok(!toast.hidden, 'ein Toast sagt, was weg ist');
  assert.match(toast.textContent, /entfernt/);
  toast.querySelector('.st-toast-act').dispatch('click');
  assert.equal(anzahl(), 1, '„Rückgängig" im Toast holt es zurück');
  assert.ok(host.history.canRedo);
  assert.equal(v.handles.selected, it.id, 'und was zurückkommt, ist gewählt — Entf träfe es wieder');
  /* Der Toast gehört zu SEINEM Schritt: bewegt sich der Verlauf, ist er weg —
     sonst nähme sein Knopf später einen ganz anderen Schritt zurück. */
  ui('del-item').dispatch('click');
  assert.ok(!toast.hidden);
  ui('undo').dispatch('click');
  assert.ok(toast.hidden, 'nach dem Rückgängig steht kein alter Toast mehr da');
  assert.equal(anzahl(), 1);
  it = v.state.plan.items[it.id];
});

test('Ohne Bauteil sagt der Chip, was fehlt — und ein neues Bauteil beginnt leer', async () => {
  const { v, ui, host, tool } = P;
  const model = host.part.model;
  host.part.model = null;
  chip('schlitz').dispatch('click');
  assert.ok(!v.handles.aiming);
  assert.match(ui('toast').textContent, /Bauteil laden/);
  host.part.model = model;

  assert.equal(anzahl(), 1);
  await tool.onPart(model, 'anderes');
  assert.equal(anzahl(), 0, 'ein Element sitzt auf der Wand EINES Bauteils');
  assert.ok(!host.history.canUndo, 'und der Verlauf beginnt neu');
});
