/* Schritt 4 — Überläufe: Überläufe und Entlüftungen am Bauteil.

   Die Portierung des Überlaufdesigners (js/vents/app.js): Art wählen,
   aufs Bauteil klicken, am Punkt ziehen, am Pfeil neu setzen, im
   Auswahlfeld drehen und bemaßen. Der Plan (js/vents/model.js) ist die
   Quelle, die Körper (js/vents/geom.js) entstehen daraus.

   Was die Werkbank dazulegt: die zuletzt gefüllten Stellen aus
   Schritt 3 bleiben als Marken stehen — dort gehören die Überläufe hin —,
   und die Summe der Überlaufvolumen geht als Gussvolumen in den Anguss
   und als Überlaufgewicht in die Auslegung. */

import * as T from 'three';
import { $, fmt, facts, slider, numberInput } from '../ui/controls.js';
import { writeSTL } from '../part/stlio.js';
import { createHandles, SELECTED_RING } from '../handles.js';
import * as M from '../vents/model.js';
import { buildByType, buildAll, volumeOf } from '../vents/geom.js';
import { setTris, download, safeName, dirText, outward } from '../ui/common.js';

const SUBTITLE = 'Überläufe: vier Arten aufs Bauteil setzen, dort, wo die Füllung zuletzt ankommt; ihr Volumen gehört zum Schussgewicht.';
const STATUS = '<b>Art</b> wählen, dann aufs Bauteil klicken &nbsp;·&nbsp; <b>Punkt</b> ziehen: auf der Wand &nbsp;·&nbsp; '
  + '<b>Alt</b>: von der Wand weg &nbsp;·&nbsp; <b>Pfeil</b>: neu setzen &nbsp;·&nbsp; <b>Leer</b>: drehen &nbsp;·&nbsp; <b>rechts</b>: verschieben &nbsp;·&nbsp; <b>Rad</b>: zoomen';
const VENT_POINT_COLOR = '#6f9bc9';

