/* Temperierkanal-Designer im gemeinsamen Rahmen: Abstandsfläche beim Laden
   (als Rechnung mit Abbruch), setzen über die Chips, Achsenpfeile,
   Automatik, Datei — und was neu ist: der Mindest-Wandabstand, gegen den
   geprüft wird (Vorgaben warnen nicht mehr), die Liste derer, die ihn
   unterschreiten, Rückgängig, „Entfernen" ohne Nachfrage, Entwurf. Die
   Fälle stammen aus viewer.test.mjs und wurden auf data-ui, Chips und das
   Auswahlfeld übertragen.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/temperier.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mountPage, kpiText, wait } from './fixture.mjs';

const C = await import('../../../../web/tools/3d-studio/js/part/colors.js');

let P, T3, G, F, A, cam, canvas, b, c;
const zeiger = (t, x, y, extra = {}) => canvas.dispatch(t, { button: 0, clientX: x, clientY: y, stopPropagation() {}, preventDefault() {}, ...extra });
const klick = (x, y) => { zeiger('pointerdown', x, y); zeiger('pointerup', x, y); };
const px = p => { const q = new T3.Vector3(...p).project(cam); return [(q.x + 1) / 2 * 800, (1 - q.y) / 2 * 600]; };
const schauAuf = (from, to) => { cam.position.set(...from); cam.up.set(0, 1, 0); cam.lookAt(...to); cam.updateMatrixWorld(true); P.v.view.scene.updateMatrixWorld(true); };
const chip = id => P.doc.querySelector('[data-chip="' + id + '"]');
const pop = name => P.doc.querySelector('[data-ui="' + name + '"]');
const taste = (key, extra = {}) => P.doc.dispatch('keydown', { key, target: canvas, preventDefault() {}, ...extra });
const items = () => Object.values(P.v.state.plan.items);
const autos = () => items().filter(i => i.auto);
const ruhig = () => wait(() => !P.v.state.queued && !P.v.state.running && P.v.state.ready, 1200);
const richtung = r => P.ui('dir-seg').querySelectorAll('button').find(x => x.dataset.value === r).dispatch('click');
const tippen = (name, text) => { const el = P.ui(name); el.value = text; el.dispatch('change'); };
/* Ein anderes Beispielteil, wie über die Auswahl in der Bauteil-Klappe. */
const teil = id => { P.doc.getElementById('demo-select').value = id; return P.host.part.pickDemo(id); };

before(async () => {
  P = await mountPage('temperier.html', 'js/studio/pages/temperier.js');
  T3 = await import('three');
  G = await import('../../../../web/tools/3d-studio/js/cooling/model.js');
  F = await import('../../../../web/tools/3d-studio/js/part/field.js');
  A = await import('../../../../web/tools/3d-studio/js/cooling/auto.js');
  cam = P.v.view.camera;
  canvas = P.v.view.renderer.domElement;
  b = P.host.part.model.bounds;
  c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
});

test('Rahmen: Modi, Chips, die Abstandsfläche steht nach dem Laden, leerer Plan', () => {
  const { doc, v, ui, shell, host } = P;
  assert.ok(v.state.ready && host.part.model, 'das Beispielteil steht');
  assert.ok(v.state.model === host.part.model, 'der Testgriff kennt das Bauteil');
  assert.deepEqual(doc.querySelectorAll('[role="tab"][data-mode]').map(t => t.getAttribute('data-mode')), ['flaeche', 'setzen', 'pruefung']);
  assert.equal(ui('auto-spacing').value, '30', 'die Vorgabe des Mindestabstands liegt auf dem Boden 1,5 × Ø 20');
  assert.equal(shell.mode, 'setzen', 'die Seite beginnt dort, wo gearbeitet wird');
  assert.match(ui('part-name').textContent, /Getriebedeckel/);
  assert.ok(v.state.field && v.state.shellDist === 20, 'die Abstandsfläche im Abstand 20 mm ist gerechnet');
  assert.ok(v.shellMesh.visible && v.shellMesh.geometry.attributes.position.count > 0, 'und steht im Viewport');
  assert.ok(!v.state.stale && !v.state.running);
  assert.ok(host.field.data === v.state.field, 'das Feld gehört dem Gastgeber');
  assert.ok(v.state.field.band >= 20 * 1.3 + 5 - 1e-6, 'das Band deckt den Achsabstand');
  assert.match(kpiText(ui('shell-kpis')), /Fläche im Abstand\s*20 mm/);
  assert.match(ui('shell-facts').innerHTML, /Dreiecke der Fläche.*Zellkante/s);
  /* Zellkante in mm — Vorgabe ein 64stel der längsten Bauteilkante, auf halbe Millimeter. */
  const longest = Math.max(...v.state.model.bounds.size);
  assert.ok(Math.abs(v.state.h - Math.round(longest / 64 * 2) / 2) < 1e-9, 'Vorgabe der Zellkante: ' + v.state.h);
  assert.equal(ui('cell').value, String(v.state.h).replace('.', ','));
  assert.ok(Math.abs(v.state.field.h - v.state.h) < 1e-9, 'das Feld hat diese Zellkante');
  assert.equal(ui('res'), null, 'kein Auflösungsregler');
  /* Der Rahmen. */
  assert.deepEqual(doc.querySelectorAll('[data-chip]').map(x => x.getAttribute('data-chip')), ['stich', 'kanal']);
  assert.equal(chip('kanal').textContent, 'Kanal (2 Punkte)');
  assert.ok(!chip('stich').classList.contains('off'), 'setzen ist frei');
  assert.equal(items().length, 0, 'ohne Plan keine Elemente');
  assert.ok(ui('inspector').hidden, 'ohne Auswahl kein Auswahlfeld');
  assert.equal(ui('primary').textContent, 'Kühlstiche automatisch setzen');
  assert.ok(!ui('primary').hidden && !ui('primary').disabled);
  assert.ok(!ui('undo-group').hidden && ui('undo').disabled, 'Rückgängig ist da und hat nichts zu tun');
  assert.equal(ui('save-state').textContent, '', 'nichts Ungespeichertes');
  /* Mindest-Wandabstand: Auto = Achsabstand − Ø/2 der dicksten Vorgabe. */
  assert.ok(ui('min-wall-auto').checked && ui('min-wall').disabled);
  assert.equal(ui('min-wall').value, '10');
  assert.equal(ui('dist-val').textContent, '20 mm');
});

