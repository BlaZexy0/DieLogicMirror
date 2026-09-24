/* Die Werkbank (werkbank.html, js/werkbank/app.js) im gemeinsamen Rahmen:
   sechs Schritte, jeder das Werkzeug seiner Einzelseite (js/studio/stages.js).

   Wie die Werkzeugtests: die echte Seite durch das kleine DOM, das echte
   Three.js ohne Renderer. Geprüft wird, was die Werkbank über die
   Einzelseiten hinaus verspricht — dass die Schritte zusammenhängen: der
   Anguss kommt aus dem Bauteil und bindet seine Anschnitte an die Wand, die
   Füllung nimmt genau diese Anschnitte, die Überläufe wandern ins
   Gussvolumen des Angusses, und die Auslegung bekommt Massen, Fläche und
   Sprengfläche aus dem Modell. Dazu die Werkbank-Datei, EIN Feld, EIN
   Verlauf, und dass kein Werkzeug die Felder eines anderen trifft.

   Der Auslegungsschritt selbst (Diagramme auf Canvas) wird hier nicht
   betreten — er braucht einen 2D-Kontext; seine Messung ist reine Rechnung
   und läuft. Die klassischen Skripte des Dashboards (Projekt, Presets,
   Theme) werden wie im Kopf der Seite geladen.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/werkbank.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildDocument, installGlobals, memoryStorage } from '../stubs/dom.mjs';
import { ROOT, wait, kpiText, same, set } from './fixture.mjs';

const SITE = resolve(ROOT, '..', '..');
const require = createRequire(import.meta.url);

let doc, W;
/* Ein Feld eines Werkzeugs: in dessen Kästen (data-owner) — die Werkbank
   trägt „cell" dreimal. Ohne Werkzeug: ein Feld des Rahmens. */
const own = (tool, name) => doc.querySelector('[data-owner="' + tool + '"] [data-ui="' + name + '"]');
const frame = name => doc.querySelector('[data-ui="' + name + '"]');
const tabs = () => doc.querySelectorAll('[data-ui="tabs"] [data-mode]').map(b => b.getAttribute('data-mode'));
const gatesOf = () => Object.values(W.stages.anguss.state.graph.nodes).filter(n => n.type === 'gate');
const fill = () => W.stages.fuellung.state;
const fillDone = () => fill().result && !fill().stale && !fill().running;

before(async () => {
  ({ doc } = buildDocument(readFileSync(join(ROOT, 'werkbank.html'), 'utf8')));
  installGlobals(doc);
  globalThis.localStorage = memoryStorage();
  globalThis.location = { search: '', href: 'http://test/werkbank.html', pathname: '/werkbank.html' };
  for (const f of ['shared/palette.js', 'shared/theme.js', 'shared/examples/machines.js', 'shared/examples/alloys.js',
    'shared/examples/parts.js', 'shared/project.js', 'shared/clampmodel.js']) {
    require(join(SITE, f));
  }
  W = (await import(pathToFileURL(join(ROOT, 'js', 'werkbank', 'app.js')).href)).__viewer;
  await wait(() => W.state.ready, 1200);
  /* Die Entformung rechnet auf Knopfdruck (24.09.), auch in der Werkbank. */
  assert.equal(W.stages.entformung.state.analysed, false, 'nicht von selbst gerechnet');
  frame('primary').dispatch('click');
  await wait(() => W.stages.entformung.state.analysed && !W.stages.entformung.state.running, 2400);
});

