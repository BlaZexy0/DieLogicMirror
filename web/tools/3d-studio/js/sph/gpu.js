/* Der Partikelkern auf der Grafikkarte — WebGPU, WGSL.

   Dieselben Formeln wie js/sph/wcsph.js, partikelweise parallel, je
   Zeitschritt drei Dinge: das Suchgitter leeren (clearBuffer), die
   Partikel in die Zellen einsortieren (`bin`: je Zelle ein Zähler und
   K feste Fächer — ein Partikel, für das kein Fach mehr frei ist,
   bleibt für die anderen unsichtbar, kommt aber selbst weiter; K ist
   so groß, dass das nicht vorkommt), dann der Schritt (`update`: Druck
   der Nachbarn aus deren Dichte, Kräfte, Kontinuität, vorwärts, Wände,
   Auslass und Melder). Ort und Geschwindigkeit liegen doppelt vor:
   gelesen wird A, geschrieben B, und die Rollen wechseln je Schritt —
   sonst läse ein Thread den schon bewegten Nachbarn.

   Die Steuerwerte je Schritt (Zeitschritt, Kolben, Zähigkeit) stehen
   in einem Uniform-Puffer mit 512 Byte je Schritt; ein Paket von
   Schritten ist EIN Befehlspuffer. Gelesen wird nur für ein Bild:
   Orte, Geschwindigkeiten, Melder — über einen Zwischenpuffer.

   Acht Speicherpuffer, mehr erlaubt WebGPU je Shader nicht: Orte und
   Geschwindigkeiten je zweimal, das Gitter (Zähler und Fächer in
   einem), die Melder, das Abstandsfeld und die Rollen (Flag und Melder
   in einem Wort). Gibt es kein WebGPU, meldet createGpuSphSolver das mit
   einem Fehler. Einen Rückfall auf den JavaScript-Kern gibt es dabei
   nicht mehr: welcher Kern läuft, entscheidet sich vorher (probeGpu,
   kernelOf in engines/sph.js), und scheitert die Grafikkarte doch, endet
   der Lauf als „Rechnung gescheitert" (core.js).

   Verlorene Karte und gescheitertes Anlegen wie beim Gitter (js/lbm/gpu.js):
   eine gewöhnliche Meldung statt eines AbortError, und Gerät und Puffer
   gehen wieder. */

import { SUPPORT } from './kernel.js';
import { PARAMS, NEVER, KIND } from './wcsph.js';
import { failedSetup, openDevice, lostTracker, makeBuffer, compileShader, readBuffer } from '../lbm/webgpu.js';

const WG = 64;
const UNIFORM_STRIDE = 512;
const BATCH = 32;
/** Fächer je Zelle. Im Träger 2h = 2,4 d stehen in Ruhe rund 14
    Partikel je Zelle; gestaucht an einer Wand auch 25. */
const SLOTS = 48;

