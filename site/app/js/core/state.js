/* Zentraler Zustand: Eingabewerte, Schusskurve, gewähltes Maschinen-Preset.
   UI-Module schreiben in den Zustand und rufen notify(); die Seiten-Einstiege
   (main.js / single.js) abonnieren mit subscribe() und rendern neu.

   Der Zustand wird in localStorage gespiegelt: Dashboard und Einzelseiten
   sehen dieselbe Auslegung, und ein Reload verliert nichts. */

import { allFields, DEFAULT_CURVE, PRESET_DOMAINS } from '../config/fields.js';

/* Der Schlüssel kommt aus dem gemeinsamen Vertrag (shared/contract.js,
   als klassisches Script vor den Modulen geladen) — dieselbe Quelle
   nutzt die STL-Analyse für die Übernahme. */
if (!window.__DASH_CONTRACT__) throw new Error('shared/contract.js nicht geladen (window.__DASH_CONTRACT__ fehlt).');
const STORAGE_KEY = window.__DASH_CONTRACT__.STORAGE_KEY;

/* Schusskurven-Definition: 'points' = editierbare Wegpunkte,
   'lopez' = López-Faura-Hernández-Anfahrt + NADCA-Füllzeit,
   'v1v2' = Rampen auf V₁ und V₂ (core/curvegen.js erzeugt die Punkte). */
export const CURVE_MODES = ['points', 'lopez', 'v1v2'];
export const DEFAULT_CURVEGEN = { mode: 'points', v1: 0.4, a1: 5, v2: 4, a2: 30 };

export const state = {
  values: {},
  curve: DEFAULT_CURVE.map(p => p.slice()),
  curveGen: Object.assign({}, DEFAULT_CURVEGEN),
  machine: '',
  alloy: '',
  part: ''
};

for (const f of allFields()) state.values[f.key] = f.def;
loadPersisted();

const subscribers = [];

export function subscribe(fn) { subscribers.push(fn); }

export function notify() { persist(); subscribers.forEach(fn => fn()); }

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.values) {
      for (const k in state.values) {
        if (data.values[k] == null) continue;
        if (typeof state.values[k] === 'string') {
          /* Select-Felder (z. B. vacModel) sind Strings. */
          state.values[k] = String(data.values[k]);
        } else {
          const x = Number(data.values[k]);
          if (isFinite(x)) state.values[k] = x;
        }
      }
    }
    if (Array.isArray(data.curve) && data.curve.length) {
      state.curve = data.curve
        .filter(p => Array.isArray(p) && p.length >= 2)
        .map(p => [Number(p[0]), Number(p[1])]);
    }
    if (data.curveGen && typeof data.curveGen === 'object') {
      if (CURVE_MODES.includes(data.curveGen.mode)) state.curveGen.mode = data.curveGen.mode;
      for (const k of ['v1', 'a1', 'v2', 'a2']) {
        const x = Number(data.curveGen[k]);
        if (isFinite(x) && x > 0) state.curveGen[k] = x;
      }
    }
    for (const d of PRESET_DOMAINS) {
      if (typeof data[d.stateKey] === 'string') state[d.stateKey] = data[d.stateKey];
    }
  } catch (e) {
    console.warn('Gespeicherter Zustand konnte nicht geladen werden — Defaults werden verwendet.', e);
  }
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      values: state.values, curve: state.curve, curveGen: state.curveGen,
      machine: state.machine, alloy: state.alloy, part: state.part
    }));
  } catch (e) { /* localStorage voll oder deaktiviert — Zustand lebt dann nur in der Seite */ }
}

/* Alles auf die Defaults zurücksetzen (und persistieren). */
export function resetState() {
  for (const f of allFields()) state.values[f.key] = f.def;
  state.curve = DEFAULT_CURVE.map(p => p.slice());
  state.curveGen = Object.assign({}, DEFAULT_CURVEGEN);
  for (const d of PRESET_DOMAINS) state[d.stateKey] = '';
  persist();
}
