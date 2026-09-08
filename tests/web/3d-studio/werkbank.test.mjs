/* Verdrahtungstest der Werkbank (werkbank.html, js/werkbank/).

   Wie viewer.test.mjs: die echte Seite durch das kleine DOM, das echte
   Three.js ohne Renderer. Geprüft wird, was die Werkbank über die
   Einzelseiten hinaus verspricht — dass die Schritte zusammenhängen:
   der Anguss kommt aus dem Bauteil und bindet seine Anschnitte an die
   Wand, die Füllung nimmt genau diese Anschnitte, die Überläufe wandern
   ins Gussvolumen des Angusses, und die Auslegung bekommt Massen, Fläche
   und Sprengfläche aus dem Modell. Dazu die Werkbank-Datei.

   Der Auslegungsschritt selbst (Diagramme auf Canvas) wird hier nicht
   betreten — er braucht einen 2D-Kontext; seine Messung ist reine
   Rechnung und läuft. Die klassischen Skripte des Dashboards (Projekt,
   Presets, Theme) werden wie in tests/web/dashboard-kern.test.mjs geladen. */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildDocument, installGlobals } from './stubs/dom.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..', '..', '..', 'web');
const ROOT = join(SITE, 'tools', '3d-studio');
const require = createRequire(import.meta.url);