function wgsl() {
  return /* wgsl */`
struct U {
  n: u32, step: u32, k: u32, cells: u32,
  dt: f32, uin: f32, piston: f32, alpha: f32,
  h: f32, c0: f32, rho0: f32, mass: f32,
  bt: f32, delta: f32, pad0: f32, rb: f32,
  g: vec4<f32>,
  gmin: vec4<f32>,
  gdims: vec4<u32>,
  smin: vec4<f32>,
  sdims: vec4<u32>,
  fmin: vec4<f32>,
  fdims: vec4<u32>,
  bnd: vec4<f32>,
  bnd2: vec4<f32>,
  axis: vec4<f32>,
  rate0: vec4<f32>,
  rate1: vec4<f32>
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> posIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velIn: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> posOut: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> velOut: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> grid: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> gate: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> sdf: array<f32>;
@group(0) @binding(8) var<storage, read_write> roles: array<u32>;

const DEAD = ${KIND.DEAD}u; const FLUID = ${KIND.FLUID}u; const INFLOW = ${KIND.INFLOW}u;
const GAMMA = ${PARAMS.gamma}.0;
const PI = 3.14159265358979;

fn kernDW(r: f32, h: f32) -> f32 {
  let q = r / h;
  if (q >= 2.0 || r <= 0.0) { return 0.0; }
  let t = 1.0 - 0.5 * q;
  return 21.0 / (16.0 * PI * h * h * h) * (-5.0 * q * t * t * t) / h;
}
fn cellOf(p: vec3<f32>) -> u32 {
  let c = u.gmin.w;
  let i = clamp(i32(floor((p.x - u.gmin.x) / c)), 0, i32(u.gdims.x) - 1);
  let j = clamp(i32(floor((p.y - u.gmin.y) / c)), 0, i32(u.gdims.y) - 1);
  let k = clamp(i32(floor((p.z - u.gmin.z) / c)), 0, i32(u.gdims.z) - 1);
  return (u32(k) * u.gdims.y + u32(j)) * u.gdims.x + u32(i);
}
fn rateOf(k: u32) -> f32 {
  if (k < 4u) { return u.rate0[k]; }
  if (k < 8u) { return u.rate1[k - 4u]; }
  return 1e30;
}
fn tait(rho: f32) -> f32 {
  return max(0.0, u.bt * (pow(rho / u.rho0, GAMMA) - 1.0));
}
/* Trilinear aus dem Abstandsfeld, außerhalb geklemmt. */
fn sampleSdf(p: vec3<f32>) -> f32 {
  let nx = u.sdims.x; let ny = u.sdims.y; let nz = u.sdims.z;
  let f = clamp((p - u.smin.xyz) / u.smin.w, vec3<f32>(0.0), vec3<f32>(f32(nx) - 1.0001, f32(ny) - 1.0001, f32(nz) - 1.0001));
  let i = u32(floor(f.x)); let j = u32(floor(f.y)); let k = u32(floor(f.z));
  let t = f - vec3<f32>(f32(i), f32(j), f32(k));
  let b = (k * ny + j) * nx + i;
  let c00 = sdf[b] * (1.0 - t.x) + sdf[b + 1u] * t.x;
  let c10 = sdf[b + nx] * (1.0 - t.x) + sdf[b + nx + 1u] * t.x;
  let c01 = sdf[b + nx * ny] * (1.0 - t.x) + sdf[b + nx * ny + 1u] * t.x;
  let c11 = sdf[b + nx * ny + nx] * (1.0 - t.x) + sdf[b + nx * ny + nx + 1u] * t.x;
  return (c00 * (1.0 - t.y) + c10 * t.y) * (1.0 - t.z) + (c01 * (1.0 - t.y) + c11 * t.y) * t.z;
}

@compute @workgroup_size(${WG})
fn bin(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u.n) { return; }
  let p = posIn[i];
  if (u32(p.w) == DEAD) { return; }
  let c = cellOf(p.xyz);
  let slot = atomicAdd(&grid[c], 1u);
  if (slot < u.k) { atomicStore(&grid[u.cells + c * u.k + slot], i); }
}

@compute @workgroup_size(${WG})
fn update(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u.n) { return; }
  let pi4 = posIn[i];
  let vi4 = velIn[i];
  let kind = u32(pi4.w);
  if (kind == DEAD) { posOut[i] = pi4; velOut[i] = vi4; return; }
  let dt = u.dt;
  if (kind == INFLOW) {
    let v = u.uin * u.axis.xyz;
    let p = pi4.xyz + v * dt;
    var kn = INFLOW;
    if (dot(p, u.axis.xyz) >= u.bnd2.z) { kn = FLUID; }
    posOut[i] = vec4<f32>(p, f32(kn));
    velOut[i] = vec4<f32>(v, u.rho0);
    return;
  }
  let xi = pi4.xyz; let vi = vi4.xyz; let rhoi = vi4.w;
  let h = u.h; let H2 = (2.0 * h) * (2.0 * h); let eta2 = 0.01 * h * h;
  let taiRhoi = tait(rhoi);
  let pri = taiRhoi / (rhoi * rhoi);
  var acc = vec3<f32>(0.0); var dr = 0.0;
  let c = u.gmin.w;
  let ci = clamp(i32(floor((xi.x - u.gmin.x) / c)), 0, i32(u.gdims.x) - 1);
  let cj = clamp(i32(floor((xi.y - u.gmin.y) / c)), 0, i32(u.gdims.y) - 1);
  let ck = clamp(i32(floor((xi.z - u.gmin.z) / c)), 0, i32(u.gdims.z) - 1);
  for (var dz = -1; dz <= 1; dz++) {
    let kk = ck + dz; if (kk < 0 || kk >= i32(u.gdims.z)) { continue; }
    for (var dy = -1; dy <= 1; dy++) {
      let jj = cj + dy; if (jj < 0 || jj >= i32(u.gdims.y)) { continue; }
      for (var dx = -1; dx <= 1; dx++) {
        let ii = ci + dx; if (ii < 0 || ii >= i32(u.gdims.x)) { continue; }
        let cc = (u32(kk) * u.gdims.y + u32(jj)) * u.gdims.x + u32(ii);
        let cnt = min(atomicLoad(&grid[cc]), u.k);
        for (var s = 0u; s < cnt; s++) {
          let j = atomicLoad(&grid[u.cells + cc * u.k + s]);
          if (j == i) { continue; }
          let pj4 = posIn[j];
          let rij = xi - pj4.xyz;
          let r2 = dot(rij, rij);
          if (r2 >= H2 || r2 < 1e-30) { continue; }
          let r = sqrt(r2);
          let dw = kernDW(r, h);
          let gr = rij * (dw / r);
          let vj4 = velIn[j];
          let rhoj = vj4.w;
          /* Zustrompartikel tragen den Druck des Partikels, auf das sie wirken. */
          var pj = taiRhoi;
          if (u32(pj4.w) == FLUID) { pj = tait(rhoj); }
          let vij = vi - vj4.xyz;
          let vr = dot(vij, rij);
          var visc = 0.0;
          if (vr < 0.0) { let mu = h * vr / (r2 + eta2); visc = -u.alpha * u.c0 * mu / (0.5 * (rhoi + rhoj)); }
          let f = -u.mass * (pri + pj / (rhoj * rhoj) + visc);
          acc += f * gr;
          dr += u.mass * dot(vij, gr);
          dr += u.delta * h * u.c0 * 2.0 * (rhoj - rhoi) * (-dw * r) / (r2 + eta2) * u.mass / rhoj;
        }
      }
    }
  }
  var v = vi + (acc + u.g.xyz) * dt;
  let sp = length(v);
  let vcl = u.bnd2.y;
  if (sp > vcl) { v = v * (vcl / sp); }
  let rho = max(0.5 * u.rho0, rhoi + dr * dt);
  var p = xi + v * dt;
  var kn = FLUID;
  let rb = u.rb;
  if (u.bnd2.w < 0.5) {
    /* Kammer: Kolbenebene, Zylinder, Stirnwand mit Loch. */
    let s = u.piston;
    if (p.x < s + rb) { p.x = s + rb; if (v.x < u.uin) { v.x = u.uin; } }
    let rr = length(p.yz);
    if (rr > u.bnd.x - rb) {
      let nn = p.yz / rr;
      p = vec3<f32>(p.x, nn * (u.bnd.x - rb));
      let vn = dot(v.yz, nn);
      if (vn > 0.0) { v = vec3<f32>(v.x, v.yz - vn * nn); }
    }
    let inHole = abs(p.z) <= 0.5 * u.bnd.z && p.y >= u.bnd.x - u.bnd.w;
    if (inHole) {
      if (p.x >= u.bnd.y) { kn = DEAD; atomicMin(&gate[0], u.step); }
      else if (p.x >= u.bnd.y - u.bnd2.x) { atomicMin(&gate[0], u.step); }
    } else if (p.x > u.bnd.y - rb) { p.x = u.bnd.y - rb; if (v.x > 0.0) { v.x = 0.0; } }
  } else {
    /* Anguss: die Einlassebene als Kolben, das Abstandsfeld, dann
       Auslass und Melder aus den Rollen. */
    let a = dot(p, u.axis.xyz);
    if (a < u.bnd2.z + rb) {
      p += u.axis.xyz * (u.bnd2.z + rb - a);
      let va = dot(v, u.axis.xyz);
      if (va < u.uin) { v += u.axis.xyz * (u.uin - va); }
    }
    let phi = sampleSdf(p);
    if (phi > -rb) {
      let e = 0.5 * u.smin.w;
      var nrm = vec3<f32>(
        sampleSdf(p + vec3<f32>(e, 0.0, 0.0)) - sampleSdf(p - vec3<f32>(e, 0.0, 0.0)),
        sampleSdf(p + vec3<f32>(0.0, e, 0.0)) - sampleSdf(p - vec3<f32>(0.0, e, 0.0)),
        sampleSdf(p + vec3<f32>(0.0, 0.0, e)) - sampleSdf(p - vec3<f32>(0.0, 0.0, e)));
      let l = length(nrm);
      if (l > 0.0) { nrm = nrm / l; } else { nrm = vec3<f32>(0.0, 1.0, 0.0); }
      p -= nrm * (phi + rb);
      let vn = dot(v, nrm);
      if (vn > 0.0) { v -= vn * nrm; }
    }
    let fc = u.fmin.w;
    let fi = i32(round((p.x - u.fmin.x) / fc)); let fj = i32(round((p.y - u.fmin.y) / fc)); let fk = i32(round((p.z - u.fmin.z) / fc));
    if (fi >= 0 && fj >= 0 && fk >= 0 && fi < i32(u.fdims.x) && fj < i32(u.fdims.y) && fk < i32(u.fdims.z)) {
      let role = roles[(u32(fk) * u.fdims.y + u32(fj)) * u.fdims.x + u32(fi)];
      let flag = role & 0xFFFFu; let sen = role >> 16u;
      if (sen > 0u) {
        let k = sen - 1u;
        atomicMin(&gate[3u * k], u.step);
        atomicMin(&gate[3u * k + 1u], u32(u.piston * 1e6));
        if (flag == u.fdims.w) {
          /* Der gedrosselte Auslass: Partikel je Meter Kolbenweg ab der Ankunft. */
          let sArr = f32(atomicLoad(&gate[3u * k + 1u])) * 1e-6;
          let quota = u32(max(0.0, floor(rateOf(k) * (u.piston - sArr))));
          if (atomicLoad(&gate[3u * k + 2u]) < quota) { atomicAdd(&gate[3u * k + 2u], 1u); kn = DEAD; }
        }
      } else if (flag == u.fdims.w) { kn = DEAD; }
    }
  }
  posOut[i] = vec4<f32>(p, f32(kn));
  velOut[i] = vec4<f32>(v, rho);
}
`;
}

