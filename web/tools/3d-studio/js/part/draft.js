/* Entformschrägen.

   Die Entformschräge ist der Winkel zwischen einer Fläche und der
   Entformrichtung d: liegt die Fläche parallel zur Richtung (n ⟂ d), ist
   sie 0°; steht sie senkrecht dazu (n ∥ d), sind es 90°. Mit dem
   Einheitsvektor n gilt schlicht

       α = arcsin(n · d).

   Gemessen wird gegen die Richtung, die die Formteilung dem Dreieck
   zugewiesen hat — eine Fläche, die vom Schieber +X gebildet wird, wird
   also gegen +X bewertet, nicht gegen die Formöffnungsrichtung. */

import { UNDERCUT } from './segment.js';
import { DIRS } from './visibility.js';

const DEG = 180 / Math.PI;

/** Entformschräge je Dreieck in Grad, bezogen auf die zugewiesene Richtung.
    Hinterschnittene Dreiecke werden gegen ihre beste Richtung gemessen —
    aussagekräftig ist dort aber die Marke, nicht der Winkel. */
export function draftAngles(model, vis, label) {
  const F = model.faceCount;
  const out = new Float32Array(F);
  for (let f = 0; f < F; f++) {
    let d = label[f];
    if (d < 0) {                                   // Hinterschnitt: beste Richtung
      let best = 0, bestVal = -Infinity;
      for (let k = 0; k < 6; k++) {
        const v = vis.dot[f * 6 + k];
        if (v > bestVal) { bestVal = v; best = k; }
      }
      d = best;
    }
    const s = Math.max(-1, Math.min(1, vis.dot[f * 6 + d]));
    out[f] = Math.asin(s) * DEG;
  }
  return out;
}

/** Kennzahlen: Fläche unter dem Grenzwert, Minimum, Verteilung. */
export function draftStats(model, draft, label, limitDeg) {
  const F = model.faceCount;
  let below = 0, undercut = 0, min = Infinity, total = 0;
  const bins = new Float64Array(10);               // 0…1…2…3…4…5…7…10…20…90°
  const edges = [0.5, 1, 1.5, 2, 3, 5, 7, 10, 20];
  for (let f = 0; f < F; f++) {
    const a = model.areas[f];
    total += a;
    if (label[f] === UNDERCUT) { undercut += a; continue; }
    if (draft[f] < min) min = draft[f];
    if (draft[f] < limitDeg) below += a;
    let k = 0; while (k < edges.length && draft[f] >= edges[k]) k++;
    bins[k] += a;
  }
  return {
    total, below, undercut,
    belowFrac: total ? below / total : 0,
    undercutFrac: total ? undercut / total : 0,
    min: isFinite(min) ? min : 0,
    bins, edges
  };
}

/** Beschriftung der sechs Richtungen abhängig von der Formöffnungsrichtung.
    Welche Hälfte die bewegliche ist, sagt movSign: +1 (Vorgabe) — im
    Bauteilrahmen liegt die Trennebene bei z = 0 und die Form öffnet nach
    +z, die +Seite ist die Auswerferseite —, oder −1, wenn das Teil anders
    herum in der Form liegt. */
export function dirNames(mainAxis, movSign = 1) {
  return DIRS.map(d => {
    if (d.axis !== mainAxis) return { ...d, role: 'slider', name: 'Schieber ' + d.label };
    return { ...d, role: 'half',
      name: (d.sign === movSign ? 'Bewegliche Seite ' : 'Feste Seite ') + d.label };
  });
}
