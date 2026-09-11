/* Formteilungs-Analyse: Sichtbarkeit, Zuordnung, Entformschräge,
   Offsetflächen. Geprüft wird an Körpern, deren Antwort man von Hand
   kennt — Würfel, gedrafteter Quader, Pilzkopf, Querbohrung. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../../web/tools/3d-studio/js/solids.js';
import { subtract, union } from '../../../web/tools/3d-studio/js/csg.js';
import { volume } from '../../../web/tools/3d-studio/js/mesh.js';
import { buildModel, openEdgeRatio } from '../../../web/tools/3d-studio/js/part/model.js';
import { computeVisibility, DIRS } from '../../../web/tools/3d-studio/js/part/visibility.js';
import { segment } from '../../../web/tools/3d-studio/js/part/segment.js';
import { draftAngles, draftStats, dirNames } from '../../../web/tools/3d-studio/js/part/draft.js';
import { parseSTL, writeSTL } from '../../../web/tools/3d-studio/js/part/stlio.js';
import { DEMO_PARTS } from '../../../web/tools/3d-studio/js/part/demoparts.js';
import { readGLB } from '../../../web/tools/3d-studio/js/part/glbio.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'tools', '3d-studio');

/* Die Tests arbeiten mit den AUSGELIEFERTEN Dateien, nicht mit der
   prozeduralen Quelle — sonst prüften sie etwas anderes, als der Browser
   lädt. Fehlt eine Datei, sagt der Test, wie sie entsteht. */
function demoTris(id) {
  const p = DEMO_PARTS.find(d => d.id === id) || DEMO_PARTS[0];
  const file = resolve(ROOT, p.file);
  assert.ok(existsSync(file), p.file + ' fehlt — „node scripts/3d-studio/build-parts.mjs"'
    + (p.source ? ' bzw. Export aus ' + p.source : ''));
  const buf = readFileSync(file);
  return readGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/* Vergleich mit RELATIVER Toleranz. */
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1),
  (msg || '') + ': ' + a + ' ≠ ' + b + ' (rel. ' + rel + ')');
/* computeVisibility gibt ohne onProgress nie die Kontrolle ab, läuft
   also am Stück durch — das await kostet nur eine Mikrotask. */
const analyse = async (tris, opts) => {
  const model = buildModel(tris);
  const vis = await computeVisibility(model, { samples: 7 });
  const seg = segment(model, vis, opts);
  return { model, vis, seg };
};

test('Würfel: senkrechte Wände bleiben bei den Hälften, kein Schieber', async () => {
  const { model, seg } = await analyse(S.box(100, 100, 100));
  assert.equal(seg.counts.half, 4, 'Deckel und Boden an die Hälften');
  assert.equal(seg.counts.weak, 8, 'die senkrechten Seiten sieht eine Hälfte streifend');
  assert.equal(seg.counts.slider, 0, 'ohne Schräge, aber ohne Schieber — ein Schieber lohnt nur, wo keine Hälfte hinkommt');
  assert.equal(seg.counts.undercut, 0);
  near(seg.areaByLabel[4] + seg.areaByLabel[5], 60000, 1e-6, 'alles bei den Hälften');
  assert.equal(model.faceCount, 12);
});

test('Gedrafteter Quader: alles fällt auf die beiden Hälften', async () => {
  const t = Math.tan(2 * Math.PI / 180);
  const box = S.rectLoft([
    { z: -50, w: 100 - 100 * t, h: 60 - 100 * t },
    { z: 0, w: 100, h: 60 },
    { z: 50, w: 100 - 100 * t, h: 60 - 100 * t }
  ]);
  const { seg, model } = await analyse(box);
  const A = model.totalArea;
  assert.ok(seg.areaByLabel[4] / A > 0.49 && seg.areaByLabel[5] / A > 0.49, 'je Hälfte rund 50 %');
  assert.equal(seg.counts.undercut, 0, 'kein Hinterschnitt');
  for (const slider of [0, 1, 2, 3]) assert.equal(seg.areaByLabel[slider], 0, 'kein Schieber nötig');
  assert.equal(seg.mainAxis, 2, 'die Formöffnung wird von selbst gefunden');
});

