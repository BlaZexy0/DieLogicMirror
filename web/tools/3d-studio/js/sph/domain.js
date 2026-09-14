/* Die Partikelsätze: Kammer und Anguss als Partikel mit ihren Wänden.

   Die Kammer ist analytisch (Zylinder um x, Kolbenebene, Stirnwand
   mit dem Laufkanal als Loch); die Schmelze steht beim Start als
   Gitter von Partikeln mit Abstand d bis zum Stand des Füllgrads. Der
   Anguss nimmt das Rollenraster der Lattice-Boltzmann-Seite
   (js/lbm/domain.js: Stahl, Pressrest, Anguss, Auslass und Melder je
   Anschnitt) und macht daraus das Abstandsfeld — mit einer exakten
   euklidischen Abstandstransformation über das Raster, nicht aus den
   Körpern: Anguss und Pressrest sind im Raster EINE Region. Aus den
   beiden Körpern (min zweier Felder) hätte die Fläche, auf der der
   Anguss am Pressrestmantel gekappt ist, den Abstand null — eine
   unsichtbare Wand genau an der Mündung. Hinter dem Pressrest steht
   die Säule der Zustrompartikel, die der Kolben starr vor sich her
   schiebt — sie ist die Füllkammer, so lang wie der Kolbenweg des
   Laufs. Der Pressrest selbst ist beim Start voll, der Anguss leer.

   Der Auslass je Anschnitt ist gedrosselt: er lässt je Meter Kolbenweg
   nur so viele Partikel hinaus, wie sein Flächenanteil am Kolbenstrom
   trägt (gateRate = Anteil · Kolbenfläche / d³), gezählt ab seiner
   Ankunft. Ein freier Auslass wäre ein Abfluss ohne Widerstand — der
   erste erreichte Anschnitt zöge alles, und ein flacher Fächer, in den
   kein Partikel passt, entleerte den Anguss an seiner Mündung.

   Alles in SI (m, s, kg/m³); die Seiten rechnen in mm und wandeln hier.
   Kein DOM — die Tests bauen damit Partikelsätze. */

import { buildDomain as buildLbmDomain } from '../lbm/domain.js';
import { FLAG } from '../lbm/lattice.js';
import { fillLevel, enclosedGas } from '../lbm/sleeve.js';
import { KIND, PARAMS } from './wcsph.js';

/** Höchstzahl Partikel — auf der Grafikkarte, und was JavaScript in
    erträglicher Zeit schafft. */
export const MAX_PARTICLES = 4e5;
export const MAX_PARTICLES_CPU = 2e4;
/** Glättungslänge zu Partikelabstand. */
export const H_OVER_D = 1.2;

/** Auf halbe Millimeter, nie unter 1 mm. */
const roundSpacing = d => Math.max(1, Math.round(d * 2) / 2);

/* ── Kammer ─────────────────────────────────────────────────── */

/** Schmelzevolumen der Kammer in mm³. */
export function sleeveMeltVolume(spec) {
  return Math.PI * spec.d * spec.d / 4 * spec.length * spec.fill;
}

/** Vorschlag für den Partikelabstand: rund `target` Partikel in der Schmelze. */
export function suggestSpacingSleeve(spec, target = 6e4) {
  return roundSpacing(Math.cbrt(sleeveMeltVolume(spec) / target));
}

/** Partikelzahl vorab, ohne zu bauen. */
export function particleCountSleeve(spec, d) {
  return Math.round(sleeveMeltVolume(spec) / (d * d * d));
}

/**
 * Der Partikelsatz der Kammer.
 *   spec  { d, length, fill, outletW, outletH } in mm
 *   d     Partikelabstand mm
 *   opts  { rho0, c0 }  — für die hydrostatische Dichte beim Start
 * → setup für createSphSolver, dazu level, yLevel, R, L (m)
 */
