/* Die Füllung als Frontausbreitung — eine Abschätzung, keine Strömung.

   Was hier gerechnet wird: von den Anschnitten aus breitet sich die
   Schmelzefront durch die Rasterzellen des Bauteils aus (das Innere des
   Abstandsfelds aus js/part/field.js), jede Zelle wird erreicht, wenn
   der kürzeste „Weg in Zeit" zu ihr abgelaufen ist — ein Dijkstra über
   die 26er-Nachbarschaft mit euklidischen Kantenlängen. Zwei Dinge
   machen daraus mehr als eine Geodäte:

   - Dünne Wände bremsen. Die Front läuft in einer Zelle mit der
     Geschwindigkeit (Wanddicke / Bezugsdicke)^α; α = 0 ist die reine
     Geometrie, α um 0,5 das, was man in Füllbildern sieht: die Schmelze
     nimmt erst die dicken Wege und holt dünne Rippen später nach.
   - Größere Anschnitte kommen weiter. Jeder Anschnitt trägt seinen
     Anteil am Strom; die Front aus ihm läuft mit diesem Anteil
     (bezogen auf den Mittelwert) schneller oder langsamer. Wer eine
     Zelle zuerst erreicht, füllt sie — die Quelle wandert mit.

   Aus den Ankunftszeiten wird der FÜLLGRAD: sortiert nach Ankunft ist
   jede Zelle bei dem Anteil des Volumens gefüllt, der vor ihr kam. Der
   ist die Zahl, die man abliest — „diese Ecke füllt bei 92 %". Eine
   Zeit steht nicht dran: die Rechnung kennt keine, und eine Füllzeit
   änderte an der Reihenfolge nichts. Die zuletzt gefüllten Stellen sind
   die Kandidaten für Lufteinschlüsse und Überläufe.

   Was hier NICHT drin ist: Trägheit, Strahlbildung, Gegendruck der Luft,
   Erstarrung während der Füllung. Eine Füllsimulation braucht ein
   Volumennetz und Minuten; das hier braucht eine Sekunde und sagt, in
   welcher Reihenfolge die Kavität voll wird. */

import { frameOf, shares, allItems } from './model.js';

/* ── Binärer Heap über Zellindizes ───────────────────────────── */
class Heap {
  constructor(n, key) { this.key = key; this.a = new Int32Array(n); this.n = 0; }
  push(i) {
    let k = this.n++;
    const a = this.a, key = this.key;
    a[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (key[a[p]] <= key[a[k]]) break;
      const t = a[p]; a[p] = a[k]; a[k] = t; k = p;
    }
  }
  pop() {
    const a = this.a, key = this.key;
    const top = a[0];
    const last = a[--this.n];
    if (this.n > 0) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < this.n && key[a[l]] < key[a[m]]) m = l;
        if (r < this.n && key[a[r]] < key[a[m]]) m = r;
        if (m === k) break;
        const t = a[m]; a[m] = a[k]; a[k] = t; k = m;
      }
    }
    return top;
  }
  get size() { return this.n; }
}

/* Die 26 Nachbarn mit ihren Längen in Zellen. */
const NB = [];
for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
  if (di || dj || dk) NB.push([di, dj, dk, Math.hypot(di, dj, dk)]);
}

/**
 * Startzellen eines Anschnitts: innen liegende Zellen, deren Mitte im
 * Rechteck liegt (quer ±w/2, längs ±h/2) und höchstens anderthalb Zellen
 * unter der Fläche. Findet sich keine, die dem Punkt nächste Innenzelle.
 */
export function seedCells(field, item) {
  const [nx, ny, nz] = field.dims;
  const d = field.data, h = field.h, o = field.origin;
  const f = frameOf(item);
  const hw = item.w / 2 + h * 0.5, hh = item.h / 2 + h * 0.5;
  const reach = Math.max(hw, hh) + 2 * h;
  const lo = [0, 1, 2].map(a => Math.max(0, Math.floor((item.pos[a] - reach - o[a]) / h)));
  const hi = [0, 1, 2].map(a => Math.min(field.dims[a] - 1, Math.ceil((item.pos[a] + reach - o[a]) / h)));
  const out = [];
  let nearest, nd;
  for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
    const idx = (k * ny + j) * nx + i;
    if (d[idx] >= 0) continue;
    const px = o[0] + i * h - item.pos[0], py = o[1] + j * h - item.pos[1], pz = o[2] + k * h - item.pos[2];
    const along = px * f.n[0] + py * f.n[1] + pz * f.n[2];              // < 0: unter der Fläche
    const uu = px * f.u[0] + py * f.u[1] + pz * f.u[2];
    const vv = px * f.v[0] + py * f.v[1] + pz * f.v[2];
    if (Math.abs(uu) <= hw && Math.abs(vv) <= hh && along <= h * 0.5 && along >= -1.5 * h) out.push(idx);
  }
  if (out.length) return out;
  /* Nichts unter dem Rechteck (der Anschnitt hängt in der Luft oder das
     Raster ist grob): die dem Punkt nächste Innenzelle im ganzen Feld. */
  nearest = -1; nd = Infinity;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = (k * ny + j) * nx + i;
    if (d[idx] >= 0) continue;
    const px = o[0] + i * h - item.pos[0], py = o[1] + j * h - item.pos[1], pz = o[2] + k * h - item.pos[2];
    const dist2 = px * px + py * py + pz * pz;
    if (dist2 < nd) { nd = dist2; nearest = idx; }
  }
  return nearest >= 0 ? [nearest] : [];
}

