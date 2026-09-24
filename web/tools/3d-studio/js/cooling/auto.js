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

   Was gesetzt wird, hält drei Regeln — und wo sie nicht aufgehen, werden
   es weniger Bohrungen, nie eine, die eine Regel bricht:
     - Kein Kandidat, an dem ein Stich mit den Vorgabemaßen den
       Mindest-Wandabstand nicht hält, auf seiner GANZEN Länge (`fits`,
       dieselbe Prüfung wie im Modus „Prüfung"). Die Spitze sitzt auf der
       Abstandsfläche und hält ihn mit „Auto" immer; in einer Tasche läuft
       der Stich aber quer durch den Hohlraum und kommt der Wand gegenüber
       nahe.
     - Zwei Bohrungsachsen kommen sich nicht näher als `minSpacing` —
       gemessen als Abstand der Strecken, nicht nur der Spitzen: zwei
       Stiche in einer Tasche laufen aufeinander zu, auch wenn ihre
       Spitzen weit auseinander sitzen. Zwei Bohrungen, die sich
       berühren, sind eine.
     - Was schon steht (`fixed`: von Hand gesetzte Stiche, Kanäle, die
       automatischen eines früheren Laufs), bleibt, zählt zur Überdeckung
       und wird ebenso auf Abstand gehalten. Ohne das setzte ein zweiter
       Lauf ohne „Ersetzen" dieselben Stiche noch einmal auf die ersten.

   Die Richtung jeder Bohrung sagt `direction` aus der nach außen
   gerichteten Normalen der Abstandsfläche, hier als Gradient des Feldes
   an der Stelle — ohne Angabe ist sie es selbst. Alles läuft ohne
   Three.js und in den Tests unter Node. */

import { sampleField } from '../part/field.js';

/** Enger als 1,5 × Ø stehen zwei Bohrungen nicht, gleich was der Regler
    sagt: dazwischen bleibt ein halber Durchmesser Stahl. */
export const SPACING_FACTOR = 1.5;

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

/** Nach außen gerichtete Normale der Abstandsfläche: der Feldgradient.
    Wo er verschwindet (mitten zwischen zwei gleich fernen Wänden), gilt
    `fallback`. */
export function outwardNormal(field, p, fallback = [0, 0, 1]) {
  const e = field.h * 0.5;
  const g = [
    sampleField(field, p[0] + e, p[1], p[2]) - sampleField(field, p[0] - e, p[1], p[2]),
    sampleField(field, p[0], p[1] + e, p[2]) - sampleField(field, p[0], p[1] - e, p[2]),
    sampleField(field, p[0], p[1], p[2] + e) - sampleField(field, p[0], p[1], p[2] - e)
  ];
  const l = Math.hypot(g[0], g[1], g[2]);
  /* Ein Abstandsfeld steigt je mm um einen mm; über 2e mm also um 2e. Ist
     davon kaum etwas übrig, weiß der Gradient keine Richtung. */
  return l > 0.05 * e ? [g[0] / l, g[1] / l, g[2] / l] : fallback.slice();
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Kleinster Abstand² zweier Strecken p0–p1 und q0–q1 (nächste Punkte nach
    Ericson; eine Strecke der Länge 0 ist ein Punkt). */
export function segmentDist2(p0, p1, q0, q1) {
  const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
  const w = [p0[0] - q0[0], p0[1] - q0[1], p0[2] - q0[2]];
  const a = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
  const e = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  const f = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
  const cl = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) return d2(p0, q0);
  if (a <= 1e-12) t = cl(f / e);
  else {
    const c = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
    if (e <= 1e-12) s = cl(-c / a);
    else {
      const b = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const den = a * e - b * b;
      s = den > 1e-12 ? cl((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = cl(-c / a); } else if (t > 1) { t = 1; s = cl((b - c) / a); }
    }
  }
  const dx = w[0] + u[0] * s - v[0] * t, dy = w[1] + u[1] * s - v[1] * t, dz = w[2] + u[2] * s - v[2] * t;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * N Bohrungen auf der Abstandsfläche.
 *   field        Rasterfeld (js/part/field.js)
 *   shellTris    Dreiecke der Abstandsfläche
 *   count        Zahl der Bohrungen
 *   minSpacing   kleinster Abstand zweier Bohrungsachsen, mm
 *   rounds       Verfeinerungsrunden
 *   direction    (p, n) → Richtung des Stichs an der Stelle (Vorgabe: n)
 *   length, d    Länge und Durchmesser der Stiche, mm — mit der Länge wird
 *                der Abstand der Achsen gemessen (0: nur der der Spitzen)
 *   fits         (p, dir) → hält ein Stich dort den Mindest-Wandabstand?
 *   fixed        was schon steht und bleibt: [{ a, b, d, line }], die Achse
 *                von a (am Bauteil) nach b; ein Kühlstich kühlt an seiner
 *                Spitze a, ein Kanal (line) auf ganzer Länge
 * → { sites: [{ p, n, dir }], stats: { mean, max }, cells, candidates, usable }
 *   mean/max: gewichteter mittlerer / größter Abstand einer Bauteilzelle zur
 *   nächsten Bohrung (Spitze eines Stichs, Achse eines Kanals), mm.
 *   usable: wie viele Kandidaten die Prüfung `fits` bestanden haben.
 */
export function planCooling(field, shellTris, opts = {}) {
  const { count = 8, minSpacing = 20, rounds = 8, pow = 1, direction = null, length = 0, d = 0, fits = null, fixed = [] } = opts;
  const cells = interiorCells(field, { pow });
  const points = shellCandidates(shellTris);
  /* Jeder Kandidat mit Normale, Richtung und Achse — und nur, wer die
     Prüfung besteht. */
  const cands = [];
  for (const p of points) {
    const n = outwardNormal(field, p);
    const dir = direction ? direction(p, n) : n;
    if (fits && !fits(p, dir)) continue;
    cands.push({ p, n, dir, a: p, b: [p[0] + dir[0] * length, p[1] + dir[1] * length, p[2] + dir[2] * length], d });
  }
  const none = { sites: [], stats: { mean: 0, max: 0 }, cells, candidates: points, usable: cands.length };
  if (!cells.length || !cands.length || count < 1) return none;
  const N = Math.min(count, cands.length);

  /* Was schon steht: für den Abstand seine Achse, für die Überdeckung seine
     Spitze — beim Kanal Punkte längs der Achse, eine Zellkante auseinander. */
  const others = fixed.map(f => ({ a: f.a, b: f.b, d: f.d || 0 }));
  const cover = [];
  for (const f of fixed) {
    if (!f.line) { cover.push(f.a); continue; }
    const L = Math.sqrt(d2(f.a, f.b)), k = Math.max(1, Math.min(400, Math.ceil(L / field.h)));
    for (let i = 0; i <= k; i++) cover.push([0, 1, 2].map(j => f.a[j] + (f.b[j] - f.a[j]) * i / k));
  }
  const fixedD2 = new Float64Array(cells.length).fill(Infinity);
  for (let i = 0; i < cells.length; i++) for (const q of cover) { const dd = d2(cells[i].p, q); if (dd < fixedD2[i]) fixedD2[i] = dd; }

  /* Zwei Achsen: mindestens minSpacing auseinander — und zu einer dickeren
     Bohrung, die schon steht, 1,5 × den mittleren Durchmesser der beiden. */
  const need2 = o => Math.max(minSpacing, SPACING_FACTOR * (d + o.d) / 2) ** 2;
  const holds = (c, list) => list.every(o => segmentDist2(c.a, c.b, o.a, o.b) >= need2(o));
  /* Nächster Kandidat zu einem Punkt, der zu allem, was steht, Abstand hält. */
  const nearestCand = (p, list) => {
    let best = null, bd = Infinity;
    for (const c of cands) {
      const dd = d2(c.p, p);
      if (dd >= bd || !holds(c, list)) continue;
      best = c; bd = dd;
    }
    return best;
  };

  /* 1. Gieriger Start. Steht noch nichts, geht die erste Bohrung an den
     gewichteten Schwerpunkt — die Mitte der Masse. */
  const sites = [];
  const nearestSiteD2 = Float64Array.from(fixedD2);
  const cool = s => {
    for (let i = 0; i < cells.length; i++) {
      const dd = d2(cells[i].p, s.p);
      if (dd < nearestSiteD2[i]) nearestSiteD2[i] = dd;
    }
  };
  if (!fixed.length) {
    let cx = 0, cy = 0, cz = 0, W = 0;
    for (const c of cells) { cx += c.p[0] * c.w; cy += c.p[1] * c.w; cz += c.p[2] * c.w; W += c.w; }
    const first = nearestCand([cx / W, cy / W, cz / W], []);
    sites.push(first);
    cool(first);
  }
  while (sites.length < N) {
    let worst = -1, wv = -1;
    for (let i = 0; i < cells.length; i++) {
      const score = cells[i].w * nearestSiteD2[i];
      if (score > wv) { wv = score; worst = i; }
    }
    const c = nearestCand(cells[worst].p, others.concat(sites));
    if (!c) break;
    sites.push(c);
    cool(c);
  }

  /* 2. Verfeinern: Zellen zuordnen, Bohrungen zum Schwerpunkt ihrer
     Zellen rücken (auf die Fläche gelotet). Wer einer Bohrung näher liegt,
     die schon stand, gehört ihr — die rückt nicht. */
  const assign = new Int32Array(cells.length);
  for (let r = 0; r < rounds && sites.length; r++) {
    for (let i = 0; i < cells.length; i++) {
      let best = -1, bd = fixedD2[i];
      for (let s = 0; s < sites.length; s++) {
        const dd = d2(cells[i].p, sites[s].p);
        if (dd < bd) { bd = dd; best = s; }
      }
      assign[i] = best;
    }
    const acc = sites.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < cells.length; i++) {
      if (assign[i] < 0) continue;
      const a = acc[assign[i]], c = cells[i];
      a[0] += c.p[0] * c.w; a[1] += c.p[1] * c.w; a[2] += c.p[2] * c.w; a[3] += c.w;
    }
    let moved = 0;
    for (let s = 0; s < sites.length; s++) {
      if (acc[s][3] <= 0) continue;
      const centroid = [acc[s][0] / acc[s][3], acc[s][1] / acc[s][3], acc[s][2] / acc[s][3]];
      const c = nearestCand(centroid, others.concat(sites.filter((_, k) => k !== s)));
      if (c && d2(c.p, sites[s].p) > 1e-9) { sites[s] = c; moved++; }
    }
    if (!moved) break;
  }

  /* Kennzahlen: gewichteter mittlerer und größter Abstand der Zellen
     zur nächsten Bohrung — auch zu denen, die schon standen. */
  let sum = 0, W = 0, max = 0;
  for (let i = 0; i < cells.length; i++) {
    let bd = fixedD2[i];
    for (const s of sites) { const dd = d2(cells[i].p, s.p); if (dd < bd) bd = dd; }
    const dist = Math.sqrt(bd);
    sum += dist * cells[i].w; W += cells[i].w;
    if (dist > max) max = dist;
  }
  return {
    sites: sites.map(c => ({ p: c.p.slice(), n: c.n.slice(), dir: c.dir.slice() })),
    stats: { mean: W > 0 ? sum / W : 0, max },
    cells, candidates: points, usable: cands.length
  };
}
