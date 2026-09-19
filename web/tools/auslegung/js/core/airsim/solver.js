/* Integration der Luftmasse in der Form mit festem Schritt, für die
   entlüfteten Modelle (`conductance`, `tank`).

     · Einfüllöffnung offen: ideale Entlüftung (p = Umgebung) — es sei denn,
       der Prozess nennt eine FLÄCHE der Einfüllöffnung; dann entlüftet sie
       als Blende wie alles andere und lässt vorübergehenden Überdruck zu,
       während der Kolben auf sie zufährt.
     · Entlüftungen geben Luft an die Umgebung ab, sobald der Druck innen
       höher ist (nur Ausströmen, kein Rückstrom in die Form).
     · das Vakuumventil saugt zur Senke des Modells, solange es aktiv ist.

   Die Luftmasse m entwickelt sich mit der Summe der Ströme; p = m·R·T/V.
   Ein Schritt nutzt die exakte Exponentialfunktion des linearisierten
   Verlusts — Massenströme skalieren mit dem Druck und damit mit der Masse
   —, das hält die Integration stabil, wenn das Luftvolumen am Füllende
   zusammenfällt.

   Die Schrittzahl ist Teil der Numerik (die Ergebnisse sind bei 4000
   Schritten gegen die Python-Referenz festgehalten): nicht für Tempo
   absenken. */

import { openingFlow, orificeMassFlow } from './gas.js';
import { closedFormPressure, DEFAULT_DISCHARGE_COEFFICIENT, isVented, sinkOf } from './models.js';
import { linspace } from './numeric.js';

export const VENTED_STEPS = 4000;
export const CLOSED_FORM_SAMPLES = 2000;

/* Integrationsraster über den ganzen Prozess, auf den Schuss verdichtet:
   davor steht der Kolben und die Einfüllöffnung entlüftet, ein grober
   Vorlauf (ein Zehntel der Punkte) genügt — der feine Rest deckt den
   Schuss, in dem das Luftvolumen tatsächlich zusammenfällt. Genau `count`
   Punkte. */
export function solverTimes(process, count) {
  const t0 = process.shotStartTime;
  const t1 = process.totalTime;
  const n = Math.max(2, Math.trunc(count));
  if (t0 <= 0 || t1 <= t0) return linspace(0, t1, n);
  const pre = Math.min(Math.max(1, Math.floor(n / 10)), n - 2);
  const before = linspace(0, t0, pre + 1);
  const shot = linspace(t0, t1, n - pre);
  const out = new Float64Array(n);
  out.set(before.subarray(0, pre), 0);
  out.set(shot, pre);
  return out;
}

export function solveVented(model, process, count = VENTED_STEPS) {
  const env = process.environment;
  const cd = model.dischargeCoefficient ?? DEFAULT_DISCHARGE_COEFFICIENT;
  const sink = sinkOf(model);
  const valve = process.valve;
  const gasRt = env.gasConstant * env.ambientTemperature;
  const ambient = env.ambientPressure;
  const times = solverTimes(process, count);
  const pressures = new Float64Array(times.length);
  const sinkPressures = new Float64Array(times.length);

  let pSink = sink.startPressure;
  let mass = null;
  let ventFriction = 0;
  let valveFriction = 0;

  for (let i = 0; i < times.length; i++) {
    const dt = i > 0 ? times[i] - times[i - 1] : 0;
    const air = process.airStateAtTime(times[i]);
    const volume = air.airVolume;
    let valveMass = 0;

    if (volume <= 0) {
      pressures[i] = Infinity;
    } else if (air.pourHoleOpen && process.pourHoleArea === null) {
      mass = (ambient * volume) / gasRt;
      pressures[i] = ambient;
    } else {
      if (mass === null) mass = (ambient * volume) / gasRt;
      const pressure = (mass * gasRt) / volume;
      if (i > 0 && mass > 0) {
        const vent = openingFlow(process.vent, cd, pressure, ambient, env, ventFriction);
        ventFriction = vent.frictionFactor;
        let outflow = vent.massFlow;
        if (air.pourHoleOpen) {
          outflow += orificeMassFlow(cd, process.pourHoleArea, pressure, ambient,
            env.ambientTemperature, env.gasConstant, env.heatCapacityRatio);
        }
        let valveFlow = 0;
        if (air.vacuumActive && valve !== null) {
          const through = openingFlow(valve.opening, cd, pressure, pSink, env, valveFriction);
          valveFriction = through.frictionFactor;
          valveFlow = through.massFlow;
          outflow += valveFlow;
        }
        if (outflow > 0) {
          const before = mass;
          mass *= Math.exp((-outflow / mass) * dt);
          /* Jede Öffnung endet bei ihrem Gegendruck; ein Schritt darf die
             Luft nicht unter die tiefste aktive Senke tragen — die Senke
             des Ventils, solange es offen ist, sonst die Umgebung. Die
             Exponentialfunktion mit eingefrorener Rate drückte die Masse
             sonst gegen null, wenn das Luftvolumen am Füllende
             zusammenfällt. */
          const floor = air.vacuumActive ? pSink : ambient;
          if (pressure > floor) mass = Math.max(mass, (floor * volume) / gasRt);
          /* Was durchs Ventil ging, kommt in der Senke an — die
             tatsächliche Massendifferenz, nach Stromanteil geteilt: die
             Senke gewinnt genau, was die Form verlor. */
          valveMass = ((before - mass) * valveFlow) / outflow;
        }
      }
      pressures[i] = (mass * gasRt) / volume;
    }

    if (i > 0) pSink = sink.step(pSink, valveMass, dt, gasRt);
    sinkPressures[i] = pSink;
  }

  return sink.publishes
    ? { time: times, pressure: pressures, tankPressure: sinkPressures }
    : { time: times, pressure: pressures };
}

/* Druckverlauf eines beliebigen Modells über den ganzen Prozess. Modelle
   geschlossener Form werden gleichmäßig abgetastet. */
export function solveAir(model, process, count) {
  if (isVented(model)) return solveVented(model, process, count);
  const time = linspace(0, process.totalTime, count ?? CLOSED_FORM_SAMPLES);
  const pressure = new Float64Array(time.length);
  for (let i = 0; i < time.length; i++) {
    pressure[i] = closedFormPressure(model, process, process.airStateAtTime(time[i]));
  }
  return { time, pressure };
}
