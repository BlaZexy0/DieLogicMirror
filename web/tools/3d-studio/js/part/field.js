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

   Und es steckt mehr darin als die Offsetfläche. INNEN ist der Betrag
   des Feldwertes der Radius der größten Kugel, die an dieser Stelle noch
   ins Bauteil passt — bei plattenförmigen Bereichen also die halbe
   Wandstärke. Das macht dasselbe Feld zur Dickenanalyse: wo der Betrag
   am größten ist, liegt die dickste Stelle, und die erstarrt zuletzt
   (Wärmezentrum, Lunkergefahr, Reichweite des Nachdrucks). Ein Untermaß
   von −s lässt genau die Bereiche stehen, die dicker als 2·s sind; der
   Feldschnitt im Viewer zeigt dieselbe Information flächig.

   Kein Three.js — damit unter Node testbar. */

import { abortError, isAbort } from '../abort.js';
import { distSqPointTri } from '../mesh.js';

/** Erlaubte Zellkanten in mm — feiner frisst Speicher, gröber sieht keine Wand. */
export const CELL_RANGE = [0.25, 50];

/** Mehr Rasterpunkte rechnet das Studio nicht: darüber wird die Zellkante
    angehoben (planField). 16 Mio. Werte sind 64 MB. */
export const MAX_SAMPLES = 16e6;

/** Vorschlag für die Zellkante aus dem Bauteil: die halbe Wanddicke
    (2V/A), damit eine Wand mindestens zwei Zellen über ihre Dicke hat;
    ohne brauchbare Wanddicke ein 64stel der längsten Kante. Auf glatte
    Werte gerundet — halbe Millimeter ab 1 mm, darunter Zehntel. */
export function suggestCell(m) {
  const wall = m.wall > 0 ? m.wall : 0;
  const longest = Math.max(m.bounds.size[0], m.bounds.size[1], m.bounds.size[2]) || 1;
  const h = Math.max(CELL_RANGE[0], Math.min(CELL_RANGE[1], wall > 0 ? wall / 2 : longest / 64));
  return h >= 1 ? Math.round(h * 2) / 2 : Math.round(h * 10) / 10;
}

/** Rastermaße vorab abschätzen (für die Anzeige, bevor gerechnet wird).
    Die Zellkante kommt aus `res` (Zellen entlang der längsten Kante) oder
    direkt aus `extra.h` in mm. Der Rand um das Bauteil ist `extra.pad`
    (mm), sonst Band plus drei Zellen — so viel braucht die Offsetfläche;
    wer nur das Innere will, kommt mit zwei Zellen aus. */
export function fieldSize(model, res, band, extra = {}) {
  const b = model.bounds;
  const longest = Math.max(b.size[0], b.size[1], b.size[2]) || 1;
  const h = extra.h > 0 ? extra.h : longest / Math.max(8, res);
  const pad = extra.pad >= 0 ? extra.pad : band + 3 * h;
  const dims = [0, 1, 2].map(a => Math.max(2, Math.ceil((b.size[a] + 2 * pad) / h) + 1));
  const origin = [0, 1, 2].map(a => b.min[a] - pad);
  const samples = dims[0] * dims[1] * dims[2];
  return { dims, origin, h, band, samples, bytes: samples * 4 };
}

/**
 * Was ein Feld mit der Zellkante `h` kosten wird — und mit welcher Kante
 * es wirklich gerastert wird: hätte es mehr als MAX_SAMPLES Punkte, wird
 * die Kante in Schritten von zehn Prozent angehoben; Band und Rand (mm)
 * bleiben. EINE Rechnung für den Gastgeber, der rastert (js/studio/host.js),
 * und die Werkzeuge, die es VORHER sagen: vorher stand die Schleife dreimal
 * da, und die Vorschau der Füllung hob das Band mit der Kante an — der
 * Gastgeber nicht.
 *   → { est, asked, lifted }: est das Raster, das entsteht (est.h die Kante),
 *     asked das verlangte, lifted ob angehoben wurde
 */
