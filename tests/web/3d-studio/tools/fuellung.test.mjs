/* Füllabschätzung im gemeinsamen Rahmen: Anschnitt über den Chip setzen,
   „Rechnen" als Rechnung mit Abbruch (Raster + Frontausbreitung), danach
   rechnet jede Änderung von selbst nach; das Bild der Füllung gehört dem
   Modus „Ergebnis". Dazu, was der Rahmen dazugibt: Rückgängig, „Entfernen"
   ohne Nachfrage, Entwurf. Die Fälle stammen aus viewer.test.mjs und wurden
   auf data-ui, den Chip und das Auswahlfeld übertragen.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/fuellung.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mountPage, wait, kpiText, interact, same, seg } from './fixture.mjs';

/* Felder und Ergebnisse NIE mit assert.equal vergleichen (same, ./fixture.mjs). */
let P, T3, M, b, c, a1, a2, zeiger, klick, px, schauAuf, chipOf, taste, gruppe;
const chip = () => chipOf('anschnitt');
const items = () => Object.values(P.v.state.plan.items);
/* Fertig heißt: es läuft nichts, und das Ergebnis passt zum Plan. */
const settled = () => wait(() => { const s = P.v.state; return !s.running && s.ready && !!s.result && !s.stale; }, 1600);
const pause = ms => new Promise(r => setTimeout(r, ms));

before(async () => {
  P = await mountPage('fuellung.html', 'js/studio/pages/fuellung.js');
  T3 = await import('three');
  M = await import('../../../../web/tools/3d-studio/js/fill/model.js');
  ({ zeiger, klick, px, schauAuf, chip: chipOf, taste, gruppe } = interact(P, { T3 }));
  b = P.host.part.model.bounds;
  c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
});

test('Rahmen: vier Modi, ein Chip, kein Raster ohne Knopf — und jede Zeile sagt, was fehlt', () => {
  const { doc, v, ui, shell, host } = P;
  const s = v.state;
  assert.ok(s.ready && s.model, 'das Beispielteil steht');
  assert.deepEqual(doc.querySelectorAll('[role="tab"][data-mode]').map(t => t.getAttribute('data-mode')), ['anschnitte', 'fuellung', 'ergebnis']);
  assert.equal(shell.mode, 'anschnitte', 'die Seite beginnt dort, wo gearbeitet wird');
  assert.match(ui('part-name').textContent, /Getriebedeckel/);
  assert.deepEqual(doc.querySelectorAll('[data-chip]').map(x => x.getAttribute('data-chip')), ['anschnitt']);
  assert.equal(chip().getAttribute('aria-disabled'), 'false', 'setzen ist frei');
  same(s.field, null, 'gerastert wird erst mit „Rechnen"');
  same(s.result, null, 'ohne Anschnitt keine Füllung');
  same(host.field.data, null, 'auch der Gastgeber hat noch kein Feld');
  /* Die Kante kommt vom Teil: halbe Wanddicke 2V/A, auf halbe Millimeter gerundet. */
  const mm = s.model;
  const wall = 2 * mm.volume / mm.totalArea;
  assert.equal(s.h, Math.round(wall / 2 * 2) / 2, 'Zellkante = halbe Wanddicke: ' + s.h + ' bei 2V/A = ' + wall);
  assert.equal(ui('cell').value, String(s.h).replace('.', ','));
  assert.equal(doc.querySelector('[data-ui="fill-time"]'), null, 'keine Füllzeit — die Rechnung kennt keine Zeit');
  assert.ok(ui('inspector').hidden, 'ohne Auswahl kein Auswahlfeld');
  assert.ok(!ui('item-empty').hidden, '„Noch kein Anschnitt gesetzt."');
  assert.ok(ui('primary').hidden, 'bei den Anschnitten wird gesetzt, nicht gerechnet');
  assert.ok(!ui('undo-group').hidden && ui('undo').disabled, 'Rückgängig ist da und hat nichts zu tun');
  assert.equal(ui('save-state').textContent, '', 'nichts Ungespeichertes');
  assert.match(doc.getElementById('status').textContent, /drehen/, 'die Bedienhinweise des Rahmens bleiben stehen');
  /* Füllung und Ergebnis: kein toter Knopf, die Zeile sagt, was fehlt. */
  for (const m of ['fuellung', 'ergebnis']) {
    shell.setMode(m);
    assert.ok(ui('primary').hidden, m + ': kein Knopf ohne Anschnitt');
    assert.match(ui('note').textContent, /Noch kein Anschnitt/, m);
  }
  assert.ok([...shell.modeSection('ergebnis').children].every(x => x.classList.contains('disabled')), 'ohne Ergebnis sind seine Felder gedämpft');
  assert.match(ui('grid-facts').innerHTML, /Rasterpunkte/, 'was das Raster kosten wird, steht VOR dem Rechnen in den Details');
  assert.ok(!/Zellen im Bauteil/.test(ui('grid-facts').innerHTML), 'gerastert ist noch nichts');
  assert.ok(!doc.getElementById('colorbar').classList.contains('on'));
  shell.setMode('anschnitte');
});

