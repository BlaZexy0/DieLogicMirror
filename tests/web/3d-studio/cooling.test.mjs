/* Der Temperierkanal-Designer ohne Browser: Plan, Körper, Datei.

     node --import ./tests/web/3d-studio/stubs/register.mjs \
          --test tests/web/3d-studio/cooling.test.mjs                   */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = '../../../web/tools/3d-studio/';
const M = await import(R + 'js/cooling/model.js');
const GEO = await import(R + 'js/cooling/geom.js');
const { volume, weld, adjacency } = await import(R + 'js/mesh.js');

const openEdges = tris => {
  const w = weld(tris);
  const nbr = adjacency(w.index, tris.length / 9);
  let open = 0;
  for (let i = 0; i < nbr.length; i++) if (nbr[i] < 0) open++;
  return open;
};
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), (msg || '') + ': ' + a + ' ≠ ' + b);

test('Plan: Kühlstich und Kanal mit Vorgaben, Endpunkte, beide Enden bewegen', () => {
  const plan = M.emptyPlan();
  assert.equal(plan.dist, 20);
  const s = M.addStich(plan, [10, 0, 0], [2, 0, 0]);
  assert.deepEqual(s.dir, [1, 0, 0], 'Richtung normiert');
  assert.equal(s.d, 20, 'Vorgabe Durchmesser'); assert.equal(s.len, 200, 'Vorgabe Länge');
  assert.deepEqual(M.axisOf(s).b, [210, 0, 0], 'das äußere Ende liegt len weiter');
  const k = M.addKanal(plan, [0, 0, 0], [0, 100, 0], { d: 12 });
  assert.equal(k.d, 12);
  assert.equal(M.lengthOf(k), 100);
  M.setEnd(plan, k.id, 'b', [0, 100, 30]);
  assert.deepEqual(k.a, [0, 0, 0], 'nur das eine Ende');
  M.setEnd(plan, k.id, 'a', [5, 0, 0], true);
  assert.deepEqual(k.a, [5, 0, 0]);
  assert.deepEqual(k.b, [5, 100, 30], 'beide Enden: derselbe Versatz');
  M.setEnd(plan, s.id, 'p', [12, 1, 1]);
  assert.deepEqual(s.p, [12, 1, 1]);
  M.placeStich(plan, s.id, [0, 0, 0], [0, 0, 5]);
  assert.deepEqual(s.dir, [0, 0, 1]);
  M.removeItem(plan, k.id);
  assert.equal(M.allItems(plan).length, 1);
});

test('Richtung eines Kühlstichs: Normale, Blick oder Achse vom Bauteil weg', () => {
  const n = [0.6, 0.8, 0];
  assert.deepEqual(M.directionFor('normal', n, [0, 0, 1]), n);
  assert.deepEqual(M.directionFor('blick', n, [0, 0, 2]), [0, 0, 1], 'zur Kamera, normiert');
  assert.deepEqual(M.directionFor('x', n, null), [1, 0, 0]);
  assert.deepEqual(M.directionFor('x', [-0.6, 0.8, 0], null), [-1, 0, 0], 'das Vorzeichen zeigt vom Bauteil weg');
  assert.deepEqual(M.directionFor('z', [0, 1, 0], null), [0, 0, 1], 'ohne Anteil: positiv');
});

test('Körper: dicht, nach außen gewickelt, Volumen wie gerechnet', () => {
  const plan = M.emptyPlan();
  const s = M.addStich(plan, [3, -2, 5], [0.6, 0, 0.8], { d: 8, len: 60 });
  const ts = GEO.stichBody(s);
  assert.ok(volume(ts) > 0, 'Kühlstich: Wicklung nach außen');
  assert.equal(openEdges(ts), 0, 'Kühlstich geschlossen');
  /* Halbkugel (2/3 π r³) plus Zylinder von r bis len — die Sehnen der
     Halbkugel und des Kreises nehmen ein paar Prozent weg. */
  const r = 4;
  rel(volume(ts), 2 / 3 * Math.PI * r ** 3 + Math.PI * r * r * (60 - r), 0.03, 'Kühlstich-Volumen');
  const k = M.addKanal(plan, [0, 0, 0], [30, 40, 0], { d: 10 });
  const tk = GEO.kanalBody(k);
  assert.ok(volume(tk) > 0);
  assert.equal(openEdges(tk), 0, 'Kanal geschlossen');
  rel(volume(tk), Math.PI * 25 * 50, 0.02, 'Kanal-Volumen');
  assert.ok(GEO.buildAll(plan).length === ts.length + tk.length);
  assert.deepEqual(Object.keys(GEO.buildByType(plan)).sort(), ['kanal', 'stich']);
  assert.equal(GEO.kanalBody(M.addKanal(plan, [1, 1, 1], [1, 1, 1])).length, 0, 'ohne Länge kein Körper');
});

