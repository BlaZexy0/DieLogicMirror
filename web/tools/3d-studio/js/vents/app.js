/* Überlaufdesigner (ueberlauf.html) — Einstieg und Verdrahtung.

   Wer eine Art wählt und auf das Bauteil klickt, setzt dort ein Element:
   Ort ist der getroffene Punkt, Achse die nach außen gerichtete
   Flächennormale — dorthin wachsen Steg, Bohne und Kanal. Danach: am
   Punkt ziehen (in der Tangentialebene, also auf der Wand entlang; mit
   Alt von ihr weg), am Pfeil neu setzen, im Auswahlfeld um die Achse
   drehen und bemaßen.

   Der Plan (js/vents/model.js) ist die Quelle; Körper (js/vents/geom.js),
   Kennzahlen und Prüfliste entstehen daraus bei jeder Änderung neu. Die
   Griffe im Viewport sind dieselben wie im Angussdesigner
   (js/handles.js). */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountNav } from '../ui/nav.js';
import { $, fmt, facts, slider, numberInput } from '../ui/controls.js';
import { mountPartSource } from '../part/partsource.js';
import { writeSTL } from '../part/stlio.js';
import { createHandles, SELECTED_RING } from '../handles.js';
import * as M from './model.js';
import { buildByType, buildAll, volumeOf } from './geom.js';

mountNav('ueberlauf.html');

const container = $('viewport');
const view = initScene(container, {
  cameraStart: [260, 200, 260], target: [0, 0, 0],
  grid: false, minDistance: 3, maxDistance: 30000
});
mountViewBar(container, view);

const state = { plan: M.emptyPlan(), model: null, name: '', ready: false };

/* ── Szene ───────────────────────────────────────────────────── */
const group = new T.Group();
view.scene.add(group);

/* Deckend: hier wird auf die Wand geklickt, und die soll aussehen wie
   eine Wand. Der Regler „Deckkraft" macht sie durchscheinend, wenn man
   hinter sie sehen will. */
const refMat = new T.MeshStandardMaterial({
  color: 0xb5c0c4, roughness: 0.7, metalness: 0.05, side: T.DoubleSide
});
const refMesh = new T.Mesh(new T.BufferGeometry(), refMat);
refMesh.visible = false;
group.add(refMesh);

/* Je Art ein Körper in der Artfarbe — man sieht im Bild, was was ist. */
const meshes = {};
for (const [type, meta] of Object.entries(M.TYPES)) {
  const mat = new T.MeshStandardMaterial({
    color: meta.color, roughness: 0.55, metalness: 0.04, side: T.DoubleSide, flatShading: true
  });
  meshes[type] = new T.Mesh(new T.BufferGeometry(), mat);
  group.add(meshes[type]);
}

/* ── Griffe ──────────────────────────────────────────────────── */
const handles = createHandles({
  view,
  getRefMesh: () => refMesh,
  markColor: M.TYPES.bohne.color,
  items: () => M.allItems(state.plan).map(it => ({
    id: it.id, pos: it.pos, color: M.TYPES[it.type].color,
    dir: it.dir,
    planeSize: Math.max(24, (it.p.wellW || it.p.ventW || 12) * 2)
  })),
  /* Gezogen wird in der Tangentialebene der Wand: der Punkt rutscht auf
     ihr entlang. Mit Alt entlang der Normalen, von der Wand weg. */
  plane: id => {
    const it = state.plan.items[id];
    return it ? { origin: it.pos, normal: it.dir } : null;
  },
  move: (id, pos) => M.setPos(state.plan, id, pos),
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
  } else {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(tris), 3));
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

/* Die Zahlen, um die es geht: was das Bauteil wiegt und was die
   Überläufe dazulegen — zusammen ist das, was durch die Anschnitte muss. */
function updateFacts() {
  const items = M.allItems(state.plan);
  let added = 0;
  for (const it of items) added += volumeOf(it);
  const part = state.model ? state.model.volume : 0;
  facts('plan-facts', [
    ['Elemente', fmt(items.length, 0)],
    ['Bauteil', fmt(part / 1000) + ' cm³'],
    ['Überläufe', fmt(added / 1000) + ' cm³'],
    ['Gesamt', fmt((part + added) / 1000) + ' cm³']
  ]);
}

