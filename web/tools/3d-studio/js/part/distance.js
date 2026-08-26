/* Abstand zwischen zwei Netzen.

   Wozu: die Offsetflächen beantworten die Frage nach INNEN — wie dick
   ist das Bauteil, wo erstarrt es zuletzt. Nach AUSSEN steht die andere
   Frage: wie weit ist die Bauteiloberfläche vom Temperierkanal entfernt,
   vom Auswerferstift, vom Nachbarteil? Dafür braucht es zwei Körper,
   nicht einen — und den kürzesten Abstand von jedem Punkt des einen zur
   Oberfläche des anderen.

   Gerechnet wird EXAKT, nicht über ein Raster: für jeden Abfragepunkt
   wird der echte Punkt-Dreieck-Abstand bestimmt. Das Raster dient nur
   der Beschleunigung — die Dreiecke des Gegenstücks liegen in
   Würfelzellen, und die Suche wächst in Schalen um die Zelle des
   Abfragepunktes, bis der bisher beste Abstand kleiner ist als der
   Abstand zur nächsten unbesuchten Schale. Ab da kann nichts Näheres
   mehr kommen, und die Suche hört auf.

   Kein Three.js — damit unter Node testbar. */

import { bounds, weld, distSqPointTri } from '../mesh.js';

/** Dreiecke eines Netzes in ein Würfelraster einsortieren. */
export function buildLocator(tris, opts = {}) {
  const F = tris.length / 9;
  const b = bounds(tris);
  /* Zwei Ansprüche an die Zellgröße, die gegeneinander laufen: fein
     genug, dass in einer Zelle wenige Dreiecke liegen — und grob genug,
     dass die Suche nach einem weit entfernten Punkt nicht über Dutzende
     Schalen laufen muss. Ist der interessierende Höchstabstand bekannt
     (die Obergrenze der Farbskala), gibt er die zweite Schranke: mit
     einer Zelle von etwa einem Drittel davon ist jede Suche nach drei
     Schalen vorbei. */
  const longest = Math.max(b.size[0], b.size[1], b.size[2]) || 1;
  const n = opts.cells || Math.max(1, Math.min(200, Math.round(Math.cbrt(F / 2))));
  let cell = longest / n;
  if (opts.maxDist && isFinite(opts.maxDist)) cell = Math.max(cell, opts.maxDist / 3);
  cell = Math.max(cell, b.diag * 1e-6);
  const dims = [0, 1, 2].map(a => Math.max(1, Math.floor(b.size[a] / cell) + 1));

  const idx = (i, j, k) => (k * dims[1] + j) * dims[0] + i;
  const clampAt = (v, a) => Math.max(0, Math.min(dims[a] - 1, Math.floor((v - b.min[a]) / cell)));

  const count = new Uint32Array(dims[0] * dims[1] * dims[2] + 1);
  const box = new Int32Array(F * 6);
  for (let t = 0; t < F; t++) {
    const o = t * 9;
    for (let a = 0; a < 3; a++) {
      const v0 = Math.min(tris[o + a], tris[o + 3 + a], tris[o + 6 + a]);
      const v1 = Math.max(tris[o + a], tris[o + 3 + a], tris[o + 6 + a]);
      box[t * 6 + a] = clampAt(v0, a);
      box[t * 6 + 3 + a] = clampAt(v1, a);
    }
    for (let k = box[t * 6 + 2]; k <= box[t * 6 + 5]; k++)
      for (let j = box[t * 6 + 1]; j <= box[t * 6 + 4]; j++)
        for (let i = box[t * 6]; i <= box[t * 6 + 3]; i++) count[idx(i, j, k) + 1]++;
  }
  for (let i = 0; i < count.length - 1; i++) count[i + 1] += count[i];
  const list = new Uint32Array(count[count.length - 1]);
  const fill = count.slice();
  for (let t = 0; t < F; t++) {
    for (let k = box[t * 6 + 2]; k <= box[t * 6 + 5]; k++)
      for (let j = box[t * 6 + 1]; j <= box[t * 6 + 4]; j++)
        for (let i = box[t * 6]; i <= box[t * 6 + 3]; i++) list[fill[idx(i, j, k)]++] = t;
  }
  return { tris, faceCount: F, bounds: b, cell, dims, start: count, list };
}

/** Kürzester Abstand eines Punktes zur Oberfläche. maxDist begrenzt die
    Suche — was weiter weg liegt, interessiert für die Skala ohnehin
    nicht und kostet nur Zeit. Gibt dann maxDist zurück. */
