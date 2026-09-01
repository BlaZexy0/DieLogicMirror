/* Aus vielen Kanälen EIN Körper — über ein Abstandsfeld.

   Der Sweep (js/runner/sweep.js) liefert je Kante einen geschlossenen
   Schlauch. An einer Verzweigung stecken drei solche Schläuche
   ineinander: für das Auge genügt das, für eine STL nicht — überlappende
   Hüllen sind kein dichter Körper, und vor allem hat die Schmelze dort
   keine Kante, sondern einen Übergang.

   Deshalb derselbe Weg wie bei den Offsetflächen (js/part/field.js): ein
   Rasterfeld mit dem vorzeichenbehafteten Abstand, daraus die Fläche
   gleichen Abstands mit js/part/surfacenets.js. Nur wird das Feld hier
   nicht aus Dreiecken gerastert, sondern direkt aus der Geometrie
   gerechnet — jeder abgetastete Millimeter der Mittellinie ist ein
   kurzes Prisma mit dem Trapezquerschnitt an dieser Stelle, und alle
   Prismen werden WEICH vereinigt:

       smin(a, b, k) = min(a, b) − h²·k/4,   h = max(k − |a−b|, 0)/k

   Diese Verknüpfung ist exakt gleich min(), sobald sich die beiden
   Werte um mehr als k unterscheiden. Genau das macht die Rechnung
   überhaupt bezahlbar: ein Prisma, das weiter als k entfernt ist, ändert
   nichts und darf übersprungen werden. Weil jede Abkürzung EXAKT ist
   (die untere Schranke aus der Hüllkugel liegt schon über dem bisherigen
   Wert, das Prisma könnte ihn also nicht senken), liefern der CPU- und
   der WebGPU-Weg dasselbe Feld — gemessen über alle Beispiele höchstens
   2·10⁻⁵ mm Unterschied aus einfacher gegen doppelte Genauigkeit, kein
   einziger Vorzeichenwechsel. `verifyField()` prüft das nach jeder
   GPU-Rechnung an einigen hundert Punkten nach.

   k ist der Übergangsradius. Bei k = 0 entsteht die scharfe Vereinigung,
   bei 3 mm der weiche Hals, den ein guter Verteiler hat.

   Weich vereinigt wird dabei NUR der nach oben offene Kern des Profils;
   der Schnitt an der Trennebene kommt zuletzt und scharf, mit der Ebene
   desjenigen Kanals, der dem Punkt am nächsten liegt. Andernfalls zöge
   der Übergang den Körper über die Trennebene hinaus — bei 3 mm
   Übergang gemessene 1,2 mm, und so ein Anguss passt in keine
   Formhälfte. Der Hals wächst also nach unten und zur Seite, nie nach
   oben.

   WO geblendet wird, ist der eigentliche Kniff. Würde jedes Prisma mit
   jedem weich vereinigt, liefe der Wert davon: smin(a, a, k) ist a − k/4,
   und bei hundert überlappenden Prismen eines geraden Kanals wäre die
   Fläche um ein Vielfaches von k nach außen gewandert (gemessen: +56 %
   Volumen bei k = 3 mm). Deshalb werden die Prismen zu ZÜGEN
   zusammengefasst — ein Zug ist eine Kette von Kanten ohne Gabelung —
   und innerhalb eines Zuges scharf, nur zwischen den Zügen weich
   vereinigt. Züge treffen sich genau dort aufeinander, wo der Übergang
   hingehört: an den Verzweigungen und am Pressrest. */

import { section, sdf2dCore } from './profile.js';
import { cross, norm, sub, add, scale, dot, addScaled, len } from './vec.js';
import { AXES } from './graph.js';

/** Werte je Prisma im Speicherblock — sechs vec4, wie es WGSL erwartet. */
export const SEG_STRIDE = 24;

/**
 * Die abgetasteten Schnitte in Prismen umrechnen.
 * Jedes Prisma verbindet zwei benachbarte Schnitte; es wird an beiden
 * Enden ein Viertelschritt verlängert, damit an Bögen keine Kerbe
 * zwischen zwei Prismen stehen bleibt.
 */
