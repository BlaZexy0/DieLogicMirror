/* Anbindung an das Simulations-Backend (hpdcsim hinter FastAPI, backend/).
   Reines Fetch — bei statischem Hosting oder file:// schlägt der Aufruf fehl
   und die Simulationskarte zeigt einen Hinweis (graceful degradation). */

export function toSimPayload(values, curve, count = 400) {
  /* Nur numerische Werte — String-Felder (Selects) sind kein Teil des
     values-Schemas der API. */
  const nums = {};
  for (const k in values) if (typeof values[k] === 'number') nums[k] = values[k];
  const payload = { values: nums, curve, count };
  /* Vakuum in Browser-Einheiten; die SI-Übersetzung macht das Backend. */
  if (values.vacModel && values.vacModel !== 'aus') {
    payload.vacuum = {
      model: values.vacModel,
      pump_mbar: values.vacPump,
      /* Die Entlüftungsfläche drosselt — ein separater Ventilquerschnitt
         entfällt, das Backend-Feld heißt weiterhin valve_mm2. Spalt und
         Kanallänge machen aus der Blende einen Kanal mit Wandreibung. */
      valve_mm2: values.vent,
      gap_mm: values.ventGap,
      channel_mm: values.ventLen,
      start_mm: values.vacStart,
      /* Ventilschluss: fill · stroke (end_mm) · time (duration_ms) */
      end: values.vacEnd || 'fill',
      end_mm: values.vacEndStroke,
      duration_ms: values.vacEndTime,
      tank_l: values.vacTank
    };
  }
  return payload;
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
