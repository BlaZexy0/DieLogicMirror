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

test('Hohlteile behalten ihren Hohlraum (Regression der ersten Fassung)', () => {
  /* Die erste Fassung drehte JEDE geschlossene Komponente auf positives
     Volumen — bei einem Hohlteil zählte der Hohlraum damit als Material:
     65000 statt 63000 mm³. Im Druckguss ist das der Normalfall, nicht der
     Sonderfall. Das Gesamtvorzeichen wird deshalb einmal für das ganze Netz
     entschieden, die Schalen behalten ihre Beziehung zueinander. */
  const invert = t => {
    const o = Float64Array.from(t);
    for (let f = 0; f < t.length / 9; f++) {
      const i = f * 9;
      for (let a = 0; a < 3; a++) { const x = o[i + 3 + a]; o[i + 3 + a] = o[i + 6 + a]; o[i + 6 + a] = x; }
    }
    return o;
  };
  const hohl = Float64Array.from([...S.box(40, 40, 40), ...invert(S.box(10, 10, 10))]);
  assert.equal(volume(hohl), 63000, 'Testaufbau: 40³ minus 10³');

  const r = orientMesh(hohl, weld(hohl).index);
  assert.equal(volume(r.tris), 63000, 'der Hohlraum muss vom Volumen abgehen');

  /* Auch ein komplett nach innen gewendetes Hohlteil kommt richtig heraus. */
  const ganzInvertiert = invert(hohl);
  const r2 = orientMesh(ganzInvertiert, weld(ganzInvertiert).index);
  assert.equal(volume(r2.tris), 63000);
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

/* ── Vorzeichenloser Abstand ──────────────────────────────────────────── */

test('innen und außen lassen sich unterscheiden — der Abstand allein nicht', async () => {
  const { buildLocator, closestDistance, isInside, insideFraction } =
    await import('../../../web/tools/3d-studio/js/part/distance.js');
  const loc = buildLocator(S.box(100, 60, 40));      // x ±50, y ±30, z ±20

  /* Genau der Befund: gleicher Abstand, verschiedene Seite. */
  assert.equal(closestDistance(loc, 49, 0, 0).toFixed(6), closestDistance(loc, 51, 0, 0).toFixed(6));
  assert.equal(isInside(loc, 49, 0, 0), true, '1 mm unter der Fläche');
  assert.equal(isInside(loc, 51, 0, 0), false, '1 mm darüber');

  /* Mitte, Ecknähe und weit draußen. Die Mitte trifft die Diagonale der
     Stirnfläche — ohne Versatz zählte der Strahl dort zwei Schnitte und die
     Parität kippte. */
  for (const [p, soll] of [[[0, 0, 0], true], [[0, 29, 0], true], [[0, 31, 0], false],
    [[0, 0, -19], true], [[0, 0, 25], false], [[200, 0, 0], false]]) {
    assert.equal(isInside(loc, ...p), soll, JSON.stringify(p));
  }

  const kugel = buildLocator(S.sphere(20, 3));
  assert.equal(isInside(kugel, 0, 0, 0), true);
  assert.equal(isInside(kugel, 30, 0, 0), false);

  /* Anteil überlappender Punkte — die Seite meldet ihn. */
  const drin = buildModel(S.box(10, 10, 10));
  assert.ok(insideFraction(drin, loc) > 0.99, 'ein Würfel im Quader liegt ganz innen');
  const draussen = buildModel(S.box(10, 10, 10).map((v, i) => (i % 3 === 0 ? v + 500 : v)));
  assert.equal(insideFraction(draussen, loc), 0);

  const app = src('js/part/distanceapp.js');
  assert.match(app, /insideFraction/, 'die Seite misst die Durchdringung nicht');
  assert.match(app, /durchdringen sich/, 'und meldet sie nicht');
});

/* ── Kamera, ASCII-STL, Lesefehler, fehlende Knoten ───────────────────── */

test('camera.far deckt die Zoomgrenze ab', () => {
  const scene = src('js/scene.js');
  assert.match(scene, /persp\.far = Math\.max\(d, radius \* 40\)/,
    'far war kleiner als controls.maxDistance — beim Herauszoomen verschwand das Modell');
  /* Nachgerechnet mit der Formel der Datei. */
  const radius = 100, d = (radius * 1.2) / Math.tan(Math.PI / 8);
  assert.ok(Math.max(d, radius * 40) + radius * 20 > radius * 40, 'far muss maxDistance überdecken');
});

test('ASCII-STL: unlesbare Koordinaten sind ein Fehler, keine NaN', async () => {
  const { parseSTL } = await import('../../../web/tools/3d-studio/js/part/stlio.js');
  const enc = t => new TextEncoder().encode(t).buffer;
  const gut = 'solid x\n' + [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]].flatMap((_, i) => []).join('') +
    'facet normal 0 0 1 outer loop vertex 0 0 0 vertex 1 0 0 vertex 0 1 0 endloop endfacet\n' +
    'facet normal 0 0 1 outer loop vertex 0 0 0 vertex 0 1 0 vertex 0 0 1 endloop endfacet\n' +
    'facet normal 0 0 1 outer loop vertex 0 0 0 vertex 0 0 1 vertex 1 0 0 endloop endfacet\n' +
    'facet normal 0 0 1 outer loop vertex 1 0 0 vertex 0 0 1 vertex 0 1 0 endloop endfacet\nendsolid x';
  const t = parseSTL(enc(gut));
  assert.ok(t.length >= 36 && t.every(Number.isFinite));

  const kaputt = gut.replace('vertex 1 0 0 vertex 0 1 0 endloop endfacet\nfacet normal 0 0 1 outer loop vertex 0 0 0 vertex 0 1 0',
    'vertex 1e 0 0 vertex 0 1 0 endloop endfacet\nfacet normal 0 0 1 outer loop vertex 0 0 0 vertex 0 1 0');
  assert.throws(() => parseSTL(enc(kaputt)), /Unlesbare Koordinate/);
});

test('Lesefehler und fehlende GLB-Knoten melden sich', () => {
  const ps = src('js/part/partsource.js');
  assert.match(ps, /fr\.onerror/, 'ein gescheiterter Lesevorgang blieb stumm, die Busy-Anzeige lief weiter');
  const die = src('js/die.js');
  assert.match(die, /if \(!movingRoot\)/,
    'ohne den Knoten warf der Öffnen-Regler einen TypeError statt zu sagen, was fehlt');
  assert.match(die, /if \(movingRoot\) movingRoot\.position\.z/);
});