test('Darstellung: durchscheinend oder deckend — ein Häkchen, ein Material', () => {
  const { v } = P;
  assert.ok(v.shellMesh.material.transparent && v.shellMesh.material.opacity < 0.5 && !v.shellMesh.material.depthWrite, 'voreingestellt durchscheinend');
  const clear = pop('shell-clear');
  assert.ok(clear && clear.checked, 'das Häkchen steht in der Darstellung');
  clear.checked = false; clear.dispatch('change');
  assert.ok(!v.shellMesh.material.transparent && v.shellMesh.material.opacity === 1 && v.shellMesh.material.depthWrite, 'deckend: undurchsichtig und in die Tiefe schreibend');
  assert.ok(v.shellMesh.visible, 'und noch zu sehen');
  clear.checked = true; clear.dispatch('change');
  assert.ok(v.shellMesh.material.transparent && v.shellMesh.material.opacity < 0.5, 'und wieder durchscheinend');
  assert.equal(pop('opacity').value, '100', 'das Bauteil ist deckend');
});

test('Modi besitzen ihr Bild: die Abstandsfläche gehört „Abstandsfläche" und „Setzen"', () => {
  const { v, shell } = P;
  for (const [m, soll] of [['flaeche', true], ['pruefung', false], ['setzen', true]]) {
    shell.setMode(m);
    assert.equal(v.shellMesh.visible, soll, m);
    assert.ok(v.partMesh.visible, 'das Bauteil steht in jedem Modus');
  }
  assert.match(P.doc.getElementById('pt-legend').innerHTML, /Abstandsfläche/);
  shell.setMode('pruefung');
  assert.doesNotMatch(P.doc.getElementById('pt-legend').innerHTML, /Abstandsfläche/, 'die Legende nennt nur, was im Bild ist');
  assert.doesNotMatch(P.doc.getElementById('pt-legend').innerHTML, /zu nah/, 'die Warnfarbe erst, wenn etwas zu nah steht');
  shell.setMode('setzen');
});

/* Die Achsen zweier Stiche: wie nah sie sich irgendwo kommen. */
const achsen = list => {
  let best = Infinity;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = G.axisOf(list[i]), q = G.axisOf(list[j]);
    best = Math.min(best, Math.sqrt(A.segmentDist2(p.a, p.b, q.a, q.b)));
  }
  return best;
};

test('Automatik mit den Vorgaben auf dem Vorgabeteil: nichts unter dem Mindest-Wandabstand — und ein zweiter Lauf stapelt nichts', () => {
  const { v, ui, host, shell } = P;
  /* So, wie die Seite startet: Normale, acht Stiche, 30 mm. Früher standen
     davon zwei unter dem Mindest-Wandabstand (einer bei 0,5 mm): in der Tasche
     des Deckels lief der 200-mm-Stich quer hinüber auf einen Dom zu. */
  assert.equal(shell.mode, 'setzen');
  assert.deepEqual([v.state.dirMode, v.state.auto.count, v.state.auto.spacing, v.state.auto.replace], ['normal', 8, 30, true]);
  ui('primary').dispatch('click');
  assert.equal(autos().length, 8, 'acht Kühlstiche');
  for (const a of autos()) {
    const ch = v.state.checks.get(a.id);
    assert.equal(ch.verdict, 'ok', 'was mit den Vorgaben gesetzt wird, gilt nie als zu nah: ' + a.id + ' bei ' + ch.c);
  }
  assert.equal(v.offenders().length, 0);
  assert.equal(ui('note').textContent, '8 Kühlstiche gesetzt', 'nichts darunter, nichts zu melden');
  assert.ok(achsen(autos()) >= 30 - 1e-9, 'die Achsen halten den Stichabstand: ' + achsen(autos()));
  /* Ohne „Ersetzen": neben die ersten, nicht auf sie. Früher kamen dieselben
     acht Stellen noch einmal — acht Stiche doppelt. */
  const rep = ui('auto-replace');
  rep.checked = false; rep.dispatch('change');
  ui('primary').dispatch('click');
  assert.ok(autos().length > 8, 'es kamen weitere dazu: ' + autos().length);
  assert.ok(achsen(autos()) >= 30 - 1e-9, 'keiner auf oder neben einem von vorhin: ' + achsen(autos()));
  assert.ok(autos().every(a => v.state.checks.get(a.id).verdict === 'ok'), 'und alle halten den Mindest-Wandabstand');
  assert.match(ui('note').textContent, /^\d+ Kühlstiche gesetzt/);
  assert.doesNotMatch(ui('note').textContent, /unter dem Mindest-Wandabstand/);
  rep.checked = true; rep.dispatch('change');
  host.undo(); host.undo();
  assert.equal(items().length, 0, 'zurück zum leeren Plan');
  /* Ein eigener Mindest-Wandabstand über Achsabstand − Ø/2: keine Stelle hält
     ihn — es wird nichts gesetzt, und die Zeile sagt warum. */
  const auto = ui('min-wall-auto');
  auto.checked = false; auto.dispatch('change');
  tippen('min-wall', '15');
  ui('primary').dispatch('click');
  assert.equal(items().length, 0, 'nichts, was die Prüfung nicht bestünde');
  assert.equal(ui('note').textContent, '0 Kühlstiche gesetzt · keine Stelle hält den Mindest-Wandabstand von 15 mm: an der Spitze bleiben nur Achsabstand − Ø/2 = 10 mm');
  assert.ok(ui('note').classList.contains('warn'));
  host.undo(); host.undo();
  assert.ok(ui('min-wall-auto').checked && !Number.isFinite(v.state.plan.minWall), 'wieder „Auto"');
  /* 40 Stiche mit 80 mm Abstand passen nicht um den Deckel: es werden weniger —
     nie zwei zu nah —, und die Zeile sagt es. Früher kamen 40, und diese Zeile
     erschien nie. */
  const cnt = ui('auto-count'), sp = ui('auto-spacing');
  cnt.value = '40'; cnt.dispatch('input');
  sp.value = '80'; sp.dispatch('input');
  ui('primary').dispatch('click');
  assert.ok(autos().length < 40 && autos().length > 8, 'weniger als verlangt: ' + autos().length);
  assert.ok(achsen(autos()) >= 80 - 1e-9, 'keine zwei enger als 80 mm: ' + achsen(autos()));
  assert.match(ui('note').textContent, /nur so viele Stellen halten den Stichabstand: Abstand kleiner wählen oder weniger Bohrungen/);
  host.undo();
  assert.equal(items().length, 0);
  cnt.value = '8'; cnt.dispatch('input');
  sp.value = '30'; sp.dispatch('input');
});