export function closestDistance(loc, px, py, pz, maxDist = Infinity) {
  const { tris, cell, dims, start, list, bounds: b } = loc;
  const ci = Math.max(0, Math.min(dims[0] - 1, Math.floor((px - b.min[0]) / cell)));
  const cj = Math.max(0, Math.min(dims[1] - 1, Math.floor((py - b.min[1]) / cell)));
  const ck = Math.max(0, Math.min(dims[2] - 1, Math.floor((pz - b.min[2]) / cell)));
  const maxRing = Math.max(dims[0], dims[1], dims[2]);
  let best = maxDist === Infinity ? Infinity : maxDist * maxDist;

  /* Abstand des Abfragepunktes zur Zelle selbst. Liegt schon die Zelle
     weiter weg als der bisher beste Fund, kann kein Dreieck darin näher
     sein — das spart den teuren Dreieckstest fast überall, vor allem
     wenn der Punkt außerhalb des Rasters liegt. */
  const cellDist2 = (i, j, k) => {
    let s = 0;
    const lx = b.min[0] + i * cell, ly = b.min[1] + j * cell, lz = b.min[2] + k * cell;
    let d = px < lx ? lx - px : px > lx + cell ? px - lx - cell : 0; s += d * d;
    d = py < ly ? ly - py : py > ly + cell ? py - ly - cell : 0; s += d * d;
    d = pz < lz ? lz - pz : pz > lz + cell ? pz - lz - cell : 0; s += d * d;
    return s;
  };

  const test = (i, j, k) => {
    if (cellDist2(i, j, k) >= best) return;
    const c = (k * dims[1] + j) * dims[0] + i;
    for (let e = start[c]; e < start[c + 1]; e++) {
      const o = list[e] * 9;
      const d2 = distSqPointTri(px, py, pz,
        tris[o], tris[o + 1], tris[o + 2],
        tris[o + 3], tris[o + 4], tris[o + 5],
        tris[o + 6], tris[o + 7], tris[o + 8]);
      if (d2 < best) best = d2;
    }
  };

  for (let r = 0; r <= maxRing; r++) {
    /* Abbruch: wie weit reicht das bisher Abgesuchte vom Abfragepunkt
       aus mindestens? Alles außerhalb ist weiter weg — ist der beste
       Fund näher, kann nichts mehr kommen. Gemessen wird vom PUNKT aus,
       nicht in Zellen: sonst liefe die Suche für Punkte außerhalb des
       Rasters unnötig lange. */
    if (r > 0) {
      let covered = Infinity;
      for (let a2 = 0; a2 < 3; a2++) {
        const c0 = [ci, cj, ck][a2] - r + 1, c1 = [ci, cj, ck][a2] + r - 1;
        const p = [px, py, pz][a2];
        if (c0 > 0) covered = Math.min(covered, p - (b.min[a2] + c0 * cell));
        if (c1 < dims[a2] - 1) covered = Math.min(covered, b.min[a2] + (c1 + 1) * cell - p);
      }
      if (covered > 0 && covered * covered >= best) break;
    }
    /* Nur die SCHALE mit Chebyshev-Abstand r ablaufen, nicht den ganzen
       Würfel: k am Rand → volle Fläche, sonst j am Rand → volle Zeile,
       sonst nur die beiden i-Ränder. */
    let touched = false;
    for (let k = Math.max(0, ck - r); k <= Math.min(dims[2] - 1, ck + r); k++) {
      const kEdge = Math.abs(k - ck) === r;
      for (let j = Math.max(0, cj - r); j <= Math.min(dims[1] - 1, cj + r); j++) {
        const jEdge = Math.abs(j - cj) === r;
        const lo = Math.max(0, ci - r), hi = Math.min(dims[0] - 1, ci + r);
        if (kEdge || jEdge) {
          for (let i = lo; i <= hi; i++) { test(i, j, k); touched = true; }
        } else {
          if (ci - r >= 0) { test(ci - r, j, k); touched = true; }
          if (r > 0 && ci + r <= dims[0] - 1) { test(ci + r, j, k); touched = true; }
        }
      }
    }
    /* Nichts mehr im Raster und schon etwas gefunden → aufhören. */
    if (!touched && best < Infinity) break;
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
}

/** Abstand JE PUNKT des Netzes zur Oberfläche des Gegenstücks.
    Punktweise (nicht je Dreieck), damit die Einfärbung weich verläuft.
    Ist onProgress gesetzt, wird zwischendurch die Kontrolle abgegeben. */
export async function distanceToMesh(model, loc, opts = {}) {
  const { maxDist = Infinity, onProgress = null } = opts;
  const V = model.vertexCount;
  const out = new Float32Array(V);
  const verts = model.verts;
  const chunk = onProgress ? Math.max(500, Math.ceil(V / 30)) : V;
  for (let s = 0; s < V; s += chunk) {
    const end = Math.min(V, s + chunk);
    for (let v = s; v < end; v++) {
      out[v] = closestDistance(loc, verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2], maxDist);
    }
    if (onProgress) {
      onProgress(end / V);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  return out;
}

/** Kennzahlen einer Abstandsverteilung, gewichtet mit der Fläche der
    anliegenden Dreiecke — sonst zählte ein dicht vernetzter Bereich
    stärker als ein grob vernetzter gleicher Größe. */
export function distanceStats(model, dist) {
  let min = Infinity, max = -Infinity, sum = 0, area = 0;
  for (let f = 0; f < model.faceCount; f++) {
    const a = model.areas[f];
    let d = 0;
    for (let e = 0; e < 3; e++) d += dist[model.index[f * 3 + e]];
    d /= 3;
    if (d < min) min = d;
    if (d > max) max = d;
    sum += d * a;
    area += a;
  }
  return {
    min: isFinite(min) ? min : 0,
    max: isFinite(max) ? max : 0,
    mean: area ? sum / area : 0
  };
}
