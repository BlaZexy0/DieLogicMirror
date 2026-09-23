/* Der gemeinsame Rahmen des Studios — die Teile, die ohne Werkzeug
   prüfbar sind: Zahlen lesen und schreiben, Verlauf, Entwurf, Abbruch.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/studio-core.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './stubs/dom.mjs';

const { parseNumber, fmt, fmtPlain, fmtUnit, clamp, rangeText } = await import('../../../web/tools/3d-studio/js/studio/format.js');
const { createHistory } = await import('../../../web/tools/3d-studio/js/studio/history.js');
const { createStore } = await import('../../../web/tools/3d-studio/js/studio/store.js');
const { buildField } = await import('../../../web/tools/3d-studio/js/part/field.js');
const { runSimulation } = await import('../../../web/tools/3d-studio/js/lbm/run.js');
const { isAbort } = await import('../../../web/tools/3d-studio/js/abort.js');
const { buildModel } = await import('../../../web/tools/3d-studio/js/part/model.js');
const S = await import('../../../web/tools/3d-studio/js/solids.js');

/* ── Zahlen ──────────────────────────────────────────────────── */
test('parseNumber liest deutsch: Tausenderpunkt, Dezimalkomma, echtes Minus', () => {
  const cases = [
    ['1,5', 1.5], ['1.5', 1.5], ['1.500', 1500], ['0.500', 0.5], ['1.234,5', 1234.5], ['1,234.5', 1234.5],
    ['12.345.678', 12345678], ['−3', -3], ['+4', 4], [' 42 ', 42], ['-0,25', -0.25], ['.5', 0.5], ['1500', 1500],
    ['', null], ['-', null], ['abc', null], ['1,2,3', null], ['1.2.3', null], ['1.5000', 1.5]
  ];
  for (const [txt, want] of cases) assert.equal(parseNumber(txt), want, '„' + txt + '"');
});

test('Rundlauf: was fmtPlain schreibt, liest parseNumber wieder ein — auch über 1000', () => {
  for (const v of [0, 0.25, 12, 999, 1000, 1500, 1234.5, 25000, 1e6, -1500]) {
    assert.equal(parseNumber(fmtPlain(v)), Math.round(v * 100) / 100, String(v));
  }
  assert.equal(parseNumber(fmt(1500)), 1500, 'auch die gruppierte Anzeige');
});

test('fmtUnit: Stellen je Einheit, Millisekunden unter 10 mit einer Stelle', () => {
  assert.equal(fmtUnit(12.345, 'mm'), '12,3 mm');
  assert.equal(fmtUnit(1262.77, 'cm³'), '1.262,8 cm³');
  assert.equal(fmtUnit(42.4, '%'), '42 %');
  assert.equal(fmtUnit(981.31, 'ms'), '981 ms');
  assert.equal(fmtUnit(3.14, 'ms'), '3,1 ms');
  assert.equal(fmtUnit(NaN, 'mm'), '—');
});

test('clamp sagt, ob es klemmen musste; rangeText nennt den Bereich', () => {
  assert.deepEqual(clamp(99, { min: 0.3, max: 30 }), { value: 30, clamped: true });
  assert.deepEqual(clamp(5, { min: 0.3, max: 30 }), { value: 5, clamped: false });
  assert.equal(rangeText(0.3, 30, 'mm'), '0,3–30 mm');
  assert.equal(rangeText(1, undefined, ''), 'ab 1');
});

/* ── Verlauf ─────────────────────────────────────────────────── */
test('Verlauf: commit, undo, redo — und ein Zug ist ein Eintrag', () => {
  const doc = { n: 0 };
  const h = createHistory({ serialize: () => ({ n: doc.n }), restore: d => { doc.n = d.n; }, limit: 3 });
  h.reset();
  assert.equal(h.canUndo, false);
  doc.n = 1; h.commit('eins');
  doc.n = 2; h.commit('zwei');
  assert.equal(h.undoLabel, 'zwei');
  assert.ok(h.undo()); assert.equal(doc.n, 1);
  assert.ok(h.undo()); assert.equal(doc.n, 0);
  assert.equal(h.canUndo, false);
  assert.ok(h.redo()); assert.equal(doc.n, 1);
  /* Ein Zug: begin, viele Schritte, end → ein Eintrag. */
  h.begin();
  for (let k = 0; k < 20; k++) doc.n = 10 + k;
  h.end('Zug');
  assert.equal(doc.n, 29);
  h.undo();
  assert.equal(doc.n, 1, 'der ganze Zug auf einmal zurück');
  /* Unverändert: kein Eintrag. */
  assert.equal(h.commit('nichts'), false);
  /* Die Grenze hält den Stapel klein. */
  for (let k = 0; k < 10; k++) { doc.n = 100 + k; h.commit('k' + k); }
  assert.equal(h.depth, 3);
});

