/* Entformungsanalyse — das Werkzeug im gemeinsamen Rahmen.

   Ablauf beim Laden eines Bauteils:
     Dreieckssuppe → buildModel → computeVisibility (sechs Richtungen, der
     teure Teil, hängt NUR am Netz; läuft als Rechnung mit Fortschritt und
     Abbrechen) → segment (feste Regeln, Millisekunden).
   Gerechnet wird sofort beim Laden — es gibt keine Regler, die eine
   Bestätigung bräuchten. Die Formöffnung wird automatisch gewählt; X/Y/Z
   lassen sich fest setzen, das rechnet nur die Zuordnung neu.

   Die Reiter sind MODI, und jeder bestimmt allein, was im Viewport steht:
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
import { facts, segButtons, segButtonSet, slider, gradient, chip } from '../ui/controls.js';
import { fmt, fmtUnit, fmtFixed } from '../studio/format.js';
import { kpis } from '../studio/rows.js';
import { checkFormat } from '../studio/planio.js';
import { rayAt, hoverProbe } from '../viewmath.js';
import {
  onScheme, VIEW, scale, scaleFn, linRgb, turboTrim, regionColor, undercutColor, undercutDark, draftColor, draftHex
} from '../part/colors.js';
import { MODES, DARSTELLUNG } from './panel.js';

export const FORMAT = 'dielogic-entformung';
export const FORMAT_VERSION = 1;

const RUN = 'Entformung rechnen';
const RERUN = 'Neu rechnen';
const pct = x => fmtFixed(100 * x, 1) + ' %';
const DEFAULTS = { axis: 'auto', movSign: 1, mode: 'regions', draftLimit: 1.5, showParting: true, showEdges: false,
  die: { skirt: 8, part: true }, projView: { alpha: 0.6 }, ej: { mu: 0.3, alpha: 0.7 } };

/**
 * @param opts.axisNote  seg → Satz, der an die Zeile der Formöffnung
 *                       angehängt wird (die Werkbank rechnet mit Z und sagt,
 *                       wenn die Analyse eine andere Achse findet)
 */