test('Wandabstand: Feldwert entlang der Achse minus Radius', () => {
  const plan = M.emptyPlan();
  const s = M.addStich(plan, [20, 0, 0], [1, 0, 0], { d: 8, len: 50 });
  /* Ein Feld, dessen Wert der Abstand zur Ebene x = 0 ist. */
  const sample = (x) => x;
  assert.ok(Math.abs(GEO.wallClearance(s, sample) - 16) < 1e-9, 'Spitze bei 20, Radius 4 → 16');
  const k = M.addKanal(plan, [30, 0, 0], [10, 0, 0], { d: 10 });
  assert.ok(Math.abs(GEO.wallClearance(k, sample) - 5) < 1e-9, 'das nähere Ende zählt');
});

test('Datei: hin und zurück ergibt denselben Plan', () => {
  const plan = M.emptyPlan();
  plan.dist = 25;
  const s = M.addStich(plan, [1, 2, 3], [0, 0.6, 0.8], { d: 6, len: 45 });
  const k = M.addKanal(plan, [0, 0, 0], [50, 0, 0], { d: 12 });
  const back = M.fromJSON(JSON.parse(JSON.stringify(M.toJSON(plan))));
  assert.equal(back.dist, 25);
  assert.equal(M.allItems(back).length, 2);
  assert.equal(back.items[s.id].len, 45);
  assert.ok(Math.abs(back.items[s.id].dir[1] - 0.6) < 1e-6);
  assert.deepEqual(back.items[k.id].b, [50, 0, 0]);
  assert.equal(back.seq, 2);
  assert.throws(() => M.fromJSON({ format: 'x' }), /Temperierdatei/);
});

test('Automatik: N Bohrungen decken das Bauteil gleichmäßig ab', async () => {
  const S = await import(R + 'js/solids.js');
  const { buildModel } = await import(R + 'js/part/model.js');
  const { buildField } = await import(R + 'js/part/field.js');
  const { surfaceNets } = await import(R + 'js/part/surfacenets.js');
  const A = await import(R + 'js/cooling/auto.js');
  /* Eine Platte 200 × 100 × 20: die Masse liegt in der Mittelebene, die
     Abstandsfläche 15 mm außen. */
  const m = buildModel(S.box(200, 100, 20));
  const f = await buildField(m, { res: 64, band: 25 });
  const shell = surfaceNets(f, 15);
  assert.ok(shell.length > 0);

  const cells = A.interiorCells(f);
  assert.ok(cells.length > 100 && cells.every(c => c.w > 0), 'innen liegende Zellen mit Gewicht');
  const cands = A.shellCandidates(shell);
  assert.ok(cands.length > 100);
  for (const c of cands.slice(0, 50)) {
    const n = A.outwardNormal(f, c);
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9, 'Normale normiert');
    /* Vom Bauteil weg: der Kandidat liegt außen, die Normale zeigt weiter hinaus. */
    const dot = n[0] * c[0] + n[1] * c[1] + n[2] * c[2];
    assert.ok(dot > 0, 'zeigt vom Ursprung weg: ' + c + ' → ' + n);
  }

  const one = A.planCooling(f, shell, { count: 1 });
  assert.equal(one.sites.length, 1);
  const six = A.planCooling(f, shell, { count: 6, minSpacing: 20 });
  assert.equal(six.sites.length, 6, 'sechs Bohrungen');
  /* Alle auf der Abstandsfläche … */
  const { sampleField } = await import(R + 'js/part/field.js');
  for (const s of six.sites) {
    assert.ok(Math.abs(sampleField(f, ...s.p) - 15) < f.h, 'auf der 15-mm-Fläche: ' + sampleField(f, ...s.p));
  }
  /* … mit Abstand zueinander … */
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const d = Math.hypot(...six.sites[i].p.map((v, k) => v - six.sites[j].p[k]));
    assert.ok(d >= 20 - 1e-9, 'Bohrungen halten Abstand: ' + d);
  }
  /* … über die Länge der Platte verteilt, nicht in einer Ecke … */
  const xs = six.sites.map(s => s.p[0]);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 100, 'über die Länge verteilt: ' + xs.map(v => v.toFixed(0)));
  /* … und mehr Bohrungen heißt kleinere Abstände im Bauteil. */
  assert.ok(six.stats.mean < one.stats.mean && six.stats.max < one.stats.max,
    'sechs decken besser als eine: ' + six.stats.mean.toFixed(1) + ' < ' + one.stats.mean.toFixed(1));
  assert.ok(six.stats.max < 60, 'keine Zelle weiter als 60 mm von einer Bohrung: ' + six.stats.max);
});

