/* Temperierkanal-Designer (temperier.html) — Einstieg und Verdrahtung.

   Um das Bauteil liegt die ABSTANDSFLÄCHE: die Fläche, die überall
   denselben Abstand zur Kavität hat (voreingestellt 20 mm). Sie kommt aus
   demselben Rasterfeld wie die Wandstärkenanalyse (js/part/field.js,
   js/part/surfacenets.js) und wird beim Laden des Bauteils gerechnet.
   Auf ihr werden die Elemente gesetzt:

     Kühlstich   ein Klick — die Spitze sitzt am Punkt, der Stich läuft
                 vom Bauteil weg: senkrecht zur Fläche, auf die Kamera zu
                 oder entlang X/Y/Z, wie man es wählt.
     Kanal       zwei Klicks, ein Ende hier, das andere dort.

   Danach bewegt man Enden frei im Raum — es gibt keine Arbeitsebene,
   deshalb hat jedes Ende drei Achsenpfeile (js/handles.js) und rutscht
   ohne Pfeil in der Bildebene; wahlweise wandern beide Enden zugleich.
   Was zählt, steht im Auswahlfeld: der kleinste Wandabstand der Bohrung
   zur Kavität, aus dem Feld abgetastet. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountNav } from '../ui/nav.js';
import { $, fmt, facts, segButtons, slider, numberInput } from '../ui/controls.js';
import { mountPartSource, frame } from '../part/partsource.js';
import { buildField, sampleField } from '../part/field.js';
import { surfaceNets } from '../part/surfacenets.js';
import { writeSTL } from '../part/stlio.js';
import { createHandles, SELECTED_RING } from '../handles.js';
import * as M from './model.js';
import { buildByType, buildAll, volumeOf, wallClearance } from './geom.js';
import { planCooling } from './auto.js';

mountNav('temperier.html');

const container = $('viewport');
const busy = $('busy');
const view = initScene(container, {
  cameraStart: [320, 260, 320], target: [0, 0, 0],
  grid: false, minDistance: 3, maxDistance: 30000
});
mountViewBar(container, view);

const state = {
  plan: M.emptyPlan(), model: null, name: '', field: null, shellDist: null,
  res: 64, dirMode: 'normal', both: false, showShell: true,
  defaults: { d: 8, len: 60, kd: 10 },
  auto: { count: 8, spacing: 25, replace: true, stats: null },
  pending: null, computing: false, ready: false
};

/* ── Szene ───────────────────────────────────────────────────── */
const group = new T.Group();
view.scene.add(group);

const partMat = new T.MeshStandardMaterial({ color: 0xb5c0c4, roughness: 0.7, metalness: 0.05, side: T.DoubleSide });
const partMesh = new T.Mesh(new T.BufferGeometry(), partMat);
partMesh.visible = false;
group.add(partMesh);

/* Die Abstandsfläche: durchscheinend, damit man das Bauteil darin sieht,
   und nicht in die Tiefe schreibend, damit die Elemente auf ihr nicht
   flackern. Sie ist das Ziel des Zielmodus. */
const shellMat = new T.MeshStandardMaterial({
  color: 0x3fc2b6, roughness: 0.6, metalness: 0.02, transparent: true, opacity: 0.22,
  depthWrite: false, side: T.DoubleSide, flatShading: true
});
const shellMesh = new T.Mesh(new T.BufferGeometry(), shellMat);
shellMesh.visible = false;
group.add(shellMesh);

const meshes = {};
for (const [type, meta] of Object.entries(M.TYPES)) {
  meshes[type] = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({
    color: meta.color, roughness: 0.5, metalness: 0.1, side: T.DoubleSide
  }));
  group.add(meshes[type]);
}

/* ── Griffe ──────────────────────────────────────────────────── */
/* Ein Kanal hat zwei Griffe, „t3:a" und „t3:b"; ein Kühlstich einen an
   der Spitze. Alle bewegen sich frei — mit Achsenpfeilen. */
