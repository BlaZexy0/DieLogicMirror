/* Schritt 1 — Bauteil: Entformung und Wandstärke.

   Die Entformungsanalyse läuft wie auf ihrer eigenen Seite
   (js/entformung/tool.js): Sichtbarkeit in sechs Richtungen, feste Regeln,
   sofort beim Laden, ohne Regler. Die Wandstärke kommt aus dem
   Abstandsfeld, das die Werkbank für alle Schritte EINMAL rechnet
   (js/werkbank/app.js, ctx.field): Wärmezentren als Kugeln, ein Schnitt
   durch das Feld als Rasterbild — die Offsetfläche und der Turbo-Schnitt
   der Wandstärkenseite (js/wandstaerke/tool.js) in verkürzter Form.

   Das Bauteil selbst (Laden, Netz, Kennzahlen) verwaltet app.js; dieser
   Schritt bekommt es über das Ereignis „part". */

import * as T from 'three';
import { computeVisibility, DIRS } from '../part/visibility.js';
import { segment, UNDERCUT } from '../part/segment.js';
import { draftAngles, draftStats, dirNames } from '../part/draft.js';
import { thickMaxima } from '../part/field.js';
import { $, fmt, fmtPlain, rgbCss, facts, segButtons, slider, numberInput, colorbar, gradient, chip } from '../ui/controls.js';
import * as C from '../part/colors.js';
import { frame } from '../part/partsource.js';
import { createDieView } from '../part/dieviewer.js';

const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';
const SUBTITLE = 'Bauteil: Formteilung nach festen Regeln, Wandstärke und Wärmezentren aus dem Abstandsfeld.';

