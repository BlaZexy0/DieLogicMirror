/* Die Zeitachse des Schusses, auf der das Luftmodell läuft. SI-Einheiten.

   Ablauf: DOSIEREN (das Schmelzevolumen wächst über `dosingTime` auf den
   Ziel-Füllgrad, der Kolben ruht) → BERUHIGEN (statisches Halten) → SCHUSS
   (der Kolben folgt dem Bewegungsprofil; die Schmelze wird durch Anguss,
   Bauteil und Überlauf gedrückt) → FERTIG. Zeiten zählen ab Beginn des
   Dosierens; der Schuss beginnt bei `shotStartTime`.

   Der Luftdruck ist eine Einbahn-Überlagerung der kinematischen Zeitachse:
   Kinematik → Luftzustand → Druck. Nichts wirkt zurück; ein wegabhängiges
   Modell wird einmal gelöst und behalten.

   Konfiguration:
     sleeve    { diameter, length, fillFraction, pourHolePosition,
                 pourHoleArea? }      m — pourHolePosition ist der Hub, bei
                                      dem die Einfüllöffnung verschlossen
                                      ist; ohne Fläche entlüftet sie ideal
     casting   { runnerVolume, partVolume, overflowVolume, gateArea?, vent? }
                                      m³/m² — gefüllt wird in der Reihenfolge
                                      Anguss → Bauteil → Überlauf; vent ist
                                      eine Öffnung zur Umgebung (gas.js)
     motion    { positions, velocities }   Wegpunkte in m und m/s, ab Hub 0
     dosingTime, dwellTime            s
     vacuum?   { startPosition, endPosition? | duration?, valve, model }
                                      Schließweg ODER Offenzeit ODER keines
                                      von beiden: „bis die Schmelze das
                                      Ventil erreicht", das Füllende
     environment?                     Teilmenge von STANDARD_ENVIRONMENT */

import { vCrit } from '../physics.js';
import { SimError } from './errors.js';
import { CLOSED } from './gas.js';
import { closedFormPressure, invalidModelParameter, isVented, STANDARD_ENVIRONMENT } from './models.js';
import { plungerMotion } from './motion.js';
import { brentq, interp, linspace } from './numeric.js';
import { solveAir } from './solver.js';