test('Setzen: Chip, Klick aufs Bauteil — der Anschnitt sitzt auf der Wand, gerechnet wird noch nicht', async () => {
  const { doc, v, ui, shell, host } = P;
  /* Kamera von +X auf die Mitte: der Klick durch die Bildmitte trifft die +X-Wand. */
  schauAuf([b.max[0] + 400, c[1], c[2]], c);
  chip().dispatch('click');
  assert.ok(v.handles.aiming, 'der Zielmodus ist scharf');
  assert.ok(chip().classList.contains('active'), 'der Chip zeigt, was gesetzt wird');
  assert.match(doc.getElementById('aim-text').textContent, /Anschnitt/);
  klick(400, 300);
  assert.ok(!v.handles.aiming);
  assert.ok(!chip().classList.contains('active'));
  assert.equal(items().length, 1);
  a1 = items()[0];
  /* Die +X-Wand des Getriebedeckels steht mit 1,5° Schräge unter dem Flansch,
     der bis b.max reicht — gemessen wird gegen die Wand auf Höhe der Bauteilmitte. */
  const wallX = 190 + c[2] * Math.tan(1.5 * Math.PI / 180);
  assert.ok(Math.abs(a1.pos[0] - wallX) < 0.5, 'auf der +X-Wand: ' + a1.pos);
  assert.ok(a1.n[0] > 0.99, 'Normale nach außen: ' + a1.n);
  assert.equal(a1.w, 30); assert.equal(a1.h, 2);
  assert.equal(v.handles.selected, a1.id, 'der neue Anschnitt ist gewählt');
  assert.ok(!ui('inspector').hidden, 'das Auswahlfeld steht neben dem Bild');
  assert.match(ui('inspector-title').innerHTML, /Anschnitt/);
  assert.equal(ui('sel-w').value, '30');
  assert.equal(ui('sel-share').value, '', 'Anteil leer = aus der Fläche');
  assert.match(ui('sel-share').placeholder, /auto 100/);
  assert.match(kpiText(ui('sel-kpis')), /füllt.*—/, 'noch nicht gerechnet');
  /* Gruppen als Reiter: eine steht da, die anderen nicht. */
  assert.ok(!ui('sel-w').closest('[data-group]').hidden && ui('sel-x').closest('[data-group]').hidden);
  gruppe('Details');
  assert.ok(ui('sel-w').closest('[data-group]').hidden && !ui('sel-facts').closest('[data-group]').hidden);
  assert.match(ui('sel-facts').innerHTML, /Fläche/);
  gruppe('Maße');
  assert.equal(ui('item-list').querySelectorAll('[data-item]').length, 1, 'die Liste nennt ihn');
  assert.match(ui('item-list').textContent, /100 % Strom/);
  assert.ok(ui('item-empty').hidden);
  assert.equal(ui('item-count').textContent, '· 1', 'die Liste zählt mit');
  assert.ok(doc.querySelector('[data-badge="anschnitte"]').hidden, 'am Reiter steht keine Zahl — vier Reiter passen sonst nicht in eine Zeile');
  assert.ok(v.inletMesh.geometry.getAttribute('position').count > 0, 'der Anschnitt steht im Bild');
  /* Der Rahmen: ein Schritt im Verlauf, der Plan ist ungespeichert. */
  assert.match(ui('undo').title, /Anschnitt a1 gesetzt/);
  assert.equal(ui('save-state').textContent, 'Ungespeichert');
  assert.equal(shell.mode, 'anschnitte', 'das Setzen wechselt den Modus nicht');
  /* Vor dem ersten „Rechnen" läuft nichts von selbst. */
  await pause(400);
  assert.ok(!v.state.running, 'nichts rechnet');
  same(v.state.result, null, 'kein Ergebnis ohne Knopf');
  same(host.field.data, null, 'und kein Raster');
  assert.match(ui('note').textContent, /Füllung/, 'die Zeile sagt, wo es weitergeht');
});