test('Schrittleiste, Schritte und Rahmen sind aufgebaut', () => {
  assert.deepEqual(Object.keys(W.stages), ['entformung', 'wandstaerke', 'anguss', 'fuellung', 'ueberlauf', 'temperier', 'auslegung']);
  assert.equal(W.state.stage, 'bauteil');
  assert.deepEqual(doc.querySelectorAll('[data-stage]').map(b => b.getAttribute('data-stage')),
    ['bauteil', 'anguss', 'fuellung', 'ueberlauf', 'temperier', 'auslegung'], 'sechs Schritte in der Leiste');
  assert.ok(doc.querySelector('[data-stage="bauteil"]').classList.contains('active'));
  assert.ok(doc.getElementById('viewport').querySelector('.view-bar'), 'Ansichtsleiste im Viewport');
  assert.ok(W.part.model.faceCount > 1000, 'der Getriebedeckel ist geladen');
  assert.equal(W.part.demoId, 'gearbox_cover');
  assert.match(frame('part-name').textContent, /Getriebedeckel/);
  /* Schritt Bauteil: die Modi zweier Werkzeuge, in zwei Zeilen. */
  assert.deepEqual(tabs(), ['entformung', 'formteile', 'flaechen', 'haftung', 'feld', 'isoflaeche', 'schnitt', 'waermezentren']);
  assert.equal(doc.querySelectorAll('[data-ui="tabs"] .st-tab-break').length, 1, 'ein Umbruch zwischen den Werkzeugen');
  assert.equal(doc.getElementById('studio').getAttribute('data-tool'), 'entformung', 'dran ist die Entformung');
  assert.ok(own('auslegung', 'au-transfer').innerHTML.includes('Sprengfläche'), 'die Übernahmetabelle steht');
  assert.ok(doc.getElementById('curveBody') && doc.getElementById('machineSel'), 'die Eingaben der Auslegung liegen im Dashboard');
  /* Speichern und Exportieren gehören der Werkbank: alle Schritte in einem Menü. */
  const exp = frame('export-list').querySelectorAll('button').map(b => b.textContent);
  assert.ok(exp.some(t => /^Anguss: /.test(t)) && exp.some(t => /^Überläufe: /.test(t)) && exp.some(t => /^Wandstärke: /.test(t)), exp.join(' | '));
});

test('Rahmen: jedes Werkzeug findet nur seine Felder, und EIN Feld hat EINE Zellkante', () => {
  const g = id => W.tools[id] && W.stages[id].host.ui;
  const cells = ['wandstaerke', 'fuellung', 'temperier'].map(id => g(id)('cell'));
  assert.ok(cells.every(Boolean), 'jedes hat eine Zeile „cell"');
  assert.equal(new Set(cells).size, 3, 'drei verschiedene Felder');
  assert.equal(cells[0], own('wandstaerke', 'cell'));
  /* Füllung und Temperierung rastern das gemeinsame Feld: ihre Zellkante
     steht nicht da, eine Zeile sagt, woher sie kommt. */
  assert.equal(own('fuellung', 'cell').closest('.row').hidden, true);
  assert.equal(own('temperier', 'cell').closest('.row').hidden, true);
  assert.match(own('fuellung', 'cell-shared').textContent, /Schritt Bauteil/);
  assert.equal(W.field.shared, true);
  assert.ok(W.field.bandWanted >= 30, 'von Anfang an so breit wie die Abstandsfläche braucht: ' + W.field.bandWanted);
  /* Die Füllung kennt hier keine Vorgaben und keinen Chip — ihre Anschnitte kommen aus dem Anguss. */
  assert.equal(own('fuellung', 'defaults-block').hidden, true);
});

test('Bauteil: die Entformung läuft auf Knopfdruck und findet Z', () => {
  const s = W.stages.entformung.state;
  assert.equal(s.seg.mainAxis, 2);
  assert.ok(s.seg.auto);
  assert.ok(doc.getElementById('pt-legend').innerHTML.includes('%'), 'Legende mit Flächenanteilen');
  assert.ok(+own('entformung', 'parting-count').textContent.replace(/\D/g, '') > 0, 'Trennlinie gefunden');
  assert.match(own('entformung', 'analysis-state').textContent, /automatisch/);
  assert.doesNotMatch(own('entformung', 'analysis-state').textContent, /falsch herum/, 'Z ist die Achse der Werkbank');
  assert.ok(doc.querySelector('[data-stage="bauteil"]').classList.contains('done'), 'der Schritt hat ein Ergebnis');
});

test('Bauteil: die Formteile gehören ihrem Modus — weg im nächsten Schritt, wieder da beim Zurückkommen', () => {
  const dv = W.stages.entformung.dieView;
  W.shell.setMode('formteile');
  assert.equal(dv.group.visible, true);
  assert.ok(W.part.mesh.material.opacity < 0.2, 'Bauteil durchscheinend dazwischen');
  assert.equal(W.tools.anguss.bodies.visible, false, 'die Analysen zeigen das Bauteil für sich, ohne Anguss');
  W.activate('anguss');
  assert.equal(dv.group.visible, false, 'im nächsten Schritt weg');
  assert.equal(W.part.mesh.visible, true);
  assert.equal(W.tools.anguss.bodies.visible, true, 'im Schritt Anguss steht der Anguss');
  assert.equal(W.tools.ueberlauf.bodies.visible, true, 'und die Körper der anderen Pläne als Zusammenhang');
  assert.equal(doc.getElementById('studio').getAttribute('data-tool'), 'anguss');
  W.activate('bauteil');
  assert.equal(W.shell.mode, 'formteile', 'der Schritt steht, wie man ihn verließ');
  assert.equal(dv.group.visible, true, 'und die Formteile mit ihm');
  /* Innerhalb des Schritts zum anderen Werkzeug: die Wandstärke ist dran, die Formteile gehen. */
  W.shell.setMode('feld');
  assert.equal(dv.group.visible, false);
  assert.equal(doc.getElementById('studio').getAttribute('data-tool'), 'wandstaerke');
  assert.equal(doc.getElementById('pt-legend').innerHTML, '', 'die Legende der Regionen geht mit ihrem Werkzeug');
  W.shell.setMode('entformung');
});

