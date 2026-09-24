/* Das Formmodell aus fertigen STL-Stücken zusammensetzen:
      node scripts/3d-studio/build-die-stl.mjs <manifest.json> [ziel.glb]
   (Ziel: web/tools/3d-studio/assets/die.glb)

   Das Manifest kommt aus dem Schwesterprojekt openscad_parts (dort
   ./render_die.sh --studio) und nennt je Stück die Baugruppe
   (Registry-id), das Material und die STL-Datei, relativ zum Manifest.

   Material-NAMEN sind das Vertragsstück mit dem Viewer: sie überleben den
   GLB-Roundtrip und steuern dort die Deckkraft ('steel') und den Versatz
   der Schnitt-Deckflächen (Stahl hinter dem Inhalt, js/materials.js). */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { exportGLB, three as T } from './glb-node.mjs';

if (!process.argv[2]) {
  console.error('Aufruf: node scripts/3d-studio/build-die-stl.mjs <manifest.json> [ziel.glb]');
  process.exit(2);
}
/* Dynamisch, also erst nach glb-node.mjs: das meldet den Auflöser für den
   nackten Import 'three' an, den materials.js braucht. */
const { COMPONENTS, BY_ID } = await import('../../web/tools/3d-studio/js/registry.js');
const { smoothNormals, indexTriangles, cleanMesh } = await import('../../web/tools/3d-studio/js/mesh.js');
const { makeMaterial } = await import('../../web/tools/3d-studio/js/materials.js');
const { parseSTL } = await import('../../web/tools/3d-studio/js/part/stlio.js');

/** Dreieckssuppe → indizierte BufferGeometry mit weichen Normalen
    über den Knickwinkel (crease: darüber bleibt die Kante hart). */
function toGeometry(raw, crease = 32) {
  /* STL-Exporte hinterlassen T-Stöße (ein Punkt mitten auf einer fremden
     Kante). Sichtbar werden sie als haarfeine Risse, vor allem bei den
     Stencil-Schnittflächen, wo ein Riss die Zählung kippen kann. */
  const tris = cleanMesh(raw).tris;
  const { position, normal, index } = indexTriangles(tris, smoothNormals(tris, crease));
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(position, 3));
  g.setAttribute('normal', new T.BufferAttribute(normal, 3));
  g.setIndex(new T.BufferAttribute(
    position.length / 3 > 65535 ? index : Uint16Array.from(index), 1));
  return g;
}

/* ── Aufbau der GLB ──────────────────────────────────────────────
   die
   ├─ fixedRoot    (bleibt stehen)
   └─ movingRoot   (fährt beim „Form öffnen" nach +z; enthält 'mov' + 'cast')
   Baugruppen-Gruppen heißen wie ihre Registry-id; compId steht zusätzlich
   in userData und überlebt als glTF-extras den Roundtrip. Die Farbe eines
   Materials ist die Rolle des Teils im Standardschema; der Viewer färbt
   beim Laden ohnehin nach Rolle und gewähltem Schema (js/assembly.js). */
function buildDie(parts) {
  const root = new T.Group();
  root.name = 'die';
  const fixedRoot = new T.Group(); fixedRoot.name = 'fixedRoot';
  const movingRoot = new T.Group(); movingRoot.name = 'movingRoot';
  root.add(fixedRoot, movingRoot);

  for (const c of COMPONENTS) {
    const g = new T.Group();
    g.name = c.id;
    g.userData.compId = c.id;
    for (const piece of parts[c.id] || []) {
      const color = parseInt(BY_ID[c.id].color.slice(1), 16);
      const mesh = new T.Mesh(toGeometry(piece.tris), makeMaterial(piece.mat, color));
      mesh.name = c.id + '_' + piece.mat;
      mesh.userData.compId = c.id;
      g.add(mesh);
    }
    (c.side === 'fix' ? fixedRoot : movingRoot).add(g);
  }
  return root;
}

const manifestPath = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const dir = dirname(manifestPath);
const t0 = Date.now();
const parts = {};
let tri = 0;
for (const p of manifest.pieces) {
  const buf = readFileSync(resolve(dir, p.file));
  const tris = parseSTL(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  (parts[p.comp] ||= []).push({ tris, mat: p.mat });
  tri += tris.length / 9;
  process.stderr.write(`  ${p.comp}/${p.mat}: ${tris.length / 9} △\n`);
}
const out = process.argv[3]
  ? resolve(process.argv[3])
  : new URL('../../web/tools/3d-studio/assets/die.glb', import.meta.url).pathname;
const buf = await exportGLB(buildDie(parts));
writeFileSync(out, Buffer.from(buf));
console.log(`${out}: ${(buf.byteLength / 1024).toFixed(0)} kB, ${tri} △, ${Date.now() - t0} ms`);
