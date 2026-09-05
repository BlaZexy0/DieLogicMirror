/* Schnitt mit geschlossenen Schnittflächen (Stencil-Capping, nach dem
   Three.js-Beispiel webgl_clipping_stencil):

   Je Material-KLASSE (Materialname aus der GLB — 'steel', 'castPart',
   'coolFix', …) wird die Geometrie zweimal unsichtbar gerendert
   (Rückseiten inkrementieren den Stencil, Vorderseiten dekrementieren);
   wo der Zähler ≠ 0 bleibt, schaut man in einen aufgeschnittenen Körper —
   dort zeichnet eine große Ebene in der Klassenfarbe die Deckfläche.
   Jede Deckfläche setzt den Stencil beim Zeichnen zurück und löscht ihn
   danach komplett (onAfterRender), damit die nächste Klasse sauber startet.

   Die Zwillings-Meshes hängen als Geschwister neben den Original-Meshes:
   Sichtbarkeits-Schalter der Sidebar und der „Form öffnen"-Versatz wirken
   dadurch automatisch auch auf die Schnittflächen. Sie tragen
   userData.stencilTwin, damit Export und Neuaufbau sie erkennen. */

import * as T from 'three';

/* Halber Weg der Schnittebene je Achse: aus dem Kasten des geladenen
   Modells, ein Zehntel größer, damit die Ebene an beiden Enden ganz
   herausfährt — die Form darf beliebig groß sein. */
function extentOf(object) {
  const box = new T.Box3().setFromObject(object);
  const half = axis => Math.max(Math.abs(box.min[axis]), Math.abs(box.max[axis]), 1) * 1.1;
  return { x: half('x'), y: half('y'), z: half('z') };
}
const STEEL_CAP = 0x8e9ba2;
const CAP_SIZE = 4200;

/* „Aus" = Ebene unendlich weit weg: alles bleibt sichtbar. Die Ebene steckt
   von Anfang an in allen Materialien — nachträgliches Zuweisen von
   clippingPlanes greift in Three.js nicht zuverlässig, Mutieren immer. */
const OFF_CONSTANT = 1e9;

export function initClipCaps(scene, dieScene) {
  const plane = new T.Plane(new T.Vector3(-1, 0, 0), OFF_CONSTANT);
  let EXTENT = extentOf(dieScene);
  let twins = [];
  let caps = [];
  let last = { on: false, axis: 'x', pos: 0, flip: false };

  /* Stencil-Zwillinge: zwei geteilte Materialien, renderOrder je Klasse. */
  function stencilMat(side, op) {
    const m = new T.MeshBasicMaterial({ side });
    m.colorWrite = false;
    m.depthWrite = false;
    m.depthTest = false;
    m.stencilWrite = true;
    m.stencilFunc = T.AlwaysStencilFunc;
    m.stencilFail = op; m.stencilZFail = op; m.stencilZPass = op;
    m.clippingPlanes = [plane];
    return m;
  }
  const backMat = stencilMat(T.BackSide, T.IncrementWrapStencilOp);
  const frontMat = stencilMat(T.FrontSide, T.DecrementWrapStencilOp);

  /* Zwillinge und Deckflächen für das aktuelle Modell aufbauen. Wird nach
     jeder Änderung an den Teilen (Laden, Entfernen, Verschieben) und beim
     Wechsel des Modells neu gerufen — die alten Zwillinge kommen weg. */
  function build() {
    for (const t of twins) t.removeFromParent();
    for (const c of caps) { c.removeFromParent(); c.geometry.dispose(); c.material.dispose(); }
    twins = [];
    caps = [];

    /* Alle Modell-Materialien und die Klassen in stabiler Reihenfolge,
       Stahl zuerst. */
    const materials = new Set();
    const classOrder = [];
    const classColor = new Map();
    const sources = [];
    dieScene.traverse(o => {
      if (!o.isMesh || o.userData.stencilTwin) return;
      sources.push(o);
      materials.add(o.material);
      const n = o.material.name || 'steel';
      if (!classColor.has(n)) {
        classColor.set(n, n === 'steel' ? new T.Color(STEEL_CAP) : o.material.color.clone());
        classOrder.push(n);
      }
    });
    classOrder.sort((a, b) => (a === 'steel' ? -1 : b === 'steel' ? 1 : 0));
    const orderOf = Object.fromEntries(classOrder.map((n, i) => [n, i]));

    for (const m of materials) m.clippingPlanes = [plane];

    for (const src of sources) {
      const order = 10 + 2 * orderOf[src.material.name || 'steel'];
      for (const m of [backMat, frontMat]) {
        const t = new T.Mesh(src.geometry, m);
        t.position.copy(src.position);
        t.quaternion.copy(src.quaternion);
        t.scale.copy(src.scale);
        t.renderOrder = order;
        t.visible = false;
        t.userData.stencilTwin = true;
        src.parent.add(t);
        twins.push(t);
      }
    }

    /* Deckflächen: eine Ebene je Klasse; Inhalt (Gussteil, Temperierung …)
       minimal vor der Stahl-Deckfläche, damit er auf dem Schnitt sichtbar ist. */
    for (const name of classOrder) {
      const m = new T.MeshStandardMaterial({
        color: classColor.get(name), roughness: 0.6, metalness: 0.2, side: T.DoubleSide
      });
      m.stencilWrite = true;
      m.stencilRef = 0;
      m.stencilFunc = T.NotEqualStencilFunc;
      m.stencilFail = T.ReplaceStencilOp;
      m.stencilZFail = T.ReplaceStencilOp;
      m.stencilZPass = T.ReplaceStencilOp;
      const cap = new T.Mesh(new T.PlaneGeometry(CAP_SIZE, CAP_SIZE), m);
      cap.renderOrder = 11 + 2 * orderOf[name];
      cap.onAfterRender = renderer => renderer.clearStencil();
      cap.visible = false;
      cap.userData.capOffset = name === 'steel' ? 0.05 : 0.6;
      scene.add(cap);
      caps.push(cap);
    }
  }

  function setClip({ on, axis, pos, flip }) {
    last = { on, axis, pos, flip };
    if (!on) {
      plane.constant = OFF_CONSTANT;
      twins.forEach(t => { t.visible = false; });
      caps.forEach(c => { c.visible = false; });
      return;
    }
    const n = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis];
    plane.normal.set(...n).multiplyScalar(flip ? 1 : -1);
    const d = pos * EXTENT[axis];
    plane.constant = flip ? -d : d;
    twins.forEach(t => { t.visible = true; });
    for (const cap of caps) {
      /* Deckfläche minimal in den weggeschnittenen Halbraum versetzen —
         der Inhalt weiter als der Stahl, damit die Farben nicht flimmern. */
      cap.position.copy(plane.normal).multiplyScalar(-plane.constant - cap.userData.capOffset);
      cap.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), plane.normal);
      cap.visible = true;
    }
  }

  /** Nach Änderungen am Modell (oder mit einem anderen Modell) neu aufbauen. */
  function refresh(newDieScene) {
    if (newDieScene) dieScene = newDieScene;
    EXTENT = extentOf(dieScene);
    build();
    setClip(last);
  }

  build();
  return { setClip, refresh };
}
