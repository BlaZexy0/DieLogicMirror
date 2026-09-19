/* Kolbenbewegung, wie das Luftmodell sie abtastet: stückweise konstante
   Beschleunigung zwischen Wegpunkten, SI-Einheiten (m, s).

   Dieselbe Physik wie buildProfile() in ../physics.js, und die Segment-
   tabellen (a, t) kommen bitgleich heraus. Es ist trotzdem ein eigenes
   Modul, weil das Luftmodell eine ENTSCHEIDUNG ans letzte Bit des
   abgetasteten Hubs hängt: das Ventil ist aktiv, solange Hub < Schließweg,
   und am letzten Rasterpunkt gleicht der Hub dem Ende bis auf Rundung. Ob
   dieser Schritt die Form noch absaugt oder die letzte Luft tausendfach
   verdichtet, hängt ab von

     · den Wegpunkten in Metern, wie sie sind (buildProfile nimmt
       Millimeter und teilt durch 1000 — den gekappten Endpunkt überlebt
       das in ~2 % der Fälle nicht),
     · s₀ + v₀·dt + ½·a·(dt·dt), in dieser Klammerung,
     · numpys Segmentsuche: an einem Wegpunkt das Segment, das dort
       BEGINNT, und das letzte Segment für alles, was np.isclose zum Ende
       ist. */

import { SimError } from './errors.js';
import { isClose, searchSortedRight } from './numeric.js';

/* Wegpunkte (m, m/s) → Bewegung. Der erste Wegpunkt muss bei Hub 0 liegen;
   Wege streng steigend, und kein Segment darf an beiden Enden ruhen (es
   ließe sich nie durchfahren). */
export function plungerMotion(positions, velocities) {
  const s = [...positions];
  const v = [...velocities];
  if (s.length !== v.length || s.length < 2) throw new SimError('Schusskurve: zu wenige Punkte vor dem Füllende-Hub.');
  const a = [];
  const t = [0];
  for (let i = 1; i < s.length; i++) {
    const ds = s[i] - s[i - 1];
    if (!(ds > 0)) throw new SimError('Schusskurve: Wege müssen streng steigen.');
    if (v[i] < 0 || v[i - 1] < 0) throw new SimError('Schusskurve: Geschwindigkeiten müssen ≥ 0 sein.');
    if (v[i - 1] + v[i] <= 0) {
      throw new SimError('Schusskurve: ein Abschnitt steht an beiden Enden still — er ließe sich nie durchfahren.');
    }
    a.push((v[i] * v[i] - v[i - 1] * v[i - 1]) / (2 * ds));
    t.push(t[i - 1] + (2 * ds) / (v[i - 1] + v[i]));
  }
  const last = a.length - 1;
  const endTime = t[t.length - 1];
  const endPosition = s[s.length - 1];

  return {
    positions: s,
    velocities: v,
    accelerations: a,
    times: t,
    endTime,
    endPosition,
    sampleAtTime(time) {
      if (!(time >= 0 && time <= endTime)) throw new RangeError('Zeit außerhalb des Bewegungsprofils');
      const i = isClose(time, endTime) ? last : searchSortedRight(t, time) - 1;
      const dt = time - t[i];
      return {
        time,
        velocity: v[i] + a[i] * dt,
        position: s[i] + v[i] * dt + 0.5 * a[i] * (dt * dt),
        acceleration: a[i]
      };
    },
    sampleAtPosition(position) {
      if (!(position >= s[0] && position <= endPosition)) throw new RangeError('Hub außerhalb des Bewegungsprofils');
      const i = isClose(position, endPosition) ? last : searchSortedRight(s, position) - 1;
      const v2 = v[i] * v[i] + 2 * a[i] * (position - s[i]);
      if (v2 < -1e-12) throw new RangeError('negatives Geschwindigkeitsquadrat bei der Interpolation');
      const velocity = Math.sqrt(Math.max(0, v2));
      const dt = Math.abs(a[i]) > 1e-12 ? (velocity - v[i]) / a[i] : v[i] > 0 ? (position - s[i]) / v[i] : 0;
      return { time: t[i] + dt, velocity, position, acceleration: a[i] };
    }
  };
}