export function createPartStage(ctx) {
  const { view, busy } = ctx;
  const state = {
    vis: null, seg: null, draft: null,
    axis: 'auto', mode: 'regions', draftLimit: 1.5, showParting: true,
    hot: { on: false, min: 75, list: [] },
    slice: { on: false, axis: 2, pos: 50 },
    die: { on: false, dist: 60, skirt: 8, part: true, look: 'frei', distTouched: false },
    analysed: false, running: false, visMs: 0, segMs: 0,
    active: false
  };

  /* ── Szene: Trennlinie, Wärmezentren, Feldschnitt ─────────── */
  const group = new T.Group();
  view.scene.add(group);
  const partingLines = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x002733 }));
  group.add(partingLines);

  const hotGroup = new T.Group();
  hotGroup.visible = false;
  group.add(hotGroup);
  const hotGeo = new T.SphereGeometry(1, 24, 16);
  const hotMat = new T.MeshStandardMaterial({
    color: 0xb42318, roughness: 0.5, metalness: 0.05, transparent: true, opacity: 0.6, depthWrite: false
  });

  const sliceMat = new T.MeshBasicMaterial({ side: T.DoubleSide });
  const sliceMesh = new T.Mesh(new T.PlaneGeometry(1, 1), sliceMat);
  sliceMesh.visible = false;
  group.add(sliceMesh);

  /* Die Formansicht: die Regionen als Formteile (js/part/dieviewer.js). */
  const dieView = createDieView(view);

  /* ── Entformung ───────────────────────────────────────────── */
  async function runAnalysis() {
    const model = ctx.part.model;
    if (!model || state.running) return;
    state.running = true;
    ctx.setBusyStage('bauteil', true);
    $('bt-analysis-state').textContent = 'rechnet … ' + fmt(model.faceCount, 0) + ' Dreiecke';
    try {
      busy.textContent = 'Sichtbarkeit rechnen …';
      busy.classList.add('on');
      await frame();
      const t0 = performance.now();
      const vis = await computeVisibility(model, {
        samples: model.faceCount > 120000 ? 4 : 7,
        onProgress: (p, label) => { busy.textContent = 'Sichtbarkeit ' + label + ' … ' + Math.round(p * 100) + ' %'; }
      });
      if (ctx.part.model !== model) return;
      state.vis = vis;
      state.visMs = performance.now() - t0;
      state.analysed = true;
      recompute();
    } catch (err) {
      $('model-warn').textContent = 'Die Analyse ist gescheitert: ' + err.message;
      console.error(err);
    } finally {
      busy.classList.remove('on');
      state.running = false;
      ctx.setBusyStage('bauteil', false);
      ctx.markDone('bauteil', state.analysed);
    }
  }

  function clearAnalysis() {
    state.vis = null; state.seg = null; state.draft = null; state.analysed = false;
    partingLines.visible = false;
    $('bt-parting-count').textContent = '0';
    $('bt-legend').innerHTML = '<div class="legend-row"><span class="name">Rechnet …</span></div>';
    $('bt-seg-facts').innerHTML = '';
    $('bt-draft-facts').innerHTML = '';
    $('bt-analysis-state').textContent = '';
    paintPlain();
  }

  function recompute() {
    const model = ctx.part.model;
    if (!model || !state.vis) return;
    const t0 = performance.now();
    state.seg = segment(model, state.vis, { mainAxis: state.axis });
    state.draft = draftAngles(model, state.vis, state.seg.label);
    state.segMs = performance.now() - t0;
    updateColors();
    updatePartingLine();
    updateLegend();
    updateColorbar();
    updateFacts();
    updateDieView();
    ctx.emit('analysis', state.seg);
  }

  function updateDieView() {
    if (!state.active || !state.die.on || !state.seg) { dieView.lookFree(); dieView.show(false); applyOpacity(); return; }
    dieView.build(ctx.part.model, state.seg, { skirt: state.die.skirt });
    dieView.setDistance(state.die.dist);
    dieView.show(true);
    applyLook();
  }
  const halfLabel = sign => (state.seg ? DIRS.findIndex(d => d.axis === state.seg.mainAxis && d.sign === sign) : -1);
  function applyLook() {
    const look = state.die.look;
    if (look === 'frei' || !state.active || !state.die.on || !state.seg) dieView.lookFree();
    else if (!dieView.lookInto(halfLabel(look === 'mov' ? 1 : -1))) {
      state.die.look = 'frei';
      for (const b of $('bt-die-look-seg').querySelectorAll('button')) b.classList.toggle('active', b.dataset.value === 'frei');
      dieView.lookFree();
    }
    applyOpacity();
  }

  function paintPlain() {
    const col = ctx.part.mesh.geometry.getAttribute('color');
    if (col) { col.array.fill(0.75); col.needsUpdate = true; }
    view.invalidate();
  }

  /* Die Farben liegen im Farb-Attribut des gemeinsamen Bauteilnetzes; die
     Füllung schreibt dasselbe Attribut. Deshalb malt jeder Schritt beim
     Betreten seine Farben neu. */
  function updateColors() {
    const model = ctx.part.model;
    const { seg, draft, mode } = state;
    if (!model || !seg || !state.active) return;
    if (mode === 'plain') { ctx.part.usePlain(); return; }
    const col = ctx.part.mesh.geometry.getAttribute('color');
    const arr = col.array;
    for (let f = 0; f < model.faceCount; f++) {
      let rgb;
      if (seg.label[f] === UNDERCUT) rgb = C.hex2rgb(mode === 'draft' ? C.UNDERCUT_DARK : C.UNDERCUT_COLOR);
      else if (mode === 'draft') rgb = C.draftColor(draft[f], state.draftLimit);
      else rgb = C.hex2rgb(C.REGION_COLORS[seg.label[f]]);
      for (let e = 0; e < 3; e++) {
        arr[f * 9 + e * 3] = rgb[0];
        arr[f * 9 + e * 3 + 1] = rgb[1];
        arr[f * 9 + e * 3 + 2] = rgb[2];
      }
    }
    col.needsUpdate = true;
    ctx.part.useColors();
    view.invalidate();
  }

  function updatePartingLine() {
    const model = ctx.part.model;
    const { seg } = state;
    if (!model || !seg) return;
    const pts = [];
    const { nbr, index, verts, faceCount: F } = model;
    for (let f = 0; f < F; f++) {
      for (let e = 0; e < 3; e++) {
        const w = nbr[f * 3 + e];
        if (w < 0 || w < f || seg.label[f] === seg.label[w]) continue;
        const i0 = index[f * 3 + e], i1 = index[f * 3 + (e + 1) % 3];
        pts.push(verts[i0 * 3], verts[i0 * 3 + 1], verts[i0 * 3 + 2],
                 verts[i1 * 3], verts[i1 * 3 + 1], verts[i1 * 3 + 2]);
      }
    }
    partingLines.geometry.dispose();
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(Float32Array.from(pts), 3));
    partingLines.geometry = g;
    partingLines.visible = state.active && state.showParting && pts.length > 0;
    $('bt-parting-count').textContent = (pts.length / 6).toLocaleString('de-DE');
  }

  function updateLegend() {
    const model = ctx.part.model;
    const { seg, mode } = state;
    if (!model || !seg) return;
    const el = $('bt-legend');
    const names = dirNames(seg.mainAxis);
    const A = model.totalArea || 1;
    if (mode === 'draft') {
      const st = draftStats(model, state.draft, seg.label, state.draftLimit);
      const rows = [
        ['unter ' + fmt(state.draftLimit) + '°', C.draftColor(0, state.draftLimit), st.below / A],
        [fmt(state.draftLimit) + '° … ' + fmt(3 * state.draftLimit) + '°', C.draftColor(state.draftLimit * 1.4, state.draftLimit), null],
        ['über ' + fmt(3 * state.draftLimit) + '°', C.draftColor(state.draftLimit * 4, state.draftLimit), null],
        ['Hinterschnitt', C.hex2rgb(C.UNDERCUT_DARK), st.undercut / A]
      ];
      el.innerHTML = rows.map(([n, rgb, frac]) =>
        '<div class="legend-row">' + chip(rgbCss(rgb)) + '<span class="name">' + n + '</span><span class="pct">'
        + (frac === null ? '' : (100 * frac).toFixed(1) + ' %') + '</span></div>').join('');
      return;
    }
    if (mode === 'plain') { el.innerHTML = '<div class="legend-row"><span class="name">Ohne Einfärbung.</span></div>'; return; }
    const rows = names.map((d, i) => ({ name: d.name, color: C.REGION_COLORS[i], frac: seg.areaByLabel[i] / A }));
    rows.push({ name: 'Hinterschnitt (keine Richtung)', color: C.UNDERCUT_COLOR, frac: seg.areaByLabel[6] / A });
    el.innerHTML = rows.map(r =>
      '<div class="legend-row' + (r.frac < 0.0005 ? ' off' : '') + '">' + chip(r.color)
      + '<span class="name">' + r.name + '</span><span class="pct">' + (100 * r.frac).toFixed(1) + ' %</span></div>').join('');
  }

  function updateColorbar() {
    if (!state.active) return;
    if (state.slice.on && ctx.field.data) return sliceColorbar();
    if (!state.seg || state.mode !== 'draft') return colorbar(null);
    const lim = state.draftLimit, top = 3 * lim;
    colorbar({
      title: 'Entformschräge',
      stops: gradient(t => rgbCss(C.draftColor(top * t, lim))),
      ticks: [top, 2 * lim, lim, 0].map(v => fmt(v) + '°'),
      extra: chip(C.UNDERCUT_DARK) + 'Hinterschnitt'
    });
  }

  function updateFacts() {
    const model = ctx.part.model;
    const { seg } = state;
    if (!model || !seg) return;
    const A = model.totalArea || 1;
    let halves = 0, sliders = 0;
    for (let d = 0; d < 6; d++) (DIRS[d].axis === seg.mainAxis ? halves += seg.areaByLabel[d] : sliders += seg.areaByLabel[d]);
    const axisName = 'XYZ'[seg.mainAxis];
    $('bt-analysis-state').textContent = 'Formöffnung ' + axisName + (seg.auto ? ' (automatisch gewählt)' : ' (fest gewählt)')
      + (seg.mainAxis !== 2 ? ' — die Werkbank rechnet mit Z; das Teil liegt vermutlich falsch herum.' : '');
    facts('bt-seg-facts', [
      ['Formhälften', (100 * halves / A).toFixed(1) + ' % der Fläche'],
      ['Schieber', (100 * sliders / A).toFixed(1) + ' % der Fläche'],
      ['Hinterschnitt', (100 * seg.areaByLabel[6] / A).toFixed(1) + ' % der Fläche'],
      ['Rechenzeit', (state.visMs + state.segMs).toFixed(0) + ' ms']
    ]);
    const st = draftStats(model, state.draft, seg.label, state.draftLimit);
    facts('bt-draft-facts', [
      ['kleinste Schräge', fmt(st.min) + ' °'],
      ['unter Grenzwert', (100 * st.belowFrac).toFixed(1) + ' % der Fläche'],
      ['Hinterschnitt', (100 * st.undercutFrac).toFixed(1) + ' % der Fläche']
    ]);
  }

  /* ── Wandstärke aus dem Feld ──────────────────────────────── */
  function updateFieldFacts() {
    const f = ctx.field.data, st = ctx.field.stats;
    const btn = $('bt-run-field'), note = $('bt-field-state');
    if (!ctx.part.model) { facts('bt-field-facts', []); btn.disabled = true; note.textContent = ''; return; }
    if (!f) {
      facts('bt-field-facts', []);
      btn.disabled = !!ctx.field.promise;
      btn.textContent = ctx.field.promise ? 'rechnet …' : 'Feld berechnen';
      note.textContent = 'Noch kein Feld — es entsteht hier, im Schritt Füllung oder Temperierung.';
      note.className = 'run-note';
      return;
    }
    const stale = ctx.field.stale;
    btn.disabled = !stale;
    btn.textContent = stale ? 'Feld neu berechnen' : 'Feld ist aktuell';
    note.textContent = stale ? 'Zellkante geändert — das Bild zeigt noch das vorige Feld.' : '';
    note.className = 'run-note' + (stale ? ' stale' : '');
    const rows = [
      ['Zellkante', fmt(f.h, 2) + ' mm'],
      ['Raster', f.dims.join(' × ') + ' = ' + fmt(f.data.length / 1e6, 2) + ' Mio. Punkte'],
      ['Rechenzeit', fmt(ctx.field.ms, 0) + ' ms']
    ];
    if (st) rows.push(['größte Wandstärke', fmt(2 * st.maxIn) + ' mm']);
    facts('bt-field-facts', rows);
  }

  function updateHotspots() {
    for (const c of hotGroup.children.slice()) hotGroup.remove(c);
    const f = ctx.field.data;
    const on = state.active && state.hot.on && !!f && !!ctx.field.stats;
    hotGroup.visible = on;
    if (!on) { if (!f) facts('bt-hot-facts', []); view.invalidate(); return; }
    if (state.hot.field !== f || state.hot.minUsed !== state.hot.min) {
      state.hot.list = thickMaxima(f, { minFrac: state.hot.min / 100 });
      state.hot.field = f;
      state.hot.minUsed = state.hot.min;
    }
    for (const m of state.hot.list) {
      const mesh = new T.Mesh(hotGeo, hotMat);
      mesh.position.set(m.x, m.y, m.z);
      mesh.scale.setScalar(m.r);
      mesh.renderOrder = 4;
      hotGroup.add(mesh);
    }
    const rows = [['Stellen', fmt(state.hot.list.length, 0)], ['größte Wandstärke', fmt(2 * ctx.field.stats.maxIn) + ' mm']];
    if (state.hot.list[0]) {
      const m = state.hot.list[0];
      rows.push(['dickste bei', [m.x, m.y, m.z].map(v => fmt(v, 0)).join(' / ') + ' mm']);
    }
    facts('bt-hot-facts', rows);
    view.invalidate();
  }

  /* Der Feldschnitt: innen die Wandstärke in Turbo (dick = rot), außen
     hellgrau, die Bauteilkontur dunkel. */
  const OUTSIDE = [0.87, 0.9, 0.91];
  const turbo = t => C.turbo(0.08 + 0.84 * Math.max(0, Math.min(1, t)));
  function updateSlice() {
    const f = ctx.field.data;
    if (!f || !state.slice.on || !state.active) { sliceMesh.visible = false; view.invalidate(); return; }
    const maxIn = Math.max(ctx.field.stats ? ctx.field.stats.maxIn : 1, 1e-6);
    const [nx, ny] = f.dims;
    const a = state.slice.axis;
    const n = f.dims[a];
    const k = Math.max(0, Math.min(n - 1, Math.round(state.slice.pos / 100 * (n - 1))));
    const coord = f.origin[a] + k * f.h;
    $('bt-slice-pos-val').textContent = fmt(coord) + ' mm';
    const [ua, va] = a === 0 ? [2, 1] : a === 1 ? [0, 2] : [0, 1];
    const w = f.dims[ua], hgt = f.dims[va];
    const px = new Uint8Array(w * hgt * 4);
    const at = (i, j, kk) => f.data[(kk * ny + j) * nx + i];
    for (let vv = 0; vv < hgt; vv++) {
      for (let uu = 0; uu < w; uu++) {
        const idx = [0, 0, 0];
        idx[a] = k; idx[ua] = uu; idx[va] = vv;
        const v = at(idx[0], idx[1], idx[2]);
        let rgb = v >= 0 ? OUTSIDE : turbo(-v / maxIn);
        if (Math.abs(v) < f.h * 0.6) rgb = [0.08, 0.13, 0.16];
        const o = (vv * w + uu) * 4;
        px[o] = rgb[0] * 255; px[o + 1] = rgb[1] * 255; px[o + 2] = rgb[2] * 255; px[o + 3] = 255;
      }
    }
    const tex = new T.DataTexture(px, w, hgt, T.RGBAFormat);
    tex.magFilter = T.NearestFilter;
    tex.minFilter = T.LinearFilter;
    tex.needsUpdate = true;
    if (sliceMat.map) sliceMat.map.dispose();
    sliceMat.map = tex;
    sliceMat.needsUpdate = true;
    sliceMesh.geometry.dispose();
    sliceMesh.geometry = new T.PlaneGeometry((w - 1) * f.h, (hgt - 1) * f.h);
    const c = [0, 1, 2].map(ax => f.origin[ax] + (f.dims[ax] - 1) * f.h / 2);
    c[a] = coord;
    sliceMesh.position.set(c[0], c[1], c[2]);
    sliceMesh.rotation.set(0, 0, 0);
    if (a === 0) sliceMesh.rotation.y = -Math.PI / 2;
    else if (a === 1) sliceMesh.rotation.x = Math.PI / 2;
    sliceMesh.visible = true;
    view.invalidate();
  }
  function sliceColorbar() {
    const maxIn = Math.max(ctx.field.stats ? ctx.field.stats.maxIn : 1, 1e-6);
    colorbar({
      title: 'Wandstärke',
      stops: gradient(t => rgbCss(turbo(t))),
      ticks: [1, 0.75, 0.5, 0.25, 0].map(q => fmt(2 * maxIn * q) + ' mm'),
      extra: chip('#14212a') + 'Bauteilkontur'
    });
  }

  /* Im Schnitt und bei Wärmezentren muss man ins Bauteil sehen; in der
     Formansicht steht es durchscheinend zwischen den Formteilen — oder gar nicht. */
  function applyOpacity() {
    const die = state.active && state.die.on && !!state.seg;
    const clear = state.active && ((state.slice.on || state.hot.on) && !!ctx.field.data);
    const o = die ? (state.die.part && state.die.look === 'frei' ? Math.min(ctx.part.opacity, 0.18) : 0)
      : clear ? Math.min(ctx.part.opacity, 0.45) : ctx.part.opacity;
    ctx.part.mesh.visible = o > 0;
    ctx.part.applyOpacity(Math.max(o, 0.001));
    partingLines.visible = o > 0 && state.active && state.showParting && partingLines.geometry.getAttribute('position')?.count > 0;
  }

  /* ── Bedienung ────────────────────────────────────────────── */
  segButtons('bt-axis-seg', v => { state.axis = v === 'auto' ? 'auto' : +v; recompute(); });
  segButtons('bt-mode-seg', v => {
    state.mode = v;
    $('bt-draft-block').classList.toggle('disabled', v !== 'draft');
    updateColors(); updateLegend(); updateColorbar();
  });
  slider('bt-draft-limit', v => {
    state.draftLimit = v;
    if (state.seg) { updateColors(); updateLegend(); updateColorbar(); updateFacts(); }
  }, v => fmt(v) + ' °');
  $('bt-show-parting').addEventListener('change', e => {
    state.showParting = e.target.checked;
    partingLines.visible = state.active && state.showParting && partingLines.geometry.getAttribute('position')?.count > 0;
    view.invalidate();
  });
  slider('bt-opacity', v => { ctx.part.setOpacity(v / 100); applyOpacity(); }, v => v + ' %');
  $('bt-die-on').addEventListener('change', e => {
    state.die.on = e.target.checked;
    $('bt-die-block').classList.toggle('disabled', !state.die.on);
    updateDieView();
  });
  slider('bt-die-dist', v => {
    state.die.dist = v;
    if (v !== +$('bt-die-dist').defaultValue) state.die.distTouched = true;
    dieView.setDistance(v);
  }, v => fmt(v, 0) + ' mm');
  let skirtTimer = 0;
  slider('bt-die-skirt', v => {
    state.die.skirt = v;
    clearTimeout(skirtTimer);
    if (state.die.on && state.seg) skirtTimer = setTimeout(updateDieView, 120);
  }, v => fmt(v, 0) + ' mm');
  $('bt-die-part').addEventListener('change', e => { state.die.part = e.target.checked; applyOpacity(); });
  segButtons('bt-die-look-seg', v => { state.die.look = v; applyLook(); });

  numberInput('bt-cell-h', v => ctx.field.setCell(v));
  $('bt-run-field').addEventListener('click', () => ctx.field.ensure({ force: true }));
  $('bt-hot-on').addEventListener('change', e => {
    state.hot.on = e.target.checked;
    $('bt-hot-block').classList.toggle('disabled', !state.hot.on);
    if (state.hot.on && !ctx.field.data) ctx.field.ensure();
    updateHotspots(); applyOpacity();
  });
  slider('bt-hot-min', v => { state.hot.min = v; updateHotspots(); }, v => v + ' %');
  $('bt-slice-on').addEventListener('change', e => {
    state.slice.on = e.target.checked;
    $('bt-slice-block').classList.toggle('disabled', !state.slice.on);
    if (state.slice.on && !ctx.field.data) ctx.field.ensure();
    updateSlice(); updateColorbar(); applyOpacity();
  });
  segButtons('bt-slice-seg', v => { state.slice.axis = +v; updateSlice(); });
  slider('bt-slice-pos', v => { state.slice.pos = v; updateSlice(); }, () => '');

  /* Hover: Richtung und Entformschräge des Dreiecks unter der Maus — nur
     in diesem Schritt, höchstens einmal je Bild. */
  const ray = new T.Raycaster();
  let hoverAt = null, hoverQueued = false;
  view.renderer.domElement.addEventListener('pointermove', ev => {
    if (!state.active) return;
    hoverAt = { x: ev.clientX, y: ev.clientY };
    if (hoverQueued) return;
    hoverQueued = true;
    requestAnimationFrame(() => { hoverQueued = false; if (hoverAt && state.active) evalHover(hoverAt); });
  });
  view.renderer.domElement.addEventListener('pointerleave', () => { hoverAt = null; if (state.active) ctx.status(IDLE); });
  function evalHover(at) {
    if (!state.seg || !ctx.part.mesh.visible) { ctx.status(IDLE); return; }
    const r = view.renderer.domElement.getBoundingClientRect();
    const p = new T.Vector2(((at.x - r.left) / r.width) * 2 - 1, -((at.y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, view.camera);
    const hit = ray.intersectObject(ctx.part.mesh, false)[0];
    if (!hit) { ctx.status(IDLE); return; }
    const f = hit.faceIndex;
    const l = state.seg.label[f];
    const names = dirNames(state.seg.mainAxis);
    const vis = [];
    for (let d = 0; d < 6; d++) if (state.seg.cand[f] & (1 << d)) vis.push(DIRS[d].label);
    ctx.status((l === UNDERCUT ? 'Hinterschnitt' : names[l].name) + ' · Entformschräge ' + fmt(state.draft[f]) + '°'
      + ' · frei gesehen aus: ' + (vis.length ? vis.join(' ') : 'keiner Richtung'));
  }

  /* ── Ereignisse der Werkbank ──────────────────────────────── */
  ctx.on('part', () => {
    clearAnalysis();
    dieView.build(null, null);
    const longest = Math.max(...ctx.part.model.bounds.size);
    $('bt-die-dist').max = String(Math.max(50, Math.round(longest * 1.2)));
    if (!state.die.distTouched) {
      state.die.dist = Math.max(10, Math.round(longest * 0.25));
      $('bt-die-dist').value = String(state.die.dist);
      $('bt-die-dist-val').textContent = fmt(state.die.dist, 0) + ' mm';
      dieView.setDistance(state.die.dist);
    }
    state.hot.list = [];
    $('bt-cell-h').value = fmtPlain(ctx.field.h, 2);
    updateFieldFacts();
    updateHotspots();
    updateSlice();
    runAnalysis();
  });
  ctx.on('field', () => {
    $('bt-cell-h').value = fmtPlain(ctx.field.h, 2);
    updateFieldFacts();
    updateHotspots();
    updateSlice();
    updateColorbar();
    applyOpacity();
  });

  return {
    id: 'bauteil', state, group,
    enter() {
      state.active = true;
      ctx.subtitle(SUBTITLE);
      ctx.status(IDLE);
      $('pt-legend').innerHTML = '';
      updateColors();
      partingLines.visible = state.showParting && partingLines.geometry.getAttribute('position')?.count > 0;
      updateHotspots();
      updateSlice();
      updateColorbar();
      updateFieldFacts();
      updateDieView();
      view.invalidate();
    },
    leave() {
      state.active = false;
      partingLines.visible = false;
      hotGroup.visible = false;
      sliceMesh.visible = false;
      dieView.lookFree();
      dieView.show(false);
      colorbar(null);
      ctx.part.usePlain();
      ctx.part.mesh.visible = !!ctx.part.model;
      ctx.part.applyOpacity(ctx.part.opacity);
      view.invalidate();
    },
    recompute, runAnalysis, dieView
  };
}
