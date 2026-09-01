/* Dasselbe Abstandsfeld auf der Grafikkarte — WebGPU.

   Das Feld ist die einzige Stelle des Werkzeugs, die wirklich rechnet:
   für JEDEN Rasterpunkt der Abstand zu jedem Prisma in Reichweite. Auf
   der CPU sind das bei einem mittleren Angusssystem und 0,8 mm Zellweite
   einige Sekunden — zu lang, um am Regler zu ziehen. Die Aufgabe ist
   dabei die denkbar günstigste für eine GPU: Millionen Rasterpunkte, die
   nichts voneinander wissen, und je Punkt dieselben zwei Dutzend
   Rechenschritte. Ein Thread je Rasterpunkt, fertig.

   Die Formel in `SHADER` ist Zeile für Zeile dieselbe wie in
   js/runner/sdf.js. Zwei Fassungen derselben Rechnung sind eine Gefahr,
   deshalb drei Vorkehrungen:

   1. Die Reihenfolge ist festgelegt (Züge in ihrer Nummerierung,
      Prismen in ihrer Reihenfolge). Das Überspringen ist auf beiden
      Wegen EXAKT — ein übersprungenes Prisma hätte den Wert nicht
      geändert. Beide Wege liefern deshalb dasselbe Feld.
   2. `tests/web/3d-studio/runner.test.mjs` prüft die JS-Fassung gegen
      die Sweep-Geometrie; die WGSL-Fassung ist daran Zeile für Zeile
      angelehnt.
   3. Der Viewer schreibt in die Kennzahlen, welcher Weg gelaufen ist —
      man sieht also, worauf man schaut.

   Ohne WebGPU (Firefox ohne Flag, Safari älter als 18, jeder
   Kopfloser-Node-Test) fällt alles auf js/runner/sdf.js zurück. Die
   Seite funktioniert dann vollständig, nur langsamer. */

import { SEG_STRIDE, biscuitPrim, verifyField } from './sdf.js';

const SHADER = `
struct Params {
  dims:   vec4<u32>,   // nx, ny, nz, erste Ebene dieses Streifens
  span:   vec4<u32>,   // Zahl der Züge, Ebenen im Streifen, 0, 0
  origin: vec4<f32>,   // ox, oy, oz, Zellweite
  cfg:    vec4<f32>,   // band, k, Pressrest vorhanden, Pressrest-Radius
  bc:     vec4<f32>,   // Pressrest-Mitte, Dicke
  ba:     vec4<f32>,   // Pressrest-Achse, 0
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> segs: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> grps: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> field: array<f32>;

fn extrude(d2: f32, dz: f32) -> f32 {
  return min(max(d2, dz), 0.0) + length(max(vec2<f32>(d2, dz), vec2<f32>(0.0, 0.0)));
}

fn sd2dCore(x: f32, y: f32, halfTop: f32, depth: f32, r: f32, cb: f32, cosA: f32, sinA: f32) -> f32 {
  let ax = abs(x);
  let yb = depth - r;
  let dA = cosA * (ax - halfTop + r / cosA) + sinA * y;
  let dB = y - yb;
  var core: f32;
  if (dA <= 0.0 && dB <= 0.0) { core = max(dA, dB); }
  else if (dB <= 0.0) { core = dA; }
  else if (ax <= cb) { core = dB; }
  else if (y - dA * sinA <= yb) { core = dA; }
  else { core = length(vec2<f32>(ax - cb, y - yb)); }
  return core - r;
}

/* x = Abstand zum Kern (der um k über die Trennebene hinausreicht,
   damit der Übergang Luft hat und die Hüllkugel gültig bleibt),
   y = Abstand zur Trennebene (positiv oberhalb). Nur x wird weich
   vereinigt. */
fn segParts(i: u32, p: vec3<f32>, k: f32) -> vec2<f32> {
  let b = i * 6u;
  let a = segs[b];
  let t = segs[b + 1u];
  let u = segs[b + 2u];
  let v = segs[b + 3u];
  let q = segs[b + 4u];
  let d = p - a.xyz;
  let py = dot(d, v.xyz);
  let d2 = sd2dCore(dot(d, u.xyz), py, u.w, v.w, t.w, q.x, q.y, q.z);
  return vec2<f32>(max(extrude(d2, abs(dot(d, t.xyz)) - a.w), -py - k), -py);
}

fn biscuitParts(p: vec3<f32>, k: f32) -> vec2<f32> {
  let d = p - P.bc.xyz;
  let z = dot(d, P.ba.xyz);
  let dr = length(d - P.ba.xyz * z) - P.cfg.w;
  return vec2<f32>(extrude(dr, max(-z - P.bc.w, z - k)), z);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  if (k <= 1e-9) { return min(a, b); }
  let h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let nx = P.dims.x;
  let ny = P.dims.y;
  if (gid.x >= nx || gid.y >= ny || gid.z >= P.span.y) { return; }
  let kz = gid.z + P.dims.w;
  if (kz >= P.dims.z) { return; }

  let h = P.origin.w;
  let p = vec3<f32>(P.origin.x + f32(gid.x) * h,
                    P.origin.y + f32(gid.y) * h,
                    P.origin.z + f32(kz) * h);
  let band = P.cfg.x;
  let k = P.cfg.y;
  var acc = band;      // Kern, weich vereinigt
  var accCut = band;   // Trennebene des nächstliegenden Kanals

  if (P.cfg.z > 0.5) {
    let pr = biscuitParts(p, k);
    let db = max(pr.x, -band);
    if (db < band && db < acc + k) {
      if (db < acc) { accCut = clamp(pr.y, -band, band); }
      acc = max(smin(acc, db, k), -band);
    }
  }

  /* Je Zug wird nur der INDEX des nächsten Prismas mitgeführt; seine
     Trennebene wird danach einmal nachgerechnet. Zwei Register (Abstand
     und Ebene) parallel zu führen sah einfacher aus, lieferte auf dem
     Software-Rasterizer aber Paare aus zwei verschiedenen Prismen. Über
     den Index kann das nicht passieren. */
  var cur = band;
  var best: i32 = -1;
  let gc = P.span.x;
  for (var gi: u32 = 0u; gi < gc; gi = gi + 1u) {
    let sph = grps[gi * 2u];
    let rng = grps[gi * 2u + 1u];
    if (length(p - sph.xyz) - (sph.w + k) < min(band, acc + k)) {
      cur = band;
      best = -1;
      let s1 = u32(rng.y);
      for (var i = u32(rng.x); i < s1; i = i + 1u) {
        let a = segs[i * 6u];
        let q = segs[i * 6u + 4u];
        if (length(p - a.xyz) - (q.w + k) < cur) {
          let core = segParts(i, p, k).x;
          if (core < cur) {
            cur = max(core, -band);
            best = i32(i);
          }
        }
      }
      if (best >= 0 && cur < band && cur < acc + k) {
        if (cur < acc) { accCut = clamp(segParts(u32(best), p, k).y, -band, band); }
        acc = max(smin(acc, cur, k), -band);
      }
    }
  }

  field[(gid.z * ny + gid.y) * nx + gid.x] = min(max(acc, accCut), band);
}
`;

