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

/* ── Abbruch ─────────────────────────────────────────────────── */
test('Abbruch: das Feld hört an seinem Haltepunkt auf und wirft AbortError', async () => {
  const model = buildModel(S.box([60, 40, 20]));
  const ac = new AbortController();
  let calls = 0;
  const p = buildField(model, { h: 2, band: 6, pad: 4, signal: ac.signal, onProgress: () => { if (++calls === 2) ac.abort(); } });
  await assert.rejects(p, err => isAbort(err));
  assert.ok(calls >= 2 && calls < 40, 'nach dem Abbruch keine weiteren Blöcke: ' + calls);
});

test('Abbruch: die Simulation meldet „abgebrochen" über das Signal', async () => {
  const N = 8;
  const solver = { step() {}, fill: () => new Float32Array(N), velocity: () => new Float32Array(3 * N), gateArrival: [], arrival: () => new Float32Array(N) };
  const ac = new AbortController();
  const domain = { N, flags: new Uint8Array(N), gates: [] };
  let snaps = 0;
  const run = await runSimulation({
    solver, engine: 'cpu', domain, stepsMax: 1000, snapEvery: 10, uAt: () => [0, 0, 0], signal: ac.signal,
    onSnapshot: () => { if (++snaps === 3) ac.abort(); return null; }
  });
  assert.equal(run.reason, 'abgebrochen');
  assert.ok(run.steps < 1000);
});
