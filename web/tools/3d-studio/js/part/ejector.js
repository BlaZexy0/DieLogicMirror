/* Haftung: wo hängt das Bauteil in der Form?

   Beim Öffnen muss das Teil auf EINER Seite bleiben — der mit den
   Auswerfern, üblich die bewegliche. Es hängt an den Wänden, die die
   Hälfte abbildet, und umso fester, je weniger Schräge sie haben; und es
   hängt dort, wo es beim Erstarren auf die Form AUFSCHRUMPFT — auf Kerne,
   in Taschen, in Bohrungen —, nicht an Außenwänden, von denen es sich
   wegzieht. Das Haftmaß je Dreieck der Hälfte, die es abbildet:

       H = A · max(0, μ·cos α − sin α) · g(θ)

   A die Fläche, α die Entformschräge gegen die Hälfte, μ der Reibwert
   zwischen Guss und Form (die Klammer ist die Kraft, die eine mit dem
   Druck 1 angepresste Wand der Entformung entgegensetzt — Menges/Mohren).
   g(θ) ist der Schrumpffaktor aus dem Winkel θ zwischen der Flächen-
   normale und der Richtung zum Volumenschwerpunkt c, dem Punkt, auf den
   das Teil zuschrumpft:

       g = min(1, max(0, cos θ + ½))

   Eine Wand, deren Normale zum Schwerpunkt zeigt (Innenwand einer
   Tasche, Bohrung um einen Kern), wandert beim Schrumpfen in die Form
   hinein und presst: g = 1. Eine Wand, deren Normale wegzeigt (Außen-
   wand), zieht sich zurück: g = 0. Dazwischen die Wände, die beim
   Schrumpfen an der Form ENTLANGGLEITEN — die Flanken einer Rippe, die
   zum Schwerpunkt hin läuft: sie werden nicht angepresst, halten aber mit
   Reibung an der Rippenwurzel und an ihrer eigenen Schwindung quer zur
   Rippe, deshalb halb (g = ½ bei θ = 90°). Die Näherung ist bewusst grob:
   kein Betrag der Schrumpfung, keine Elastizität, keine Spannung zwischen
   mehreren Kernen. Sie trifft die Frage, die hier zählt — WO im
   Verhältnis zu wo, und auf welcher Seite mehr. Das Maß ist relativ; die
   Summen beider Hälften sagen, auf welcher Seite das Teil bleibt.

   Die HAFTKARTE verteilt das Haftmaß einer Hälfte auf ihre Trennebene
   (das Raster der Projektion, js/part/dieview.js) und glättet es —
   senkrechte Wände hätten sonst nur eine Linie als Spur. Die Seite zeigt
   die Karten BEIDER Hälften zugleich, auf gemeinsamer Skala
   (ejectorMaps); Schieber haben keine, ihr Haftmaß ist 0. Wo Stifte
   sitzen sollen, entscheidet der Konstrukteur mit der Karte. Kein
   Three.js — die Tests rechnen es nach. */

import { DIRS, gridBary } from './visibility.js';
import { UNDERCUT } from './segment.js';
import { projectionFrame } from './dieview.js';

/** Volumenschwerpunkt eines geschlossenen Netzes (Tetraeder vom Ursprung);
    bei entartetem Volumen die Mitte des Kastens. */
export function volumeCentroid(model) {
  const t = model.tris;
  let vol = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], qx = t[i + 6], qy = t[i + 7], qz = t[i + 8];
    const v = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / 6;
    vol += v;
    cx += v * (ax + bx + qx) / 4; cy += v * (ay + by + qy) / 4; cz += v * (az + bz + qz) / 4;
  }
  const b = model.bounds;
  if (Math.abs(vol) < 1e-9 * (b.diag ** 3 || 1)) return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  return [cx / vol, cy / vol, cz / vol];
}

/**
 * Haftmaß je Dreieck der beiden Hälften (Schieber und Hinterschnitte 0).
 *   opts.mu       Reibwert (Vorgabe 0,3)
 *   opts.movSign  Vorzeichen der beweglichen Hälfte auf der Formöffnungsachse (Vorgabe +1)
 * → { grip: Float64Array(F) in mm², intensity: Float64Array(F) je mm² (0…μ),
 *     byLabel: Float64Array(6), mov, fix, movLabel, fixLabel, centroid, maxIntensity, mu }
 */
export function gripPerFace(model, vis, seg, opts = {}) {
  const mu = opts.mu ?? 0.3;
  const movSign = opts.movSign ?? 1;
  const F = model.faceCount;
  const { normals, centroids, areas } = model;
  const c = opts.centroid || volumeCentroid(model);
  const grip = new Float64Array(F), intensity = new Float64Array(F);
  const byLabel = new Float64Array(6);
  let maxIntensity = 0;
  for (let f = 0; f < F; f++) {
    const l = seg.label[f];
    if (l === UNDERCUT || l < 0 || DIRS[l].axis !== seg.mainAxis) continue;
    const sinA = Math.max(-1, Math.min(1, vis.dot[f * 6 + l]));
    const cosA = Math.sqrt(1 - sinA * sinA);
    const w = Math.max(0, mu * cosA - sinA);
    if (w <= 0) continue;
    const dx = c[0] - centroids[f * 3], dy = c[1] - centroids[f * 3 + 1], dz = c[2] - centroids[f * 3 + 2];
    const len = Math.hypot(dx, dy, dz);
    const cosT = len > 1e-9 ? (dx * normals[f * 3] + dy * normals[f * 3 + 1] + dz * normals[f * 3 + 2]) / len : 0;
    const g = Math.min(1, Math.max(0, cosT + 0.5));
    if (g <= 0) continue;
    intensity[f] = w * g;
    grip[f] = areas[f] * intensity[f];
    byLabel[l] += grip[f];
    if (intensity[f] > maxIntensity) maxIntensity = intensity[f];
  }
  const movLabel = DIRS.findIndex(d => d.axis === seg.mainAxis && d.sign === movSign);
  const fixLabel = DIRS.findIndex(d => d.axis === seg.mainAxis && d.sign === -movSign);
  return { grip, intensity, byLabel, mov: byLabel[movLabel], fix: byLabel[fixLabel], movLabel, fixLabel, centroid: c, maxIntensity, mu };
}

