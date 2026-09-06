/* Entformungsanalyse: jedem Dreieck die Formhälfte oder den Schieber
   zuordnen, der es abbildet — ohne dass Hälften oder Schieber im Modell
   vorhanden sein müssen, und ohne Regler.

   Die Zuordnung folgt festen Regeln je Dreieck, nicht einer Optimierung
   über das Netz — damit hängt das Ergebnis an der Geometrie, nicht an
   der Zerlegung in Dreiecke (eine große ebene Wand aus neun Dreiecken
   zählt genauso wie dieselbe Wand aus neuntausend):

   1. HÄLFTE     Sieht eine der beiden Formhälften (±Formöffnung) das
                 Dreieck frei und mit mindestens MIN_DRAFT_DEG Schräge,
                 gehört es ihr. Sehen es beide, gewinnt die mit der
                 größeren Schräge.
   2. SENKRECHT  Sieht eine Hälfte das Dreieck frei, aber nur streifend
                 (unter MIN_DRAFT_DEG — eine Wand ohne Schräge), gehört es
                 den Hälften und nicht einem Schieber: ein Schieber ist nur
                 dort gerechtfertigt, wo keine Hälfte hinkommt. Solche
                 Flächen folgen als zusammenhängender Fleck der Mehrheit
                 ihrer Nachbarn (Kantenlänge), damit die Trennlinie nicht
                 über die Wand zackt; bei Gleichstand der beweglichen
                 Hälfte. Die Schrägen-Ansicht zeigt sie rot (0°).
   3. SCHIEBER   Was keine Hälfte sieht, bekommt der Schieber, der es
                 frei sieht — der mit der frontalsten Sicht. Eine Fläche
                 PARALLEL zur Schieberrichtung (0°) ist erlaubt: eine
                 Querbohrung wird von einem Kern ohne Schräge gebildet.
                 Sehen zwei Schieber eine Fläche gleich gut, nimmt sie der
                 von der näheren Seite.
   4. HINTERSCHNITT  Was keine Richtung frei sieht.
   5. LÖCHER     Ein Fleck, der ganz von EINER anderen Region umschlossen
                 ist und den diese Richtung ebenfalls sieht, schlägt ihr
                 zu — sonst blieben an Kanten und Verrundungen Splitter
                 zwischen zwei Schiebern stehen.

   Die Formöffnungsrichtung wird, wenn nicht vorgegeben, automatisch
   gewählt: die Achse mit der kleinsten Fläche aus Schiebern und
   Hinterschnitten (Hinterschnitt zählt doppelt); bei Gleichstand die mit
   der kleinsten Fläche senkrechter Wände — ein Quader mit Querbohrung
   öffnet so längs der Bohrung (Kerne statt Schieber), ein in Y gezogener
   Quader öffnet in Y. Die Sichtbarkeit
   (js/part/visibility.js) hängt nur am Netz; alles hier kostet danach
   Millisekunden. */

import { DIRS } from './visibility.js';

export const UNDERCUT = -2;
export const MIN_DRAFT_DEG = 0.5;     // darunter sieht eine Hälfte eine Fläche nur streifend
const NONE = -1;
const MIN_DOT = Math.sin(MIN_DRAFT_DEG * Math.PI / 180);

/** Bitmaske der Richtungen, die ein Dreieck frei sehen (Normale nicht
    abgewandt, alle Abtastpunkte unverdeckt). */
export function candidates(model, vis) {
  const F = model.faceCount;
  const cand = new Uint8Array(F);
  for (let f = 0; f < F; f++) {
    let m = 0;
    for (let d = 0; d < 6; d++) {
      if (vis.dot[f * 6 + d] > -1e-9 && vis.frac[f * 6 + d] >= 1 - 1e-9) m |= 1 << d;
    }
    cand[f] = m;
  }
  return cand;
}

/* Schwerpunkt-Koordinate eines Dreiecks entlang einer Achse. */
function centroid(tris, f, axis) {
  const i = f * 9 + axis;
  return (tris[i] + tris[i + 3] + tris[i + 6]) / 3;
}

/* Zusammenhängende Flecken: Dreiecke, die same(a, b) verbindet. */
function patches(F, nbr, same, only = null) {
  const seen = new Uint8Array(F);
  const out = [];
  const stack = [];
  for (let f = 0; f < F; f++) {
    if (seen[f] || (only && !only(f))) continue;
    const members = [];
    seen[f] = 1; stack.push(f);
    while (stack.length) {
      const c = stack.pop();
      members.push(c);
      for (let e = 0; e < 3; e++) {
        const w = nbr[c * 3 + e];
        if (w < 0 || seen[w] || (only && !only(w)) || !same(c, w)) continue;
        seen[w] = 1; stack.push(w);
      }
    }
    out.push(members);
  }
  return out;
}

