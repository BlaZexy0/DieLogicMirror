/* Die Frontausbreitung der Füllabschätzung — mit VORSPRUNG je Anschnitt.

   Dasselbe Verfahren wie js/fill/solve.js (Dijkstra über die
   26er-Nachbarschaft, Dünnwand-Bremse, Tempo je Anschnitt aus seinem
   Anteil), um eines erweitert: jeder Anschnitt darf später starten. Die
   Werkbank weiß aus dem Anguss und der Schusskurve, wann die Schmelze
   welchen Anschnitt erreicht (js/werkbank/shottime.js), und aus der
   Uhr der Füllung (js/werkbank/filltime.js), wie viel die früheren bis
   dahin gefüllt haben — dieser Vorsprung wird in den Einheiten der
   Rechnung an den Startzellen des späteren Anschnitts angesetzt.

   Die Startzellen und alles Abgeleitete (Füllgrad an die Oberfläche,
   Füllkörper, letzte Stellen) kommen unverändert aus js/fill/solve.js;
   die Seite dort bleibt, wie sie ist. */

import { seedCells } from '../fill/solve.js';
import { shares, allItems } from '../fill/model.js';

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

const NB = [];
for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
  if (di || dj || dk) NB.push([di, dj, dk, Math.hypot(di, dj, dk)]);
}

/**
 * Wie solveFill in js/fill/solve.js — dazu opts.offsets: { id → Einheiten },
 * der Vorsprung, mit dem die Startzellen eines Anschnitts beginnen.
 */
export async function solveFillOffset(field, plan, opts = {}) {
  const { alpha = plan.alpha ?? 0.5, onProgress = null, wallThickness = null, offsets = null } = opts;
  const [nx, ny, nz] = field.dims;
  const N = nx * ny * nz;
  const d = field.data, h = field.h;
  const items = allItems(plan);
  const sh = shares(plan);

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

  const meanShare = items.length ? 1 / items.length : 1;
  const mult = items.map(it => Math.min(4, Math.max(0.25, (sh[it.id] ?? meanShare) / meanShare)));
  const seeds = items.map(it => seedCells(field, it));
  const start = items.map(it => (offsets && Number.isFinite(offsets[it.id]) ? Math.max(0, offsets[it.id]) : 0));
  seeds.forEach((list, s) => {
    for (const idx of list) {
      if (arrival[idx] > start[s]) { arrival[idx] = start[s]; path[idx] = 0; source[idx] = s; heap.push(idx); }
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

  const order = [];
  for (let i = 0; i < N; i++) if (d[i] < 0 && Number.isFinite(arrival[i])) order.push(i);
  order.sort((a, b) => arrival[a] - arrival[b]);
  const frac = new Float32Array(N).fill(NaN);
  for (let r = 0; r < order.length; r++) frac[order[r]] = (r + 1) / order.length;
  const unreached = cells - order.length;

  let maxPath = 0;
  const perInlet = items.map((it, s) => ({ id: it.id, cells: 0, seeds: 0, offset: start[s] }));
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
      unreached, volume: cells * cellVol, inlets: perInlet, alpha,
      offsets: offsets ? { ...offsets } : null
    }
  };
}