let s1, k;
test('Kühlstich setzen: Spitze auf der Fläche, Stich nach außen — und die Vorgabe warnt NICHT', () => {
  const { v, ui, host } = P;
  /* Kamera von +X waagerecht auf die Bauteilmitte: der Strahl durch die
     Bildmitte trifft die Abstandsfläche vor der +X-Wand. */
  schauAuf([b.max[0] + 400, c[1], c[2]], c);
  chip('stich').dispatch('click');
  assert.ok(v.handles.aiming);
  assert.ok(chip('stich').classList.contains('active'), 'der Chip zeigt, was gesetzt wird');
  assert.match(P.doc.getElementById('aim-text').textContent, /auf die Abstandsfläche klicken; er läuft senkrecht zur Fläche/);
  klick(400, 300);
  assert.ok(!v.handles.aiming);
  assert.ok(!chip('stich').classList.contains('active'));
  assert.equal(items().length, 1);
  s1 = items()[0];
  assert.equal(s1.type, 'stich');
  /* Die +X-Wand des Getriebedeckels steht mit 1,5° Schräge unter dem
     Flansch, der bis b.max reicht — gemessen wird gegen die Wand auf
     Höhe der Bauteilmitte. */
  const wallX = 190 + c[2] * Math.tan(1.5 * Math.PI / 180);
  assert.ok(s1.p[0] > wallX + 15 && s1.p[0] < wallX + 25, 'die Spitze sitzt rund 20 mm vor der Wand: ' + s1.p);
  assert.ok(s1.dir[0] > 0.95, 'und der Stich läuft nach außen (+X): ' + s1.dir);
  assert.equal(s1.d, 20, 'Vorgabe Durchmesser'); assert.equal(s1.len, 200, 'Vorgabe Länge');
  assert.equal(v.handles.selected, s1.id);
  assert.ok(!ui('inspector').hidden);
  assert.match(ui('inspector-title').innerHTML, /Kühlstich/);
  /* Der Fehler von früher: Feldwert − Ø/2 gegen Abstand − h geprüft, also
     warnte jede Bohrung mit Vorgabemaßen. Jetzt zählt der Mindest-Wandabstand. */
  const ch = v.state.checks.get(s1.id);
  assert.ok(Math.abs(ch.c - 10) < 1, 'Wandabstand = Achsabstand − Ø/2: ' + ch.c);
  assert.equal(ch.verdict, 'ok');
  assert.match(kpiText(ui('sel-kpis')), /Wandabstand.*mm.*eingehalten/);
  assert.ok(ui('sel-kpis').querySelector('.krow.ok'), 'mit dem Urteil als Farbe');
  assert.ok(!ui('sel-len-row').hidden && !ui('sel-dir-row').hidden && ui('sel-both-row').hidden, 'Länge und Richtung beim Kühlstich, „beide Enden" nicht');
  assert.equal(ui('sel-dir').textContent, '+X');
  /* Gruppen als Reiter: Maße offen, Details zu. */
  const gruppe = n => ui('inspector-body').querySelector('[data-group="' + n + '"]');
  assert.ok(!gruppe('Maße').hidden && gruppe('Details').hidden);
  ui('sel-groups').querySelector('[data-group-tab="Details"]').dispatch('click');
  assert.ok(gruppe('Maße').hidden && !gruppe('Details').hidden);
  assert.match(ui('sel-facts').innerHTML, /Wasserinhalt/);
  ui('sel-groups').querySelector('[data-group-tab="Maße"]').dispatch('click');
  /* Der Rahmen: ein Schritt, ungespeichert. */
  assert.match(ui('undo').title, /Kühlstich .* gesetzt/);
  assert.equal(ui('save-state').textContent, 'Ungespeichert');
  assert.equal(host.history.depth, 1);
});

test('Richtung: entlang Z mit dem Vorzeichen vom Bauteil weg, „Blick" zur Kamera', () => {
  const { v } = P;
  richtung('z');
  assert.equal(v.state.dirMode, 'z');
  chip('stich').dispatch('click');
  klick(400, 300);
  const s2 = items()[1];
  assert.ok(Math.abs(Math.abs(s2.dir[2]) - 1) < 1e-9 && Math.abs(s2.dir[0]) < 1e-9, 'entlang Z: ' + s2.dir);
  richtung('blick');
  chip('stich').dispatch('click');
  klick(400, 300);
  assert.ok(items()[2].dir[0] > 0.99, 'zur Kamera: ' + items()[2].dir);
  richtung('normal');
});

test('„Normale" von innen: auch wenn die Kamera zwischen Fläche und Bauteil steht, läuft der Stich vom Bauteil weg', () => {
  const { v, host } = P;
  /* Die Kamera steht 8 mm vor der +X-Wand — diesseits der Abstandsfläche —
     und schaut nach außen: der Strahl trifft die Fläche von innen. Die
     Normale des Dreiecks, zum Betrachter gedreht, zeigte dann ins Bauteil. */
  const wallX = 190 + c[2] * Math.tan(1.5 * Math.PI / 180);
  schauAuf([wallX + 8, c[1], c[2]], [wallX + 300, c[1], c[2]]);
  chip('stich').dispatch('click');
  klick(400, 300);
  const s = items()[3];
  assert.ok(s && s.p[0] > wallX + 15, 'die Spitze sitzt auf der Fläche vor der Wand: ' + (s && s.p));
  assert.ok(s.dir[0] > 0.95, 'und der Stich läuft nach außen, nicht ins Bauteil: ' + s.dir);
  assert.equal(v.state.checks.get(s.id).verdict, 'ok');
  host.undo();
  assert.equal(items().length, 3);
  schauAuf([b.max[0] + 400, c[1], c[2]], c);
});

test('Kanal: zwei Klicks; Esc dazwischen bricht ab; derselbe Chip noch einmal auch', () => {
  const { v, ui, host } = P;
  const tiefe = host.history.depth;
  chip('kanal').dispatch('click');
  assert.match(P.doc.getElementById('aim-text').textContent, /erste Ende/);
  klick(400, 300);
  assert.ok(v.handles.aiming, 'nach dem ersten Punkt bleibt der Modus scharf');
  assert.match(P.doc.getElementById('aim-text').textContent, /andere Ende/);
  taste('Escape');
  assert.ok(!v.handles.aiming && v.state.pending === null, 'Esc bricht ab');
  assert.equal(items().length, 3, 'und nichts ist gesetzt');
  chip('kanal').dispatch('click');
  chip('kanal').dispatch('click');
  assert.ok(!v.handles.aiming, 'der Chip ein zweites Mal: doch nicht');

  chip('kanal').dispatch('click');
  klick(400, 300);
  klick(400, 240);
  assert.ok(!v.handles.aiming);
  k = items().find(i => i.type === 'kanal');
  assert.ok(k, 'der Kanal ist da');
  assert.ok(Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1], k.b[2] - k.a[2]) > 5, 'mit zwei verschiedenen Enden');
  assert.equal(v.handles.selected, k.id + ':b', 'das zweite Ende ist gewählt');
  assert.match(ui('inspector-title').innerHTML, /Ende B/);
  assert.equal(k.d, 10);
  assert.ok(ui('sel-len-row').hidden && ui('sel-dir-row').hidden && !ui('sel-both-row').hidden, 'beim Kanal „beide Enden" statt Länge und Richtung');
  assert.equal(host.history.depth, tiefe + 1, 'zwei Klicks, EIN Schritt');
});

