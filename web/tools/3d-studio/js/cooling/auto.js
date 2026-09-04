/* Kühlstiche automatisch setzen.

   Die Frage ist eine Überdeckung: wo müssen N Bohrungen auf der
   Abstandsfläche sitzen, damit jede Stelle im Bauteil eine Bohrung in
   der Nähe hat — und dicke Stellen eher als dünne, denn dort steckt die
   Wärme, und dort erstarrt das Teil zuletzt.

   Rechnerisch: die Zellen des Bauteils (Feldwert innen) sind die Masse,
   jede mit ihrer halben Wandstärke |v| als Gewicht; die Kandidaten für
   Bohrungen sind Punkte der Abstandsfläche. Gesucht sind N Kandidaten,
   die die gewichtete Summe der Abstandsquadrate jeder Zelle zu ihrer
   nächsten Bohrung klein machen — das Abstandsfeld, das die Bohrungen
   IM BAUTEIL erzeugen, soll überall gleichmäßig klein sein.

   Zwei Schritte, beides Lehrbuch:
     1. Gieriger Start (k-center): die Zelle mit dem größten gewichteten
        Abstand zur nächsten schon gesetzten Bohrung bestimmt die
        nächste — der ihr nächste Kandidat wird gesetzt. So bekommt jede
        Ecke des Bauteils zuerst eine Bohrung, bevor irgendwo eine
        zweite steht.
     2. Verfeinern (k-means auf der Fläche): jede Zelle gehört zu ihrer
        nächsten Bohrung; jede Bohrung rückt an den Kandidaten, der dem
        gewichteten Schwerpunkt ihrer Zellen am nächsten liegt. Ein paar
        Runden, bis nichts mehr wandert.

   Kandidaten dichter als `minSpacing` an einer gesetzten Bohrung
   scheiden aus — zwei Bohrungen, die sich berühren, sind eine.

   Die Richtung jeder Bohrung ist die nach außen gerichtete Normale der
   Abstandsfläche, hier als Gradient des Feldes an der Stelle. Alles
   läuft ohne Three.js und in den Tests unter Node. */

import { sampleField } from '../part/field.js';

/* Ein einfacher, reproduzierbarer Zufall (Park–Miller) — die Unterabtastung
   soll bei gleichem Feld dieselben Bohrungen liefern. */
function rng(seed) {
  let s = (seed % 2147483647) || 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

/** Zellen des Bauteils mit Gewicht |v|^pow, auf höchstens `max` unterabgetastet. */
export function interiorCells(field, { max = 20000, pow = 1, seed = 7 } = {}) {
  const [nx, ny, nz] = field.dims;
  const d = field.data;
  let count = 0;
  for (let i = 0; i < d.length; i++) if (d[i] < 0) count++;
  const keep = Math.min(1, max / Math.max(count, 1));
  const rand = rng(seed);
  const out = [];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = d[(k * ny + j) * nx + i];
        if (v >= 0) continue;
        if (keep < 1 && rand() > keep) continue;
        out.push({
          p: [field.origin[0] + i * field.h, field.origin[1] + j * field.h, field.origin[2] + k * field.h],
          w: Math.pow(-v, pow)
        });
      }
    }
  }
  return out;
}

/** Kandidaten: die Eckpunkte der Abstandsfläche, auf höchstens `max` verdünnt. */
export function shellCandidates(tris, { max = 6000, seed = 11 } = {}) {
  const n = tris.length / 3;
  const keep = Math.min(1, max / Math.max(n, 1));
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < tris.length; i += 3) {
    if (keep < 1 && rand() > keep) continue;
    out.push([tris[i], tris[i + 1], tris[i + 2]]);
  }
  return out;
}

