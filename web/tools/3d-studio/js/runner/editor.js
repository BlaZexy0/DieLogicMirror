/* Die Griffe im Viewport: auswählen, ziehen, Arbeitsebene zeigen.

   Ein Punkt wird IN SEINER ARBEITSEBENE gezogen — der Mausstrahl wird
   mit der Ebene geschnitten, nicht mit dem Bildschirm. Dadurch bleibt
   der Zug maßhaltig, auch wenn man schräg auf die Ebene schaut, und ein
   Punkt kann beim Ziehen die Trennebene nicht versehentlich verlassen.
   Wer ihn doch herausheben will (eine Stufe im Verteiler), hält beim
   Ziehen die Alt-Taste: dann läuft er auf der Ebenennormalen.

   Damit man sieht, worin man zieht, liegt unter der Auswahl ein
   durchscheinendes Quadrat mit Fadenkreuz — die Arbeitsebene selbst.
   Und weil sich beim Bearbeiten alles um den gerade angefassten Punkt
   dreht, wandert der Drehpunkt der Kamera auf die Auswahl.

   Die Griffe behalten ihre Größe in Bildpunkten: `onBeforeRender` skaliert
   sie vor jedem Bild aus dem Kameraabstand. Ein Griff, der mit dem Zoom
   wächst, verdeckt sonst genau das, was man einstellen will. */

import * as T from 'three';
import * as G from './graph.js';

const HANDLE_PX = 9;

