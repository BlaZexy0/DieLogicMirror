/* Der Kern auf der Grafikkarte — WebGPU, WGSL.

   Dieselben fünf Durchgänge wie js/lbm/fslbm.js, zellweise parallel:
   je Durchgang ein Compute-Shader über alle Zellen, je Zeitschritt fünf
   Aufrufe. Die Puffer sind dieselben wie im JavaScript-Kern (je Richtung
   ein Feld über alle Zellen, ein Gleitkomma- und ein Ganzzahlpuffer je
   Zelle nach js/lbm/lattice.js), damit ein Test beide Kerne auf demselben
   Gitter vergleichen kann. Die Verteilungen liegen doppelt vor und
   wechseln je Schritt die Rolle; zwei Bindungsgruppen, eine je Richtung
   des Wechsels.

   Die Kolbengeschwindigkeit und der Schrittzähler ändern sich jeden
   Schritt: sie stehen in einem Uniform-Puffer mit einem Eintrag je
   Schritt (256 Byte Abstand, dynamischer Versatz), und ein Paket von
   Schritten wird mit EINEM Befehlspuffer abgeschickt. Gelesen wird nur,
   wenn die Seite ein Bild will: Füllstand, Ankunft, Melder — über einen
   Zwischenpuffer, der auf den Hauptspeicher abgebildet wird.

   Gibt es kein WebGPU (navigator.gpu fehlt), meldet createGpuSolver das
   mit einem Fehler; die Seite fällt dann auf den JavaScript-Kern zurück.

   Geht die Karte mitten im Lauf verloren (Treiber, Ruhezustand), sagt es
   device.lost — und das Lesen danach scheitert mit einem AbortError, den der
   Rahmen als „Abbrechen" läse. Beides wird zu EINER gewöhnlichen Meldung
   (lostError). Scheitert das Anlegen nach requestDevice (ein Shader, eine
   Pipeline), gehen Gerät und Puffer gleich wieder, statt liegen zu bleiben. */

import { Q, C, W, OPP, FLAG, NEVER, NO_PLUNGER, FF, FU } from './lattice.js';
import { PARAMS } from './fslbm.js';

const WG = 64;                                  // Zellen je Arbeitsgruppe
const UNIFORM_STRIDE = 256;                     // Byte je Schritt im Uniform-Puffer
const BATCH = 32;                               // Schritte je Befehlspuffer

