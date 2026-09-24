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
                 Hälfte. Die Schrägen-Ansicht zeigt sie als „schlecht" (0°).
   3. SCHIEBER   Was keine Hälfte sieht, bekommt ein Schieber, der es
                 frei sieht. Eine Fläche PARALLEL zur Schieberrichtung
                 (0°) ist erlaubt: eine Querbohrung wird von einem Kern
                 ohne Schräge gebildet. Welcher Schieber, entscheidet der
                 zusammenhängende FLECK, nicht das einzelne Dreieck: die
                 Richtung, die die größte Fläche des Flecks sieht, bekommt
                 alles, was sie sieht; was übrig bleibt, wird erneut so
                 verteilt. Ein Sensordom auf der Seitenwand geht damit als
                 Ganzes an EINEN Schieber — nach der frontalsten Sicht je
                 Dreieck bekämen seine Flanken zwei weitere Schieber, die
                 kein Werkzeugmacher bauen würde. Sehen zwei Richtungen
                 gleich viel (eine Querbohrung ohne Schräge von beiden
                 Seiten), gilt je Dreieck die frontalste Sicht und bei
                 Gleichstand die nähere Seite: Kerne von beiden Seiten.
   4. HINTERSCHNITT  Was keine Richtung frei sieht.
   5. LÖCHER     Ein Fleck, der ganz von EINER anderen Region umschlossen
                 ist und den diese Richtung ebenfalls sieht, schlägt ihr
                 zu — sonst blieben an Kanten und Verrundungen Splitter
                 zwischen zwei Schiebern stehen. Einer Hälfte genügt dafür
                 die streifende Sicht (eine senkrechte Wand).

   6. SPLITTER   Ein Schieber- oder Hinterschnittfleck unter SLIVER_FRAC der
                 Oberfläche, der nur an Hälften grenzt, geht an die Hälfte
                 mit der längsten gemeinsamen Kante: ein Splitter an einer
                 Verrundung, den keine Hälfte sieht, ist kein Grund für
                 einen Schieber. Die Fläche wird gezählt (sliverArea) und
                 gemeldet, nicht verschwiegen.

   Was eine Hälfte nur TEILWEISE sieht (ein großes Dreieck der Flansch-
   unterseite, von dem ein Streifen über einem Dom liegt), zählt hier als
   Ganzes als nicht gesehen. Zerlegt wird ein solches Dreieck nicht: das
   Netz bleibt, wie es geladen wurde — wie fein es ist, entscheidet der
   Export.

   Die Formöffnungsrichtung wird, wenn nicht vorgegeben, automatisch
   gewählt: die Achse mit der kleinsten Fläche aus Schiebern und
   Hinterschnitten (Hinterschnitt zählt doppelt); bei Gleichstand die mit
   der kleinsten Fläche senkrechter Wände — ein Quader mit Querbohrung
   öffnet so längs der Bohrung (Kerne statt Schieber), ein in Y gezogener
   Quader öffnet in Y. Die Sichtbarkeit
   (js/part/visibility.js) hängt nur am Netz; alles hier kostet danach
   Millisekunden. */

import { DIRS, FACING_EPS } from './visibility.js';

export const UNDERCUT = -2;
export const MIN_DRAFT_DEG = 0.5;     // darunter sieht eine Hälfte eine Fläche nur streifend
export const SLIVER_FRAC = 1e-5;      // Splitter: Flecken unter diesem Anteil der Oberfläche
const NONE = -1;
const MIN_DOT = Math.sin(MIN_DRAFT_DEG * Math.PI / 180);

/** Bitmaske der Richtungen, die ein Dreieck frei sehen (Normale nicht
    abgewandt — bis FACING_EPS Gegenschräge, siehe visibility.js —, alle
    Abtastpunkte unverdeckt). */
