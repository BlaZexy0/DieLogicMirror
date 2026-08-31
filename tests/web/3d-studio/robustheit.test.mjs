/* Ränder des 3D-Studios (H-20 bis H-25).

   Der Geometriekern ist gut geprüft — die Defekte sitzen an den Rändern:
   Eingabevalidierung, App-Schicht, Lebenszyklus. Genau die deckt diese
   Datei ab.

     node --import ./tests/web/3d-studio/stubs/register.mjs \
          --test tests/web/3d-studio/robustheit.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as S from '../../../web/tools/3d-studio/js/solids.js';
import { orientMesh, weld, volume, refine } from '../../../web/tools/3d-studio/js/mesh.js';
import { buildModel, openEdgeRatio } from '../../../web/tools/3d-studio/js/part/model.js';
import { readGLB } from '../../../web/tools/3d-studio/js/part/glbio.js';
import { buildLocator } from '../../../web/tools/3d-studio/js/part/distance.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'tools', '3d-studio');

/* ── H-21 ─────────────────────────────────────────────────────────────── */

/* Ein GLB nur aus JSON-Block bauen — genug, um den Leser zu prüfen. */
function glbOf(json) {
  const j = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - j.length % 4) % 4;
  const total = 20 + j.length + pad;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length + pad, true); dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf, 20).set(j);
  for (let i = 0; i < pad; i++) new Uint8Array(buf)[20 + j.length + i] = 0x20;
  return buf;
}
const baseGltf = extra => Object.assign({
  asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ count: 36, type: 'VEC3', componentType: 5126 }]
}, extra);

test('komprimiertes GLB wird abgelehnt statt als Nullnetz gelesen (H-21)', () => {
  for (const ext of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression']) {
    assert.throws(
      () => readGLB(glbOf(baseGltf({ extensionsRequired: [ext], extensionsUsed: [ext] }))),
      new RegExp(ext),
      ext + ': muss als Fehler ankommen, nicht als „0 Dreiecke · 0 cm³"');
  }
  /* Sparse-Accessor: die Werte stehen in einem eigenen Block. */
  const sparse = baseGltf({});
  sparse.accessors[0].sparse = { count: 1, indices: {}, values: {} };
  assert.throws(() => readGLB(glbOf(sparse)), /Sparse/);
});

test('ein unkomprimiertes Beispielteil liest sich weiterhin', () => {
  const b = readFileSync(resolve(ROOT, 'assets/parts/bracket.glb'));
  const tris = readGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.ok(tris.length / 9 > 1000, 'Dreiecke fehlen');
  assert.ok(tris.some(v => v !== 0), 'alle Koordinaten null — genau der stille Fehler aus H-21');
});

/* ── H-24 ─────────────────────────────────────────────────────────────── */

/* Jedes zweite Dreieck umdrehen: so kommt eine CAD-STL mit inkonsistenter
   Wicklung an. */
function scramble(tris) {
  const out = Float64Array.from(tris);
  for (let f = 0; f < tris.length / 9; f++) {
    if (f % 2 === 0) continue;
    const o = f * 9;
    for (let a = 0; a < 3; a++) {
      const t = out[o + 3 + a]; out[o + 3 + a] = out[o + 6 + a]; out[o + 6 + a] = t;
    }
  }
  return out;
}

test('inkonsistent gewickeltes Netz wird ausgerichtet, nicht schöngerechnet (H-24)', () => {
  const good = S.box(100, 60, 40);
  const soll = 100 * 60 * 40;

  /* Ohne Reparatur ist der Befund reproduzierbar: Volumen ~0, fast jede
     Kante „offen" (adjacency paart nur gegenläufige Halbkanten). */
  const roh = buildModel(scramble(good), { orient: false });
  assert.ok(Math.abs(roh.volume) < soll * 0.05, 'Vorbedingung: das Volumen hebt sich auf');
  assert.ok(openEdgeRatio(roh) > 0.5, 'Vorbedingung: das Netz gilt als offen');

  const fix = buildModel(scramble(good));
  assert.ok(Math.abs(fix.volume - soll) < 1e-6, `Volumen ${fix.volume} statt ${soll}`);
  assert.equal(openEdgeRatio(fix), 0, 'nach dem Ausrichten ist das Netz geschlossen');
  assert.ok(fix.flippedFaces > 0, 'die Zahl der gewendeten Dreiecke gehört gemeldet');
});

