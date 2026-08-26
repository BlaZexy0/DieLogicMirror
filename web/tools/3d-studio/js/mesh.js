/* Netz-Werkzeuge ohne Three.js-Abhängigkeit.

   Gemeinsame Grundlage von zwei sehr verschiedenen Stellen:
   - js/components.js braucht nach einer CSG-Operation wieder weiche
     Normalen (die Bool-Operation liefert nur Flächennormalen),
   - js/part/* braucht Topologie (Nachbarschaft über Kanten) für die
     Formteilungs-Analyse.

   Datenformat überall: „Dreieckssuppe" als Float32Array/Float64Array mit
   9 Werten je Dreieck (x0,y0,z0, x1,y1,z1, x2,y2,z2) — dasselbe Format,
   das auch die Sprengflächenanalyse in DieLogic aus STL-Dateien liest.
   Damit läuft dieses Modul unverändert im Browser und unter Node
   (tests/, tools/build-glb.mjs). */

/** Bounding-Box + abgeleitete Maße. */
export function bounds(tris) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = tris[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  if (!isFinite(min[0])) { min.fill(0); max.fill(0); }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const center = [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2];
  const diag = Math.hypot(size[0], size[1], size[2]) || 1;
  return { min, max, size, center, diag };
}

/** Flächennormalen (normiert) und Flächeninhalte je Dreieck. */
export function faceData(tris) {
  const F = tris.length / 9;
  const nrm = new Float64Array(F * 3);
  const area = new Float64Array(F);
  const cen = new Float64Array(F * 3);
  for (let f = 0; f < F; f++) {
    const i = f * 9;
    const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
    const vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
    let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const len = Math.hypot(cx, cy, cz);
    area[f] = len / 2;
    if (len > 0) { cx /= len; cy /= len; cz /= len; }
    nrm[f * 3] = cx; nrm[f * 3 + 1] = cy; nrm[f * 3 + 2] = cz;
    cen[f * 3]     = (tris[i]     + tris[i + 3] + tris[i + 6]) / 3;
    cen[f * 3 + 1] = (tris[i + 1] + tris[i + 4] + tris[i + 7]) / 3;
    cen[f * 3 + 2] = (tris[i + 2] + tris[i + 5] + tris[i + 8]) / 3;
  }
  return { normals: nrm, areas: area, centroids: cen, count: F };
}

/** Volumen über signierte Tetraeder (geschlossenes Netz vorausgesetzt). */
export function volume(tris) {
  let v6 = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i],     ay = tris[i + 1], az = tris[i + 2];
    const bx = tris[i + 3], by = tris[i + 4], bz = tris[i + 5];
    const cx = tris[i + 6], cy = tris[i + 7], cz = tris[i + 8];
    v6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return v6 / 6;
}

/** Summe der Dreiecksflächen. */
export function surface(tris) {
  let a = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
    const vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    a += Math.hypot(cx, cy, cz) / 2;
  }
  return a;
}

/* ── Verschweißen ────────────────────────────────────────────────
   Gleiche Punkte zusammenfassen. Der Schlüssel ist die Rasterzelle des
   Punktes; liegt ein Punkt knapp neben der Zelle eines schon bekannten
   Punktes, findet ihn die Suche über die 26 Nachbarzellen — sonst risse
   die Nachbarschaft an genau den Kanten auf, an denen die Regionen
   später wachsen sollen.

   Die Zellen hängen in einer Streuwerttabelle mit verketteten Listen
   (head/next als typisierte Felder). Zeichenketten als Schlüssel wären
   einfacher, kosten aber bei großen STL-Dateien ein Vielfaches — und
   diese Funktion läuft in jedem Aufräum-Durchlauf mehrfach. */