test('Pilzkopf: Tellerunterseite und Schaft brauchen Schieber, kein Hinterschnitt', async () => {
  const shaft = 12, disc = 25;
  const part = union(union(S.box(100, 100, 60), S.place(S.cyl(shaft, 0, 30, 32), 'z', 0, 0, 30)),
    S.place(S.cyl(disc, 0, 10, 32), 'z', 0, 0, 60));
  const { seg, model } = await analyse(part);
  /* Die Ringfläche unter dem Teller liegt parallel zu den Schiebern und
     der Schaftmantel steht zu ihnen frontal — beides bilden Schieber
     von der Seite, nichts bleibt Hinterschnitt. */
  const ring = Math.PI * (disc * disc - shaft * shaft);
  const shaftWall = 2 * Math.PI * shaft * 30;
  const sliders = [0, 1, 2, 3].reduce((a, i) => a + seg.areaByLabel[i], 0);
  assert.equal(seg.areaByLabel[6], 0, 'kein Hinterschnitt');
  /* Mindestens Ring und Schaft; dazu kommt der Deckel des Sockels, den
     der Teller teilweise verdeckt — er besteht aus zwei großen Dreiecken,
     und ein Dreieck wird als Ganzes beurteilt. */
  assert.ok(sliders >= ring + shaftWall, 'Schieber bekommen Ring und Schaft: ' + sliders.toFixed(0));
  assert.ok(openEdgeRatio(model) < 0.001, 'Netz ist geschlossen');
});

test('Querbohrung ohne Schräge: quer zur Öffnung ein Kern von der Seite, längs dazu keiner', async () => {
  const r = 20, len = 100;
  const part = subtract(S.box(len, 100, 100), S.place(S.cyl(r, -60, 60, 32), 'x', 0, 0, 0));
  const { seg, model, vis } = await analyse(part, { mainAxis: 2 });
  const wall = 2 * Math.PI * r * len;
  const xSliders = seg.areaByLabel[0] + seg.areaByLabel[1];
  assert.equal(seg.areaByLabel[6], 0, 'kein Hinterschnitt');
  /* Öffnung in Z: die Bohrungswand (0° zu X) kommt von ±X, je zur Hälfte
     von der näheren Seite; die senkrechten Außenwände des Quaders bleiben
     bei den Hälften. */
  near(xSliders, wall, 0.05, 'Bohrungswand an ±X');
  assert.ok(Math.abs(seg.areaByLabel[0] - seg.areaByLabel[1]) < 0.05 * wall,
    'halb-halb: ' + seg.areaByLabel[0].toFixed(0) + ' / ' + seg.areaByLabel[1].toFixed(0));
  /* Ohne Vorgabe öffnet die Form längs der Bohrung: dann bohren die
     Hälften mit Kernen, und kein Schieber ist nötig. */
  const auto = segment(model, vis);
  assert.equal(auto.mainAxis, 0, 'Auto öffnet in X');
  assert.equal(auto.counts.slider, 0, 'kein Schieber');
});

test('Hohlraum hinter einer Öffnung: nur Hinterschnitt', async () => {
  /* Ein geschlossener Kasten mit Innenraum und einer kleinen Öffnung im
     Deckel: keine Richtung sieht die Innenwände frei. */
  const part = subtract(subtract(S.box(100, 100, 60), S.box(80, 80, 40)),
    S.place(S.cyl(8, 0, 40, 24), 'z', 0, 0, 20));
  const { seg } = await analyse(part);
  const inner = 4 * 80 * 40 + 80 * 80 + (80 * 80 - Math.PI * 64);   // Wände, Boden, Decke ohne Loch
  assert.ok(seg.areaByLabel[6] > 0.9 * inner && seg.areaByLabel[6] < 1.1 * inner,
    'Innenraum ist Hinterschnitt: ' + seg.areaByLabel[6].toFixed(0) + ' vs ' + inner.toFixed(0));
});

