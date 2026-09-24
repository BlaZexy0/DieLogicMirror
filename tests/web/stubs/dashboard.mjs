/* Gemeinsamer Vorspann der Dashboard-Tests (tests/web/*.test.mjs), wie
   tests/web/3d-studio/stubs/ für das Studio. Vorher schrieb jede Datei ihn
   selbst: window als globaler Scope, ein Leerspeicher für localStorage, die
   klassischen Skripte der Seite, das Theme-Objekt der Auslegung, die
   Feld-Standardwerte und je eine eigene Attrappe des 2D-Kontexts.

   Beim Import stehen window und localStorage; alles Weitere holt sich die
   Testdatei:
     ladeSkripte()      shared/palette.js, theme.js, Maschinen-Presets,
                        project.js, clampmodel.js (oder eine eigene Liste)
     auslegung(pfad)    ein Modul aus web/tools/auslegung/js
     themeLaden()       das Theme-Objekt der Auslegung mit den Rollen
     defaults()         die Feld-Standardwerte (config/fields.js), frisch
     canvasGlobals()    Path2D, document.createElement('canvas'), getComputedStyle
     stummerKontext()   2D-Kontext, der alles schluckt
     zeichnenderKontext() 2D-Kontext, der Koordinaten und Texte mitschreibt
     kpiZiele()         die Elemente, in die renderKpis schreibt */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const site = path.join(root, 'web');

globalThis.window = globalThis;
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem: () => {} };

/* Die klassischen Skripte, die die Module der Auslegung voraussetzen
   (window.__PALETTE__, __THEME__, __MACHINES__, __PROJECT__, __CLAMP_MODEL__). */
export const SKRIPTE = ['shared/palette.js', 'shared/theme.js', 'shared/examples/machines.js',
  'shared/project.js', 'shared/clampmodel.js'];
export function ladeSkripte(liste = SKRIPTE) {
  for (const f of liste) require(path.join(site, f));
}

/* Ein Modul der Auslegung, Pfad relativ zu web/tools/auslegung/js. */
export const auslegung = rel => import(pathToFileURL(path.join(site, 'tools/auslegung/js', rel)));

/* Das Theme-Objekt der Auslegung, gefüllt mit den Rollen aus shared/theme.js
   (setzt ladeSkripte() voraus). */
export async function themeLaden() {
  const { theme } = await auslegung('core/theme.js');
  Object.assign(theme, globalThis.__THEME__);
  return theme;
}

/* Die Feld-Standardwerte — jedes Mal ein frisches Objekt. */
const { allFields } = await auslegung('config/fields.js');
export function defaults() {
  const v = {};
  for (const f of allFields()) v[f.key] = f.def;
  return v;
}

/* 2D-Kontext, der jeden Aufruf schluckt; measureText rechnet 6 px je
   Zeichen. Zugewiesene Eigenschaften bleiben lesbar (die Schraffur-Kachel
   wird einmal bemalt und später als Pattern gelesen). */
export function stummerKontext() {
  const target = {
    measureText: s => ({ width: String(s).length * 6 }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

/* 2D-Kontext, der mitschreibt, WAS gezeichnet wird: jede Koordinate
   (log.coords), jeden Text mit Farbe und Schrift (log.texts) und die Zahl
   der Pfade (log.calls). */
export function zeichnenderKontext() {
  const log = { coords: [], texts: [], calls: 0 };
  const num = (...xs) => { for (const x of xs) if (typeof x === 'number') log.coords.push(x); };
  const api = {
    log, fillStyle: '#000', strokeStyle: '#000', font: '11px Arial', textAlign: 'left', globalAlpha: 1,
    save() {}, restore() {}, beginPath() { log.calls++; }, closePath() {}, stroke() {}, fill() {}, clip() {},
    setLineDash() {}, translate: num, rotate() {}, scale() {}, setTransform() {},
    moveTo: num, lineTo: num, arc: num, rect: num, fillRect: num, strokeRect: num,
    createPattern: () => ({}), createLinearGradient: () => ({ addColorStop() {} }),
    getImageData: (a, b, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, drawImage() {},
    measureText: s => ({ width: String(s).length * 6 }),
    fillText(s, x, y) { log.texts.push({ s: String(s), x, y, fill: api.fillStyle, font: api.font }); num(x, y); },
    strokeText(s, x, y) { num(x, y); }
  };
  return api;
}

/* Was die Renderer außerhalb des Kontexts brauchen: Path2D, ein Canvas für
   die Schraffur-Kachel (behält seinen Kontext) und getComputedStyle. */
export class Path2DStub { moveTo() {} lineTo() {} closePath() {} rect() {} arc() {} addPath() {} }
export function canvasGlobals(kontext = stummerKontext) {
  globalThis.Path2D = Path2DStub;
  globalThis.getComputedStyle = () => ({ fontFamily: 'Arial', getPropertyValue: () => '' });
  globalThis.document = Object.assign(globalThis.document || {}, {
    createElement: () => { const g = kontext(); return { width: 0, height: 0, getContext: () => g }; },
    documentElement: { clientWidth: 900 }, body: { classList: { toggle() {} } },
  });
}

/* Die Ziele von renderKpis(el, v, shot, chamberEl): die Panels (el), die
   Kammerkarte (chamberEl) und über document.getElementById Lineal, Urteil
   und Prüfleiste. alle() liefert das ganze erzeugte Markup. */
export function kpiZiele() {
  const ziel = () => ({ innerHTML: '', closest: () => null, querySelectorAll: () => [] });
  const byId = { 'chamber-ruler': ziel(), 'chamber-verdict': ziel(), checkbar: ziel() };
  globalThis.document = Object.assign(globalThis.document || {}, {
    getElementById: id => byId[id] || null,
    querySelectorAll: () => [],
  });
  const el = ziel(), chamberEl = ziel();
  return {
    el, chamberEl, byId,
    alle: () => [el, chamberEl, ...Object.values(byId)].map(z => z.innerHTML).join('\n')
  };
}
