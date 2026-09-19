/* Zentraler Halter für das Ergebnis der Luftsimulation (core/airsim/).
   Charts (z. B. die Schusskurve) lesen `sim.data` synchron in ihrem calc().

   Die Simulation läuft im Browser und kostet wenige Millisekunden — sie
   wird deshalb bei jeder Zustandsänderung sofort und synchron gerechnet:
   kein Entprellen, kein Ladezustand, und `sim.data` gehört immer zur
   aktuellen Eingabe. Lässt sich die Eingabe nicht simulieren, ist
   `sim.data` null und `sim.error` die Meldung für den Anwender.

   Reihenfolge: initSim() abonniert den Zustand und muss VOR dem render()
   der Seite abonnieren (main.js, single.js, Werkbank) — notify() ruft die
   Abonnenten der Reihe nach, und die Diagramme sollen das frische Ergebnis
   sehen. */

import { state, subscribe } from './state.js';
import { simulateAir, SimError } from './airsim/simulate.js';

export const sim = { status: 'idle', data: null, error: null };

let lastKey = null;

function key() {
  return JSON.stringify([state.values, state.curve]);
}

export function refreshSim() {
  const k = key();
  if (k === lastKey) return;   // Ergebnis passt schon (notify() ohne Änderung an Werten oder Kurve)
  lastKey = k;
  try {
    sim.data = simulateAir(state.values, state.curve);
    sim.error = null;
    sim.status = 'ok';
  } catch (e) {
    sim.data = null;
    sim.status = 'error';
    if (e instanceof SimError) sim.error = e.message;
    else {
      /* Programmfehler in der Simulation: das Dashboard rechnet ohne die
         Luftdruck-Serie weiter, statt mit dem Rendern aufzuhören. */
      sim.error = 'interner Fehler (' + e.message + ')';
      console.error(e);
    }
  }
}

export function initSim() {
  subscribe(refreshSim);
  refreshSim();
}