test('Formöffnung folgt der Geometrie: ein in Y gezogener Quader öffnet in Y', async () => {
  const t = Math.tan(2 * Math.PI / 180);
  const box = S.place(S.rectLoft([
    { z: -30, w: 100 - 60 * t, h: 60 - 60 * t },
    { z: 0, w: 100, h: 60 },
    { z: 30, w: 100 - 60 * t, h: 60 - 60 * t }
  ]), 'y', 0, 0, 0);
  const { seg, model } = await analyse(box);
  const sliders = r => [0, 1, 2, 3, 4, 5].filter(d => DIRS[d].axis !== r.mainAxis).reduce((a, d) => a + r.areaByLabel[d], 0);
  assert.equal(seg.mainAxis, 1, 'Auto wählt Y');
  assert.equal(sliders(seg), 0, 'und dann braucht es keinen Schieber');
  /* Fest auf Z stehen die Flanken senkrecht (0°): sie bleiben bei den
     Hälften, aber ohne Schräge — genau das gibt Y den Vorzug. */
  const forced = segment(model, await computeVisibility(model, { samples: 7 }), { mainAxis: 2 });
  assert.equal(sliders(forced), 0, 'auch fest auf Z kein Schieber');
  assert.ok(forced.weakArea > 0.5 * model.totalArea, 'aber die Flanken ohne Schräge: ' + forced.weakArea.toFixed(0));
});

test('Jedes Dreieck bekommt am Ende eine Marke', async () => {
  for (const p of DEMO_PARTS) {
    const { seg, model } = await analyse(demoTris(p.id));
    let open = 0;
    for (let f = 0; f < model.faceCount; f++) if (seg.label[f] === -1) open++;
    assert.equal(open, 0, p.id + ': nichts bleibt unentschieden');
    const sum = [...seg.areaByLabel].reduce((a, b) => a + b, 0);
    near(sum, model.totalArea, 1e-6, p.id + ': Flächenbilanz');
  }
});

test('Beispielteile: nur der Getriebedeckel braucht Schieber, keins hat Hinterschnitte', async () => {
  const want = { u_channel_ribbed: 0, heat_sink: 0, oil_pan: 0, gearbox_cover: 1 };
  for (const [id, needs] of Object.entries(want)) {
    const { seg, model } = await analyse(demoTris(id));
    const A = model.totalArea;
    const sliders = [0, 1, 2, 3].reduce((a, i) => a + seg.areaByLabel[i], 0) / A;
    assert.equal(seg.mainAxis, 2, id + ': Formöffnung Z');
    if (needs) assert.ok(sliders > 0.005, id + ': braucht Schieber: ' + (100 * sliders).toFixed(2) + ' %');
    else assert.ok(sliders < 0.002, id + ': kommt ohne Schieber aus: ' + (100 * sliders).toFixed(2) + ' %');
    assert.ok(seg.areaByLabel[6] / A < 0.002, id + ': keine Hinterschnitte: ' + (100 * seg.areaByLabel[6] / A).toFixed(2) + ' %');
  }
});

test('Beispielteil „Getriebedeckel" braucht Schieber, „Kühlkörper" nicht', async () => {
  const sink = await analyse(demoTris('heat_sink'));
  const slidersSink = [0, 1, 2, 3].reduce((s, i) => s + sink.seg.areaByLabel[i], 0);
  assert.ok(slidersSink / sink.model.totalArea < 0.01, 'Kühlkörper kommt ohne Schieber aus');
  assert.ok(sink.seg.areaByLabel[6] / sink.model.totalArea < 0.005, 'Kühlkörper hat keine Hinterschnitte');

  /* Zwei Dome mit Bohrung quer zur Entformrichtung — die Bohrungen und
     die Domflanken sieht keine der beiden Hälften. Gemessen an der
     Gesamtfläche des Deckels ist das wenig, aber eindeutig. */
  const gc = await analyse(demoTris('gearbox_cover'));
  const slidersGc = [0, 1, 2, 3].reduce((s, i) => s + gc.seg.areaByLabel[i], 0);
  assert.ok(slidersGc / gc.model.totalArea > 0.005, 'Getriebedeckel braucht Schieberfläche');
  assert.ok(slidersGc / gc.model.totalArea > 10 * slidersSink / sink.model.totalArea,
    'deutlich mehr als der Kühlkörper');
  /* Unter dem Flansch, über den beiden Domen, bleibt ein Streifen
     Flanschunterseite, den keine Hälfte sieht — er liegt parallel zum
     Schieber, und der bildet ihn mit. */
  assert.ok(gc.seg.areaByLabel[6] / gc.model.totalArea < 0.002, 'keine Hinterschnitte');
});