test('Anguss: der Vorschlag liegt vor der Kante bei −Y, Achse −Z, Anschnitte an der Wand', () => {
  const r = W.stages.anguss;
  const g = r.state.graph;
  const b = W.part.model.bounds;
  assert.ok(r.state.ready);
  assert.equal(g.biscuit.axis, '-z', 'die Kanäle liegen als Nut in der beweglichen Hälfte');
  assert.ok(g.biscuit.pos[1] < b.min[1] - 100, 'Pressrest deutlich vor der Kante');
  assert.equal(Math.abs(g.biscuit.pos[2]), 0, 'Pressrest in der Trennebene');
  const gates = gatesOf();
  assert.equal(gates.length, 2);
  for (const n of gates) {
    assert.ok(Math.abs(n.pos[1] - b.min[1]) < 2, 'Mündung an der Kante y = min: ' + n.pos);
    assert.ok(Math.abs(n.pos[2]) < 1e-6, 'Mündung in der Trennebene: ' + n.pos);
    assert.ok(n.aim && n.aim[1] > 0.9, 'Mündungsrichtung +Y ins Bauteil');
  }
  assert.ok(r.state.flow && r.state.flow.gates.length === 2, 'Strömung gerechnet');
  assert.ok(r.state.rules.length > 0, 'Prüfregeln laufen');
  /* Das Bauteil bleibt, wo es ist — der Anguss kommt zu ihm. */
  const m = W.part.mesh;
  assert.ok(m.position.length() < 1e-9 && Math.abs(m.quaternion.w - 1) < 1e-9, 'das Bauteil steht im Bauteilsystem');
  /* Das Gussvolumen ist das Bauteilvolumen — Überläufe gibt es noch keine. */
  assert.ok(Math.abs(r.state.proc.volume - W.part.model.volume / 1000) < 0.2, 'Gussvolumen aus dem Bauteil');
  assert.equal(own('anguss', 'vol-auto').checked, true);
  assert.equal(own('anguss', 'vol-auto-row').hidden, false, 'der Haken steht nur auf der Werkbank');
  assert.equal(own('anguss', 'ref-block').hidden, true, 'kein Referenzteil, kein Beispiel');
  assert.equal(own('anguss', 'preset').closest('.row').hidden, true);
  assert.ok(own('anguss', 'rules-list').innerHTML.includes('rule'), 'Prüfliste in der Seitenleiste');
  W.activate('anguss');
  /* Der Vorschlag steht im Modus System, wo sonst die Beispiele stehen — die
     vier Reiter des Angussdesigners passen in EINE Zeile. */
  assert.deepEqual(tabs(), ['system', 'kanalform', 'prozess', 'pruefung']);
  assert.equal(W.shell.mode, 'system');
  assert.equal(own('anguss', 'propose-gates').closest('[data-mode]').dataset.mode, 'system');
  assert.equal(frame('primary').textContent, 'Anguss ans Bauteil legen');
  assert.ok(doc.querySelectorAll('[data-chip]').length >= 5, 'die Chips des Angussdesigners stehen über dem Bild');
});