/* Trennbare Gauß-Glättung auf dem Raster, σ in Zellen. */
function blur(map, nu, nv, sigma) {
  if (!(sigma > 0.3)) return map;
  const r = Math.ceil(3 * sigma);
  const k = new Float64Array(2 * r + 1);
  let ks = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); ks += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const tmp = new Float32Array(map.length);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      let s = 0;
      for (let d = -r; d <= r; d++) { const ii = i + d; if (ii >= 0 && ii < nu) s += map[j * nu + ii] * k[d + r]; }
      tmp[j * nu + i] = s;
    }
  }
  const out = new Float32Array(map.length);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      let s = 0;
      for (let d = -r; d <= r; d++) { const jj = j + d; if (jj >= 0 && jj < nv) s += tmp[jj * nu + i] * k[d + r]; }
      out[j * nu + i] = s;
    }
  }
  return out;
}

/**
 * Die Haftkarte der Hälfte `label`: ihr Haftmaß auf das Raster ihrer
 * Projektion verteilt und geglättet.
 *   grip        aus gripPerFace
 *   opts.cell   Zellkante (Vorgabe wie projectionFrame), opts.sigma Glättung in mm (Vorgabe 4)
 * → { frame, map (0…1), max, total, label }
 */
export function ejectorMap(model, seg, grip, label, opts = {}) {
  const axis = DIRS[label].axis;
  const frame = projectionFrame(model.bounds, axis, opts.cell);
  const { ua, va, u0, v0, h, nu, nv } = frame;
  const { tris, faceCount: F } = model;
  const raw = new Float32Array(nu * nv);
  let total = 0;
  /* Das Haftmaß jedes Dreiecks auf die Zellen unter seinen Abtastpunkten —
     so viele, dass auch eine senkrechte Wand (Spur: eine Linie) ihre
     Länge entlang gleichmäßig belegt. */
  for (let f = 0; f < F; f++) {
    const g = grip.grip[f];
    if (!(g > 0) || seg.label[f] !== label) continue;
    total += g;
    const i = f * 9;
    let l2 = 0;
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3, b = i + ((e + 1) % 3) * 3;
      const d = (tris[a] - tris[b]) ** 2 + (tris[a + 1] - tris[b + 1]) ** 2 + (tris[a + 2] - tris[b + 2]) ** 2;
      if (d > l2) l2 = d;
    }
    const n = Math.max(1, Math.min(48, Math.ceil(Math.sqrt(l2) / h)));
    const bary = gridBary(n);
    const share = g / bary.length;
    for (const [w0, w1, w2] of bary) {
      const pu = tris[i + ua] * w0 + tris[i + 3 + ua] * w1 + tris[i + 6 + ua] * w2;
      const pv = tris[i + va] * w0 + tris[i + 3 + va] * w1 + tris[i + 6 + va] * w2;
      const ci = Math.min(nu - 1, Math.max(0, Math.floor((pu - u0) / h)));
      const cj = Math.min(nv - 1, Math.max(0, Math.floor((pv - v0) / h)));
      raw[cj * nu + ci] += share;
    }
  }
  const sm = blur(raw, nu, nv, (opts.sigma ?? 4) / h);
  let max = 0;
  for (let i = 0; i < sm.length; i++) if (sm[i] > max) max = sm[i];
  const map = new Float32Array(sm.length);
  if (max > 0) for (let i = 0; i < sm.length; i++) map[i] = sm[i] / max;
  return { frame, map, max, total, label };
}

/**
 * Die Haftkarten mehrerer Hälften auf GEMEINSAMER Skala: jede wie
 * ejectorMap gerechnet, dann alle durch das größte Maximum geteilt.
 * Sonst sähe die schwächer haftende Seite genauso rot aus wie die
 * stärkere, und die Frage „welche Seite hält mehr" wäre aus den Karten
 * nicht zu lesen. Die Karte mit dem größten Maximum behält ihre 1.
 * → Array der Karten (je mit `label`, `max` in mm²/Zelle vor der Glättung,
 *   `total`); `map` 0…1 über alle Karten hinweg
 */
export function ejectorMaps(model, seg, grip, labels, opts = {}) {
  const maps = labels.map(l => ejectorMap(model, seg, grip, l, opts));
  const top = Math.max(0, ...maps.map(m => m.max));
  for (const m of maps) {
    if (!(top > 0) || !(m.max < top)) continue;
    const k = m.max / top;
    for (let i = 0; i < m.map.length; i++) m.map[i] *= k;
  }
  return maps;
}
