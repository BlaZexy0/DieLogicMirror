/* Die Formansicht im Viewport: die Stücke aus js/part/dieview.js als
   Meshes, jedes in seiner Regionsfarbe, der Rand dunkler, die Trennlinie
   als Linie — und jedes um denselben Abstand entlang seiner
   Entformrichtung verschoben, damit die Form aufgeht wie beim Öffnen.

   Dazu der Blick VON DER TRENNEBENE in eine Hälfte: dort steht man, wenn
   die Form offen ist, und sieht die Kavität der Hälfte von innen — von
   der Seite, auf der das Bauteil war. Zu sehen sind dann diese Hälfte
   und die Schieber, die auf ihrer Seite der Trennebene sitzen (dort
   sind sie in der Form eingebaut), herausgefahren; die Gegenhälfte und
   deren Schieber sind aus dem Bild. Eine Schnittebene gab es früher —
   Schieber, die die Trennebene überspannen, waren dann halb zu sehen.

   Unabhängig von den Formteilen liegen die SILHOUETTEN der projizierten
   Flächen und die HAFTKARTE: je Stück eine Ebene JENSEITS des Bauteils in
   seiner Entformrichtung — hinter dem Ende des Stücks, mit einstellbarer
   Luft und Deckkraft; stehen die Formteile herausgefahren, dahinter. Sie
   hängen nicht an den Formteil-Meshes, damit sie auch ohne die Formteile
   stehen. Einzelne Formteile lassen sich ausblenden (setVisible).

   Gemeinsam für die Entformungsanalyse (js/part/app.js) und den Schritt
   Bauteil der Werkbank (js/werkbank/part.js), die nur die Formteile nutzt. */

import * as T from 'three';
import { diePieces, maskOutline } from './dieview.js';
import { REGION_COLORS, UNDERCUT_COLOR, turbo } from './colors.js';
import { UNDERCUT } from './segment.js';

