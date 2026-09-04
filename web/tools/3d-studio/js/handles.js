/* Griffe im Viewport — auswählen, ziehen, zielen. Gemeinsam für alle
   Werkzeuge, die Punkte auf oder an einem Bauteil setzen: der
   Angussdesigner (Knoten des Angussgraphen) und der Überlaufdesigner
   (Überläufe und Entlüftungen).

   Was ein Griff IST, weiß dieses Modul nicht. Es bekommt eine Liste von
   Dingen mit Ort, Farbe und wahlweise einer Richtung, und ein paar
   Rückrufe: welche Ebene zu einem Ding gehört, wie es verschoben wird,
   wer über Auswahl und Änderung Bescheid wissen will. Alles Sichtbare
   und alles mit der Maus passiert hier:

   - Ein Griff wird IN SEINER ARBEITSEBENE gezogen — der Mausstrahl wird
     mit der Ebene geschnitten, nicht mit dem Bildschirm. Mit Alt läuft
     er stattdessen auf der Ebenennormalen. Unter der Auswahl liegt ein
     durchscheinendes Quadrat: die Ebene selbst. Hat ein Ding KEINE Ebene
     (plane liefert null), rutscht es in der Bildebene durch die Kamera —
     und bekommt, wenn es `gizmo` verlangt, drei Achsenpfeile X/Y/Z, an
     denen es sich je Achse ziehen lässt: der Mausstrahl wird dafür auf
     die Achse gelotet (nächster Punkt zweier Geraden).
   - Ein Ding mit Richtung trägt einen PFEIL. Den Pfeil anklicken heißt
     zielen (onAim), nicht ziehen.
   - Der ZIELMODUS: der nächste Klick auf das Referenzbauteil liefert Ort
     und nach innen gerichtete Flächennormale; solange er scharf ist,
     zeigt eine Marke unter dem Zeiger, wo es hinginge.
   - Griffe behalten ihre Größe in Bildpunkten und sind IMMER zu sehen,
     auch hinter dem Körper: jeder wird zweimal gezeichnet, deckend mit
     Tiefenprüfung und blass ohne.
   - Ein Zug wirkt höchstens einmal je Bild (rAF): eine Maus meldet sich
     hundert- bis tausendmal je Sekunde, und jede Meldung ließ sonst die
     ganze Rechenkette laufen.

   Anklicken lässt die KAMERA in Ruhe: jeder Klick, der das Bild rückt,
   kostet die Übersicht, die man gerade gewonnen hat. */

import * as T from 'three';

const HANDLE_PX = 9;

/** Ring um den gewählten Griff — dunkel, weil Weiß auf dem hellen
    Viewport unsichtbar ist und die Artfarbe erhalten bleiben soll. */
export const SELECTED_RING = '#002733';

/* Ein Pfeil in Griff-Einheiten (eine Einheit sind HANDLE_PX Bildpunkte,
   wie die Kugeln); er beginnt außerhalb der Kugel, damit beide getrennt
   zu treffen sind. */
const ARROW = { gap: 1.5, len: 3.4, tipLen: 1.5, r: 0.2, tipR: 0.62, hitR: 0.95 };
/* Eine Wand steht „aufrecht" zur Arbeitsebene, wenn ihre Normale höchstens
   30° aus der Ebene herauszeigt — dann wird die Richtung in die Ebene
   gelegt (Entformschrägen von 1 bis 3° sollen nichts kippen). */
const WALL_SIN = Math.sin(30 * Math.PI / 180);
const ZAXIS = new T.Vector3(0, 0, 1);

