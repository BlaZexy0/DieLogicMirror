/* Anbindung an das Simulations-Backend (hpdcsim hinter FastAPI, backend/).
   Reines Fetch — bei statischem Hosting oder file:// schlägt der Aufruf fehl
   und die Simulationskarte zeigt einen Hinweis (graceful degradation). */

export function toSimPayload(values, curve, count = 400) {
  return { values, curve, count };
}

export async function fetchSim(payload, signal) {
  const r = await fetch('/api/sim/shot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try {
      const j = await r.json();
      if (typeof j.detail === 'string') msg = j.detail;
    } catch (e) { /* Nicht-JSON-Fehlerseite */ }
    throw new Error(msg);
  }
  return r.json();
}