test('Wandabstand: lange Elemente werden je halbe Zellkante abgetastet — keine Wand fällt zwischen zwei Proben', () => {
  const plan = M.emptyPlan();
  /* Eine 4-mm-Platte in der Ebene z = 0: der Feldwert ist |z| − 2. */
  const plate = (x, y, z) => Math.abs(z) - 2;
  const min = M.autoMinWall(20, 20, 10), tol = 0.5;
  for (const [L, z0] of [[480, -230], [960, -460]]) {
    const k = M.addKanal(plan, [0, 0, z0], [0, 0, z0 + L], { d: 10 });
    /* Mit fester Probenzahl (24 Stücke, 20 bzw. 40 mm) lag keine Probe in der
       Platte: „unter dem Mindest-Wandabstand" bei 480 mm, „eingehalten" bei 960. */
    assert.notEqual(GEO.wallVerdict(GEO.wallClearance(k, plate), min, tol), 'bad', 'die alte Abtastung sah den Durchbruch nicht (' + L + ' mm)');
    const c = GEO.wallClearance(k, plate, 1);
    assert.equal(GEO.wallVerdict(c, min, tol), 'bad', 'Durchbruch bei ' + L + ' mm: ' + c);
    assert.ok(c <= -6.5, 'die Probe liegt in der Platte: ' + c);
  }
  /* Kurze Elemente bekommen weiter mindestens 24 Stücke. */
  const s = M.addStich(plan, [20, 0, 0], [1, 0, 0], { d: 8, len: 50 });
  assert.ok(Math.abs(GEO.wallClearance(s, x => x, 1000) - 16) < 1e-9);
});

test('Datei: Kennungen werden geprüft, fehlende eindeutig vergeben, Werte in die Grenzen der Felder geholt', () => {
  const base = { format: M.FORMAT, version: 1 };
  /* Was aus der Datei ins Auswahlfeld und in die Liste geht, muss eine Kennung sein. */
  for (const id of ['<img src=x onerror=alert(1)>', 't1"><b>', '1t', 'x'.repeat(33), ' t1']) {
    assert.throws(() => M.fromJSON({ ...base, items: [{ id, type: 'stich', p: [0, 0, 0], dir: [0, 0, 1] }] }), /keine gültige Kennung/, id);
  }
  assert.throws(() => M.fromJSON({ ...base, items: [{ id: 't1', type: 'stich', p: [0, 'x', 0] }] }), /Lage fehlt oder ist keine Zahl/);
  assert.throws(() => M.fromJSON({ ...base, items: [null] }), /unlesbar/);
  /* Ohne Kennung wurde früher jedes Element „t1" und überschrieb das vorige. */
  const loose = M.fromJSON({ ...base, items: [
    { type: 'stich', p: [0, 0, 0], dir: [0, 0, 1] },
    { type: 'stich', p: [50, 0, 0], dir: [0, 0, 1] },
    { id: 't2', type: 'kanal', a: [0, 0, 0], b: [0, 50, 0] },
    { id: 't2', type: 'kanal', a: [9, 0, 0], b: [9, 50, 0] }
  ] });
  const ids = Object.keys(loose.items);
  assert.equal(ids.length, 4, 'vier Elemente, keins überschrieben: ' + ids);
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual(loose.items.t2.a, [0, 0, 0], 'eine vorhandene Kennung bleibt beim ersten, der sie trägt');
  const n = M.addStich(loose, [1, 1, 1], [0, 0, 1]);
  assert.ok(!ids.includes(n.id), 'ein neues Element bekommt eine freie Kennung: ' + n.id);
  /* Grenzen: der Regler des Achsabstands reicht von 5 bis 60 mm, Ø von 2 bis 60, Länge bis 1000. */
  const wild = M.fromJSON({ ...base, dist: 100, defaults: { d: 500, len: 1, kd: 'x' },
    items: [{ id: 't1', type: 'stich', p: [0, 0, 0], dir: [0, 0, 1], d: 500, len: 5000 }, { id: 't2', type: 'kanal', a: [0, 0, 0], b: [1, 0, 0], d: -3 }] });
  assert.equal(wild.dist, M.DIST_RANGE[1]);
  assert.equal(M.fromJSON({ ...base, dist: 1 }).dist, M.DIST_RANGE[0]);
  assert.equal(wild.items.t1.d, M.PARAM_META.d.max);
  assert.equal(wild.items.t1.len, M.PARAM_META.len.max);
  assert.equal(wild.items.t2.d, M.PARAM_META.d.min);
  assert.deepEqual(wild.defaults, { d: M.PARAM_META.d.max, len: M.PARAM_META.len.min, kd: M.DEFAULTS.kd });
});