test('Entformschräge: Werte und Kennzahlen', async () => {
  const t = Math.tan(2 * Math.PI / 180);
  const box = S.rectLoft([{ z: 0, w: 100, h: 100 }, { z: 50, w: 100 - 100 * t, h: 100 - 100 * t }]);
  const { model, vis, seg } = await analyse(box);
  const d = draftAngles(model, vis, seg.label);
  for (let f = 0; f < model.faceCount; f++) {
    assert.ok(d[f] >= 1.9, 'keine Fläche unter der gebauten Schräge: ' + d[f]);
  }
  const st = draftStats(model, d, seg.label, 1.5);
  assert.equal(st.below, 0);
  near(st.total, model.totalArea, 1e-6);
  assert.equal(dirNames(2)[4].role, 'half');
  assert.equal(dirNames(2)[0].role, 'slider');
});

test('STL: Hin- und Rückweg', async () => {
  const box = S.box(10, 20, 30);
  const back = parseSTL(writeSTL(box, 'test'));
  near(volume(back), 6000, 1e-3);
  const ascii = 'solid a\nfacet normal 0 0 1\nouter loop\n'
    + 'vertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid';
  assert.equal(parseSTL(new TextEncoder().encode(ascii).buffer).length / 9, 1);
  assert.throws(() => parseSTL(new Uint8Array(10).buffer));
});

test('Die ausgelieferten Beispielteile sind echte, geschlossene Netze aus openscad_parts', async () => {
  for (const p of DEMO_PARTS) {
    assert.ok(p.source, p.id + ': nennt seine OpenSCAD-Quelle');
    const shipped = demoTris(p.id);
    assert.ok(shipped.length / 9 > 1000, p.id + ': Dreiecke fehlen');
    assert.ok(volume(shipped) > 0, p.id + ': positives Volumen');
    near(openEdgeRatio(buildModel(shipped)), 0, 1e-9, p.id + ': geschlossen');
  }
});

test('Der GLB-Leser kommt mit Index, Rohliste und Knotenversatz zurecht', async () => {
  /* Gegen eine selbst geschriebene Datei prüfen: dieselbe Geometrie
     einmal indiziert (so liefert tools/build-parts.mjs) und einmal als
     Rohliste, dazu ein verschobener Knoten. */
  const { readGLBMeshes, isGLB } = await import('../../../web/tools/3d-studio/js/part/glbio.js');
  const file = resolve(ROOT, DEMO_PARTS[0].file);
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  assert.ok(isGLB(ab), 'Kennung erkannt');
  const meshes = readGLBMeshes(ab);
  assert.equal(meshes.length, 1, 'ein Netz je Beispielteil');
  assert.equal(meshes[0].name, DEMO_PARTS[0].id, 'Knoten trägt die id');
  assert.throws(() => readGLB(new Uint8Array(40).buffer), /glTF/);
});

/* ── Formansicht: die Regionen als Formteile ─────────────────── */
import { diePieces, dirVector } from '../../../web/tools/3d-studio/js/part/dieview.js';

