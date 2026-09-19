/* Entformungsanalyse — das Werkzeug im gemeinsamen Rahmen.

   Ablauf beim Laden eines Bauteils:
     Dreieckssuppe → buildModel → computeVisibility (sechs Richtungen, der
     teure Teil, hängt NUR am Netz; läuft als Rechnung mit Fortschritt und
     Abbrechen) → segment (feste Regeln, Millisekunden).
   Gerechnet wird sofort beim Laden — es gibt keine Regler, die eine
   Bestätigung bräuchten. Die Formöffnung wird automatisch gewählt; X/Y/Z
   lassen sich fest setzen, das rechnet nur die Zuordnung neu.

   Die Reiter sind MODI, und jeder bestimmt allein, was im Viewport steht:
     Bauteil     das graue Netz (Netzkanten wahlweise)
     Entformung  nach Regionen oder Schräge gefärbt, Trennlinie; die Legende
                 der Regionen steht im Viewport
     Formteile   die Regionen als Formteile auseinandergezogen (dieviewer.js)
     Flächen     die projizierten Flächen als Silhouetten jenseits des Bauteils
     Haftung     das Bauteil nach Haftmaß gefärbt, dazu die Karten beider Hälften
   Kein Schalter schaltet einen anderen mit. Das Bauteil selbst gehört dem
   Gastgeber (host.part): hier wird nur sein Farb-Attribut bemalt und gesagt,
   wie es aussehen soll. */

import * as T from 'three';
import { computeVisibility, DIRS } from '../part/visibility.js';
import { segment, UNDERCUT } from '../part/segment.js';
import { draftAngles, draftStats, dirNames } from '../part/draft.js';
import { diePieces, pieceProjections } from '../part/dieview.js';
import { gripPerFace, ejectorMaps } from '../part/ejector.js';
import { createDieView } from '../part/dieviewer.js';
import { rgbCss, facts, segButtons, segButtonSet, slider, colorbar, gradient, chip } from '../ui/controls.js';
import { fmt, fmtUnit, fmtFixed } from '../studio/format.js';
import { kpis } from '../studio/rows.js';
import * as C from '../part/colors.js';
import { MODES, DARSTELLUNG } from './panel.js';

export const FORMAT = 'dielogic-entformung';
export const FORMAT_VERSION = 1;

const RUN = 'Entformung rechnen';
const GRIP_NONE = [0.84, 0.87, 0.88];
const pct = x => fmtFixed(100 * x, 1) + ' %';
const DEFAULTS = { axis: 'auto', movSign: 1, mode: 'regions', draftLimit: 1.5, showParting: true, showEdges: false,
  die: { skirt: 8, part: true }, projView: { alpha: 0.6 }, ej: { mu: 0.3, alpha: 0.7 } };

