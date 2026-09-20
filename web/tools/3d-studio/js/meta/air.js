/* Eingeschlossene Luft auf dem O-Gitter des Metamodells.

   Dieselbe Frage wie enclosedGas() des Gitters (js/lbm/sleeve.js) und dieselbe Antwort: Luftzellen, die
   zusammenhängen, bilden einen Raum; der GRÖSSTE ist der Luftraum vor der Welle, der noch durch den
   Laufkanal entweichen kann — alles andere ist eingeschlossen. So zählt die Kammerfüllung die Luft,
   gleich mit welchem Verfahren gerechnet wurde.

   Zwei Unterschiede zum Gitter, beide aus dem Gitter des Modells:
     · die Zellen sind verschieden groß (Kernblock und Ringblöcke), also zählt das VOLUMEN, nicht die
       Zellzahl — je Zelle Fläche × Schichthöhe, die Luft davon mit ihrem Anteil (1 − Schmelzeanteil);
     · die Kammer verkürzt sich mit dem Kolben: die Schichthöhe ist die des Bildes, nicht die der
       vollen Kammer (dieselbe Stauchung wie in predict.py und js/meta/ogrid.js).

   Nachbarn sind die Bildnachbarn im Querschnitt (mit den vier Nähten, cellNeighbours) und dieselbe
   Zelle in der Schicht davor und dahinter. */

import { cellNeighbours } from './ogrid.js';

/** Die Nachbarlisten des Querschnitts als CSR — einmal je Topologie, nicht je Bild. */
export function buildGraph(topo) {
  const NI = topo.NI, pairs = cellNeighbours(topo);
  const count = new Int32Array(NI);
  for (let i = 0; i < pairs.length; i++) count[pairs[i]]++;
  const start = new Int32Array(NI + 1);
  for (let q = 0; q < NI; q++) start[q + 1] = start[q] + count[q];
  const at = start.slice(0, NI), nb = new Int32Array(pairs.length);
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1];
    nb[at[a]++] = b; nb[at[b]++] = a;
  }
  return { NI, start, nb };
}

/** Das Luftvolumen je Zelle des Querschnitts in cm³, für ein Bild: Fläche · D² · Schichthöhe. */
export function cellVolumes(meta, { d, length }, Z, comp) {
  const area = meta.area_D2.flat(), dz = length / Z * comp;
  const v = new Float64Array(area.length);
  for (let q = 0; q < area.length; q++) v[q] = area[q] * d * d * dz / 1000;      // mm³ → cm³
  return v;
}

/**
 * Luft in einem Bild: `enclosed` cm³ eingeschlossen, `bubbles` Räume außer dem großen.
 * `fill` sind die Schmelzeanteile als Bytes, Schicht für Schicht (Z × NI).
 */
export function enclosedAir(graph, topo, fill, Z, vol) {
  const { NI, start, nb } = graph, inMask = topo.inMask;
  const N = Z * NI;
  const gas = new Uint8Array(N);
  for (let l = 0; l < Z; l++) {
    const base = l * NI;
    for (let q = 0; q < NI; q++) if (inMask[q] && fill[base + q] < 128) gas[base + q] = 1;
  }
  const seen = new Uint8Array(N), stack = new Int32Array(N);
  const rooms = [];
  for (let seed = 0; seed < N; seed++) {
    if (!gas[seed] || seen[seed]) continue;
    let size = 0, sp = 0;
    stack[sp++] = seed; seen[seed] = 1;
    while (sp) {
      const idx = stack[--sp], l = (idx / NI) | 0, q = idx - l * NI;
      size += (1 - fill[idx] / 255) * vol[q];
      if (l > 0 && gas[idx - NI] && !seen[idx - NI]) { seen[idx - NI] = 1; stack[sp++] = idx - NI; }
      if (l < Z - 1 && gas[idx + NI] && !seen[idx + NI]) { seen[idx + NI] = 1; stack[sp++] = idx + NI; }
      for (let e = start[q]; e < start[q + 1]; e++) {
        const j = l * NI + nb[e];
        if (gas[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
      }
    }
    rooms.push(size);
  }
  /* Eingeschlossen ist die Summe ALLER Räume außer dem größten — nicht
     „alles minus der größte": bei einem einzigen Raum bliebe von der
     Differenz zweier gleicher Summen ein Rest aus der Rundung stehen. */
  let big = 0;
  for (let i = 1; i < rooms.length; i++) if (rooms[i] > rooms[big]) big = i;
  let enclosed = 0, total = 0;
  for (let i = 0; i < rooms.length; i++) { total += rooms[i]; if (i !== big) enclosed += rooms[i]; }
  return { enclosed, total, bubbles: Math.max(0, rooms.length - 1) };
}
