/* Schritt 3 — Füllung: die Front von den Anschnitten des Angusses.

   Die Füllabschätzung (js/fill/app.js, js/fill/solve.js) mit einem
   Unterschied: die Anschnitte setzt hier niemand von Hand. Sie SIND die
   Mündungen des Angusssystems aus Schritt 2 — Ort und Richtung der
   Mündung, Breite und Höhe des Anschnitts, der Anteil am Strom aus der
   Strömungsrechnung. Ändert sich der Anguss, rechnet die Füllung nach.
   Das Raster ist das gemeinsame Abstandsfeld der Werkbank.

   Heraus kommen Füllgrad je Stelle, der Füllkörper bei jedem Füllgrad
   und die zuletzt gefüllten Stellen — die bleiben als Marken im nächsten
   Schritt stehen, wo die Überläufe gesetzt werden. */

import * as T from 'three';
import { $, fmt, facts, segButtons, slider, colorbar, gradient, rgbCss } from '../ui/controls.js';
import { surfaceNets } from '../part/surfacenets.js';
import { writeSTL } from '../part/stlio.js';
import { turbo } from '../part/colors.js';
import * as M from '../fill/model.js';
import { buildAll } from '../fill/geom.js';
import { solveFill, fracToSurface, sampleFrac, fillBodyField, lastSpots } from '../fill/solve.js';
import { cross, dot, norm, addScaled } from '../runner/vec.js';
import { setTris, download, safeName } from './common.js';

const SUBTITLE = 'Füllung: die Schmelzefront läuft von den Anschnitten des Angusses durch das gerasterte Bauteil — Füllgrad, Füllkörper, die letzten Stellen.';
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';
const GREY = [0.71, 0.75, 0.77];