test('Achsenpfeile: je Achse ziehen — ein Zug ist EIN Schritt, ein bloßer Klick keiner', async () => {
  const { v, ui, host } = P;
  v.view.scene.updateMatrixWorld(true);
  const tipY = v.handles.gizmoTip(1);
  assert.ok(tipY, 'die Achsenpfeile stehen am gewählten Ende');
  const [tx, ty] = px(tipY);
  const b0 = k.b.slice(), a0 = k.a.slice();
  const tiefe = host.history.depth;
  zeiger('pointerdown', tx, ty);
  assert.ok(v.handles.dragging, 'der Zug am Achsenpfeil beginnt');
  zeiger('pointermove', tx, ty - 20);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointermove', tx, ty - 40);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', tx, ty - 40);
  assert.ok(Math.abs(k.b[1] - b0[1]) > 3, 'y hat sich geändert: ' + b0 + ' → ' + k.b);
  assert.ok(Math.abs(k.b[0] - b0[0]) < 1e-9 && Math.abs(k.b[2] - b0[2]) < 1e-9, 'x und z nicht');
  assert.deepEqual(k.a, a0, 'das andere Ende blieb');
  assert.equal(host.history.depth, tiefe + 1, 'viele Mausschritte, ein Eintrag');
  assert.equal(host.history.undoLabel, 'Kanalende verschoben');
  assert.equal(ui('sel-y').value, k.b[1].toFixed(1).replace('.', ',').replace(/,0$/, ''), 'das Lagefeld zieht mit');

  /* Beide Enden bewegen: derselbe Versatz am anderen Ende. */
  const both = ui('sel-both');
  both.checked = true; both.dispatch('change');
  assert.equal(v.state.both, true);
  const b1 = k.b.slice(), a1 = k.a.slice();
  v.view.scene.updateMatrixWorld(true);
  const [tx2, ty2] = px(v.handles.gizmoTip(1));
  zeiger('pointerdown', tx2, ty2);
  zeiger('pointermove', tx2, ty2 - 30);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', tx2, ty2 - 30);
  const dy = k.b[1] - b1[1];
  assert.ok(Math.abs(dy) > 2, 'bewegt');
  assert.ok(Math.abs((k.a[1] - a1[1]) - dy) < 1e-9, 'das andere Ende ging mit: ' + (k.a[1] - a1[1]) + ' gegen ' + dy);
  assert.equal(host.history.undoLabel, 'Kanal verschoben');

  /* Ohne Pfeil rutscht der Punkt in der Bildebene: der Versatz steht
     senkrecht auf der Blickrichtung. Die Kamera schaut schräg, damit
     kein Achsenpfeil vor dem Punkt liegt. */
  both.checked = false; both.dispatch('change');
  schauAuf([b.max[0] + 400, c[1] + 250, c[2] + 150], c);
  v.rebuild();
  v.view.scene.updateMatrixWorld(true);
  const vd = new T3.Vector3(); cam.getWorldDirection(vd);
  const [bx, by] = px(k.b);
  const b2 = k.b.slice();
  zeiger('pointerdown', bx, by);
  assert.ok(v.handles.dragging);
  zeiger('pointermove', bx + 40, by);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', bx + 40, by);
  const delta = [k.b[0] - b2[0], k.b[1] - b2[1], k.b[2] - b2[2]];
  assert.ok(Math.hypot(...delta) > 3, 'der Punkt wandert: ' + delta);
  assert.ok(Math.abs(delta[0] * vd.x + delta[1] * vd.y + delta[2] * vd.z) < 1e-6, 'in der Bildebene, quer zum Blick');

  /* Ein Klick auf den Griff, ohne zu ziehen: gewählt, aber kein Schritt. */
  const tiefe2 = host.history.depth;
  v.view.scene.updateMatrixWorld(true);
  const [cx, cy] = px(k.b);
  klick(cx, cy);
  assert.equal(host.history.depth, tiefe2, 'wählen ist keine Änderung');
});

test('Esc mitten im Zug: das Ende springt zurück, und es gibt keinen Schritt', async () => {
  const { v, host, ui } = P;
  v.handles.select(k.id + ':b');
  v.view.scene.updateMatrixWorld(true);
  const [tx, ty] = px(v.handles.gizmoTip(1));
  const b0 = k.b.slice(), tiefe = host.history.depth, label = host.history.undoLabel;
  zeiger('pointerdown', tx, ty);
  assert.ok(v.handles.dragging, 'der Zug beginnt');
  zeiger('pointermove', tx, ty - 30);
  await new Promise(r => setTimeout(r, 30));
  assert.ok(Math.abs(v.state.plan.items[k.id].b[1] - b0[1]) > 2, 'das Ende wandert');
  taste('Escape');
  assert.ok(!v.handles.dragging, 'Esc beendet den Zug');
  k = v.state.plan.items[k.id];
  assert.ok(Math.hypot(k.b[0] - b0[0], k.b[1] - b0[1], k.b[2] - b0[2]) < 1e-3, 'das Ende steht, wo es war: ' + k.b);
  assert.equal(host.history.depth, tiefe, 'kein Schritt');
  assert.equal(host.history.undoLabel, label);
  assert.equal(v.handles.selected, k.id + ':b', 'die Auswahl bleibt');
  assert.equal(ui('sel-y').value, k.b[1].toFixed(1).replace('.', ',').replace(/,0$/, ''), 'das Lagefeld zeigt den alten Ort');
  zeiger('pointerup', tx, ty - 30);
  assert.equal(host.history.depth, tiefe, 'das Loslassen danach ist kein Zug mehr');
  /* Ohne Zug hebt Esc die Auswahl auf, wie bisher. */
  taste('Escape');
  assert.equal(v.handles.selected, null);
});

test('Rückgängig und Wiederholen: der Plan geht hin und her, die Auswahl bleibt', () => {
  const { v, ui, host } = P;
  const jetzt = k.b.slice();
  v.handles.select(k.id + ':b');
  ui('undo').dispatch('click');
  const k1 = v.state.plan.items[k.id];
  assert.ok(k1 && Math.hypot(k1.b[0] - jetzt[0], k1.b[1] - jetzt[1], k1.b[2] - jetzt[2]) > 3, 'der letzte Zug ist zurückgenommen');
  assert.equal(v.handles.selected, k.id + ':b', 'die Auswahl bleibt, wenn es sie noch gibt');
  taste('y', { ctrlKey: true });
  k = v.state.plan.items[k.id];
  assert.ok(Math.hypot(k.b[0] - jetzt[0], k.b[1] - jetzt[1], k.b[2] - jetzt[2]) < 1e-3, 'Strg+Y holt ihn wieder');
  /* Bis ganz zurück: leerer Plan; und wieder vor. */
  const tiefe = host.history.depth;
  for (let i = 0; i < tiefe; i++) taste('z', { ctrlKey: true });
  assert.equal(items().length, 0);
  assert.ok(ui('inspector').hidden && ui('undo').disabled && !ui('redo').disabled);
  for (let i = 0; i < tiefe; i++) host.redo();
  assert.equal(items().length, 4);
  k = v.state.plan.items[k.id];
  s1 = v.state.plan.items[s1.id];
});