export function planField(model, { h, band, pad }) {
  const asked = fieldSize(model, 0, band, { h, pad });
  let est = asked, hh = h;
  while (est.samples > MAX_SAMPLES) { hh = Math.round(hh * 110) / 100; est = fieldSize(model, 0, band, { h: hh, pad }); }
  return { est, asked, lifted: est !== asked };
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
  const { res = 96, h = 0, pad = -1, band = 10, onProgress = null, signal = null } = opts;
  const check = () => { if (signal && signal.aborted) throw abortError(); };
  const f = fieldSize(model, res, band, { h, pad });
  const data = new Float32Array(f.samples).fill(band);
  f.data = data;

  if (onProgress) { onProgress(0.02, 'innen/außen'); await tick(); }
  check();
  fillInside(model, f, data);

  const F = model.faceCount;
  const chunk = onProgress ? Math.max(200, Math.ceil(F / 40)) : F;
  for (let t = 0; t < F; t += chunk) {
    stampDistances(model, f, data, t, Math.min(F, t + chunk));
    if (onProgress) {
      onProgress(0.1 + 0.85 * Math.min(1, (t + chunk) / F), 'Abstände');
      await tick();
    }
    check();
  }
  /* Die Anzeige sagt, was gerechnet wird: die Tiefe im Inneren, jenseits des
     Bandes (fillInterior). Nicht „Kern" — das Wort gehört in der Form dem
     Formkern, und die Wandstärkenanalyse zeigt diese Zeile. */
  if (onProgress) { onProgress(0.96, 'Tiefe innen'); await tick(); }
  check();
  fillInterior(f);
  return f;
}

/* ── Der Kern: innen ist das Feld immer vollständig ───────────
   Das Band begrenzt, wie weit NACH AUSSEN der Abstand gespeichert wird —
   dort wächst er unbegrenzt, und irgendwo muss Schluss sein. Nach innen
   gibt es diese Grenze nicht: der Abstand kann nie größer werden als die
   halbe Dicke des Bauteils, und genau dieses Maximum ist die Zahl, um die
   es bei der Wandstärke geht. Ein Kern, der auf −band abgeschnitten war,
   sagte darüber nichts.

   Deshalb bekommen die Zellen jenseits des Bandes ihren Abstand aus
   einer exakten euklidischen Distanztransformation der Innen/Außen-Maske
   (Felzenszwalb & Huttenlocher, trennbar, O(N)): die Entfernung zur
   nächsten Außenzelle. Sie irrt um höchstens eine halbe Zelle — für die
   Skala und die dicksten Stellen mehr als genug —, und nahe der
   Oberfläche, wo es auf Zehntel ankommt, bleibt der exakt gestempelte
   Wert stehen. */

/* 1D-Transformation der quadrierten Abstände entlang einer Zeile mit
   Schrittweite `stride`. `f` ist die Zeile (in tmp kopiert), `d` das
   Ergebnis. v, z sind Arbeitsfelder der Länge n bzw. n + 1. */
function dt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

export function fillInterior(f) {
  const [nx, ny, nz] = f.dims;
  const data = f.data;
  const N = nx * ny * nz;
  const BIG = 1e12;
  const sq = new Float64Array(N);
  for (let i = 0; i < N; i++) sq[i] = data[i] < 0 ? BIG : 0;
  const nMax = Math.max(nx, ny, nz);
  const line = new Float64Array(nMax), out = new Float64Array(nMax);
  const v = new Int32Array(nMax), z = new Float64Array(nMax + 1);
  const pass = (n, count, at) => {
    for (let c = 0; c < count; c++) {
      for (let q = 0; q < n; q++) line[q] = sq[at(c, q)];
      dt1d(line, n, out, v, z);
      for (let q = 0; q < n; q++) sq[at(c, q)] = out[q];
    }
  };
  pass(nx, ny * nz, (c, q) => c * nx + q);                                          // entlang x
  pass(ny, nx * nz, (c, q) => { const k = (c / nx) | 0, i = c - k * nx; return (k * ny + q) * nx + i; }); // y
  pass(nz, nx * ny, (c, q) => q * nx * ny + c);                                     // z
  const lim = f.band - 1e-6;
  for (let i = 0; i < N; i++) {
    const val = data[i];
    if (val <= -lim) {
      const d = Math.sqrt(sq[i]) * f.h;
      if (d > f.band) data[i] = -d;
    }
  }
  f.fullInside = true;
  return f;
}

const tick = () => new Promise(r => setTimeout(r, 0));
export { abortError, isAbort };

/** Volumen aus dem Feld: Rasterpunkte unterhalb des Wertes zählen. */
export function fieldVolume(f, iso) {
  let n = 0;
  for (let i = 0; i < f.data.length; i++) if (f.data[i] < iso) n++;
  return n * f.h * f.h * f.h;
}

/** Die Rasterzelle um (x, y, z) und die Lage darin, an den Rand geklemmt:
    [i, j, k, tx, ty, tz] — geschrieben in `out`. Beide Abtaster (hier und
    js/fill/solve.js, sampleFrac) suchen damit, sie wichten nur verschieden. */