/**
 * Den GPU-Kern anlegen — gleiche Rolle wie createSphSolver, Lesen asynchron:
 *   run(ctrls)              n Schritte mit ctrls[k] = { dt, uIn, piston, step, alpha? }
 *   readPositions()         Float32Array(4·n)  x y z Art
 *   readVelocities()        Float32Array(4·n)  vx vy vz ρ
 *   readGates()             Uint32Array
 *   settle(steps, dt)       zur Ruhe kommen (hohe Zähigkeit, danach v = 0)
 *   dispose()
 */
export async function createGpuSphSolver(setup, params = {}) {
  const P = { ...PARAMS, ...params };
  const n = setup.n;
  const cellSize = SUPPORT * setup.h;
  const gdims = [0, 1, 2].map(a => Math.max(1, Math.ceil((setup.box.max[a] - setup.box.min[a]) / cellSize) + 1));
  const cells = gdims[0] * gdims[1] * gdims[2];
  const gridWords = cells + cells * SLOTS;
  const need = Math.max(gridWords * 4, 16 * n);
  const device = await openDevice(need, 'Der Partikelsatz', 'Puffer', 'Partikelabstand vergrößern');
  const buffers = [];
  try {
    return await buildSolver(device, buffers, setup, P, { n, cellSize, gdims, cells, gridWords });
  } catch (err) {
    throw failedSetup(device, buffers, err);
  }
}