test('Anguss: die Ankunft nach der DieLogic-Schusskurve — ab Kammer voll gezeigt, ab Kolbenstart gerechnet', () => {
  const r = W.stages.anguss;
  assert.ok(r.state.onCurve && own('anguss', 'shot-time').checked, 'voreingestellt an');
  const tl = r.state.timeline;
  assert.ok(tl && !tl.error, 'Kurve für dieses Modell: ' + (tl && tl.error));
  const shown = r.state.flowShown;
  assert.ok(shown.onCurve && shown !== r.state.flow, 'das gezeigte Ergebnis trägt die Kurvenzeiten');
  assert.equal(shown.unreached.length, 0, 'jeder Anschnitt wird erreicht');
  for (const g of shown.gates) {
    const konst = r.state.flow.gates.find(x => x.id === g.id);
    assert.ok(Number.isFinite(g.tArrive) && g.tArrive > tl.tFull, 'Ankunft ' + g.id + ' nach Kammer voll');
    /* Die Substitution: Ankunft bei konstantem Strom mal Strom ist das Volumen
       am Pressrest, und das hat auf der Kurve seine eigene Zeit. */
    const V = konst.tArrive * r.state.flow.Q;
    assert.ok(Math.abs(g.tArrive - (tl.tFull + tl.timeForVolume(V))) < 1e-9, 'Kurvenzeit zum Volumen ' + V);
  }
  /* Die Kammer der Kurve ist die des Angusses: der Pressrest als Kolben, die Füllkammerlänge aus „Prozess". */
  assert.equal(tl.v.diam, r.state.graph.biscuit.d);
  assert.equal(tl.v.length, r.state.proc.chamberLen);
  assert.match(kpiText(own('anguss', 'shot-kpis')), /Ankunft ab Kammer voll/);
  const mouths = W.tools.anguss.link.gateMouths();
  assert.ok(mouths.every(m => Number.isFinite(m.tArrive) && m.tArrive > tl.tFull), 'die Mündungen tragen die Ankunft für die Füllung');
  const cb = own('anguss', 'shot-time');
  cb.checked = false;
  cb.dispatch('change');
  assert.equal(r.state.onCurve, false);
  assert.equal(r.state.flowShown, r.state.flow);
  assert.match(kpiText(own('anguss', 'shot-kpis')), /konstanter Strom/);
  cb.checked = true;
  cb.dispatch('change');
  assert.ok(r.state.flowShown.onCurve);
});

test('Anguss: ein Fächer und vier Anschnitte lassen sich vorschlagen, dann wieder zwei — jeder Vorschlag ist ein Schritt im Verlauf', () => {
  const depth = W.host.history.depth;
  /* Der Hauptknopf des Modus System, mit der Wahl darüber. */
  const propose = n => { set(own('anguss', 'propose-gates'), String(n)); frame('primary').dispatch('click'); };
  assert.equal(W.shell.mode, 'system');
  propose(1);
  assert.equal(gatesOf().length, 1);
  assert.equal(gatesOf()[0].gate.transition, 'faecher');
  propose(4);
  const gates4 = gatesOf();
  assert.equal(gates4.length, 4);
  assert.ok(gates4.every(n => Math.abs(n.pos[1] - W.part.model.bounds.min[1]) < 2), 'alle vier an der Kante');
  const xs = gates4.map(n => n.pos[0]).sort((a, b) => a - b);
  assert.ok(xs[0] < xs[1] && xs[1] < 0 && 0 < xs[2] && xs[2] < xs[3], 'symmetrisch um die Mitte');
  propose(2);
  assert.equal(gatesOf().length, 2);
  assert.equal(W.host.history.depth, depth + 3, 'drei Schritte „Anguss vorgeschlagen"');
  W.host.undo();
  assert.equal(gatesOf().length, 4, 'Rückgängig holt das vorige System zurück');
  W.host.redo();
  assert.equal(gatesOf().length, 2);
});

test('Füllung: die Anschnitte sind die Mündungen des Angusses, auf dem gemeinsamen Feld', async () => {
  /* Gröber als der Vorschlag (halbe Wanddicke): das Feld ist hier Mittel, nicht Gegenstand. */
  assert.equal(own('wandstaerke', 'cell').value, '2,5', 'die Zellkante kam aus der Wanddicke');
  W.activate('bauteil', 'feld');
  set(own('wandstaerke', 'cell'), '5');
  assert.equal(W.field.h, 5, 'die Zellkante der Wandstärke ist die des gemeinsamen Feldes');
  W.activate('fuellung');
  assert.equal(W.shell.mode, 'ergebnis', 'die Füllung beginnt beim Ergebnis');
  assert.equal(doc.querySelectorAll('[data-chip]').length, 0, 'keine Anschnitte von Hand');
  const items = Object.values(fill().plan.items);
  assert.equal(items.length, 2);
  for (const it of items) {
    const n = gatesOf().find(x => x.id === it.id);
    assert.ok(n, 'Anschnitt ' + it.id + ' gehört zum Anguss');
    assert.deepEqual(it.pos, n.pos);
    assert.equal(it.w, n.gate.w);
    assert.equal(it.h, n.gate.h);
    assert.ok(it.n[1] < -0.9, 'Normale nach außen (−Y): ' + it.n);
    assert.ok(Math.abs(it.share - 50) < 5, 'Anteil aus der Strömung: ' + it.share);
    assert.ok(it.bound);
  }
  assert.equal(own('fuellung', 'item-list').querySelectorAll('.st-list-row.still').length, 2, 'die Liste ist Auskunft');
  /* Beim Betreten rechnet die Füllung von selbst — auf dem gemeinsamen Feld. */
  await wait(fillDone, 4000);
  assert.ok(W.field.data, 'das Abstandsfeld liegt vor');
  assert.ok(W.field.data.band >= 30, 'breit genug für die Abstandsfläche der Temperierung: ' + W.field.data.band);
  same(fill().field, W.field.data, 'die Füllung rechnet auf dem gemeinsamen Feld');
  const r = fill().result;
  assert.equal(r.stats.inlets.length, 2);
  assert.ok(r.stats.inlets.every(i => i.seeds > 1), 'jeder Anschnitt trifft Rasterzellen');
  assert.ok(r.stats.maxPath > 100, 'Fließweg gemessen');
  assert.ok(fill().spots.list.length > 0, 'zuletzt gefüllte Stellen gefunden');
  assert.match(kpiText(own('fuellung', 'fill-kpis')), /Fließweg/);
  assert.ok(doc.querySelector('[data-stage="fuellung"]').classList.contains('done'));
  /* Die Wandstärke übernimmt das Feld, das die Füllung gerechnet hat. */
  same(W.stages.wandstaerke.state.field, W.field.data, 'die Wandstärke hat dasselbe Feld');
});

