/* Die Gusstraube der Beispielform als Beispiel der Sprengflächenanalyse:
      node scripts/3d-studio/build-gusstraube.mjs <openscad_parts> [ziel.glb]
   (Ziel: web/examples/gusstraube.glb)

   Dieselbe Gusstraube wie in assets/die.glb, aus dem Schwesterprojekt
   openscad_parts: Bauteil und Überläufe sind build/die/oil_pan_die/
   castPart.stl und castOverflow.stl (./render_die.sh). Anguss und Pressrest
   stecken dort in EINEM Stück (castRunner); die Sprengflächenanalyse führt
   den Pressrest aber getrennt, seine Masse geht eigens ins Dashboard. Beide
   kommen deshalb aus build/gusstraube/{anguss,pressrest}.stl, gerendert mit
   openscad-nightly --backend=manifold --export-format binstl -D 'teil="…"'
   aus build/gusstraube/teilen.scad, das castRunner an der Wand des
   Pressrests teilt:

      use <../../dies/oil_pan_die.scad>
      teil = "pressrest";
      module schnitt() { translate([0, -280, -20]) cylinder(r = 65, h = 21, $fn = 64); }
      if (teil == "pressrest") intersection() { castRunner(); schnitt(); }
      else difference() { castRunner(); schnitt(); }

   Der Schnittzylinder ist das 64-Eck des Pressrests (r = sl_d/2, Achse
   y = sl_y), reicht aber bis z = +1: der Anguss steht 0,01 mm über der
   Trennebene, und eine Haut davon über dem Pressrest zählte sonst in der
   Projektion als Anguss-Fläche. Zusammen sind die zwei genau castRunner.

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
  ['Anguss', 'build/gusstraube/anguss.stl'],
  ['Überläufe', 'build/die/oil_pan_die/castOverflow.stl'],
  ['Pressrest', 'build/gusstraube/pressrest.stl'],
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
