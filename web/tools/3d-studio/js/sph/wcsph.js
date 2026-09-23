/* Der Kern der Partikelrechnung in JavaScript — schwach kompressible
   SPH (WCSPH) nach Monaghan, die Schmelze als Partikel statt als Gitter.

   Jedes Partikel trägt Ort, Geschwindigkeit, Dichte und eine Art:
   Schmelze (frei), Zustrom (fährt starr mit dem Kolben, wird jenseits
   der Einlassebene zu Schmelze) oder tot (durch den Auslass gegangen).
   Je Zeitschritt:
     1. Druck aus der Dichte — Tait, p = B((ρ/ρ0)^7 − 1), B = ρ0c0²/7,
        negative Drücke gekappt (freie Oberfläche, kein Zug);
     2. je Partikel die Summen über die Nachbarn im Träger 2h:
        Druckkraft und künstliche Zähigkeit (α), die Kontinuitäts-
        gleichung für die Dichte mit δ-SPH-Diffusion (glättet das
        Druckrauschen);
     3. vorwärts: Geschwindigkeit, Dichte, Ort — dann die Wände.
   Wände sind KEINE Partikel, sondern Abstandsfelder: wer näher als
   d/2 an eine Wand kommt, wird auf d/2 zurückgesetzt und verliert die
   Geschwindigkeit in die Wand (Gleiten an der Wand, keine Haftung —
   das ist der Preis: ohne Wandpartikel keine Haftung). Für die Kammer
   ist das Feld analytisch (Zylinder, Kolbenebene, Stirnwand mit dem
   Laufkanal als Loch), für den Anguss das Rasterfeld aus js/part/field.js.
   Der Kolben ist eine Ebene, die mit der Kurve fährt; im Anguss ist es
   die Säule der Zustrompartikel hinter dem Pressrest — sie tragen den
   Druck des Schmelzepartikels, auf das sie wirken (gespiegelt, wie
   Wandpartikel nach Adami), sonst drückt die Schmelze vor ihnen mehr
   als sie selbst, und der Pressrest liefe rückwärts in die Säule statt
   in den Anguss; dazu hält die Einlassebene die Schmelze wie die
   Kolbenebene der Kammer.

   Die Dichte kommt aus der Kontinuitätsgleichung, nicht aus der Summe
   über die Nachbarn: an Wänden und an der freien Oberfläche fehlt der
   Summe die Hälfte des Trägers, und die Schmelze würde dort leicht —
   mit der Kontinuität bleibt sie, was sie ist. Die δ-Diffusion ist
   dabei kein Schmuck: ohne sie treibt die Dichte in Ruhe binnen
   Hunderten Schritten um zehn Prozent davon (der gestutzte Kern an
   der Oberfläche und an der Wand macht die Divergenz schief), mit ihr
   findet sie zu ρ0 zurück. Eine XSPH-Korrektur der Bewegung (Partikel
   mit dem gewichteten Mittel der Nachbargeschwindigkeit statt der
   eigenen ziehen) wurde versucht und wieder entfernt: sie bewegt die
   Partikel mit einer anderen Geschwindigkeit als der, die die
   Kontinuität sieht. Der Zeitschritt folgt der Schallgeschwindigkeit:
   c0 = 10 · Bezugsgeschwindigkeit hält die Dichteschwankung unter
   einem Prozent, dt = CFL·h/(c0 + v); die Geschwindigkeit ist auf c0/2
   geklemmt, damit ein Partikel an einer Engstelle den Lauf nicht
   sprengt. settle() lässt die Schmelze vor dem Start mit hoher
   Zähigkeit zur Ruhe kommen — die hydrostatische Vorgabe passt an der
   freien Oberfläche nie ganz, und der Schwapp davon soll nicht in die
   Welle.

   Einheiten: SI — Meter, Sekunden, kg/m³. Kein DOM; der GPU-Kern
   (js/sph/gpu.js) rechnet dieselben Formeln. */

