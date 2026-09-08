/* Die Formansicht im Viewport: die Stücke aus js/part/dieview.js als
   Meshes, jedes in seiner Regionsfarbe, der Rand dunkler, die Trennlinie
   als Linie — und jedes um denselben Abstand entlang seiner
   Entformrichtung verschoben, damit die Form aufgeht wie beim Öffnen.

   Dazu der Blick VON DER TRENNEBENE in ein Stück: dort steht man, wenn
   die Form offen ist, und sieht die Kavität der Hälfte von innen — von
   der Seite, auf der das Bauteil war. Die Kamera stellt sich vor die
   Fläche, entgegen ihrer Entformrichtung, und passt das Stück ein.

   Gemeinsam für die Entformungsanalyse (js/part/app.js) und den Schritt
   Bauteil der Werkbank (js/werkbank/part.js). */

import * as T from 'three';
import { diePieces } from './dieview.js';
import { REGION_COLORS, UNDERCUT_COLOR } from './colors.js';
import { UNDERCUT } from './segment.js';

export function createDieView(view) {
  const group = new T.Group();
  group.visible = false;
  view.scene.add(group);
  const lineMat = new T.LineBasicMaterial({ color: 0x002733, transparent: true, opacity: 0.7 });
  let holders = [];
  let dist = 0;
  let looking = null;
  const clipPlane = new T.Plane(new T.Vector3(0, 0, 1), 0);

  const surfMat = color => new T.MeshStandardMaterial({
    color, roughness: 0.6, metalness: 0.08, side: T.DoubleSide, flatShading: true
  });
  const skirtMat = color => new T.MeshStandardMaterial({
    color: new T.Color(color).multiplyScalar(0.72), roughness: 0.7, metalness: 0.05, side: T.DoubleSide, flatShading: true
  });

  function clear() {
    if (looking !== null) for (const m of materials()) m.clippingPlanes = null;
    for (const h of holders) {
      for (const c of h.children) { c.geometry.dispose(); if (c.material !== lineMat) c.material.dispose(); }
      group.remove(h);
    }
    holders = [];
  }

  /** Die Stücke neu bauen — nach jeder Zuordnung und bei neuem Rand. */
  function build(model, seg, opts = {}) {
    clear();
    if (!model || !seg) { view.invalidate(); return []; }
    const pieces = diePieces(model, seg, opts);
    for (const p of pieces) {
      const color = p.label === UNDERCUT ? UNDERCUT_COLOR : REGION_COLORS[p.label];
      const h = new T.Group();
      h.userData.piece = p;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(p.tris, 3));
      g.computeVertexNormals();
      h.add(new T.Mesh(g, surfMat(color)));
      if (p.skirt.length) {
        const s = new T.BufferGeometry();
        s.setAttribute('position', new T.BufferAttribute(p.skirt, 3));
        s.computeVertexNormals();
        h.add(new T.Mesh(s, skirtMat(color)));
      }
      if (p.edges.length) {
        const e = new T.BufferGeometry();
        e.setAttribute('position', new T.BufferAttribute(p.edges, 3));
        h.add(new T.LineSegments(e, lineMat));
      }
      group.add(h);
      holders.push(h);
    }
    setDistance(dist);
    if (looking !== null) { const l = looking; looking = null; if (!lookInto(l)) lookFree(); }
    return pieces;
  }

  /** Alle Stücke um d mm entlang ihrer Entformrichtung. */
  function setDistance(d) {
    dist = Math.max(0, d || 0);
    for (const h of holders) {
      const p = h.userData.piece;
      h.position.set(p.dir[0] * dist, p.dir[1] * dist, p.dir[2] * dist);
    }
    group.updateMatrixWorld(true);
    view.invalidate();
  }

  function show(on) {
    group.visible = !!on;
    view.invalidate();
  }

  /* Alle Werkstoffe der Stücke — für die Schnittebene. */
  function materials() {
    const out = [];
    for (const h of holders) for (const c of h.children) if (c.material !== lineMat) out.push(c.material);
    out.push(lineMat);
    return out;
  }

  /**
   * Von der Trennebene in das Stück `label` sehen. Was auf der anderen
   * Seite liegt — die Gegenhälfte, deren Schieber — wird an einer Ebene
   * zwischen beiden Hälften weggeschnitten: sonst stünde beim Blick von
   * außen die Gegenhälfte vor der, die man sehen will. Die Ebene liegt in
   * der Mitte zwischen dem tiefsten Punkt dieser und dem höchsten der
   * anderen Hälfte (beide verschoben) — ihr Ort hängt damit nicht am
   * Abstand, und die Stücke bleiben ganz.
   */
  function lookInto(label) {
    const h = holders.find(x => x.userData.piece.label === label);
    if (!h) return false;
    const p = h.userData.piece;
    const dir = new T.Vector3(p.dir[0], p.dir[1], p.dir[2]);
    if (dir.lengthSq() < 0.5) return false;
    group.updateMatrixWorld(true);
    const sign = p.dir[p.axis];
    const other = holders.find(x => x.userData.piece.axis === p.axis && x.userData.piece.label !== label);
    const mine = sign > 0 ? p.span[0] : p.span[1];
    const theirs = other ? (sign > 0 ? other.userData.piece.span[1] : other.userData.piece.span[0]) : mine;
    const k = (mine + theirs) / 2;
    /* Ebene: dir · x ≥ k·sign bleibt. Three.js behält, was auf der Seite
       der Normalen liegt: n·x + c ≥ 0. */
    clipPlane.normal.copy(dir);
    clipPlane.constant = -k * sign;
    for (const m of materials()) { m.clippingPlanes = [clipPlane]; m.needsUpdate = true; }
    looking = label;
    const center = new T.Vector3(p.center[0], p.center[1], p.center[2]).add(h.position);
    const cam = view.camera;
    /* Oben ist die Weltachse, die nicht in Blickrichtung liegt — y, wie in
       der Form, sonst z. */
    cam.up.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.9) cam.up.set(0, 0, 1);
    const eye = center.clone().addScaledVector(dir, -Math.max(200, dist * 2));
    cam.position.copy(eye);
    view.controls.target.copy(center);
    cam.lookAt(center);
    view.controls.update();
    view.fitTo(h, 1.15);
    return true;
  }

  /** Wieder alle Stücke — ohne Schnittebene. */
  function lookFree() {
    if (looking === null) return;
    looking = null;
    for (const m of materials()) { m.clippingPlanes = null; m.needsUpdate = true; }
    view.invalidate();
  }

  return {
    group, build, setDistance, show, lookInto, lookFree,
    get looking() { return looking; },
    get distance() { return dist; },
    get pieces() { return holders.map(h => h.userData.piece); },
    box() { return new T.Box3().setFromObject(group); }
  };
}
