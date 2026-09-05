/* Die PROZEDURALE Beispielform erzeugen:
      node scripts/3d-studio/build-glb.mjs <ziel.glb>
   Die ausgelieferte assets/die.glb ist seit der Ölwannen-Form nicht mehr
   dieses Modell, sondern kommt aus openscad_parts (build-die-stl.mjs);
   deshalb muss das Ziel hier ausdrücklich genannt werden.

   Baut das Modell aus web/tools/3d-studio/js/diegeom.js (über den
   Three.js-Adapter js/components.js) und schreibt es als binäres glTF.
   Was Node dafür fehlt — der nackte Import 'three' und ein FileReader —
   ergänzt glb-node.mjs daneben. */

import { writeFileSync } from 'node:fs';
import { exportGLB } from './glb-node.mjs';

const { buildDie } = await import('../../web/tools/3d-studio/js/components.js');

if (!process.argv[2]) {
  console.error('Aufruf: node scripts/3d-studio/build-glb.mjs <ziel.glb> — assets/die.glb kommt aus openscad_parts');
  process.exit(2);
}
const out = new URL(process.argv[2], 'file://' + process.cwd() + '/');
const t0 = Date.now();
const root = buildDie((name, ms) => process.stderr.write(`  ${name} @${ms} ms\n`));

const buf = await exportGLB(root);
writeFileSync(out, Buffer.from(buf));
console.log(`${out.pathname}: ${(buf.byteLength / 1024).toFixed(0)} kB, ${Date.now() - t0} ms`);
