/* Das Formmodell des 3D-Studios erzeugen:
      node scripts/3d-studio/build-glb.mjs [ziel.glb]
   (aus dem Repo-Root; schreibt nach web/tools/3d-studio/assets/die.glb)

   Baut das Modell aus web/tools/3d-studio/js/diegeom.js (über den
   Three.js-Adapter js/components.js) und schreibt es als binäres glTF.
   Was Node dafür fehlt — der nackte Import 'three' und ein FileReader —
   ergänzt glb-node.mjs daneben. */

import { writeFileSync } from 'node:fs';
import { exportGLB } from './glb-node.mjs';

const { buildDie } = await import('../../web/tools/3d-studio/js/components.js');

const out = new URL(process.argv[2] || '../../web/tools/3d-studio/assets/die.glb', import.meta.url);
const t0 = Date.now();
const root = buildDie((name, ms) => process.stderr.write(`  ${name} @${ms} ms\n`));

const buf = await exportGLB(root);
writeFileSync(out, Buffer.from(buf));
console.log(`${out.pathname}: ${(buf.byteLength / 1024).toFixed(0)} kB, ${Date.now() - t0} ms`);
