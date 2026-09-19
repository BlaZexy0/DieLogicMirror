/* Sichtbarkeit in den sechs Hauptrichtungen (±X, ±Y, ±Z).

   Ein Dreieck ist aus Richtung d entformbar, wenn (1) seine Normale in
   Richtung d zeigt (n·d > 0 — sonst formt es die Gegenseite) und (2) auf
   dem Weg nach d nichts davor liegt. Punkt (2) ist die eigentliche
   Arbeit: er entscheidet über Hinterschnitte.

   Beschleunigung: die sechs Richtungen sind achsparallel. Ein Strahl aus
   einem Punkt (u, v, t) in Richtung d behält (u, v) bei — er bleibt in
   EINER Zelle eines Rasters über die beiden Querachsen. Es genügt also,
   die Dreiecke einmal je Richtung in ein 2D-Raster einzusortieren und
   pro Abtastpunkt nur die Dreiecke seiner Zelle zu prüfen. Damit kostet
   der Test O(F · Abtastpunkte · Dreiecke je Zelle) statt O(F²).

   Ergebnis je (Dreieck, Richtung):
     dot  = n·d               (sin der Entformschräge, < 0 = falsche Seite)
     frac = Anteil unverdeckter Abtastpunkte (1 = frei, 0 = ganz verdeckt) */

import { abortError } from '../abort.js';

export const DIRS = [
  { key: 'xp', axis: 0, sign:  1, label: '+X' },
  { key: 'xm', axis: 0, sign: -1, label: '−X' },
  { key: 'yp', axis: 1, sign:  1, label: '+Y' },
  { key: 'ym', axis: 1, sign: -1, label: '−Y' },
  { key: 'zp', axis: 2, sign:  1, label: '+Z' },
  { key: 'zm', axis: 2, sign: -1, label: '−Z' }
];

/* Eine Wand ohne Schräge hat n·d = 0 — im Netz aber nie genau: ein Sockel-
   streifen, der senkrecht gebaut ist, kommt mit n·d = −0,00002 aus dem
   Export. Mit einer harten Grenze bei 0 sähe die Hälfte ihn nicht, und
   die Regeln machten aus einem 7-mm²-Streifen einen Schieber. Deshalb
   gilt eine Fläche bis 0,5° Gegenschräge noch als der Richtung zugewandt
   und wird auf Verdeckung geprüft — ihr eigener Überhang zählt dabei mit:
   eine hohe Wand mit Gegenschräge verdeckt sich selbst und bleibt
   Hinterschnitt, ein Splitter ohne messbaren Überhang fällt der Hälfte
   zu. Die Zuordnung behandelt solche Flächen wie senkrechte Wände (0°),
   die Schrägen-Ansicht zeigt den negativen Winkel. */
export const FACING_DEG = 0.5;
export const FACING_EPS = Math.sin(FACING_DEG * Math.PI / 180);

/* Abtastpunkte in baryzentrischen Koordinaten: Schwerpunkt plus drei
   ecknahe Punkte. Sie liegen bewusst im Inneren — Punkte auf einer Kante
   würden vom Nachbardreieck „verdeckt". */
const BARY4 = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
const BARY7 = BARY4.concat([[0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45]]);

/** Regelmäßiges Gitter im Dreieck: die Schwerpunkte der n·(n+1)/2
    Teildreiecke einer n-fachen Unterteilung, baryzentrisch — für die
    Haftkarte (js/part/ejector.js), die große Dreiecke gleichmäßig auf
    Rasterzellen verteilt. */
const gridCache = new Map();
export function gridBary(n) {
  let g = gridCache.get(n);
  if (g) return g;
  g = [];
  for (let i = 0; i < n; i++) for (let j = 0; i + j < n; j++) {
    const k = n - 1 - i - j;
    g.push([(i + 1 / 3) / n, (j + 1 / 3) / n, (k + 1 / 3) / n]);
  }
  gridCache.set(n, g);
  return g;
}

const nextAxis = a => (a + 1) % 3;

/* Dreiecke nach ihrer Projektion auf (u, v) in ein Raster einsortieren
   (CSR: start[] + list[]). */
