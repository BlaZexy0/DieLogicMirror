/* Überlaufdesigner (ueberlauf.html) — Einstieg und Verdrahtung.

   Wer eine Art wählt und auf das Bauteil klickt, setzt dort ein Element:
   Ort ist der getroffene Punkt, Achse die nach außen gerichtete
   Flächennormale — dorthin wachsen Steg, Bohne und Kanal. Danach: am
   Punkt ziehen (in der Tangentialebene, also auf der Wand entlang; mit
   Alt von ihr weg), am Pfeil neu setzen, im Auswahlfeld um die Achse
   drehen und bemaßen.

   Der Überlauf mit Entlüftung trägt eine zweite Kugel am Ende der
   Bohne und dahinter je Kanalpunkt eine weitere: die Griffe heißen
   „<id>:v0" (Bohnenende, fest) und „<id>:v1" … (Kanalpunkte, ziehbar in
   der Wandebene des Elements). „+ Punkt" hängt einen an.

   Der Plan (js/vents/model.js) ist die Quelle; Körper (js/vents/geom.js),
   Kennzahlen und Prüfliste entstehen daraus bei jeder Änderung neu. Die
   Griffe im Viewport sind dieselben wie im Angussdesigner
   (js/handles.js). */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { $, fmt, facts, slider, numberInput } from '../ui/controls.js';
import { mountPartSource } from '../part/partsource.js';
import { writeSTL } from '../part/stlio.js';
import { createHandles, SELECTED_RING } from '../handles.js';
import * as M from './model.js';
import { buildByType, buildAll, volumeOf } from './geom.js';
import { setTris, download, safeName, dirText, outward, createAimUI } from '../ui/common.js';

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
/* Griff-Kennung zerlegen: „l3" ist das Element, „l3:v2" sein zweiter
   Kanalpunkt, „l3:v0" das Bohnenende. */
const splitId = id => {
  const m = /^(.+?):v(\d+)$/.exec(id || '');
  return m ? { base: m[1], k: +m[2] } : { base: id, k: null };
};
const VENT_POINT_COLOR = '#6f9bc9';

function handleItems() {
  const out = [];
  for (const it of M.allItems(state.plan)) {
    const color = M.TYPES[it.type].color;
    out.push({ id: it.id, pos: it.pos, color, dir: it.dir, planeSize: Math.max(24, (it.p.wellW || it.p.ventW || 12) * 2) });
    if (it.type !== 'entlueftet') continue;
    const vw = M.ventWorld(it);
    out.push({ id: it.id + ':v0', pos: vw.exit, color, planeSize: Math.max(24, it.p.ventW * 2) });
    vw.points.forEach((pos, i) => out.push({ id: it.id + ':v' + (i + 1), pos, color: VENT_POINT_COLOR, planeSize: Math.max(24, it.p.ventW * 2) }));
  }
  return out;
}

