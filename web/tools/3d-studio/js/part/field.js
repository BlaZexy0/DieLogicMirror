/* Vorzeichenbehaftetes Abstandsfeld (SDF) eines Bauteils — durch
   RASTERISIERUNG statt durch Verschieben von Dreiecken.

   Warum überhaupt: eine Offsetfläche dadurch zu bauen, dass man jeden
   Punkt des Netzes nach außen schiebt, geht nur bei kleinen Beträgen
   gut. Sobald das Aufmaß in die Größenordnung von Verrundungen und
   Taschen kommt, durchdringen sich die verschobenen Flächen selbst: eine
   Innenecke klappt um, ein schmaler Steg wächst durch sich hindurch. Das
   Feld kennt dieses Problem nicht — es speichert für jeden Rasterpunkt
   den Abstand zur Bauteiloberfläche, und die Offsetfläche ist einfach
   die Fläche gleichen Abstands. Selbstdurchdringungen lösen sich dabei
   von selbst auf, weil immer der NÄCHSTE Punkt zählt.

   Aufbau in zwei Durchgängen:

   1. INNEN/AUSSEN — für jede Rastersäule (feste x, y) werden alle
      Dreiecke gesucht, die sie überdecken, und ihre z-Durchstoßpunkte
      gesammelt. Aus der Summe der Durchstoßrichtungen oberhalb eines
      Rasterpunktes folgt, ob er im Bauteil liegt. Das ist die eigentliche
      Rasterisierung; sie kostet nur einen Durchlauf über die Dreiecke.
      Die Säulen liegen um Bruchteile einer Zelle versetzt, damit ein
      Strahl nicht genau eine Kante trifft.

   2. ABSTANDSBAND — jedes Dreieck trägt seinen exakten Abstand in die
      Rasterpunkte seiner um `band` aufgeweiteten Bounding-Box ein
      (Punkt-Dreieck-Abstand nach Ericson). Außerhalb des Bandes bleibt
      der Wert bei ±band stehen; das reicht, solange das Aufmaß im Band
      liegt — und macht Speicher und Rechenzeit beherrschbar.

   Aus dem fertigen Feld lassen sich mehrere Aufmaße ohne Neurechnung
   ableiten: js/part/surfacenets.js zieht die Fläche zum Wert δ heraus.
   Kein Three.js — damit unter Node testbar. */

/** Rastermaße vorab abschätzen (für die Anzeige, bevor gerechnet wird). */
export function fieldSize(model, res, band) {
  const b = model.bounds;
  const longest = Math.max(b.size[0], b.size[1], b.size[2]) || 1;
  const h = longest / Math.max(8, res);
  const pad = band + 3 * h;
  const dims = [0, 1, 2].map(a => Math.max(2, Math.ceil((b.size[a] + 2 * pad) / h) + 1));
  const origin = [0, 1, 2].map(a => b.min[a] - pad);
  const samples = dims[0] * dims[1] * dims[2];
  return { dims, origin, h, band, samples, bytes: samples * 4 };
}

/* Punkt-Dreieck-Abstand (quadriert), Ericson „Real-Time Collision
   Detection" 5.1.5 — als Skalare ausgeschrieben, weil diese Schleife der
   heißeste Teil des ganzen Werkzeugs ist. */
function distSqPointTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v;
      } else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz;
        const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
              qx = bx + (cx - bx) * w; qy = by + (cy - by) * w; qz = bz + (cz - bz) * w;
            } else {
              const den = 1 / (va + vb + vc);
              const v = vb * den, w = vc * den;
              qx = ax + abx * v + acx * w;
              qy = ay + aby * v + acy * w;
              qz = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/* ── Durchgang 1: innen oder außen ───────────────────────────── */
function fillInside(model, f, data) {
  const { tris, normals, faceCount: F } = model;
  const [nx, ny, nz] = f.dims;
  const [ox, oy, oz] = f.origin;
  const h = f.h;
  /* Säulen minimal versetzt: ein Strahl, der genau auf einer Netzkante
     liegt, würde beide oder keins der anliegenden Dreiecke treffen. */
  const jx = h * 5.7731e-4, jy = h * 3.3312e-4;

  /* Dreiecke in die Säulen einsortieren (CSR). */
  const cols = nx * ny;
  const count = new Uint32Array(cols + 1);
  const box = new Int32Array(F * 4);
  for (let t = 0; t < F; t++) {
    const i = t * 9;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const x = tris[i + k * 3], y = tris[i + k * 3 + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const a = Math.max(0, Math.ceil((x0 - jx - ox) / h));
    const b = Math.min(nx - 1, Math.floor((x1 - jx - ox) / h));
    const c = Math.max(0, Math.ceil((y0 - jy - oy) / h));
    const d = Math.min(ny - 1, Math.floor((y1 - jy - oy) / h));
    box[t * 4] = a; box[t * 4 + 1] = b; box[t * 4 + 2] = c; box[t * 4 + 3] = d;
    for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) count[y * nx + x + 1]++;
  }
  for (let i = 0; i < cols; i++) count[i + 1] += count[i];
  const list = new Uint32Array(count[cols]);
  const fill = count.slice();
  for (let t = 0; t < F; t++) {
    const a = box[t * 4], b = box[t * 4 + 1], c = box[t * 4 + 2], d = box[t * 4 + 3];
    for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) list[fill[y * nx + x]++] = t;
  }

  const zs = [], ss = [];

  for (let cy = 0; cy < ny; cy++) {
    const py = oy + cy * h + jy;
    for (let cx = 0; cx < nx; cx++) {
      const c0 = count[cy * nx + cx], c1 = count[cy * nx + cx + 1];
      if (c0 === c1) continue;                      // Säule trifft nichts → außen
      const px = ox + cx * h + jx;
      zs.length = 0; ss.length = 0;
      for (let e = c0; e < c1; e++) {
        const t = list[e], i = t * 9;
        const axx = tris[i], ayy = tris[i + 1];
        const bxx = tris[i + 3], byy = tris[i + 4];
        const cxx = tris[i + 6], cyy = tris[i + 7];
        const e0 = (bxx - axx) * (py - ayy) - (byy - ayy) * (px - axx);
        const e1 = (cxx - bxx) * (py - byy) - (cyy - byy) * (px - bxx);
        const e2 = (axx - cxx) * (py - cyy) - (ayy - cyy) * (px - cxx);
        if ((e0 < 0 || e1 < 0 || e2 < 0) && (e0 > 0 || e1 > 0 || e2 > 0)) continue;
        const nzz = normals[t * 3 + 2];
        if (nzz > -1e-12 && nzz < 1e-12) continue;   // senkrecht zur Säule
        const nxx = normals[t * 3], nyy = normals[t * 3 + 1];
        const w = nxx * axx + nyy * ayy + nzz * tris[i + 2];
        zs.push((w - nxx * px - nyy * py) / nzz);
        ss.push(nzz > 0 ? 1 : -1);
      }
      if (!zs.length) continue;
      /* Von oben nach unten laufen und die Windungszahl mitführen:
         jeder Durchstoß nach +z zählt +1, jeder nach −z zählt −1. Über
         allem Material ist sie 0, im Bauteil > 0. Robuster als bloßes
         Abzählen — doppelte Schalen heben sich richtig auf. */
      const order = zs.map((_, i) => i).sort((a, b) => zs[a] - zs[b]);
      let hit = order.length - 1, wind = 0;
      for (let cz = nz - 1; cz >= 0; cz--) {
        const pz = oz + cz * h;
        while (hit >= 0 && zs[order[hit]] > pz) { wind += ss[order[hit]]; hit--; }
        if (wind > 0) data[(cz * ny + cy) * nx + cx] = -f.band;
      }
    }
  }
}

