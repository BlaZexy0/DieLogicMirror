/* Beispielteile — Beschreibung und Laden.

   Die Geometrie liegt als fertige GLB in assets/parts/ und wird beim
   Anklicken geholt. Vorher wurde sie bei jedem Seitenaufruf neu
   gerechnet; das kostete bei einem Teil über hundert Millisekunden und
   zog die ganze Geometrie-Werkstatt (js/csg.js, js/solids.js,
   js/diegeom.js) in Seiten hinein, die damit nichts zu tun haben.
   Jetzt kommt ein Bauteil so an, wie eine hochgeladene Datei auch
   ankäme — und dieselbe Datei prüfen die Tests. Alle Teile stammen aus
   dem Schwesterprojekt openscad_parts (`source` nennt die Quelle). */

import { readGLB } from './glbio.js';

export const DEMO_PARTS = [
  /* Die vier Druckgussteile kommen aus dem Schwesterprojekt openscad_parts
     (parametrische OpenSCAD-Quellen, dort ./render.sh --studio → build/glb/,
     von dort nach assets/parts/ kopiert); `source` nennt die Quelle. */
  { id: 'gearbox_cover', label: 'Getriebedeckel mit Schiebern', file: 'assets/parts/gearbox_cover.glb',
    source: 'openscad_parts/parts/gearbox_cover.scad',
    note: 'Sensor- und Steckerdom quer zur Entformrichtung: Flächen, die nur +X bzw. −Y bilden können: zwei Schieber. Dichtdom, Rippen, blinde Kernpilote (1300-t-Klasse).' },
  { id: 'oil_pan', label: 'Ölwanne', file: 'assets/parts/oil_pan.glb',
    source: 'openscad_parts/parts/oil_pan.scad',
    note: 'Zweistufige Wanne mit Flansch, Schwallblechen, Rippen und Ablassdom, alles in ±Z entformbar, Bohrungen als blinde Kernpilote (1400-t-Klasse). Das Gussteil der Form im Formaufbau-Viewer.' },
  { id: 'heat_sink', label: 'Kühlkörper', file: 'assets/parts/heat_sink.glb',
    source: 'openscad_parts/parts/heat_sink.scad',
    note: 'Grundplatte mit 22 gezogenen Rippen und Fußradien, kein Schieber nötig (1200-t-Klasse).' },
  { id: 'u_channel_ribbed', label: 'U-Profil mit Rippen', file: 'assets/parts/u_channel_ribbed.glb',
    source: 'openscad_parts/parts/u_channel_ribbed.scad',
    note: 'Gezogenes U-Profil, 4 mm Wand, neun Rippen und ein Dom mit Kernloch, sauber in ±Z entformbar.' },
  /* pairOnly: kein Bauteil, sondern ein Gegenstück — nur die
     Abstandsanalyse bietet es an. In der Formteilung wäre ein
     Temperierkreis als „Bauteil" nur Verwirrung. Die Kreise gehören zur
     Ölwannen-Form des Formaufbau-Viewers (openscad_parts/dies), die
     Ölwanne selbst ist ihr Gussteil. */
  { id: 'coolmov', label: 'Temperierung beweglich (Gegenstück)', file: 'assets/parts/coolmov.glb',
    source: 'openscad_parts/dies/oil_pan_die.scad', pairOnly: true,
    note: 'Beide Temperierkreise der beweglichen Hälfte der Ölwannen-Form: im Kerneinsatz, 45 mm hinter der Trennebene.' },
  { id: 'coolfix', label: 'Temperierung fest (Gegenstück)', file: 'assets/parts/coolfix.glb',
    source: 'openscad_parts/dies/oil_pan_die.scad', pairOnly: true,
    note: 'Beide Temperierkreise der festen Hälfte der Ölwannen-Form: unter dem flachen Boden und unter dem Sumpf.' }
];

/** Beispielteil holen und in die übliche Dreieckssuppe umwandeln. */
export async function loadDemo(id) {
  const p = DEMO_PARTS.find(d => d.id === id) || DEMO_PARTS[0];
  const res = await fetch(p.file);
  if (!res.ok) {
    throw new Error(p.file + ' fehlt: aus ' + p.source + ' exportieren (openscad_parts: ./render.sh --studio)');
  }
  return { ...p, tris: readGLB(await res.arrayBuffer()) };
}