test('Rechnen: Raster und Front als eine Rechnung — danach steht das Ergebnis, eng gerastert', async () => {
  const { doc, v, ui, shell, host } = P;
  const s = v.state;
  shell.setMode('fuellung');
  assert.equal(ui('primary').textContent, 'Rechnen');
  assert.ok(!ui('primary').hidden && !ui('primary').disabled);
  assert.match(ui('note').textContent, /noch nicht gerechnet/);
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen', 'solange gerechnet wird, heißt der Knopf Abbrechen');
  await settled();
  assert.ok(s.field && s.field.fullInside, 'das Raster ist gerechnet');
  same(host.field.data, s.field, 'es ist das Feld des Gastgebers');
  assert.equal(s.field.h, s.h);
  /* Das Raster liegt eng um das Teil, zwei Zellen Rand. */
  for (let a = 0; a < 3; a++) {
    const need = Math.ceil(s.model.bounds.size[a] / s.field.h);
    assert.ok(s.field.dims[a] <= need + 6 && s.field.dims[a] >= need + 4, 'Achse ' + a + ': ' + s.field.dims[a] + ' Zellen für ' + need + ' im Teil');
  }
  assert.equal(shell.mode, 'ergebnis', 'nach dem ersten Lauf zeigt die Seite das Ergebnis');
  assert.ok(ui('primary').hidden, 'dort gibt es nichts mehr zu tun');
  assert.ok(ui('actions').hidden, 'und die leere Leiste fällt weg');
  const r = s.result;
  assert.equal(r.stats.inlets.length, 1);
  assert.ok(r.stats.maxPath > 150, 'der Fließweg geht durch das Teil: ' + r.stats.maxPath);
  assert.match(kpiText(ui('fill-kpis')), /längster Fließweg.*Wanddicke 2V\/A.*Fließweg \/ Wanddicke/);
  assert.match(ui('fill-kpis').innerHTML, /krow (ok|warn)/, 'Fließweg / Wanddicke trägt ein Urteil');
  assert.match(ui('grid-facts').innerHTML, /Zellen im Bauteil/);
  assert.match(ui('grid-facts').innerHTML, /Rechenzeit Füllung/);
  assert.match(ui('item-list').textContent, /füllt 100 % des Volumens/);
  assert.match(kpiText(ui('sel-kpis')), /füllt.*100 % des Volumens/);
  /* Das Bild: Füllkörper bei 50 % ist die Vorgabe. Er trägt die Farbe der
     Schmelze, und die Legende nennt sie; die Skala gehört zum gefärbten
     Bauteil (Ansicht „Füllgrad"). */
  assert.match(doc.getElementById('pt-legend').textContent, /Schmelze bis 50 %/, 'die Legende nennt den Füllkörper');
  assert.ok(!doc.getElementById('colorbar').classList.contains('on'), 'ohne gefärbtes Bauteil keine Skala');
  assert.ok(v.spotGroup.visible && v.spotGroup.children.length >= 1 && v.spotGroup.children.length <= 5, 'letzte Stellen: ' + v.spotGroup.children.length);
  assert.ok(s.spots.list[0].frac > 0.9, 'die erste liegt ganz am Ende');
  assert.ok(s.spots.list[0].x < c[0], 'am −X-Ende, nicht am Anschnitt: ' + s.spots.list[0].x);
  assert.match(kpiText(ui('result-kpis')), /letzte Stelle/);
  assert.match(doc.getElementById('pt-legend').textContent, /zuletzt gefüllt/);
  shell.setMode('fuellung');
  assert.ok(ui('primary').hidden, 'ein aktuelles Ergebnis braucht keinen Knopf');
  assert.match(ui('note').textContent, /Gerechnet in .* von selbst/);
});

test('Ergebnis besitzt sein Bild: Füllkörper, Füllgrad, letzte Stellen — und nimmt es mit', async () => {
  const { doc, v, ui, shell, host } = P;
  const s = v.state;
  shell.setMode('ergebnis');
  assert.equal(s.show, 'koerper');
  assert.ok(v.bodyMesh.visible && v.bodyMesh.geometry.getAttribute('position').count > 100, 'der Füllkörper steht');
  assert.ok(v.partMesh.material.transparent, 'das Bauteil ist durchscheinend');
  same(v.partMesh.material, host.part.plainMat, 'und grau');
  const posB = v.bodyMesh.geometry.getAttribute('position').array;
  let minX = Infinity;
  for (let i = 0; i < posB.length; i += 3) minX = Math.min(minX, posB[i]);
  assert.ok(minX > b.min[0] + 20, 'bei 50 % reicht die Schmelze noch nicht bis zum −X-Ende: ' + minX);
  const count50 = posB.length;
  const q = ui('q');
  q.value = '100'; q.dispatch('input');
  assert.equal(s.q, 1);
  await pause(40);
  assert.notEqual(v.bodyMesh.geometry.getAttribute('position').array.length, count50, 'der Körper folgt dem Regler');
  seg(ui('show-seg'), 'farbe').dispatch('click');
  assert.ok(!v.bodyMesh.visible);
  same(v.partMesh.material, host.part.colorMat, 'das Bauteil trägt seine Punktfarben');
  assert.ok(doc.getElementById('colorbar').classList.contains('on'), 'die Skala steht');
  assert.ok(!/ms/.test(doc.getElementById('colorbar').innerHTML), 'und trägt Prozent, keine Millisekunden');
  assert.ok(!v.partMesh.material.transparent, 'und ist wieder deckend');
  const col = host.part.colors().array;
  let bunt = 0;
  for (let i = 0; i < col.length; i += 3) if (Math.abs(col[i] - col[i + 1]) > 0.05 || Math.abs(col[i + 1] - col[i + 2]) > 0.05) bunt++;
  assert.ok(bunt > col.length / 6, 'gefärbt nach Füllgrad: ' + bunt + ' von ' + col.length / 3);
  /* Letzte Stellen: der Regler ist der Schalter — 0 heißt keine. */
  const sc = ui('spots-count');
  sc.value = '0'; sc.dispatch('input');
  assert.ok(!v.spotGroup.visible);
  assert.equal(ui('spots-count-val').textContent, 'keine');
  assert.ok(!/zuletzt gefüllt/.test(doc.getElementById('pt-legend').textContent));
  sc.value = '5'; sc.dispatch('input');
  assert.ok(v.spotGroup.visible && v.spotGroup.children.length >= 1);
  /* Der Modus nimmt sein Bild mit. */
  shell.setMode('anschnitte');
  same(v.partMesh.material, host.part.plainMat, 'bei den Anschnitten steht die Wand grau da');
  assert.ok(!v.spotGroup.visible && !v.bodyMesh.visible);
  assert.ok(!doc.getElementById('colorbar').classList.contains('on'), 'keine Skala ohne Bild');
  assert.ok(v.inletMesh.visible && v.inletMesh.geometry.getAttribute('position').count > 0, 'die Anschnitte sind der Plan und bleiben');
  shell.setMode('ergebnis');
  same(v.partMesh.material, host.part.colorMat);
  seg(ui('show-seg'), 'grau').dispatch('click');
  assert.ok(!doc.getElementById('colorbar').classList.contains('on'), '„Bauteil": nur das Bauteil und die Anschnitte');
  seg(ui('show-seg'), 'farbe').dispatch('click');
});