test('nach innen gewendetes Netz bekommt positives Volumen', () => {
  const inner = S.box(20, 20, 20);
  for (let f = 0; f < inner.length / 9; f++) {
    const o = f * 9;
    for (let a = 0; a < 3; a++) {
      const t = inner[o + 3 + a]; inner[o + 3 + a] = inner[o + 6 + a]; inner[o + 6 + a] = t;
    }
  }
  assert.ok(volume(inner) < 0, 'Vorbedingung: Normalen zeigen nach innen');
  assert.ok(Math.abs(buildModel(inner).volume - 8000) < 1e-6);
});

test('sauber gewickelte Netze bleiben unangetastet', () => {
  for (const tris of [S.box(30, 20, 10), S.sphere(15, 3)]) {
    const w = weld(tris);
    const r = orientMesh(tris, w.index);
    assert.equal(r.flipped, 0);
    assert.equal(r.tris, tris, 'ohne Arbeit dieselbe Instanz — keine unnötige Kopie');
  }
});

/* ── H-22 ─────────────────────────────────────────────────────────────── */

test('große Suchgrenze lässt das Beschleunigungsgitter nicht zusammenfallen (H-22)', () => {
  const tris = refine(S.box(352, 686, 12), 8);
  const cells = o => buildLocator(tris, o).dims.reduce((a, b) => a * b, 1);
  const fein = cells({ maxDist: 5 });
  assert.ok(fein > 200, 'Testaufbau: ohne große Suchgrenze ein feines Gitter, ist ' + fein);

  /* Vorher fiel das Gitter proportional zur Suchgrenze zusammen — gemessen
     von 1300 auf 28 Zellen und die Rechnung von 91 ms auf 116 437 ms. */
  for (const maxDist of [100, 300, 1000, 100000]) {
    const n = cells({ maxDist });
    assert.ok(n >= fein / 27,
      `Suchgrenze ${maxDist}: ${n} Zellen gegenüber ${fein} — das Gitter ist zusammengefallen`);
  }
});

/* ── H-23 / H-25 ──────────────────────────────────────────────────────
   Beide sitzen im Ablauf, nicht in der Rechnung: WANN die Größenwarnung
   erscheint und WIE OFT der Strahlentest läuft. Geprüft wird an der
   Quelle — im Node-Prüfstand gibt es weder Bildtakt noch echte Uhr. */

const src = f => readFileSync(resolve(ROOT, f), 'utf8');

test('Größenwarnung steht vor der Aufbereitung, nicht danach (H-23)', () => {
  const s = src('js/part/partsource.js');
  const load = s.slice(s.indexOf('async function load('), s.indexOf('async function pickDemo('));
  const warnAt = load.indexOf('Großes Netz');
  const workAt = load.indexOf('buildModel(');
  assert.ok(warnAt >= 0, 'die Warnung fehlt in load()');
  assert.ok(workAt >= 0, 'buildModel wird nicht in load() aufgerufen');
  assert.ok(warnAt < workAt,
    'die Warnung erschien vorher erst NACH buildModel — also wenn die Wartezeit vorbei war');
});

test('Größenwarnung verdeckt die Mannigfaltigkeitsprüfung nicht mehr (H-23)', () => {
  const s = src('js/part/partsource.js');
  const facts = s.slice(s.indexOf('function showFacts('));
  assert.ok(!/Großes Netz[\s\S]{0,400}?\breturn;/.test(facts),
    'ein großes UND offenes Netz muss beide Hinweise bekommen — vorher brach ein return ab');
  assert.ok(facts.includes('openEdgeRatio'), 'die Mannigfaltigkeitsprüfung fehlt');
});

test('Volumen wird nicht mehr mit Math.abs schöngerechnet (H-24)', () => {
  const s = src('js/part/partsource.js');
  assert.ok(!/Math\.abs\(m\.volume\)/.test(s),
    'der Betrag verdeckte, dass ein invertiertes Netz nach innen zeigt');
});

test('Strahlentest läuft höchstens einmal je Bild (H-25)', () => {
  /* Beide Viewer: die Abstandsseite testet sogar zwei Netze je Ereignis. */
  for (const f of ['js/part/app.js', 'js/part/distanceapp.js']) {
    const s = src(f);
    const at = s.indexOf("addEventListener('pointermove'");
    assert.ok(at > 0, f + ': kein pointermove-Zuhörer gefunden');
    /* Nur der Rumpf des Zuhörers, bis zu seinem eigenen Ende. */
    const body = s.slice(at, s.indexOf('\n});', at));
    assert.ok(!body.includes('intersectObject'),
      f + ': der Strahlentest darf nicht direkt im Zuhörer stehen — 9,7 ms je Ereignis bei 197k Dreiecken');
    assert.ok(body.includes('requestAnimationFrame'), f + ': die Drosselung auf den Bildtakt fehlt');
  }
});