function buildBins(tris, F, ua, va, min, max, cells) {
  const spanU = Math.max(max[ua] - min[ua], 1e-9);
  const spanV = Math.max(max[va] - min[va], 1e-9);
  const cu = Math.max(1, Math.round(cells * Math.sqrt(spanU / spanV)));
  const cv = Math.max(1, Math.round(cells * Math.sqrt(spanV / spanU)));
  const du = cu / spanU, dv = cv / spanV;
  const cellOf = (val, m, d, n) => Math.min(n - 1, Math.max(0, Math.floor((val - m) * d)));

  const count = new Uint32Array(cu * cv + 1);
  const lo = new Int32Array(F * 4);                 // u0,u1,v0,v1 je Dreieck
  for (let f = 0; f < F; f++) {
    const i = f * 9;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const u = tris[i + k * 3 + ua], v = tris[i + k * 3 + va];
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const a = cellOf(u0, min[ua], du, cu), b = cellOf(u1, min[ua], du, cu);
    const c = cellOf(v0, min[va], dv, cv), d = cellOf(v1, min[va], dv, cv);
    lo[f * 4] = a; lo[f * 4 + 1] = b; lo[f * 4 + 2] = c; lo[f * 4 + 3] = d;
    for (let x = a; x <= b; x++) for (let y = c; y <= d; y++) count[y * cu + x + 1]++;
  }
  for (let i = 0; i < cu * cv; i++) count[i + 1] += count[i];
  const list = new Uint32Array(count[cu * cv]);
  const fill = count.slice();
  for (let f = 0; f < F; f++) {
    const a = lo[f * 4], b = lo[f * 4 + 1], c = lo[f * 4 + 2], d = lo[f * 4 + 3];
    for (let x = a; x <= b; x++) for (let y = c; y <= d; y++) list[fill[y * cu + x]++] = f;
  }
  return { start: count, list, cu, cv, du, dv, minU: min[ua], minV: min[va] };
}

function computeDirection(model, dirIndex, out, samples, cells) {
  const { tris, normals, faceCount: F, bounds: b } = model;
  const dir = DIRS[dirIndex];
  const ax = dir.axis, sg = dir.sign;
  const ua = nextAxis(ax), va = nextAxis(ua);
  const bins = buildBins(tris, F, ua, va, b.min, b.max, cells);
  const eps = b.diag * 1e-6;
  /* Die Abtastpunkte liegen um einen Hauch VOR der Fläche (entlang ihrer
     Normale). Genau auf der Fläche träfe ein streifender Strahl die Kante
     eines Nachbarn, der in derselben Ebene endet — die Unterseite eines
     Tellers galt so als verdeckt vom Tellerrand, eine Querbohrung als
     verdeckt vom Rand ihrer eigenen Mündung. */
  const lift = b.diag * 1e-5;
  const bary = samples >= 7 ? BARY7 : BARY4;
  const K = bary.length;

  for (let f = 0; f < F; f++) {
    const nd = normals[f * 3 + ax] * sg;
    out.dot[f * 6 + dirIndex] = nd;
    /* Auch Flächen mit nd ≈ 0 (senkrechte Wände, 0° Schräge) werden
       geprüft: erst damit kann die Mindest-Entformschräge bis 0
       heruntergedreht werden und die Wand fällt der Hälfte zu, statt
       einen Schieber zu verlangen. Bis FACING_EPS Gegenschräge ebenso. */
    if (nd < -FACING_EPS) { out.frac[f * 6 + dirIndex] = 0; continue; }

    const i = f * 9;
    const nx = normals[f * 3] * lift, ny = normals[f * 3 + 1] * lift, nz = normals[f * 3 + 2] * lift;
    let free = 0;
    for (let s = 0; s < K; s++) {
      const [w0, w1, w2] = bary[s];
      const px = tris[i] * w0 + tris[i + 3] * w1 + tris[i + 6] * w2 + nx;
      const py = tris[i + 1] * w0 + tris[i + 4] * w1 + tris[i + 7] * w2 + ny;
      const pz = tris[i + 2] * w0 + tris[i + 5] * w1 + tris[i + 8] * w2 + nz;
      const pu = ua === 0 ? px : ua === 1 ? py : pz;
      const pv = va === 0 ? px : va === 1 ? py : pz;
      const cx = Math.min(bins.cu - 1, Math.max(0, Math.floor((pu - bins.minU) * bins.du)));
      const cy = Math.min(bins.cv - 1, Math.max(0, Math.floor((pv - bins.minV) * bins.dv)));
      const c0 = bins.start[cy * bins.cu + cx], c1 = bins.start[cy * bins.cu + cx + 1];

      let blocked = false;
      for (let k = c0; k < c1 && !blocked; k++) {
        const g = bins.list[k];
        if (g === f) continue;
        const gnd = normals[g * 3 + ax] * sg;
        if (gnd > -1e-12 && gnd < 1e-12) continue;        // parallel zum Strahl
        const j = g * 9;
        /* 2D-Punkt-in-Dreieck auf der projizierten Fläche. */
        const a0 = tris[j + ua], a1 = tris[j + va];
        const b0 = tris[j + 3 + ua], b1 = tris[j + 3 + va];
        const c2 = tris[j + 6 + ua], c3 = tris[j + 6 + va];
        const d1 = (b0 - a0) * (pv - a1) - (b1 - a1) * (pu - a0);
        const d2 = (c2 - b0) * (pv - b1) - (c3 - b1) * (pu - b0);
        const d3 = (a0 - c2) * (pv - c3) - (a1 - c3) * (pu - c2);
        const neg = d1 < 0 || d2 < 0 || d3 < 0;
        const pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (neg && pos) continue;
        /* Abstand entlang der Richtung: Ebene n·x = n·a. */
        const gx = model.normals[g * 3], gy = model.normals[g * 3 + 1], gz = model.normals[g * 3 + 2];
        const wg = gx * tris[j] + gy * tris[j + 1] + gz * tris[j + 2];
        const lam = (wg - (gx * px + gy * py + gz * pz)) / gnd;
        if (lam > eps) blocked = true;
      }
      if (!blocked) free++;
    }
    out.frac[f * 6 + dirIndex] = free / K;
  }
}

