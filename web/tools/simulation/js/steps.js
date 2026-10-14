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
import { ROLE, scale, onScheme } from '../../3d-studio/js/part/colors.js';
import { parsePart } from '../../3d-studio/js/studio/files.js';
import { readGLBMeshes, isGLB } from '../../3d-studio/js/part/glbio.js';
import { neighbours, planarRegion, suggestInlet, depthAlong, volume, thickness, extraLevels, edgeCheck } from './core/geometry.js';
import { CRITERIA, VIEW_PRESETS, WHEN, ASPECTS, WIDTHS, FRAME, imageList, imageSize, targets, normalizePost } from './core/render.js';
import { missing, segmentHeight } from './core/casegen.js';
import { ROLES, roleLabel } from './plan.js';
import { safe, caseName } from './build.js';
import { payloadOf } from './payload.js';
import { shotPlan, chamberLength, curveSVG, curveCursor, curveLegend, CURVE_MODES, V2_MODES, v2Manual } from './shot.js';

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
  /* Die Körper aus Dateien haben je ein eigenes Material, die Zeichen teilen sich markMat */
  const clear = grp => {
    for (const c of [...grp.children]) {
      grp.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (grp === shown && o.material) o.material.dispose(); });
    }
  };

  function rebuild() {
    clear(shown); clear(pick);
    for (const b of plan.bodies) {
      if (!b.include || !b.tris || b.tris.length < 36) continue;
      /* Was das Studio schon zeigt (das Bauteil, die Körper der Designer),
         zeigt die Schicht nicht doppelt — gepickt wird trotzdem alles. */
      if (b.src === 'file' && !b.isHostPart) {
        const m = new T.Mesh(geo(b.tris), surfaceMaterial(roleColor(b.role), { roughness: 0.7 }));
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

  /* Die Körper sind deckend, die Kammer ist aufgeschnitten. Durch scheinen
     nur die Schmelze bei „Kammer voll" und die gewählte Einlassfläche: man
     sieht den Pressrest darin. Die Zeichen auf den Flächen liegen mit
     polygonOffset obenauf, der Pfeil zeigt den Zustrom am Einlass. */
  const markMat = {
    inlet: new T.MeshBasicMaterial({ color: ROLE.melt, side: T.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    outlet: new T.MeshBasicMaterial({ color: ROLE.air, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    melt: surfaceMaterial(ROLE.melt, { flat: false, side: T.FrontSide, roughness: 0.45, transparent: true, opacity: 0.4, depthWrite: false }),
    arrow: surfaceMaterial(ROLE.mark, { flat: false, roughness: 0.45 }),
    /* Die Kammer nur von innen: die Wand zum Betrachter fällt weg, man sieht
       hinein auf die Schmelze — aus jeder Richtung, ohne Durchscheinen. */
    sleeve: surfaceMaterial(ROLE.steel, { flat: false, side: T.BackSide, roughness: 0.55, metalness: 0.15 }),
    piston: surfaceMaterial(ROLE.steelDark, { flat: false, roughness: 0.5, metalness: 0.2 }),
    rim: new T.LineBasicMaterial({ color: ROLE.steelDark })
  };
  onScheme(() => {
    markMat.inlet.color.set(ROLE.melt); markMat.outlet.color.set(ROLE.air); markMat.melt.color.set(ROLE.melt);
    markMat.sleeve.color.set(ROLE.steel); markMat.piston.color.set(ROLE.steelDark); markMat.rim.color.set(ROLE.steelDark);
    markMat.arrow.color.set(ROLE.mark);
    rebuild();
  });
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
  /** Ein Kreis (Linie) mit Radius r um c in der Ebene mit Normale n. */
  function ring(c, n, r) {
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), n);
    const pts = Array.from({ length: 96 }, (_, k) => new T.Vector3(r * Math.cos(2 * Math.PI * k / 96), r * Math.sin(2 * Math.PI * k / 96), 0).applyQuaternion(q).add(c));
    return new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), markMat.rim);
  }
  /** Der Zustrom: ein Pfeil auf der Achse in Richtung -n (so schiebt der
      Kolben), die Spitze um `gap` vor der Einlassfläche. */
  function inflowArrow(c, n, r, gap) {
    const L = 1.4 * r, tipLen = 0.4 * r;
    const shaft = new T.Mesh(new T.CylinderGeometry(0.07 * r, 0.07 * r, L - tipLen, 24), markMat.arrow);
    shaft.position.y = tipLen + (L - tipLen) / 2;
    const tip = new T.Mesh(new T.ConeGeometry(0.18 * r, tipLen, 32), markMat.arrow);
    tip.rotation.x = Math.PI;
    tip.position.y = tipLen / 2;
    const a = new T.Group();
    a.add(shaft, tip);
    a.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
    a.position.copy(c).addScaledVector(n, gap);
    return a;
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
      const i = plan.inlet, n = new T.Vector3(...i.normal), c = new T.Vector3(...i.centroid);
      const sp = plan.shot.chamber ? shotPlan(plan) : null;
      if (sp && !sp.error) {
        const r = i.radius + 0.5 * plan.mesh.cell;
        /* mit Kammer: der Hub hinter der Einlassfläche, die Schmelze darin
           in Ruhe mit dem Füllgrad (waagerechte Oberfläche), hinten der
           Kolben. Im Pressrest liegt sie auch — der verdeckt sie. */
        const sleeve = new T.Mesh(new T.CylinderGeometry(r, r, sp.stroke, 96, 1, true), markMat.sleeve);
        sleeve.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
        sleeve.position.copy(c).addScaledVector(n, sp.stroke / 2);
        marks.add(sleeve);
        const back = c.clone().addScaledVector(n, sp.stroke);
        marks.add(ring(c, n, r), ring(back, n, r));
        const piston = new T.Mesh(new T.CylinderGeometry(r * 0.995, r * 0.995, Math.max(r * 0.25, 2), 96), markMat.piston);
        piston.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
        piston.position.copy(back).addScaledVector(n, Math.max(r * 0.25, 2) / 2);
        marks.add(piston);
        const seg = meltSegment(r * 0.995, sp.stroke, sp.phi, plan.process.gravity, n);
        if (seg) {
          seg.position.copy(back);
          marks.add(seg);
        }
        marks.add(inflowArrow(c, n, i.radius, 0));
      } else {
        /* Der Fall füllt eine halbe Zelle über den Pressrest hinaus; im Bild
           etwas mehr, damit man den Rand des Pressrests in der Schmelze sieht. */
        const pad = Math.max(0.5 * plan.mesh.cell, 0.05 * i.radius), r = i.radius + pad;
        const h = Math.max(i.depth, 0.5) + 2 * pad;
        const cyl = new T.Mesh(new T.CylinderGeometry(r, r, h, 96, 1), markMat.melt);
        cyl.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
        cyl.position.copy(c).addScaledVector(n, -(h / 2 - pad));
        marks.add(cyl, inflowArrow(c, n, i.radius, pad));
      }
    }
    for (const o of plan.outlets) add(o, markMat.outlet);
    host.view.invalidate();
  }
  plan.on(what => { if (what === 'bodies' || what === 'apply' || what === 'include') rebuild(); else marksRebuild(); });

  const ray = new T.Raycaster();
  return {
    group, rebuild, marksRebuild,
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
export function onTap(host, fn) {
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

/* Ein Umschalter über die ganze Breite — der Abschnitt darüber nennt ihn schon. */
export const segFull = (ui, label, options, value) => '<div class="seg sim-seg"' + (ui ? ' data-ui="' + ui + '"' : '') + ' role="group" aria-label="' + esc(label) + '">'
  + options.map(([v, l]) => '<button type="button" data-value="' + esc(v) + '"' + (v === value ? ' class="active"' : '') + '>' + l + '</button>').join('') + '</div>';
const EYE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
export const fileInput = (ui, label, accept = '.stl,.glb', multiple = true) =>
  '<label class="btn btn-sm btn-outline sim-file"><input type="file" data-ui="' + ui + '" accept="' + accept + '"' + (multiple ? ' multiple' : '') + ' hidden>' + label + '</label>';

/* ── 1 Körper ─────────────────────────────────────────────────────── */
export function createKoerperTool(g, { plan, layer, app }) {
  const modes = [{
    id: 'koerper', label: 'Körper',
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
    list.innerHTML = plan.bodies.length ? plan.bodies.map(b => '<div class="sim-body' + (b.include ? '' : ' off') + '" data-id="' + b.id + '" style="--role:' + roleColor(b.role) + '">'
      + '<input type="checkbox" data-act="include"' + (b.include ? ' checked' : '') + ' aria-label="' + esc(b.name) + ' mitrechnen">'
      + '<span class="sim-name" title="' + esc(b.name + ' · ' + srcLabel(b) + ' · ' + fmt(b.tris.length / 9) + ' Dreiecke') + '">' + esc(b.name)
      + '<small>' + fmt(Math.abs(volume(b.tris)) / 1000, 1) + ' cm³ · ' + srcLabel(b) + '</small>'
      + (closedOf(b) ? '' : '<small class="warn">nicht geschlossen</small>') + '</span>'
      + '<select data-act="role" aria-label="Rolle">' + ROLES.map(([v, l]) => '<option value="' + v + '"' + (v === b.role ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
      + (b.src === 'file' || b.src === 'part' ? '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="remove" title="' + esc(b.name) + ' entfernen" aria-label="' + esc(b.name) + ' entfernen">✕</button>' : '<span></span>')
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
  plan.on(w => {
    /* Ohne Bauteil im Plan zeigt das Bild auch keins: der Rahmen behält sein
       Netz, bis ein neues geladen ist (app.removePart) */
    if (w === 'bodies') g.part.setLook({ visible: plan.bodies.some(b => b.src === 'part') });
    render();
  });
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
      g.ui('body-list').addEventListener('click', async ev => {
        const btn = ev.target.closest('[data-act="remove"]');
        const row = btn && btn.closest('[data-id]');
        const b = row && plan.body(row.getAttribute('data-id'));
        if (!b) return;
        if (b.src === 'part') await app.removePart();
        else plan.remove(b.id);
        g.changed('„' + b.name + '" entfernt');
        app.refresh();
      });
      render();
    },
    setActive() {}
  };
  return tool;
}

/* ── Vorschläge: überall gleich ──────────────────────────────────────
   Wo die Seite einen Wert vorschlägt (Einlassfläche, Tiefe, Kammerlänge,
   Zellgröße, a₂), steht er direkt unter dem Feld in einer Zeile mit dem
   Etikett „Vorschlag": der Wert, warum, und „Übernehmen", solange etwas
   anderes gilt. Gilt er, ist die Zeile getönt und hat einen Haken. Beim
   ersten Besuch eines Schritts gilt der Vorschlag; was man selbst setzt,
   bleibt (Wunsch vom 13.10.: sonst war unklar, was Vorschlag und was
   Vorgabe ist). */
export const suggBox = ui => '<div class="sim-sugg" data-ui="' + ui + '" hidden></div>';
/** s = { value, why, on, apply } oder null (kein Vorschlag) */
export function paintSugg(el, s) {
  if (!el) return;
  el.hidden = !s;
  if (!s) return;
  el.classList.toggle('on', !!s.on);
  el.innerHTML = '<span class="sim-sugg-tag">' + (s.on ? '✓ Vorschlag' : 'Vorschlag') + '</span>'
    + '<span class="sim-sugg-text"><b>' + esc(s.value) + '</b>' + (s.why ? ' · ' + esc(s.why) : '') + '</span>'
    + (s.on ? '' : '<button type="button" class="btn btn-sm btn-outline" data-act="apply">' + esc(s.apply || 'Übernehmen') + '</button>');
}
export const onSugg = (el, fn) => el && el.addEventListener('click', ev => { if (ev.target.closest('[data-act="apply"]')) fn(); });

/* Zielbänder aus der Auslegung, sonst übliche Werte */
const design = () => { try { return window.__PROJECT__.getSection('design').values || {}; } catch { return {}; } };
const gateBand = () => { const v = design(); return v.gateMin > 0 && v.gateMax > v.gateMin ? [v.gateMin, v.gateMax] : [30, 50]; };
const fillBand = () => { const v = design(); return v.fillMin > 0 && v.fillMax > v.fillMin ? [v.fillMin, v.fillMax] : [40, 60]; };
/** Die Kammerlänge für die Mitte des Füllgrad-Bands (NaN ohne Schusskurve). */
function lengthForBand(sp) {
  if (!sp || sp.error) return NaN;
  const [flo, fhi] = fillBand();
  return Math.round(sp.Vdose / (Math.PI * sp.diam * sp.diam / 4) / ((flo + fhi) / 200) / 5) * 5;
}

/* ── Einlass, Auslässe: Flächen im Bild wählen ─────────────────────── */
export function createFlaechenTool(g, { plan, layer, app, kind }) {
  const inlet = kind === 'inlet';
  const id = inlet ? 'einlass' : 'auslass';
  const modes = [{
    id, label: inlet ? 'Einlass' : 'Auslässe',
    html: inlet
      ? '<div class="sim-label">Einlassfläche</div>'
        + suggBox('inlet-sugg')
        + '<div class="sim-actions"><button type="button" class="btn btn-sm btn-outline sim-pick" data-ui="pick" aria-pressed="false">Einlass auswählen</button></div>'
        + '<div class="sim-card sim-inlet" data-ui="inlet-card">'
        + '<div class="sim-card-head" data-ui="inlet-row"></div>'
        + '<div class="sim-card-body" data-ui="inlet-body">'
        + '<div class="sim-dir"><span>Richtung</span><span class="sim-dirval" data-ui="inlet-dir"></span></div>'
        + numberRow({ ui: 'inlet-depth', label: 'Schmelze bis Tiefe', unit: 'mm' })
        + suggBox('depth-sugg')
        + '<div class="st-hintline" data-ui="inlet-note"></div></div></div>'
        + '<div class="sim-label">Gießkammer</div>'
        + segFull('p-chamber', 'Gießkammer', [['0', 'ohne Kammer'], ['1', 'mit Kammer']], plan.shot.chamber ? '1' : '0')
        + '<div class="st-hintline" data-ui="chamber-note"></div>'
        + numberRow({ ui: 'p-length', label: 'Kammerlänge', unit: 'mm' })
        + suggBox('length-sugg')
        + '<div class="krows" data-ui="chamber-kpis"></div>'
      : '<div class="sim-actions"><button type="button" class="btn btn-sm btn-outline sim-pick" data-ui="pick" aria-pressed="false">Auslass auswählen</button></div>'
        + '<div class="st-list sim-outlets" data-ui="outlet-list" data-scroll></div>'
        + '<div class="st-hintline" data-ui="outlet-note"></div>',
    primary: () => app.nextPrimary(id),
    /* der Vorschlag gilt, solange noch kein Einlass gewählt ist */
    enter: () => { if (inlet && !plan.inlet) suggest(true); }
  }];
  let active = false;

  /* Gewählt wird im Zielmodus: der Knopf schaltet ihn ein, der Hinweis im
     Bild sagt, worauf man tippt, Esc oder „Abbrechen" beendet ihn. Ein
     Treffer beendet ihn auch — beim Einlass wie bei den Auslässen; für den
     nächsten Auslass drückt man den Knopf wieder. */
  let aiming = false;
  const AIM_TEXT = inlet ? 'Auf die Kreisfläche des Pressrests tippen'
    : 'Auf eine ebene Fläche tippen, durch die die Luft geht — ein Tipp auf einen Auslass nimmt ihn heraus';
  const pickLabel = on => (on ? 'Auswahl abbrechen' : inlet ? (plan.inlet ? 'Andere Fläche wählen' : 'Einlass auswählen') : 'Auslass auswählen');
  function setAim(on) {
    aiming = on;
    g.aim.onCancel = on ? () => setAim(false) : null;
    g.aim.show(on, AIM_TEXT);
    g.viewport.classList.toggle('sim-aiming', on);
    const b = g.ui('pick');
    if (b) { b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); b.textContent = pickLabel(on); }
  }

  function choose(body, faces, info, how = 'gewählt') {
    const sel = { bodyId: body.id, stamp: body.stamp, faces, centroid: info.centroid, normal: info.normal, area: info.area, radius: info.radius };
    if (inlet) {
      const d = depthAlong(body.tris, info.centroid, info.normal);
      sel.depthAuto = body.role === 'biscuit' ? d : Math.min(d, 2 * info.radius);
      sel.depth = sel.depthAuto;
      plan.inlet = sel;
      plan.changed('inlet');
      g.changed('Einlass ' + how);
    } else {
      const k = plan.outlets.findIndex(o => o.bodyId === body.id && o.faces.includes(faces[0]));
      if (k >= 0) { plan.outlets.splice(k, 1); plan.changed('outlets'); g.changed('Auslass entfernt'); }
      else { plan.outlets.push(Object.assign(sel, { mode: 'orifice', Cd: 0.8 })); plan.changed('outlets'); g.changed('Auslass gewählt'); }
    }
    app.refresh();
  }
  function pickAt(ev) {
    if (!active || !aiming || g.shell.mode !== id) return;
    const hit = layer.pickAt(ev);
    if (!hit) { g.aim.miss('Daneben: dort liegt kein Körper.', () => aiming); return; }
    const r = planarRegion(hit.body.tris, layer.neighbours(hit.body), hit.face);
    if (inlet && r.circularity < 0.6) g.shell.toast('Die Fläche ist nicht kreisrund (' + fmt(100 * r.circularity) + ' %) — als Einlass trotzdem übernommen.', { ms: 6000 });
    if (!inlet && r.area > 0.5 * totalArea(hit.body)) { g.shell.toast('Diese Fläche ist fast der ganze Körper — das ist keine ebene Auslassfläche.'); return; }
    setAim(false);
    choose(hit.body, r.faces, r);
  }
  const totalArea = b => { let A = 0; for (let i = 0; i < b.tris.length; i += 9) { const ux = b.tris[i + 3] - b.tris[i], uy = b.tris[i + 4] - b.tris[i + 1], uz = b.tris[i + 5] - b.tris[i + 2], vx = b.tris[i + 6] - b.tris[i], vy = b.tris[i + 7] - b.tris[i + 1], vz = b.tris[i + 8] - b.tris[i + 2]; A += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; } return A; };

  /* Der Vorschlag: die größte kreisrunde ebene Fläche des Pressrests (ohne
     Pressrest: aller Körper) — je Netzstand einmal gesucht. */
  let suggCache = { key: null, val: null };
  function suggestion() {
    const cands = plan.included().filter(b => b.role === 'biscuit');
    const pool = cands.length ? cands : plan.included();
    const key = pool.map(b => b.id + ':' + b.stamp).join('|');
    if (suggCache.key === key) return suggCache.val;
    let best = null, bb = null;
    for (const b of pool) { const r = suggestInlet(b.tris, layer.neighbours(b)); if (r && (!best || r.area > best.area)) { best = r; bb = b; } }
    suggCache = { key, val: best ? { body: bb, r: best } : null };
    return suggCache.val;
  }
  const isSuggested = s => !!(s && plan.inlet && plan.inlet.bodyId === s.body.id && plan.inlet.faces.length === s.r.faces.length && plan.inlet.faces[0] === s.r.faces[0]);
  function suggest(quiet = false) {
    const s = suggestion();
    if (!s) { if (!quiet) g.shell.toast('Keine kreisrunde ebene Fläche gefunden — bitte „Einlass auswählen" und im Bild tippen.'); return; }
    if (aiming) setAim(false);
    choose(s.body, s.r.faces, s.r, 'nach Vorschlag');
  }
  function render() {
    if (inlet) {
      const i = plan.inlet, b = i && plan.body(i.bodyId);
      const s = suggestion();
      paintSugg(g.ui('inlet-sugg'), s ? { value: 'größte Kreisfläche', why: s.body.name + ', Ø ' + fmt(2 * s.r.radius, 1) + ' mm', on: isSuggested(s) } : null);
      const pick = g.ui('pick');
      if (pick && !aiming) pick.textContent = pickLabel(false);
      g.ui('inlet-card').classList.toggle('empty', !i);
      g.ui('inlet-row').innerHTML = i
        ? '<div class="sim-name">inlet<small>' + esc(b ? b.name : '–') + ' · ' + fmt(i.area) + ' mm² · Ø ' + fmt(2 * i.radius, 1) + ' mm</small></div>'
          + '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="remove" title="Einlass entfernen" aria-label="Einlass entfernen">✕</button>'
        : '<div class="st-hintline">Noch kein Einlass: den Vorschlag übernehmen oder „Einlass auswählen" und auf die Fläche tippen.</div>';
      g.ui('inlet-body').hidden = !i;
      if (i) {
        g.ui('inlet-dir').innerHTML = '(' + i.normal.map(x => fmt(Math.abs(x) < 5e-3 ? 0 : -x, 2)).join('; ') + ') <small>so schiebt der Kolben, der Pfeil im Bild</small>';
        const d = g.ui('inlet-depth');
        if (d && document.activeElement !== d) d.value = fmt(i.depth, 1);
        paintSugg(g.ui('depth-sugg'), isFinite(i.depthAuto) ? { value: fmt(i.depthAuto, 1) + ' mm', why: b && b.role === 'biscuit' ? 'Tiefe des Pressrests' : 'aus dem Körper, höchstens Ø', on: Math.abs(i.depth - i.depthAuto) < 1e-6 } : null);
        g.ui('inlet-note').textContent = plan.shot.chamber ? 'Der Pfeil zeigt, wie die Schmelze aus der Kammer einströmt.'
          : 'Der durchscheinende Zylinder im Bild ist die Schmelze bei „Kammer voll", der Pfeil zeigt, wie sie einströmt.';
      }
      /* Gießkammer: mit oder ohne, Kammerlänge, Füllgrad */
      const seg = g.ui('p-chamber');
      if (seg) for (const x of seg.querySelectorAll('button')) x.classList.toggle('active', x.getAttribute('data-value') === (plan.shot.chamber ? '1' : '0'));
      g.ui('chamber-note').textContent = plan.shot.chamber
        ? 'Die Rechnung beginnt beim Kolbenstart: die Kammer hängt um den Hub hinter dem Einlass, die Schmelze liegt mit dem Füllgrad darin.'
        : 'Die Rechnung beginnt bei „Kammer voll": der Pressrest ist voll Schmelze, der Kolben drückt über den Einlass nach. Die Kammerlänge zählt trotzdem — sie gibt die Schusskurve.';
      const sp = i ? shotPlan(plan) : null;
      const L = g.ui('p-length');
      if (L && document.activeElement !== L) L.value = fmt(chamberLength(plan.shot), 0);
      const want = lengthForBand(sp), [flo, fhi] = fillBand();
      paintSugg(g.ui('length-sugg'), want > 0 && want > (i ? i.depth : 0) + 10 ? { value: fmt(want) + ' mm', why: fmt((flo + fhi) / 2) + ' % Füllgrad, Mitte des Zielbands ' + fmt(flo) + '–' + fmt(fhi) + ' %', on: Math.abs(chamberLength(plan.shot) - want) < 0.5 } : null);
      kpis(g.ui('chamber-kpis'), sp && !sp.error ? [
        { label: 'Füllgrad', value: fmt(100 * sp.phi, 1) + ' %', verdict: 100 * sp.phi < flo || 100 * sp.phi > fhi ? 'warn' : 'ok', note: 'Ziel ' + fmt(flo) + '–' + fmt(fhi) + ' % · Kolben-Ø ' + fmt(sp.diam, 1) + ' mm, Hub ' + fmt(sp.stroke) + ' mm' }
      ] : sp && sp.error ? [{ label: 'Kammer', value: '–', verdict: 'bad', note: sp.error }] : []);
    } else {
      const list = g.ui('outlet-list');
      if (!list) return;
      /* je Auslass zwei Zeilen: Name, Körper und Fläche; darunter die Art */
      list.innerHTML = plan.outlets.map((o, k) => {
        const b = plan.body(o.bodyId), name = 'vent' + (k + 1);
        return '<div class="sim-outlet" data-k="' + k + '"><div class="sim-name">' + name + '<small>' + esc(b ? b.name : '') + ' · ' + fmt(o.area, 1) + ' mm²</small></div>'
          + '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="remove" title="' + name + ' entfernen" aria-label="' + name + ' entfernen">✕</button>'
          + segFull('', 'Art von ' + name, [['orifice', 'Drossel (Cd 0,8)'], ['open', 'offen']], o.mode === 'open' ? 'open' : 'orifice') + '</div>';
      }).join('') || '<div class="st-hintline">Noch kein Auslass: „Auslass auswählen" und auf eine Fläche tippen.</div>';
      g.ui('outlet-note').textContent = 'Drossel: die Luft strömt durch die Fläche wie durch eine Blende (Fläche × Cd), die Schmelze bleibt davor stehen wie am Entlüftungsblock. Offen: Umgebungsdruck an der Fläche, Luft und Schmelze treten aus (offener Vakuumschlauch, Wassermodell).';
    }
  }
  plan.on(() => render());
  return {
    id, modes, startMode: id,
    mounted() {
      onTap(g, pickAt);
      g.ui('pick').addEventListener('click', () => setAim(!aiming));
      if (inlet) {
        onSugg(g.ui('inlet-sugg'), () => suggest());
        g.ui('inlet-row').addEventListener('click', ev => {
          if (!ev.target.closest('[data-act="remove"]') || !plan.inlet) return;
          plan.inlet = null;
          plan.changed('inlet');
          g.changed('Einlass entfernt');
          app.refresh();
        });
        g.ui('inlet-depth').addEventListener('change', ev => {
          const x = num(ev.target.value);
          if (plan.inlet && x > 0) { plan.inlet.depth = x; plan.changed('inlet'); g.changed('Schmelzetiefe ' + fmt(x, 1) + ' mm'); }
          render(); app.refresh();
        });
        onSugg(g.ui('depth-sugg'), () => {
          if (!plan.inlet) return;
          plan.inlet.depth = plan.inlet.depthAuto; plan.changed('inlet'); g.changed('Schmelzetiefe nach Vorschlag'); app.refresh();
        });
        g.ui('p-chamber').addEventListener('click', ev => {
          const b = ev.target.closest('[data-value]');
          if (!b) return;
          plan.shot.chamber = b.getAttribute('data-value') === '1';
          /* Mit Kammer wird die Kammer gerechnet: ihre Länge soll zum Schuss
             passen — der Vorschlag (Mitte des Füllgrad-Bands) gilt, solange
             man die Länge nicht selbst eingetragen hat (die der Auslegung
             gab beim Beispiel 900 mm und 16 % Füllgrad) */
          if (plan.shot.chamber && !plan.shot.lengthSet) {
            const want = lengthForBand(plan.inlet ? shotPlan(plan) : null);
            if (want > 0) plan.shot.length = want;
          }
          plan.changed('shot'); g.changed(plan.shot.chamber ? 'Mit Gießkammer' : 'Ohne Gießkammer');
          render(); app.refresh();
        });
        g.ui('p-length').addEventListener('change', ev => {
          const x = num(ev.target.value);
          if (isFinite(x) && x > 10 && x < 5000) { plan.shot.length = x; plan.shot.lengthSet = true; plan.changed('shot'); g.changed('Kammerlänge ' + fmt(x) + ' mm'); }
          render(); app.refresh();
        });
        onSugg(g.ui('length-sugg'), () => {
          const want = lengthForBand(plan.inlet ? shotPlan(plan) : null);
          if (want > 0) { plan.shot.length = want; plan.shot.lengthSet = false; plan.changed('shot'); g.changed('Kammerlänge ' + fmt(want) + ' mm nach Vorschlag'); app.refresh(); }
        });
      } else {
        const list = g.ui('outlet-list');
        list.addEventListener('click', ev => {
          const row = ev.target.closest('[data-k]');
          if (!row) return;
          const k = Number(row.getAttribute('data-k'));
          const mode = ev.target.closest('[data-value]');
          if (mode) {
            plan.outlets[k].mode = mode.getAttribute('data-value');
            plan.changed('outlets');
            g.changed('vent' + (k + 1) + ': ' + (plan.outlets[k].mode === 'open' ? 'offen' : 'Drossel'));
          } else if (ev.target.closest('[data-act="remove"]')) {
            plan.outlets.splice(k, 1);
            plan.changed('outlets');
            g.changed('Auslass entfernt');
            app.refresh();
          }
        });
      }
      render();
    },
    setActive(on) {
      active = on;
      if (!on && aiming) setAim(false);
    },
    /** Esc im Zielmodus (der Rahmen fragt erst hier) */
    cancelAim() {
      if (!aiming) return false;
      setAim(false);
      return true;
    },
    /** den Zielmodus ein- oder ausschalten (Knopf, Tests) */
    aim: on => setAim(on !== false),
    get aiming() { return aiming; },
    /** den Vorschlag übernehmen (Knopf, Beispiel, Tests) */
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
    html: numberRow({ ui: 'mesh-cell', label: 'Zellgröße', unit: 'mm' })
      + suggBox('mesh-sugg')
      + segRow({ ui: 'mesh-level', label: 'Hintergrund', options: [['0', '1×'], ['1', '2×'], ['2', '4×'], ['3', '8×']], value: String(plan.mesh.level), help: '' })
      + numberRow({ ui: 'mesh-np', label: 'Prozesse', unit: '' })
      + '<div data-ui="mesh-sleeve-row">' + numberRow({ ui: 'mesh-sleeve', label: 'Kammer: Zelllänge', unit: 'mm' }) + '</div>'
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
  /** Der Vorschlag für die Zellgröße: zwei Zellen über die dünnste
      Bauteilwand, aber nicht mehr als rund zwei Millionen Zellen in den
      Körpern; auf 0,05 mm, zwischen 0,25 und 3 mm. */
  const CELL_BUDGET = 2e6;
  function cellSuggestion() {
    const parts = plan.included().filter(b => b.role === 'part' && isFinite(wallOf(b)));
    if (!parts.length) return null;
    const wall = Math.min(...parts.map(wallOf));
    const vol = plan.included().reduce((s, b) => s + Math.abs(volume(b.tris)), 0);
    const byWall = Math.floor(wall / 2 * 20) / 20, byBudget = Math.ceil(Math.cbrt(vol / CELL_BUDGET) * 20) / 20;
    const cell = Math.min(3, Math.max(0.25, byWall, byBudget));
    return { cell, wall, why: byBudget > byWall ? 'sonst über zwei Millionen Zellen (zwei über die Bauteilwand ' + fmt(wall, 1) + ' mm wären ' + fmt(byWall, 2) + ' mm)' : 'zwei Zellen über die dünnste Bauteilwand (' + fmt(wall, 1) + ' mm)' };
  }
  /** Wandstärken messen (einmal je Netz) und Vorschläge setzen, wo der
      Anwender nichts gewählt hat: die Zellgröße, Stufen für Überläufe und
      Anguss. */
  function measure() {
    let changed = false;
    for (const b of plan.included()) if (!thick.has(b.stamp)) thick.set(b.stamp, thickness(b.tris));
    const cs = cellSuggestion();
    if (cs && !plan.mesh.cellSet && Math.abs(plan.mesh.cell - cs.cell) > 1e-9) {
      plan.mesh.cell = cs.cell;
      plan.mesh.cellSet = false;                // gespeichert: folgt dem Vorschlag (alte Pläne ohne den Schlüssel: plan.apply)
      for (const b of plan.bodies) if (b.extraSet === undefined) delete b.extra;
      changed = true;
    }
    for (const b of plan.included()) {
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
      /* der Vorschlag je Körper: zwei Zellen über seine Wand — in der Zeile darunter, wie überall */
      const sug = th ? extraLevels(wall, M.cell) : NaN;
      const sugTxt = !th ? '' : sug === k ? ' · <span class="sim-ok">✓ Vorschlag</span>' : ' · Vorschlag ' + fmt(M.cell / Math.pow(2, sug), 2) + ' mm';
      return '<div class="sim-meshrow' + (thin ? ' warn' : '') + '" data-id="' + b.id + '"><span class="sim-name">' + esc(b.name)
        + '<small title="' + (b.role === 'runner' && b.src === 'file' ? 'Anschnitt: die dünnsten 2 % der Wand' : 'die dünnsten 10 % der Wand') + '">' + (th ? 'Wand ' + fmt(wall, 1) + ' mm' + (b.role === 'runner' && b.src === 'file' ? ' am Anschnitt' : '') : 'Wand wird gemessen …') + (thin ? ' · unter zwei Zellen' : '') + sugTxt + '</small></span>'
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
       die Zellgröße folgt ihm — der Vorschlag darunter. */
    const cs = cellSuggestion();
    paintSugg(g.ui('mesh-sugg'), cs ? { value: fmt(cs.cell, 2) + ' mm', why: cs.why, on: Math.abs(M.cell - cs.cell) < 1e-9 } : null);
  }
  plan.on(w => { if (['bodies', 'include', 'mesh', 'apply', 'role', 'shot', 'inlet'].includes(w)) render(); });
  return {
    id: 'netz', modes, startMode: 'netz',
    mounted() {
      g.ui('mesh-cell').addEventListener('change', ev => {
        const x = num(ev.target.value);
        if (x >= 0.1 && x <= 50) { plan.mesh.cell = x; plan.mesh.cellSet = true; for (const b of plan.bodies) if (b.extraSet === undefined) delete b.extra; plan.changed('mesh'); g.changed('Zellgröße ' + fmt(x, 2) + ' mm'); measure(); }
        render(); app.refresh();
      });
      /* Übernehmen: die Zellgröße folgt wieder dem Vorschlag */
      onSugg(g.ui('mesh-sugg'), () => {
        const cs = cellSuggestion();
        if (!cs) return;
        plan.mesh.cell = cs.cell; plan.mesh.cellSet = false;
        for (const b of plan.bodies) if (b.extraSet === undefined) delete b.extra;
        plan.changed('mesh'); g.changed('Zellgröße ' + fmt(cs.cell, 2) + ' mm nach Vorschlag'); measure(); app.refresh();
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

/* ── 7 Schusskurve ────────────────────────────────────────────────── */
/* [Schlüssel, Bezeichnung, Einheit, Stellen, min, max, wann sichtbar] — wann: Modus der 1. Phase oder 'v2' (2. Phase von Hand) */
const SHOT_PARAMS = [['kappa', 'κ = Kappe / v<sub>krit</sub>', '–', 2, 0.3, 1, 'focus'], ['v1', 'V₁', 'm/s', 2, 0.01, 5, 'v1v2'], ['a1', 'a₁', 'm/s²', 1, 0.1, 500, 'v1v2'], ['v2', 'V₂', 'm/s', 2, 0.1, 20, 'v2'], ['a2', 'a₂', 'm/s²', 1, 0.1, 5000, 'v2']];
const shotRows = when => '<div data-shotmode="' + when + '">' + SHOT_PARAMS.filter(r => r[6] === when).map(([k, l, u]) => numberRow({ ui: 'p-' + k, label: l, unit: u })).join('') + '</div>';
/** a₂, mit dem V₂ bis zum Füllende erreicht wird (aufgerundet auf 5 m/s², 5 % Luft), NaN wenn es reicht. */
const a2Fit = sp => (!sp.error && sp.v2Manual && isFinite(sp.a2Need) ? Math.ceil(sp.a2Need * 1.05 / 5) * 5 : NaN);
export function createSchussTool(g, { plan, app }) {
  let view = 'all', sp = null;
  const modes = [{
    id: 'schuss', label: 'Schusskurve',
    html: '<div class="sim-label">1. Phase — bis „Kammer voll"</div>'
      + segFull('p-mode', 'Gesetz der 1. Phase', CURVE_MODES, plan.shot.mode)
      + shotRows('focus') + shotRows('v1v2')
      + '<div class="st-hintline" data-ui="p-phase1"></div>'
      + '<div class="sim-label">2. Phase — Formfüllung</div>'
      + segFull('p-v2mode', 'Zweite Phase', V2_MODES, plan.shot.v2Mode || 'auto')
      + shotRows('v2')
      + suggBox('a2-sugg')
      + '<div class="st-hintline" data-ui="p-phase2"></div>'
      + '<div class="sim-label">Kurve</div>'
      /* Der Ausschnitt ist nur eine Ansicht des Bilds, keine Einstellung der
         Rechnung: eine kleine Leiste am Bild (wie Zoom), nicht die großen
         Umschalter der Einstellungen darüber */
      + '<div class="sim-viewbar" data-ui="p-view" role="group" aria-label="Ansicht des Bilds (ändert nichts an der Rechnung)">'
      + '<span>Ansicht</span><button type="button" data-value="all" class="active">Ganzer Schuss</button><button type="button" data-value="fill">Formfüllung</button></div>'
      + '<div class="sim-curvebox" data-ui="p-curve"></div>'
      + '<div data-ui="p-legend"></div>'
      + '<div class="krows" data-ui="p-shot"></div>',
    primary: () => app.nextPrimary('schuss'),
    enter: () => measureGate()
  }];
  let gateA = NaN, gateBusy = false;
  async function measureGate() {
    gateBusy = true; render();
    try { gateA = await app.gate(); } catch (err) { console.error(err); gateA = NaN; }
    gateBusy = false; render();
  }
  function render() {
    const set = (ui, v) => { const el = g.ui(ui); if (el && document.activeElement !== el) el.value = v; };
    for (const [k, , , d] of SHOT_PARAMS) set('p-' + k, fmt(plan.shot[k], d));
    const S = plan.shot, manual = v2Manual(S);
    const segSet = (ui, val) => { const el = g.ui(ui); if (el) for (const b of el.querySelectorAll('button')) b.classList.toggle('active', b.getAttribute('data-value') === val); };
    segSet('p-mode', S.mode);
    segSet('p-v2mode', manual ? 'manual' : 'auto');
    segSet('p-view', view);
    /* mit V₁ von Hand gibt es kein „automatisch" (das rechnet die Auslegung nur zu ihren Gesetzen) */
    const auto = g.ui('p-v2mode') && g.ui('p-v2mode').querySelector('[data-value="auto"]');
    if (auto) { auto.disabled = S.mode === 'v1v2'; auto.title = S.mode === 'v1v2' ? 'Mit V₁ von Hand wird auch V₂ von Hand gesetzt' : 'V₂ so, dass die NADCA-Füllzeit getroffen wird'; }
    const box = g.ui('p-curve');
    if (box) for (const el of box.closest('.st-mode').querySelectorAll('[data-shotmode]')) {
      const w = el.getAttribute('data-shotmode');
      el.hidden = w === 'v2' ? !manual : w !== S.mode;
    }
    sp = shotPlan(plan);
    if (box) box.innerHTML = sp.error ? '<div class="st-hintline">' + esc(sp.error) + '</div>' : curveSVG(sp, { chamber: S.chamber, view });
    const leg = g.ui('p-legend');
    if (leg) leg.innerHTML = sp.error ? '' : curveLegend(sp, { chamber: S.chamber });
    const ph1 = g.ui('p-phase1'), ph2 = g.ui('p-phase2');
    /* Kappe κ relativ zu v_krit (U_H der Auslegung ist v_krit selbst) — die Indizes gesetzt, nicht mit Unterstrich */
    if (ph1) ph1.innerHTML = sp.error ? '' : ({ focus: 'Fokussierendes Kolbengesetz bis zur Kappe κ·v<sub>krit</sub>, Plateau bis „Kammer voll".', lopez: 'Anfahrt nach López bis v<sub>krit</sub>, Plateau bis „Kammer voll".', v1v2: 'Rampe mit a₁ auf V₁, Plateau bis „Kammer voll".' })[S.mode] || '';
    if (ph2) ph2.innerHTML = sp.error ? '' : manual
      ? (isFinite(sp.v2Reached) ? esc(sp.warn) : 'Ab „Kammer voll" mit a₂ auf V₂, dann gleichbleibend bis zum Füllende.')
      : 'V₂ = ' + fmt(sp.v2, 2) + ' m/s trifft die ' + (isFinite(sp.tNadca) ? 'Füllzeit ' + fmt(sp.tNadca, 1) + ' ms' : 'Füllzeit') + ' (NADCA, höchstens t<sub>max</sub> der Auslegung); Rampe mit a<sub>max</sub> ' + fmt(sp.a2) + ' m/s² der Auslegung.';
    if (ph2) ph2.classList.toggle('warn', !sp.error && manual && isFinite(sp.v2Reached));
    /* a₂: der Vorschlag nur, wenn V₂ von Hand nicht erreicht wird */
    const need = a2Fit(sp);
    paintSugg(g.ui('a2-sugg'), need > 0 && need <= 5000 ? { value: 'a₂ = ' + fmt(need) + ' m/s²', why: 'damit V₂ bis zum Füllende erreicht wird', on: false } : null);
    const [lo, hi] = gateBand(), [flo, fhi] = fillBand();
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
        { label: 'Füllgrad', value: fmt(100 * sp.phi, 1) + ' %', verdict: 100 * sp.phi < flo || 100 * sp.phi > fhi ? 'warn' : 'ok', note: 'Ziel ' + fmt(flo) + '–' + fmt(fhi) + ' % (Kammerlänge unter „Einlass") · „Kammer voll" bei ' + fmt(sp.sFull) + ' mm, ' + fmt(sp.tFull * 1000) + ' ms' },
        { label: '1. Phase', value: fmt(v1, 2) + ' m/s', verdict: v1 <= vc + 1e-9 ? 'ok' : 'bad', note: 'höchstens v<sub>krit</sub> ' + fmt(vc, 2) + ' m/s' },
        { label: 'Füllzeit', value: isFinite(sp.fillMs) ? fmt(sp.fillMs, 1) + ' ms' : '–', note: 'ab Anschnitt · v bei „Bauteil gefüllt" ' + fmt(sp.vAtPart, 2) + ' m/s' },
        gateBusy ? { label: 'Anschnitt', value: 'wird gemessen …' }
          : loose ? { label: 'Anschnitt', value: fmt(gateA) + ' mm²', verdict: 'bad', note: 'Anguss und Bauteil berühren sich kaum (Querschnitt ' + fmt(sec) + ' mm²): unter „Körper" die Anschnittzungen mitrechnen' }
          : isFinite(vg) ? { label: 'Anschnittgeschw.', value: fmt(vg) + ' m/s', verdict: vg < lo || vg > hi ? 'warn' : 'ok', note: 'Anschnitt ' + fmt(flowA) + ' mm² · Ziel ' + fmt(lo) + '–' + fmt(hi) + ' m/s' }
            : { label: 'Anschnitt', value: '–', note: 'braucht Bauteil und Anguss' },
        { label: 'Rechnung', value: plan.shot.chamber ? 'ab Kolbenstart' : 'ab „Kammer voll"', note: plan.shot.chamber ? 'Kammer als bewegtes Netz (libshotSleeve)' : 'Kolben als Geschwindigkeit am Einlass' }
      );
      if (sp.warn && !(manual && isFinite(sp.v2Reached))) rows.push({ label: 'Hinweis', value: '', verdict: 'warn', note: sp.warn });
    } else rows.push({ label: 'Schusskurve', value: '–', verdict: 'bad', note: sp.error });
    kpis(g.ui('p-shot'), rows);
  }
  plan.on(w => { if (['process', 'shot', 'apply', 'inlet', 'bodies', 'include', 'role', 'mesh'].includes(w)) render(); });
  return {
    id: 'schuss', modes, startMode: 'schuss',
    mounted() {
      for (const [k, l, , d, lo, hi] of SHOT_PARAMS) {
        g.ui('p-' + k).addEventListener('change', ev => {
          const x = num(ev.target.value);
          if (isFinite(x) && x >= lo && x <= hi) { plan.shot[k] = x; plan.changed('shot'); g.changed(l.replace(/<[^>]*>/g, '') + ' ' + fmt(x, d)); }
          render(); app.refresh();
        });
      }
      const segClick = (ui, fn) => g.ui(ui).addEventListener('click', ev => { const b = ev.target.closest('[data-value]'); if (b && !b.disabled) fn(b.getAttribute('data-value'), b.textContent); });
      segClick('p-mode', (v, l) => { plan.shot.mode = v; plan.changed('shot'); g.changed('1. Phase: ' + l); render(); app.refresh(); });
      segClick('p-v2mode', (v, l) => { plan.shot.v2Mode = v; plan.changed('shot'); g.changed('2. Phase: ' + l); render(); app.refresh(); });
      segClick('p-view', v => { view = v; render(); });
      onSugg(g.ui('a2-sugg'), () => {
        const x = a2Fit(shotPlan(plan));
        if (x > 0) { plan.shot.a2 = x; plan.changed('shot'); g.changed('a₂ ' + fmt(x) + ' m/s² nach Vorschlag'); render(); app.refresh(); }
      });
      const box = g.ui('p-curve');
      box.addEventListener('pointermove', ev => { if (sp && !sp.error) curveCursor(box.querySelector('svg'), sp, ev.clientX); });
      box.addEventListener('pointerleave', () => curveCursor(box.querySelector('svg'), sp, null));
      render();
    },
    valid: () => !shotPlan(plan).error,
    why: () => 'Schusskurve: ' + (shotPlan(plan).error || '')
  };
}

/* ── 8 Prozess ────────────────────────────────────────────────────── */
const PROC_T = [
  ['Tcast', 'Gießtemperatur', '°C', 0, 100, 1500],
  ['Tdie', 'Formtemperatur', '°C', 0, 0, 800],
  ['hDie', 'Wärmeübergang Form', 'W/(m²·K)', 0, 0, 1e6],
  ['Tliq', 'Liquidus', '°C', 0, 50, 1500],
  ['Tsol', 'Solidus', '°C', 0, 50, 1500]
];
const PROC_M = [
  ['rho', 'Dichte flüssig', 'kg/m³', 0, 500, 20000],
  ['mu', 'Zähigkeit', 'Pa·s', 4, 1e-5, 1],
  ['cp', 'c_p flüssig', 'J/(kg·K)', 0, 100, 5000],
  ['hf', 'Erstarrungswärme', 'kJ/kg', 0, 1, 2000]
];
const PROC = PROC_T.concat(PROC_M);
export function createProzessTool(g, { plan, app }) {
  const modes = [{
    id: 'prozess', label: 'Prozess',
    html: '<div class="sim-label">Schwerkraft</div>'
      + selectRow({ ui: 'p-gravity', label: 'Richtung', options: [['-y', '−y'], ['+y', '+y'], ['-x', '−x'], ['+x', '+x'], ['-z', '−z'], ['+z', '+z'], ['aus', 'aus']], value: plan.process.gravity })
      + '<div class="st-hintline" data-ui="p-gnote"></div>'
      + '<div class="sim-label">Temperaturen</div>'
      + PROC_T.map(([k, l, u]) => numberRow({ ui: 'p-' + k, label: l, unit: u })).join('')
      + '<div class="sim-label">Schmelze</div>'
      + PROC_M.map(([k, l, u]) => numberRow({ ui: 'p-' + k, label: l, unit: u })).join('')
      + '<div class="krows" data-ui="p-kpis"></div>',
    primary: () => app.nextPrimary('prozess')
  }];
  function render() {
    const set = (ui, v) => { const el = g.ui(ui); if (el && document.activeElement !== el) el.value = v; };
    for (const [k, , , d] of PROC) set('p-' + k, fmt(plan.process[k], d));
    const gr = g.ui('p-gravity');
    if (gr) gr.value = plan.process.gravity;
    const P = plan.process;
    const gok = !plan.shot.chamber || chamberOk(plan);
    const gn = g.ui('p-gnote');
    if (gn) {
      gn.textContent = plan.shot.chamber ? (gok ? 'Mit Kammer: die Schwerkraft steht quer zur Kolbenachse, die Schmelze liegt in der Kammer.' : 'Mit Kammer muss die Schwerkraft quer zur Kolbenachse stehen — die Schmelze liegt in der Kammer.') : 'Richtung im Bauteilsystem; die Form öffnet nach +z.';
      gn.classList.toggle('warn', !gok);
    }
    const ok = P.Tcast > P.Tliq && P.Tliq > P.Tsol && P.Tdie < P.Tsol;
    kpis(g.ui('p-kpis'), [
      { label: 'Überhitzung', value: fmt(P.Tcast - P.Tliq) + ' K', verdict: P.Tcast > P.Tliq ? 'ok' : 'bad' },
      { label: 'Temperaturen', value: ok ? 'stimmig' : 'prüfen', verdict: ok ? 'ok' : 'bad', note: 'Guss > Liquidus > Solidus > Form' }
    ]);
  }
  plan.on(w => { if (['process', 'shot', 'apply', 'inlet'].includes(w)) render(); });
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
      g.ui('p-gravity').addEventListener('change', ev => { plan.process.gravity = ev.target.value; plan.changed('process'); g.changed('Schwerkraft ' + ev.target.value); render(); app.refresh(); });
      render();
    },
    valid() {
      const P = plan.process;
      if (!(P.Tcast > P.Tliq && P.Tliq > P.Tsol && P.Tdie < P.Tsol)) return false;
      /* mit Kammer: Schwerkraft quer zur Kolbenachse (die Schmelze liegt in der Kammer) */
      return !plan.shot.chamber || chamberOk(plan);
    },
    why() {
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

/* ── 9 Auswertung ─────────────────────────────────────────────────── */
/* Die Bilder: welche Kennwerte, wann (nach Füllgrad, Zeit oder Kolbenweg, n
   Stück), welches Format, aus welchen Ansichten. Solange der Schritt dran
   ist, zeigt ein Rahmen im Viewport den Bildausschnitt im gewählten
   Seitenverhältnis — mit einer Farbleiste oben links und dem Text oben
   rechts, an denselben Stellen wie in bilder.py (FRAME). */
export function createAuswertungTool(g, { plan, app, host }) {
  const P = () => (plan.post = normalizePost(plan.post));
  const modes = [{
    id: 'auswertung', label: 'Bilder',
    html: '<div class="sim-label">Kennwerte</div><div class="st-list sim-views" data-ui="post-crit"></div>'
      + '<div class="sim-label">Zeitpunkte</div>'
      + segFull('post-by', 'Bilder nach', WHEN, 'fill')
      + numberRow({ ui: 'post-count', label: 'Bilder je Kennwert', unit: '' })
      + '<div class="st-hintline" data-ui="post-when"></div>'
      + '<div class="sim-label">Format</div>'
      + segFull('post-aspect', 'Seitenverhältnis', ASPECTS.map(([a]) => [a, a]), '16:9')
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
  frame.innerHTML = '<div class="sim-frame-box"><div class="sim-frame-bar"><i></i><em class="ov"></em><b class="hi"></b><b class="lo"></b><span class="tt"></span></div>'
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
    const fs = Math.max(9, 22 * R.h / 1000);                              // wie bilder.py: 22 px je 1000 px Bildhöhe
    const bar = frame.querySelector('.sim-frame-bar');
    Object.assign(bar.style, { left: FRAME.barX * R.w + 'px', top: FRAME.barTop * R.h + 'px', height: FRAME.barLen * R.h + 'px', fontSize: fs * 0.85 + 'px' });
    const ramp = bar.querySelector('i');
    ramp.style.width = Math.max(5, FRAME.barW * R.w) + 'px';
    /* dieselbe Leiste wie in den Bildern: die des Kennwerts (Palette) —
       Regenbogen mit Pink darüber, Blue - Green - Orange oder heat */
    const PAL = globalThis.__PALETTE__;
    ramp.style.background = PAL && PAL.leisten && PAL.leisten[crit.map] ? PAL.gradient(crit.map, 'to top')
      : 'linear-gradient(to top, ' + Array.from({ length: 7 }, (_, k) => scale('heat', k / 6)).join(', ') + ')';
    const ov = bar.querySelector('.ov'), over = PAL && PAL.ueber && PAL.ueber[crit.map];
    ov.hidden = !over;
    if (over) Object.assign(ov.style, { background: over, width: ramp.style.width });
    bar.querySelector('.hi').textContent = crit.range[1] + (over ? ', darüber Pink' : '');
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
    /* je Kennwert eine Zeile: Haken = Bilder davon, Auge = im Rahmen zeigen */
    g.ui('post-crit').innerHTML = CRITERIA.map(c => {
      const on = post.criteria.includes(c.id), pv = post.preview === c.id;
      return '<div class="sim-viewrow sim-critrow" data-crit="' + c.id + '" title="' + esc(c.hint) + '">'
        + '<label class="inline"><input type="checkbox" data-act="on"' + (on ? ' checked' : '') + '> <span>' + esc(c.label) + ' <small>' + esc(c.unit) + '</small></span></label>'
        + '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="preview" aria-pressed="' + pv + '" title="Im Rahmen zeigen" aria-label="' + esc(c.label) + ' im Rahmen zeigen">' + EYE + '</button></div>';
    }).join('');
    const seg = (ui, val) => { const el = g.ui(ui); if (el) for (const b of el.querySelectorAll('button')) b.classList.toggle('active', b.getAttribute('data-value') === val); };
    seg('post-by', post.when.by); seg('post-aspect', post.aspect);
    const cnt = g.ui('post-count'); if (cnt && document.activeElement !== cnt) cnt.value = String(post.when.count);
    const wd = g.ui('post-width'); if (wd) wd.value = String(post.width);
    const tg = targets(post);
    const step = 100 / tg.length;
    g.ui('post-when').textContent = post.when.by === 'fill'
      ? (tg.length <= 10 ? 'Füllgrad der Form: ' + tg.map(x => fmt(x, x % 1 ? 1 : 0)).join(' · ') + ' %'
        : tg.length + ' Bilder je Kennwert, Füllgrad der Form alle ' + fmt(step, step % 1 ? 1 : 0) + ' % bis 100 %')
      : post.when.by === 'time' ? tg.length + ' Bilder in gleichen Zeitabständen, von der Ankunft der Schmelze in der Form bis zum Ende'
        : tg.length + ' Bilder in gleichen Abständen des Kolbenwegs, von der Ankunft der Schmelze in der Form bis zum Ende';
    const views = post.views;
    const rows = VIEW_PRESETS.map(v => ({ v, on: views.some(x => x.id === v.id), preset: true }))
      .concat(views.filter(v => v.id.startsWith('cam')).map(v => ({ v, on: true, preset: false })));
    g.ui('post-views').innerHTML = rows.map(({ v, on, preset }) => '<div class="sim-viewrow" data-view="' + v.id + '">'
      + '<label class="inline"><input type="checkbox" data-act="on"' + (on ? ' checked' : '') + (preset ? '' : ' disabled') + '> <span>' + esc(v.label) + (preset ? ' <small>eingepasst</small>' : ' <small>genau</small>') + '</span></label>'
      + '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="show" title="Im Bild zeigen" aria-label="' + esc(v.label) + ' zeigen">' + EYE + '</button>'
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
      const crit = g.ui('post-crit');
      crit.addEventListener('change', ev => {
        const c = ev.target.closest('[data-crit]').getAttribute('data-crit'), post = P(), on = ev.target.checked;
        post.criteria = on ? CRITERIA.map(x => x.id).filter(x => x === c || post.criteria.includes(x)) : post.criteria.filter(x => x !== c);
        if (on) post.preview = c;
        else if (post.preview === c && post.criteria.length) post.preview = post.criteria[0];
        plan.changed('post'); g.changed('Bilder: ' + c); app.refresh();
      });
      crit.addEventListener('click', ev => {
        const btn = ev.target.closest('[data-act="preview"]');
        if (!btn) return;
        P().preview = btn.closest('[data-crit]').getAttribute('data-crit');
        plan.changed('post');
      });
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

/* ── 10 Export ─────────────────────────────────────────────────────── */
export function createExportTool(g, { plan, app }) {
  let busy = false, last = null;
  const modes = [{
    id: 'export', label: 'Fall',
    html: '<label class="row sim-textrow"><span>Name</span><input type="text" data-ui="exp-title" spellcheck="false" autocomplete="off"></label>'
      + '<div class="st-hintline">Steht in den Bildern und im Bericht.</div>'
      + '<label class="row sim-textrow sim-stack"><span>Fall (Ordner und ZIP)</span><input type="text" data-ui="exp-case" spellcheck="false" autocomplete="off"></label>'
      + suggBox('case-sugg')
      + '<div class="krows" data-ui="exp-kpis"></div>'
      + '<div class="st-hintline" data-ui="exp-note"></div>'
      + '<div class="sim-cmdbox"><div class="sim-cmdhead"><span>Im Terminal</span><button type="button" class="sim-copy" data-ui="exp-copy">Kopieren</button></div>'
      + '<pre class="sim-cmd" data-ui="exp-cmd"></pre></div>'
      + '<div class="st-hintline">Mit mehreren Prozessen: <code>NP=8 ./Allrun</code>. Eine abgebrochene Rechnung läuft mit demselben Aufruf weiter. Am Ende liegt der Bericht in <code>auswertung/bericht.html</code>; <code>./Allrun -auswertung</code> macht Bilder und Bericht neu.</div>'
      + '<div class="sim-label">Im ZIP</div><ul class="sim-tree" data-ui="exp-tree"></ul>',
    primary: () => {
      const miss = missing({ bodies: plan.included(), inlet: plan.inlet, outlets: plan.outlets, mesh: plan.mesh });
      return { label: busy ? 'Fall wird gebaut …' : 'Fall herunterladen (ZIP)', onClick: run, disabled: busy || miss.length > 0, reason: miss.join(' ') };
    }
  }];
  function render() {
    const t = g.ui('exp-title');
    if (t && document.activeElement !== t) t.value = plan.title;
    /* Ordner und ZIP: von Hand, sonst der Vorschlag mit dem Datum von heute */
    const sug = caseName(plan.title), root = plan.caseName ? safe(plan.caseName) : sug;
    const c = g.ui('exp-case');
    if (c && document.activeElement !== c) c.value = root;
    paintSugg(g.ui('case-sugg'), { value: sug, why: 'Datum von heute und Name — Ordner und ZIP', on: root === sug });
    const cmd = g.ui('exp-cmd');
    if (cmd) cmd.textContent = 'unzip ' + root + '.zip\ncd ' + root + '\nsource \\\n  /usr/lib/openfoam/openfoam2606/etc/bashrc\n./Allrun';
    const tree = g.ui('exp-tree');
    if (tree) tree.innerHTML = [
      ['Allrun', 'Netz, Rechnung, Auswertung'], ['bilder.py · bericht.py', 'Bilder (ParaView), Bericht (Python 3)'],
      ['auswertung.json', 'Einstellungen der Auswertung'], ['simulation/', 'der OpenFOAM-Fall'], ['auswertung/', 'entsteht am Ende: bericht.html, bilder, graphiken, daten']
    ].map(([f, t]) => '<li><code>' + esc(root + '/' + f) + '</code><span>' + esc(t) + '</span></li>').join('');
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
      g.ui('exp-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(g.ui('exp-cmd').textContent); g.shell.toast('Befehle kopiert.'); }
        catch { g.shell.toast('Kopieren ging nicht — die Befehle bitte markieren.'); }
      });
      g.ui('exp-title').addEventListener('change', ev => { const s = String(ev.target.value).trim(); if (s) { plan.title = s; plan.changed('title'); g.changed('Name „' + s + '"'); } render(); });
      g.ui('exp-case').addEventListener('change', ev => {
        const s = safe(String(ev.target.value).trim());
        /* derselbe wie der Vorschlag: der Vorschlag gilt weiter (morgen mit neuem Datum) */
        plan.caseName = s && s !== caseName(plan.title) ? s : null;
        plan.changed('title'); g.changed('Fall „' + (plan.caseName || caseName(plan.title)) + '"');
        render();
      });
      onSugg(g.ui('case-sugg'), () => { plan.caseName = null; plan.changed('title'); g.changed('Fall nach Vorschlag'); render(); });
      render();
    },
    exports: [{ label: 'OpenFOAM-Fall (ZIP)', enabled: () => !missing({ bodies: plan.included(), inlet: plan.inlet, outlets: plan.outlets, mesh: plan.mesh }).length, run }],
    run, get last() { return last; }, safeName: () => (plan.caseName ? safe(plan.caseName) : caseName(plan.title))
  };
}