/* ── Auswahl ─────────────────────────────────────────────────── */
const sel = () => (handles.selected ? state.plan.items[handles.selected] : null);

function syncSelection() {
  const it = sel();
  $('sel-block').classList.toggle('disabled', !it);
  $('pt-sel').className = 'pt-sel' + (it ? '' : ' empty');
  if (!it) {
    $('pt-sel').textContent = 'Kein Überlauf gewählt';
    $('sel-params').innerHTML = '';
    facts('sel-facts', []);
    updateMenu();
    return;
  }
  const meta = M.TYPES[it.type];
  $('pt-sel').innerHTML = '<span class="dot" style="background:' + meta.color + '"></span>'
    + meta.label + ' <code>' + it.id + '</code>';
  $('sel-type').value = it.type;
  for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) $(k).value = fmt(it.pos[i], 1);
  $('sel-rot').value = String(it.rot || 0);
  $('sel-rot-val').textContent = fmt(it.rot || 0, 0) + '°';

  /* Die Maße der Art als Zeilen — jede Art hat andere, deshalb werden sie
     bei jeder Auswahl neu aufgebaut. */
  const keys = Object.keys(it.p);
  $('sel-params').innerHTML = keys.map(k => {
    const m = M.PARAM_META[k] || { label: k };
    return '<div class="row"><span>' + m.label + '</span>'
      + '<input type="text" id="p-' + k + '" inputmode="decimal" spellcheck="false" value="' + fmt(it.p[k], 2) + '">'
      + '<span class="val">' + (m.unit === undefined ? 'mm' : m.unit) + '</span></div>';
  }).join('');
  for (const k of keys) {
    const m = M.PARAM_META[k] || { min: 0, max: 1e6 };
    const el = $('sel-params').querySelector('#p-' + k);
    if (!el) continue;
    numberInput(el, v => {
      const n = sel();
      if (!n) return v;
      let val = Math.max(m.min, Math.min(m.max, v));
      if (m.step === 1) val = Math.round(val);
      n.p[k] = val;
      rebuild();
      syncFacts(n);
      return val;
    });
  }
  syncFacts(it);
  updateMenu();
}

function syncFacts(it) {
  const rows = [['Volumen', fmt(volumeOf(it) / 1000, 2) + ' cm³']];
  if (it.p.stegW) rows.push(['Stegquerschnitt', fmt(it.p.stegW * it.p.stegH) + ' mm²']);
  if (it.p.ventW) rows.push(['Kanalquerschnitt', fmt(it.p.ventW * it.p.ventH, 2) + ' mm²']);
  rows.push(['Achse', dirText(it.dir)]);
  facts('sel-facts', rows);
}

function dirText(d) {
  const ax = ['X', 'Y', 'Z'];
  let best = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(d[i]) > Math.abs(d[best])) best = i;
  const name = (d[best] < 0 ? '−' : '+') + ax[best];
  return Math.abs(d[best]) > 0.985 ? name : 'schräg, überwiegend ' + name;
}

function updateMenu() {
  const it = sel();
  $('del-item').disabled = !it;
}

$('sel-type').innerHTML = Object.entries(M.TYPES)
  .map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
