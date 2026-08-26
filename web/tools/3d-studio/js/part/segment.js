/* Formteilung: jedem Dreieck die Formhälfte bzw. den Schieber zuordnen,
   der es abbildet — ohne dass Hälften oder Schieber im Modell vorhanden
   sein müssen. Der Ablauf ist der klassische Dreischritt:

   1. SAAT      Dreiecke, die aus GENAU EINER der sechs Richtungen
                entformbar sind, sind eindeutig — sie werden festgesetzt.
                Dreiecke, die aus KEINER Richtung entformbar sind, sind
                Hinterschnitte und bleiben es (rot).
   2. INSELN    Zwei Sorten Restflecken werden aufgeräumt: Löcher, die
                komplett von einer einzigen Region umschlossen sind,
                schlagen dieser Region zu; winzige Splitter einer Region
                mitten in einer anderen werden aufgelöst.
   3. AUSBREITEN  Von der Saat aus wachsen die Regionen über die noch
                mehrdeutigen Dreiecke, bis sie aneinanderstoßen — die
                Stoßkante IST die Trennlinie. Gewachsen wird nur dorthin,
                wo die Richtung überhaupt entformbar ist; unter mehreren
                Möglichkeiten gewinnt die billigste (Dijkstra):
                gut anliegende Flächen sind billig, scharfe Knicke teuer,
                Schieber teurer als die Hauptrichtung. Dadurch legt sich
                die Trennlinie von selbst auf scharfe Kanten.

                Der Schieber-Aufschlag zählt JE DREIECK, nicht einmalig
                beim Start. Das ist der Unterschied zwischen „ein Schieber
                kostet etwas" und „ein Schieber kostet, was er abdeckt":
                eine lange, flach anliegende Wand (etwa ein Flansch mit
                2° Schräge) wäre sonst für den Schieber, der sie mit 90°
                sieht, immer billiger als für die Formhälfte, die sie
                völlig korrekt mit 2° entformt. Steht der Aufschlag über
                dem größtmöglichen Anliegen-Aufschlag (1,0), bekommen die
                Schieber genau das, was KEINE Hauptrichtung entformen
                kann — und der Regler in der Seitenleiste macht das
                Verhältnis nachvollziehbar. */

import { DIRS } from './visibility.js';

const NONE = -1;
export const UNDERCUT = -2;
export const STAGE = { OPEN: 0, SEED: 1, ISLAND: 2, GROWN: 3, REST: 4 };

export const DEFAULTS = {
  mainAxis: 2,          // Formöffnungsrichtung (0 = X, 1 = Y, 2 = Z)
  minDraftDeg: 0.5,     // darunter gilt eine Fläche nicht als entformbar
  visMin: 1,            // geforderter Anteil unverdeckter Abtastpunkte
  sliderPenalty: 1.2,   // Aufschlag JE DREIECK für Schieberrichtungen
  alignWeight: 1.0,     // Aufschlag für flach anliegende Flächen
  edgeWeight: 1.5,      // Aufschlag für das Überschreiten scharfer Kanten
  stepCost: 0.05,       // Grundpreis je Dreieck (hält die Fronten gleichmäßig)
  islandMaxFrac: 0.02   // Splitter bis zu diesem Flächenanteil auflösen
};

/* ── kleiner binärer Heap für die Ausbreitung ────────────────── */
function makeHeap(cap) {
  let n = 0;
  let cost = new Float64Array(cap), face = new Int32Array(cap), dir = new Int8Array(cap);
  function grow() {
    const c = new Float64Array(cost.length * 2); c.set(cost); cost = c;
    const f = new Int32Array(face.length * 2); f.set(face); face = f;
    const d = new Int8Array(dir.length * 2); d.set(dir); dir = d;
  }
  return {
    get size() { return n; },
    push(c, f, d) {
      if (n === cost.length) grow();
      let i = n++;
      cost[i] = c; face[i] = f; dir[i] = d;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (cost[p] <= cost[i]) break;
        [cost[p], cost[i]] = [cost[i], cost[p]];
        [face[p], face[i]] = [face[i], face[p]];
        [dir[p], dir[i]] = [dir[i], dir[p]];
        i = p;
      }
    },
    pop() {
      const out = { cost: cost[0], face: face[0], dir: dir[0] };
      n--;
      if (n > 0) {
        cost[0] = cost[n]; face[0] = face[n]; dir[0] = dir[n];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < n && cost[l] < cost[m]) m = l;
          if (r < n && cost[r] < cost[m]) m = r;
          if (m === i) break;
          [cost[m], cost[i]] = [cost[i], cost[m]];
          [face[m], face[i]] = [face[i], face[m]];
          [dir[m], dir[i]] = [dir[i], dir[m]];
          i = m;
        }
      }
      return out;
    }
  };
}

