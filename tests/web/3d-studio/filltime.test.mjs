/* Die Uhr der Füllung (js/werkbank/filltime.js) und die Frontausbreitung
   mit Vorsprung (Option offsets von js/fill/solve.js) — ohne Browser.

     node --import ./tests/web/3d-studio/stubs/register.mjs \
          --test tests/web/3d-studio/filltime.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../../web/tools/3d-studio/js/solids.js';
import { buildModel } from '../../../web/tools/3d-studio/js/part/model.js';
import { buildField } from '../../../web/tools/3d-studio/js/part/field.js';
import * as M from '../../../web/tools/3d-studio/js/fill/model.js';
import { solveFill } from '../../../web/tools/3d-studio/js/fill/solve.js';
import { fillClock, openingFractions, unitsForFraction } from '../../../web/tools/3d-studio/js/werkbank/filltime.js';

/* Eine Kurve mit konstanter Kolbengeschwindigkeit: Zustrom = A·v·offene Anteile. */
const flat = (A, v, endTime) => ({ A, tFull: 0.5, shot: { profile: { endTime, atTime: t => ({ t, v }) } } });

test('fillClock: Zustrom nur der offenen Anschnitte, Volumen und Zeit sind Umkehrungen voneinander', () => {
  const tl = flat(0.01, 2, 3);                                     // Q = 0,02 m³/s bei allen offen
  const clock = fillClock(tl, [
    { id: 'k5', tArrive: 1.0, share: 0.5 },
    { id: 'k7', tArrive: 1.1, share: 0.5 },
    { id: 'k9', tArrive: NaN, share: 0 }
  ]);
  assert.equal(clock.tFirst, 1.0);
  assert.equal(clock.gates.length, 3);
  assert.equal(clock.gates[2].open, false, 'ohne Ankunft bleibt der Anschnitt zu');
  /* 1,0 → 1,1 s: nur k5 offen, halber Strom → 0,001 m³; danach voller Strom. */
  assert.ok(Math.abs(clock.volumeAtTime(1.1) - 0.001) < 1e-6, 'halber Strom bis k7 öffnet: ' + clock.volumeAtTime(1.1));
  assert.ok(Math.abs(clock.volumeAtTime(1.2) - 0.003) < 1e-6, 'danach voller Strom: ' + clock.volumeAtTime(1.2));
  assert.ok(Math.abs(clock.timeAtVolume(0.003) - 1.2) < 1e-4, 'Umkehrung');
  assert.equal(clock.timeAtVolume(0), 1.0);
  assert.equal(clock.volumeAtTime(0.5), 0, 'vor dem ersten Anschnitt kommt nichts an');
  assert.equal(clock.timeAtVolume(clock.maxVolume * 1.01), null, 'jenseits des Kurvenendes keine Zeit');
  /* Der Vorsprung: als k7 öffnet, hat k5 ein Tausendstel Kubikmeter geschafft. */
  const q = openingFractions(clock, 0.004);
  assert.equal(q.k5, 0);
  assert.ok(Math.abs(q.k7 - 0.25) < 1e-4, 'k7 öffnet bei 25 %: ' + q.k7);
  assert.equal(q.k9, 1, 'ein zuer Anschnitt startet nie');
  /* Nur ein offener Anschnitt trägt den ganzen Strom, auch mit Anteil 0,5. */
  const solo = fillClock(tl, [{ id: 'a', tArrive: 1, share: 0.5 }, { id: 'b', tArrive: NaN, share: 0.5 }]);
  assert.ok(Math.abs(solo.volumeAtTime(1.1) - 0.002) < 1e-6, 'auf die offenen normiert');
  assert.equal(fillClock(tl, [{ id: 'a', tArrive: NaN, share: 1 }]), null, 'ohne offenen Anschnitt keine Uhr');
});

test('unitsForFraction: der Füllgrad einer Ankunftsliste als Einheit', () => {
  const units = unitsForFraction(Float32Array.from([5, Infinity, 1, 3, Infinity, 2, 4]));
  assert.equal(units(0), 1);
  assert.equal(units(1), 5);
  assert.equal(units(0.5), 3);
});

test('solveFill mit offsets: ohne Vorsprung wie ohne die Option; mit Vorsprung füllt der spätere Anschnitt weniger', async () => {
  const m = buildModel(S.box(160, 40, 12));
  const f = await buildField(m, { res: 64, band: 6 });
  const plan = M.emptyPlan();
  const a = M.addInlet(plan, [-80, 0, 0], [-1, 0, 0], { w: 30, h: 8 });
  const b = M.addInlet(plan, [80, 0, 0], [1, 0, 0], { w: 30, h: 8 });
  const ref = await solveFill(f, plan, { alpha: 0 });
  const same = await solveFill(f, plan, { alpha: 0, offsets: {} });
  assert.equal(same.cells, ref.cells);
  assert.deepEqual(same.stats.inlets.map(i => i.cells), ref.stats.inlets.map(i => i.cells), 'ohne Vorsprung dieselbe Naht');
  assert.deepEqual(same.stats.offsets, {});
  let diff = 0;
  for (let i = 0; i < ref.frac.length; i++) if (!(Number.isNaN(ref.frac[i]) && Number.isNaN(same.frac[i])) && ref.frac[i] !== same.frac[i]) diff++;
  assert.equal(diff, 0, 'derselbe Füllgrad je Zelle');
  /* b startet, wenn a schon 40 % geschafft hat. */
  const units = unitsForFraction(ref.arrival);
  const off = await solveFill(f, plan, { alpha: 0, offsets: { [b.id]: units(0.4) } });
  const cellsA = off.stats.inlets.find(i => i.id === a.id).cells;
  const cellsB = off.stats.inlets.find(i => i.id === b.id).cells;
  const refA = ref.stats.inlets.find(i => i.id === a.id).cells;
  assert.ok(cellsA > refA, 'a kommt weiter: ' + cellsA + ' > ' + refA);
  /* 40 % Vorsprung heißt: a hatte 20 % des Kastens (32 mm) allein — die
     Naht rückt von der Mitte um die Hälfte davon zu b, etwa 60 : 40. */
  assert.ok(cellsA > 1.3 * cellsB && cellsA < 1.8 * cellsB, 'die Naht liegt auf der Seite von b: ' + cellsA + ' zu ' + cellsB);
  assert.equal(off.stats.inlets.find(i => i.id === b.id).offset, units(0.4));
  assert.ok(off.stats.offsets[b.id] > 0);
  /* Die Startzellen von b tragen den Vorsprung als Ankunft. */
  let minB = Infinity;
  for (let i = 0; i < off.arrival.length; i++) if (off.source[i] === 1 && off.arrival[i] < minB) minB = off.arrival[i];
  assert.ok(Math.abs(minB - units(0.4)) < 1e-6, 'Ankunft der ersten b-Zelle = Vorsprung: ' + minB);
});
