/* Ein Angusssystem vorschlagen — aus dem Bauteil, ohne Three.js.

   Der Angussdesigner bringt seine Beispiele in einem eigenen Rahmen mit
   (Trennebene y = 0). Die Werkbank arbeitet im Bauteilsystem der übrigen
   Schritte: Trennebene z = 0, die Form öffnet nach +z, und die Kanäle
   liegen als Nuten in der beweglichen Hälfte (z > 0) — also Achse „−z",
   die Tiefe wächst entgegen. Das ist dieselbe Lage, in der das Beispiel
   „Ölwanne" des Angussdesigners sein Referenzteil hält.

   Der Vorschlag ist nur die GESTALT: Pressrest vor der langen Kante bei
   −Y, ein Anlauf von etwa der halben Bauteilgröße, ein oder zwei
   gespiegelte Verzweigungen, die Anschnitte auf der Kante. Breiten und
   Tiefen rechnet `autoTaper` aus dem Gussvolumen; ans Bauteil gebunden
   werden die Anschnitte danach im Viewer (dafür braucht es den Strahl). */

import * as G from '../runner/graph.js';
import * as F from '../runner/flow.js';
import { autoTaper, DEFAULT_SIZING } from '../runner/sizing.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const GATE = { h: 2.2, len: 4, w: 26, auto: true, transition: 'ende' };
const MIRRORED = { mirror: true };

const mk = (g, parent, type, pos, extra) => {
  const n = G.makeNode(g, type, parent, pos);
  if (extra) Object.assign(n, extra);
  return n;
};

/** Durchmesser des Pressrests (= der Füllkammer) nach dem Gussvolumen in mm³. */
export function biscuitDiameter(volumeMm3) {
  return volumeMm3 < 6e5 ? 80 : volumeMm3 < 1.5e6 ? 100 : 120;
}

/**
 * Vorschlag bauen.
 *   model        Arbeitsmodell des Bauteils (js/part/model.js: bounds, volume)
 *   opts.gates   1 (Fächer), 2 (symmetrisch) oder 4 (zwei Ebenen)
 *   opts.proc    Prozess für die Auslegung der Querschnitte (Gussvolumen in cm³)
 *   opts.sizing  Verjüngung und Seitenverhältnis
 * → der Graph; die Anschnitte liegen auf der Kante y = min, z = 0.
 */
export function proposeRunner(model, opts = {}) {
  const gates = opts.gates === 1 || opts.gates === 4 ? opts.gates : 2;
  const b = model.bounds;
  const sx = b.size[0], sy = b.size[1];
  const cx = (b.min[0] + b.max[0]) / 2;
  const y0 = b.min[1];
  const R = clamp(0.55 * Math.max(sx, sy), 160, 420);
  const at = (fy, x = cx) => [x, y0 - R + R * fy, 0];

  const g = G.emptyGraph();
  const d = biscuitDiameter(Math.abs(model.volume));
  G.setBiscuit(g, { pos: [cx, y0 - R, 0], axis: '-z', d, t: Math.round(d * 0.28) });
  const root = G.root(g);

  if (gates === 1) {
    const p = mk(g, root, 'point', at(0.5));
    mk(g, p, 'gate', at(1), { gate: { h: 2.4, len: 5, w: Math.round(clamp(0.3 * sx, 40, 160)), auto: true, transition: 'faecher' } });
  } else if (gates === 4) {
    const s1 = 0.24 * sx, s2 = 0.11 * sx;
    const p1 = mk(g, root, 'point', at(0.28));
    const b1 = mk(g, p1, 'branch', at(0.5), MIRRORED);
    const m = mk(g, b1, 'point', at(0.72, cx - s1));
    const b2 = mk(g, m, 'branch', at(0.86, cx - s1), MIRRORED);
    mk(g, b2, 'gate', at(1, cx - s1 - s2), { gate: { ...GATE } });
  } else {
    const s = 0.22 * sx;
    const p1 = mk(g, root, 'point', at(0.3));
    const br = mk(g, p1, 'branch', at(0.55), MIRRORED);
    const l = mk(g, br, 'point', at(0.82, cx - s * 0.75));
    mk(g, l, 'gate', at(1, cx - s), { gate: { ...GATE } });
  }

  g.gateH = GATE.h;
  for (const n of G.allNodes(g)) {
    if (n.type === 'gate' && n.gate && n.gate.hAuto === undefined) n.gate.hAuto = Math.abs(n.gate.h - g.gateH) < 1e-9;
  }
  G.normalizeMirrors(g);
  const proc = { ...F.DEFAULT_PROCESS, ...(opts.proc || {}) };
  F.applyAutoGates(g, proc);
  autoTaper(g, proc, { ...DEFAULT_SIZING, ...(opts.sizing || {}) });
  return g;
}

/** Die führenden Anschnitte (nicht die nachgezogenen Gegenseiten) mit dem
    Strahl, der sie ans Bauteil binden soll: vom Punkt aus in +Y, einen
    Hauch in die Bauteilhälfte hinein — genau auf der Trennebene träfe der
    Strahl die Kante der Deckfläche. */
export function gateRays(g, model) {
  const b = model.bounds;
  const zc = (b.min[2] + b.max[2]) / 2;
  const zEps = zc < 0 ? -1 : 1;
  const out = [];
  for (const n of G.allNodes(g)) {
    if (n.type !== 'gate' || G.isFollower(g, n.id)) continue;
    out.push({ id: n.id, origin: [n.pos[0], n.pos[1] - 60, zEps], dir: [0, 1, 0] });
  }
  return out;
}
