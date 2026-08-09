/* Zentraler Zustand: Eingabewerte, Schusskurve, gewähltes Maschinen-Preset.
   UI-Module schreiben in den Zustand und rufen notify(); die Seiten-Einstiege
   (main.js / single.js) abonnieren mit subscribe() und rendern neu.

   Der Zustand wird in localStorage gespiegelt: Dashboard und Einzelseiten
   sehen dieselbe Auslegung, und ein Reload verliert nichts. */

import { allFields, DEFAULT_CURVE } from '../config/fields.js';

const STORAGE_KEY = 'hpdc-dashboard-state-v1';

export const state = {
  values: {},
  curve: DEFAULT_CURVE.map(p => p.slice()),
  machine: ''
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
        const x = Number(data.values[k]);
        if (data.values[k] != null && isFinite(x)) state.values[k] = x;
      }
    }
    if (Array.isArray(data.curve) && data.curve.length) {
      state.curve = data.curve
        .filter(p => Array.isArray(p) && p.length >= 2)
        .map(p => [Number(p[0]), Number(p[1])]);
    }
    if (typeof data.machine === 'string') state.machine = data.machine;
  } catch (e) {
    console.warn('Gespeicherter Zustand konnte nicht geladen werden — Defaults werden verwendet.', e);
  }
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      values: state.values, curve: state.curve, machine: state.machine
    }));
  } catch (e) { /* localStorage voll oder deaktiviert — Zustand lebt dann nur in der Seite */ }
}

/* Alles auf die Defaults zurücksetzen (und persistieren). */
export function resetState() {
  for (const f of allFields()) state.values[f.key] = f.def;
  state.curve = DEFAULT_CURVE.map(p => p.slice());
  state.machine = '';
  persist();
}
