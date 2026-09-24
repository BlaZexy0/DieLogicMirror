/* WebGPU-Werkzeug für beide Kerne (js/lbm/gpu.js, js/sph/gpu.js): Gerät
   anlegen, Speicherpuffer, den Shader übersetzen, einen Puffer lesen — das
   stand bisher fast wortgleich in beiden Dateien.

   Verlorene Karte und gescheitertes Anlegen sind hier EINE Meldung statt
   eines AbortError, den der Rahmen sonst als „Abbrechen" läse (js/abort.js
   kennt nur einen Abbruch, den das Signal verlangt hat). */

/** Gibt es WebGPU? */
export function hasWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/** Die Karte ist weg (`info` aus device.lost, `err` vom Lesen): eine
    gewöhnliche Meldung, kein AbortError. */
export function lostError(info, err) {
  const why = (info && info.message) || (err && err.message) || 'Gerät verloren';
  return new Error('Die Grafikkarte ist ausgestiegen (' + why + '). Noch einmal simulieren, sonst die Seite neu laden.');
}

/** Was nach requestDevice scheitert, nimmt Gerät und Puffer mit — und kommt
    nie als AbortError heraus (er hieße „Abgebrochen"). */
export function failedSetup(device, buffers, err) {
  for (const b of buffers) b.destroy();
  device.destroy();
  if (err && err.name === 'Error') return err;
  return new Error('WebGPU: der Kern ließ sich nicht anlegen (' + ((err && err.message) || err) + ').');
}

/**
 * Adapter und Gerät — mit den nötigen Grenzen, wenn ein Puffer über 128 MB
 * geht (WebGPU erlaubt das nur, wenn requiredLimits es ausdrücklich verlangt).
 *   need                    der größte Speicherpuffer, den der Kern braucht, in Byte
 *   subject, bufWord, verb  die Meldung, wenn die Karte ihn nicht erlaubt:
 *                           „<subject> braucht … MB je <bufWord> …  <verb>."
 */
export async function openDevice(need, subject, bufWord, verb) {
  if (!hasWebGPU()) throw new Error('Kein WebGPU in diesem Browser.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU: kein Adapter (Grafikkarte nicht freigegeben?).');
  if (need > adapter.limits.maxStorageBufferBindingSize) {
    throw new Error(subject + ' braucht ' + (need / 1048576).toFixed(0) + ' MB je ' + bufWord + ', die Grafikkarte erlaubt '
      + (adapter.limits.maxStorageBufferBindingSize / 1048576).toFixed(0) + ' MB. ' + verb + '.');
  }
  const limits = {};
  if (need > 134217728) { limits.maxStorageBufferBindingSize = need; limits.maxBufferSize = need; }
  return adapter.requestDevice({ requiredLimits: limits });
}

/** Verfolgt device.lost: „destroyed" meldet das eigene dispose() — das ist
    kein Verlust. Sonst hält getLost() danach das Info-Objekt fest. */
export function lostTracker(device) {
  let lost = null;
  device.lost.then(info => { if (info.reason !== 'destroyed') lost = info; });
  return () => lost;
}

/** Einen Speicherpuffer anlegen (mindestens 16 Byte, auf vier gerundet) und in
    `buffers` vormerken — was dort steht, geht bei failedSetup und dispose(). */
export function makeBuffer(device, buffers, size, usage) {
  const b = device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage });
  buffers.push(b);
  return b;
}

/** Den Shader übersetzen. Ein Shader, der nicht übersetzt, soll sagen, warum
    — nicht nur „invalid". */
export async function compileShader(device, code) {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter(m => m.type === 'error');
  if (errors.length) throw new Error('WGSL: ' + errors.map(m => m.lineNum + ':' + m.linePos + ' ' + m.message).join(' | '));
  return module;
}

/** Einen Speicherpuffer lesen — über einen Zwischenpuffer (MAP_READ), der auf
    den Hauptspeicher abgebildet wird. `getLost` kommt aus lostTracker(device):
    das Lesen kann scheitern, ehe device.lost sich meldet. */
export async function readBuffer(device, getLost, buf, byteLength, Ctor, byteOffset = 0) {
  if (getLost()) throw lostError(getLost());
  const staging = device.createBuffer({ size: byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, byteOffset, staging, 0, byteLength);
  device.queue.submit([enc.finish()]);
  try { await staging.mapAsync(GPUMapMode.READ); }
  catch (err) { staging.destroy(); throw lostError(getLost(), err); }
  const out = new Ctor(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return out;
}