test('Maße im Auswahlfeld: Durchmesser und Länge, geklemmt und angesagt; Lage je Achse', () => {
  const { v, host } = P;
  v.handles.select(s1.id);
  const tiefe = host.history.depth;
  tippen('sel-d', '12');
  assert.equal(s1.d, 12);
  assert.equal(host.history.undoLabel, 'Durchmesser geändert');
  assert.ok(Math.abs(v.state.checks.get(s1.id).c - 14) < 1, 'dünner heißt mehr Wand: ' + v.state.checks.get(s1.id).c);
  tippen('sel-len', '5000');
  assert.equal(s1.len, G.PARAM_META.len.max, 'auf die Obergrenze geklemmt');
  tippen('sel-len', '200');
  tippen('sel-d', '20');
  const z0 = s1.p[2];
  tippen('sel-z', String(Math.round(z0 + 12)));
  assert.equal(s1.p[2], Math.round(z0 + 12));
  assert.equal(host.history.undoLabel, 'Lage geändert');
  assert.equal(host.history.depth, tiefe + 5);
});

test('Automatik: N Stiche auf der Fläche, EIN Schritt; Vorgaben warnen nicht; der Boden 1,5 × Ø steht in der Zeile', () => {
  const { v, ui, host } = P;
  /* In der Form laufen Stiche entlang der Öffnungsrichtung. */
  richtung('z');
  const manualBefore = items().filter(i => !i.auto).length;
  const cnt = ui('auto-count');
  cnt.value = '5'; cnt.dispatch('input');
  assert.equal(v.state.auto.count, 5);
  const tiefe = host.history.depth;
  ui('primary').dispatch('click');
  assert.equal(autos().length, 5, 'fünf automatische Kühlstiche');
  assert.equal(items().filter(i => !i.auto).length, manualBefore, 'die von Hand gesetzten bleiben');
  assert.equal(host.history.depth, tiefe + 1, 'ein Lauf, ein Schritt');
  assert.match(host.history.undoLabel, /5 Kühlstiche automatisch gesetzt/);
  for (const a of autos()) {
    assert.ok(Math.abs(F.sampleField(v.state.field, ...a.p) - 20) < v.state.field.h * 1.5, 'auf der Abstandsfläche: ' + F.sampleField(v.state.field, ...a.p));
    assert.ok(Math.abs(Math.hypot(...a.dir) - 1) < 1e-9);
    assert.equal(a.d, 20); assert.equal(a.len, 200);
    assert.equal(v.state.checks.get(a.id).verdict, 'ok', 'was die Automatik mit Vorgaben setzt, steht nicht zu nah: ' + v.state.checks.get(a.id).c);
  }
  assert.match(ui('auto-facts').innerHTML, /mittlerer Abstand/);
  assert.match(ui('note').textContent, /5 Kühlstiche gesetzt/);
  assert.doesNotMatch(ui('note').textContent, /1,5 × Ø/, '30 mm liegen nicht unter 1,5 × 20');
  assert.equal(v.handles.selected, null);
  assert.ok(ui('inspector').hidden);
  cnt.value = '3'; cnt.dispatch('input');
  ui('primary').dispatch('click');
  assert.equal(autos().length, 3, 'der zweite Lauf ersetzt die automatischen');
  const rep = ui('auto-replace');
  rep.checked = false; rep.dispatch('change');
  ui('primary').dispatch('click');
  assert.equal(autos().length, 6, 'ohne Ersetzen kommen sie dazu');
  v.handles.select(autos()[0].id);
  assert.match(ui('inspector-title').innerHTML, /automatisch/, 'das Auswahlfeld sagt es');
  v.handles.select(null);

  /* Der Boden des Mindestabstands: früher still angewandt, jetzt gesagt. */
  tippen('def-d', '30');
  assert.match(ui('note').textContent, /45 mm.*nicht 30 mm.*1,5 × Ø 30/, ui('note').textContent);
  const sp = ui('auto-spacing');
  sp.value = '50'; sp.dispatch('input');
  assert.doesNotMatch(ui('note').textContent, /1,5 × Ø/, 'über dem Boden gibt es nichts zu sagen');
  sp.value = '30'; sp.dispatch('input');
  /* Auto folgt der dicksten Vorgabe: 20 − 30/2 = 5 mm. */
  assert.equal(ui('min-wall').value, '5');
  tippen('def-d', '20');
  assert.equal(ui('min-wall').value, '10');
  /* Die Vorgaben gehören zum Plan (an ihnen hängt mit „Auto" das Urteil):
     jede Änderung ist ein Schritt. */
  assert.equal(host.history.undoLabel, 'Vorgabe Kühlstich-Ø geändert');
  rep.checked = true; rep.dispatch('change');
  /* Zurück zum Stand vor den Läufen: zwei Vorgaben, drei Läufe. */
  for (let i = 0; i < 5; i++) host.undo();
  assert.equal(ui('def-d').value, '20', 'das Feld zeigt die Vorgabe des Plans');
  assert.equal(autos().length, 0);
  assert.equal(items().length, 4);
  richtung('normal');
});