const CELL = new Float64Array(6);
export function cellAt(f, x, y, z, out = CELL) {
  const [nx, ny, nz] = f.dims;
  const gx = (x - f.origin[0]) / f.h, gy = (y - f.origin[1]) / f.h, gz = (z - f.origin[2]) / f.h;
  const i = Math.max(0, Math.min(nx - 2, Math.floor(gx)));
  const j = Math.max(0, Math.min(ny - 2, Math.floor(gy)));
  const k = Math.max(0, Math.min(nz - 2, Math.floor(gz)));
  out[0] = i; out[1] = j; out[2] = k;
  out[3] = Math.max(0, Math.min(1, gx - i)); out[4] = Math.max(0, Math.min(1, gy - j)); out[5] = Math.max(0, Math.min(1, gz - k));
  return out;
}

/** Wert an beliebiger Stelle (trilinear) — für Abfragen im Viewer. */
export function sampleField(f, x, y, z) {
  const [nx, ny] = f.dims;
  const c = cellAt(f, x, y, z);
  const i = c[0], j = c[1], k = c[2], tx = c[3], ty = c[4], tz = c[5];
  const at = (a, b, cc) => f.data[(cc * ny + b) * nx + a];
  const lerp = (p, q, t) => p + (q - p) * t;
  const c00 = lerp(at(i, j, k), at(i + 1, j, k), tx);
  const c10 = lerp(at(i, j + 1, k), at(i + 1, j + 1, k), tx);
  const c01 = lerp(at(i, j, k + 1), at(i + 1, j, k + 1), tx);
  const c11 = lerp(at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1), tx);
  return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
}

/* ── Was das Feld über die Wandstärke sagt ───────────────────── */

/** Größter Betrag innen und außen — die Enden der Farbskala. `clipped`
    heißt: im Kern steht das Feld auf −band, das Bauteil ist dicker als
    das Band erfasst; dann ist maxIn nur eine untere Schranke. */
export function fieldExtrema(f) {
  let maxIn = 0, maxOut = 0, clipped = 0;
  const lim = f.fullInside ? Infinity : f.band - 1e-6;
  for (let i = 0; i < f.data.length; i++) {
    const v = f.data[i];
    if (v < 0) { if (-v > maxIn) maxIn = -v; if (-v >= lim) clipped++; }
    else if (v > maxOut) maxOut = v;
  }
  return { maxIn, maxOut, clipped };
}

/**
 * Die dicksten Stellen: Rasterpunkte, deren Abstand zur Oberfläche
 * (innen, als Betrag) keinen größeren Nachbarn hat — die Mitte der
 * größten Kugel, die dort ins Bauteil passt. Von ihnen bleiben die,
 * die mindestens `minFrac` des größten Betrags erreichen und nicht in
 * der Nähe einer stärkeren liegen — näher als das 1,6-fache von deren
 * Radius (sonst säumen Dutzende Punkte jeden Grat, und eine Platte
 * gleicher Dicke wäre mit Kugeln gepflastert; ihre Mittelfläche IST
 * überall gleich dick, ein paar Marken sagen das auch). Abgeschnittene Kerne (Wert auf −band) zählen nicht: dort weiß
 * das Feld nichts über die Dicke.
 *   → [{ x, y, z, r }] mit r = Feldbetrag = halbe Wandstärke, nach r fallend
 */
export function thickMaxima(f, opts = {}) {
  const { minFrac = 0.6, limit = 200 } = opts;
  const [nx, ny, nz] = f.dims;
  const d = f.data;
  const lim = f.fullInside ? Infinity : f.band - 1e-6;
  let maxIn = 0;
  for (let i = 0; i < d.length; i++) if (d[i] < 0 && -d[i] > maxIn) maxIn = -d[i];
  const floor = Math.max(1e-6, maxIn * Math.max(0, Math.min(1, minFrac)));
  const found = [];
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v = -d[(k * ny + j) * nx + i];
        if (v < floor || v >= lim) continue;
        let top = true;
        for (let dk = -1; dk <= 1 && top; dk++) {
          for (let dj = -1; dj <= 1 && top; dj++) {
            for (let di = -1; di <= 1; di++) {
              if (!di && !dj && !dk) continue;
              if (-d[((k + dk) * ny + j + dj) * nx + i + di] > v) { top = false; break; }
            }
          }
        }
        if (top) found.push({ x: f.origin[0] + i * f.h, y: f.origin[1] + j * f.h, z: f.origin[2] + k * f.h, r: v });
      }
    }
  }
  found.sort((a, b) => b.r - a.r);
  const out = [];
  for (const m of found) {
    let inside = false;
    for (const o of out) {
      const dd = Math.hypot(m.x - o.x, m.y - o.y, m.z - o.z);
      /* Etwas mehr als die Kugel: ein Grat liegt selten genau auf einer
         Rasterlinie, und zwei Zeilen gleicher Werte lieferten sonst
         Marken im Abstand von knapp über r. */
      if (dd < Math.max(o.r * 1.6 + f.h, f.h * 1.5)) { inside = true; break; }
    }
    if (!inside) out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}