test('Nach dem ersten Lauf rechnet jede Änderung von selbst nach: zweiter Anschnitt, Anteil, α', async () => {
  const { v, ui, host } = P;
  const s = v.state;
  /* Die Vorgaben gelten für den nächsten Anschnitt. */
  const dw = ui('def-w');
  dw.value = '10'; dw.dispatch('change');
  assert.equal(s.defaults.w, 10);
  dw.value = '9999'; dw.dispatch('change');
  assert.equal(s.defaults.w, M.PARAM_META.w.max, 'geklemmt');
  assert.match(dw.closest('.row').querySelector('.clamp-note').textContent, /begrenzt/);
  dw.value = '10'; dw.dispatch('change');
  /* Von −X auf die Mitte: der Klick trifft die gegenüberliegende Wand. */
  schauAuf([b.min[0] - 400, c[1], c[2]], c);
  const before = s.result;
  chip().dispatch('click');
  klick(400, 300);
  assert.equal(items().length, 2);
  a2 = items().find(i => i.id !== a1.id);
  assert.ok(a2.n[0] < -0.99 && a2.w === 10, 'auf der −X-Wand, 10 mm breit: ' + a2.pos);
  assert.ok(s.stale, 'das Ergebnis gilt nicht mehr');
  await settled();
  assert.ok(s.result !== before, 'nachgerechnet, ohne Knopf');
  assert.equal(s.result.stats.inlets.length, 2);
  const cells = s.result.stats.inlets.map(i => i.cells);
  assert.ok(cells[0] > cells[1], 'der breite Anschnitt füllt mehr: ' + cells);
  /* Ein fester Anteil: mit 70 % Strom füllt der kleine mehr. */
  assert.equal(v.handles.selected, a2.id);
  const share = ui('sel-share');
  assert.equal(share.value, '', 'Anteil leer = aus der Fläche');
  share.value = '70'; share.dispatch('change');
  assert.equal(a2.share, 70);
  assert.equal(host.history.undoLabel, 'Anteil geändert');
  await settled();
  const cells2 = s.result.stats.inlets.map(i => i.cells);
  assert.ok(cells2[1] > cells[1], 'mit 70 % Strom füllt der kleine mehr als vorher: ' + cells + ' → ' + cells2);
  share.value = 'viel'; share.dispatch('change');
  assert.ok(share.classList.contains('bad') && a2.share === 70, 'Unlesbares bleibt draußen');
  share.value = '70'; share.dispatch('change');
  /* α = 0: reine Geometrie — drei Reglerschritte sind EIN Eintrag und EIN Lauf danach. */
  const tiefe = host.history.depth;
  const al = ui('alpha');
  for (const w of ['0.3', '0.1', '0']) { al.value = w; al.dispatch('input'); }
  assert.equal(s.plan.alpha, 0);
  assert.equal(host.history.depth, tiefe + 1, 'drei Reglerschritte, ein Eintrag');
  await settled();
  assert.equal(s.result.stats.alpha, 0);
});

test('Rückgängig und Wiederholen: der Plan geht hin und her, Regler und Rechnung folgen', async () => {
  const { v, ui, host } = P;
  const s = v.state;
  ui('undo').dispatch('click');
  assert.equal(s.plan.alpha, 0.5, 'α ist zurück');
  assert.equal(ui('alpha').value, '0.5', 'und der Regler zeigt es');
  assert.match(ui('alpha-val').textContent, /0,5/);
  taste('z', { ctrlKey: true });
  assert.equal(s.plan.items[a2.id].share, null, 'der Anteil auch');
  taste('z', { ctrlKey: true });
  assert.equal(items().length, 1, 'und der zweite Anschnitt');
  assert.equal(v.handles.selected, null, 'die Auswahl geht mit ihm');
  assert.ok(ui('inspector').hidden);
  await settled();
  assert.equal(s.result.stats.inlets.length, 1, 'die Rechnung folgt dem Plan');
  taste('y', { ctrlKey: true });
  assert.equal(items().length, 2, 'Strg+Y holt ihn wieder');
  assert.equal(v.handles.selected, a2.id, 'was zurückkommt, ist gewählt');
  taste('y', { ctrlKey: true });
  taste('y', { ctrlKey: true });
  assert.equal(s.plan.items[a2.id].share, 70);
  assert.equal(s.plan.alpha, 0);
  assert.ok(host.history.canUndo && !host.history.canRedo);
  a1 = s.plan.items[a1.id]; a2 = s.plan.items[a2.id];
  await settled();
  assert.equal(s.result.stats.inlets.length, 2);
});

