/* Aus dem Plan die Nutzlast für den Bau des Falls (js/build.js, im
   Worker): nur Zahlen und Felder — die Flächenmarken der Körper (Einlass 1,
   Auslass i 2…) und die Schusskurve, die hier, auf der Seite, mit dem
   Zustand der Auslegung gerechnet wird (js/shot.js). */

import { shotPlan, pistonTable } from './shot.js';
import { edgeCheck, thickness } from './core/geometry.js';
import { ROLE, hex2rgb, scaleRgb } from '../../3d-studio/js/part/colors.js';

/* Die Farben der Auswertung als Zahlen — bilder.py und bericht.py kennen
   keine Palette: die Leiste heat (die meisten Kennwerte), rainbow und bgo
   mit ihren Stützstellen und der Farbe darüber (Geschwindigkeit, Luft;
   die Bilder nehmen dafür die gleichnamigen Vorgaben von ParaView) und die
   Rollen für Schmelze, Form, Schrift, Linien und Flächen des Berichts. */
const ROLLEN = ['text', 'muted', 'border', 'borderLight', 'surface', 'viewport', 'primary', 'ok', 'caution', 'bad',
  'melt', 'air', 'mark', 'die', 'runner', 'steelDark'];
export function imageColors() {
  const r3 = c => c.map(x => Number(x.toFixed(4)));
  const P = globalThis.__PALETTE__;
  const stops = name => (P && P.leisten && P.leisten[name] ? P.leisten[name].map(([t, h]) => [Number(t.toFixed(4)), ...r3(hex2rgb(h))]) : null);
  const colors = { shell: r3(hex2rgb(ROLE.part)) };
  for (const k of ROLLEN) colors[k] = r3(hex2rgb(ROLE[k]));
  return {
    heat: Array.from({ length: 7 }, (_, k) => [Number((k / 6).toFixed(4)), ...r3(scaleRgb('heat', k / 6))]),
    maps: {
      rainbow: { stops: stops('rainbow'), over: P && P.ueber && P.ueber.rainbow ? r3(hex2rgb(P.ueber.rainbow)) : null },
      bgo: { stops: stops('bgo') }
    },
    colors
  };
}

export function payloadOf(plan) {
  const bodies = plan.included();
  const idx = new Map(bodies.map((b, i) => [b.id, i]));
  const labels = bodies.map(b => new Int32Array(b.tris.length / 9));
  if (plan.inlet && idx.has(plan.inlet.bodyId)) for (const f of plan.inlet.faces) labels[idx.get(plan.inlet.bodyId)][f] = 1;
  plan.outlets.forEach((o, i) => { if (idx.has(o.bodyId)) for (const f of o.faces) labels[idx.get(o.bodyId)][f] = 2 + i; });
  const sp = plan.inlet ? shotPlan(plan) : { error: 'kein Einlass' };
  if (sp.error) throw new Error('Schusskurve: ' + sp.error);
  return {
    title: plan.title, caseName: plan.caseName || null,
    bodies: bodies.map((b, i) => {
      /* Nicht geschlossen (offen oder nicht-mannigfaltig): snappyHexMesh kann
         dort nicht „innen" verfeinern — dann im Abstand der halben Wand */
      const ec = edgeCheck(b.tris), closed = ec.closed;
      /* nur echt offene Netze brauchen den Abstand (mehrere geschlossene
         Schalen teilt der Fall selbst auf) */
      const reach = ec.open > 0 ? Math.max(thickness(b.tris, 200).median / 2 + 0.5, 1) : 0;
      return { name: b.name, role: b.role, tris: b.tris, labels: labels[i], extra: b.extra || 0, closed, reach };
    }),
    inlet: plan.inlet && { centroid: plan.inlet.centroid, normal: plan.inlet.normal, area: plan.inlet.area, radius: plan.inlet.radius, depth: plan.inlet.depth },
    outlets: plan.outlets.map(o => ({ centroid: o.centroid, area: o.area, mode: o.mode, Cd: o.Cd })),
    mesh: plan.mesh, process: plan.process, post: Object.assign({}, plan.post, imageColors()),
    shot: {
      chamber: !!plan.shot.chamber, mode: plan.shot.mode,
      points: sp.points, inletTable: sp.inletTable, piston: pistonTable(sp),
      tFull: sp.tFull, tEnd: sp.tEnd, sFull: sp.sFull, sEnd: sp.sEnd, phi: sp.phi,
      diam: sp.diam, length: sp.length, depth: sp.depth, stroke: sp.stroke, Vdose: sp.Vdose
    }
  };
}