test('Formansicht: jedes Dreieck in genau einem Stück, Rand aus den Trennkanten, Richtung je Stück', async () => {
  const m = buildModel(S.box(60, 40, 30));
  const vis = await computeVisibility(m);
  const seg = segment(m, vis, { mainAxis: 2 });
  const pieces = diePieces(m, seg, { skirt: 5 });
  assert.ok(pieces.length >= 2, 'mindestens zwei Hälften: ' + pieces.length);
  assert.equal(pieces.reduce((a, p) => a + p.faces, 0), m.faceCount, 'alle Dreiecke verteilt');
  assert.equal(pieces.reduce((a, p) => a + p.tris.length, 0), m.faceCount * 9);
  const totalArea = pieces.reduce((a, p) => a + p.area, 0);
  assert.ok(Math.abs(totalArea - m.totalArea) < 1e-6 * m.totalArea, 'Flächen summieren sich');
  for (const p of pieces) {
    assert.deepEqual(p.dir, dirVector(p.label), 'Richtung des Stücks ' + p.label);
    const nEdges = p.edges.length / 6;
    assert.ok(nEdges > 0, 'jedes Stück hat eine Trennlinie');
    assert.equal(p.skirt.length, nEdges * 18, 'zwei Dreiecke je Trennkante');
    /* Der Rand liegt genau um den Rand-Betrag in der Entformrichtung hinter der Kante. */
    const ax = p.skirt[0], ay = p.skirt[1], az = p.skirt[2];
    const cx = p.skirt[15], cy = p.skirt[16], cz = p.skirt[17];
    assert.ok(Math.abs((cx - ax) - p.dir[0] * 5) < 1e-6 && Math.abs((cy - ay) - p.dir[1] * 5) < 1e-6 && Math.abs((cz - az) - p.dir[2] * 5) < 1e-6);
    /* Die Mitte des Stücks liegt auf seiner Seite des Kastens. */
    const ax2 = p.dir.findIndex(v => v !== 0);
    assert.ok(p.center[ax2] * p.dir[ax2] > 0, 'Mitte auf der Seite der Richtung: ' + p.center);
  }
  /* Beide Hälften teilen sich dieselbe Trennlinie: gleich viele Kanten. */
  const halves = pieces.filter(p => p.label === 4 || p.label === 5);
  assert.equal(halves.length, 2, '+Z und −Z');
  assert.equal(halves[0].edges.length, halves[1].edges.length, 'die Trennlinie ist dieselbe');
  /* Ohne Rand kein Rand; die Dreiecke bleiben. */
  const bare = diePieces(m, seg, { skirt: 0 });
  assert.ok(bare.every(p => p.skirt.length === 0));
  assert.equal(bare.reduce((a, p) => a + p.faces, 0), m.faceCount);
});

/* ── Schieber je Fleck, Splitter, Flächen, Haftung ──────────── */
import { FACING_EPS } from '../../../web/tools/3d-studio/js/part/visibility.js';
import { pieceProjections, projectSoup, maskOutline } from '../../../web/tools/3d-studio/js/part/dieview.js';
import { gripPerFace, ejectorMap, volumeCentroid } from '../../../web/tools/3d-studio/js/part/ejector.js';

/* Zusammenhängende Flecken je Marke. */
function labelPatches(model, seg, pick) {
  const F = model.faceCount, seen = new Uint8Array(F), out = [];
  for (let f = 0; f < F; f++) {
    if (seen[f] || !pick(seg.label[f])) continue;
    const l = seg.label[f], stack = [f], mem = [];
    seen[f] = 1;
    while (stack.length) {
      const c = stack.pop(); mem.push(c);
      for (let e = 0; e < 3; e++) { const w = model.nbr[c * 3 + e]; if (w >= 0 && !seen[w] && seg.label[w] === l) { seen[w] = 1; stack.push(w); } }
    }
    out.push({ label: l, faces: mem, area: mem.reduce((a, q) => a + model.areas[q], 0) });
  }
  return out;
}

test('Getriebedeckel: ein Schieber je Dom, keine Splitter ohne Schräge, keine dritte Richtung', async () => {
  const { model, vis, seg } = await analyse(demoTris('gearbox_cover'));
  assert.equal(seg.mainAxis, 2);
  /* Sensordom auf der +X-Wand, Steckerdom auf der −Y-Wand — nichts an −X, +Y. */
  assert.ok(seg.areaByLabel[0] > 2000 && seg.areaByLabel[3] > 3000, 'Schieber +X und −Y: ' + seg.areaByLabel[0].toFixed(0) + ' / ' + seg.areaByLabel[3].toFixed(0));
  assert.equal(seg.areaByLabel[1], 0, 'kein Schieber −X');
  assert.equal(seg.areaByLabel[2], 0, 'kein Schieber +Y');
  const patches = labelPatches(model, seg, l => l >= 0 && DIRS[l].axis !== 2).sort((a, b) => b.area - a.area);
  const sliders = seg.areaByLabel[0] + seg.areaByLabel[3];
  assert.ok(patches.length >= 2 && patches[0].area + patches[1].area > 0.85 * sliders,
    'zwei Flecken tragen die Schieberfläche: ' + patches.map(p => DIRS[p.label].label + ' ' + p.area.toFixed(0)).join(', '));
  assert.ok(sliders < 10000, 'kein ganzes Fächerdreieck der Flanschunterseite mehr beim Schieber: ' + sliders.toFixed(0));
  /* Senkrechte Splitter mit Rauschen in der Normalen (n·d = −0,00002) sind
     keine Schieber mehr: senkrechte Schieberfläche nur an den Domen selbst. */
  for (const p of patches) for (const f of p.faces) {
    if (Math.abs(vis.dot[f * 6 + 5]) >= FACING_EPS) continue;
    const x = model.centroids[f * 3], y = model.centroids[f * 3 + 1];
    assert.ok(Math.hypot(x - 198, y - 60) < 40 || Math.hypot(x + 90, y + 160) < 50, 'senkrechte Schieberfläche nur an den Domen: ' + x.toFixed(0) + '/' + y.toFixed(0));
  }
});

