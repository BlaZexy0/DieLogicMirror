/* Das Metamodell der Kammerfüllung: das trainierte Netz aus DieLogic_OF/metamodel, als ONNX im Browser.

   Gelernt hat es aus 285 OpenFOAM-Rechnungen derselben Kammer (training.n_train der Beilage; ein
   Sobol-Plan über Länge/Durchmesser λ = 5 … 20, Füllgrad φ = 0,3 … 0,7, Durchmesser D = 60 … 300 mm und
   eine Familie von Schusskurven bis knapp über die kritische Geschwindigkeit). Es bekommt λ, φ, log₁₀ D,
   die Kolbenstellung s ∈ [0, 1] und die Kurve Fr(s) auf 64 Punkten; heraus kommt je Kammerschicht das
   30 × 30 Bild des Querschnitts mit Schmelzeanteil, Geschwindigkeit (in √(gD)) und Druck.

   Es RECHNET also nicht, es erinnert sich — in Sekunden statt in Minuten, dafür nur innerhalb dessen,
   was es gesehen hat (js/simulation/engines/meta.js prüft die Grenzen, TRAINED und TRAINED_CURVE), und
   mit dem Gitter, das die Rechnungen hatten. Eine Zellkante gibt es hier nicht.

   Die Dateien liegen im Studio: models/sleeve_surrogate.onnx (3,6 MB) und die Beilage .json mit
   Eingabekonvention, Zellflächen und Zellmitten. Geladen wird erst, wenn wirklich gerechnet wird —
   onnxruntime-web bringt 14 MB WebAssembly mit, die keine andere Seite braucht.

   Scheitert das Laden, versucht es der nächste Klick noch einmal: die Zusage wird verworfen, das
   Skript-Element geht wieder, eine schon angelegte Sitzung wird freigegeben. Nur onnxruntime selbst
   merkt sich ein gescheitertes Starten seines WebAssembly („previous call to initializeWebAssembly()
   failed", „no available backend") — dann hilft nur, die Seite neu zu laden, und das sagt die Meldung.
   Passt die Beilage nicht zu dem, was runPositions füttert und liest (cond, channels), scheitert das
   Laden laut, statt still Unsinn zu zeigen. */

import { abortError } from '../abort.js';
import { fillLevel } from '../lbm/sleeve.js';
import { nextTask } from '../lbm/run.js';

const BASE = new URL('../../', import.meta.url);                  // web/tools/3d-studio/
const MODEL_URL = new URL('models/sleeve_surrogate.onnx', BASE).href;
const META_URL = new URL('models/sleeve_surrogate.json', BASE).href;
const ORT_DIR = new URL('vendor/onnxruntime/', BASE);
const ORT_URL = new URL('ort.wasm.min.js', ORT_DIR).href;

export const G = 9.81;
export const POSITIONS = 101;                                     // Kolbenstellungen s = 0 … 1
const CHUNK = 6;                                                  // Stellungen je Modellaufruf
/** So groß sind Modell und Rechenwerk, ehe sie geladen sind — die Aufwandszeile sagt es vorher
    (tests/web/3d-studio/meta.test.mjs misst die Dateien nach). */
export const MODEL_MB = 3.6;
export const ORT_MB = 14;

/** Die Grenzen des Trainings (metamodel/design.py) — daran misst das Werkzeug die Kammer. */
export const TRAINED = { lam: [5, 20], fill: [0.3, 0.7], d: [60, 300] };

/** … und die der Kurven (metamodel/shotcurves.py, _ok und sample_r): über s ∈ [0, 1] nie fallend,
    höchstens frMax · Fr_c(φ), jede Rampe höchstens aMax · g, ab sFloor des Wegs wenigstens
    floor · Fr_c, und bis Kammer voll höchstens t·√(g/D) = tStar. */
export const TRAINED_CURVE = { frMax: 1.05, aMax: 0.5, floor: 0.1, sFloor: 0.05, tStar: 60 };

/** Die kritische Froude-Zahl der Rechnungen (metamodel/physics.py, froude_critical, κ = 1): der Schwall,
    der den Querschnitt gerade füllt, Fr_c² = (1 − φ)(½ − φ·ȳ)/φ; ȳ ist die Tiefe des Schwerpunkts der
    Schmelze unter ihrem Spiegel, alles in D. Nicht v_krit der Auslegung: das stammt aus eigenen
    Rechnungen und liegt bei 40 % Füllgrad bei 0,82 · Fr_c. */
export function froudeCritical(phi) {
  const R = 0.5, ys = fillLevel(phi, R) - R;                                          // Spiegel über der Achse
  const yc = -(2 / 3) * Math.pow(Math.max(0, R * R - ys * ys), 1.5) / (phi * Math.PI * R * R);   // Schwerpunkt
  return Math.sqrt((1 - phi) * (0.5 - phi * (ys - yc)) / phi);
}