export function createShotProcess(config) {
  const { sleeve, casting, dosingTime, dwellTime } = config;
  /* Invarianten dieser Schicht sind RangeErrors: config.js sichert sie für
     Dashboard-Eingaben zu — dort ist jede Ablehnung ein SimError mit einer
     Meldung für den Anwender. */
  if (!(dosingTime > 0) || !(dwellTime >= 0)) throw new RangeError('dosingTime muss > 0 und dwellTime >= 0 sein');
  if (!(sleeve.diameter > 0) || !(sleeve.length > 0)) throw new RangeError('Kammerdurchmesser und -länge müssen > 0 sein');
  if (!(sleeve.fillFraction > 0 && sleeve.fillFraction < 1)) throw new RangeError('fillFraction muss in (0, 1) liegen');
  if (!(sleeve.pourHolePosition > 0 && sleeve.pourHolePosition <= sleeve.length)) {
    throw new RangeError('pourHolePosition muss in der Kammer liegen');
  }
  if (!(casting.runnerVolume > 0) || !(casting.partVolume > 0) || !(casting.overflowVolume >= 0)) {
    throw new RangeError('Anguss- und Bauteilvolumen müssen > 0 sein, Überlaufvolumen >= 0');
  }
  const given = config.environment ?? {};
  const environment = {
    ambientPressure: given.ambientPressure ?? STANDARD_ENVIRONMENT.ambientPressure,
    ambientTemperature: given.ambientTemperature ?? STANDARD_ENVIRONMENT.ambientTemperature,
    gasConstant: given.gasConstant ?? STANDARD_ENVIRONMENT.gasConstant,
    heatCapacityRatio: given.heatCapacityRatio ?? STANDARD_ENVIRONMENT.heatCapacityRatio,
    viscosity: given.viscosity ?? STANDARD_ENVIRONMENT.viscosity
  };
  if (!(environment.ambientPressure > 0) || !(environment.ambientTemperature > 0)
    || !(environment.gasConstant > 0) || !(environment.heatCapacityRatio > 1) || !(environment.viscosity > 0)) {
    throw new RangeError('Umgebungswerte müssen physikalisch sein (Druck, Temperatur, Viskosität > 0, γ > 1)');
  }
  const gateArea = casting.gateArea ?? null;
  const pourHoleArea = sleeve.pourHoleArea ?? null;

  const area = (Math.PI * (sleeve.diameter * sleeve.diameter)) / 4;
  const meltVolume = sleeve.fillFraction * (area * sleeve.length);
  const totalVolume = casting.runnerVolume + casting.partVolume + casting.overflowVolume;

  /* Ziel-Hübe aus den Volumen */
  const sleeveFullStroke = sleeve.length * (1 - sleeve.fillFraction);
  const runnerFullStroke = sleeveFullStroke + casting.runnerVolume / area;
  const partFullStroke = runnerFullStroke + casting.partVolume / area;
  const fillCompleteStroke = partFullStroke + casting.overflowVolume / area;
  const biscuitLength = sleeve.length - fillCompleteStroke;
  if (biscuitLength <= 0) {
    throw new SimError('Kein Pressrest: Anguss, Bauteil und Überlauf fassen mehr als die dosierte Schmelze ('
      + (-biscuitLength * area * 1e6).toFixed(0) + ' cm³ fehlen).');
  }

  const motion = plungerMotion(config.motion.positions, config.motion.velocities);
  if (motion.positions[0] !== 0) throw new RangeError('das Bewegungsprofil muss bei Hub 0 beginnen');
  if (motion.endPosition > fillCompleteStroke + 1e-9) throw new RangeError('das Bewegungsprofil fährt über das Füllende hinaus');

  const shotStartTime = dosingTime + dwellTime;
  const totalTime = shotStartTime + motion.endTime;

  let valve = null;
  const model = config.vacuum ? config.vacuum.model : { type: 'sealed' };
  if (config.vacuum) {
    const vac = config.vacuum;
    const bad = invalidModelParameter(model);
    if (bad !== null) throw new RangeError('Vakuum-Modell: ' + bad + ' liegt außerhalb des Bereichs');
    if (isVented(model) && !((vac.valve.area ?? 0) > 0)) throw new RangeError('ein entlüftetes Vakuum-Modell braucht eine Ventilfläche');
    if (!(vac.startPosition >= 0)) throw new RangeError('Vakuum startPosition darf nicht negativ sein');
    const latest = Math.min(motion.endPosition, fillCompleteStroke);
    let end;
    if (vac.duration != null) {
      /* Ventil für eine feste Zeit offen: das Profil ab dem Öffnungshub
         abschreiten und dort schließen, wo der Kolben dann steht — nie
         später, als die Schmelze das Ventil erreicht. */
      if (vac.endPosition != null) throw new RangeError('entweder endPosition oder duration angeben, nicht beides');
      if (!(vac.duration > 0)) throw new RangeError('Vakuum duration muss größer als null sein');
      if (vac.startPosition >= motion.endPosition) throw new RangeError('Vakuum startPosition liegt hinter dem Kolbenweg');
      const tOpen = motion.sampleAtPosition(vac.startPosition).time;
      const tClose = Math.min(tOpen + vac.duration, motion.endTime);
      end = Math.min(motion.sampleAtTime(tClose).position, latest);
      if (end <= vac.startPosition) {
        throw new SimError('Ventil-Offenzeit zu kurz: das Ventil schlösse, bevor der Kolben sich bewegt hat.');
      }
    } else if (vac.endPosition != null) {
      if (vac.endPosition <= vac.startPosition) throw new RangeError('Vakuum endPosition muss hinter startPosition liegen');
      end = vac.endPosition;
    } else {
      end = latest;
    }
    if (end > motion.endPosition) throw new RangeError('Vakuum endPosition liegt hinter dem Kolbenweg');
    valve = { startPosition: vac.startPosition, endPosition: end, opening: vac.valve };
  }

  const criticalVelocity = vCrit(sleeve.diameter, sleeve.fillFraction);

  const airVolume = (stroke, melt) => Math.max(0, area * (sleeve.length - stroke) + totalVolume - melt);

  function kinematicsAtTime(time) {
    if (!(time >= 0)) throw new RangeError('Zeit darf nicht negativ sein');
    if (time <= dosingTime) {
      const melt = time >= dosingTime ? meltVolume : (meltVolume * time) / dosingTime;
      return { time, phase: 'dosing', stroke: 0, velocity: 0, melt };
    }
    if (time <= shotStartTime) return { time, phase: 'dwell', stroke: 0, velocity: 0, melt: meltVolume };
    /* Die Phase entscheidet t gegen totalTime (Summen derselben Terme, der
       Vergleich ist also exakt): t − shotStartTime kann endTime am
       allerletzten Abtastpunkt um ein ULP übersteigen — das kippte die
       Phase auf FERTIG und nullte die Endgeschwindigkeit. */
    const phase = time <= totalTime ? 'shot' : 'complete';
    const sample = motion.sampleAtTime(Math.min(time - shotStartTime, motion.endTime));
    return { time, phase, stroke: sample.position, velocity: phase === 'shot' ? sample.velocity : 0, melt: meltVolume };
  }

  /* Druckfreie Momentaufnahme des Luftvolumens — alles, was ein Modell vom
     Prozess zu sehen bekommt. */
  function airState(k) {
    return {
      time: k.time,
      stroke: k.stroke,
      airVolume: airVolume(k.stroke, k.melt),
      pourHoleOpen: k.stroke < sleeve.pourHolePosition,
      vacuumActive: (k.phase === 'shot' || k.phase === 'complete')
        && valve !== null && valve.startPosition <= k.stroke && k.stroke < valve.endPosition
    };
  }

  let solution = null;

  const self = {
    environment,
    shotStartTime,
    totalTime,
    pourHolePosition: sleeve.pourHolePosition,
    pourHoleArea,
    vent: casting.vent ?? CLOSED,
    valve,
    motion,
    model,
    dosingTime,
    criticalVelocity,
    sleeveFullStroke,
    runnerFullStroke,
    partFullStroke,
    fillCompleteStroke,
    biscuitLength,

    airStateAtTime: time => airState(kinematicsAtTime(time)),
    airVolumeAtStroke: stroke => airVolume(stroke, meltVolume),

    /* Die Zeitreihe des Luftmodells, einmal gelöst. */
    airSolution() {
      solution ??= solveAir(model, self);
      return solution;
    },

    stateAtTime(time) {
      const k = kinematicsAtTime(time);
      const air = airState(k);
      const airPressure = isVented(model)
        ? interp(air.time, self.airSolution().time, self.airSolution().pressure)
        : closedFormPressure(model, self, air);

      /* Schmelze jenseits der Kammer füllt Anguss, Bauteil und Überlauf in
         dieser Reihenfolge */
      const chamber = area * (sleeve.length - k.stroke);
      const sleeveMelt = k.melt <= chamber ? k.melt : chamber;
      const downstream = k.melt <= chamber ? 0 : k.melt - chamber;
      let rest = Math.max(0, downstream);
      const inRunner = Math.min(rest, casting.runnerVolume);
      rest -= inRunner;
      const inPart = Math.min(rest, casting.partVolume);
      rest -= inPart;
      const inOverflow = Math.min(rest, casting.overflowVolume);
      const meltFront = downstream <= 0 ? 'sleeve'
        : inRunner < casting.runnerVolume ? 'runner'
          : inPart < casting.partVolume ? 'part'
            : inOverflow < casting.overflowVolume ? 'overflow'
              : 'complete';

      const gateFlow = meltFront === 'part' || meltFront === 'overflow' || meltFront === 'complete' ? area * k.velocity : 0;
      const sleeveFill = Math.min(1, sleeveMelt / chamber);
      /* Das Kriterium der 1. Phase gilt am DOSIERTEN Füllgrad; ist die
         Kammer voll, gilt es nicht mehr (NaN). */
      const critical = sleeveFill < 1 ? criticalVelocity : NaN;
      return {
        time: k.time,
        phase: k.phase,
        stroke: k.stroke,
        plungerVelocity: k.velocity,
        airVolume: air.airVolume,
        airPressure,                 // Pa; Infinity, wo das Modell nichts zu sagen hat (isothermal)
        pourHoleOpen: air.pourHoleOpen,
        vacuumActive: air.vacuumActive,
        meltFront,
        runnerFill: inRunner / casting.runnerVolume,
        partFill: inPart / casting.partVolume,
        overflowFill: casting.overflowVolume > 0 ? inOverflow / casting.overflowVolume : 1,
        gateVelocity: gateArea ? gateFlow / gateArea : NaN,   // 0, bis die Front den Anguss hinter sich hat
        criticalVelocity: critical,
        velocityMargin: critical - k.velocity                 // negativ = überkritisch
      };
    },

    stateAtStroke: stroke => self.stateAtTime(shotStartTime + motion.sampleAtPosition(stroke).time),

    /* Nach der Zeit geordnet; Ereignisse, deren Hub das Profil nie
       erreicht, fehlen. */
    events() {
      const travel = motion.endPosition;
      const table = [
        { name: 'dosing_end', time: dosingTime, stroke: 0 },
        { name: 'shot_start', time: shotStartTime, stroke: 0 }
      ];
      const marks = [['pour_hole_sealed', sleeve.pourHolePosition]];
      if (valve !== null) marks.push(['vacuum_start', valve.startPosition], ['vacuum_end', valve.endPosition]);
      marks.push(
        ['sleeve_full', sleeveFullStroke],
        ['runner_full', runnerFullStroke],
        ['part_full', partFullStroke],
        ['fill_complete', fillCompleteStroke]
      );
      for (const [name, stroke] of marks) {
        if (stroke <= travel + 1e-12) {
          const at = Math.min(stroke, travel);
          table.push({ name, time: shotStartTime + motion.sampleAtPosition(at).time, stroke: at });
        }
      }
      table.push({ name: 'shot_end', time: totalTime, stroke: travel });
      return table.sort((a, b) => a.time - b.time);   // stabil: gleichzeitige Ereignisse behalten diese Reihenfolge
    },

    /* Erster Hub, bei dem die Kolbengeschwindigkeit die kritische des
       dosierten Füllzustands erreicht — gesucht nur, solange die Kammer
       eine freie Oberfläche hat. Null: nie. */
    criticalCrossing(count = 2000) {
      const end = Math.min(motion.endPosition, sleeveFullStroke);
      const margin = stroke => self.stateAtStroke(stroke).velocityMargin;
      const grid = linspace(0, end, count);
      const values = Array.from(grid, margin);
      if (values[0] <= 0) return self.stateAtStroke(0);
      for (let i = 0; i + 1 < values.length; i++) {
        if (values[i] > 0 && values[i + 1] <= 0) return self.stateAtStroke(brentq(margin, grid[i], grid[i + 1]));
      }
      return null;
    }
  };
  return self;
}
