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
   mit Alt (aus der Ebene heraus) mit setPos. Zurück kommt die
   Schnittstelle von js/handles.js, wie sie ist — auch cancelDrag, mit dem
   Esc einen Zug abbricht (js/runner/tool.js, keys.Escape). */

import * as G from './graph.js';
import { createHandles, SELECTED_RING } from '../handles.js';
import { VIEW } from '../part/colors.js';

export { SELECTED_RING };
/** Farbe der nachgezogenen Gegenseite: blass, Bedienung statt Sache
    (js/part/colors.js). Eine Funktion, weil die Legende sie ebenfalls
    zeigt und beide dem Farbschema folgen. */
export const followerColor = () => VIEW.follower;

export function createEditor(opts) {
  const { view, getGraph, onSelect, onChange, onHover, getRefMesh, getGateDir, onAim } = opts;
  return createHandles({
    view, getRefMesh, onSelect, onChange, onHover, onAim,
    /* Zielt man die Mündung eines Anschnitts, wählt ein Klick auf einen
       ANDEREN Griff diesen Punkt und beendet das Zielen — sonst gewänne der
       Treffer auf dem Bauteil dahinter, und die Mündung spränge dorthin.
       (Beim Setzen von Überläufen und Stichen gilt der Klick der Stelle.) */
    aimPicksHandles: true,
    markColor: () => G.TYPES.gate.color,
    items: () => {
      const g = getGraph();
      return G.allNodes(g).map(n => {
        const follower = G.isFollower(g, n.id);
        return {
          id: n.id, pos: n.pos,
          color: follower ? followerColor() : (G.TYPES[n.type] || G.TYPES.point).color,
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
