/* Das Rechengitter aus dem Angusssystem.

   Der Anguss ist ein Körper (js/runner/sweep.js), der Pressrest ein
   Zylinder; beide werden auf EIN Raster gebracht — mit dem Rasterer der
   Bauteilseiten (js/part/field.js: innen negativ) —, und jeder
   Rasterpunkt bekommt seine Rolle: Stahl, Schmelze (im Pressrest), Luft
   (im Anguss), Front dazwischen, Kolbenfläche und Anschnitt. Der Kolben
   ist die unterste Zellschicht des Pressrests (die Fläche, die der
   Schusskolben schiebt), der Anschnitt die letzte Zellschicht vor der
   Austrittsfläche jedes Anschnitts; davor liegt ein Melder — wer ihn
   benetzt, hat den Anschnitt erreicht.

   Ein Rand aus Wandzellen liegt um alles herum, damit der Kern keine
   Bereichsprüfung braucht. Kein DOM — die Tests bauen damit Gitter. */

import { faceData, bounds } from '../mesh.js';
import { buildField } from '../part/field.js';
import { sampleNetwork } from '../runner/curve.js';
import { sweepRunner, biscuitMesh } from '../runner/sweep.js';
import * as G from '../runner/graph.js';
import { sub, dot, add, scale } from '../runner/vec.js';
import { C, FLAG } from './lattice.js';

/** Höchstzahl Zellen — die GPU bindet je Richtung ein Feld über alle
    Zellen, und 19 × 4 Byte × N muss unter die 128 MB eines Puffers. */
export const MAX_CELLS = 1.5e6;
/** Ohne WebGPU rechnet JavaScript — nur bis hierhin in erträglicher Zeit. */
export const MAX_CELLS_CPU = 2.5e5;

/** Vorschlag für die Zellkante: rund `target` Zellen im Hüllquader von
    Anguss und Pressrest (400 000 auf der Grafikkarte, deutlich weniger
    in JavaScript), auf halbe Millimeter gerundet, nie unter 1 mm. */
export function suggestCell(g, target = 4e5) {
  const b = extent(g);
  const vol = b.size[0] * b.size[1] * b.size[2];
  const h = Math.cbrt(vol / target);
  return Math.max(1, Math.round(h * 2) / 2);
}

/** Zellenzahl für eine Zellkante — vorab, ohne zu rastern. */
export function cellCount(g, h) {
  const b = extent(g);
  const pad = 2 * h;
  const dims = [0, 1, 2].map(a => Math.max(2, Math.ceil((b.size[a] + 2 * pad) / h) + 1));
  return { dims, count: dims[0] * dims[1] * dims[2] };
}

function extent(g) {
  const net = sampleNetwork(g);
  const both = concat(sweepRunner(net), biscuitMesh(g.biscuit));
  return bounds(both);
}

function concat(a, b) {
  const out = new Float64Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length);
  return out;
}

/* Ein Modell, wie buildField es braucht — ohne Aufräumen und Ausrichten,
   die Körper des Angussdesigners sind schon geschlossen und nach außen
   gewickelt. `bounds` ist der gemeinsame Hüllquader, damit beide Körper
   auf demselben Raster landen. */
function lightModel(tris, box) {
  const fd = faceData(tris);
  return { tris, normals: fd.normals, faceCount: fd.count, bounds: box };
}

/**
 * Das Gitter bauen.
 *   g     Angussgraph
 *   h     Zellkante in mm
 *   opts.onProgress(p, was)
 * → { dims, origin, h, N, flags, sensor, gates, inletDir, axis,
 *     runnerCells, biscuitCells, inletCells, field (Anguss-SDF fürs Bild) }
 */
