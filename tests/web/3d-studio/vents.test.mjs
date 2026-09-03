/* Der Überlaufdesigner ohne Browser: Plan, Dreibein, Körper, Datei.

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
const polyArea = poly => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
};

test('Plan: Elemente sitzen auf der Wand und richten sich nach ihrer Normalen', () => {
  const plan = M.emptyPlan();
  const it = M.addItem(plan, 'bohne', [10, 3, 20], [-0.6, 0.8, 0]);
  assert.equal(it.type, 'bohne');
  assert.deepEqual(it.pos, [10, 3, 20]);
  assert.ok(Math.abs(it.dir[0] + 0.6) < 1e-12 && Math.abs(it.dir[1] - 0.8) < 1e-12, 'die Achse ist die Normale, wie sie kommt');
  assert.equal(it.p.wellD, 6, 'Vorgabe der Art');
  assert.equal(it.p.draft, 5, 'mit Entformschräge');
  assert.equal(it.p.wellR, 1.5, 'und Bodenradius');
  const nix = M.addItem(plan, 'schlitz', [0, 0, 0], [0, 0, 0]);
  assert.deepEqual(nix.dir, [1, 0, 0], 'ohne Richtung: irgendeine, nicht der Nullvektor');
  /* Art wechseln behält, was beide Arten haben. */
  it.p.stegW = 15;
  M.setType(plan, it.id, 'entlueftet');
  assert.equal(it.p.stegW, 15);
  assert.equal(it.p.ventL, 30, 'neue Maße aus der Vorgabe');
  M.setType(plan, it.id, 'schlitz');
  assert.equal(it.p.stegW, undefined, 'ein Schlitz hat keinen Steg');
});

test('Dreibein: die Normale ist oben, das Element liegt in der Wand, Drehung um die Normale', () => {
  const plan = M.emptyPlan();
  const it = M.addItem(plan, 'bohne', [0, 0, 0], [1, 0, 0]);
  let f = M.frameOf(it);
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  assert.deepEqual(f.n, [1, 0, 0], 'oben ist die Wandnormale');
  assert.ok(Math.abs(f.d[0]) < 1e-12, 'längs liegt IN der Wand: ' + f.d);
  assert.ok(Math.abs(dotp(f.d, f.r)) < 1e-12 && Math.abs(dotp(f.d, f.n)) < 1e-12 && Math.abs(dotp(f.r, f.n)) < 1e-12, 'orthogonal');
  const z = crs(f.d, f.r);
  assert.ok(Math.hypot(z[0] - f.n[0], z[1] - f.n[1], z[2] - f.n[2]) < 1e-12, 'x × y = z: rechtshändig');
  /* Die Drehung dreht um n — n bleibt, d und r schwenken in der Wand. */
  const d0 = f.d.slice();
  M.setRot(plan, it.id, 90);
  f = M.frameOf(it);
  assert.deepEqual(f.n, [1, 0, 0]);
  assert.ok(Math.abs(dotp(f.d, d0)) < 1e-9 && Math.abs(f.d[0]) < 1e-12, 'längs um 90° gedreht, noch in der Wand: ' + f.d);
  assert.ok(Math.abs(M.toWorld(f, 0, 0, 1)[0] - 1) < 1e-12, 'oben bleibt oben');
  M.setRot(plan, it.id, 500);
  assert.equal(it.rot, 180, 'begrenzt');
  /* Eine Wand, die nach +X zeigt, und eine, die nach oben zeigt: das
     Dreibein kippt nirgends um. */
  for (const dir of [[0, 1, 0], [0, 0, 1], [0.577, 0.577, 0.577]]) {
    const g = M.frameOf(M.addItem(plan, 'bohne', [0, 0, 0], dir));
    assert.ok(Math.abs(dotp(g.d, g.n)) < 1e-9 && Math.hypot(...g.d) > 0.999 && Math.hypot(...g.r) > 0.999, 'Wand ' + dir);
  }
});

test('Umriss der Bohne: ein D, flach zum Steg, Punktzahl unabhängig vom Versatz', () => {
  const a = GEO.wellOutline(3, 22, 14, 2, 0);
  const b = GEO.wellOutline(3, 22, 14, 2, 0.5);
  assert.equal(a.length, b.length, 'Ringe passen zueinander');
  assert.ok(polyArea(b) < polyArea(a), 'nach innen versetzt ist kleiner');
  /* Flach bei x = 3 über die Breite des Stegs: kein Punkt liegt davor. */
  assert.ok(a.every(p => p[0] >= 3 - 1e-9), 'nichts vor der flachen Seite');
  const flat = a.filter(p => Math.abs(p[0] - 3) < 1e-9);
  assert.ok(flat.length >= 2 && Math.max(...flat.map(p => p[1])) - Math.min(...flat.map(p => p[1])) >= 10 - 1e-9,
    'die flache Seite ist mindestens so breit wie der Steg (10 mm)');
  assert.ok(Math.max(...a.map(p => p[0])) <= 3 + 22 + 1e-9, 'und endet bei Steg + Länge');
});

