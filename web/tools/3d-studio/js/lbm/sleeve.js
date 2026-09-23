/* Das Rechengitter der Füllkammer.

   Ein liegender Zylinder: Achse x (der Kolben fährt nach +x), y nach
   oben, z quer; die Schwerkraft zieht nach −y. Die Schmelze steht beim
   Start ruhig unten in der Kammer, bis zu dem Stand, der den gewählten
   Füllgrad ergibt (Kreissegment). Der Kolben ist die Zellschicht bei
   x = 0 und wandert mit der Schusskurve (js/lbm/fslbm.js, pass0). Am
   Kammerende sitzt der Laufkanal: ein Rechteck oben in der Stirnfläche,
   Breite × Tiefe — was dort ankommt, verlässt die Kammer; die Schicht
   davor meldet „Kammer voll". Ein Rand aus Wandzellen um alles.

   Dazu die Uhr der Luft: Gaszellen, die nicht mehr mit der großen
   Luftblase über der Schmelze zusammenhängen, sind eingeschlossen —
   das ist die Zahl, um die es bei der ersten Phase geht. */

import { C, FLAG } from './lattice.js';

/** Höchstzahl Zellen wie beim Anguss. */
export const MAX_CELLS = 1.5e6;
export const MAX_CELLS_CPU = 2.5e5;

/** Stand der Schmelze (mm über dem tiefsten Punkt) zu einem Füllgrad des
    Kreisquerschnitts — die Umkehrung des Kreissegments, Bisektion. */
export function fillLevel(phi, R) {
  const f = Math.min(1, Math.max(0, phi));
  if (f <= 0) return 0;
  if (f >= 1) return 2 * R;
  const area = h => {
    const c = Math.min(1, Math.max(-1, (R - h) / R));
    const th = 2 * Math.acos(c);
    return (th - Math.sin(th)) / (2 * Math.PI);
  };
  let lo = 0, hi = 2 * R;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (area(m) < f) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** Vorschlag für die Zellkante: rund `target` Zellen im Hüllquader. */
export function suggestCell(spec, target = 1.5e5) {
  const vol = spec.d * spec.d * spec.length;
  const h = Math.cbrt(vol / target);
  return Math.max(1, Math.round(h * 2) / 2);
}

export function cellCount(spec, h) {
  const pad = 2;
  const nx = Math.ceil(spec.length / h) + 2 * pad;
  const nyz = Math.ceil(spec.d / h) + 2 * pad;
  return { dims: [nx, nyz, nyz], count: nx * nyz * nyz };
}

/** Der Auslass in der Stirnfläche, aus dem Durchmesser (Breite D/3, Tiefe D/6 — bei Ø 90 die
    30 × 15 mm, mit denen die Seite immer gerechnet hat): Randbedingung der Rechnung, keine
    Eingabe. Vorgabe für spec.outletW/outletH — hier UND in js/sph/domain.js (sleeveSetup); die
    Werkzeugseite (kammer.js) legt sie schon beim Aufstellen des Problems fest. */
export const outletFor = d => ({ outletW: d / 3, outletH: d / 6 });

/**
 * Das Gitter der Kammer.
 *   spec  { d, length, fill (0…1), outletW, outletH }  in mm
 *   h     Zellkante mm
 * → { dims, origin, h, N, flags, sensor, shape, gates, inletDir, axis,
 *     level (mm), fluidCells, cells (in der Kammer) }
 */
export function buildSleeveDomain(spec, h) {
  const { dims } = cellCount(spec, h);
  const [nx, ny, nz] = dims;
  const N = nx * ny * nz;
  const R = spec.d / 2;
  const pad = 2;
  /* Ursprung so, dass Zelle `pad` bei x = 0 liegt und die Achse in der
     Mitte des y/z-Rasters. */
  const origin = [-pad * h, -R - pad * h + (spec.d - Math.ceil(spec.d / h) * h) / 2, -R - pad * h + (spec.d - Math.ceil(spec.d / h) * h) / 2];
  const { WALL, GAS, INTERFACE, FLUID, INLET, OUTLET } = FLAG;
  const flags = new Uint32Array(N).fill(WALL);
  const shape = new Uint8Array(N);
  const sensor = new Uint32Array(N);
  const level = fillLevel(spec.fill, R);
  const yLevel = -R + level;
  let fluidCells = 0, cells = 0;
  const def = outletFor(spec.d);
  const ow = Math.max(h, spec.outletW || def.outletW), oh = Math.max(h, spec.outletH || def.outletH);
  let outlet = 0, sens = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = origin[0] + i * h, y = origin[1] + j * h, z = origin[2] + k * h;
    if (y * y + z * z > R * R) continue;                       // außerhalb des Zylinders
    if (x < 0 || x >= spec.length) continue;                    // vor dem Kolben, hinter dem Ende
    const idx = (k * ny + j) * nx + i;
    shape[idx] = 1;
    cells++;
    /* Der Laufkanal: oben in der Stirnfläche, die letzte Zellschicht. */
    const inOutlet = Math.abs(z) <= ow / 2 && y >= R - oh;
    if (x >= spec.length - h && inOutlet) { flags[idx] = OUTLET; outlet++; continue; }
    if (x >= spec.length - 2.5 * h && inOutlet) { sensor[idx] = 1; sens++; }
    const below = yLevel - y;
    const wet = below > -0.5 * h;
    /* Die Kolbenfläche: Einlass, wo Schmelze an ihr steht; darüber ist
       sie Wand — eine Kolbenfläche über dem Spiegel darf keine Quelle
       sein, sonst tränkt sie die Luft daneben. */
    if (i === pad) { flags[idx] = wet ? INLET : WALL; continue; }
    if (below >= 0.5 * h) { flags[idx] = FLUID; fluidCells++; }
    else if (wet) { flags[idx] = INTERFACE; fluidCells++; }
    else flags[idx] = GAS;
  }
  /* Front überall dort, wo Luft an Schmelze grenzt; volle Zellen ohne
     Luftnachbarn bleiben voll. */
  const OFF = C.map(c => c[0] + c[1] * nx + c[2] * nx * ny);
  for (let idx = 0; idx < N; idx++) {
    if (flags[idx] !== GAS) continue;
    for (let q = 1; q < C.length; q++) {
      const f = flags[idx + OFF[q]];
      if (f === FLUID || f === INLET) { flags[idx] = INTERFACE; break; }
    }
  }
  return {
    dims, origin, h, N, flags, sensor, shape,
    gates: [{ id: 'Laufkanal', outlet, sensor: sens }],
    inletDir: 1, axis: [1, 0, 0], level, yLevel, R, fluidCells, cells, spec
  };
}