test('Mindest-Wandabstand: Auto folgt dem Achsabstand; von Hand gehört er zum Plan — Liste, Farbe, Reiter, Datei', async () => {
  const { v, ui, shell, host, tool, doc } = P;
  s1 = v.state.plan.items[s1.id];
  shell.setMode('pruefung');
  assert.match(kpiText(ui('plan-kpis')), /Kühlstiche\s*3.*Kanäle\s*1.*Gesamtlänge.*kleinster Wandabstand/);
  /* Haken heraus: der Wert bleibt stehen und gehört ab jetzt dem Plan. */
  const auto = ui('min-wall-auto');
  auto.checked = false; auto.dispatch('change');
  assert.ok(!ui('min-wall').disabled);
  assert.equal(v.state.plan.minWall, 10);
  assert.equal(tool.toJSON().minWall, 10, 'und steht in der Datei');
  assert.equal(tool.toJSON().version, 1, 'das Format bleibt Version 1');
  const vorher = v.offenders().length;
  tippen('min-wall', '13');
  assert.equal(v.state.plan.minWall, 13);
  assert.equal(host.history.undoLabel, 'Mindest-Wandabstand geändert');
  /* Ø 20 auf der Fläche im Abstand 20: 10 mm Wand < 13 mm. */
  assert.equal(v.state.checks.get(s1.id).verdict, 'warn');
  const off = v.offenders();
  assert.ok(off.length > vorher && off.some(x => x.id === s1.id));
  const rows = ui('offender-list').querySelectorAll('[data-item]');
  assert.equal(rows.length, off.length, 'die Liste nennt jeden');
  assert.equal(ui('offender-note').textContent, 'Ein Klick wählt es und holt es heran.', 'unter der Liste steht, was ein Klick tut');
  assert.equal(doc.querySelector('[data-badge="pruefung"]').textContent, String(off.length), 'der Reiter zählt sie');
  assert.ok(ui('plan-kpis').querySelector('.krow.warn'), 'kleinster Wandabstand mit Urteil');
  assert.match(kpiText(ui('plan-kpis')), /Mindest-Wandabstand 13 mm · \d+ Elemente? darunter/);
  assert.ok(v.meshes.warn.visible && v.meshes.warn.geometry.attributes.position.count > 0, 'im Bild stehen sie in der Farbe von „knapp"');
  assert.equal(v.meshes.bad.geometry.attributes.position.count, 0, 'ein Durchbruch ist keiner darunter');
  assert.equal('#' + v.meshes.warn.material.color.getHexString(), C.ROLE.caution, 'die Ampel, keine eigene Warnfarbe');
  assert.match(doc.getElementById('pt-legend').innerHTML, /zu nah an der Kavität/, 'und die Legende nennt die Farbe');
  assert.ok(!/Durchbruch/.test(doc.getElementById('pt-legend').innerHTML), 'was nicht im Bild ist, nennt sie nicht');
  /* Ein Klick wählt das Element und holt es ins Bild — „Einpassen" merkt sich weiter das Ganze. */
  const ziel0 = v.view.controls.target.clone();
  ui('offender-list').querySelector('[data-item="' + s1.id + '"]').dispatch('click');
  assert.equal(v.handles.selected, s1.id);
  assert.ok(ui('offender-list').querySelector('[data-item="' + s1.id + '"]').classList.contains('active'));
  const ziel = v.view.controls.target;
  assert.ok(ziel.distanceTo(ziel0) > 1, 'die Kamera schaut jetzt auf das Element');
  /* Der Rahmen passt in den freien Teil des Bildes ein. Unter dem Platzhalter
     ist jedes Element 800 × 600 groß: frei bleibt ein Streifen rechts ab
     x = 560 (js/studio/shell.js, setClearRect) — dort muss der Stich stehen. */
  cam.updateMatrixWorld(true);
  const { a: ea, b: eb } = G.axisOf(s1);
  for (const [name, q] of [['Spitze', ea], ['Ende', eb]]) {
    const [x, y] = px(q);
    assert.ok(x > 550 && x < 800 && y > 0 && y < 600, name + ' im freien Streifen neben dem Auswahlfeld: ' + x.toFixed(0) + ' / ' + y.toFixed(0));
  }
  assert.match(kpiText(ui('sel-kpis')), /unter dem Mindest-Wandabstand von 13 mm/);
  assert.equal(shell.mode, 'pruefung', 'die Liste wechselt den Modus nicht');
  /* F passt wieder das GANZE ein — mit den Bohrungen, die aus dem Bauteil
     ragen (shell.setFitTarget). Ohne Auswahl, damit der Rahmen nichts neben
     das Auswahlfeld rückt: dann zielt die Kamera auf die Mitte des Ganzen. */
  const nah = v.view.camera.position.distanceTo(ziel);
  taste('Escape');
  assert.ok(ui('inspector').hidden);
  taste('f');
  const ganz = new T3.Box3().setFromObject(v.partMesh);
  for (const m of Object.values(v.meshes)) if (m.visible) ganz.expandByObject(m);
  assert.ok(v.view.controls.target.distanceTo(ganz.getCenter(new T3.Vector3())) < 1, 'Einpassen zielt auf Bauteil und Bohrungen: ' + v.view.controls.target.toArray());
  assert.ok(v.view.camera.position.distanceTo(v.view.controls.target) > nah * 1.5, 'und geht dafür zurück');
  v.handles.select(s1.id);
  const nurTeil = new T3.Box3().setFromObject(v.partMesh);
  assert.ok(!nurTeil.containsBox(ganz), 'die Bohrungen reichen über das Bauteil hinaus — ein Quader nur ums Teil wäre zu klein');

  /* Durchbruch: ein Stich, der ins Bauteil läuft. */
  const dir0 = s1.dir.slice();
  G.placeStich(v.state.plan, s1.id, s1.p, [-dir0[0], -dir0[1], -dir0[2]]);
  v.rebuild();
  assert.equal(v.state.checks.get(s1.id).verdict, 'bad');
  assert.match(ui('offender-list').querySelector('[data-item="' + s1.id + '"]').textContent, /Durchbruch/);
  assert.equal(v.offenders()[0].id, s1.id, 'das engste zuerst');
  assert.ok(doc.querySelector('[data-badge="pruefung"]').classList.contains('bad'));
  G.placeStich(v.state.plan, s1.id, s1.p, dir0);
  v.rebuild();

  /* Auto zurück: der Schlüssel verschwindet aus der Datei, die Vorgabe gilt. */
  auto.checked = true; auto.dispatch('change');
  assert.equal(v.state.plan.minWall, undefined);
  assert.ok(!('minWall' in tool.toJSON()), 'ohne eigenen Wert kein Schlüssel — alte Dateien sind „Auto"');
  assert.equal(v.state.checks.get(s1.id).verdict, 'ok');
  host.undo();
  assert.equal(v.state.plan.minWall, 13, 'Rückgängig bringt den eigenen Wert zurück');
  assert.ok(!ui('min-wall-auto').checked && ui('min-wall').value === '13');
  host.redo();

  /* Auto folgt dem Achsabstand — und die Fläche zieht nach (hier: nur ableiten). */
  shell.setMode('flaeche');
  const feld = v.state.field;
  const dist = ui('dist');
  const tiefe = host.history.depth;
  for (const w of ['24', '27', '30']) { dist.value = w; dist.dispatch('input'); }
  assert.equal(v.state.plan.dist, 30);
  assert.equal(ui('min-wall').value, '20', 'Auto: 30 − 20/2');
  assert.equal(host.history.depth, tiefe + 1, 'drei Reglerschritte, ein Eintrag');
  assert.ok(v.state.queued, 'die Fläche wartet, bis der Regler steht');
  await ruhig();
  assert.equal(v.state.shellDist, 30);
  assert.ok(v.state.field === feld, 'innerhalb des Bandes kostet es nur das Ableiten');
  assert.match(kpiText(ui('shell-kpis')), /30 mm/);
  assert.ok(ui('primary').hidden, 'aktuell: kein toter Knopf');
  assert.match(ui('note').textContent, /steht: weiter mit „Setzen"/);
  /* Die gesetzten Elemente bleiben, wo sie sind — und stehen jetzt zu nah. */
  assert.equal(v.state.checks.get(s1.id).verdict, 'warn');
  host.undo();
  assert.equal(v.state.plan.dist, 20);
  assert.equal(ui('dist').value, '20');
  await ruhig();
  assert.equal(v.state.shellDist, 20, 'Rückgängig zieht die Fläche nach');
  assert.equal(v.offenders().length, 0);
  assert.equal(ui('offender-note').textContent, 'Kein Element unterschreitet den Mindest-Wandabstand.');
  shell.setMode('setzen');
});

test('Neu setzen: der Pfeil zielt — aus „Prüfung" heraus landet man in „Setzen"', () => {
  const { v, shell, doc, host } = P;
  s1 = v.state.plan.items[s1.id];                 // Rückgängig/Wiederholen haben den Plan neu aufgebaut
  shell.setMode('pruefung');
  assert.ok(!v.shellMesh.visible);
  schauAuf([b.max[0] + 400, c[1], c[2] + 20], [c[0], c[1], c[2] + 20]);
  v.rebuild();
  v.view.scene.updateMatrixWorld(true);
  assert.ok(v.handles.arrowTip(s1.id), 'der Kühlstich trägt einen Pfeil');
  v.handles.aimFor(s1.id);
  assert.ok(v.handles.aiming, 'der Pfeil zielt');
  assert.equal(shell.mode, 'setzen', 'gezielt wird auf die Abstandsfläche, und die steht in „Setzen"');
  assert.ok(v.shellMesh.visible);
  assert.match(doc.getElementById('aim-text').textContent, /neue Stelle/);
  klick(400, 300);
  assert.ok(!v.handles.aiming);
  assert.ok(Math.abs(s1.p[2] - (c[2] + 20)) < 1e-6, 'versetzt: ' + s1.p);
  assert.match(host.history.undoLabel, /neu gesetzt/);
  /* Wer „Setzen" verlässt, zielt nicht mehr. */
  chip('stich').dispatch('click');
  assert.ok(v.handles.aiming);
  shell.setMode('pruefung');
  assert.ok(!v.handles.aiming && !chip('stich').classList.contains('active'));
  /* Und ein Chip führt aus jedem Modus zurück. */
  chip('stich').dispatch('click');
  assert.equal(shell.mode, 'setzen');
  taste('Escape');
  assert.ok(!v.handles.aiming);
});

test('Datei hin und zurück; alte Dateien ohne minWall sind „Auto"; Entfernen fragt nicht', () => {
  const { v, ui, host, tool } = P;
  const json = JSON.parse(JSON.stringify(tool.toJSON()));
  assert.equal(json.format, 'dielogic-temperier');
  assert.equal(json.items.length, 4);
  tool.fromJSON({ ...json, minWall: 12.5 });
  assert.equal(v.state.plan.minWall, 12.5);
  assert.ok(!ui('min-wall-auto').checked);
  assert.equal(ui('min-wall').value, '12,5');
  tool.fromJSON(json);
  assert.equal(items().length, 4);
  assert.ok(ui('min-wall-auto').checked && ui('min-wall').disabled, 'ohne Schlüssel: Auto');
  assert.ok(tool.exports[0].enabled(), 'der STL-Export ist frei');
  assert.throws(() => tool.fromJSON({ format: 'dielogic-luft', version: 1 }), /keine Temperierdatei/);
  /* Kennungen gehen ins Auswahlfeld und in die Liste: eine Datei mit einer,
     die HTML sein könnte, wird abgelehnt — und der Plan bleibt stehen. */
  assert.throws(() => tool.fromJSON({ ...json, items: [{ id: '<img src=x onerror=alert(1)>', type: 'stich', p: [0, 0, 0], dir: [0, 0, 1] }] }), /keine gültige Kennung/);
  assert.equal(items().length, 4);
  /* Die Vorgaben kommen mit der Datei — mit „Auto" hängt an ihnen das Urteil. */
  tool.fromJSON({ ...json, defaults: { d: 30, len: 150, kd: 12 } });
  assert.equal(ui('def-d').value, '30');
  assert.equal(ui('def-len').value, '150');
  assert.equal(ui('def-kd').value, '12');
  assert.equal(ui('min-wall').value, '5', 'Auto: 20 − 30/2');
  assert.equal(tool.toJSON().defaults.d, 30, 'und gehen wieder mit hinaus');
  tool.fromJSON(json);
  assert.equal(ui('def-d').value, '20');
  assert.equal(ui('min-wall').value, '10');
  /* Und käme eine Kennung doch an der Prüfung vorbei: maskiert, in der Liste
     wie im Auswahlfeld. Ein Stich ins Bauteil steht in der Liste. */
  const evil = '<img src=x onerror=alert(1)>';
  const s0 = items().find(i => i.type === 'stich');
  v.state.plan.items[evil] = { id: evil, type: 'stich', p: s0.p.slice(), dir: s0.dir.map(x => -x), d: 20, len: 200 };
  v.rebuild();
  v.handles.select(evil);
  for (const el of [ui('offender-list'), ui('inspector-title')]) {
    assert.ok(!el.innerHTML.includes('<img') && el.innerHTML.includes('&lt;img'), 'maskiert: ' + el.innerHTML.slice(0, 160));
    assert.equal(el.querySelector('img'), null);
  }
  v.handles.select(null);
  delete v.state.plan.items[evil];
  v.rebuild();
  host.history.reset();

  /* Entfernen: Knopf, dann Toast mit „Rückgängig" — das Zurückgeholte ist gewählt. */
  const erstes = items()[0];
  v.handles.select(erstes.id);
  ui('del-item').dispatch('click');
  assert.equal(items().length, 3, 'entfernt — ohne Nachfrage');
  assert.equal(v.handles.selected, null);
  assert.ok(ui('inspector').hidden);
  const toast = ui('toast');
  assert.ok(!toast.hidden, 'ein Toast sagt, was weg ist');
  assert.match(toast.textContent, /Kühlstich .* entfernt/);
  toast.querySelector('.st-toast-act').dispatch('click');
  assert.equal(items().length, 4, '„Rückgängig" im Toast holt es zurück');
  assert.equal(v.handles.selected, erstes.id, 'und es ist gewählt — Entf träfe es wieder');
  assert.ok(host.history.canRedo);
  /* Entf auf der Tastatur, Strg+Z. */
  taste('Delete');
  assert.equal(items().length, 3);
  taste('z', { ctrlKey: true });
  assert.equal(items().length, 4);
  /* Der Kanal kommt mit einem gewählten Ende zurück. */
  const kk = items().find(i => i.type === 'kanal');
  v.handles.select(kk.id + ':b');
  taste('Delete');
  assert.ok(!items().some(i => i.type === 'kanal'));
  host.undo();
  assert.equal(v.handles.selected, kk.id + ':a');
  /* ✕ und Esc heben die Auswahl auf. */
  ui('inspector-close').dispatch('click');
  assert.equal(v.handles.selected, null);
  v.handles.select(kk.id + ':a');
  taste('Escape');
  assert.equal(v.handles.selected, null);
});

test('Abbruch: die Rechnung der Fläche lässt sich anhalten — danach gilt die vorige, und der Knopf rechnet neu', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  shell.setMode('flaeche');
  const vorher = s.field, hVorher = s.h;
  tippen('cell', '3');
  assert.equal(s.h, 3);
  assert.ok(s.queued && s.stale);
  await wait(() => s.running, 200, 10);
  assert.equal(ui('primary').textContent, 'Abbrechen', 'der Hauptknopf wird zum Abbrechen');
  assert.ok(!ui('primary').hidden && !ui('primary').disabled);
  assert.ok(chip('stich').classList.contains('off'), 'solange gerechnet wird, wird nicht gesetzt');
  ui('primary').dispatch('click');
  await wait(() => !s.running && s.ready, 400);
  assert.ok(s.cancelled);
  assert.ok(s.field === vorher, 'kein Ergebnis nach dem Abbruch — das vorige Feld bleibt');
  assert.equal(s.shellDist, 20);
  assert.ok(s.stale, 'und gilt als veraltet');
  assert.match(ui('note').textContent, /Abgebrochen: Das Bild zeigt noch die vorige Fläche/);
  assert.equal(ui('primary').textContent, 'Abstandsfläche berechnen');
  assert.ok(ui('shell-kpis').querySelector('.krow.warn'));
  assert.ok(!chip('stich').classList.contains('off'), 'auf der vorigen Fläche lässt sich weiter setzen');
  /* Derselbe Wert noch einmal (der Browser meldet „change" auch beim Verlassen
     des Feldes, etwa beim Klick auf „Abbrechen"): keine Änderung, keine Rechnung. */
  tippen('cell', '3');
  assert.ok(!s.queued && !s.running && s.cancelled, 'es bleibt beim Abbruch');
  /* Was absehbar Minuten dauert, beginnt nicht von selbst. */
  tippen('cell', '1');
  await wait(() => !s.queued, 100, 10);
  assert.ok(s.held && !s.running && s.ready, 'gehalten: gerechnet wird erst auf Knopfdruck');
  assert.equal(ui('primary').textContent, 'Abstandsfläche berechnen');
  assert.match(ui('note').textContent, /etwa \d+ min\. Gerechnet wird deshalb erst auf Knopfdruck/);
  /* Zurück zur alten Zellkante: das vorige Feld passt wieder, nichts zu rechnen. */
  tippen('cell', String(hVorher).replace('.', ','));
  await ruhig();
  assert.ok(!s.stale && !s.cancelled && s.field === vorher);
  assert.ok(ui('primary').hidden);
  shell.setMode('setzen');
});