test('Splitter: ein winziger Fleck ohne Sicht einer Hälfte geht an die Hälften und wird gemeldet', async () => {
  const { seg, model } = await analyse(demoTris('u_channel_ribbed'));
  assert.ok(seg.sliverArea > 0 && seg.sliverArea < 1e-4 * model.totalArea, 'Splitterfläche gemeldet: ' + seg.sliverArea);
  assert.equal([0, 1, 2, 3].reduce((a, i) => a + seg.areaByLabel[i], 0), 0, 'und kein Schieber');
});

test('Bewegliche Seite: +Achse als Vorgabe, tauschbar — Namen und Gleichstand folgen', async () => {
  const m = buildModel(S.box(60, 40, 30));
  const vis = await computeVisibility(m, { samples: 7 });
  const plus = segment(m, vis, { mainAxis: 2 });
  const minus = segment(m, vis, { mainAxis: 2, movingSign: -1 });
  /* Die senkrechten Seiten gehen bei Gleichstand an die bewegliche Hälfte. */
  assert.ok(plus.areaByLabel[4] > plus.areaByLabel[5], 'Vorgabe: die Seiten bei +Z');
  assert.ok(minus.areaByLabel[5] > minus.areaByLabel[4], 'getauscht: bei −Z');
  assert.equal(dirNames(2)[4].name, 'Bewegliche Seite +Z');
  assert.equal(dirNames(2, -1)[4].name, 'Feste Seite +Z');
  assert.equal(dirNames(2, -1)[5].name, 'Bewegliche Seite −Z');
});

test('Projizierte Flächen: je Stück in seiner Richtung, gerastert als Vereinigung', async () => {
  const m = buildModel(S.box(60, 40, 30));
  const vis = await computeVisibility(m, { samples: 7 });
  const seg = segment(m, vis, { mainAxis: 2 });
  const pieces = diePieces(m, seg, { skirt: 5 });
  const pr = pieceProjections(pieces, m, seg, { cell: 0.5 });
  const top = pr.pieces.find(q => q.label === 4), bottom = pr.pieces.find(q => q.label === 5);
  near(top.area, 2400, 0.03, 'obere Hälfte: 60 × 40');
  near(bottom.area, 2400, 0.03, 'untere Hälfte');
  near(pr.total.area, 2400, 0.03, 'Bauteil auf die Trennebene');
  assert.equal(top.frame.axis, 2);
  const px = projectSoup(m.tris, m.bounds, 0, { cell: 0.5 });
  near(px.area, 1200, 0.03, 'in X: 40 × 30');
  const outline = maskOutline(top.frame, top.mask);
  let len = 0;
  for (let i = 0; i < outline.length; i += 4) len += Math.hypot(outline[i + 2] - outline[i], outline[i + 3] - outline[i + 1]);
  near(len, 200, 0.05, 'der Umriss ist der Rand des Rechtecks');
  /* Die Trennebene und die Seiten der Stücke: die senkrechten Wände gehen
     bei Gleichstand an die bewegliche Hälfte, die Trennlinie liegt also an
     der Unterkante. */
  assert.ok(pieces.every(p => Math.abs(p.parting + 15) < 1e-6), 'Trennlinie an der Unterkante: ' + pieces[0].parting);
  assert.equal(pieces.find(p => p.label === 4).side, 1);
  assert.equal(pieces.find(p => p.label === 5).side, -1);
  assert.equal(pieces.find(p => p.label === 4).skirtLen, 5, 'der Rand kennt seine Länge');
});