test('Verlauf: coalesce fasst Reglerdrehen unter einem Schlüssel zusammen', async () => {
  const doc = { v: 0 };
  const h = createHistory({ serialize: () => ({ v: doc.v }), restore: d => { doc.v = d.v; } });
  h.reset();
  for (let k = 1; k <= 5; k++) { doc.v = k; h.coalesce('regler', 'Regler', 50); }
  assert.equal(h.depth, 1, 'fünf Schritte, ein Eintrag');
  await new Promise(r => setTimeout(r, 80));
  doc.v = 9; h.coalesce('regler', 'Regler', 50);
  assert.equal(h.depth, 2, 'nach der Pause ein neuer Eintrag');
  h.undo();
  assert.equal(doc.v, 5);
});

/* ── Entwurf ─────────────────────────────────────────────────── */
test('Entwurf: schreiben, wiederfinden, verwerfen; ohne Speicher ohne Fehler', async () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try {
    const st = createStore({ tool: 'probe', debounce: 5 });
    st.setPart('teil-a');
    assert.equal(st.peek(), null);
    st.save(() => ({ x: 1 }));
    assert.equal(st.dirty, true);
    await new Promise(r => setTimeout(r, 20));
    const d = st.peek();
    assert.ok(d && d.doc.x === 1 && d.part === 'teil-a');
    assert.ok(globalThis.localStorage.getItem('studio:probe:teil-a'));
    st.setPart('teil-b');
    assert.equal(st.peek(), null, 'ein anderes Bauteil sieht seinen eigenen Entwurf');
    assert.deepEqual(st.others().map(o => o.part), ['teil-a'], 'aber weiß von dem anderen');
    st.setPart('teil-a');
    st.markSaved();
    assert.equal(st.dirty, false);
    st.discard();
    assert.equal(st.peek(), null);
    /* Zu groß: wird nicht geschrieben, kein Fehler. */
    assert.equal(st.flush(() => ({ big: 'x'.repeat(600 * 1024) })), false);
  } finally { globalThis.localStorage = saved; }
  const gone = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    const st = createStore({ tool: 'probe' });
    assert.equal(st.available, false);
    assert.equal(st.flush(() => ({})), false);
    assert.equal(st.peek(), null);
  } finally { globalThis.localStorage = gone; }
});

test('Verlauf: revert() kehrt ohne Schritt zum eingetragenen Stand zurück (Esc beim Zug)', () => {
  const doc = { n: 0 };
  const h = createHistory({ serialize: () => ({ n: doc.n }), restore: d => { doc.n = d.n; } });
  h.reset();
  doc.n = 1; h.commit('eins');
  doc.n = 7;                                                  // mitten im Zug
  assert.equal(h.revert(), true);
  assert.equal(doc.n, 1, 'zurück auf den letzten Schritt');
  assert.equal(h.depth, 1, 'und kein neuer Eintrag');
  assert.equal(h.revert(), false, 'ohne Änderung nichts zu tun');
});

test('Verlauf: Rückgängig beendet das Zusammenfassen — der nächste Reglerzug ist ein eigener Schritt', () => {
  const doc = { v: 5 };
  const h = createHistory({ serialize: () => ({ v: doc.v }), restore: d => { doc.v = d.v; } });
  h.reset();
  doc.v = 9; h.coalesce('regler', 'Regler', 400);
  h.undo();
  assert.equal(doc.v, 5);
  doc.v = 11; h.coalesce('regler', 'Regler', 400);           // derselbe Regler, gleich danach
  assert.equal(h.canUndo, true, 'der neue Zug hat einen Eintrag');
  assert.equal(h.canRedo, false, 'und das alte Wiederholen ist verbraucht');
  h.undo();
  assert.equal(doc.v, 5, 'die 5 bleibt erreichbar');
});

