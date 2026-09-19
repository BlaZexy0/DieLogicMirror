/* Eine Werkzeugseite unter dem DOM-Platzhalter hochfahren.

   mountPage('wandstaerke.html', 'js/studio/pages/wandstaerke.js') baut
   die echte Seite nach, lädt ihr Modul und wartet, bis das Bauteil da
   ist. Zurück kommen das Dokument, das Modul, der Testgriff (__viewer)
   und ui(name) — die Suche nach data-ui, mit der auch die Werkzeuge
   selbst ihre Felder finden. */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  const mod = await import(resolve(ROOT, moduleFile) + (variant ? '?variante=' + variant : ''));
  const v = mod.__viewer;
  await wait(() => v.state.ready, 1200);
  const ui = name => doc.querySelector('[data-ui="' + name + '"]');
  return { doc, mod, v, ui, shell: v.shell, host: v.host, tool: v.tool };
}

/** Ein Kennzahlenblock (.krow) als Text „Bezeichnung Wert". */
export const kpiText = el => el ? [...el.querySelectorAll('.krow')].map(r => r.textContent.trim()).join(' | ') : '';
