/* Entformungsanalyse im gemeinsamen Rahmen: die Analyse läuft auf Knopfdruck
   (nicht beim Laden, 24.09.) als abbrechbare Rechnung, die Reiter sind Modi, die Legende der Regionen steht
   im Viewport, die Bilanz als Kennzahlen mit Urteil. Die Fälle stammen aus
   viewer.test.mjs und wurden auf data-ui und die Modi des Rahmens übertragen.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/entformung.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mountPage, wait, kpiText } from './fixture.mjs';

let P;
const analysed = v => wait(() => !v.state.running && v.state.analysed && v.state.ready, 1200);
const loaded = (v, name) => wait(() => v.state.ready && v.state.name === name, 1200);
/* Die Analyse startet nur auf Knopfdruck: drücken, dann warten. */
const rechne = async (ui, v) => { ui('primary').dispatch('click'); await analysed(v); };

before(async () => {
  P = await mountPage('entformungsanalyse.html', 'js/studio/pages/entformung.js');
  assert.ok(P.v.state.model, 'Beispielteil wurde geladen');
  assert.equal(P.v.state.analysed, false, 'beim Laden wird nicht gerechnet');
  assert.equal(P.ui('primary').textContent, 'Entformung rechnen', 'der Knopf steht bereit');
  await rechne(P.ui, P.v);
});

test('Ansichtsleiste und Viewport sind aufgebaut', () => {
  const bar = P.doc.getElementById('viewport').querySelector('.view-bar');
  assert.ok(bar, 'Ansichtsleiste im Viewport');
  assert.equal(bar.querySelectorAll('[data-view]').length, 4, 'X · Y · Z · Iso');
  assert.equal(bar.querySelectorAll('[data-proj]').length, 2, 'Persp · Parallel');
  assert.ok(bar.querySelector('[data-fit]'), 'Einpassen');
  /* Eine Anzeigeoption hat es: die Netzkanten — also den Knopf „Darstellung". */
  assert.equal(bar.querySelector('[data-darstellung]').hidden, false);
  assert.equal(P.ui('export').hidden, true, 'und nichts zu exportieren');
});

test('Ansichtsknöpfe schalten beim zweiten Klick auf die Gegenrichtung', () => {
  const bar = P.doc.getElementById('viewport').querySelector('.view-bar');
  const x = bar.querySelectorAll('[data-view]').find(b => b.dataset.view === 'x');
  const cam = () => P.v.view.camera.position.clone();
  x.dispatch('click');
  const first = cam();
  assert.equal(x.textContent, 'X');
  assert.ok(first.x > 0 && Math.abs(first.y) < 1e-6, 'Kamera steht auf +X');
  x.dispatch('click');
  assert.equal(x.textContent, '−X', 'Beschriftung zeigt das Vorzeichen');
  assert.ok(cam().x < 0, 'Kamera steht auf −X');
  x.dispatch('click');
  assert.equal(x.textContent, 'X', 'dritter Klick zurück');
  const y = bar.querySelectorAll('[data-view]').find(b => b.dataset.view === 'y');
  y.dispatch('click'); y.dispatch('click');
  assert.equal(y.textContent, '−Y');
  assert.equal(x.textContent, 'X');
  assert.ok(P.v.view.camera.position.y < 0, 'Untersicht');
});

test('Parallelprojektion behält den Bildausschnitt', () => {
  const bar = P.doc.getElementById('viewport').querySelector('.view-bar');
  const [persp, ortho] = bar.querySelectorAll('[data-proj]');
  const view = P.v.view;
  assert.equal(view.projection, 'persp');
  ortho.dispatch('click');
  assert.equal(view.projection, 'ortho');
  assert.ok(view.camera.isOrthographicCamera, 'orthografische Kamera aktiv');
  assert.ok(view.camera.top > 0 && view.camera.right > view.camera.top, 'Frustum folgt dem Seitenverhältnis');
  persp.dispatch('click');
  assert.equal(view.projection, 'persp');
  assert.ok(view.camera.isPerspectiveCamera);
});

