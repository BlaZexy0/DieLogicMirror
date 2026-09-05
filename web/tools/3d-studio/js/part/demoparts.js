/* Beispielteile — Beschreibung und Laden.

   Die Geometrie liegt als fertige GLB in assets/parts/ und wird beim
   Anklicken geholt. Vorher wurde sie bei jedem Seitenaufruf neu
   gerechnet; das kostete bei einem Teil über hundert Millisekunden und
   zog die ganze Geometrie-Werkstatt (js/csg.js, js/solids.js,
   js/diegeom.js) in Seiten hinein, die damit nichts zu tun haben.
   Jetzt kommt ein Bauteil so an, wie eine hochgeladene Datei auch
   ankäme — und dieselbe Datei prüfen die Tests.

   Neu erzeugen nach Änderungen an js/part/demogeom.js:
     node scripts/3d-studio/build-parts.mjs
   Die Teile mit `source` stammen aus openscad_parts (siehe unten). */

import { readGLB } from './glbio.js';

export const DEMO_PARTS = [
  /* Die vier Druckgussteile kommen aus dem Schwesterprojekt openscad_parts
     (parametrische OpenSCAD-Quellen, dort ./render.sh → build/glb/). Sie
     werden NICHT von scripts/3d-studio/build-parts.mjs erzeugt — `source`
     nennt die Quelle, die Datei wird von Hand hierher kopiert. */
  { id: 'gearbox_cover', label: 'Getriebedeckel mit Schiebern', file: 'assets/parts/gearbox_cover.glb',
    source: 'openscad_parts/parts/gearbox_cover.scad',
    note: 'Sensor- und Steckerdom quer zur Entformrichtung: Flächen, die nur +X bzw. −Y bilden können — zwei Schieber. Dichtdom, Rippen, blinde Kernpilote (1300-t-Klasse).' },
  { id: 'oil_pan', label: 'Ölwanne', file: 'assets/parts/oil_pan.glb',
    source: 'openscad_parts/parts/oil_pan.scad',
    note: 'Zweistufige Wanne mit Flansch, Schwallblechen, Rippen und Ablassdom — alles in ±Z entformbar, Bohrungen als blinde Kernpilote (1400-t-Klasse).' },
  { id: 'heat_sink', label: 'Kühlkörper', file: 'assets/parts/heat_sink.glb',
    source: 'openscad_parts/parts/heat_sink.scad',
    note: 'Grundplatte mit 22 gezogenen Rippen und Fußradien — kein Schieber nötig (1200-t-Klasse).' },
  { id: 'u_channel_ribbed', label: 'U-Profil mit Rippen', file: 'assets/parts/u_channel_ribbed.glb',
    source: 'openscad_parts/parts/u_channel_ribbed.scad',
    note: 'Gezogenes U-Profil, 4 mm Wand, neun Rippen und ein Dom mit Kernloch — sauber in ±Z entformbar.' },
  { id: 'cast', label: 'Gussteil der Beispielform', file: 'assets/parts/cast.glb',
    note: 'Dasselbe Gussteil, das im Formaufbau-Viewer in der Kavität steckt (mit Kernloch).' },
  /* pairOnly: kein Bauteil, sondern ein Gegenstück — nur die
     Abstandsanalyse bietet es an. In der Formteilung wäre ein
     Temperierkreis als „Bauteil" nur Verwirrung. */
  { id: 'coolmov', label: 'Temperierung beweglich (Gegenstück)', file: 'assets/parts/coolmov.glb',
    pairOnly: true, note: 'Beide Temperierkreise der beweglichen Hälfte aus der Beispielform.' },
  { id: 'coolfix', label: 'Temperierung fest (Gegenstück)', file: 'assets/parts/coolfix.glb',
    pairOnly: true, note: 'Beide Temperierkreise der festen Hälfte aus der Beispielform.' }
];

/** Beispielteil holen und in die übliche Dreieckssuppe umwandeln. */
export async function loadDemo(id) {
  const p = DEMO_PARTS.find(d => d.id === id) || DEMO_PARTS[0];
  const res = await fetch(p.file);
  if (!res.ok) {
    throw new Error(p.file + ' fehlt — neu erzeugen mit „node scripts/3d-studio/build-parts.mjs"'
      + (p.source ? ' bzw. aus ' + p.source + ' exportieren' : ''));
  }
  return { ...p, tris: readGLB(await res.arrayBuffer()) };
}
