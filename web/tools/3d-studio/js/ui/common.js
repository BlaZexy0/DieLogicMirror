/* Kleine Helfer, die die Entwurfswerkzeuge und die Werkbank gleich
   brauchen: Dreiecke in ein Mesh schreiben, Dateien herunterladen, eine
   Richtung als Text, Dateien lesen und am Kopf erkennen — und die
   Zielmodus-Anzeige oben im Viewport (aim-banner, aim-text, aim-cancel),
   die jede Seite mit Griffen zeigt. Was hier steht, stand vorher in vier
   Seiten je einmal. */

import * as T from 'three';
import { $ } from '../ui/controls.js';

/** Dreieckssuppe in ein Mesh schreiben — in den vorhandenen Puffer, wenn
    die Größe passt (beim Ziehen ändert sich nur der Inhalt). */
export function setTris(mesh, tris, smooth = false) {
  const attr = mesh.geometry.getAttribute('position');
  if (attr && attr.array.length === tris.length) {
    attr.array.set(tris);
    attr.needsUpdate = true;
    mesh.geometry.boundingSphere = null;
    mesh.geometry.boundingBox = null;
    if (smooth) mesh.geometry.computeVertexNormals();
  } else {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(tris), 3));
    if (smooth) geo.computeVertexNormals();
    mesh.geometry.dispose();
    mesh.geometry = geo;
  }
  mesh.visible = tris.length > 0;
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* Umlaute werden umschrieben, nicht verschluckt: aus „Ölwanne" wurde
   sonst „-lwanne", aus „Kühlkörper" „k-hlk-rper". */
const UMLAUT = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
export const safeName = s => (s || 'werkbank').replace(/\.(stl|glb|json)$/i, '').replace(/[äöüÄÖÜß]/g, c => UMLAUT[c])
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'datei';

/** Die nächstliegende Achse als Text — drei Dezimalzahlen sagen niemandem etwas. */
export function dirText(d) {
  const ax = ['X', 'Y', 'Z'];
  let best = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(d[i]) > Math.abs(d[best])) best = i;
  const name = (d[best] < 0 ? '−' : '+') + ax[best];
  return Math.abs(d[best]) > 0.985 ? name : 'schräg, überwiegend ' + name;
}

/** Der Strahl liefert die nach INNEN gerichtete Normale; Elemente wachsen nach außen. */
export const outward = d => [-d[0], -d[1], -d[2]];

export const readBuffer = file => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(new Error('Die Datei „' + file.name + '" konnte nicht gelesen werden.'));
  fr.readAsArrayBuffer(file);
});

/** Ist der Anfang einer Datei eine geschweifte Klammer? Dann ist es JSON. */
export function looksLikeJSON(buffer) {
  const head = new Uint8Array(buffer, 0, Math.min(64, buffer.byteLength));
  let i = 0;
  while (i < head.length && head[i] <= 32) i++;
  return head[i] === 0x7b;
}

/* ── Die Zielmodus-Anzeige oben im Viewport ──────────────────── */
/* Ein Feld für alle Schritte: wer zielt, schreibt seinen Text hinein und
   meldet, was „Abbrechen" tun soll. Ein Fehlklick bekommt kurz eine
   Antwort, dann steht wieder die Anweisung. */
export function createAimUI() {
  const banner = $('aim-banner'), text = $('aim-text');
  let missTimer = 0, onCancel = null;
  function show(on, msg) {
    clearTimeout(missTimer);
    banner.classList.toggle('hidden', !on);
    banner.classList.remove('miss');
    if (msg) text.textContent = msg;
  }
  function miss(msg, stillAiming) {
    clearTimeout(missTimer);
    const keep = text.textContent;
    banner.classList.add('miss');
    text.textContent = msg || 'Daneben: die Stelle muss auf dem Bauteil liegen.';
    missTimer = setTimeout(() => {
      if (stillAiming && stillAiming()) { banner.classList.remove('miss'); text.textContent = keep; }
      else show(false);
    }, 1600);
  }
  /** Eine Meldung ohne Zielmodus (z. B. „zuerst ein Bauteil laden"), die von selbst verschwindet. */
  function note(msg, ms = 3200) {
    show(true, msg);
    missTimer = setTimeout(() => show(false), ms);
  }
  $('aim-cancel').addEventListener('click', () => { if (onCancel) onCancel(); show(false); });
  return {
    show, miss, note,
    hide() { show(false); },
    set onCancel(fn) { onCancel = fn; },
    get onCancel() { return onCancel; }
  };
}
