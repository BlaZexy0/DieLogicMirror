/* Prüfkörper, fein vernetzt — wie ein CAD-Export mit feiner Einstellung.

   Das Studio verändert kein Netz, das es lädt (die Feinheit ist Sache des
   Exports; bis zum 23.09. teilte die Abstandsanalyse grobe Dreiecke selbst,
   mit js/mesh.js, refine). Manche Prüfungen brauchen trotzdem einen
   ebenen Körper mit Punkten mitten auf den Flächen: diese Hilfe teilt jedes
   Dreieck, dessen längste Kante über `maxEdge` liegt, an den Kantenmitten in
   vier — mehrfach, bis alles klein genug ist, höchstens bis `maxFaces`.
   Die Punkte liegen exakt auf der ursprünglichen Fläche. */

export function subdivide(tris, maxEdge, maxFaces = 400000) {
  const lim = maxEdge * maxEdge;
  let cur = tris;
  for (let pass = 0; pass < 8; pass++) {
    const F = cur.length / 9;
    const split = new Uint8Array(F);
    let need = 0;
    for (let f = 0; f < F; f++) {
      const o = f * 9;
      for (let e = 0; e < 3; e++) {
        const a = o + e * 3, b = o + ((e + 1) % 3) * 3;
        const dx = cur[b] - cur[a], dy = cur[b + 1] - cur[a + 1], dz = cur[b + 2] - cur[a + 2];
        if (dx * dx + dy * dy + dz * dz > lim) { split[f] = 1; need++; break; }
      }
    }
    if (!need || F + need * 3 > maxFaces) break;
    const out = new Float64Array((F + need * 3) * 9);
    let k = 0;
    const put = (o, i) => { out[k++] = cur[o + i * 3]; out[k++] = cur[o + i * 3 + 1]; out[k++] = cur[o + i * 3 + 2]; };
    const mid = (o, i, j) => {
      out[k++] = (cur[o + i * 3] + cur[o + j * 3]) / 2;
      out[k++] = (cur[o + i * 3 + 1] + cur[o + j * 3 + 1]) / 2;
      out[k++] = (cur[o + i * 3 + 2] + cur[o + j * 3 + 2]) / 2;
    };
    for (let f = 0; f < F; f++) {
      const o = f * 9;
      if (!split[f]) { for (let i = 0; i < 3; i++) put(o, i); continue; }
      /* Ecken 0,1,2 und Kantenmitten m01, m12, m20 → vier Dreiecke. */
      put(o, 0); mid(o, 0, 1); mid(o, 2, 0);
      mid(o, 0, 1); put(o, 1); mid(o, 1, 2);
      mid(o, 2, 0); mid(o, 1, 2); put(o, 2);
      mid(o, 0, 1); mid(o, 1, 2); mid(o, 2, 0);
    }
    cur = out;
  }
  return cur;
}