test('Entwurf: was noch wartet, landet beim Bauteilwechsel unter SEINEM Bauteil — als Abzug von damals', async () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try {
    const st = createStore({ tool: 'probe', debounce: 1000 });
    st.setPart('teil-a');
    const plan = { items: 3 };
    st.save(() => ({ ...plan }));
    assert.equal(st.dirty, true);
    /* Das Werkzeug räumt für das neue Bauteil auf, BEVOR der Wecker läuft. */
    plan.items = 0;
    st.setPart('teil-b');
    assert.equal(JSON.parse(globalThis.localStorage.getItem('studio:probe:teil-a')).doc.items, 3, 'A behält seine drei Elemente');
    assert.equal(globalThis.localStorage.getItem('studio:probe:teil-b'), null, 'B bekommt nichts Fremdes');
    assert.equal(st.dirty, false, 'das neue Bauteil beginnt ohne Ungesichertes');
    await new Promise(r => setTimeout(r, 30));
    assert.equal(globalThis.localStorage.getItem('studio:probe:teil-b'), null, 'auch kein verspäteter Wecker');
    /* flushPending schreibt sofort, was wartet. */
    st.save(() => ({ items: 5 }));
    assert.equal(st.flushPending(), true);
    assert.equal(st.peek().doc.items, 5);
    assert.equal(st.flushPending(), false, 'danach wartet nichts mehr');
  } finally { globalThis.localStorage = saved; }
});

test('Dateinamen: Umlaute werden umschrieben, nicht verschluckt', async () => {
  const { safeName } = await import('../../../web/tools/3d-studio/js/ui/common.js');
  assert.equal(safeName('Ölwanne.glb'), 'oelwanne');
  assert.equal(safeName('Kühlkörper mit Rippen.stl'), 'kuehlkoerper-mit-rippen');
  assert.equal(safeName('Maß-Probe'), 'mass-probe');
  assert.equal(safeName('???'), 'datei');
  assert.equal(safeName(''), 'werkbank');
});