/* Der Shader — aus den Tabellen von js/lbm/lattice.js zusammengesetzt. */
function wgsl(nx, ny) {
  const off = C.map(c => c[0] + c[1] * nx + c[2] * nx * ny);
  const cs = C.map(c => `vec3<f32>(${c[0]}.0, ${c[1]}.0, ${c[2]}.0)`).join(', ');
  const ws = W.map(w => w.toFixed(17)).join(', ');
  const opps = OPP.join('u, ') + 'u';
  const offs = off.join(', ');
  const F = FLAG;
  return /* wgsl */`
struct U {
  n: u32, nx: u32, ny: u32, step: u32,
  tau0: f32, csq: f32, kappa: f32, umax: f32,
  uin: vec4<f32>,
  g: vec4<f32>,
  indir: u32, inoff: i32, ip: u32, pad1: u32
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> fa: array<f32>;
@group(0) @binding(2) var<storage, read_write> fb: array<f32>;
@group(0) @binding(3) var<storage, read_write> ci: array<f32>;   // Zellwerte vor dem Schritt
@group(0) @binding(4) var<storage, read_write> cf: array<f32>;   // Zellwerte nach Durchgang 1
@group(0) @binding(5) var<storage, read_write> cu: array<u32>;
@group(0) @binding(6) var<storage, read_write> gate: array<atomic<u32>>;

const Q = ${Q}u;
/* Als var<private>, nicht const: die Tabellen werden mit der Laufvariablen
   der Richtungsschleife indiziert, und das erlaubt WGSL nur für Variablen. */
var<private> CV = array<vec3<f32>, ${Q}>(${cs});
var<private> WV = array<f32, ${Q}>(${ws});
var<private> OPPV = array<u32, ${Q}>(${opps});
var<private> OFFV = array<i32, ${Q}>(${offs});
const WALL = ${F.WALL}u; const GAS = ${F.GAS}u; const INTERFACE = ${F.INTERFACE}u; const FLUID = ${F.FLUID}u;
const INLET = ${F.INLET}u; const OUTLET = ${F.OUTLET}u; const TO_FLUID = ${F.TO_FLUID}u; const TO_GAS = ${F.TO_GAS}u;
const TO_IF_GAS = ${F.TO_IF_GAS}u; const TO_IF_FLUID = ${F.TO_IF_FLUID}u;
const NEVER = ${NEVER}u;
const NO_PLUNGER = ${NO_PLUNGER}u;

fn MASS(i: u32) -> u32 { return ${FF.MASS}u * u.n + i; }
fn RHO(i: u32) -> u32 { return ${FF.RHO}u * u.n + i; }
fn UX(i: u32) -> u32 { return ${FF.UX}u * u.n + i; }
fn UY(i: u32) -> u32 { return ${FF.UY}u * u.n + i; }
fn UZ(i: u32) -> u32 { return ${FF.UZ}u * u.n + i; }
fn EPS(i: u32) -> u32 { return ${FF.EPS}u * u.n + i; }
fn EXCESS(i: u32) -> u32 { return ${FF.EXCESS}u * u.n + i; }
fn FL(i: u32) -> u32 { return ${FU.FLAG}u * u.n + i; }
fn NEW1(i: u32) -> u32 { return ${FU.NEW1}u * u.n + i; }
fn NEW2(i: u32) -> u32 { return ${FU.NEW2}u * u.n + i; }
fn COUNT(i: u32) -> u32 { return ${FU.COUNT}u * u.n + i; }
fn ARRIVAL(i: u32) -> u32 { return ${FU.ARRIVAL}u * u.n + i; }
fn SENSOR(i: u32) -> u32 { return ${FU.SENSOR}u * u.n + i; }
fn SHAPE(i: u32) -> u32 { return ${FU.SHAPE}u * u.n + i; }
fn nb(idx: u32, i: u32) -> u32 { return u32(i32(idx) + OFFV[i]); }
fn feq(i: u32, rho: f32, v: vec3<f32>) -> f32 {
  let cu_ = dot(CV[i], v);
  return WV[i] * rho * (1.0 + 3.0 * cu_ + 4.5 * cu_ * cu_ - 1.5 * dot(v, v));
}
fn recon(i: u32, v: vec3<f32>, fopp: f32) -> f32 { return feq(i, 1.0, v) + feq(OPPV[i], 1.0, v) - fopp; }

/* 0 — der wandernde Kolben: Schicht ip wird Kolben, alles davor Stahl */
@compute @workgroup_size(${WG})
fn pass0(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u.n || u.ip == NO_PLUNGER) { return; }
  let i = idx % u.nx;
  if (i > u.ip) { return; }
  let fl = cu[FL(idx)];
  if (fl == WALL || (fl == INLET && i == u.ip)) { return; }
  if (i < u.ip || cu[SHAPE(idx)] != 1u || fl == GAS || fl == OUTLET) {
    cu[FL(idx)] = WALL; cu[NEW1(idx)] = WALL; cu[NEW2(idx)] = WALL;
    ci[MASS(idx)] = 0.0; ci[EPS(idx)] = 0.0;
  } else {
    let vin = u.uin.xyz;
    cu[FL(idx)] = INLET; cu[NEW1(idx)] = INLET; cu[NEW2(idx)] = INLET;
    ci[RHO(idx)] = 1.0; ci[UX(idx)] = vin.x; ci[UY(idx)] = vin.y; ci[UZ(idx)] = vin.z;
    ci[MASS(idx)] = 1.0; ci[EPS(idx)] = 1.0;
    for (var q = 0u; q < Q; q++) { fa[q * u.n + idx] = feq(q, 1.0, vin); }
  }
}

/* 1 — strömen, stoßen, Masse */
@compute @workgroup_size(${WG})
fn pass1(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u.n) { return; }
  let fl = cu[FL(idx)];
  if (fl == INLET) {
    let n2 = u32(i32(idx) + u.inoff);
    let nfl = cu[FL(n2)];
    let vin = u.uin.xyz;
    if (u.indir != 0u && (nfl == FLUID || nfl == INTERFACE)) {
      let r = ci[RHO(n2)];
      let v2 = vec3<f32>(ci[UX(n2)], ci[UY(n2)], ci[UZ(n2)]);
      for (var i = 0u; i < Q; i++) { fb[i * u.n + idx] = feq(i, r, vin) + (fa[i * u.n + n2] - feq(i, r, v2)); }
      cf[RHO(idx)] = r;
    } else {
      for (var i = 0u; i < Q; i++) { fb[i * u.n + idx] = feq(i, 1.0, vin); }
      cf[RHO(idx)] = 1.0;
    }
    cf[UX(idx)] = vin.x; cf[UY(idx)] = vin.y; cf[UZ(idx)] = vin.z;
    cf[MASS(idx)] = 1.0; cf[EPS(idx)] = 1.0; cf[EXCESS(idx)] = 0.0;
    return;
  }
  if (fl != FLUID && fl != INTERFACE) {
    /* Unbeteiligt: die Werte mitnehmen, damit der neue Satz vollständig ist. */
    cf[MASS(idx)] = ci[MASS(idx)]; cf[RHO(idx)] = ci[RHO(idx)];
    cf[UX(idx)] = ci[UX(idx)]; cf[UY(idx)] = ci[UY(idx)]; cf[UZ(idx)] = ci[UZ(idx)];
    cf[EPS(idx)] = ci[EPS(idx)]; cf[EXCESS(idx)] = ci[EXCESS(idx)];
    return;
  }
  let uo = vec3<f32>(ci[UX(idx)], ci[UY(idx)], ci[UZ(idx)]);
  let epsOld = ci[EPS(idx)];
  var nrm = vec3<f32>(0.0);
  if (fl == INTERFACE) {
    var e: array<f32, 6>;
    let ids = array<u32, 6>(nb(idx, 2u), nb(idx, 1u), nb(idx, 4u), nb(idx, 3u), nb(idx, 6u), nb(idx, 5u));
    for (var k = 0u; k < 6u; k++) {
      let q = ids[k];
      if (cu[FL(q)] == WALL) { e[k] = epsOld; } else { e[k] = ci[EPS(q)]; }
    }
    nrm = vec3<f32>(e[0] - e[1], e[2] - e[3], e[4] - e[5]);
    let l = length(nrm);
    if (l > 1e-12) { nrm = nrm / l; } else { nrm = vec3<f32>(0.0); }
  }
  var fi: array<f32, ${Q}>;
  for (var i = 0u; i < Q; i++) {
    let src = u32(i32(idx) - OFFV[i]);
    let nfl = cu[FL(src)];
    let fopp = fa[OPPV[i] * u.n + idx];
    if (nfl == WALL) { fi[i] = fopp; }
    else if (nfl == GAS || nfl == OUTLET) { fi[i] = recon(i, uo, fopp); }
    else if (fl == INTERFACE && i > 0u && dot(nrm, -CV[i]) > 0.0) { fi[i] = recon(i, uo, fopp); }
    else { fi[i] = fa[i * u.n + src]; }
  }
  var dm = 0.0;
  if (fl == INTERFACE) {
    for (var i = 1u; i < Q; i++) {
      let q = nb(idx, i);
      let nfl = cu[FL(q)];
      let ex = fa[OPPV[i] * u.n + q] - fa[i * u.n + idx];
      if (nfl == FLUID || nfl == INLET) { dm += ex; }
      else if (nfl == INTERFACE) { dm += ex * 0.5 * (epsOld + ci[EPS(q)]); }
    }
  }
  var rho = 0.0;
  var v = vec3<f32>(0.0);
  for (var i = 0u; i < Q; i++) { rho += fi[i]; v += CV[i] * fi[i]; }
  rho = max(rho, 1e-9);
  let Fg = rho * u.g.xyz;
  v = (v + 0.5 * Fg) / rho;
  let sp = length(v);
  if (sp > u.umax) { v = v * (u.umax / sp); }
  var fe: array<f32, ${Q}>;
  var pxx = 0.0; var pyy = 0.0; var pzz = 0.0; var pxy = 0.0; var pxz = 0.0; var pyz = 0.0;
  for (var i = 0u; i < Q; i++) {
    fe[i] = feq(i, rho, v);
    let d = fi[i] - fe[i];
    let c = CV[i];
    pxx += c.x * c.x * d; pyy += c.y * c.y * d; pzz += c.z * c.z * d;
    pxy += c.x * c.y * d; pxz += c.x * c.z * d; pyz += c.y * c.z * d;
  }
  let qn = sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2.0 * (pxy * pxy + pxz * pxz + pyz * pyz));
  let tau = 0.5 * (u.tau0 + sqrt(u.tau0 * u.tau0 + 18.0 * 1.4142135623730951 * u.csq * qn / rho));
  let om = 1.0 / tau;
  let fac = 1.0 - 0.5 * om;
  let uF = dot(v, Fg);
  for (var i = 0u; i < Q; i++) {
    let cF = dot(CV[i], Fg);
    let S = fac * WV[i] * (3.0 * cF + 9.0 * dot(CV[i], v) * cF - 3.0 * uF);
    fb[i * u.n + idx] = fi[i] - om * (fi[i] - fe[i]) + S;
  }
  cf[RHO(idx)] = rho; cf[UX(idx)] = v.x; cf[UY(idx)] = v.y; cf[UZ(idx)] = v.z;
  cf[EXCESS(idx)] = 0.0;
  if (fl == FLUID) { cf[MASS(idx)] = rho; cf[EPS(idx)] = 1.0; }
  else {
    let m = ci[MASS(idx)] + dm;
    cf[MASS(idx)] = m;
    cf[EPS(idx)] = clamp(m / rho, 0.0, 1.0);
  }
}

/* 2 — markieren */
@compute @workgroup_size(${WG})
fn pass2(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u.n) { return; }
  let fl = cu[FL(idx)];
  if (fl == WALL) { return; }
  var nf = fl;
  if (fl == INTERFACE) {
    let m = cf[MASS(idx)];
    let r = cf[RHO(idx)];
    var hasGas = false; var hasFluid = false;
    for (var i = 1u; i < Q; i++) {
      let nfl = cu[FL(nb(idx, i))];
      if (nfl == GAS || nfl == OUTLET) { hasGas = true; }
      else if (nfl == FLUID || nfl == INLET) { hasFluid = true; }
    }
    if (m > (1.0 + u.kappa) * r) { nf = TO_FLUID; }
    else if (m < -u.kappa * r) { nf = TO_GAS; }
    else if (!hasGas) { nf = TO_FLUID; }
    else if (!hasFluid && m < 0.1 * r) { nf = TO_GAS; }
  }
  cu[NEW1(idx)] = nf;
}

/* 3 — Nachbarn */
@compute @workgroup_size(${WG})
fn pass3(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u.n) { return; }
  let fl = cu[FL(idx)];
  if (fl == WALL) { return; }
  var nf = cu[NEW1(idx)];
  if (fl == GAS) {
    for (var i = 1u; i < Q; i++) { if (cu[NEW1(nb(idx, i))] == TO_FLUID) { nf = TO_IF_GAS; break; } }
  } else if (fl == FLUID) {
    for (var i = 1u; i < Q; i++) { if (cu[NEW1(nb(idx, i))] == TO_GAS) { nf = TO_IF_FLUID; break; } }
  } else if (nf == TO_GAS) {
    for (var i = 1u; i < Q; i++) { if (cu[NEW1(nb(idx, i))] == TO_FLUID) { nf = INTERFACE; break; } }
  }
  cu[NEW2(idx)] = nf;
}

/* 4 — anlegen und zählen */
@compute @workgroup_size(${WG})
fn pass4(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u.n) { return; }
  let nf = cu[NEW2(idx)];
  if (nf == TO_IF_GAS) {
    var r = 0.0; var v = vec3<f32>(0.0); var n = 0.0;
    for (var i = 1u; i < Q; i++) {
      let q = nb(idx, i);
      let nfl = cu[FL(q)];
      if (nfl == FLUID || nfl == INTERFACE || nfl == INLET) {
        r += cf[RHO(q)]; v += vec3<f32>(cf[UX(q)], cf[UY(q)], cf[UZ(q)]); n += 1.0;
      }
    }
    if (n > 0.0) { r = r / n; v = v / n; } else { r = 1.0; v = vec3<f32>(0.0); }
    for (var i = 0u; i < Q; i++) { fb[i * u.n + idx] = feq(i, r, v); }
    cf[RHO(idx)] = r; cf[UX(idx)] = v.x; cf[UY(idx)] = v.y; cf[UZ(idx)] = v.z;
    cf[MASS(idx)] = 0.0; cf[EPS(idx)] = 0.0;
  } else if (nf == TO_FLUID || nf == TO_GAS) {
    if (nf == TO_FLUID) { cf[EXCESS(idx)] = cf[MASS(idx)] - cf[RHO(idx)]; } else { cf[EXCESS(idx)] = cf[MASS(idx)]; }
    var cnt = 0u;
    for (var i = 1u; i < Q; i++) {
      let n2 = cu[NEW2(nb(idx, i))];
      if (n2 == INTERFACE || n2 == TO_IF_GAS || n2 == TO_IF_FLUID) { cnt++; }
    }
    cu[COUNT(idx)] = cnt;
  }
}

/* 5 — anwenden */
@compute @workgroup_size(${WG})
fn pass5(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u.n) { return; }
  let nf = cu[NEW2(idx)];
  if (nf == WALL) { return; }
  var fl = nf;
  if (nf == TO_FLUID) { fl = FLUID; cf[MASS(idx)] = cf[RHO(idx)]; cf[EPS(idx)] = 1.0; }
  else if (nf == TO_GAS) { fl = GAS; cf[MASS(idx)] = 0.0; cf[EPS(idx)] = 0.0; cf[UX(idx)] = 0.0; cf[UY(idx)] = 0.0; cf[UZ(idx)] = 0.0; }
  else if (nf == TO_IF_GAS) { fl = INTERFACE; }
  else if (nf == TO_IF_FLUID) { fl = INTERFACE; cf[MASS(idx)] = cf[RHO(idx)]; }
  if (fl == INTERFACE) {
    var m = cf[MASS(idx)];
    for (var i = 1u; i < Q; i++) {
      let q = nb(idx, i);
      let n2 = cu[NEW2(q)];
      if (n2 == TO_FLUID || n2 == TO_GAS) {
        let cnt = cu[COUNT(q)];
        if (cnt > 0u) { m += cf[EXCESS(q)] / f32(cnt); }
      }
    }
    cf[MASS(idx)] = m;
    cf[EPS(idx)] = clamp(m / cf[RHO(idx)], 0.0, 1.0);
  }
  cu[FL(idx)] = fl;
  if ((fl == INTERFACE || fl == FLUID) && cu[ARRIVAL(idx)] == NEVER) {
    cu[ARRIVAL(idx)] = u.step;
    let g = cu[SENSOR(idx)];
    if (g > 0u) { atomicMin(&gate[g - 1u], u.step); }
  }
}
`;
}