test('Ziehen auf der Wand und Drehen: ein Zug ist EIN Schritt, ein Regler auch', async () => {
  const { v, ui, host } = P;
  const s = v.state;
  v.handles.select(a1.id);
  /* Schräg von oben auf den Punkt geschaut — genau entlang der Normalen läge
     der Pfeil vor der Kugel und der Klick träfe ihn; so liegt er daneben. */
  schauAuf([a1.pos[0] + 300, a1.pos[1] + 300, a1.pos[2]], a1.pos);
  v.rebuild();
  v.view.scene.updateMatrixWorld(true);
  const p0 = a1.pos.slice();
  const tiefe = host.history.depth;
  const [hx, hy] = px(a1.pos);
  /* Ein bloßer Klick auf den Griff endet auch mit „drop" — das ist keine Änderung. */
  const result0 = s.result;
  zeiger('pointerdown', hx, hy);
  zeiger('pointerup', hx, hy);
  assert.equal(host.history.depth, tiefe, 'ein Klick ist kein Schritt');
  assert.ok(!s.stale && s.result === result0 && !s.running, 'und rechnet nichts nach');
  zeiger('pointerdown', hx, hy);
  assert.ok(v.handles.dragging, 'der Zug beginnt am Punkt');
  zeiger('pointermove', hx + 35, hy);
  await pause(30);
  zeiger('pointermove', hx + 70, hy);
  await pause(30);
  zeiger('pointerup', hx + 70, hy);
  assert.ok(Math.hypot(a1.pos[1] - p0[1], a1.pos[2] - p0[2]) > 5, 'der Punkt wandert auf der Wand: ' + p0 + ' → ' + a1.pos);
  const weg = [0, 1, 2].map(i => a1.pos[i] - p0[i]);
  assert.ok(Math.abs(weg[0] * a1.n[0] + weg[1] * a1.n[1] + weg[2] * a1.n[2]) < 1e-6, 'in der Wandebene, nicht von ihr weg');
  assert.equal(host.history.depth, tiefe + 1, 'viele Mausschritte, ein Eintrag');
  assert.equal(host.history.undoLabel, 'Anschnitt verschoben');
  assert.ok(s.stale, 'und die Füllung rechnet nach');
  /* Drehen um die Normale. */
  gruppe('Lage');
  const rot = ui('sel-rot');
  for (const w of ['30', '60', '90']) { rot.value = w; rot.dispatch('input'); }
  assert.equal(a1.rot, 90);
  assert.match(ui('sel-rot-val').textContent, /90/);
  assert.equal(host.history.depth, tiefe + 2, 'drei Reglerschritte, ein Eintrag');
  /* Die Lage von Hand. */
  const sz = ui('sel-z');
  sz.value = String(Math.round(a1.pos[2] + 5)); sz.dispatch('change');
  assert.equal(host.history.undoLabel, 'Lage geändert');
  await settled();
  /* Neu setzen: der Pfeil zielt, der Klick versetzt den Anschnitt samt Normale. */
  schauAuf([b.max[0] + 400, c[1], c[2] + 10], [c[0], c[1], c[2] + 10]);
  v.rebuild();
  v.view.scene.updateMatrixWorld(true);
  v.handles.aimFor(a1.id);
  assert.ok(v.handles.aiming, 'der Pfeil zielt');
  assert.match(P.doc.getElementById('aim-text').textContent, /neue Stelle/);
  klick(400, 300);
  assert.ok(!v.handles.aiming);
  assert.ok(Math.abs(a1.pos[2] - (c[2] + 10)) < 1e-6, 'versetzt: ' + a1.pos);
  assert.equal(a1.rot, 90, 'die Drehung bleibt');
  v.handles.aimFor(a1.id);
  taste('Escape');
  assert.ok(!v.handles.aiming, 'Esc bricht das Zielen ab');
  assert.equal(v.handles.selected, a1.id, 'die Auswahl bleibt dabei stehen');
  await settled();
});

test('Datei hin und zurück; Entfernen fragt nicht und lässt sich zurückholen', async () => {
  const { v, ui, host, tool } = P;
  const s = v.state;
  const json = JSON.parse(JSON.stringify(tool.toJSON()));
  assert.equal(json.format, 'dielogic-fuellung');
  assert.equal(json.version, 1);
  assert.deepEqual(Object.keys(json).sort(), ['alpha', 'format', 'items', 'version'], 'das Format bleibt, wie es war');
  assert.equal(json.items.length, 2);
  tool.fromJSON(json);
  assert.equal(items().length, 2);
  assert.equal(s.plan.items[a2.id].share, 70);
  await settled();
  assert.ok(s.result && !s.stale, 'nach dem Laden gerechnet');
  assert.throws(() => tool.fromJSON({ format: 'dielogic-luft', version: 3 }), /keine Fülldatei/);
  assert.ok(tool.exports[0].enabled(), 'der Füllkörper lässt sich exportieren');

  /* Liste und Auswahlfeld. */
  ui('item-list').querySelector('[data-item="' + a1.id + '"]').dispatch('click');
  assert.equal(v.handles.selected, a1.id, 'die Liste wählt');
  ui('inspector-close').dispatch('click');
  assert.equal(v.handles.selected, null, '✕ hebt die Auswahl auf');
  v.handles.select(a1.id);
  taste('Escape');
  assert.equal(v.handles.selected, null, 'Esc auch');

  v.handles.select(a1.id);
  const tiefe = host.history.depth;
  taste('Delete');
  assert.equal(items().length, 1, 'entfernt — ohne Nachfrage');
  assert.equal(v.handles.selected, null);
  assert.ok(ui('inspector').hidden);
  assert.equal(host.history.depth, tiefe + 1);
  const toast = ui('toast');
  assert.ok(!toast.hidden, 'ein Toast sagt, was weg ist');
  assert.match(toast.textContent, /Anschnitt a1 entfernt/);
  await settled();
  assert.equal(s.result.stats.inlets.length, 1);
  toast.querySelector('.st-toast-act').dispatch('click');
  assert.equal(items().length, 2, '„Rückgängig" im Toast holt ihn zurück');
  assert.equal(v.handles.selected, a1.id, 'und er ist gewählt — Entf träfe ihn wieder');
  assert.ok(toast.hidden);
  assert.ok(host.history.canRedo);
  /* Entfernen über den Knopf des Auswahlfelds. */
  ui('del-item').dispatch('click');
  assert.equal(items().length, 1);
  ui('undo').dispatch('click');
  assert.equal(items().length, 2);
  a1 = s.plan.items[a1.id]; a2 = s.plan.items[a2.id];
  await settled();
});