const splitId = id => { const i = id.indexOf(':'); return i < 0 ? [id, 'p'] : [id.slice(0, i), id.slice(i + 1)]; };
const handles = createHandles({
  view,
  getRefMesh: () => shellMesh,
  markColor: M.TYPES.stich.color,
  items: () => {
    const out = [];
    for (const it of M.allItems(state.plan)) {
      const color = M.TYPES[it.type].color;
      if (it.type === 'stich') out.push({ id: it.id, pos: it.p, color, dir: it.dir, gizmo: true });
      else {
        out.push({ id: it.id + ':a', pos: it.a, color, gizmo: true });
        out.push({ id: it.id + ':b', pos: it.b, color, gizmo: true });
      }
    }
    return out;
  },
  plane: () => null,
  move: (id, pos) => {
    const [iid, end] = splitId(id);
    M.setEnd(state.plan, iid, end, pos, state.both);
  },
  onSelect: () => { cancelAim(); syncSelection(); },
  onChange: what => {
    if (what === 'drag') { rebuild('drag'); return; }
    rebuild();
    if (what === 'drop') syncSelection();
  },
  onAim: id => startMove(id)
});

/* ── Kette: Plan → Anzeige ───────────────────────────────────── */
function setTris(mesh, tris) {
  const attr = mesh.geometry.getAttribute('position');
  if (attr && attr.array.length === tris.length) {
    attr.array.set(tris);
    attr.needsUpdate = true;
    mesh.geometry.boundingSphere = null;
    mesh.geometry.computeVertexNormals();
  } else {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(tris), 3));
    geo.computeVertexNormals();
    mesh.geometry.dispose();
    mesh.geometry = geo;
  }
  mesh.visible = tris.length > 0;
}

function rebuild(mode) {
  const by = buildByType(state.plan);
  for (const type of Object.keys(meshes)) setTris(meshes[type], by[type] || []);
  handles.refresh();
  if (mode === 'drag') { view.invalidate(); return; }
  updateFacts();
  updateMenu();
  view.invalidate();
}

const clearanceOf = it => (state.field ? wallClearance(it, (x, y, z) => sampleField(state.field, x, y, z)) : null);

function updateFacts() {
  const items = M.allItems(state.plan);
  let length = 0, minClear = Infinity;
  for (const it of items) {
    length += M.lengthOf(it);
    const c = clearanceOf(it);
    if (c !== null && c < minClear) minClear = c;
  }
  facts('plan-facts', [
    ['Kühlstiche', fmt(items.filter(i => i.type === 'stich').length, 0)],
    ['Kanäle', fmt(items.filter(i => i.type === 'kanal').length, 0)],
    ['Gesamtlänge', fmt(length, 0) + ' mm'],
    ['kleinster Wandabstand', Number.isFinite(minClear) ? fmt(minClear) + ' mm' : '—']
  ]);
}

/* ── Abstandsfläche ──────────────────────────────────────────── */
/* Das Feld reicht nach außen bis über den Abstand hinaus; ein Abstand
   innerhalb des Bandes kostet nur das Ableiten, mehr ein neues Feld. */
async function computeShell() {
  if (!state.model || state.computing) return;
  const dist = state.plan.dist;
  const need = dist * 1.3 + 5;
  state.computing = true;
  try {
    if (!state.field || state.field.band < dist + 1 || state.fieldRes !== state.res) {
      busy.textContent = 'Abstandsfeld rastern …';
      busy.classList.add('on');
      await frame();
      state.field = await buildField(state.model, {
        res: state.res, band: need,
        onProgress: (p, what) => { busy.textContent = 'Abstandsfeld · ' + what + ' … ' + Math.round(p * 100) + ' %'; }
      });
      state.fieldRes = state.res;
    }
    const tris = surfaceNets(state.field, dist);
    setTris(shellMesh, tris);
    state.shellDist = dist;
    $('shell-note').textContent = 'Fläche im Abstand ' + fmt(dist) + ' mm · ' + fmt(tris.length / 9, 0)
      + ' Dreiecke · Zellgröße ' + fmt(state.field.h) + ' mm';
  } catch (err) {
    $('model-warn').textContent = 'Die Abstandsfläche konnte nicht gerechnet werden: ' + err.message;
    console.error(err);
  } finally {
    busy.classList.remove('on');
    state.computing = false;
  }
  applyVisibility();
  rebuild();
  syncSelection();
}

function applyVisibility() {
  shellMesh.visible = state.showShell && shellMesh.geometry.attributes.position
    && shellMesh.geometry.attributes.position.count > 0;
  view.invalidate();
}

/* ── Auswahl ─────────────────────────────────────────────────── */
const sel = () => {
  if (!handles.selected) return null;
  const [id, end] = splitId(handles.selected);
  const it = state.plan.items[id];
  return it ? { it, end } : null;
};