test('Analyse auf Knopfdruck: Legende im Viewport, Bilanz als Kennzahlen, der Knopf bleibt', () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  assert.ok(s.model.faceCount > 100, 'Netz vorhanden');
  assert.ok(s.vis.dot.length === s.model.faceCount * 6, 'Sichtbarkeit für sechs Richtungen');
  assert.ok(s.seg && s.draft, 'Zuordnung und Schrägen gerechnet');
  assert.equal(shell.mode, 'entformung', 'die Seite beginnt bei der Entformung');
  const legend = doc.getElementById('pt-legend');
  assert.ok(legend.innerHTML.includes('%'), 'Legende zeigt Flächenanteile');
  assert.ok(!legend.innerHTML.includes('>0 %<') && !legend.innerHTML.includes('0,0 %'), 'nur was vorkommt');
  /* Was man vom Bauteil wissen will, steht in der Bauteil-Klappe der Kopfzeile —
     einen Modus „Bauteil" gibt es dafür nicht mehr. */
  const klappe = doc.getElementById('model-facts').innerHTML;
  for (const k of ['Dreiecke', 'Abmessungen', 'Volumen', 'Wanddicke 2V/A', 'Oberfläche']) assert.ok(klappe.includes(k), k + ' steht in der Klappe');
  assert.match(kpiText(ui('seg-kpis')), /Formhälften.*Schieber.*Hinterschnitt/, 'Bilanz Hälften / Schieber / Hinterschnitt');
  assert.match(kpiText(ui('seg-kpis')), /\d,\d %/, 'deutsch geschrieben');
  assert.ok(ui('analysis-state').textContent.includes('automatisch'), 'die Formöffnung wurde gewählt');
  assert.ok(+ui('parting-count').textContent.replace(/\D/g, '') > 0, 'Trennlinie gefunden');
  assert.ok(ui('seg-facts').innerHTML.includes('Rechenzeit'), 'die Rechenzeit steht in den Details');
  assert.equal(ui('primary').hidden, false, 'der Knopf bleibt nach der Analyse stehen');
  assert.equal(ui('primary').textContent, 'Neu rechnen');
  assert.equal(v.tool.settingsOnly, true);
});

test('Formöffnung: automatisch gewählt, fest wählbar, sofort neu gerechnet', () => {
  const { doc, v, ui } = P;
  const s = v.state;
  const legend = () => doc.getElementById('pt-legend').innerHTML;
  assert.equal(s.axis, 'auto');
  assert.equal(s.seg.auto, true);
  assert.equal(s.seg.mainAxis, 2, 'der Getriebedeckel entformt in Z');
  const ax = ui('axis-seg').querySelectorAll('button');
  const before = [...s.seg.areaByLabel];
  ax.find(b => b.dataset.value === '0').dispatch('click');
  assert.equal(s.axis, 0);
  assert.equal(s.seg.mainAxis, 0, 'fest auf X');
  assert.equal(s.seg.auto, false);
  assert.notDeepEqual([...s.seg.areaByLabel], before, 'ohne Bestätigung sofort neu gerechnet');
  assert.ok(ui('analysis-state').textContent.includes('X'), 'die Achse steht im Hinweis');
  ax.find(b => b.dataset.value === 'auto').dispatch('click');
  assert.deepEqual([...s.seg.areaByLabel], before, 'Auto findet wieder Z');
  /* Welche Hälfte die bewegliche ist, steht dabei und lässt sich tauschen. */
  assert.ok(ui('analysis-state').textContent.includes('bewegliche Seite +Z'), ui('analysis-state').textContent);
  const mov = ui('mov-seg').querySelectorAll('button');
  assert.equal(mov[0].textContent, '+Z');
  assert.ok(legend().includes('Bewegliche Seite +Z'));
  mov.find(b => b.dataset.value === '-1').dispatch('click');
  assert.equal(s.movSign, -1);
  assert.ok(legend().includes('Bewegliche Seite −Z') && legend().includes('Feste Seite +Z'), 'die Namen wandern mit');
  assert.ok(ui('analysis-state').textContent.includes('bewegliche Seite −Z'));
  mov.find(b => b.dataset.value === '1').dispatch('click');
  assert.equal(s.movSign, 1);
});