test('Entwurf: der Plan wird je Bauteil aufgehoben und beim nächsten Mal angeboten; ein neues Bauteil beginnt leer', async () => {
  const { v, ui, host } = P;
  const KEY = 'studio:temperier:gearbox_cover';
  host.changed('Probe');
  await wait(() => { const d = globalThis.localStorage.getItem(KEY); return d && JSON.parse(d).doc.items.length === 4; }, 200);
  /* Achsabstand und Mindest-Wandabstand gelten weiter, die Elemente nicht. */
  v.state.plan.dist = 25;
  await teil('heat_sink');
  await wait(() => v.state.ready, 1200);
  assert.equal(items().length, 0, 'ein Element steht vor der Wand EINES Bauteils');
  assert.equal(v.state.plan.dist, 25, 'der Achsabstand bleibt');
  assert.equal(v.state.shellDist, 25, 'und die Fläche des neuen Teils hat ihn');
  assert.ok(!host.history.canUndo, 'der Verlauf beginnt neu');
  assert.ok(ui('banner').hidden, 'für dieses Teil gibt es keinen Entwurf');
  const longest = Math.max(...host.part.model.bounds.size);
  assert.ok(Math.abs(v.state.h - Math.max(0.25, Math.round(longest / 64 * 2) / 2)) < 0.5, 'die Zellkante folgt dem Teil, solange niemand sie gesetzt hat: ' + v.state.h);

  /* Zurück zum ersten: der Entwurf wird angeboten, nie still übernommen. */
  v.state.plan.dist = 20;
  await teil('gearbox_cover');
  await wait(() => v.state.ready, 1200);
  assert.equal(items().length, 0);
  assert.ok(!ui('banner').hidden, 'der Rahmen fragt');
  assert.match(ui('banner').textContent, /Entwurf vom .* wiederherstellen/);
  ui('banner').querySelector('.btn-primary').dispatch('click');
  assert.equal(items().length, 4, 'wiederhergestellt');
  await ruhig();
  assert.equal(v.state.shellDist, 20);
});