/**
 * @param opts.view        Szene aus js/scene.js (renderer, camera, scene, controls, invalidate)
 * @param opts.items       () → [{ id, pos:[3], color, ghost?, dir?:[3], planeSize?, gizmo? }]
 *                         ghost: blass und nicht anfassbar (die nachgezogene Gegenseite)
 *                         gizmo: als Auswahl drei Achsenpfeile zum Ziehen je Achse
 * @param opts.plane       id → { origin:[3], normal:[3] } | null — Arbeitsebene des Dings;
 *                         null heißt frei: Ziehen in der Bildebene, Pfeile je Achse
 * @param opts.move        (id, pos:[3], alt:boolean) → void — beim Ziehen
 * @param opts.getRefMesh  () → Mesh | null — das Referenzbauteil für den Zielmodus
 * @param opts.onSelect    id | null
 * @param opts.onChange    ('drag' | 'drop', id)
 * @param opts.onHover     id | null
 * @param opts.onAim       id — der Pfeil wurde angeklickt
 */
export function createHandles(opts) {
  const { view, items, plane, move, getRefMesh, onSelect, onChange, onHover, onAim } = opts;
  const redraw = () => { if (view.invalidate) view.invalidate(); };
  const dom = view.renderer.domElement;
  const group = new T.Group();
  view.scene.add(group);

  const sphere = new T.SphereGeometry(1, 18, 12);
  const solid = (c, o = 1) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o });
  const ghost = (c, o) => new T.MeshBasicMaterial({
    color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false
  });
  const matCache = new Map();
  const matFor = (color, pale) => {
    const key = color + (pale ? ':pale' : '');
    let m = matCache.get(key);
    if (!m) {
      m = pale ? { solid: solid(color, 0.6), ghost: ghost(color, 0.2) } : { solid: solid(color), ghost: ghost(color, 0.34) };
      matCache.set(key, m);
    }
    return m;
  };

  /* Ring um die Auswahl: eine flache Scheibe, immer zur Kamera gedreht,
     ebenfalls zweimal gezeichnet. */
  const ringGeo = new T.RingGeometry(1.35, 1.85, 32);
  const ringMats = [ghost(SELECTED_RING, 0.4), solid(SELECTED_RING)];
  for (const m of ringMats) m.side = T.DoubleSide;
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
  const planeMesh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({
    color: 0x3fc2b6, transparent: true, opacity: 0.07, side: T.DoubleSide, depthWrite: false
  }));
  planeMesh.visible = false;
  planeMesh.userData.size = 0;
  group.add(planeMesh);
  const planeEdge = new T.LineSegments(
    new T.EdgesGeometry(new T.PlaneGeometry(1, 1)),
    new T.LineBasicMaterial({ color: 0x008c82, transparent: true, opacity: 0.55 }));
  planeEdge.visible = false;
  group.add(planeEdge);

  /* Pfeile: Geometrie entlang +Z, die Gruppe wird auf die Richtung
     gedreht und über den Schaft auf Bildpunktgröße skaliert. */
  const along = geo => geo.rotateX(Math.PI / 2);
  const arrowGeo = {
    shaft: along(new T.CylinderGeometry(ARROW.r, ARROW.r, ARROW.len, 10)).translate(0, 0, ARROW.gap + ARROW.len / 2),
    tip: along(new T.ConeGeometry(ARROW.tipR, ARROW.tipLen, 14)).translate(0, 0, ARROW.gap + ARROW.len + ARROW.tipLen / 2),
    hit: along(new T.CylinderGeometry(ARROW.hitR, ARROW.hitR, ARROW.len + ARROW.tipLen + 0.4, 8))
      .translate(0, 0, ARROW.gap + (ARROW.len + ARROW.tipLen) / 2)
  };
  const arrowMats = new Map();
  const arrowMat = (color, hot) => {
    const key = color + (hot ? ':hot' : '');
    if (!arrowMats.has(key)) arrowMats.set(key, ghost(hot ? '#9c4a12' : color, hot ? 1 : 0.95));
    return arrowMats.get(key);
  };

  /* Die drei Achsenpfeile der Auswahl (X rot, Y grün, Z blau), immer
     obenauf; sie beginnen wie die Richtungspfeile außerhalb der Kugel. */
  const AXIS_COLORS = ['#b42318', '#4c9f70', '#2e6da4'];
  const AXIS_DIRS = [new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)];
  const gizmo = new T.Group();
  gizmo.visible = false;
  const gizmoAxes = AXIS_DIRS.map((axis, i) => {
    const grp = new T.Group();
    const mat = ghost(AXIS_COLORS[i], 0.95);
    const hot = ghost(AXIS_COLORS[i], 1);
    const shaft = new T.Mesh(arrowGeo.shaft, mat);
    const tip = new T.Mesh(arrowGeo.tip, mat);
    const hit = new T.Mesh(arrowGeo.hit);
    hit.visible = false;
    hit.userData = { gizmo: i };
    shaft.renderOrder = tip.renderOrder = 10;
    grp.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), axis);
    grp.add(shaft, tip, hit);
    gizmo.add(grp);
    return { grp, shaft, tip, hit, mat, hot };
  });
  gizmoAxes[0].shaft.onBeforeRender = (renderer, scene, camera) => { gizmo.scale.setScalar(pixelSize(camera)); };
  group.add(gizmo);
  let gizmoFor = null;

  const handles = new Map();
  const arrows = new Map();
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const state = {
    selected: null, hover: null, drag: null, enabled: true,
    aim: null, aimDown: null, aimMove: null, aimRaf: 0, aimPickMs: 0
  };

  const pixelSize = camera => {
    const h = Math.max(dom.clientHeight, 1);
    if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / camera.zoom / h * HANDLE_PX;
    const d = camera.position.distanceTo(view.controls.target);
    return 2 * d * Math.tan(camera.fov * Math.PI / 360) / h * HANDLE_PX;
  };

  /* ── Griffe abgleichen ─────────────────────────────────────── */
  function ensureArrow(id, color) {
    let a = arrows.get(id);
    if (a) return a;
    const grp = new T.Group();
    const shaft = new T.Mesh(arrowGeo.shaft, arrowMat(color, false));
    const tip = new T.Mesh(arrowGeo.tip, arrowMat(color, false));
    const hit = new T.Mesh(arrowGeo.hit);
    hit.visible = false;                                    // nur für den Strahl
    hit.userData = { id, arrow: true };
    shaft.renderOrder = tip.renderOrder = 6;
    shaft.onBeforeRender = (renderer, scene, camera) => { grp.scale.setScalar(pixelSize(camera)); };
    grp.add(shaft, tip, hit);
    group.add(grp);
    a = { grp, shaft, tip, hit, color };
    arrows.set(id, a);
    return a;
  }
  function heatArrow(id) {
    for (const [k, a] of arrows) a.shaft.material = a.tip.material = arrowMat(a.color, k === id);
  }

  function refresh() {
    const list = items();
    const alive = new Set(), aliveArrows = new Set();
    let sel = null;
    for (const it of list) {
      alive.add(it.id);
      let h = handles.get(it.id);
      if (!h) {
        h = { solid: new T.Mesh(sphere), ghost: new T.Mesh(sphere) };
        h.solid.renderOrder = 8;
        h.ghost.renderOrder = 7;
        for (const m of [h.ghost, h.solid]) {
          m.onBeforeRender = (renderer, scene, camera) => { m.scale.setScalar(pixelSize(camera)); };
          group.add(m);
        }
        handles.set(it.id, h);
      }
      h.solid.userData = { id: it.id, ghost: !!it.ghost };
      for (const m of [h.ghost, h.solid]) m.position.set(it.pos[0], it.pos[1], it.pos[2]);
      const mats = matFor(it.color, !!it.ghost);
      h.solid.material = mats.solid;
      h.ghost.material = mats.ghost;
      if (it.dir && !it.ghost) {
        const v = new T.Vector3(it.dir[0], it.dir[1], it.dir[2]);
        if (v.lengthSq() > 1e-12) {
          const a = ensureArrow(it.id, it.color);
          if (a.color !== it.color) { a.color = it.color; heatArrow(state.hover); }
          a.grp.position.set(it.pos[0], it.pos[1], it.pos[2]);
          a.grp.quaternion.setFromUnitVectors(ZAXIS, v.normalize());
          aliveArrows.add(it.id);
        }
      }
      if (it.id === state.selected) sel = it;
    }
    for (const [id, h] of handles) {
      if (alive.has(id)) continue;
      group.remove(h.solid, h.ghost);
      handles.delete(id);
    }
    for (const [id, a] of arrows) {
      if (aliveArrows.has(id)) continue;
      group.remove(a.grp);
      arrows.delete(id);
    }
    for (const r of rings) {
      r.visible = !!sel;
      if (sel) r.position.set(sel.pos[0], sel.pos[1], sel.pos[2]);
    }
    gizmoFor = sel && sel.gizmo ? sel.id : null;
    gizmo.visible = !!gizmoFor;
    if (gizmoFor) {
      gizmo.position.set(sel.pos[0], sel.pos[1], sel.pos[2]);
      for (const g of gizmoAxes) g.hit.userData.id = sel.id;
    }
    updatePlane(sel);
    /* Der Strahl liest Weltmatrizen; die schreibt sonst erst der Renderer
       vor dem nächsten Bild — und mit Zeichnen auf Abruf kommt das nicht
       mehr sechzigmal je Sekunde. */
    group.updateMatrixWorld(true);
    redraw();
  }

  function updatePlane(sel) {
    const pl = sel && plane(sel.id);
    if (!sel || !pl) { planeMesh.visible = planeEdge.visible = false; return; }
    const size = Math.max(24, sel.planeSize || 24);
    if (Math.abs(size - planeMesh.userData.size) > 1e-9) {
      planeMesh.geometry.dispose();
      planeMesh.geometry = new T.PlaneGeometry(size, size);
      planeEdge.geometry.dispose();
      planeEdge.geometry = new T.EdgesGeometry(planeMesh.geometry);
      planeMesh.userData.size = size;
    }
    const q = new T.Quaternion().setFromUnitVectors(ZAXIS,
      new T.Vector3(pl.normal[0], pl.normal[1], pl.normal[2]).normalize());
    for (const m of [planeMesh, planeEdge]) {
      m.position.set(sel.pos[0], sel.pos[1], sel.pos[2]);
      m.quaternion.copy(q);
      m.visible = true;
    }
  }

  /* ── Zeigen ────────────────────────────────────────────────── */
  function castFrom(ev) {
    const r = dom.getBoundingClientRect();
    ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
  }

  /* Was unter dem Zeiger liegt: { id } für eine Kugel, { id, arrow } für
     einen Pfeil — das Nächste gewinnt. */
  function pick(ev) {
    castFrom(ev);
    /* Die Kugel schlägt jeden Pfeil: alle Pfeile beginnen außerhalb der
       Kugel, wer also die Kugel trifft, meint den Punkt — auch wenn ein
       Pfeil, der zur Kamera zeigt, im Bild davor liegt. */
    const spheres = [];
    for (const h of handles.values()) if (!h.solid.userData.ghost) spheres.push(h.solid);
    const hitS = ray.intersectObjects(spheres, false);
    if (hitS.length) return hitS[0].object.userData;
    const list = [];
    /* Ein Achsenpfeil, der fast in Blickrichtung steht, ließe sich nicht
       ziehen (die Achse ist nicht zu loten) — er bleibt außen vor. */
    if (gizmo.visible) {
      for (const g of gizmoAxes) {
        if (Math.abs(AXIS_DIRS[g.hit.userData.gizmo].dot(ray.ray.direction)) < 0.985) list.push(g.hit);
      }
    }
    for (const a of arrows.values()) list.push(a.hit);
    const hits = ray.intersectObjects(list, false);
    return hits.length ? hits[0].object.userData : null;
  }

  /* Die Ebene, in der ein Ding gezogen wird: seine Arbeitsebene — oder,
     wenn es keine hat, die Bildebene durch seinen Ort. */
  function dragPlane(id) {
    const pl = plane(id);
    if (pl) return pl;
    const it = items().find(x => x.id === id);
    if (!it) return null;
    const n = new T.Vector3();
    view.camera.getWorldDirection(n);
    return { origin: it.pos, normal: [n.x, n.y, n.z], free: true };
  }

  /* Parameter des Punktes auf der Achse (p + s·a), der dem Mausstrahl am
     nächsten kommt — null, wenn die Achse fast in Blickrichtung liegt. */
  function axisParam(ev, p, a) {
    castFrom(ev);
    const o = ray.ray.origin, d = ray.ray.direction;
    const w0 = new T.Vector3(p[0], p[1], p[2]).sub(o);
    const b = a.dot(d), dd = a.dot(w0), e = d.dot(w0);
    const denom = 1 - b * b;
    if (denom < 1e-4) return null;
    return (b * e - dd) / denom;
  }

  /* Schnittpunkt des Mausstrahls mit der Arbeitsebene des Dings (oder,
     mit Alt, mit der Ebene senkrecht dazu durch den Blick). */
  function planePoint(ev, id, alt) {
    const pl = dragPlane(id);
    if (!pl) return null;
    castFrom(ev);
    const axis = new T.Vector3(pl.normal[0], pl.normal[1], pl.normal[2]).normalize();
    const p0 = new T.Vector3(pl.origin[0], pl.origin[1], pl.origin[2]);
    let planeN = axis;
    if (alt && !pl.free) {
      const toCam = view.camera.position.clone().sub(p0);
      planeN = new T.Vector3().crossVectors(axis, new T.Vector3().crossVectors(toCam, axis));
      if (planeN.lengthSq() < 1e-9) return null;
      planeN.normalize();
    }
    const denom = ray.ray.direction.dot(planeN);
    if (Math.abs(denom) < 0.03) return null;                 // fast streifender Blick
    const t = p0.clone().sub(ray.ray.origin).dot(planeN) / denom;
    if (t <= 0) return null;
    const hit = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    if (!alt) return hit;
    return p0.clone().addScaledVector(axis, hit.clone().sub(p0).dot(axis));
  }

  /* ── Zielmodus ─────────────────────────────────────────────── */
  const nmat = new T.Matrix3();
  function firstHit(mesh, caster) {
    for (const h of caster.intersectObject(mesh, false)) if (h.face) return h;
    return null;
  }
  /* Nach INNEN gerichtete Flächennormale: nicht aus dem Wickelsinn der
     Datei (unzuverlässig), sondern vom Betrachter weg — getroffen wurde
     die sichtbare Seite, also führt der Blickstrahl ins Material. */
  function inwardNormal(mesh, hit, viewDir) {
    const n = hit.face.normal.clone().applyMatrix3(nmat.getNormalMatrix(mesh.matrixWorld)).normalize();
    if (n.dot(viewDir) < 0) n.negate();
    return n;
  }
  /**
   * Punkt auf dem Referenzbauteil unter dem Zeiger: Ort (der GETROFFENE
   * Punkt, auch über oder unter der Ebene) und Richtung (die nach innen
   * gerichtete Normale; an einer aufrechten Wand in die Ebene `plane`
   * gelegt, `wall: true`). Ohne Bauteil oder daneben: null.
   */
  function pickRef(ev, pl) {
    const mesh = getRefMesh && getRefMesh();
    if (!mesh || !mesh.visible || !mesh.geometry.attributes.position) return null;
    castFrom(ev);
    const h = firstHit(mesh, ray);
    if (!h) return null;
    const n = inwardNormal(mesh, h, ray.ray.direction);
    const point = h.point.toArray();
    if (!pl || !pl.normal) return { point, dir: n.toArray(), wall: false };
    const nn = new T.Vector3(pl.normal[0], pl.normal[1], pl.normal[2]).normalize();
    const off = n.dot(nn);
    if (Math.abs(off) > WALL_SIN || nn.lengthSq() < 0.5) return { point, dir: n.toArray(), wall: false };
    const dir = n.clone().addScaledVector(nn, -off).normalize();
    return { point, dir: dir.toArray(), wall: true };
  }

  /* Die Vorschaumarke: Ring in der Austrittsfläche, Strich in Richtung —
     ohne Tiefenprüfung, damit sie durch das durchscheinende Bauteil zu
     sehen ist. Der Ring skaliert die Gruppe: onBeforeRender bekommt nur
     Gezeichnetes, eine Gruppe nie. */
  const aimMark = new T.Group();
  aimMark.visible = false;
  const markColor = opts.markColor || '#e07b39';
  const aimRing = new T.Mesh(new T.RingGeometry(1.1, 1.6, 32), ghost(markColor, 0.95));
  aimRing.material.side = T.DoubleSide;
  aimRing.renderOrder = 9;
  const aimLineGeo = new T.BufferGeometry();
  aimLineGeo.setAttribute('position', new T.BufferAttribute(new Float32Array([0, 0, -5, 0, 0, 0]), 3));
  const aimLine = new T.Line(aimLineGeo, new T.LineBasicMaterial({
    color: markColor, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
  }));
  aimLine.renderOrder = 9;
  aimMark.add(aimRing, aimLine);
  aimRing.onBeforeRender = (renderer, scene, camera) => { aimMark.scale.setScalar(pixelSize(camera)); };
  group.add(aimMark);

  function showAimMark(hit) {
    if (!hit) { if (aimMark.visible) { aimMark.visible = false; redraw(); } return; }
    aimMark.position.set(hit.point[0], hit.point[1], hit.point[2]);
    aimMark.quaternion.setFromUnitVectors(ZAXIS, new T.Vector3(hit.dir[0], hit.dir[1], hit.dir[2]));
    aimMark.visible = true;
    redraw();
  }

  const raf = typeof requestAnimationFrame === 'function'
    ? cb => requestAnimationFrame(cb) : cb => setTimeout(cb, 16);

  /* Vorschau höchstens einmal je Bild — und gar nicht, wenn der Strahl
     auf ein riesiges Netz zuletzt länger als ein Bild brauchte. */
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

  /** Zielmodus scharfschalten: onHit(hit) beim Treffer, onMiss() daneben,
      plane() liefert die Ebene für die Richtungsprojektion. Ein zweiter
      Aufruf ersetzt die Rückrufe und lässt den Modus scharf. */
  function armAim(o) {
    const a = typeof o === 'function' ? { onHit: o } : (o || {});
    state.aim = { onHit: a.onHit || (() => {}), onMiss: a.onMiss || (() => {}), plane: a.plane || null };
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

  /* ── Maus ──────────────────────────────────────────────────── */
  function onDown(ev) {
    if (state.aim && ev.button === 0 && !ev.shiftKey) {
      /* Getroffen beim Drücken, ÜBERNOMMEN beim Loslassen — und nur, wenn
         die Maus stehen blieb: wer auf dem Bauteil zu drehen beginnt, will
         drehen. Auch ein Druck daneben wird gemerkt, damit ein Fehlklick
         eine Antwort bekommt statt Schweigen. */
      const hit = pickRef(ev, state.aim.plane && state.aim.plane());
      state.aimDown = { x: ev.clientX, y: ev.clientY, hit };
      return;
    }
    if (!state.enabled || ev.button !== 0 || ev.shiftKey) return;
    const hit = pick(ev);
    if (!hit) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (hit.id !== state.selected) select(hit.id);
    if (hit.arrow) { if (onAim) onAim(hit.id); return; }
    const it = items().find(x => x.id === hit.id);
    if (!it) return;
    /* Ein Achsenpfeil: ziehen entlang genau dieser Achse. */
    if (hit.gizmo !== undefined) {
      const a = AXIS_DIRS[hit.gizmo];
      const s0 = axisParam(ev, it.pos, a);
      if (s0 === null) return;
      state.drag = { id: hit.id, axis: a, s0, start: it.pos.slice(), last: null, raf: 0 };
      for (const g of gizmoAxes) g.shaft.material = g.tip.material = (g.hit.userData.gizmo === hit.gizmo ? g.hot : g.mat);
      view.controls.enabled = false;
      try { dom.setPointerCapture(ev.pointerId); } catch { /* Zeiger schon wieder los — dann ohne Fang */ }
      return;
    }
    const start = planePoint(ev, hit.id, ev.altKey);
    if (!start) return;
    state.drag = {
      id: hit.id, alt: ev.altKey,
      grab: start.clone().sub(new T.Vector3(it.pos[0], it.pos[1], it.pos[2])),
      last: null, raf: 0
    };
    view.controls.enabled = false;
    try { dom.setPointerCapture(ev.pointerId); } catch { /* Zeiger schon wieder los — dann ohne Fang */ }
  }

  function applyDrag() {
    const d = state.drag;
    if (!d) return;
    d.raf = 0;
    if (!d.last) return;
    if (d.axis) {
      const s = axisParam(d.last, d.start, d.axis);
      d.last = null;
      if (s === null) return;
      const k = s - d.s0;
      move(d.id, [d.start[0] + d.axis.x * k, d.start[1] + d.axis.y * k, d.start[2] + d.axis.z * k], false);
      onChange('drag', d.id);
      return;
    }
    const p = planePoint(d.last, d.id, d.alt);
    d.last = null;
    if (!p) return;
    const target = p.clone().sub(d.grab);
    move(d.id, [target.x, target.y, target.z], d.alt);
    onChange('drag', d.id);
  }

  function onMove(ev) {
    if (state.aim) { aimHover(ev); return; }
    if (state.drag) {
      state.drag.last = { clientX: ev.clientX, clientY: ev.clientY };
      if (!state.drag.raf) state.drag.raf = raf(applyDrag);
      return;
    }
    if (!state.enabled) return;
    const hit = pick(ev);
    const key = hit ? hit.id + (hit.arrow ? ':pfeil' : hit.gizmo !== undefined ? ':g' + hit.gizmo : '') : null;
    if (key !== state.hover) {
      state.hover = key;
      dom.style.cursor = !hit ? '' : (hit.arrow ? 'crosshair' : 'grab');
      heatArrow(hit && hit.arrow ? hit.id : null);
      for (const g of gizmoAxes) g.shaft.material = g.tip.material = (hit && hit.gizmo === g.hit.userData.gizmo ? g.hot : g.mat);
      redraw();
      if (onHover) onHover(hit ? hit.id : null);
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
    if (state.drag.last) applyDrag();                       // den letzten Zeigerort nicht verschenken
    const id = state.drag.id;
    state.drag = null;
    for (const g of gizmoAxes) g.shaft.material = g.tip.material = g.mat;
    view.controls.enabled = true;
    if (dom.hasPointerCapture && dom.hasPointerCapture(ev.pointerId)) dom.releasePointerCapture(ev.pointerId);
    onChange('drop', id);
  }

  function select(id) {
    state.selected = id;
    refresh();
    if (onSelect) onSelect(id);
  }

  /** Was der Klick auf den Pfeil tut — auch ohne Pfeil aufrufbar. */
  function aimFor(id) {
    select(id);
    if (onAim) onAim(id);
  }

  /** Weltpunkt der Pfeilspitze — für Tests und wer sonst hinzielen will. */
  function arrowTip(id) {
    const a = arrows.get(id);
    if (!a) return null;
    return a.grp.localToWorld(new T.Vector3(0, 0, ARROW.gap + ARROW.len + ARROW.tipLen * 0.5)).toArray();
  }
  /** Weltpunkt der Spitze eines Achsenpfeils (0 = X, 1 = Y, 2 = Z) der Auswahl. */
  function gizmoTip(axis) {
    if (!gizmo.visible) return null;
    gizmo.updateMatrixWorld(true);
    return gizmoAxes[axis].grp.localToWorld(new T.Vector3(0, 0, ARROW.gap + ARROW.len + ARROW.tipLen * 0.5)).toArray();
  }

  dom.addEventListener('pointerdown', onDown, true);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);

  return {
    refresh, select, group, armAim, cancelAim, pickRef, aimFor, arrowTip, gizmoTip,
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