/** Hydrostatische Dichte für den Start: ρ = 1 + 3·g·(Tiefe unter dem
    Spiegel) in Gittereinheiten (c_s² = 1/3) — so steht die Schmelze
    unter Schwerkraft still, statt sich erst zusammenzudrücken. */
export function hydrostatic(domain, gLat) {
  const [nx, ny] = domain.dims;
  const rho0 = new Float32Array(domain.N).fill(1);
  const { FLUID, INTERFACE, INLET } = FLAG;
  for (let idx = 0; idx < domain.N; idx++) {
    const fl = domain.flags[idx];
    if (fl !== FLUID && fl !== INTERFACE && fl !== INLET) continue;
    const j = Math.floor(idx / nx) % ny;
    const y = domain.origin[1] + j * domain.h;
    const depth = Math.max(0, (domain.yLevel - y) / domain.h);
    rho0[idx] = 1 + 3 * gLat * depth;
  }
  return rho0;
}

/** Eingeschlossene Luft: Gaszellen (Füllstand < ½), die nicht mit der
    größten Luftblase zusammenhängen — in Zellen. `fill` als Uint8Array
    (0…255) oder Float32Array (0…1). */
export function enclosedGas(fill, domain) {
  const [nx, ny, nz] = domain.dims;
  const N = domain.N;
  const half = fill instanceof Uint8Array ? 128 : 0.5;
  const gas = new Uint8Array(N);
  let total = 0;
  for (let idx = 0; idx < N; idx++) if (domain.shape[idx] && fill[idx] < half) { gas[idx] = 1; total++; }
  const comp = new Int32Array(N).fill(-1);
  const sizes = [];
  const stack = new Int32Array(N);
  const nxy = nx * ny;
  for (let seed = 0; seed < N; seed++) {
    if (!gas[seed] || comp[seed] >= 0) continue;
    const id = sizes.length;
    let size = 0, sp = 0;
    stack[sp++] = seed; comp[seed] = id;
    while (sp) {
      const idx = stack[--sp];
      size++;
      const i = idx % nx, j = Math.floor(idx / nx) % ny, k = Math.floor(idx / nxy);
      const nb = [];
      if (i > 0) nb.push(idx - 1); if (i < nx - 1) nb.push(idx + 1);
      if (j > 0) nb.push(idx - nx); if (j < ny - 1) nb.push(idx + nx);
      if (k > 0) nb.push(idx - nxy); if (k < nz - 1) nb.push(idx + nxy);
      for (const q of nb) if (gas[q] && comp[q] < 0) { comp[q] = id; stack[sp++] = q; }
    }
    sizes.push(size);
  }
  const largest = sizes.length ? Math.max(...sizes) : 0;
  return { enclosed: total - largest, total, bubbles: Math.max(0, sizes.length - 1) };
}
