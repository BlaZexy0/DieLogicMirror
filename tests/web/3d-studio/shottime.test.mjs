/* Ankunft nach der Schusskurve (js/runner/shottime.js) — reine Rechnung.

   Die Umrechnung ist eine Substitution: Ankunftszeit bei konstantem
   Strom mal Strom ist das Volumen, das den Pressrest passiert hat; auf
   der Kurve ist das ein Kolbenweg hinter „Kammer voll", und das Profil
   kennt die Zeit dazu. Geprüft wird die Substitution gegen eine Kurve
   mit bekannter Antwort, und die DieLogic-Kurve für die Vorgabewerte des
   Dashboards mit den Massen des Getriebedeckels. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web');

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
for (const f of ['shared/palette.js', 'shared/theme.js', 'shared/examples/machines.js',
  'shared/examples/alloys.js', 'shared/examples/parts.js', 'shared/project.js', 'shared/clampmodel.js']) require(path.join(site, f));

const { allFields } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/config/fields.js')));
const { pistonArea, rhoSolidus } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/core/physics.js')));
const { shotTimeline, shotArrivals, flowOnCurve } = await import(pathToFileURL(path.join(site, 'tools/3d-studio/js/runner/shottime.js')));

const defaults = () => { const v = {}; for (const f of allFields()) v[f.key] = f.def; return v; };
/* Der Getriebedeckel mit einem Anguss der Werkbank, in mm³. */
const VOL = { part: 1.263e6, runner: 3.8e5, overflow: 8e4, biscuit: 2.2e5 };

test('shotTimeline: die DieLogic-Kurve für das Modell — Massen aus den Volumen, Kammer voll vor dem Anguss', () => {
  const v = defaults();
  const tl = shotTimeline(v, VOL);
  assert.ok(!tl.error, tl.error);
  const rho = rhoSolidus(v);
  assert.ok(Math.abs(tl.v.part - VOL.part * 1e-9 * rho) < 1e-9, 'Bauteilmasse aus Volumen × ρ_sol');
  assert.ok(Math.abs(tl.v.runner - VOL.runner * 1e-9 * rho) < 1e-9);
  assert.ok(tl.tFull > 0.1, 'Kammer voll nach der langsamen ersten Phase: ' + tl.tFull);
  assert.equal(tl.timeForVolume(0), 0, 'bei Kammer voll ist noch nichts durch den Pressrest');
  /* Das Angussvolumen kommt genau beim Ereignis „Anguss gefüllt" durch. */
  const tRunner = tl.timeForVolume(VOL.runner * 1e-9);
  assert.ok(Math.abs(tRunner - (tl.shot.events[1].t - tl.tFull)) < 1e-6, 'Anguss gefüllt: ' + tRunner);
  /* Monoton, und ein Volumen jenseits des Kurvenhubs hat keine Zeit. */
  let last = 0;
  for (const V of [1e-5, 1e-4, 3e-4, 1e-3]) {
    const t = tl.timeForVolume(V);
    assert.ok(t > last, 'monoton: ' + V);
    last = t;
  }
  const A = pistonArea(tl.v) * 1e-6;
  const beyond = (tl.shot.profile.travel - tl.shot.sFill) * A * 1.01;
  assert.equal(tl.timeForVolume(beyond), null, 'jenseits des Kurvenhubs');
});