/* Länge der Kante e (0..2) von Dreieck f. */
function edgeLength(model, f, e) {
  const { index, verts } = model;
  const a = index[f * 3 + e] * 3, b = index[f * 3 + (e + 1) % 3] * 3;
  const dx = verts[a] - verts[b], dy = verts[a + 1] - verts[b + 1], dz = verts[a + 2] - verts[b + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function assign(model, vis, cand, mainAxis) {
  const F = model.faceCount;
  const { nbr, areas, tris, bounds } = model;
  const label = new Int8Array(F).fill(NONE);
  const weak = new Uint8Array(F);
  const mid = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
  const counts = { half: 0, slider: 0, undercut: 0, weak: 0, holes: 0 };

  const movingHalf = DIRS.findIndex(d => d.axis === mainAxis && d.sign > 0);

  /* 1, 3, 4: je Dreieck; senkrechte Flächen (2) werden vorgemerkt. */
  for (let f = 0; f < F; f++) {
    let bestHalf = -1, dotHalf = -Infinity, bestSlider = -1, dotSlider = -Infinity;
    for (let d = 0; d < 6; d++) {
      if (!(cand[f] & (1 << d))) continue;
      const dot = vis.dot[f * 6 + d];
      if (DIRS[d].axis === mainAxis) {
        if (dot > dotHalf) { dotHalf = dot; bestHalf = d; }
      } else if (dot > dotSlider + 1e-9) {
        dotSlider = dot; bestSlider = d;
      } else if (Math.abs(dot - dotSlider) <= 1e-9 && bestSlider >= 0) {
        /* Gleichstand (etwa 0° an beiden Enden einer Querbohrung): der
           Schieber von der näheren Seite. */
        const c = centroid(tris, f, DIRS[d].axis) - mid[DIRS[d].axis];
        const cb = centroid(tris, f, DIRS[bestSlider].axis) - mid[DIRS[bestSlider].axis];
        if (c * DIRS[d].sign > cb * DIRS[bestSlider].sign) bestSlider = d;
      }
    }
    if (bestHalf >= 0 && dotHalf >= MIN_DOT) { label[f] = bestHalf; counts.half++; }
    else if (bestHalf >= 0) { label[f] = bestHalf; weak[f] = 1; counts.weak++; }
    else if (bestSlider >= 0) { label[f] = bestSlider; counts.slider++; }
    else { label[f] = UNDERCUT; counts.undercut++; }
  }

  /* 2: senkrechte Flächen folgen als Fleck der Mehrheit ihrer Nachbarn,
     gewichtet mit der gemeinsamen Kantenlänge. Ein Fleck, dessen Rand nur
     Hinterschnitt oder gar nichts berührt, behält seine Hälfte. */
  for (const members of patches(F, nbr, () => true, f => weak[f] === 1)) {
    const votes = new Float64Array(6);
    let any = false;
    for (const f of members) {
      for (let e = 0; e < 3; e++) {
        const w = nbr[f * 3 + e];
        if (w < 0 || weak[w] || label[w] < 0) continue;
        votes[label[w]] += edgeLength(model, f, e); any = true;
      }
    }
    if (!any) continue;
    let best = -1;
    for (let d = 0; d < 6; d++) {
      if (votes[d] > (best < 0 ? 0 : votes[best]) + 1e-9) best = d;
      else if (best >= 0 && Math.abs(votes[d] - votes[best]) <= 1e-9 && d === movingHalf) best = d;
    }
    if (best < 0) continue;
    for (const f of members) label[f] = best;
  }

  /* 5: Löcher. Ein Fleck mit genau einer fremden Nachbarmarke, die alle
     seine Dreiecke frei sieht, geht an diese Marke. Wiederholt, weil ein
     gefülltes Loch ein weiteres frei machen kann. */
  for (let round = 0; round < 4; round++) {
    let changed = 0;
    for (const members of patches(F, nbr, (a, b) => label[a] === label[b])) {
      const mine = label[members[0]];
      if (mine === UNDERCUT) continue;
      let other = -1, ok = true;
      for (const f of members) {
        for (let e = 0; e < 3 && ok; e++) {
          const w = nbr[f * 3 + e];
          if (w < 0 || label[w] === mine) continue;
          if (label[w] === UNDERCUT) { ok = false; break; }
          if (other < 0) other = label[w];
          else if (other !== label[w]) ok = false;
        }
        if (!ok) break;
      }
      if (!ok || other < 0) continue;
      const strong = DIRS[other].axis === mainAxis;
      if (members.some(f => !(cand[f] & (1 << other)) || (strong && vis.dot[f * 6 + other] < MIN_DOT))) continue;
      for (const f of members) label[f] = other;
      counts.holes += members.length;
      changed++;
    }
    if (!changed) break;
  }

  const areaByLabel = new Float64Array(7);        // 0..5 Richtungen, 6 = Hinterschnitt
  for (let f = 0; f < F; f++) areaByLabel[label[f] === UNDERCUT ? 6 : label[f]] += areas[f];
  let sliderArea = 0, weakArea = 0;
  for (let d = 0; d < 6; d++) if (DIRS[d].axis !== mainAxis) sliderArea += areaByLabel[d];
  for (let f = 0; f < F; f++) if (weak[f]) weakArea += areas[f];
  return { label, weak, areaByLabel, counts, mainAxis, weakArea, score: sliderArea + 2 * areaByLabel[6] };
}

/** Zuordnung. opts.mainAxis: 0, 1, 2 oder 'auto' (Vorgabe). */
export function segment(model, vis, opts = {}) {
  const cand = candidates(model, vis);
  const want = opts.mainAxis;
  const fixed = want === 0 || want === 1 || want === 2;
  let best = null;
  const scores = [];
  const better = (a, b) => a.score < b.score - 1e-9
    || (Math.abs(a.score - b.score) <= 1e-9 && a.weakArea < b.weakArea - 1e-9);
  for (const axis of fixed ? [want] : [2, 1, 0]) {
    const r = assign(model, vis, cand, axis);
    scores[axis] = r.score;
    if (!best || better(r, best)) best = r;
  }
  return { ...best, cand, auto: !fixed, scores };
}
