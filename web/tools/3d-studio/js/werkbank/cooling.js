/* Schritt 5 — Temperierung: Kühlstiche und Kanäle auf der Abstandsfläche.

   Die Portierung des Temperierkanal-Designers (js/cooling/app.js). Die
   Abstandsfläche kommt aus dem gemeinsamen Abstandsfeld der Werkbank —
   sie braucht ein Band, das über den gewählten Abstand hinausreicht;
   wächst der Abstand darüber, rechnet die Werkbank das Feld breiter. */

import * as T from 'three';
import { $, fmt, facts, segButtons, slider, numberInput } from '../ui/controls.js';
import { sampleField } from '../part/field.js';
import { surfaceNets } from '../part/surfacenets.js';
import { writeSTL } from '../part/stlio.js';
import { createHandles, SELECTED_RING } from '../handles.js';
import * as M from '../cooling/model.js';
import { buildByType, buildAll, volumeOf, wallClearance } from '../cooling/geom.js';
import { planCooling } from '../cooling/auto.js';
import { setTris, download, safeName, dirText } from '../ui/common.js';

const SUBTITLE = 'Temperierung: Kühlstiche und Kanäle auf der Abstandsfläche zur Kavität — die Enden frei bewegen, der Wandabstand aus dem Feld.';
const STATUS = '<b>Setzen</b>: Art wählen, dann auf die Abstandsfläche klicken &nbsp;·&nbsp; <b>Punkt</b> ziehen: in der Bildebene &nbsp;·&nbsp; '
  + '<b>Achsenpfeil</b>: je Achse &nbsp;·&nbsp; <b>Pfeil</b> am Kühlstich: neu setzen &nbsp;·&nbsp; <b>Leer</b>: drehen &nbsp;·&nbsp; <b>rechts</b>: verschieben &nbsp;·&nbsp; <b>Rad</b>: zoomen';
const SHELL_OPACITY = 0.22;

