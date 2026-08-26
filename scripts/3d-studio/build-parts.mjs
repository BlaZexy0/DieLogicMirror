/* Die Beispielteile des 3D-Studios erzeugen:
      node scripts/3d-studio/build-parts.mjs
   (aus dem Repo-Root; schreibt nach web/tools/3d-studio/assets/parts/)

   Die Bauteil-Seiten laden die Beispielteile als fertige GLB, damit sie
   die Geometrie-Werkstatt (CSG) nicht mitschleppen müssen. Geschrieben
   wird nur, was gebraucht wird: verschweißte Punkte, Indizes, keine
   Normalen — die rechnet der Viewer ohnehin neu, und die Analyse
   arbeitet allein mit den Punkten. */

import { writeFileSync, mkdirSync } from 'node:fs';
import { exportGLB, three as T } from './glb-node.mjs';

const { DEMO_PARTS } = await import('../../web/tools/3d-studio/js/part/demoparts.js');
const { buildDemoGeometry } = await import('../../web/tools/3d-studio/js/part/demogeom.js');
const { cleanMesh, weld, volume, surface } = await import('../../web/tools/3d-studio/js/mesh.js');

const outDir = new URL('../../web/tools/3d-studio/assets/parts/', import.meta.url);
mkdirSync(outDir, { recursive: true });

for (const p of DEMO_PARTS) {
  const t0 = Date.now();
  /* Schon hier aufräumen: die ausgelieferte Datei ist dann frei von
     T-Stößen und entarteten Dreiecken, der Viewer hat weniger zu tun. */
  const tris = cleanMesh(buildDemoGeometry(p.id)).tris;
  const { verts, index, vertexCount } = weld(tris);

  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(Float32Array.from(verts), 3));
  g.setIndex(new T.BufferAttribute(
    vertexCount > 65535 ? Uint32Array.from(index) : Uint16Array.from(index), 1));

  const mat = new T.MeshStandardMaterial({ color: 0xb5c0c4, roughness: 0.6 });
  mat.name = 'part';
  const mesh = new T.Mesh(g, mat);
  mesh.name = p.id;
  const root = new T.Group();
  root.name = p.id;
  root.add(mesh);

  const buf = await exportGLB(root);
  const file = new URL(p.id + '.glb', outDir);
  writeFileSync(file, Buffer.from(buf));
  console.log(p.id.padEnd(10)
    + String(tris.length / 9).padStart(7) + ' △'
    + String(vertexCount).padStart(8) + ' Punkte'
    + (buf.byteLength / 1024).toFixed(0).padStart(7) + ' kB'
    + (volume(tris) / 1000).toFixed(1).padStart(11) + ' cm³'
    + (surface(tris) / 100).toFixed(1).padStart(9) + ' cm²'
    + String(Date.now() - t0).padStart(6) + ' ms');
}