export async function buildDomain(g, h, opts = {}) {
  const net = sampleNetwork(g);
  const runner = sweepRunner(net);
  const bisc = biscuitMesh(g.biscuit);
  const box = bounds(concat(runner, bisc));
  const pad = 2 * h;
  const prog = opts.onProgress || (() => {});
  const fieldR = await buildField(lightModel(runner, box), { h, band: h, pad, onProgress: (p, w) => prog(p * 0.45, 'Anguss ' + w) });
  const fieldB = await buildField(lightModel(bisc, box), { h, band: h, pad, onProgress: (p, w) => prog(0.45 + p * 0.45, 'Pressrest ' + w) });
  const dims = fieldR.dims, origin = fieldR.origin;
  const [nx, ny, nz] = dims;
  const N = nx * ny * nz;
  const { WALL, GAS, INTERFACE, FLUID, INLET, OUTLET } = FLAG;
  const flags = new Uint32Array(N).fill(WALL);
  const sensor = new Uint32Array(N);

  /* Rollen: Pressrest voll, Anguss leer; der Rand bleibt Wand. */
  let runnerCells = 0, biscuitCells = 0;
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const idx = (k * ny + j) * nx + i;
    if (fieldB.data[idx] < 0) { flags[idx] = FLUID; biscuitCells++; }
    else if (fieldR.data[idx] < 0) { flags[idx] = GAS; runnerCells++; }
  }

  /* Der Kolben: die Pressrestzellen, hinter denen (gegen die Achse) Stahl liegt. */
  const axisKey = g.biscuit.axis in G.AXES ? g.biscuit.axis : '+y';
  const axis = G.AXES[axisKey];
  const inletDir = C.findIndex(c => c[0] === axis[0] && c[1] === axis[1] && c[2] === axis[2]);
  const back = -(axis[0] + axis[1] * nx + axis[2] * nx * ny);
  let inletCells = 0;
  for (let idx = 0; idx < N; idx++) {
    if (flags[idx] === FLUID && flags[idx + back] === WALL) { flags[idx] = INLET; inletCells++; }
  }

  /* Anschnitte: die letzte Schicht vor der Austrittsfläche verlässt den
     Anguss, die Schicht davor meldet die Ankunft. Auf grobem Gitter
     liegt im Steg (zwei Millimeter hoch) womöglich keine Zelle — dann
     rückt der Auslass so weit stromaufwärts, bis er eine findet. */
  const gates = [];
  for (const e of net.edges) {
    if (e.to.type !== 'gate' || !e.sections.length) continue;
    const last = e.sections[e.sections.length - 1];
    const t = last.t, p0 = e.to.pos;
    const reach = Math.max(e.to.gate ? e.to.gate.w : 20, last.sec.width) * 1.5 + 2 * h;
    const gi = gates.length;
    gates.push({ id: e.to.id, pos: p0.slice(), dir: t.slice(), outlet: 0, sensor: 0 });
    const cand = [];
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const idx = (k * ny + j) * nx + i;
      if (flags[idx] !== GAS) continue;
      const p = [origin[0] + i * h, origin[1] + j * h, origin[2] + k * h];
      const d = sub(p, p0);
      const along = dot(d, t);
      if (along < -6 * h || along > 1.5 * h) continue;
      const off = sub(d, scale(t, along));
      if (dot(off, off) > reach * reach) continue;
      cand.push({ idx, along });
    }
    let outMin = -h;
    while (outMin > -4 * h && !cand.some(c => c.along >= outMin)) outMin -= h;
    for (const c of cand) {
      if (c.along >= outMin) { flags[c.idx] = OUTLET; gates[gi].outlet++; }
      else if (c.along >= outMin - 1.5 * h && !sensor[c.idx]) { sensor[c.idx] = gi + 1; gates[gi].sensor++; }
    }
  }

  /* Die Front: Luftzellen neben Schmelze. */
  const OFF = C.map(c => c[0] + c[1] * nx + c[2] * nx * ny);
  for (let idx = 0; idx < N; idx++) {
    if (flags[idx] !== GAS) continue;
    for (let i = 1; i < C.length; i++) {
      const f = flags[idx + OFF[i]];
      if (f === FLUID || f === INLET) { flags[idx] = INTERFACE; break; }
    }
  }
  const shape = new Uint8Array(N);
  for (let idx = 0; idx < N; idx++) shape[idx] = flags[idx] === WALL ? 0 : 1;
  prog(1, 'fertig');
  return {
    dims, origin, h, N, flags, sensor, shape, gates, inletDir, axis,
    runnerCells, biscuitCells, inletCells,
    net, runnerTris: runner, biscuitTris: bisc, field: fieldR,
    center: add(box.min, scale(box.size, 0.5))
  };
}

/** Zellen des Angusses (ohne Pressrest, ohne Auslass) — die Bezugsgröße
    des Füllgrads: eine Maske über das Gitter. */
export function runnerMask(domain) {
  const m = new Uint8Array(domain.N);
  const { GAS, INTERFACE } = FLAG;
  for (let idx = 0; idx < domain.N; idx++) if (domain.flags[idx] === GAS || domain.flags[idx] === INTERFACE) m[idx] = 1;
  return m;
}
