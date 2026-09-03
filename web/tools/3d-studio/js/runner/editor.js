/* Die Griffe des Angussdesigners: was js/handles.js zeigt und bewegt,
   übersetzt in den Angussgraphen.

   Das Modul weiß, was ein Knoten ist — Art und Farbe, Arbeitsebene
   (js/runner/graph.js, planeNormal), ob er die nachgezogene Gegenseite
   einer Spiegelung ist (dann blass und nicht anfassbar), und dass ein
   Anschnitt einen Pfeil in seiner Mündungsrichtung trägt. Wie Griffe
   gezeichnet, gezogen und gezielt werden, weiß es nicht — das ist für
   den Überlaufdesigner dasselbe und steht deshalb einmal in
   js/handles.js.

   Das Ziehen: der Pressrest eingeschlossen — er ist ein Punkt wie die
   anderen, nur nimmt er beim Verschieben das ganze System mit
   (js/runner/graph.js, setPos). In der Arbeitsebene mit moveInPlane,
   mit Alt (aus der Ebene heraus) mit setPos. */

import * as G from './graph.js';
import { createHandles, SELECTED_RING } from '../handles.js';

export { SELECTED_RING };
/* Sonderfarbe der nachgezogenen Gegenseite. Sie steht hier, weil die
   Legende im Viewport sie ebenfalls zeigt — zwei Literale liefen auseinander. */
export const FOLLOWER_COLOR = '#b8c9cf';

export function createEditor(opts) {
  const { view, getGraph, onSelect, onChange, onHover, getRefMesh, getGateDir, onAim } = opts;
  return createHandles({
    view, getRefMesh, onSelect, onChange, onHover, onAim,
    markColor: G.TYPES.gate.color,
    items: () => {
      const g = getGraph();
      return G.allNodes(g).map(n => {
        const follower = G.isFollower(g, n.id);
        return {
          id: n.id, pos: n.pos,
          color: follower ? FOLLOWER_COLOR : (G.TYPES[n.type] || G.TYPES.point).color,
          ghost: follower,
          /* Der Pfeil zeigt die WIRKLICHE Mündungsrichtung — die letzte
             Tangente der abgetasteten Kante, ob gebunden oder aus der
             Sehne; ohne Netz die Sehne. */
          dir: n.type === 'gate' && !follower ? ((getGateDir && getGateDir(n.id)) || G.chordDir(g, n)) : null,
          /* So groß wie der Kanal an dieser Stelle, nicht wie der Pressrest. */
          planeSize: Math.max(24, n.w * 3)
        };
      });
    },
    plane: id => {
      const g = getGraph();
      const n = g.nodes[id];
      return n ? { origin: n.pos, normal: G.planeNormal(g, n) } : null;
    },
    move: (id, pos, alt) => {
      const g = getGraph();
      if (alt) G.setPos(g, id, pos);
      else G.moveInPlane(g, id, pos);
    }
  });
}