test('shotTimeline: die Füllkammer des Modells ersetzt die des Projekts — Kolben-Ø, Länge und damit der Füllgrad', () => {
  const v = defaults();
  const own = shotTimeline(v, VOL, { diam: 90, length: 450 });
  assert.ok(!own.error, own.error);
  assert.equal(own.v.diam, 90);
  assert.equal(own.v.length, 450);
  /* Füllgrad: flüssig dosiertes Volumen durch Kammervolumen — die Massen
     kommen aus den festen Volumen mit ρ_sol, in der Kammer stehen sie
     flüssig mit ρ. */
  const Vdose = (VOL.part + VOL.runner + VOL.overflow + VOL.biscuit) * 1e-9 * rhoSolidus(own.v) / own.v.density;
  const A = Math.PI / 4 * 0.09 * 0.09;
  assert.ok(Math.abs(own.phi - Vdose / (A * 0.45)) < 1e-9, 'Füllgrad ' + own.phi);
  assert.ok(Math.abs(own.A - A) < 1e-12, 'die Kolbenfläche ist die des Pressrests');
  /* Ohne Angabe bleibt die Kammer der Auslegung. */
  const proj = shotTimeline(v, VOL);
  assert.equal(proj.v.diam, v.diam);
  assert.equal(proj.v.length, v.length);
  assert.ok(Math.abs(proj.phi - proj.shot.phi) < 1e-12);
  /* Die kleine Kammer ist voller und früher voll als die große des Projekts. */
  assert.ok(own.phi > proj.phi, own.phi + ' gegen ' + proj.phi);
  assert.ok(own.tFull < proj.tFull, 'Kammer voll: ' + own.tFull + ' gegen ' + proj.tFull);
  /* Zu viel Schmelze für die Kammer ist ein Fehler, kein Absturz. */
  assert.match(shotTimeline(v, VOL, { diam: 40, length: 100 }).error || '', /Füllgrad|Dosiervolumen/);
});

test('shotArrivals: die Substitution Zeit × Strom → Volumen → Kurvenzeit', () => {
  /* Eine Kurve, die das Volumen mit dem Strom Qc herausschiebt — dann
     müssen genau die Zeiten des konstanten Stroms herauskommen. */
  const Qc = 0.02;
  const tl = { tFull: 1.5, timeForVolume: V => V / Qc, shot: { fill: 60 } };
  const flow = {
    Q: Qc, fillTime: 45,
    arrival: { k1: 0, k2: 0.004, k5: 0.011, k7: 0.011 },
    gates: [{ id: 'k5', tArrive: 0.011 }, { id: 'k7', tArrive: 0.011 }]
  };
  const a = shotArrivals(flow, tl);
  /* Ab Kolbenstart: „Kammer voll" bei 1,5 s kommt dazu. */
  assert.ok(Math.abs(a.arrival.k2 - 1.504) < 1e-12);
  assert.ok(Math.abs(a.gates[0].tArrive - 1.511) < 1e-12);
  assert.equal(a.unreached.length, 0);
  assert.ok(Math.abs(a.tRunner - 1.511) < 1e-12);
  assert.ok(Math.abs(a.tLast - a.tFirst) < 1e-12, 'die Spanne hängt nicht am Nullpunkt');
  /* Halbe Strömung auf der Kurve: doppelte Zeiten ab Kammer voll. */
  const slow = shotArrivals(flow, { timeForVolume: V => V / (Qc / 2) });
  assert.ok(Math.abs(slow.gates[1].tArrive - 0.022) < 1e-12, 'ohne tFull ab Kammer voll');
  /* Endet die Kurve vorher, ist der Anschnitt „nicht erreicht" und das Schema zeigt keine Zeit. */
  const cut = shotArrivals(flow, { timeForVolume: V => (V > 1e-4 ? null : V / Qc) });
  assert.deepEqual(cut.unreached, ['k5', 'k7']);
  assert.ok(Number.isNaN(cut.gates[0].tArrive));
  assert.equal(cut.tRunner, null);
  const on = flowOnCurve(flow, tl);
  assert.ok(on.onCurve);
  assert.equal(on.fillTime, 60, 'die Füllzeit der Kurve ersetzt die des Prozesses');
  assert.equal(on.Q, Qc, 'der Strom der Auslegung bleibt');
});

test('Auf der DieLogic-Kurve kommt die Front SPÄTER als bei konstantem Strom — der Anguss füllt sich in der Rampe', () => {
  const v = defaults();
  const tl = shotTimeline(v, VOL);
  assert.ok(!tl.error, tl.error);
  /* Ein Strom, wie ihn der Angussdesigner ansetzt: Gussvolumen durch die
     Füllzeit der Kurve — im Mittel dasselbe Tempo. */
  const Vcast = (VOL.part + VOL.overflow) * 1e-9;
  const Qmean = Vcast / (tl.shot.fill / 1000);
  const Vr = VOL.runner * 1e-9;
  const tConst = Vr / Qmean;
  const tCurve = tl.timeForVolume(Vr);
  assert.ok(tCurve > tConst, 'Rampe: ' + tCurve + ' s gegen ' + tConst + ' s bei konstantem Strom');
});