export function createVentStage(ctx) {
  const { view } = ctx;
  const state = { plan: M.emptyPlan(), active: false, showSpots: true };

  /* ── Szene ────────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);
  const meshes = {};
  for (const [type, meta] of Object.entries(M.TYPES)) {
    const mat = new T.MeshStandardMaterial({
      color: meta.color, roughness: 0.55, metalness: 0.04, side: T.DoubleSide, flatShading: true
    });
    meshes[type] = new T.Mesh(new T.BufferGeometry(), mat);
    meshes[type].visible = false;
    group.add(meshes[type]);
  }
  const spotGroup = new T.Group();
  spotGroup.renderOrder = 5;
  spotGroup.visible = false;
  group.add(spotGroup);

  /* ── Griffe ───────────────────────────────────────────────── */
  const splitId = id => {
    const m = /^(.+?):v(\d+)$/.exec(id || '');
    return m ? { base: m[1], k: +m[2] } : { base: id, k: null };
  };
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
    getRefMesh: () => ctx.part.mesh,
    markColor: M.TYPES.bohne.color,
    items: handleItems,
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
    },
    onSelect: () => { cancelAim(); syncSelection(); },
    onChange: what => {
      if (what === 'drag') { rebuild('drag'); return; }
      rebuild();
      if (what === 'drop') syncSelection();
    },
    onAim: id => startMove(id)
  });
  handles.setEnabled(false);
  handles.group.visible = false;

  /* ── Kette: Plan → Anzeige ────────────────────────────────── */
  function rebuild(mode) {
    const by = buildByType(state.plan);
    for (const type of Object.keys(meshes)) setTris(meshes[type], by[type] || []);
    handles.refresh();
    if (mode === 'drag') { view.invalidate(); return; }
    updateFacts();
    updateMenu();
    ctx.markDone('ueberlauf', M.allItems(state.plan).length > 0);
    view.invalidate();
    ctx.emit('vents', state);
  }

  function volume() {
    let v = 0;
    for (const it of M.allItems(state.plan)) v += volumeOf(it);
    return v;
  }

  function updateFacts() {
    const items = M.allItems(state.plan);
    const added = volume();
    const part = ctx.part.model ? Math.abs(ctx.part.model.volume) : 0;
    facts('ue-plan-facts', [
      ['Elemente', fmt(items.length, 0)],
      ['Bauteil', fmt(part / 1000) + ' cm³'],
      ['Überläufe', fmt(added / 1000) + ' cm³'],
      ['Gesamt', fmt((part + added) / 1000) + ' cm³']
    ]);
  }

  /* ── Auswahl ──────────────────────────────────────────────── */
  const selPart = () => splitId(handles.selected);
  const sel = () => (handles.selected ? state.plan.items[selPart().base] : null);

  function syncSelection() {
    const it = sel();
    $('ue-sel-block').classList.toggle('disabled', !it);
    $('ue-pt-sel').className = 'pt-sel' + (it ? '' : ' empty');
    if (!it) {
      $('ue-pt-sel').textContent = 'Kein Überlauf gewählt';
      $('ue-sel-params').innerHTML = '';
      syncVent(null, null);
      facts('ue-sel-facts', []);
      updateMenu();
      return;
    }
    const meta = M.TYPES[it.type];
    const part = selPart();
    const sub = part.k === null ? '' : part.k === 0 ? ' · Bohnenende' : ' · Kanalpunkt ' + part.k;
    $('ue-pt-sel').innerHTML = '<span class="dot" style="background:' + meta.color + '"></span>' + meta.label + ' <code>' + it.id + '</code>' + sub;
    $('ue-sel-type').value = it.type;
    const shown = part.k === null ? it.pos : part.k === 0 ? M.ventWorld(it).exit : M.ventWorld(it).points[part.k - 1];
    for (const [k, i] of [['ue-sel-x', 0], ['ue-sel-y', 1], ['ue-sel-z', 2]]) $(k).value = fmt(shown[i], 1);
    syncVent(it, part);
    $('ue-sel-rot').value = String(it.rot || 0);
    $('ue-sel-rot-val').textContent = fmt(it.rot || 0, 0) + '°';
    const keys = Object.keys(it.p);
    $('ue-sel-params').innerHTML = keys.map(k => {
      const m = M.PARAM_META[k] || { label: k };
      return '<div class="row"><span>' + m.label + '</span>'
        + '<input type="text" id="ue-p-' + k + '" inputmode="decimal" spellcheck="false" value="' + fmt(it.p[k], 2) + '">'
        + '<span class="val">' + (m.unit === undefined ? 'mm' : m.unit) + '</span></div>';
    }).join('');
    for (const k of keys) {
      const m = M.PARAM_META[k] || { min: 0, max: 1e6 };
      const el = $('ue-sel-params').querySelector('#ue-p-' + k);
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

  function syncVent(it, part) {
    const on = !!it && it.type === 'entlueftet';
    $('ue-vent-block').classList.toggle('hidden', !on);
    if (!on) return;
    const pts = M.ventPoints(it);
    let len = 0, prev = [0, 0];
    for (const q of pts) { len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
    $('ue-vent-note').textContent = pts.length + (pts.length === 1 ? ' Punkt' : ' Punkte') + ' · ' + fmt(len) + ' mm in der Wandebene'
      + (part && part.k > 0 ? ' · Punkt ' + part.k + ' gewählt' : '');
    $('ue-vent-del').disabled = !(part && part.k > 0 && pts.length > 1);
  }

  function syncFacts(it) {
    const rows = [['Volumen', fmt(volumeOf(it) / 1000, 2) + ' cm³']];
    if (it.p.stegW) rows.push(['Stegquerschnitt', fmt(it.p.stegW * it.p.stegH) + ' mm²']);
    if (it.p.ventW) rows.push(['Kanalquerschnitt', fmt(it.p.ventW * it.p.ventH, 2) + ' mm²']);
    rows.push(['Achse', dirText(it.dir)]);
    facts('ue-sel-facts', rows);
  }

  function updateMenu() {
    const it = sel();
    const part = selPart();
    const canDel = !!it && (part.k === null || (part.k > 0 && M.ventPoints(it).length > 1));
    $('ue-del-item').disabled = !canDel;
    $('ue-del-item').textContent = it && part.k !== null ? 'Punkt löschen' : 'Löschen';
  }

  $('ue-sel-type').innerHTML = Object.entries(M.TYPES)
    .map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
  $('ue-sel-type').addEventListener('change', e => {
    const it = sel();
    if (!it) return;
    M.setType(state.plan, it.id, e.target.value);
    rebuild();
    handles.select(it.id);
  });
  for (const [id, axis] of [['ue-sel-x', 0], ['ue-sel-y', 1], ['ue-sel-z', 2]]) {
    numberInput(id, v => {
      const it = sel();
      if (!it) return v;
      const part = selPart();
      if (part.k === 0) return v;
      const base = part.k === null ? it.pos : M.ventWorld(it).points[part.k - 1];
      const p = base.slice();
      p[axis] = v;
      if (part.k === null) M.setPos(state.plan, it.id, p);
      else M.setVentPoint(state.plan, it.id, part.k, p);
      rebuild();
      syncSelection();
      return v;
    });
  }
  $('ue-vent-add').addEventListener('click', () => {
    const it = sel();
    if (!it || it.type !== 'entlueftet') return;
    const n = M.addVentPoint(state.plan, it.id);
    rebuild();
    handles.select(it.id + ':v' + n);
  });
  $('ue-vent-del').addEventListener('click', () => {
    const it = sel();
    const part = selPart();
    if (!it || !(part.k > 0)) return;
    if (!M.removeVentPoint(state.plan, it.id, part.k)) return;
    rebuild();
    handles.select(it.id + ':v' + Math.min(part.k, M.ventPoints(it).length));
  });
  slider('ue-sel-rot', v => {
    const it = sel();
    if (!it) return;
    M.setRot(state.plan, it.id, v);
    rebuild();
    syncFacts(it);
  }, v => fmt(v, 0) + '°');

  $('ue-del-item').addEventListener('click', removeSelected);
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

  /* ── Zielmodus: setzen und neu setzen ─────────────────────── */
  function cancelAim() {
    handles.cancelAim();
    ctx.aim.hide();
  }
  const stillAiming = () => handles.aiming;
  function startPlace(type) {
    if (!M.TYPES[type]) return;
    if (!ctx.part.model) { ctx.aim.note('Zuerst ein Bauteil laden (Schritt 1). Dann setzt der Klick den Überlauf dorthin.'); return; }
    handles.select(null);
    ctx.aim.show(true, M.TYPES[type].label + ': die Stelle am Bauteil anklicken, wo sie sitzen soll. Ziehen dreht die Ansicht, Esc bricht ab.');
    ctx.aim.onCancel = cancelAim;
    handles.armAim({
      onHit: hit => {
        ctx.aim.hide();
        const it = M.addItem(state.plan, type, hit.point, outward(hit.dir));
        rebuild();
        handles.select(it.id);
      },
      onMiss: () => ctx.aim.miss(null, stillAiming)
    });
  }
  function startMove(id) {
    const it = state.plan.items[id];
    if (!it) return;
    if (!ctx.part.model) { ctx.aim.note('Zuerst ein Bauteil laden (Schritt 1).'); return; }
    ctx.aim.show(true, M.TYPES[it.type].label + ' ' + id + ': die neue Stelle am Bauteil anklicken. Esc bricht ab.');
    ctx.aim.onCancel = cancelAim;
    handles.armAim({
      onHit: hit => {
        ctx.aim.hide();
        M.placeAt(state.plan, id, hit.point, outward(hit.dir));
        rebuild();
        syncSelection();
      },
      onMiss: () => ctx.aim.miss(null, stillAiming)
    });
  }
  for (const type of Object.keys(M.TYPES)) $('ue-add-' + type).addEventListener('click', () => startPlace(type));
  document.addEventListener('keydown', e => {
    if (!state.active) return;
    if (e.key === 'Escape') { cancelAim(); return; }
    const tag = (e.target && e.target.tagName) || '';
    if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') removeSelected();
  });

  /* ── Die letzten Stellen der Füllung ──────────────────────── */
  function updateSpots() {
    spotGroup.clear();
    const fill = ctx.stages.fuellung;
    const list = fill ? fill.spots() : [];
    for (const m of list) spotGroup.add(fill.spotMesh(m));
    spotGroup.visible = state.active && state.showSpots && list.length > 0;
    $('ue-spots-note').textContent = state.showSpots && !list.length ? 'Noch keine Füllung gerechnet (Schritt 3). Danach stehen die zuletzt gefüllten Stellen hier als Marken.' : '';
    view.invalidate();
  }
  $('ue-show-spots').addEventListener('change', e => { state.showSpots = e.target.checked; updateSpots(); });
  slider('ue-ref-opacity', v => { if (state.active) ctx.part.applyOpacity(v / 100); }, v => v + ' %');

  /* ── Dateien ──────────────────────────────────────────────── */
  const fileName = () => safeName(ctx.part.name) + '-ueberlaeufe';
  $('ue-stl-save').addEventListener('click', () => {
    const tris = buildAll(state.plan);
    if (!tris.length) return;
    download(new Blob([writeSTL(tris, 'DieLogic Überläufe')], { type: 'model/stl' }), fileName() + '.stl');
  });
  $('ue-json-save').addEventListener('click', () => {
    download(new Blob([JSON.stringify(M.toJSON(state.plan), null, 1)], { type: 'application/json' }), fileName() + '.json');
  });
  $('ue-json-btn').addEventListener('click', () => $('ue-json-input').click());
  $('ue-json-input').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) ctx.readAny(f);
    e.target.value = '';
  });
  function loadPlan(plan) {
    state.plan = plan;
    handles.select(null);
    rebuild();
    syncSelection();
  }

  /* ── Ereignisse ───────────────────────────────────────────── */
  ctx.on('part', () => { loadPlan(M.emptyPlan()); });
  ctx.on('fill', () => { if (state.active) updateSpots(); });

  return {
    id: 'ueberlauf', state, group, handles,
    enter() {
      state.active = true;
      ctx.subtitle(SUBTITLE);
      ctx.statusHTML(STATUS);
      $('pt-legend').innerHTML = '<div class="pt-menu-title">Arten</div>'
        + Object.values(M.TYPES).map(t => '<div class="lg-row"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div>').join('')
        + '<div class="lg-row"><span class="dot" style="background:' + VENT_POINT_COLOR + '"></span>Kanalpunkt (in der Wandebene)</div>'
        + '<div class="lg-row"><span class="dot" style="background:#b42318"></span>zuletzt gefüllt (Schritt 3)</div>'
        + '<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>';
      $('ue-menu').classList.remove('wb-off');
      handles.setEnabled(true);
      handles.group.visible = true;
      handles.refresh();
      ctx.part.applyOpacity(+$('ue-ref-opacity').value / 100);
      updateFacts();
      updateSpots();
      syncSelection();
    },
    leave() {
      state.active = false;
      cancelAim();
      $('ue-menu').classList.add('wb-off');
      handles.setEnabled(false);
      handles.group.visible = false;
      spotGroup.visible = false;
      ctx.part.applyOpacity(ctx.part.opacity);
      view.invalidate();
    },
    rebuild, startPlace, startMove, loadPlan, volume,
    toJSON: () => M.toJSON(state.plan),
    fromJSON: obj => loadPlan(M.fromJSON(obj)),
    tris: () => buildAll(state.plan),
    meshes
  };
}