export function sleeveSetup(spec, d, opts = {}) {
  const rho0 = opts.rho0 || 2450, c0 = opts.c0 || 20;
  const dm = d * 1e-3, h = H_OVER_D * dm, rb = 0.5 * dm;
  const R = spec.d * 0.5e-3, L = spec.length * 1e-3;
  const level = fillLevel(spec.fill, spec.d / 2) * 1e-3;
  const yLevel = -R + level;
  const B = rho0 * c0 * c0 / PARAMS.gamma;
  const pts = [];
  const nyz = Math.ceil(R / dm);
  for (let x = rb; x < L - rb + 1e-9; x += dm) {
    for (let j = -nyz; j <= nyz; j++) {
      const y = (j + 0.5) * dm;
      if (y > yLevel - rb) continue;
      for (let k = -nyz; k <= nyz; k++) {
        const z = (k + 0.5) * dm;
        if (y * y + z * z > (R - rb) * (R - rb)) continue;
        pts.push(x, y, z);
      }
    }
  }
  const n = pts.length / 3;
  const pos = new Float32Array(4 * n), vel = new Float32Array(4 * n);
  for (let i = 0; i < n; i++) {
    pos[4 * i] = pts[3 * i]; pos[4 * i + 1] = pts[3 * i + 1]; pos[4 * i + 2] = pts[3 * i + 2]; pos[4 * i + 3] = KIND.FLUID;
    /* Hydrostatisch nach Tait: p = ρ0·g·Tiefe, ρ = ρ0·(p/B + 1)^(1/γ). */
    const depth = Math.max(0, yLevel - pts[3 * i + 1]);
    vel[4 * i + 3] = rho0 * Math.pow(rho0 * 9.81 * depth / B + 1, 1 / PARAMS.gamma);
  }
  const m = 2 * h;
  return {
    nMax: n, n, pos, vel,
    d: dm, h, rho0, mass: rho0 * dm * dm * dm, c0,
    box: { min: [-m, -R - m, -R - m], max: [L + m, R + m, R + m] },
    g: [0, -9.81, 0],
    boundary: { type: 'sleeve', R, L, outletW: (spec.outletW || 30) * 1e-3, outletH: (spec.outletH || 15) * 1e-3, sensorDepth: 2.5 * dm },
    inflow: null,
    gates: 1,
    level, yLevel, R, L, spec
  };
}

/**
 * Eingeschlossene Luft aus einem Partikelbild: die Partikel auf ein
 * Raster der Zellkante `cell` (m) in der Kammer gelegt, belegte Zellen
 * sind Schmelze; Luftzellen, die nicht mit der großen Blase über der
 * Schmelze zusammenhängen, sind eingeschlossen (js/lbm/sleeve.js).
 *   pos    Float32Array(3·n), nur Schmelze — in m, oder mit scale (1e-3 für mm)
 *   s      Kolbenstellung m (dahinter ist Stahl)
 * → { enclosed (m³), bubbles, cells }
 */
export function enclosedAirSleeve(pos, n, setup, s, cell, scale = 1) {
  const { R, L } = setup;
  const c = cell || 1.5 * setup.d;
  const nx = Math.ceil(L / c) + 2, nyz = Math.ceil(2 * R / c) + 2;
  const origin = [-c, -R - c, -R - c];
  const dims = [nx, nyz, nyz];
  const N = nx * nyz * nyz;
  const shape = new Uint8Array(N);
  const fill = new Uint8Array(N);
  for (let k = 0; k < nyz; k++) for (let j = 0; j < nyz; j++) for (let i = 0; i < nx; i++) {
    const x = origin[0] + (i + 0.5) * c, y = origin[1] + (j + 0.5) * c, z = origin[2] + (k + 0.5) * c;
    if (y * y + z * z > R * R || x < s || x > L) continue;
    shape[(k * nyz + j) * nx + i] = 1;
  }
  for (let p = 0; p < n; p++) {
    const i = Math.floor((pos[3 * p] * scale - origin[0]) / c), j = Math.floor((pos[3 * p + 1] * scale - origin[1]) / c), k = Math.floor((pos[3 * p + 2] * scale - origin[2]) / c);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= nyz || k >= nyz) continue;
    fill[(k * nyz + j) * nx + i] = 255;
  }
  const eg = enclosedGas(fill, { dims, N, shape });
  return { enclosed: eg.enclosed * c * c * c, bubbles: eg.bubbles, cells: eg.total };
}

/* ── Anguss ─────────────────────────────────────────────────── */

const INF = 1e20;
/* Eindimensionale Abstandstransformation (Felzenszwalb & Huttenlocher):
   aus f (Quadratabstände entlang der Linie) wird d, die untere Hülle
   der Parabeln. v, z sind Arbeitsfelder der Länge n bzw. n + 1. */
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let sx = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (sx <= z[k]) { k--; sx = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = sx; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Quadratabstand jeder Zelle zur nächsten Quellzelle (mask = 1), in
    Zellen; drei Durchgänge je Achse. */
function edt3(mask, dims) {
  const [nx, ny, nz] = dims;
  const N = nx * ny * nz;
  const g = new Float64Array(N);
  for (let i = 0; i < N; i++) g[i] = mask[i] ? 0 : INF;
  const n = Math.max(nx, ny, nz);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const line = (len, stride, base) => {
    for (let t = 0; t < len; t++) f[t] = g[base + t * stride];
    edt1d(f, len, d, v, z);
    for (let t = 0; t < len; t++) g[base + t * stride] = d[t];
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) line(nx, 1, (k * ny + j) * nx);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) line(ny, nx, k * ny * nx + i);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) line(nz, nx * ny, j * nx + i);
  return g;
}

