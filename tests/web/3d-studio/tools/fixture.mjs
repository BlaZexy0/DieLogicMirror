/* Eine Werkzeugseite unter dem DOM-Platzhalter hochfahren.

   mountPage('wandstaerke.html', 'js/studio/pages/wandstaerke.js') baut
   die echte Seite nach, lädt ihr Modul und wartet, bis das Bauteil da
   ist. Zurück kommen das Dokument, das Modul, der Testgriff (__viewer)
   und ui(name) — die Suche nach data-ui, mit der auch die Werkzeuge
   selbst ihre Felder finden. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildDocument, installGlobals } from '../stubs/dom.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'web', 'tools', '3d-studio');
export const read = f => readFileSync(resolve(ROOT, f), 'utf8');

/* Die klassischen Skripte des Projekts (Schusskurve) — wie im <head> der Seite. */
const require = createRequire(import.meta.url);
export function loadDesignScripts() {
  globalThis.window = globalThis;
  if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  for (const f of ['shared/examples/machines.js', 'shared/examples/alloys.js', 'shared/examples/parts.js', 'shared/project.js']) {
    require(resolve(ROOT, '..', '..', f));
  }
}

export const wait = async (fn, tries = 800, ms = 25) => {
  for (let i = 0; i < tries; i++) { if (fn()) return true; await new Promise(r => setTimeout(r, ms)); }
  throw new Error('nicht eingetreten: ' + fn.toString().slice(0, 80));
};

export async function mountPage(html, moduleFile, { search = '', design = false, variant = '' } = {}) {
  const { doc } = buildDocument(read(html));
  installGlobals(doc);
  globalThis.location = { search, href: 'http://test/' + html + search, pathname: '/' + html };
  if (design) loadDesignScripts();
  /* Als file://-URL: ein absoluter Windows-Pfad ist für den ESM-Loader keine URL. */
  const mod = await import(pathToFileURL(resolve(ROOT, moduleFile)).href + (variant ? '?variante=' + variant : ''));
  const v = mod.__viewer;
  await wait(() => v.state.ready, 1200);
  const ui = name => doc.querySelector('[data-ui="' + name + '"]');
  return { doc, mod, v, ui, shell: v.shell, host: v.host, tool: v.tool };
}

/** Ein Kennzahlenblock (.krow) als Text „Bezeichnung Wert". */
export const kpiText = el => el ? [...el.querySelectorAll('.krow')].map(r => r.textContent.trim()).join(' | ') : '';

/* Messwerte und Felder nie mit assert.equal vergleichen: schlägt es fehl,
   baut Node einen Unterschied über Millionen Werte und frisst den Speicher
   (ein Lauf brauchte 25 GB). Gleichheit der Instanz genügt. */
export const same = (a, b, msg) => assert.ok(a === b, msg);

/** Ein Segmentschalter: sein Knopf mit dem Wert `value`. */
export const seg = (el, value) => el.querySelectorAll('button').find(b => b.dataset.value === value);

/** Ein Feld setzen und „change" feuern, wie beim Verlassen des Felds. */
export const set = (el, val) => { el.value = val; el.dispatch('change'); };

/**
 * Mit der Seite umgehen wie eine Hand — was die Werkzeugtests vorher jeder
 * für sich definierten. P kommt aus mountPage, T3 ist 'three'; Kamera und
 * Leinwand sind ohne Angabe die der Seite.
 *   zeiger(typ, x, y, extra)  ein Zeigerereignis auf der Leinwand (linke Taste)
 *   klick(x, y)               drücken und loslassen an derselben Stelle
 *   px([x, y, z])             der Bildpunkt eines Weltpunkts (Leinwand 800 × 600)
 *   schauAuf(von, auf)        die Kamera von … auf …, oben ist +Y
 *   vonOben(auf, hoehe)       senkrecht darüber, oben ist −Z (die Trennebene flach)
 *   chip(id)                  der Chip über dem Bild [data-chip]
 *   taste(key, extra)         eine Taste an die Seite, gerichtet an die Leinwand
 *   gruppen(), gruppe(name)   die Gruppenreiter des Auswahlfelds; einen wählen
 *   setze(feld, wert)         ein Feld (data-ui-Name oder Element) setzen, „change"
 */
export function interact(P, { T3, cam = P.v.view.camera, canvas = P.v.view.renderer.domElement } = {}) {
  const zeiger = (t, x, y, extra = {}) => canvas.dispatch(t, { button: 0, clientX: x, clientY: y, stopPropagation() {}, preventDefault() {}, ...extra });
  const settle = () => { cam.updateMatrixWorld(true); P.v.view.scene.updateMatrixWorld(true); };
  const tabs = () => P.ui('sel-groups').querySelectorAll('[data-group-tab]');
  return {
    cam, canvas, zeiger,
    klick: (x, y) => { zeiger('pointerdown', x, y); zeiger('pointerup', x, y); },
    px: p => { const q = new T3.Vector3(...p).project(cam); return [(q.x + 1) / 2 * 800, (1 - q.y) / 2 * 600]; },
    schauAuf: (from, to) => { cam.position.set(...from); cam.up.set(0, 1, 0); cam.lookAt(...to); settle(); },
    vonOben: (at, hoehe = 400) => { cam.position.set(at[0], at[1] + hoehe, at[2]); cam.up.set(0, 0, -1); cam.lookAt(at[0], at[1], at[2]); settle(); },
    chip: id => P.doc.querySelector('[data-chip="' + id + '"]'),
    taste: (key, extra = {}) => P.doc.dispatch('keydown', { key, target: canvas, preventDefault() {}, ...extra }),
    gruppen: () => tabs().map(b => b.getAttribute('data-group-tab')),
    gruppe: name => tabs().find(b => b.getAttribute('data-group-tab') === name).dispatch('click'),
    setze: (feld, wert) => set(typeof feld === 'string' ? P.ui(feld) : feld, wert)
  };
}
