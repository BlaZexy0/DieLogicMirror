/* Die Griffe im Viewport: auswählen, ziehen, Arbeitsebene zeigen.

   Ein Punkt wird IN SEINER ARBEITSEBENE gezogen — der Mausstrahl wird
   mit der Ebene geschnitten, nicht mit dem Bildschirm. Dadurch bleibt
   der Zug maßhaltig, auch wenn man schräg auf die Ebene schaut, und ein
   Punkt kann beim Ziehen die Trennebene nicht versehentlich verlassen.
   Wer ihn doch herausheben will (eine Stufe im Verteiler), hält beim
   Ziehen die Alt-Taste: dann läuft er auf der Ebenennormalen.

   Damit man sieht, worin man zieht, liegt unter der Auswahl ein
   durchscheinendes Quadrat — die Arbeitsebene selbst.

   Gezogen wird JEDER Griff, der Pressrest eingeschlossen — er ist ein
   Punkt wie die anderen, nur nimmt er beim Verschieben das ganze System
   mit (js/runner/graph.js, setPos).

   Das Anklicken lässt die KAMERA in Ruhe. Den Drehpunkt auf die Auswahl
   zu setzen lag nahe (man dreht um das, woran man arbeitet), war beim
   Benutzen aber lästig: jeder Klick auf einen Punkt rückte das Bild,
   und man verlor die Übersicht, kaum dass man sie gewonnen hatte. Wer
   gerade ausgewählt ist, steht stattdessen im Menü im Viewport.

   Die Griffe behalten ihre Größe in Bildpunkten: `onBeforeRender` skaliert
   sie vor jedem Bild aus dem Kameraabstand. Ein Griff, der mit dem Zoom
   wächst, verdeckt sonst genau das, was man einstellen will.

   Und sie sind IMMER zu sehen, auch hinter dem Körper. Jeder Griff wird
   dafür zweimal gezeichnet: einmal mit Tiefenprüfung und voll deckend,
   davor einmal ohne Tiefenprüfung und blass. Wo der Punkt frei liegt,
   deckt die volle Kugel die blasse exakt ab; wo er hinter dem Anguss
   steckt, bleibt die blasse übrig. Man sieht also alle Punkte und
   trotzdem, welcher vorn liegt. (Anklicken ging schon immer durch den
   Körper hindurch — der Strahl trifft nur die Griffe, nicht das Netz.)
   Beide Durchgänge laufen als „transparent", weil Three.js nur dort die
   Reihenfolge über renderOrder entscheidet; im deckenden Durchgang läge
   die blasse Kugel sonst über der vollen. */

import * as T from 'three';
import * as G from './graph.js';

const HANDLE_PX = 9;

/* Sonderfarben der Griffe. Sie stehen hier, weil die Legende im Viewport
   sie ebenfalls zeigt — zwei Literale liefen auseinander.

   Der gewählte Punkt behält seine ARTFARBE und bekommt einen dunklen
   Ring. Ihn stattdessen weiß einzufärben lag nahe und war unbrauchbar:
   Weiß auf dem hellen Hintergrund des Viewports ist praktisch
   unsichtbar, und die Artfarbe war auch noch weg. */
export const SELECTED_RING = '#002733';
export const FOLLOWER_COLOR = '#b8c9cf';

