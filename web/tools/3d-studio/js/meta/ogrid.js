/* Das O-Gitter des Metamodells: Isofläche des Schmelzeanteils DIREKT darauf — dem Rechengitter der
   OpenFOAM-Rechnungen, aus denen das Modell gelernt hat (DieLogic_OF/metamodel, case_ss). Deshalb hat
   dieses Verfahren keine Zellkante: das Gitter STEHT, es ist das des Modells.

   Die Knoten sind die Zellmitten des Gitters (je Schicht das 30×30-Bild des Querschnitts: Kernblock
   und vier Ringblöcke, die leeren Bildecken gehören nicht dazu), die Zellen der Surface Nets sind die
   Dualzellen zwischen je acht Nachbarmitten. Drei Dinge machen das Gitter vollständig:
     · die vier Diagonalnähte zwischen den Ringblöcken sind im Bild keine Nachbarn — sie werden als
       eigene Dualzellen ergänzt (innen mit der Kernecke als entartetes Prisma);
     · vor der Wand liegt je Außenzelle ein Geisterknoten (Luft) an der gespiegelten Stelle, sodass der
       Nulldurchgang genau auf der Kammerwand liegt;
     · vor dem Kolben und hinter der Stirnplatte liegt je eine Geisterschicht (Luft), gespiegelt an der
       jeweiligen Fläche.
   Weil nur die Werte je Bild wechseln, wird die Topologie einmal je Schichtzahl gebaut und dann je
   Kolbenstellung ausgewertet. Ausgabe: indiziertes Netz mit Farben (Geschwindigkeit, Turbo-Skala, linear für three.js).

   Koordinaten der Seite: Kammer entlang +x, Kolben bei x = xKolben, Stirnplatte bei x = L, y nach oben;
   die Modellschicht 0 liegt an der Stirnplatte. Bildzeile = y, Bildspalte = z. */

import { lutLinear } from '../part/colors.js';

/* Die vier Nähte: A(rad) und B(rad) sind über die Diagonale Nachbarn (wie metrics.py), C die Kernecke.
   Im Bild sind A und B KEINE Nachbarn — weder die Fläche noch das Zählen der Luft dürfen sie übersehen. */
function seamsOf(nd, ra, pa) {
  const id = (r, c) => r * nd + c;
  return [
    { A: k => id(ra + pa + k, ra), B: k => id(ra + pa - 1, ra - 1 - k), C: id(ra + pa - 1, ra) },
    { A: k => id(ra + pa + k, ra + pa - 1), B: k => id(ra + pa - 1, ra + pa + k), C: id(ra + pa - 1, ra + pa - 1) },
    { A: k => id(ra - 1 - k, ra), B: k => id(ra, ra - 1 - k), C: id(ra, ra) },
    { A: k => id(ra - 1 - k, ra + pa - 1), B: k => id(ra, ra + pa + k), C: id(ra, ra + pa - 1) }
  ];
}