test('Esc mitten im Zug: der Anschnitt springt zurück — kein Schritt, und die Füllung gilt weiter', async () => {
  const { v, host } = P;
  const s = v.state;
  await settled();
  v.handles.select(a1.id);
  schauAuf([a1.pos[0] + 300, a1.pos[1] + 300, a1.pos[2]], a1.pos);
  v.rebuild();
  v.view.scene.updateMatrixWorld(true);
  const p0 = a1.pos.slice(), tiefe = host.history.depth, result = s.result;
  const [hx, hy] = px(a1.pos);
  zeiger('pointerdown', hx, hy);
  assert.ok(v.handles.dragging, 'der Zug beginnt');
  zeiger('pointermove', hx + 60, hy);
  await pause(30);
  const weit = q => Math.hypot(q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]);
  assert.ok(weit(s.plan.items[a1.id].pos) > 5, 'der Anschnitt wandert');
  taste('Escape');
  assert.ok(!v.handles.dragging, 'Esc beendet den Zug');
  a1 = s.plan.items[a1.id]; a2 = s.plan.items[a2.id];
  assert.ok(weit(a1.pos) < 1e-3, 'und der Anschnitt steht, wo er war');
  assert.equal(host.history.depth, tiefe, 'kein Schritt');
  assert.equal(v.handles.selected, a1.id);
  zeiger('pointerup', hx + 60, hy);
  assert.equal(host.history.depth, tiefe, 'das Loslassen danach ist kein Zug mehr');
  await pause(300);
  assert.ok(s.result === result && !s.stale && !s.running, 'nichts rechnet nach: der Plan ist der, zu dem die Füllung gehört');
});

test('Anschnitte, die nichts füllen: neben dem Bauteil oder ohne Anteil — die Seite sagt es', async () => {
  const { v, ui, tool, host } = P;
  const s = v.state;
  await settled();
  const json = JSON.parse(JSON.stringify(tool.toJSON()));
  const [g1, g2] = json.items;
  /* 60 % + 60 % fest und ein dritter aus der Fläche: für ihn bleibt nichts.
     Früher stand da „0 % Strom · füllt 2,5 %". */
  tool.fromJSON({ ...json, items: [{ ...g1, share: 60 }, { ...g2, share: 60 }, { ...g1, id: 'a9', share: undefined }] });
  await settled();
  const row = id => ui('item-list').querySelector('[data-item="' + id + '"]');
  assert.match(row('a9').textContent, /0 % Strom · füllt nichts ⚠/);
  assert.ok(row('a9').classList.contains('warn'));
  assert.equal(s.result.stats.inlets.find(i => i.id === 'a9').cells, 0);
  v.handles.select('a9');
  assert.match(kpiText(ui('sel-kpis')), /füllt\s*nichts.*kein Strom: die festen Anteile der anderen ergeben schon 100 %/);
  assert.ok(ui('sel-kpis').querySelector('.krow.warn'));
  assert.match(kpiText(ui('fill-kpis')), /füllt nichts\s*a9/, 'unter „Füllung" steht es auch');
  v.handles.select(null);
  /* Ein Anschnitt 300 mm neben dem Bauteil: früher füllte er von der nächsten
     Zelle aus mit, und die Seite sagte nur „trifft kaum eine Rasterzelle". */
  const weg = { ...g2, pos: g2.pos.map((x, k) => x + 300 * g2.n[k]) };
  tool.fromJSON({ ...json, items: [g1, weg] });
  await settled();
  assert.match(row(g2.id).textContent, /füllt nichts ⚠/);
  v.handles.select(g2.id);
  assert.match(kpiText(ui('sel-kpis')), /füllt\s*nichts.*liegt neben dem Bauteil/);
  assert.doesNotMatch(kpiText(ui('sel-kpis')), /Rasterzelle/);
  assert.equal(s.result.stats.inlets.find(i => i.id === g1.id).cells, s.result.cells, 'der andere füllt alles');
  /* Sitzt keiner auf dem Bauteil, gibt es keine Füllung — und kein „ok". */
  tool.fromJSON({ ...json, items: [weg] });
  await settled();
  assert.match(kpiText(ui('fill-kpis')), /keine Füllung/);
  assert.ok(ui('fill-kpis').querySelector('.krow.bad'));
  assert.ok(!ui('fill-kpis').querySelector('.krow.ok'), 'kein Urteil „ok" über eine Füllung, die es nicht gibt');
  v.handles.select(null);
  tool.fromJSON(json);
  host.history.reset();
  await settled();
  a1 = s.plan.items[a1.id]; a2 = s.plan.items[a2.id];
  assert.equal(s.result.stats.inlets.filter(i => i.closed).length, 0);
});

