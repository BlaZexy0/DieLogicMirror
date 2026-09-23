/* Das Metamodell: das O-Gitter und die Luft darauf, und das Modell selbst.

   Die Topologie des Querschnitts kommt aus der Beilage des Modells
   (models/sleeve_surrogate.json), das Zählen der eingeschlossenen Luft ist
   dieselbe Frage wie enclosedGas() des Gitters, nur auf diesem Gitter. Das
   Modell (3,6 MB) rechnet mit onnxruntime-web aus vendor/, wie im Browser:
   unter Node mit dem WebAssembly aus der Datei, und fetch liest die file:-
   Adressen, unter denen js/meta/model.js Beilage und Modell holt. Ein Aufruf
   mit wenigen Schichten dauert Zehntel; die ganze Welle der Vorgabe rechnet
   tools/kammerfuellung.test.mjs durch die Seite.

     systemd-run --user --scope -q -p MemoryMax=4G node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/meta.test.mjs */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'tools', '3d-studio');
const load = f => import(pathToFileURL(resolve(ROOT, f)).href);
/* Ein eigenes Exemplar von model.js — mit eigener Zusage, für Laden, das scheitern soll. */
const fresh = tag => import(pathToFileURL(resolve(ROOT, 'js/meta/model.js')).href + '?' + tag);
const VENDOR = resolve(ROOT, 'vendor/onnxruntime');
const require = createRequire(import.meta.url);
/* Modell und Sitzung tragen große Felder — nie mit assert.equal vergleichen. */
const same = (a, b, msg) => assert.ok(a === b, msg);

let meta, topo, graph, ogrid, air, Z, per, ort, model, nodeFetch;

/* file:-Adressen aus dem Studio, wie der Server sie ausliefert. */
const fileFetch = async url => {
  const buf = readFileSync(fileURLToPath(url));
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};

before(async () => {
  meta = JSON.parse(readFileSync(resolve(ROOT, 'models/sleeve_surrogate.json'), 'utf8'));
  ogrid = await load('js/meta/ogrid.js');
  air = await load('js/meta/air.js');
  topo = ogrid.buildTopology(meta);
  graph = air.buildGraph(topo);
  per = meta.nd * meta.nd;
  Z = 6;
  ort = require(resolve(VENDOR, 'ort.wasm.min.js'));
  ort.env.wasm.wasmBinary = readFileSync(resolve(VENDOR, 'ort-wasm-simd-threaded.wasm'));
  globalThis.ort = ort;
  nodeFetch = globalThis.fetch;
  globalThis.fetch = fileFetch;
  model = await load('js/meta/model.js');
});
after(() => { globalThis.fetch = nodeFetch; });

test('Die Beilage des Modells trägt, was das Gitter beschreibt', () => {
  assert.equal(meta.nd, 30);
  assert.equal(meta.n_curve, 64);
  assert.equal(meta.axial_stretch, 3);
  assert.deepEqual(meta.cond.slice(0, 4), ['lam', 'phi', 'log10_D_mm', 's']);
  assert.equal(meta.cond.length, 4 + meta.n_curve, 'λ, φ, log D, s und die Kurve');
  assert.deepEqual(meta.channels, ['alpha', 'Ux', 'Uy', 'Uz', 'p_rgh']);
  /* Die Fläche der Zellen ist der Kreis: Σ Fläche/D² = π/4. */
  const area = meta.area_D2.flat().reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(area - Math.PI / 4) < 1e-3, 'Σ Zellfläche = π/4 D²: ' + area);
});