/* ── Topologie des Querschnitts ────────────────────────────────── */
export function buildTopology(meta) {
  const nd = meta.nd, area = meta.area_D2.flat(), xD = meta.x_D.flat(), yD = meta.y_D.flat();
  const mask = area.map(a => a > 0);
  const id = (r, c) => r * nd + c;
  let ra = 0; while (!mask[id(0, ra)]) ra++;
  const pa = nd - 2 * ra;
  const NI = nd * nd;
  /* Geisterknoten der Wand: je Außenzelle einer, gespiegelt an der Wand (r = 1 − r_zelle, in D). */
  const ghost = new Map();
  const secY = Array.from(yD), secZ = Array.from(xD);
  const addGhost = cell => {
    if (ghost.has(cell)) return ghost.get(cell);
    const y = yD[cell], z = xD[cell], r = Math.hypot(y, z), rg = 1 - r - 0.003;
    secY.push(y / r * rg); secZ.push(z / r * rg);
    ghost.set(cell, NI + ghost.size);
    return NI + ghost.size - 1;
  };
  const quads = [];                                   // [q00, q10, q01, q11]: Bit 0 tangential/Spalte, Bit 1 radial/Zeile
  for (let r = 0; r < nd - 1; r++) for (let c = 0; c < nd - 1; c++)
    if (mask[id(r, c)] && mask[id(r, c + 1)] && mask[id(r + 1, c)] && mask[id(r + 1, c + 1)])
      quads.push([id(r, c), id(r, c + 1), id(r + 1, c), id(r + 1, c + 1)]);
  for (let c = ra; c < ra + pa - 1; c++) {            // Wand oben und unten
    quads.push([id(nd - 1, c), id(nd - 1, c + 1), addGhost(id(nd - 1, c)), addGhost(id(nd - 1, c + 1))]);
    quads.push([id(0, c), id(0, c + 1), addGhost(id(0, c)), addGhost(id(0, c + 1))]);
  }
  for (let r = ra; r < ra + pa - 1; r++) {            // Wand links und rechts
    quads.push([id(r, 0), id(r + 1, 0), addGhost(id(r, 0)), addGhost(id(r + 1, 0))]);
    quads.push([id(r, nd - 1), id(r + 1, nd - 1), addGhost(id(r, nd - 1)), addGhost(id(r + 1, nd - 1))]);
  }
  const seams = seamsOf(nd, ra, pa);
  for (const { A, B, C } of seams) {
    quads.push([C, C, A(0), B(0)]);
    for (let k = 0; k < ra - 1; k++) quads.push([A(k), B(k), A(k + 1), B(k + 1)]);
    quads.push([A(ra - 1), B(ra - 1), addGhost(A(ra - 1)), addGhost(B(ra - 1))]);
  }
  const NS = secY.length, NQ = quads.length;
  const isGhost = new Uint8Array(NS); for (let s = NI; s < NS; s++) isGhost[s] = 1;
  const inMask = new Uint8Array(NS); for (let s = 0; s < NI; s++) inMask[s] = mask[s] ? 1 : 0;
  /* Nachbarschaft: Kante → die zwei Vierecke daran, Knoten → seine Vierecke im Umlaufsinn. */
  const cy = new Float64Array(NQ), cz = new Float64Array(NQ);
  for (let q = 0; q < NQ; q++) { for (const s of quads[q]) { cy[q] += secY[s] / 4; cz[q] += secZ[s] / 4; } }
  const edgeQuads = new Map();
  const addEdge = (a, b, q) => {
    if (a === b) return;
    const key = Math.min(a, b) * NS + Math.max(a, b);
    let e = edgeQuads.get(key);
    if (!e) { e = []; edgeQuads.set(key, e); }
    if (!e.includes(q)) e.push(q);
  };
  const nodeQuads = Array.from({ length: NS }, () => []);
  for (let q = 0; q < NQ; q++) {
    const [a, b, c, d] = quads[q];
    addEdge(a, b, q); addEdge(c, d, q); addEdge(a, c, q); addEdge(b, d, q);
    for (const s of new Set(quads[q])) nodeQuads[s].push(q);
  }
  /* Umlauf um einen Knoten, rechtshändig um die Schichtrichtung w = −x: Winkel atan2(dy, dz). */
  for (let s = 0; s < NS; s++) {
    nodeQuads[s].sort((p, q) => Math.atan2(cy[p] - secY[s], cz[p] - secZ[s]) - Math.atan2(cy[q] - secY[s], cz[q] - secZ[s]));
  }
  /* Kanten: [a, b, qA, qB, flip] — flip = 1, wenn der Umlauf [A unten, B unten, B oben, A oben] linkshändig um a→b ist.
     Loop-Normale n = u × w mit u = cB − cA (Querschnitt) und w = −x; in Querschnittskoordinaten (y, z) ist
     n · (b − a) ∝ (u_y·(b−a)_z − u_z·(b−a)_y) · (−1)·(−1)… ausgerechnet: n = (0, −u_z, u_y)·|w| für w = (−1,0,0)·|w|. */
  const edges = [];
  for (const [key, qs] of edgeQuads) {
    if (qs.length !== 2) continue;
    const a = Math.floor(key / NS), b = key % NS;
    const uy = cy[qs[1]] - cy[qs[0]], uz = cz[qs[1]] - cz[qs[0]];
    const ey = secY[b] - secY[a], ez = secZ[b] - secZ[a];
    const dot = -uz * ey + uy * ez;                    // n · e mit n = (0, −u_z, u_y)
    edges.push(a, b, qs[0], qs[1], dot > 0 ? 1 : 0);        // Vorzeichen empirisch geprüft (Wand-/Endflächen zeigen nach außen)
  }
  return { nd, ra, pa, NI, NS, NQ, quads: Int32Array.from(quads.flat()), secY: Float32Array.from(secY), secZ: Float32Array.from(secZ),
           isGhost, inMask, edges: Int32Array.from(edges), nodeQuads: nodeQuads.map(l => Int32Array.from(l)), ghost };
}

