/* Der Viewport des gemeinsamen Rahmens: die Szene aus js/scene.js, dazu
   das, was jedes Werkzeug gleich braucht — Einpassen in den FREIEN Teil
   des Bildes (neben Auswahlfeld und Knöpfen), Zoomen zum Zeiger,
   Doppelklick ins Leere = Einpassen.

   fitVisible: js/scene.js passt in den ganzen Viewport ein; hier wird
   das Ziel um den Versatz des freien Rechtecks verschoben und der Abstand
   um das Größenverhältnis vergrößert, sodass das Modell in der Lücke
   zwischen den Aufsätzen liegt. */

import * as T from 'three';
import { initScene } from '../scene.js';

export function createViewport(container, sceneOpts = {}) {
  const view = initScene(container, { grid: false, ...sceneOpts });
  if (view.controls && 'zoomToCursor' in view.controls) view.controls.zoomToCursor = true;

  /* Wer belegt welchen Teil des Bildes? Der Rahmen meldet die Rechtecke
     seiner Aufsätze (Auswahlfeld, Knöpfe); frei ist der Rest rechts davon. */
  let clearRectFn = null;
  const setClearRect = fn => { clearRectFn = fn; };

  let lastBox = null;
  let fitTargetFn = null;
  /** Das Ziel des Einpassens als Funktion: ohne Angabe (F, Knopf, Doppelklick)
      wird gefragt, was JETZT im Bild steht — ein gemerkter Quader wäre bei
      einem Designer, dessen Körper wächst, der von vorhin. */
  const setFitTarget = fn => { fitTargetFn = fn; };
  function fit(boxOrObject, margin = 1.25) {
    const target = boxOrObject || (fitTargetFn && fitTargetFn()) || lastBox;
    if (!target) return null;
    const box = target.isBox3 ? target : new T.Box3().setFromObject(target);
    if (box.isEmpty()) return null;
    lastBox = box.clone();
    const res = view.fitTo(box, margin);
    if (!res) return null;
    const w = container.clientWidth, h = container.clientHeight;
    const clear = clearRectFn ? clearRectFn() : null;
    if (clear && w > 0 && h > 0 && (clear.left > 0 || clear.top > 0 || clear.width < w || clear.height < h)) {
      /* Das Modell soll in der Mitte des freien Rechtecks stehen: Kamera
         und Ziel um den Versatz der Mitten verschieben (in Weltmaß am
         Ziel) und den Abstand so vergrößern, dass es hineinpasst. */
      const cam = view.camera, ctl = view.controls;
      /* Wie viel kleiner muss das Modell werden? Maß ist, was das MODELL im
         Bild belegt, nicht das Verhältnis der Rechtecke: ein flaches, breites
         Modell in einem hochkant stehenden Bild ist durch die BREITE begrenzt —
         steht das freie Rechteck unter dem Auswahlfeld und ist so breit wie
         das Bild, muss gar nichts schrumpfen. Mit dem Verhältnis der Höhen
         gerechnet, wurde es dort auf ein Drittel verkleinert. Nie größer als
         ohne Aufsätze (scale ≥ 1): sonst spränge das Bild beim Wählen. */
      cam.updateMatrixWorld(true);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const corner = new T.Vector3();
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z).project(cam);
        x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x);
        y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
      }
      const pw = (x1 - x0) / 2 * w * margin, ph = (y1 - y0) / 2 * h * margin;   // belegte Bildpunkte samt Rand
      const byRect = Math.max(w / Math.max(clear.width, 1), h / Math.max(clear.height, 1));
      const byModel = Math.max(pw / Math.max(clear.width, 1), ph / Math.max(clear.height, 1));
      const scale = Number.isFinite(byModel) && byModel > 0 ? Math.min(byRect, Math.max(1, byModel)) : byRect;
      const cx = clear.left + clear.width / 2, cy = clear.top + clear.height / 2;
      const dx = (cx - w / 2), dy = (cy - h / 2);
      if (cam.isOrthographicCamera) cam.zoom = cam.zoom / scale;
      else {
        const dir = cam.position.clone().sub(ctl.target);
        /* Erst die Länge, DANN normieren: normalize() ändert dir selbst — in
           einem Ausdruck stand die Länge schon auf 1, und die Kamera landete
           `scale` Millimeter vor dem Ziel (Einpassen mit offenem Auswahlfeld). */
        const dist = dir.length();
        cam.position.copy(ctl.target).addScaledVector(dir.normalize(), dist * scale);
      }
      cam.updateProjectionMatrix();
      /* Weltmaß je Bildpunkt in der Zielebene. */
      let perPx;
      if (cam.isOrthographicCamera) perPx = (cam.top - cam.bottom) / cam.zoom / h;
      else perPx = 2 * cam.position.distanceTo(ctl.target) * Math.tan(cam.fov * Math.PI / 360) / h;
      const m = cam.matrixWorld.elements;
      const right = new T.Vector3(m[0], m[1], m[2]).normalize();
      const up = new T.Vector3(m[4], m[5], m[6]).normalize();
      /* Die Modellmitte soll zur Mitte des freien Rechtecks: also Ziel
         und Kamera entgegengesetzt verschieben. */
      const shift = right.multiplyScalar(-dx * perPx).add(up.multiplyScalar(dy * perPx));
      ctl.target.add(shift);
      cam.position.add(shift);
      cam.updateMatrixWorld();
      ctl.update();
      view.invalidate();
    }
    return res;
  }

  /* Doppelklick ins LEERE: einpassen. Wer auf einen Griff oder das Bauteil
     doppelklickt, wählt aus — und die Kamera bleibt, wo sie ist (js/handles.js:
     „Anklicken lässt die Kamera in Ruhe"). */
  const blank = new T.Raycaster(), ndc = new T.Vector2();
  const isShown = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  view.renderer.domElement.addEventListener('dblclick', ev => {
    const r = view.renderer.domElement.getBoundingClientRect();
    ndc.set((ev.clientX - r.left) / Math.max(r.width, 1) * 2 - 1, -((ev.clientY - r.top) / Math.max(r.height, 1)) * 2 + 1);
    blank.setFromCamera(ndc, view.camera);
    const hits = blank.intersectObjects(view.scene.children, true).filter(h => h.object.visible && h.object.isMesh && isShown(h.object));
    if (!hits.length) fit();
  });

  return { view, fit, setClearRect, setFitTarget, container, invalidate: view.invalidate };
}