export function createEntformungTool(host, opts = {}) {
  const { shell, view, part } = host;
  const ui = host.ui;
  /* Auf der Werkbank ist das Werkzeug nur dran, solange einer seiner Modi
     zu sehen ist (setActive); auf seiner eigenen Seite immer. */
  let active = true;
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
  /* Die Trennlinie in der Tinte des Farbschemas, die Netzkanten in seiner
     Nebenschrift. */
  const partingLines = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: VIEW.lines }));
  group.add(partingLines);
  const edgeLines = new T.LineSegments(new T.BufferGeometry(),
    new T.LineBasicMaterial({ color: VIEW.edges, transparent: true, opacity: 0.35 }));
  edgeLines.visible = false;
  group.add(edgeLines);
  const dieView = createDieView(view);
  let dieBuiltFor = null;                          // die Stücke, aus denen die Formteile gebaut sind

  /* Ein Wechsel des Farbschemas: Linien umfärben, Bauteil, Legende, Skala
     und die Farbfelder der Listen neu malen. Die Formteile, Silhouetten und
     Karten färbt die Formansicht selbst um (js/part/dieviewer.js). */
  onScheme(() => {
    partingLines.material.color.set(VIEW.lines);
    edgeLines.material.color.set(VIEW.edges);
    if (state.seg) { updatePieceRows(); updateProjKpis(); }
    applyMode();
  });

  /* ── Bauteil gewechselt: bereit machen, gerechnet wird auf Knopfdruck ── */
  function onPart(model) {
    state.vis = null; state.seg = null; state.draft = null;
    state.pieces = null; state.proj = null; state.grip = null; state.ejMaps = null;
    state.analysed = false; state.cancelled = false; state.ready = false;
    dieBuiltFor = null;
    /* Die Schalter der Formteile gehören zu DIESEM Teil: ein neues zeigt
       wieder alle. */
    showAllPieces();
    /* Kantenbild nur bei überschaubaren Netzen — sonst kostet es mehr, als es zeigt. */
    edgeLines.geometry.dispose();
    const edgesOk = model.faceCount <= 60000;
    edgeLines.geometry = edgesOk ? new T.WireframeGeometry(part.mesh.geometry) : new T.BufferGeometry();
    edgesBox().disabled = !edgesOk;
    if (!edgesOk) { edgesBox().checked = false; state.showEdges = false; }
    clearAnalysis();
    /* Abstände folgen der Bauteilgröße, solange niemand sie gesetzt hat. Ein
       gesetzter Wert bleibt — höchstens bis zum neuen Ende des Reglers, und
       die Anzeige daneben sagt, was jetzt gilt (sie nannte sonst noch die
       Zahl vom größeren Teil). */
    const longest = Math.max(...model.bounds.size);
    const fit = (name, max, auto, touched) => {
      ui(name).max = String(max);
      sliders[name].set(touched ? Math.min(max, +ui(name).value) : auto);
      return +ui(name).value;
    };
    state.die.dist = fit('die-dist', Math.max(50, Math.round(longest * 1.2)), Math.max(10, Math.round(longest * 0.25)), state.die.distTouched);
    for (const [name, st] of [['proj-gap', state.projView], ['ej-gap', state.ej]]) {
      st.gap = fit(name, Math.max(50, Math.round(longest)), Math.max(10, Math.round(longest * 0.08)), st.gapTouched);
    }
    /* Nicht von selbst rechnen: bei großen Teilen dauert die Sichtbarkeit
       spürbar, und das soll der Anwender auslösen (Rückmeldung vom 24.09.).
       Der Hauptknopf steht dafür bereit; die Seite ist fertig geladen. */
    state.ready = true;
    host.refreshActions();
  }

  /* Die Sichtbarkeit hängt nur am Netz und wird einmal je Bauteil gerechnet;
     die Zuordnung danach bei jedem Achsenwechsel (Millisekunden). Kommt
     währenddessen ein anderes Teil, ist die laufende Rechnung überholt: der
     Gastgeber beendet sie still, und die für das neue beginnt, sobald sie
     aufgegeben hat (js/studio/job.js). Der jüngste Auftrag gewinnt. */
  let latest = 0;
  async function runAnalysis() {
    const model = part.model;
    if (!model) return;
    const my = ++latest;
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
      onCancel: () => { state.cancelled = true; }
    }).catch(err => {
      if (my === latest) shell.toast('Die Analyse ist gescheitert: ' + err.message, { ms: 9000 });
      console.error(err);
      return null;
    });
    if (my !== latest) return;                       // ein neueres Bauteil hat übernommen
    state.running = false;
    if (vis && part.model === model) {
      state.vis = vis;
      state.visMs = performance.now() - t0;
      state.analysed = true;
      recompute();
    } else if (!state.analysed) ui('analysis-state').textContent = '';
    state.ready = true;
    host.refreshActions();
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
    const before = state.seg;
    state.seg = segment(model, state.vis, { mainAxis: state.axis, movingSign: state.movSign });
    /* Die Schalter hängen an der Richtung (0 … 5), die Rolle an der Achse:
       mit einer anderen Formöffnung wird aus „Schieber +X" eine Formhälfte —
       ein ausgeblendeter Schieber wäre danach eine ausgeblendete Hälfte.
       Also wieder alle zeigen. (Die bewegliche Seite zu tauschen benennt nur
       um: dasselbe Stück, derselbe Schalter.) */
    if (before && before.mainAxis !== state.seg.mainAxis) showAllPieces();
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

  /* Alle sechs Formteile wieder zeigen — im Zustand und in der Formansicht,
     die sich ausgeblendete über Neubauten hinweg merkt. */
  function showAllPieces() {
    state.die.show = {};
    for (let l = 0; l < 6; l++) dieView.setVisible(l, true);
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
     Formteilen oder ganz weg. Trennlinie nur in der Entformung; die
     Netzkanten schaltet die Darstellung. */
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

  /* Einpassen (F, Knopf, Doppelklick) rahmt, was der Modus zeigt: bei den
     Formteilen die herausgefahrenen Stücke — beim größten Abstand lagen sie
     sonst weit neben dem Bild —, bei Flächen und Haftung dazu die Ebenen
     jenseits des Bauteils, sonst das Bauteil. Ausgeblendetes zählt nicht. */
  function fitTarget() {
    if (!part.model) return null;
    const box = new T.Box3().setFromObject(part.mesh);
    const m = shell.mode;
    if (m === 'formteile' && dieView.group.visible) for (const h of dieView.holders) { if (h.visible) box.expandByObject(h); }
    if (m === 'flaechen' || m === 'haftung') for (const o of dieView.overlays.children) { if (o.visible) box.expandByObject(o); }
    return box;
  }
  shell.setFitTarget(fitTarget);

  /** Das Formteil der Hälfte: sign +1 die bewegliche, −1 die feste Seite —
      welche das auf der Achse ist, sagt state.movSign. */
  function halfLabel(sign) {
    if (!state.seg) return -1;
    return DIRS.findIndex(d => d.axis === state.seg.mainAxis && d.sign === sign * state.movSign);
  }

  /* ── Farben ──────────────────────────────────────────────── */
  /* Nach Regionen trägt jede Fläche die Farbe ihrer Richtung, der
     Hinterschnitt „schlecht"; nach Schräge die Farbleiste `draft`, der
     Hinterschnitt dunkler; nach Haftung die Leiste `turbo`. Die Rollen
     kommen aus dem Schema von jetzt, die Leisten sind in jedem Schema
     dieselben (js/part/colors.js); als Punktfarben linear. */
  function updateColors() {
    const model = part.model, { seg, draft } = state;
    const mode = colouring();
    const col = part.colors();
    if (!col || !model || !seg || mode === 'plain') return;      // grau: das Material des Gastgebers
    const arr = col.array;
    const regions = [0, 1, 2, 3, 4, 5].map(l => linRgb(regionColor(l)));
    const under = linRgb(mode === 'draft' ? undercutDark() : undercutColor());
    const grip = mode === 'grip' ? gripPainter() : null;
    for (let f = 0; f < model.faceCount; f++) {
      let rgb;
      if (grip) rgb = grip(f);
      else if (seg.label[f] === UNDERCUT) rgb = under;
      else if (mode === 'draft') rgb = draftColor(draft[f], state.draftLimit);
      else rgb = regions[seg.label[f]];
      for (let e = 0; e < 3; e++) {
        arr[f * 9 + e * 3] = rgb[0];
        arr[f * 9 + e * 3 + 1] = rgb[1];
        arr[f * 9 + e * 3 + 2] = rgb[2];
      }
    }
    col.needsUpdate = true;
  }

  /* Haftung: die Leiste `turbo` nach dem Haftmaß je Fläche, blau = schwach,
     rot = stark (turboTrim, wie die Karten daneben); was nicht haftet
     (Außenwand, waagerecht, Schieber, Hinterschnitt), trägt das Grau des
     Bauteils: dort gibt es keinen Wert. */
  function gripPainter() {
    const g = state.grip, none = linRgb(VIEW.noData), turbo = scaleFn('turbo');
    return f => (!g || !(g.intensity[f] > 0) || !(g.maxIntensity > 0) ? none
      : turbo(turboTrim(g.intensity[f] / g.maxIntensity)));
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
    const rows = names.map((d, i) => ({ name: d.name, color: regionColor(i), frac: seg.areaByLabel[i] / A }));
    rows.push({ name: 'Hinterschnitt', color: undercutColor(), frac: seg.areaByLabel[6] / A });
    shell.legend('<div class="st-title">Flächenanteil</div>' + rows.filter(r => r.frac >= 0.0005).map(r =>
      '<div class="lg-row">' + chip(r.color) + '<span>' + r.name + '</span><span class="pct">' + pct(r.frac) + '</span></div>').join(''));
  }

  function updateColorbar() {
    const mode = state.seg ? colouring() : 'plain';
    if (mode === 'grip') {
      return shell.colorbar({
        title: 'Haftung',
        stops: gradient(t => scale('turbo', turboTrim(t))),
        ticks: ['stark', '', '', '', 'schwach'],
        extra: chip(VIEW.noData) + 'haftet nicht'
      });
    }
    if (mode !== 'draft') return shell.colorbar(null);
    const lim = state.draftLimit, top = 3 * lim;
    shell.colorbar({
      title: 'Entformschräge',
      stops: gradient(t => draftHex(top * t, lim)),
      ticks: [top, 2 * lim, lim, 0].map(v => fmt(v) + '°'),
      extra: chip(undercutDark()) + 'Hinterschnitt'
    });
  }

  /* Die Bilanz: nach Regionen Hälften / Schieber / Hinterschnitt, nach
     Schräge kleinste Schräge / unter Grenzwert / Hinterschnitt. Ein
     Hinterschnitt lässt sich nicht entformen — das Urteil ist „schlecht". */
  function updateSegKpis() {
    const model = part.model, { seg } = state;
    if (!seg || !model) return;
    const A = model.totalArea || 1;
    let halves = 0, sliders = 0;
    for (let d = 0; d < 6; d++) (DIRS[d].axis === seg.mainAxis ? halves += seg.areaByLabel[d] : sliders += seg.areaByLabel[d]);
    const axisName = 'XYZ'[seg.mainAxis];
    const note = opts.axisNote ? opts.axisNote(seg) : '';
    ui('analysis-state').textContent = 'Formöffnung ' + axisName + (seg.auto ? ' (automatisch gewählt)' : ' (fest gewählt)')
      + ' · bewegliche Seite ' + (state.movSign > 0 ? '+' : '−') + axisName + (note ? '. ' + note : '');
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
        + chip(regionColor(l)) + '<span class="name">' + names[l].name + '</span>'
        + '<span class="pct">' + (has ? pct(area / A) : 'nicht in der Form') + '</span></label>';
    }).join('');
    if (seg.areaByLabel[6] > 0) {
      html += '<div class="legend-row">' + chip(undercutColor()) + '<span class="name">Hinterschnitt: bleibt am Ort</span>'
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
    const rows = proj.pieces.map(q => ({ label: chip(regionColor(q.label)) + ' ' + names[q.label].name, value: cm2(q.area) }));
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

  /* ── Hauptknopf: bleibt stehen, auch nach der Analyse ─────── */
  function gate() {
    if (!part.model) return { label: RUN, disabled: true, reason: 'Zuerst ein Bauteil laden.' };
    if (state.running) return null;
    if (state.analysed) return { label: RERUN, onClick: runAnalysis };
    return { label: RUN, onClick: runAnalysis, noteKind: state.cancelled ? 'warn' : '',
      reason: state.cancelled ? 'Abgebrochen: Das Bauteil ist noch nicht untersucht.' : 'Die Analyse steht noch aus.' };
  }
  const modes = MODES.map(m => ({ ...m }));
  for (const m of modes) {
    m.primary = gate;
    m.enter = () => applyMode();
  }

  /* ── Verdrahtung ─────────────────────────────────────────── */
  /* Die Regler, die onPart und fromJSON nachstellen (slider: set ohne
     Rückruf); ihr Einbau ist keine Änderung ({ fire: false }). */
  const sliders = {};
  const quiet = { fire: false };

  function mounted() {
    /* Bauteil */
    edgesBox().addEventListener('change', e => { state.showEdges = e.target.checked; applyOpacity(); host.changed('Netzkanten'); });

    /* Entformung */
    segButtons(ui('axis-seg'), v => { state.axis = v === 'auto' ? 'auto' : +v; recompute(); host.changed('Formöffnung'); });
    segButtons(ui('mov-seg'), v => { state.movSign = +v === -1 ? -1 : 1; recompute(); host.changed('Bewegliche Seite'); });
    segButtons(ui('mode-seg'), v => { setColouring(v); host.changed('Einfärbung'); });
    sliders['draft-limit'] = slider(ui('draft-limit'), v => {
      state.draftLimit = v;
      if (state.seg) { updateSegKpis(); applyMode(); }
      host.changed('Grenzwert');
    }, v => fmt(v) + ' °', null, quiet);
    ui('show-parting').addEventListener('change', e => { state.showParting = e.target.checked; applyOpacity(); host.changed('Trennlinie'); });

    /* Formteile */
    sliders['die-dist'] = slider(ui('die-dist'), v => {
      state.die.dist = v;
      if (v !== +ui('die-dist').defaultValue) state.die.distTouched = true;
      dieView.setDistance(v);
      host.changed('Abstand');
    }, v => fmt(v, 0) + ' mm', null, quiet);
    let skirtTimer = 0;
    sliders['die-skirt'] = slider(ui('die-skirt'), v => {
      state.die.skirt = v;
      clearTimeout(skirtTimer);
      /* Nachgebaut wird für die Zuordnung von JETZT. Kam inzwischen ein
         neues Teil (ohne Zuordnung: TypeError) oder eine neue Zuordnung
         (die schon mit diesem Rand gebaut ist), gibt es nichts zu tun. */
      const seg = state.seg;
      if (seg) skirtTimer = setTimeout(() => {
        if (state.seg !== seg) return;
        state.pieces = diePieces(part.model, state.seg, { skirt: state.die.skirt });
        dieBuiltFor = null;
        dieView.setPieces(state.pieces);
        applyMode();
      }, 120);
      host.changed('Rand');
    }, v => fmt(v, 0) + ' mm', null, quiet);
    ui('die-part').addEventListener('change', e => { state.die.part = e.target.checked; applyOpacity(); host.changed('Bauteil dazwischen'); });
    ui('die-pieces').addEventListener('change', e => {
      const l = Number(e.target && e.target.dataset ? e.target.dataset.label : NaN);
      if (!Number.isInteger(l)) return;
      state.die.show[l] = !!e.target.checked;
      dieView.setVisible(l, state.die.show[l]);
    });

    /* Flächen */
    sliders['proj-gap'] = slider(ui('proj-gap'), v => {
      state.projView.gap = v;
      if (v !== +ui('proj-gap').defaultValue) state.projView.gapTouched = true;
      if (shell.mode === 'flaechen') dieView.setGap(v);
      host.changed('Abstand');
    }, v => fmt(v, 0) + ' mm', null, quiet);
    sliders['proj-alpha'] = slider(ui('proj-alpha'), v => {
      state.projView.alpha = v / 100;
      if (shell.mode === 'flaechen') dieView.setOverlayOpacity(state.projView.alpha);
      host.changed('Deckkraft');
    }, v => fmt(v, 0) + ' %', null, quiet);

    /* Haftung */
    sliders['ej-mu'] = slider(ui('ej-mu'), v => {
      state.ej.mu = v;
      if (state.seg) {
        state.grip = gripPerFace(part.model, state.vis, state.seg, { mu: v, movSign: state.movSign });
        state.ejMaps = null;
        updateGripKpis();
        applyMode();
      }
      host.changed('Reibwert');
    }, v => fmt(v, 2), null, quiet);
    sliders['ej-gap'] = slider(ui('ej-gap'), v => {
      state.ej.gap = v;
      if (v !== +ui('ej-gap').defaultValue) state.ej.gapTouched = true;
      if (shell.mode === 'haftung') dieView.setGap(v);
      host.changed('Abstand');
    }, v => fmt(v, 0) + ' mm', null, quiet);
    sliders['ej-alpha'] = slider(ui('ej-alpha'), v => {
      state.ej.alpha = v / 100;
      if (shell.mode === 'haftung') dieView.setOverlayOpacity(state.ej.alpha);
      host.changed('Deckkraft');
    }, v => fmt(v, 0) + ' %', null, quiet);

    wireHover();
  }

  function setColouring(v) {
    state.mode = v === 'draft' ? 'draft' : 'regions';
    ui('draft-block').hidden = state.mode !== 'draft';      // der Grenzwert gehört zur Schräge
    if (state.seg) updateSegKpis();
    applyMode();
  }

  /* Hover: Region, Entformschräge und Haftung des Dreiecks unter dem Zeiger —
     höchstens einmal je Bild (js/viewmath.js, hoverProbe: der Strahlentest
     läuft ohne Beschleunigungsstruktur über das ganze Netz). */
  function wireHover() {
    const ray = new T.Raycaster();
    const canvas = view.renderer.domElement;
    let shown = false;
    const clear = () => { if (shown) { shell.status(''); shown = false; } };
    hoverProbe(canvas, evalHover, clear);
    function evalHover(at) {
      if (!active || !state.seg || !part.mesh.visible) return clear();
      rayAt(ray, at, canvas, view.camera);
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
    checkFormat(obj, FORMAT, FORMAT_VERSION, 'Das ist keine Datei der Entformungsanalyse.');
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
    sliders['draft-limit'].set(state.draftLimit);
    const d = obj.die || {}, pv = obj.projView || {}, ej = obj.ej || {};
    state.die.skirt = num(d.skirt, 0, 500, state.die.skirt);
    state.die.part = d.part !== false;
    ui('die-part').checked = state.die.part;
    sliders['die-skirt'].set(state.die.skirt);
    if (d.dist !== null && d.dist !== undefined) { state.die.dist = num(d.dist, 0, +ui('die-dist').max, state.die.dist); state.die.distTouched = true; sliders['die-dist'].set(state.die.dist); dieView.setDistance(state.die.dist); }
    state.projView.alpha = num(pv.alpha, 0.1, 1, state.projView.alpha);
    sliders['proj-alpha'].set(Math.round(state.projView.alpha * 100));
    if (pv.gap !== null && pv.gap !== undefined) { state.projView.gap = num(pv.gap, 0, +ui('proj-gap').max, state.projView.gap); state.projView.gapTouched = true; sliders['proj-gap'].set(state.projView.gap); }
    state.ej.mu = num(ej.mu, 0.1, 0.6, state.ej.mu);
    sliders['ej-mu'].set(state.ej.mu);
    state.ej.alpha = num(ej.alpha, 0.1, 1, state.ej.alpha);
    sliders['ej-alpha'].set(Math.round(state.ej.alpha * 100));
    if (ej.gap !== null && ej.gap !== undefined) { state.ej.gap = num(ej.gap, 0, +ui('ej-gap').max, state.ej.gap); state.ej.gapTouched = true; sliders['ej-gap'].set(state.ej.gap); }
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
      sliders['die-dist'].set(Math.max(10, Math.round(longest * 0.25)));
      state.die.dist = +ui('die-dist').value; dieView.setDistance(state.die.dist);
      for (const [name, st] of [['proj-gap', state.projView], ['ej-gap', state.ej]]) { sliders[name].set(Math.max(10, Math.round(longest * 0.08))); st.gap = +ui(name).value; }
      applyMode();
    }
  }

  /* Die Werkbank: nicht mehr dran — Formteile, Silhouetten, Karten,
     Trennlinie und Netzkanten gehen aus dem Bild (ohne Modus zeigt
     applyMode nichts davon); wieder dran — der Modus von vorhin. */
  function setActive(on) {
    active = on;
    applyMode();
    if (!on) edgeLines.visible = false;
  }

  const tool = {
    id: 'entformung', modes, startMode: 'entformung', settingsOnly: true,
    mounted, onPart, toJSON, fromJSON, resetSettings, setActive, accepts: [FORMAT], exports: [],
    /* Eine laufende Rechnung gehört zum alten Bauteil: der Gastgeber hat sie
       still beendet, ihr Lauf fasst nichts mehr an. */
    onPartStart: () => { state.ready = false; state.running = false; latest++; }
  };
  tool.__viewer = {
    state, view, get partMesh() { return part.mesh; }, partingLines, edgeLines, dieView,
    recompute, runAnalysis, showTab: id => shell.setMode(id), colouring, shell, host, tool
  };
  return tool;
}