export function createEditor(opts) {
  const { view, getGraph, onSelect, onChange, onHover, getRefMesh } = opts;
  const dom = view.renderer.domElement;
  const group = new T.Group();
  view.scene.add(group);

  const sphere = new T.SphereGeometry(1, 18, 12);
  const solid = c => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 });
  const ghost = (c, o) => new T.MeshBasicMaterial({
    color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false
  });
  const mats = {}, ghosts = {};
  for (const [type, meta] of Object.entries(G.TYPES)) {
    mats[type] = solid(meta.color);
    ghosts[type] = ghost(meta.color, 0.34);
  }
  const matFollow = solid(FOLLOWER_COLOR);
  matFollow.opacity = 0.6;
  const ghostFollow = ghost(FOLLOWER_COLOR, 0.2);

  /* Ring um den gewählten Griff — eine flache Scheibe, die sich immer
     zur Kamera dreht, damit sie aus jeder Richtung ein Ring bleibt. Auch
     er wird zweimal gezeichnet. */
  const ringGeo = new T.RingGeometry(1.35, 1.85, 32);
  const ringMats = [
    ghost(SELECTED_RING, 0.4),
    new T.MeshBasicMaterial({ color: SELECTED_RING, transparent: true, opacity: 1, side: T.DoubleSide })
  ];
  ringMats[0].side = T.DoubleSide;
  const rings = ringMats.map((m, i) => {
    const r = new T.Mesh(ringGeo, m);
    r.renderOrder = 5 + i;
    r.visible = false;
    r.onBeforeRender = (renderer, scene, camera) => {
      r.scale.setScalar(pixelSize(camera));
      r.quaternion.copy(camera.quaternion);
    };
    group.add(r);
    return r;
  });

  /* Arbeitsebene der Auswahl. */
  const planeMat = new T.MeshBasicMaterial({
    color: 0x3fc2b6, transparent: true, opacity: 0.07, side: T.DoubleSide, depthWrite: false
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
  const state = {
    selected: null, hover: null, drag: null, enabled: true,
    /* Zielmodus (Mündung ans Bauteil): aim hält die Rückrufe, aimDown den
       Treffer beim Drücken, aimMove den letzten Zeigerort für die Vorschau. */
    aim: null, aimDown: null, aimMove: null, aimRaf: 0, aimPickMs: 0
  };

  /* ── Griffe abgleichen ─────────────────────────────────────── */
  function refresh() {
    const g = getGraph();
    const alive = new Set();
    for (const n of G.allNodes(g)) {
      alive.add(n.id);
      let h = handles.get(n.id);
      if (!h) {
        h = { solid: new T.Mesh(sphere), ghost: new T.Mesh(sphere) };
        h.solid.renderOrder = 8;
        h.ghost.renderOrder = 7;
        for (const m of [h.ghost, h.solid]) {
          m.onBeforeRender = (renderer, scene, camera) => { m.scale.setScalar(pixelSize(camera)); };
          group.add(m);
        }
        handles.set(n.id, h);
      }
      const follower = G.isFollower(g, n.id);
      h.solid.userData = { id: n.id, follower };
      for (const m of [h.ghost, h.solid]) m.position.set(n.pos[0], n.pos[1], n.pos[2]);
      h.solid.material = follower ? matFollow : (mats[n.type] || mats.point);
      h.ghost.material = follower ? ghostFollow : (ghosts[n.type] || ghosts.point);
    }
    const sel = state.selected && g.nodes[state.selected];
    for (const r of rings) {
      r.visible = !!sel;
      if (sel) r.position.set(sel.pos[0], sel.pos[1], sel.pos[2]);
    }
    for (const [id, h] of handles) {
      if (alive.has(id)) continue;
      group.remove(h.solid);
      group.remove(h.ghost);
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
    /* So groß wie der Kanal an dieser Stelle, nicht wie der Pressrest:
       ein 90-mm-Quadrat um einen 12 mm breiten Anschnitt ist eine
       Fläche im Bild, die niemand braucht. */
    const size = Math.max(24, n.w * 3);
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
  function castFrom(ev) {
    const r = dom.getBoundingClientRect();
    ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
  }

  function pick(ev) {
    castFrom(ev);
    const list = [...handles.values()].map(h => h.solid).filter(h => !h.userData.follower);
    const hits = ray.intersectObjects(list, false);
    return hits.length ? hits[0].object.userData.id : null;
  }

  /* ── Mündung ans Bauteil ──────────────────────────────────────
     Der Zielmodus: der nächste Klick auf das Referenzbauteil liefert Ort
     und Richtung für den Anschnitt. Solange er scharf ist, zeigt eine
     Marke unter dem Zeiger, wo der Anschnitt landen und wohin er münden
     würde — man sieht die Wirkung, bevor man klickt. */

  /* Eine Wand steht „aufrecht" zur Arbeitsebene, wenn ihre Normale
     höchstens 30° aus der Ebene herauszeigt. Bauteilwände haben
     Entformschräge (1 bis 3°) — die soll den Anschnitt nicht aus der
     Trennebene kippen. Was steiler steht, ist eine Fläche IN der Ebene
     (Deckfläche): dort gibt es nichts zu projizieren. */
  const WALL_SIN = Math.sin(30 * Math.PI / 180);
  /* Wie weit der Suchstrahl in der Ebene neben dem projizierten Punkt
     nach der Wand sucht, mm. Eine Wand mit 3° Schräge über 50 mm Höhe
     weicht 2,6 mm ab; Rippen dichter als das würden ohnehin denselben
     Anschnitt bekommen. */
  const PROBE = 25;
  const nmat = new T.Matrix3();

  function firstHit(mesh, caster) {
    const hits = caster.intersectObject(mesh, false);
    for (const h of hits) if (h.face) return h;
    return null;
  }

  /* Nach INNEN gerichtete Flächennormale. Sie wird nicht aus dem
     Wickelsinn der STL gelesen — bei importierten Netzen ist der
     unzuverlässig — sondern so gedreht, dass sie vom Betrachter weg
     zeigt: getroffen wurde die sichtbare Seite, also führt der
     Blickstrahl an dieser Stelle ins Material. Die Normale rechnet der
     Raycaster selbst aus den drei Eckpunkten; ein fehlendes oder
     falsches Normalen-Attribut der Datei stört nicht. */
  function inwardNormal(mesh, hit, viewDir) {
    const n = hit.face.normal.clone().applyMatrix3(nmat.getNormalMatrix(mesh.matrixWorld)).normalize();
    if (n.dot(viewDir) < 0) n.negate();
    return n;
  }

  /**
   * Punkt auf dem Referenzbauteil unter dem Zeiger: Ort UND Richtung —
   * die nach innen gerichtete Flächennormale, denn dorthin soll der
   * Anschnitt münden. Ohne Bauteil oder daneben: null.
   *
   * Mit `plane` (Ursprung und Normale der Arbeitsebene des Anschnitts)
   * wird ein Treffer an einer aufrechten Wand IN DIESE EBENE gelegt: die
   * Richtung verliert ihren Anteil aus der Ebene heraus, denn ein
   * Anschnitt liegt in der Trennebene und kann nur in ihr münden; der
   * Ort rückt auf die Ebene und dann per Strahl in der Ebene exakt auf
   * die Wand — dorthin, wo die Wand die Ebene schneidet, nicht dorthin,
   * wo man 40 mm darüber hingeklickt hat. Ein Treffer auf einer Fläche,
   * die in der Ebene liegt, bleibt roh (`wall: false`); dass so ein
   * Anschnitt nicht zu bauen ist, sagt die Prüfliste.
   */
  function pickRef(ev, plane) {
    const mesh = getRefMesh && getRefMesh();
    if (!mesh || !mesh.visible || !mesh.geometry.attributes.position) return null;
    castFrom(ev);
    const h = firstHit(mesh, ray);
    if (!h) return null;
    const n = inwardNormal(mesh, h, ray.ray.direction);
    const point = h.point.clone();
    const raw = { point: point.toArray(), dir: n.toArray(), wall: false };
    if (!plane || !plane.normal) return raw;
    const nn = new T.Vector3(plane.normal[0], plane.normal[1], plane.normal[2]).normalize();
    const off = n.dot(nn);
    if (Math.abs(off) > WALL_SIN || nn.lengthSq() < 0.5) return raw;
    const dir = n.clone().addScaledVector(nn, -off).normalize();
    const o = new T.Vector3(plane.origin[0], plane.origin[1], plane.origin[2]);
    point.addScaledVector(nn, -point.clone().sub(o).dot(nn));
    const probe = new T.Raycaster(point.clone().addScaledVector(dir, -PROBE), dir, 0, 2 * PROBE);
    let best = null;
    for (const x of probe.intersectObject(mesh, false)) {
      const d = x.point.distanceTo(point);
      if (d <= PROBE && (!best || d < best.d)) best = { d, p: x.point };
    }
    if (best) point.copy(best.p);
    return { point: point.toArray(), dir: dir.toArray(), wall: true };
  }

  /* Die Vorschaumarke: ein Ring in der Austrittsfläche (senkrecht zur
     Mündungsrichtung) und ein Strich, der von außen hineinführt — in
     der Farbe des Anschnitts, ohne Tiefenprüfung, damit sie auch durch
     das durchscheinende Bauteil hindurch zu sehen ist. Größe in
     Bildpunkten wie bei den Griffen. */
  const aimMark = new T.Group();
  aimMark.visible = false;
  const aimColor = (G.TYPES.gate || {}).color || '#e07b39';
  const aimRing = new T.Mesh(new T.RingGeometry(1.1, 1.6, 32), ghost(aimColor, 0.95));
  aimRing.material.side = T.DoubleSide;
  aimRing.renderOrder = 9;
  const aimLineGeo = new T.BufferGeometry();
  aimLineGeo.setAttribute('position', new T.BufferAttribute(new Float32Array([0, 0, -5, 0, 0, 0]), 3));
  const aimLine = new T.Line(aimLineGeo, new T.LineBasicMaterial({
    color: aimColor, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
  }));
  aimLine.renderOrder = 9;
  aimMark.add(aimRing, aimLine);
  /* Der Ring skaliert die ganze Marke: onBeforeRender ruft Three.js nur
     für Gezeichnetes, eine Gruppe bekommt es nie — die Marke blieb sonst
     einen Millimeter groß und war nicht zu sehen. */
  aimRing.onBeforeRender = (renderer, scene, camera) => { aimMark.scale.setScalar(pixelSize(camera)); };
  group.add(aimMark);

  function showAimMark(hit) {
    if (!hit) { aimMark.visible = false; return; }
    aimMark.position.set(hit.point[0], hit.point[1], hit.point[2]);
    aimMark.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1),
      new T.Vector3(hit.dir[0], hit.dir[1], hit.dir[2]));
    aimMark.visible = true;
  }

  const raf = typeof requestAnimationFrame === 'function'
    ? cb => requestAnimationFrame(cb) : cb => setTimeout(cb, 16);

  /* Vorschau höchstens einmal je Bild — und gar nicht, wenn der Strahl
     auf ein riesiges Netz zuletzt länger als ein Bild gebraucht hat.
     Der Klick selbst wartet dann eben die eine Abfrage ab. */
  function aimHover(ev) {
    state.aimMove = { clientX: ev.clientX, clientY: ev.clientY };
    if (state.aimRaf) return;
    state.aimRaf = raf(() => {
      state.aimRaf = 0;
      if (!state.aim || !state.aimMove) return;
      if (state.aimPickMs > 40) { showAimMark(null); return; }
      const t0 = performance.now();
      const hit = pickRef(state.aimMove, state.aim.plane && state.aim.plane());
      state.aimPickMs = performance.now() - t0;
      showAimMark(hit);
    });
  }

  /* Zielmodus scharfschalten. `opts`: onHit(hit) beim Treffer, onMiss()
     bei einem Klick daneben, plane() liefert die Arbeitsebene des
     Anschnitts (Ursprung, Normale) für die Projektion. Ein zweiter Aufruf
     ersetzt die Rückrufe und lässt den Modus scharf — er schaltet ihn
     NICHT ab. Ein Umschalter, der beim Doppeldruck stillschweigend
     wieder aus ist, sieht von außen aus wie ein Knopf, der nichts tut. */
  function armAim(opts) {
    const o = typeof opts === 'function' ? { onHit: opts } : (opts || {});
    state.aim = { onHit: o.onHit || (() => {}), onMiss: o.onMiss || (() => {}), plane: o.plane || null };
    state.aimDown = null;
    dom.style.cursor = 'crosshair';
  }
  function cancelAim() {
    if (!state.aim) return false;
    state.aim = null;
    state.aimDown = null;
    state.aimMove = null;
    showAimMark(null);
    dom.style.cursor = '';
    return true;
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
    if (state.aim && ev.button === 0 && !ev.shiftKey) {
      /* Getroffen wird beim Drücken, ÜBERNOMMEN erst beim Loslassen —
         und nur, wenn die Maus dazwischen stehen blieb. Wer die Drehung
         der Ansicht auf dem Bauteil beginnt, will drehen, nicht binden;
         darum läuft der Druck ungebremst an die Kamera weiter. Auch ein
         Druck DANEBEN wird gemerkt: bleibt er ein Klick, ist das ein
         Fehlschuss, und der bekommt eine Antwort statt Schweigen. */
      const hit = pickRef(ev, state.aim.plane && state.aim.plane());
      state.aimDown = { x: ev.clientX, y: ev.clientY, hit };
      return;
    }
    if (!state.enabled || ev.button !== 0 || ev.shiftKey) return;
    const id = pick(ev);
    if (!id) return;
    ev.stopPropagation();
    ev.preventDefault();
    select(id);
    const g = getGraph();
    const node = g.nodes[id];
    const start = planePoint(ev, node, ev.altKey);
    if (!start) return;
    state.drag = {
      id, alt: ev.altKey,
      grab: start.clone().sub(new T.Vector3(...node.pos))
    };
    view.controls.enabled = false;
    /* Kann bei einem bereits wieder losgelassenen Zeiger werfen — dann
       läuft das Ziehen eben ohne Fang weiter, statt den Griff zu töten. */
    try { dom.setPointerCapture(ev.pointerId); } catch { /* s. o. */ }
  }

  function onMove(ev) {
    if (state.aim) { aimHover(ev); return; }
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
    if (state.aimDown) {
      const d = Math.hypot(ev.clientX - state.aimDown.x, ev.clientY - state.aimDown.y);
      const down = state.aimDown;
      state.aimDown = null;
      if (d < 6 && state.aim) {
        const aim = state.aim;
        if (down.hit) { cancelAim(); aim.onHit(down.hit); }
        else aim.onMiss();
      }
      return;
    }
    if (!state.drag) return;
    const id = state.drag.id;
    state.drag = null;
    view.controls.enabled = true;
    if (dom.hasPointerCapture && dom.hasPointerCapture(ev.pointerId)) dom.releasePointerCapture(ev.pointerId);
    onChange('drop', id);
  }

  function select(id) {
    state.selected = id;
    refresh();
    if (onSelect) onSelect(id);
  }

  dom.addEventListener('pointerdown', onDown, true);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);

  return {
    refresh, select, group, armAim, cancelAim, pickRef,
    get aiming() { return !!state.aim; },
    get aimMark() { return aimMark.visible ? aimMark.position.toArray() : null; },
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
