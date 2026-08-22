/* Zentraler Halter für das Backend-Simulationsergebnis (hpdcsim).
   Beobachtet den Zustand, holt debounced neu und stößt danach ein
   Re-Render an — Charts (z. B. die Schusskurve) lesen `sim.data`
   synchron in ihrem calc(). Ohne erreichbares Backend bleibt
   `sim.data` null und die Charts zeichnen ohne Simulations-Serie. */

import { state, subscribe, notify } from './state.js';
import { toSimPayload, fetchSim } from './simapi.js';

export const sim = { status: 'idle', data: null, error: null };

const DEBOUNCE_MS = 400;
const TIMEOUT_MS = 15000;
let timer = null, ctrl = null, lastKey = '';

function key() {
  return JSON.stringify([state.values, state.curve]);
}

function schedule() {
  if (key() === lastKey) return;   // Ergebnis bzw. laufender Abruf passt schon
  clearTimeout(timer);
  timer = setTimeout(run, DEBOUNCE_MS);
}

async function run() {
  if (ctrl) ctrl.abort();
  const mine = ctrl = new AbortController();
  /* Hängendes Backend: nach TIMEOUT_MS abbrechen — sonst bliebe der
     Status für immer 'loading'. */
  const kill = setTimeout(() => mine.abort(), TIMEOUT_MS);
  lastKey = key();
  sim.status = 'loading';
  try {
    sim.data = await fetchSim(toSimPayload(state.values, state.curve), mine.signal);
    sim.error = null;
    sim.status = 'ok';
  } catch (e) {
    if (mine !== ctrl) return;    // von einem neueren Abruf abgelöst
    sim.data = null;
    sim.status = 'error';
    sim.error = e.name === 'AbortError' ? 'Zeitüberschreitung (' + TIMEOUT_MS / 1000 + ' s)'
      : (e instanceof TypeError) ? 'offline' : e.message;
  } finally {
    clearTimeout(kill);
  }
  notify();   // lastKey unverändert → schedule() löst keinen neuen Abruf aus
}

export function initSim() {
  subscribe(schedule);
  schedule();
}