/** Gibt es WebGPU? */
export const hasWebGPU = () => typeof navigator !== 'undefined' && !!navigator.gpu;

/** Die Karte ist weg (`info` aus device.lost, `err` vom Lesen): eine
    gewöhnliche Meldung, kein AbortError. Auch für js/sph/gpu.js. */
export function lostError(info, err) {
  const why = (info && info.message) || (err && err.message) || 'Gerät verloren';
  return new Error('Die Grafikkarte ist ausgestiegen (' + why + '). Noch einmal simulieren, sonst die Seite neu laden.');
}

/** Was nach requestDevice scheitert, nimmt Gerät und Puffer mit — und
    kommt nie als AbortError heraus (er hieße „Abgebrochen"). */
export function failedSetup(device, buffers, err) {
  for (const b of buffers) b.destroy();
  device.destroy();
  if (err && err.name === 'Error') return err;
  return new Error('WebGPU: der Kern ließ sich nicht anlegen (' + ((err && err.message) || err) + ').');
}

/** Der Shader-Quelltext — für Tests und die Fehlersuche. */
export const wgslSource = (nx, ny) => wgsl(nx, ny);

/**
 * Den GPU-Kern anlegen. Gleiche Schnittstelle wie createSolver in
 * js/lbm/fslbm.js, nur dass Lesen asynchron ist:
 *   run(uIns, firstStep)   n Schritte mit den Kolbengeschwindigkeiten uIns[k] (je [x,y,z])
 *   readFill()             Float32Array Füllstand je Zelle
 *   readVelocity()         Float32Array Geschwindigkeit je Zelle (N-mal x, dann y, dann z)
 *   readArrival()          Uint32Array Ankunftsschritt je Zelle
 *   readGates()            Uint32Array Ankunft je Melder
 *   dispose()
 */