/** Nach außen gerichtete Normale der Abstandsfläche: der Feldgradient. */
export function outwardNormal(field, p) {
  const e = field.h * 0.5;
  const g = [
    sampleField(field, p[0] + e, p[1], p[2]) - sampleField(field, p[0] - e, p[1], p[2]),
    sampleField(field, p[0], p[1] + e, p[2]) - sampleField(field, p[0], p[1] - e, p[2]),
    sampleField(field, p[0], p[1], p[2] + e) - sampleField(field, p[0], p[1], p[2] - e)
  ];
  const l = Math.hypot(g[0], g[1], g[2]);
  return l > 1e-12 ? [g[0] / l, g[1] / l, g[2] / l] : [0, 0, 1];
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * N Bohrungen auf der Abstandsfläche.
 *   field        Rasterfeld (js/part/field.js)
 *   shellTris    Dreiecke der Abstandsfläche
 *   count        Zahl der Bohrungen
 *   minSpacing   kleinster Abstand zweier Bohrungen, mm
 *   rounds       Verfeinerungsrunden
 * → { sites: [{ p, n }], stats: { mean, max, covered }, cells, candidates }
 *   mean/max: gewichteter mittlerer / größter Abstand einer Bauteilzelle zur
 *   nächsten Bohrungsachse (Spitze), mm.
 */
export function planCooling(field, shellTris, opts = {}) {
  const { count = 8, minSpacing = 20, rounds = 8, pow = 1 } = opts;
  const cells = interiorCells(field, { pow });
  const cands = shellCandidates(shellTris);
  if (!cells.length || !cands.length || count < 1) return { sites: [], stats: { mean: 0, max: 0 }, cells, candidates: cands };
  const N = Math.min(count, cands.length);
  const minSq = minSpacing * minSpacing;

  /* Nächster Kandidat zu einem Punkt, der zu allen gesetzten Bohrungen
     Abstand hält. */
  const nearestCand = (p, sites, skipSpacing) => {
    let best = null, bd = Infinity;
    for (const c of cands) {
      const dd = d2(c, p);
      if (dd >= bd) continue;
      if (!skipSpacing && sites.some(s => d2(s, c) < minSq)) continue;
      best = c; bd = dd;
    }
    return best;
  };

  /* 1. Gieriger Start. Die erste Bohrung geht an den gewichteten
     Schwerpunkt — die Mitte der Masse. */
  const sites = [];
  const nearestSiteD2 = new Float64Array(cells.length).fill(Infinity);
  {
    let cx = 0, cy = 0, cz = 0, W = 0;
    for (const c of cells) { cx += c.p[0] * c.w; cy += c.p[1] * c.w; cz += c.p[2] * c.w; W += c.w; }
    const first = nearestCand([cx / W, cy / W, cz / W], sites, true);
    sites.push(first);
  }
  const updateNearest = () => {
    for (let i = 0; i < cells.length; i++) {
      let m = nearestSiteD2[i];
      const s = sites[sites.length - 1];
      const dd = d2(cells[i].p, s);
      if (dd < m) m = dd;
      nearestSiteD2[i] = m;
    }
  };
  updateNearest();
  while (sites.length < N) {
    let worst = -1, wv = -1;
    for (let i = 0; i < cells.length; i++) {
      const score = cells[i].w * nearestSiteD2[i];
      if (score > wv) { wv = score; worst = i; }
    }
    const c = nearestCand(cells[worst].p, sites, false) || nearestCand(cells[worst].p, sites, true);
    if (!c) break;
    sites.push(c);
    updateNearest();
  }

  /* 2. Verfeinern: Zellen zuordnen, Bohrungen zum Schwerpunkt ihrer
     Zellen rücken (auf die Fläche gelotet). */
  const assign = new Int32Array(cells.length);
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < cells.length; i++) {
      let best = 0, bd = Infinity;
      for (let s = 0; s < sites.length; s++) {
        const dd = d2(cells[i].p, sites[s]);
        if (dd < bd) { bd = dd; best = s; }
      }
      assign[i] = best;
    }
    const acc = sites.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < cells.length; i++) {
      const a = acc[assign[i]], c = cells[i];
      a[0] += c.p[0] * c.w; a[1] += c.p[1] * c.w; a[2] += c.p[2] * c.w; a[3] += c.w;
    }
    let moved = 0;
    for (let s = 0; s < sites.length; s++) {
      if (acc[s][3] <= 0) continue;
      const centroid = [acc[s][0] / acc[s][3], acc[s][1] / acc[s][3], acc[s][2] / acc[s][3]];
      const others = sites.filter((_, k) => k !== s);
      const c = nearestCand(centroid, others, false) || nearestCand(centroid, others, true);
      if (c && d2(c, sites[s]) > 1e-9) { sites[s] = c; moved++; }
    }
    if (!moved) break;
  }

  /* Kennzahlen: gewichteter mittlerer und größter Abstand der Zellen
     zur nächsten Bohrung. */
  let sum = 0, W = 0, max = 0;
  for (let i = 0; i < cells.length; i++) {
    let bd = Infinity;
    for (const s of sites) { const dd = d2(cells[i].p, s); if (dd < bd) bd = dd; }
    const dist = Math.sqrt(bd);
    sum += dist * cells[i].w; W += cells[i].w;
    if (dist > max) max = dist;
  }
  return {
    sites: sites.map(p => ({ p: p.slice(), n: outwardNormal(field, p) })),
    stats: { mean: W > 0 ? sum / W : 0, max },
    cells, candidates: cands
  };
}
