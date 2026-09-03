/* Der Luftbohnen-Designer ohne Browser: Plan, Dreibein, Körper, Datei.

     node --import ./tests/web/3d-studio/stubs/register.mjs \
          --test tests/web/3d-studio/vents.test.mjs                     */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = '../../../web/tools/3d-studio/';
const M = await import(R + 'js/vents/model.js');
const GEO = await import(R + 'js/vents/geom.js');
const { volume, weld, adjacency } = await import(R + 'js/mesh.js');

const openEdges = tris => {
  const w = weld(tris);
  const nbr = adjacency(w.index, tris.length / 9);
  let open = 0;
  for (let i = 0; i < nbr.length; i++) if (nbr[i] < 0) open++;
  return open;
};

test('Plan: Elemente entstehen mit Richtung in der Trennebene und ihrer Art', () => {
  const plan = M.emptyPlan();
  /* Die nach innen gerichtete Normale einer Wand, leicht aus der Ebene
     gekippt — die Bohne wächst nach AUSSEN, in der Ebene. */
  const it = M.addItem(plan, 'bohne', [10, 3, 20], [-0.96, 0.28, 0]);
  assert.equal(it.type, 'bohne');
  assert.deepEqual(it.pos, [10, 3, 20]);
  assert.ok(Math.abs(it.dir[1]) < 1e-12, 'kein Anteil auf der Ausstoßachse');
  assert.ok(Math.abs(Math.hypot(...it.dir) - 1) < 1e-12, 'normiert');
  assert.equal(it.p.wellD, 6, 'Vorgabe der Art');
  /* Senkrecht getroffen (Deckfläche): irgendeine Richtung in der Ebene. */
  const top = M.addItem(plan, 'schlitz', [0, 0, 0], [0, -1, 0]);
  assert.ok(Math.abs(top.dir[1]) < 1e-12 && Math.hypot(...top.dir) > 0.999);
  /* Art wechseln behält, was beide Arten haben. */
  it.p.stegW = 15;
  M.setType(plan, it.id, 'entlueftet');
  assert.equal(it.p.stegW, 15);
  assert.equal(it.p.ventL, 30, 'neue Maße aus der Vorgabe');
  M.setType(plan, it.id, 'schlitz');
  assert.equal(it.p.stegW, undefined, 'ein Schlitz hat keinen Steg');
});

test('Dreibein: rechtshändig, Drehung um die Ausstoßachse', () => {
  const plan = M.emptyPlan();
  const it = M.addItem(plan, 'bohne', [0, 0, 0], [1, 0, 0]);
  let f = M.frameOf(plan, it);
  assert.deepEqual(f.n, [0, 1, 0]);
  assert.ok(Math.abs(f.d[0] - 1) < 1e-12);
  /* r = n × d = (0,1,0) × (1,0,0) = (0,0,−1): x=d, y=r, z=n rechtshändig. */
  assert.ok(Math.abs(f.r[2] + 1) < 1e-12, 'quer: ' + f.r);
  M.setRot(plan, it.id, 90);
  f = M.frameOf(plan, it);
  assert.ok(Math.abs(f.d[2] + 1) < 1e-9 || Math.abs(f.d[2] - 1) < 1e-9, 'um 90° gedreht liegt d auf z: ' + f.d);
  assert.ok(Math.abs(M.toWorld(f, 1, 0, 0)[1]) < 1e-12, 'in der Ebene');
  M.setRot(plan, it.id, 500);
  assert.equal(it.rot, 180, 'begrenzt');
});