test('Füllung: die Uhr läuft auf der Schusskurve, gezeigt ab Kammer voll; ein späterer Anschnitt startet mit Vorsprung', async () => {
  const tm = fill().timing;
  assert.ok(tm, 'Zeiten aus der Schusskurve');
  const opens = Object.values(tm.tOpen);
  assert.ok(Math.abs(tm.tFirst - Math.min(...opens)) < 1e-12, 'die Uhr beginnt mit dem ersten Anschnitt');
  assert.ok(tm.tFirst > tm.tFull, 'nach Kammer voll');
  assert.ok(tm.tEnd !== null && tm.tEnd > tm.tFirst, 'das Bauteil wird voll: ' + tm.tEnd);
  assert.ok(Math.abs(tm.timeAt(0) - tm.tFirst) < 1e-12 && Math.abs(tm.timeAt(1) - tm.tEnd) < 1e-9, 'Füllgrad ↔ Zeit');
  assert.ok(Number.isFinite(tm.shotFill) && tm.shotFill > 0, 'die Füllzeit der Auslegung steht dabei');
  assert.match(kpiText(own('fuellung', 'result-kpis')), /Bauteil voll ab Kammer voll/);
  assert.match(own('fuellung', 'item-list').textContent, /öffnet bei/);
  /* Ab Kolbenstart nur in den Details des Ergebnisses; „Raster" bleibt beim Raster. */
  assert.equal(own('fuellung', 'clock-details').hidden, false);
  const uhr = own('fuellung', 'clock-facts').textContent;
  assert.ok(/Kammer voll/.test(uhr) && /Anschnitte öffnen/.test(uhr) && /Füllzeit der Auslegung/.test(uhr), uhr);
  assert.doesNotMatch(own('fuellung', 'grid-facts').textContent, /Kammer voll/);
  assert.match(frame('q-val').textContent, /%.*ms/, 'der Regler unten nennt zum Füllgrad die Zeit');
  /* Zwei symmetrische Anschnitte öffnen zugleich: kein Vorsprung. */
  assert.ok(Object.values(tm.offsets).every(o => o === 0), 'symmetrisch: ' + JSON.stringify(tm.offsets));
  /* Ungleich aufgeteilt (70 : 30): der Ast mit dem kleineren Anteil füllt sich
     langsamer, sein Anschnitt öffnet später — mit Vorsprung des anderen. */
  const r = W.stages.anguss;
  const br = Object.values(r.state.graph.nodes).find(n => n.type === 'branch');
  br.ratio = 0.7;
  r.rebuild();
  await wait(() => fillDone() && fill().timing && Object.values(fill().timing.offsets).some(o => o > 0), 4000);
  const t2 = fill().timing;
  const ids = Object.keys(t2.tOpen);
  assert.equal(ids.length, 2);
  const late = ids.filter(id => t2.tOpen[id] > t2.tFirst + 1e-6);
  assert.equal(late.length, 1, 'genau ein Anschnitt öffnet später: ' + JSON.stringify(t2.tOpen));
  for (const id of late) {
    assert.ok(t2.qOpen[id] > 0 && t2.offsets[id] > 0, id + ' startet mit Vorsprung des anderen');
    const inf = fill().result.stats.inlets.find(i => i.id === id);
    assert.equal(inf.offset, t2.offsets[id], 'der Vorsprung steht in der Rechnung');
    const early = fill().result.stats.inlets.find(i => i.id !== id);
    assert.ok(early.cells > inf.cells, 'der frühere Anschnitt füllt mehr: ' + early.cells + ' > ' + inf.cells);
  }
  assert.match(own('fuellung', 'item-list').textContent, /% voll\)/, 'die Liste nennt den Vorsprung');
  br.ratio = 0.5;
  r.rebuild();
  /* Ohne Kurve: keine Uhr, eine Zeile sagt warum. */
  const cb = own('anguss', 'shot-time');
  cb.checked = false; cb.dispatch('change');
  await wait(() => fillDone() && !fill().timing, 4000);
  assert.match(kpiText(own('fuellung', 'result-kpis')), /Ohne Schusskurve/);
  cb.checked = true; cb.dispatch('change');
  await wait(() => fillDone() && fill().timing, 4000);
});

