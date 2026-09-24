/* Kleine Helfer, die die Werkzeuge und die Werkbank gleich brauchen:
   Dreiecke in ein Mesh schreiben, das Material einer Fläche, Dateien
   herunterladen, eine Richtung als Text, Dateien lesen und am Kopf
   erkennen — und die Zielmodus-Anzeige oben im Viewport (aim-banner,
   aim-text, aim-cancel), die jede Seite mit Griffen zeigt. */

import * as T from 'three';
import { $ } from '../ui/controls.js';

/** Das Material einer Fläche im Studio: beidseitig (ein Netz aus einer
    Datei ist nicht immer richtig gewickelt, und man schaut in Taschen
    hinein), mit Flächenschattierung (die Dreieckssuppen teilen keine
    Ecken) — Rauheit und Metallanteil nennt, wer malt: ohne Umgebungskarte
    macht Metall eine Fläche nur dunkel, also fast keins. Alles Weitere
    (durchscheinend, Punktfarben, polygonOffset) geht durch. */
export function surfaceMaterial(color, { roughness = 0.6, metalness = 0.05, flat = true, ...rest } = {}) {
  return new T.MeshStandardMaterial({ color, roughness, metalness, side: T.DoubleSide, flatShading: flat, ...rest });
}

/** Freigeben, was die Grafikkarte hält: Geometrien, Materialien und ihre
    Texturen, für JEDEN Knoten unter `root`. `skip(o)` lässt Knoten aus, die
    anderen gehören (die Stencil-Zwillinge des Schnitts), `keep` Materialien,
    die mehrere teilen. */
export function disposeTree(root, { skip = null, keep = null } = {}) {
  root.traverse(o => {
    if (skip && skip(o)) return;
    if (o.geometry) o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      if (keep && keep.has(m)) continue;
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
}

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

/** Eine Datei als ArrayBuffer — der eine Weg, auf dem das Studio Dateien
    liest. Scheitert das Lesen (Datei entfernt, Rechte, Lesefehler), sagt die
    Meldung es, statt still zu bleiben; der Name des Fehlers steht dabei. */
export async function readBuffer(file) {
  try { return await file.arrayBuffer(); }
  catch (err) {
    throw new Error('Die Datei „' + file.name + '" konnte nicht gelesen werden' + (err && err.name ? ' (' + err.name + ')' : '') + '.');
  }
}

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
