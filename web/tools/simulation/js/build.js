/* Von der Nutzlast (js/payload.js) zum ZIP: die Vereinigung bilden, den
   Fall schreiben, packen. Läuft im Worker (js/worker.js) — die Vereinigung
   braucht bei großen Netzen Sekunden —, in den Tests direkt. Kein DOM,
   kein Zustand der Auslegung. */

import { unionSurfaces, makeSolid, depthAlong } from './core/geometry.js';
import { buildCase } from './core/casegen.js';
import { zip } from './core/zip.js';

/**
 * @param p        payloadOf(plan) aus js/payload.js
 * @param progress (text) → void
 * → { zip: Uint8Array, info, stats, files: Object.keys }
 */
export async function build(p, progress = () => {}) {
  progress('Körper vereinigen …');
  /* je Körper die halbe Zelle seiner Stufe — die Nähte werden so fein, wie
     der feinere der beiden Körper vernetzt wird */
  const bodies = p.bodies.map(b => Object.assign({}, b, { maxEdge: Math.max(p.mesh.cell / Math.pow(2, (b.extra || 0) + 1), 0.2) }));
  const union = unionSurfaces(bodies, { maxEdge: Math.max(p.mesh.cell / 2, 0.2) });
  progress('Fall schreiben …');
  const { files, info } = buildCase({
    title: p.title, union, bodies: p.bodies, inlet: p.inlet, outlets: p.outlets,
    mesh: p.mesh, process: p.process, post: p.post, shot: p.shot
  });
  progress('Packen …');
  const root = safe(p.title) + '_openfoam';
  const bytes = await zip(files, { root });
  return { zip: bytes, root, info, stats: union.stats, files: Object.keys(files) };
}

export const safe = s => String(s || 'simulation').normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'simulation';

export { makeSolid, depthAlong };