test('Der Querschnitt hängt zusammen — auch über die vier Diagonalnähte', () => {
  const masked = [];
  for (let q = 0; q < per; q++) if (topo.inMask[q]) masked.push(q);
  /* Kernblock und vier Ringblöcke füllen das Bild ohne die vier Ecken. */
  assert.ok(masked.length > 0.6 * per && masked.length < per, 'Zellen im Gitter: ' + masked.length);
  assert.equal(masked.length, meta.area_D2.flat().filter(a => a > 0).length, 'Maske = Zellen mit Fläche');
  for (const q of masked) assert.ok(graph.start[q + 1] - graph.start[q] >= 2, 'Zelle ' + q + ' hat Nachbarn');
  /* Eine Flutfüllung über alle Zellen erreicht jede — sonst fehlte eine Naht. */
  const seen = new Set([masked[0]]), stack = [masked[0]];
  while (stack.length) {
    const q = stack.pop();
    for (let e = graph.start[q]; e < graph.start[q + 1]; e++) {
      const n = graph.nb[e];
      if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  assert.equal(seen.size, masked.length, 'ein Stück, keine losen Blöcke');
  /* Ohne die Nähte zerfiele es — die Probe dazu: die Naht-Paare sind im Bild keine Nachbarn. */
  const pairs = ogrid.cellNeighbours(topo);
  const nd = meta.nd;
  let diagonal = 0;
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1];
    const dr = Math.abs(Math.floor(a / nd) - Math.floor(b / nd)), dc = Math.abs((a % nd) - (b % nd));
    if (dr + dc !== 1) diagonal++;
  }
  assert.ok(diagonal >= 4 * topo.ra - 4, 'die Nähte sind dabei: ' + diagonal);
});

/** Sind zwei Zellen des Querschnitts Nachbarn? (Zwei Blasen dürfen sich nicht berühren.) */
const isNeighbour = (a, b) => {
  for (let e = graph.start[a]; e < graph.start[a + 1]; e++) if (graph.nb[e] === b) return true;
  return false;
};

/** Ein Bild: `fn(l, q) → Schmelzeanteil 0 … 1`. */
const frame = fn => {
  const f = new Uint8Array(Z * per);
  for (let l = 0; l < Z; l++) for (let q = 0; q < per; q++) if (topo.inMask[q]) f[l * per + q] = Math.round(fn(l, q) * 255);
  return f;
};

test('Luft: die ruhende Schmelze schließt nichts ein, eine Blase wird gezählt', () => {
  const spec = { d: 90, length: 450, fill: 0.4 };
  const vol = air.cellVolumes(meta, spec, Z, 1);
  const yD = meta.y_D.flat();
  /* Die Schmelze steht unten: alles unter der Sehne voll, darüber leer. */
  const ruhe = frame((l, q) => (yD[q] < -0.1 ? 1 : 0));
  const a0 = air.enclosedAir(graph, topo, ruhe, Z, vol);
  assert.equal(a0.bubbles, 0, 'ein Luftraum über der Schmelze');
  assert.equal(a0.enclosed, 0, 'nichts eingeschlossen');
  assert.ok(a0.total > 0, 'Luft gibt es: ' + a0.total + ' cm³');

  /* Eine Zelle Luft TIEF in der Schmelze, darüber der offene Raum wie eben:
     genau die eine Zelle ist eingeschlossen. (Der größte Raum gilt immer als
     offen — dieselbe Regel wie enclosedGas() des Gitters.) */
  const q0 = [...Array(per).keys()].find(q => topo.inMask[q] && yD[q] < -0.3);
  const offen = (l, q) => (yD[q] < -0.1 ? 1 : 0);
  const blase = frame((l, q) => (l === 2 && q === q0 ? 0 : offen(l, q)));
  const a1 = air.enclosedAir(graph, topo, blase, Z, vol);
  assert.equal(a1.bubbles, 1);
  assert.ok(Math.abs(a1.enclosed - vol[q0]) < 1e-9, 'das Volumen der einen Zelle: ' + a1.enclosed + ' gegen ' + vol[q0]);

  /* Zwei getrennte Blasen unter dem Spiegel: beide zählen, der Raum darüber nicht. */
  const q1 = [...Array(per).keys()].find(q => topo.inMask[q] && yD[q] < -0.3 && q !== q0 && !isNeighbour(q, q0));
  const zwei = frame((l, q) => ((l === 2 && q === q0) || (l === 4 && q === q1) ? 0 : offen(l, q)));
  const a2 = air.enclosedAir(graph, topo, zwei, Z, vol);
  assert.equal(a2.bubbles, 2);
  assert.ok(Math.abs(a2.enclosed - (vol[q0] + vol[q1])) < 1e-9, 'beide Blasen: ' + a2.enclosed);

  /* Teilweise gefüllte Zellen zählen anteilig, volle gar nicht. */
  const halb = frame((l, q) => (l === 2 && q === q0 ? 0.25 : offen(l, q)));
  const a3 = air.enclosedAir(graph, topo, halb, Z, vol);
  assert.ok(Math.abs(a3.enclosed - 0.75 * vol[q0]) < 1e-3 * vol[q0], 'drei Viertel Luft: ' + a3.enclosed);

  /* Der Kolben staucht die Kammer: bei halbem Weg ist jede Schicht dünner. */
  const gestaucht = air.cellVolumes(meta, spec, Z, 0.7);
  assert.ok(Math.abs(gestaucht[q0] - 0.7 * vol[q0]) < 1e-12);
});