export function buildSegments(g, net) {
  const segs = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const over = Math.max(0.25 * (g.step || 1), 0.05);

  /* Zug-Nummern: eine neue Nummer beginnt am Pressrest und hinter jeder
     Gabelung, sonst erbt die Kante die Nummer ihres Zulaufs. */
  const groupOf = new Map();
  let nextGroup = 0;
  for (const e of net.edges) {
    const kids = e.from.children.filter(c => g.nodes[c]);
    groupOf.set(e.toId, (!e.from.parent || kids.length > 1 || !groupOf.has(e.from.id))
      ? nextGroup++ : groupOf.get(e.from.id));
  }

  for (const e of net.edges) {
    const group = groupOf.get(e.toId) || 0;
    for (let i = 0; i < e.sections.length - 1; i++) {
      const a = e.sections[i], b = e.sections[i + 1];
      const axis = sub(b.p, a.p);
      const L = len(axis);
      if (L < 1e-9) continue;
      const t = scale(axis, 1 / L);
      let u = add(a.u, b.u);
      u = addScaled(u, t, -dot(u, t));
      if (len(u) < 1e-9) u = a.u;
      u = norm(u);
      const v = norm(cross(u, t));
      const mid = scale(add(a.p, b.p), 0.5);
      const sec = section((a.sec.width + b.sec.width) / 2, (a.sec.depth + b.sec.depth) / 2,
        g.draft, g.radius);
      const halfLen = L / 2 + over;
      const bound = Math.hypot(halfLen, Math.hypot(sec.halfTop, sec.depth));
      segs.push({ mid, t, u, v, sec, halfLen, bound, group });
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], mid[k] - bound);
        max[k] = Math.max(max[k], mid[k] + bound);
      }
    }
  }
  /* Nach Zügen sortieren: beide Rechenwege verlassen sich darauf, dass
     die Prismen eines Zuges hintereinander liegen. */
  segs.sort((a, b) => a.group - b.group);
  const groups = [];
  segs.forEach((s, i) => {
    const gr = groups[groups.length - 1];
    if (gr && gr.group === s.group) { gr.end = i + 1; }
    else groups.push({ group: s.group, start: i, end: i + 1 });
  });
  for (const gr of groups) {
    gr.min = [Infinity, Infinity, Infinity];
    gr.max = [-Infinity, -Infinity, -Infinity];
    for (let i = gr.start; i < gr.end; i++) {
      for (let c = 0; c < 3; c++) {
        gr.min[c] = Math.min(gr.min[c], segs[i].mid[c] - segs[i].bound);
        gr.max[c] = Math.max(gr.max[c], segs[i].mid[c] + segs[i].bound);
      }
    }
  }
  const data = new Float32Array(segs.length * SEG_STRIDE);
  segs.forEach((s, i) => {
    const o = i * SEG_STRIDE;
    data[o] = s.mid[0]; data[o + 1] = s.mid[1]; data[o + 2] = s.mid[2]; data[o + 3] = s.halfLen;
    data[o + 4] = s.t[0]; data[o + 5] = s.t[1]; data[o + 6] = s.t[2]; data[o + 7] = s.sec.r;
    data[o + 8] = s.u[0]; data[o + 9] = s.u[1]; data[o + 10] = s.u[2]; data[o + 11] = s.sec.halfTop;
    data[o + 12] = s.v[0]; data[o + 13] = s.v[1]; data[o + 14] = s.v[2]; data[o + 15] = s.sec.depth;
    data[o + 16] = s.sec.cb; data[o + 17] = s.sec.cosA; data[o + 18] = s.sec.sinA; data[o + 19] = s.bound;
    data[o + 20] = s.group;
  });
  if (!segs.length) { min.fill(0); max.fill(0); }
  return { data, count: segs.length, min, max, groups };
}