import { dW, SUPPORT } from './kernel.js';
import { createGrid } from './grid.js';

export const NEVER = 0xFFFFFFFF;
export const KIND = { DEAD: 0, FLUID: 1, INFLOW: 2 };

export const PARAMS = {
  alpha: 0.1,        // künstliche Zähigkeit (Monaghan)
  delta: 0.1,        // δ-SPH: Diffusion der Dichte
  gamma: 7,          // Tait
  cfl: 0.25,
  cMach: 10,         // c0 = cMach · Bezugsgeschwindigkeit
  settleAlpha: 1.0   // Zähigkeit beim Zur-Ruhe-Kommen
};

/** Zeitschritt aus CFL: h gegen Schall und Bezugsgeschwindigkeit. */
export function suggestDt({ h, c0, vRef, cfl = PARAMS.cfl }) {
  return cfl * h / (c0 + Math.max(vRef, 1e-6));
}

/** Trilinear aus einem Rasterfeld (origin, cell, dims); außerhalb geklemmt. */
export function sampleField(field, x, y, z) {
  const [nx, ny, nz] = field.dims, o = field.origin, c = field.cell, a = field.data;
  const fx = Math.min(nx - 1.0001, Math.max(0, (x - o[0]) / c));
  const fy = Math.min(ny - 1.0001, Math.max(0, (y - o[1]) / c));
  const fz = Math.min(nz - 1.0001, Math.max(0, (z - o[2]) / c));
  const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
  const tx = fx - i, ty = fy - j, tz = fz - k;
  const at = (ii, jj, kk) => a[(kk * ny + jj) * nx + ii];
  const c00 = at(i, j, k) * (1 - tx) + at(i + 1, j, k) * tx;
  const c10 = at(i, j + 1, k) * (1 - tx) + at(i + 1, j + 1, k) * tx;
  const c01 = at(i, j, k + 1) * (1 - tx) + at(i + 1, j, k + 1) * tx;
  const c11 = at(i, j + 1, k + 1) * (1 - tx) + at(i + 1, j + 1, k + 1) * tx;
  return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
}

/**
 * Den Kern anlegen.
 *   setup.nMax, n          Plätze und belegte Partikel
 *   setup.pos              Float32Array(4·nMax): x y z Art
 *   setup.vel              Float32Array(4·nMax): vx vy vz ρ
 *   setup.d, h, rho0, mass, c0
 *   setup.box              { min, max } des Suchgitters (m)
 *   setup.g                [gx, gy, gz]
 *   setup.boundary         { type: 'sleeve', R, L, outletW, outletH, sensorDepth }
 *                        | { type: 'grid', sdf: { dims, origin, cell, data }, flags: { dims, origin, cell, data, sensor } | null, OUTLET }
 *   setup.inflow           null | { axis: [ax, ay, az], plane }  (axiale Koordinate der Einlassebene)
 *   setup.gates            Zahl der Melder
 *   setup.gateRate         je Anschnitt Partikel je Meter Kolbenweg, die der Auslass
 *                          ab seiner Ankunft durchlässt (Anguss; ohne: freier Auslass)
 * Schnittstelle: step(dt, { uIn, step, piston }), positions(), velocities(),
 *   gateArrival (Uint32Array), gateS (Kolbenweg bei Ankunft), gateKilled, totals().
 */