export function createEditor(opts) {
  const { view, getGraph, onSelect, onChange, onHover } = opts;
  const dom = view.renderer.domElement;
  const group = new T.Group();
  view.scene.add(group);

  const sphere = new T.SphereGeometry(1, 18, 12);
  const mats = {};
  for (const [type, meta] of Object.entries(G.TYPES)) {
    mats[type] = new T.MeshBasicMaterial({ color: meta.color });
  }
  const matSel = new T.MeshBasicMaterial({ color: 0xffffff });
  const matFollow = new T.MeshBasicMaterial({ color: 0xb8c9cf, transparent: true, opacity: 0.5 });

  /* Arbeitsebene der Auswahl. */
  const planeMat = new T.MeshBasicMaterial({
    color: 0x3fc2b6, transparent: true, opacity: 0.1, side: T.DoubleSide, depthWrite: false
  });
  const planeMesh = new T.Mesh(new T.PlaneGeometry(1, 1), planeMat);
  planeMesh.visible = false;
  group.add(planeMesh);
  const planeEdge = new T.LineSegments(
    new T.EdgesGeometry(new T.PlaneGeometry(1, 1)),
    new T.LineBasicMaterial({ color: 0x008c82, transparent: true, opacity: 0.55 }));
  planeEdge.visible = false;
  group.add(planeEdge);

  const handles = new Map();
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const state = { selected: null, hover: null, drag: null, enabled: true };

  /* ── Griffe abgleichen ─────────────────────────────────────── */
  function refresh() {
    const g = getGraph();
    const alive = new Set();
    for (const n of G.allNodes(g)) {
      alive.add(n.id);
      let h = handles.get(n.id);
      if (!h) {
        h = new T.Mesh(sphere, mats[n.type] || mats.point);
        h.renderOrder = 3;
        h.onBeforeRender = (renderer, scene, camera) => { h.scale.setScalar(pixelSize(camera)); };
        group.add(h);
        handles.set(n.id, h);
      }
      const follower = G.isFollower(g, n.id);
      h.userData = { id: n.id, follower };
      h.position.set(n.pos[0], n.pos[1], n.pos[2]);
      h.material = state.selected === n.id ? matSel : (follower ? matFollow : (mats[n.type] || mats.point));
      h.visible = true;
    }
    for (const [id, h] of handles) {
      if (alive.has(id)) continue;
      group.remove(h);
      handles.delete(id);
    }
    updatePlane();
  }

  const pixelSize = camera => {
    const h = Math.max(dom.clientHeight, 1);
    if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / h * HANDLE_PX;
    const d = camera.position.distanceTo(view.controls.target);
    return 2 * d * Math.tan(camera.fov * Math.PI / 360) / h * HANDLE_PX;
  };

  function updatePlane() {
    const g = getGraph();
    const n = state.selected && g.nodes[state.selected];
    if (!n) { planeMesh.visible = planeEdge.visible = false; return; }
    const nrm = G.planeNormal(g, n);
    const size = Math.max(30, g.biscuit.d * 0.9);
    planeMesh.geometry.dispose();
    planeMesh.geometry = new T.PlaneGeometry(size, size);
    planeEdge.geometry.dispose();
    planeEdge.geometry = new T.EdgesGeometry(planeMesh.geometry);
    const q = new T.Quaternion().setFromUnitVectors(
      new T.Vector3(0, 0, 1), new T.Vector3(nrm[0], nrm[1], nrm[2]));
    for (const m of [planeMesh, planeEdge]) {
      m.position.set(n.pos[0], n.pos[1], n.pos[2]);
      m.quaternion.copy(q);
      m.visible = true;
    }
  }

  /* ── Zeigen und Ziehen ─────────────────────────────────────── */
  function pick(ev) {
    const r = dom.getBoundingClientRect();
    ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    const list = [...handles.values()].filter(h => h.visible && !h.userData.follower);
    const hits = ray.intersectObjects(list, false);
    return hits.length ? hits[0].object.userData.id : null;
  }

  /* Schnittpunkt des Mausstrahls mit der Arbeitsebene (oder, mit
     Alt-Taste, mit der Ebene senkrecht dazu durch den Blick). */
  function planePoint(ev, node, alt) {
    const g = getGraph();
    const r = dom.getBoundingClientRect();
    ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    const nrm = G.planeNormal(g, node);
    const axis = new T.Vector3(nrm[0], nrm[1], nrm[2]);
    let planeN = axis;
    if (alt) {
      /* Beim Herausheben zieht die Maus entlang der Normalen: die
         Hilfsebene enthält die Normale und zeigt zur Kamera. */
      const toCam = view.camera.position.clone().sub(new T.Vector3(...node.pos));
      planeN = new T.Vector3().crossVectors(axis, new T.Vector3().crossVectors(toCam, axis));
      if (planeN.lengthSq() < 1e-9) return null;
      planeN.normalize();
    }
    const denom = ray.ray.direction.dot(planeN);
    if (Math.abs(denom) < 0.03) return null;                 // fast streifender Blick
    const p0 = new T.Vector3(...node.pos);
    const t = p0.clone().sub(ray.ray.origin).dot(planeN) / denom;
    if (t <= 0) return null;
    const hit = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    if (!alt) return hit;
    /* Nur die Bewegung entlang der Normalen übernehmen. */
    return p0.clone().addScaledVector(axis, hit.clone().sub(p0).dot(axis));
  }

  function onDown(ev) {
    if (!state.enabled || ev.button !== 0 || ev.shiftKey) return;
    const id = pick(ev);
    if (!id) return;
    ev.stopPropagation();
    ev.preventDefault();
    select(id);
    const g = getGraph();
    const node = g.nodes[id];
    if (!node.parent) return;                                // Pressrest hängt am Ursprung
    const start = planePoint(ev, node, ev.altKey);
    if (!start) return;
    state.drag = {
      id, alt: ev.altKey,
      grab: start.clone().sub(new T.Vector3(...node.pos))
    };
    view.controls.enabled = false;
    if (dom.setPointerCapture) dom.setPointerCapture(ev.pointerId);
  }

  function onMove(ev) {
    if (state.drag) {
      const g = getGraph();
      const node = g.nodes[state.drag.id];
      if (!node) return;
      const p = planePoint(ev, node, state.drag.alt);
      if (!p) return;
      const target = p.clone().sub(state.drag.grab);
      if (state.drag.alt) G.setPos(g, node.id, [target.x, target.y, target.z]);
      else G.moveInPlane(g, node.id, [target.x, target.y, target.z]);
      onChange('drag');
      return;
    }
    if (!state.enabled) return;
    const id = pick(ev);
    if (id !== state.hover) {
      state.hover = id;
      dom.style.cursor = id ? 'grab' : '';
      if (onHover) onHover(id);
    }
  }

  function onUp(ev) {
    if (!state.drag) return;
    const id = state.drag.id;
    state.drag = null;
    view.controls.enabled = true;
    if (dom.hasPointerCapture && dom.hasPointerCapture(ev.pointerId)) dom.releasePointerCapture(ev.pointerId);
    onChange('drop', id);
  }

  function select(id) {
    state.selected = id;
    const g = getGraph();
    const n = id && g.nodes[id];
    if (n) view.controls.target.set(n.pos[0], n.pos[1], n.pos[2]);
    refresh();
    if (onSelect) onSelect(id);
  }

  dom.addEventListener('pointerdown', onDown, true);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);

  return {
    refresh, select, group,
    get selected() { return state.selected; },
    get dragging() { return !!state.drag; },
    setEnabled(v) { state.enabled = v; },
    dispose() {
      dom.removeEventListener('pointerdown', onDown, true);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      view.scene.remove(group);
    }
  };
}