/* ── Zusammenhangskomponenten über die Kantennachbarschaft ─────
   components(): Flecken gleicher Zugehörigkeit (Prädikat).
   labelComponents(): Flecken GLEICHER Region — dafür läuft die Suche nur
   über Nachbarn mit derselben Marke. */
function components(F, nbr, belongs) {
  const comp = new Int32Array(F).fill(-1);
  const list = [];
  const stack = [];
  for (let f = 0; f < F; f++) {
    if (comp[f] >= 0 || !belongs(f)) continue;
    const id = list.length, members = [];
    comp[f] = id; stack.push(f);
    while (stack.length) {
      const c = stack.pop();
      members.push(c);
      for (let e = 0; e < 3; e++) {
        const w = nbr[c * 3 + e];
        if (w < 0 || comp[w] >= 0 || !belongs(w)) continue;
        comp[w] = id; stack.push(w);
      }
    }
    list.push(members);
  }
  return { comp, list };
}

function labelComponents(F, nbr, label) {
  const seen = new Uint8Array(F);
  const list = [];
  const stack = [];
  for (let f = 0; f < F; f++) {
    if (seen[f] || label[f] < 0) continue;
    const mine = label[f], members = [];
    seen[f] = 1; stack.push(f);
    while (stack.length) {
      const c = stack.pop();
      members.push(c);
      for (let e = 0; e < 3; e++) {
        const w = nbr[c * 3 + e];
        if (w < 0 || seen[w] || label[w] !== mine) continue;
        seen[w] = 1; stack.push(w);
      }
    }
    list.push(members);
  }
  return list;
}

/** Bitmaske der entformbaren Richtungen je Dreieck. */
export function candidates(model, vis, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const F = model.faceCount;
  const minDot = Math.sin(o.minDraftDeg * Math.PI / 180);
  const cand = new Uint8Array(F);
  for (let f = 0; f < F; f++) {
    let m = 0;
    for (let d = 0; d < 6; d++) {
      if (vis.dot[f * 6 + d] > minDot - 1e-9 && vis.frac[f * 6 + d] >= o.visMin - 1e-9) m |= 1 << d;
    }
    cand[f] = m;
  }
  return cand;
}