export function createSphSolver(setup, params = {}) {
  const P = { ...PARAMS, ...params };
  const { nMax, d, h, rho0, mass, c0 } = setup;
  const vClamp = 0.5 * c0;
  const pos = setup.pos, vel = setup.vel;
  const g = setup.g || [0, 0, 0];
  const B = rho0 * c0 * c0 / P.gamma;
  const H2 = (SUPPORT * h) * (SUPPORT * h);
  const eta2 = 0.01 * h * h;
  const rb = 0.5 * d;
  const grid = createGrid(setup.box.min, setup.box.max, SUPPORT * h);
  const acc = new Float32Array(3 * nMax);
  const drho = new Float32Array(nMax), press = new Float32Array(nMax);
  const gateArrival = new Uint32Array(Math.max(1, setup.gates || 0)).fill(NEVER);
  const gateS = new Float64Array(gateArrival.length).fill(Infinity);
  const gateKilled = new Uint32Array(gateArrival.length);
  const bnd = setup.boundary;
  const inflow = setup.inflow;
  const OUTLET = bnd.type === 'grid' ? bnd.OUTLET : 0;

  const arrive = (k, step, sNow = 0) => { if (step < gateArrival[k]) { gateArrival[k] = step; gateS[k] = sNow; } };

  /* Die Kammer: Zylinder um x, Kolbenebene bei s, Stirnwand bei L mit
     dem Laufkanal als Loch oben. */
  function wallsSleeve(i, ctrl) {
    const o = 4 * i;
    let x = pos[o], y = pos[o + 1], z = pos[o + 2];
    let vx = vel[o], vy = vel[o + 1], vz = vel[o + 2];
    const s = ctrl.piston || 0;
    if (x < s + rb) { x = s + rb; if (vx < ctrl.uIn) vx = ctrl.uIn; }
    const rr = Math.hypot(y, z);
    if (rr > bnd.R - rb) {
      const ny = y / rr, nz = z / rr;
      y = ny * (bnd.R - rb); z = nz * (bnd.R - rb);
      const vn = vy * ny + vz * nz;
      if (vn > 0) { vy -= vn * ny; vz -= vn * nz; }
    }
    const inHole = Math.abs(z) <= bnd.outletW / 2 && y >= bnd.R - bnd.outletH;
    if (inHole) {
      if (x >= bnd.L) { pos[o + 3] = KIND.DEAD; arrive(0, ctrl.step); return; }
      if (x >= bnd.L - bnd.sensorDepth) arrive(0, ctrl.step);
    } else if (x > bnd.L - rb) { x = bnd.L - rb; if (vx > 0) vx = 0; }
    pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
    vel[o] = vx; vel[o + 1] = vy; vel[o + 2] = vz;
  }

  /* Der Anguss: das Abstandsfeld (innen negativ), Gradient aus
     zentralen Differenzen einer halben Zelle; Auslass und Melder aus
     dem Rollenraster des Gitters. */
  function wallsGrid(i, ctrl) {
    const o = 4 * i;
    let x = pos[o], y = pos[o + 1], z = pos[o + 2];
    if (inflow) {
      /* Die Einlassebene ist der Kolben: nichts fällt dahinter zurück. */
      const ax = inflow.axis;
      const a = x * ax[0] + y * ax[1] + z * ax[2];
      if (a < inflow.plane + rb) {
        const push = inflow.plane + rb - a;
        x += ax[0] * push; y += ax[1] * push; z += ax[2] * push;
        const va = vel[o] * ax[0] + vel[o + 1] * ax[1] + vel[o + 2] * ax[2];
        const u = ctrl.uIn || 0;
        if (va < u) { vel[o] += ax[0] * (u - va); vel[o + 1] += ax[1] * (u - va); vel[o + 2] += ax[2] * (u - va); }
      }
    }
    const f = bnd.sdf;
    const phi = sampleField(f, x, y, z);
    if (phi > -rb) {
      const e = 0.5 * f.cell;
      let nx = sampleField(f, x + e, y, z) - sampleField(f, x - e, y, z);
      let ny = sampleField(f, x, y + e, z) - sampleField(f, x, y - e, z);
      let nz = sampleField(f, x, y, z + e) - sampleField(f, x, y, z - e);
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const push = phi + rb;
      x -= nx * push; y -= ny * push; z -= nz * push;
      const vn = vel[o] * nx + vel[o + 1] * ny + vel[o + 2] * nz;
      if (vn > 0) { vel[o] -= vn * nx; vel[o + 1] -= vn * ny; vel[o + 2] -= vn * nz; }
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
    }
    const fl = bnd.flags;
    if (!fl) return;
    const [gx, gy, gz] = fl.dims;
    const ci = Math.round((x - fl.origin[0]) / fl.cell), cj = Math.round((y - fl.origin[1]) / fl.cell), ck = Math.round((z - fl.origin[2]) / fl.cell);
    if (ci < 0 || cj < 0 || ck < 0 || ci >= gx || cj >= gy || ck >= gz) return;
    const idx = (ck * gy + cj) * gx + ci;
    const s = fl.sensor ? fl.sensor[idx] : 0;
    const sNow = ctrl.piston || 0;
    if (s > 0) arrive(s - 1, ctrl.step, sNow);
    if (fl.data[idx] !== OUTLET) return;
    /* Der gedrosselte Auslass: so viele Partikel je Meter Kolbenweg,
       wie der Flächenanteil des Anschnitts trägt. */
    if (s > 0 && setup.gateRate) {
      const k = s - 1;
      const quota = Math.floor(setup.gateRate[k] * Math.max(0, sNow - gateS[k]));
      if (gateKilled[k] >= quota) return;
      gateKilled[k]++;
    }
    pos[o + 3] = KIND.DEAD;
  }

  const walls = bnd.type === 'sleeve' ? wallsSleeve : wallsGrid;

  /** Ein Zeitschritt: dt in s, ctrl = { uIn (m/s), step, piston (m, Kammer), alpha (wahlweise) }. */
  function step(dt, ctrl) {
    const n = setup.n;
    const alpha = ctrl.alpha !== undefined ? ctrl.alpha : P.alpha;
    grid.build(pos, n);
    for (let i = 0; i < n; i++) {
      const kind = pos[4 * i + 3];
      if (kind !== KIND.FLUID) { press[i] = 0; continue; }
      const r = vel[4 * i + 3] / rho0;
      press[i] = Math.max(0, B * (Math.pow(r, P.gamma) - 1));
    }
    /* Die Nachbarsummen — die 27 Zellen um das Partikel, ohne Rückruf je
       Nachbar: das ist die heiße Schleife, sie läuft in JavaScript
       millionenfach je Bild. */
    const { start, list, dims: gd, min: gmin, cell: gc } = grid;
    const [gnx, gny, gnz] = gd;
    for (let i = 0; i < n; i++) {
      if (pos[4 * i + 3] !== KIND.FLUID) continue;
      const oi = 4 * i;
      const xi = pos[oi], yi = pos[oi + 1], zi = pos[oi + 2];
      const vxi = vel[oi], vyi = vel[oi + 1], vzi = vel[oi + 2], rhoi = vel[oi + 3];
      const pi = press[i], pr_i = pi / (rhoi * rhoi);
      let ax = 0, ay = 0, az = 0, dr = 0;
      const ci = Math.min(gnx - 1, Math.max(0, Math.floor((xi - gmin[0]) / gc)));
      const cj = Math.min(gny - 1, Math.max(0, Math.floor((yi - gmin[1]) / gc)));
      const ck = Math.min(gnz - 1, Math.max(0, Math.floor((zi - gmin[2]) / gc)));
      for (let kk = Math.max(0, ck - 1); kk <= Math.min(gnz - 1, ck + 1); kk++) {
        for (let jj = Math.max(0, cj - 1); jj <= Math.min(gny - 1, cj + 1); jj++) {
          for (let ii = Math.max(0, ci - 1); ii <= Math.min(gnx - 1, ci + 1); ii++) {
            const c = (kk * gny + jj) * gnx + ii;
            for (let s = start[c], e = start[c + 1]; s < e; s++) {
              const j = list[s];
              if (j === i) continue;
              const oj = 4 * j;
              const rx = xi - pos[oj], ry = yi - pos[oj + 1], rz = zi - pos[oj + 2];
              const r2 = rx * rx + ry * ry + rz * rz;
              if (r2 >= H2 || r2 < 1e-30) continue;
              const r = Math.sqrt(r2);
              const dw = dW(r, h);
              const gxx = dw * rx / r, gyy = dw * ry / r, gzz = dw * rz / r;
              const rhoj = vel[oj + 3];
              const pj = pos[oj + 3] === KIND.INFLOW ? pi : press[j];
              const vijx = vxi - vel[oj], vijy = vyi - vel[oj + 1], vijz = vzi - vel[oj + 2];
              const vr = vijx * rx + vijy * ry + vijz * rz;
              let visc = 0;
              if (vr < 0) { const mu = h * vr / (r2 + eta2); visc = -alpha * c0 * mu / (0.5 * (rhoi + rhoj)); }
              const f = -mass * (pr_i + pj / (rhoj * rhoj) + visc);
              ax += f * gxx; ay += f * gyy; az += f * gzz;
              dr += mass * (vijx * gxx + vijy * gyy + vijz * gzz);
              /* δ-SPH: r_ji·∇W = −r·dW ≥ 0, zieht ρ_i zu ρ_j. */
              dr += P.delta * h * c0 * 2 * (rhoj - rhoi) * (-dw * r) / (r2 + eta2) * mass / rhoj;
            }
          }
        }
      }
      acc[3 * i] = ax + g[0]; acc[3 * i + 1] = ay + g[1]; acc[3 * i + 2] = az + g[2];
      drho[i] = dr;
    }
    for (let i = 0; i < n; i++) {
      const o = 4 * i;
      const kind = pos[o + 3];
      if (kind === KIND.FLUID) {
        vel[o] += acc[3 * i] * dt; vel[o + 1] += acc[3 * i + 1] * dt; vel[o + 2] += acc[3 * i + 2] * dt;
        const sp = Math.hypot(vel[o], vel[o + 1], vel[o + 2]);
        if (sp > vClamp) { const f = vClamp / sp; vel[o] *= f; vel[o + 1] *= f; vel[o + 2] *= f; }
        vel[o + 3] = Math.max(0.5 * rho0, vel[o + 3] + drho[i] * dt);
        pos[o] += vel[o] * dt;
        pos[o + 1] += vel[o + 1] * dt;
        pos[o + 2] += vel[o + 2] * dt;
        walls(i, ctrl);
      } else if (kind === KIND.INFLOW) {
        const u = ctrl.uIn || 0;
        vel[o] = u * inflow.axis[0]; vel[o + 1] = u * inflow.axis[1]; vel[o + 2] = u * inflow.axis[2];
        pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
        vel[o + 3] = rho0;
        const a = pos[o] * inflow.axis[0] + pos[o + 1] * inflow.axis[1] + pos[o + 2] * inflow.axis[2];
        if (a >= inflow.plane) pos[o + 3] = KIND.FLUID;
      }
    }
  }

  /** Zur Ruhe kommen: `steps` Schritte mit hoher Zähigkeit, Kolben
      und Zustrom stehen; danach ruht alles (Geschwindigkeit null). */
  function settle(steps, dt) {
    for (let k = 1; k <= steps; k++) step(dt, { uIn: 0, step: 0, piston: 0, alpha: P.settleAlpha });
    for (let i = 0; i < setup.n; i++) { vel[4 * i] = 0; vel[4 * i + 1] = 0; vel[4 * i + 2] = 0; }
  }

  return {
    get n() { return setup.n; },
    nMax, d, h, rho0, mass, c0, gateArrival, gateS, gateKilled, gates: gateArrival.length,
    step, settle,
    positions() { return pos; },
    velocities() { return vel; },
    /** Masse der Schmelze und mittlere Dichte — für die Tests. */
    totals() {
      let m = 0, r = 0, k = 0;
      for (let i = 0; i < setup.n; i++) if (pos[4 * i + 3] === KIND.FLUID) { m += mass; r += vel[4 * i + 3]; k++; }
      return { mass: m, rhoMean: k ? r / k : rho0, count: k };
    },
    dispose() {}
  };
}