test('Die Fläche des halben Schmelzeanteils entsteht auf dem Gitter des Modells', () => {
  const vol = ogrid.buildVolume(topo, Z);
  const yD = meta.y_D.flat();
  const fill = frame((l, q) => (yD[q] < -0.1 ? 1 : 0));
  const speed = new Uint8Array(Z * per).fill(128);
  ogrid.fillFrame(vol, { fill, speed, uMax: 2 }, { d: 90, length: 450, fill: 0.4 }, 0.5, 270);
  const { positions, colors, indices } = ogrid.extractSurface(vol, 2);
  assert.ok(indices.length > 300, 'Dreiecke: ' + indices.length / 3);
  assert.equal(colors.length, positions.length, 'je Ecke eine Farbe');
  let yMin = Infinity, yMax = -Infinity, xMin = Infinity, xMax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    xMin = Math.min(xMin, positions[i]); xMax = Math.max(xMax, positions[i]);
    yMin = Math.min(yMin, positions[i + 1]); yMax = Math.max(yMax, positions[i + 1]);
  }
  /* Die Fläche liegt in der Kammer: zwischen Kolben (135 mm) und Stirnplatte (450 mm), Radius 45. */
  assert.ok(xMin > 100 && xMax < 460, 'x von ' + xMin + ' bis ' + xMax);
  assert.ok(yMin > -46 && yMax < 46, 'y von ' + yMin + ' bis ' + yMax);
});


/* ── Das Modell selbst ─────────────────────────────────────────── */
test('Das echte Modell: cond [b, 68] und layers [b, Z] hinein, fields [b, 5, Z, 30, 30] heraus', async () => {
  const b = await model.loadModel();
  assert.ok(model.modelLoaded());
  same(await model.loadModel(), b, 'beim zweiten Mal dieselbe Zusage');
  assert.deepEqual(b.session.inputNames, ['cond', 'layers']);
  assert.deepEqual(b.session.outputNames, ['fields']);
  const B = 2, Zt = 7, F = 4 + meta.n_curve;
  assert.equal(F, 68);
  const cond = new Float32Array(B * F), lay = new Float32Array(B * Zt);
  for (let k = 0; k < B; k++) {
    cond.set([5, 0.4, Math.log10(90), k], k * F);
    for (let i = 0; i < meta.n_curve; i++) cond[k * F + 4 + i] = 0.5 * Math.sqrt(i / (meta.n_curve - 1));
    for (let i = 0; i < Zt; i++) lay[k * Zt + i] = (i + 0.5) * 5 / Zt;
  }
  const out = await b.session.run({ cond: new ort.Tensor('float32', cond, [B, F]), layers: new ort.Tensor('float32', lay, [B, Zt]) });
  assert.deepEqual(out.fields.dims, [B, 5, Zt, 30, 30]);
  /* Der Schmelzeanteil ist einer (0 … 1), und bei s = 0 liegt die Schmelze unten. */
  const n = Zt * 900, f = out.fields.data;
  let lo = Infinity, hi = -Infinity;
  for (let q = 0; q < n; q++) { lo = Math.min(lo, f[q]); hi = Math.max(hi, f[q]); }
  assert.ok(lo >= 0 && hi <= 1 && hi > 0.9, 'α von ' + lo + ' bis ' + hi);
  const yD = meta.y_D.flat(), l0 = 3 * 900;
  let unten = 0, oben = 0;
  for (let q = 0; q < 900; q++) { if (yD[q] < -0.3) unten += f[l0 + q]; if (yD[q] > 0.3) oben += f[l0 + q]; }
  assert.ok(unten > 5 * oben, 'unten Schmelze, oben Luft: ' + unten.toFixed(1) + ' gegen ' + oben.toFixed(1));
});