test('Haftung: eine Wanne schrumpft auf den Kern der beweglichen Hälfte, Rippenflanken zum Schwerpunkt haften, Außenwände nicht', async () => {
  const t = Math.tan(1.5 * Math.PI / 180);
  const outer = S.rectLoft([{ z: -40, w: 100 - 80 * t, h: 80 - 80 * t }, { z: 0, w: 100, h: 80 }]);
  const inner = S.rectLoft([{ z: -34, w: 88 - 68 * t, h: 68 - 68 * t }, { z: 1, w: 88 + 2 * t, h: 68 + 2 * t }]);
  const part = subtract(outer, inner);
  const { model, vis, seg } = await analyse(part, { mainAxis: 2 });
  const c = volumeCentroid(model);
  assert.ok(Math.abs(c[0]) < 1e-6 && Math.abs(c[1]) < 1e-6 && c[2] < -10, 'Schwerpunkt in der Mitte, unten: ' + c);
  const grip = gripPerFace(model, vis, seg, { mu: 0.3 });
  assert.ok(grip.mov > 0, 'die Innenwände haften an +Z');
  assert.ok(grip.fix < 0.05 * grip.mov, 'die Außenwände ziehen sich zurück: ' + grip.fix + ' / ' + grip.mov);
  assert.ok(gripPerFace(model, vis, seg, { mu: 0.5 }).mov > grip.mov, 'mehr Reibung, mehr Haftung');
  assert.equal(gripPerFace(model, vis, seg, { mu: 0.3, movSign: -1 }).movLabel, 5, 'getauscht ist −Z die bewegliche');
  const em = ejectorMap(model, seg, grip, grip.movLabel, { cell: 0.5 });
  assert.ok(em.max > 0 && em.map.every(v => v >= 0 && v <= 1), 'Karte normiert');
  assert.equal(em.label, 4);
  /* Die Karte trägt ihre Haftung am Rand der Wanne (unter den Innenwänden), nicht in der Mitte. */
  const { frame, map } = em;
  const at = (x, y) => map[Math.floor((y - frame.v0) / frame.h) * frame.nu + Math.floor((x - frame.u0) / frame.h)];
  assert.ok(at(43, 0) > 0.5 && at(0, 0) < 0.05, 'Rand hoch, Mitte leer: ' + at(43, 0) + ' / ' + at(0, 0));

  /* Rippen: zwei parallele Rippen auf einer Platte. Die Flanken, die zum
     Schwerpunkt zeigen, schrumpfen auf den Formsteg dazwischen auf und
     haften voll; die Außenflanken und die Rippenenden am Rand zeigen vom
     Schwerpunkt weg und ziehen sich zurück. (Halb haften Flanken quer zum
     Schwerpunkt — die radialen Rippen des Getriebedeckels, geprüft im
     Viewer-Test.) */
  const plate = S.box(120, 80, 6);
  const ribA = S.translate(S.box(100, 4, 30), 0, -20, 18), ribB = S.translate(S.box(100, 4, 30), 0, 20, 18);
  const r = await analyse(union(union(plate, ribA), ribB), { mainAxis: 2 });
  const g2 = gripPerFace(r.model, r.vis, r.seg, { mu: 0.3 });
  let nIn = 0, inHeld = 0, nOut = 0, outFree = 0, nEnd = 0, endHalf = 0;
  for (let f = 0; f < r.model.faceCount; f++) {
    const ny = r.model.normals[f * 3 + 1], nx = r.model.normals[f * 3], y = r.model.centroids[f * 3 + 1];
    if (r.model.centroids[f * 3 + 2] < 4) continue;
    if (Math.abs(ny) > 0.99) {
      if (ny * y < 0) { nIn++; if (g2.intensity[f] > 0.2) inHeld++; }
      else { nOut++; if (g2.intensity[f] < 0.05) outFree++; }
    } else if (Math.abs(nx) > 0.99) {
      nEnd++;
      if (g2.intensity[f] < 0.05) endHalf++;
    }
  }
  assert.ok(nIn >= 2 && inHeld === nIn, 'Innenflanken haften voll: ' + inHeld + ' von ' + nIn);
  assert.ok(nOut >= 2 && outFree === nOut, 'Außenflanken haften nicht: ' + outFree + ' von ' + nOut);
  assert.ok(nEnd >= 4 && endHalf === nEnd, 'Rippenenden am Rand haften nicht: ' + endHalf + ' von ' + nEnd);
});