/** Nachbarschaft der MODELLZELLEN im Querschnitt (nicht der Dualzellen): die Bildnachbarn, dazu die
    vier Diagonalnähte. Als Paarliste [a, b, a, b, …] — js/meta/air.js macht daraus die Nachbarlisten,
    mit denen die Luft durch die Kammer fließt. */
export function cellNeighbours(topo) {
  const { nd, ra, pa, inMask } = topo;
  const id = (r, c) => r * nd + c;
  const pairs = [];
  for (let r = 0; r < nd; r++) for (let c = 0; c < nd; c++) {
    if (!inMask[id(r, c)]) continue;
    if (c + 1 < nd && inMask[id(r, c + 1)]) pairs.push(id(r, c), id(r, c + 1));
    if (r + 1 < nd && inMask[id(r + 1, c)]) pairs.push(id(r, c), id(r + 1, c));
  }
  for (const { A, B } of seamsOf(nd, ra, pa)) for (let k = 0; k < ra; k++) pairs.push(A(k), B(k));
  return Int32Array.from(pairs);
}

/* ── Volumen: Schichten −1 … Z (Geisterschichten außen) ─────────── */
export function buildVolume(topo, Z) {
  const NL = Z + 2, NS = topo.NS, NP = Z + 1, NQ = topo.NQ;
  return { topo, Z, NL, NP, f: new Float32Array(NL * NS), pos: new Float32Array(NL * NS * 3), speed: new Float32Array(NL * NS),
           hexV: new Int32Array(NP * NQ), vpos: new Float32Array(NP * NQ * 3), vcol: new Float32Array(NP * NQ * 3) };
}

/** Werte und Lagen aus einem Bild des Modells (fill/speed als Bytes je Schicht × Bildzelle, uMax in m/s). */
export function fillFrame(vol, frame, spec, s, travel) {
  const { topo, Z, NL, f, pos, speed } = vol, { NS, NI, secY, secZ, isGhost, inMask } = topo;
  const { d, length, fill } = spec, comp = 1 - s * (1 - fill), dz = length / Z * comp, xPiston = s * travel;
  const xOf = l => length - (l + 0.5) * dz;                          // Schichtmitte, Schicht 0 an der Stirnplatte
  for (let L = 0; L < NL; L++) {
    const l = L - 1;
    let x;
    if (l < 0) x = 2 * length - xOf(0) + 0.3;                        // gespiegelt hinter der Stirnplatte
    else if (l >= Z) x = 2 * xPiston - xOf(Z - 1) - 0.3;             // gespiegelt vor dem Kolben
    else x = xOf(l);
    const air = l < 0 || l >= Z, base = L * NS, per = NI;
    for (let sN = 0; sN < NS; sN++) {
      const n = base + sN;
      pos[3 * n] = x; pos[3 * n + 1] = secY[sN] * d; pos[3 * n + 2] = secZ[sN] * d;
      if (air || isGhost[sN] || !inMask[sN]) { f[n] = 0.5; speed[n] = 0; continue; }
      const a = frame.fill[l * per + sN] / 255;
      f[n] = 0.5 - a;
      speed[n] = frame.speed[l * per + sN] / 255 * frame.uMax;
    }
  }
}

/* ── Surface Nets auf der Dualzellenstruktur ──────────────────── */
const EDGE_A = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3];
const EDGE_B = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];