test('runPositions: 101 Stellungen als Bytes; ein Modell mit anderem Ausgang meldet sich, statt Unsinn zu liefern', async () => {
  const b = await model.loadModel();
  const frames = await model.runPositions(b, { lam: 5, fill: 0.4, d: 90, fr: s => 0.5 * Math.sqrt(s) }, { Z: 3 });
  assert.equal(frames.length, model.POSITIONS);
  assert.ok(frames[0].fill instanceof Uint8Array && frames[0].fill.length === 3 * per);
  assert.ok(frames.every(fr => fr.uMax >= 0 && fr.speed.length === 3 * per));
  const falsch = { ort, meta: b.meta, session: { run: async () => ({ fields: { dims: [6, 5, 4, 30, 30], data: new Float32Array(6 * 5 * 4 * 900) } }) } };
  await assert.rejects(model.runPositions(falsch, { lam: 5, fill: 0.4, d: 90, fr: () => 0.5 }, { Z: 3 }), /Das Modell liefert 6 × 5 × 4 × 30 × 30 statt 6 × 5 × 3 × 30 × 30/);
});

test('Eine Beilage mit anderer Konvention scheitert laut; gescheitertes Laden versucht der nächste Klick noch einmal', async () => {
  assert.doesNotThrow(() => model.checkMeta(meta));
  const kaputt = { ...meta, cond: ['phi', 'lam', ...meta.cond.slice(2)], channels: ['alpha', 'Uy', 'Ux', 'Uz', 'p_rgh'] };
  assert.throws(() => model.checkMeta(kaputt), /Beilage des Modells \(models\/sleeve_surrogate\.json\) passt nicht zu dieser Seite: cond, channels anders als erwartet/);
  assert.throws(() => model.checkMeta({ ...meta, n_curve: 32 }), /: cond anders/);
  const M = await fresh('kaputt');
  const liefern = { json: kaputt, status: 200 };
  globalThis.fetch = async url => (String(url).endsWith('.json')
    ? { ok: liefern.status === 200, status: liefern.status, json: async () => liefern.json }
    : fileFetch(url));
  try {
    await assert.rejects(M.loadModel(), /passt nicht zu dieser Seite: cond, channels/);
    assert.equal(M.modelLoaded(), false);
    liefern.status = 404;
    await assert.rejects(M.loadModel(), /models\/sleeve_surrogate\.json: HTTP 404/);
    /* Startet onnxruntime nicht, merkt es sich das — dann hilft nur Neuladen, und das sagt die Meldung. */
    liefern.status = 200; liefern.json = meta;
    const create = ort.InferenceSession.create;
    ort.InferenceSession.create = async () => { throw new Error("no available backend found. ERR: [wasm] Error: previous call to 'initializeWebAssembly()' failed."); };
    try {
      await assert.rejects(M.loadModel(), /^Error: Das Rechenwerk des Metamodells \(WebAssembly\) ließ sich nicht starten \(no available backend found\..* …\)\. Die Seite neu laden, dann noch einmal simulieren\.$/);
    } finally { ort.InferenceSession.create = create; }
    /* Nichts blieb hängen: der nächste Versuch lädt wirklich. */
    const b = await M.loadModel();
    assert.ok(b.session && M.modelLoaded());
    await b.session.release();
  } finally { globalThis.fetch = fileFetch; }
});