/**
 * Die Füllung rechnen.
 *   field   Rasterfeld mit vollständigem Kern (js/part/field.js)
 *   plan    Füllplan mit Anschnitten
 *   opts    alpha (Dünnwand-Bremse), onProgress(p)
 * → { arrival: Float32Array (Zeiteinheit, außen Infinity), frac: Float32Array (Füllgrad 0..1,
 *     außen NaN), source: Int16Array (Anschnitt je Zelle, −1 außen), path: Float32Array
 *     (Fließweg in mm), cells, stats: { maxPath, refThickness, wallThickness, flowRatio, unreached,
 *     volume, inlets:[{id, cells, seeds, volume}] } }
 *   opts.wallThickness: Wanddicke fürs Verhältnis Fließweg/Wanddicke (sonst 2·Bezugsdicke)
 */
export async function solveFill(field, plan, opts = {}) {
  const { alpha = plan.alpha ?? 0.5, onProgress = null, wallThickness = null } = opts;
  const [nx, ny, nz] = field.dims;
  const N = nx * ny * nz;
  const d = field.data, h = field.h;
  const items = allItems(plan);
  const sh = shares(plan);

  /* „Dicke" einer Zelle ist der doppelte Wandabstand — auf der Mittelfläche
     die Wanddicke, zur Wand hin weniger. Bezug ist der Mittelwert davon
     über alle Innenzellen, damit α die Verteilung ändert, nicht das Tempo.
     (Für eine Platte ist dieser Mittelwert die halbe Wanddicke; als
     Wanddicke fürs Fließwegverhältnis nimmt der Aufrufer besser 2·V/A.) */
  let sum = 0, cells = 0;
  for (let i = 0; i < N; i++) if (d[i] < 0) { sum += -2 * d[i]; cells++; }
  const refThickness = cells ? sum / cells : 1;
  const speed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (d[i] >= 0) continue;
    const t = -2 * d[i];
    speed[i] = Math.min(5, Math.max(0.05, Math.pow(t / refThickness, alpha)));
  }

  const arrival = new Float32Array(N).fill(Infinity);
  const path = new Float32Array(N).fill(Infinity);
  const source = new Int16Array(N).fill(-1);
  const done = new Uint8Array(N);
  const heap = new Heap(Math.max(16, cells * 2 + 16), arrival);

  /* Quellen: Tempo je Anschnitt aus seinem Anteil, bezogen auf den Mittelwert. */
  const meanShare = items.length ? 1 / items.length : 1;
  const mult = items.map(it => Math.min(4, Math.max(0.25, (sh[it.id] ?? meanShare) / meanShare)));
  const seeds = items.map(it => seedCells(field, it));
  seeds.forEach((list, s) => {
    for (const idx of list) {
      if (arrival[idx] > 0) { arrival[idx] = 0; path[idx] = 0; source[idx] = s; heap.push(idx); }
    }
  });

  let pops = 0;
  const total = cells || 1;
  while (heap.size) {
    const c = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    if (onProgress && (++pops & 4095) === 0) { onProgress(pops / total); await new Promise(r => setTimeout(r, 0)); }
    const k = (c / (nx * ny)) | 0, j = ((c - k * nx * ny) / nx) | 0, i = c - (k * ny + j) * nx;
    const m = mult[source[c]] || 1;
    for (const [di, dj, dk, l] of NB) {
      const ii = i + di, jj = j + dj, kk = k + dk;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
      const nidx = (kk * ny + jj) * nx + ii;
      if (d[nidx] >= 0 || done[nidx]) continue;
      const step = l * h;
      const t = arrival[c] + step / (0.5 * (speed[c] + speed[nidx]) * m);
      if (t < arrival[nidx]) {
        arrival[nidx] = t;
        path[nidx] = path[c] + step;
        source[nidx] = source[c];
        heap.push(nidx);
      }
    }
  }

  /* Füllgrad: Rang der Ankunft im Volumen. */
  const order = [];
  for (let i = 0; i < N; i++) if (d[i] < 0 && Number.isFinite(arrival[i])) order.push(i);
  order.sort((a, b) => arrival[a] - arrival[b]);
  const frac = new Float32Array(N).fill(NaN);
  for (let r = 0; r < order.length; r++) frac[order[r]] = (r + 1) / order.length;
  const unreached = cells - order.length;

  let maxPath = 0;
  const perInlet = items.map(it => ({ id: it.id, cells: 0, seeds: 0 }));
  seeds.forEach((list, s) => { perInlet[s].seeds = list.length; });
  for (const i of order) {
    if (path[i] > maxPath) maxPath = path[i];
    if (source[i] >= 0) perInlet[source[i]].cells++;
  }
  const cellVol = h * h * h;
  for (const p of perInlet) p.volume = p.cells * cellVol;

  const wall = wallThickness || 2 * refThickness;
  return {
    arrival, frac, source, path, cells,
    stats: {
      maxPath, refThickness, wallThickness: wall, flowRatio: wall > 0 ? maxPath / wall : 0,
      unreached, volume: cells * cellVol, inlets: perInlet, alpha
    }
  };
}

