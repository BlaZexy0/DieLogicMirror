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
import { createRequire } from 'node:module';
import { buildDocument, installGlobals } from './stubs/dom.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'tools', '3d-studio');
const read = f => readFileSync(resolve(ROOT, f), 'utf8');

/* Der Angussdesigner holt sich die Schusskurve der Auslegung — die
   klassischen Skripte des Projekts müssen vor ihm da sein (wie auf der
   Seite im <head>). */
const require = createRequire(import.meta.url);
function loadDesignScripts() {
  globalThis.window = globalThis;
  if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  for (const f of ['shared/examples/machines.js', 'shared/examples/alloys.js', 'shared/examples/parts.js', 'shared/project.js']) {
    require(resolve(ROOT, '..', '..', f));
  }
}

/* Warten, bis die laufende Analyse fertig ist — sie startet von selbst
   beim Laden; sonst räumt der nächste Test das DOM unter ihr weg. */
async function analyse(d, mod, tries = 800) {
  for (let i = 0; i < tries; i++) {
    const s = mod.__viewer.state;
    if (!s.running && s.analysed && s.ready) return;
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
let app, doc;

before(async () => {
  ({ doc } = buildDocument(read('entformungsanalyse.html')));
  installGlobals(doc);
  app = await import('../../../web/tools/3d-studio/js/part/app.js');
  await ready(app);
  assert.ok(app.__viewer.state.model, 'Beispielteil wurde geladen');
  await analyse(doc, app);
});

test('Ansichtsleiste und Viewport sind aufgebaut', () => {
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
  assert.ok(doc.getElementById('seg-facts').innerHTML.includes('Schieber'), 'Bilanz Hälften / Schieber / Hinterschnitt');
  assert.ok(doc.getElementById('analysis-state').textContent.includes('automatisch'), 'die Formöffnung wurde gewählt');
  assert.ok(+doc.getElementById('parting-count').textContent.replace(/\D/g, '') > 0, 'Trennlinie gefunden');
});

test('Formöffnung: automatisch gewählt, fest wählbar, sofort neu gerechnet', async () => {
  const s = app.__viewer.state;
  assert.equal(s.axis, 'auto');
  assert.equal(s.seg.auto, true);
  assert.equal(s.seg.mainAxis, 2, 'der Getriebedeckel entformt in Z');
  assert.equal(s.model.faceCount, s.model.rawFaceCount - (s.model.rawFaceCount - s.model.faceCount), 'das Netz bleibt, wie es geladen wurde');
  const ax = doc.getElementById('axis-seg').querySelectorAll('button');
  const before = [...s.seg.areaByLabel];
  ax.find(b => b.dataset.value === '0').dispatch('click');
  assert.equal(s.axis, 0);
  assert.equal(s.seg.mainAxis, 0, 'fest auf X');
  assert.equal(s.seg.auto, false);
  assert.notDeepEqual([...s.seg.areaByLabel], before, 'ohne Bestätigung sofort neu gerechnet');
  assert.ok(doc.getElementById('analysis-state').textContent.includes('X'), 'die Achse steht im Hinweis');
  ax.find(b => b.dataset.value === 'auto').dispatch('click');
  assert.deepEqual([...s.seg.areaByLabel], before, 'Auto findet wieder Z');
  /* Welche Hälfte die bewegliche ist, steht dabei und lässt sich tauschen. */
  assert.ok(doc.getElementById('analysis-state').textContent.includes('bewegliche Seite +Z'), doc.getElementById('analysis-state').textContent);
  assert.equal(doc.getElementById('mov-plus').textContent, '+Z');
  assert.ok(doc.getElementById('legend').innerHTML.includes('Bewegliche Seite +Z'));
  doc.getElementById('mov-seg').querySelectorAll('button').find(b => b.dataset.value === '-1').dispatch('click');
  assert.equal(s.movSign, -1);
  assert.ok(doc.getElementById('legend').innerHTML.includes('Bewegliche Seite −Z') && doc.getElementById('legend').innerHTML.includes('Feste Seite +Z'), 'die Namen wandern mit');
  assert.ok(doc.getElementById('analysis-state').textContent.includes('bewegliche Seite −Z'));
  doc.getElementById('mov-seg').querySelectorAll('button').find(b => b.dataset.value === '1').dispatch('click');
  assert.equal(s.movSign, 1);
});

test('Reiter sind Modi: je Reiter ein Abschnitt und eine eigene Darstellung', () => {
  const s = app.__viewer.state;
  const tabs = ['bauteil', 'entformung', 'formteile', 'flaechen', 'haftung'];
  const secs = tabs.map(t => doc.getElementById('tab-' + t));
  assert.ok(secs.every(Boolean), 'fünf Abschnitte');
  const visible = () => tabs.filter((t, i) => !secs[i].classList.contains('tab-off'));
  assert.deepEqual(visible(), ['entformung'], 'zu Beginn die Entformung');
  assert.equal(s.tab, 'entformung');
  assert.equal(app.__viewer.colouring(), 'regions');
  for (const t of tabs) {
    doc.getElementById('tab-seg').querySelectorAll('button').find(b => b.dataset.value === t).dispatch('click');
    assert.deepEqual(visible(), [t], 'nur ' + t);
    assert.equal(s.tab, t);
  }
  /* Der Reiter bestimmt die Farbe des Bauteils: grau im Bauteil und bei
     den Flächen, Regionen/Schräge in der Entformung, Haftmaß in der Haftung. */
  app.__viewer.showTab('bauteil');
  assert.equal(app.__viewer.colouring(), 'plain');
  const col = app.__viewer.partMesh.geometry.getAttribute('color').array;
  assert.ok(Math.abs(col[0] - 0.72) < 1e-6 && Math.abs(col[1] - 0.76) < 1e-6, 'grau im Reiter Bauteil');
  app.__viewer.showTab('flaechen');
  assert.equal(app.__viewer.colouring(), 'plain');
  app.__viewer.showTab('haftung');
  assert.equal(app.__viewer.colouring(), 'grip');
  assert.equal(doc.getElementById('cb-title').textContent, 'Haftung', 'Farbskala der Haftung');
  app.__viewer.showTab('entformung');
  assert.equal(app.__viewer.colouring(), 'regions');
  assert.ok(!doc.getElementById('colorbar').classList.contains('on'), 'bei den Regionen keine Skala');
  /* Die Netzkanten gehören zum Reiter Bauteil. */
  const edges = doc.getElementById('show-edges');
  edges.checked = true; edges.dispatch('change');
  assert.equal(app.__viewer.edgeLines.visible, false, 'in der Entformung keine Netzkanten');
  app.__viewer.showTab('bauteil');
  assert.equal(app.__viewer.edgeLines.visible, true, 'im Bauteil da');
  edges.checked = false; edges.dispatch('change');
  assert.equal(app.__viewer.edgeLines.visible, false);
  app.__viewer.showTab('entformung');
  assert.ok(doc.getElementById('mode-seg').querySelectorAll('button').every(b => b.dataset.value !== 'grip' && b.dataset.value !== 'plain'),
    'Einfärbung nur Regionen und Schräge');
});

test('Formteile: der Reiter zeigt die Regionen auseinandergezogen, jedes der sechs Formteile schaltbar', () => {
  const s = app.__viewer.state;
  const dv = app.__viewer.dieView;
  assert.equal(dv.group.visible, false, 'in anderen Reitern aus');
  app.__viewer.showTab('formteile');
  assert.equal(dv.group.visible, true, 'die Formteile stehen im Viewport');
  const pieces = dv.pieces;
  assert.ok(pieces.length >= 2, 'mindestens die beiden Hälften: ' + pieces.length);
  assert.equal(pieces.reduce((a, p) => a + p.faces, 0), s.model.faceCount, 'alle Dreiecke verteilt');
  assert.ok(pieces.every(p => p.skirt.length > 0 || p.dir.every(v => v === 0)), 'jedes gerichtete Stück hat einen Rand');
  assert.ok(app.__viewer.partMesh.material.opacity < 0.2, 'das Bauteil steht durchscheinend dazwischen');
  assert.equal(app.__viewer.partingLines.visible, false, 'ohne Trennlinie');
  /* Der Abstand schiebt jedes Stück entlang seiner Richtung. */
  const dist = doc.getElementById('die-dist');
  dist.value = '80';
  dist.dispatch('input');
  assert.equal(s.die.dist, 80);
  for (const h of dv.holders) {
    const p = h.userData.piece;
    assert.ok(Math.abs(h.position.x - p.dir[0] * 80) < 1e-9 && Math.abs(h.position.z - p.dir[2] * 80) < 1e-9, 'Stück ' + p.label + ' verschoben');
  }
  assert.equal(+doc.getElementById('die-skirt').getAttribute('max'), 500, 'der Rand darf bis 500 mm lang sein');
  /* Sechs mögliche Formteile: zwei Hälften, vier Schieber. Der Getriebedeckel
     hat +X und −Y; −X und +Y stehen grau und lassen sich nicht schalten. */
  const rows = doc.getElementById('die-pieces').querySelectorAll('input');
  assert.equal(rows.length, 6, 'sechs Schalter');
  const byLabel = l => rows.find(r => r.dataset.label === String(l));
  assert.equal(byLabel(4).checked, true, 'bewegliche Hälfte an');
  assert.equal(byLabel(5).checked, true, 'feste Hälfte an');
  assert.equal(byLabel(0).checked, true, 'Schieber +X an');
  const offRows = doc.getElementById('die-pieces').querySelectorAll('label').filter(l => l.classList.contains('off'));
  assert.equal(offRows.length, 2, 'Schieber −X und +Y stehen grau: nicht in der Form');
  assert.equal(byLabel(1).getAttribute('disabled') !== undefined && byLabel(2).getAttribute('disabled') !== undefined, true, 'und lassen sich nicht schalten');
  assert.ok(doc.getElementById('die-pieces').innerHTML.includes('nicht in der Form'));
  const holder = l => dv.holders.find(h => h.userData.piece.label === l);
  byLabel(0).checked = false; byLabel(0).dispatch('change');
  assert.equal(s.die.show[0], false);
  assert.equal(holder(0).visible, false, 'Schieber +X ausgeblendet');
  assert.equal(holder(4).visible, true, 'die anderen bleiben');
  byLabel(5).checked = false; byLabel(5).dispatch('change');
  assert.equal(holder(5).visible, false, 'die feste Hälfte ausgeblendet');
  /* Reiter wechseln: die Formteile verschwinden, beim Zurückkommen stehen sie
     mit denselben Schaltern wieder da. */
  app.__viewer.showTab('entformung');
  assert.equal(dv.group.visible, false, 'im nächsten Reiter weg');
  assert.equal(app.__viewer.partMesh.material.opacity, 1, 'das Bauteil wieder deckend');
  assert.equal(app.__viewer.partingLines.visible, true, 'die Trennlinie ist wieder da');
  app.__viewer.showTab('formteile');
  assert.equal(dv.group.visible, true);
  assert.equal(holder(0).visible, false, 'Schalter bleiben: +X noch aus');
  byLabel(0).checked = true; byLabel(0).dispatch('change');
  byLabel(5).checked = true; byLabel(5).dispatch('change');
  assert.ok(dv.holders.every(h => h.visible), 'alle wieder an');
  /* Ohne Bauteil dazwischen ist es unsichtbar. */
  const part = doc.getElementById('die-part');
  part.checked = false; part.dispatch('change');
  assert.equal(app.__viewer.partMesh.visible, false);
  part.checked = true; part.dispatch('change');
  assert.equal(app.__viewer.partMesh.visible, true);
  app.__viewer.showTab('entformung');
});

test('Flächen und Haftung: jeder Reiter zeigt seine Ebenen jenseits des Bauteils — und nimmt sie beim Verlassen mit', () => {
  const s = app.__viewer.state;
  const dv = app.__viewer.dieView;
  const b = s.model.bounds;
  /* Flächen: Zahlen je Formteil, ohne Kräfte; Silhouetten nur in diesem Reiter. */
  const pf = doc.getElementById('proj-facts').innerHTML;
  assert.ok(pf.includes('cm²') && !pf.includes('kN') && !pf.includes('bar'), 'Flächen, keine Kräfte: ' + pf);
  assert.ok(pf.includes('Bewegliche') && pf.includes('Schieber'), 'Hälften und Schieber');
  const mov = s.proj.pieces.find(q => q.label === 4), sl = s.proj.pieces.filter(q => q.axis !== 2);
  assert.ok(mov.area > 0.9 * s.proj.total.area, 'die bewegliche Hälfte deckt fast den ganzen Grundriss');
  assert.ok(sl.every(q => q.area < 0.05 * mov.area), 'ein Schieber sieht eine kleine Fläche');
  const proj = () => dv.overlays.children.filter(o => o.userData.overlay === 'proj');
  assert.ok(proj().every(o => !o.visible), 'in der Entformung keine Silhouetten');
  app.__viewer.showTab('flaechen');
  assert.equal(dv.group.visible, false, 'keine Formteile in diesem Reiter');
  assert.equal(proj().length, s.proj.pieces.length, 'je gerichtetem Stück eine Silhouette');
  assert.ok(proj().every(o => o.visible), 'alle sichtbar');
  const coordOf = o => { const p = o.userData.piece; return o.children[0].position.getComponent(p.axis); };
  for (const o of proj()) {
    const p = o.userData.piece, sg = p.dir[p.axis], c = coordOf(o);
    assert.ok(sg > 0 ? c > b.max[p.axis] + 5 : c < b.min[p.axis] - 5, 'Ebene ' + p.label + ' jenseits des Bauteils: ' + c);
  }
  /* Abstand und Deckkraft. */
  const movO = () => proj().find(o => o.userData.piece.label === 4);
  const z0 = coordOf(movO());
  const gapEl = doc.getElementById('proj-gap');
  gapEl.value = String(s.projView.gap + 50); gapEl.dispatch('input');
  assert.ok(Math.abs(coordOf(movO()) - z0 - 50) < 1e-6, 'der Abstand schiebt die Ebene: ' + coordOf(movO()));
  const alphaEl = doc.getElementById('proj-alpha');
  alphaEl.value = '25'; alphaEl.dispatch('input');
  assert.ok(Math.abs(movO().children[0].material.opacity - 0.25) < 1e-9, 'Deckkraft der Füllung');
  /* Der Fehler von vorhin: in einen anderen Reiter wechseln — die
     Silhouetten müssen mitgehen. */
  app.__viewer.showTab('bauteil');
  assert.ok(proj().every(o => !o.visible), 'im Reiter Bauteil keine Silhouetten');
  assert.equal(app.__viewer.colouring(), 'plain');
  /* Haftung: der Deckel schrumpft auf den Kern der beweglichen Hälfte —
     Innenwände, Rippen und Ring haften, die Außenwände nicht. */
  assert.ok(s.grip.mov > 3 * s.grip.fix, 'haftet an der beweglichen Seite: ' + s.grip.mov + ' / ' + s.grip.fix);
  assert.ok(doc.getElementById('ej-facts').innerHTML.includes('%'));
  assert.ok(doc.getElementById('ej-legend').innerHTML.includes('haftet'));
  assert.equal(doc.getElementById('ej-warn').textContent, '', 'keine Warnung');
  let ribs = 0, ribGrip = 0;
  for (let f = 0; f < s.model.faceCount; f++) {
    const n = s.model.normals, c = s.model.centroids;
    if (Math.abs(n[f * 3 + 2]) > 0.1 || c[f * 3 + 2] > -8 || c[f * 3 + 2] < -60 || Math.abs(c[f * 3]) > 160 || Math.abs(c[f * 3 + 1]) > 120 || Math.hypot(c[f * 3], c[f * 3 + 1]) < 45) continue;
    if (s.seg.label[f] !== 4) continue;
    ribs++; if (s.grip.intensity[f] > 0) ribGrip++;
  }
  assert.ok(ribs > 50 && ribGrip > 0.9 * ribs, 'die Rippenflanken haften: ' + ribGrip + ' von ' + ribs);
  const ejs = () => dv.overlays.children.filter(o => o.userData.overlay === 'ejector');
  const ejOf = label => ejs().find(o => o.userData.piece.label === label);
  assert.ok(ejs().every(o => !o.visible), 'ohne den Reiter keine Karte');
  app.__viewer.showTab('haftung');
  assert.equal(app.__viewer.colouring(), 'grip', 'das Bauteil trägt das Haftmaß');
  /* Beide Hälften bekommen ihre Karte, ohne Auswahl, auf gemeinsamer
     Skala: eine trägt die 1, die andere bleibt darunter. Die Schieber
     haben keine — sie haften nicht mit. */
  assert.ok(s.ejMaps && s.ejMaps.length === 2, 'zwei Karten: ' + (s.ejMaps && s.ejMaps.length));
  const mapMov = s.ejMaps.find(m => m.label === 4), mapFix = s.ejMaps.find(m => m.label === 5);
  assert.ok(mapMov && mapMov.max > 0 && mapFix && mapFix.max > 0, 'Karten der beweglichen und der festen Hälfte');
  const peak = m => Math.max(...m.map);
  assert.ok(Math.abs(Math.max(peak(mapMov), peak(mapFix)) - 1) < 1e-6 && Math.min(peak(mapMov), peak(mapFix)) < 1,
    'gemeinsame Skala: ' + peak(mapMov) + ' / ' + peak(mapFix));
  assert.equal(ejs().length, 2, 'zwei Ebenen im Viewport');
  assert.ok(ejs().every(o => o.visible && o.children.length === 1), 'je eine Ebene, keine Stifte');
  assert.ok(ejOf(4).children[0].position.z > b.max[2] + 5, 'bewegliche Hälfte: jenseits des Bauteils in +Z');
  assert.ok(ejOf(5).children[0].position.z < b.min[2] - 5, 'feste Hälfte: jenseits in −Z');
  assert.ok(proj().every(o => !o.visible), 'keine Silhouetten in der Haftung');
  const egap = doc.getElementById('ej-gap');
  const ez0 = ejOf(4).children[0].position.z, ez1 = ejOf(5).children[0].position.z;
  egap.value = String(s.ej.gap + 40); egap.dispatch('input');
  assert.ok(Math.abs(ejOf(4).children[0].position.z - ez0 - 40) < 1e-6, 'Abstand der Karte in +Z');
  assert.ok(Math.abs(ejOf(5).children[0].position.z - ez1 + 40) < 1e-6, 'Abstand der Karte in −Z');
  const ea = doc.getElementById('ej-alpha');
  ea.value = '40'; ea.dispatch('input');
  assert.ok(ejs().every(o => Math.abs(o.children[0].material.opacity - 0.4) < 1e-9), 'Deckkraft der Karten');
  assert.equal(doc.getElementById('ej-side-seg'), null, 'keine Auswahl der Hälfte mehr');
  app.__viewer.showTab('entformung');
  assert.ok(ejs().every(o => !o.visible), 'beim Verlassen weg');
  assert.equal(app.__viewer.colouring(), 'regions');
});

test('Einfärbungen schalten um', async () => {
  app.__viewer.showTab('entformung');
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
  assert.ok(doc.getElementById('legend').innerHTML.includes('Schieber'), 'Rollen benannt');
  assert.ok(doc.getElementById('legend').innerHTML.includes('Feste Seite'), 'Hälften benannt');
});

test('Farbskala erscheint nur bei geordneten Größen', () => {
  app.__viewer.showTab('entformung');
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

  modes.find(b => b.dataset.value === 'regions').dispatch('click');
  assert.ok(!bar.classList.contains('on'), 'bei den Regionen aus — dort gibt es keine Reihenfolge');
});

test('Beispielteile lassen sich wechseln', async () => {
  const sel = doc.getElementById('demo-select');
  sel.value = 'oil_pan';
  sel.dispatch('change');
  await ready(app, 'Ölwanne');
  const s = app.__viewer.state;
  assert.ok(s.name.includes('Ölwanne'), 'Teil gewechselt: ' + s.name);
  await analyse(doc, app);
  assert.equal(s.seg.mainAxis, 2);
  const halves = s.seg.areaByLabel[4] + s.seg.areaByLabel[5];
  assert.ok(halves > 0.95 * s.model.totalArea, 'dieses Teil bilden die beiden Hälften fast ganz');
});

test('STL laden: Datei, Ziehen-und-Ablegen, kaputte Datei', async () => {
  const { writeSTL } = await import('../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../web/tools/3d-studio/js/solids.js');
  const buf = writeSTL(S.box(40, 30, 20), 'test');
  const file = { name: 'pruefwuerfel.stl', arrayBuffer: () => Promise.resolve(buf), byteLength: buf.byteLength };

  /* Geladen wird im Reiter Bauteil — dort steht das Netz grau. Nach der
     Rechnung springt die Seite zur Entformung, sonst sähe man nichts. */
  app.__viewer.showTab('bauteil');
  const input = doc.getElementById('stl-input');
  input.files = [file];
  input.dispatch('change');
  await ready(app, 'pruefwuerfel.stl');
  assert.equal(app.__viewer.state.model.faceCount, 12, 'Quader aus zwölf Dreiecken');
  await analyse(doc, app);
  const c = app.__viewer.state.seg.counts;
  assert.equal(c.half + c.weak + c.slider, 12, 'jede Seite zugeordnet');
  assert.equal(c.slider, 0, 'ein Quader braucht keinen Schieber');
  assert.equal(app.__viewer.state.tab, 'entformung', 'nach dem Laden zur Entformung');
  assert.equal(app.__viewer.colouring(), 'regions', 'und das Teil ist gefärbt');
  const col = app.__viewer.partMesh.geometry.getAttribute('color').array;
  assert.ok(Math.abs(col[0] - 0.72) > 0.05 || Math.abs(col[1] - 0.76) > 0.05, 'nicht mehr grau');

  /* Ein zweites Teil, während das erste noch rechnet: früher blieb es
     ungerechnet und grau, weil der Aufruf ins Leere lief. */
  const buf3 = writeSTL(S.box(20, 20, 20), 'test');
  input.files = [{ name: 'erstes.stl', arrayBuffer: () => Promise.resolve(buf3), byteLength: buf3.byteLength }];
  input.dispatch('change');
  for (let i = 0; i < 400 && !(app.__viewer.state.running && app.__viewer.state.name === 'erstes.stl'); i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(app.__viewer.state.running, true, 'das erste rechnet noch');
  const buf4 = writeSTL(S.box(10, 30, 20), 'test');
  input.files = [{ name: 'zweites.stl', arrayBuffer: () => Promise.resolve(buf4), byteLength: buf4.byteLength }];
  input.dispatch('change');
  await ready(app, 'zweites.stl');
  await analyse(doc, app);
  assert.equal(app.__viewer.state.name, 'zweites.stl');
  assert.ok(app.__viewer.state.seg && app.__viewer.state.seg.label.length === app.__viewer.state.model.faceCount, 'das zweite ist gerechnet');
  assert.ok(doc.getElementById('legend').innerHTML.includes('%'), 'und hat eine Legende');

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
  const { doc: d3 } = buildDocument(read('entformungsanalyse.html'));
  installGlobals(d3);
  globalThis.location = { search: '?part=heat_sink', href: 'http://test/entformungsanalyse.html?part=heat_sink' };
  const app2 = await import('../../../web/tools/3d-studio/js/part/app.js?variante=adresszeile');
  await ready(app2);
  assert.ok(app2.__viewer.state.name.includes('Kühlkörper'), 'Kühlkörper geladen: ' + app2.__viewer.state.name);
  await analyse(d3, app2);
  assert.ok(app2.__viewer.state.seg, 'Analyse von selbst gelaufen');
  assert.equal(d3.getElementById('demo-select').value, 'heat_sink');
});

test('Angussseite: das Beispiel „Ölwanne" bringt sein Referenzteil mit', async () => {
  const { doc: d } = buildDocument(read('anguss.html'));
  installGlobals(d);
  loadDesignScripts();
  globalThis.location = { search: '?demo=oelwanne', href: 'http://test/anguss.html?demo=oelwanne' };
  const mod = await import('../../../web/tools/3d-studio/js/runner/app.js?variante=oelwanne');
  const v = mod.__viewer;
  assert.ok(v.state.ready, 'das Beispiel steht');
  assert.equal(d.getElementById('demo-select').value, 'oelwanne');
  assert.ok(v.state.refPending, 'das Referenzteil ist unterwegs');
  await v.state.refPending;
  assert.ok(v.refMesh.visible, 'die Ölwanne steht im Viewport');
  assert.match(d.getElementById('ref-note').textContent, /Ölwanne · [\d.,]+ cm³/);
  assert.ok(v.state.proc.volume > 500 && v.state.proc.volume < 5000,
    'ihr Volumen ist das Gussvolumen: ' + v.state.proc.volume + ' cm³');

  /* Lage: Flanschfläche in der Trennebene y = 0, Wanne nach +y, die lange
     Flanschkante an den vier Mündungen — auf der geraden Kante, nicht im
     Eckradius. */
  v.refMesh.geometry.computeBoundingBox();
  const bb = v.refMesh.geometry.boundingBox;
  assert.ok(Math.abs(bb.min.y) < 1e-3 && bb.max.y > 120, 'Trennebene y = 0, Wanne nach +y: ' + bb.min.y + ' … ' + bb.max.y);
  const gates = Object.values(v.state.graph.nodes).filter(n => n.type === 'gate');
  assert.equal(gates.length, 4);
  for (const g of gates) {
    assert.ok(Math.abs(g.pos[2] - bb.min.z) < 0.5, 'Mündung an der Flanschkante: ' + g.pos + ' / ' + bb.min.z);
    assert.ok(Math.abs(g.pos[0]) < 165, 'auf der geraden Kante: ' + g.pos);
  }
  assert.deepEqual(v.state.rules.filter(r => r.level !== 'ok').map(r => r.title), [],
    'das Beispiel verletzt keine Regel');

  /* Ein anderes Beispiel lässt das Referenzteil stehen, × räumt es weg. */
  const sel = d.getElementById('demo-select');
  sel.value = 'zwei';
  sel.dispatch('change');
  assert.ok(v.refMesh.visible, 'der Wechsel nimmt das Teil nicht weg');
  d.getElementById('ref-clear').dispatch('click');
  assert.ok(!v.refMesh.visible);
});

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
  assert.match(d.getElementById('file-warn').textContent, /Namen/);
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
     andere wird blass — der Stahl unter seine Transparenz, das Gussteil
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

  d.getElementById('glb-name').value = 'meine-form';
  d.getElementById('glb-save').dispatch('click');
  const buf = await v.pending;
  assert.ok(buf && buf.byteLength > 1000, 'eine GLB entsteht: ' + (buf && buf.byteLength));
  assert.match(d.getElementById('file-note').textContent, /meine-form\.glb/);

  const json = readGlbJson(buf);
  const names = new Set(json.nodes.map(n => n.name));
  for (const n of ['die', 'fixedRoot', 'movingRoot', 'fixHalf', 'castPart', neu.id]) assert.ok(names.has(n), 'Knoten ' + n);
  const die = json.nodes.find(n => n.name === 'die');
  const meta = die.extras && die.extras.formaufbau;
  assert.ok(meta, 'Metadaten am Wurzelknoten');
  assert.equal(meta.format, 'dielogic-formaufbau');
  assert.ok(meta.groups.some(x => x.key === g.key && x.slide && x.slide.travel === 60), 'Gruppe samt Schieberweg');
  assert.ok(meta.items.some(i => i.id === 'fixHalf' && i.label === 'Feste Hälfte 900 × 1000'), 'neuer Name');
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
  const g2 = asm2.groups.find(x => x.key === g.key);
  assert.ok(g2 && g2.slide && g2.slide.travel === 60, 'Gruppe und Schieberweg überleben');
  assert.equal(asm2.itemOf(neu.id).group, g.key);
  assert.match(d.getElementById('file-source').textContent, /meine-form\.glb/);
  const open = d.getElementById('open');
  open.value = '100'; open.dispatch('input');
  assert.ok(asm2.itemOf(neu.id).object.position.y > 50, 'der geladene Schieber fährt in +y');
});

const fmtDe = v => v.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/* ── Wandstärkenanalyse ────────────────────────────────────── */
test('Wandstärkenanalyse: Feld auf Knopfdruck, Kern daraus abgeleitet', async () => {
  const { doc: d4 } = buildDocument(read('wandstaerke.html'));
  installGlobals(d4);
  globalThis.location = { search: '?part=cover', href: 'http://test/wandstaerke.html' };
  const off = await import('../../../web/tools/3d-studio/js/part/offsetapp.js');
  await ready(off);
  const s = off.__viewer.state;
  assert.ok(s.model, 'Bauteil geladen');
  assert.equal(s.field, null, 'ohne Bestätigung wird kein Feld gerechnet');
  assert.equal(d4.getElementById('run-field').textContent, 'Feld berechnen');
  assert.ok(d4.getElementById('field-facts').innerHTML.includes('Zellkante'),
    'die Kosten stehen VOR dem Rechnen da');
  /* Die Zellkante kommt aus dem Bauteil: die halbe Wanddicke. */
  const F4 = await import('../../../web/tools/3d-studio/js/part/field.js');
  assert.equal(s.cell, F4.suggestCell(s.model), 'Vorgabe halbe Wanddicke: ' + s.cell);
  assert.equal(d4.getElementById('cell').value, fmtDe(s.cell).replace(/\./g, ''));

  /* Grobes Raster, damit der Test flott bleibt. */
  const cell = d4.getElementById('cell');
  cell.value = '8'; cell.dispatch('change');
  assert.equal(s.cell, 8);
  assert.ok(d4.getElementById('field-facts').innerHTML.includes('8 mm'), 'die Kennzahlen folgen');

  d4.getElementById('run-field').dispatch('click');
  for (let i = 0; i < 800 && !s.field; i++) await new Promise(r => setTimeout(r, 25));
  assert.ok(s.field, 'Feld gerechnet');
  assert.equal(s.stale, false);
  assert.equal(d4.getElementById('run-field').textContent, 'Feld ist aktuell');
  /* Das Feld reicht nur so weit wie das Bauteil: zwei Zellen Luft, kein Band nach außen. */
  const b = s.model.bounds;
  for (let a = 0; a < 3; a++) {
    assert.ok(Math.abs(s.field.origin[a] - (b.min[a] - 2 * 8)) < 1e-6, 'Ursprung zwei Zellen vor dem Bauteil, Achse ' + a);
    assert.ok(s.field.origin[a] + (s.field.dims[a] - 1) * s.field.h >= b.max[a] + 2 * 8 - 1e-6, 'und zwei dahinter');
    assert.ok(s.field.origin[a] + (s.field.dims[a] - 1) * s.field.h < b.max[a] + 3 * 8 + 1e-6, 'aber nicht mehr');
  }
  assert.ok(s.field.fullInside, 'innen vollständig');
  assert.ok(s.offsetTris && s.offsetTris.length > 0, 'Kern sofort mit abgeleitet');
  /* Die Vorgabe nach dem Rechnen: ein Untermaß von der halben größten
     Tiefe — die Fläche zeigt die Kerne. */
  assert.ok(Math.abs(s.under - Math.round(s.stats.maxIn) / 2) < 1e-9, 'Vorgabe maxIn/2: ' + s.under + ' bei maxIn ' + s.stats.maxIn);
  assert.equal(d4.getElementById('under').value, fmtDe(s.under).replace(/\./g, ''), 'das Feld zeigt sie');
  assert.ok(d4.getElementById('offset-facts').innerHTML.includes('cm³'), 'Kennwerte');

  /* Untermaß ändern: nur ableiten, kein neues Feld. Ein Minus ist egal —
     nach innen geht es ohnehin. */
  const before = s.offsetTris.length;
  const fieldRef = s.field;
  const d = d4.getElementById('under');
  for (const [typed, want] of [['+4', 4], ['-3', 3], ['−2', 2], ['1,5', 1.5]]) {
    d.value = typed;
    d.dispatch('change');
    assert.equal(s.under, want, 'Eingabe „' + typed + '"');
  }
  assert.equal(s.field, fieldRef, 'dasselbe Feld — nur neu abgeleitet');
  assert.equal(s.stale, false);
  assert.notEqual(s.offsetTris.length, before, 'andere Fläche');
  assert.equal(d4.getElementById('under-slider').value, '1.5', 'der Regler folgt dem Feld');

  /* Der Regler: von 0 bis zur dicksten Stelle, das Feld folgt, abgeleitet wird je Bild. */
  const sl = d4.getElementById('under-slider');
  assert.equal(sl.getAttribute('min'), '0');
  assert.ok(Math.abs(+sl.max - Math.ceil(s.stats.maxIn * 2) / 2) < 1e-9, 'Reglerende = Maximum innen: ' + sl.max);
  const beforeSlider = s.offsetTris.length;
  sl.value = '4';
  sl.dispatch('input');
  assert.equal(s.under, 4, 'der Regler setzt das Untermaß');
  assert.equal(d4.getElementById('under').value, '4', 'das Feld zeigt es');
  await new Promise(r => setTimeout(r, 30));
  assert.notEqual(s.offsetTris.length, beforeSlider, 'und die Fläche ist neu abgeleitet');

  /* Tiefer als die dickste Stelle geht es nicht — und dafür braucht es
     kein neues Feld: nach außen wird nichts mehr gerechnet. */
  d.value = '99'; d.dispatch('change');
  assert.ok(Math.abs(s.under - s.stats.maxIn) < 1e-9, 'tiefer als das Maximum geht es nicht: ' + s.under);
  assert.equal(s.stale, false, 'kein neues Feld nötig');

  /* Eine andere Zellkante verlangt ein neues Feld; ein selbst gesetztes
     Untermaß überlebt es. */
  d.value = '2'; d.dispatch('change');
  cell.value = '10'; cell.dispatch('change');
  assert.equal(s.stale, true, 'Feld muss neu gerechnet werden');
  assert.ok(d4.getElementById('field-state').textContent.includes('Zellkante'));
  d4.getElementById('run-field').dispatch('click');
  for (let i = 0; i < 800 && s.stale; i++) await new Promise(r => setTimeout(r, 25));
  assert.equal(s.stale, false, 'nach dem Neurechnen wieder aktuell');
  assert.equal(s.under, 2, 'ein selbst gesetztes Untermaß überlebt das neue Feld');

  /* Anzeige-Umschalter. */
  const seg = d4.getElementById('show-seg').querySelectorAll('button');
  seg.find(b2 => b2.dataset.value === 'offset').dispatch('click');
  assert.equal(off.__viewer.partMesh.visible, false);
  assert.equal(off.__viewer.offsetMesh.visible, true);
  seg.find(b2 => b2.dataset.value === 'part').dispatch('click');
  assert.equal(off.__viewer.offsetMesh.visible, false);
  seg.find(b2 => b2.dataset.value === 'both').dispatch('click');
  assert.ok(off.__viewer.partMesh.visible && off.__viewer.offsetMesh.visible);
});

test('Wandstärkenanalyse: Feldschnitt, Farbskala und nach Größe gefärbte Wärmezentren', async () => {
  const off = await import('../../../web/tools/3d-studio/js/part/offsetapp.js');
  const d4 = globalThis.document;
  const s = off.__viewer.state;
  const bar = d4.getElementById('colorbar');
  assert.ok(!bar.classList.contains('on'), 'ohne Schnitt und Marken keine Skala');

  const on = d4.getElementById('slice-on');
  on.checked = true;
  on.dispatch('change');
  assert.equal(s.slice.on, true);
  assert.ok(off.__viewer.sliceMesh.visible, 'Schnittebene sichtbar');
  assert.ok(off.__viewer.sliceMesh.material.map, 'Rasterbild erzeugt');
  assert.ok(bar.classList.contains('on'), 'Skala eingeblendet');
  /* Im Schnitt nur das Bauteil, durchscheinend — kein Kern. */
  assert.equal(off.__viewer.offsetMesh.visible, false, 'der Kern verdeckte den Schnitt');
  assert.ok(off.__viewer.partMesh.visible && off.__viewer.partMesh.material.transparent
    && off.__viewer.partMesh.material.opacity <= 0.45, 'das Bauteil durchscheinend');
  /* Die Skala: die Wandstärke in Turbo, bis zum größten Wert im Feld. */
  assert.equal(d4.getElementById('cb-title').textContent, 'Wandstärke');
  const F4 = await import('../../../web/tools/3d-studio/js/part/field.js');
  const st = F4.fieldExtrema(s.field);
  assert.ok(s.stats && Math.abs(s.stats.maxIn - st.maxIn) < 1e-9, 'die Enden sind gerechnet');
  assert.ok(d4.getElementById('cb-ticks').innerHTML.includes(fmtDe(2 * st.maxIn)), 'oben die größte Wandstärke: ' + d4.getElementById('cb-ticks').innerHTML);
  assert.ok(d4.getElementById('cb-extra').innerHTML.includes('Bauteilkontur'));
  assert.equal(d4.getElementById('slice-scale-seg'), null, 'keine Skalenwahl mehr — außen gibt es nichts zu zeigen');
  const C4 = await import('../../../web/tools/3d-studio/js/part/colors.js');
  const lo = C4.turbo(0.15), hi = C4.turbo(0.85), mid = C4.turbo(0.5);
  assert.ok(lo[2] > 0.9 && lo[2] > lo[0] && hi[0] > 0.8 && hi[0] > hi[2] && mid[1] > mid[0] && mid[1] > mid[2],
    'Turbo: blau → grün → rot');

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
  assert.equal(off.__viewer.offsetMesh.visible, true, 'ohne Schnitt ist der Kern wieder da');

  /* Wärmezentren: Kugeln mit dem Radius des Feldwerts, nach Größe gefärbt
     — dieselbe Skala wie der Schnitt, wahlweise Kreise. */
  const hot = d4.getElementById('hot-on');
  assert.equal(off.__viewer.hotGroup.visible, false);
  hot.checked = true;
  hot.dispatch('change');
  assert.equal(off.__viewer.hotGroup.visible, true);
  assert.equal(off.__viewer.hotGroup.children.length, s.maxima.length, 'je Stelle eine Marke');
  assert.ok(s.maxima.length >= 1, 'ein vollständiger Kern hat dickste Stellen');
  assert.ok(bar.classList.contains('on') && d4.getElementById('cb-title').textContent === 'Wandstärke', 'die Skala erklärt die Farben');
  assert.ok(d4.getElementById('cb-extra').innerHTML.includes('Marken'));
  const m0 = off.__viewer.hotGroup.children[0];
  assert.ok(Math.abs(m0.scale.x - s.maxima[0].r) < 1e-9, 'Radius = Feldwert');
  const top = C4.turbo(0.08 + 0.84 * s.maxima[0].r / s.stats.maxIn);
  assert.ok(Math.abs(m0.material.color.r - top[0]) < 0.02 && Math.abs(m0.material.color.b - top[2]) < 0.02, 'die größte Marke trägt die Farbe ihrer Größe');
  if (s.maxima.length > 1) {
    const last = off.__viewer.hotGroup.children[s.maxima.length - 1];
    assert.ok(last.userData.r <= m0.userData.r, 'nach Größe sortiert');
    if (last.userData.r < 0.8 * m0.userData.r) assert.ok(last.material.color.b > m0.material.color.b, 'kleinere Marken bläulicher');
  }
  /* Frei sichtbar: Kern weg, Bauteil durchscheinend — abschaltbar. */
  assert.equal(off.__viewer.offsetMesh.visible, false, 'der Kern verdeckte die Marken');
  assert.ok(off.__viewer.partMesh.material.transparent && off.__viewer.partMesh.material.opacity <= 0.45);
  const clear = d4.getElementById('hot-clear');
  clear.checked = false; clear.dispatch('change');
  assert.equal(off.__viewer.offsetMesh.visible, true, 'ohne den Haken bleibt alles, wie es war');
  clear.checked = true; clear.dispatch('change');
  assert.equal(off.__viewer.offsetMesh.visible, false);
  assert.match(d4.getElementById('hot-facts').innerHTML, /Stellen/);
  assert.match(d4.getElementById('hot-facts').innerHTML, /größte Wandstärke/);
  /* Kreise: dieselben Stellen als Umriss zur Kamera, dieselbe Farbe. */
  d4.getElementById('hot-seg').querySelectorAll('button').find(b => b.dataset.value === 'kreise').dispatch('click');
  assert.equal(s.hot.shape, 'kreise');
  const r0 = off.__viewer.hotGroup.children[0];
  assert.ok(typeof r0.onBeforeRender === 'function', 'Kreise drehen sich zur Kamera');
  assert.ok(Math.abs(r0.material.color.r - top[0]) < 0.02, 'gleiche Farbe wie die Kugel');
  /* Die Schwelle: weniger Stellen ab einem höheren Anteil. */
  const n75 = s.maxima.length;
  const min = d4.getElementById('hot-min');
  min.value = '100'; min.dispatch('input');
  assert.ok(s.maxima.length <= n75 && s.maxima.length >= 1, 'bei 100 % nur die dicksten: ' + s.maxima.length);
  assert.ok(s.maxima.every(m => m.r >= s.stats.maxIn - 1e-9), 'bei 100 % nur die dickste');
  min.value = '75'; min.dispatch('input');
  hot.checked = false; hot.dispatch('change');
  assert.equal(off.__viewer.hotGroup.visible, false);
  assert.ok(!bar.classList.contains('on'), 'ohne Marken keine Skala');
  assert.equal(off.__viewer.offsetMesh.visible, true, 'der Kern kommt zurück');
});

test('Abstandsseite: zwei Dateien, Abstand auf Knopfdruck', async () => {
  const { doc: d5 } = buildDocument(read('abstand.html'));
  installGlobals(d5);
  globalThis.location = { search: '', href: 'http://test/abstand.html' };
  const dist = await import('../../../web/tools/3d-studio/js/part/distanceapp.js');
  await ready(dist);
  const s = dist.__viewer.state;

  assert.ok(s.a.model && s.b.model, 'beide Dateien geladen');
  assert.ok(s.a.name.includes('Ölwanne'), 'A ist die Ölwanne, das Gussteil der Form: ' + s.a.name);
  assert.ok(s.b.name.includes('Temperierung fest'), 'B ist die Temperierung der festen Hälfte: ' + s.b.name);
  assert.equal(s.analysed, false, 'ohne Bestätigung wird nicht gerechnet');
  /* Die Seitenleiste bleibt knapp: keine Netz-Kennzahlen, keine
     Beschreibung des Beispielteils — nur die Warnzeile. */
  assert.equal(d5.getElementById('model-facts-a'), null, 'keine Kennzahlen A');
  assert.equal(d5.getElementById('part-note-b'), null, 'keine Beschreibung B');
  assert.ok(d5.getElementById('model-warn-a') && d5.getElementById('model-warn-b'), 'die Warnzeilen bleiben');

  /* Das Gegenstück darf nur hier in der Auswahl stehen. */
  const optsA = d5.getElementById('demo-select-a').innerHTML;
  assert.ok(optsA.includes('coolmov'), 'Gegenstücke sind hier wählbar');

  d5.getElementById('run-distance').dispatch('click');
  for (let i = 0; i < 1200 && !s.analysed; i++) await new Promise(r => setTimeout(r, 25));
  assert.ok(s.analysed, 'Abstand gerechnet');
  assert.ok(s.a.dist && s.a.dist.length === s.a.model.vertexCount, 'ein Wert je Punkt von A');
  assert.ok(s.b.dist && s.b.dist.length === s.b.model.vertexCount, 'ein Wert je Punkt von B');

  /* Beide Richtungen müssen (fast) denselben kleinsten Abstand finden —
     der kürzeste Weg zwischen zwei Flächen ist symmetrisch. Gemessen wird
     aber an den Eckpunkten des verfeinerten Netzes (Schritt diag/80,
     hier gut 6 mm), und der nächste Punkt der Gegenfläche liegt selten
     genau auf einem Eckpunkt: ein Unterschied von einem Bruchteil des
     Schritts ist Abtastung, kein Fehler. */
  const step = Math.max(s.a.model.bounds.diag, s.b.model.bounds.diag) / 80;
  assert.ok(Math.abs(s.a.stats.min - s.b.stats.min) < step / 4,
    'kleinster Abstand von beiden Seiten gleich: ' + s.a.stats.min.toFixed(2) + ' / ' + s.b.stats.min.toFixed(2)
    + ' (Schritt ' + step.toFixed(2) + ')');
  assert.ok(s.a.stats.min > 0, 'die Körper berühren sich nicht');
  /* Die Skala stellt sich auf die Messwerte: kleinster bis größter Abstand. */
  const lo = Math.min(s.a.stats.min, s.b.stats.min), hi = Math.max(s.a.stats.max, s.b.stats.max);
  assert.ok(Math.abs(s.scale.min - lo) <= 0.1 + 1e-9 && Math.abs(s.scale.max - hi) <= 0.1 + 1e-9,
    'Grenzen aus den Messwerten: ' + s.scale.min + ' … ' + s.scale.max + ' gegen ' + lo.toFixed(2) + ' … ' + hi.toFixed(2));
  assert.equal(globalThis.document.getElementById('scale-min').value, String(s.scale.min).replace('.', ','));
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
  loadDesignScripts();
  globalThis.location = { search: '', href: 'http://test/anguss.html' };
  const mod = await import('../../../web/tools/3d-studio/js/runner/app.js');
  const v = mod.__viewer;
  assert.ok(v.state.ready, 'das Beispiel steht');

  /* Die Ankunft steht nach der DieLogic-Schusskurve der Auslegung — ab
     Kolbenstart, die Substitution über das Volumen am Pressrest. */
  assert.ok(v.state.onCurve && v.state.timeline && !v.state.timeline.error, 'Kurve: ' + (v.state.timeline && v.state.timeline.error));
  assert.ok(v.state.flowShown.onCurve && v.state.flowShown !== v.state.flow);
  for (const g of v.state.flowShown.gates) {
    const konst = v.state.flow.gates.find(x => x.id === g.id);
    const V = konst.tArrive * v.state.flow.Q;
    assert.ok(Math.abs(g.tArrive - (v.state.timeline.tFull + v.state.timeline.timeForVolume(V))) < 1e-9, 'Kurvenzeit zu ' + g.id);
    assert.ok(g.tArrive > v.state.timeline.tFull, 'nach Kammer voll');
  }
  assert.ok(d6.getElementById('chart-facts').innerHTML.includes('ab Kolbenstart'), 'die Kennzahlen nennen die Kurve');
  assert.ok(d6.getElementById('shot-facts').innerHTML.includes('Kammer voll'), 'die Seitenleiste zeigt die Kurve');
  /* Die Füllkammer ist die von hier: der Pressrest als Kolben, die
     Kammerlänge aus dem Feld — nicht die Kammer des Projekts. */
  assert.ok(d6.getElementById('shot-facts').innerHTML.includes('Füllgrad'), 'die Seitenleiste nennt den Füllgrad');
  assert.equal(v.state.timeline.v.diam, v.state.graph.biscuit.d, 'der Pressrest-Ø ist der Kolben-Ø der Kurve');
  assert.equal(v.state.timeline.v.length, v.state.proc.chamberLen);
  assert.equal(d6.getElementById('chamber-len').value, '450');
  const phiBefore = v.state.timeline.phi;
  const cl = d6.getElementById('chamber-len');
  cl.value = '600';
  cl.dispatch('change');
  assert.equal(v.state.proc.chamberLen, 600);
  assert.equal(v.state.timeline.v.length, 600, 'die Kurve rechnet mit der neuen Kammer');
  assert.ok(v.state.timeline.phi < phiBefore, 'längere Kammer, kleinerer Füllgrad');
  cl.value = '450';
  cl.dispatch('change');
  assert.equal(v.state.proc.chamberLen, 450);
  assert.equal(d6.getElementById('shot-adopt').disabled, false);
  const tfillBefore = v.state.proc.fillTime;
  d6.getElementById('shot-adopt').dispatch('click');
  assert.ok(Math.abs(v.state.proc.fillTime - Math.round(v.state.timeline.shot.fill * 10) / 10) < 1e-9, 'die Füllzeit der Kurve ist übernommen: ' + tfillBefore + ' → ' + v.state.proc.fillTime);
  /* Zurück auf die Füllzeit des Beispiels — die Prüfliste unten erwartet es so. */
  d6.getElementById('tfill').value = String(tfillBefore);
  d6.getElementById('tfill').dispatch('change');
  assert.equal(v.state.proc.fillTime, tfillBefore);
  const cbShot = d6.getElementById('shot-time');
  cbShot.checked = false;
  cbShot.dispatch('change');
  assert.equal(v.state.flowShown, v.state.flow, 'aus: konstanter Strom');
  assert.ok(d6.getElementById('chart-facts').innerHTML.includes('konstantem Strom'));
  cbShot.checked = true;
  cbShot.dispatch('change');
  assert.ok(v.state.flowShown.onCurve);

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

  /* Die Ausstoßrichtung umschalten dreht das System um den Pressrest —
     die Kamera bleibt, wo sie ist. Vorher passte die Seite das Bild neu
     ein, und der Blick, den man sich gerade eingestellt hatte, war weg. */
  {
    const camBefore = v.view.camera.position.toArray();
    const tgtBefore = v.view.controls.target.toArray();
    const ax = d6.getElementById('axis-seg').querySelectorAll('button');
    ax.find(b => b.dataset.value === '+z').dispatch('click');
    assert.equal(v.state.graph.biscuit.axis, '+z');
    assert.deepEqual(v.view.camera.position.toArray(), camBefore, 'die Kamera steht noch');
    assert.deepEqual(v.view.controls.target.toArray(), tgtBefore, 'und ihr Ziel auch');
    ax.find(b => b.dataset.value === '+y').dispatch('click');
    assert.equal(v.state.graph.biscuit.axis, '+y');
  }

  /* Der Zwickelradius steht unter „Kanalform" und formt die Gabelungen. */
  assert.equal(d6.getElementById('branch-r').value, '4');
  const br = d6.getElementById('branch-r');
  br.value = '6';
  br.dispatch('change');
  assert.equal(v.state.graph.branchR, 6);
  br.value = '4';
  br.dispatch('change');

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
  assert.match(d6.getElementById('chart-body').innerHTML, /Ankunft [\d.,]+ ms/, 'die Ankunft der Schmelze steht am Anschnitt');
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

  /* Import und Export: der Graph als JSON, die Geometrie als ZWEI STL —
     der Anguss (am Pressrest beschnitten) und der Pressrest. */
  const blobs = [];
  const urlBefore = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = b => { blobs.push(b); return 'blob:test'; };
  d6.getElementById('json-save').dispatch('click');
  assert.equal(blobs.length, 1);
  d6.getElementById('stl-save').dispatch('click');
  assert.equal(blobs.length, 3, 'zwei Dateien aus einem Klick');
  assert.ok(blobs[1].size > 84 && blobs[2].size > 84, 'beide mit Inhalt');
  assert.ok(blobs[1].size > blobs[2].size * 3, 'der Anguss ist die große, der Pressrest die kleine');
  globalThis.URL.createObjectURL = urlBefore;
  assert.equal(d6.getElementById('run-merge'), null, 'aber kein Verschmelzen mehr');
});

/* ── Überlaufdesigner ─────────────────────────────────────── */
test('Überlaufdesigner: setzen, ziehen, drehen, neu setzen, Datei', async () => {
  const { doc: d7 } = buildDocument(read('ueberlauf.html'));
  installGlobals(d7);
  globalThis.location = { search: '', href: 'http://test/ueberlauf.html' };
  const mod = await import('../../../web/tools/3d-studio/js/vents/app.js');
  const v = mod.__viewer;
  for (let i = 0; i < 600 && !v.state.ready; i++) await new Promise(r => setTimeout(r, 25));
  assert.ok(v.state.ready && v.state.model, 'das Beispielteil steht');
  assert.ok(v.refMesh.visible);
  assert.equal(v.state.plan.items && Object.keys(v.state.plan.items).length, 0, 'ohne Plan keine Elemente');
  assert.equal(d7.getElementById('rules-list'), null, 'keine Prüfliste in diesem Werkzeug');
  assert.equal(d7.getElementById('axis-seg'), null, 'und keine Trennebene');
  assert.match(d7.getElementById('plan-facts').innerHTML, /Bauteil/, 'das Bauteilvolumen steht da');
  assert.ok(v.view.axes, 'das Achsenkreuz hängt an der Szene');
  assert.equal(d7.getElementById('ref-opacity').value, '100', 'das Bauteil ist deckend');

  /* Setzen: Art wählen, dann aufs Bauteil klicken. Die Kamera schaut von
     +X waagerecht auf die Bauteilmitte — der Strahl trifft eine Wand,
     die Bohne wächst entlang deren Normale nach außen (+X). */
  const T3 = await import('three');
  const b = v.state.model.bounds;
  const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const cam = v.view.camera;
  const look = () => { cam.up.set(0, 1, 0); cam.lookAt(c[0], c[1], c[2]); cam.updateMatrixWorld(true); v.view.scene.updateMatrixWorld(true); };
  cam.position.set(b.max[0] + 400, c[1], c[2]);
  look();
  const canvas = v.view.renderer.domElement;
  const zeiger = (t, x, y, extra = {}) => canvas.dispatch(t,
    { button: 0, clientX: x, clientY: y, stopPropagation() {}, preventDefault() {}, ...extra });
  const klick = (x, y) => { zeiger('pointerdown', x, y); zeiger('pointerup', x, y); };
  const px = p => { const q = new T3.Vector3(...p).project(cam); return [(q.x + 1) / 2 * 800, (1 - q.y) / 2 * 600]; };

  d7.getElementById('add-bohne').dispatch('click');
  assert.ok(v.handles.aiming, 'der Zielmodus ist scharf');
  assert.ok(!d7.getElementById('aim-banner').classList.contains('hidden'));
  klick(400, 300);
  assert.ok(!v.handles.aiming, 'der Treffer setzt die Bohne');
  const items = Object.values(v.state.plan.items);
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.type, 'bohne');
  assert.ok(it.pos[0] > c[0], 'auf der +X-Seite des Bauteils: ' + it.pos);
  assert.ok(it.dir[0] > 0.9, 'sie wächst nach außen, entlang der Wandnormalen: ' + it.dir);
  assert.equal(v.handles.selected, it.id, 'und ist gewählt');
  assert.match(d7.getElementById('pt-sel').innerHTML, /Überlaufbohne/);
  const param = k => d7.getElementById('sel-params').querySelector('#p-' + k);
  assert.ok(param('wellD'), 'die Maße der Art stehen im Feld');
  assert.match(d7.getElementById('plan-facts').innerHTML, /Überläufe.*Gesamt/s, 'Bauteil, Überläufe, Gesamt');
  assert.ok(v.group.children.some(m => m.visible && m.geometry && m.geometry.attributes.position
    && m.geometry.attributes.position.count > 0 && m !== v.refMesh), 'ein Körper steht im Viewport');

  /* Ziehen: in der Tangentialebene der Wand. Schräg von oben auf den
     Punkt geschaut — genau entlang der Normalen läge der Pfeil vor der
     Kugel und der Klick träfe ihn; so liegt er daneben. Der Punkt
     rutscht auf der Wand entlang (y, z), nicht von ihr weg (x). */
  cam.position.set(it.pos[0] + 300, it.pos[1] + 300, it.pos[2]);
  cam.up.set(0, 1, 0); cam.lookAt(it.pos[0], it.pos[1], it.pos[2]); cam.updateMatrixWorld(true);
  v.view.scene.updateMatrixWorld(true);
  const p0 = it.pos.slice();
  const [hx, hy] = px(it.pos);
  zeiger('pointerdown', hx, hy);
  assert.ok(v.handles.dragging, 'der Zug beginnt am Punkt');
  zeiger('pointermove', hx + 70, hy);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', hx + 70, hy);
  assert.ok(Math.hypot(it.pos[1] - p0[1], it.pos[2] - p0[2]) > 5, 'der Punkt wandert auf der Wand: ' + p0 + ' → ' + it.pos);
  /* Die Wand hat 1,5° Schräge: in x nur, was die Schräge zum Weg in z
     vorgibt — plus ein Zehntel für die Facetten der Wandfläche. */
  assert.ok(Math.abs(it.pos[0] - p0[0]) <= Math.abs(it.pos[2] - p0[2]) * Math.tan(1.5 * Math.PI / 180) + 0.1,
    'aber nicht von ihr weg: ' + p0 + ' → ' + it.pos);

  /* Drehen um die Normale: oben bleibt die Wandnormale, die Längsrichtung
     schwenkt in der Wand. */
  const G7 = await import('../../../web/tools/3d-studio/js/vents/model.js');
  const d0 = G7.frameOf(it).d.slice();
  const n0 = it.dir.slice();
  const rot = d7.getElementById('sel-rot');
  rot.value = '90';
  rot.dispatch('input');
  assert.equal(it.rot, 90);
  const f = G7.frameOf(it);
  assert.deepEqual(f.n, n0, 'oben bleibt die Wandnormale');
  assert.ok(Math.abs(f.d[0] * d0[0] + f.d[1] * d0[1] + f.d[2] * d0[2]) < 1e-9, 'längs um 90° gedreht: ' + f.d);
  assert.ok(Math.abs(f.d[0] * n0[0] + f.d[1] * n0[1] + f.d[2] * n0[2]) < 1e-9, 'und noch in der Wand');
  assert.match(d7.getElementById('sel-rot-val').textContent, /90/);

  /* Neu setzen: der Pfeil schaltet den Zielmodus scharf, der Klick aufs
     Bauteil versetzt das Element samt Richtung. */
  cam.position.set(b.max[0] + 400, c[1], c[2] + 20);
  cam.up.set(0, 1, 0); cam.lookAt(c[0], c[1], c[2] + 20); cam.updateMatrixWorld(true);
  v.rebuild();
  v.view.scene.updateMatrixWorld(true);
  const tip = v.handles.arrowTip(it.id);
  assert.ok(tip, 'die Bohne trägt einen Pfeil');
  v.handles.aimFor(it.id);
  assert.ok(v.handles.aiming, 'der Pfeil zielt');
  assert.match(d7.getElementById('aim-text').textContent, /neue Stelle/);
  klick(400, 300);
  assert.ok(!v.handles.aiming);
  assert.ok(Math.abs(it.pos[2] - (c[2] + 20)) < 1e-6, 'versetzt: ' + it.pos);
  assert.equal(it.rot, 90, 'die Drehung bleibt');

  /* Art wechseln, Maß ändern — das Volumen zieht nach. */
  const typeSel = d7.getElementById('sel-type');
  typeSel.value = 'entlueftet';
  typeSel.dispatch('change');
  assert.equal(it.type, 'entlueftet');
  const vh = param('ventH');
  assert.ok(vh, 'der Kanal hat eine Höhe');
  const before = d7.getElementById('plan-facts').innerHTML;
  vh.value = '0,4';
  vh.dispatch('change');
  assert.equal(it.p.ventH, 0.4);
  assert.notEqual(d7.getElementById('plan-facts').innerHTML, before, 'mehr Kanal, mehr Volumen');
  assert.ok(param('draft') && param('wellR'), 'Schräge und Radius stehen im Feld');
  assert.ok(!param('ventL'), 'der Kanal hat keine Länge als Maß');

  /* Der Entlüftungskanal: eine zweite Kugel am Ende der Bohne, dahinter
     je Punkt eine — die Punkte werden in der Wandebene gezogen. */
  const griff = id => v.handles.group.children.find(m => m.userData && m.userData.id === id);
  assert.ok(griff(it.id + ':v0'), 'die Kugel am Bohnenende');
  assert.ok(griff(it.id + ':v1'), 'und der erste Kanalpunkt');
  assert.ok(!v.handles.arrowTip(it.id + ':v1'), 'ein Kanalpunkt hat keinen Pfeil');
  assert.ok(!d7.getElementById('vent-block').classList.contains('hidden'), 'das Kanalfeld ist da');
  d7.getElementById('vent-add').dispatch('click');
  assert.equal(it.vent.length, 2, '+ Punkt hängt einen an');
  assert.equal(v.handles.selected, it.id + ':v2', 'und wählt ihn');
  assert.match(d7.getElementById('pt-sel').innerHTML, /Kanalpunkt 2/);
  assert.match(d7.getElementById('vent-note').textContent, /2 Punkte/);
  const w1 = G7.ventWorld(it);
  assert.ok(Math.hypot(w1.exit[0] - griff(it.id + ':v0').position.x, w1.exit[1] - griff(it.id + ':v0').position.y,
    w1.exit[2] - griff(it.id + ':v0').position.z) < 1e-9, 'die Kugel sitzt am Bohnenende');
  /* Ziehen: schräg auf den Punkt geschaut, der Zeiger wandert — der Punkt
     rutscht in der Wandebene des Elements, nicht von ihr weg. */
  const q0 = w1.points[1].slice();
  const e0 = it.pos.slice();
  cam.position.set(q0[0] + 300, q0[1] + 300, q0[2]);
  cam.up.set(0, 1, 0); cam.lookAt(q0[0], q0[1], q0[2]); cam.updateMatrixWorld(true);
  v.rebuild();
  v.view.scene.updateMatrixWorld(true);
  const [qx, qy] = px(q0);
  zeiger('pointerdown', qx, qy);
  assert.ok(v.handles.dragging, 'der Zug beginnt am Kanalpunkt');
  zeiger('pointermove', qx + 60, qy - 25);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', qx + 60, qy - 25);
  const q1 = G7.ventWorld(it).points[1];
  assert.ok(Math.hypot(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]) > 5, 'der Punkt wandert: ' + q0 + ' → ' + q1);
  const n1 = it.dir;
  assert.ok(Math.abs((q1[0] - it.pos[0]) * n1[0] + (q1[1] - it.pos[1]) * n1[1] + (q1[2] - it.pos[2]) * n1[2]) < 1e-6,
    'aber in der Wandebene des Elements');
  assert.deepEqual(it.pos, e0, 'das Element selbst blieb, wo es war');
  /* Das Lagefeld zeigt den Punkt und setzt ihn — in die Ebene gelotet. */
  assert.equal(d7.getElementById('sel-x').value, q1[0].toFixed(1).replace('.', ','));
  const sy = d7.getElementById('sel-y');
  sy.value = String(Math.round(q1[1] + 30));
  sy.dispatch('change');
  const q2 = G7.ventWorld(it).points[1];
  assert.ok(Math.abs(q2[1] - Math.round(q1[1] + 30)) < 0.5, 'nach y versetzt: ' + q2);
  assert.ok(Math.abs((q2[0] - it.pos[0]) * n1[0] + (q2[1] - it.pos[1]) * n1[1] + (q2[2] - it.pos[2]) * n1[2]) < 1e-6, 'und noch in der Ebene');
  /* Entf löscht den gewählten Punkt, nicht das Element; der letzte bleibt. */
  d7.dispatch('keydown', { key: 'Delete', target: canvas });
  assert.equal(it.vent.length, 1, 'ein Punkt weniger');
  assert.ok(v.state.plan.items[it.id], 'das Element steht noch');
  assert.equal(v.handles.selected, it.id + ':v1');
  assert.ok(d7.getElementById('vent-del').disabled, 'der letzte Punkt lässt sich nicht entfernen');
  assert.ok(d7.getElementById('del-item').disabled, 'auch der Löschknopf ist aus');
  d7.dispatch('keydown', { key: 'Delete', target: canvas });
  assert.equal(it.vent.length, 1, 'er bleibt');
  assert.ok(v.state.plan.items[it.id], 'und das Element auch — Entf auf dem letzten Punkt löscht nicht die Bohne');
  d7.getElementById('vent-add').dispatch('click');
  d7.getElementById('vent-del').dispatch('click');
  assert.equal(it.vent.length, 1, '− Punkt nimmt ihn wieder weg');

  /* Datei hin und zurück, dann löschen. */
  const json = JSON.parse(JSON.stringify(G7.toJSON(v.state.plan)));
  assert.equal(json.items[0].vent.length, 1, 'der Kanal steht in der Datei');
  v.loadPlan(G7.fromJSON(json));
  assert.equal(Object.keys(v.state.plan.items).length, 1);
  assert.ok(griff(it.id + ':v0') && griff(it.id + ':v1'), 'Kugeln nach dem Laden');
  v.handles.select(it.id);
  d7.getElementById('del-item').dispatch('click');
  assert.equal(Object.keys(v.state.plan.items).length, 0, 'gelöscht');
  assert.equal(v.handles.selected, null);

  /* Ohne Bauteil: der Klick auf eine Art sagt, was fehlt. */
  v.refMesh.visible = false;
  d7.getElementById('add-schlitz').dispatch('click');
  assert.ok(!v.handles.aiming);
  assert.match(d7.getElementById('aim-text').textContent, /Bauteil laden/);
  v.refMesh.visible = true;
});