test('„Abbrechen" wartet nicht auf das Laden: das Warten endet sofort, das Laden läuft weiter und steht dem nächsten Lauf bereit', async () => {
  const M = await fresh('abbruch');
  let auf;
  const tor = new Promise(r => { auf = r; });
  globalThis.fetch = async url => { await tor; return fileFetch(url); };
  try {
    const ac = new AbortController();
    const warten = M.loadModel(ac.signal);
    setTimeout(() => ac.abort(), 20);
    const t0 = performance.now();
    await assert.rejects(warten, err => err.name === 'AbortError');
    assert.ok(performance.now() - t0 < 500, 'sofort: ' + Math.round(performance.now() - t0) + ' ms');
    assert.equal(M.modelLoaded(), false, 'das Modell ist noch nicht da');
    await assert.rejects(M.loadModel(AbortSignal.abort()), err => err.name === 'AbortError', 'schon abgebrochen: gar nicht erst warten');
    auf();
    const b = await M.loadModel(new AbortController().signal);
    assert.ok(b.session && M.modelLoaded(), 'dieselbe Zusage, fertig geladen');
    await b.session.release();
  } finally { globalThis.fetch = fileFetch; }
});

test('Grenzen und Zahlen, die mit dem Modell wandern: Fr_c wie physics.py, Größen wie die Dateien, die Hilfe wie die Beilage', async () => {
  /* froude_critical_theory aus DieLogic_OF/incompressible/metamodel/physics.py (κ = 1). */
  for (const [phi, want] of [[0.3, 1.03342], [0.4, 0.80254], [0.5, 0.62761], [0.6, 0.4834], [0.7, 0.35728]]) {
    assert.ok(Math.abs(model.froudeCritical(phi) - want) < 2e-4, 'Fr_c(' + phi + ') = ' + model.froudeCritical(phi) + ' statt ' + want);
  }
  assert.deepEqual(model.TRAINED_CURVE, { frMax: 1.05, aMax: 0.5, floor: 0.1, sFloor: 0.05, tStar: 60 });
  /* Die Aufwandszeile nennt die Größen, ehe etwas geladen ist — sie müssen zu den Dateien passen. */
  const mb = f => statSync(resolve(ROOT, f)).size / 1e6;
  assert.ok(Math.abs(mb('models/sleeve_surrogate.onnx') - model.MODEL_MB) < 0.1, 'Modell ' + mb('models/sleeve_surrogate.onnx') + ' MB, die Seite sagt ' + model.MODEL_MB);
  assert.ok(Math.abs(mb('vendor/onnxruntime/ort-wasm-simd-threaded.wasm') - model.ORT_MB) < 0.5, 'WebAssembly ' + mb('vendor/onnxruntime/ort-wasm-simd-threaded.wasm') + ' MB, die Seite sagt ' + model.ORT_MB);
  /* Die Hilfe nennt die Zahl der Rechnungen und die Größe — ein neues Modell muss sie mitbringen. */
  const help = (await load('js/simulation/kammer-help.js')).HELP.replace(/\s+/g, ' ');
  assert.ok(help.includes('aus ' + meta.training.n_train + ' OpenFOAM-Rechnungen'), 'Hilfe: ' + meta.training.n_train + ' Rechnungen');
  assert.ok(help.includes('das Modell (3,6 MB) und sein Rechenwerk (14 MB)') && model.MODEL_MB === 3.6 && model.ORT_MB === 14);
});