export function createFillStage(ctx) {
  const { view, busy } = ctx;
  const state = {
    plan: M.emptyPlan(), result: null, surf: null, field: null,
    stale: true, computing: false, queued: false, active: false,
    show: 'farbe', q: 1, spots: { on: true, count: 5, list: [] }, ms: 0, alpha: 0.5
  };

  /* ── Szene ────────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);
  const bodyMat = new T.MeshStandardMaterial({ color: 0xd8a23a, roughness: 0.35, metalness: 0.45, side: T.DoubleSide, flatShading: true });
  const bodyMesh = new T.Mesh(new T.BufferGeometry(), bodyMat);
  bodyMesh.visible = false;
  group.add(bodyMesh);
  const inletMat = new T.MeshStandardMaterial({ color: M.COLOR, roughness: 0.5, metalness: 0.1, side: T.DoubleSide, flatShading: true });
  const inletMesh = new T.Mesh(new T.BufferGeometry(), inletMat);
  inletMesh.visible = false;
  group.add(inletMesh);
  const spotGeo = new T.SphereGeometry(1, 20, 14);
  const spotMat = new T.MeshBasicMaterial({ color: 0xb42318, depthTest: false, transparent: true, opacity: 0.9 });
  const spotGroup = new T.Group();
  spotGroup.renderOrder = 5;
  spotGroup.visible = false;
  group.add(spotGroup);

  /* ── Der Plan aus dem Anguss ──────────────────────────────── */
  function planFromRunner() {
    const plan = M.emptyPlan();
    plan.alpha = state.alpha;
    const r = ctx.stages.anguss;
    if (!r) return plan;
    for (const m of r.gateMouths()) {
      const it = M.addInlet(plan, m.pos, [-m.dir[0], -m.dir[1], -m.dir[2]], { w: m.w, h: m.h });
      delete plan.items[it.id];
      it.id = m.id;
      it.bound = m.bound;
      plan.items[m.id] = it;
      it.share = Math.round(m.share * 1000) / 10;
      /* Die Höhe des Anschnitts steht in der Ausstoßrichtung, die Breite
         in der Trennebene — das Rechteck entsprechend drehen. */
      const f = M.frameOf(it);
      const vz = addScaled([0, 0, 1], f.n, -dot([0, 0, 1], f.n));
      if (Math.hypot(vz[0], vz[1], vz[2]) > 1e-6) {
        const u = norm(vz);
        const ang = Math.atan2(dot(cross(f.v, u), f.n), dot(f.v, u)) * 180 / Math.PI;
        M.setRot(plan, it.id, Math.round(ang));
      }
    }
    return plan;
  }

  function rebuild() {
    state.plan = planFromRunner();
    setTris(inletMesh, buildAll(state.plan));
    inletMesh.visible = inletMesh.geometry.getAttribute('position')?.count > 0;
    updateInletFacts();
    state.stale = true;
    state.result = null;
    state.surf = null;
    updateResult();
    view.invalidate();
  }

  function updateInletFacts() {
    const items = M.allItems(state.plan);
    const sh = M.shares(state.plan);
    const r = state.result;
    const rows = items.map(it => [
      '<code>' + it.id + '</code> ' + fmt(it.w, 0) + ' × ' + fmt(it.h, 1) + ' mm · ' + fmt(100 * (sh[it.id] || 0), 0) + ' %',
      (it.bound ? '' : '⚠ frei ') + (r && !state.stale
        ? (() => { const inf = r.stats.inlets.find(x => x.id === it.id); return inf ? fmt(100 * inf.cells / Math.max(1, r.cells), 0) + ' % Vol.' + (inf.seeds <= 1 ? ' ⚠' : '') : '—'; })()
        : '')
    ]);
    facts('fu-inlet-facts', rows);
    facts('fu-menu-facts', rows);
    $('fu-pt-sel').textContent = items.length ? items.length + (items.length === 1 ? ' Anschnitt' : ' Anschnitte') + ' aus dem Anguss' : 'Noch kein Anschnitt';
    $('fu-inlet-warn').textContent = !items.length ? 'Noch kein Anguss — im Schritt Anguss einen Vorschlag anlegen.'
      : items.some(it => !it.bound) ? 'Nicht jeder Anschnitt ist ans Bauteil gebunden — er trifft die Wand vielleicht nicht.' : '';
  }

  /* ── Rechnen ──────────────────────────────────────────────── */
  async function compute() {
    if (state.computing) { state.queued = true; return; }
    const items = M.allItems(state.plan);
    if (!items.length || !ctx.part.model) { state.result = null; state.surf = null; state.stale = true; updateResult(); return; }
    state.computing = true;
    ctx.setBusyStage('fuellung', true);
    $('fu-run').disabled = true;
    try {
      const field = await ctx.field.ensure();
      if (!field) return;
      state.field = field;
      const t0 = performance.now();
      const m = ctx.part.model;
      const wall = m.totalArea > 0 ? 2 * m.volume / m.totalArea : null;
      const res = await solveFill(field, state.plan, {
        alpha: state.plan.alpha, wallThickness: wall,
        onProgress: p => { busy.textContent = 'Füllung … ' + Math.round(p * 100) + ' %'; busy.classList.add('on'); }
      });
      state.result = res;
      state.surf = fracToSurface(field, res.frac);
      state.stale = false;
      state.ms = performance.now() - t0;
    } catch (err) {
      $('fu-inlet-warn').textContent = 'Die Füllung konnte nicht gerechnet werden: ' + err.message;
      console.error(err);
    } finally {
      busy.classList.remove('on');
      state.computing = false;
      ctx.setBusyStage('fuellung', false);
      $('fu-run').disabled = false;
    }
    updateResult();
    ctx.markDone('fuellung', !!state.result);
    ctx.emit('fill', state);
    if (state.queued) { state.queued = false; compute(); }
  }

  function updateResult() {
    paintPart();
    updateBody();
    updateSpots();
    updateFacts();
    updateInletFacts();
    applyVisibility();
  }

  function paintPart() {
    if (!state.active) return;
    const geo = ctx.part.mesh.geometry;
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    if (!pos || !col) return;
    const arr = col.array;
    if (!state.result || state.show !== 'farbe') { ctx.part.usePlain(); return; }
    const p = pos.array, f = state.field, s = state.surf, q = state.q;
    for (let i = 0; i < pos.count; i++) {
      const v = sampleFrac(f, s, p[3 * i], p[3 * i + 1], p[3 * i + 2]);
      if (Number.isNaN(v) || v > q + 1e-6) { arr.set(GREY, 3 * i); continue; }
      arr.set(turbo(v), 3 * i);
    }
    col.needsUpdate = true;
    ctx.part.useColors();
  }

  function updateBody() {
    if (!state.result || state.show !== 'koerper' || !state.active) { bodyMesh.visible = false; return; }
    const tris = surfaceNets(fillBodyField(state.field, state.result.frac, state.q), 0);
    setTris(bodyMesh, tris, true);
    bodyMat.color.setRGB(...turbo(Math.min(1, state.q)));
  }

  function updateSpots() {
    spotGroup.clear();
    state.spots.list = [];
    if (!state.result || !state.spots.on) return;
    const f = state.field;
    const spacing = Math.max(4 * f.h, 12);
    const list = lastSpots(f, state.result.frac, { minFrac: 0.8, spacing, limit: state.spots.count });
    state.spots.list = list;
    for (const m of list) spotGroup.add(spotMesh(m));
  }

  /** Eine Marke in Bildgröße — auch der Überlauf-Schritt zeigt sie. */
  function spotMesh(m) {
    const mesh = new T.Mesh(spotGeo, spotMat);
    mesh.position.set(m.x, m.y, m.z);
    mesh.onBeforeRender = (renderer, scene, camera) => {
      const d = camera.isOrthographicCamera ? (camera.top - camera.bottom) / camera.zoom / 3 : camera.position.distanceTo(mesh.position);
      mesh.scale.setScalar(d * 0.012);
    };
    return mesh;
  }

  function applyVisibility() {
    const has = !!state.result && state.active;
    if (state.active) {
      if (state.show === 'koerper' && has) ctx.part.applyOpacity(Math.min(+$('fu-ref-opacity').value / 100, 0.25));
      else ctx.part.applyOpacity(+$('fu-ref-opacity').value / 100);
    }
    bodyMesh.visible = has && state.show === 'koerper' && !!bodyMesh.geometry.getAttribute('position') && bodyMesh.geometry.getAttribute('position').count > 0;
    spotGroup.visible = has && state.spots.on;
    inletMesh.visible = state.active && !!inletMesh.geometry.getAttribute('position') && inletMesh.geometry.getAttribute('position').count > 0;
    $('fu-q-row').classList.toggle('disabled', !state.result);
    if (state.active) {
      colorbar(state.result && state.show !== 'grau' ? {
        title: 'Füllgrad',
        stops: gradient(t => rgbCss(turbo(t))),
        ticks: [100, 75, 50, 25, 0].map(v => v + ' %')
      } : null);
    }
    view.invalidate();
  }

  function updateFacts() {
    const r = state.result;
    const items = M.allItems(state.plan);
    const note = $('fu-run-note');
    $('fu-run').disabled = !items.length || state.computing || !ctx.part.model;
    if (!items.length) { note.textContent = ''; note.className = 'run-note'; facts('fu-result-facts', []); return; }
    if (!r) {
      note.textContent = state.computing ? 'Rechnet …' : 'Der Plan ist noch nicht gerechnet.';
      note.className = 'run-note stale';
      facts('fu-result-facts', []);
      return;
    }
    const dauer = state.ms >= 1000 ? fmt(state.ms / 1000, 1) + ' s' : fmt(state.ms, 0) + ' ms';
    note.textContent = (state.stale ? 'Der Anguss hat sich geändert — rechnet nach …' : 'Gerechnet in ' + dauer + ' · α = ' + fmt(r.stats.alpha, 1))
      + (r.stats.unreached ? ' · ⚠ ' + fmt(r.stats.unreached, 0) + ' Zellen nicht erreicht' : '');
    note.className = 'run-note' + (state.stale || r.stats.unreached ? ' stale' : '');
    const rows = [
      ['längster Fließweg', fmt(r.stats.maxPath, 0) + ' mm'],
      ['Wanddicke 2V/A', fmt(r.stats.wallThickness, 1) + ' mm'],
      ['Fließweg / Wanddicke', fmt(r.stats.flowRatio, 0) + ' : 1' + (r.stats.flowRatio > 300 ? ' ⚠' : '')],
      ['Volumen im Raster', fmt(r.stats.volume / 1000, 1) + ' cm³']
    ];
    if (state.spots.list.length) {
      const s = state.spots.list[0];
      rows.push(['letzte Stelle', fmt(100 * s.frac, 0) + ' % · ' + s.x.toFixed(0) + ' / ' + s.y.toFixed(0) + ' / ' + s.z.toFixed(0)]);
    }
    facts('fu-result-facts', rows);
    $('fu-grid-note').textContent = state.field
      ? 'Zellkante ' + fmt(state.field.h, 2) + ' mm · Raster ' + state.field.dims.join(' × ') + ' (das Abstandsfeld des Bauteils, Zellkante im Schritt Bauteil).'
      : 'Das Raster ist das Abstandsfeld des Bauteils (Zellkante im Schritt Bauteil).';
  }

  /* ── Regler ───────────────────────────────────────────────── */
  slider('fu-alpha', v => { state.alpha = v; state.plan.alpha = v; if (state.active && state.result) { state.stale = true; compute(); } }, v => fmt(v, 1));
  $('fu-run').addEventListener('click', compute);
  segButtons('fu-show-seg', v => { state.show = v; paintPart(); updateBody(); applyVisibility(); });
  slider('fu-q', v => { state.q = v / 100; paintPart(); updateBody(); applyVisibility(); }, v => v + ' %');
  $('fu-spots-on').addEventListener('change', e => { state.spots.on = e.target.checked; updateSpots(); updateFacts(); applyVisibility(); ctx.emit('fill', state); });
  slider('fu-spots-count', v => { state.spots.count = v; updateSpots(); updateFacts(); applyVisibility(); ctx.emit('fill', state); }, v => String(v));
  slider('fu-ref-opacity', () => applyVisibility(), v => v + ' %');

  $('fu-stl-save').addEventListener('click', () => {
    if (!state.result) return;
    const tris = surfaceNets(fillBodyField(state.field, state.result.frac, state.q), 0);
    if (!tris.length) return;
    download(new Blob([writeSTL(tris, 'DieLogic Füllkörper ' + Math.round(100 * state.q) + ' %')], { type: 'model/stl' }),
      safeName(ctx.part.name) + '-fuellung-' + Math.round(100 * state.q) + '.stl');
  });

  /* ── Ereignisse ───────────────────────────────────────────── */
  let timer = 0;
  ctx.on('runner', () => {
    rebuild();
    if (state.active) { clearTimeout(timer); timer = setTimeout(compute, 300); }
  });
  ctx.on('field', () => {
    if (ctx.field.data && ctx.field.data !== state.field && state.result) { state.stale = true; state.result = null; updateResult(); }
    if (state.active) { clearTimeout(timer); timer = setTimeout(compute, 100); }
  });

  return {
    id: 'fuellung', state, group,
    enter() {
      state.active = true;
      ctx.subtitle(SUBTITLE);
      ctx.status(IDLE);
      $('pt-legend').innerHTML = '<div class="pt-menu-title">Zeichen</div>'
        + '<div class="lg-row"><span class="dot" style="background:' + M.COLOR + '"></span>Anschnitt (aus dem Anguss)</div>'
        + '<div class="lg-row"><span class="dot" style="background:#b42318"></span>zuletzt gefüllt</div>';
      $('fu-menu').classList.remove('wb-off');
      rebuild();
      if (M.allItems(state.plan).length) compute();
    },
    leave() {
      state.active = false;
      $('fu-menu').classList.add('wb-off');
      bodyMesh.visible = spotGroup.visible = inletMesh.visible = false;
      colorbar(null);
      ctx.part.usePlain();
      ctx.part.applyOpacity(ctx.part.opacity);
      view.invalidate();
    },
    compute, spotMesh, spots: () => state.spots.list,
    toJSON: () => ({ alpha: state.alpha, spots: state.spots.count }),
    fromJSON(o) {
      if (!o) return;
      if (Number.isFinite(o.alpha)) { state.alpha = Math.max(0, Math.min(1, o.alpha)); $('fu-alpha').value = String(state.alpha); $('fu-alpha-val').textContent = fmt(state.alpha, 1); }
      if (Number.isFinite(o.spots)) { state.spots.count = o.spots; $('fu-spots-count').value = String(o.spots); $('fu-spots-count-val').textContent = String(o.spots); }
    },
    bodyMesh, spotGroup, inletMesh
  };
}
