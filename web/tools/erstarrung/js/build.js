/* Von der Nutzlast (js/payload.js) zum ZIP: die Gusskörper vereinigen, den
   Fall schreiben, packen. Läuft im Worker (js/worker.js), in den Tests
   direkt. Kein DOM. */

import { unionSurfaces } from '../../simulation/js/core/geometry.js';
import { zip } from '../../simulation/js/core/zip.js';
import { safe } from '../../simulation/js/build.js';
import { buildSolCase } from './core/solcase.js';

export async function build(p, progress = () => {}) {
  progress('Gusskörper vereinigen …');
  const edge = Math.max(p.mesh.cell / 2, 0.2);
  const union = unionSurfaces(p.bodies.map(b => Object.assign({}, b, { maxEdge: edge })), { maxEdge: edge });
  progress('Fall schreiben …');
  const { files, info } = buildSolCase(Object.assign({}, p, { union }));
  progress('Packen …');
  const root = safe(p.caseName || caseName(p.title));
  const bytes = await zip(files, { root });
  return { zip: bytes, root, info, stats: union.stats, files: Object.keys(files) };
}

/** Der Vorschlag für den Fall: Datum von heute, der Name und „Erstarrung". */
export const caseName = (title, d = new Date()) => {
  const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const name = safe(String(title || '').replace(/^\d{4}-\d{2}-\d{2}[_ ]+/, ''));
  return day + '_' + (/erstarrung/i.test(name) ? name : name + '_Erstarrung');
};
export { safe };