async function until(fn, tries = 1200, what = 'Bedingung') {
  for (let i = 0; i < tries; i++) {
    if (fn()) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(what + ' trat nicht ein');
}

let app, doc, W;

before(async () => {
  ({ doc } = buildDocument(readFileSync(join(ROOT, 'werkbank.html'), 'utf8')));
  installGlobals(doc);
  globalThis.location = { search: '', href: 'http://test/werkbank.html' };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.sessionStorage = globalThis.localStorage;
  for (const f of ['shared/palette.js', 'shared/theme.js', 'shared/examples/machines.js',
    'shared/examples/alloys.js', 'shared/examples/parts.js', 'shared/project.js', 'shared/clampmodel.js']) {
    require(join(SITE, f));
  }
  app = await import('../../../web/tools/3d-studio/js/werkbank/app.js');
  W = app.__viewer;
  await until(() => W.ctx.ready, 1200, 'Bauteil geladen');
  await until(() => W.stages.bauteil.state.analysed && !W.stages.bauteil.state.running, 2400, 'Entformungsanalyse');
});

test('Schrittleiste, Schritte und Viewport sind aufgebaut', () => {
  assert.deepEqual(Object.keys(W.stages), ['bauteil', 'anguss', 'fuellung', 'ueberlauf', 'temperier', 'auslegung']);
  assert.equal(W.ctx.active, 'bauteil');
  const bar = doc.getElementById('viewport').querySelector('.view-bar');
  assert.ok(bar, 'Ansichtsleiste im Viewport');
  assert.equal(doc.querySelectorAll('[data-stage]').length, 6, 'sechs Schritte');
  assert.ok(doc.querySelector('[data-stage="bauteil"]').classList.contains('active'), 'der erste Schritt ist markiert');
  assert.ok(doc.getElementById('au-transfer').innerHTML.includes('Sprengfläche'), 'die Übernahmetabelle steht');
  assert.ok(W.ctx.part.model.faceCount > 1000, 'der Getriebedeckel ist geladen');
  assert.equal(W.ctx.part.demoId, 'gearbox_cover');
});

test('Bauteil: die Entformung läuft beim Laden und findet Z', () => {
  const s = W.stages.bauteil.state;
  assert.equal(s.seg.mainAxis, 2);
  assert.ok(s.seg.auto);
  assert.ok(doc.getElementById('bt-legend').innerHTML.includes('%'), 'Legende mit Flächenanteilen');
  assert.ok(+doc.getElementById('bt-parting-count').textContent.replace(/\D/g, '') > 0, 'Trennlinie gefunden');
  assert.ok(doc.getElementById('bt-analysis-state').textContent.includes('automatisch'));
});

test('Anguss: der Vorschlag liegt vor der Kante bei −Y, Achse −Z, Anschnitte an der Wand', () => {
  const r = W.stages.anguss;
  const g = r.state.graph;
  const b = W.ctx.part.model.bounds;
  assert.ok(r.state.ready);
  assert.equal(g.biscuit.axis, '-z', 'die Kanäle liegen als Nut in der beweglichen Hälfte');
  assert.ok(g.biscuit.pos[1] < b.min[1] - 100, 'Pressrest deutlich vor der Kante');
  assert.equal(Math.abs(g.biscuit.pos[2]), 0, 'Pressrest in der Trennebene');
  const gates = Object.values(g.nodes).filter(n => n.type === 'gate');
  assert.equal(gates.length, 2);
  for (const n of gates) {
    assert.ok(Math.abs(n.pos[1] - b.min[1]) < 2, 'Mündung an der Kante y = min: ' + n.pos);
    assert.ok(Math.abs(n.pos[2]) < 1e-6, 'Mündung in der Trennebene: ' + n.pos);
    assert.ok(n.aim && n.aim[1] > 0.9, 'Mündungsrichtung +Y ins Bauteil');
  }
  assert.ok(r.state.flow && r.state.flow.gates.length === 2, 'Strömung gerechnet');
  assert.ok(r.state.rules.length > 0, 'Prüfregeln laufen');
  /* Das Gussvolumen ist das Bauteilvolumen — Überläufe gibt es noch keine. */
  assert.ok(Math.abs(r.state.proc.volume - W.ctx.part.model.volume / 1000) < 0.2, 'Gussvolumen aus dem Bauteil');
  assert.ok(doc.getElementById('an-rules').innerHTML.includes('rule'), 'Prüfliste in der Seitenleiste');
});

test('Anguss: die Ankunft steht nach der DieLogic-Schusskurve — ab Kammer voll, aus dem Volumen am Pressrest', () => {
  const r = W.stages.anguss;
  assert.ok(r.state.onCurve && doc.getElementById('an-shot-time').checked, 'voreingestellt an');
  const tl = r.state.timeline;
  assert.ok(tl && !tl.error, 'Kurve für dieses Modell: ' + (tl && tl.error));
  const shown = r.state.flowShown;
  assert.ok(shown.onCurve && shown !== r.state.flow, 'das gezeigte Ergebnis trägt die Kurvenzeiten');
  assert.equal(shown.unreached.length, 0, 'jeder Anschnitt wird erreicht');
  for (const g of shown.gates) {
    const konst = r.state.flow.gates.find(x => x.id === g.id);
    assert.ok(Number.isFinite(g.tArrive) && g.tArrive > 0, 'Ankunft ' + g.id);
    /* Die Substitution: Ankunft bei konstantem Strom mal Strom ist das
       Volumen am Pressrest, und das hat auf der Kurve seine eigene Zeit. */
    const V = konst.tArrive * r.state.flow.Q;
    assert.ok(Math.abs(g.tArrive - tl.timeForVolume(V)) < 1e-9, 'Kurvenzeit zum Volumen ' + V);
    assert.ok(Math.abs(g.tArrive - konst.tArrive) > 1e-4, 'die Kurve gibt eine andere Zeit als der mittlere Strom (Prozess 45 ms, Kurve '
      + tl.shot.fill.toFixed(0) + ' ms)');
  }
  assert.ok(Math.abs(shown.tRunner - shown.tLast) < 1e-12);
  const facts = doc.getElementById('an-chart-facts').innerHTML;
  assert.ok(facts.includes('ab Kammer voll') && facts.includes('DieLogic-Kurve'), 'die Kennzahlen nennen die Kurve');
  assert.ok(doc.getElementById('an-shot-facts').innerHTML.includes('Kammer voll'), 'die Seitenleiste zeigt die Kurve');
  /* Die Prüfregel der Spanne misst an der Füllzeit der Kurve. */
  assert.equal(shown.fillTime, tl.shot.fill);
  /* Aus: konstanter Strom, wie im Angussdesigner. */
  const cb = doc.getElementById('an-shot-time');
  cb.checked = false;
  cb.dispatch('change');
  assert.equal(r.state.onCurve, false);
  assert.equal(r.state.flowShown, r.state.flow);
  assert.ok(doc.getElementById('an-chart-facts').innerHTML.includes('konstantem Strom'));
  assert.equal(doc.getElementById('an-shot-facts').innerHTML, '');
  cb.checked = true;
  cb.dispatch('change');
  assert.ok(r.state.flowShown.onCurve);
});

test('Anguss: ein Fächer und vier Anschnitte lassen sich vorschlagen, dann wieder zwei', () => {
  const r = W.stages.anguss;
  r.propose(1, false);
  assert.equal(Object.values(r.state.graph.nodes).filter(n => n.type === 'gate').length, 1);
  assert.equal(Object.values(r.state.graph.nodes).find(n => n.type === 'gate').gate.transition, 'faecher');
  r.propose(4, false);
  const gates4 = Object.values(r.state.graph.nodes).filter(n => n.type === 'gate');
  assert.equal(gates4.length, 4);
  assert.ok(gates4.every(n => Math.abs(n.pos[1] - W.ctx.part.model.bounds.min[1]) < 2), 'alle vier an der Kante');
  const xs = gates4.map(n => n.pos[0]).sort((a, b) => a - b);
  assert.ok(xs[0] < xs[1] && xs[1] < 0 && 0 < xs[2] && xs[2] < xs[3], 'symmetrisch um die Mitte');
  r.propose(2, false);
  assert.equal(Object.values(r.state.graph.nodes).filter(n => n.type === 'gate').length, 2);
});

test('Füllung: die Anschnitte sind die Mündungen des Angusses', () => {
  /* Gröber als der Vorschlag (halbe Wanddicke): das Feld ist hier Mittel, nicht Gegenstand. */
  assert.equal(W.field.setCell(5), 5);
  assert.equal(doc.getElementById('bt-cell-h').value, '2,5', 'die Zellkante kam aus der Wanddicke');
  W.activate('fuellung');
  const f = W.stages.fuellung;
  const items = Object.values(f.state.plan.items);
  assert.equal(items.length, 2);
  const gates = Object.values(W.stages.anguss.state.graph.nodes).filter(n => n.type === 'gate');
  for (const it of items) {
    const n = gates.find(x => x.id === it.id);
    assert.ok(n, 'Anschnitt ' + it.id + ' gehört zum Anguss');
    assert.deepEqual(it.pos, n.pos);
    assert.equal(it.w, n.gate.w);
    assert.equal(it.h, n.gate.h);
    assert.ok(it.n[1] < -0.9, 'Normale nach außen (−Y): ' + it.n);
    assert.ok(Math.abs(it.share - 50) < 5, 'Anteil aus der Strömung: ' + it.share);
    assert.ok(it.bound);
  }
  assert.ok(doc.getElementById('fu-inlet-facts').innerHTML.includes('k5'), 'Anschnitte in der Seitenleiste');
});

test('Füllung: das gemeinsame Feld wird gerechnet und die Front läuft', async () => {
  const f = W.stages.fuellung;
  await until(() => f.state.result && !f.state.stale && !f.state.computing, 4000, 'Füllung');
  assert.ok(W.ctx.field.data, 'das Abstandsfeld liegt vor');
  assert.ok(W.ctx.field.data.band >= 30, 'breit genug für die Abstandsfläche der Temperierung: ' + W.ctx.field.data.band);
  assert.equal(f.state.field, W.ctx.field.data, 'die Füllung rechnet auf dem gemeinsamen Feld');
  const r = f.state.result;
  assert.equal(r.stats.inlets.length, 2);
  assert.ok(r.stats.inlets.every(i => i.seeds > 1), 'jeder Anschnitt trifft Rasterzellen');
  assert.ok(r.stats.maxPath > 100, 'Fließweg gemessen');
  assert.ok(f.state.spots.list.length > 0, 'zuletzt gefüllte Stellen gefunden');
  assert.ok(doc.getElementById('fu-result-facts').innerHTML.includes('Fließweg'));
});

test('Überläufe: ein Element am Bauteil vergrößert das Gussvolumen des Angusses', () => {
  W.activate('ueberlauf');
  const v = W.stages.ueberlauf;
  const r = W.stages.anguss;
  const before = r.state.proc.volume;
  assert.ok(v.state.active);
  assert.equal(Object.keys(v.state.plan.items).length, 0, 'noch kein Überlauf');
  /* Der Klick auf die Wand braucht einen Renderer — hier kommt das
     Element über die Plandatei, wie ein Klick auf +X am Deckelrand. */
  const b = W.ctx.part.model.bounds;
  v.fromJSON({ format: 'dielogic-luft', version: 3,
    items: [{ id: 'l1', type: 'bohne', pos: [b.max[0], 0, -30], dir: [1, 0, 0], rot: 0, p: {} }] });
  assert.equal(Object.keys(v.state.plan.items).length, 1);
  assert.ok(v.volume() > 1000, 'die Bohne hat ein Volumen: ' + v.volume());
  assert.ok(r.state.proc.volume > before, 'das Gussvolumen des Angusses ist gewachsen: ' + before + ' → ' + r.state.proc.volume);
  assert.ok(Math.abs(r.state.proc.volume - (W.ctx.part.model.volume + v.volume()) / 1000) < 0.2, 'Bauteil + Überläufe');
  assert.ok(doc.getElementById('ue-plan-facts').innerHTML.includes('Gesamt'));
});

test('Temperierung: die Abstandsfläche kommt aus dem gemeinsamen Feld', async () => {
  W.activate('temperier');
  const t = W.stages.temperier;
  await until(() => t.state.shellDist === 20 && !t.state.computing, 2400, 'Abstandsfläche');
  assert.equal(t.state.field, W.ctx.field.data, 'dasselbe Feld wie die Füllung');
  assert.ok(t.shellMesh.geometry.attributes.position.count > 100, 'die Fläche hat Dreiecke');
  assert.equal(doc.getElementById('te-add-stich').disabled, false, 'Setzen ist freigegeben');
  t.runAuto();
  const items = Object.values(t.state.plan.items);
  assert.ok(items.length >= 4, 'die Automatik hat Kühlstiche gesetzt: ' + items.length);
  assert.ok(items.every(i => i.auto && i.type === 'stich'));
});

test('Auslegung: Massen, Anschnitt, Wandstärke und Sprengfläche aus dem Modell', () => {
  const d = W.stages.auslegung;
  const vals = d.measure();
  const part = W.ctx.part.model;
  const rho = d.values().densitySolid / Math.pow(1 + d.values().shrink / 100, 3);
  assert.ok(Math.abs(vals.part - part.volume * 1e-9 * rho) < 0.01, 'Bauteilgewicht = Volumen × ρ_sol: ' + vals.part);
  assert.ok(vals.runner > 0.2 && vals.runner < 5, 'Angussgewicht plausibel: ' + vals.runner);
  assert.ok(vals.biscuit > 0.1, 'Pressrestgewicht: ' + vals.biscuit);
  assert.ok(vals.overflow > 0, 'Überlaufgewicht aus dem Plan: ' + vals.overflow);
  assert.ok(Math.abs(vals.gate - W.stages.anguss.state.flow.gateArea) < 1, 'Anschnittfläche aus der Strömung');
  assert.equal(vals.gateTh, W.stages.anguss.state.graph.gateH);
  assert.ok(Math.abs(vals.wall - 2 * part.volume / part.totalArea) < 0.02, 'Wandstärke 2V/A');
  assert.ok(vals.wallMax > vals.wall, 'dickste Stelle aus dem Feld');
  /* Sprengfläche: mindestens die Grundfläche des Deckels, höchstens die Bounding-Box aller Körper. */
  const b = part.bounds;
  const bbox = b.size[0] * b.size[1] * 1e-6;
  assert.ok(vals.area > 0.6 * bbox && vals.area < 1.5 * bbox, 'Sprengfläche in der Größenordnung der Grundfläche: ' + vals.area + ' m² zu ' + bbox);
});

test('Auslegung: Übernehmen schreibt die angehakten Werte in den Auslegungszustand', async () => {
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

test('Anguss: Prozess aus der Auslegung — Legierung nach Dichte, Zielgeschwindigkeit aus dem Band', () => {
  const r = W.stages.anguss;
  doc.getElementById('an-from-design').dispatch('click');
  assert.equal(r.state.proc.alloy, 'al');
  const v = W.stages.auslegung.values();
  assert.equal(r.state.proc.vGate, Math.round((v.gateMin + v.gateMax) / 2));
});

test('Werkbank-Datei: alle Pläne hin und zurück', async () => {
  const json = W.toJSON();
  assert.equal(json.format, 'dielogic-werkbank');
  assert.equal(json.prozess.onCurve, true, 'die Kurvenwahl steht in der Datei');
  assert.equal(json.part.demo, 'gearbox_cover');
  assert.equal(json.anguss.format, 'dielogic-anguss');
  assert.equal(json.luft.items.length, 1);
  assert.ok(json.temperier.items.length >= 4);
  assert.equal(json.prozess.alloy, 'al');
  const text = JSON.stringify(json);
  /* Alles leeren, dann laden. */
  W.stages.ueberlauf.fromJSON({ format: 'dielogic-luft', version: 3, items: [] });
  W.stages.temperier.fromJSON({ format: 'dielogic-temperier', version: 1, items: [] });
  W.stages.anguss.propose(1, false);
  assert.equal(Object.keys(W.stages.ueberlauf.state.plan.items).length, 0);
  await W.loadWerkbank(JSON.parse(text));
  assert.equal(Object.values(W.stages.anguss.state.graph.nodes).filter(n => n.type === 'gate').length, 2, 'der Anguss ist zurück');
  assert.equal(Object.keys(W.stages.ueberlauf.state.plan.items).length, 1, 'die Überläufe sind zurück');
  assert.ok(Object.keys(W.stages.temperier.state.plan.items).length >= 4, 'die Temperierung ist zurück');
  /* Eine fremde Kennung wird abgewiesen, eine Plandatei geht an ihren Schritt. */
  assert.throws(() => W.loadJSON({ format: 'dielogic-irgendwas' }), /unbekannte Kennung/);
  W.loadJSON({ format: 'dielogic-luft', version: 3, items: [] });
  assert.equal(W.ctx.active, 'ueberlauf');
  assert.equal(Object.keys(W.stages.ueberlauf.state.plan.items).length, 0);
});

test('Ein anderes Bauteil: neuer Vorschlag, leere Pläne, Feld weg', async () => {
  const wanted = doc.getElementById('an-propose');
  wanted.value = '2';
  wanted.dispatch('change');
  const sel = doc.getElementById('demo-select');
  sel.value = 'u_channel_ribbed';
  await W.source.pickDemo('u_channel_ribbed');
  await until(() => W.ctx.ready && W.ctx.part.name === 'U-Profil mit Rippen', 1200, 'U-Profil geladen');
  assert.equal(W.ctx.field.data, null, 'das Feld gehört zum alten Teil');
  const r = W.stages.anguss;
  const b = W.ctx.part.model.bounds;
  const gates = Object.values(r.state.graph.nodes).filter(n => n.type === 'gate');
  assert.equal(gates.length, 2, 'der Vorschlag ist neu');
  assert.ok(gates.every(n => Math.abs(n.pos[1] - b.min[1]) < 2), 'an der Kante des neuen Teils');
  assert.equal(Object.keys(W.stages.ueberlauf.state.plan.items).length, 0, 'Überläufe geleert');
  assert.equal(Object.keys(W.stages.temperier.state.plan.items).length, 0, 'Temperierung geleert');
});
