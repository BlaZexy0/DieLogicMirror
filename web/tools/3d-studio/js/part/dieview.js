/* Die Formansicht der Entformungsanalyse — die Flächen als Formteile.

   Die Analyse sagt zu jedem Dreieck, welche Formhälfte oder welcher
   Schieber es abbildet. Zusammen sind die Dreiecke einer Richtung genau
   die Abbildung, die dieses Formteil in seiner Kavität trägt. Hier werden
   sie zu STÜCKEN: je Richtung eine Dreieckssuppe, dazu die Kanten, an
   denen das Stück an ein anderes stößt (die Trennlinie), und ein RAND
   entlang dieser Kanten, um `skirt` Millimeter in die Form hinein
   gezogen — die Trennfläche in Andeutung. Ohne den Rand sähe ein Stück
   wie Papier aus; mit ihm wie ein Formeinsatz, aus dem das Bauteil
   gerade gezogen wurde.

   Wie weit die Stücke auseinanderrücken, entscheidet der Viewer: jedes
   Stück bringt seine Entformrichtung mit, und dorthin wird es geschoben
   (js/part/dieviewer.js). Kein Three.js — die Tests rechnen es nach. */

import { DIRS } from './visibility.js';
import { UNDERCUT, halfOf } from './segment.js';

/** Einheitsvektor der Richtung d (0..5) — die Entformrichtung. */
export function dirVector(d) {
  const v = [0, 0, 0];
  if (DIRS[d]) v[DIRS[d].axis] = DIRS[d].sign;
  return v;
}

/**
 * Die Stücke.
 *   model  Arbeitsmodell (js/part/model.js): tris, index, verts, nbr, areas, centroids
 *   seg    Zuordnung (js/part/segment.js): label je Dreieck
 *   opts.skirt  Rand in mm entlang der Trennlinie, in die Form hinein (0: keiner)
 * → [{ label, dir, axis, span, side, half, faces, area, center, tris, skirt, skirtLen, edges }], Hälften und
 *   Schieber nach Richtung geordnet, Hinterschnitte (ohne Richtung, ohne
 *   Rand) zuletzt. `side` sagt, auf welcher Seite der Trennebene ein Stück
 *   liegt (+1 oder −1 entlang der Achse): für die Hälften ihr Vorzeichen,
 *   für Schieber und Hinterschnitte die Seite ihres Flächenschwerpunkts —
 *   dort sitzt der Schieber in der Form. `half` ist die Rolle (halfOf:
 *   +1 bewegliche Hälfte, −1 feste, 0 Schieber). Die Trennebene ist dabei die
 *   mittlere Höhe der Trennlinie zwischen den beiden Hälften
 *   (`parting`, auf jedem Stück), nicht z = 0: das Bauteil darf liegen,
 *   wo es will.
 */