/* ── Durchgang 2: exakter Abstand im Band ────────────────────── */
function stampDistances(model, f, data, from, to) {
  const { tris } = model;
  const [nx, ny, nz] = f.dims;
  const [ox, oy, oz] = f.origin;
  const h = f.h, band = f.band;

  for (let t = from; t < to; t++) {
    const i = t * 9;
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
    const bx = tris[i + 3], by = tris[i + 4], bz = tris[i + 5];
    const cx = tris[i + 6], cy = tris[i + 7], cz = tris[i + 8];
    const x0 = Math.min(ax, bx, cx), x1 = Math.max(ax, bx, cx);
    const y0 = Math.min(ay, by, cy), y1 = Math.max(ay, by, cy);
    const z0 = Math.min(az, bz, cz), z1 = Math.max(az, bz, cz);
    const ia = Math.max(0, Math.ceil((x0 - band - ox) / h));
    const ib = Math.min(nx - 1, Math.floor((x1 + band - ox) / h));
    const ja = Math.max(0, Math.ceil((y0 - band - oy) / h));
    const jb = Math.min(ny - 1, Math.floor((y1 + band - oy) / h));
    const ka = Math.max(0, Math.ceil((z0 - band - oz) / h));
    const kb = Math.min(nz - 1, Math.floor((z1 + band - oz) / h));

    for (let k = ka; k <= kb; k++) {
      const pz = oz + k * h;
      const dz = pz < z0 ? z0 - pz : pz > z1 ? pz - z1 : 0;
      for (let j = ja; j <= jb; j++) {
        const py = oy + j * h;
        const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
        const base = (k * ny + j) * nx;
        for (let i2 = ia; i2 <= ib; i2++) {
          const px = ox + i2 * h;
          const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
          /* Untere Schranke über die Bounding-Box: liegt sie schon über
             dem bisher gefundenen Abstand, kann dieses Dreieck nichts
             mehr verbessern. Das spart den teuren Test fast überall. */
          const cur = data[base + i2];
          const lo2 = dx * dx + dy * dy + dz * dz;
          const acur = cur < 0 ? -cur : cur;
          if (lo2 >= acur * acur) continue;
          const d2 = distSqPointTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
          if (d2 < acur * acur) {
            const d = Math.sqrt(d2);
            data[base + i2] = cur < 0 ? -d : d;
          }
        }
      }
    }
  }
}

/** Feld bauen. Ist onProgress gesetzt, wird nach jedem Block die
    Kontrolle abgegeben, damit der Fortschritt in der Oberfläche ankommt;
    ohne Rückruf läuft alles am Stück durch (so rufen die Tests es auf). */
export async function buildField(model, opts = {}) {
  const { res = 96, band = 10, onProgress = null } = opts;
  const f = fieldSize(model, res, band);
  const data = new Float32Array(f.samples).fill(band);
  f.data = data;

  if (onProgress) { onProgress(0.02, 'innen/außen'); await tick(); }
  fillInside(model, f, data);

  const F = model.faceCount;
  const chunk = onProgress ? Math.max(200, Math.ceil(F / 40)) : F;
  for (let t = 0; t < F; t += chunk) {
    stampDistances(model, f, data, t, Math.min(F, t + chunk));
    if (onProgress) {
      onProgress(0.1 + 0.9 * Math.min(1, (t + chunk) / F), 'Abstände');
      await tick();
    }
  }
  return f;
}

const tick = () => new Promise(r => setTimeout(r, 0));

/** Volumen aus dem Feld: Rasterpunkte unterhalb des Wertes zählen. */
export function fieldVolume(f, iso) {
  let n = 0;
  for (let i = 0; i < f.data.length; i++) if (f.data[i] < iso) n++;
  return n * f.h * f.h * f.h;
}

/** Wert an beliebiger Stelle (trilinear) — für Abfragen im Viewer. */
export function sampleField(f, x, y, z) {
  const [nx, ny, nz] = f.dims;
  const gx = (x - f.origin[0]) / f.h, gy = (y - f.origin[1]) / f.h, gz = (z - f.origin[2]) / f.h;
  const i = Math.max(0, Math.min(nx - 2, Math.floor(gx)));
  const j = Math.max(0, Math.min(ny - 2, Math.floor(gy)));
  const k = Math.max(0, Math.min(nz - 2, Math.floor(gz)));
  const tx = Math.max(0, Math.min(1, gx - i)), ty = Math.max(0, Math.min(1, gy - j)), tz = Math.max(0, Math.min(1, gz - k));
  const at = (a, b, c) => f.data[(c * ny + b) * nx + a];
  const lerp = (p, q, t) => p + (q - p) * t;
  const c00 = lerp(at(i, j, k), at(i + 1, j, k), tx);
  const c10 = lerp(at(i, j + 1, k), at(i + 1, j + 1, k), tx);
  const c01 = lerp(at(i, j, k + 1), at(i + 1, j, k + 1), tx);
  const c11 = lerp(at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1), tx);
  return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
}