export function weld(tris, eps) {
  const F = tris.length / 9;
  const n = F * 3;
  const b = bounds(tris);
  const q = eps || b.diag * 1e-6;
  const inv = 1 / q;

  const verts = new Float64Array(n * 3);
  const cell = new Int32Array(n * 3);
  const next = new Int32Array(n).fill(-1);
  const head = new Map();
  const index = new Uint32Array(n);
  let count = 0;

  const hashOf = (x, y, z) =>
    (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;

  const lookup = (gx, gy, gz, px, py, pz) => {
    let id = head.get(hashOf(gx, gy, gz));
    while (id !== undefined) {
      if (cell[id * 3] === gx && cell[id * 3 + 1] === gy && cell[id * 3 + 2] === gz
          && Math.abs(verts[id * 3] - px) <= q
          && Math.abs(verts[id * 3 + 1] - py) <= q
          && Math.abs(verts[id * 3 + 2] - pz) <= q) return id;
      id = next[id] < 0 ? undefined : next[id];
    }
    return -1;
  };

  for (let i = 0; i < n; i++) {
    const px = tris[i * 3], py = tris[i * 3 + 1], pz = tris[i * 3 + 2];
    const gx = Math.round(px * inv), gy = Math.round(py * inv), gz = Math.round(pz * inv);
    let id = lookup(gx, gy, gz, px, py, pz);
    if (id < 0) {
      outer:
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dy && !dz) continue;
        const cand = lookup(gx + dx, gy + dy, gz + dz, px, py, pz);
        if (cand >= 0) { id = cand; break outer; }
      }
    }
    if (id < 0) {
      id = count++;
      verts[id * 3] = px; verts[id * 3 + 1] = py; verts[id * 3 + 2] = pz;
      cell[id * 3] = gx; cell[id * 3 + 1] = gy; cell[id * 3 + 2] = gz;
      const h = hashOf(gx, gy, gz);
      const prev = head.get(h);
      next[id] = prev === undefined ? -1 : prev;
      head.set(h, id);
    }
    index[i] = id;
  }
  return { verts: verts.slice(0, count * 3), index, faceCount: F, vertexCount: count };
}

/* ── Nachbarschaft über Kanten ───────────────────────────────────
   nbr[f*3+e] = Nachbardreieck an der Kante e (Ecken e → e+1), −1 wenn
   die Kante offen ist oder mehr als zwei Dreiecke daran hängen
   (nicht-mannigfaltig). */
export function adjacency(index, faceCount) {
  const nbr = new Int32Array(faceCount * 3).fill(-1);
  const map = new Map();
  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = index[f * 3 + e], b = index[f * 3 + (e + 1) % 3];
      if (a === b) continue;
      /* Kantenschlüssel als Zahl: 26 Bit je Index (bis 67 Mio. Punkte)
         bleibt exakt in einer Gleitkommazahl. */
      const key = a < b ? a * 67108864 + b : b * 67108864 + a;
      let slot = map.get(key);
      if (!slot) map.set(key, slot = [[], []]);
      slot[a < b ? 0 : 1].push(f * 3 + e);
    }
  }
  /* Gegenläufige Halbkanten paaren. Kommt eine Kante mehr als zweimal vor
     (nicht-mannigfaltig, etwa wenn drei Körper sich eine Kante teilen),
     werden so viele Paare wie möglich gebildet; der Rest bleibt offen. */
  for (const [, [fwd, bwd]] of map) {
    const n = Math.min(fwd.length, bwd.length);
    for (let i = 0; i < n; i++) {
      nbr[fwd[i]] = (bwd[i] / 3) | 0;
      nbr[bwd[i]] = (fwd[i] / 3) | 0;
    }
  }
  return nbr;
}

/* ── Weiche Normalen ─────────────────────────────────────────────
   Nach einer CSG-Operation liegen nur Flächennormalen vor; Zylinder-
   mäntel sähen facettiert aus. Über den Knickwinkel (crease) gemittelte
   Punktnormalen holen die runden Flächen zurück, ohne die Kanten der
   Quader weichzuzeichnen. */