/* Was runPositions füttert und liest: die Eingänge in dieser Reihenfolge, die Kanäle in dieser. */
const COND_HEAD = ['lam', 'phi', 'log10_D_mm', 's'];
const CHANNELS = ['alpha', 'Ux', 'Uy', 'Uz', 'p_rgh'];

/** Die Beilage prüfen — ein neues Modell mit anderer Konvention soll laut scheitern. */
export function checkMeta(meta) {
  const bad = [];
  const nc = meta && meta.n_curve;
  const cond = [...COND_HEAD, ...Array.from({ length: nc > 0 ? nc : 0 }, (_, i) => 'fr_' + i)];
  if (!(nc > 1) || !Array.isArray(meta.cond) || meta.cond.join() !== cond.join()) bad.push('cond');
  if (!meta || !Array.isArray(meta.channels) || meta.channels.join() !== CHANNELS.join()) bad.push('channels');
  if (!meta || !(meta.nd > 0) || !(meta.axial_stretch > 0)) bad.push('nd');
  for (const k of ['area_D2', 'x_D', 'y_D']) if (!meta || !Array.isArray(meta[k]) || meta[k].length !== meta.nd) bad.push(k);
  if (bad.length) throw new Error('Die Beilage des Modells (models/sleeve_surrogate.json) passt nicht zu dieser Seite: ' + bad.join(', ') + ' anders als erwartet.');
}

/* Geladen wird einmal je Seite; ein zweiter Lauf wartet auf dieselbe Zusage. */
let pending = null, loaded = null;

function loadOrt() {
  if (globalThis.ort) return Promise.resolve(globalThis.ort);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ORT_URL;
    s.async = true;
    /* Scheitert es, geht das Element wieder: der nächste Versuch lädt neu. */
    const fail = msg => { s.remove(); reject(new Error(msg)); };
    s.onload = () => (globalThis.ort ? resolve(globalThis.ort) : fail('onnxruntime-web geladen, aber ohne „ort".'));
    s.onerror = () => fail('onnxruntime-web fehlt (vendor/onnxruntime).');
    document.head.appendChild(s);
  });
}

/** Eine Datei des Modells holen: `how` ist 'json' oder 'arrayBuffer'. */
function get(url, how) {
  const name = url.slice(url.lastIndexOf('models/'));
  return fetch(url).then(r => { if (!r.ok) throw new Error(name + ': HTTP ' + r.status); return r[how](); },
    err => { throw new Error(name + ' ließ sich nicht laden (' + ((err && err.message) || err) + ').'); });
}

/* onnxruntime merkt sich ein gescheitertes Starten — jeder weitere Versuch scheitert gleich. */
const ORT_STUCK = /no available backend|previous call to|initializeWebAssembly|initWasm/i;
function ortFailure(err) {
  const msg = String((err && err.message) || err);
  const kurz = msg.length > 70 ? msg.slice(0, 70) + ' …' : msg;
  return new Error(ORT_STUCK.test(msg)
    ? 'Das Rechenwerk des Metamodells (WebAssembly) ließ sich nicht starten (' + kurz + '). Die Seite neu laden, dann noch einmal simulieren.'
    : 'Das Metamodell ließ sich nicht öffnen (' + kurz + ').');
}

/** Warten, bis `promise` steht — oder bis abgebrochen wird. Die Zusage selbst läuft dann weiter. */
function untilAborted(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const stop = () => reject(abortError());
    signal.addEventListener('abort', stop, { once: true });
    promise.then(v => { signal.removeEventListener('abort', stop); resolve(v); },
      e => { signal.removeEventListener('abort', stop); reject(e); });
  });
}

/** Modell und Beilage holen (beim zweiten Mal steht beides schon). Mit `signal` endet das WARTEN beim
    Abbrechen sofort: 3,6 MB Modell und 14 MB WebAssembly laden beim ersten Lauf, und „Abbrechen" tat bis
    2026-09-22 so lange nichts. Das Laden läuft weiter und steht dem nächsten Lauf bereit. */
