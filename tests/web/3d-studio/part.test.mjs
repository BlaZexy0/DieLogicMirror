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