export function smoothNormals(tris, creaseDeg = 32) {
  const { normals, areas } = faceData(tris);
  const F = tris.length / 9;
  const { verts, index } = weld(tris);
  const V = verts.length / 3;

  /* Je Punkt die anliegenden Dreiecke sammeln (CSR-Layout). */
  const cnt = new Uint32Array(V + 1);
  for (let i = 0; i < F * 3; i++) cnt[index[i] + 1]++;
  for (let v = 0; v < V; v++) cnt[v + 1] += cnt[v];
  const start = cnt.slice();
  const list = new Uint32Array(F * 3);
  const fill = start.slice();
  for (let f = 0; f < F; f++) for (let e = 0; e < 3; e++) list[fill[index[f * 3 + e]]++] = f;

  const cosCrease = Math.cos(creaseDeg * Math.PI / 180);
  const out = new Float32Array(F * 9);
  for (let f = 0; f < F; f++) {
    const nx = normals[f * 3], ny = normals[f * 3 + 1], nz = normals[f * 3 + 2];
    for (let e = 0; e < 3; e++) {
      const v = index[f * 3 + e];
      let ax = 0, ay = 0, az = 0;
      for (let k = start[v]; k < start[v + 1]; k++) {
        const g = list[k];
        const gx = normals[g * 3], gy = normals[g * 3 + 1], gz = normals[g * 3 + 2];
        if (nx * gx + ny * gy + nz * gz < cosCrease) continue;
        ax += gx * areas[g]; ay += gy * areas[g]; az += gz * areas[g];
      }
      const len = Math.hypot(ax, ay, az);
      if (len > 1e-12) { ax /= len; ay /= len; az /= len; } else { ax = nx; ay = ny; az = nz; }
      out[f * 9 + e * 3] = ax; out[f * 9 + e * 3 + 1] = ay; out[f * 9 + e * 3 + 2] = az;
    }
  }
  return out;
}

/* ── Indizieren ──────────────────────────────────────────────────
   Die CSG liefert eine Dreieckssuppe: jeder Punkt steht dreifach und
   öfter in der Datei. Gleiche (Position, Normale) zu EINEM Punkt
   zusammenzufassen drittelt die GLB — und ist verlustfrei, weil die
   Normale mit im Schlüssel steht (harte Kanten bleiben hart). */
export function indexTriangles(tris, normals, qPos, qNrm = 1e-3) {
  const F = tris.length / 9;
  const q = qPos || (bounds(tris).diag * 1e-6);
  const map = new Map();
  const pos = [], nrm = [];
  const index = new Uint32Array(F * 3);
  for (let i = 0; i < F * 3; i++) {
    const px = tris[i * 3], py = tris[i * 3 + 1], pz = tris[i * 3 + 2];
    const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    const key = Math.round(px / q) + ',' + Math.round(py / q) + ',' + Math.round(pz / q) + '|'
              + Math.round(nx / qNrm) + ',' + Math.round(ny / qNrm) + ',' + Math.round(nz / qNrm);
    let id = map.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      pos.push(px, py, pz);
      nrm.push(nx, ny, nz);
      map.set(key, id);
    }
    index[i] = id;
  }
  return { position: Float32Array.from(pos), normal: Float32Array.from(nrm), index };
}

/* ── T-Stöße schließen ───────────────────────────────────────────
   Boolesche Operationen (js/csg.js) und viele STL-Exporte hinterlassen
   T-Stöße: ein Punkt liegt MITTEN auf der Kante eines Nachbardreiecks,
   ohne dort ein Eckpunkt zu sein. Die Kante findet dann keinen Partner —
   das Netz ist zwar dicht, aber topologisch aufgerissen. Für die
   Formteilungs-Analyse ist das fatal: die Regionen wachsen über die
   Kantennachbarschaft, ein Riss stoppt sie.

   Reparatur: für jede partnerlose Kante die Punkte suchen, die auf ihr
   liegen, sie in die Kante einfügen und das betroffene Dreieck als
   Fächer um seinen Schwerpunkt neu unterteilen (der Fächer bleibt in
   derselben Ebene, Normale und Umlaufrichtung ändern sich nicht).
   Kandidaten sind nur Punkte, die selbst an einer partnerlosen Kante
   hängen — sonst wäre der Stoß keiner. */