export async function createGpuSolver(domain, params = {}) {
  if (!hasWebGPU()) throw new Error('Kein WebGPU in diesem Browser.');
  const P = { ...PARAMS, ...params };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU: kein Adapter (Grafikkarte nicht freigegeben?).');
  const N = domain.N;
  const need = Q * 4 * N;
  const limits = {};
  if (need > adapter.limits.maxStorageBufferBindingSize) {
    throw new Error('Das Gitter braucht ' + (need / 1048576).toFixed(0) + ' MB je Verteilungspuffer, die Grafikkarte erlaubt '
      + (adapter.limits.maxStorageBufferBindingSize / 1048576).toFixed(0) + ' MB. Zellkante vergrößern.');
  }
  if (need > 134217728) {
    limits.maxStorageBufferBindingSize = need;
    limits.maxBufferSize = Math.max(need, adapter.limits.maxBufferSize >= need ? need : 0);
  }
  const device = await adapter.requestDevice({ requiredLimits: limits });
  const buffers = [];
  try {
    return await buildSolver(device, buffers, domain, P);
  } catch (err) {
    throw failedSetup(device, buffers, err);
  }
}

/* Alles nach requestDevice: Puffer, Shader, Pipelines — und der Kern. Was
   hier angelegt wird, steht in `buffers` (failedSetup, dispose). */