export function diePieces(model, seg, opts = {}) {
  const skirt = Math.max(0, Number(opts.skirt) || 0);
  const { tris, index, verts, nbr, areas, centroids, faceCount: F } = model;
  const label = seg.label;
  const byLabel = new Map();
  for (let f = 0; f < F; f++) {
    const l = label[f];
    if (!byLabel.has(l)) byLabel.set(l, []);
    byLabel.get(l).push(f);
  }
  const out = [];
  for (const [l, faces] of byLabel) {
    const dir = l === UNDERCUT ? [0, 0, 0] : dirVector(l);
    const t = new Float32Array(faces.length * 9);
    let area = 0;
    const c = [0, 0, 0];
    faces.forEach((f, i) => {
      for (let k = 0; k < 9; k++) t[i * 9 + k] = tris[f * 9 + k];
      const a = areas[f];
      area += a;
      c[0] += centroids[f * 3] * a; c[1] += centroids[f * 3 + 1] * a; c[2] += centroids[f * 3 + 2] * a;
    });
    if (area > 0) { c[0] /= area; c[1] /= area; c[2] /= area; }
    /* Wie weit das Stück entlang seiner Achse reicht — für die Ebene, die
       beim Blick in eine Hälfte die andere wegnimmt. */
    const axis = l === UNDERCUT ? -1 : DIRS[l].axis;
    let lo = Infinity, hi = -Infinity;
    if (axis >= 0) for (let i = axis; i < t.length; i += 3) { if (t[i] < lo) lo = t[i]; if (t[i] > hi) hi = t[i]; }
    /* Die Trennlinie dieses Stücks: Kanten, hinter denen ein anderes Stück
       liegt — oder gar nichts (offenes Netz). */
    const edges = [];
    for (const f of faces) {
      for (let e = 0; e < 3; e++) {
        const w = nbr[f * 3 + e];
        if (w >= 0 && label[w] === l) continue;
        const i0 = index[f * 3 + e], i1 = index[f * 3 + (e + 1) % 3];
        edges.push(verts[i0 * 3], verts[i0 * 3 + 1], verts[i0 * 3 + 2],
                   verts[i1 * 3], verts[i1 * 3 + 1], verts[i1 * 3 + 2]);
      }
    }
    const lines = Float32Array.from(edges);
    const nEdges = edges.length / 6;
    let sk = new Float32Array(0);
    if (skirt > 0 && (dir[0] || dir[1] || dir[2]) && nEdges) {
      sk = new Float32Array(nEdges * 18);
      const dx = dir[0] * skirt, dy = dir[1] * skirt, dz = dir[2] * skirt;
      for (let k = 0; k < nEdges; k++) {
        const o = k * 6;
        const ax = edges[o], ay = edges[o + 1], az = edges[o + 2];
        const bx = edges[o + 3], by = edges[o + 4], bz = edges[o + 5];
        sk.set([ax, ay, az, bx, by, bz, bx + dx, by + dy, bz + dz,
                ax, ay, az, bx + dx, by + dy, bz + dz, ax + dx, ay + dy, az + dz], k * 18);
      }
    }
    out.push({ label: l, dir, axis, span: axis >= 0 ? [lo, hi] : null, faces: faces.length, area, center: c, tris: t, skirt: sk, skirtLen: sk.length ? skirt : 0, edges: lines });
  }
  out.sort((a, b) => (a.label === UNDERCUT ? 99 : a.label) - (b.label === UNDERCUT ? 99 : b.label));
  /* Die Trennebene: Kanten zwischen den beiden Hälften, längengewichtet. */
  const ax = seg.mainAxis;
  let sum = 0, len = 0;
  for (let f = 0; f < F; f++) {
    const lf = label[f];
    if (lf < 0 || DIRS[lf].axis !== ax) continue;
    for (let e = 0; e < 3; e++) {
      const w = nbr[f * 3 + e];
      if (w < f || label[w] < 0 || label[w] === lf || DIRS[label[w]].axis !== ax) continue;
      const i0 = index[f * 3 + e] * 3, i1 = index[f * 3 + (e + 1) % 3] * 3;
      const l = Math.hypot(verts[i0] - verts[i1], verts[i0 + 1] - verts[i1 + 1], verts[i0 + 2] - verts[i1 + 2]);
      sum += (verts[i0 + ax] + verts[i1 + ax]) / 2 * l; len += l;
    }
  }
  const parting = len > 0 ? sum / len : (model.bounds.min[ax] + model.bounds.max[ax]) / 2;
  for (const p of out) {
    p.parting = parting;
    p.side = p.axis === ax ? p.dir[ax] : (p.center[ax] >= parting ? 1 : -1);
    p.half = halfOf(p.label, seg);
  }
  return out;
}

/* ── Projizierte Flächen ──────────────────────────────────────────
   Die Fläche, die ein Formteil in seiner Öffnungsrichtung dem Metall-
   druck entgegenstellt: für die Hälften die Projektion auf die Trenn-
   ebene (mit Anguss und Überläufen die Sprengfläche der Auslegung), für
   einen Schieber die Fläche, gegen die er verriegelt werden muss.
   Gerastert als Vereinigung — eine Summe projizierter Dreiecke zählte
   jede Stelle doppelt (Ober- und Unterseite einer Wand). */

/** Das Raster über die beiden Querachsen der Achse `axis`: u = nächste,
    v = übernächste Achse (z: x/y, x: y/z, y: z/x — rechtshändig). */
