/* Three.js-Adapter für js/diegeom.js: aus den Dreieckssuppen der
   Geometrie werden benannte Gruppen mit Materialien — die QUELLE des
   GLB-Modells (assets/die.glb).

   Der Viewer selbst benutzt dieses Modul NICHT; er lädt nur die GLB.
   Gebraucht wird es von tools/export.html (Browser) und
   tools/build-glb.mjs (Node). Nach Änderungen an diegeom.js/config.js
   die GLB neu erzeugen (README).

   Material-NAMEN sind das Vertragsstück mit dem Viewer: sie überleben den
   GLB-Roundtrip und steuern dort Transparenz ('steel') und die Farbe der
   Schnitt-Deckflächen (eine Klasse je Name). */

import * as T from 'three';
import { COMPONENTS, BY_ID } from './registry.js';
import { buildParts } from './diegeom.js';
import { smoothNormals, indexTriangles, cleanMesh } from './mesh.js';

const col = id => parseInt(BY_ID[id].color.slice(1), 16);

/* Eine Materialinstanz je (Name, Farbe) — die Sidebar-Farbe der Baugruppe
   für alles Gegossene, ein gemeinsames Grau für Stahl. */
function materialFor(name, compId) {
  const spec = {
    steel:    { color: col(compId), roughness: 0.55, metalness: 0.35 },
    plunger:  { color: 0xb8722d,    roughness: 0.5,  metalness: 0.5 },
    pins:     { color: 0x4a565c,    roughness: 0.5,  metalness: 0.5 },
    coolFix:  { color: col(compId), roughness: 0.35, metalness: 0.3 },
    coolMov:  { color: col(compId), roughness: 0.35, metalness: 0.3 }
  }[name] || { color: col(compId), roughness: 0.55, metalness: 0.25 };
  const m = new T.MeshStandardMaterial(spec);
  m.name = name;
  return m;
}

/** Dreieckssuppe → indizierte BufferGeometry mit weichen Normalen
    über den Knickwinkel (crease: darüber bleibt die Kante hart). */
function toGeometry(raw, crease = 32) {
  /* Die CSG hinterlässt T-Stöße (ein Punkt mitten auf einer fremden
     Kante). Sichtbar werden sie als haarfeine Risse — vor allem bei den
     Stencil-Schnittflächen, wo ein Riss die Zählung kippen kann. */
  const tris = cleanMesh(raw).tris;
  const { position, normal, index } = indexTriangles(tris, smoothNormals(tris, crease));
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(position, 3));
  g.setAttribute('normal', new T.BufferAttribute(normal, 3));
  g.setIndex(new T.BufferAttribute(
    position.length / 3 > 65535 ? index : Uint16Array.from(index), 1));
  return g;
}

/* ── Aufbau für den GLB-Export ───────────────────────────────────
   die
   ├─ fixedRoot    (bleibt stehen)
   └─ movingRoot   (fährt beim „Form öffnen" nach +z; enthält 'mov' + 'cast')
   Baugruppen-Gruppen heißen wie ihre Registry-id; compId steht zusätzlich
   in userData und überlebt als glTF-extras den Roundtrip. */
export function buildDie(log) {
  const parts = buildParts(log);
  const root = new T.Group();
  root.name = 'die';
  const fixedRoot = new T.Group(); fixedRoot.name = 'fixedRoot';
  const movingRoot = new T.Group(); movingRoot.name = 'movingRoot';
  root.add(fixedRoot, movingRoot);

  for (const c of COMPONENTS) {
    const g = new T.Group();
    g.name = c.id;
    g.userData.compId = c.id;
    for (const piece of parts[c.id] || []) {
      const mesh = new T.Mesh(toGeometry(piece.tris), materialFor(piece.mat, c.id));
      mesh.name = c.id + '_' + piece.mat;
      mesh.userData.compId = c.id;
      g.add(mesh);
    }
    (c.side === 'fix' ? fixedRoot : movingRoot).add(g);
  }
  return root;
}