/**
 * Vorzeichenbehaftetes Abstandsfeld aus dem Rollenraster: innen (keine
 * Wand) negativ, außen positiv, die Fläche eine halbe Zelle vor der
 * Wand; in Metern, wenn cell in Metern ist.
 */
export function signedDistanceFromFlags(flags, dims, cell) {
  const N = flags.length;
  const inside = new Uint8Array(N), wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (flags[i] === FLAG.WALL) wall[i] = 1; else inside[i] = 1; }
  const dIn = edt3(wall, dims), dOut = edt3(inside, dims);
  const sdf = new Float32Array(N);
  for (let i = 0; i < N; i++) sdf[i] = inside[i] ? -(Math.sqrt(dIn[i]) - 0.5) * cell : (Math.sqrt(dOut[i]) - 0.5) * cell;
  return sdf;
}

/* Auslass und Melder je Anschnitt — dort, wo ein Partikel noch
   hinkommt. Der Auslass der Gitterseite ist die letzte Zellschicht vor
   der Austrittsfläche, ihr Melder sitzt anderthalb Zellen davor: im
   Steg und im Übergang, beides zwei bis wenige Millimeter tief, und da
   passt kein Partikel von d/2 Radius hinein. Die Front bliebe davor
   stehen, meldete nie, und der Anguss wäre für die Partikel eine
   Sackgasse, in der sich der Druck staut. Darum entlang der Mittellinie
   des letzten Kanals (die Querschnitte aus js/runner/curve.js: Ort,
   Tangente, Breite, Tiefe) vom Anschnitt zurück bis zum letzten
   Querschnitt, der tief genug für ein Partikel ist: die Scheiben der
   letzten halben Weite davor sind der Auslass (Partikel gehen dort
   hinaus, wie im Gitter am Anschnitt), die der zwei Abstände davor der
   Melder. Die Ankunft ist damit die am Übergang zum Anschnitt, ein paar
   Millimeter vor der des Gitters; feinere Partikel rücken sie näher
   heran. Die Rollen der Gitterseite bleiben darunter erhalten. */