export function extractSurface(vol, vScale) {
  const { topo, NP, f, pos, speed, hexV, vpos, vcol } = vol, { NS, NQ, quads, edges, nodeQuads } = topo;
  const LUT = lutLinear('turbo');
  hexV.fill(-1);
  let nv = 0;
  const node = new Int32Array(8), g = new Float64Array(8);
  for (let p = 0; p < NP; p++) {
    const lo = p * NS, hi = (p + 1) * NS;
    for (let q = 0; q < NQ; q++) {
      const q4 = 4 * q;
      node[0] = lo + quads[q4]; node[1] = lo + quads[q4 + 1]; node[2] = lo + quads[q4 + 2]; node[3] = lo + quads[q4 + 3];
      node[4] = hi + quads[q4]; node[5] = hi + quads[q4 + 1]; node[6] = hi + quads[q4 + 2]; node[7] = hi + quads[q4 + 3];
      let mask = 0;
      for (let c = 0; c < 8; c++) { g[c] = f[node[c]]; if (g[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0, vmax = 0;
      for (let e = 0; e < 12; e++) {
        const a = EDGE_A[e], b = EDGE_B[e];
        if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
        const t = g[a] / (g[a] - g[b]), pa = 3 * node[a], pb = 3 * node[b];
        sx += pos[pa] + t * (pos[pb] - pos[pa]); sy += pos[pa + 1] + t * (pos[pb + 1] - pos[pa + 1]); sz += pos[pa + 2] + t * (pos[pb + 2] - pos[pa + 2]);
        n++;
      }
      for (let c = 0; c < 8; c++) if (g[c] < 0 && speed[node[c]] > vmax) vmax = speed[node[c]];
      const h = p * NQ + q;
      hexV[h] = nv;
      vpos[3 * nv] = sx / n; vpos[3 * nv + 1] = sy / n; vpos[3 * nv + 2] = sz / n;
      const k = 3 * Math.max(0, Math.min(255, Math.round((vScale > 0 ? vmax / vScale : 0) * 255)));
      vcol[3 * nv] = LUT[k]; vcol[3 * nv + 1] = LUT[k + 1]; vcol[3 * nv + 2] = LUT[k + 2];
      nv++;
    }
  }
  const idx = [], src = vol.debug ? [] : null;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
    if (src) src.push(0, 0);
  };
  /* Kanten im Querschnitt einer Schicht l (0 … Z−1): Zellen (l−1, qA), (l−1, qB), (l, qB), (l, qA). */
  for (let l = 0; l < vol.Z; l++) {
    const base = (l + 1) * NS;
    for (let e = 0; e < edges.length; e += 5) {
      const a = base + edges[e], b = base + edges[e + 1];
      const fa = f[a], fb = f[b];
      if ((fa < 0) === (fb < 0)) continue;
      const qA = edges[e + 2], qB = edges[e + 3];
      const h1 = hexV[l * NQ + qA], h2 = hexV[l * NQ + qB], h3 = hexV[(l + 1) * NQ + qB], h4 = hexV[(l + 1) * NQ + qA];
      quad(h1, h2, h3, h4, (fa < 0) !== (edges[e + 4] === 1));
    }
  }
  /* Kanten in Schichtrichtung (Knoten s, Schicht L → L+1): die Zellen um den Knoten, Zellpaar L. */
  for (let p = 0; p < NP; p++) {
    const lo = p * NS, hi = (p + 1) * NS;
    for (let s = 0; s < NS; s++) {
      const fa = f[lo + s], fb = f[hi + s];
      if ((fa < 0) === (fb < 0)) continue;
      const qs = nodeQuads[s];
      if (qs.length < 3) continue;
      const v = [];
      for (const q of qs) { const h = hexV[p * NQ + q]; if (h >= 0) v.push(h); }
      if (v.length < 3) continue;
      for (let i = 1; i + 1 < v.length; i++) {
        if (fa < 0) idx.push(v[0], v[i], v[i + 1]); else idx.push(v[0], v[i + 1], v[i]);
        if (src) src.push(1);
      }
    }
  }
  return { positions: vpos.slice(0, 3 * nv), colors: vcol.slice(0, 3 * nv), indices: Uint32Array.from(idx), src };
}
