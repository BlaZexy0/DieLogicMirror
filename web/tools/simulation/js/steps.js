/* Die eigenen Schritte der Seite „Simulation einrichten" — je Schritt ein
   Werkzeug nach dem Vertrag des 3D-Studios (js/studio/host.js), gebaut
   aus denselben Zeilen (js/studio/rows.js). Der Angussdesigner und der
   Überlaufdesigner kommen unverändert aus dem Studio (js/app.js).

   Gemeinsam ist allen der PLAN (js/plan.js) und eine Schicht im Bild
   (createLayer): die Körper aus Dateien, unsichtbare Pickkörper für alle
   (auch das Bauteil und die Körper der Designer), die gewählten Flächen
   und der Schmelzezylinder im Pressrest. */

import * as T from 'three';
import { esc, numberRow, segRow, selectRow, kpis } from '../../3d-studio/js/studio/rows.js';
import { surfaceMaterial, download } from '../../3d-studio/js/ui/common.js';
import { rayAt } from '../../3d-studio/js/viewmath.js';
import { ROLE, scale } from '../../3d-studio/js/part/colors.js';
import { parsePart } from '../../3d-studio/js/studio/files.js';
import { readGLBMeshes, isGLB } from '../../3d-studio/js/part/glbio.js';
import { neighbours, planarRegion, suggestInlet, depthAlong, volume, thickness, extraLevels, edgeCheck } from './core/geometry.js';
import { CRITERIA, VIEW_PRESETS, WHEN, ASPECTS, WIDTHS, FRAME, imageList, imageSize, targets, normalizePost } from './core/render.js';
import { missing, segmentHeight } from './core/casegen.js';
import { ROLES, roleLabel } from './plan.js';
import { safe } from './build.js';
import { payloadOf } from './payload.js';
import { shotPlan, chamberLength, curveSVG, CURVE_MODES } from './shot.js';

