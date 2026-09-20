/* Was beide Rechenverfahren von ihrer Umgebung wissen müssen: gibt es
   eine Grafikkarte, und wie schnell rechnet dieses Gerät.

   WebGPU: `navigator.gpu` allein sagt wenig — Chrome unter Linux hat das
   Objekt oft, gibt aber keinen Adapter heraus. Die alten Seiten merkten das
   erst beim Knopfdruck („kein Adapter"), und der Nutzer saß fest: Vorschlag
   und Grenzen galten der Grafikkarte, gerechnet werden konnte nie. Deshalb
   fragt probeGpu() den Adapter einmal beim Start; ohne ihn gilt die Seite
   als „ohne WebGPU" und schlägt vor, was JavaScript schafft.

   Tempo: Millisekunden je Zelle (oder Partikel) und Schritt, je Verfahren
   und Rechenwerk. Die Startwerte für JavaScript sind gemessen, die für
   WebGPU geschätzt — jeder fertige Lauf verbessert sie für DIESES Gerät und
   legt sie im Browser ab. Die Zeile „grob … s" unter der Zellkante ist damit
   nach dem ersten Lauf ehrlich.

   Dazu die Bilder, auf die JavaScript im Browser wartet (frameMs): die
   Laufschleifen (js/lbm/run.js, js/sph/run.js) geben nach je 40 ms Rechnen
   ein Bild lang an die Seite ab — sonst stünde sie still — und nach jedem
   Paket (einem Schnappschuss) noch einmal. Rund ein Bild je 40 ms Rechnen
   und eines je Paket kommen also dazu. (Bis 2026-09-19 stellten die
   Schleifen ihre Uhr nicht zurück und warteten ab den ersten 40 ms nach
   JEDEM Schritt — ein Gitterlauf dauerte 66 s statt 28 s.) */

import { fmt } from '../../studio/format.js';

const hasGpuObject = () => typeof navigator !== 'undefined' && !!navigator.gpu;

export const env = { gpu: hasGpuObject(), probed: false };

/** Einmal beim Start: gibt die Grafikkarte wirklich einen Adapter heraus? */
export async function probeGpu() {
  if (env.probed || !env.gpu) { env.probed = true; return env.gpu; }
  try { env.gpu = !!(await navigator.gpu.requestAdapter()); } catch { env.gpu = false; }
  env.probed = true;
  return env.gpu;
}

const KEY = 'dielogic-sim-tempo';
/* Das Metamodell zählt anders: ms je Kolbenstellung und Schicht (es rechnet nicht in Schritten). */
const START = { 'lbm-gpu': 6e-6, 'lbm-cpu': 1.2e-4, 'sph-gpu': 4e-5, 'sph-cpu': 3e-3, 'meta-wasm': 0.38 };
const IN_BROWSER = typeof navigator !== 'undefined' && /Mozilla/.test(navigator.userAgent || '');

/** Ein Bild in ms, auf das JavaScript im Browser wartet — siehe oben. */
const FRAME = 16;
export const frameMs = kernel => (kernel === 'cpu' && IN_BROWSER ? FRAME : 0);
/** Was an Rechnen und Warten zusammenkommt: ein Bild je 40 ms Rechnen, eines je Paket. */
const withWaits = (work, packets, f) => work + (work / 40) * f + packets * f;

/**
 * Geschätzte Laufzeit in ms.
 *   steps     erwartete Schritte          stepsMax, frames  → Schritte je Paket (wie run.js sie schneidet)
 *   c         ms je Schritt (Zellen · Tempo)
 */
export function runTime({ steps, stepsMax, frames, c, kernel }) {
  const f = frameMs(kernel);
  if (!f) return steps * c;
  const n = Math.max(1, Math.ceil(stepsMax / frames));
  return withWaits(steps * c, steps / n, f);
}
let learned = null;

function load() {
  if (learned) return learned;
  learned = {};
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : null;
    if (obj && typeof obj === 'object') for (const k of Object.keys(START)) if (obj[k] > 0 && Number.isFinite(obj[k])) learned[k] = obj[k];
  } catch { /* kein Speicher: es bleibt bei den Startwerten */ }
  return learned;
}

/** ms je Zelle/Partikel und Schritt. */
export const tempo = (engine, kernel) => load()[engine + '-' + kernel] || START[engine + '-' + kernel];

/** Ein fertiger Lauf: `ms` für `steps` Schritte über `count` Zellen/Partikel,
    in `packets` Paketen (so viele Schnappschüsse). Gelernt wird das RECHNEN:
    die Bilder, auf die gewartet wurde, gehen vorher ab (umgekehrt wie in
    runTime). Ein Lauf, der vor allem gewartet hat, sagt darüber nichts. */
export function learnTempo(engine, kernel, ms, steps, count, packets = 0) {
  if (!(ms > 50) || !(steps > 0) || !(count > 0)) return;
  const f = frameMs(kernel);
  const work = f ? (ms - packets * f) / (1 + f / 40) : ms;
  if (!(work > 0.25 * ms)) return;
  const k = engine + '-' + kernel, now = work / (steps * count);
  const t = load();
  t[k] = t[k] ? 0.5 * t[k] + 0.5 * now : now;
  try { globalThis.localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* egal */ }
}

/** „grob 8 s", „grob 3 min" — mehr Stellen hätte die Schätzung nicht verdient. */
export function roughTime(ms) {
  if (!Number.isFinite(ms)) return '';
  const s = ms / 1000;
  if (s < 1.5) return 'grob 1 s';
  if (s < 90) return 'grob ' + (s < 10 ? Math.round(s) : Math.round(s / 5) * 5) + ' s';
  const min = s / 60;
  if (min < 90) return 'grob ' + Math.round(min) + ' min';
  return 'Stunden';
}

export const kernelName = k => (k === 'gpu' ? 'WebGPU' : k === 'wasm' ? 'WebAssembly' : 'JavaScript');

export const tick = () => new Promise(r => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

/** Zellen und Partikel lesbar: „1,25 Mio.", „120 Tsd.", „4,0 Tsd.", „512". */
export const fmtCount = n => (n >= 1e6 ? fmt(n / 1e6, 2) + ' Mio.' : n >= 1e4 ? fmt(n / 1e3, 0) + ' Tsd.' : n >= 1e3 ? fmt(n / 1e3, 1) + ' Tsd.' : fmt(n, 0));

/** Speicher: unter einem Megabyte nicht „0 MB". */
export const fmtMB = bytes => (bytes < 1048576 ? '< 1 MB' : fmt(bytes / 1048576, 0) + ' MB');