/** Der Pressrest als Zylinder — Achse, Mitte der Stirnfläche, Radius, Dicke. */
export function biscuitPrim(biscuit) {
  const ax = AXES[biscuit.axis] || AXES['+y'];
  return { c: biscuit.pos.slice(), axis: ax, r: Math.max(1, biscuit.d / 2), t: Math.max(0.5, biscuit.t) };
}

/** Rastermaße vorab — für die Anzeige, BEVOR gerechnet wird. */
export function fieldSpec(segs, biscuit, opts = {}) {
  const cell = Math.max(0.1, opts.cell || 0.8);
  const k = Math.max(0, opts.blend || 0);
  const band = k + 4 * cell;
  const min = segs.min.slice(), max = segs.max.slice();
  if (biscuit) {
    const b = biscuitPrim(biscuit);
    const rad = Math.hypot(b.r, b.t);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.c[i] - rad);
      max[i] = Math.max(max[i], b.c[i] + rad);
    }
  }
  if (!isFinite(min[0])) { min.fill(-1); max.fill(1); }
  const pad = band + 2 * cell;
  const origin = [0, 1, 2].map(i => min[i] - pad);
  const dims = [0, 1, 2].map(i => Math.max(2, Math.ceil((max[i] - min[i] + 2 * pad) / cell) + 1));
  const samples = dims[0] * dims[1] * dims[2];
  return { dims, origin, h: cell, band, k, samples, bytes: samples * 4 };
}

/* ── Die Abstandsfunktion, einmal in JavaScript ──────────────────
   Dieselbe Formel steht ein zweites Mal in WGSL (js/runner/gpu.js).
   Zwei Fassungen derselben Rechnung sind ein Risiko; deshalb prüft
   `tests/web/3d-studio/runner.test.mjs` das JS-Feld gegen die
   Sweep-Geometrie, und der Viewer nennt in den Kennzahlen, welcher Weg
   gelaufen ist. */

const extrude = (d2, dz) =>
  Math.min(Math.max(d2, dz), 0) + Math.hypot(Math.max(d2, 0), Math.max(dz, 0));

/* Ein Prisma liefert ZWEI Werte: den Abstand zu seinem Kern und den
   Abstand zu seiner Trennebene (positiv oberhalb). Nur der Kern wird
   weich vereinigt, die Trennebene kommt zuletzt.

   Der Kern reicht um genau k über die Trennebene hinaus — nicht weiter.
   Das ist kein Schönheitsfehler, sondern nötig: der Übergang greift
   höchstens k weit, also braucht er genau so viel Luft nach oben, und
   ein UNBEGRENZTER Kern hätte die Hüllkugel jedes Prismas wertlos
   gemacht. Ohne gültige Hüllkugel übersprangen CPU- und GPU-Weg
   unterschiedliche Prismen und lieferten an einzelnen Rasterpunkten
   verschiedene Vorzeichen. */
/* Der Querschnitt wird für den Aufruf aus dem Speicherblock geholt statt
   neu gerechnet: `section()` steckt hier schon in den Zahlen, und ein
   zweites Objekt je Rasterpunkt wäre in der innersten Schleife das
   Teuerste am ganzen Feld. Ein einziges wiederverwendetes Objekt
   genügt — die Funktion ist nicht nebenläufig. */
const SEC = { width: 0, depth: 0, bottom: 0, r: 0, tanA: 0, cosA: 0, sinA: 0, cb: 0, halfTop: 0 };

export function segParts(s, o, px, py, pz, k, out) {
  SEC.halfTop = s[o + 11]; SEC.depth = s[o + 15]; SEC.r = s[o + 7];
  SEC.cb = s[o + 16]; SEC.cosA = s[o + 17]; SEC.sinA = s[o + 18];
  const dx = px - s[o], dy = py - s[o + 1], dz = pz - s[o + 2];
  const z = dx * s[o + 4] + dy * s[o + 5] + dz * s[o + 6];
  const x = dx * s[o + 8] + dy * s[o + 9] + dz * s[o + 10];
  const y = dx * s[o + 12] + dy * s[o + 13] + dz * s[o + 14];
  const d2 = sdf2dCore(SEC, x, y);
  out.core = Math.max(extrude(d2, Math.abs(z) - s[o + 3]), -y - k);
  out.cut = -y;
  return out;
}