export function loadModel(signal) {
  if (!pending) {
    pending = (async () => {
      /* Skript, Beilage und Modell zugleich; die Sitzung entsteht erst, wenn alles da ist und die
         Beilage passt — dann bleibt keine liegen, wenn die Beilage fehlt. */
      const [ort, meta, bytes] = await Promise.all([loadOrt(), get(META_URL, 'json'), get(MODEL_URL, 'arrayBuffer')]);
      checkMeta(meta);
      ort.env.wasm.wasmPaths = ORT_DIR.href;
      /* Ohne crossOriginIsolated gibt es keine Threads — die Seite setzt dafür keine Kopfzeilen. */
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      let session;
      try {
        session = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      } catch (err) { throw ortFailure(err); }
      const names = ['cond', 'layers'].every(n => session.inputNames.includes(n)) && session.outputNames.includes('fields');
      if (!names) {
        const found = session.inputNames.join(', ') + ' → ' + session.outputNames.join(', ');
        await session.release();
        throw new Error('Das Modell (models/sleeve_surrogate.onnx) hat andere Ein- und Ausgänge als erwartet: ' + found + '.');
      }
      return { ort, meta, session };
    })().catch(err => { pending = null; throw err; });
    pending.then(b => { loaded = b; }, () => {});
  }
  return signal ? untilAborted(pending, signal) : pending;
}

/** Ob das Modell schon geladen ist — die Aufwandszeile sagt sonst dazu, dass es erst kommen muss. */
export const modelLoaded = () => !!loaded;

/** Schichten: das Modell zählt sie von der Stirnplatte, eine Schicht ist D · axial_stretch / nd hoch. */
export const layerCount = (meta, lam) => Math.max(1, Math.round(lam * meta.nd / meta.axial_stretch));

/** λ wie im Trainingsplan auf 0,1 gerundet (dort stand die bewegte Strecke in ganzen Zellen). */
export const lambdaOf = spec => Math.round(spec.length / spec.d * 10) / 10;

/**
 * Alle Kolbenstellungen rechnen.
 *
 * `fr(s)` ist die Schusskurve als Froude-Zahl über der Stellung s ∈ [0, 1]; heraus kommt je Stellung
 * ein Bild: Schmelzeanteil und Geschwindigkeitsbetrag als Bytes (Z × nd × nd), dazu das Maximum in m/s.
 */
export async function runPositions({ ort, meta, session }, { lam, fill, d, fr }, { Z, check, progress = () => {} } = {}) {
  const nd = meta.nd, nc = meta.n_curve, F = 4 + nc, per = nd * nd, K = POSITIONS;
  const uMs = Math.sqrt(G * d / 1000);
  const layers = new Float32Array(Z);
  for (let i = 0; i < Z; i++) layers[i] = (i + 0.5) * lam / Z;
  const curve = new Float32Array(nc);
  for (let i = 0; i < nc; i++) curve[i] = fr(i / (nc - 1));
  const cond = new Float32Array(K * F);
  for (let k = 0; k < K; k++) {
    cond[k * F] = lam; cond[k * F + 1] = fill; cond[k * F + 2] = Math.log10(d); cond[k * F + 3] = k / (K - 1);
    cond.set(curve, k * F + 4);
  }
  const frames = [];
  for (let k0 = 0; k0 < K; k0 += CHUNK) {
    if (check) check();
    const b = Math.min(CHUNK, K - k0), lay = new Float32Array(b * Z);
    for (let i = 0; i < b; i++) lay.set(layers, i * Z);
    const fields = (await session.run({
      cond: new ort.Tensor('float32', cond.subarray(k0 * F, (k0 + b) * F), [b, F]),
      layers: new ort.Tensor('float32', lay, [b, Z])
    })).fields;
    /* [b, 5, Z, nd, nd] — sonst läse die Schleife unten fremde Werte als Schmelzeanteil. */
    if (fields.dims.join() !== [b, CHANNELS.length, Z, nd, nd].join()) {
      throw new Error('Das Modell liefert ' + fields.dims.join(' × ') + ' statt ' + [b, CHANNELS.length, Z, nd, nd].join(' × ') + '.');
    }
    const out = fields.data, n = Z * per;
    for (let i = 0; i < b; i++) {
      const base = i * 5 * n, fillB = new Uint8Array(n), speed = new Float32Array(n);
      let uMax = 0;
      for (let q = 0; q < n; q++) {
        const a = out[base + q];
        fillB[q] = Math.round(Math.max(0, Math.min(1, a)) * 255);
        const ux = out[base + n + q], uy = out[base + 2 * n + q], uz = out[base + 3 * n + q];
        const u = Math.sqrt(ux * ux + uy * uy + uz * uz) * uMs;
        speed[q] = u;
        if (fillB[q] > 127 && u > uMax) uMax = u;
      }
      const speedB = new Uint8Array(n);
      if (uMax > 0) for (let q = 0; q < n; q++) speedB[q] = Math.round(Math.min(1, speed[q] / uMax) * 255);
      frames.push({ fill: fillB, speed: speedB, uMax });
    }
    progress((k0 + b) / K, k0 + b);
    /* Dem Browser Luft lassen: sonst steht das Bild, bis alle Stellungen durch sind. Ungedrosselt
       (js/lbm/run.js, nextTask) — setTimeout streckte jedes Paket in einem Reiter im Hintergrund. */
    await nextTask();
  }
  if (check) check();
  return frames;
}
