/* Zentraler Halter für das Backend-Simulationsergebnis (hpdcsim).
   Beobachtet den Zustand, holt debounced neu und stößt danach ein
   Re-Render an — Charts (z. B. die Schusskurve) lesen `sim.data`
   synchron in ihrem calc(). Ohne erreichbares Backend bleibt
   `sim.data` null und die Charts zeichnen ohne Simulations-Serie. */

import { state, subscribe, notify } from './state.js';
import { toSimPayload, fetchSim } from './simapi.js';

export const sim = { status: 'idle', data: null, error: null };

const DEBOUNCE_MS = 400;
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
  ctrl = new AbortController();
  lastKey = key();
  sim.status = 'loading';
  try {
    sim.data = await fetchSim(toSimPayload(state.values, state.curve), ctrl.signal);
    sim.error = null;
    sim.status = 'ok';
  } catch (e) {
    if (e.name === 'AbortError') return;
    sim.data = null;
    sim.status = 'error';
    sim.error = (e instanceof TypeError) ? 'offline' : e.message;
  }
  notify();   // lastKey unverändert → schedule() löst keinen neuen Abruf aus
}

export function initSim() {
  subscribe(schedule);
  schedule();
}