function syncSelection() {
  const s = sel();
  $('sel-block').classList.toggle('disabled', !s);
  $('pt-sel').className = 'pt-sel' + (s ? '' : ' empty');
  if (!s) {
    $('pt-sel').textContent = 'Kein Element gewählt';
    facts('sel-facts', []);
    updateMenu();
    return;
  }
  const { it, end } = s;
  const meta = M.TYPES[it.type];
  $('pt-sel').innerHTML = '<span class="dot" style="background:' + meta.color + '"></span>'
    + meta.label + ' <code>' + it.id + '</code>'
    + (it.type === 'kanal' ? ' <em>Ende ' + end.toUpperCase() + '</em>' : '')
    + (it.auto ? ' <em>automatisch</em>' : '');
  $('sel-d').value = fmt(it.d, 2);
  $('sel-len-row').classList.toggle('hidden', it.type !== 'stich');
  $('sel-dir-row').classList.toggle('hidden', it.type !== 'stich');
  $('sel-both-row').classList.toggle('hidden', it.type !== 'kanal');
  if (it.type === 'stich') {
    $('sel-len').value = fmt(it.len, 2);
    $('sel-dir').textContent = dirText(it.dir);
  }
  const pos = it.type === 'stich' ? it.p : it[end];
  for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) $(k).value = fmt(pos[i], 1);
  $('sel-both').checked = state.both;
  const c = clearanceOf(it);
  const rows = [['Länge', fmt(M.lengthOf(it), 1) + ' mm'], ['Volumen', fmt(volumeOf(it) / 1000, 2) + ' cm³']];
  if (c !== null) {
    const bad = c < state.plan.dist - state.field.h;
    rows.push(['Wandabstand', (bad ? '⚠ ' : '') + fmt(c) + ' mm']);
  }
  facts('sel-facts', rows);
  updateMenu();
}

function dirText(d) {
  const ax = ['X', 'Y', 'Z'];
  let best = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(d[i]) > Math.abs(d[best])) best = i;
  const name = (d[best] < 0 ? '−' : '+') + ax[best];
  return Math.abs(d[best]) > 0.985 ? name : 'schräg, überwiegend ' + name;
}

function updateMenu() {
  $('del-item').disabled = !sel();
  const has = !!state.shellDist;
  $('add-stich').disabled = !has;
  $('add-kanal').disabled = !has;
}