async function buildSolver(device, buffers, domain, P) {
  const N = domain.N;
  /* „destroyed" meldet das eigene dispose() — das ist kein Verlust. */
  let lost = null;
  device.lost.then(info => { if (info.reason !== 'destroyed') lost = info; });
  const [nx, ny] = domain.dims;
  const { WALL, GAS, INTERFACE, FLUID, INLET } = FLAG;

  /* Anfangszustand wie im JavaScript-Kern. */
  const f0 = new Float32Array(Q * N);
  const cf = new Float32Array(FF.COUNT_F * N);
  const cu = new Uint32Array(FU.COUNT_U * N);
  for (let idx = 0; idx < N; idx++) {
    const fl = domain.flags[idx];
    cu[FU.FLAG * N + idx] = fl; cu[FU.NEW1 * N + idx] = fl; cu[FU.NEW2 * N + idx] = fl;
    cu[FU.ARRIVAL * N + idx] = (fl === FLUID || fl === INLET || fl === INTERFACE) ? 0 : NEVER;
    cu[FU.SENSOR * N + idx] = domain.sensor ? domain.sensor[idx] : 0;
    cu[FU.SHAPE * N + idx] = domain.shape ? domain.shape[idx] : (fl === WALL ? 0 : 1);
    const r0 = domain.rho0 && domain.rho0[idx] > 0 ? domain.rho0[idx] : 1;
    cf[FF.RHO * N + idx] = r0;
    const m = fl === FLUID || fl === INLET ? r0 : fl === INTERFACE ? 0.5 * r0 : 0;
    cf[FF.MASS * N + idx] = m; cf[FF.EPS * N + idx] = fl === INTERFACE ? 0.5 : (m > 0 ? 1 : 0);
    for (let i = 0; i < Q; i++) f0[i * N + idx] = W[i] * r0;
  }
  void WALL; void GAS;

  const mk = (size, usage) => { const b = device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage }); buffers.push(b); return b; };
  const ST = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const bufA = mk(f0.byteLength, ST), bufB = mk(f0.byteLength, ST);
  const bufCA = mk(cf.byteLength, ST), bufCB = mk(cf.byteLength, ST);
  const bufU = mk(cu.byteLength, ST);
  const gates = new Uint32Array(Math.max(1, (domain.gates || []).length)).fill(NEVER);
  const bufG = mk(gates.byteLength, ST);
  const bufUni = mk(UNIFORM_STRIDE * BATCH, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  device.queue.writeBuffer(bufA, 0, f0); device.queue.writeBuffer(bufB, 0, f0);
  device.queue.writeBuffer(bufCA, 0, cf); device.queue.writeBuffer(bufCB, 0, cf);
  device.queue.writeBuffer(bufU, 0, cu);
  device.queue.writeBuffer(bufG, 0, gates);

  const module = device.createShaderModule({ code: wgsl(nx, ny) });
  /* Ein Shader, der nicht übersetzt, soll sagen, warum — nicht nur „invalid". */
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter(m => m.type === 'error');
  if (errors.length) throw new Error('WGSL: ' + errors.map(m => m.lineNum + ':' + m.linePos + ' ' + m.message).join(' | '));
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      ...[1, 2, 3, 4, 5, 6].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }))
    ]
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const pipes = await Promise.all(['pass0', 'pass1', 'pass2', 'pass3', 'pass4', 'pass5'].map(entryPoint =>
    device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module, entryPoint } })));
  const bind = (a, b, ca, cb) => device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: bufUni, size: UNIFORM_STRIDE } },
      { binding: 1, resource: { buffer: a } }, { binding: 2, resource: { buffer: b } },
      { binding: 3, resource: { buffer: ca } }, { binding: 4, resource: { buffer: cb } },
      { binding: 5, resource: { buffer: bufU } }, { binding: 6, resource: { buffer: bufG } }
    ]
  });
  const groups = [bind(bufA, bufB, bufCA, bufCB), bind(bufB, bufA, bufCB, bufCA)];
  const cfBufs = [bufCA, bufCB];
  let parity = 0;
  const OFF = C.map(c => c[0] + c[1] * nx + c[2] * nx * ny);
  const inDir = domain.inletDir || 0;
  const wgCount = Math.ceil(N / WG);
  const uni = new ArrayBuffer(UNIFORM_STRIDE * BATCH);
  const u32 = new Uint32Array(uni), f32 = new Float32Array(uni), i32 = new Int32Array(uni);

  function encodeBatch(uIns, firstStep, ips) {
    const n = uIns.length;
    for (let k = 0; k < n; k++) {
      const o = k * UNIFORM_STRIDE / 4;
      u32[o] = N; u32[o + 1] = nx; u32[o + 2] = ny; u32[o + 3] = firstStep + k;
      f32[o + 4] = P.tau0; f32[o + 5] = P.smagorinsky * P.smagorinsky; f32[o + 6] = P.kappa; f32[o + 7] = P.uMax;
      f32[o + 8] = uIns[k][0]; f32[o + 9] = uIns[k][1]; f32[o + 10] = uIns[k][2]; f32[o + 11] = 0;
      f32[o + 12] = P.g[0]; f32[o + 13] = P.g[1]; f32[o + 14] = P.g[2]; f32[o + 15] = 0;
      u32[o + 16] = inDir; i32[o + 17] = OFF[inDir]; u32[o + 18] = ips ? ips[k] : NO_PLUNGER; u32[o + 19] = 0;
    }
    device.queue.writeBuffer(bufUni, 0, uni, 0, n * UNIFORM_STRIDE);
    const enc = device.createCommandEncoder();
    for (let k = 0; k < n; k++) {
      const pass = enc.beginComputePass();
      for (const pipe of pipes) {
        pass.setPipeline(pipe);
        pass.setBindGroup(0, groups[parity], [k * UNIFORM_STRIDE]);
        pass.dispatchWorkgroups(wgCount);
      }
      pass.end();
      parity ^= 1;
    }
    device.queue.submit([enc.finish()]);
  }

  async function read(buf, byteOffset, byteLength, Ctor) {
    if (lost) throw lostError(lost);
    const staging = device.createBuffer({ size: byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(buf, byteOffset, staging, 0, byteLength);
    device.queue.submit([enc.finish()]);
    try { await staging.mapAsync(GPUMapMode.READ); }
    catch (err) { staging.destroy(); throw lostError(lost, err); }
    const out = new Ctor(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
    return out;
  }

  return {
    N, device,
    /** n Schritte; uIns[k] ist die Kolbengeschwindigkeit des Schritts
        firstStep + k, ips[k] (wahlweise) die Kolbenschicht. */
    run(uIns, firstStep, ips = null) {
      for (let s = 0; s < uIns.length; s += BATCH) {
        encodeBatch(uIns.slice(s, s + BATCH), firstStep + s, ips ? ips.slice(s, s + BATCH) : null);
      }
    },
    /* Nach dem letzten Schritt hält der Puffer des NÄCHSTEN Eingangs die neuesten Werte. */
    readFill: () => read(cfBufs[parity], FF.EPS * N * 4, N * 4, Float32Array),
    readVelocity: () => read(cfBufs[parity], FF.UX * N * 4, 3 * N * 4, Float32Array),
    readArrival: () => read(bufU, FU.ARRIVAL * N * 4, N * 4, Uint32Array),
    readFlags: () => read(bufU, FU.FLAG * N * 4, N * 4, Uint32Array),
    readGates: () => read(bufG, 0, gates.byteLength, Uint32Array),
    /** Warten, bis die Karte alles abgearbeitet hat. */
    sync: () => device.queue.onSubmittedWorkDone(),
    dispose() { for (const b of buffers) b.destroy(); device.destroy(); }
  };
}