export function createCoolingStage(ctx) {
  const { view } = ctx;
  const state = {
    plan: M.emptyPlan(), field: null, shellDist: null, shellField: null,
    dirMode: 'normal', both: false, showShell: true, shellClear: true,
    defaults: { d: 8, len: 60, kd: 10 },
    auto: { count: 8, spacing: 25, replace: true, stats: null },
    pending: null, computing: false, active: false
  };

  /* ── Szene ────────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);
  const shellMat = new T.MeshStandardMaterial({
    color: 0x3fc2b6, roughness: 0.6, metalness: 0.02, transparent: true, opacity: SHELL_OPACITY,
    depthWrite: false, side: T.DoubleSide, flatShading: true
  });
  function shellClear(on) {
    shellMat.transparent = on;
    shellMat.opacity = on ? SHELL_OPACITY : 1;
    shellMat.depthWrite = !on;
    shellMat.needsUpdate = true;
  }
  const shellMesh = new T.Mesh(new T.BufferGeometry(), shellMat);
  shellMesh.visible = false;
  group.add(shellMesh);
  const meshes = {};
  for (const [type, meta] of Object.entries(M.TYPES)) {
    meshes[type] = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({
      color: meta.color, roughness: 0.5, metalness: 0.1, side: T.DoubleSide
    }));
    meshes[type].visible = false;
    group.add(meshes[type]);
  }

  /* ── Griffe ───────────────────────────────────────────────── */
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
  handles.setEnabled(false);
  handles.group.visible = false;

  /* ── Kette: Plan → Anzeige ────────────────────────────────── */
  function rebuild(mode) {
    const by = buildByType(state.plan);
    for (const type of Object.keys(meshes)) setTris(meshes[type], by[type] || [], true);
    handles.refresh();
    if (mode === 'drag') { view.invalidate(); return; }
    updateFacts();
    updateMenu();
    ctx.markDone('temperier', M.allItems(state.plan).length > 0);
    view.invalidate();
    ctx.emit('cooling', state);
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
    facts('te-plan-facts', [
      ['Kühlstiche', fmt(items.filter(i => i.type === 'stich').length, 0)],
      ['Kanäle', fmt(items.filter(i => i.type === 'kanal').length, 0)],
      ['Gesamtlänge', fmt(length, 0) + ' mm'],
      ['kleinster Wandabstand', Number.isFinite(minClear) ? fmt(minClear) + ' mm' : '—']
    ]);
  }

  /* ── Abstandsfläche ───────────────────────────────────────── */
  async function computeShell() {
    if (!ctx.part.model || state.computing) return;
    const dist = state.plan.dist;
    state.computing = true;
    ctx.setBusyStage('temperier', true);
    try {
      const field = await ctx.field.ensure({ band: dist * 1.3 + 5 });
      if (!field) return;
      state.field = field;
      if (state.shellField !== field || state.shellDist !== dist) {
        const tris = surfaceNets(field, dist);
        setTris(shellMesh, tris, true);
        state.shellDist = dist;
        state.shellField = field;
        $('te-shell-note').textContent = 'Fläche im Abstand ' + fmt(dist) + ' mm · ' + fmt(tris.length / 9, 0)
          + ' Dreiecke · Zellkante ' + fmt(field.h) + ' mm';
      }
    } catch (err) {
      $('te-shell-note').textContent = 'Die Abstandsfläche konnte nicht gerechnet werden: ' + err.message;
      console.error(err);
    } finally {
      state.computing = false;
      ctx.setBusyStage('temperier', false);
    }
    applyVisibility();
    rebuild();
    syncSelection();
  }

  function applyVisibility() {
    shellMesh.visible = state.active && state.showShell && !!shellMesh.geometry.attributes.position
      && shellMesh.geometry.attributes.position.count > 0;
    view.invalidate();
  }

  /* ── Auswahl ──────────────────────────────────────────────── */
  const sel = () => {
    if (!handles.selected) return null;
    const [id, end] = splitId(handles.selected);
    const it = state.plan.items[id];
    return it ? { it, end } : null;
  };

  function syncSelection() {
    const s = sel();
    $('te-sel-block').classList.toggle('disabled', !s);
    $('te-pt-sel').className = 'pt-sel' + (s ? '' : ' empty');
    if (!s) {
      $('te-pt-sel').textContent = 'Kein Element gewählt';
      facts('te-sel-facts', []);
      updateMenu();
      return;
    }
    const { it, end } = s;
    const meta = M.TYPES[it.type];
    $('te-pt-sel').innerHTML = '<span class="dot" style="background:' + meta.color + '"></span>' + meta.label + ' <code>' + it.id + '</code>'
      + (it.type === 'kanal' ? ' <em>Ende ' + end.toUpperCase() + '</em>' : '') + (it.auto ? ' <em>automatisch</em>' : '');
    $('te-sel-d').value = fmt(it.d, 2);
    $('te-sel-len-row').classList.toggle('hidden', it.type !== 'stich');
    $('te-sel-dir-row').classList.toggle('hidden', it.type !== 'stich');
    $('te-sel-both-row').classList.toggle('hidden', it.type !== 'kanal');
    if (it.type === 'stich') {
      $('te-sel-len').value = fmt(it.len, 2);
      $('te-sel-dir').textContent = dirText(it.dir);
    }
    const pos = it.type === 'stich' ? it.p : it[end];
    for (const [k, i] of [['te-sel-x', 0], ['te-sel-y', 1], ['te-sel-z', 2]]) $(k).value = fmt(pos[i], 1);
    $('te-sel-both').checked = state.both;
    const c = clearanceOf(it);
    const rows = [['Länge', fmt(M.lengthOf(it), 1) + ' mm'], ['Volumen', fmt(volumeOf(it) / 1000, 2) + ' cm³']];
    if (c !== null) rows.push(['Wandabstand', (c < state.plan.dist - state.field.h ? '⚠ ' : '') + fmt(c) + ' mm']);
    facts('te-sel-facts', rows);
    updateMenu();
  }

  function updateMenu() {
    $('te-del-item').disabled = !sel();
    const has = !!state.shellDist;
    $('te-add-stich').disabled = !has;
    $('te-add-kanal').disabled = !has;
  }

  numberInput('te-sel-d', v => {
    const s = sel();
    if (!s) return v;
    s.it.d = Math.max(M.PARAM_META.d.min, Math.min(M.PARAM_META.d.max, v));
    rebuild(); syncSelection();
    return s.it.d;
  });
  numberInput('te-sel-len', v => {
    const s = sel();
    if (!s || s.it.type !== 'stich') return v;
    s.it.len = Math.max(M.PARAM_META.len.min, Math.min(M.PARAM_META.len.max, v));
    rebuild(); syncSelection();
    return s.it.len;
  });
  for (const [id, axis] of [['te-sel-x', 0], ['te-sel-y', 1], ['te-sel-z', 2]]) {
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
  $('te-sel-both').addEventListener('change', e => { state.both = e.target.checked; });
  $('te-del-item').addEventListener('click', removeSelected);
  function removeSelected() {
    const s = sel();
    if (!s) return;
    M.removeItem(state.plan, s.it.id);
    handles.select(null);
    rebuild();
  }

  /* ── Zielmodus ────────────────────────────────────────────── */
  function cancelAim() {
    handles.cancelAim();
    state.pending = null;
    ctx.aim.hide();
  }
  const stillAiming = () => handles.aiming;
  const MISS = 'Daneben — die Stelle muss auf der Abstandsfläche liegen.';
  const toCamera = point => {
    const c = view.camera.position;
    return [c.x - point[0], c.y - point[1], c.z - point[2]];
  };
  const dirAt = hit => M.directionFor(state.dirMode, [-hit.dir[0], -hit.dir[1], -hit.dir[2]], toCamera(hit.point));
  function noShell() {
    ctx.aim.note(ctx.part.model ? 'Die Abstandsfläche wird noch gerechnet — gleich noch einmal.' : 'Zuerst ein Bauteil laden (Schritt 1) — die Abstandsfläche entsteht daraus.');
  }
  function startPlace(type) {
    if (!state.shellDist) { noShell(); return; }
    handles.select(null);
    state.pending = null;
    ctx.aim.onCancel = cancelAim;
    if (type === 'stich') {
      ctx.aim.show(true, 'Kühlstich: die Stelle auf der Abstandsfläche anklicken — dort sitzt die Spitze, der Stich läuft '
        + M.DIRECTIONS[state.dirMode].hint + '. Esc bricht ab.');
      handles.armAim({
        onHit: hit => {
          ctx.aim.hide();
          const it = M.addStich(state.plan, hit.point, dirAt(hit), { d: state.defaults.d, len: state.defaults.len });
          rebuild();
          handles.select(it.id);
        },
        onMiss: () => ctx.aim.miss(MISS, stillAiming)
      });
      return;
    }
    ctx.aim.show(true, 'Kanal: das erste Ende auf der Abstandsfläche anklicken. Esc bricht ab.');
    handles.armAim({
      onHit: hit => {
        state.pending = hit.point.slice();
        ctx.aim.show(true, 'Kanal: jetzt das andere Ende anklicken. Esc bricht ab.');
        handles.armAim({
          onHit: hit2 => {
            ctx.aim.hide();
            const it = M.addKanal(state.plan, state.pending, hit2.point, { d: state.defaults.kd });
            state.pending = null;
            rebuild();
            handles.select(it.id + ':b');
          },
          onMiss: () => ctx.aim.miss(MISS, stillAiming)
        });
      },
      onMiss: () => ctx.aim.miss(MISS, stillAiming)
    });
  }
  function startMove(id) {
    const it = state.plan.items[splitId(id)[0]];
    if (!it || it.type !== 'stich') return;
    if (!state.shellDist) { noShell(); return; }
    ctx.aim.show(true, 'Kühlstich ' + it.id + ': die neue Stelle auf der Abstandsfläche anklicken. Esc bricht ab.');
    ctx.aim.onCancel = cancelAim;
    handles.armAim({
      onHit: hit => {
        ctx.aim.hide();
        M.placeStich(state.plan, it.id, hit.point, dirAt(hit));
        rebuild();
        syncSelection();
      },
      onMiss: () => ctx.aim.miss(MISS, stillAiming)
    });
  }
  $('te-add-stich').addEventListener('click', () => startPlace('stich'));
  $('te-add-kanal').addEventListener('click', () => startPlace('kanal'));

  /* ── Automatik ────────────────────────────────────────────── */
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
    facts('te-auto-facts', [
      ['gesetzt', fmt(plan.sites.length, 0) + ' Kühlstiche'],
      ['mittlerer Abstand', fmt(plan.stats.mean) + ' mm'],
      ['größter Abstand', fmt(plan.stats.max) + ' mm']
    ]);
    $('te-auto-note').textContent = plan.sites.length < state.auto.count
      ? 'Nur ' + plan.sites.length + ' Stellen halten den Mindestabstand — Abstand kleiner wählen oder weniger Bohrungen.'
      : '';
  }
  $('te-auto-run').addEventListener('click', runAuto);
  slider('te-auto-count', v => { state.auto.count = v; }, v => v + '');
  slider('te-auto-spacing', v => { state.auto.spacing = v; }, v => v + ' mm');
  $('te-auto-replace').addEventListener('change', e => { state.auto.replace = e.target.checked; });
  document.addEventListener('keydown', e => {
    if (!state.active) return;
    if (e.key === 'Escape') { cancelAim(); return; }
    const tag = (e.target && e.target.tagName) || '';
    if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') removeSelected();
  });

  /* ── Seitenleiste ─────────────────────────────────────────── */
  segButtons('te-dir-seg', v => { if (M.DIRECTIONS[v]) state.dirMode = v; });
  numberInput('te-def-d', v => { state.defaults.d = Math.max(2, Math.min(60, v)); return state.defaults.d; });
  numberInput('te-def-len', v => { state.defaults.len = Math.max(5, Math.min(1000, v)); return state.defaults.len; });
  numberInput('te-def-kd', v => { state.defaults.kd = Math.max(2, Math.min(60, v)); return state.defaults.kd; });
  let distTimer = 0;
  slider('te-dist', v => {
    state.plan.dist = v;
    clearTimeout(distTimer);
    if (state.active) distTimer = setTimeout(computeShell, 250);
  }, v => v + ' mm');
  $('te-shell-on').addEventListener('change', e => { state.showShell = e.target.checked; applyVisibility(); });
  $('te-shell-clear').addEventListener('change', e => { state.shellClear = e.target.checked; shellClear(state.shellClear); view.invalidate(); });
  slider('te-ref-opacity', v => { if (state.active) ctx.part.applyOpacity(v / 100); }, v => v + ' %');

  /* ── Dateien ──────────────────────────────────────────────── */
  const fileName = () => safeName(ctx.part.name) + '-temperierung';
  $('te-stl-save').addEventListener('click', () => {
    const tris = buildAll(state.plan);
    if (!tris.length) return;
    download(new Blob([writeSTL(tris, 'DieLogic Temperierung')], { type: 'model/stl' }), fileName() + '.stl');
  });
  $('te-json-save').addEventListener('click', () => {
    download(new Blob([JSON.stringify(M.toJSON(state.plan), null, 1)], { type: 'application/json' }), fileName() + '.json');
  });
  $('te-json-btn').addEventListener('click', () => $('te-json-input').click());
  $('te-json-input').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) ctx.readAny(f);
    e.target.value = '';
  });
  function loadPlan(plan) {
    state.plan = plan;
    $('te-dist').value = String(plan.dist);
    $('te-dist-val').textContent = plan.dist + ' mm';
    handles.select(null);
    rebuild();
    if (state.active && ctx.part.model) computeShell();
  }

  /* ── Ereignisse ───────────────────────────────────────────── */
  ctx.on('part', () => {
    state.field = null; state.shellDist = null; state.shellField = null;
    setTris(shellMesh, []);
    $('te-shell-note').textContent = 'Noch keine Fläche — sie entsteht aus dem Abstandsfeld des Bauteils.';
    loadPlan(M.emptyPlan());
  });
  ctx.on('field', () => { if (state.active) computeShell(); });

  return {
    id: 'temperier', state, group, handles,
    enter() {
      state.active = true;
      ctx.subtitle(SUBTITLE);
      ctx.statusHTML(STATUS);
      $('pt-legend').innerHTML = '<div class="pt-menu-title">Arten</div>'
        + Object.values(M.TYPES).map(t => '<div class="lg-row"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div>').join('')
        + '<div class="lg-row"><span class="dot" style="background:#3fc2b6;opacity:.5"></span>Abstandsfläche</div>'
        + '<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>';
      $('te-menu').classList.remove('wb-off');
      handles.setEnabled(true);
      handles.group.visible = true;
      handles.refresh();
      ctx.part.applyOpacity(+$('te-ref-opacity').value / 100);
      applyVisibility();
      syncSelection();
      if (ctx.part.model) computeShell();
    },
    leave() {
      state.active = false;
      cancelAim();
      $('te-menu').classList.add('wb-off');
      handles.setEnabled(false);
      handles.group.visible = false;
      shellMesh.visible = false;
      ctx.part.applyOpacity(ctx.part.opacity);
      view.invalidate();
    },
    rebuild, startPlace, startMove, computeShell, loadPlan, runAuto,
    toJSON: () => M.toJSON(state.plan),
    fromJSON: obj => loadPlan(M.fromJSON(obj)),
    shellMesh, meshes
  };
}