const fmt = (x, d = 0) => (isFinite(x) ? Number(x).toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');
const num = s => Number(String(s).replace(',', '.'));
const roleColor = r => ({ part: ROLE.part, runner: ROLE.runner, biscuit: ROLE.biscuit, overflow: ROLE.overflow })[r] || ROLE.steelDark;

/* ── Die Schicht im Bild ──────────────────────────────────────────── */
export function createLayer(host, plan) {
  const group = new T.Group();
  group.name = 'simulation';
  host.view.scene.add(group);
  const shown = new T.Group(), pick = new T.Group(), marks = new T.Group();
  group.add(shown, pick, marks);
  const hidden = new T.MeshBasicMaterial({ visible: false, side: T.DoubleSide });
  const nbrCache = new Map();
  const geo = tris => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(tris), 3)); g.computeVertexNormals(); return g; };
  const clear = grp => { for (const c of [...grp.children]) { grp.remove(c); c.geometry && c.geometry.dispose(); } };

  function rebuild() {
    clear(shown); clear(pick);
    for (const b of plan.bodies) {
      if (!b.include || !b.tris || b.tris.length < 36) continue;
      /* Was das Studio schon zeigt (das Bauteil, die Körper der Designer),
         zeigt die Schicht nicht doppelt — gepickt wird trotzdem alles. */
      if (b.src === 'file' && !b.isHostPart) {
        const m = new T.Mesh(geo(b.tris), surfaceMaterial(roleColor(b.role), { transparent: true, opacity: 0.92 }));
        m.userData.bodyId = b.id;
        shown.add(m);
      }
      const p = new T.Mesh(geo(b.tris), hidden);
      p.userData.bodyId = b.id;
      pick.add(p);
    }
    marksRebuild();
    host.view.invalidate();
  }

  const markMat = {
    inlet: new T.MeshBasicMaterial({ color: ROLE.melt, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    outlet: new T.MeshBasicMaterial({ color: ROLE.air, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    melt: new T.MeshStandardMaterial({ color: ROLE.melt, transparent: true, opacity: 0.45, depthWrite: false, side: T.DoubleSide }),
    sleeve: new T.MeshStandardMaterial({ color: ROLE.steelDark, transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide })
  };
  /* Die Schmelze in der liegenden Kammer: ein Kreissegment (Füllhöhe aus φ)
     über die ganze Kammerlänge, von der Kolbenstartlage (Ursprung) in
     Richtung -n (zur Form). Schwerkraft quer zur Achse; sonst nichts. */
  const GV = { '-x': [-1, 0, 0], '+x': [1, 0, 0], '-y': [0, -1, 0], '+y': [0, 1, 0], '-z': [0, 0, -1], '+z': [0, 0, 1] };
  function meltSegment(r, len, phi, gravity, n) {
    const gd = GV[gravity];
    if (!gd) return null;
    const g = new T.Vector3(...gd), a = n.clone().negate();               // a: Kolbenrichtung (zur Form)
    if (Math.abs(g.dot(a)) > 0.2) return null;
    const up = g.clone().negate().addScaledVector(a, g.dot(a)).normalize();
    const w = new T.Vector3().crossVectors(up, a).normalize();
    const hh = segmentHeight(Math.min(0.99, Math.max(0.01, phi))) * 2 * r - r;   // Füllstand über der Achse
    const th = Math.acos(Math.max(-1, Math.min(1, hh / r)));                // halber Öffnungswinkel ab „unten" bis Spiegel
    const shape = new T.Shape();
    const steps = 48;
    for (let k = 0; k <= steps; k++) {
      const ang = -Math.PI / 2 - (Math.PI - th) + 2 * (Math.PI - th) * k / steps;   // unten herum
      const x = r * Math.cos(ang), y = r * Math.sin(ang);
      if (k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 1 });
    const m = new T.Mesh(geo, markMat.melt);
    /* Formkoordinaten: x → w, y → up, z → a */
    m.matrixAutoUpdate = true;
    m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(w, up, a));
    return m;
  }
  function faceTris(b, faces) {
    const out = new Float32Array(faces.length * 9);
    faces.forEach((f, i) => out.set(b.tris.subarray(f * 9, f * 9 + 9), i * 9));
    return out;
  }
  function marksRebuild() {
    clear(marks);
    const add = (sel, mat) => {
      const b = sel && plan.body(sel.bodyId);
      if (!b) return;
      marks.add(new T.Mesh(geo(faceTris(b, sel.faces)), mat));
    };
    if (plan.inlet) {
      add(plan.inlet, markMat.inlet);
      const i = plan.inlet, n = new T.Vector3(...i.normal);
      /* wie im Fall: eine halbe Zelle größer als der Pressrest, rundum */
      const pad = 0.5 * plan.mesh.cell, r = i.radius + pad;
      const sp = plan.shot.chamber ? shotPlan(plan) : null;
      if (sp && !sp.error) {
        /* mit Kammer: der Hub hinter der Einlassfläche, die Schmelze darin
           in Ruhe mit dem Füllgrad (waagerechte Oberfläche) */
        const total = sp.stroke + i.depth;
        const sleeve = new T.Mesh(new T.CylinderGeometry(r, r, sp.stroke, 64, 1, true), markMat.sleeve);
        sleeve.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
        sleeve.position.set(...i.centroid).addScaledVector(n, sp.stroke / 2);
        marks.add(sleeve);
        const seg = meltSegment(r, total, sp.phi, plan.process.gravity, n);
        if (seg) {
          seg.position.set(...i.centroid).addScaledVector(n, sp.stroke);
          marks.add(seg);
        }
      } else {
        const h = Math.max(i.depth, 0.5) + 2 * pad;
        const cyl = new T.Mesh(new T.CylinderGeometry(r, r, h, 64, 1), markMat.melt);
        cyl.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
        cyl.position.set(...i.centroid).addScaledVector(n, -(h / 2 - pad));
        marks.add(cyl);
      }
    }
    for (const o of plan.outlets) add(o, markMat.outlet);
    host.view.invalidate();
  }
  plan.on(what => { if (what === 'bodies' || what === 'apply' || what === 'include') { rebuild(); applyGhost(); } else marksRebuild(); });

  /* Beim Wählen von Flächen die Körper durchscheinend: Einlass und
     Schmelzezylinder liegen sonst unter dem Pressrest. */
  let ghost = false;
  function applyGhost() {
    for (const m of shown.children) {
      m.material.opacity = ghost ? 0.4 : 0.92;
      m.material.depthWrite = !ghost;
      m.material.needsUpdate = true;
    }
    host.view.invalidate();
  }
  const ray = new T.Raycaster();
  return {
    group, rebuild: () => { rebuild(); applyGhost(); }, marksRebuild,
    set ghost(v) { ghost = !!v; applyGhost(); },
    /** Was unter dem Zeiger liegt → { body, face } oder null. */
    pickAt(ev) {
      rayAt(ray, ev, host.view.renderer.domElement, host.view.camera);
      const hit = ray.intersectObjects(pick.children, false)[0];
      if (!hit) return null;
      const body = plan.body(hit.object.userData.bodyId);
      return body ? { body, face: hit.faceIndex } : null;
    },
    neighbours(b) {
      const k = b.id + ':' + b.stamp;
      if (!nbrCache.has(k)) nbrCache.set(k, neighbours(b.tris));
      return nbrCache.get(k);
    },
    set visible(v) { shown.visible = v; }
  };
}

/* Ein Tipp ins Bild (kaum bewegt, kurz) — wie im Formaufbau. */
function onTap(host, fn) {
  const el = host.view.renderer.domElement;
  let press = null;
  el.addEventListener('pointerdown', ev => { press = ev.button === 0 || ev.button === undefined ? { x: ev.clientX, y: ev.clientY, t: performance.now() } : null; });
  el.addEventListener('pointerup', ev => {
    if (!press) return;
    const moved = Math.hypot(ev.clientX - press.x, ev.clientY - press.y), dt = performance.now() - press.t;
    press = null;
    if (moved > 6 || dt > 700) return;
    fn(ev);
  });
}

/** Dateien zu Körpern: GLB mit mehreren Knoten → je Knoten ein Körper. */
export async function readBodies(files) {
  const out = [];
  for (const file of files) {
    const buf = await file.arrayBuffer();
    const base = file.name.replace(/\.(stl|glb)$/i, '');
    if (isGLB(buf)) {
      for (const m of readGLBMeshes(buf)) if (m.tris.length >= 36) out.push({ name: m.name.replace(/_.*$/, '') || base, tris: Float64Array.from(m.tris) });
    } else {
      const { tris } = parsePart(buf, file.name);
      out.push({ name: base, tris: Float64Array.from(tris) });
    }
  }
  return out;
}

const fileInput = (ui, label, accept = '.stl,.glb', multiple = true) =>
  '<label class="btn btn-sm btn-outline sim-file"><input type="file" data-ui="' + ui + '" accept="' + accept + '"' + (multiple ? ' multiple' : '') + ' hidden>' + label + '</label>';

/* ── 1 Körper ─────────────────────────────────────────────────────── */
export function createKoerperTool(g, { plan, layer, app }) {
  const modes = [{
    id: 'koerper', label: 'Körper',
    hint: 'Die Körper der Form als STL oder GLB, in mm, im Bauteilsystem (Trennebene z = 0); mehrere auf einmal, auch per Ablegen ins Bild. Sind Anguss und Pressrest (oder Überläufe) dabei, entfallen die Schritte der Designer.',
    html: '<div class="sim-actions">' + fileInput('body-files', 'Dateien laden …')
      + '<button type="button" class="btn btn-sm btn-outline" data-ui="body-example">Beispiel: Gusstraube</button></div>'
      + '<div class="st-list sim-bodies" data-ui="body-list" data-scroll></div>'
      + '<div class="st-hintline" data-ui="body-note"></div>'
      + '<div class="krows" data-ui="body-kpis"></div>',
    primary: () => app.nextPrimary('koerper')
  }];
  function render() {
    const list = g.ui('body-list');
    if (!list) return;
    list.innerHTML = plan.bodies.length ? plan.bodies.map(b => '<div class="sim-body' + (b.include ? '' : ' off') + '" data-id="' + b.id + '">'
      + '<i class="sim-swatch" style="background:' + roleColor(b.role) + '"></i>'
      + '<input type="checkbox" data-act="include"' + (b.include ? ' checked' : '') + ' aria-label="' + esc(b.name) + ' mitrechnen">'
      + '<span class="sim-name" title="' + esc(b.name) + '">' + esc(b.name) + '<small>' + srcLabel(b) + ' · ' + fmt(b.tris.length / 9) + ' Dreiecke · ' + fmt(Math.abs(volume(b.tris)) / 1000, 1) + ' cm³'
      + (closedOf(b) ? '' : ' · nicht geschlossen') + '</small></span>'
      + '<select data-act="role" aria-label="Rolle">' + ROLES.map(([v, l]) => '<option value="' + v + '"' + (v === b.role ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
      + (b.src === 'file' ? '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="remove" aria-label="' + esc(b.name) + ' entfernen">✕</button>' : '<span></span>')
      + '</div>').join('') : '<div class="st-hintline">Noch kein Körper. Dateien laden, ablegen oder das Beispiel nehmen.</div>';
    const parts = plan.included().filter(b => b.role === 'part');
    g.ui('body-note').textContent = !parts.length ? 'Es fehlt ein Körper mit der Rolle Bauteil.'
      : parts.length > 1 ? 'Mehrere Bauteile: alle werden mitgerechnet (Mehrfachform).' : '';
    const vol = plan.included().reduce((s, b) => s + Math.abs(volume(b.tris)), 0);
    kpis(g.ui('body-kpis'), [
      { label: 'Körper', value: plan.included().length + ' von ' + plan.bodies.length },
      { label: 'Volumen zusammen', value: fmt(vol / 1000, 1) + ' cm³', note: 'Überlappungen doppelt' }
    ]);
  }
  /* Geschlossen (keine offene, keine mehrfache Kante)? Je Netzstand einmal. */
  const closedCache = new Map();
  const closedOf = b => { if (!closedCache.has(b.stamp)) closedCache.set(b.stamp, edgeCheck(b.tris).closed); return closedCache.get(b.stamp); };
  const srcLabel = b => (b.key === 'designer:tongues' ? 'Anschnitte bis aufs Bauteil verlängert'
    : ({ file: 'Datei', part: 'Bauteil des Studios', runner: 'Angussdesigner', biscuit: 'Angussdesigner', vents: 'Überlaufdesigner' })[b.src] || b.src);
  plan.on(() => render());
  const tool = {
    id: 'koerper', modes, startMode: 'koerper',
    mounted() {
      const inp = g.ui('body-files');
      inp.addEventListener('change', async () => { await app.addFiles([...inp.files]); inp.value = ''; });
      g.ui('body-example').addEventListener('click', () => app.loadExample());
      g.ui('body-list').addEventListener('change', ev => {
        const row = ev.target.closest('[data-id]');
        const b = row && plan.body(row.getAttribute('data-id'));
        if (!b) return;
        const act = ev.target.getAttribute('data-act');
        if (act === 'include') { b.include = ev.target.checked; plan.dropStale(); plan.changed('include'); g.changed(b.include ? '„' + b.name + '" mitrechnen' : '„' + b.name + '" weglassen'); }
        if (act === 'role') { b.role = ev.target.value; plan.changed('role'); g.changed('Rolle von „' + b.name + '": ' + roleLabel(b.role)); }
        app.refresh();
      });
      g.ui('body-list').addEventListener('click', ev => {
        const btn = ev.target.closest('[data-act="remove"]');
        const row = btn && btn.closest('[data-id]');
        const b = row && plan.body(row.getAttribute('data-id'));
        if (!b) return;
        plan.remove(b.id);
        g.changed('„' + b.name + '" entfernt');
        app.refresh();
      });
      render();
    },
    setActive() {}
  };
  return tool;
}

/* ── Einlass, Auslässe: Flächen im Bild wählen ─────────────────────── */
export function createFlaechenTool(g, { plan, layer, app, kind }) {
  const inlet = kind === 'inlet';
  const id = inlet ? 'einlass' : 'auslass';
  const modes = [{
    id, label: inlet ? 'Einlass' : 'Auslässe',
    hint: inlet
      ? 'Auf die große Kreisfläche des Pressrests tippen (Seite zur Kammer). Dort drückt der Kolben nach; der Pressrest dahinter ist zu Beginn voll Schmelze.'
      : 'Auf ebene Flächen tippen, durch die die Luft geht: Entlüftung, Vakuumventil, Ende eines Überlaufs. Ein zweiter Tipp nimmt die Fläche wieder heraus.',
    html: inlet
      ? '<div class="sim-actions"><button type="button" class="btn btn-sm btn-outline" data-ui="inlet-suggest">Vorschlag: größte Kreisfläche</button></div>'
        + '<div class="krows" data-ui="inlet-kpis"></div>'
        + numberRow({ ui: 'inlet-depth', label: 'Schmelze bis Tiefe', unit: 'mm' })
        + '<div class="st-hintline" data-ui="inlet-note"></div>'
      : '<div class="st-list" data-ui="outlet-list" data-scroll></div>'
        + '<div class="st-hintline" data-ui="outlet-note"></div>',
    primary: () => app.nextPrimary(id)
  }];
  let active = false;

  function choose(body, faces, info) {
    const sel = { bodyId: body.id, stamp: body.stamp, faces, centroid: info.centroid, normal: info.normal, area: info.area, radius: info.radius };
    if (inlet) {
      const d = depthAlong(body.tris, info.centroid, info.normal);
      sel.depthAuto = body.role === 'biscuit' ? d : Math.min(d, 2 * info.radius);
      sel.depth = sel.depthAuto;
      plan.inlet = sel;
      plan.changed('inlet');
      g.changed('Einlass gewählt');
    } else {
      const k = plan.outlets.findIndex(o => o.bodyId === body.id && o.faces.includes(faces[0]));
      if (k >= 0) { plan.outlets.splice(k, 1); plan.changed('outlets'); g.changed('Auslass entfernt'); }
      else { plan.outlets.push(Object.assign(sel, { mode: 'orifice', Cd: 0.8 })); plan.changed('outlets'); g.changed('Auslass gewählt'); }
    }
    app.refresh();
  }
  function pickAt(ev) {
    if (!active || g.shell.mode !== id) return;
    const hit = layer.pickAt(ev);
    if (!hit) return;
    const r = planarRegion(hit.body.tris, layer.neighbours(hit.body), hit.face);
    if (inlet && r.circularity < 0.6) g.shell.toast('Die Fläche ist nicht kreisrund (' + fmt(100 * r.circularity) + ' %) — als Einlass trotzdem übernommen.', { ms: 6000 });
    if (!inlet && r.area > 0.5 * totalArea(hit.body)) { g.shell.toast('Diese Fläche ist fast der ganze Körper — das ist keine ebene Auslassfläche.'); return; }
    choose(hit.body, r.faces, r);
  }
  const totalArea = b => { let A = 0; for (let i = 0; i < b.tris.length; i += 9) { const ux = b.tris[i + 3] - b.tris[i], uy = b.tris[i + 4] - b.tris[i + 1], uz = b.tris[i + 5] - b.tris[i + 2], vx = b.tris[i + 6] - b.tris[i], vy = b.tris[i + 7] - b.tris[i + 1], vz = b.tris[i + 8] - b.tris[i + 2]; A += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; } return A; };

  function suggest() {
    const cands = plan.included().filter(b => b.role === 'biscuit');
    const pool = cands.length ? cands : plan.included();
    let best = null, bb = null;
    for (const b of pool) { const r = suggestInlet(b.tris, layer.neighbours(b)); if (r && (!best || r.area > best.area)) { best = r; bb = b; } }
    if (!best) { g.shell.toast('Keine kreisrunde ebene Fläche gefunden — bitte im Bild wählen.'); return; }
    choose(bb, best.faces, best);
  }
  function render() {
    if (inlet) {
      const i = plan.inlet, b = i && plan.body(i.bodyId);
      kpis(g.ui('inlet-kpis'), i ? [
        { label: 'Körper', value: b ? b.name : '–' },
        { label: 'Fläche', value: fmt(i.area) + ' mm²', note: 'Ø ' + fmt(2 * i.radius, 1) + ' mm (gleiche Fläche)' },
        { label: 'Richtung', value: '(' + i.normal.map(x => fmt(Math.abs(x) < 5e-3 ? 0 : -x, 2)).join('; ') + ')', note: 'Kolben schiebt so' }
      ] : [{ label: 'Einlass', value: 'noch nicht gewählt', verdict: 'warn' }]);
      const d = g.ui('inlet-depth');
      if (d && document.activeElement !== d) d.value = i ? fmt(i.depth, 1) : '';
      g.ui('inlet-note').textContent = i ? 'Der Zylinder im Bild ist die Schmelze bei „Kammer voll"; Tiefe vorgeschlagen aus dem Körper (' + fmt(i.depthAuto, 1) + ' mm).' : '';
    } else {
      const list = g.ui('outlet-list');
      if (!list) return;
      list.innerHTML = plan.outlets.map((o, k) => {
        const b = plan.body(o.bodyId);
        return '<div class="sim-outlet" data-k="' + k + '"><b>vent' + (k + 1) + '</b><span>' + esc(b ? b.name : '') + ' · ' + fmt(o.area, 1) + ' mm²</span>'
          + '<select data-act="mode" aria-label="Art"><option value="orifice"' + (o.mode !== 'open' ? ' selected' : '') + '>Drossel (Cd 0,8)</option><option value="open"' + (o.mode === 'open' ? ' selected' : '') + '>offen</option></select>'
          + '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="remove" aria-label="vent' + (k + 1) + ' entfernen">✕</button></div>';
      }).join('') || '<div class="st-hintline">Noch kein Auslass.</div>';
      g.ui('outlet-note').textContent = 'Drossel: die Luft strömt durch die Fläche wie durch eine Blende (Fläche × Cd), die Schmelze bleibt davor stehen wie am Entlüftungsblock. Offen: Umgebungsdruck an der Fläche, Luft und Schmelze treten aus (offener Vakuumschlauch, Wassermodell).';
    }
  }
  plan.on(() => render());
  return {
    id, modes, startMode: id,
    mounted() {
      onTap(g, pickAt);
      if (inlet) {
        g.ui('inlet-suggest').addEventListener('click', suggest);
        g.ui('inlet-depth').addEventListener('change', ev => {
          const x = num(ev.target.value);
          if (plan.inlet && x > 0) { plan.inlet.depth = x; plan.changed('inlet'); g.changed('Schmelzetiefe ' + fmt(x, 1) + ' mm'); }
          render();
        });
      } else {
        const list = g.ui('outlet-list');
        list.addEventListener('change', ev => {
          const k = Number(ev.target.closest('[data-k]').getAttribute('data-k'));
          plan.outlets[k].mode = ev.target.value;
          plan.changed('outlets');
          g.changed('vent' + (k + 1) + ': ' + (ev.target.value === 'open' ? 'offen' : 'Drossel'));
        });
        list.addEventListener('click', ev => {
          const btn = ev.target.closest('[data-act="remove"]');
          if (!btn) return;
          plan.outlets.splice(Number(btn.closest('[data-k]').getAttribute('data-k')), 1);
          plan.changed('outlets');
          g.changed('Auslass entfernt');
          app.refresh();
        });
      }
      render();
    },
    setActive(on) {
      active = on;
      layer.ghost = on;
      g.part.setLook({ opacity: on ? 0.45 : undefined });
    },
    /** für die Seite: den Einlass ohne Klick vorschlagen (Beispiel) */
    suggest,
    /** wie ein Tipp auf das Dreieck `face` des Körpers (Tests, Skripte) */
    pickFace(bodyId, face) {
      const b = plan.body(bodyId);
      if (!b) return false;
      const r = planarRegion(b.tris, layer.neighbours(b), face);
      choose(b, r.faces, r);
      return true;
    }
  };
}

/* ── 6 Netz ───────────────────────────────────────────────────────── */
export function createNetzTool(g, { plan, app }) {
  const modes = [{
    id: 'netz', label: 'Netz',
    hint: 'snappyHexMesh aus den Körpern: ein grober Hintergrund, an den Wänden und in den Körpern verfeinert bis zur Zellgröße. Dünne Körper bekommen eigene Stufen, damit zwei Zellen über die Wand passen.',
    html: numberRow({ ui: 'mesh-cell', label: 'Zellgröße', unit: 'mm' })
      + segRow({ ui: 'mesh-level', label: 'Hintergrund', options: [['0', '1×'], ['1', '2×'], ['2', '4×'], ['3', '8×']], value: String(plan.mesh.level), help: '' })
      + numberRow({ ui: 'mesh-np', label: 'Prozesse', unit: '' })
      + '<div data-ui="mesh-sleeve-row">' + numberRow({ ui: 'mesh-sleeve', label: 'Kammer: Zelllänge', unit: 'mm' }) + '</div>'
      + '<div class="sim-actions"><button type="button" class="btn btn-sm btn-outline" data-ui="mesh-fit" hidden></button></div>'
      + '<div class="sim-label">Körper</div><div class="st-list" data-ui="mesh-bodies"></div>'
      + '<div class="krows" data-ui="mesh-kpis"></div>'
      + '<div class="st-hintline" data-ui="mesh-note"></div>',
    primary: () => app.nextPrimary('netz'),
    enter: () => measure()
  }];
  const thick = new Map();                     // stamp → { p02, p10, median }
  /* Die Wand, nach der die Zellen gehen: beim Anguss die dünnsten 2 % (der
     Anschnitt — wenig Fläche, aber er bestimmt die Geschwindigkeit; mit
     p10 lag er im Beispiel bei 4,6 statt 2,5 mm, und die Schmelze schoss
     mit 41 statt 22 m/s durch den zu grob vernetzten Anschnitt), sonst die
     dünnsten 10 %. */
  /* Anguss aus Datei: die dünnsten 2 % (sein Anschnitt); der Anguss des
     Designers nicht — sein Anschnitt steckt in der Anschnittzunge (deren
     Höhe ist der Anschnitt), und an den Spitzen seiner Verzweigungen fände
     p02 Keile von Zehntelmillimetern (U-Profil: drei Stufen, 3 Mio. Zellen). */
  const wallOf = b => { const th = thick.get(b.stamp); return th ? (b.role === 'runner' && b.src === 'file' ? th.p02 : th.p10) : NaN; };
  /** Wandstärken messen (einmal je Netz) und Vorschläge setzen, wo der
      Anwender nichts gewählt hat: Überläufe und Anguss automatisch. */
  function measure() {
    let changed = false;
    for (const b of plan.included()) {
      if (!thick.has(b.stamp)) thick.set(b.stamp, thickness(b.tris));
      const sug = extraLevels(wallOf(b), plan.mesh.cell);
      if (b.extraSet === undefined && (b.role === 'overflow' || b.role === 'runner') && (b.extra || 0) !== sug) { b.extra = sug; changed = true; }
    }
    if (changed) plan.changed('mesh');
    render();
  }
  function render() {
    const M = plan.mesh;
    const set = (ui, v) => { const el = g.ui(ui); if (el && document.activeElement !== el) el.value = v; };
    set('mesh-cell', fmt(M.cell, 2)); set('mesh-np', String(M.nProc));
    const seg = g.ui('mesh-level');
    if (seg) for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b.getAttribute('data-value') === String(M.level));
    const bodies = plan.included();
    const list = g.ui('mesh-bodies');
    if (list) list.innerHTML = bodies.map(b => {
      const th = thick.get(b.stamp), wall = wallOf(b);
      const k = b.extra || 0, h = M.cell / Math.pow(2, k);
      const thin = th && wall < 2 * h;
      return '<div class="sim-meshrow' + (thin ? ' warn' : '') + '" data-id="' + b.id + '"><span class="sim-name">' + esc(b.name)
        + '<small>' + (th ? 'Wand ≈ ' + fmt(wall, 1) + ' mm (' + (b.role === 'runner' && b.src === 'file' ? 'Anschnitt, dünnste 2 %' : 'dünnste 10 %') + ')' : 'Wand: wird gemessen …') + (thin ? ' · unter zwei Zellen' : '') + '</small></span>'
        + '<select data-act="extra" aria-label="Verfeinerung ' + esc(b.name) + '">' + [0, 1, 2, 3].map(x => '<option value="' + x + '"' + (x === k ? ' selected' : '') + '>' + fmt(M.cell / Math.pow(2, x), 2) + ' mm</option>').join('') + '</select></div>';
    }).join('');
    let cells = bodies.reduce((s, b) => s + Math.abs(volume(b.tris)) * Math.pow(8, b.extra || 0), 0) / Math.pow(M.cell, 3);
    /* mit Kammer: der Hub als Schichten über den Zellen der Einlassfläche */
    const sp = plan.shot.chamber && plan.inlet ? shotPlan(plan) : null;
    const hL = M.sleeveCell > 0 ? M.sleeveCell : 2 * M.cell;
    const sleeve = sp && !sp.error ? Math.round(plan.inlet.area / (M.cell * M.cell)) * Math.max(10, Math.round(sp.stroke / hL)) : 0;
    cells += sleeve;
    const sr = g.ui('mesh-sleeve-row');
    if (sr) sr.hidden = !plan.shot.chamber;
    set('mesh-sleeve', fmt(hL, 2));
    const thinNow = bodies.filter(b => wallOf(b) < 2 * M.cell / Math.pow(2, b.extra || 0));
    kpis(g.ui('mesh-kpis'), [
      { label: 'Zellen (grob)', value: fmt(cells), verdict: cells > 5e6 ? 'bad' : cells > 1.5e6 ? 'warn' : 'ok', note: cells > 1.5e6 ? 'lange Rechnung (Stunden)' : '' },
      { label: 'Hintergrund', value: fmt(M.cell * Math.pow(2, M.level), 2) + ' mm', note: 'grob außerhalb der Körper' },
      ...(sleeve ? [{ label: 'Kammer', value: fmt(sleeve) + ' Zellen', note: fmt(sp.stroke) + ' mm Hub in ' + Math.max(10, Math.round(sp.stroke / hL)) + ' Schichten (extrudeMesh)' }] : [])
    ]);
    g.ui('mesh-note').textContent = thinNow.length ? thinNow.map(b => b.name).join(', ') + ': dünner als zwei Zellen — kann im Netz fehlen; dann bricht Allrun mit einer Meldung ab.' : '';
    /* Das Bauteil bekommt keine Stufen von selbst (sie kosten das Achtfache):
       der Knopf setzt die Zellgröße so, dass seine dünnste Wand zwei Zellen hat. */
    const fit = g.ui('mesh-fit');
    if (fit) {
      const parts = bodies.filter(b => b.role === 'part' && isFinite(wallOf(b)));
      const want = parts.length ? Math.floor(Math.min(...parts.map(wallOf)) / 2 * 20) / 20 : NaN;
      const show = want > 0.1 && want < M.cell - 1e-9;
      fit.hidden = !show;
      fit.textContent = show ? 'Zellgröße ' + fmt(want, 2) + ' mm: zwei Zellen über die dünnste Bauteilwand' : '';
      fit.dataset.cell = show ? String(want) : '';
    }
  }
  plan.on(w => { if (['bodies', 'include', 'mesh', 'apply', 'role', 'shot', 'inlet'].includes(w)) render(); });
  return {
    id: 'netz', modes, startMode: 'netz',
    mounted() {
      g.ui('mesh-cell').addEventListener('change', ev => {
        const x = num(ev.target.value);
        if (x >= 0.1 && x <= 50) { plan.mesh.cell = x; for (const b of plan.bodies) if (b.extraSet === undefined) delete b.extra; plan.changed('mesh'); g.changed('Zellgröße ' + fmt(x, 2) + ' mm'); measure(); }
        render(); app.refresh();
      });
      g.ui('mesh-fit').addEventListener('click', ev => {
        const x = Number(ev.currentTarget.dataset.cell);
        if (!(x > 0)) return;
        plan.mesh.cell = x;
        for (const b of plan.bodies) if (b.extraSet === undefined) delete b.extra;
        plan.changed('mesh'); g.changed('Zellgröße ' + fmt(x, 2) + ' mm'); measure(); app.refresh();
      });
      g.ui('mesh-sleeve').addEventListener('change', ev => { const x = num(ev.target.value); if (x >= 0.2 && x <= 50) { plan.mesh.sleeveCell = x; plan.changed('mesh'); g.changed('Kammer: Zelllänge ' + fmt(x, 2) + ' mm'); } render(); });
      g.ui('mesh-np').addEventListener('change', ev => { const x = Math.round(num(ev.target.value)); if (x >= 1 && x <= 512) { plan.mesh.nProc = x; plan.changed('mesh'); g.changed(x + ' Prozesse'); } render(); });
      g.ui('mesh-level').addEventListener('click', ev => { const b = ev.target.closest('[data-value]'); if (!b) return; plan.mesh.level = Number(b.getAttribute('data-value')); plan.changed('mesh'); g.changed('Hintergrund ' + plan.mesh.level); render(); });
      g.ui('mesh-bodies').addEventListener('change', ev => {
        const b = plan.body(ev.target.closest('[data-id]').getAttribute('data-id'));
        if (!b) return;
        b.extra = Number(ev.target.value); b.extraSet = true;
        plan.changed('mesh'); g.changed(b.name + ': ' + fmt(plan.mesh.cell / Math.pow(2, b.extra), 2) + ' mm');
        render();
      });
      render();
    },
    measure
  };
}

/* ── 7 Prozess ────────────────────────────────────────────────────── */
const PROC = [
  ['Tcast', 'Gießtemperatur', '°C', 0, 100, 1500],
  ['Tdie', 'Formtemperatur', '°C', 0, 0, 800],
  ['hDie', 'Wärmeübergang Form', 'W/(m²·K)', 0, 0, 1e6],
  ['rho', 'Dichte flüssig', 'kg/m³', 0, 500, 20000],
  ['mu', 'Zähigkeit', 'Pa·s', 4, 1e-5, 1],
  ['cp', 'c_p flüssig', 'J/(kg·K)', 0, 100, 5000],
  ['hf', 'Erstarrungswärme', 'kJ/kg', 0, 1, 2000],
  ['Tliq', 'Liquidus', '°C', 0, 50, 1500],
  ['Tsol', 'Solidus', '°C', 0, 50, 1500]
];
const SHOT_PARAMS = [['kappa', 'κ = Kappe / U_H', '–', 2, 0.3, 1, 'focus'], ['v1', 'V₁', 'm/s', 2, 0.01, 5, 'v1v2'], ['a1', 'a₁', 'm/s²', 1, 0.1, 500, 'v1v2'], ['v2', 'V₂', 'm/s', 2, 0.1, 20, 'v1v2'], ['a2', 'a₂', 'm/s²', 1, 0.1, 5000, 'v1v2']];
export function createProzessTool(g, { plan, app }) {
  const modes = [{
    id: 'prozess', label: 'Prozess',
    hint: 'Die Schusskurve der Auslegung auf dieses Modell: Kolben-Ø vom Einlass, Massen aus den Körpern. Ohne Kammer beginnt die Rechnung bei „Kammer voll", mit Kammer beim Kolbenstart — die Schmelze liegt dann in der Kammer.',
    html: segRow({ ui: 'p-chamber', label: 'Gießkammer', options: [['0', 'ohne'], ['1', 'mit Kammer']], value: plan.shot.chamber ? '1' : '0' })
      + numberRow({ ui: 'p-length', label: 'Kammerlänge', unit: 'mm' })
      + selectRow({ ui: 'p-mode', label: 'Schusskurve', options: CURVE_MODES, value: plan.shot.mode })
      + SHOT_PARAMS.map(([k, l, u, , , , m]) => '<div data-shotmode="' + m + '">' + numberRow({ ui: 'p-' + k, label: l, unit: u }) + '</div>').join('')
      + '<div class="sim-curvebox" data-ui="p-curve"></div>'
      + '<div class="krows" data-ui="p-shot"></div>'
      + '<div class="sim-actions"><button type="button" class="btn btn-sm btn-outline" data-ui="p-length-fit" hidden></button></div>'
      + '<div class="sim-label">Schmelze und Form</div>'
      + PROC.map(([k, l, u]) => numberRow({ ui: 'p-' + k, label: l, unit: u })).join('')
      + selectRow({ ui: 'p-gravity', label: 'Schwerkraft', options: [['-y', '−y'], ['+y', '+y'], ['-x', '−x'], ['+x', '+x'], ['-z', '−z'], ['+z', '+z'], ['aus', 'aus']], value: plan.process.gravity })
      + '<div class="krows" data-ui="p-kpis"></div>',
    primary: () => app.nextPrimary('prozess'),
    enter: () => measureGate()
  }];
  let gateA = NaN, gateBusy = false;
  async function measureGate() {
    gateBusy = true; render();
    try { gateA = await app.gate(); } catch (err) { console.error(err); gateA = NaN; }
    gateBusy = false; render();
  }
  /* Zielbänder aus der Auslegung, sonst übliche Werte */
  const design = () => { try { return window.__PROJECT__.getSection('design').values || {}; } catch { return {}; } };
  const band = () => { const v = design(); return v.gateMin > 0 && v.gateMax > v.gateMin ? [v.gateMin, v.gateMax] : [30, 50]; };
  const fillBand = () => { const v = design(); return v.fillMin > 0 && v.fillMax > v.fillMin ? [v.fillMin, v.fillMax] : [40, 60]; };
  function render() {
    const set = (ui, v) => { const el = g.ui(ui); if (el && document.activeElement !== el) el.value = v; };
    for (const [k, , , d] of PROC) set('p-' + k, fmt(plan.process[k], d));
    for (const [k, , , d] of SHOT_PARAMS) set('p-' + k, fmt(plan.shot[k], d));
    set('p-length', fmt(chamberLength(plan.shot), 0));
    const gr = g.ui('p-gravity');
    if (gr) gr.value = plan.process.gravity;
    const md = g.ui('p-mode');
    if (md) md.value = plan.shot.mode;
    const seg = g.ui('p-chamber');
    if (seg) for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b.getAttribute('data-value') === (plan.shot.chamber ? '1' : '0'));
    const box = g.ui('p-curve');
    if (box) for (const el of box.parentNode.querySelectorAll('[data-shotmode]')) el.hidden = el.getAttribute('data-shotmode') !== plan.shot.mode;
    const sp = shotPlan(plan);
    if (box) box.innerHTML = sp.error ? '<div class="st-hintline">' + esc(sp.error) + '</div>' : curveSVG(sp, { chamber: plan.shot.chamber });
    const P = plan.process;
    const [lo, hi] = band(), [flo, fhi] = fillBand();
    const rows = [];
    if (!sp.error) {
      const vc = sp.shot.vcrit, v1 = sp.shot.v1;
      /* Der Strömungsquerschnitt: beim Designer Breite × Höhe der Anschnitte
         (die Auflage aufs Bauteil ist dort die Berührfläche, nicht der
         Querschnitt), sonst die Öffnung in der Bauteilwand. */
      const sec = app.designerGateSection();
      const flowA = isFinite(sec) ? Math.min(sec, gateA) : gateA;
      const vg = plan.inlet ? plan.inlet.area * sp.vAtPart / flowA : NaN;
      const loose = isFinite(sec) && isFinite(gateA) && gateA < 0.5 * sec;
      rows.push(
        { label: 'Kolben-Ø', value: fmt(sp.diam, 1) + ' mm', note: 'vom Einlass · Kammer ' + fmt(sp.length) + ' mm, Hub ' + fmt(sp.stroke) + ' mm' },
        { label: 'Füllgrad', value: fmt(100 * sp.phi, 1) + ' %', verdict: 100 * sp.phi < flo || 100 * sp.phi > fhi ? 'warn' : 'ok', note: 'Ziel ' + fmt(flo) + '–' + fmt(fhi) + ' % · „Kammer voll" bei ' + fmt(sp.sFull) + ' mm, ' + fmt(sp.tFull * 1000) + ' ms' },
        { label: '1. Phase', value: fmt(v1, 2) + ' m/s', verdict: v1 <= vc + 1e-9 ? 'ok' : 'bad', note: 'höchstens v_krit ' + fmt(vc, 2) + ' m/s' },
        { label: 'Füllzeit', value: isFinite(sp.fillMs) ? fmt(sp.fillMs, 1) + ' ms' : '–', note: 'ab Anschnitt · v bei „Bauteil gefüllt" ' + fmt(sp.vAtPart, 2) + ' m/s' },
        gateBusy ? { label: 'Anschnitt', value: 'wird gemessen …' }
          : loose ? { label: 'Anschnitt', value: fmt(gateA) + ' mm²', verdict: 'bad', note: 'Anguss und Bauteil berühren sich kaum (Querschnitt ' + fmt(sec) + ' mm²): unter „Körper" die Anschnittzungen mitrechnen' }
          : isFinite(vg) ? { label: 'Anschnittgeschw.', value: fmt(vg) + ' m/s', verdict: vg < lo || vg > hi ? 'warn' : 'ok', note: 'Anschnitt ' + fmt(flowA) + ' mm² · Ziel ' + fmt(lo) + '–' + fmt(hi) + ' m/s' }
            : { label: 'Anschnitt', value: '–', note: 'braucht Bauteil und Anguss' },
        { label: 'Rechnung', value: plan.shot.chamber ? 'ab Kolbenstart' : 'ab „Kammer voll"', note: plan.shot.chamber ? 'Kammer als bewegtes Netz (libshotSleeve)' : 'Kolben als Geschwindigkeit am Einlass' }
      );
      if (sp.warn) rows.push({ label: 'Hinweis', value: '', verdict: 'warn', note: sp.warn });
    } else rows.push({ label: 'Schusskurve', value: '–', verdict: 'bad', note: sp.error });
    kpis(g.ui('p-shot'), rows);
    /* Füllgrad außerhalb des Zielbands: die Kammerlänge für die Mitte anbieten */
    const fit = g.ui('p-length-fit');
    if (fit) {
      const want = sp.error ? NaN : Math.round(sp.Vdose / (Math.PI * sp.diam * sp.diam / 4) / ((flo + fhi) / 200) / 5) * 5;
      const off = !sp.error && (100 * sp.phi < flo || 100 * sp.phi > fhi) && want > sp.depth + 10;
      fit.hidden = !off;
      fit.textContent = off ? 'Kammerlänge ' + fmt(want) + ' mm für ' + fmt((flo + fhi) / 2) + ' % Füllgrad' : '';
      fit.dataset.length = off ? String(want) : '';
    }
    const ok = P.Tcast > P.Tliq && P.Tliq > P.Tsol && P.Tdie < P.Tsol;
    kpis(g.ui('p-kpis'), [
      { label: 'Überhitzung', value: fmt(P.Tcast - P.Tliq) + ' K', verdict: P.Tcast > P.Tliq ? 'ok' : 'bad' },
      { label: 'Temperaturen', value: ok ? 'stimmig' : 'prüfen', verdict: ok ? 'ok' : 'bad', note: 'Guss > Liquidus > Solidus > Form' }
    ]);
  }
  plan.on(w => { if (['process', 'shot', 'apply', 'inlet', 'bodies', 'include', 'role', 'mesh'].includes(w)) render(); });
  return {
    id: 'prozess', modes, startMode: 'prozess',
    mounted() {
      for (const [k, l, , d, lo, hi] of PROC) {
        g.ui('p-' + k).addEventListener('change', ev => {
          const x = num(ev.target.value);
          if (isFinite(x) && x >= lo && x <= hi) { plan.process[k] = x; plan.changed('process'); g.changed(l + ' ' + fmt(x, d)); }
          render(); app.refresh();
        });
      }
      for (const [k, l, , d, lo, hi] of SHOT_PARAMS) {
        g.ui('p-' + k).addEventListener('change', ev => {
          const x = num(ev.target.value);
          if (isFinite(x) && x >= lo && x <= hi) { plan.shot[k] = x; plan.changed('shot'); g.changed(l + ' ' + fmt(x, d)); }
          render(); app.refresh();
        });
      }
      g.ui('p-length').addEventListener('change', ev => {
        const x = num(ev.target.value);
        if (isFinite(x) && x > 10 && x < 5000) { plan.shot.length = x; plan.changed('shot'); g.changed('Kammerlänge ' + fmt(x) + ' mm'); }
        render(); app.refresh();
      });
      g.ui('p-length-fit').addEventListener('click', ev => {
        const x = Number(ev.currentTarget.dataset.length);
        if (x > 0) { plan.shot.length = x; plan.changed('shot'); g.changed('Kammerlänge ' + fmt(x) + ' mm'); render(); app.refresh(); }
      });
      g.ui('p-mode').addEventListener('change', ev => { plan.shot.mode = ev.target.value; plan.changed('shot'); g.changed('Schusskurve ' + ev.target.selectedOptions[0].textContent); render(); app.refresh(); });
      g.ui('p-chamber').addEventListener('click', ev => {
        const b = ev.target.closest('[data-value]');
        if (!b) return;
        plan.shot.chamber = b.getAttribute('data-value') === '1';
        plan.changed('shot'); g.changed(plan.shot.chamber ? 'Mit Gießkammer' : 'Ohne Gießkammer');
        render(); app.refresh();
      });
      g.ui('p-gravity').addEventListener('change', ev => { plan.process.gravity = ev.target.value; plan.changed('process'); g.changed('Schwerkraft ' + ev.target.value); render(); app.refresh(); });
      render();
    },
    valid() {
      const P = plan.process;
      if (!(P.Tcast > P.Tliq && P.Tliq > P.Tsol && P.Tdie < P.Tsol)) return false;
      const sp = shotPlan(plan);
      if (sp.error) return false;
      /* mit Kammer: Schwerkraft quer zur Kolbenachse (die Schmelze liegt in der Kammer) */
      if (plan.shot.chamber) return chamberOk(plan);
      return true;
    },
    why() {
      const sp = shotPlan(plan);
      if (sp.error) return 'Schusskurve: ' + sp.error;
      if (plan.shot.chamber && !chamberOk(plan)) return 'Mit Kammer muss die Schwerkraft quer zur Kolbenachse stehen.';
      return 'Die Temperaturen passen nicht zusammen (Guss > Liquidus > Solidus > Form).';
    }
  };
}
const GVEC = { '-x': [-1, 0, 0], '+x': [1, 0, 0], '-y': [0, -1, 0], '+y': [0, 1, 0], '-z': [0, 0, -1], '+z': [0, 0, 1] };
function chamberOk(plan) {
  const gv = GVEC[plan.process.gravity];
  if (!gv || !plan.inlet) return false;
  return Math.abs(gv[0] * plan.inlet.normal[0] + gv[1] * plan.inlet.normal[1] + gv[2] * plan.inlet.normal[2]) <= 0.2;
}

/* ── 8 Auswertung ─────────────────────────────────────────────────── */
/* Die Bilder: welche Kennwerte, wann (nach Füllgrad, Zeit oder Kolbenweg, n
   Stück), welches Format, aus welchen Ansichten. Solange der Schritt dran
   ist, zeigt ein Rahmen im Viewport den Bildausschnitt im gewählten
   Seitenverhältnis — mit einer Farbleiste oben links und dem Text oben
   rechts, an denselben Stellen wie in render.py (FRAME). */
export function createAuswertungTool(g, { plan, app, host }) {
  const P = () => (plan.post = normalizePost(plan.post));
  const modes = [{
    id: 'auswertung', label: 'Bilder',
    hint: 'Was render.py nach der Rechnung als Bild schreibt: je Kennwert, Zeitpunkt und Ansicht eines. Der Rahmen im Bild ist der Ausschnitt; „Aktuelle Ansicht übernehmen" nimmt ihn genau so.',
    html: '<div class="sim-label">Kennwerte</div><div class="sim-crit" data-ui="post-crit"></div>'
      + selectRow({ ui: 'post-preview', label: 'Vorschau', options: CRITERIA.map(c => [c.id, c.label]), value: 'velocity' })
      + '<div class="sim-label">Zeitpunkte</div>'
      + segRow({ ui: 'post-by', label: 'nach', options: WHEN, value: 'fill' })
      + numberRow({ ui: 'post-count', label: 'Bilder je Kennwert', unit: '' })
      + '<div class="st-hintline" data-ui="post-when"></div>'
      + '<div class="sim-label">Format</div>'
      + segRow({ ui: 'post-aspect', label: 'Seiten', options: ASPECTS.map(([a]) => [a, a]), value: '16:9' })
      + selectRow({ ui: 'post-width', label: 'Breite', options: WIDTHS.map(w => [String(w), w + ' px']), value: '1600' })
      + '<div class="sim-label">Ansichten</div><div class="st-list sim-views" data-ui="post-views"></div>'
      + '<div class="sim-actions"><button type="button" class="btn btn-sm btn-outline" data-ui="post-addview">Aktuelle Ansicht übernehmen</button></div>'
      + '<div class="krows" data-ui="post-kpis"></div>',
    primary: () => app.nextPrimary('auswertung'),
    enter: () => { showFrame(true); },
    leave: () => { showFrame(false); }
  }];

  /* ── der Rahmen im Viewport ── */
  const vp = host.viewport;
  const frame = document.createElement('div');
  frame.className = 'sim-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.hidden = true;
  frame.innerHTML = '<div class="sim-frame-box"><div class="sim-frame-bar"><i></i><b class="hi"></b><b class="lo"></b><span class="tt"></span></div>'
    + '<div class="sim-frame-text"></div><div class="sim-frame-size"></div></div>';
  vp.appendChild(frame);
  const box = frame.querySelector('.sim-frame-box');
  let frameOn = false;
  function boxRect() {
    const W = vp.clientWidth || 1, H = vp.clientHeight || 1;
    const [iw, ih] = imageSize(P());
    const r = iw / ih;
    let w = W * 0.9, h = w / r;
    if (h > H * 0.86) { h = H * 0.86; w = h * r; }
    return { W, H, w, h, x: (W - w) / 2, y: (H - h) / 2 };
  }
  function layoutFrame() {
    if (!frameOn) return;
    const R = boxRect(), post = P();
    Object.assign(box.style, { left: R.x + 'px', top: R.y + 'px', width: R.w + 'px', height: R.h + 'px' });
    const crit = CRITERIA.find(c => c.id === post.preview) || CRITERIA[0];
    const [iw, ih] = imageSize(post);
    const fs = Math.max(9, 22 * R.h / 1000);                              // wie render.py: 22 px je 1000 px Bildhöhe
    const bar = frame.querySelector('.sim-frame-bar');
    Object.assign(bar.style, { left: FRAME.barX * R.w + 'px', top: FRAME.barTop * R.h + 'px', height: FRAME.barLen * R.h + 'px', fontSize: fs * 0.85 + 'px' });
    const ramp = bar.querySelector('i');
    ramp.style.width = Math.max(5, FRAME.barW * R.w) + 'px';
    /* dieselbe Leiste wie in den Bildern: heat der Palette */
    ramp.style.background = 'linear-gradient(to top, ' + Array.from({ length: 7 }, (_, k) => scale('heat', k / 6)).join(', ') + ')';
    bar.querySelector('.hi').textContent = crit.range[1];
    bar.querySelector('.lo').textContent = crit.range[0];
    bar.querySelector('.tt').textContent = crit.label + ' [' + crit.unit + ']';
    const sp = plan.inlet ? shotPlan(plan) : null;
    const mid = targets(post)[Math.floor((targets(post).length - 1) / 2)];
    const tTxt = sp && !sp.error ? fmt((plan.shot.chamber ? sp.tFull : 0) * 1000 + (sp.tEnd - sp.tFull) * 1000 * 0.5, 1) + ' ms' : '… ms';
    const sTxt = sp && !sp.error ? fmt(sp.sFull + (sp.sEnd - sp.sFull) * 0.5) + ' mm' : '… mm';
    const txt = frame.querySelector('.sim-frame-text');
    Object.assign(txt.style, { right: FRAME.textRight * R.w + 'px', top: FRAME.textTop * R.h + 'px', fontSize: fs + 'px' });
    txt.innerHTML = esc(plan.title) + ' · ' + esc(crit.label) + '<br>t = ' + tTxt + ' · Füllgrad ' + (post.when.by === 'fill' ? fmt(mid) : '50') + ' % · Kolben ' + sTxt;
    frame.querySelector('.sim-frame-size').textContent = iw + ' × ' + ih + ' px';
  }
  function showFrame(on) {
    frameOn = !!on;
    frame.hidden = !frameOn;
    if (frameOn) layoutFrame();
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => layoutFrame()).observe(vp);
  else if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', layoutFrame);

  /* ── Ansichten ── */
  const cam = () => host.view.camera, ctl = () => host.view.controls;
  function captureView() {
    const c = cam(), t = ctl() ? ctl().target : new T.Vector3();
    const R = boxRect();
    /* der Öffnungswinkel des RAHMENS (senkrecht), nicht des ganzen Viewports */
    const fov = 2 * Math.atan(Math.tan((c.fov || 45) * Math.PI / 360) * R.h / R.H) * 180 / Math.PI;
    const k = P().views.filter(v => v.id.startsWith('cam')).length + 1;
    P().views.push({ id: 'cam' + k, label: 'Ansicht ' + k, pos: c.position.toArray().map(x => Number(x.toFixed(3))), target: t.toArray().map(x => Number(x.toFixed(3))), up: c.up.toArray().map(x => Number(x.toFixed(5))), fov: Number(fov.toFixed(3)) });
    plan.changed('post'); g.changed('Ansicht ' + k + ' übernommen'); app.refresh();
    g.shell.toast('Ansicht ' + k + ' übernommen: genau der Rahmen, wie er jetzt im Bild steht.');
  }
  function showView(v) {
    const c = cam(), t = ctl() ? ctl().target : null;
    if (v.pos) {
      c.position.set(...v.pos); c.up.set(...v.up);
      if (t) t.set(...v.target);
      c.lookAt(...v.target);
    } else {
      const ctr = t ? t.clone() : new T.Vector3();
      const d = new T.Vector3(...v.dir).normalize();
      const dist = c.position.distanceTo(ctr);
      c.up.set(...v.up);
      c.position.copy(ctr).addScaledVector(d, dist);
      c.lookAt(ctr);
      g.shell.fit && g.shell.fit();
    }
    if (ctl() && ctl().update) ctl().update();
    c.updateMatrixWorld();
    host.view.invalidate();
  }

  function render() {
    const post = P();
    g.ui('post-crit').innerHTML = CRITERIA.map(c => '<label class="inline" title="' + esc(c.hint) + '"><input type="checkbox" data-crit="' + c.id + '"' + (post.criteria.includes(c.id) ? ' checked' : '') + '> <span>' + c.label + ' <small>[' + c.unit + ']</small></span></label>').join('');
    const pv = g.ui('post-preview'); if (pv) pv.value = post.preview;
    const seg = (ui, val) => { const el = g.ui(ui); if (el) for (const b of el.querySelectorAll('button')) b.classList.toggle('active', b.getAttribute('data-value') === val); };
    seg('post-by', post.when.by); seg('post-aspect', post.aspect);
    const cnt = g.ui('post-count'); if (cnt && document.activeElement !== cnt) cnt.value = String(post.when.count);
    const wd = g.ui('post-width'); if (wd) wd.value = String(post.width);
    const tg = targets(post);
    g.ui('post-when').textContent = post.when.by === 'fill' ? 'Füllgrad der Form: ' + tg.map(x => fmt(x, x % 1 ? 1 : 0)).join(' · ') + ' %'
      : post.when.by === 'time' ? tg.length + ' Bilder in gleichen Zeitabständen, von der Ankunft der Schmelze in der Form bis zum Ende'
        : tg.length + ' Bilder in gleichen Abständen des Kolbenwegs, von der Ankunft der Schmelze in der Form bis zum Ende';
    const views = post.views;
    const rows = VIEW_PRESETS.map(v => ({ v, on: views.some(x => x.id === v.id), preset: true }))
      .concat(views.filter(v => v.id.startsWith('cam')).map(v => ({ v, on: true, preset: false })));
    g.ui('post-views').innerHTML = rows.map(({ v, on, preset }) => '<div class="sim-viewrow" data-view="' + v.id + '">'
      + '<label class="inline"><input type="checkbox" data-act="on"' + (on ? ' checked' : '') + (preset ? '' : ' disabled') + '> <span>' + esc(v.label) + (preset ? ' <small>eingepasst</small>' : ' <small>genau</small>') + '</span></label>'
      + '<button type="button" class="btn btn-sm btn-outline" data-act="show">zeigen</button>'
      + (preset ? '<span></span>' : '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="remove" aria-label="' + esc(v.label) + ' entfernen">✕</button>') + '</div>').join('');
    const [iw, ih] = imageSize(post);
    const n = imageList(post).length;
    kpis(g.ui('post-kpis'), [
      { label: 'Bilder', value: String(n), verdict: n ? 'ok' : 'warn', note: n ? post.views.length + ' Ansicht(en) × ' + post.criteria.length + ' Kennwert(e) · ' + iw + ' × ' + ih + ' px' : 'nichts gewählt' }
    ]);
    layoutFrame();
  }
  plan.on(w => { if (w === 'post' || w === 'apply' || w === 'title' || w === 'shot' || w === 'inlet') render(); });
  return {
    id: 'auswertung', modes, startMode: 'auswertung',
    mounted() {
      g.ui('post-crit').addEventListener('change', ev => {
        const c = ev.target.getAttribute('data-crit'), post = P();
        post.criteria = ev.target.checked ? CRITERIA.map(x => x.id).filter(x => x === c || post.criteria.includes(x)) : post.criteria.filter(x => x !== c);
        if (ev.target.checked) post.preview = c;
        plan.changed('post'); g.changed('Bilder: ' + c); app.refresh();
      });
      g.ui('post-preview').addEventListener('change', ev => { P().preview = ev.target.value; plan.changed('post'); });
      g.ui('post-by').addEventListener('click', ev => { const b = ev.target.closest('[data-value]'); if (!b) return; P().when.by = b.getAttribute('data-value'); plan.changed('post'); g.changed('Bilder nach ' + b.textContent); });
      g.ui('post-count').addEventListener('change', ev => {
        const x = Math.round(num(ev.target.value));
        if (x >= 1 && x <= 200) { P().when.count = x; plan.changed('post'); g.changed(x + ' Bilder je Kennwert'); }
        render(); app.refresh();
      });
      g.ui('post-aspect').addEventListener('click', ev => { const b = ev.target.closest('[data-value]'); if (!b) return; P().aspect = b.getAttribute('data-value'); plan.changed('post'); g.changed('Seitenverhältnis ' + P().aspect); });
      g.ui('post-width').addEventListener('change', ev => { P().width = Number(ev.target.value); plan.changed('post'); g.changed('Bildbreite ' + P().width + ' px'); });
      const list = g.ui('post-views');
      list.addEventListener('change', ev => {
        const id = ev.target.closest('[data-view]').getAttribute('data-view');
        const post = P();
        if (ev.target.checked) { const v = VIEW_PRESETS.find(x => x.id === id); if (v && !post.views.some(x => x.id === id)) post.views.push({ id: v.id, label: v.label, dir: v.dir, up: v.up }); }
        else post.views = post.views.filter(x => x.id !== id);
        plan.changed('post'); g.changed('Ansichten'); app.refresh();
      });
      list.addEventListener('click', ev => {
        const btn = ev.target.closest('[data-act]');
        if (!btn || btn.tagName === 'INPUT') return;
        const id = btn.closest('[data-view]').getAttribute('data-view');
        const v = P().views.find(x => x.id === id) || VIEW_PRESETS.find(x => x.id === id);
        if (btn.getAttribute('data-act') === 'show' && v) showView(v);
        if (btn.getAttribute('data-act') === 'remove') { P().views = P().views.filter(x => x.id !== id); plan.changed('post'); g.changed(v ? v.label + ' entfernt' : 'Ansicht entfernt'); app.refresh(); }
      });
      g.ui('post-addview').addEventListener('click', captureView);
      render();
    },
    setActive(on) { if (!on) showFrame(false); else if (g.shell.mode === 'auswertung') showFrame(true); },
    captureView, showView, get frameShown() { return frameOn; }
  };
}

/* ── 9 Export ─────────────────────────────────────────────────────── */
export function createExportTool(g, { plan, app }) {
  let busy = false, last = null;
  const modes = [{
    id: 'export', label: 'Fall',
    hint: 'Der OpenFOAM-Fall als ZIP: Netz-Dictionaries, Anfangs- und Randwerte, Solver-Einstellungen für dieLogicFoam, Allrun und render.py. Entpacken, OpenFOAM v2606 laden, ./Allrun.',
    html: numberRow({ ui: 'exp-title', label: 'Name', unit: '' })
      + '<div class="krows" data-ui="exp-kpis"></div>'
      + '<div class="st-hintline" data-ui="exp-note"></div>'
      + '<pre class="sim-cmd">unzip &lt;Name&gt;_openfoam.zip\ncd &lt;Name&gt;_openfoam\nsource /usr/lib/openfoam/openfoam2606/etc/bashrc\n./Allrun          # NP=8 ./Allrun für 8 Prozesse</pre>',
    primary: () => {
      const miss = missing({ bodies: plan.included(), inlet: plan.inlet, outlets: plan.outlets, mesh: plan.mesh });
      return { label: busy ? 'Fall wird gebaut …' : 'Fall herunterladen (ZIP)', onClick: run, disabled: busy || miss.length > 0, reason: miss.join(' ') };
    }
  }];
  function render() {
    const t = g.ui('exp-title');
    if (t && document.activeElement !== t) t.value = plan.title;
    const bodies = plan.included();
    kpis(g.ui('exp-kpis'), [
      { label: 'Körper', value: String(bodies.length), note: bodies.map(b => b.name).join(' · ') },
      { label: 'Randflächen', value: String(2 + plan.outlets.length), note: ['walls', 'inlet', ...plan.outlets.map((_, i) => 'vent' + (i + 1))].join(' · ') },
      { label: 'Solver', value: 'dieLogicFoam', note: 'OpenFOAM v2606' },
      ...(last ? [{ label: 'Zuletzt gebaut', value: last.root + '.zip', note: fmt(last.size / 1e6, 1) + ' MB · ' + fmt(last.info.cells) + ' Zellen grob · Füllzeit ≈ ' + fmt(last.info.fillTime * 1000, 1) + ' ms', verdict: 'ok' }] : [])
    ]);
  }
  async function run() {
    if (busy) return;
    busy = true; app.refresh();
    try {
      const p = payloadOf(plan);
      const r = await app.build(p, text => g.shell.setNote(text));
      const name = r.root + '.zip';
      download(new Blob([r.zip], { type: 'application/zip' }), name);
      last = { root: r.root, size: r.zip.length, info: r.info };
      plan.exported = true;
      g.shell.toast('Heruntergeladen: ' + name + ' — entpacken und ./Allrun.', { ms: 7000 });
      g.shell.setNote('Heruntergeladen: ' + name + ' (' + fmt(r.zip.length / 1e6, 1) + ' MB). Überlappungen: ' + fmt(r.stats.internal) + ' innere Dreiecke.', 'ok');
    } catch (err) {
      g.shell.setNote(err.message, 'bad');
      console.error(err);
    } finally {
      busy = false; render(); app.refresh();
    }
  }
  plan.on(() => render());
  return {
    id: 'export', modes, startMode: 'export',
    mounted() {
      g.ui('exp-title').addEventListener('change', ev => { const s = String(ev.target.value).trim(); if (s) { plan.title = s; plan.changed('title'); g.changed('Name „' + s + '"'); } render(); });
      render();
    },
    exports: [{ label: 'OpenFOAM-Fall (ZIP)', enabled: () => !missing({ bodies: plan.included(), inlet: plan.inlet, outlets: plan.outlets, mesh: plan.mesh }).length, run }],
    run, get last() { return last; }, safeName: () => safe(plan.title)
  };
}