const cellsFor = F => Math.min(384, Math.max(8, Math.round(Math.sqrt(F / 3))));

/** Eine Richtung allein — für den Worker (js/part/visibility-worker.js). */
export function computeOneDirection(model, dirIndex, samples) {
  const out = { dot: new Float32Array(model.faceCount * 6), frac: new Float32Array(model.faceCount * 6) };
  computeDirection(model, dirIndex, out, samples, cellsFor(model.faceCount));
  return out;
}

/* Die sechs Richtungen sind unabhängig — im Browser rechnen sie
   parallel in Web-Workern (einer je Richtung, so viele wie Kerne da sind).
   Ohne Worker (Node, die Tests) läuft alles im selben Faden. */
function parallelVisibility(model, samples, onProgress, signal) {
  const F = model.faceCount;
  const out = { dot: new Float32Array(F * 6), frac: new Float32Array(F * 6), samples };
  const slim = { tris: model.tris, normals: model.normals, faceCount: F, bounds: model.bounds };
  const url = new URL('./visibility-worker.js', import.meta.url);
  const n = Math.max(1, Math.min(6, (globalThis.navigator && navigator.hardwareConcurrency) || 2));
  const queue = [0, 1, 2, 3, 4, 5];
  let done = 0;
  return new Promise((resolve, reject) => {
    const workers = [];
    const finish = () => { for (const w of workers) w.terminate(); };
    if (signal) signal.addEventListener('abort', () => { finish(); reject(abortError()); }, { once: true });
    const feed = w => {
      if (!queue.length) { w.terminate(); return; }
      w.postMessage({ model: slim, dir: queue.shift(), samples });
    };
    for (let i = 0; i < n; i++) {
      const w = new Worker(url, { type: 'module' });
      workers.push(w);
      w.onmessage = e => {
        const { dir, dot, frac } = e.data;
        for (let f = 0; f < F; f++) {
          out.dot[f * 6 + dir] = dot[f * 6 + dir];
          out.frac[f * 6 + dir] = frac[f * 6 + dir];
        }
        done++;
        if (onProgress) onProgress(done / 6, DIRS[dir].label);
        if (done === 6) { finish(); resolve(out); } else feed(w);
      };
      w.onerror = err => { finish(); reject(err.error || new Error(err.message || 'Worker-Fehler')); };
      feed(w);
    }
  });
}

/** Sichtbarkeit aller sechs Richtungen. Ist onProgress gesetzt, wird
    zwischen den Richtungen die Kontrolle abgegeben, damit der Fortschritt
    in der Oberfläche ankommt; ohne Rückruf läuft alles am Stück durch
    (so rufen die Tests es auf). */
export async function computeVisibility(model, opts = {}) {
  const { samples = 4, onProgress = null, signal = null } = opts;
  const check = () => { if (signal && signal.aborted) throw abortError(); };
  if (typeof Worker !== 'undefined' && opts.parallel !== false) {
    try {
      return await parallelVisibility(model, samples, onProgress, signal);
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      console.warn('Sichtbarkeit: Worker nicht verfügbar, rechne im Hauptfaden —', err.message);
    }
  }
  check();
  const F = model.faceCount;
  const out = { dot: new Float32Array(F * 6), frac: new Float32Array(F * 6), samples };
  const cells = cellsFor(F);
  for (let d = 0; d < 6; d++) {
    computeDirection(model, d, out, samples, cells);
    if (onProgress) {
      onProgress((d + 1) / 6, DIRS[d].label);
      await new Promise(r => setTimeout(r, 0));
    }
    check();
  }
  return out;
}
