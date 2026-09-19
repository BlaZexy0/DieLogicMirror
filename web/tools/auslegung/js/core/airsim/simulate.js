/* Die Luftsimulation eines Schusses, von den Werten des Dashboards bis zu
   abgetasteten Reihen — im Browser gerechnet. (Bis 2026-09 lieferte sie der
   Server: POST /api/sim/shot mit dem Python-Paket hpdcsim. Das Ergebnis hat
   dieselbe Gestalt wie jene Antwort, Schlüssel für Schlüssel; die Referenz-
   fälle in fixtures/airsim stammen aus dem Python-Paket und halten diese
   Portierung daran fest.)

   Abgetastet wird nur die Schussphase (beim Dosieren und Beruhigen steht
   der Kolben); Zeiten zählen ab Schussbeginn. Nicht-endliche Werte werden
   null: die Modelle geschlossener Form antworten Infinity, wo isotherme
   Verdichtung nichts mehr bedeutet.

   Die allerLETZTE Probe eines gedrosselten Modells ist kein Ergebnis. Die
   Kurve endet 1 µm vor dem Füllende, und an diesem Rasterpunkt entscheidet
   Rundung, ob das Ventil noch als offen gilt (Druck = Senke) oder die
   Restluft in einem Schritt tausendfach verdichtet wird (hunderte bar). Die
   Verbraucher kappen das Diagramm und lesen den Restdruck dort, wo
   `part_fill` 1 erreicht (charts/bubble.js), nicht am Ende.

   Ergebnis:
     meta      phi, fill_complete_mm, biscuit_mm, intens_mm, curve_clamped,
               critical_velocity_model, v_crit
     samples   gleich lange Reihen über die Schussphase: t [s], s_mm, v,
               gate_v [m/s], p_air_mbar, part_fill — beim Tankmodell dazu
               p_tank_mbar
     events    [{ id, t, s_mm }] nach der Zeit geordnet (`dosing_end` liegt
               vor dem Schussbeginn). Ereignisse, deren Hub die Kurve nie
               erreicht, fehlen — `fill_complete` immer: die Kurve wird 1 µm
               davor gekappt.
     critical_crossing   { s_mm, t, v } — wo der Kolben erstmals die
               kritische Geschwindigkeit der 1. Phase erreicht, solange die
               Kammer eine freie Oberfläche hat; null: nie.

   Wirft SimError (errors.js) für Eingaben, die sich nicht simulieren
   lassen. */

import { processConfigFromDesign } from './config.js';
import { interp, linspace } from './numeric.js';
import { createShotProcess } from './process.js';

export { SimError } from './errors.js';

export const MIN_COUNT = 50;
export const MAX_COUNT = 2000;
export const DEFAULT_COUNT = 400;
/* Raster der Suche nach dem kritischen Übergang */
const CROSSING_GRID = 800;

const clean = x => (Number.isFinite(x) ? x : null);

export function simulateAir(values, curve, count = DEFAULT_COUNT) {
  const asked = Number.isFinite(count) ? Math.trunc(count) : DEFAULT_COUNT;
  const n = Math.max(MIN_COUNT, Math.min(asked, MAX_COUNT));
  const { config, meta } = processConfigFromDesign(values, curve);
  const process = createShotProcess(config);

  const t0 = process.shotStartTime;
  const times = linspace(t0, process.totalTime, n);
  const samples = { t: [], s_mm: [], v: [], gate_v: [], p_air_mbar: [], part_fill: [] };
  for (const time of times) {
    const state = process.stateAtTime(time);
    samples.t.push(state.time - t0);
    samples.s_mm.push(state.stroke * 1000);
    samples.v.push(state.plungerVelocity);
    samples.gate_v.push(state.gateVelocity);
    samples.p_air_mbar.push(clean(state.airPressure / 100));
    samples.part_fill.push(state.partFill);
  }

  /* Tankmodell: der Tankdruck steigt mit jeder abgesaugten Luftmasse — als
     eigener Kanal, damit die Schusskurve zeigen kann, wie viel Gefälle der
     Absaugung bleibt. */
  const solution = process.model.type === 'tank' ? process.airSolution() : null;
  if (solution && solution.tankPressure) {
    samples.p_tank_mbar = Array.from(times, time => clean(interp(time, solution.time, solution.tankPressure) / 100));
  }

  const events = process.events().map(e => ({ id: e.name, t: clean(e.time - t0), s_mm: clean(e.stroke * 1000) }));

  const crossing = process.criticalCrossing(CROSSING_GRID);
  return {
    meta: { ...meta, critical_velocity_model: 'cfd_table', v_crit: clean(process.criticalVelocity) },
    samples,
    events,
    critical_crossing: crossing && {
      s_mm: clean(crossing.stroke * 1000),
      t: clean(crossing.time - t0),
      v: clean(crossing.plungerVelocity)
    }
  };
}