test('Kennungen aus Dateien: geprüft beim Laden, maskiert in Liste und Auswahlfeld', async () => {
  const { v, ui, tool } = P;
  const s = v.state;
  const json = tool.toJSON();
  assert.throws(() => tool.fromJSON({ ...json, items: [{ id: '<img src=x onerror=alert(1)>', pos: [0, 0, 0], n: [1, 0, 0] }] }), /keine gültige Kennung/);
  assert.equal(items().length, 2, 'eine abgelehnte Datei lässt den Plan stehen');
  const evil = '<img src=x onerror=alert(1)>';
  s.plan.items[evil] = { ...a1, pos: a1.pos.slice(), n: a1.n.slice(), id: evil };
  v.rebuild();
  v.handles.select(evil);
  for (const el of [ui('item-list'), ui('inspector-title')]) {
    assert.ok(!el.innerHTML.includes('<img') && el.innerHTML.includes('&lt;img'), 'maskiert: ' + el.innerHTML.slice(0, 160));
    assert.equal(el.querySelector('img'), null);
  }
  v.handles.select(null);
  delete s.plan.items[evil];
  v.rebuild();
});

test('Neu rastern: nur wenn die Zellkante sich geändert hat — und das Ergebnis folgt', async () => {
  const { v, ui, shell, host } = P;
  const s = v.state;
  shell.setMode('fuellung');
  assert.ok(ui('primary').hidden, 'dieselbe Kante: kein Knopf');
  /* Eine gröbere Kante eintippen: „Neu rastern" übernimmt sie. */
  const fine = s.field.data.length, h0 = s.field.h;
  const ch = ui('cell');
  ch.value = String(h0 * 2).replace('.', ',');
  ch.dispatch('change');
  assert.equal(s.h, 2 * h0);
  assert.equal(ui('primary').textContent, 'Neu rastern');
  assert.match(ui('note').textContent, /Zellkante geändert/);
  assert.ok(!/Zellen im Bauteil/.test(ui('grid-facts').innerHTML), 'die Details zeigen, was das NEUE Raster kosten wird');
  shell.setMode('ergebnis');
  assert.equal(ui('primary').textContent, 'Neu rastern', 'auch das Ergebnis sagt, dass es noch das vorige Raster zeigt');
  shell.setMode('fuellung');
  /* Zurück auf die alte Kante: nichts zu tun. */
  ch.value = String(h0).replace('.', ','); ch.dispatch('change');
  assert.ok(ui('primary').hidden);
  ch.value = String(h0 * 2).replace('.', ','); ch.dispatch('change');
  ui('primary').dispatch('click');
  await settled();
  assert.equal(s.field.h, s.h, 'das Raster hat die neue Kante');
  same(host.field.data, s.field);
  assert.ok(s.field.data.length < fine / 4, 'und ist viel kleiner: ' + s.field.data.length + ' statt ' + fine);
  assert.ok(ui('primary').hidden);
  assert.equal(shell.mode, 'fuellung', 'ein NEUES Raster lässt einen, wo man ist');
  assert.equal(s.result.stats.inlets.length, 2, 'nachgerechnet');
  /* Grenzen: geklemmt und gesagt; 0,5 mm ist erlaubt — die Grenze ist der Speicher. */
  ch.value = '999'; ch.dispatch('change');
  assert.equal(s.h, 50);
  assert.match(ch.closest('.row').querySelector('.clamp-note').textContent, /begrenzt/);
  ch.value = '0,5'; ch.dispatch('change');
  assert.equal(s.h, 0.5);
  ch.value = String(2 * h0).replace('.', ','); ch.dispatch('change');
  assert.ok(ui('primary').hidden);
});

test('Abbruch beim Rastern: das vorige Raster und sein Ergebnis bleiben', async () => {
  const { v, ui } = P;
  const s = v.state;
  const ch = ui('cell');
  ch.value = '1'; ch.dispatch('change');
  const field = s.field, result = s.result;
  ui('primary').dispatch('click');
  await wait(() => s.running && s.phase === 'raster', 200, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen');
  ui('primary').dispatch('click');
  await wait(() => !s.running && s.ready, 800);
  same(s.field, field, 'das vorige Raster bleibt');
  same(s.result, result, 'und sein Ergebnis passt noch zum Plan');
  assert.match(ui('note').textContent, /Abgebrochen/);
  assert.equal(ui('primary').textContent, 'Neu rastern');
  ch.value = String(field.h).replace('.', ','); ch.dispatch('change');
});

test('Zellkante während des Rasterns: die neue gilt, gerastert wird mit ihr — ohne falsche Meldung', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  shell.setMode('fuellung');
  const ch = ui('cell');
  const h0 = s.field.h;
  ch.value = '2'; ch.dispatch('change');
  assert.equal(ui('primary').textContent, 'Neu rastern');
  ui('primary').dispatch('click');
  await wait(() => s.running && s.phase === 'raster', 400, 5);
  /* Mitten im Rastern eine andere Kante: früher lief das Raster mit 2 mm zu
     Ende, die Eingabe sprang auf 2 zurück, und die Zeile behauptete „Feiner
     geht hier nicht: 16 Mio. Rasterpunkte …". */
  const neu = String(2 * h0).replace('.', ',');
  ch.value = neu; ch.dispatch('change');
  assert.equal(s.h, 2 * h0, 'die neue Kante gilt sofort');
  await settled();
  assert.equal(s.h, 2 * h0, 'und bleibt');
  assert.equal(s.field.h, 2 * h0, 'gerastert ist mit ihr');
  assert.equal(ch.value, neu);
  assert.doesNotMatch(ui('cell-note').textContent, /Feiner geht hier nicht/);
  assert.ok(!s.cancelled && !/Abgebrochen/.test(ui('note').textContent), 'kein Abbruch, den der Anwender sähe');
  assert.equal(s.result.stats.inlets.length, 2, 'und gefüllt');
  ch.value = String(h0).replace('.', ','); ch.dispatch('change');
});

