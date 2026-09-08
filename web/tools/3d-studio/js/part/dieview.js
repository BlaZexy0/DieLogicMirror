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
import { UNDERCUT } from './segment.js';

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
 * → [{ label, dir, axis, span, faces, area, center, tris, skirt, edges }], Hälften und
 *   Schieber nach Richtung geordnet, Hinterschnitte (ohne Richtung, ohne
 *   Rand) zuletzt.
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
    out.push({ label: l, dir, axis, span: axis >= 0 ? [lo, hi] : null, faces: faces.length, area, center: c, tris: t, skirt: sk, edges: lines });
  }
  out.sort((a, b) => (a.label === UNDERCUT ? 99 : a.label) - (b.label === UNDERCUT ? 99 : b.label));
  return out;
}