test('Datei: die Vorgaben reisen mit — das Urteil über einen geladenen Plan hängt an nichts Ungespeichertem', () => {
  const plan = M.emptyPlan();
  assert.deepEqual(plan.defaults, M.DEFAULTS, 'ein neuer Plan beginnt mit den Vorgaben der Seite');
  plan.defaults.d = 30;
  M.addStich(plan, [0, 0, 20], [0, 0, 1], { d: 30 });
  const json = JSON.parse(JSON.stringify(M.toJSON(plan)));
  assert.deepEqual(json.defaults, { d: 30, len: 200, kd: 10 });
  assert.equal(json.version, 1, 'das Format bleibt Version 1: ein Schlüssel mehr, den ältere Fassungen überlesen');
  const back = M.fromJSON(json);
  assert.equal(back.defaults.d, 30);
  /* Mit „Auto": 20 − 30/2 = 5 mm — derselbe Mindest-Wandabstand wie beim Speichern. */
  assert.equal(M.minWallOf(back, back.defaults.d, back.defaults.kd), 5);
  /* Ältere Dateien ohne Vorgaben: die, mit denen die Seite startet. */
  delete json.defaults;
  const old = M.fromJSON(json);
  assert.deepEqual(old.defaults, M.DEFAULTS);
  assert.equal(M.minWallOf(old, old.defaults.d, old.defaults.kd), 10);
});

test('Automatik: nie enger als der Stichabstand — lieber weniger Bohrungen, und was schon steht, bleibt', async () => {
  const S = await import(R + 'js/solids.js');
  const { buildModel } = await import(R + 'js/part/model.js');
  const { buildField } = await import(R + 'js/part/field.js');
  const { surfaceNets } = await import(R + 'js/part/surfacenets.js');
  const A = await import(R + 'js/cooling/auto.js');
  const m = buildModel(S.box(200, 100, 20));
  const dist = 20, band = dist * 1.3 + 5, h = 3;
  const f = await buildField(m, { h, band, pad: band + 3 * h });
  const shell = surfaceNets(f, dist);
  const len = 200, d = 20;
  const axis = s => ({ a: s.p, b: s.p.map((v, k) => v + s.dir[k] * len) });
  const closest = (list, others = list) => {
    let best = Infinity;
    for (const x of list) for (const y of others) {
      if (x === y) continue;
      const p = axis(x), q = y.a ? y : axis(y);
      best = Math.min(best, Math.sqrt(A.segmentDist2(p.a, p.b, q.a, q.b)));
    }
    return best;
  };
  /* 40 Bohrungen mit 80 mm Abstand passen um keine 200 × 100-Platte: früher
     kamen trotzdem 40, die nächsten 18 mm auseinander — die Bohrungen schnitten sich. */
  const tight = A.planCooling(f, shell, { count: 40, minSpacing: 80, d, length: len });
  assert.ok(tight.sites.length < 40 && tight.sites.length >= 4, 'weniger als verlangt: ' + tight.sites.length);
  assert.ok(closest(tight.sites) >= 80 - 1e-9, 'kein Paar enger als 80 mm: ' + closest(tight.sites));

  /* Ein zweiter Lauf ohne „Ersetzen": früher dieselben Stellen noch einmal. */
  const first = A.planCooling(f, shell, { count: 6, minSpacing: 30, d, length: len });
  assert.equal(first.sites.length, 6);
  const fixed = first.sites.map(s => ({ ...axis(s), d }));
  const again = A.planCooling(f, shell, { count: 6, minSpacing: 30, d, length: len, fixed });
  assert.ok(again.sites.length >= 1, 'es ist Platz für weitere');
  assert.ok(closest(again.sites, fixed) >= 30 - 1e-9, 'keiner steht auf oder neben einem von vorhin: ' + closest(again.sites, fixed));
  assert.ok(closest(again.sites) >= 30 - 1e-9, 'und untereinander');
  assert.ok(again.stats.max <= first.stats.max + 1e-9, 'die schon gesetzten zählen zur Überdeckung');
  /* Ein Kanal, der schon steht, hält die neuen auf Abstand — über seine ganze Länge. */
  const top = f.origin[2] + (f.dims[2] - 1) * f.h;
  const kz = 10 + dist;
  assert.ok(kz < top);
  const kanal = { a: [-90, 0, kz], b: [90, 0, kz], d: 10, line: true };
  const beside = A.planCooling(f, shell, { count: 8, minSpacing: 30, d, length: len, fixed: [kanal] });
  const need = Math.max(30, 1.5 * (d + 10) / 2);
  assert.ok(closest(beside.sites, [kanal]) >= need - 1e-9, 'kein Stich am Kanal: ' + closest(beside.sites, [kanal]));
});

