/* Beispielteile — Beschreibung und Laden.

   Die Geometrie liegt als fertige GLB in assets/parts/ und wird beim
   Anklicken geholt. Vorher wurde sie bei jedem Seitenaufruf neu
   gerechnet; das kostete bei einem Teil über hundert Millisekunden und
   zog die ganze Geometrie-Werkstatt (js/csg.js, js/solids.js,
   js/diegeom.js) in Seiten hinein, die damit nichts zu tun haben.
   Jetzt kommt ein Bauteil so an, wie eine hochgeladene Datei auch
   ankäme — und dieselbe Datei prüfen die Tests.

   Neu erzeugen nach Änderungen an js/part/demogeom.js:
     node tools/build-parts.mjs */

import { readGLB } from './glbio.js';

export const DEMO_PARTS = [
  { id: 'cover', label: 'Gehäusedeckel', file: 'assets/parts/cover.glb',
    note: 'Sauber in ±Z entformbar: Tasche, Dom, Rippen, Flansch — kein Schieber nötig.' },
  { id: 'bracket', label: 'Halter mit Schiebern', file: 'assets/parts/bracket.glb',
    note: 'Seitliche Augen mit Bohrung und ein Querfenster: Flächen, die nur ±X bzw. ±Y bilden können.' },
  { id: 'undercut', label: 'Teil mit Hinterschnitt', file: 'assets/parts/undercut.glb',
    note: 'Pilzkopf und umlaufende Nut — Flächen, die KEINE der sechs Richtungen erreicht.' },
  { id: 'cast', label: 'Gussteil der Beispielform', file: 'assets/parts/cast.glb',
    note: 'Dasselbe Gussteil, das im Formaufbau-Viewer in der Kavität steckt (mit Kernloch).' }
];

/** Beispielteil holen und in die übliche Dreieckssuppe umwandeln. */
export async function loadDemo(id) {
  const p = DEMO_PARTS.find(d => d.id === id) || DEMO_PARTS[0];
  const res = await fetch(p.file);
  if (!res.ok) {
    throw new Error(p.file + ' fehlt — neu erzeugen mit „node tools/build-parts.mjs"');
  }
  return { ...p, tris: readGLB(await res.arrayBuffer()) };
}