test('Überläufe: ein Element am Bauteil vergrößert das Gussvolumen des Angusses; die letzten Stellen stehen als Marken', () => {
  W.activate('ueberlauf');
  const v = W.tools.ueberlauf;
  const r = W.stages.anguss;
  const before = r.state.proc.volume;
  assert.equal(Object.keys(v.link.doc().items).length, 0, 'noch kein Überlauf');
  assert.equal(doc.querySelectorAll('[data-chip]').length, 4, 'die vier Arten als Chips');
  /* Die Marken der Füllung: im Bild und in der Legende. */
  const spots = W.stages.ueberlauf.group.children.find(c => c.isGroup && c.children.length && c.children.every(m => m.isMesh));
  assert.ok(spots && spots.visible && spots.children.length === fill().spots.list.length, 'die zuletzt gefüllten Stellen stehen als Marken');
  assert.match(doc.getElementById('pt-legend').innerHTML, /zuletzt gefüllt/);
  /* Der Klick auf die Wand braucht einen Renderer — hier kommt das Element
     über die Plandatei, wie ein Klick auf +X am Deckelrand. */
  const b = W.part.model.bounds;
  const depth = W.host.history.depth;
  v.link.load({ format: 'dielogic-luft', version: 3, items: [{ id: 'l1', type: 'bohne', pos: [b.max[0], 0, -30], dir: [1, 0, 0], rot: 0, p: {} }] });
  W.host.changed('Überlauf gesetzt');
  assert.equal(W.host.history.depth, depth + 1);
  assert.ok(v.link.volume() > 1000, 'die Bohne hat ein Volumen: ' + v.link.volume());
  assert.ok(r.state.proc.volume > before, 'das Gussvolumen des Angusses ist gewachsen: ' + before + ' → ' + r.state.proc.volume);
  assert.ok(Math.abs(r.state.proc.volume - (W.part.model.volume + v.link.volume()) / 1000) < 0.2, 'Bauteil + Überläufe');
  assert.match(kpiText(own('ueberlauf', 'plan-kpis')), /Gesamt/);
  /* Rückgängig nimmt beides zurück: den Überlauf und das Gussvolumen. */
  W.host.undo();
  assert.equal(v.link.doc().items.length, 0);
  assert.ok(Math.abs(r.state.proc.volume - before) < 1e-9, 'das Gussvolumen ist wieder das des Bauteils');
  W.host.redo();
  assert.equal(v.link.doc().items.length, 1);
});

test('Temperierung: die Abstandsfläche kommt aus dem gemeinsamen Feld, ohne neu zu rastern', async () => {
  const f = W.field.data;
  W.activate('temperier');
  const t = W.stages.temperier;
  await wait(() => t.state.shellDist === 20 && !t.state.running, 2400);
  same(t.state.field, W.field.data, 'dasselbe Feld wie die Füllung');
  same(W.field.data, f, 'kein neues Feld');
  assert.ok(t.shellMesh.geometry.attributes.position.count > 100, 'die Fläche hat Dreiecke');
  assert.ok(doc.querySelector('[data-chip="stich"]') && !doc.querySelector('[data-chip="stich"]').classList.contains('off'), 'Setzen ist freigegeben');
  t.runAuto();
  const items = W.tools.temperier.link.doc().items;
  assert.ok(items.length >= 4, 'die Automatik hat Kühlstiche gesetzt: ' + items.length);
  assert.ok(items.every(i => i.auto && i.type === 'stich'));
  /* Die Fläche gehört dem Schritt: im nächsten ist sie weg, die Bohrungen bleiben. */
  W.activate('ueberlauf');
  assert.equal(t.shellMesh.visible, false);
  assert.ok(Object.values(t.meshes).some(m => m.visible), 'die Bohrungen stehen weiter im Bild');
});

