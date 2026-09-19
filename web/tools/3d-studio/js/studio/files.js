/* Dateien des Studios: öffnen (der Inhalt entscheidet, nicht die Endung),
   speichern (der Plan als JSON), exportieren (Körper als STL, GLB).
   Die Helfer zum Lesen und Erkennen liegen in js/ui/common.js. */

import { download, safeName, readBuffer, looksLikeJSON } from '../ui/common.js';
import { readGLB, isGLB } from '../part/glbio.js';
import { parseSTL } from '../part/stlio.js';
import { fmt } from './format.js';

export { download, safeName };

/** Name eines Bauteils ohne Dateiendung — „deckel.stl" → „deckel". */
export const baseName = name => String(name || '').replace(/\.(stl|glb|gltf|json)$/i, '');

/** Dateiname für einen Plan: <bauteil>-<werkzeug>.json */
export const planName = (partName, toolId) => safeName((baseName(partName) || 'bauteil') + '-' + toolId) + '.json';

/**
 * Eine Datei entgegennehmen.
 *   handlers.json(obj, name)          Plan oder Werkbank-Datei
 *   handlers.part(tris, name, note)   STL/GLB
 * Wirft mit einer lesbaren Meldung, wenn nichts passt.
 */
export async function openAny(file, handlers) {
  const buf = await readBuffer(file);
  if (looksLikeJSON(buf)) {
    let obj;
    try { obj = JSON.parse(new TextDecoder().decode(buf)); }
    catch (err) { throw new Error('„' + file.name + '" ist kein lesbares JSON: ' + err.message); }
    if (!handlers.json) throw new Error('Dieses Werkzeug nimmt keine JSON-Datei entgegen.');
    return handlers.json(obj, file.name);
  }
  const glb = isGLB(buf);
  let tris;
  try { tris = glb ? readGLB(buf) : parseSTL(buf); }
  catch (err) { throw new Error((glb ? 'GLB' : 'STL') + ' „' + file.name + '" konnte nicht gelesen werden: ' + err.message); }
  if (!handlers.part) throw new Error('Dieses Werkzeug nimmt kein Bauteil entgegen.');
  return handlers.part(tris, file.name, (glb ? 'GLB-Datei · ' : 'STL-Datei · ') + fmt(buf.byteLength / 1024, 0) + ' kB');
}

/** Den Plan als JSON herunterladen. */
export function saveJSON(obj, name) {
  download(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }), name);
}

/** Ablegen auf dem Viewport: Rahmen einblenden, Datei durchreichen. */
export function wireDrop(viewport, onFile) {
  for (const ev of ['dragenter', 'dragover']) {
    viewport.addEventListener(ev, e => { e.preventDefault(); viewport.classList.add('dragover'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    viewport.addEventListener(ev, e => { e.preventDefault(); viewport.classList.remove('dragover'); });
  }
  viewport.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) onFile(f);
  });
}