export function projectionFrame(bounds, axis, cell) {
  const ua = (axis + 1) % 3, va = (axis + 2) % 3;
  const diag = bounds.diag || Math.hypot(...bounds.size);
  let h = Math.max(0.05, cell || diag / 500);
  const MAX = 3e6;
  while ((bounds.size[ua] / h + 3) * (bounds.size[va] / h + 3) > MAX) h *= 1.5;
  const u0 = bounds.min[ua] - h, v0 = bounds.min[va] - h;
  const nu = Math.ceil(bounds.size[ua] / h) + 3, nv = Math.ceil(bounds.size[va] / h) + 3;
  return { axis, ua, va, u0, v0, h, nu, nv };
}

/**
 * Dreiecke in die Maske des Rasters malen (Zellmitten im projizierten
 * Dreieck). `only(f)` wählt Dreiecke aus, `onCell(idx, f)` wird je Zelle
 * und Dreieck gerufen (auch für schon gesetzte Zellen). Liefert die Zahl
 * neu gesetzter Zellen.
 */
export function rasterize(tris, frame, mask, only = null, onCell = null) {
  const { ua, va, u0, v0, h, nu, nv } = frame;
  let count = 0;
  for (let f = 0, i = 0; i < tris.length; f++, i += 9) {
    if (only && !only(f)) continue;
    const ax = tris[i + ua], ay = tris[i + va], bx = tris[i + 3 + ua], by = tris[i + 3 + va], cx = tris[i + 6 + ua], cy = tris[i + 6 + va];
    const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area2) < 1e-12) continue;                   // steht in der Richtung: keine Fläche
    const s = area2 > 0 ? 1 : -1;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - u0) / h));
    const i1 = Math.min(nu - 1, Math.ceil((Math.max(ax, bx, cx) - u0) / h));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - v0) / h));
    const j1 = Math.min(nv - 1, Math.ceil((Math.max(ay, by, cy) - v0) / h));
    for (let j = j0; j <= j1; j++) {
      const py = v0 + (j + 0.5) * h;
      for (let ii = i0; ii <= i1; ii++) {
        const px = u0 + (ii + 0.5) * h;
        const e0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * s;
        const e1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * s;
        const e2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * s;
        if (e0 < 0 || e1 < 0 || e2 < 0) continue;
        const idx = j * nu + ii;
        if (!mask[idx]) { mask[idx] = 1; count++; }
        if (onCell) onCell(idx, f);
      }
    }
  }
  return count;
}

/** Projektion einer Dreieckssuppe entlang `axis` → { frame, mask, area } in mm². */
export function projectSoup(tris, bounds, axis, opts = {}) {
  const frame = projectionFrame(bounds, axis, opts.cell);
  const mask = new Uint8Array(frame.nu * frame.nv);
  const cells = rasterize(tris, frame, mask);
  return { frame, mask, area: cells * frame.h * frame.h };
}

/** Der Umriss einer Maske als Strecken [u0, v0, u1, v1, …] in Weltmaß —
    die Zellkanten zwischen gesetzt und leer. */
export function maskOutline(frame, mask) {
  const { u0, v0, h, nu, nv } = frame;
  const out = [];
  const at = (i, j) => (i < 0 || j < 0 || i >= nu || j >= nv ? 0 : mask[j * nu + i]);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      if (!mask[j * nu + i]) continue;
      const x = u0 + i * h, y = v0 + j * h;
      if (!at(i - 1, j)) out.push(x, y, x, y + h);
      if (!at(i + 1, j)) out.push(x + h, y, x + h, y + h);
      if (!at(i, j - 1)) out.push(x, y, x + h, y);
      if (!at(i, j + 1)) out.push(x, y + h, x + h, y + h);
    }
  }
  return Float32Array.from(out);
}

/**
 * Projizierte Fläche jedes Stücks in seiner Richtung (Hinterschnitte
 * haben keine) und die des ganzen Bauteils auf die Trennebene.
 * → { pieces: [{ label, axis, area, frame, mask }], total: { axis, area, frame, mask } }
 */
export function pieceProjections(pieces, model, seg, opts = {}) {
  const out = [];
  for (const p of pieces) {
    if (p.axis < 0) continue;
    const pr = projectSoup(p.tris, model.bounds, p.axis, opts);
    out.push({ label: p.label, axis: p.axis, area: pr.area, frame: pr.frame, mask: pr.mask });
  }
  const total = projectSoup(model.tris, model.bounds, seg.mainAxis, opts);
  return { pieces: out, total: { axis: seg.mainAxis, ...total } };
}
