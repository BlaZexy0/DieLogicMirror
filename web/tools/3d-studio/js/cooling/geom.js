/* Die Körper des Temperierplans: Kühlstiche mit halbkugeliger Spitze,
   Kanäle mit ebenen Enden — als Dreieckssuppen, wie überall im Studio.

   Beide sind Rotationskörper um ihre Achse: Ringe gleicher Punktzahl
   entlang der Achse, dazwischen Vierecke, an den Enden Fächer. Die
   Spitze des Kühlstichs sitzt am gesetzten Punkt (dort ist der Abstand
   zum Bauteil der der Abstandsfläche); die Halbkugel hat den Radius der
   Bohrung, ihr Mittelpunkt liegt r weiter außen, der Zylinder beginnt
   dort und endet bei `len` von der Spitze. */

import { sub, norm, cross, addScaled } from '../runner/vec.js';
import { volume } from '../mesh.js';
import { axisOf, allItems } from './model.js';

const SEG = 24;

/* Zwei Einheitsvektoren senkrecht zur Achse. */
function frame(axis) {
  const a = norm(axis);
  const h = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(a, h));
  const v = cross(a, u);
  return { a, u, v };
}

/** Rotationskörper: Ringe [{ z, r }] entlang der Achse `a` ab `origin`,
    z in mm von origin; r = 0 an einem Ende heißt Spitze. */
function revolve(origin, axisDir, rings, seg = SEG) {
  const f = frame(axisDir);
  const pt = (z, r, k) => {
    const ang = 2 * Math.PI * k / seg;
    const c = Math.cos(ang) * r, s = Math.sin(ang) * r;
    return [origin[0] + f.a[0] * z + f.u[0] * c + f.v[0] * s,
      origin[1] + f.a[1] * z + f.u[1] * c + f.v[1] * s,
      origin[2] + f.a[2] * z + f.u[2] * c + f.v[2] * s];
  };
  const out = [];
  const tri = (p, q, w) => { out.push(p[0], p[1], p[2], q[0], q[1], q[2], w[0], w[1], w[2]); };
  /* Mantel zwischen benachbarten Ringen; ein Ring mit r = 0 wird zum Fächer. */
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const a0 = pt(A.z, A.r, k), a1 = pt(A.z, A.r, k1), b0 = pt(B.z, B.r, k), b1 = pt(B.z, B.r, k1);
      if (A.r < 1e-9) { tri(a0, b1, b0); continue; }
      if (B.r < 1e-9) { tri(a0, a1, b0); continue; }
      tri(a0, a1, b1);
      tri(a0, b1, b0);
    }
  }
  /* Ebene Deckel, wo ein Endring einen Radius hat. */
  const capAt = (R, outward) => {
    const c = pt(R.z, 0, 0);
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const p = pt(R.z, R.r, k), q = pt(R.z, R.r, k1);
      if (outward) tri(c, p, q); else tri(c, q, p);
    }
  };
  if (rings[0].r > 1e-9) capAt(rings[0], false);
  if (rings[rings.length - 1].r > 1e-9) capAt(rings[rings.length - 1], true);
  return out;
}

/** Kühlstich: Spitze bei p, Halbkugel mit Radius d/2, Zylinder bis len. */
export function stichBody(item, seg = SEG, arcs = 6) {
  const r = item.d / 2;
  const L = Math.max(item.len, r + 0.5);
  const rings = [{ z: 0, r: 0 }];
  for (let i = 1; i <= arcs; i++) {
    const t = Math.PI / 2 * i / arcs;
    rings.push({ z: r - r * Math.cos(t), r: r * Math.sin(t) });
  }
  rings.push({ z: L, r });
  return revolve(item.p, item.dir, rings, seg);
}

/** Kanal: Zylinder von a nach b mit ebenen Enden. */
export function kanalBody(item, seg = SEG) {
  const axis = sub(item.b, item.a);
  const L = Math.hypot(axis[0], axis[1], axis[2]);
  if (L < 1e-9) return [];
  return revolve(item.a, axis, [{ z: 0, r: item.d / 2 }, { z: L, r: item.d / 2 }], seg);
}

export const buildItem = item => (item.type === 'stich' ? stichBody(item) : kanalBody(item));

/** Alle Körper, nach Art getrennt (je Art ein Material im Viewport). */
export function buildByType(plan) {
  const out = {};
  for (const it of allItems(plan)) {
    const tris = buildItem(it);
    out[it.type] = out[it.type] ? out[it.type].concat(tris) : tris;
  }
  return out;
}

/** Alles zusammen — für die STL. */
export function buildAll(plan) {
  const list = allItems(plan).map(buildItem);
  const n = list.reduce((a, t) => a + t.length, 0);
  const out = new Float64Array(n);
  let k = 0;
  for (const t of list) { out.set(t, k); k += t.length; }
  return out;
}

/** Volumen (mm³) — die Menge Wasser, die im Element steht. */
export const volumeOf = item => volume(buildItem(item));

/**
 * Kleinster Abstand der Bohrungswand zum Bauteil: entlang der Achse
 * abgetastet, Feldwert (Abstand der Achse zur Bauteiloberfläche) minus
 * Radius. `sample(x, y, z)` liefert den Feldwert, außen positiv.
 */
export function wallClearance(item, sample, steps = 24) {
  const { a, b } = axisOf(item);
  let min = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = addScaled(a, sub(b, a), t);
    const v = sample(p[0], p[1], p[2]);
    if (Number.isFinite(v)) min = Math.min(min, v - item.d / 2);
  }
  return min;
}

/**
 * Das Urteil über einen Wandabstand: 'bad' — die Bohrung bricht in die
 * Kavität durch; 'warn' — sie steht näher als der Mindest-Wandabstand;
 * 'ok' sonst; '' ohne Messwert. `tol` ist, was das Feld nicht besser weiß
 * (ein Bruchteil der Zellkante): eine Bohrung, die genau auf der
 * Abstandsfläche sitzt, soll nicht am Rauschen der Abtastung scheitern.
 */
export function wallVerdict(clearance, minWall, tol = 0) {
  if (clearance === null || !Number.isFinite(clearance)) return '';
  if (clearance <= 0) return 'bad';
  return clearance < minWall - tol ? 'warn' : 'ok';
}
