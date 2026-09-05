/* Das Formmodell aus fertigen STL-Stücken zusammensetzen:
      node scripts/3d-studio/build-die-stl.mjs <manifest.json> [ziel.glb]
   (Ziel: web/tools/3d-studio/assets/die.glb)

   Das Manifest kommt aus dem Schwesterprojekt openscad_parts (dort
   ./render_die.sh --studio) und nennt je Stück die Baugruppe
   (Registry-id), das Material und die STL-Datei, relativ zum Manifest.
   Zusammenbau, Normalen und Materialien laufen über denselben Adapter wie
   beim prozeduralen Modell (js/components.js) — der Viewer sieht keinen
   Unterschied. */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { exportGLB } from './glb-node.mjs';

if (!process.argv[2]) {
  console.error('Aufruf: node scripts/3d-studio/build-die-stl.mjs <manifest.json> [ziel.glb]');
  process.exit(2);
}
const { buildDieFromPieces } = await import('../../web/tools/3d-studio/js/components.js');
const { parseSTL } = await import('../../web/tools/3d-studio/js/part/stlio.js');

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
  process.stderr.write(`  ${p.comp}/${p.mat}: ${tris.length / 9} \u25b3\n`);
}
const out = process.argv[3]
  ? resolve(process.argv[3])
  : new URL('../../web/tools/3d-studio/assets/die.glb', import.meta.url).pathname;
const buf = await exportGLB(buildDieFromPieces(parts));
writeFileSync(out, Buffer.from(buf));
console.log(`${out}: ${(buf.byteLength / 1024).toFixed(0)} kB, ${tri} \u25b3, ${Date.now() - t0} ms`);