/** Füllgrad bis an die Oberfläche ziehen: Außenzellen neben Innenzellen
    bekommen den kleinsten Füllgrad ihrer Innennachbarn — damit lässt sich
    der Wert an den Knoten des Netzes abtasten. */
export function fracToSurface(field, frac) {
  const [nx, ny, nz] = field.dims;
  const out = Float32Array.from(frac);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = (k * ny + j) * nx + i;
    if (!Number.isNaN(frac[idx])) continue;
    let best = Infinity;
    for (const [di, dj, dk] of NB) {
      const ii = i + di, jj = j + dj, kk = k + dk;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
      const v = frac[(kk * ny + jj) * nx + ii];
      if (!Number.isNaN(v) && v < best) best = v;
    }
    if (Number.isFinite(best)) out[idx] = best;
  }
  return out;
}

/** Trilinear abtasten (NaN-Zellen werden übersprungen). */
export function sampleFrac(field, fracSurf, x, y, z) {
  const [nx, ny, nz] = field.dims;
  const gx = (x - field.origin[0]) / field.h, gy = (y - field.origin[1]) / field.h, gz = (z - field.origin[2]) / field.h;
  const i0 = Math.max(0, Math.min(nx - 2, Math.floor(gx)));
  const j0 = Math.max(0, Math.min(ny - 2, Math.floor(gy)));
  const k0 = Math.max(0, Math.min(nz - 2, Math.floor(gz)));
  const fx = Math.max(0, Math.min(1, gx - i0)), fy = Math.max(0, Math.min(1, gy - j0)), fz = Math.max(0, Math.min(1, gz - k0));
  let sum = 0, wsum = 0;
  for (let dk = 0; dk <= 1; dk++) for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
    const v = fracSurf[((k0 + dk) * ny + j0 + dj) * nx + i0 + di];
    if (Number.isNaN(v)) continue;
    const w = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz);
    sum += v * w; wsum += w;
  }
  return wsum > 0 ? sum / wsum : NaN;
}

/**
 * Das Feld des Füllkörpers bei Füllgrad q: negativ, wo das Bauteil bis q
 * gefüllt ist, positiv sonst — für die Flächenextraktion
 * (js/part/surfacenets.js). Skaliert in mm, damit es zum Abstandsfeld passt.
 */
export function fillBodyField(field, frac, q) {
  const N = field.data.length;
  const data = new Float32Array(N);
  const K = Math.max(field.band, 1);
  for (let i = 0; i < N; i++) {
    const sdf = field.data[i];
    if (sdf >= 0) { data[i] = sdf; continue; }                          // außen: wie das Bauteil
    if (Number.isNaN(frac[i])) { data[i] = 0.5 * field.h; continue; }    // innen, aber nie erreicht
    data[i] = Math.max(sdf, (frac[i] - q) * K);
  }
  return { dims: field.dims, origin: field.origin, h: field.h, band: field.band, data, fullInside: true };
}

/**
 * Die zuletzt gefüllten Stellen: Innenzellen, deren Füllgrad keinen
 * größeren Nachbarn hat, ab `minFrac`, ohne Häufung. → [{ x, y, z, frac }]
 */
export function lastSpots(field, frac, { minFrac = 0.85, spacing = 15, limit = 30 } = {}) {
  const [nx, ny, nz] = field.dims;
  const found = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const idx = (k * ny + j) * nx + i;
    const v = frac[idx];
    if (Number.isNaN(v) || v < minFrac) continue;
    let top = true;
    for (const [di, dj, dk] of NB) {
      const w = frac[((k + dk) * ny + j + dj) * nx + i + di];
      if (!Number.isNaN(w) && w > v) { top = false; break; }
    }
    if (top) found.push({ x: field.origin[0] + i * field.h, y: field.origin[1] + j * field.h, z: field.origin[2] + k * field.h, frac: v });
  }
  found.sort((a, b) => b.frac - a.frac);
  const out = [];
  for (const m of found) {
    if (out.some(o => Math.hypot(m.x - o.x, m.y - o.y, m.z - o.z) < spacing)) continue;
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}