test('Reiter sind Modi: je Reiter ein Abschnitt und eine eigene Darstellung', () => {
  const { doc, v, ui, host } = P;
  const s = v.state;
  const tabs = ['entformung', 'formteile', 'flaechen', 'haftung'];
  assert.deepEqual(doc.querySelectorAll('[role="tab"]').map(b => b.getAttribute('data-mode')), tabs);
  const visible = () => doc.querySelectorAll('.st-mode').filter(x => !x.hidden).map(x => x.getAttribute('data-mode'));
  assert.deepEqual(visible(), ['entformung'], 'zu Beginn die Entformung');
  assert.equal(v.colouring(), 'regions');
  for (const t of tabs) {
    doc.querySelectorAll('[role="tab"]').find(b => b.getAttribute('data-mode') === t).dispatch('click');
    assert.deepEqual(visible(), [t], 'nur ' + t);
    assert.equal(s.tab, t);
  }
  /* Der Modus bestimmt die Farbe des Bauteils: grau bei den Flächen,
     Regionen/Schräge in der Entformung, Haftmaß in der Haftung. */
  v.showTab('flaechen');
  assert.equal(v.colouring(), 'plain');
  assert.ok(v.partMesh.material === host.part.plainMat, 'grau bei den Flächen');
  assert.equal(doc.getElementById('pt-legend').innerHTML, '', 'keine Legende ohne Regionen');
  v.showTab('haftung');
  assert.equal(v.colouring(), 'grip');
  assert.ok(v.partMesh.material === host.part.colorMat);
  assert.equal(doc.getElementById('cb-title').textContent, 'Haftung', 'Farbskala der Haftung');
  assert.ok(doc.getElementById('cb-extra').innerHTML.includes('haftet nicht'));
  v.showTab('entformung');
  assert.equal(v.colouring(), 'regions');
  assert.ok(!doc.getElementById('colorbar').classList.contains('on'), 'bei den Regionen keine Skala');
  /* Die Netzkanten sind Anzeige: sie stehen unter „Darstellung" und gelten auf
     dem Bauteil, das man sieht — bei den Formteilen ist es Schatten oder weg. */
  const edges = doc.querySelector('.view-pop [data-ui="show-edges"]');
  assert.ok(edges, 'Netzkanten unter Darstellung');
  assert.equal(ui('show-edges'), edges, 'und nirgends sonst');
  edges.checked = true; edges.dispatch('change');
  assert.equal(v.edgeLines.visible, true, 'in der Entformung da');
  v.showTab('formteile');
  assert.equal(v.edgeLines.visible, false, 'bei den Formteilen nicht');
  v.showTab('entformung');
  edges.checked = false; edges.dispatch('change');
  assert.equal(v.edgeLines.visible, false);
  assert.deepEqual(ui('mode-seg').querySelectorAll('button').map(b => b.dataset.value), ['regions', 'draft'], 'Einfärbung nur Regionen und Schräge');
});

test('Formteile: der Modus zeigt die Regionen auseinandergezogen, jedes der sechs Formteile schaltbar', () => {
  const { v, ui } = P;
  const s = v.state, dv = v.dieView;
  assert.equal(dv.group.visible, false, 'in anderen Modi aus');
  v.showTab('formteile');
  assert.equal(dv.group.visible, true, 'die Formteile stehen im Viewport');
  const pieces = dv.pieces;
  assert.ok(pieces.length >= 2, 'mindestens die beiden Hälften: ' + pieces.length);
  assert.equal(pieces.reduce((a, p) => a + p.faces, 0), s.model.faceCount, 'alle Dreiecke verteilt');
  assert.ok(pieces.every(p => p.skirt.length > 0 || p.dir.every(x => x === 0)), 'jedes gerichtete Stück hat einen Rand');
  assert.ok(v.partMesh.material.opacity < 0.2, 'das Bauteil steht durchscheinend dazwischen');
  assert.equal(v.partingLines.visible, false, 'ohne Trennlinie');
  const dist = ui('die-dist');
  dist.value = '80'; dist.dispatch('input');
  assert.equal(s.die.dist, 80);
  for (const h of dv.holders) {
    const p = h.userData.piece;
    assert.ok(Math.abs(h.position.x - p.dir[0] * 80) < 1e-9 && Math.abs(h.position.z - p.dir[2] * 80) < 1e-9, 'Stück ' + p.label + ' verschoben');
  }
  assert.equal(+ui('die-skirt').getAttribute('max'), 500, 'der Rand darf bis 500 mm lang sein');
  /* Sechs mögliche Formteile: zwei Hälften, vier Schieber. Der Getriebedeckel
     hat +X und −Y; −X und +Y stehen grau und lassen sich nicht schalten. */
  const rows = ui('die-pieces').querySelectorAll('input');
  assert.equal(rows.length, 6, 'sechs Schalter');
  const byLabel = l => rows.find(r => r.dataset.label === String(l));
  assert.equal(byLabel(4).checked, true, 'bewegliche Hälfte an');
  assert.equal(byLabel(5).checked, true, 'feste Hälfte an');
  assert.equal(byLabel(0).checked, true, 'Schieber +X an');
  assert.equal(ui('die-pieces').querySelectorAll('label').filter(l => l.classList.contains('off')).length, 2, 'Schieber −X und +Y stehen grau');
  assert.ok(byLabel(1).disabled && byLabel(2).disabled, 'und lassen sich nicht schalten');
  assert.ok(ui('die-pieces').innerHTML.includes('nicht in der Form'));
  const holder = l => dv.holders.find(h => h.userData.piece.label === l);
  byLabel(0).checked = false; byLabel(0).dispatch('change');
  assert.equal(s.die.show[0], false);
  assert.equal(holder(0).visible, false, 'Schieber +X ausgeblendet');
  assert.equal(holder(4).visible, true, 'die anderen bleiben');
  byLabel(5).checked = false; byLabel(5).dispatch('change');
  assert.equal(holder(5).visible, false, 'die feste Hälfte ausgeblendet');
  /* Modus wechseln: die Formteile verschwinden, beim Zurückkommen stehen sie
     mit denselben Schaltern wieder da. */
  v.showTab('entformung');
  assert.equal(dv.group.visible, false, 'im nächsten Modus weg');
  assert.equal(v.partMesh.material.opacity, 1, 'das Bauteil wieder deckend');
  assert.equal(v.partingLines.visible, true, 'die Trennlinie ist wieder da');
  v.showTab('formteile');
  assert.equal(dv.group.visible, true);
  assert.equal(holder(0).visible, false, 'Schalter bleiben: +X noch aus');
  byLabel(0).checked = true; byLabel(0).dispatch('change');
  byLabel(5).checked = true; byLabel(5).dispatch('change');
  assert.ok(dv.holders.every(h => h.visible), 'alle wieder an');
  const part = ui('die-part');
  part.checked = false; part.dispatch('change');
  assert.equal(v.partMesh.visible, false, 'ohne Bauteil dazwischen ist es unsichtbar');
  part.checked = true; part.dispatch('change');
  assert.equal(v.partMesh.visible, true);
  v.showTab('entformung');
});