/** Der fertige Abstand zu einem Prisma — Kern und Trennebene zusammen. */
export function segDistance(s, o, px, py, pz) {
  const p = segParts(s, o, px, py, pz, 0, { core: 0, cut: 0 });
  return Math.max(p.core, p.cut);
}

/* Der Pressrest genauso: ein nach oben offener Zylinder und seine
   Stirnfläche als Trennebene. */
export function biscuitParts(b, px, py, pz, k, out) {
  const dx = px - b.c[0], dy = py - b.c[1], dz = pz - b.c[2];
  const z = dx * b.axis[0] + dy * b.axis[1] + dz * b.axis[2];
  const rx = dx - b.axis[0] * z, ry = dy - b.axis[1] * z, rz = dz - b.axis[2] * z;
  out.core = extrude(Math.hypot(rx, ry, rz) - b.r, Math.max(-z - b.t, z - k));
  out.cut = z;
  return out;
}


export function smin(a, b, k) {
  if (k <= 1e-9) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/* ── Feld auf der CPU ────────────────────────────────────────────
   Ein Zug nach dem anderen: seine Prismen scharf in einen Zwischen-
   speicher (der nur so groß ist wie der Zug), dann der Zug als Ganzes
   weich in das Feld. Innerhalb eines Zuges wird nie geblendet — sonst
   liefe der Wert davon.

   Zwei Größen laufen mit: der Kern und die Trennebene des jeweils
   NÄCHSTEN Prismas. Ganz am Ende steht das Feld als max(Kern, Ebene).
   Die Reihenfolge und alle Abkürzungen sind dieselben wie im
   WebGPU-Weg (js/runner/gpu.js), damit beide dasselbe liefern. */
export async function buildFieldCPU(spec, segs, biscuit, onProgress) {
  const band = spec.band, k = spec.k;
  const core = new Float32Array(spec.samples).fill(band);
  const cut = new Float32Array(spec.samples).fill(band);

  const runs = [];
  if (biscuit) {
    const b = biscuitPrim(biscuit);
    const rad = Math.hypot(b.r, b.t);
    runs.push({
      min: [0, 1, 2].map(i => b.c[i] - rad), max: [0, 1, 2].map(i => b.c[i] + rad),
      prims: [{ c: b.c, r: rad, at: (x, y, z, out) => biscuitParts(b, x, y, z, k, out) }]
    });
  }
  const s = segs.data;
  for (const gr of segs.groups) {
    const prims = [];
    for (let i = gr.start; i < gr.end; i++) {
      const o = i * SEG_STRIDE;
      prims.push({
        c: [s[o], s[o + 1], s[o + 2]], r: s[o + 19],
        at: (x, y, z, out) => segParts(s, o, x, y, z, k, out)
      });
    }
    runs.push({ min: gr.min, max: gr.max, prims });
  }

  /* Ein Zwischenspeicher für den größten Zug, danach wiederverwendet. */
  const boxes = runs.map(r => clampBox(spec, r.min, r.max, band + 2 * k));
  let biggest = 0;
  for (const b of boxes) if (b) biggest = Math.max(biggest, boxSize(b));
  const localCore = new Float32Array(biggest);
  const localCut = new Float32Array(biggest);

  for (let r = 0; r < runs.length; r++) {
    const box = boxes[r];
    if (!box) continue;
    const n = boxSize(box);
    localCore.fill(band, 0, n);
    localCut.fill(band, 0, n);
    for (const prim of runs[r].prims) stampPrim(localCore, localCut, spec, box, prim, band, k);
    mergeRun(core, cut, localCore, localCut, spec, box, k, band);
    if (onProgress) {
      onProgress((r + 1) / runs.length);
      await new Promise(res => setTimeout(res, 0));
    }
  }

  /* Zuletzt der Schnitt an der Trennebene. */
  for (let i = 0; i < core.length; i++) {
    const v = core[i] > cut[i] ? core[i] : cut[i];
    core[i] = v > band ? band : v;
  }
  return { dims: spec.dims, origin: spec.origin, h: spec.h, band, data: core, backend: 'cpu' };
}

const boxSize = b => (b[1] - b[0] + 1) * (b[3] - b[2] + 1) * (b[5] - b[4] + 1);

/* Rasterquader aus einem Weltquader, auf das Feld beschnitten. */
function clampBox(spec, min, max, pad) {
  const [nx, ny, nz] = spec.dims, [ox, oy, oz] = spec.origin, h = spec.h;
  const lo = [ox, oy, oz], n = [nx, ny, nz];
  const b = [];
  for (let c = 0; c < 3; c++) {
    const a = Math.max(0, Math.floor((min[c] - pad - lo[c]) / h));
    const z = Math.min(n[c] - 1, Math.ceil((max[c] + pad - lo[c]) / h));
    if (z < a) return null;
    b.push(a, z);
  }
  return b;
}

/* Ein Prisma SCHARF in den Zwischenspeicher. Übersprungen wird über die
   Hüllkugel — dieselbe Abkürzung wie im Shader, damit beide Wege
   dieselben Prismen auslassen. Sie ist exakt: liegt die untere Schranke
   schon über dem bisherigen Wert, kann das Prisma ihn nicht senken. */
function stampPrim(lCore, lCut, spec, box, prim, band, k) {
  const [ox, oy, oz] = spec.origin;
  const h = spec.h;
  const w = box[1] - box[0] + 1, hh = box[3] - box[2] + 1;
  /* Der Kern ragt um k über die Trennebene — die Hüllkugel wächst mit. */
  const rad = prim.r + k;
  const reach = rad + band;
  const i0 = Math.max(box[0], Math.floor((prim.c[0] - reach - ox) / h));
  const i1 = Math.min(box[1], Math.ceil((prim.c[0] + reach - ox) / h));
  const j0 = Math.max(box[2], Math.floor((prim.c[1] - reach - oy) / h));
  const j1 = Math.min(box[3], Math.ceil((prim.c[1] + reach - oy) / h));
  const k0 = Math.max(box[4], Math.floor((prim.c[2] - reach - oz) / h));
  const k1 = Math.min(box[5], Math.ceil((prim.c[2] + reach - oz) / h));
  const out = { core: 0, cut: 0 };
  for (let kk = k0; kk <= k1; kk++) {
    const z = oz + kk * h;
    for (let jj = j0; jj <= j1; jj++) {
      const y = oy + jj * h;
      let idx = ((kk - box[4]) * hh + (jj - box[2])) * w + (i0 - box[0]);
      for (let ii = i0; ii <= i1; ii++, idx++) {
        const x = ox + ii * h;
        const cur = lCore[idx];
        const lower = Math.hypot(x - prim.c[0], y - prim.c[1], z - prim.c[2]) - rad;
        if (lower >= cur) continue;
        prim.at(x, y, z, out);
        if (out.core < cur) {
          lCore[idx] = out.core < -band ? -band : out.core;
          lCut[idx] = out.cut < -band ? -band : (out.cut > band ? band : out.cut);
        }
      }
    }
  }
}

/* Den fertigen Zug weich in das Feld. Die Trennebene übernimmt, wer den
   kleineren Kernabstand hat — also der nähere Kanal. */
function mergeRun(core, cut, lCore, lCut, spec, box, k, band) {
  const [nx, ny] = spec.dims;
  const w = box[1] - box[0] + 1, hh = box[3] - box[2] + 1;
  for (let kk = box[4]; kk <= box[5]; kk++) {
    for (let jj = box[2]; jj <= box[3]; jj++) {
      let g = (kk * ny + jj) * nx + box[0];
      let l = ((kk - box[4]) * hh + (jj - box[2])) * w;
      for (let ii = box[0]; ii <= box[1]; ii++, g++, l++) {
        const d = lCore[l];
        const acc = core[g];
        /* Der Zug hat diese Zelle gar nicht berührt — dann darf er sie
           auch nicht verschieben (smin(band, band) läge unter band). */
        if (d >= band || d >= acc + k) continue;
        if (d < acc) cut[g] = lCut[l];
        const v = smin(acc, d, k);
        core[g] = v < -band ? -band : v;
      }
    }
  }
}

/* ── Ein einzelner Rasterpunkt, Schritt für Schritt ──────────────
   Dieselbe Rechnung wie buildFieldCPU, nur für EINEN Punkt und in der
   Form, in der sie im Shader steht: Zug für Zug, Prisma für Prisma, mit
   denselben Abkürzungen. Sie ist damit die verbindliche Beschreibung des
   Verfahrens — daran hängen zwei Dinge:

   - `verifyField()` prüft nach jeder GPU-Rechnung eine Handvoll Punkte
     dagegen. Ein Shader, der etwas anderes rechnet als dieses Modul,
     fällt damit SOFORT auf, statt still eine falsche Geometrie zu
     liefern. Genau so ein Fall ist bei der Entwicklung aufgetreten (eine
     zweite, veraltete Kopie der Profilformel), und nur der Vergleich im
     Browser hat ihn gezeigt.
   - `tests/web/3d-studio/runner.test.mjs` prüft das ganze Feld von
     buildFieldCPU gegen diese Fassung. */
export function fieldAt(spec, segs, biscuit, px, py, pz) {
  const band = spec.band, k = spec.k;
  const out = { core: 0, cut: 0 };
  let acc = band, accCut = band;
  if (biscuit) {
    const b = biscuitPrim(biscuit);
    biscuitParts(b, px, py, pz, k, out);
    const d = Math.max(out.core, -band);
    if (d < band && d < acc + k) {
      if (d < acc) accCut = clampBand(out.cut, band);
      acc = Math.max(smin(acc, d, k), -band);
    }
  }
  const s = segs.data;
  for (const gr of segs.groups) {
    const c = [0, 1, 2].map(a => (gr.min[a] + gr.max[a]) / 2);
    const R = Math.hypot(gr.max[0] - c[0], gr.max[1] - c[1], gr.max[2] - c[2]);
    if (Math.hypot(px - c[0], py - c[1], pz - c[2]) - (R + k) >= Math.min(band, acc + k)) continue;
    let cur = band, best = -1;
    for (let i = gr.start; i < gr.end; i++) {
      const o = i * SEG_STRIDE;
      if (Math.hypot(px - s[o], py - s[o + 1], pz - s[o + 2]) - (s[o + 19] + k) >= cur) continue;
      segParts(s, o, px, py, pz, k, out);
      if (out.core < cur) { cur = Math.max(out.core, -band); best = i; }
    }
    if (best >= 0 && cur < band && cur < acc + k) {
      if (cur < acc) {
        segParts(s, best * SEG_STRIDE, px, py, pz, k, out);
        accCut = clampBand(out.cut, band);
      }
      acc = Math.max(smin(acc, cur, k), -band);
    }
  }
  return Math.min(Math.max(acc, accCut), band);
}

const clampBand = (v, band) => (v < -band ? -band : v > band ? band : v);

/**
 * Stichprobe: ein fertiges Feld gegen fieldAt() prüfen. Gibt die größte
 * gefundene Abweichung in mm zurück. Die Punkte werden deterministisch
 * gestreut (kein Zufall — ein Fehler soll reproduzierbar auffallen).
 */
export function verifyField(field, spec, segs, biscuit, count = 160) {
  const [nx, ny, nz] = spec.dims;
  const total = nx * ny * nz;
  const stride = Math.max(1, Math.floor(total / count));
  let worst = 0;
  for (let n = 0; n < count; n++) {
    const idx = (n * stride + 7919) % total;
    const i = idx % nx, j = Math.floor(idx / nx) % ny, kk = Math.floor(idx / (nx * ny));
    const v = fieldAt(spec, segs, biscuit,
      spec.origin[0] + i * spec.h, spec.origin[1] + j * spec.h, spec.origin[2] + kk * spec.h);
    worst = Math.max(worst, Math.abs(v - field.data[idx]));
  }
  return worst;
}
