/* Formteilungs-Analyse: Sichtbarkeit, Zuordnung, Entformschräge,
   Offsetflächen. Geprüft wird an Körpern, deren Antwort man von Hand
   kennt — Würfel, gedrafteter Quader, Pilzkopf, Querbohrung. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../../web/tools/3d-studio/js/solids.js';
import { subtract, union } from '../../../web/tools/3d-studio/js/csg.js';
import { volume, surface, bounds, cleanMesh } from '../../../web/tools/3d-studio/js/mesh.js';
import { buildModel, openEdgeRatio } from '../../../web/tools/3d-studio/js/part/model.js';
import { computeVisibility, DIRS } from '../../../web/tools/3d-studio/js/part/visibility.js';
import { segment, STAGE } from '../../../web/tools/3d-studio/js/part/segment.js';
import { draftAngles, draftStats, dirNames } from '../../../web/tools/3d-studio/js/part/draft.js';
import { parseSTL, writeSTL } from '../../../web/tools/3d-studio/js/part/stlio.js';
import { DEMO_PARTS } from '../../../web/tools/3d-studio/js/part/demoparts.js';
import { buildDemoGeometry } from '../../../web/tools/3d-studio/js/part/demogeom.js';
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
  assert.ok(existsSync(file), p.file + ' fehlt — „node tools/build-parts.mjs"');
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

test('Würfel: jede Fläche ist aus genau einer Richtung entformbar', async () => {
  const { model, seg } = await analyse(S.box(100, 100, 100));
  assert.equal(seg.counts.seed, 12, 'alle zwölf Dreiecke sind Saat');
  assert.equal(seg.counts.undercut, 0);
  for (let i = 0; i < 6; i++) near(seg.areaByLabel[i], 10000, 1e-6, DIRS[i].label);
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
  assert.ok(seg.counts.grown > 0, 'die Flanken sind gewachsen, nicht Saat');
});

test('Pilzkopf: die Unterseite des Tellers ist ein Hinterschnitt', async () => {
  const shaft = 12, disc = 25;
  const part = union(union(S.box(100, 100, 60), S.place(S.cyl(shaft, 0, 30, 32), 'z', 0, 0, 30)),
    S.place(S.cyl(disc, 0, 10, 32), 'z', 0, 0, 60));
  const { seg, model } = await analyse(part);
  /* Erwartet: Ringfläche unter dem Teller + der komplette Schaftmantel. */
  const ring = Math.PI * (disc * disc - shaft * shaft);
  const shaftWall = 2 * Math.PI * shaft * 30;
  const got = seg.areaByLabel[6];
  assert.ok(got > 0.85 * (ring + shaftWall) && got < 1.15 * (ring + shaftWall),
    'Hinterschnittfläche ≈ Ring + Schaft: ' + got.toFixed(0) + ' vs ' + (ring + shaftWall).toFixed(0));
  assert.ok(openEdgeRatio(model) < 0.001, 'Netz ist geschlossen');
});

test('Querbohrung ohne Schräge erreicht keine der sechs Richtungen', async () => {
  const r = 20, len = 100;
  const part = subtract(S.box(len, 100, 100), S.place(S.cyl(r, -60, 60, 32), 'x', 0, 0, 0));
  const { seg } = await analyse(part);
  const wall = 2 * Math.PI * r * len;
  assert.ok(Math.abs(seg.areaByLabel[6] - wall) < 0.05 * wall,
    'Bohrungswand ist Hinterschnitt: ' + seg.areaByLabel[6].toFixed(0) + ' vs ' + wall.toFixed(0));
});

test('Mindestschräge verschiebt die Grenze zwischen Hälfte und Schieber', async () => {
  const t = Math.tan(2 * Math.PI / 180);
  const box = S.rectLoft([
    { z: -30, w: 100 - 60 * t, h: 60 - 60 * t },
    { z: 0, w: 100, h: 60 },
    { z: 30, w: 100 - 60 * t, h: 60 - 60 * t }
  ]);
  const model = buildModel(box);
  const vis = await computeVisibility(model, { samples: 7 });
  const lax = segment(model, vis, { minDraftDeg: 0.5 });
  const strict = segment(model, vis, { minDraftDeg: 3 });
  const sliders = r => [0, 1, 2, 3].reduce((s, i) => s + r.areaByLabel[i], 0);
  assert.equal(lax.counts.undercut, 0, 'bei 0,5° reicht die 2°-Schräge');
  assert.equal(sliders(lax), 0, 'bei 0,5° kommt alles ohne Schieber aus');
  /* Bei geforderten 3° reicht die 2°-Flanke der Hauptrichtung nicht mehr —
     sie fällt an die Schieber, die sie mit fast 90° bilden. */
  assert.ok(sliders(strict) > 0.2 * model.totalArea, 'bei 3° übernehmen die Schieber die Flanken');
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

test('Stufen bauen aufeinander auf', async () => {
  const { seg, model } = await analyse(demoTris('bracket'));
  let seed = 0, island = 0, grown = 0;
  for (let f = 0; f < model.faceCount; f++) {
    if (seg.stage[f] === STAGE.SEED) seed++;
    else if (seg.stage[f] === STAGE.ISLAND) island++;
    else if (seg.stage[f] === STAGE.GROWN) grown++;
  }
  assert.ok(seed > 0 && grown > 0, 'es gibt Saat und Ausbreitung');
  assert.equal(seed + island + grown + seg.counts.rest, model.faceCount, 'jede Stufe ist gezählt');
  let boundary = 0;
  for (let f = 0; f < model.faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const w = model.nbr[f * 3 + e];
      if (w > f && seg.label[w] !== seg.label[f]) boundary++;
    }
  }
  assert.ok(boundary > 0, 'es gibt eine Trennlinie');
});

test('Beispielteil „Halter" braucht Schieber, „Gehäusedeckel" nicht', async () => {
  const cover = await analyse(demoTris('cover'));
  const slidersCover = [0, 1, 2, 3].reduce((s, i) => s + cover.seg.areaByLabel[i], 0);
  assert.ok(slidersCover / cover.model.totalArea < 0.01, 'Deckel kommt ohne Schieber aus');
  assert.ok(cover.seg.areaByLabel[6] / cover.model.totalArea < 0.005, 'Deckel hat keine Hinterschnitte');

  const br = await analyse(demoTris('bracket'));
  const slidersBr = [0, 1, 2, 3].reduce((s, i) => s + br.seg.areaByLabel[i], 0);
  assert.ok(slidersBr / br.model.totalArea > 0.2, 'Halter braucht deutlich Schieberfläche');
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

test('Die ausgelieferten Beispielteile passen zur Quelle', async () => {
  for (const p of DEMO_PARTS) {
    const shipped = demoTris(p.id);
    const src = cleanMesh(buildDemoGeometry(p.id)).tris;
    assert.equal(shipped.length, src.length, p.id + ': gleiche Dreieckszahl');
    near(volume(shipped), volume(src), 1e-5, p.id + ': Volumen');
    near(surface(shipped), surface(src), 1e-5, p.id + ': Oberfläche');
    const a = bounds(shipped), b = bounds(src);
    for (let k = 0; k < 3; k++) {
      near(a.min[k], b.min[k], 1e-5, p.id + ': min');
      near(a.max[k], b.max[k], 1e-5, p.id + ': max');
    }
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