test('Flächen und Haftung: jeder Modus zeigt seine Ebenen jenseits des Bauteils — und nimmt sie beim Verlassen mit', () => {
  const { v, ui } = P;
  const s = v.state, dv = v.dieView, b = s.model.bounds;
  /* Flächen: Zahlen je Formteil, ohne Kräfte; Silhouetten nur in diesem Modus. */
  const pf = kpiText(ui('proj-kpis'));
  assert.ok(pf.includes('cm²') && !pf.includes('kN') && !pf.includes('bar'), 'Flächen, keine Kräfte: ' + pf);
  assert.ok(pf.includes('Bewegliche') && pf.includes('Schieber'), 'Hälften und Schieber');
  const mov = s.proj.pieces.find(q => q.label === 4), sl = s.proj.pieces.filter(q => q.axis !== 2);
  assert.ok(mov.area > 0.9 * s.proj.total.area, 'die bewegliche Hälfte deckt fast den ganzen Grundriss');
  assert.ok(sl.every(q => q.area < 0.05 * mov.area), 'ein Schieber sieht eine kleine Fläche');
  const proj = () => dv.overlays.children.filter(o => o.userData.overlay === 'proj');
  assert.ok(proj().every(o => !o.visible), 'in der Entformung keine Silhouetten');
  v.showTab('flaechen');
  assert.equal(dv.group.visible, false, 'keine Formteile in diesem Modus');
  assert.equal(proj().length, s.proj.pieces.length, 'je gerichtetem Stück eine Silhouette');
  assert.ok(proj().every(o => o.visible), 'alle sichtbar');
  const coordOf = o => { const p = o.userData.piece; return o.children[0].position.getComponent(p.axis); };
  for (const o of proj()) {
    const p = o.userData.piece, sg = p.dir[p.axis], c = coordOf(o);
    assert.ok(sg > 0 ? c > b.max[p.axis] + 5 : c < b.min[p.axis] - 5, 'Ebene ' + p.label + ' jenseits des Bauteils: ' + c);
  }
  const movO = () => proj().find(o => o.userData.piece.label === 4);
  const z0 = coordOf(movO());
  const gapEl = ui('proj-gap');
  gapEl.value = String(s.projView.gap + 50); gapEl.dispatch('input');
  assert.ok(Math.abs(coordOf(movO()) - z0 - 50) < 1e-6, 'der Abstand schiebt die Ebene: ' + coordOf(movO()));
  const alphaEl = ui('proj-alpha');
  alphaEl.value = '25'; alphaEl.dispatch('input');
  assert.ok(Math.abs(movO().children[0].material.opacity - 0.25) < 1e-9, 'Deckkraft der Füllung');
  v.showTab('entformung');
  assert.ok(proj().every(o => !o.visible), 'in der Entformung keine Silhouetten');
  /* Haftung: der Deckel schrumpft auf den Kern der beweglichen Hälfte —
     Innenwände, Rippen und Ring haften, die Außenwände nicht. */
  assert.ok(s.grip.mov > 3 * s.grip.fix, 'haftet an der beweglichen Seite: ' + s.grip.mov + ' / ' + s.grip.fix);
  assert.match(kpiText(ui('ej-kpis')), /bewegliche Seite.*%.*feste Seite.*%/);
  assert.ok(ui('ej-kpis').querySelector('.krow').classList.contains('ok'), 'es bleibt bei den Auswerfern — das Urteil ist grün');
  assert.equal(ui('ej-warn').textContent, '', 'keine Warnung');
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
  assert.ok(ejs().every(o => !o.visible), 'ohne den Modus keine Karte');
  v.showTab('haftung');
  assert.equal(v.colouring(), 'grip', 'das Bauteil trägt das Haftmaß');
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
  const egap = ui('ej-gap');
  const ez0 = ejOf(4).children[0].position.z, ez1 = ejOf(5).children[0].position.z;
  egap.value = String(s.ej.gap + 40); egap.dispatch('input');
  assert.ok(Math.abs(ejOf(4).children[0].position.z - ez0 - 40) < 1e-6, 'Abstand der Karte in +Z');
  assert.ok(Math.abs(ejOf(5).children[0].position.z - ez1 + 40) < 1e-6, 'Abstand der Karte in −Z');
  const ea = ui('ej-alpha');
  ea.value = '40'; ea.dispatch('input');
  assert.ok(ejs().every(o => Math.abs(o.children[0].material.opacity - 0.4) < 1e-9), 'Deckkraft der Karten');
  assert.equal(ui('ej-side-seg'), null, 'keine Auswahl der Hälfte');
  v.showTab('entformung');
  assert.ok(ejs().every(o => !o.visible), 'beim Verlassen weg');
  assert.equal(v.colouring(), 'regions');
});