export function repairTJunctions(tris, opts = {}) {
  const F = tris.length / 9;
  const b = bounds(tris);
  const eps = opts.eps || b.diag * 1e-6;
  const { verts, index, vertexCount: V } = weld(tris, eps);
  const nbr = adjacency(index, F);
  const tol = opts.tol || b.diag * 1e-5;
  /* Wie weit ein Punkt von den Kantenenden weg sein muss, um als eigener
     Einfügepunkt zu gelten. Das MUSS die Schweiß-Toleranz sein: alles,
     was gröber ist, fällt sonst durch beide Raster — nicht verschweißt
     und nicht eingefügt — und die Kante bleibt für immer offen. */
  const endTol = eps;

  const openSlots = [];
  const isCand = new Uint8Array(V);
  for (let f = 0; f < F; f++) {
    for (let e = 0; e < 3; e++) {
      if (nbr[f * 3 + e] >= 0) continue;
      openSlots.push(f * 3 + e);
      isCand[index[f * 3 + e]] = 1;
      isCand[index[f * 3 + (e + 1) % 3]] = 1;
    }
  }
  if (!openSlots.length) return { tris, repaired: 0, open: 0 };

  const cell = Math.max(b.diag / 128, tol * 8);
  const grid = new Map();
  const key = (x, y, z) => x + ',' + y + ',' + z;
  for (let v = 0; v < V; v++) {
    if (!isCand[v]) continue;
    const k = key(Math.floor(verts[v * 3] / cell), Math.floor(verts[v * 3 + 1] / cell), Math.floor(verts[v * 3 + 2] / cell));
    let l = grid.get(k);
    if (!l) grid.set(k, l = []);
    l.push(v);
  }

  const inserts = new Map();
  let repaired = 0;
  for (const slot of openSlots) {
    const f = (slot / 3) | 0, e = slot % 3;
    const a = index[slot], c = index[f * 3 + (e + 1) % 3];
    const ax = verts[a * 3], ay = verts[a * 3 + 1], az = verts[a * 3 + 2];
    const dx = verts[c * 3] - ax, dy = verts[c * 3 + 1] - ay, dz = verts[c * 3 + 2] - az;
    const L2 = dx * dx + dy * dy + dz * dz;
    const L = Math.sqrt(L2);
    if (L < tol) continue;
    const steps = Math.max(1, Math.ceil(L / cell));
    const seen = new Set([a, c]);
    const found = [];
    for (let s = 0; s <= steps; s++) {
      const px = ax + dx * s / steps, py = ay + dy * s / steps, pz = az + dz * s / steps;
      const gx = Math.floor(px / cell), gy = Math.floor(py / cell), gz = Math.floor(pz / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const l = grid.get(key(gx + i, gy + j, gz + k));
        if (!l) continue;
        for (const v of l) {
          if (seen.has(v)) continue;
          seen.add(v);
          const t = ((verts[v * 3] - ax) * dx + (verts[v * 3 + 1] - ay) * dy + (verts[v * 3 + 2] - az) * dz) / L2;
          if (t * L <= endTol || (1 - t) * L <= endTol) continue;
          const qx = ax + dx * t, qy = ay + dy * t, qz = az + dz * t;
          if (Math.hypot(verts[v * 3] - qx, verts[v * 3 + 1] - qy, verts[v * 3 + 2] - qz) > tol) continue;
          found.push({ t, v });
        }
      }
    }
    if (found.length) {
      found.sort((p, q) => p.t - q.t);
      inserts.set(slot, found);
      repaired += found.length;
    }
  }
  if (!repaired) return { tris, repaired: 0, open: openSlots.length };

  const out = [];
  const push = v => { out.push(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]); };
  for (let f = 0; f < F; f++) {
    const any = inserts.has(f * 3) || inserts.has(f * 3 + 1) || inserts.has(f * 3 + 2);
    if (!any) { for (let e = 0; e < 3; e++) push(index[f * 3 + e]); continue; }
    const poly = [];
    for (let e = 0; e < 3; e++) {
      poly.push(index[f * 3 + e]);
      const ins = inserts.get(f * 3 + e);
      if (ins) for (const p of ins) poly.push(p.v);
    }
    const c0 = index[f * 3], c1 = index[f * 3 + 1], c2 = index[f * 3 + 2];
    const mx = (verts[c0 * 3] + verts[c1 * 3] + verts[c2 * 3]) / 3;
    const my = (verts[c0 * 3 + 1] + verts[c1 * 3 + 1] + verts[c2 * 3 + 1]) / 3;
    const mz = (verts[c0 * 3 + 2] + verts[c1 * 3 + 2] + verts[c2 * 3 + 2]) / 3;
    for (let i = 0; i < poly.length; i++) {
      out.push(mx, my, mz);
      push(poly[i]);
      push(poly[(i + 1) % poly.length]);
    }
  }
  return { tris: Float64Array.from(out), repaired, open: openSlots.length };
}