numberInput('sel-d', v => {
  const s = sel();
  if (!s) return v;
  s.it.d = Math.max(M.PARAM_META.d.min, Math.min(M.PARAM_META.d.max, v));
  rebuild(); syncSelection();
  return s.it.d;
});
numberInput('sel-len', v => {
  const s = sel();
  if (!s || s.it.type !== 'stich') return v;
  s.it.len = Math.max(M.PARAM_META.len.min, Math.min(M.PARAM_META.len.max, v));
  rebuild(); syncSelection();
  return s.it.len;
});
for (const [id, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
  numberInput(id, v => {
    const s = sel();
    if (!s) return v;
    const pos = (s.it.type === 'stich' ? s.it.p : s.it[s.end]).slice();
    pos[axis] = v;
    M.setEnd(state.plan, s.it.id, s.end, pos, state.both);
    rebuild(); syncSelection();
    return v;
  });
}
$('sel-both').addEventListener('change', e => { state.both = e.target.checked; });
$('del-item').addEventListener('click', removeSelected);
function removeSelected() {
  const s = sel();
  if (!s) return;
  M.removeItem(state.plan, s.it.id);
  handles.select(null);
  rebuild();
}

/* ── Zielmodus: setzen und neu setzen ────────────────────────── */
function aimArmed(on, text) {
  $('aim-banner').classList.toggle('hidden', !on);
  $('aim-banner').classList.remove('miss');
  if (text) $('aim-text').textContent = text;
}
let missTimer = 0;
function miss() {
  clearTimeout(missTimer);
  const keep = $('aim-text').textContent;
  $('aim-banner').classList.add('miss');
  $('aim-text').textContent = 'Daneben — die Stelle muss auf der Abstandsfläche liegen.';
  missTimer = setTimeout(() => { if (handles.aiming) { $('aim-banner').classList.remove('miss'); $('aim-text').textContent = keep; } }, 1600);
}
function cancelAim() {
  handles.cancelAim();
  state.pending = null;
  aimArmed(false);
}
const toCamera = point => {
  const c = view.camera.position;
  return [c.x - point[0], c.y - point[1], c.z - point[2]];
};
/* Der Strahl liefert die nach INNEN gerichtete Normale der Fläche, also
   zum Bauteil hin; der Stich läuft nach außen. */
const dirAt = hit => M.directionFor(state.dirMode, [-hit.dir[0], -hit.dir[1], -hit.dir[2]], toCamera(hit.point));

function noShell() {
  aimArmed(true, 'Zuerst ein Bauteil laden — die Abstandsfläche entsteht daraus, und auf ihr wird gesetzt.');
  clearTimeout(missTimer);
  missTimer = setTimeout(() => { if (!handles.aiming) aimArmed(false); }, 3200);
}

function startPlace(type) {
  if (!state.shellDist) { noShell(); return; }
  handles.select(null);
  state.pending = null;
  if (type === 'stich') {
    aimArmed(true, 'Kühlstich: die Stelle auf der Abstandsfläche anklicken — dort sitzt die Spitze, der Stich läuft '
      + M.DIRECTIONS[state.dirMode].hint + '. Esc bricht ab.');
    handles.armAim({
      onHit: hit => {
        aimArmed(false);
        const it = M.addStich(state.plan, hit.point, dirAt(hit), { d: state.defaults.d, len: state.defaults.len });
        rebuild();
        handles.select(it.id);
      },
      onMiss: miss
    });
    return;
  }
  aimArmed(true, 'Kanal: das erste Ende auf der Abstandsfläche anklicken. Esc bricht ab.');
  handles.armAim({
    onHit: hit => {
      state.pending = hit.point.slice();
      aimArmed(true, 'Kanal: jetzt das andere Ende anklicken. Esc bricht ab.');
      handles.armAim({
        onHit: hit2 => {
          aimArmed(false);
          const it = M.addKanal(state.plan, state.pending, hit2.point, { d: state.defaults.kd });
          state.pending = null;
          rebuild();
          handles.select(it.id + ':b');
        },
        onMiss: miss
      });
    },
    onMiss: miss
  });
}

/** Der Pfeil eines Kühlstichs: Spitze und Richtung neu setzen. */
function startMove(id) {
  const it = state.plan.items[splitId(id)[0]];
  if (!it || it.type !== 'stich') return;
  if (!state.shellDist) { noShell(); return; }
  aimArmed(true, 'Kühlstich ' + it.id + ': die neue Stelle auf der Abstandsfläche anklicken. Esc bricht ab.');
  handles.armAim({
    onHit: hit => {
      aimArmed(false);
      M.placeStich(state.plan, it.id, hit.point, dirAt(hit));
      rebuild();
      syncSelection();
    },
    onMiss: miss
  });
}

$('add-stich').addEventListener('click', () => startPlace('stich'));
$('add-kanal').addEventListener('click', () => startPlace('kanal'));

/* ── Automatik ───────────────────────────────────────────────── */
/* N Kühlstiche auf der Abstandsfläche, so verteilt, dass jede Stelle im
   Bauteil — dicke eher als dünne — eine Bohrung in der Nähe hat
   (js/cooling/auto.js). Die Richtung folgt der Wahl unter „Kühlstiche";
   bei „Normale" ist es der Feldgradient an der Stelle. */
function runAuto() {
  if (!state.shellDist || !state.field) { noShell(); return; }
  cancelAim();
  const shell = shellMesh.geometry.attributes.position ? shellMesh.geometry.attributes.position.array : null;
  if (!shell || !shell.length) return;
  if (state.auto.replace) M.removeAuto(state.plan);
  const spacing = Math.max(state.auto.spacing, state.defaults.d * 1.5);
  const plan = planCooling(state.field, shell, { count: state.auto.count, minSpacing: spacing });
  for (const site of plan.sites) {
    const dir = M.directionFor(state.dirMode, site.n, toCamera(site.p));
    M.addStich(state.plan, site.p, dir, { d: state.defaults.d, len: state.defaults.len, auto: true });
  }
  state.auto.stats = plan.stats;
  handles.select(null);
  rebuild();
  facts('auto-facts', [
    ['gesetzt', fmt(plan.sites.length, 0) + ' Kühlstiche'],
    ['mittlerer Abstand', fmt(plan.stats.mean) + ' mm'],
    ['größter Abstand', fmt(plan.stats.max) + ' mm']
  ]);
  $('auto-note').textContent = plan.sites.length < state.auto.count
    ? 'Nur ' + plan.sites.length + ' Stellen halten den Mindestabstand — Abstand kleiner wählen oder weniger Bohrungen.'
    : '';
}
$('auto-run').addEventListener('click', runAuto);
slider('auto-count', v => { state.auto.count = v; }, v => v + '');
slider('auto-spacing', v => { state.auto.spacing = v; }, v => v + ' mm');
$('auto-replace').addEventListener('change', e => { state.auto.replace = e.target.checked; });
$('aim-cancel').addEventListener('click', cancelAim);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { cancelAim(); return; }
  const tag = (e.target && e.target.tagName) || '';
  if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') removeSelected();
});