test('Einfärbungen: Regionen mit Legende, Schräge mit Skala, Grenzwert und eigener Bilanz', () => {
  const { doc, v, ui } = P;
  v.showTab('entformung');
  const s = v.state;
  const modes = ui('mode-seg').querySelectorAll('button');
  const bar = doc.getElementById('colorbar'), legend = doc.getElementById('pt-legend');
  assert.equal(ui('draft-block').hidden, true, 'bei den Regionen gibt es keinen Grenzwert');
  assert.ok(legend.innerHTML.includes('Schieber') && legend.innerHTML.includes('Feste Seite'), 'Rollen und Hälften benannt');

  modes.find(b => b.dataset.value === 'draft').dispatch('click');
  assert.equal(s.mode, 'draft');
  assert.equal(ui('draft-block').hidden, false, 'der Grenzwert gehört zur Schräge');
  assert.equal(legend.innerHTML, '', 'die Schräge hat eine Skala, keine Legende');
  assert.ok(bar.classList.contains('on'), 'bei der Schräge sichtbar');
  assert.equal(doc.getElementById('cb-title').textContent, 'Entformschräge');
  assert.ok(doc.getElementById('cb-scale').style.background.includes('linear-gradient'));
  assert.ok(doc.getElementById('cb-ticks').innerHTML.includes('°'), 'Werte an der Skala');
  assert.ok(doc.getElementById('cb-extra').innerHTML.includes('Hinterschnitt'));
  assert.match(kpiText(ui('seg-kpis')), /kleinste Schräge.*unter Grenzwert.*Hinterschnitt/);
  /* Der Grenzwert wandert in die Beschriftung. */
  const lim = ui('draft-limit');
  lim.value = '2'; lim.dispatch('input');
  assert.ok(doc.getElementById('cb-ticks').innerHTML.includes('6'), 'Skala reicht bis 3× Grenzwert');
  lim.value = '1.5'; lim.dispatch('input');

  modes.find(b => b.dataset.value === 'regions').dispatch('click');
  assert.equal(s.mode, 'regions');
  assert.ok(!bar.classList.contains('on'), 'bei den Regionen aus — dort gibt es keine Reihenfolge');
  assert.match(kpiText(ui('seg-kpis')), /Formhälften/);
});

test('Beispielteile lassen sich wechseln', async () => {
  const { doc, v, ui } = P;
  const sel = doc.getElementById('demo-select');
  sel.value = 'oil_pan';
  sel.dispatch('change');
  await loaded(v, 'Ölwanne');
  await rechne(ui, v);
  const s = v.state;
  assert.match(ui('part-name').textContent, /Ölwanne/, 'der Chip trägt das Teil');
  assert.equal(s.seg.mainAxis, 2);
  const halves = s.seg.areaByLabel[4] + s.seg.areaByLabel[5];
  assert.ok(halves > 0.95 * s.model.totalArea, 'dieses Teil bilden die beiden Hälften fast ganz');
});