export function candidates(model, vis) {
  const F = model.faceCount;
  const cand = new Uint8Array(F);
  for (let f = 0; f < F; f++) {
    let m = 0;
    for (let d = 0; d < 6; d++) {
      if (vis.dot[f * 6 + d] >= -FACING_EPS && vis.frac[f * 6 + d] >= 1 - 1e-9) m |= 1 << d;
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

/* Der Schieber mit der frontalsten Sicht auf Dreieck f; bei Gleichstand
   (etwa 0° an beiden Enden einer Querbohrung) der von der näheren Seite. */
function frontalSlider(model, vis, cand, f, mainAxis, mid, allowed) {
  const { tris } = model;
  let best = -1, dotBest = -Infinity;
  for (let d = 0; d < 6; d++) {
    if (DIRS[d].axis === mainAxis || !(cand[f] & (1 << d)) || !(allowed & (1 << d))) continue;
    const dot = vis.dot[f * 6 + d];
    if (dot > dotBest + 1e-9) { dotBest = dot; best = d; }
    else if (Math.abs(dot - dotBest) <= 1e-9 && best >= 0) {
      const c = centroid(tris, f, DIRS[d].axis) - mid[DIRS[d].axis];
      const cb = centroid(tris, f, DIRS[best].axis) - mid[DIRS[best].axis];
      if (c * DIRS[d].sign > cb * DIRS[best].sign) best = d;
    }
  }
  return best;
}

/* 3: Schieber je zusammenhängendem Fleck der noch unverteilten Dreiecke.
   Die Richtung mit der größten gesehenen Fläche bekommt alles, was sie
   sieht; der Rest bildet neue Flecken und wird ebenso verteilt. Sehen
   mehrere Richtungen gleich viel, entscheidet je Dreieck die frontalste
   Sicht. */
function assignSliders(model, vis, cand, label, pending, mainAxis, mid) {
  const F = model.faceCount;
  const { nbr, areas } = model;
  let sliderMask = 0;
  for (let d = 0; d < 6; d++) if (DIRS[d].axis !== mainAxis) sliderMask |= 1 << d;
  const open = new Uint8Array(F);
  for (const f of pending) open[f] = 1;
  let left = pending.length;
  for (let round = 0; left > 0 && round < 8; round++) {
    for (const members of patches(F, nbr, () => true, f => open[f] === 1)) {
      const cov = new Float64Array(6);
      for (const f of members) for (let d = 0; d < 6; d++) if (cand[f] & sliderMask & (1 << d)) cov[d] += areas[f];
      let best = -1;
      for (let d = 0; d < 6; d++) if (cov[d] > (best < 0 ? 0 : cov[best])) best = d;
      if (best < 0) continue;
      const tied = [];
      for (let d = 0; d < 6; d++) if (cov[d] > 0 && Math.abs(cov[d] - cov[best]) <= 1e-9 * cov[best]) tied.push(d);
      if (tied.length > 1) {
        let allowed = 0;
        for (const d of tied) allowed |= 1 << d;
        for (const f of members) {
          const d = frontalSlider(model, vis, cand, f, mainAxis, mid, allowed);
          if (d < 0) continue;
          label[f] = d; open[f] = 0; left--;
        }
        continue;
      }
      for (const f of members) {
        if (!(cand[f] & (1 << best))) continue;
        label[f] = best; open[f] = 0; left--;
      }
    }
  }
  /* Was nach acht Runden noch offen wäre, sähe keine Richtung — das kann
     nicht sein; zur Sicherheit die frontalste Sicht. */
  for (const f of pending) if (open[f]) label[f] = frontalSlider(model, vis, cand, f, mainAxis, mid, sliderMask);
}

function assign(model, vis, cand, mainAxis, movingSign = 1) {
  const F = model.faceCount;
  const { nbr, areas, bounds } = model;
  const label = new Int8Array(F).fill(NONE);
  const weak = new Uint8Array(F);
  const mid = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
  const counts = { half: 0, slider: 0, undercut: 0, weak: 0, holes: 0 };

  const movingHalf = DIRS.findIndex(d => d.axis === mainAxis && d.sign === movingSign);
  let sliderMask = 0;
  for (let d = 0; d < 6; d++) if (DIRS[d].axis !== mainAxis) sliderMask |= 1 << d;

  /* 1, 4: je Dreieck; senkrechte Flächen (2) werden vorgemerkt, Schieber-
     flächen (3) gesammelt. */
  const pending = [];
  for (let f = 0; f < F; f++) {
    let bestHalf = -1, dotHalf = -Infinity;
    for (let d = 0; d < 6; d++) {
      if (DIRS[d].axis !== mainAxis || !(cand[f] & (1 << d))) continue;
      const dot = vis.dot[f * 6 + d];
      if (dot > dotHalf) { dotHalf = dot; bestHalf = d; }
    }
    if (bestHalf >= 0 && dotHalf >= MIN_DOT) { label[f] = bestHalf; counts.half++; }
    else if (bestHalf >= 0) { label[f] = bestHalf; weak[f] = 1; counts.weak++; }
    else if (cand[f] & sliderMask) { pending.push(f); counts.slider++; }
    else { label[f] = UNDERCUT; counts.undercut++; }
  }
  assignSliders(model, vis, cand, label, pending, mainAxis, mid);

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
      /* Eine Hälfte nimmt den Fleck auch streifend (senkrechte Wand, bis
         FACING_EPS Gegenschräge) — ein Schieber für einen Splitter ohne
         Schräge wäre teurer als jede Wand ohne Schräge. */
      if (members.some(f => !(cand[f] & (1 << other)))) continue;
      for (const f of members) label[f] = other;
      counts.holes += members.length;
      changed++;
    }
    if (!changed) break;
  }

  /* 6: Splitter. */
  const sliverMax = SLIVER_FRAC * (model.totalArea || 0);
  let sliverArea = 0;
  for (const members of patches(F, nbr, (a, b) => label[a] === label[b])) {
    const mine = label[members[0]];
    if (mine >= 0 && DIRS[mine].axis === mainAxis) continue;
    let area = 0;
    for (const f of members) area += areas[f];
    if (area > sliverMax) continue;
    const votes = new Float64Array(6);
    let ok = true;
    for (const f of members) {
      for (let e = 0; e < 3 && ok; e++) {
        const w = nbr[f * 3 + e];
        if (w < 0 || label[w] === mine) continue;
        if (label[w] < 0 || DIRS[label[w]].axis !== mainAxis) { ok = false; break; }
        votes[label[w]] += edgeLength(model, f, e);
      }
      if (!ok) break;
    }
    if (!ok) continue;
    let best = -1;
    for (let d = 0; d < 6; d++) if (votes[d] > (best < 0 ? 0 : votes[best])) best = d;
    if (best < 0) continue;
    for (const f of members) { label[f] = best; weak[f] = 1; }
    sliverArea += area;
    counts.slivers = (counts.slivers || 0) + members.length;
  }

  const areaByLabel = new Float64Array(7);        // 0..5 Richtungen, 6 = Hinterschnitt
  for (let f = 0; f < F; f++) areaByLabel[label[f] === UNDERCUT ? 6 : label[f]] += areas[f];
  let sliderArea = 0, weakArea = 0;
  for (let d = 0; d < 6; d++) if (DIRS[d].axis !== mainAxis) sliderArea += areaByLabel[d];
  for (let f = 0; f < F; f++) if (weak[f]) weakArea += areas[f];
  return { label, weak, areaByLabel, counts, mainAxis, weakArea, sliverArea, score: sliderArea + 2 * areaByLabel[6] };
}

/** Zuordnung. opts.mainAxis: 0, 1, 2 oder 'auto' (Vorgabe); opts.movingSign:
    +1 (Vorgabe) oder −1 — welche Hälfte auf der Achse die bewegliche ist
    (sie bekommt senkrechte Wände bei Gleichstand). */
export function segment(model, vis, opts = {}) {
  const cand = candidates(model, vis);
  const want = opts.mainAxis;
  const fixed = want === 0 || want === 1 || want === 2;
  const movingSign = opts.movingSign === -1 ? -1 : 1;
  let best = null;
  const scores = [];
  const better = (a, b) => a.score < b.score - 1e-9
    || (Math.abs(a.score - b.score) <= 1e-9 && a.weakArea < b.weakArea - 1e-9);
  for (const axis of fixed ? [want] : [2, 1, 0]) {
    const r = assign(model, vis, cand, axis, movingSign);
    scores[axis] = r.score;
    if (!best || better(r, best)) best = r;
  }
  return { ...best, cand, auto: !fixed, scores };
}