test('Körper: dicht, nach außen gewickelt, Volumen wie gerechnet', () => {
  const plan = M.emptyPlan();
  for (const type of Object.keys(M.TYPES)) {
    const it = M.addItem(plan, type, [5, -2, 7], [0.6, 0, 0.8]);
    M.setRot(plan, it.id, 35);
    const parts = GEO.buildItem(it);
    assert.ok(parts.length >= 1, type + ' hat Körper');
    for (const tris of parts) {
      assert.ok(volume(tris) > 0, type + ': Volumen positiv (Wicklung nach außen)');
      assert.equal(openEdges(tris), 0, type + ': jeder Körper ist geschlossen');
    }
    const p = it.p;
    if (type === 'schlitz') {
      assert.ok(Math.abs(GEO.volumeOf(it) - p.ventW * p.ventH * p.ventL) < 1e-6);
    }
    if (type === 'waschbrett') {
      assert.equal(parts.length, 3, 'Steg, Sammelkanal, Band');
      /* Das Band beginnt 0,2 mm im Sammelkanal — das Stück zählt nur einmal. */
      const bandPerLen = p.ventW * p.ventH * Math.hypot(p.waveL, 2 * p.amp) / p.waveL;
      const exact = p.stegW * p.stegH * p.stegL + p.ventW * p.poolH * p.poolL
        + bandPerLen * (p.waves * p.waveL - 0.2);
      assert.ok(Math.abs(GEO.volumeOf(it) - exact) / exact < 1e-6, 'Waschbrett ' + GEO.volumeOf(it) + ' gegen ' + exact);
      assert.ok(p.poolH > p.ventH, 'der Sammelkanal ist dicker als der Spalt');
    }
    if (type === 'bohne') {
      /* Ohne Schräge und Radius ist die Bohne ein Prisma: Umriss × Tiefe. */
      const withBoth = GEO.volumeOf(it);
      p.draft = 0; p.wellR = 0;
      const prismV = GEO.volumeOf(it);
      const rn = Math.max(0.3, Math.min(2, (p.wellW - p.stegW) / 2, p.wellW / 4));
      const expect = p.stegW * p.stegH * p.stegL + polyArea(GEO.wellOutline(p.stegL, p.wellL, p.wellW, rn, 0)) * p.wellD;
      assert.ok(Math.abs(prismV - expect) / expect < 1e-6, 'Prisma: ' + prismV + ' gegen ' + expect);
      assert.ok(withBoth < prismV, 'Schräge und Radius nehmen Volumen weg: ' + withBoth + ' < ' + prismV);
      p.draft = 5;
      const drafted = GEO.volumeOf(it);
      assert.ok(drafted < prismV && drafted > withBoth, 'die Schräge allein liegt dazwischen');
      for (const tris of GEO.buildItem(it)) assert.equal(openEdges(tris), 0, 'auch mit Schräge dicht');
    }
  }
  const all = GEO.buildAll(plan);
  assert.ok(all.length > 0 && all.length % 9 === 0);
  const byType = GEO.buildByType(plan);
  assert.deepEqual(Object.keys(byType).sort(), Object.keys(M.TYPES).sort());
});

test('Steg und Bohne berühren sich mit ganzer Stirnfläche — in der Wandebene', () => {
  const plan = M.emptyPlan();
  const it = M.addItem(plan, 'bohne', [0, 0, 0], [1, 0, 0]);
  const f = M.frameOf(it);
  const [steg, bohne] = GEO.buildItem(it);
  /* Entlang der Längsrichtung d (in der Wand): der Steg endet HINTER der
     flachen Seite der Bohne (x = stegL) — er ragt hinein, statt vor der
     zurückweichenden Wand in der Luft zu hängen. Entlang der Normalen n
     ragt nichts nach außen: das Element liegt in der Wand, die Tiefe
     wächst nach innen. */
  const along = (tris, v) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < tris.length; i += 3) { const s = tris[i] * v[0] + tris[i + 1] * v[1] + tris[i + 2] * v[2]; lo = Math.min(lo, s); hi = Math.max(hi, s); } return [lo, hi]; };
  assert.ok(along(steg, f.d)[1] > it.p.stegL + 0.1, 'der Steg reicht in die Bohne');
  assert.ok(Math.abs(along(bohne, f.d)[0] - it.p.stegL) < 1e-9, 'die Bohne beginnt am Stegende');
  assert.ok(along(bohne, f.n)[1] < 1e-9 && along(bohne, f.n)[0] < -it.p.wellD + 1e-6, 'die Bohne liegt unter der Wandfläche: ' + along(bohne, f.n));
  assert.ok(along(steg, f.n)[1] < 1e-9, 'der Steg auch');
});

test('Datei: hin und zurück ergibt denselben Plan', () => {
  const plan = M.emptyPlan();
  const a = M.addItem(plan, 'waschbrett', [1, 2, 3], [0, 0.6, 0.8]);
  M.setRot(plan, a.id, -40);
  a.p.waves = 9;
  M.addItem(plan, 'bohne', [-5, 0, 0], [0, 1, 0]);
  const back = M.fromJSON(JSON.parse(JSON.stringify(M.toJSON(plan))));
  assert.equal(M.allItems(back).length, 2);
  assert.equal(back.items[a.id].rot, -40);
  assert.equal(back.items[a.id].p.waves, 9);
  assert.ok(Math.abs(back.items[a.id].dir[1] - 0.6) < 1e-6, 'die Achse bleibt, wie sie war');
  assert.equal(back.seq, 2, 'neue Elemente zählen weiter');
  assert.throws(() => M.fromJSON({ format: 'x' }), /Überlaufdatei/);
});