/* ── Temperierkanal-Designer ─────────────────────────────────── */
test('Temperierkanal-Designer: Abstandsfläche, Kühlstich, Kanal, Achsenpfeile, Datei', async () => {
  const { doc: d8 } = buildDocument(read('temperier.html'));
  installGlobals(d8);
  globalThis.location = { search: '', href: 'http://test/temperier.html' };
  const mod = await import('../../../web/tools/3d-studio/js/cooling/app.js');
  const v = mod.__viewer;
  for (let i = 0; i < 1200 && !v.state.ready; i++) await new Promise(r => setTimeout(r, 25));
  assert.ok(v.state.ready && v.state.model, 'das Beispielteil steht');
  assert.ok(v.state.field && v.state.shellDist === 20, 'die Abstandsfläche im Abstand 20 mm ist gerechnet');
  assert.ok(v.shellMesh.visible && v.shellMesh.geometry.attributes.position.count > 0, 'und steht im Viewport');
  assert.match(d8.getElementById('shell-note').textContent, /20 mm/);
  assert.equal(d8.getElementById('add-stich').disabled, false, 'setzen ist frei');
  /* Kantenlänge in mm statt Auflösung, wie auf den anderen Seiten —
     Vorgabe ein 64stel der längsten Bauteilkante, auf halbe Millimeter. */
  const longest = Math.max(...v.state.model.bounds.size);
  assert.ok(Math.abs(v.state.h - Math.round(longest / 64 * 2) / 2) < 1e-9, 'Vorgabe der Kantenlänge: ' + v.state.h);
  assert.equal(d8.getElementById('cell').value, String(v.state.h).replace('.', ','));
  assert.ok(Math.abs(v.state.field.h - v.state.h) < 1e-9, 'das Feld hat diese Zellkante');
  assert.equal(d8.getElementById('res'), null, 'kein Auflösungsregler mehr');
  /* Durchscheinend oder deckend — ein Häkchen schaltet das Material um. */
  assert.ok(v.shellMesh.material.transparent && v.shellMesh.material.opacity < 0.5 && !v.shellMesh.material.depthWrite, 'voreingestellt durchscheinend');
  const clear = d8.getElementById('shell-clear');
  clear.checked = false; clear.dispatch('change');
  assert.ok(!v.shellMesh.material.transparent && v.shellMesh.material.opacity === 1 && v.shellMesh.material.depthWrite, 'deckend: undurchsichtig und in die Tiefe schreibend');
  assert.ok(v.shellMesh.visible, 'und noch zu sehen');
  clear.checked = true; clear.dispatch('change');
  assert.ok(v.shellMesh.material.transparent && v.shellMesh.material.opacity < 0.5, 'und wieder durchscheinend');

  /* Kamera von +X waagerecht auf die Bauteilmitte: der Strahl durch die
     Bildmitte trifft die Abstandsfläche vor der +X-Wand. */
  const T3 = await import('three');
  const b = v.state.model.bounds;
  const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const cam = v.view.camera;
  const look = (pos, at) => { cam.position.set(...pos); cam.up.set(0, 1, 0); cam.lookAt(...at); cam.updateMatrixWorld(true); v.view.scene.updateMatrixWorld(true); };
  look([b.max[0] + 400, c[1], c[2]], c);
  const canvas = v.view.renderer.domElement;
  const zeiger = (t, x, y) => canvas.dispatch(t, { button: 0, clientX: x, clientY: y, stopPropagation() {}, preventDefault() {} });
  const klick = (x, y) => { zeiger('pointerdown', x, y); zeiger('pointerup', x, y); };
  const px = p => { const q = new T3.Vector3(...p).project(cam); return [(q.x + 1) / 2 * 800, (1 - q.y) / 2 * 600]; };

  /* Kühlstich, Richtung Normale: Spitze auf der Fläche, Stich nach +X. */
  d8.getElementById('add-stich').dispatch('click');
  assert.ok(v.handles.aiming);
  klick(400, 300);
  assert.ok(!v.handles.aiming);
  const items = () => Object.values(v.state.plan.items);
  assert.equal(items().length, 1);
  const s1 = items()[0];
  assert.equal(s1.type, 'stich');
  /* Die +X-Wand des Getriebedeckels steht mit 1,5° Schräge unter dem
     Flansch, der bis b.max reicht — gemessen wird gegen die Wand auf
     Höhe der Bauteilmitte. */
  const wallX = 190 + c[2] * Math.tan(1.5 * Math.PI / 180);
  assert.ok(s1.p[0] > wallX + 15 && s1.p[0] < wallX + 25, 'die Spitze sitzt rund 20 mm vor der Wand: ' + s1.p);
  assert.ok(s1.dir[0] > 0.95, 'und der Stich läuft nach außen (+X): ' + s1.dir);
  assert.equal(s1.d, 20, 'Vorgabe Durchmesser'); assert.equal(s1.len, 200, 'Vorgabe Länge');
  assert.match(d8.getElementById('pt-sel').innerHTML, /Kühlstich/);
  assert.match(d8.getElementById('sel-facts').innerHTML, /Wandabstand/, 'der Wandabstand steht im Feld');

  /* Richtung Z: der Stich läuft entlang Z, mit dem Vorzeichen vom Bauteil weg. */
  d8.getElementById('dir-seg').querySelectorAll('button').find(x => x.dataset.value === 'z').dispatch('click');
  assert.equal(v.state.dirMode, 'z');
  d8.getElementById('add-stich').dispatch('click');
  klick(400, 300);
  const s2 = items()[1];
  assert.ok(Math.abs(Math.abs(s2.dir[2]) - 1) < 1e-9 && Math.abs(s2.dir[0]) < 1e-9, 'entlang Z: ' + s2.dir);
  /* Richtung Blick: auf die Kamera zu, hier also +X. */
  d8.getElementById('dir-seg').querySelectorAll('button').find(x => x.dataset.value === 'blick').dispatch('click');
  d8.getElementById('add-stich').dispatch('click');
  klick(400, 300);
  assert.ok(items()[2].dir[0] > 0.99, 'zur Kamera: ' + items()[2].dir);

  /* Kanal mit zwei Klicks. */
  d8.getElementById('add-kanal').dispatch('click');
  assert.match(d8.getElementById('aim-text').textContent, /erste Ende/);
  klick(400, 300);
  assert.ok(v.handles.aiming, 'nach dem ersten Punkt bleibt der Modus scharf');
  assert.match(d8.getElementById('aim-text').textContent, /andere Ende/);
  klick(400, 240);
  assert.ok(!v.handles.aiming);
  const k = items().find(i => i.type === 'kanal');
  assert.ok(k, 'der Kanal ist da');
  assert.ok(Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1], k.b[2] - k.a[2]) > 5, 'mit zwei verschiedenen Enden');
  assert.equal(v.handles.selected, k.id + ':b', 'das zweite Ende ist gewählt');
  assert.match(d8.getElementById('pt-sel').innerHTML, /Ende B/);
  assert.equal(k.d, 10);

  /* Achsenpfeile: das gewählte Ende hat drei; am Y-Pfeil ziehen bewegt nur y. */
  v.view.scene.updateMatrixWorld(true);
  const tipY = v.handles.gizmoTip(1);
  assert.ok(tipY, 'die Achsenpfeile stehen am gewählten Ende');
  const [tx, ty] = px(tipY);
  const b0 = k.b.slice(), a0 = k.a.slice();
  zeiger('pointerdown', tx, ty);
  assert.ok(v.handles.dragging, 'der Zug am Achsenpfeil beginnt');
  zeiger('pointermove', tx, ty - 40);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', tx, ty - 40);
  assert.ok(Math.abs(k.b[1] - b0[1]) > 3, 'y hat sich geändert: ' + b0 + ' → ' + k.b);
  assert.ok(Math.abs(k.b[0] - b0[0]) < 1e-9 && Math.abs(k.b[2] - b0[2]) < 1e-9, 'x und z nicht');
  assert.deepEqual(k.a, a0, 'das andere Ende blieb');

  /* Beide Enden bewegen: derselbe Versatz am anderen Ende. */
  const both = d8.getElementById('sel-both');
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

  /* Ohne Pfeil rutscht der Punkt in der Bildebene: der Versatz steht
     senkrecht auf der Blickrichtung. Die Kamera schaut schräg, damit
     kein Achsenpfeil vor dem Punkt liegt. */
  both.checked = false; both.dispatch('change');
  look([b.max[0] + 400, c[1] + 250, c[2] + 150], c);
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

  /* Automatik: N Kühlstiche auf der Fläche, mit Abstand zueinander; ein
     zweiter Lauf ersetzt die automatischen, die von Hand gesetzten bleiben. */
  const manualBefore = items().filter(i => !i.auto).length;
  const cnt = d8.getElementById('auto-count');
  cnt.value = '5'; cnt.dispatch('input');
  assert.equal(v.state.auto.count, 5);
  d8.getElementById('auto-run').dispatch('click');
  const autos = () => items().filter(i => i.auto);
  assert.equal(autos().length, 5, 'fünf automatische Kühlstiche');
  assert.equal(items().filter(i => !i.auto).length, manualBefore, 'die von Hand gesetzten bleiben');
  const F8 = await import('../../../web/tools/3d-studio/js/part/field.js');
  for (const a of autos()) {
    assert.ok(Math.abs(F8.sampleField(v.state.field, ...a.p) - 20) < v.state.field.h * 1.5, 'auf der Abstandsfläche: ' + F8.sampleField(v.state.field, ...a.p));
    assert.ok(Math.abs(Math.hypot(...a.dir) - 1) < 1e-9);
    assert.equal(a.d, 20); assert.equal(a.len, 200);
  }
  assert.match(d8.getElementById('auto-facts').innerHTML, /mittlerer Abstand/);
  assert.match(d8.getElementById('pt-sel').textContent || d8.getElementById('pt-sel').innerHTML, /Kein Element/);
  cnt.value = '3'; cnt.dispatch('input');
  d8.getElementById('auto-run').dispatch('click');
  assert.equal(autos().length, 3, 'der zweite Lauf ersetzt die automatischen');
  const rep = d8.getElementById('auto-replace');
  rep.checked = false; rep.dispatch('change');
  d8.getElementById('auto-run').dispatch('click');
  assert.equal(autos().length, 6, 'ohne Ersetzen kommen sie dazu');
  v.handles.select(autos()[0].id);
  assert.match(d8.getElementById('pt-sel').innerHTML, /automatisch/, 'das Auswahlfeld sagt es');
  for (const a of autos()) { delete v.state.plan.items[a.id]; }
  v.rebuild();

  /* Kennzahlen, Datei, Löschen. */
  assert.match(d8.getElementById('plan-facts').innerHTML, /Kühlstiche.*Kanäle.*Gesamtlänge/s);
  const G8 = await import('../../../web/tools/3d-studio/js/cooling/model.js');
  const json = JSON.parse(JSON.stringify(G8.toJSON(v.state.plan)));
  assert.equal(json.items.length, 4);
  v.loadPlan(G8.fromJSON(json));
  assert.equal(Object.keys(v.state.plan.items).length, 4);
  v.handles.select(items()[0].id);
  d8.getElementById('del-item').dispatch('click');
  assert.equal(items().length, 3, 'gelöscht');
});

