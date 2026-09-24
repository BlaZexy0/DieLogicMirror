/* Wandstärkenanalyse — das Werkzeug im gemeinsamen Rahmen.

   Zwei Schritte, nur der erste kostet Zeit: das FELD (Modus „Feld", auf
   Knopfdruck, mit Fortschritt und Abbruch) und alles, was daraus folgt —
   die ISOFLÄCHE (Untermaß, sofort), der FELDSCHNITT und die WÄRMEZENTREN.
   Jeder Modus besitzt, was er im Viewport zeigt; die Deckkraft des
   Bauteils steht in der Darstellung. Das Feld selbst gehört dem
   Gastgeber (host.field) — auf der Werkbank teilen es sich drei Schritte:
   rechnet es dort die Füllung oder die Temperierung, übernimmt die
   Wandstärke es (link.fieldChanged), wenn es zu ihrer Zellkante passt. */

import * as T from 'three';
import { thickMaxima, CELL_RANGE, MAX_SAMPLES } from '../part/field.js';
import { surfaceNets } from '../part/surfacenets.js';
import { volume, surface } from '../mesh.js';
import { facts, segButtons, segButtonSet, slider, numberInput, gradient, chip } from '../ui/controls.js';
import { fmt, fmtPlain, fmtUnit } from '../studio/format.js';
import { kpis } from '../studio/rows.js';
import { saveSTL } from '../studio/files.js';
import { checkFormat } from '../studio/planio.js';
import { surfaceMaterial } from '../ui/common.js';
import { onScheme, VIEW, scale, lut, hex2rgb, turboTrim } from '../part/colors.js';
import { MODES, DARSTELLUNG } from './panel.js';

export const FORMAT = 'dielogic-wandstaerke';
export const FORMAT_VERSION = 1;

const BAND_CELLS = 3, PAD_CELLS = 2;
/* Die Wandstärke auf der Farbleiste `turbo` (js/part/colors.js, in jedem
   Farbschema dieselbe): dünn blau, dick rot — das Stück von sattem Blau bis
   sattem Rot, ohne die fast schwarzen Enden (turboTrim). Mehr als
   MAX_SAMPLES Rasterpunkte rechnet der Gastgeber nicht: darüber hebt er die
   Zellkante an (js/part/field.js, planField). */
const LIMIT_TEXT = fmt(MAX_SAMPLES / 1e6, 0) + ' Mio.';