test('Ein neues Bauteil bricht die laufende Rechnung ab und beginnt von vorn; ohne Fläche sagt der Chip, was fehlt', async () => {
  const { v, ui, host } = P;
  const s = v.state;
  /* Zwei Teile kurz nacheinander: das erste wird nie fertig gerechnet. */
  const erst = teil('oil_pan');
  await wait(() => s.running, 400, 5);
  assert.ok(!s.ready);
  chip('stich').dispatch('click');
  assert.ok(!v.handles.aiming);
  assert.match(ui('toast').textContent, /wird gerade gerechnet/);
  assert.ok(ui('primary').textContent === 'Abbrechen');
  await erst;
  await teil('u_channel_ribbed');
  await wait(() => s.ready && !s.running, 1600);
  assert.match(ui('part-name').textContent, /U-Profil/);
  assert.ok(s.field && s.shellDist === s.plan.dist && !s.stale && !s.cancelled, 'die Fläche gehört zum letzten Teil');
  const bb = host.part.model.bounds;
  for (let a = 0; a < 3; a++) {
    assert.ok(s.field.origin[a] < bb.min[a] - s.plan.dist, 'das Feld umschließt dieses Teil samt Band (Achse ' + a + ')');
  }
  assert.equal(ui('primary').textContent, 'Kühlstiche automatisch setzen');
});
