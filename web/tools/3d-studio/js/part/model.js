/* Aus einer Dreieckssuppe das Arbeitsmodell der Formteilungs-Analyse
   bauen: Flächennormalen, Schwerpunkte, Flächeninhalte, verschweißte
   Punkte und die Nachbarschaft über Kanten. Ohne Three.js — damit die
   Analyse in tests/ unter Node läuft. */

import { faceData, weld, adjacency, bounds, volume, surface, cleanMesh, orientMesh } from '../mesh.js';

export function buildModel(rawTris, opts = {}) {
  /* Erst aufräumen: entartete Dreiecke und T-Stöße würden die
     Kantennachbarschaft aufreißen, über die die Regionen wachsen. */
  const cleaned = opts.clean === false ? { tris: rawTris, inserted: 0 } : cleanMesh(rawTris);
  /* Dann einheitlich ausrichten. Inkonsistent gewickelte Netze meldeten
     sonst „Volumen 0,0 cm³", die halbe Oberfläche als Hinterschnitt und
     obendrein fast jede Kante als offen — alles still. */
  const oriented = opts.orient === false ? { tris: cleaned.tris, flipped: 0 }
    : orientMesh(cleaned.tris, weld(cleaned.tris).index);
  const tris = oriented.tris;
  const fd = faceData(tris);
  const w = weld(tris);
  return {
    tris,
    flippedFaces: oriented.flipped,
    faceCount: fd.count,
    normals: fd.normals,
    areas: fd.areas,
    centroids: fd.centroids,
    verts: w.verts,
    index: w.index,
    vertexCount: w.vertexCount,
    nbr: adjacency(w.index, fd.count),
    bounds: bounds(tris),
    volume: volume(tris),
    surface: surface(tris),
    totalArea: fd.areas.reduce((a, b) => a + b, 0),
    repairedPoints: cleaned.inserted,
    rawFaceCount: rawTris.length / 9
  };
}

/** Anteil offener Kanten — ein Maß dafür, wie geschlossen das Netz ist. */
export function openEdgeRatio(model) {
  let open = 0;
  for (let i = 0; i < model.nbr.length; i++) if (model.nbr[i] < 0) open++;
  return open / model.nbr.length;
}
