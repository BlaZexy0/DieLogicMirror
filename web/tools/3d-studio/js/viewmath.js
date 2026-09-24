/* Rechnen mit Kamera und Zeiger — einmal für alle, die es brauchen: die
   Griffe (js/handles.js), der Trackball, das Einpassen (js/studio/
   viewport.js), das Licht (js/scene.js), das Antippen im Formaufbau und
   im Angussdesigner und der Hover der Analysen. Vorher stand jede dieser
   drei, vier Zeilen an vier, fünf Stellen. */

import * as T from 'three';

/** Weltmaß je Bildpunkt in der Ebene im Abstand `dist` vor der Kamera — bei
    der Parallelprojektion ist es überall dasselbe. */
export function perPixel(camera, dist, heightPx) {
  const h = Math.max(heightPx, 1);
  if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / h;
  return 2 * dist * Math.tan(camera.fov * Math.PI / 360) / h;
}

/** Der Zeiger in Gerätekoordinaten (−1 … 1) über dem Element. */
export function pointerNdc(ev, el, out = new T.Vector2()) {
  const r = el.getBoundingClientRect();
  return out.set((ev.clientX - r.left) / Math.max(r.width, 1) * 2 - 1, -((ev.clientY - r.top) / Math.max(r.height, 1)) * 2 + 1);
}

const ndc = new T.Vector2();
/** Den Strahl unter den Zeiger legen: vom Auge durch die Stelle im Bild. */
export function rayAt(ray, ev, el, camera) {
  ray.setFromCamera(pointerNdc(ev, el, ndc), camera);
  return ray;
}

/** Rechts und oben des Bildes als Weltrichtungen, aus der Kameramatrix. */
export function cameraAxes(camera, right = new T.Vector3(), up = new T.Vector3()) {
  const m = camera.matrixWorld.elements;
  right.set(m[0], m[1], m[2]).normalize();
  up.set(m[4], m[5], m[6]).normalize();
  return { right, up };
}

/**
 * Was unter dem Zeiger liegt, ohne zu warten und ohne zu stocken. Ein
 * Strahlentest ohne Beschleunigungsstruktur über ein großes Netz kostet
 * Millisekunden (gemessen 9,7 ms je Ereignis bei 197k Dreiecken), und
 * pointermove feuert so oft, wie der Zeiger Positionen meldet. Deshalb
 * wird nur die zuletzt gemeldete Stelle gemerkt und höchstens einmal je
 * Bild ausgewertet: probe({ clientX, clientY }) — so, wie rayAt sie nimmt.
 * Verlässt der Zeiger das Bild, kommt leave().
 */
export function hoverProbe(el, probe, leave) {
  let at = null, queued = false;
  el.addEventListener('pointermove', ev => {
    at = { clientX: ev.clientX, clientY: ev.clientY };
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (at) probe(at); });
  });
  el.addEventListener('pointerleave', () => { at = null; leave(); });
}