test('Körper: dicht, nach außen gewickelt, Volumen wie gerechnet', () => {
  const plan = M.emptyPlan();
  for (const type of Object.keys(M.TYPES)) {
    const it = M.addItem(plan, type, [5, -2, 7], [0.6, 0, 0.8]);
    M.setRot(plan, it.id, 35);
    const parts = GEO.buildItem(plan, it);
    assert.ok(parts.length >= 1, type + ' hat Körper');
    for (const tris of parts) {
      assert.ok(volume(tris) > 0, type + ': Volumen positiv (Wicklung nach außen)');
      assert.equal(openEdges(tris), 0, type + ': jeder Körper ist geschlossen');
    }
    const p = it.p;
    const exact = {
      schlitz: p.ventW * p.ventH * p.ventL,
      bohne: p.stegW * p.stegH * p.stegL + p.wellD * ((p.wellL - p.wellW) * p.wellW + Math.PI * p.wellW * p.wellW / 4),
      entlueftet: p.stegW * p.stegH * p.stegL + p.wellD * ((p.wellL - p.wellW) * p.wellW + Math.PI * p.wellW * p.wellW / 4)
        + p.ventW * p.ventH * p.ventL,
      waschbrett: p.stegW * p.stegH * p.stegL + p.ventW * p.ventH * p.waves * Math.hypot(p.waveL, 2 * p.amp)
    }[type];
    const v = GEO.volumeOf(plan, it);
    const tol = type === 'bohne' || type === 'entlueftet' ? 0.02 : 1e-6;     // Halbkreise als Sehnen
    assert.ok(Math.abs(v - exact) / exact < tol, type + ': ' + v.toFixed(1) + ' gegen ' + exact.toFixed(1) + ' mm³');
  }
  const all = GEO.buildAll(plan);
  assert.ok(all.length > 0 && all.length % 9 === 0);
  const byType = GEO.buildByType(plan);
  assert.deepEqual(Object.keys(byType).sort(), Object.keys(M.TYPES).sort());
});

test('Datei: hin und zurück ergibt denselben Plan', () => {
  const plan = M.emptyPlan();
  plan.axis = '-z';
  const a = M.addItem(plan, 'waschbrett', [1, 2, 3], [0, 1, 0]);
  M.setRot(plan, a.id, -40);
  a.p.waves = 9;
  M.addItem(plan, 'bohne', [-5, 0, 0], [0, 1, 0]);
  const back = M.fromJSON(JSON.parse(JSON.stringify(M.toJSON(plan))));
  assert.equal(back.axis, '-z');
  assert.equal(M.allItems(back).length, 2);
  assert.equal(back.items[a.id].rot, -40);
  assert.equal(back.items[a.id].p.waves, 9);
  assert.ok(Math.abs(back.items[a.id].dir[2]) < 1e-9, 'die Richtung liegt in der Ebene zur Achse');
  assert.equal(back.seq, 2, 'neue Elemente zählen weiter');
  assert.throws(() => M.fromJSON({ format: 'x' }), /Luftbohnen-Datei/);
});

test('Prüfung: zu hohe Kanäle, dicke und dünne Stege werden benannt', () => {
  const plan = M.emptyPlan();
  assert.equal(M.checkPlan(plan)[0].level, 'note');
  const a = M.addItem(plan, 'entlueftet', [0, 0, 0], [1, 0, 0]);
  assert.ok(M.checkPlan(plan).every(r => r.level === 'ok'), 'die Vorgaben sind sauber');
  a.p.ventH = 0.35;
  let r = M.checkPlan(plan).find(x => /kanal zu hoch/i.test(x.title));
  assert.ok(r && r.level === 'bad');
  assert.match(r.text, /0,35 mm/);
  a.p.ventH = 0.15;
  a.p.stegH = 2;
  r = M.checkPlan(plan).find(x => /Steg dick/.test(x.title));
  assert.ok(r && r.level === 'warn');
  a.p.stegH = 0.3;
  assert.ok(M.checkPlan(plan).find(x => /Steg dünn/.test(x.title)));
  const w = M.addItem(plan, 'waschbrett', [0, 0, 0], [1, 0, 0]);
  w.p.waves = 2;
  assert.ok(M.checkPlan(plan).find(x => /Waschbrett kurz/.test(x.title)));
});