test('Zeilen: esc() entschärft HTML, das ⓘ ist kein Knopf im Label', async () => {
  const R = await import('../../../web/tools/3d-studio/js/studio/rows.js');
  assert.equal(R.esc('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(R.esc(null), '');
  const row = R.numberRow({ ui: 'cell', label: 'Zellkante', unit: 'mm', help: 'zelle' });
  assert.ok(!/<button/.test(row), 'kein <button> im <label>: das Label gehört sonst dem ⓘ, nicht dem Feld');
  assert.match(row, /<span role="button" tabindex="0" class="st-info" data-help="zelle"/);
  assert.ok(row.indexOf('st-info') < row.indexOf('<input'), 'das ⓘ steht hinter der Bezeichnung, vor dem Feld');
});

test('Drehkugel: zwei Finger auseinander zoomen HINEIN, die Mitte verschiebt, ein Finger dreht ohne Sprung', async () => {
  const T = await import('three');
  const { TrackballControls } = await import('../../../web/tools/3d-studio/js/trackball.js');
  const dom = { style: {}, addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const cam = new T.PerspectiveCamera(45, 800 / 600, 1, 10000);
  cam.position.set(0, 0, 500);
  const tb = new TrackballControls(cam, dom);
  const pe = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y, button: 0, shiftKey: false });
  const dist = () => cam.position.distanceTo(tb.target);
  tb._down(pe(1, 350, 300));
  tb._down(pe(2, 450, 300));
  const d0 = dist();
  tb._move(pe(2, 550, 300));                                   // Abstand 100 → 200
  assert.ok(dist() < d0, 'auseinander zieht heran: ' + d0 + ' → ' + dist());
  const t0 = tb.target.clone();
  tb._move(pe(1, 400, 300)); tb._move(pe(2, 600, 300));        // beide 50 px nach rechts
  assert.ok(tb.target.distanceTo(t0) > 1, 'zwei Finger verschieben');
  tb._up(pe(2, 600, 300));                                     // einer hebt ab
  const before = cam.position.clone();
  tb._move(pe(1, 401, 300));                                   // der andere rückt einen Pixel
  const angle = before.clone().sub(tb.target).angleTo(cam.position.clone().sub(tb.target));
  assert.ok(angle < 0.05, 'ein Pixel ist ein Pixel, kein Sprung: ' + angle);
  tb._up(pe(1, 401, 300));
});

/* ── Abbruch ─────────────────────────────────────────────────── */
test('Abbruch: das Feld hört an seinem Haltepunkt auf und wirft AbortError', async () => {
  const model = buildModel(S.box([60, 40, 20]));
  const ac = new AbortController();
  let calls = 0;
  const p = buildField(model, { h: 2, band: 6, pad: 4, signal: ac.signal, onProgress: () => { if (++calls === 2) ac.abort(); } });
  await assert.rejects(p, err => isAbort(err));
  assert.ok(calls >= 2 && calls < 40, 'nach dem Abbruch keine weiteren Blöcke: ' + calls);
});

test('Abbruch: die Simulation verlässt runPackets als AbortError über das Signal', async () => {
  const N = 8;
  const solver = { step() {}, fill: () => new Float32Array(N), velocity: () => new Float32Array(3 * N), gateArrival: [], arrival: () => new Float32Array(N) };
  const ac = new AbortController();
  const domain = { N, flags: new Uint8Array(N), gates: [] };
  let snaps = 0;
  await assert.rejects(runSimulation({
    solver, engine: 'cpu', domain, stepsMax: 1000, snapEvery: 10, uAt: () => [0, 0, 0], signal: ac.signal,
    onSnapshot: () => { if (++snaps === 3) ac.abort(); return null; }
  }), err => isAbort(err));
  assert.ok(snaps < 100, 'nach dem Abbruch kein weiteres Bild: ' + snaps);
});

/* Einpassen neben Aufsätzen: das Modell steht danach GANZ im freien Rechteck —
   und nicht kleiner als nötig. Ein flaches, breites Modell unter einem
   Auswahlfeld, das die obere Hälfte des Bildes belegt, ist durch die BREITE
   begrenzt; mit dem Verhältnis der Rechteckhöhen gerechnet wurde es auf ein
   Drittel verkleinert (gemessen bei 768 px: 144 statt 320 px breit). */
test('Einpassen: ganz im freien Rechteck, aber nicht kleiner als nötig', async () => {
  const { buildDocument, installGlobals } = await import('./stubs/dom.mjs');
  const { doc } = buildDocument('<!DOCTYPE html><html><body><div id="vp"></div></body></html>');
  installGlobals(doc);
  const T = await import('three');
  const { createViewport } = await import('../../../web/tools/3d-studio/js/studio/viewport.js');
  const W = 800, H = 600;                                   // so groß ist jedes Element im Platzhalter
  const vp = createViewport(doc.getElementById('vp'), { cameraStart: [0, 0, 900], target: [0, 0, 0] });
  const cam = vp.view.camera;
  const box = new T.Box3(new T.Vector3(-200, -8, -100), new T.Vector3(200, 8, 100));   // flach und breit
  const onScreen = () => {
    cam.updateMatrixWorld(true);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const q = new T.Vector3(x, y, z).project(cam);
      const sx = (q.x + 1) / 2 * W, sy = (1 - q.y) / 2 * H;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x0, x1, y0, y1 };
  };
  const inside = (r, c) => r.x0 >= c.left - 1 && r.x1 <= c.left + c.width + 1 && r.y0 >= c.top - 1 && r.y1 <= c.top + c.height + 1;

  /* Unter dem Auswahlfeld: die untere Hälfte, so breit wie das Bild. */
  const below = { left: 0, top: H / 2, width: W, height: H / 2 };
  vp.setClearRect(() => below);
  vp.fit(box);
  const a = onScreen();
  assert.ok(inside(a, below), 'ganz in der unteren Hälfte: ' + JSON.stringify(a));
  assert.ok(a.x1 - a.x0 > 0.5 * W, 'und breit genug, um es zu sehen: ' + Math.round(a.x1 - a.x0) + ' px');

  /* Rechts daneben: die rechte Hälfte, so hoch wie das Bild. */
  const beside = { left: W / 2, top: 0, width: W / 2, height: H };
  vp.setClearRect(() => beside);
  vp.fit(box);
  const b = onScreen();
  assert.ok(inside(b, beside), 'ganz in der rechten Hälfte: ' + JSON.stringify(b));

  /* F ohne Angabe fragt das Werkzeug, was JETZT da ist. */
  const grown = box.clone().expandByPoint(new T.Vector3(600, 0, 0));
  vp.setFitTarget(() => grown);
  vp.setClearRect(() => null);
  vp.fit();
  cam.updateMatrixWorld(true);
  const tip = new T.Vector3(600, 0, 0).project(cam);
  assert.ok(Math.abs(tip.x) <= 1 && Math.abs(tip.y) <= 1, 'das neue Ende steht im Bild');
});