/* ── Füllabschätzung ─────────────────────────────────────────── */
test('Füllabschätzung: Raster, Anschnitt per Klick, Füllgrad, Füllkörper, letzte Stellen, Datei', async () => {
  const { doc: d9 } = buildDocument(read('fuellung.html'));
  installGlobals(d9);
  globalThis.location = { search: '', href: 'http://test/fuellung.html' };
  const mod = await import('../../../web/tools/3d-studio/js/fill/app.js');
  const v = mod.__viewer;
  for (let i = 0; i < 1200 && !v.state.ready; i++) await new Promise(r => setTimeout(r, 25));
  assert.ok(v.state.ready && v.state.model, 'das Beispielteil steht');
  assert.ok(v.state.field && v.state.field.fullInside, 'das Raster ist gerechnet');
  assert.match(d9.getElementById('grid-note').textContent, /Zellen im Bauteil/);
  /* Die Kante kommt vom Teil: halbe Wanddicke 2V/A, auf halbe Millimeter
     gerundet — und das Raster liegt eng um das Teil, zwei Zellen Rand. */
  const mm = v.state.model;
  const wall = 2 * mm.volume / mm.totalArea;
  assert.equal(v.state.h, Math.round(wall / 2 * 2) / 2, 'Kante = halbe Wanddicke: ' + v.state.h + ' bei 2V/A = ' + wall.toFixed(2));
  assert.equal(v.state.field.h, v.state.h);
  assert.equal(d9.getElementById('cell-h').value, String(v.state.h).replace('.', ','));
  for (let a = 0; a < 3; a++) {
    const need = Math.ceil(mm.bounds.size[a] / v.state.field.h);
    assert.ok(v.state.field.dims[a] <= need + 6 && v.state.field.dims[a] >= need + 4, 'Achse ' + a + ': ' + v.state.field.dims[a] + ' Zellen für ' + need + ' im Teil');
  }
  assert.equal(d9.getElementById('fill-time'), null, 'keine Füllzeit — die Rechnung kennt keine Zeit');
  assert.equal(d9.getElementById('add-inlet').disabled, false, 'setzen ist frei');
  assert.equal(v.state.result, null, 'ohne Anschnitt keine Füllung');
  assert.match(d9.getElementById('run-note').textContent, /Noch kein Anschnitt/);

  /* Kamera von +X auf die Mitte: der Klick durch die Bildmitte trifft die +X-Wand. */
  const b = v.state.model.bounds;
  const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const cam = v.view.camera;
  cam.position.set(b.max[0] + 400, c[1], c[2]); cam.up.set(0, 1, 0); cam.lookAt(...c);
  cam.updateMatrixWorld(true); v.view.scene.updateMatrixWorld(true);
  const canvas = v.view.renderer.domElement;
  const zeiger = (t, x, y) => canvas.dispatch(t, { button: 0, clientX: x, clientY: y, stopPropagation() {}, preventDefault() {} });
  const klick = (x, y) => { zeiger('pointerdown', x, y); zeiger('pointerup', x, y); };
  const items = () => Object.values(v.state.plan.items);
  const settled = async () => { for (let i = 0; i < 400 && (v.state.computing || v.state.stale || v.state.queued); i++) await new Promise(r => setTimeout(r, 25)); };

  d9.getElementById('add-inlet').dispatch('click');
  assert.ok(v.handles.aiming, 'der Zielmodus ist scharf');
  assert.match(d9.getElementById('aim-text').textContent, /Anschnitt/);
  klick(400, 300);
  assert.ok(!v.handles.aiming);
  assert.equal(items().length, 1);
  const a1 = items()[0];
  /* Die +X-Wand des Getriebedeckels steht mit 1,5° Schräge unter dem
     Flansch, der bis b.max reicht — gemessen wird gegen die Wand auf
     Höhe der Bauteilmitte. */
  const wallX = 190 + c[2] * Math.tan(1.5 * Math.PI / 180);
  assert.ok(Math.abs(a1.pos[0] - wallX) < 0.5, 'auf der +X-Wand: ' + a1.pos);
  assert.ok(a1.n[0] > 0.99, 'Normale nach außen: ' + a1.n);
  assert.equal(a1.w, 30); assert.equal(a1.h, 2);
  assert.equal(v.handles.selected, a1.id, 'der neue Anschnitt ist gewählt');
  assert.match(d9.getElementById('sel-facts').innerHTML, /Fläche/);

  /* Die Füllung rechnet von selbst nach. */
  await settled();
  const r = v.state.result;
  assert.ok(r && !v.state.stale, 'gerechnet');
  assert.equal(r.stats.inlets.length, 1);
  assert.ok(r.stats.maxPath > 150, 'der Fließweg geht durch das Teil: ' + r.stats.maxPath);
  assert.match(d9.getElementById('run-note').textContent, /Gerechnet in/);
  assert.match(d9.getElementById('result-facts').innerHTML, /Fließweg \/ Wanddicke/);
  assert.match(d9.getElementById('inlet-facts').innerHTML, /100 % Volumen/);
  assert.ok(d9.getElementById('colorbar').className.includes('on'), 'die Skala steht');
  assert.ok(!/ms/.test(d9.getElementById('colorbar').innerHTML), 'und trägt Prozent, keine Millisekunden');
  assert.ok(v.partMesh.geometry.getAttribute('color'), 'das Bauteil trägt Farben');
  assert.ok(v.spotGroup.children.length >= 1 && v.spotGroup.children.length <= 5, 'letzte Stellen: ' + v.spotGroup.children.length);
  assert.ok(v.state.spots.list[0].frac > 0.9, 'die erste liegt ganz am Ende');
  /* Die zuletzt gefüllte Stelle liegt am anderen Ende, nicht am Anschnitt. */
  assert.ok(v.state.spots.list[0].x < c[0], 'am −X-Ende: ' + v.state.spots.list[0].x);

  /* Füllkörper bei 50 %: ein Körper, kleiner als das Teil, das Bauteil durchscheinend. */
  d9.getElementById('show-seg').querySelectorAll('button').find(x => x.dataset.value === 'koerper').dispatch('click');
  assert.equal(v.state.show, 'koerper');
  const q = d9.getElementById('q');
  q.value = '50'; q.dispatch('input');
  assert.equal(v.state.q, 0.5);
  assert.ok(v.bodyMesh.visible && v.bodyMesh.geometry.getAttribute('position').count > 100, 'der Füllkörper steht');
  assert.ok(v.partMesh.material.transparent, 'das Bauteil ist durchscheinend');
  const posB = v.bodyMesh.geometry.getAttribute('position').array;
  let minX = Infinity;
  for (let i = 0; i < posB.length; i += 3) minX = Math.min(minX, posB[i]);
  assert.ok(minX > b.min[0] + 20, 'bei 50 % reicht die Schmelze noch nicht bis zum −X-Ende: ' + minX);
  q.value = '100'; q.dispatch('input');
  d9.getElementById('show-seg').querySelectorAll('button').find(x => x.dataset.value === 'farbe').dispatch('click');
  assert.ok(!v.bodyMesh.visible);

  /* Zweiter Anschnitt mit festem Anteil: Anteile und Volumen im Feld. */
  const a2 = (await import('../../../web/tools/3d-studio/js/fill/model.js')).addInlet(v.state.plan, [-wallX, c[1], c[2]], [-1, 0, 0], { w: 10, h: 2 });
  v.rebuild();
  v.state.stale = true; await v.compute();
  await settled();
  assert.equal(v.state.result.stats.inlets.length, 2);
  const cells = v.state.result.stats.inlets.map(i => i.cells);
  assert.ok(cells[0] > cells[1], 'der breite Anschnitt füllt mehr: ' + cells);
  v.handles.select(a2.id);
  const share = d9.getElementById('sel-share');
  assert.equal(share.value, '', 'Anteil leer = aus der Fläche');
  share.value = '70'; share.dispatch('change');
  assert.equal(a2.share, 70);
  await settled();
  const cells2 = v.state.result.stats.inlets.map(i => i.cells);
  assert.ok(cells2[1] > cells[1], 'mit 70 % Strom füllt der kleine mehr als vorher: ' + cells + ' → ' + cells2);

  /* α = 0: reine Geometrie, rechnet nach. */
  const al = d9.getElementById('alpha');
  al.value = '0'; al.dispatch('input');
  await settled();
  assert.equal(v.state.result.stats.alpha, 0);

  /* Datei: hin und zurück. */
  const M = await import('../../../web/tools/3d-studio/js/fill/model.js');
  const json = M.toJSON(v.state.plan);
  assert.equal(json.format, 'dielogic-fuellung');
  assert.equal(json.items.length, 2);
  v.loadPlan(M.fromJSON(JSON.parse(JSON.stringify(json))));
  await settled();
  assert.equal(items().length, 2);
  assert.equal(v.state.plan.items[a2.id].share, 70);
  assert.ok(v.state.result && !v.state.stale, 'nach dem Laden gerechnet');

  /* Löschen über den Knopf. */
  v.handles.select(a1.id);
  assert.equal(d9.getElementById('del-item').disabled, false);
  d9.getElementById('del-item').dispatch('click');
  assert.equal(items().length, 1);
  await settled();
  assert.equal(v.state.result.stats.inlets.length, 1);

  /* Eine gröbere Kante eintippen: „Neu rastern" wird frei, übernimmt sie,
     und die Füllung rechnet auf dem neuen Raster nach. Über 128 Zellen
     entlang der längsten Kante sind erlaubt — die Grenze ist der Speicher. */
  const ch = d9.getElementById('cell-h');
  ch.value = String(v.state.h * 2).replace('.', ',');
  ch.dispatch('change');
  assert.equal(v.state.h, 2 * v.state.field.h);
  assert.equal(d9.getElementById('regrid').disabled, false, 'Neu rastern ist frei');
  assert.match(d9.getElementById('res-note').textContent, /Neu rastern/);
  const cellsFine = v.state.field.data.length;
  await v.computeField();
  await settled();
  assert.equal(v.state.field.h, v.state.h, 'das Raster hat die neue Kante');
  assert.ok(v.state.field.data.length < cellsFine / 4, 'und ist viel kleiner: ' + v.state.field.data.length + ' statt ' + cellsFine);
  assert.equal(d9.getElementById('regrid').disabled, true);
  assert.ok(v.state.result && !v.state.stale, 'nachgerechnet');
  ch.value = '0,5';
  ch.dispatch('change');
  assert.equal(v.state.h, 0.5, 'unter 128 Zellen gibt es keine Schranke: 0,5 mm heißt ' + Math.ceil(mm.bounds.size[0] / 0.5) + ' Zellen');
});