export function createEntformungTool(host) {
  const { shell, view, part } = host;
  const ui = host.ui;
  /* Die Netzkanten stehen unter „Darstellung" — das Aufklappfeld gehört dem
     Rahmen und steht schon, bevor die Felder der Modi eingesetzt sind. */
  const darstellung = shell.darstellung(DARSTELLUNG);
  const edgesBox = () => darstellung.querySelector('[data-ui="show-edges"]');

  const state = {
    vis: null, seg: null, draft: null,
    axis: 'auto',       // Formöffnung: 'auto' oder 0/1/2
    movSign: 1,         // welche Hälfte auf der Achse die bewegliche ist: +1 oder −1
    mode: 'regions',    // Einfärbung im Modus Entformung: 'regions' | 'draft'
    draftLimit: 1.5,
    showParting: true,
    showEdges: false,
    /* Formteile: Abstand und Rand der Stücke, das Bauteil durchscheinend
       dazwischen, je Formteil ein Schalter (label → false = ausgeblendet). */
    die: { dist: 60, skirt: 8, part: true, show: {}, distTouched: false },
    pieces: null, proj: null,
    projView: { gap: 30, alpha: 0.6, gapTouched: false },
    grip: null, ejMaps: null,
    ej: { mu: 0.3, gap: 30, alpha: 0.7, gapTouched: false },
    analysed: false, running: false, cancelled: false, ready: false,
    visMs: 0, segMs: 0,
    get model() { return part.model; },
    get name() { return part.name; },
    get tab() { return shell.mode; }
  };

  /* ── Körper ──────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);
  const partingLines = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x002733 }));
  group.add(partingLines);
  const edgeLines = new T.LineSegments(new T.BufferGeometry(),
    new T.LineBasicMaterial({ color: 0x4c6870, transparent: true, opacity: 0.35 }));
  edgeLines.visible = false;
  group.add(edgeLines);
  const dieView = createDieView(view);
  let dieBuiltFor = null;                          // die Stücke, aus denen die Formteile gebaut sind

  /* ── Bauteil gewechselt: danach sofort rechnen ───────────── */
  function onPart(model) {
    state.vis = null; state.seg = null; state.draft = null;
    state.pieces = null; state.proj = null; state.grip = null; state.ejMaps = null;
    state.analysed = false; state.cancelled = false; state.ready = false;
    dieBuiltFor = null;
    /* Kantenbild nur bei überschaubaren Netzen — sonst kostet es mehr, als es zeigt. */
    edgeLines.geometry.dispose();
    const edgesOk = model.faceCount <= 60000;
    edgeLines.geometry = edgesOk ? new T.WireframeGeometry(part.mesh.geometry) : new T.BufferGeometry();
    edgesBox().disabled = !edgesOk;
    if (!edgesOk) { edgesBox().checked = false; state.showEdges = false; }
    clearAnalysis();
    /* Abstände folgen der Bauteilgröße, solange niemand sie gesetzt hat. */
    const longest = Math.max(...model.bounds.size);
    ui('die-dist').max = String(Math.max(50, Math.round(longest * 1.2)));
    if (!state.die.distTouched) setSlider('die-dist', Math.max(10, Math.round(longest * 0.25)), ' mm');
    state.die.dist = +ui('die-dist').value;
    for (const [name, st] of [['proj-gap', state.projView], ['ej-gap', state.ej]]) {
      ui(name).max = String(Math.max(50, Math.round(longest)));
      if (!st.gapTouched) setSlider(name, Math.max(10, Math.round(longest * 0.08)), ' mm');
      st.gap = +ui(name).value;
    }
    /* Erst nach dem Laden: js/part/partsource.js räumt seinen Schleier weg,
       sobald onLoad zurückkehrt — die Rechnung setzt ihren danach. */
    setTimeout(runAnalysis, 0);
  }

  function setSlider(name, v, unit) {
    ui(name).value = String(v);
    ui(name + '-val').textContent = fmt(v, 0) + unit;
  }

  /* Die Sichtbarkeit hängt nur am Netz und wird einmal je Bauteil gerechnet;
     die Zuordnung danach bei jedem Achsenwechsel (Millisekunden). Kommt
     währenddessen ein anderes Teil, bricht die laufende Rechnung ab und
     beginnt für das neue von vorn. */
  let rerun = false;
  async function runAnalysis() {
    const model = part.model;
    if (!model) return;
    if (state.running) { rerun = true; host.jobs.cancel(); return; }
    state.running = true; state.ready = false; state.cancelled = false;
    host.refreshActions();
    ui('analysis-state').textContent = 'rechnet … ' + fmt(model.faceCount, 0) + ' Dreiecke';
    const t0 = performance.now();
    const vis = await host.jobs.run({
      label: RUN, note: 'Sichtbarkeit rechnen …',
      run: (signal, progress) => computeVisibility(model, {
        /* Bei sehr großen Netzen weniger Abtastpunkte je Dreieck — der
           Unterschied ist gering, die Rechenzeit halbiert sich. */
        samples: model.faceCount > 120000 ? 4 : 7, signal,
        onProgress: (p, label) => progress(p, 'Sichtbarkeit ' + label + ' … ' + Math.round(p * 100) + ' %')
      }),
      onCancel: () => { state.cancelled = !rerun; }
    }).catch(err => {
      shell.toast('Die Analyse ist gescheitert: ' + err.message, { ms: 9000 });
      console.error(err);
      return null;
    });
    state.running = false;
    if (vis && part.model === model) {
      state.vis = vis;
      state.visMs = performance.now() - t0;
      state.analysed = true;
      recompute();
    } else if (!state.analysed) ui('analysis-state').textContent = '';
    const again = rerun || part.model !== model;
    rerun = false;
    state.ready = !again;
    host.refreshActions();
    if (again) runAnalysis();
  }

  /* Anzeige ohne Analyse: graues Bauteil, leere Legenden und Listen. */
  function clearAnalysis() {
    partingLines.visible = false;
    ui('parting-count').textContent = '0';
    for (const name of ['seg-kpis', 'proj-kpis', 'ej-kpis']) kpis(ui(name), []);
    facts(ui('seg-facts'), []);
    ui('die-pieces').innerHTML = '';
    ui('analysis-state').textContent = '';
    ui('ej-warn').textContent = '';
    dieView.build(null, null);
    dieView.setProjections(null);
    dieView.setEjector(null);
    applyMode();
  }

  /* ── Zuordnung (Millisekunden — Regeln, keine Regler) ────── */
  function recompute() {
    const model = part.model;
    if (!model || !state.vis) return;
    const t0 = performance.now();
    state.seg = segment(model, state.vis, { mainAxis: state.axis, movingSign: state.movSign });
    state.draft = draftAngles(model, state.vis, state.seg.label);
    state.pieces = diePieces(model, state.seg, { skirt: state.die.skirt });
    state.proj = pieceProjections(state.pieces, model, state.seg);
    state.grip = gripPerFace(model, state.vis, state.seg, { mu: state.ej.mu, movSign: state.movSign });
    state.ejMaps = null;
    dieBuiltFor = null;
    state.segMs = performance.now() - t0;
    const ax = 'XYZ'[state.seg.mainAxis];
    const mov = ui('mov-seg').querySelectorAll('button');
    mov[0].textContent = '+' + ax;
    mov[1].textContent = '−' + ax;
    updatePartingLine();
    updateSegKpis();
    updateProjKpis();
    updateGripKpis();
    updatePieceRows();
    dieView.setPieces(state.pieces);
    dieView.setProjections(state.proj);
    dieView.setEjector(null);
    applyMode();
  }

  /* ── Modus: der Reiter bestimmt den Viewport ─────────────── */

  /** Die Einfärbung des Bauteils im aktuellen Modus. */
  const colouring = () => (shell.mode === 'entformung' ? state.mode : shell.mode === 'haftung' ? 'grip' : 'plain');

  function applyMode() {
    const t = shell.mode, has = !!state.seg;
    updateColors();
    updateColorbar();
    updateLegend();
    if (t === 'formteile' && has) { ensureDie(); dieView.show(true); }
    else dieView.show(false);
    dieView.showProjections(t === 'flaechen' && has);
    if (t === 'haftung' && has) { ensureMap(); dieView.showEjector(true); }
    else dieView.showEjector(false);
    if (t === 'flaechen') { dieView.setGap(state.projView.gap); dieView.setOverlayOpacity(state.projView.alpha); }
    if (t === 'haftung') { dieView.setGap(state.ej.gap); dieView.setOverlayOpacity(state.ej.alpha); }
    applyOpacity();
  }

  /* Die Formteile aus den aktuellen Stücken — einmal je Zuordnung, dann nur
     noch ein- und ausblenden. */
  function ensureDie() {
    if (dieBuiltFor !== state.pieces) {
      dieView.build(part.model, state.seg, { pieces: state.pieces });
      dieView.setDistance(state.die.dist);
      dieBuiltFor = state.pieces;
    }
    for (let l = 0; l < 6; l++) dieView.setVisible(l, state.die.show[l] !== false);
  }

  /* Die Haftkarten beider Hälften — gerechnet, wenn sie gebraucht werden,
     einmal je Haftmaß; auf gemeinsamer Skala, damit die Seiten vergleichbar
     sind. Schieber bekommen keine Karte: sie haften nicht mit. */
  function ensureMap() {
    if (state.ejMaps && state.ejMaps.grip === state.grip) return;
    const labels = [halfLabel(1), halfLabel(-1)].filter(l => l >= 0);
    state.ejMaps = ejectorMaps(part.model, state.seg, state.grip, labels);
    state.ejMaps.grip = state.grip;
    dieView.setEjector(state.ejMaps);
  }

  /* Das Bauteil: deckend — im Modus Formteile durchscheinend zwischen den
     Formteilen oder ganz weg. Trennlinie nur in der Entformung, Netzkanten
     nur im Modus Bauteil. */
  function applyOpacity() {
    const ghost = shell.mode === 'formteile' && !!state.seg;
    const o = ghost ? (state.die.part ? 0.18 : 0) : 1;
    part.setLook({ visible: o > 0, opacity: o, colors: !!state.seg && colouring() !== 'plain' });
    const n = partingLines.geometry.getAttribute('position');
    partingLines.visible = shell.mode === 'entformung' && state.showParting && !!state.seg && !!n && n.count > 0;
    /* Netzkanten gehören auf das Bauteil, das man sieht — bei den Formteilen
       ist es Schatten oder weg. */
    edgeLines.visible = state.showEdges && !!part.model && !ghost;
    view.invalidate();
  }

  /** Das Formteil der Hälfte: sign +1 die bewegliche, −1 die feste Seite —
      welche das auf der Achse ist, sagt state.movSign. */
  function halfLabel(sign) {
    if (!state.seg) return -1;
    return DIRS.findIndex(d => d.axis === state.seg.mainAxis && d.sign === sign * state.movSign);
  }

  /* ── Farben ──────────────────────────────────────────────── */
  function updateColors() {
    const model = part.model, { seg, draft } = state;
    const mode = colouring();
    const col = part.colors();
    if (!col || !model || !seg || mode === 'plain') return;      // grau: das Material des Gastgebers
    const arr = col.array;
    for (let f = 0; f < model.faceCount; f++) {
      let rgb;
      if (mode === 'grip') rgb = gripColor(f);
      else if (seg.label[f] === UNDERCUT) rgb = C.hex2rgb(mode === 'draft' ? C.UNDERCUT_DARK : C.UNDERCUT_COLOR);
      else if (mode === 'draft') rgb = C.draftColor(draft[f], state.draftLimit);
      else rgb = C.hex2rgb(C.REGION_COLORS[seg.label[f]]);
      for (let e = 0; e < 3; e++) {
        arr[f * 9 + e * 3] = rgb[0];
        arr[f * 9 + e * 3 + 1] = rgb[1];
        arr[f * 9 + e * 3 + 2] = rgb[2];
      }
    }
    col.needsUpdate = true;
  }

  /* Haftung: Turbo nach dem Haftmaß je Fläche; was nicht haftet (Außenwand,
     waagerecht, Schieber, Hinterschnitt), bleibt hellgrau. */
  function gripColor(f) {
    const g = state.grip;
    if (!g || !(g.intensity[f] > 0) || !(g.maxIntensity > 0)) return GRIP_NONE;
    return C.turbo(0.08 + 0.84 * Math.min(1, g.intensity[f] / g.maxIntensity));
  }

  function updatePartingLine() {
    const model = part.model, { seg } = state;
    if (!seg) return;
    const pts = [];
    const { nbr, index, verts, faceCount: F } = model;
    for (let f = 0; f < F; f++) {
      for (let e = 0; e < 3; e++) {
        const w = nbr[f * 3 + e];
        if (w < 0 || w < f || seg.label[f] === seg.label[w]) continue;
        const i0 = index[f * 3 + e], i1 = index[f * 3 + (e + 1) % 3];
        pts.push(verts[i0 * 3], verts[i0 * 3 + 1], verts[i0 * 3 + 2], verts[i1 * 3], verts[i1 * 3 + 1], verts[i1 * 3 + 2]);
      }
    }
    partingLines.geometry.dispose();
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(Float32Array.from(pts), 3));
    partingLines.geometry = g;
    ui('parting-count').textContent = fmt(pts.length / 6, 0);
  }

  /* ── Legende, Farbskala und Kennzahlen ───────────────────── */

  /* Die Legende der Regionen steht im Viewport: Name und Flächenanteil, nur
     was vorkommt. Schräge und Haftung haben eine Ordnung — die zeigt die
     Farbskala, eine Legende wäre dort doppelt. */
  function updateLegend() {
    const model = part.model, { seg } = state;
    if (!seg || !model || shell.mode !== 'entformung' || state.mode !== 'regions') { shell.legend(''); return; }
    const A = model.totalArea || 1;
    const names = dirNames(seg.mainAxis, state.movSign);
    const rows = names.map((d, i) => ({ name: d.name, color: C.REGION_COLORS[i], frac: seg.areaByLabel[i] / A }));
    rows.push({ name: 'Hinterschnitt', color: C.UNDERCUT_COLOR, frac: seg.areaByLabel[6] / A });
    shell.legend('<div class="st-title">Flächenanteil</div>' + rows.filter(r => r.frac >= 0.0005).map(r =>
      '<div class="lg-row">' + chip(r.color) + '<span>' + r.name + '</span><span class="pct">' + pct(r.frac) + '</span></div>').join(''));
  }

  function updateColorbar() {
    const mode = state.seg ? colouring() : 'plain';
    if (mode === 'grip') {
      return colorbar({
        title: 'Haftung',
        stops: gradient(t => rgbCss(C.turbo(0.08 + 0.84 * t))),
        ticks: ['stark', '', '', '', 'schwach'],
        extra: chip(rgbCss(GRIP_NONE)) + 'haftet nicht'
      });
    }
    if (mode !== 'draft') return colorbar(null);
    const lim = state.draftLimit, top = 3 * lim;
    colorbar({
      title: 'Entformschräge',
      stops: gradient(t => rgbCss(C.draftColor(top * t, lim))),
      ticks: [top, 2 * lim, lim, 0].map(v => fmt(v) + '°'),
      extra: chip(C.UNDERCUT_DARK) + 'Hinterschnitt'
    });
  }

  /* Die Bilanz: nach Regionen Hälften / Schieber / Hinterschnitt, nach
     Schräge kleinste Schräge / unter Grenzwert / Hinterschnitt. Ein
     Hinterschnitt lässt sich nicht entformen — das Urteil ist rot. */
  function updateSegKpis() {
    const model = part.model, { seg } = state;
    if (!seg || !model) return;
    const A = model.totalArea || 1;
    let halves = 0, sliders = 0;
    for (let d = 0; d < 6; d++) (DIRS[d].axis === seg.mainAxis ? halves += seg.areaByLabel[d] : sliders += seg.areaByLabel[d]);
    const axisName = 'XYZ'[seg.mainAxis];
    ui('analysis-state').textContent = 'Formöffnung ' + axisName + (seg.auto ? ' (automatisch gewählt)' : ' (fest gewählt)')
      + ' · bewegliche Seite ' + (state.movSign > 0 ? '+' : '−') + axisName;
    const under = seg.areaByLabel[6] / A;
    const underRow = { label: 'Hinterschnitt', value: pct(under), verdict: under >= 0.0005 ? 'bad' : 'ok' };
    if (state.mode === 'draft') {
      const st = draftStats(model, state.draft, seg.label, state.draftLimit);
      kpis(ui('seg-kpis'), [
        { label: 'kleinste Schräge', value: fmtUnit(st.min, '°'), verdict: st.min < state.draftLimit ? 'warn' : 'ok' },
        { label: 'unter Grenzwert', value: pct(st.belowFrac), verdict: st.belowFrac >= 0.0005 ? 'warn' : 'ok' },
        underRow
      ]);
    } else {
      kpis(ui('seg-kpis'), [
        { label: 'Formhälften', value: pct(halves / A) },
        { label: 'Schieber', value: pct(sliders / A) },
        underRow
      ]);
    }
    const rows = [];
    if (seg.sliverArea > 0) rows.push(['Splitter den Hälften zugeschlagen', fmtUnit(seg.sliverArea, 'mm²', 1)]);
    rows.push(['Rechenzeit', fmtUnit(state.visMs + state.segMs, 'ms') + ' (Sichtbarkeit ' + fmtUnit(state.visMs, 'ms') + ')']);
    facts(ui('seg-facts'), rows);
  }

  /* ── Formteile: je mögliches Formteil ein Schalter ───────── */
  function updatePieceRows() {
    const el = ui('die-pieces');
    const model = part.model, { seg } = state;
    if (!seg || !model) { el.innerHTML = ''; return; }
    const names = dirNames(seg.mainAxis, state.movSign);
    const A = model.totalArea || 1;
    /* Erst die beiden Hälften, dann die vier Schieber in fester Reihenfolge. */
    const order = [halfLabel(1), halfLabel(-1)].concat([0, 1, 2, 3, 4, 5].filter(l => DIRS[l].axis !== seg.mainAxis));
    let html = order.map(l => {
      const area = seg.areaByLabel[l], has = area > 0;
      const on = has && state.die.show[l] !== false;
      return '<label class="inline piece-row' + (has ? '' : ' off') + '">'
        + '<input type="checkbox" data-label="' + l + '"' + (on ? ' checked' : '') + (has ? '' : ' disabled') + '>'
        + chip(C.REGION_COLORS[l]) + '<span class="name">' + names[l].name + '</span>'
        + '<span class="pct">' + (has ? pct(area / A) : 'nicht in der Form') + '</span></label>';
    }).join('');
    if (seg.areaByLabel[6] > 0) {
      html += '<div class="legend-row">' + chip(C.UNDERCUT_COLOR) + '<span class="name">Hinterschnitt: bleibt rot am Ort</span>'
        + '<span class="pct">' + pct(seg.areaByLabel[6] / A) + '</span></div>';
    }
    el.innerHTML = html;
  }

  /* ── Projizierte Flächen ─────────────────────────────────── */
  function updateProjKpis() {
    const { seg, proj } = state;
    if (!seg || !proj) return;
    const names = dirNames(seg.mainAxis, state.movSign);
    const cm2 = a => fmtFixed(a / 100, 1) + ' cm²';
    const rows = proj.pieces.map(q => ({ label: chip(C.REGION_COLORS[q.label]) + ' ' + names[q.label].name, value: cm2(q.area) }));
    rows.push({ label: 'Bauteil auf die Trennebene', value: cm2(proj.total.area) });
    kpis(ui('proj-kpis'), rows);
  }

  /* ── Haftung ─────────────────────────────────────────────── */
  function updateGripKpis() {
    const { seg, grip } = state;
    if (!seg || !grip) return;
    const sum = grip.mov + grip.fix;
    const movPct = sum > 0 ? 100 * grip.mov / sum : 50;
    const wrongSide = sum > 0 && grip.fix > grip.mov;
    kpis(ui('ej-kpis'), [
      { label: 'Haftung bewegliche Seite', value: fmtUnit(movPct, '%'), verdict: sum <= 0 ? '' : wrongSide ? 'bad' : 'ok' },
      { label: 'Haftung feste Seite', value: fmtUnit(100 - movPct, '%') }
    ]);
    ui('ej-warn').textContent = sum <= 0 ? 'Keine Fläche haftet: Das Teil hält sich nirgends.'
      : wrongSide ? 'Das Teil haftet stärker an der festen Seite: Beim Öffnen bliebe es dort, nicht bei den Auswerfern.' : '';
  }

  /* ── Hauptknopf: nur, wenn die Analyse aussteht ──────────── */
  function gate() {
    if (!part.model) return { label: RUN, disabled: true, reason: 'Zuerst ein Bauteil laden.' };
    if (state.analysed || state.running) return null;
    return { label: RUN, onClick: runAnalysis, noteKind: state.cancelled ? 'warn' : '',
      reason: state.cancelled ? 'Abgebrochen: Das Bauteil ist noch nicht untersucht.' : 'Die Analyse steht noch aus.' };
  }
  const modes = MODES.map(m => ({ ...m }));
  for (const m of modes) {
    m.primary = gate;
    m.enter = () => applyMode();
    m.leave = () => {};
  }

  /* ── Verdrahtung ─────────────────────────────────────────── */
  /* slider() meldet seinen Anfangswert schon beim Einbau — das ist keine
     Änderung. Gemeldet wird erst, wenn alles verdrahtet ist. */
  let wired = false;
  const changed = label => { if (wired) host.changed(label); };

  function mounted() {
    /* Bauteil */
    edgesBox().addEventListener('change', e => { state.showEdges = e.target.checked; applyOpacity(); changed('Netzkanten'); });

    /* Entformung */
    segButtons(ui('axis-seg'), v => { state.axis = v === 'auto' ? 'auto' : +v; recompute(); changed('Formöffnung'); });
    segButtons(ui('mov-seg'), v => { state.movSign = +v === -1 ? -1 : 1; recompute(); changed('Bewegliche Seite'); });
    segButtons(ui('mode-seg'), v => { setColouring(v); changed('Einfärbung'); });
    slider(ui('draft-limit'), v => {
      state.draftLimit = v;
      if (state.seg) { updateSegKpis(); applyMode(); }
      changed('Grenzwert');
    }, v => fmt(v) + ' °');
    ui('show-parting').addEventListener('change', e => { state.showParting = e.target.checked; applyOpacity(); changed('Trennlinie'); });

    /* Formteile */
    slider(ui('die-dist'), v => {
      state.die.dist = v;
      if (v !== +ui('die-dist').defaultValue) state.die.distTouched = true;
      dieView.setDistance(v);
      changed('Abstand');
    }, v => fmt(v, 0) + ' mm');
    let skirtTimer = 0;
    slider(ui('die-skirt'), v => {
      state.die.skirt = v;
      clearTimeout(skirtTimer);
      if (state.seg) skirtTimer = setTimeout(() => {
        state.pieces = diePieces(part.model, state.seg, { skirt: state.die.skirt });
        dieBuiltFor = null;
        dieView.setPieces(state.pieces);
        applyMode();
      }, 120);
      changed('Rand');
    }, v => fmt(v, 0) + ' mm');
    ui('die-part').addEventListener('change', e => { state.die.part = e.target.checked; applyOpacity(); changed('Bauteil dazwischen'); });
    ui('die-pieces').addEventListener('change', e => {
      const l = Number(e.target && e.target.dataset ? e.target.dataset.label : NaN);
      if (!Number.isInteger(l)) return;
      state.die.show[l] = !!e.target.checked;
      dieView.setVisible(l, state.die.show[l]);
    });

    /* Flächen */
    slider(ui('proj-gap'), v => {
      state.projView.gap = v;
      if (v !== +ui('proj-gap').defaultValue) state.projView.gapTouched = true;
      if (shell.mode === 'flaechen') dieView.setGap(v);
      changed('Abstand');
    }, v => fmt(v, 0) + ' mm');
    slider(ui('proj-alpha'), v => {
      state.projView.alpha = v / 100;
      if (shell.mode === 'flaechen') dieView.setOverlayOpacity(state.projView.alpha);
      changed('Deckkraft');
    }, v => fmt(v, 0) + ' %');

    /* Haftung */
    slider(ui('ej-mu'), v => {
      state.ej.mu = v;
      if (state.seg) {
        state.grip = gripPerFace(part.model, state.vis, state.seg, { mu: v, movSign: state.movSign });
        state.ejMaps = null;
        updateGripKpis();
        applyMode();
      }
      changed('Reibwert');
    }, v => fmt(v, 2));
    slider(ui('ej-gap'), v => {
      state.ej.gap = v;
      if (v !== +ui('ej-gap').defaultValue) state.ej.gapTouched = true;
      if (shell.mode === 'haftung') dieView.setGap(v);
      changed('Abstand');
    }, v => fmt(v, 0) + ' mm');
    slider(ui('ej-alpha'), v => {
      state.ej.alpha = v / 100;
      if (shell.mode === 'haftung') dieView.setOverlayOpacity(state.ej.alpha);
      changed('Deckkraft');
    }, v => fmt(v, 0) + ' %');

    wireHover();
    wired = true;
  }

  function setColouring(v) {
    state.mode = v === 'draft' ? 'draft' : 'regions';
    ui('draft-block').hidden = state.mode !== 'draft';      // der Grenzwert gehört zur Schräge
    if (state.seg) updateSegKpis();
    applyMode();
  }

  /* Hover: Region, Entformschräge und Haftung des Dreiecks unter dem Zeiger.
     Der Strahlentest läuft ohne Beschleunigungsstruktur über das ganze Netz —
     gemessen 9,7 ms je Ereignis bei 197k Dreiecken, und pointermove feuert so
     oft, wie der Zeiger Positionen meldet. Deshalb wird nur die zuletzt
     gemeldete Position gemerkt und höchstens einmal je Bild ausgewertet. */
  function wireHover() {
    const ray = new T.Raycaster();
    const canvas = view.renderer.domElement;
    let hoverAt = null, hoverQueued = false, shown = false;
    const clear = () => { if (shown) { shell.status(''); shown = false; } };
    canvas.addEventListener('pointermove', ev => {
      hoverAt = { x: ev.clientX, y: ev.clientY };
      if (hoverQueued) return;
      hoverQueued = true;
      requestAnimationFrame(() => { hoverQueued = false; if (hoverAt) evalHover(hoverAt); });
    });
    canvas.addEventListener('pointerleave', () => { hoverAt = null; clear(); });
    function evalHover(at) {
      if (!state.seg || !part.mesh.visible) return clear();
      const r = canvas.getBoundingClientRect();
      const p = new T.Vector2(((at.x - r.left) / r.width) * 2 - 1, -((at.y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, view.camera);
      const hit = ray.intersectObject(part.mesh, false)[0];
      if (!hit) return clear();
      const f = hit.faceIndex;
      const l = state.seg.label[f];
      const names = dirNames(state.seg.mainAxis, state.movSign);
      const seen = [];
      for (let d = 0; d < 6; d++) if (state.seg.cand[f] & (1 << d)) seen.push(DIRS[d].label);
      const g = state.grip && state.grip.intensity[f] > 0 && state.grip.maxIntensity > 0
        ? ' · Haftung ' + fmtUnit(100 * state.grip.intensity[f] / state.grip.maxIntensity, '%') : '';
      shell.status('<b>' + (l === UNDERCUT ? 'Hinterschnitt' : names[l].name) + '</b>'
        + ' · Entformschräge ' + fmtUnit(state.draft[f], '°')
        + ' · frei gesehen aus: ' + (seen.length ? seen.join(' ') : 'keiner Richtung') + g);
      shown = true;
    }
  }

  /* ── Einstellungen: merken, laden, zurücksetzen ──────────── */
  const toJSON = () => ({
    format: FORMAT, version: FORMAT_VERSION,
    axis: state.axis, movSign: state.movSign, mode: state.mode, draftLimit: state.draftLimit,
    showParting: state.showParting, showEdges: state.showEdges,
    die: { dist: state.die.distTouched ? state.die.dist : null, skirt: state.die.skirt, part: state.die.part },
    projView: { gap: state.projView.gapTouched ? state.projView.gap : null, alpha: state.projView.alpha },
    ej: { mu: state.ej.mu, gap: state.ej.gapTouched ? state.ej.gap : null, alpha: state.ej.alpha }
  });

  function fromJSON(obj) {
    if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Datei der Entformungsanalyse.');
    if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
    const num = (v, lo, hi, d) => (Number.isFinite(+v) && v !== null ? Math.max(lo, Math.min(hi, +v)) : d);
    state.axis = [0, 1, 2].includes(obj.axis) ? obj.axis : 'auto';
    state.movSign = obj.movSign === -1 ? -1 : 1;
    state.draftLimit = num(obj.draftLimit, 0.5, 5, state.draftLimit);
    state.showParting = obj.showParting !== false;
    state.showEdges = !!obj.showEdges && !edgesBox().disabled;
    segButtonSet(ui('axis-seg'), String(state.axis));
    segButtonSet(ui('mov-seg'), String(state.movSign));
    segButtonSet(ui('mode-seg'), obj.mode === 'draft' ? 'draft' : 'regions');
    ui('show-parting').checked = state.showParting;
    edgesBox().checked = state.showEdges;
    ui('draft-limit').value = String(state.draftLimit);
    ui('draft-limit-val').textContent = fmt(state.draftLimit) + ' °';
    const d = obj.die || {}, pv = obj.projView || {}, ej = obj.ej || {};
    state.die.skirt = num(d.skirt, 0, 500, state.die.skirt);
    state.die.part = d.part !== false;
    ui('die-part').checked = state.die.part;
    setSlider('die-skirt', state.die.skirt, ' mm');
    if (d.dist !== null && d.dist !== undefined) { state.die.dist = num(d.dist, 0, +ui('die-dist').max, state.die.dist); state.die.distTouched = true; setSlider('die-dist', state.die.dist, ' mm'); dieView.setDistance(state.die.dist); }
    state.projView.alpha = num(pv.alpha, 0.1, 1, state.projView.alpha);
    setSlider('proj-alpha', Math.round(state.projView.alpha * 100), ' %');
    if (pv.gap !== null && pv.gap !== undefined) { state.projView.gap = num(pv.gap, 0, +ui('proj-gap').max, state.projView.gap); state.projView.gapTouched = true; setSlider('proj-gap', state.projView.gap, ' mm'); }
    state.ej.mu = num(ej.mu, 0.1, 0.6, state.ej.mu);
    ui('ej-mu').value = String(state.ej.mu);
    ui('ej-mu-val').textContent = fmt(state.ej.mu, 2);
    state.ej.alpha = num(ej.alpha, 0.1, 1, state.ej.alpha);
    setSlider('ej-alpha', Math.round(state.ej.alpha * 100), ' %');
    if (ej.gap !== null && ej.gap !== undefined) { state.ej.gap = num(ej.gap, 0, +ui('ej-gap').max, state.ej.gap); state.ej.gapTouched = true; setSlider('ej-gap', state.ej.gap, ' mm'); }
    state.mode = obj.mode === 'draft' ? 'draft' : 'regions';
    ui('draft-block').hidden = state.mode !== 'draft';
    if (state.vis) recompute(); else applyMode();
    host.refreshActions();
  }

  /** Zurück zu den Vorgaben — das Gegenstück zur still übernommenen Einstellung. */
  function resetSettings() {
    state.die.distTouched = false; state.projView.gapTouched = false; state.ej.gapTouched = false;
    fromJSON({ format: FORMAT, version: FORMAT_VERSION, ...DEFAULTS,
      die: { ...DEFAULTS.die, dist: null }, projView: { ...DEFAULTS.projView, gap: null }, ej: { ...DEFAULTS.ej, gap: null } });
    const m = part.model;
    if (m) {
      const longest = Math.max(...m.bounds.size);
      setSlider('die-dist', Math.max(10, Math.round(longest * 0.25)), ' mm');
      state.die.dist = +ui('die-dist').value; dieView.setDistance(state.die.dist);
      for (const [name, st] of [['proj-gap', state.projView], ['ej-gap', state.ej]]) { setSlider(name, Math.max(10, Math.round(longest * 0.08)), ' mm'); st.gap = +ui(name).value; }
      applyMode();
    }
  }

  const tool = {
    id: 'entformung', modes, startMode: 'entformung', settingsOnly: true,
    mounted, onPart, onPartStart: () => { state.ready = false; }, toJSON, fromJSON, resetSettings, accepts: [FORMAT], exports: [],
    state, group, dieView, recompute, runAnalysis
  };
  tool.__viewer = {
    state, view, get partMesh() { return part.mesh; }, partingLines, edgeLines, dieView,
    recompute, runAnalysis, showTab: id => shell.setMode(id), colouring, shell, host, tool
  };
  return tool;
}