export function gateZones(lbm, d, hFlags) {
  const flags = new Uint32Array(lbm.flags), sensor = new Uint32Array(lbm.sensor);
  const [nx, ny, nz] = lbm.dims;
  const cellsOf = (pMin, pMax, fn) => {
    const i0 = Math.max(0, Math.floor((pMin[0] - lbm.origin[0]) / hFlags)), i1 = Math.min(nx - 1, Math.ceil((pMax[0] - lbm.origin[0]) / hFlags));
    const j0 = Math.max(0, Math.floor((pMin[1] - lbm.origin[1]) / hFlags)), j1 = Math.min(ny - 1, Math.ceil((pMax[1] - lbm.origin[1]) / hFlags));
    const k0 = Math.max(0, Math.floor((pMin[2] - lbm.origin[2]) / hFlags)), k1 = Math.min(nz - 1, Math.ceil((pMax[2] - lbm.origin[2]) / hFlags));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const idx = (k * ny + j) * nx + i;
      if (lbm.flags[idx] === FLAG.WALL) continue;
      fn(idx, [lbm.origin[0] + i * hFlags, lbm.origin[1] + j * hFlags, lbm.origin[2] + k * hFlags]);
    }
  };
  const deepEnough = d + 0.5 * hFlags;
  let k = 0;
  for (const e of lbm.net.edges) {
    if (e.to.type !== 'gate' || !e.sections.length) continue;
    const gi = k++;
    const secs = e.sections;
    /* Der letzte Querschnitt, in den ein Partikel passt. */
    let f = secs.length - 1;
    while (f > 0 && secs[f].sec.depth < deepEnough) f--;
    /* Weglänge entlang der Mittellinie, vom Querschnitt f rückwärts. */
    const back = new Float64Array(secs.length);
    for (let i = f - 1; i >= 0; i--) {
      const a = secs[i].p, b = secs[i + 1].p;
      back[i] = back[i + 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    for (let i = 0; i <= f; i++) {
      if (back[i] > 2 * d + hFlags) continue;
      const sc = secs[i], half = (i < secs.length - 1 ? Math.hypot(secs[i + 1].p[0] - sc.p[0], secs[i + 1].p[1] - sc.p[1], secs[i + 1].p[2] - sc.p[2]) : 1) * 0.5 + 0.01;
      const w = sc.sec.width / 2 + hFlags, dep = sc.sec.depth + hFlags;
      const r = Math.hypot(w, dep) + half;
      const outlet = back[i] <= 0.5 * d + 0.5 * hFlags;
      cellsOf([sc.p[0] - r, sc.p[1] - r, sc.p[2] - r], [sc.p[0] + r, sc.p[1] + r, sc.p[2] + r], (idx, c) => {
        const dx = c[0] - sc.p[0], dy = c[1] - sc.p[1], dz = c[2] - sc.p[2];
        const along = dx * sc.t[0] + dy * sc.t[1] + dz * sc.t[2];
        if (Math.abs(along) > Math.max(half, 0.5 * hFlags)) return;
        const lat = dx * sc.u[0] + dy * sc.u[1] + dz * sc.u[2];
        if (Math.abs(lat) > w) return;
        const ver = dx * sc.v[0] + dy * sc.v[1] + dz * sc.v[2];
        if (ver < -hFlags || ver > dep) return;
        if (!sensor[idx]) sensor[idx] = gi + 1;
        if (outlet) flags[idx] = FLAG.OUTLET;
      });
    }
  }
  return { flags, sensor };
}

/* Zwei Einheitsvektoren quer zur Achse (die Achse ist ±x, ±y oder ±z). */
function basis(axis) {
  if (Math.abs(axis[0]) > 0.5) return [[0, 1, 0], [0, 0, 1]];
  if (Math.abs(axis[1]) > 0.5) return [[0, 0, 1], [1, 0, 0]];
  return [[1, 0, 0], [0, 1, 0]];
}

/** Vorschlag für den Partikelabstand des Angusses: rund `target`
    Partikel in Pressrest und Anguss (das Volumen des Angusses aus
    dem Netz kennt die Seite; hier reicht der Pressrest). */
export function suggestSpacingRunner(g, runnerVolume, target = 4e4) {
  const b = g.biscuit;
  const vol = Math.PI * b.d * b.d / 4 * b.t + (runnerVolume || 0);
  return roundSpacing(Math.cbrt(vol / target));
}

/** Partikelzahl vorab: Pressrest voll plus die Säule des Kolbenwegs. */
export function particleCountRunner(g, d, travel) {
  const b = g.biscuit;
  const A = Math.PI * b.d * b.d / 4;
  return Math.round(A * (b.t + (travel || 0)) / (d * d * d));
}

/**
 * Der Partikelsatz des Angusses.
 *   g        Angussgraph
 *   d        Partikelabstand mm
 *   opts     { rho0, c0, travel (mm — so lang ist die Zustromsäule), onProgress(p, was) }
 * → setup für createSphSolver, dazu lbm (Rollenraster), nFluid, nInflow
 */
export async function runnerSetup(g, d, opts = {}) {
  const rho0 = opts.rho0 || 2450, c0 = opts.c0 || 100;
  const travel = Math.max(d, opts.travel || 0);
  const prog = opts.onProgress || (() => {});
  const dm = d * 1e-3, h = H_OVER_D * dm;

  /* Rollenraster auf dem Partikelabstand (mindestens 2 mm) — Wände,
     Auslass, Melder; daraus das Abstandsfeld. */
  const hFlags = Math.max(d, 2);
  const lbm = await buildLbmDomain(g, hFlags, { onProgress: (p, w) => prog(p * 0.8, 'Rollen · ' + w) });
  prog(0.85, 'Abstandsfeld');
  const cm = hFlags * 1e-3;
  const origin = lbm.origin.map(v => v * 1e-3);
  const sdf = { dims: lbm.dims, origin, cell: cm, data: signedDistanceFromFlags(lbm.flags, lbm.dims, cm) };
  const zones = gateZones(lbm, d, hFlags);
  const flags = { dims: lbm.dims, origin, cell: cm, data: zones.flags, sensor: zones.sensor };

  /* Partikel: der Pressrest voll (Schmelze), dahinter die Säule (Zustrom). */
  const b = g.biscuit;
  const axis = lbm.axis;
  const colLen = travel + 2 * d;
  const [U, V] = basis(axis);
  const r = b.d / 2;
  const p0 = [b.pos[0] - axis[0] * b.t, b.pos[1] - axis[1] * b.t, b.pos[2] - axis[2] * b.t];   // Kolbenfläche, mm
  const disk = [];
  const nr = Math.ceil(r / d);
  for (let j = -nr; j <= nr; j++) for (let k = -nr; k <= nr; k++) {
    const u = (j + 0.5) * d, v = (k + 0.5) * d;
    if (u * u + v * v <= (r - 0.5 * d) * (r - 0.5 * d)) disk.push([u, v]);
  }
  const pts = [], kinds = [];
  const put = (sPos, kind) => {
    for (const [u, v] of disk) {
      pts.push((p0[0] + axis[0] * sPos + U[0] * u + V[0] * v) * 1e-3,
        (p0[1] + axis[1] * sPos + U[1] * u + V[1] * v) * 1e-3,
        (p0[2] + axis[2] * sPos + U[2] * u + V[2] * v) * 1e-3);
      kinds.push(kind);
    }
  };
  for (let sPos = 0.5 * d; sPos < b.t - 0.5 * d + 1e-9; sPos += d) put(sPos, KIND.FLUID);
  const nFluid = kinds.length;
  for (let sPos = -0.5 * d; sPos > -colLen; sPos -= d) put(sPos, KIND.INFLOW);
  const n = kinds.length;
  const pos = new Float32Array(4 * n), vel = new Float32Array(4 * n);
  for (let i = 0; i < n; i++) {
    pos[4 * i] = pts[3 * i]; pos[4 * i + 1] = pts[3 * i + 1]; pos[4 * i + 2] = pts[3 * i + 2]; pos[4 * i + 3] = kinds[i];
    vel[4 * i + 3] = rho0;
  }
  const plane = (p0[0] * axis[0] + p0[1] * axis[1] + p0[2] * axis[2]) * 1e-3;

  /* Die Drossel je Anschnitt: Flächenanteil am Kolbenstrom, in Partikeln
     je Meter Kolbenweg. */
  const areas = lbm.gates.map(gt => { const node = g.nodes[gt.id]; const ga = node && node.gate; return ga ? Math.max(0.1, (ga.w || 10) * (ga.h || 2)) : 1; });
  const areaSum = areas.reduce((a, b) => a + b, 0) || 1;
  const pistonArea = Math.PI * (r * 1e-3) * (r * 1e-3);
  const gateRate = Float32Array.from(areas.map(a => a / areaSum * pistonArea / (dm * dm * dm)));

  /* Suchgitter: das Raster samt der Säule dahinter, mit Rand. */
  const m = 2 * h;
  const bmin = [0, 1, 2].map(a => origin[a] - m), bmax = [0, 1, 2].map(a => origin[a] + (lbm.dims[a] - 1) * cm + m);
  for (let a = 0; a < 3; a++) {
    const back = (p0[a] - axis[a] * colLen) * 1e-3;
    bmin[a] = Math.min(bmin[a], back - m); bmax[a] = Math.max(bmax[a], back + m);
  }
  prog(1, 'fertig');
  return {
    nMax: n, n, pos, vel,
    d: dm, h, rho0, mass: rho0 * dm * dm * dm, c0,
    box: { min: bmin, max: bmax },
    g: [0, 0, 0],
    boundary: { type: 'grid', sdf, flags, OUTLET: FLAG.OUTLET },
    inflow: { axis: axis.slice(), plane },
    gates: lbm.gates.length, gateRate,
    lbm, nFluid, nInflow: n - nFluid, sdf
  };
}

/** Füllgrad des Angusses aus einem Partikelbild: belegte Angusszellen
    des Rollenrasters gegen alle. Ein Partikel belegt die acht Zellen um
    sich (die Zellkante ist der Partikelabstand) — die nächste allein
    ließe im vollen Kanal jede dritte Zelle leer, weil die Partikel nie
    auf dem Raster sitzen. */
export function runnerFillFraction(pos, n, setup, scale = 1) {
  const fl = setup.boundary.flags;
  const [nx, ny, nz] = fl.dims;
  const hit = new Uint8Array(nx * ny * nz);
  for (let p = 0; p < n; p++) {
    const fx = (pos[3 * p] * scale - fl.origin[0]) / fl.cell, fy = (pos[3 * p + 1] * scale - fl.origin[1]) / fl.cell, fz = (pos[3 * p + 2] * scale - fl.origin[2]) / fl.cell;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
    for (let c = 0; c < 8; c++) {
      const i = i0 + (c & 1), j = j0 + ((c >> 1) & 1), k = k0 + (c >> 2);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
      hit[(k * ny + j) * nx + i] = 1;
    }
  }
  let all = 0, full = 0;
  for (let idx = 0; idx < hit.length; idx++) {
    const f = fl.data[idx];
    if (f !== FLAG.GAS && f !== FLAG.INTERFACE) continue;
    all++; if (hit[idx]) full++;
  }
  return all ? full / all : 0;
}