/* ── Seitenleiste ────────────────────────────────────────────── */
segButtons('dir-seg', v => { if (M.DIRECTIONS[v]) state.dirMode = v; });
numberInput('def-d', v => { state.defaults.d = Math.max(2, Math.min(60, v)); return state.defaults.d; });
numberInput('def-len', v => { state.defaults.len = Math.max(5, Math.min(1000, v)); return state.defaults.len; });
numberInput('def-kd', v => { state.defaults.kd = Math.max(2, Math.min(60, v)); return state.defaults.kd; });

let distTimer = 0;
slider('dist', v => {
  state.plan.dist = v;
  clearTimeout(distTimer);
  distTimer = setTimeout(computeShell, 250);         // erst wenn der Regler stillsteht
}, v => v + ' mm');
slider('res', v => { state.res = v; state.field = null; clearTimeout(distTimer); distTimer = setTimeout(computeShell, 250); }, v => v + ' Zellen');
$('shell-on').addEventListener('change', e => { state.showShell = e.target.checked; applyVisibility(); });
slider('ref-opacity', v => {
  partMat.opacity = v / 100;
  partMat.transparent = v < 100;
  partMat.depthWrite = v >= 100;
  partMat.needsUpdate = true;
  view.invalidate();
}, v => v + ' %');

const source = mountPartSource({
  busy, viewport: container,
  onStart: () => { state.ready = false; },
  onLoad: async (model, name) => {
    state.model = model;
    state.name = name;
    state.field = null;
    state.shellDist = null;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(model.tris), 3));
    geo.computeVertexNormals();
    partMesh.geometry.dispose();
    partMesh.geometry = geo;
    partMesh.visible = true;
    view.fitTo(partMesh, 1.6);
    await computeShell();
    state.ready = true;
  }
});

/* ── Dateien ─────────────────────────────────────────────────── */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const safeName = () => ((state.name || 'bauteil') + '-temperierung').replace(/[^\w-]+/g, '-').toLowerCase();
$('stl-save').addEventListener('click', () => {
  const tris = buildAll(state.plan);
  if (!tris.length) return;
  download(new Blob([writeSTL(tris, 'DieLogic Temperierung')], { type: 'model/stl' }), safeName() + '.stl');
});
$('json-save').addEventListener('click', () => {
  download(new Blob([JSON.stringify(M.toJSON(state.plan), null, 1)], { type: 'application/json' }), safeName() + '.json');
});
$('json-btn').addEventListener('click', () => $('json-input').click());
$('json-input').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    try { loadPlan(M.fromJSON(JSON.parse(fr.result))); } catch (err) {
      $('model-warn').textContent = 'Die Datei „' + f.name + '" konnte nicht gelesen werden: ' + err.message;
    }
  };
  fr.readAsText(f);
  e.target.value = '';
});
function loadPlan(plan) {
  state.plan = plan;
  $('dist').value = String(plan.dist);
  $('dist-val').textContent = plan.dist + ' mm';
  handles.select(null);
  rebuild();
  if (state.model) computeShell();
}

$('pt-legend').innerHTML = '<div class="pt-menu-title">Arten</div>'
  + Object.values(M.TYPES).map(t => '<div class="lg-row"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div>').join('')
  + '<div class="lg-row"><span class="dot" style="background:#3fc2b6;opacity:.5"></span>Abstandsfläche</div>'
  + '<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>';

rebuild();
syncSelection();
source.start();

export const __viewer = { state, view, handles, rebuild, startPlace, startMove, computeShell, loadPlan, runAuto, partMesh, shellMesh, group, source };
window.__temperier = __viewer;