/* Alles nach requestDevice — wie im Gitter: was angelegt wird, steht in `buffers`. */
async function buildSolver(device, buffers, setup, P, { n, cellSize, gdims, cells, gridWords }) {
  const getLost = lostTracker(device);
  const mk = (size, usage) => makeBuffer(device, buffers, size, usage);
  const ST = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const bufPA = mk(16 * n, ST), bufPB = mk(16 * n, ST), bufVA = mk(16 * n, ST), bufVB = mk(16 * n, ST);
  const bufGrid = mk(gridWords * 4, ST);
  /* Je Anschnitt drei Worte: Ankunftsschritt, Kolbenweg bei Ankunft (µm), Hinausgelassene. */
  const nGates = Math.max(1, setup.gates || 0);
  const gates = new Uint32Array(3 * nGates);
  for (let k = 0; k < nGates; k++) { gates[3 * k] = NEVER; gates[3 * k + 1] = NEVER; gates[3 * k + 2] = 0; }
  const bufG = mk(gates.byteLength, ST);
  const bnd = setup.boundary;
  const isGrid = bnd.type === 'grid';
  const sdfData = isGrid ? bnd.sdf.data : new Float32Array(4);
  const bufS = mk(sdfData.byteLength, ST);
  let roles = new Uint32Array(4);
  if (isGrid && bnd.flags) {
    roles = new Uint32Array(bnd.flags.data.length);
    for (let i = 0; i < roles.length; i++) roles[i] = (bnd.flags.data[i] & 0xFFFF) | ((bnd.flags.sensor ? bnd.flags.sensor[i] : 0) << 16);
  }
  const bufR = mk(roles.byteLength, ST);
  const bufUni = mk(UNIFORM_STRIDE * BATCH, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  device.queue.writeBuffer(bufPA, 0, setup.pos, 0, 4 * n); device.queue.writeBuffer(bufPB, 0, setup.pos, 0, 4 * n);
  device.queue.writeBuffer(bufVA, 0, setup.vel, 0, 4 * n); device.queue.writeBuffer(bufVB, 0, setup.vel, 0, 4 * n);
  device.queue.writeBuffer(bufG, 0, gates);
  device.queue.writeBuffer(bufS, 0, sdfData);
  device.queue.writeBuffer(bufR, 0, roles);

  const module = await compileShader(device, wgsl());
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }))
    ]
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const [pipeBin, pipeUpdate] = await Promise.all(['bin', 'update'].map(entryPoint =>
    device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint } })));
  const bind = (pa, va, pb, vb) => device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: bufUni, size: UNIFORM_STRIDE } },
      { binding: 1, resource: { buffer: pa } }, { binding: 2, resource: { buffer: va } },
      { binding: 3, resource: { buffer: pb } }, { binding: 4, resource: { buffer: vb } },
      { binding: 5, resource: { buffer: bufGrid } }, { binding: 6, resource: { buffer: bufG } },
      { binding: 7, resource: { buffer: bufS } }, { binding: 8, resource: { buffer: bufR } }
    ]
  });
  const groups = [bind(bufPA, bufVA, bufPB, bufVB), bind(bufPB, bufVB, bufPA, bufVA)];
  const posBufs = [bufPA, bufPB], velBufs = [bufVA, bufVB];
  let parity = 0;
  const wgCount = Math.ceil(n / WG);
  const uni = new ArrayBuffer(UNIFORM_STRIDE * BATCH);
  const u32 = new Uint32Array(uni), f32 = new Float32Array(uni);
  const B = setup.rho0 * setup.c0 * setup.c0 / P.gamma;
  const vClamp = 0.5 * setup.c0;

  function encodeBatch(ctrls) {
    const m = ctrls.length;
    for (let k = 0; k < m; k++) {
      const o = k * UNIFORM_STRIDE / 4, c = ctrls[k];
      u32[o] = n; u32[o + 1] = c.step; u32[o + 2] = SLOTS; u32[o + 3] = cells;
      f32[o + 4] = c.dt; f32[o + 5] = c.uIn || 0; f32[o + 6] = c.piston || 0; f32[o + 7] = c.alpha !== undefined ? c.alpha : P.alpha;
      f32[o + 8] = setup.h; f32[o + 9] = setup.c0; f32[o + 10] = setup.rho0; f32[o + 11] = setup.mass;
      f32[o + 12] = B; f32[o + 13] = P.delta; f32[o + 15] = 0.5 * setup.d;
      const g = setup.g || [0, 0, 0];
      f32[o + 16] = g[0]; f32[o + 17] = g[1]; f32[o + 18] = g[2]; f32[o + 19] = 0;
      f32[o + 20] = setup.box.min[0]; f32[o + 21] = setup.box.min[1]; f32[o + 22] = setup.box.min[2]; f32[o + 23] = cellSize;
      u32[o + 24] = gdims[0]; u32[o + 25] = gdims[1]; u32[o + 26] = gdims[2]; u32[o + 27] = SLOTS;
      if (isGrid) {
        const s = bnd.sdf, f = bnd.flags;
        f32[o + 28] = s.origin[0]; f32[o + 29] = s.origin[1]; f32[o + 30] = s.origin[2]; f32[o + 31] = s.cell;
        u32[o + 32] = s.dims[0]; u32[o + 33] = s.dims[1]; u32[o + 34] = s.dims[2]; u32[o + 35] = 0;
        f32[o + 36] = f ? f.origin[0] : 0; f32[o + 37] = f ? f.origin[1] : 0; f32[o + 38] = f ? f.origin[2] : 0; f32[o + 39] = f ? f.cell : 1;
        u32[o + 40] = f ? f.dims[0] : 0; u32[o + 41] = f ? f.dims[1] : 0; u32[o + 42] = f ? f.dims[2] : 0; u32[o + 43] = bnd.OUTLET;
        f32[o + 44] = 0; f32[o + 45] = 0; f32[o + 46] = 0; f32[o + 47] = 0;
        f32[o + 48] = 0; f32[o + 49] = vClamp; f32[o + 50] = setup.inflow ? setup.inflow.plane : 0; f32[o + 51] = 1;
        const a = setup.inflow ? setup.inflow.axis : [0, 0, 0];
        f32[o + 52] = a[0]; f32[o + 53] = a[1]; f32[o + 54] = a[2]; f32[o + 55] = 0;
        for (let q = 0; q < 8; q++) f32[o + 56 + q] = setup.gateRate && q < setup.gateRate.length ? setup.gateRate[q] : 1e30;
      } else {
        for (let q = 0; q < 8; q++) f32[o + 56 + q] = 1e30;
        for (let q = 28; q < 44; q++) u32[o + q] = 0;
        f32[o + 31] = 1; f32[o + 39] = 1;
        f32[o + 44] = bnd.R; f32[o + 45] = bnd.L; f32[o + 46] = bnd.outletW; f32[o + 47] = bnd.outletH;
        f32[o + 48] = bnd.sensorDepth; f32[o + 49] = vClamp; f32[o + 50] = 0; f32[o + 51] = 0;
        f32[o + 52] = 1; f32[o + 53] = 0; f32[o + 54] = 0; f32[o + 55] = 0;
      }
    }
    device.queue.writeBuffer(bufUni, 0, uni, 0, m * UNIFORM_STRIDE);
    const enc = device.createCommandEncoder();
    for (let k = 0; k < m; k++) {
      enc.clearBuffer(bufGrid, 0, cells * 4);
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeBin);
      pass.setBindGroup(0, groups[parity], [k * UNIFORM_STRIDE]);
      pass.dispatchWorkgroups(wgCount);
      pass.setPipeline(pipeUpdate);
      pass.setBindGroup(0, groups[parity], [k * UNIFORM_STRIDE]);
      pass.dispatchWorkgroups(wgCount);
      pass.end();
      parity ^= 1;
    }
    device.queue.submit([enc.finish()]);
  }

  const read = (buf, byteLength, Ctor) => readBuffer(device, getLost, buf, byteLength, Ctor);

  return {
    n, nMax: n, d: setup.d, h: setup.h, rho0: setup.rho0, mass: setup.mass, c0: setup.c0, cells, gdims, gates: gates.length,
    run(ctrls) {
      for (let s = 0; s < ctrls.length; s += BATCH) encodeBatch(ctrls.slice(s, s + BATCH));
    },
    /* Nach dem letzten Schritt hält der Puffer des NÄCHSTEN Eingangs die neuesten Werte. */
    readPositions: () => read(posBufs[parity], 16 * n, Float32Array),
    readVelocities: () => read(velBufs[parity], 16 * n, Float32Array),
    /** Ankunftsschritt je Anschnitt (NEVER = nie). */
    readGates: async () => { const g = await read(bufG, gates.byteLength, Uint32Array); const out = new Uint32Array(nGates); for (let k = 0; k < nGates; k++) out[k] = g[3 * k]; return out; },
    async settle(steps, dt) {
      const ctrls = [];
      for (let k = 0; k < steps; k++) ctrls.push({ dt, uIn: 0, piston: 0, alpha: P.settleAlpha, step: 0 });
      this.run(ctrls);
      const v = await this.readVelocities();
      for (let i = 0; i < n; i++) { v[4 * i] = 0; v[4 * i + 1] = 0; v[4 * i + 2] = 0; }
      device.queue.writeBuffer(velBufs[parity], 0, v);
      device.queue.writeBuffer(velBufs[parity ^ 1], 0, v);
      device.queue.writeBuffer(bufG, 0, gates);
    },
    dispose() { for (const b of buffers) b.destroy(); device.destroy(); }
  };
}
