/* Schnitt mit geschlossenen Schnittflächen (Stencil-Capping, nach dem
   Three.js-Beispiel webgl_clipping_stencil):

   Je TEIL und Werkstoffklasse (Materialname aus der GLB — 'steel',
   'castPart', 'coolFix', …) wird die Geometrie zweimal unsichtbar
   gerendert (Rückseiten inkrementieren den Stencil, Vorderseiten
   dekrementieren); wo der Zähler ≠ 0 bleibt, schaut man in einen
   aufgeschnittenen Körper — dort zeichnet eine Ebene in der Farbe des
   Teils die Deckfläche. Jede Deckfläche setzt den Stencil beim Zeichnen
   zurück und löscht ihn danach komplett (onAfterRender), damit das nächste
   Teil sauber startet.

   Früher gab es EINE Deckfläche je Klasse, in der Farbe des ersten Teils
   der Klasse: der zweite Kreis einer Hälfte zeigte im Schnitt die Farbe
   des ersten, und ein umgefärbter Kreis behielt die alte. Jetzt trägt jede
   Schnittfläche die Farbe ihres Teils, und bei einer Hervorhebung verblassen
   genau die Schnittflächen der Teile, die nicht dazugehören.

   Die Zwillings-Meshes hängen als Geschwister neben den Original-Meshes:
   Sichtbarkeits-Schalter der Liste und der Weg beim Öffnen wirken
   dadurch automatisch auch auf die Schnittflächen. Sie tragen
   userData.stencilTwin, damit Export und Neuaufbau sie erkennen. */

import * as T from 'three';
import { ROLE } from './part/colors.js';

/* Halber Weg der Schnittebene je Achse: aus dem Kasten des Modells, ein
   Zehntel größer, damit die Ebene an beiden Enden ganz herausfährt — die
   Form darf beliebig groß sein. Der Kasten kommt von der Baugruppe
   (js/assembly.js bounds: geschlossen UND geöffnet), damit ein Neuaufbau bei
   offener Form den Weg nicht verschiebt und die Ebene springt. */
function extentOf(box) {
  if (box.isEmpty()) return { x: 1, y: 1, z: 1 };
  const half = axis => Math.max(Math.abs(box.min[axis]), Math.abs(box.max[axis]), 1) * 1.1;
  return { x: half('x'), y: half('y'), z: half('z') };
}

/* „Aus" = Ebene unendlich weit weg: alles bleibt sichtbar. Die Ebene steckt
   von Anfang an in allen Materialien — nachträgliches Zuweisen von
   clippingPlanes greift in Three.js nicht zuverlässig, Mutieren immer. */
const OFF_CONSTANT = 1e9;

/* Eine Deckfläche ist ein Quadrat der Kantenlänge 1, das auf den Schnitt
   durch den Kasten ihres Teils gestreckt wird (update). */
const CAP_GEOMETRY = new T.PlaneGeometry(1, 1);
const Z = new T.Vector3(0, 0, 1);
/* Für ein Material ohne Farbe (kommt aus einer fremden Datei vor): Stahl im
   Schnitt, die Rolle der Kante (steelDark). */
const steelCap = () => new T.Color(ROLE.steelDark);

