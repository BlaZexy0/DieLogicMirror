/* Zentraler Zustand: Eingabewerte, Schusskurve, gewähltes Maschinen-Preset.
   UI-Module schreiben in den Zustand und rufen notify(); die Seiten-Einstiege
   (main.js / single.js) abonnieren mit subscribe() und rendern neu.

   Der Zustand ist der design-Abschnitt des aktuellen Projekts
   (shared/project.js, als klassisches Script vor den Modulen geladen):
   Dashboard, Einzelseiten und die anderen Werkzeuge sehen dieselbe
   Auslegung, und ein Reload verliert nichts. */

import { FOLLOWS, AUTO_KEYS, allFields, DEFAULT_CURVE, PRESET_DOMAINS } from '../config/fields.js';
import { clampToDomain } from './domain.js';

if (!window.__PROJECT__) throw new Error('shared/project.js nicht geladen (window.__PROJECT__ fehlt).');
const PROJECT = window.__PROJECT__;

/* Schusskurven-Definition: 'points' = editierbare Wegpunkte,
   'lopez' = López-Faura-Hernández-Anfahrt + NADCA-Füllzeit,
   'v1v2' = Rampen auf V₁ und V₂ (core/curvegen.js erzeugt die Punkte). */
export const CURVE_MODES = ['points', 'lopez', 'v1v2'];
export const DEFAULT_CURVEGEN = { mode: 'points', v1: 0.4, a1: 5, v2: 4, a2: 30 };

export const state = {
  values: {},
  curve: DEFAULT_CURVE.map(p => p.slice()),
  curveGen: Object.assign({}, DEFAULT_CURVEGEN),
  /* Auto-Schalter je Feld (config/fields.js AUTO_KEYS): core/autofit.js
     setzt die Werte vor jedem Rendern neu, das Feld ist dann schreibgeschützt. */
  auto: Object.fromEntries(Object.keys(AUTO_KEYS).map(k => [k, false])),
  machine: '',
  alloy: '',
  part: ''
};

/* Standardzustand: Feld-Defaults, überlagert von den Default-Presets der
   Domänen (PRESET_DOMAINS[].def) — die Preset-Configs sind klassische
   Scripts und zu diesem Zeitpunkt bereits geladen. */
function applyDefaults() {
  for (const f of allFields()) state.values[f.key] = f.def;
  for (const d of PRESET_DOMAINS) {
    state[d.stateKey] = d.def || '';
    const list = (window[d.global] || {})[d.listKey] || [];
    /* Organisations-Presets (shared/orgpresets.js) kennen die Beispiel-ids
       nicht unbedingt → dann das erste Preset der Liste. */
    const p = list.find(x => x.id === d.def) || list[0];
    if (p) { state[d.stateKey] = p.id; Object.assign(state.values, p.fields); }
  }
  applyFollows();
  /* Ein Preset setzt die Maschinengrenzen, nicht die daraus gewählten Werte.
     Ohne das Nachführen stünde der Kolben-Ø der GRÖSSEREN Vorgabemaschine in
     einer kleineren — gerechnet würde mit einem Querschnitt, den es nicht
     gibt (gemessen: Faktor 4,59, Füllgrad 8522,6 %). */
  clampToDomain(state.values);
}

/* Folge-Felder (fields.js FOLLOWS) auf den Wert ihrer Quelle setzen —
   nur die in `keys`, sonst alle. */
export function applyFollows(keys) {
  for (const k in FOLLOWS) {
    if (keys && !keys.includes(k)) continue;
    const src = state.values[FOLLOWS[k]];
    if (isFinite(src)) state.values[k] = src;
  }
}

applyDefaults();
loadPersisted();

const subscribers = [];
const preparers = [];

export function subscribe(fn) { subscribers.push(fn); }

/* Preparer laufen vor persist() und den Subscribern: abgeleiteter Zustand
   (z. B. generierte Schusskurven, core/curvegen.js) wird zuerst aktuell,
   damit localStorage und alle Subscriber denselben Stand sehen. */
export function addPreparer(fn) { preparers.push(fn); }

export function notify() {
  preparers.forEach(fn => fn());
  persist();
  subscribers.forEach(fn => fn());
}

function loadPersisted() {
  try {
    const data = PROJECT.getSection('design');
    if (data) applyData(data);
  } catch (e) {
    console.warn('Gespeicherter Zustand konnte nicht geladen werden — Defaults werden verwendet.', e);
  }
}

/* Zustandsdaten aus einer externen Quelle (localStorage, Share-Link,
   JSON-Datei) geprüft in den Zustand übernehmen. Unbekannte Schlüssel
   werden ignoriert, Typen erzwungen — die Quelle ist nicht vertrauenswürdig. */
export function applyData(data) {
  if (!data || typeof data !== 'object') return;
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
    /* Ältere Projekte ohne ein Folge-Feld: Vorgabe = Wert der Quelle */
    applyFollows(Object.keys(FOLLOWS).filter(k => data.values[k] == null));
  }
  if (Array.isArray(data.curve) && data.curve.length) {
    /* Nur endliche Zahlenpaare übernehmen und die Länge begrenzen —
       kaputte Quellen lassen die Kurve unverändert statt NaN zu speichern. */
    const pts = data.curve
      .filter(p => Array.isArray(p) && p.length >= 2)
      .map(p => [Number(p[0]), Number(p[1])])
      .filter(p => isFinite(p[0]) && isFinite(p[1]))
      .slice(0, 200);
    if (pts.length) state.curve = pts;
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
  if (data.auto && typeof data.auto === 'object') {
    for (const k in state.auto) if (typeof data.auto[k] === 'boolean') state.auto[k] = data.auto[k];
  }
}

export function persist() {
  try {
    PROJECT.setSection('design', {
      values: state.values, curve: state.curve, curveGen: state.curveGen, auto: state.auto,
      machine: state.machine, alloy: state.alloy, part: state.part
    });
  } catch (e) { /* localStorage voll oder deaktiviert — Zustand lebt dann nur in der Seite */ }
}

/* Alles auf die Defaults zurücksetzen (und persistieren). */
export function resetState() {
  applyDefaults();
  state.curve = DEFAULT_CURVE.map(p => p.slice());
  state.curveGen = Object.assign({}, DEFAULT_CURVEGEN);
  for (const k in state.auto) state.auto[k] = false;
  persist();
}
