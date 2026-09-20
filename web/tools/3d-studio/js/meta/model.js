/* Das Metamodell der Kammerfüllung: das trainierte Netz aus DieLogic_OF/metamodel, als ONNX im Browser.

   Gelernt hat es aus OpenFOAM-Rechnungen derselben Kammer in tausend Spielarten (Sobol-Plan über
   Länge/Durchmesser λ = 5 … 20, Füllgrad φ = 0,3 … 0,7, Durchmesser D = 60 … 300 mm und eine Familie
   von Schusskurven bis knapp über die kritische Geschwindigkeit). Es bekommt λ, φ, log₁₀ D, die
   Kolbenstellung s ∈ [0, 1] und die Kurve Fr(s) auf 64 Punkten; heraus kommt je Kammerschicht das
   30 × 30 Bild des Querschnitts mit Schmelzeanteil, Geschwindigkeit (in √(gD)) und Druck.

   Es RECHNET also nicht, es erinnert sich — in Sekunden statt in Minuten, dafür nur innerhalb dessen,
   was es gesehen hat (js/simulation/engines/meta.js prüft die Grenzen), und mit dem Gitter, das die
   Rechnungen hatten. Eine Zellkante gibt es hier nicht.

   Die Dateien liegen im Studio: models/sleeve_surrogate.onnx (12 MB) und die Beilage .json mit
   Eingabekonvention, Zellflächen und Zellmitten. Geladen wird erst, wenn wirklich gerechnet wird —
   onnxruntime-web bringt 14 MB WebAssembly mit, die keine andere Seite braucht. */

const BASE = new URL('../../', import.meta.url);                  // web/tools/3d-studio/
const MODEL_URL = new URL('models/sleeve_surrogate.onnx', BASE).href;
const META_URL = new URL('models/sleeve_surrogate.json', BASE).href;
const ORT_DIR = new URL('vendor/onnxruntime/', BASE);
const ORT_URL = new URL('ort.wasm.min.js', ORT_DIR).href;

export const G = 9.81;
export const POSITIONS = 101;                                     // Kolbenstellungen s = 0 … 1
const CHUNK = 6;                                                  // Stellungen je Modellaufruf

/** Die Grenzen des Trainings (metamodel/design.py) — daran misst das Werkzeug die Kammer. */
export const TRAINED = { lam: [5, 20], fill: [0.3, 0.7], d: [60, 300] };

/* Geladen wird einmal je Seite; ein zweiter Lauf wartet auf dieselbe Zusage. */
let pending = null;

function loadOrt() {
  if (globalThis.ort) return Promise.resolve(globalThis.ort);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ORT_URL;
    s.async = true;
    s.onload = () => (globalThis.ort ? resolve(globalThis.ort) : reject(new Error('onnxruntime-web geladen, aber ohne „ort".')));
    s.onerror = () => reject(new Error('onnxruntime-web fehlt (vendor/onnxruntime).'));
    document.head.appendChild(s);
  });
}

/** Modell und Beilage holen (beim zweiten Mal steht beides schon). */
export function loadModel() {
  if (!pending) {
    pending = (async () => {
      const ort = await loadOrt();
      ort.env.wasm.wasmPaths = ORT_DIR.href;
      /* Ohne crossOriginIsolated gibt es keine Threads — die Seite setzt dafür keine Kopfzeilen. */
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const [meta, session] = await Promise.all([
        fetch(META_URL).then(r => { if (!r.ok) throw new Error('models/sleeve_surrogate.json: HTTP ' + r.status); return r.json(); }),
        ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
      ]);
      return { ort, meta, session };
    })().catch(err => { pending = null; throw err; });
  }
  return pending;
}

/** Ob das Modell schon geladen ist — die Aufwandszeile sagt sonst dazu, dass es erst kommen muss. */
export const modelLoaded = () => !!pending;

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
    const out = (await session.run({
      cond: new ort.Tensor('float32', cond.subarray(k0 * F, (k0 + b) * F), [b, F]),
      layers: new ort.Tensor('float32', lay, [b, Z])
    })).fields.data;                                              // [b, 5, Z, nd, nd]
    const n = Z * per;
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
    /* Dem Browser Luft lassen: sonst steht das Bild, bis alle Stellungen durch sind. */
    await new Promise(r => setTimeout(r, 0));
  }
  if (check) check();
  return frames;
}