const handles = createHandles({
  view,
  getRefMesh: () => refMesh,
  markColor: M.TYPES.bohne.color,
  items: handleItems,
  /* Gezogen wird in der Tangentialebene der Wand: der Punkt rutscht auf
     ihr entlang. Mit Alt entlang der Normalen, von der Wand weg. Die
     Kanalpunkte liegen in derselben Ebene wie ihr Element. */
  plane: id => {
    const { base, k } = splitId(id);
    const it = state.plan.items[base];
    if (!it) return null;
    if (k === null) return { origin: it.pos, normal: it.dir };
    const vw = M.ventWorld(it);
    return { origin: k === 0 ? vw.exit : vw.points[k - 1], normal: it.dir };
  },
  move: (id, pos) => {
    const { base, k } = splitId(id);
    if (k === null) M.setPos(state.plan, base, pos);
    else if (k > 0) M.setVentPoint(state.plan, base, k, pos);
    /* k = 0, das Bohnenende, sitzt fest an der Bohne. */
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
const selPart = () => splitId(handles.selected);
const sel = () => (handles.selected ? state.plan.items[selPart().base] : null);

function syncSelection() {
  const it = sel();
  $('sel-block').classList.toggle('disabled', !it);
  $('pt-sel').className = 'pt-sel' + (it ? '' : ' empty');
  if (!it) {
    $('pt-sel').textContent = 'Kein Überlauf gewählt';
    $('sel-params').innerHTML = '';
    syncVent(null, null);
    facts('sel-facts', []);
    updateMenu();
    return;
  }
  const meta = M.TYPES[it.type];
  const part = selPart();
  const sub = part.k === null ? '' : part.k === 0 ? ' · Bohnenende' : ' · Kanalpunkt ' + part.k;
  $('pt-sel').innerHTML = '<span class="dot" style="background:' + meta.color + '"></span>'
    + meta.label + ' <code>' + it.id + '</code>' + sub;
  $('sel-type').value = it.type;
  /* Lage: das Element — oder, bei einem Kanalpunkt, der Punkt selbst. */
  const shown = part.k === null ? it.pos : part.k === 0 ? M.ventWorld(it).exit : M.ventWorld(it).points[part.k - 1];
  for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) $(k).value = fmt(shown[i], 1);
  syncVent(it, part);
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

/* Der Kanal: Punkte anhängen und entfernen — nur beim Überlauf mit Entlüftung. */
function syncVent(it, part) {
  const on = !!it && it.type === 'entlueftet';
  $('vent-block').classList.toggle('hidden', !on);
  if (!on) return;
  const pts = M.ventPoints(it);
  let len = 0;
  let prev = [0, 0];
  for (const q of pts) { len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  $('vent-note').textContent = pts.length + (pts.length === 1 ? ' Punkt' : ' Punkte') + ' · ' + fmt(len) + ' mm in der Wandebene'
    + (part && part.k > 0 ? ' · Punkt ' + part.k + ' gewählt' : '');
  $('vent-del').disabled = !(part && part.k > 0 && pts.length > 1);
}

function syncFacts(it) {
  const rows = [['Volumen', fmt(volumeOf(it) / 1000, 2) + ' cm³']];
  if (it.p.stegW) rows.push(['Stegquerschnitt', fmt(it.p.stegW * it.p.stegH) + ' mm²']);
  if (it.p.ventW) rows.push(['Kanalquerschnitt', fmt(it.p.ventW * it.p.ventH, 2) + ' mm²']);
  rows.push(['Achse', dirText(it.dir)]);
  facts('sel-facts', rows);
}


function updateMenu() {
  const it = sel();
  const part = selPart();
  const canDel = !!it && (part.k === null || (part.k > 0 && M.ventPoints(it).length > 1));
  $('del-item').disabled = !canDel;
  $('del-item').textContent = it && part.k !== null ? 'Punkt löschen' : 'Löschen';
}

$('sel-type').innerHTML = Object.entries(M.TYPES)
  .map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
$('sel-type').addEventListener('change', e => {
  const it = sel();
  if (!it) return;
  M.setType(state.plan, it.id, e.target.value);
  rebuild();
  handles.select(it.id);
});
for (const [id, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
  numberInput(id, v => {
    const it = sel();
    if (!it) return v;
    const part = selPart();
    if (part.k === 0) return v;                                // das Bohnenende sitzt fest
    const base = part.k === null ? it.pos : M.ventWorld(it).points[part.k - 1];
    const p = base.slice();
    p[axis] = v;
    if (part.k === null) M.setPos(state.plan, it.id, p);
    else M.setVentPoint(state.plan, it.id, part.k, p);        // in die Ebene gelotet
    rebuild();
    syncSelection();
    return v;
  });
}

$('vent-add').addEventListener('click', () => {
  const it = sel();
  if (!it || it.type !== 'entlueftet') return;
  const n = M.addVentPoint(state.plan, it.id);
  rebuild();
  handles.select(it.id + ':v' + n);
});
$('vent-del').addEventListener('click', () => {
  const it = sel();
  const part = selPart();
  if (!it || !(part.k > 0)) return;
  if (!M.removeVentPoint(state.plan, it.id, part.k)) return;
  rebuild();
  handles.select(it.id + ':v' + Math.min(part.k, M.ventPoints(it).length));
});
slider('sel-rot', v => {
  const it = sel();
  if (!it) return;
  M.setRot(state.plan, it.id, v);
  rebuild();
  syncFacts(it);
}, v => fmt(v, 0) + '°');

$('del-item').addEventListener('click', removeSelected);
/* Löschen trifft, was gewählt ist: einen Kanalpunkt (solange einer
   bleibt — der letzte und das Bohnenende sind nicht zu entfernen), oder
   das ganze Element, wenn das Element selbst gewählt ist. */
function removeSelected() {
  const it = sel();
  if (!it) return;
  const part = selPart();
  if (part.k !== null) {
    if (!(part.k > 0) || !M.removeVentPoint(state.plan, it.id, part.k)) return;
    rebuild();
    handles.select(it.id + ':v' + Math.min(part.k, M.ventPoints(it).length));
    return;
  }
  M.removeItem(state.plan, it.id);
  handles.select(null);
  rebuild();
}

/* ── Zielmodus: setzen und neu setzen ────────────────────────── */
const aim = createAimUI();
function cancelAim() {
  handles.cancelAim();
  aim.hide();
}
/* Der Strahl liefert die nach INNEN gerichtete Normale; das Element
   wächst nach außen. */


/** Ein neuer Überlauf der Art `type`: der nächste Klick aufs Bauteil setzt sie. */
function startPlace(type) {
  if (!M.TYPES[type]) return;
  if (!refMesh.visible) { aim.note('Zuerst ein Bauteil laden — dann setzt der Klick den Überlauf dorthin.'); return; }
  handles.select(null);
  aim.show(true, M.TYPES[type].label + ': die Stelle am Bauteil anklicken, wo sie sitzen soll. Ziehen dreht die Ansicht, Esc bricht ab.');
  aim.onCancel = cancelAim;
  handles.armAim({
    onHit: hit => {
      aim.hide();
      const it = M.addItem(state.plan, type, hit.point, outward(hit.dir));
      rebuild();
      handles.select(it.id);
    },
    onMiss: () => aim.miss(null, () => handles.aiming)
  });
}

/** Der Klick auf den Pfeil: ein vorhandenes Element an eine andere Stelle. */
function startMove(id) {
  const it = state.plan.items[id];
  if (!it) return;
  if (!refMesh.visible) { aim.note('Zuerst ein Bauteil laden — dann setzt der Klick den Überlauf dorthin.'); return; }
  aim.show(true, M.TYPES[it.type].label + ' ' + id + ': die neue Stelle am Bauteil anklicken. Esc bricht ab.');
  aim.onCancel = cancelAim;
  handles.armAim({
    onHit: hit => {
      aim.hide();
      M.placeAt(state.plan, id, hit.point, outward(hit.dir));
      rebuild();
      syncSelection();
    },
    onMiss: () => aim.miss(null, () => handles.aiming)
  });
}

for (const type of Object.keys(M.TYPES)) $('add-' + type).addEventListener('click', () => startPlace(type));
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
const fileName = () => safeName((state.name || 'ueberlaeufe') + '-ueberlaeufe');

$('stl-save').addEventListener('click', () => {
  const tris = buildAll(state.plan);
  if (!tris.length) return;
  download(new Blob([writeSTL(tris, 'DieLogic Überläufe')], { type: 'model/stl' }), fileName() + '.stl');
});
$('json-save').addEventListener('click', () => {
  download(new Blob([JSON.stringify(M.toJSON(state.plan), null, 1)], { type: 'application/json' }), fileName() + '.json');
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
  + '<div class="lg-row"><span class="dot" style="background:' + VENT_POINT_COLOR + '"></span>Kanalpunkt (in der Wandebene)</div>'
  + '<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>';

rebuild();
syncSelection();
source.start().then(() => { state.ready = true; });

export const __viewer = { state, view, handles, rebuild, startPlace, startMove, loadPlan, refMesh, group, source };
window.__ueberlauf = __viewer;