/* Entartete Dreiecke entfernen: nach dem Verschweißen fallen zwei Ecken
   zusammen, die Fläche ist null. Sie stören Nachbarschaft und Normalen. */
function dropDegenerate(tris, eps) {
  const F = tris.length / 9;
  const { verts, index } = weld(tris, eps);
  const keep = [];
  for (let f = 0; f < F; f++) {
    const a = index[f * 3], b = index[f * 3 + 1], c = index[f * 3 + 2];
    if (a !== b && b !== c && a !== c) keep.push(f);
  }
  if (keep.length === F) {
    /* Trotzdem auf die verschweißten Koordinaten vereinheitlichen. */
    const out = new Float64Array(tris.length);
    for (let i = 0; i < F * 3; i++) {
      const v = index[i];
      out[i * 3] = verts[v * 3]; out[i * 3 + 1] = verts[v * 3 + 1]; out[i * 3 + 2] = verts[v * 3 + 2];
    }
    return out;
  }
  const out = new Float64Array(keep.length * 9);
  keep.forEach((f, k) => {
    for (let e = 0; e < 3; e++) {
      const v = index[f * 3 + e];
      out[k * 9 + e * 3] = verts[v * 3];
      out[k * 9 + e * 3 + 1] = verts[v * 3 + 1];
      out[k * 9 + e * 3 + 2] = verts[v * 3 + 2];
    }
  });
  return out;
}

/** Netz aufräumen: entartete Dreiecke weg, T-Stöße zu (mehrere Durchläufe,
    weil ein Fächer neue Kanten erzeugen kann). */
export function cleanMesh(tris, opts = {}) {
  let t = dropDegenerate(tris, opts.eps);
  let inserted = 0, passes = 0;
  for (let i = 0; i < (opts.maxPasses || 4); i++) {
    const r = repairTJunctions(t, opts);
    t = r.tris;
    passes++;
    if (!r.repaired) break;
    inserted += r.repaired;
  }
  return { tris: t, inserted, passes };
}

/* Punkt-Dreieck-Abstand (quadriert), Ericson „Real-Time Collision
   Detection" 5.1.5 — als Skalare ausgeschrieben, weil diese Schleife der
   heißeste Teil gleich zweier Werkzeuge ist: des Abstandsfeldes
   (js/part/field.js) und der Abstandsanalyse (js/part/distance.js). */
export function distSqPointTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v;
      } else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz;
        const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
              qx = bx + (cx - bx) * w; qy = by + (cy - by) * w; qz = bz + (cz - bz) * w;
            } else {
              const den = 1 / (va + vb + vc);
              const v = vb * den, w = vc * den;
              qx = ax + abx * v + acx * w;
              qy = ay + aby * v + acy * w;
              qz = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}


/* ── Verfeinern ──────────────────────────────────────────────────
   Für eine punktweise Einfärbung (Abstandskarte) muss das Netz fein
   genug sein: eine ebene Wand aus ZWEI Dreiecken hat vier Eckpunkte, und
   zwischen ihnen wird linear interpoliert — der wahre Abstandsverlauf
   auf der Fläche geht dabei verloren. CAD-Exporte tessellieren gekrümmte
   Flächen fein, ebene aber grob; genau die ebene Wand gegenüber einem
   Temperierkanal wäre also der schlechteste Fall.

   Deshalb wird jedes Dreieck, dessen längste Kante über maxEdge liegt,
   an den Kantenmitten in vier geteilt — mehrfach, bis alles klein genug
   ist. Die Punkte liegen dabei exakt auf der ursprünglichen Fläche, die
   Geometrie ändert sich also nicht. */
export function refine(tris, maxEdge, maxFaces = 400000) {
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