/** Gerät anfordern. Gibt null zurück, wenn es kein WebGPU gibt. */
export async function initGPU() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    if (!device) return null;
    const info = (adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null)) || {};
    /* WGSL-Fehler sind KEINE Ausnahmen: der Browser schreibt sie in die
       Konsole und gibt einen ungültigen Shader zurück. Wer das nicht
       abfragt, bekommt anstandslos ein Feld aus lauter Nullen und
       daraus ein leeres Netz — genau so ist es beim ersten Lauf im
       Browser passiert („'meta' is a reserved keyword"). Deshalb hier
       die Übersetzungsmeldungen abholen und die Pipeline asynchron
       bauen, denn nur die asynchrone Fassung meldet einen Fehlschlag. */
    const module = device.createShaderModule({ code: SHADER });
    if (module.getCompilationInfo) {
      const problems = (await module.getCompilationInfo()).messages.filter(m => m.type === 'error');
      if (problems.length) {
        throw new Error('WGSL: ' + problems.map(m => m.lineNum + ':' + m.linePos + ' ' + m.message).join(' · '));
      }
    }
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto', compute: { module, entryPoint: 'main' }
    });
    let lost = false;
    device.lost.then(() => { lost = true; });
    return {
      device, pipeline,
      get lost() { return lost; },
      name: [info.vendor, info.architecture || info.device].filter(Boolean).join(' ') || 'WebGPU',
      maxBinding: device.limits.maxStorageBufferBindingSize,
      maxBuffer: device.limits.maxBufferSize || device.limits.maxStorageBufferBindingSize
    };
  } catch (err) {
    console.warn('WebGPU steht nicht bereit:', err);
    return null;
  }
}

const align = (n, a) => Math.ceil(n / a) * a;

/* Zulässige Abweichung der Stichprobe in mm. Die GPU rechnet in
   einfacher Genauigkeit, die CPU in doppelter; gemessen wurden über alle
   Beispiele höchstens 2·10⁻⁵ mm. Alles darüber ist kein Rundungsfehler
   mehr, sondern ein Unterschied im Verfahren. */
const TOLERANCE = 1e-3;

/**
 * Das Feld auf der GPU rechnen. Wirft, wenn etwas schiefgeht — der
 * Aufrufer soll dann auf js/runner/sdf.js zurückfallen, nicht abbrechen.
 */