export function initClipCaps(scene, dieScene, bounds) {
  const plane = new T.Plane(new T.Vector3(-1, 0, 0), OFF_CONSTANT);
  let EXTENT, unit;
  let parts = [];              // je Teil und Klasse: { compId, className, meshes, twins, cap }
  let last = { on: false, axis: 'x', pos: 0, flip: false };
  let active = null;           // null = alle Deckflächen in voller Farbe

  /* Maßstab des Modells: die Versätze der Deckflächen und ihr Rand sind
     für eine Form in Millimetern bemessen (Diagonale um 2 m); ein kleines
     Teil oder eine Datei in Metern bekommt sie entsprechend kleiner. */
  function measure(box) {
    const b = box && box.isBox3 ? box : new T.Box3().setFromObject(dieScene);
    EXTENT = extentOf(b);
    unit = b.isEmpty() ? 1 : Math.min(1, Math.max(b.getSize(new T.Vector3()).length(), 1e-6) / 1000);
  }

  /* Stencil-Zwillinge: zwei geteilte Materialien, renderOrder je Teil. */
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
    for (const p of parts) {
      for (const t of p.twins) t.removeFromParent();
      p.cap.removeFromParent();
      p.cap.material.dispose();
    }
    parts = [];

    /* Alle Modell-Materialien, die Meshes je Teil und Klasse in stabiler
       Reihenfolge, Stahl zuerst. */
    const materials = new Set();
    const byKey = new Map();
    dieScene.traverse(o => {
      if (!o.isMesh || o.userData.stencilTwin) return;
      materials.add(o.material);
      const className = o.material.name || 'steel';
      const key = (o.userData.compId || o.uuid) + '\u0000' + className;
      let p = byKey.get(key);
      if (!p) {
        p = { compId: o.userData.compId || null, className, meshes: [], twins: [], cap: null };
        byKey.set(key, p);
        parts.push(p);
      }
      p.meshes.push(o);
    });
    parts.sort((a, b) => (a.className === 'steel' ? 0 : 1) - (b.className === 'steel' ? 0 : 1));

    for (const m of materials) m.clippingPlanes = [plane];

    parts.forEach((p, i) => {
      for (const src of p.meshes) {
        for (const m of [backMat, frontMat]) {
          const t = new T.Mesh(src.geometry, m);
          t.position.copy(src.position);
          t.quaternion.copy(src.quaternion);
          t.scale.copy(src.scale);
          t.renderOrder = 10 + 2 * i;
          t.visible = false;
          t.userData.stencilTwin = true;
          src.parent.add(t);
          p.twins.push(t);
        }
      }

      /* Die Deckfläche: Inhalt (Gussteil, Temperierung …) minimal vor der
         Stahl-Deckfläche, damit er auf dem Schnitt sichtbar ist. Nie
         weggeblendet (frustumCulled): läge sie außerhalb des Bildes und
         fiele ihr onAfterRender aus, bliebe der Stencil fürs nächste Teil
         stehen. */
      const m = new T.MeshStandardMaterial({ roughness: 0.6, metalness: 0.2, side: T.DoubleSide });
      m.stencilWrite = true;
      m.stencilRef = 0;
      m.stencilFunc = T.NotEqualStencilFunc;
      m.stencilFail = T.ReplaceStencilOp;
      m.stencilZFail = T.ReplaceStencilOp;
      m.stencilZPass = T.ReplaceStencilOp;
      const cap = new T.Mesh(CAP_GEOMETRY, m);
      cap.renderOrder = 11 + 2 * i;
      cap.frustumCulled = false;
      cap.onAfterRender = renderer => renderer.clearStencil();
      cap.visible = false;
      cap.userData.capOffset = (p.className === 'steel' ? 0.05 : 0.6) * unit;
      cap.userData.capOf = p.compId;
      cap.userData.className = p.className;
      scene.add(cap);
      p.cap = cap;
    });
    recolor();
  }

  /* Die Farbe jeder Deckfläche ist die ihres Teils. Bei einer Hervorhebung
     im Viewer verblassen die Deckflächen der Teile, die nicht hervorgehoben
     sind — sonst stünde ein massiver Stahlschnitt vor einem blassen
     Stahlkörper. Verblassen heißt: Farbe zum Hintergrund hin mischen, NICHT
     transparent machen — eine transparente Deckfläche käme in den zweiten
     Renderdurchgang, nach allen Stencil-Zwillingen, und der Zähler wäre dann
     längst überschrieben. */
  const FADE = new T.Color();
  function recolor() {
    /* Zur Fläche hinter dem Körper hin (Rolle viewport des Schemas), nicht
       zu einem festen Grau: dorthin verblasst, was blass sein soll. */
    FADE.set(ROLE.viewport);
    for (const p of parts) {
      const c = p.cap.material.color.copy(p.meshes[0].material.color || steelCap());
      if (active && !active.has(p.compId)) c.lerp(FADE, 0.78);
    }
  }
  /** Teile (ids), deren Schnittflächen kräftig bleiben, alle anderen
      blass; null = alle kräftig. */
  function setActive(ids) {
    active = ids ? new Set(ids) : null;
    recolor();
  }

  function setClip({ on, axis, pos, flip }) {
    last = { on, axis, pos, flip };
    if (!on) {
      plane.constant = OFF_CONSTANT;
    } else {
      const n = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis];
      plane.normal.set(...n).multiplyScalar(flip ? 1 : -1);
      const d = pos * EXTENT[axis];
      plane.constant = flip ? -d : d;
    }
    update();
  }

  /* Welche Teile schneidet die Ebene, und wo? Gezeichnet werden nur deren
     Zwillinge und Deckflächen — ein Körper ganz auf einer Seite zählt sich
     zu null, seine Durchgänge wären verschenkt —, und jede Deckfläche ist
     nur so groß wie der Schnitt durch den Kasten ihres Teils. Vorher füllte
     je Klasse eine 4,2 m große Ebene den ganzen Bildschirm. Das Bild bleibt
     dasselbe; ohne Grafikkarte (SwiftShader) wird ein Bild mit Schnitt so
     gut ein Drittel schneller, mit Grafikkarte merkt man keinen Unterschied.
     Nach jedem Öffnen, Ein- und Ausblenden neu: da wandern und
     verschwinden die Kästen. */
  const box = new T.Box3(), part = new T.Box3();
  const u = new T.Vector3(), v = new T.Vector3(), foot = new T.Vector3(), corner = new T.Vector3();
  const turn = new T.Quaternion();
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  function update() {
    if (last.on) {
      dieScene.updateMatrixWorld();
      turn.setFromUnitVectors(Z, plane.normal);
      u.set(1, 0, 0).applyQuaternion(turn);
      v.set(0, 1, 0).applyQuaternion(turn);
      foot.copy(plane.normal).multiplyScalar(-plane.constant);
    }
    for (const p of parts) {
      let cut = false;
      if (last.on) {
        box.makeEmpty();
        for (const m of p.meshes) {
          if (!shown(m)) continue;
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          box.union(part.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
        }
        cut = !box.isEmpty() && box.intersectsPlane(plane);
      }
      for (const t of p.twins) t.visible = cut;
      p.cap.visible = cut;
      if (!cut) continue;
      /* Den Kasten auf die Ebene werfen: Mitte und Seiten der Deckfläche,
         mit etwas Rand. */
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let k = 0; k < 8; k++) {
        corner.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).sub(foot);
        const a = corner.dot(u), b = corner.dot(v);
        u0 = Math.min(u0, a); u1 = Math.max(u1, a);
        v0 = Math.min(v0, b); v1 = Math.max(v1, b);
      }
      const pad = 0.02 * Math.max(u1 - u0, v1 - v0) + unit;
      const cap = p.cap;
      cap.scale.set(u1 - u0 + 2 * pad, v1 - v0 + 2 * pad, 1);
      cap.quaternion.copy(turn);
      /* Minimal in den weggeschnittenen Halbraum versetzt — der Inhalt
         weiter als der Stahl, damit die Farben nicht flimmern. */
      cap.position.copy(foot).addScaledVector(u, (u0 + u1) / 2).addScaledVector(v, (v0 + v1) / 2)
        .addScaledVector(plane.normal, -cap.userData.capOffset);
    }
  }

  /** Nach Änderungen am Modell (oder mit einem anderen Modell) neu aufbauen;
      `newBounds` ist der Kasten der Baugruppe für den Weg der Ebene. */
  function refresh(newDieScene, newBounds) {
    if (newDieScene) dieScene = newDieScene;
    measure(newBounds);
    build();
    setClip(last);
  }

  /** Die Schnittebene, solange sie gezeigt wird (sonst null) — für den
      Treffertest im Viewer: der Raycaster von Three.js kennt sie nicht. */
  const activePlane = () => (last.on ? plane : null);
  /** Der halbe Weg der Ebene entlang einer Achse (mm): Lage ±1 des Reglers
      ist dieser Wert — die Seitenleiste nennt die Lage in mm. */
  const extent = axis => EXTENT[axis];

  measure(bounds);
  build();
  return { setClip, refresh, update, recolor, setActive, activePlane, extent };
}