$('sel-type').addEventListener('change', e => {
  const it = sel();
  if (!it) return;
  M.setType(state.plan, it.id, e.target.value);
  rebuild();
  syncSelection();
});
for (const [id, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
  numberInput(id, v => {
    const it = sel();
    if (!it) return v;
    const p = it.pos.slice();
    p[axis] = v;
    M.setPos(state.plan, it.id, p);
    rebuild();
    return v;
  });
}
slider('sel-rot', v => {
  const it = sel();
  if (!it) return;
  M.setRot(state.plan, it.id, v);
  rebuild();
  syncFacts(it);
}, v => fmt(v, 0) + '°');

$('del-item').addEventListener('click', removeSelected);
function removeSelected() {
  const it = sel();
  if (!it) return;
  M.removeItem(state.plan, it.id);
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
  $('aim-text').textContent = 'Daneben — die Stelle muss auf dem Bauteil liegen.';
  missTimer = setTimeout(() => { if (handles.aiming) { $('aim-banner').classList.remove('miss'); $('aim-text').textContent = keep; } }, 1600);
}
function cancelAim() {
  handles.cancelAim();
  aimArmed(false);
}
/* Der Strahl liefert die nach INNEN gerichtete Normale; das Element
   wächst nach außen. */
const outward = d => [-d[0], -d[1], -d[2]];

function noPart() {
  aimArmed(true, 'Zuerst ein Bauteil laden — dann setzt der Klick den Überlauf dorthin.');
  clearTimeout(missTimer);
  missTimer = setTimeout(() => { if (!handles.aiming) aimArmed(false); }, 3200);
}

/** Ein neuer Überlauf der Art `type`: der nächste Klick aufs Bauteil setzt sie. */
function startPlace(type) {
  if (!M.TYPES[type]) return;
  if (!refMesh.visible) { noPart(); return; }
  handles.select(null);
  aimArmed(true, M.TYPES[type].label + ': die Stelle am Bauteil anklicken, wo sie sitzen soll. Ziehen dreht die Ansicht, Esc bricht ab.');
  handles.armAim({
    onHit: hit => {
      aimArmed(false);
      const it = M.addItem(state.plan, type, hit.point, outward(hit.dir));
      rebuild();
      handles.select(it.id);
    },
    onMiss: miss
  });
}

/** Der Klick auf den Pfeil: ein vorhandenes Element an eine andere Stelle. */
function startMove(id) {
  const it = state.plan.items[id];
  if (!it) return;
  if (!refMesh.visible) { noPart(); return; }
  aimArmed(true, M.TYPES[it.type].label + ' ' + id + ': die neue Stelle am Bauteil anklicken. Esc bricht ab.');
  handles.armAim({
    onHit: hit => {
      aimArmed(false);
      M.placeAt(state.plan, id, hit.point, outward(hit.dir));
      rebuild();
      syncSelection();
    },
    onMiss: miss
  });
}

for (const type of Object.keys(M.TYPES)) $('add-' + type).addEventListener('click', () => startPlace(type));
$('aim-cancel').addEventListener('click', cancelAim);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { cancelAim(); return; }
  const tag = (e.target && e.target.tagName) || '';
  if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
    removeSelected();
  }
});

/* ── Bauteil ─────────────────────────────────────────────────── */
slider('ref-opacity', v => {
  refMat.opacity = v / 100;
  refMat.transparent = v < 100;
  refMat.depthWrite = v >= 100;
  refMat.needsUpdate = true;
  view.invalidate();
}, v => v + ' %');

const source = mountPartSource({
  busy: $('busy'), viewport: container,
  onLoad: (model, name) => {
    state.model = model;
    state.name = name;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(model.tris), 3));
    geo.computeVertexNormals();
    refMesh.geometry.dispose();
    refMesh.geometry = geo;
    refMesh.visible = true;
    view.fitTo(refMesh);
    rebuild();
  },
  start: 'gearbox_cover'
});

/* ── Dateien ─────────────────────────────────────────────────── */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const safeName = () => ((state.name || 'ueberlaeufe') + '-ueberlaeufe').replace(/[^\w-]+/g, '-').toLowerCase();

$('stl-save').addEventListener('click', () => {
  const tris = buildAll(state.plan);
  if (!tris.length) return;
  download(new Blob([writeSTL(tris, 'DieLogic Überläufe')], { type: 'model/stl' }), safeName() + '.stl');
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
    try {
      loadPlan(M.fromJSON(JSON.parse(fr.result)));
    } catch (err) {
      $('model-warn').textContent = 'Die Datei „' + f.name + '" konnte nicht gelesen werden: ' + err.message;
    }
  };
  fr.readAsText(f);
  e.target.value = '';
});

function loadPlan(plan) {
  state.plan = plan;
  handles.select(null);
  rebuild();
}

/* ── Legende ─────────────────────────────────────────────────── */
$('pt-legend').innerHTML = '<div class="pt-menu-title">Arten</div>'
  + Object.values(M.TYPES).map(t => '<div class="lg-row"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div>').join('')
  + '<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>';

rebuild();
syncSelection();
source.start().then(() => { state.ready = true; });

export const __viewer = { state, view, handles, rebuild, startPlace, startMove, loadPlan, refMesh, group, source };
window.__ueberlauf = __viewer;