export function createWandstaerkeTool(host) {
  const { shell, view, part, field: hostField } = host;
  const ui = host.ui;

  const state = {
    cell: 3, cellTouched: false,
    under: 2, underTouched: false,
    show: 'both', opacity: 0.35,
    slice: { on: false, axis: 2, pos: 50 },
    hot: { on: false, shape: 'kugeln', min: 75 },
    /* fieldCell: die Zellkante, MIT der das Feld verlangt wurde — über 16 Mio.
       Punkten rastert der Gastgeber gröber, field.h ist dann größer. */
    field: null, fieldCell: 0, stats: null, offsetTris: null, maxima: [], hotField: null, hotMin: 0,
    stale: false, running: false, cancelled: false, ready: false, ms: 0, extractMs: 0,
    get model() { return part.model; },
    get name() { return part.name; }
  };

  /* ── Körper ──────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);
  /* Die Isofläche ist eine Bauhilfe, kein Körper der Form: die Rolle der
     Hilfsflächen (wie die Abstandsfläche der Temperierung), leicht
     durchscheinend. */
  const offsetMat = surfaceMaterial(VIEW.helper, { roughness: 0.5, metalness: 0.12, transparent: true, opacity: 0.85 });
  const offsetMesh = new T.Mesh(new T.BufferGeometry(), offsetMat);
  /* Vor dem durchscheinenden Bauteil zeichnen: sie liegt in ihm, und das
     Bauteil schreibt keine Tiefe — in umgekehrter Folge stünde sie davor. */
  offsetMesh.renderOrder = -1;
  offsetMesh.visible = false;
  group.add(offsetMesh);
  const sliceMat = new T.MeshBasicMaterial({ side: T.DoubleSide, transparent: false });
  const sliceMesh = new T.Mesh(new T.PlaneGeometry(1, 1), sliceMat);
  sliceMesh.visible = false;
  group.add(sliceMesh);
  const hotGroup = new T.Group();
  hotGroup.visible = false;
  group.add(hotGroup);
  const hotSphereGeo = new T.SphereGeometry(1, 24, 16);
  const hotRingGeo = new T.RingGeometry(0.86, 1, 48);
  /* Ein Wechsel des Farbschemas: Isofläche umfärben, Schnitt, Marken und
     Skala neu malen. Die Marken merken sich ihr Feld; neu gebaut werden
     nur ihre Körper. */
  onScheme(() => { offsetMat.color.set(VIEW.helper); applyMode(); });

  /* ── Das Feld ────────────────────────────────────────────── */
  const params = (h = state.cell) => ({ h, band: BAND_CELLS * h, pad: PAD_CELLS * h });

  /* Die Rechnung gehört zu dem Bauteil, für das sie begann: ein neues
     überholt sie (der Gastgeber beendet sie still, js/studio/job.js), und
     ihr Lauf fasst danach nichts mehr an — der jüngste Auftrag gewinnt. */
  let latest = 0;

  async function runField() {
    if (!part.model || state.running) return;
    /* Wer im Modus „Feld" zum ersten Mal rechnet, will das Ergebnis sehen —
       danach geht es von selbst zur Isofläche. Entschieden wird am ENDE:
       wer während der Rechnung in einen anderen Modus ging, bleibt dort.
       Ein NEUES Feld (andere Zellkante) lässt einen, wo man ist. */
    const first = !state.field && shell.mode === 'feld';
    const my = ++latest;
    /* Gerechnet wird mit der Zellkante von JETZT. Wer sie währenddessen
       ändert, bekommt am Ende ein Feld, das als veraltet dasteht. */
    const asked = state.cell;
    state.running = true; state.ready = false; state.cancelled = false;
    host.refreshActions();
    const t0 = performance.now();
    const f = await host.jobs.run({
      label: 'Feld berechnen', note: 'Feld rastern …',
      run: (signal, progress) => hostField.ensure({
        ...params(asked), signal,
        onProgress: (p, what) => progress(p, 'Feld rastern · ' + what + ' … ' + Math.round(p * 100) + ' %')
      }),
      onCancel: () => { state.cancelled = true; }
    }).catch(err => {
      if (my === latest) ui('field-warn').textContent = 'Das Feld konnte nicht gerechnet werden: ' + err.message;
      console.error(err);
      return null;
    });
    if (my !== latest) return;                       // anderes Bauteil: onPartStart hat aufgeräumt
    state.running = false; state.ready = true;
    if (f) adopt(f, asked, performance.now() - t0);
    /* Mit dem Feld werden die Felder der abgeleiteten Modi scharf — auch in
       dem Modus, aus dem gerechnet wurde (vorher erst nach einem Wechsel). */
    syncGates();
    applyMode();
    host.refreshActions();
    if (f && first && shell.mode === 'feld') shell.setMode('isoflaeche');
  }

  /* Ein Feld übernehmen — das eigene oder eines, das ein anderer Schritt der
     Werkbank mit derselben Zellkante gerechnet hat. */
  function adopt(f, asked, ms) {
    state.field = f;
    state.fieldCell = asked;
    state.stats = hostField.stats;
    state.stale = Math.abs(asked - state.cell) > 1e-9;
    state.ms = ms;
    ui('under-slider').max = String(Math.ceil(state.stats.maxIn * 2) / 2);
    if (!state.underTouched) state.under = Math.round(state.stats.maxIn) / 2;
    if (state.under > state.stats.maxIn) state.under = Math.floor(state.stats.maxIn * 2) / 2;
    ui('under').value = fmtPlain(state.under);
    ui('under-slider').value = String(state.under);
    extract();
    updateFieldFacts();
  }

  /** Das Feld des Gastgebers hat sich geändert (die Werkbank: ein anderer
      Schritt hat es gerechnet). Passt es zur Zellkante von hier und ist es
      ein anderes als das gezeigte, gilt ab jetzt dieses. Läuft die eigene
      Rechnung, übernimmt die selbst. */
  function fieldChanged() {
    if (state.running || !part.model) return;
    const f = hostField.peek(params());
    if (!f || f === state.field) return;
    adopt(f, state.cell, 0);
    syncGates();
    applyMode();
    host.refreshActions();
  }

  function markStale() {
    if (!part.model) return;
    state.cancelled = false;
    /* Verglichen wird mit der VERLANGTEN Zellkante: ein angehobenes Feld
       (1,82 statt 1,5 mm) ist das Feld zu 1,5 mm, kein veraltetes. */
    state.stale = !!state.field && Math.abs(state.fieldCell - state.cell) > 1e-9;
    updateFieldFacts();
    host.refreshActions();
  }

  /* ── Isofläche ───────────────────────────────────────────── */
  function extract() {
    if (!state.field) return;
    const t0 = performance.now();
    state.offsetTris = surfaceNets(state.field, -state.under);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(Float32Array.from(state.offsetTris), 3));
    g.computeVertexNormals();
    offsetMesh.geometry.dispose();
    offsetMesh.geometry = g;
    state.extractMs = performance.now() - t0;
    updateOffsetFacts();
    applyMode();
  }

  let extractRaf = 0;
  const maxUnder = () => (state.stats ? state.stats.maxIn : 1e4);
  function setUnder(v, live) {
    state.underTouched = true;
    state.under = Math.max(0, Math.min(maxUnder(), Math.abs(v)));
    ui('under').value = fmtPlain(state.under);
    ui('under-slider').value = String(state.under);
    if (state.field) {
      if (live) { if (!extractRaf) extractRaf = requestAnimationFrame(() => { extractRaf = 0; extract(); }); }
      else extract();
    }
    host.changed('Untermaß');
    return state.under;
  }

  /* ── Wärmezentren ────────────────────────────────────────── */
  function clearHotspots() {
    for (const c of hotGroup.children.slice()) { c.material.dispose(); hotGroup.remove(c); }
  }
  function updateHotspots() {
    clearHotspots();
    const on = state.hot.on && !!state.field && !!state.stats;
    hotGroup.visible = on;
    if (!on) { kpis(ui('hot-kpis'), []); view.invalidate(); return; }
    if (state.hotField !== state.field || state.hotMin !== state.hot.min) {
      state.maxima = thickMaxima(state.field, { minFrac: state.hot.min / 100 });
      state.hotField = state.field;
      state.hotMin = state.hot.min;
    }
    const rings = state.hot.shape === 'kreise';
    const maxIn = Math.max(state.stats.maxIn, 1e-6);
    /* Jede Marke in der Farbe ihrer Wandstärke, auf derselben Leiste wie der Schnitt. */
    for (const m of state.maxima) {
      const color = new T.Color(scale('turbo', turboTrim(m.r / maxIn)));
      const mat = rings
        ? new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: T.DoubleSide, depthTest: false, depthWrite: false })
        : new T.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, transparent: true, opacity: 0.65, depthWrite: false });
      const mesh = new T.Mesh(rings ? hotRingGeo : hotSphereGeo, mat);
      mesh.position.set(m.x, m.y, m.z);
      mesh.scale.setScalar(m.r);
      mesh.renderOrder = 4;
      mesh.userData.r = m.r;
      if (rings) mesh.onBeforeRender = (renderer, scene, camera) => { mesh.quaternion.copy(camera.quaternion); };
      hotGroup.add(mesh);
    }
    const rows = [
      { label: 'Stellen', value: fmt(state.maxima.length, 0) },
      { label: 'größte Wandstärke', value: fmtUnit(2 * state.stats.maxIn, 'mm') }
    ];
    if (state.maxima[0]) {
      const m = state.maxima[0];
      rows.push({ label: 'dickste bei', value: [m.x, m.y, m.z].map(v => fmt(v, 0)).join(' / ') + ' mm' });
    }
    if (state.maxima.length > 1) rows.push({ label: 'kleinste Marke', value: fmtUnit(2 * state.maxima[state.maxima.length - 1].r, 'mm') });
    kpis(ui('hot-kpis'), rows);
    ui('hot-note').textContent = state.maxima.length ? '' : 'Keine Stelle erreicht den Anteil: den Regler „ab" senken.';
    view.invalidate();
  }

  /* ── Schnitt ─────────────────────────────────────────────── */
  const scaleEnd = () => Math.max(state.stats ? state.stats.maxIn : 1, 1e-6);
  /* Die Farben des Schnitts, einmal je Bild geholt: innen die Leiste
     `turbo` (dünn blau, dick rot, turboTrim) als Tafel, außen das Grau des
     Bauteils (dort gibt es keine Wandstärke), die Kontur in der Tinte. Die
     Textur trägt die Werte der Leiste und ist deshalb sRGB. */
  function slicePainter() {
    const tab = lut('turbo');
    const none = hex2rgb(VIEW.noData).map(x => x * 255), ink = hex2rgb(VIEW.lines).map(x => x * 255);
    return (v, h, inn, out, o) => {
      const c = Math.abs(v) < h * 0.6 ? ink : v >= 0 ? none : null;
      if (c) { out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; }
      else {
        const k = 3 * Math.round(turboTrim(-v / inn) * 255);
        out[o] = tab[k]; out[o + 1] = tab[k + 1]; out[o + 2] = tab[k + 2];
      }
      out[o + 3] = 255;
    };
  }
  function updateSlice() {
    const f = state.field;
    if (!f || !state.slice.on) { sliceMesh.visible = false; view.invalidate(); return; }
    const [nx, ny, nz] = f.dims;
    const a = state.slice.axis;
    const n = [nx, ny, nz][a];
    const k = Math.max(0, Math.min(n - 1, Math.round(state.slice.pos / 100 * (n - 1))));
    const coord = f.origin[a] + k * f.h;
    ui('slice-pos-val').textContent = fmtUnit(coord, 'mm');
    const [ua, va] = a === 0 ? [2, 1] : a === 1 ? [0, 2] : [0, 1];
    const w = f.dims[ua], hgt = f.dims[va];
    const px = new Uint8Array(w * hgt * 4);
    const at = (i, j, kk) => f.data[(kk * ny + j) * nx + i];
    const inn = scaleEnd();
    const sliceColor = slicePainter();
    for (let vv = 0; vv < hgt; vv++) {
      for (let uu = 0; uu < w; uu++) {
        const idx = [0, 0, 0];
        idx[a] = k; idx[ua] = uu; idx[va] = vv;
        sliceColor(at(idx[0], idx[1], idx[2]), f.h, inn, px, (vv * w + uu) * 4);
      }
    }
    const tex = new T.DataTexture(px, w, hgt, T.RGBAFormat);
    tex.colorSpace = T.SRGBColorSpace;
    tex.magFilter = T.NearestFilter;
    tex.minFilter = T.LinearFilter;
    tex.needsUpdate = true;
    if (sliceMat.map) sliceMat.map.dispose();
    sliceMat.map = tex;
    sliceMat.needsUpdate = true;
    /* Ein Texel je Rasterpunkt, sein MITTELPUNKT auf dem Punkt: die Ebene ist
       w Zellen breit und reicht eine halbe Zelle über den ersten und letzten
       Punkt hinaus (wie framePlane in js/part/dieviewer.js). Mit (w − 1)
       Zellen lagen die Texel bis zu einer halben Zelle neben ihren Punkten. */
    sliceMesh.geometry.dispose();
    sliceMesh.geometry = new T.PlaneGeometry(w * f.h, hgt * f.h);
    const c = [0, 1, 2].map(ax => f.origin[ax] + (f.dims[ax] - 1) * f.h / 2);
    c[a] = coord;
    sliceMesh.position.set(c[0], c[1], c[2]);
    sliceMesh.rotation.set(0, 0, 0);
    if (a === 0) sliceMesh.rotation.y = -Math.PI / 2;
    else if (a === 1) sliceMesh.rotation.x = Math.PI / 2;
    sliceMesh.visible = true;
    view.invalidate();
  }

  /* ── Farbskala ───────────────────────────────────────────── */
  function updateColorbar() {
    if (!state.field || !state.stats || !(state.slice.on || state.hot.on)) return shell.colorbar(null);
    const inn = scaleEnd();
    shell.colorbar({
      title: 'Wandstärke',
      stops: gradient(t => scale('turbo', turboTrim(t))),
      ticks: [1, 0.75, 0.5, 0.25, 0].map(q => fmtUnit(2 * inn * q, 'mm')),
      extra: (state.slice.on ? chip(VIEW.lines) + 'Bauteilkontur' : '')
        + (state.hot.on ? (state.slice.on ? ' · ' : '') + 'Marken nach Größe gefärbt' : '')
    });
  }

  /* ── Modi: jeder besitzt, was er zeigt ───────────────────── */
  function applyMode() {
    const m = shell.mode;
    const has = !!state.field;
    state.slice.on = m === 'schnitt' && has;
    state.hot.on = m === 'waermezentren' && has;
    const solo = m === 'isoflaeche' && state.show === 'part';
    const opacity = (m === 'schnitt' || m === 'waermezentren') ? Math.min(state.opacity, 0.45) : state.opacity;
    part.setLook({ visible: !(m === 'isoflaeche' && state.show === 'offset' && has), opacity: solo ? 1 : opacity, colors: false });
    offsetMesh.visible = m === 'isoflaeche' && has && state.show !== 'part' && !!(state.offsetTris && state.offsetTris.length);
    updateSlice();
    updateHotspots();
    updateColorbar();
    view.invalidate();
  }

  /* ── Kennzahlen ──────────────────────────────────────────── */
  function updateFieldFacts() {
    const m = part.model;
    if (!m) { ui('field-cost').textContent = ''; ui('field-warn').textContent = ''; facts(ui('field-facts'), []); kpis(ui('field-kpis'), []); return; }
    /* Was der Gastgeber rastern WIRD (js/part/field.js, planField): die Kosten
       nennen das Raster, das wirklich entsteht — vorher standen dort 22,58
       Mio. Punkte, gerechnet wurde still mit einer gröberen Zelle. */
    const { est, asked, lifted } = hostField.plan(params());
    const mb = est.bytes / (1024 * 1024);
    ui('field-cost').textContent = 'Raster ' + est.dims.join(' × ') + ' · ' + fmt(est.samples / 1e6, 2) + ' Mio. Punkte · ' + fmtUnit(mb, 'MB');
    /* Mehr als 16 Mio. Punkte rechnet die Seite nicht: das sagt sie VORHER,
       und die Zeile bleibt stehen, solange das Feld so gerastert ist. */
    ui('field-warn').textContent = lifted
      ? 'Gerastert wird mit ' + fmtUnit(est.h, 'mm', 2) + ': Mit ' + fmtUnit(state.cell, 'mm', 2) + ' wären es ' + fmt(asked.samples / 1e6, 0) + ' Mio. Rasterpunkte, die Grenze sind ' + LIMIT_TEXT
      : '';
    const rows = [['Zellkante', fmtUnit(est.h, 'mm', 2)], ['Raster', est.dims.join(' × ')], ['Rasterpunkte', fmt(est.samples / 1e6, 2) + ' Mio.'], ['Speicher', fmtUnit(mb, 'MB')]];
    if (state.field && !state.stale) rows.push(['Rechenzeit', fmtUnit(state.ms, 'ms', 0)]);
    facts(ui('field-facts'), rows);
    kpis(ui('field-kpis'), state.field && state.stats && !state.stale ? [
      { label: 'größte Wandstärke', value: fmtUnit(2 * state.stats.maxIn, 'mm') },
      { label: 'Feld', value: state.field.dims.join(' × ') + ' · ' + fmtUnit(state.field.h, 'mm', 2) }
    ] : []);
  }
  function updateOffsetFacts() {
    if (!state.field || !state.offsetTris || !state.offsetTris.length) {
      kpis(ui('offset-kpis'), []);
      facts(ui('offset-facts'), []);
      return;
    }
    const vPart = Math.abs(part.model.volume);
    const vOff = Math.abs(volume(state.offsetTris));
    kpis(ui('offset-kpis'), [
      { label: 'Volumenanteil dicker als ' + fmtUnit(2 * state.under, 'mm'), value: fmtUnit(100 * (vPart ? vOff / vPart : 0), '%') },
      { label: 'Volumen in der Isofläche', value: fmtUnit(vOff / 1000, 'cm³') }
    ]);
    facts(ui('offset-facts'), [
      ['Dreiecke', fmt(state.offsetTris.length / 9, 0)],
      ['Volumen Bauteil', fmtUnit(vPart / 1000, 'cm³')],
      ['Inhalt der Isofläche', fmtUnit(surface(state.offsetTris) / 100, 'cm²')],
      ['Ableiten', fmtUnit(state.extractMs, 'ms', 0)]
    ]);
  }

  /* ── Hauptknopf je Modus ─────────────────────────────────── */
  const RUN = 'Feld berechnen';
  function fieldPrimary() {
    if (!part.model) return { label: RUN, disabled: true, reason: 'Zuerst ein Bauteil laden.' };
    /* Nach einem Abbruch sagt die Zeile, was jetzt zu sehen ist. */
    if (!state.field) return { label: RUN, onClick: runField, noteKind: state.cancelled ? 'warn' : '',
      reason: state.cancelled ? 'Abgebrochen: Es gibt noch kein Feld.' : 'Noch kein Feld: Ohne Feld gibt es weder Wandstärke noch Isofläche.' };
    if (state.stale) return { label: 'Feld neu berechnen', onClick: runField, noteKind: 'warn',
      reason: (state.cancelled ? 'Abgebrochen' : 'Zellkante geändert') + ': Das Bild zeigt noch das vorige Feld.' };
    /* Aktuell: nichts zu tun, also kein Knopf — die Zeile sagt, wie es weitergeht. */
    return { hidden: true, noteKind: 'ok', reason: 'Das Feld ist aktuell: weiter mit Isofläche, Schnitt oder Wärmezentren.' };
  }
  /* Die abgeleiteten Modi: ohne Feld der Aufruf zum Rechnen, mit einem
     veralteten derselbe Knopf wie im Modus „Feld", sonst nichts. */
  const needsField = () => (state.field && !state.stale ? null : (state.field ? fieldPrimary() : { label: RUN, onClick: runField, reason: 'Zuerst das Feld berechnen, dann gibt es hier etwas zu sehen.' }));

  const modes = MODES.map(m => ({ ...m }));
  const by = Object.fromEntries(modes.map(m => [m.id, m]));
  by.feld.primary = fieldPrimary;
  by.isoflaeche.primary = needsField;
  by.schnitt.primary = needsField;
  by.waermezentren.primary = needsField;
  for (const m of modes) m.enter = () => { syncGates(); applyMode(); };

  /* Ohne Feld sind die Felder der abgeleiteten Modi gedämpft. */
  function syncGates() {
    const has = !!state.field;
    for (const id of ['isoflaeche', 'schnitt', 'waermezentren']) {
      const sec = shell.modeSection(id);
      if (!sec) continue;
      for (const child of sec.children) child.classList.toggle('disabled', !has);
    }
  }

  /* ── Verdrahtung ─────────────────────────────────────────── */
  /* Die Regler, die fromJSON nachstellt (slider: set ohne Rückruf). */
  const sliders = {};
  function mounted() {
    numberInput(ui('cell'), v => {
      state.cellTouched = true;
      state.cell = Math.max(CELL_RANGE[0], Math.min(CELL_RANGE[1], v));
      hostField.setCell(state.cell);
      markStale();
      host.changed('Zellkante');
      return state.cell;
    }, { min: CELL_RANGE[0], max: CELL_RANGE[1], unit: 'mm' });
    numberInput(ui('under'), v => setUnder(v, false));
    ui('under-slider').addEventListener('input', e => setUnder(+e.target.value, true));
    segButtons(ui('show-seg'), v => { state.show = v; applyMode(); host.changed('Anzeige'); });
    segButtons(ui('slice-seg'), v => { state.slice.axis = +v; updateSlice(); host.changed('Schnittachse'); });
    sliders.slicePos = slider(ui('slice-pos'), v => { state.slice.pos = v; updateSlice(); host.changed('Schnittlage'); }, () => '', null, { fire: false });
    segButtons(ui('hot-seg'), v => { state.hot.shape = v; updateHotspots(); host.changed('Form'); });
    sliders.hotMin = slider(ui('hot-min'), v => { state.hot.min = v; updateHotspots(); host.changed('Schwelle'); }, v => v + ' %', null, { fire: false });
    const pop = shell.darstellung(DARSTELLUNG);
    sliders.opacity = slider(pop.querySelector('[data-ui="opacity"]'), v => { state.opacity = v / 100; applyMode(); host.changed('Deckkraft'); }, v => v + ' %', null, { fire: false });
    updateFieldFacts();
  }

  /* ── Bauteil gewechselt ──────────────────────────────────── */
  /* Ein Bauteil BEGINNT zu laden: eine laufende Rechnung gehört zum alten.
     Sie lief sonst zu Ende (Sekunden bei feiner Zelle) und sperrte so lange
     das Feld des neuen. Der Gastgeber beendet sie still — das ist kein
     Abbruch des Anwenders —, und ihr Lauf fasst nichts mehr an. */
  function onPartStart() {
    state.ready = false;
    latest++;
    /* Die Zeile trug den Fortschritt — sie spräche sonst noch vom alten Teil. */
    if (state.running) shell.setNote('');
    state.running = false;
  }

  function onPart(model) {
    state.field = null; state.fieldCell = 0; state.stats = null; state.offsetTris = null; state.maxima = []; state.hotField = null;
    state.stale = false; state.cancelled = false; state.underTouched = false;
    if (!state.cellTouched) { state.cell = part.cellSuggestion; ui('cell').value = fmtPlain(state.cell); }
    hostField.h = state.cell;
    offsetMesh.geometry.dispose();
    offsetMesh.geometry = new T.BufferGeometry();
    sliceMesh.visible = false;
    clearHotspots();
    updateFieldFacts();
    updateOffsetFacts();
    kpis(ui('hot-kpis'), []);
    syncGates();
    applyMode();
    host.refreshActions();
    state.ready = true;
  }

  /* ── Datei und Export ────────────────────────────────────── */
  const toJSON = () => ({
    format: FORMAT, version: FORMAT_VERSION,
    cell: state.cell, under: state.under, show: state.show, opacity: state.opacity,
    slice: { axis: state.slice.axis, pos: state.slice.pos },
    hot: { shape: state.hot.shape, min: state.hot.min }
  });
  function fromJSON(obj) {
    checkFormat(obj, FORMAT, FORMAT_VERSION, 'Das ist keine Datei der Wandstärkenanalyse.');
    if (Number.isFinite(obj.cell)) { state.cell = Math.max(CELL_RANGE[0], Math.min(CELL_RANGE[1], obj.cell)); state.cellTouched = true; ui('cell').value = fmtPlain(state.cell); hostField.setCell(state.cell); }
    if (Number.isFinite(obj.under)) { state.under = Math.abs(obj.under); state.underTouched = true; ui('under').value = fmtPlain(state.under); ui('under-slider').value = String(state.under); }
    if (obj.show) { state.show = obj.show; segButtonSet(ui('show-seg'), state.show); }
    if (Number.isFinite(obj.opacity)) {
      state.opacity = Math.max(0.1, Math.min(1, obj.opacity));
      sliders.opacity.set(Math.round(state.opacity * 100));
    }
    if (obj.slice) {
      state.slice.axis = +obj.slice.axis || 0;
      state.slice.pos = Number.isFinite(+obj.slice.pos) ? +obj.slice.pos : 50;   // 0 ist eine Lage, kein „fehlt"
      segButtonSet(ui('slice-seg'), String(state.slice.axis));
      sliders.slicePos.set(state.slice.pos);
    }
    if (obj.hot) { state.hot.shape = obj.hot.shape || 'kugeln'; state.hot.min = +obj.hot.min || 75; segButtonSet(ui('hot-seg'), state.hot.shape); sliders.hotMin.set(state.hot.min); }
    markStale();
    if (state.field && !state.stale) extract(); else applyMode();
    host.refreshActions();
  }
  /** Zurück zu den Vorgaben — das Gegenstück zur still übernommenen Einstellung. */
  function resetSettings() {
    fromJSON({
      format: FORMAT, version: FORMAT_VERSION, cell: part.cellSuggestion,
      under: state.stats ? Math.round(state.stats.maxIn) / 2 : 2,
      show: 'both', opacity: 0.35, slice: { axis: 2, pos: 50 }, hot: { shape: 'kugeln', min: 75 }
    });
    state.cellTouched = false; state.underTouched = false;
  }
  const exports = [{
    label: 'Isofläche als STL',
    enabled: () => !!(state.offsetTris && state.offsetTris.length),
    reason: 'Zuerst das Feld berechnen, dann gibt es eine Isofläche.',
    run: () => saveSTL(state.offsetTris, 'DieLogic Isofläche', part.name, 'isoflaeche')
  }];

  /* Die Werkbank: nicht mehr dran — Isofläche, Schnitt und Marken gehen aus
     dem Bild (für ein Werkzeug, das nicht dran ist, gibt es keinen Modus, und
     ohne Modus zeigt applyMode nichts davon); wieder dran — der Modus von
     vorhin. */
  const setActive = () => applyMode();

  const tool = {
    id: 'wandstaerke', modes, startMode: 'feld', settingsOnly: true, mounted, onPart, onPartStart, toJSON, fromJSON, resetSettings, setActive, accepts: [FORMAT], exports,
    /* Was die übrigen Werkzeuge der Seite ihm sagen (die Werkbank). */
    link: { fieldChanged }
  };
  tool.__viewer = { state, view, get partMesh() { return part.mesh; }, offsetMesh, sliceMesh, hotGroup, runField, extract, shell, host, tool };
  return tool;
}