test('Auslegung: Massen, Anschnitt, Wandstärke und Sprengfläche aus dem Modell', () => {
  const d = W.stages.auslegung;
  const vals = d.measure();
  const part = W.part.model;
  const rho = d.values().densitySolid / Math.pow(1 + d.values().shrink / 100, 3);
  assert.ok(Math.abs(vals.part - part.volume * 1e-9 * rho) < 0.01, 'Bauteilgewicht = Volumen × ρ_sol: ' + vals.part);
  assert.ok(vals.runner > 0.2 && vals.runner < 5, 'Angussgewicht plausibel: ' + vals.runner);
  assert.ok(vals.biscuit > 0.1, 'Pressrestgewicht: ' + vals.biscuit);
  assert.ok(vals.overflow > 0, 'Überlaufgewicht aus dem Plan: ' + vals.overflow);
  assert.ok(Math.abs(vals.gate - W.stages.anguss.state.flow.gateArea) < 1, 'Anschnittfläche aus der Strömung');
  assert.equal(vals.gateTh, W.stages.anguss.state.graph.gateH);
  assert.ok(Math.abs(vals.wall - 2 * part.volume / part.totalArea) < 0.02, 'Wandstärke 2V/A');
  assert.ok(vals.wallMax > vals.wall, 'dickste Stelle aus dem Feld');
  const b = part.bounds;
  const bbox = b.size[0] * b.size[1] * 1e-6;
  assert.ok(vals.area > 0.6 * bbox && vals.area < 1.5 * bbox, 'Sprengfläche in der Größenordnung der Grundfläche: ' + vals.area + ' m² zu ' + bbox);
});

test('Auslegung: Übernehmen schreibt die angehakten Werte in den Auslegungszustand', () => {
  const d = W.stages.auslegung;
  const vals = d.measure();
  const n = d.apply();
  assert.ok(n >= 6, n + ' Werte übernommen');
  const v = d.values();
  assert.equal(v.part, vals.part);
  assert.equal(v.runner, vals.runner);
  assert.equal(v.gate, vals.gate);
  assert.equal(v.area, vals.area);
  assert.equal(v.wall, vals.wall);
  assert.notEqual(v.wallMax, vals.wallMax, 'Wandstärke max. ist nicht angehakt');
  assert.equal(d.apply(), 0, 'ein zweites Mal gibt es nichts zu übernehmen');
});

test('Anguss: Prozess aus der Auslegung — Legierung nach Dichte, Zielgeschwindigkeit aus dem Band, Füllzeit der Kurve', () => {
  const r = W.stages.anguss;
  W.activate('anguss', 'prozess');
  r.state.proc.vGate = 55;
  W.host.refreshActions();
  assert.equal(frame('primary').textContent, 'Prozess aus der Auslegung');
  frame('primary').dispatch('click');
  assert.equal(r.state.proc.alloy, 'al');
  const v = W.stages.auslegung.values();
  assert.equal(r.state.proc.vGate, Math.round((v.gateMin + v.gateMax) / 2));
  assert.ok(Math.abs(r.state.proc.fillTime - r.state.timeline.shot.fill) < 0.06, 'die Füllzeit der Kurve');
  assert.equal(frame('primary').hidden, true, 'danach gibt es nichts mehr zu tun');
  assert.match(frame('note').textContent, /stimmen mit der Auslegung/);
});