test('STL laden: Datei, Ziehen-und-Ablegen, kaputte Datei', async () => {
  const { doc, v, host, ui } = P;
  const { writeSTL } = await import('../../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../../web/tools/3d-studio/js/solids.js');
  const fileOf = (name, tris) => { const buf = writeSTL(tris, 'test'); return { name, arrayBuffer: () => Promise.resolve(buf), byteLength: buf.byteLength }; };

  /* Geladen wird aus einem anderen Modus: das Ergebnis erscheint in der
     Entformung, und dort ist das Teil gefärbt. */
  v.showTab('flaechen');
  const input = () => doc.getElementById('stl-input');
  input().files = [fileOf('pruefwuerfel.stl', S.box(40, 30, 20))];
  input().dispatch('change');
  await loaded(v, 'pruefwuerfel.stl');
  await rechne(ui, v);
  assert.equal(v.state.model.faceCount, 12, 'Quader aus zwölf Dreiecken');
  const c = v.state.seg.counts;
  assert.equal(c.half + c.weak + c.slider, 12, 'jede Seite zugeordnet');
  assert.equal(c.slider, 0, 'ein Quader braucht keinen Schieber');
  v.showTab('entformung');
  assert.equal(v.colouring(), 'regions', 'das Teil ist gefärbt');
  assert.ok(v.partMesh.material === host.part.colorMat, 'nicht mehr grau');

  /* Ein zweites Teil, während das erste noch rechnet: die laufende Rechnung
     bricht ab, das neue lässt sich rechnen — früher blieb es grau. */
  input().files = [fileOf('erstes.stl', S.box(20, 20, 20))];
  input().dispatch('change');
  await loaded(v, 'erstes.stl');
  ui('primary').dispatch('click');
  await wait(() => v.state.running && v.state.name === 'erstes.stl', 400, 5);
  input().files = [fileOf('zweites.stl', S.box(10, 30, 20))];
  input().dispatch('change');
  await loaded(v, 'zweites.stl');
  await rechne(ui, v);
  assert.equal(v.state.name, 'zweites.stl');
  assert.ok(v.state.seg && v.state.seg.label.length === v.state.model.faceCount, 'das zweite ist gerechnet');
  assert.ok(doc.getElementById('pt-legend').innerHTML.includes('%'), 'und hat eine Legende');

  /* Ziehen-und-Ablegen über dem Viewport. */
  const vp = doc.getElementById('viewport');
  vp.dispatch('dragover');
  assert.ok(vp.classList.contains('dragover'), 'Ablegefläche wird angezeigt');
  vp.dispatch('drop', { dataTransfer: { files: [fileOf('zylinder.stl', S.cyl(20, 0, 50, 24))] } });
  assert.ok(!vp.classList.contains('dragover'));
  await loaded(v, 'zylinder.stl');
  await rechne(ui, v);

  /* Unlesbare Datei: Hinweis statt Absturz. */
  const junk = new Uint8Array(20).buffer;
  input().files = [{ name: 'kaputt.stl', arrayBuffer: () => Promise.resolve(junk), byteLength: 20 }];
  input().dispatch('change');
  await wait(() => doc.getElementById('model-warn').textContent.includes('STL'), 80, 10);
  assert.match(P.ui('toast').textContent, /kaputt\.stl.*konnte nicht gelesen werden/, 'die Meldung steht auch im Bild');
  assert.equal(v.state.name, 'zylinder.stl', 'das gute Modell bleibt stehen');
});