test('Automatik: nur Stiche, die die Prüfung bestehen — auch in einer Tasche, auf ganzer Länge', async () => {
  const S = await import(R + 'js/solids.js');
  const { buildModel } = await import(R + 'js/part/model.js');
  const { buildField, sampleField } = await import(R + 'js/part/field.js');
  const { surfaceNets } = await import(R + 'js/part/surfacenets.js');
  const A = await import(R + 'js/cooling/auto.js');
  /* Ein U: Boden 140 × 100 × 10, zwei Wände 10 × 100 × 100, dazwischen
     120 mm frei. Ein Stich von 200 mm, der an der Innenwand senkrecht
     absteht, läuft quer durch die Tasche in die Wand gegenüber — seine
     Spitze sitzt dabei ordentlich auf der Abstandsfläche. */
  const m = buildModel(S.concat([
    S.translate(S.box(140, 100, 10), 0, 0, 5),
    S.translate(S.box(10, 100, 100), -65, 0, 60),
    S.translate(S.box(10, 100, 100), 65, 0, 60)
  ]));
  const dist = 20, band = dist * 1.3 + 5, h = 4;
  const f = await buildField(m, { h, band, pad: band + 3 * h });
  const shell = surfaceNets(f, dist);
  const d = 20, len = 200, min = M.autoMinWall(dist, d, 10), tol = 0.25 * h;
  const sample = (x, y, z) => sampleField(f, x, y, z);
  const clear = (p, dir, step) => GEO.wallClearance({ type: 'stich', p, dir, d, len }, sample, step);
  const ok = (p, dir) => GEO.wallVerdict(clear(p, dir, h / 2), min, tol) === 'ok';
  const opts = { count: 12, minSpacing: 30, d, length: len };
  const loose = A.planCooling(f, shell, opts);
  const tipOk = s => GEO.wallVerdict(sample(...s.p) - d / 2, min, tol) === 'ok';
  assert.ok(loose.sites.some(s => tipOk(s) && !ok(s.p, s.dir)), 'ohne Prüfung stünde ein Stich mit gesunder Spitze zu nah (der Fall ist echt)');
  const res = A.planCooling(f, shell, { ...opts, fits: ok });
  assert.ok(res.usable > 0 && res.usable < res.candidates.length, 'Stellen in der Tasche scheiden aus: ' + res.usable + ' von ' + res.candidates.length);
  assert.equal(res.sites.length, 12);
  for (const s of res.sites) {
    const c = clear(s.p, s.dir, 0.25);
    assert.ok(c >= min - tol - 0.5, 'auf ganzer Länge weit genug weg (dicht nachgemessen): ' + c + ' bei ' + s.p.map(v => v.toFixed(0)));
  }
  /* Hält keine Stelle den Mindest-Wandabstand, wird nichts gesetzt — und das
     Ergebnis sagt es (usable 0). */
  const none = A.planCooling(f, shell, { ...opts, fits: () => false });
  assert.equal(none.sites.length, 0);
  assert.equal(none.usable, 0);
});