test('Werkbank-Datei: alle Pläne hin und zurück — und gespeichert, geladen, gespeichert ist dieselbe Datei', async () => {
  const json = W.toJSON();
  assert.equal(json.format, 'dielogic-werkbank');
  assert.equal(json.version, 1);
  assert.deepEqual(Object.keys(json), ['format', 'version', 'part', 'anguss', 'prozess', 'fuellung', 'luft', 'temperier']);
  assert.equal(json.prozess.onCurve, true, 'die Kurvenwahl steht in der Datei');
  assert.equal(json.prozess.volAuto, true);
  assert.equal(json.part.demo, 'gearbox_cover');
  assert.equal(json.anguss.format, 'dielogic-anguss');
  assert.equal(json.anguss.process, undefined, 'der Graph allein; der Prozess steht daneben');
  assert.equal(json.luft.items.length, 1);
  assert.ok(json.temperier.items.length >= 4);
  assert.equal(json.prozess.alloy, 'al');
  assert.deepEqual(Object.keys(json.fuellung), ['alpha', 'spots']);
  const text = JSON.stringify(json);
  /* Alles leeren, dann laden. */
  W.tools.ueberlauf.link.load({ format: 'dielogic-luft', version: 3, items: [] });
  W.tools.temperier.link.load({ format: 'dielogic-temperier', version: 1, items: [] });
  W.vorschlag.propose(1);
  assert.equal(W.tools.ueberlauf.link.doc().items.length, 0);
  await W.loadWerkbank(JSON.parse(text), 'bank.json');
  assert.equal(gatesOf().length, 2, 'der Anguss ist zurück');
  assert.equal(W.tools.ueberlauf.link.doc().items.length, 1, 'die Überläufe sind zurück');
  assert.ok(W.tools.temperier.link.doc().items.length >= 4, 'die Temperierung ist zurück');
  assert.equal(JSON.stringify(W.toJSON()), text, 'gespeichert, geladen, gespeichert: dieselbe Datei');
  assert.equal(W.host.history.depth, 0, 'eine Datei ist ein neuer Anfang');
  /* Eine fremde Kennung wird abgewiesen, ein Füllplan auch; eine Plandatei geht an ihren Schritt. */
  await assert.rejects(W.loadJSON({ format: 'dielogic-irgendwas' }, 'x.json'), /unbekannte Kennung/);
  await assert.rejects(W.loadJSON({ format: 'dielogic-fuellung', version: 1, items: [] }, 'f.json'), /Anschnitte kommen aus dem Anguss/);
  await W.loadJSON({ format: 'dielogic-luft', version: 3, items: [] }, 'luft.json');
  assert.equal(W.state.stage, 'ueberlauf');
  assert.equal(W.tools.ueberlauf.link.doc().items.length, 0);
  assert.equal(W.host.history.depth, 1, 'eine Plandatei ist ein Schritt');
  W.host.undo();
  assert.equal(W.tools.ueberlauf.link.doc().items.length, 1);
});

test('Entwurf und Tasten: die Werkbank hebt EINEN Entwurf je Bauteil auf; Entf und Esc gehen an das Werkzeug, das dran ist', async () => {
  W.host.store.flushPending();
  const raw = localStorage.getItem('studio:werkbank:gearbox_cover');
  assert.ok(raw, 'ein Entwurf liegt im Browser');
  const d = JSON.parse(raw).doc;
  assert.equal(d.format, 'dielogic-werkbank');
  assert.ok(Array.isArray(d.luft.items));
  /* Entf im Schritt Überläufe entfernt das gewählte Element — in einem
     anderen Schritt trifft es nichts. */
  W.activate('ueberlauf');
  const h = W.stages.ueberlauf.handles;
  h.select('l1');
  const key = k => doc.dispatch('keydown', { key: k, target: doc.body, preventDefault() {} });
  W.activate('temperier');
  key('Delete');
  assert.equal(W.tools.ueberlauf.link.doc().items.length, 1, 'nicht dran: Entf trifft den Überlauf nicht');
  W.activate('ueberlauf');
  key('Delete');
  assert.equal(W.tools.ueberlauf.link.doc().items.length, 0, 'dran: Entf entfernt ihn');
  assert.match(frame('toast').textContent, /entfernt/);
  doc.dispatch('keydown', { key: 'z', ctrlKey: true, target: doc.body, preventDefault() {} });
  assert.equal(W.tools.ueberlauf.link.doc().items.length, 1, 'Strg+Z holt ihn zurück');
});

test('Ein anderes Bauteil: neuer Vorschlag, leere Pläne, Feld weg, ein neuer Anfang im Verlauf', async () => {
  set(own('anguss', 'propose-gates'), '2');
  await W.part.pickDemo('u_channel_ribbed');
  await wait(() => W.state.ready && W.part.name === 'U-Profil mit Rippen', 1200);
  assert.equal(W.field.data, null, 'das Feld gehört zum alten Teil');
  const b = W.part.model.bounds;
  const gates = gatesOf();
  assert.equal(gates.length, 2, 'der Vorschlag ist neu');
  assert.ok(gates.every(n => Math.abs(n.pos[1] - b.min[1]) < 2), 'an der Kante des neuen Teils');
  assert.equal(W.tools.ueberlauf.link.doc().items.length, 0, 'Überläufe geleert');
  assert.equal(W.tools.temperier.link.doc().items.length, 0, 'Temperierung geleert');
  assert.equal(W.host.history.depth, 0);
  assert.ok(Math.abs(W.stages.anguss.state.proc.volume - W.part.model.volume / 1000) < 0.2, 'Gussvolumen des neuen Teils');
});
