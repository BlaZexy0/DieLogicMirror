/* Aus dem Plan die Nutzlast für den Bau des Falls (js/build.js, im
   Worker): die Gusskörper, die Kolbenfläche, Formblock, Kühlkanäle, Netz,
   Prozess, Auswertung und die Farben der Palette als Zahlen. */

import { imageColors } from '../../simulation/js/payload.js';
import { alloyOf } from './core/solcase.js';
import { alloyFromFields } from './core/materials.js';

/** Die Legierungen der Auslegung (shared/examples/alloys.js) als Einträge mit linearer Kurve. */
export function designAlloys() {
  const list = (globalThis.__ALLOYS__ && globalThis.__ALLOYS__.alloys) || [];
  return list.filter(a => a.fields && a.fields.Tliq > a.fields.Tsol).map(a => alloyFromFields('auslegung:' + a.id, a.name, a.fields));
}

export function payloadOf(plan) {
  const bodies = plan.included();
  const S = plan.sol;
  const P = Object.assign({}, S.process);
  if (String(P.alloy).startsWith('auslegung:')) P.alloyData = designAlloys().find(a => a.id === P.alloy) || null;
  const pl = plan.inlet;
  return {
    title: plan.title, caseName: plan.caseName || null,
    bodies: bodies.map(b => ({ name: b.name, role: b.role, tris: b.tris })),
    plunger: pl && { centroid: pl.centroid, normal: pl.normal, radius: pl.radius, area: pl.area, depth: pl.depth },
    die: { margin: S.die.margin, parting: S.die.parting },
    channels: S.channels.map(c => ({ a: c.a, b: c.b, d: c.d, T: c.T, h: c.h })),
    mesh: Object.assign({}, S.mesh), process: P, post: Object.assign({}, S.post),
    alloyName: alloyOf(P).name,
    colors: imageColors()
  };
}
