/* Dateien des Studios: öffnen (der Inhalt entscheidet, nicht die Endung),
   speichern (der Plan als JSON), exportieren (Körper als STL). Lesen,
   Herunterladen und der Dateiname kommen aus js/ui/common.js — die Werkbank
   holt sie noch von dort. */

import { download, safeName, readBuffer, looksLikeJSON } from '../ui/common.js';
import { readGLB, isGLB } from '../part/glbio.js';
import { parseSTL, writeSTL } from '../part/stlio.js';
import { fmt } from './format.js';

/** Name eines Bauteils ohne Dateiendung — „deckel.stl" → „deckel". */
export const baseName = name => String(name || '').replace(/\.(stl|glb|gltf|json)$/i, '');

/** Dateiname für alles, was zu einem Bauteil gehört: <bauteil>-<was>.<endung>,
    ohne die Endung des Bauteils mitten im Namen („deckel-stl-ueberlaeufe"). */
export const exportName = (partName, what, ext) => safeName((baseName(partName) || 'bauteil') + '-' + what) + '.' + ext;

/** Dateiname für einen Plan: <bauteil>-<werkzeug>.json */
export const planName = (partName, toolId) => exportName(partName, toolId, 'json');

/** Körper als STL herunterladen, benannt wie der Plan (<bauteil>-<was>.stl);
    `title` steht im Kopf der Datei. → der Dateiname */
export function saveSTL(tris, title, partName, what) {
  const name = exportName(partName, what, 'stl');
  download(new Blob([writeSTL(tris, title)], { type: 'model/stl' }), name);
  return name;
}

/** Ein Netz aus den Bytes einer Datei: GLB oder STL, erkannt am Kopf.
    → { tris, note } — oder ein Fehler mit einer Meldung, die man lesen kann. */
export function parsePart(buf, name) {
  const glb = isGLB(buf);
  let tris;
  try { tris = glb ? readGLB(buf) : parseSTL(buf); }
  catch (err) { throw new Error((glb ? 'GLB' : 'STL') + ' „' + name + '" konnte nicht gelesen werden: ' + err.message); }
  return { tris, note: (glb ? 'GLB-Datei · ' : 'STL-Datei · ') + fmt(buf.byteLength / 1024, 0) + ' kB' };
}

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
  const { tris, note } = parsePart(buf, file.name);
  if (!handlers.part) throw new Error('Dieses Werkzeug nimmt kein Bauteil entgegen.');
  return handlers.part(tris, file.name, note);
}

/** Den Plan als JSON herunterladen. */
export function saveJSON(obj, name) {
  download(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }), name);
}

/** Ablegen auf dem Viewport: Rahmen einblenden, Datei durchreichen — mit
    `multiple` alle abgelegten (der Formaufbau nimmt mehrere STL auf einmal). */
export function wireDrop(viewport, onFile, { multiple = false } = {}) {
  for (const ev of ['dragenter', 'dragover']) {
    viewport.addEventListener(ev, e => { e.preventDefault(); viewport.classList.add('dragover'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    viewport.addEventListener(ev, e => { e.preventDefault(); viewport.classList.remove('dragover'); });
  }
  viewport.addEventListener('drop', e => {
    const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
    if (!files.length) return;
    if (multiple) onFile(files); else onFile(files[0]);
  });
}