export function createDieView(view) {
  const group = new T.Group();
  group.visible = false;
  view.scene.add(group);
  /* Silhouetten und Haftkarte: eigene Gruppe, sichtbar auch ohne Formansicht. */
  const overlays = new T.Group();
  view.scene.add(overlays);
  const lineMat = new T.LineBasicMaterial({ color: 0x002733, transparent: true, opacity: 0.7 });
  let holders = [];
  let pieces = [];
  let dist = 0;
  let looking = null;
  let projections = null, projOn = false;
  let ejector = null, ejOn = false;
  let gap = 20;
  let alpha = 0.6;                               // Deckkraft der Silhouetten und der Karte
  const hidden = new Set();                      // Formteile, die der Nutzer ausgeblendet hat

  const surfMat = color => new T.MeshStandardMaterial({
    color, roughness: 0.6, metalness: 0.08, side: T.DoubleSide, flatShading: true
  });
  const skirtMat = color => new T.MeshStandardMaterial({
    color: new T.Color(color).multiplyScalar(0.72), roughness: 0.7, metalness: 0.05, side: T.DoubleSide, flatShading: true
  });

  function disposeObject(o) {
    o.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material && c.material !== lineMat) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
  }

  function clear() {
    for (const h of holders) { disposeObject(h); group.remove(h); }
    holders = [];
  }

  /** Die Stücke hinterlegen, ohne Formteile zu bauen — für Silhouetten und
      Haftkarte ohne Formansicht. Die Luft zwischen Bauteil und Ebene folgt
      der Bauteilgröße. */
  function setPieces(list, opts = {}) {
    const next = list || [];
    const g = opts.gap !== undefined ? opts.gap : gap;
    if (next === pieces && g === gap) return;
    pieces = next;
    gap = g;
    rebuildOverlays();
  }

  /** Die Formteile neu bauen — nach jeder Zuordnung und bei neuem Rand.
      opts.pieces: fertige Stücke (diePieces) statt sie hier zu rechnen. */
  function build(model, seg, opts = {}) {
    clear();
    if (!model || !seg) { if (pieces.length) { pieces = []; rebuildOverlays(); } view.invalidate(); return []; }
    const next = opts.pieces || diePieces(model, seg, opts);
    const changed = next !== pieces;
    pieces = next;
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
      h.visible = !hidden.has(p.label);
      group.add(h);
      holders.push(h);
    }
    setDistance(dist);
    if (looking !== null) { const l = looking; looking = null; if (!lookInto(l)) lookFree(); }
    if (changed) rebuildOverlays(); else placeOverlays();
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
    placeOverlays();
    view.invalidate();
  }

  function show(on) {
    group.visible = !!on;
    placeOverlays();
    view.invalidate();
  }

  /** Ein Formteil ein- oder ausblenden — bleibt über Neubauten hinweg. */
  function setVisible(label, on) {
    if (on) hidden.delete(label); else hidden.add(label);
    const h = holders.find(x => x.userData.piece.label === label);
    if (h && looking === null) h.visible = !!on;
    placeOverlays();
    view.invalidate();
  }

  /** Luft zwischen Bauteil und den Ebenen der Silhouetten und der Karte, mm. */
  function setGap(mm) {
    gap = Math.max(0, Number(mm) || 0);
    placeOverlays();
    view.invalidate();
  }

  /** Deckkraft der Füllungen (Silhouetten und Karte), 0…1. */
  function setOverlayOpacity(a) {
    alpha = Math.max(0, Math.min(1, Number(a) || 0));
    for (const o of overlays.children) for (const c of o.children) if (c.userData.plane) { c.material.opacity = alpha; c.material.needsUpdate = true; }
    view.invalidate();
  }

  /* ── Silhouetten und Haftkarte ──────────────────────────────── */

  /* Eine Ebene im Raster `frame`, senkrecht zur Achse: lokale x-Achse = u,
     y = v, Normale = Achse; die Lage entlang der Achse setzt placeOverlays. */
  function framePlane(frame, material) {
    const { ua, va, axis, u0, v0, h, nu, nv } = frame;
    const mesh = new T.Mesh(new T.PlaneGeometry(nu * h, nv * h), material);
    const eu = new T.Vector3(), ev = new T.Vector3(), ea = new T.Vector3();
    eu.setComponent(ua, 1); ev.setComponent(va, 1); ea.setComponent(axis, 1);
    mesh.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(eu, ev, ea));
    const pos = [0, 0, 0];
    pos[ua] = u0 + nu * h / 2; pos[va] = v0 + nv * h / 2;
    mesh.position.set(pos[0], pos[1], pos[2]);
    return mesh;
  }

  function outlineLines(frame, mask, color) {
    const seg2 = maskOutline(frame, mask);
    const pts = new Float32Array(seg2.length / 2 * 3);
    for (let k = 0; k < seg2.length / 2; k++) {
      pts[k * 3 + frame.ua] = seg2[k * 2];
      pts[k * 3 + frame.va] = seg2[k * 2 + 1];
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pts, 3));
    return new T.LineSegments(g, new T.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  }

  /* Jede Ebene an ihren Platz: jenseits des Stücks in seiner Richtung, mit
     Luft — und bei offener Form hinter Abstand und Rand. */
  function placeOverlays() {
    const open = group.visible;
    for (const o of overlays.children) {
      const p = o.userData.piece;
      const far = p.dir[p.axis] > 0 ? p.span[1] : p.span[0];
      const coord = far + p.dir[p.axis] * (gap + (open ? dist + p.skirtLen : 0));
      for (const c of o.children) {
        const pos = c.position; pos.setComponent(p.axis, coord + (c.userData.lift || 0) * p.dir[p.axis]);
      }
      const holder = holders.find(h => h.userData.piece.label === p.label);
      const seen = !open || !holder || holder.visible;
      o.visible = seen && (o.userData.overlay === 'proj' ? projOn : ejOn);
    }
  }

  function rebuildOverlays() {
    for (const o of overlays.children.slice()) { disposeObject(o); overlays.remove(o); }
    for (const p of pieces) {
      if (p.axis < 0) continue;
      const color = REGION_COLORS[p.label];
      const pr = projections && projections.pieces.find(q => q.label === p.label);
      const em = ejector && ejector.label === p.label ? ejector : null;
      if (pr) {
        const og = new T.Group();
        og.userData.overlay = 'proj';
        og.userData.piece = p;
        {
          /* Die Füllung heller als das Stück, der Umriss dunkler. */
          const rgba = new Uint8Array(pr.frame.nu * pr.frame.nv * 4);
          const c = new T.Color(color).lerp(new T.Color(0xffffff), 0.45);
          for (let i = 0; i < pr.mask.length; i++) {
            rgba[i * 4] = c.r * 255; rgba[i * 4 + 1] = c.g * 255; rgba[i * 4 + 2] = c.b * 255;
            rgba[i * 4 + 3] = pr.mask[i] ? 255 : 0;
          }
          const tex = new T.DataTexture(rgba, pr.frame.nu, pr.frame.nv, T.RGBAFormat);
          tex.needsUpdate = true;
          const plane = framePlane(pr.frame, new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: alpha, side: T.DoubleSide, depthWrite: false }));
          plane.userData.plane = true;
          og.add(plane);
        }
        const ol = outlineLines(pr.frame, pr.mask, new T.Color(color).multiplyScalar(0.55));
        ol.userData.lift = 0.3;
        og.add(ol);
        overlays.add(og);
      }
      if (em) {
        const eg = new T.Group();
        eg.userData.overlay = 'ejector';
        eg.userData.piece = p;
        const { nu, nv } = em.frame;
        const rgba = new Uint8Array(nu * nv * 4);
        for (let i = 0; i < em.map.length; i++) {
          const v = em.map[i];
          const rgb = turbo(0.05 + 0.9 * v);
          rgba[i * 4] = rgb[0] * 255; rgba[i * 4 + 1] = rgb[1] * 255; rgba[i * 4 + 2] = rgb[2] * 255;
          rgba[i * 4 + 3] = v > 0.01 ? 150 + 105 * Math.min(1, v * 2) : 0;
        }
        const tex = new T.DataTexture(rgba, nu, nv, T.RGBAFormat);
        tex.needsUpdate = true;
        const plane = framePlane(em.frame, new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: alpha, side: T.DoubleSide, depthWrite: false }));
        plane.userData.plane = true;
        eg.add(plane);
        overlays.add(eg);
      }
    }
    placeOverlays();
    view.invalidate();
  }

  /** Projizierte Flächen (pieceProjections) hinterlegen — null löscht;
      dieselben noch einmal ändern nichts. */
  function setProjections(pr) { const next = pr || null; if (next === projections) return; projections = next; rebuildOverlays(); }
  function showProjections(on) { projOn = !!on; placeOverlays(); view.invalidate(); }
  /** Haftkarte (ejectorMap) hinterlegen — null löscht. */
  function setEjector(em) { const next = em || null; if (next === ejector) return; ejector = next; rebuildOverlays(); }
  function showEjector(on) { ejOn = !!on; placeOverlays(); view.invalidate(); }

  /**
   * Von der Trennebene in das Stück `label` sehen: nur dieses Stück und
   * die Schieber auf seiner Seite der Trennebene bleiben im Bild, alles
   * andere wird ausgeblendet. Die Kamera stellt sich vor die Fläche,
   * entgegen ihrer Entformrichtung, und passt das Stück ein.
   */
  function lookInto(label) {
    const h = holders.find(x => x.userData.piece.label === label);
    if (!h) return false;
    const p = h.userData.piece;
    const dir = new T.Vector3(p.dir[0], p.dir[1], p.dir[2]);
    if (dir.lengthSq() < 0.5) return false;
    for (const o of holders) {
      const q = o.userData.piece;
      o.visible = o === h || (q.axis !== p.axis && q.side === p.side);
    }
    looking = label;
    group.updateMatrixWorld(true);
    placeOverlays();
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

  /** Wieder alle Stücke — bis auf die vom Nutzer ausgeblendeten. */
  function lookFree() {
    if (looking === null) return;
    looking = null;
    for (const o of holders) o.visible = !hidden.has(o.userData.piece.label);
    placeOverlays();
    view.invalidate();
  }

  return {
    group, overlays, build, setPieces, setDistance, show, setVisible, setGap, setOverlayOpacity, lookInto, lookFree,
    setProjections, showProjections, setEjector, showEjector,
    get looking() { return looking; },
    get distance() { return dist; },
    get pieces() { return pieces; },
    get holders() { return holders; },
    box() { return new T.Box3().setFromObject(group); }
  };
}