export function segment(model, vis, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const F = model.faceCount;
  const { nbr, normals, areas } = model;
  const cand = candidates(model, vis, o);

  const label = new Int8Array(F).fill(NONE);
  const stage = new Uint8Array(F);
  const bits = n => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };

  /* ── 1 · Saat ─────────────────────────────────────────────── */
  let seedCount = 0, undercutCount = 0;
  for (let f = 0; f < F; f++) {
    const m = cand[f];
    if (m === 0) { label[f] = UNDERCUT; stage[f] = STAGE.SEED; undercutCount++; continue; }
    if (bits(m) === 1) {
      label[f] = 31 - Math.clz32(m);
      stage[f] = STAGE.SEED;
      seedCount++;
    }
  }

  /* ── 2 · Inseln ───────────────────────────────────────────── */
  let islandCount = 0;

  /* (a) Löcher: unentschiedene Flecken, die nur EINE Region berühren. */
  const holes = components(F, nbr, f => label[f] === NONE);
  for (const members of holes.list) {
    let only = -1, ok = true;
    for (const f of members) {
      for (let e = 0; e < 3; e++) {
        const w = nbr[f * 3 + e];
        if (w < 0 || label[w] === NONE) continue;
        if (label[w] === UNDERCUT) { ok = false; break; }
        if (only < 0) only = label[w];
        else if (only !== label[w]) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok || only < 0) continue;
    if (members.some(f => !(cand[f] & (1 << only)))) continue;
    for (const f of members) { label[f] = only; stage[f] = STAGE.ISLAND; islandCount++; }
  }

  /* (b) Splitter: winzige Regionsstücke mitten in einer anderen Region. */
  const limit = model.totalArea * o.islandMaxFrac;
  const patches = labelComponents(F, nbr, label);
  for (const members of patches) {
    const mine = label[members[0]];
    let area = 0;
    for (const f of members) area += areas[f];
    if (area > limit) continue;
    let other = -1, ok = true;
    for (const f of members) {
      for (let e = 0; e < 3; e++) {
        const w = nbr[f * 3 + e];
        if (w < 0 || label[w] === NONE || label[w] === mine) continue;
        if (label[w] === UNDERCUT) { ok = false; break; }
        if (other < 0) other = label[w];
        else if (other !== label[w]) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok || other < 0) continue;
    if (members.some(f => !(cand[f] & (1 << other)))) continue;
    for (const f of members) { label[f] = other; stage[f] = STAGE.ISLAND; islandCount++; }
  }

  /* ── 3 · Ausbreiten bis zur Trennlinie ────────────────────── */
  const bias = new Float64Array(6);
  for (let d = 0; d < 6; d++) bias[d] = DIRS[d].axis === o.mainAxis ? 0 : o.sliderPenalty;

  const stepCost = (from, to, d) => {
    const align = 1 - vis.dot[to * 6 + d];
    const crease = 1 - (normals[from * 3] * normals[to * 3]
      + normals[from * 3 + 1] * normals[to * 3 + 1]
      + normals[from * 3 + 2] * normals[to * 3 + 2]);
    return o.alignWeight * align + o.edgeWeight * crease / 2 + o.stepCost + bias[d];
  };

  const heap = makeHeap(Math.max(1024, F));
  const dist = new Float64Array(F).fill(Infinity);

  const pushFrom = (f, d, cost) => {
    for (let e = 0; e < 3; e++) {
      const w = nbr[f * 3 + e];
      if (w < 0 || label[w] !== NONE || !(cand[w] & (1 << d))) continue;
      heap.push(cost + stepCost(f, w, d), w, d);
    }
  };

  let grownCount = 0;
  function drain() {
    while (heap.size) {
      const { cost, face, dir } = heap.pop();
      if (label[face] !== NONE) continue;
      label[face] = dir; stage[face] = STAGE.GROWN; dist[face] = cost; grownCount++;
      pushFrom(face, dir, cost);
    }
  }

  for (let f = 0; f < F; f++) if (label[f] >= 0) pushFrom(f, label[f], 0);
  drain();

  /* ── 4 · Rest: entformbar, aber von keiner Saat erreichbar ──
     Kommt vor, wenn ein ganzer Flecken nur aus mehrdeutigen Dreiecken
     besteht (z. B. der Mantel eines quer liegenden Zapfens: KEIN Dreieck
     darauf ist eindeutig). Statt jedes Dreieck für sich zu entscheiden,
     wird das jeweils am besten passende zur neuen Saat gemacht und von
     dort erneut ausgebreitet — so bleiben die Regionen zusammenhängend. */
  let restCount = 0;
  for (;;) {
    let bestF = -1, bestD = -1, bestVal = -Infinity;
    for (let f = 0; f < F; f++) {
      if (label[f] !== NONE) continue;
      for (let d = 0; d < 6; d++) {
        if (!(cand[f] & (1 << d))) continue;
        const val = vis.dot[f * 6 + d] - bias[d];
        if (val > bestVal) { bestVal = val; bestF = f; bestD = d; }
      }
      if (cand[f] === 0) { label[f] = UNDERCUT; stage[f] = STAGE.REST; undercutCount++; }
    }
    if (bestF < 0) break;
    label[bestF] = bestD; stage[bestF] = STAGE.REST; restCount++;
    pushFrom(bestF, bestD, 0);
    drain();
  }

  /* ── Kennzahlen + Trennlinie ──────────────────────────────── */
  const areaByLabel = new Float64Array(7);        // 0..5 Richtungen, 6 = Hinterschnitt
  for (let f = 0; f < F; f++) areaByLabel[label[f] === UNDERCUT ? 6 : label[f]] += areas[f];

  return {
    label, stage, cand, dist, options: o,
    areaByLabel,
    counts: { seed: seedCount, island: islandCount, grown: grownCount, rest: restCount, undercut: undercutCount }
  };
}