test('Ein neues Bauteil beginnt leer; Abbruch des ersten Laufs: kein Ergebnis, nichts rechnet von selbst', async () => {
  const { v, ui, shell, host } = P;
  const s = v.state;
  await wait(() => { const d = globalThis.localStorage.getItem('studio:fuellung:gearbox_cover'); return d && JSON.parse(d).doc.items.length === 2; }, 200);
  await host.part.pickDemo('gearbox_cover');
  await wait(() => s.ready);
  assert.equal(items().length, 0, 'ein Anschnitt sitzt auf der Wand EINES Bauteils');
  assert.equal(s.plan.alpha, 0, 'α bleibt — das ist eine Annahme, keine Stelle am Teil');
  same(s.field, null); same(s.result, null);
  assert.ok(!host.history.canUndo, 'der Verlauf beginnt neu');
  /* Der Entwurf von eben wird angeboten — nie still übernommen. */
  const banner = ui('banner');
  assert.ok(!banner.hidden, 'der Entwurf wird angeboten');
  assert.match(banner.textContent, /Entwurf .* wiederherstellen/);
  banner.querySelector('.btn-primary').dispatch('click');
  assert.equal(items().length, 2, 'wiederhergestellt');
  assert.equal(s.plan.items.a2.share, 70);
  same(s.result, null, 'gerechnet wird erst auf Knopfdruck');

  /* Fein rastern und mittendrin abbrechen. */
  shell.setMode('fuellung');
  const ch = ui('cell');
  ch.value = '1'; ch.dispatch('change');
  assert.equal(ui('primary').textContent, 'Rechnen');
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen');
  assert.ok(!ui('primary').disabled);
  ui('primary').dispatch('click');
  await wait(() => !s.running && s.ready, 800);
  same(s.result, null, 'nach dem Abbruch gibt es kein Ergebnis');
  same(s.field, null, 'und kein halbes Raster');
  assert.match(ui('note').textContent, /Abgebrochen/);
  assert.equal(ui('primary').textContent, 'Rechnen');
  assert.equal(shell.mode, 'fuellung');
  /* Eine Änderung am Plan stößt jetzt nichts an. */
  const al = ui('alpha');
  al.value = '0.5'; al.dispatch('input');
  await pause(400);
  assert.ok(!s.running, 'nichts rechnet von selbst');
  same(s.result, null);
});

test('Abbruch in der Frontausbreitung: das Raster bleibt, ein Ergebnis gibt es nicht', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  const ch = ui('cell');
  ch.value = '2'; ch.dispatch('change');
  ui('primary').dispatch('click');
  await wait(() => s.phase === 'fill', 2400, 2);
  assert.ok(s.field && s.field.h === 2, 'das Raster steht schon');
  ui('primary').dispatch('click');
  await wait(() => !s.running && s.ready, 800);
  same(s.result, null, 'kein Ergebnis nach dem Abbruch');
  assert.ok(s.field, 'das fertige Raster bleibt');
  assert.match(ui('note').textContent, /Abgebrochen/);
  assert.equal(ui('primary').textContent, 'Rechnen');
  /* Noch einmal, diesmal bis zum Ende: das Raster wird nicht neu gerechnet.
     Eine Änderung am Plan MITTEN im Lauf bricht nichts ab, was der Anwender
     sähe — die Front beginnt still mit dem neuen Plan. */
  const field = s.field;
  ui('primary').dispatch('click');
  await wait(() => s.phase === 'fill', 2400, 2);
  const al = ui('alpha');
  al.value = '0.3'; al.dispatch('input');
  assert.ok(s.running && !s.cancelled, 'der Lauf geht weiter');
  await settled();
  same(s.field, field, 'dasselbe Raster');
  assert.equal(s.result.stats.alpha, 0.3, 'gerechnet ist der Plan, wie er zuletzt war');
  assert.ok(!s.cancelled && !/Abgebrochen/.test(ui('note').textContent));
  assert.equal(shell.mode, 'ergebnis');
});

test('Ohne Bauteil sagt der Chip, was fehlt', () => {
  const { v, ui, host } = P;
  const model = host.part.model;
  host.part.model = null;
  chip().dispatch('click');
  assert.ok(!v.handles.aiming);
  assert.match(ui('toast').textContent, /Bauteil laden/);
  host.part.model = model;
});