export async function buildFieldGPU(gpu, spec, segs, biscuit, onProgress) {
  const { device, pipeline } = gpu;
  const [nx, ny, nz] = spec.dims;
  const layer = nx * ny;

  /* Der Streifen darf die Bindungsgrenze nicht sprengen (128 MiB sind
     üblich). Deshalb in z-Scheiben rechnen und einzeln zurücklesen. */
  const limit = Math.min(gpu.maxBinding, gpu.maxBuffer, 96 * 1024 * 1024);
  const slab = Math.max(1, Math.min(nz, Math.floor(limit / (layer * 4))));
  const slabBytes = align(layer * slab * 4, 4);

  const segBuf = device.createBuffer({
    size: Math.max(align(segs.data.byteLength, 16), 16),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(segBuf, 0, segs.data);

  const gdata = new Float32Array(Math.max(segs.groups.length, 1) * 8);
  segs.groups.forEach((gr, i) => {
    const c = [0, 1, 2].map(a => (gr.min[a] + gr.max[a]) / 2);
    const r = Math.hypot(gr.max[0] - c[0], gr.max[1] - c[1], gr.max[2] - c[2]);
    gdata[i * 8] = c[0]; gdata[i * 8 + 1] = c[1]; gdata[i * 8 + 2] = c[2]; gdata[i * 8 + 3] = r;
    gdata[i * 8 + 4] = gr.start; gdata[i * 8 + 5] = gr.end;
  });
  const grpBuf = device.createBuffer({
    size: Math.max(gdata.byteLength, 16),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(grpBuf, 0, gdata);

  const fieldBuf = device.createBuffer({
    size: slabBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  });
  const readBuf = device.createBuffer({
    size: slabBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  const uniBuf = device.createBuffer({
    size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniBuf } },
      { binding: 1, resource: { buffer: segBuf } },
      { binding: 2, resource: { buffer: grpBuf } },
      { binding: 3, resource: { buffer: fieldBuf } }
    ]
  });

  const b = biscuit ? biscuitPrim(biscuit) : null;
  const uni = new ArrayBuffer(96);
  const ui = new Uint32Array(uni), uf = new Float32Array(uni);
  const data = new Float32Array(spec.samples);

  device.pushErrorScope('validation');
  device.pushErrorScope('out-of-memory');
  let scopes = [];
  try {
    for (let z0 = 0; z0 < nz; z0 += slab) {
      const depth = Math.min(slab, nz - z0);
      ui[0] = nx; ui[1] = ny; ui[2] = nz; ui[3] = z0;
      ui[4] = segs.groups.length; ui[5] = depth; ui[6] = 0; ui[7] = 0;
      uf[8] = spec.origin[0]; uf[9] = spec.origin[1]; uf[10] = spec.origin[2]; uf[11] = spec.h;
      uf[12] = spec.band; uf[13] = spec.k; uf[14] = b ? 1 : 0; uf[15] = b ? b.r : 0;
      uf[16] = b ? b.c[0] : 0; uf[17] = b ? b.c[1] : 0; uf[18] = b ? b.c[2] : 0; uf[19] = b ? b.t : 0;
      uf[20] = b ? b.axis[0] : 0; uf[21] = b ? b.axis[1] : 1; uf[22] = b ? b.axis[2] : 0; uf[23] = 0;
      device.queue.writeBuffer(uniBuf, 0, uni);

      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.ceil(nx / 4), Math.ceil(ny / 4), Math.ceil(depth / 4));
      pass.end();
      enc.copyBufferToBuffer(fieldBuf, 0, readBuf, 0, layer * depth * 4);
      device.queue.submit([enc.finish()]);

      await readBuf.mapAsync(GPUMapMode.READ, 0, layer * depth * 4);
      data.set(new Float32Array(readBuf.getMappedRange(0, layer * depth * 4)), z0 * layer);
      readBuf.unmap();
      if (onProgress) onProgress(Math.min(1, (z0 + depth) / nz));
    }
  } finally {
    for (const buf of [segBuf, grpBuf, fieldBuf, readBuf, uniBuf]) buf.destroy();
    /* Die Fehlerbereiche müssen auch auf dem Fehlerweg wieder herunter —
       sonst bleiben sie auf dem Gerät stehen und der nächste Aufruf
       erbt sie. */
    scopes = [await device.popErrorScope(), await device.popErrorScope()];
  }
  /* Auch beim Rechnen meldet WebGPU nicht über Ausnahmen. Ohne diese
     Abfrage käme ein stillschweigend leeres Feld zurück. */
  for (const scope of scopes) if (scope) throw new Error('WebGPU: ' + scope.message);
  if (gpu.lost) throw new Error('Das Grafikgerät ging während der Rechnung verloren.');

  const out = { dims: spec.dims, origin: spec.origin, h: spec.h, band: spec.band, data, backend: 'webgpu' };
  /* Stichprobe gegen die Fassung in JavaScript. Der Shader ist eine
     HANDKOPIE derselben Formel — und Node kann ihn nicht ausführen, also
     fängt ihn keine Testsuite. Ein paar hundert Punkte kosten
     Bruchteile einer Millisekunde und decken jede echte Abweichung auf;
     stimmt etwas nicht, wird geworfen und der Aufrufer rechnet auf der
     CPU weiter, statt still eine falsche Geometrie zu liefern. */
  const off = verifyField(out, spec, segs, biscuit);
  if (!(off <= TOLERANCE)) {
    throw new Error('Die Stichprobe weicht um ' + off.toFixed(4)
      + ' mm vom JavaScript-Weg ab — der Shader rechnet etwas anderes.');
  }
  return out;
}

export { SEG_STRIDE };