test('Abbrechen: die Analyse lässt sich anhalten und wieder starten', async () => {
  const { doc, v, ui } = P;
  const sel = doc.getElementById('demo-select');
  sel.value = 'gearbox_cover';
  sel.dispatch('change');
  await loaded(v, 'Getriebedeckel mit Schiebern');
  assert.equal(v.state.running, false, 'ein neues Teil rechnet nicht von selbst');
  ui('primary').dispatch('click');
  await wait(() => v.state.running, 1200, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen', 'während der Rechnung heißt der Knopf Abbrechen');
  ui('primary').dispatch('click');
  await wait(() => !v.state.running && v.state.ready, 800);
  assert.equal(v.state.analysed, false);
  assert.equal(ui('primary').textContent, 'Entformung rechnen');
  assert.match(ui('note').textContent, /Abgebrochen/);
  assert.ok(v.partMesh.material === P.host.part.plainMat, 'ohne Analyse bleibt das Bauteil grau');
  ui('primary').dispatch('click');
  await analysed(v);
  assert.equal(v.state.seg.mainAxis, 2);
  assert.equal(ui('primary').textContent, 'Neu rechnen', 'nach der Analyse bleibt der Knopf');
});

test('Einstellungen: merken, als Datei, zurücksetzen', async () => {
  const { v, ui } = P;
  const s = v.state;
  ui('axis-seg').querySelectorAll('button').find(b => b.dataset.value === '1').dispatch('click');
  ui('ej-mu').value = '0.45'; ui('ej-mu').dispatch('input');
  const doc1 = v.tool.toJSON();
  assert.equal(doc1.format, 'dielogic-entformung');
  assert.equal(doc1.axis, 1);
  assert.equal(doc1.ej.mu, 0.45);
  await wait(() => { const d = globalThis.localStorage.getItem('studio:entformung:gearbox_cover'); return d && JSON.parse(d).doc.axis === 1; }, 200);
  v.tool.resetSettings();
  assert.equal(s.axis, 'auto');
  assert.equal(s.ej.mu, 0.3);
  assert.equal(s.seg.mainAxis, 2, 'und die Zuordnung ist wieder die automatische');
  v.tool.fromJSON(doc1);
  assert.equal(s.axis, 1);
  assert.equal(s.seg.mainAxis, 1);
  assert.equal(ui('ej-mu').value, '0.45');
  assert.throws(() => v.tool.fromJSON({ format: 'dielogic-wandstaerke', version: 1 }), /keine Datei der Entformungsanalyse/);
  v.tool.resetSettings();
});

/* Die folgenden Fälle laufen auf P — vor dem Fall mit der zweiten Seite
   (?part=…): die setzt das globale document auf ihr eigenes. */

test('Formteile nach einem Achsenwechsel und einem neuen Teil: wieder alle zu sehen', async () => {
  const { doc, v, ui } = P;
  const s = v.state, dv = v.dieView;
  const sel = doc.getElementById('demo-select');
  if (!/Getriebedeckel/.test(s.name)) { sel.value = 'gearbox_cover'; sel.dispatch('change'); await loaded(v, 'Getriebedeckel mit Schiebern'); }
  if (!s.analysed) await rechne(ui, v);
  v.showTab('formteile');
  const box = () => ui('die-pieces').querySelectorAll('input');
  const byLabel = l => box().find(r => r.dataset.label === String(l));
  const holder = l => dv.holders.find(h => h.userData.piece.label === l);
  /* Schieber +X (Richtung 0) aus. */
  byLabel(0).checked = false; byLabel(0).dispatch('change');
  assert.equal(holder(0).visible, false);
  /* Formöffnung X: Richtung 0 ist jetzt eine Formhälfte — sie darf nicht
     still ausgeblendet bleiben. */
  v.showTab('entformung');
  ui('axis-seg').querySelectorAll('button').find(b => b.dataset.value === '0').dispatch('click');
  assert.equal(s.seg.mainAxis, 0);
  v.showTab('formteile');
  assert.equal(s.die.show[0], undefined, 'der Schalter gilt nicht mehr');
  assert.ok(dv.holders.every(h => h.visible), 'alle Formteile zu sehen, auch die Hälfte +X');
  assert.ok(box().every(r => r.disabled || r.checked), 'und alle Schalter an');
  /* Die bewegliche Seite zu tauschen benennt nur um: der Schalter bleibt. */
  v.showTab('entformung');
  ui('axis-seg').querySelectorAll('button').find(b => b.dataset.value === 'auto').dispatch('click');
  v.showTab('formteile');
  byLabel(0).checked = false; byLabel(0).dispatch('change');
  v.showTab('entformung');
  ui('mov-seg').querySelectorAll('button').find(b => b.dataset.value === '-1').dispatch('click');
  v.showTab('formteile');
  assert.equal(holder(0).visible, false, 'nach dem Tausch der Seiten ist +X noch aus');
  v.showTab('entformung');
  ui('mov-seg').querySelectorAll('button').find(b => b.dataset.value === '1').dispatch('click');
  /* Ein neues Teil zeigt wieder alle. */
  const { writeSTL } = await import('../../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../../web/tools/3d-studio/js/solids.js');
  const buf = writeSTL(S.box(40, 30, 20), 'test');
  doc.getElementById('stl-input').files = [{ name: 'quader.stl', arrayBuffer: () => Promise.resolve(buf), byteLength: buf.byteLength }];
  doc.getElementById('stl-input').dispatch('change');
  await loaded(v, 'quader.stl');
  await rechne(ui, v);
  assert.deepEqual(s.die.show, {}, 'ein neues Teil beginnt mit allen Formteilen');
  v.showTab('formteile');
  assert.ok(dv.holders.every(h => h.visible));
  v.showTab('entformung');
});

test('Ein gesetzter Abstand bleibt beim kleineren Teil, höchstens bis zum Reglerende, und die Anzeige sagt es', async () => {
  const { doc, v, ui } = P;
  const s = v.state;
  const sel = doc.getElementById('demo-select');
  sel.value = 'oil_pan'; sel.dispatch('change');
  await loaded(v, 'Ölwanne');
  await rechne(ui, v);
  for (const [name, get] of [['die-dist', () => s.die.dist], ['proj-gap', () => s.projView.gap], ['ej-gap', () => s.ej.gap]]) {
    const el = ui(name);
    el.value = el.max; el.dispatch('input');                // selbst gesetzt: ans Ende des großen Teils
    assert.equal(get(), +el.max);
  }
  const { writeSTL } = await import('../../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../../web/tools/3d-studio/js/solids.js');
  const buf = writeSTL(S.box(40, 30, 20), 'test');
  doc.getElementById('stl-input').files = [{ name: 'klein.stl', arrayBuffer: () => Promise.resolve(buf), byteLength: buf.byteLength }];
  doc.getElementById('stl-input').dispatch('change');
  await loaded(v, 'klein.stl');
  await rechne(ui, v);
  for (const [name, get] of [['die-dist', () => s.die.dist], ['proj-gap', () => s.projView.gap], ['ej-gap', () => s.ej.gap]]) {
    const el = ui(name), max = +el.max;
    assert.equal(max, 50, name + ': das Reglerende folgt dem kleinen Teil');
    assert.equal(get(), max, name + ': der Wert höchstens bis dorthin');
    assert.equal(+el.value, max);
    assert.equal(ui(name + '-val').textContent, '50 mm', name + ': die Anzeige nennt, was gilt');
  }
  v.tool.resetSettings();
});

test('Rand geändert, gleich danach ein neues Teil: kein Fehler aus dem verzögerten Nachbau', async () => {
  const { doc, v, ui } = P;
  const s = v.state;
  await analysed(v);
  const errors = [];
  const catcher = err => errors.push(err);
  process.on('uncaughtException', catcher);
  try {
    v.showTab('formteile');
    const skirt = ui('die-skirt');
    skirt.value = '20'; skirt.dispatch('input');             // der Nachbau wartet 120 ms …
    const sel = doc.getElementById('demo-select');
    sel.value = 'oil_pan'; sel.dispatch('change');            // … und das neue Teil ist schneller da
    await loaded(v, 'Ölwanne');
    await new Promise(r => setTimeout(r, 200));
    assert.equal(errors.length, 0, 'kein Fehler: ' + errors.map(e => e.message).join(' | '));
    await rechne(ui, v);
    assert.ok(s.pieces && s.pieces.length >= 2, 'die Stücke des neuen Teils');
  } finally {
    process.off('uncaughtException', catcher);
    ui('die-skirt').value = '8'; ui('die-skirt').dispatch('input');
    v.showTab('entformung');
  }
});

test('Einpassen rahmt, was der Modus zeigt: die herausgefahrenen Formteile, die Ebenen jenseits des Bauteils', async () => {
  const { v, ui, shell } = P;
  const T = await import('three');
  const dv = v.dieView;
  await analysed(v);
  const worst = box => {
    const cam = v.view.camera; cam.updateMatrixWorld(true);
    let w = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new T.Vector3(x, y, z).project(cam); w = Math.max(w, Math.abs(p.x), Math.abs(p.y));
    }
    return w;
  };
  v.showTab('formteile');
  const d = ui('die-dist');
  d.value = d.max; d.dispatch('input');
  shell.fit();
  const pieces = new T.Box3();
  for (const h of dv.holders) if (h.visible) pieces.expandByObject(h);
  assert.ok(worst(pieces) <= 1, 'beim größten Abstand stehen alle Formteile im Bild: ' + worst(pieces).toFixed(2));
  v.showTab('flaechen');
  const g = ui('proj-gap');
  g.value = g.max; g.dispatch('input');
  shell.fit();
  const planes = new T.Box3();
  for (const o of dv.overlays.children) if (o.visible) planes.expandByObject(o);
  assert.ok(!planes.isEmpty() && worst(planes) <= 1, 'die Silhouetten auch bei großem Abstand: ' + worst(planes).toFixed(2));
  /* Die Entformung zeigt das Bauteil: dorthin passt Einpassen ein. */
  v.showTab('entformung');
  shell.fit();
  const part = new T.Box3().setFromObject(v.partMesh);
  const w = worst(part);
  assert.ok(w <= 1 && w > 0.3, 'das Bauteil füllt das Bild: ' + w.toFixed(2));
  v.tool.resetSettings();
});

test('?part=… wählt das Beispielteil aus der Adresszeile', async () => {
  const Q = await mountPage('entformungsanalyse.html', 'js/studio/pages/entformung.js', { search: '?part=heat_sink', variant: 'adresszeile' });
  assert.ok(Q.v.state.name.includes('Kühlkörper'), 'Kühlkörper geladen: ' + Q.v.state.name);
  assert.equal(Q.v.state.seg, null, 'nicht von selbst gerechnet');
  await rechne(Q.ui, Q.v);
  assert.ok(Q.v.state.seg, 'Analyse auf Knopfdruck gelaufen');
  assert.equal(Q.doc.getElementById('demo-select').value, 'heat_sink');
});
