/* Die Gusstraube der Beispielform als Beispiel der Sprengflächenanalyse:
      node scripts/3d-studio/build-gusstraube.mjs <openscad_parts> [ziel.glb]
   (Ziel: web/examples/gusstraube.glb)

   Dieselbe Gusstraube wie in assets/die.glb, aus denselben Stücken im
   Schwesterprojekt openscad_parts (./render_die.sh --studio rendert sie
   nach build/die/oil_pan_die/): castPart, castRunner, castOverflow und
   castBiscuit. Anguss und Pressrest sind dort getrennt (castRunner und
   castBiscuit, geteilt an der Wand des Pressrests), weil die
   Sprengflächenanalyse den Pressrest eigens führt: seine Masse geht
   getrennt ins Dashboard.

   Die GLB trägt nur Lagen und Indizes: die Analyse projiziert, sie
   schattiert nicht. Je Teil ein Knoten mit deutschem Namen; die Seite
   ordnet die Rollen über diese Namen zu (sprengflaeche/stl-app.js). */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { exportGLB, three as T } from './glb-node.mjs';

if (!process.argv[2]) {
  console.error('Aufruf: node scripts/3d-studio/build-gusstraube.mjs <openscad_parts> [ziel.glb]');
  process.exit(2);
}
const { parseSTL } = await import('../../web/tools/sprengflaeche/stl-math.js');

const QUELLE = resolve(process.argv[2]);
const TEILE = [
  ['Bauteil', 'build/die/oil_pan_die/castPart.stl'],
  ['Anguss', 'build/die/oil_pan_die/castRunner.stl'],
  ['Überläufe', 'build/die/oil_pan_die/castOverflow.stl'],
  ['Pressrest', 'build/die/oil_pan_die/castBiscuit.stl'],
];

/** Dreieckssuppe → indizierte Geometrie nur mit Lagen (gleiche Punkte
    der STL fallen zusammen, sie sind dort bitgleich). */
function geometryOf(tris) {
  const index = new Map();
  const pos = [];
  const idx = new Uint32Array(tris.length / 3);
  for (let i = 0; i < tris.length; i += 3) {
    const key = tris[i] + ',' + tris[i + 1] + ',' + tris[i + 2];
    let j = index.get(key);
    if (j === undefined) {
      j = pos.length / 3;
      index.set(key, j);
      pos.push(tris[i], tris[i + 1], tris[i + 2]);
    }
    idx[i / 3] = j;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(Float32Array.from(pos), 3));
  g.setIndex(new T.BufferAttribute(pos.length / 3 > 65535 ? idx : Uint16Array.from(idx), 1));
  return g;
}

const root = new T.Group();
root.name = 'gusstraube';
const material = new T.MeshStandardMaterial();
for (const [name, file] of TEILE) {
  const buf = readFileSync(join(QUELLE, file));
  const tris = parseSTL(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const mesh = new T.Mesh(geometryOf(tris), material);
  mesh.name = name;
  root.add(mesh);
  process.stderr.write(`  ${name}: ${tris.length / 9} △\n`);
}
const out = process.argv[3]
  ? resolve(process.argv[3])
  : new URL('../../web/examples/gusstraube.glb', import.meta.url).pathname;
const buf = await exportGLB(root);
writeFileSync(out, Buffer.from(buf));
console.log(`${out}: ${(buf.byteLength / 1024).toFixed(0)} kB`);
