/* Füllabschätzung — das Werkzeug im gemeinsamen Rahmen.

   Auf die Wand des Bauteils setzt man rechteckige Anschnitte — der Chip
   „Anschnitt setzen" über dem Bild, dann der Klick aufs Bauteil; Breite und
   Höhe wie beim Angussdesigner —, das Bauteil wird gerastert (das
   Abstandsfeld des Gastgebers, host.field: innen negativ, außen positiv),
   und js/fill/solve.js lässt die Front von den Anschnitten durch die
   Innenzellen laufen. Heraus kommt je Zelle der FÜLLGRAD, bei dem sie voll
   wird.

   Die Modi von links nach rechts sind die Arbeit: Anschnitte (die
   Vorgaben und was gesetzt ist) · Füllung (Zellkante, α, die Kennzahlen,
   „Rechnen") · Ergebnis. Die Anschnitte und ihre Griffe sind der Plan selbst
   und stehen in jedem Modus im Bild; das BILD der Füllung — Bauteil nach
   Füllgrad gefärbt, Füllkörper, die zuletzt gefüllten Stellen, die Skala —
   gehört dem Modus „Ergebnis" und geht mit ihm.

   Gerechnet wird auf Knopfdruck, als Rechnung des Gastgebers (host.jobs):
   der Knopf heißt solange „Abbrechen", und der Abbruch reicht bis in das
   Raster und die Frontausbreitung hinein. NACH dem ersten Lauf rechnet jede
   Änderung am Plan von selbst nach (kurz verzögert, damit ein Regler nicht
   hundert Läufe anstößt) — bis man abbricht; dann wartet die Seite wieder
   auf den Knopf. Ein Bild, das nicht zum Plan passt, gibt es nie: ein
   Ergebnis ist entweder aktuell, wird gerade ersetzt oder ist weg.

   Jede abgeschlossene Änderung am Plan meldet das Werkzeug dem Gastgeber
   (host.changed) — daraus werden Rückgängig, Entwurf und „Ungespeichert".
   Ein Zug am Griff ist EIN Schritt (gemeldet beim Loslassen), ein Regler
   ebenso (coalesce). Zellkante, Vorgaben und die Anzeige gehören nicht zum
   Plan (Format dielogic-fuellung, Fassung 1 — unverändert).

   AUF DER WERKBANK (opts.derive) setzt niemand Anschnitte von Hand: sie SIND
   die Mündungen des Angusses — Ort und Richtung, Breite und Höhe, der Anteil
   am Strom aus der Strömungsrechnung —, und die Liste sagt nur, was kommt.
   Das Raster ist das gemeinsame Feld mit der Zellkante des Schritts Bauteil
   (host.field.shared). Dazu bekommt die Füllung eine UHR: die Schusskurve
   unter dem Anguss sagt, wann jeder Anschnitt öffnet (js/werkbank/
   filltime.js); ein späterer startet mit dem Vorsprung der früheren, und
   jeder Füllgrad hat eine Zeit ab „Kammer voll". Gerechnet wird, sobald
   der Schritt dran ist, und nach jeder Änderung am Anguss wieder. */

import * as T from 'three';
import { facts, segButtons, slider, numberInput, clampNote, gradient, POS_LIMIT } from '../ui/controls.js';
import { fmt, fmtPlain, fmtUnit, parseNumber, clamp, rangeText } from '../studio/format.js';
import { kpis, esc, selTitle, groupTabs, listRow, onListPick, legendRow, selectedRow } from '../studio/rows.js';
import { saveSTL } from '../studio/files.js';
import { CELL_RANGE, MAX_SAMPLES } from '../part/field.js';
import { surfaceNets } from '../part/surfacenets.js';
import { scale, scaleFn, linRgb, onScheme, ROLE, VIEW } from '../part/colors.js';
import { createHandles, createPlacer } from '../handles.js';
import { setTris, dirText, outward, surfaceMaterial } from '../ui/common.js';
import * as M from './model.js';
import { buildAll } from './geom.js';
import { solveFill, fracToSurface, sampleFrac, fillBodyField, lastSpots } from './solve.js';
import { fillClock, openingFractions, unitsForFraction } from '../werkbank/filltime.js';
import { cross, dot, norm, addScaled } from '../runner/vec.js';
import { MODES, INSPECTOR, GROUPS, DARSTELLUNG } from './panel.js';

const RUN = 'Rechnen';
const NEEDS_PART = 'Zuerst ein Bauteil laden; der Klick setzt den Anschnitt auf seine Wand.';
const NO_GATE = 'Noch kein Anschnitt: oben im Bild „Anschnitt setzen", dann aufs Bauteil klicken.';
const HANDLE_HINT = '<b>Punkt</b> ziehen: auf der Wand · <b>Pfeil</b>: neu setzen · <b>Entf</b>: entfernen';
/* Die letzten Stellen: wo die Front zuletzt ankommt. Sie sind Kennpunkte
   der Füllung, kein Urteil (jedes Teil hat eine letzte Stelle, dort
   gehören die Überläufe hin): die Hervorhebung des Schemas. */
const spotColor = () => VIEW.lastFilled;
/* So lange wartet das Nachrechnen auf die nächste Änderung: wer an einem
   Regler dreht, stößt einen Lauf an, nicht einen je Schritt. */
const RESOLVE_MS = 180;
/* Ein Zug am Regler ist EIN Schritt im Verlauf — auch wenn zwischen zwei
   Meldungen des Reglers eine Nachrechnung liegt, die den Browser eine halbe
   Sekunde beschäftigt (die Vorgabe des Verlaufs, 400 ms, reißt dann ab). */
const SLIDER_MS = 1200;
/* Über etwa 300 : 1 wird es eng — die klassische Grenze der Füllbarkeit. */
const FLOW_LIMIT = 300;
/* Mehr Rasterpunkte rechnet host.field nicht: es hebt die Zellkante an
   (js/part/field.js, planField). */
const LIMIT_TEXT = fmt(MAX_SAMPLES / 1e6, 0) + ' Mio.';
/* Warum ein Anschnitt nichts füllt (js/fill/solve.js, closed). */
const CLOSED_NOTE = {
  off: 'liegt neben dem Bauteil: auf die Wand setzen',
  share: 'kein Strom: die festen Anteile der anderen ergeben schon 100 %'
};

/**
 * @param opts.derive  die Werkbank: { inlets() → Mündungen des Angusses
 *                     [{ id, pos, dir, w, h, share, bound, tArrive }],
 *                     curve() → { onCurve, timeline } } (s. o.)
 */
export function createFuellungTool(host, opts = {}) {
  const { shell, view, part, field: hostField } = host;
  const ui = host.ui;
  const derived = opts.derive || null;
  /* EIN Feld für die ganze Seite (die Werkbank): seine Zellkante stellt der
     Schritt Bauteil ein, hier wird nur gerastert. */
  const shared = !!hostField.shared;
  /* Auf der Werkbank ist das Werkzeug nur dran, solange einer seiner Modi
     zu sehen ist (setActive); auf seiner eigenen Seite immer. */
  let active = true;

  let placer = null;
  const state = {
    plan: M.emptyPlan(), defaults: { ...M.DEFAULTS },
    /** Wird gerade ein Anschnitt gesetzt (der Chip ist aktiv)? */
    get placing() { return !!(placer && placer.placing); },
    h: 3, hAuto: true, field: null, cells: 0, gridMs: 0,
    result: null, surf: null, ms: 0,
    /* stale: das Ergebnis passt nicht (mehr) zum Plan. auto: der erste Lauf
       ist gelaufen — Änderungen rechnen von selbst nach. */
    stale: true, auto: !!derived, running: false, phase: '', queued: false, cancelled: false, error: '',
    /* Die Uhr der Füllung (nur mit opts.derive): Zeiten ab Kolbenstart je
       Füllgrad und Anschnitt, aus der Schusskurve unter dem Anguss. */
    timing: null,
    /* Voreingestellt der Füllkörper bei halbem Füllgrad — die Front mitten
       im Teil sagt auf einen Blick, wo die Schmelze zuerst hinkommt. */
    show: 'koerper', q: 0.5, opacity: 1,
    spots: { count: 5, list: [] },
    ready: false,
    get model() { return part.model; },
    get name() { return part.name; }
  };
  let wired = false;
  let rev = 0;                 // zählt die Änderungen am Plan: wozu ein Ergebnis gehört
  /* Der jüngste Auftrag gewinnt: ein neues Bauteil überholt die laufende
     Rechnung (der Gastgeber beendet sie still, js/studio/job.js), und ihr
     Lauf fasst danach nichts mehr an. */
  let latest = 0;
  let queuedRegrid = false;
  let rasterH = 0;             // mit welcher Zellkante das laufende Raster gerechnet wird
  let timer = 0;
  let dragFrom = null;         // wo der gezogene Anschnitt vor dem Zug stand
  let reverting = false;       // Esc hat einen Zug abgebrochen: der Plan ist wieder, wie er war
  const refresh = () => { if (host.refreshActions) host.refreshActions(); };
  const dauer = ms => (ms >= 1000 ? fmtUnit(ms / 1000, 's') : fmtUnit(ms, 'ms', 0));

  /* ── Szene ───────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);

  const inletMat = surfaceMaterial(M.inletColor(), { roughness: 0.5, metalness: 0.1 });
  const inletMesh = new T.Mesh(new T.BufferGeometry(), inletMat);
  group.add(inletMesh);

  /* Der Füllkörper: die Schmelze bis zum Füllgrad, in der Farbe der
     Schmelze. Wie weit sie ist, sagt seine Form, nicht seine Farbe. */
  const bodyMat = surfaceMaterial(ROLE.melt, { roughness: 0.35, metalness: 0.45 });
  const bodyMesh = new T.Mesh(new T.BufferGeometry(), bodyMat);
  bodyMesh.visible = false;
  group.add(bodyMesh);

  /* Die zuletzt gefüllten Stellen als Kugeln, Größe im Bild konstant. */
  const spotGeo = new T.SphereGeometry(1, 20, 14);
  const spotMat = new T.MeshBasicMaterial({ color: spotColor(), depthTest: false, transparent: true, opacity: 0.9 });
  const spotGroup = new T.Group();
  spotGroup.renderOrder = 5;
  spotGroup.visible = false;
  group.add(spotGroup);

  /* Ein Wechsel des Farbschemas: Körper umfärben, das Bauteil neu bemalen,
     Legende, Skala, Liste und Auswahlfeld mit den neuen Farben. */
  onScheme(() => {
    inletMat.color.set(M.inletColor());
    bodyMat.color.set(ROLE.melt);
    spotMat.color.set(spotColor());
    shown.paintFor = null;
    applyMode();
    if (wired) { updateList(); if (handles.selected) syncSelection(); }
  });

  /* Eingepasst wird, was JETZT im Bild steht: das Bauteil samt Anschnitten
     (die ragen ein paar Millimeter aus der Wand). Füllkörper und Marken liegen
     im Bauteil. */
  shell.setFitTarget(() => {
    if (!part.model) return null;
    const box = new T.Box3().setFromObject(part.mesh);
    const g = inletMesh.geometry;
    if (g.getAttribute('position') && g.getAttribute('position').count) { g.computeBoundingBox(); box.union(g.boundingBox); }
    return box;
  });

  /* ── Griffe ──────────────────────────────────────────────── */
  const handles = createHandles({
    view,
    getRefMesh: () => part.mesh,
    markColor: () => M.inletColor(),
    items: () => M.allItems(state.plan).map(it => ({
      id: it.id, pos: it.pos, color: M.inletColor(), dir: it.n, planeSize: Math.max(24, it.w * 1.5)
    })),
    /* Gezogen wird in der Wandebene: der Anschnitt rutscht auf der Wand. */
    plane: id => {
      const it = state.plan.items[id];
      return it ? { origin: it.pos, normal: it.n } : null;
    },
    move: (id, pos) => {
      const it = state.plan.items[id];
      if (it && !dragFrom) dragFrom = it.pos.slice();
      M.setPos(state.plan, id, pos);
    },
    onSelect: () => { placer.cancel(); syncSelection(); },
    onChange: (what, id) => {
      if (what === 'drag') { rebuild('drag'); return; }
      /* Esc mitten im Zug: zurück zum Stand davor — der Zug war nie ein
         Schritt, und die Füllung dazu gilt weiter. */
      if (what === 'cancel') {
        dragFrom = null;
        reverting = true;
        try { if (!host.revert()) { rebuild(); syncSelection(); } } finally { reverting = false; }
        return;
      }
      rebuild();
      if (what !== 'drop') return;
      /* Ein bloßer Klick auf den Griff endet ebenfalls mit „drop" — gerechnet
         wird nur, wenn der Anschnitt wirklich gewandert ist. */
      const it = state.plan.items[id], from = dragFrom;
      dragFrom = null;
      syncSelection();
      if (!it || !from || Math.hypot(it.pos[0] - from[0], it.pos[1] - from[1], it.pos[2] - from[2]) < 1e-9) return;
      host.changed('Anschnitt verschoben');
      planChanged();
    },
    onAim: id => startMove(id)
  });
  placer = createPlacer({ aim: shell.aim, handles, onEnd: () => shell.renderChips() });
  /* Abgeleitete Anschnitte (die Werkbank) zieht und setzt niemand hier. */
  if (derived) { handles.setEnabled(false); handles.group.visible = false; }

  /* ── Kette: Plan → Anzeige ───────────────────────────────── */
  function rebuild(mode) {
    setTris(inletMesh, buildAll(state.plan));
    /* Die Anschnitte gehören ihrem Schritt: auf der Werkbank zeigt der Anguss
       sie in den anderen schon. */
    if (!active) inletMesh.visible = false;
    handles.refresh();
    view.invalidate();
    if (mode === 'drag') return;
    updateList();
  }

  const label = it => 'Anschnitt ' + it.id;
  /** Was die Rechnung zu einem Anschnitt sagt — nur, solange sie zum Plan passt. */
  const inletInfo = id => (state.result && !state.stale ? state.result.stats.inlets.find(x => x.id === id) || null : null);
  const fillsText = inf => fmtUnit(100 * inf.cells / Math.max(1, state.result.cells), '%');

  /* Die Liste im Modus „Anschnitte": je Anschnitt Maße, Anteil am Strom und —
     sobald gerechnet ist — was er tatsächlich füllt. */
  function updateList() {
    const items = M.allItems(state.plan);
    const sh = M.shares(state.plan);
    const cur = handles.selected;
    const tm = timingNow();
    ui('item-list').innerHTML = items.map(it => {
      const inf = inletInfo(it.id);
      const thin = !!inf && !inf.closed && inf.seeds <= 1;
      const fills = !inf ? '' : inf.closed ? ' · füllt nichts ⚠' : ' · füllt ' + fillsText(inf) + ' des Volumens' + (thin ? ' ⚠' : '');
      /* Auf der Werkbank: wann der Anschnitt öffnet — ab „Kammer voll", und
         wie voll das Bauteil dann schon ist —, und ob er an der Wand sitzt. */
      let opens = '';
      if (tm) {
        const t = tm.tOpen[it.id];
        opens = Number.isFinite(t) ? ' · öffnet bei ' + ms(t - tm.tFull) + (tm.qOpen[it.id] > 0.005 ? ' (' + fmtUnit(100 * tm.qOpen[it.id], '%') + ' voll)' : '')
          : ' · die Kurve endet vorher';
      }
      const loose = derived && !it.bound ? ' · ⚠ nicht an der Wand' : '';
      return listRow({
        id: it.id, color: M.inletColor(), name: esc(label(it)), value: fmt(it.w, 1) + ' × ' + fmt(it.h, 1) + ' mm',
        sub: fmtUnit(100 * (sh[it.id] || 0), '%') + ' Strom' + fills + opens + loose,
        cls: 'fu-row' + (thin || (inf && inf.closed) || loose ? ' warn' : ''), active: it.id === cur, still: !!derived
      });
    }).join('');
    ui('item-empty').hidden = items.length > 0;
    ui('item-count').textContent = items.length ? '· ' + fmt(items.length, 0) : '';
    if (derived) {
      ui('inlet-warn').textContent = items.some(it => !it.bound)
        ? 'Nicht jeder Anschnitt ist ans Bauteil gebunden: er trifft die Wand vielleicht nicht. Im Schritt Anguss den Pfeil des Anschnitts anklicken.' : '';
    }
  }

  /* ── Raster ──────────────────────────────────────────────── */
  /* Wie fein gerastert wird, sagt die ZELLKANTE in mm — nicht eine
     Zellenzahl entlang der längsten Kante. Der Anwender kennt die Wanddicke
     seines Teils, und die muss das Raster auflösen: mindestens zwei Zellen
     über die Dicke, also die halbe Wanddicke als Kante. Genau das ist der
     Vorschlag beim Laden (Wanddicke 2V/A des Bauteils). Nach oben begrenzt
     nur der Speicher: host.field hebt die Kante an, wenn das Raster mehr als
     16 Mio. Punkte hätte — und die Zeile unter dem Feld sagt es.

     Das Raster liegt ENG um das Bauteil, zwei Zellen Rand: hier zählt nur das
     Innere, und ein breiter Rand hätte bei einem flachen Teil mehr Luft als
     Metall gerastert. Ein Feld der Wandstärkenanalyse (Band drei Zellen,
     derselbe Rand) passt deshalb auch — auf der Werkbank teilen sich beide
     eines. */
  /* Die Zellkante: die eigene — oder auf der Werkbank die des gemeinsamen
     Feldes. Dort wird das Feld verglichen mit dem, was bestellt war: ein über
     16 Mio. Punkten angehobenes Feld ist das Feld zu dieser Kante. */
  const cell = () => (shared ? hostField.h : state.h);
  const gridParams = () => ({ h: cell(), band: Math.max(2.5 * cell(), 1.5), pad: 2 * cell() });
  const cellChanged = () => !!state.field && Math.abs((shared ? (state.field.hAsked ?? state.field.h) : state.field.h) - cell()) > 1e-9;

  /* `asked`: die Kante, mit der dieses Raster bestellt wurde. Anders kommt es
     nur zurück, wenn host.field sie angehoben hat (mehr als 16 Mio.
     Rasterpunkte) — dann gilt die angehobene, und die Zeile sagt es. Wer
     während des Rasterns eine andere Kante eingetippt hat, behält sie: für
     die wird gleich neu gerastert (siehe das Feld „cell" unten). Früher galt
     jeder Unterschied zur Kante im Feld als die Grenze, und die neue Eingabe
     sprang mit einer falschen Meldung zurück. */
  function adoptField(f, ms, asked) {
    state.field = f;
    state.gridMs = ms;
    let cells = 0;
    for (let i = 0; i < f.data.length; i++) if (f.data[i] < 0) cells++;
    state.cells = cells;
    const lifted = Math.abs(f.h - asked) > 1e-9;
    if (shared) ui('cell-note').textContent = lifted ? 'Gerastert mit ' + fmtUnit(f.h, 'mm', 2) + ': feiner geht es nicht, die Grenze sind ' + LIMIT_TEXT + ' Rasterpunkte.' : '';
    else if (lifted && Math.abs(state.h - asked) < 1e-9) {
      state.h = f.h;
      ui('cell').value = fmtPlain(f.h);
      ui('cell-note').textContent = 'Feiner geht hier nicht: ' + LIMIT_TEXT + ' Rasterpunkte sind die Grenze, die Zellkante steht auf ' + fmtUnit(f.h, 'mm', 2) + '.';
    } else if (!lifted) ui('cell-note').textContent = '';
    /* Ein Ergebnis gehört zu SEINEM Raster: mit dem neuen ist das alte weg. */
    dropResult();
  }

  function updateGridFacts() {
    if (shared) ui('cell-shared').textContent = 'Zellkante ' + fmtUnit(cell(), 'mm', 2) + ' aus dem Schritt Bauteil (Feld).';
    if (!part.model) { facts(ui('grid-facts'), []); return; }
    const f = state.field && !cellChanged() ? state.field : null;
    /* Was die eingetippte Kante kosten würde — und wenn es zu viel ist, mit
       welcher Kante tatsächlich gerastert wird (dieselbe Rechnung wie beim
       Rastern, js/part/field.js). Das steht VOR dem Rechnen da. */
    const plan = f ? null : hostField.plan(gridParams());
    if (plan) {
      ui('cell-note').textContent = plan.lifted
        ? 'Das wären ' + fmt(plan.asked.samples / 1e6, 0) + ' Mio. Rasterpunkte, die Grenze sind ' + LIMIT_TEXT + '; gerastert wird mit ' + fmtUnit(plan.est.h, 'mm', 2) + '.'
        : '';
    }
    const est = f ? { dims: f.dims, samples: f.data.length, bytes: f.data.length * 4 } : plan.est;
    /* Kurz gehalten: aufgeklappt muss der Kasten neben Knopf und Hinweis in die
       Seitenleiste passen. Steht eine andere Zellkante im Feld, zeigt er, was
       das NEUE Raster kosten wird — dass das Bild noch das vorige zeigt, sagt
       die Zeile am Knopf. */
    const rows = [
      ['Raster', est.dims.join(' × ')],
      ['Rasterpunkte', fmt(est.samples / 1e6, 2) + ' Mio.'], ['Speicher', fmtUnit(est.bytes / (1024 * 1024), 'MB')]
    ];
    if (f) {
      rows.push(['Zellen im Bauteil', fmt(state.cells, 0)], ['Rechenzeit Raster', dauer(state.gridMs)]);
      if (state.result) rows.push(['Volumen im Raster', fmtUnit(state.result.stats.volume / 1000, 'cm³')], ['Rechenzeit Füllung', dauer(state.ms)]);
    }
    facts(ui('grid-facts'), rows);
  }

  /* ── Rechnen ─────────────────────────────────────────────── */
  function dropResult() {
    state.result = null;
    state.surf = null;
    state.timing = null;
    updateResult();
  }

  /* Der Plan hat sich geändert: das Ergebnis gilt nicht mehr. Nach dem ersten
     Lauf wird nachgerechnet; davor — und nach einem Abbruch — wartet die Seite
     auf den Knopf, und ein Bild, das nicht mehr stimmt, verschwindet. */
  function planChanged() {
    rev++;
    state.stale = true;
    state.cancelled = false;
    clearTimeout(timer);
    const items = M.allItems(state.plan).length;
    if (items && state.running) { updateResult(); compute(); }       // der laufende Lauf beginnt mit dem neuen Plan
    /* Nicht dran (die Werkbank, ein anderer Schritt): gerechnet wird, wenn er
       wieder dran ist (setActive). */
    else if (items && state.auto) { updateResult(); if (active) timer = setTimeout(() => compute({ quiet: true }), RESOLVE_MS); }
    else {
      if (state.running) compute();                                  // kein Anschnitt mehr: der Lauf endet ohne Ergebnis
      if (state.result) dropResult(); else updateResult();
    }
    refresh();
  }

  /* Ein Lauf: das Raster, wenn es fehlt oder neu soll, dann die Front. Ein
     gerade überholter Lauf räumt erst an seinem nächsten Haltepunkt auf —
     darauf wartet host.jobs.run selbst. */
  async function runOnce(regrid, quiet = false) {
    const model = part.model;
    const wall = model.wall;
    const pct = p => Math.round(p * 100) + ' %';
    return host.jobs.run({
      quiet,
      label: RUN, note: state.field && !regrid ? 'Füllung rechnen …' : 'Bauteil rastern …',
      run: async (signal, progress) => {
        let f = state.field;
        if (!f || regrid) {
          state.phase = 'raster';
          const t0 = performance.now();
          const grid = gridParams();
          rasterH = grid.h;
          f = await hostField.ensure({ ...grid, signal, onProgress: (p, what) => progress(p, 'Raster · ' + what + ' … ' + pct(p)) });
          if (!f) return null;                                         // das Bauteil hat gewechselt
          if (f !== state.field) adoptField(f, performance.now() - t0, grid.h);
        }
        state.phase = 'fill';
        /* Der Plan, wie er JETZT ist — während des Rasterns darf er sich ändern. */
        const myRev = rev, plan = state.plan;
        const t1 = performance.now();
        const res = await solveFill(f, plan, {
          alpha: plan.alpha, wallThickness: wall, signal,
          onProgress: p => progress(p, 'Füllung … ' + pct(p))
        });
        const clocked = derived ? await withClock(f, plan, res, { wall, signal, progress, pct }) : { res, timing: null };
        return { f, res: clocked.res, timing: clocked.timing, rev: myRev, ms: performance.now() - t1 };
      },
      onCancel: () => { state.cancelled = true; }
    }).catch(err => {
      state.error = err.message;
      console.error(err);
      return null;
    });
  }

  /* Die Uhr (die Werkbank): jeder Anschnitt öffnet zu seiner Zeit auf der
     Schusskurve. Aus dem ersten Lauf kommt, welcher Füllgrad welcher
     Ankunftseinheit entspricht; daraus der Vorsprung der früheren Anschnitte,
     und ein zweiter Lauf damit (Option offsets von js/fill/solve.js). Das
     wahre Volumen des Bauteils zählt, nicht das des Rasters: die Kurve füllt
     das Bauteil, der Füllgrad ist ein Anteil davon. */
  async function withClock(f, plan, res, { wall, signal, progress, pct }) {
    const cv = derived.curve();
    if (!cv || !cv.onCurve || !cv.timeline || cv.timeline.error) return { res, timing: null };
    const items = M.allItems(plan);
    const sh = M.shares(plan);
    const clock = fillClock(cv.timeline, items.map(it => ({ id: it.id, tArrive: it.tArrive, share: sh[it.id] || 0 })));
    if (!clock) return { res, timing: null };
    const vol = Math.abs(part.model.volume) * 1e-9;
    const qOpen = openingFractions(clock, vol);
    const units = unitsForFraction(res.arrival);
    const offsets = {};
    let any = false;
    for (const it of items) { offsets[it.id] = units(qOpen[it.id]); if (offsets[it.id] > 0) any = true; }
    if (any) {
      res = await solveFill(f, plan, {
        alpha: plan.alpha, wallThickness: wall, signal, offsets,
        onProgress: p => progress(p, 'Füllung mit Vorsprung … ' + pct(p))
      });
    }
    return {
      res,
      timing: {
        clock, vol, qOpen, offsets, tFirst: clock.tFirst, tEnd: clock.timeAtVolume(vol),
        tOpen: Object.fromEntries(clock.gates.map(g => [g.id, g.t])),
        tFull: cv.timeline.tFull, shotFill: cv.timeline.shot.fill,
        timeAt: q => clock.timeAtVolume(Math.max(0, Math.min(1, q)) * vol)
      }
    };
  }
  /* Die Uhr zum gezeigten Ergebnis — keine, solange es nicht zum Plan passt. */
  const timingNow = () => (state.result && !state.stale ? state.timing : null);
  /* Zeiten ab „Kammer voll" (die Uhr zählt ab Kolbenstart); eine Stelle
     unter zehn Millisekunden. */
  const ms = t => fmtUnit(t * 1000, 'ms');

  /**
   * Rechnen. `regrid`: auch das Raster neu (die Zellkante hat sich geändert);
   * `advance`: der erste Lauf aus dem Modus „Füllung" geht von selbst zum
   * Ergebnis. Kommt währenddessen eine Änderung, ist die Frontausbreitung
   * überholt: sie endet still und beginnt mit dem neuen Plan — das Raster
   * läuft weiter, es hängt nicht am Plan.
   */
  async function compute({ regrid = false, advance = false, quiet = false } = {}) {
    clearTimeout(timer);
    if (!part.model) return;
    if (state.running) {
      state.queued = true;
      if (regrid) queuedRegrid = true;
      /* Ein neues Raster verlangt, während das alte noch läuft: das ist
         verlorene Zeit — abbrechen und mit der neuen Kante von vorn. */
      if (state.phase === 'fill' || (regrid && state.phase === 'raster')) host.jobs.supersede();
      return;
    }
    const my = ++latest;
    const first = !state.result;
    state.running = true; state.ready = false; state.cancelled = false; state.error = '';
    ui('fill-warn').textContent = '';
    let out;
    for (;;) {
      const grid = regrid || queuedRegrid;
      regrid = false; queuedRegrid = false; state.queued = false;
      refresh();
      /* Ist der letzte Anschnitt inzwischen weg, gibt es nichts zu rechnen. */
      /* Eine Nachrechnung nach einer Änderung am Plan läuft ohne Schleier über
         dem Bild — sie dauert Zehntelsekunden. Muss neu gerastert werden, dauert
         es länger: dann mit. */
      out = M.allItems(state.plan).length ? await runOnce(grid, quiet && !grid && !!state.field) : null;
      if (my !== latest) return;                                       // anderes Bauteil: onPartStart hat aufgeräumt
      if (state.cancelled || state.error || !state.queued) break;
    }
    state.running = false; state.phase = ''; state.queued = false;
    if (out) {
      state.result = out.res;
      state.timing = out.timing;
      state.surf = fracToSurface(out.f, out.res.frac);
      state.ms = out.ms;
      state.stale = out.rev !== rev;
      state.auto = true;
    } else {
      /* Kein neues Ergebnis: was nicht zum Plan passt, bleibt nicht stehen. Nach
         einem Abbruch (oder einem Fehler) rechnet die Seite erst nach dem
         nächsten Knopfdruck wieder von selbst. */
      if (state.stale || !state.result) { state.result = null; state.surf = null; state.timing = null; }
      if (state.cancelled || state.error) state.auto = false;
    }
    if (state.error) ui('fill-warn').textContent = 'Die Füllung konnte nicht gerechnet werden: ' + state.error;
    state.ready = true;
    /* Die letzten Stellen gleich mit: auf der Werkbank stehen sie im Schritt
       Überläufe als Marken, auch wenn hier niemand das Ergebnis ansah. */
    if (derived) updateSpots();
    updateResult();
    refresh();
    host.emit('fill');
    if (out && first && advance && shell.mode === 'fuellung') shell.setMode('ergebnis');
  }

  /* Alles, was aus dem Ergebnis folgt: Zahlen, Liste, Auswahlfeld — und das
     Bild, soweit der Modus es zeigt. */
  function updateResult() {
    updateKpis();
    updateGridFacts();
    updateList();
    syncSelKpis();
    syncGates();
    applyMode();
  }

  function updateKpis() {
    const r = state.result;
    if (!r) { kpis(ui('fill-kpis'), []); return; }
    const s = r.stats;
    const tight = s.flowRatio > FLOW_LIMIT;
    /* Ein Anschnitt, der nichts füllt, steht hier, wo man nach dem Rechnen
       hinschaut — nicht nur in der Liste. Füllt keiner, gibt es keine Füllung. */
    const idle = s.inlets.filter(i => i.closed);
    const none = s.inlets.length > 0 && idle.length === s.inlets.length;
    const rows = none ? [] : [
      { label: 'längster Fließweg', value: fmtUnit(s.maxPath, 'mm', 0) },
      { label: 'Wanddicke 2V/A', value: fmtUnit(s.wallThickness, 'mm') },
      { label: 'Fließweg / Wanddicke', help: 'kennzahlen', value: fmt(s.flowRatio, 0) + ' : 1', verdict: tight ? 'warn' : 'ok',
        note: tight ? 'über etwa ' + FLOW_LIMIT + ' : 1 wird es eng' : '' }
    ];
    if (idle.length) {
      rows.push({ label: none ? 'keine Füllung' : 'füllt nichts', value: esc(idle.map(i => i.id).join(', ')), verdict: none ? 'bad' : 'warn',
        note: [...new Set(idle.map(i => CLOSED_NOTE[i.closed]))].join(' · ') });
    }
    if (s.unreached && !none) rows.push({ label: 'nicht erreicht', value: fmt(s.unreached, 0) + ' Zellen', verdict: 'bad', note: 'abgetrennter Bereich?' });
    kpis(ui('fill-kpis'), rows);
  }

  /* ── Das Bild der Füllung (Modus „Ergebnis") ─────────────── */
  /* Farben, Körper und Marken kosten Zeit (ein Gang über alle Netzpunkte,
     eine Flächenextraktion, ein Gang über das Raster) — gebaut wird nur, was
     der Modus gerade zeigt, und nur, wenn es nicht schon so dasteht. */
  const shown = { paintFor: null, paintQ: -1, bodyFor: null, bodyQ: -1, spotsFor: null, spotsCount: -1 };

  function paintPart() {
    if (shown.paintFor === state.result && shown.paintQ === state.q) return;
    const col = part.colors();
    const pos = part.mesh.geometry.getAttribute('position');
    if (!col || !pos) return;
    const arr = col.array, p = pos.array, f = state.field, s = state.surf, q = state.q;
    /* Der Füllgrad auf der ganzen Farbleiste `turbo` (in jedem Farbschema
       dieselbe): früh blau, spät rot. */
    const turbo = scaleFn('turbo'), grey = linRgb(VIEW.noData);
    for (let i = 0; i < pos.count; i++) {
      const v = sampleFrac(f, s, p[3 * i], p[3 * i + 1], p[3 * i + 2]);
      /* Was über dem Regler liegt, bleibt im Grau des Bauteils — so wandert
         die Front über die Oberfläche. */
      if (Number.isNaN(v) || v > q + 1e-6) { arr.set(grey, 3 * i); continue; }
      arr.set(turbo(v), 3 * i);
    }
    col.needsUpdate = true;
    shown.paintFor = state.result; shown.paintQ = state.q;
  }

  function updateBody() {
    if (shown.bodyFor === state.result && shown.bodyQ === state.q) return;
    setTris(bodyMesh, surfaceNets(fillBodyField(state.field, state.result.frac, state.q), 0), true);
    shown.bodyFor = state.result; shown.bodyQ = state.q;
  }

  function updateSpots() {
    if (shown.spotsFor === state.result && shown.spotsCount === state.spots.count) return;
    spotGroup.clear();
    state.spots.list = [];
    shown.spotsFor = state.result; shown.spotsCount = state.spots.count;
    if (!state.result || !state.spots.count) return;
    const f = state.field;
    const list = lastSpots(f, state.result.frac, { minFrac: 0.8, spacing: Math.max(4 * f.h, 12), limit: state.spots.count });
    state.spots.list = list;
    for (const m of list) {
      const mesh = new T.Mesh(spotGeo, spotMat);
      mesh.position.set(m.x, m.y, m.z);
      mesh.onBeforeRender = (renderer, scene, camera) => {
        const d = camera.isOrthographicCamera ? (camera.top - camera.bottom) / camera.zoom / 3 : camera.position.distanceTo(mesh.position);
        mesh.scale.setScalar(d * 0.012);
      };
      spotGroup.add(mesh);
    }
  }

  function updateResultKpis() {
    const s = state.spots.list[0];
    const tm = timingNow();
    const at = s && tm && tm.tEnd !== null ? tm.timeAt(s.frac) : null;
    kpis(ui('result-kpis'), [...timeRows(), ...(state.result && s ? [
      { label: 'letzte Stelle', value: fmtUnit(100 * s.frac, '%'),
        note: (Number.isFinite(at) ? ms(at - tm.tFull) + ' ab Kammer voll · ' : '') + 'bei ' + [s.x, s.y, s.z].map(v => fmt(v, 0)).join(' / ') + ' mm' }
    ] : [])]);
    /* Die Uhr ab Kolbenstart steht nur in den Details darunter: gezeigt wird
       ab „Kammer voll". Ohne Uhr (eigene Seite, keine Kurve) kein Kasten. */
    const rows = [];
    if (tm) {
      const opens = tm.clock.gates.filter(g => g.open).map(g => g.t);
      rows.push(['Kammer voll', ms(tm.tFull)],
        ['Anschnitte öffnen', ms(Math.min(...opens)) + (opens.length > 1 && Math.max(...opens) - Math.min(...opens) > 5e-4 ? ' bis ' + ms(Math.max(...opens)) : '')]);
      if (tm.tEnd !== null) rows.push(['Bauteil voll', ms(tm.tEnd)]);
      if (Number.isFinite(tm.shotFill)) rows.push(['Füllzeit der Auslegung', fmtUnit(tm.shotFill, 'ms', 0)]);
    }
    facts(ui('clock-facts'), rows);
    ui('clock-details').hidden = !rows.length;
  }
  /* Die Uhr der Werkbank in Kennzahlen: wann das Bauteil voll ist, ab
     „Kammer voll" — oder warum es keine Zeit gibt. */
  function timeRows() {
    if (!derived || !state.result || state.stale) return [];
    const cv = derived.curve();
    if (!cv || !cv.onCurve) return [{ label: 'Zeit', value: '—', note: 'Ohne Schusskurve keine Zeiten: im Schritt Anguss unter „Prozess" die Ankunft nach der Schusskurve einschalten.' }];
    if (cv.timeline && cv.timeline.error) return [{ label: 'Zeit', value: '—', verdict: 'warn', note: 'Keine DieLogic-Kurve: ' + esc(cv.timeline.error) }];
    const tm = state.timing;
    if (!tm) return [];
    if (tm.tEnd === null) return [{ label: 'Bauteil voll', value: '—', verdict: 'bad', note: 'Die Schusskurve endet, bevor das Bauteil voll ist: den Kurvenhub in der Auslegung prüfen.' }];
    return [{ label: 'Bauteil voll ab Kammer voll', value: ms(tm.tEnd - tm.tFull), note: 'das Bauteil selbst füllt sich in ' + ms(tm.tEnd - tm.tFirst) }];
  }
  /* Der Regler nennt zum Füllgrad die Zeit ab „Kammer voll", wenn es eine gibt. */
  function qLabel(v) {
    const tm = timingNow();
    const t = tm && tm.tEnd !== null ? tm.timeAt(v / 100) : null;
    return v + ' %' + (Number.isFinite(t) ? ' · ' + fmtUnit((t - tm.tFull) * 1000, 'ms', 0) : '');
  }

  /* Jeder Modus besitzt, was er zeigt: nur „Ergebnis" färbt das Bauteil,
     stellt den Füllkörper hinein, markiert die letzten Stellen und trägt die
     Skala. Überall sonst steht das Bauteil grau da — dort wird auf die Wand
     geklickt, und die soll aussehen wie eine Wand. */
  function applyMode() {
    const on = shell.mode === 'ergebnis' && !!state.result;
    if (on) {
      if (state.show === 'farbe') paintPart();
      if (state.show === 'koerper') updateBody();
      updateSpots();
    }
    const bodyPos = bodyMesh.geometry.getAttribute('position');
    const body = on && state.show === 'koerper' && !!bodyPos && bodyPos.count > 0;
    part.setLook({
      visible: true, colors: on && state.show === 'farbe',
      /* Mit dem Füllkörper darin ist das Bauteil durchscheinend. */
      opacity: on && state.show === 'koerper' ? Math.min(state.opacity, 0.25) : state.opacity
    });
    bodyMesh.visible = body;
    spotGroup.visible = on && state.spots.count > 0;
    /* Die Skala gehört zum gefärbten Bauteil; der Füllkörper trägt die Farbe
       der Schmelze und steht in der Legende. */
    const tm = timingNow();
    shell.colorbar(on && state.show === 'farbe' ? {
      title: 'Füllgrad',
      stops: gradient(t => scale('turbo', t)),
      ticks: [100, 75, 50, 25, 0].map(v => v + ' %'),
      extra: tm && tm.tEnd !== null ? fmtUnit((tm.tFirst - tm.tFull) * 1000, 'ms', 0) + ' bis ' + fmtUnit((tm.tEnd - tm.tFull) * 1000, 'ms', 0) + ' ab Kammer voll' : ''
    } : null);
    shell.legend(legendRow(M.inletColor(), 'Anschnitt')
      + (body ? legendRow(ROLE.melt, 'Schmelze bis ' + fmt(100 * state.q, 0) + ' %') : '')
      + (spotGroup.visible ? legendRow(spotColor(), 'zuletzt gefüllt') : '')
      + selectedRow());
    if (wired) { updateResultKpis(); ui('q-val').textContent = qLabel(Math.round(100 * state.q)); }
    view.invalidate();
  }

  /* Ohne Ergebnis sind die Felder des Modus „Ergebnis" gedämpft. */
  function syncGates() {
    const sec = shell.modeSection('ergebnis');
    if (!sec) return;
    for (const child of sec.children) child.classList.toggle('disabled', !state.result);
  }

  /* Der Füllgrad-Regler meldet sich je Mausschritt; gebaut wird höchstens
     einmal je Bild. */
  let viewRaf = 0;
  const applySoon = () => { if (!viewRaf) viewRaf = requestAnimationFrame(() => { viewRaf = 0; applyMode(); }); };

  /* ── Auswahl ─────────────────────────────────────────────── */
  const sel = () => (handles.selected ? state.plan.items[handles.selected] : null);

  /* Die Gruppen des Auswahlfelds und der Drehregler — beide gibt es, sobald
     der Rahmen das Feld eingesetzt hat (mounted). */
  let groups = null, rot = null;

  function syncSelection() {
    if (!groups) return;
    const it = sel();
    updateList();
    if (!it) { shell.inspector.hide(); shell.status(''); return; }
    shell.inspector.show({ title: selTitle({ color: M.inletColor(), label: 'Anschnitt', id: it.id }) });
    shell.status(HANDLE_HINT);
    ui('sel-w').value = fmtPlain(it.w);
    ui('sel-h').value = fmtPlain(it.h);
    const own = it.share !== null && it.share !== undefined;
    ui('sel-share').value = own ? fmtPlain(it.share, 0) : '';
    ui('sel-share').classList.remove('bad');
    ui('sel-share').placeholder = 'auto ' + fmt(100 * (M.shares(state.plan)[it.id] || 0), 0);
    for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) ui(k).value = fmtPlain(it.pos[i], 1);
    rot.set(it.rot || 0);
    /* Die Reiter erst mit einer Auswahl — ohne trägt die Seite nur die der Modi. */
    groups.set(GROUPS);
    syncSelKpis();
  }

  /* „füllt … %": was die Rechnung zum gewählten Anschnitt sagt. */
  function syncSelKpis() {
    const it = sel();
    if (!it || !wired) return;
    const inf = inletInfo(it.id);
    const thin = !!inf && !inf.closed && inf.seeds <= 1;
    kpis(ui('sel-kpis'), [inf && inf.closed
      ? { label: 'füllt', value: 'nichts', verdict: 'warn', note: CLOSED_NOTE[inf.closed] }
      : inf
        ? { label: 'füllt', value: fillsText(inf) + ' des Volumens', verdict: thin ? 'warn' : '',
          note: thin ? 'trifft kaum eine Rasterzelle: feiner rastern oder höher machen' : '' }
        : { label: 'füllt', value: '—', note: state.running || (state.auto && state.result) ? 'rechnet nach …' : 'noch nicht gerechnet' }]);
    const rows = [
      ['Fläche', fmtUnit(M.areaOf(it), 'mm²')],
      ['Anteil am Strom', fmtUnit(100 * (M.shares(state.plan)[it.id] || 0), '%')],
      ['Normale', dirText(it.n)]
    ];
    if (inf) rows.push(['Startzellen', fmt(inf.seeds, 0)]);
    facts(ui('sel-facts'), rows);
  }

  /* Entfernen fragt nicht; „Rückgängig" holt den Anschnitt zurück. */
  function removeSelected() {
    const it = sel();
    if (!it) return false;
    const name = label(it);
    M.removeItem(state.plan, it.id);
    handles.select(null);
    rebuild();
    host.removed(name);
    planChanged();
    return true;
  }

  /* ── Zielmodus: setzen und neu setzen (js/handles.js, createPlacer) ── */
  /** Ein neuer Anschnitt: der nächste Klick aufs Bauteil setzt ihn. Der Strahl
      liefert die nach INNEN gerichtete Normale; der Anschnitt trägt die nach außen. */
  function startPlace() {
    if (!part.model) { shell.toast(NEEDS_PART); return; }
    if (state.placing) { placer.cancel(); return; }                // derselbe Chip noch einmal: doch nicht
    handles.select(null);
    placer.aim({
      what: 'anschnitt',
      text: 'Anschnitt: die Stelle am Bauteil anklicken, wo die Schmelze eintritt. Ziehen dreht die Ansicht, Esc bricht ab.',
      onHit: hit => {
        const it = M.addInlet(state.plan, hit.point, outward(hit.dir), { w: state.defaults.w, h: state.defaults.h });
        rebuild();
        handles.select(it.id);
        host.changed(label(it) + ' gesetzt');
        planChanged();
      }
    });
    shell.renderChips();
  }

  /** Der Klick auf den Pfeil: ein vorhandener Anschnitt an eine andere Stelle. */
  function startMove(id) {
    const it = state.plan.items[id];
    if (!it) return;
    if (!part.model) { shell.toast(NEEDS_PART); return; }
    placer.aim({
      text: label(it) + ': die neue Stelle am Bauteil anklicken. Esc bricht ab.',
      onHit: hit => {
        M.placeAt(state.plan, id, hit.point, outward(hit.dir));
        rebuild();
        syncSelection();
        host.changed(label(it) + ' neu gesetzt');
        planChanged();
      }
    });
  }

  shell.setChips(derived ? [] : [{
    id: 'anschnitt', label: 'Anschnitt setzen', icon: () => M.inletColor(),
    title: 'Die Stelle am Bauteil anklicken, an der die Schmelze eintritt.',
    enabled: () => !!part.model, reason: NEEDS_PART,
    active: () => state.placing,
    onClick: startPlace
  }]);

  /* ── Die Anschnitte aus dem Anguss (die Werkbank) ────────── */
  /* Je Mündung ein Anschnitt: Kennung, Ort und Maße des Anguss-Anschnitts,
     die Normale gegen die Mündungsrichtung, der Anteil fest aus der
     Strömung. Die Höhe des Anschnitts steht in der Ausstoßrichtung, die
     Breite in der Trennebene — das Rechteck wird entsprechend gedreht. */
  function derivePlan() {
    const plan = M.emptyPlan();
    plan.alpha = state.plan.alpha;
    for (const m of derived.inlets()) {
      const it = M.addInlet(plan, m.pos, [-m.dir[0], -m.dir[1], -m.dir[2]], { w: m.w, h: m.h });
      delete plan.items[it.id];
      it.id = m.id;
      it.bound = m.bound;
      it.tArrive = m.tArrive;
      it.share = Math.round(m.share * 1000) / 10;
      plan.items[m.id] = it;
      const f = M.frameOf(it);
      const vz = addScaled([0, 0, 1], f.n, -dot([0, 0, 1], f.n));
      if (Math.hypot(vz[0], vz[1], vz[2]) > 1e-6) {
        const u = norm(vz);
        M.setRot(plan, it.id, Math.round(Math.atan2(dot(cross(f.v, u), f.n), dot(f.v, u)) * 180 / Math.PI));
      }
    }
    return plan;
  }
  /* Was sich an den Anschnitten ändern kann, in einer Zeile — nach einer
     Änderung am Anguss, die sie nicht betrifft (die Entformschräge der Kanäle),
     rechnet nichts nach. */
  const signature = plan => JSON.stringify([plan.alpha, M.allItems(plan).map(it => [it.id, it.pos, it.n, it.rot, it.w, it.h, it.share, it.bound, it.tArrive])]);
  function inletsChanged() {
    if (!derived) return;
    const next = derivePlan();
    if (signature(next) === signature(state.plan)) return;
    state.plan = next;
    rebuild();
    planChanged();
  }

  /* ── Hauptknopf je Modus ─────────────────────────────────── */
  /* Was fehlt, steht in der Zeile — ein toter Knopf hilft niemandem. */
  function runPrimary(where) {
    if (!part.model) return { hidden: true, reason: 'Zuerst ein Bauteil laden.' };
    if (!M.allItems(state.plan).length) return { hidden: true, reason: NO_GATE };
    if (cellChanged()) {
      return { label: 'Neu rastern', onClick: () => compute({ regrid: true }), noteKind: 'warn',
        reason: (state.cancelled ? 'Abgebrochen' : 'Zellkante geändert') + ': ' + (state.result ? 'Das Bild zeigt noch das vorige Raster.' : 'Das Raster hat noch die vorige Kante.') };
    }
    if (state.result && state.stale) return { hidden: true, reason: 'Der Plan hat sich geändert, rechnet nach …' };
    if (!state.result) {
      return { label: RUN, onClick: () => compute({ advance: true }), noteKind: state.cancelled ? 'warn' : '',
        reason: state.cancelled ? 'Abgebrochen: Zu diesem Plan gibt es keine Füllung.'
          : where === 'ergebnis' ? 'Zuerst die Füllung rechnen, dann gibt es hier etwas zu sehen.'
            : 'Der Plan ist noch nicht gerechnet.' };
    }
    if (where === 'ergebnis') return null;
    /* Aktuell: nichts zu tun, also kein Knopf — die Zeile sagt, wie es weitergeht. */
    return { hidden: true, noteKind: 'ok', reason: 'Gerechnet in ' + dauer(state.ms) + '. Jede Änderung am Plan rechnet jetzt von selbst nach.' };
  }
  /* Bei den Anschnitten wird gesetzt, nicht gerechnet — die Zeile sagt, wo es weitergeht. */
  function gatesPrimary() {
    if (!part.model) return { hidden: true, reason: 'Zuerst ein Bauteil laden.' };
    if (!M.allItems(state.plan).length) return null;                // der Hinweis des Modus sagt es schon
    if (!state.result && !state.running) return { hidden: true, reason: 'Weiter im Reiter „Füllung"; dort wird gerechnet.' };
    return null;
  }

  /* Auf der Werkbank sagen die Hinweise, woher die Anschnitte kommen. */
  const BENCH_HINT = {
    anschnitte: 'Die Anschnitte kommen aus dem Anguss: Ort und Richtung der Mündung, Breite und Höhe, der Anteil am Strom.',
    ergebnis: 'Der Füllgrad einer Stelle ist der Anteil des Volumens, der voll ist, wenn die Front sie erreicht; die Zeit dazu kommt von der Schusskurve.'
  };
  const modes = MODES.map(m => ({ ...m, ...(derived && BENCH_HINT[m.id] ? { hint: BENCH_HINT[m.id] } : {}), enter: () => { syncGates(); applyMode(); } }));
  const by = Object.fromEntries(modes.map(m => [m.id, m]));
  by.anschnitte.primary = gatesPrimary;
  by.fuellung.primary = () => runPrimary('fuellung');
  by.ergebnis.primary = () => runPrimary('ergebnis');

  /* ── Verdrahten: sobald der Rahmen die Felder der Modi eingesetzt hat ── */
  const limits = k => ({ min: M.PARAM_META[k].min, max: M.PARAM_META[k].max, unit: M.PARAM_META[k].unit });
  function mounted() {
    shell.inspector.body.innerHTML = INSPECTOR;
    shell.inspector.onClose(() => handles.select(null));
    groups = groupTabs({ tabs: ui('sel-groups'), box: ui('sel-params') });
    ui('clock-details').hidden = true;             // bis es eine Uhr gibt
    if (derived) {
      /* Die Anschnitte kommen aus dem Anguss: keine Vorgaben, die Liste ist Auskunft. */
      ui('defaults-block').hidden = true;
      ui('list-title').textContent = 'Aus dem Anguss';
      ui('item-empty').textContent = 'Noch kein Anguss: im Schritt Anguss einen vorschlagen.';
      ui('spots-hint').hidden = true;
      ui('spots-hint-bench').hidden = false;
    } else onListPick(ui('item-list'), id => handles.select(id));
    if (shared) {
      /* Das Raster ist das gemeinsame Feld: seine Zellkante steht im Schritt Bauteil. */
      ui('cell').closest('.row').hidden = true;
      ui('cell-shared').hidden = false;
    }
    numberInput(ui('def-w'), v => { state.defaults.w = v; return v; }, limits('w'));
    numberInput(ui('def-h'), v => { state.defaults.h = v; return v; }, limits('h'));

    /* Das Auswahlfeld. */
    for (const [name, key, text] of [['sel-w', 'w', 'Breite geändert'], ['sel-h', 'h', 'Höhe geändert']]) {
      numberInput(ui(name), v => {
        const it = sel();
        if (!it) return v;
        it[key] = v;
        rebuild();
        syncSelection();
        host.changed(text);
        planChanged();
        return v;
      }, limits(key));
    }
    /* Der Anteil: leer heißt „aus der Fläche"; eine Zahl setzt ihn fest. */
    const share = ui('sel-share');
    const applyShare = () => {
      const it = sel();
      if (!it) return;
      const t = share.value.trim();
      let next = null;
      if (t !== '') {
        const v = parseNumber(t);
        if (v === null) { share.classList.add('bad'); return; }
        const lim = limits('share');
        const c = clamp(v, lim);
        next = c.value;
        if (c.clamped) clampNote(share, 'auf ' + fmtPlain(next) + ' % begrenzt (' + rangeText(lim.min, lim.max, '%') + ')');
      }
      const before = it.share === undefined ? null : it.share;
      it.share = next;
      syncSelection();
      if (before === next) return;
      host.changed('Anteil geändert');
      planChanged();
    };
    share.addEventListener('change', applyShare);
    share.addEventListener('keydown', ev => { if (ev.key === 'Enter') { applyShare(); ev.preventDefault(); } });
    for (const [name, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
      numberInput(ui(name), v => {
        const it = sel();
        if (!it) return v;
        const p = it.pos.slice();
        p[axis] = v;
        M.setPos(state.plan, it.id, p);
        rebuild();
        host.changed('Lage geändert');
        planChanged();
        return v;
      }, POS_LIMIT);
    }
    rot = slider(ui('sel-rot'), v => {
      const it = sel();
      if (!it) return;
      M.setRot(state.plan, it.id, v);
      rebuild();
      host.changed('Drehung geändert', { coalesce: 'rot:' + it.id, ms: SLIDER_MS });
      planChanged();
    }, v => fmt(v, 0) + '°', ui('sel-rot-val'), { fire: false });
    ui('del-item').addEventListener('click', () => removeSelected());

    /* Füllung. */
    numberInput(ui('cell'), v => {
      state.h = hostField.setCell(v);
      state.hAuto = false;
      if (!cellChanged()) ui('cell-note').textContent = '';
      /* Zurück auf der Kante des Rasters: das Ergebnis gilt wieder ganz. */
      if (!cellChanged() && state.result && !state.stale) state.auto = true;
      /* Wird gerade mit einer anderen Kante gerastert, gilt die neue: das
         laufende Raster bricht still ab, und es beginnt mit ihr von vorn. Ist
         das Raster schon fertig, rechnet die Front darauf zu Ende — wie ohne
         Rechnung steht danach „Neu rastern" da. */
      if (state.running && state.phase === 'raster' && Math.abs(state.h - rasterH) > 1e-9) compute({ regrid: true });
      updateGridFacts();
      refresh();
      return state.h;
    }, { min: CELL_RANGE[0], max: CELL_RANGE[1], unit: 'mm' });
    alpha = slider(ui('alpha'), v => {
      state.plan.alpha = v;
      host.changed('Dünnwand-Bremse geändert', { coalesce: 'alpha', ms: SLIDER_MS });
      planChanged();
    }, v => fmt(v, 1), null, { fire: false });

    /* Ergebnis — Anzeige, kein Plan: nichts davon ist ein Schritt im Verlauf. */
    segButtons(ui('show-seg'), v => { state.show = v; applyMode(); });
    slider(ui('q'), v => { state.q = v / 100; applySoon(); }, qLabel, null, { fire: false });
    spotsSlider = slider(ui('spots-count'), v => {
      state.spots.count = v;
      /* Auf der Werkbank zeigt der Schritt Überläufe die Stellen: neu, auch
         wenn der Modus sie gerade nicht zeigt. */
      if (derived) updateSpots();
      applyMode();
      if (derived) host.emit('fill');
    }, v => (v ? String(v) : 'keine'), null, { fire: false });

    const pop = shell.darstellung(DARSTELLUNG);
    slider(pop.querySelector('[data-ui="opacity"]'), v => { state.opacity = v / 100; applyMode(); }, v => v + ' %', pop.querySelector('[data-ui="opacity-val"]'), { fire: false });

    wired = true;
    rebuild();
    syncSelection();
    updateResult();
  }

  /* ── Plan laden, Bauteil ─────────────────────────────────── */
  let alpha = null;                                  // der Regler der Dünnwand-Bremse (mounted)
  let spotsSlider = null;                            // die Zahl der letzten Stellen (mounted)
  function loadPlan(plan) {
    placer.cancel();
    state.plan = plan;
    handles.select(null);
    alpha.set(state.plan.alpha);
    rebuild();
    syncSelection();
    planChanged();
  }

  /* Die Werkbank: nicht mehr dran — kein Zielen, keine Anschnitte, kein
     Ergebnisbild (ohne Modus zeigt applyMode nichts davon), und gerechnet wird
     erst wieder, wenn er dran ist. Wieder dran — ein anderer Schritt hat
     womöglich auf das Bauteil gemalt: neu malen; was inzwischen liegen blieb,
     jetzt rechnen. */
  function setActive(on) {
    active = on;
    clearTimeout(timer);
    if (!on) placer.cancel();
    shown.paintFor = null;
    rebuild();
    applyMode();
    if (!on) return;
    syncSelection();
    const items = M.allItems(state.plan).length;
    if (part.model && items && !state.running && (state.stale || !state.result) && state.auto && !state.cancelled) compute({ quiet: !!state.result });
  }

  /** Das Feld des Gastgebers hat sich geändert (die Werkbank: ein anderer
      Schritt hat es gerechnet, oder die Zellkante ist eine andere). Ein
      Ergebnis gehört zu SEINEM Raster: mit einem neuen ist es weg — und wird,
      wenn der Schritt dran ist, auf dem neuen gerechnet. */
  function fieldChanged() {
    if (state.running || !part.model) return;
    const f = hostField.peek(gridParams());
    if (f && f !== state.field) {
      adoptField(f, 0, cell());
      if (active && state.auto && M.allItems(state.plan).length) { clearTimeout(timer); timer = setTimeout(() => compute({ quiet: true }), RESOLVE_MS); }
    }
    updateGridFacts();
    refresh();
  }

  const tool = {
    id: 'fuellung',
    modes,
    startMode: derived ? 'ergebnis' : 'anschnitte',
    accepts: [M.FORMAT],
    setActive,
    toJSON: () => M.toJSON(state.plan),
    fromJSON: obj => loadPlan(M.fromJSON(obj)),
    /* Auf der Werkbank gehört vom Plan nur α dem Anwender — die Anschnitte
       kommen aus dem Anguss und stehen in dessen Abzug. */
    serialize: () => (derived ? { alpha: state.plan.alpha } : M.toJSON(state.plan)),
    /* Rückgängig: der Plan wie er war — die Auswahl bleibt, wenn es sie noch
       gibt. Kommt dabei genau EIN Anschnitt zurück (das Entfernen wurde
       zurückgenommen), ist er gewählt: man sieht, was wieder da ist, und Entf
       träfe ihn wieder. */
    restore(doc) {
      if (derived) {
        if (!Number.isFinite(doc.alpha) || doc.alpha === state.plan.alpha) return;
        state.plan.alpha = doc.alpha;
        alpha.set(doc.alpha);
        planChanged();
        return;
      }
      const keep = handles.selected;
      const before = new Set(Object.keys(state.plan.items));
      placer.cancel();
      state.plan = M.fromJSON(doc);
      const back = Object.keys(state.plan.items).filter(id => !before.has(id));
      handles.select(keep && state.plan.items[keep] ? keep : back.length === 1 ? back[0] : null);
      alpha.set(state.plan.alpha);
      rebuild();
      syncSelection();
      /* Nach einem abgebrochenen Zug ist der Plan der, zu dem die Füllung
         gehört: nichts nachzurechnen. */
      if (reverting) { updateResult(); refresh(); } else planChanged();
    },
    exports: [{
      label: 'Füllkörper als STL',
      enabled: () => !!state.result, reason: 'Zuerst die Füllung rechnen, dann gibt es einen Füllkörper.',
      run: () => {
        const q = Math.round(100 * state.q);
        const tris = surfaceNets(fillBodyField(state.field, state.result.frac, state.q), 0);
        if (!tris.length) { shell.toast('Bei ' + q + ' % gibt es noch keinen Füllkörper; den Füllgrad anheben.'); return; }
        saveSTL(tris, 'DieLogic Füllkörper ' + q + ' %', part.name, 'fuellung-' + q);
      }
    }],
    keys: {
      Delete: () => removeSelected(),
      /* Esc hebt die Auswahl auf. Einen laufenden Zug und das Zielen bricht
         der Rahmen vorher ab (cancelDrag, cancelAim). */
      Escape: () => {
        if (!handles.selected) return false;
        handles.select(null);
        return true;
      }
    },
    cancelDrag: () => !!handles.cancelDrag(),
    cancelAim: () => placer.cancel(),
    onPartStart() {
      state.ready = false;
      /* Eine laufende Rechnung gehört zum alten Bauteil: der Gastgeber hat
         sie still beendet, ihr Lauf fasst nichts mehr an. */
      latest++;
      clearTimeout(timer);
      state.running = false; state.phase = ''; state.queued = false; queuedRegrid = false;
    },
    onPart() {
      state.field = null; state.cells = 0; state.result = null; state.surf = null; state.timing = null;
      state.stale = true; state.auto = false; state.cancelled = false; state.error = '';
      shown.paintFor = shown.bodyFor = shown.spotsFor = null;
      /* Solange niemand eine Zellkante gesetzt hat, kommt sie vom Teil — auf
         der Werkbank stellt sie der Schritt Bauteil. */
      if (!shared) {
        if (state.hAuto) { state.h = part.cellSuggestion; ui('cell').value = fmtPlain(state.h); }
        hostField.h = state.h;
      }
      ui('cell-note').textContent = '';
      ui('fill-warn').textContent = '';
      /* Ein Anschnitt sitzt auf der Wand EINES Bauteils: ein neues beginnt leer
         (α bleibt — das ist eine Annahme, keine Stelle am Teil). Der bisherige
         Plan bleibt als Entwurf bei seinem Bauteil. Auf der Werkbank kommen
         die Anschnitte aus dem Anguss, und gerechnet wird von selbst. */
      if (derived) state.auto = true;
      const plan = derived ? derivePlan() : M.emptyPlan();
      plan.alpha = state.plan.alpha;
      loadPlan(plan);
      host.resetHistory();
      shell.renderChips();
      refresh();
      state.ready = true;
    },
    mounted,
    /* Was die übrigen Schritte der Werkbank ihm sagen und von ihm wissen. */
    link: {
      /** Der Anguss hat sich geändert: die Anschnitte neu, und nachrechnen. */
      inletsChanged,
      fieldChanged,
      /** Die zuletzt gefüllten Stellen — für die Marken im Schritt Überläufe. */
      spots: () => (state.result && !state.stale ? state.spots.list : []),
      /** Was die Werkbank-Datei von der Füllung aufhebt. */
      doc: () => ({ alpha: state.plan.alpha, spots: state.spots.count }),
      load(o) {
        if (!o || typeof o !== 'object') return;
        if (Number.isFinite(o.alpha)) {
          const a = Math.max(M.ALPHA_RANGE[0], Math.min(M.ALPHA_RANGE[1], o.alpha));
          if (a !== state.plan.alpha) { state.plan.alpha = a; if (alpha) alpha.set(a); planChanged(); }
        }
        if (Number.isFinite(o.spots)) {
          state.spots.count = Math.max(0, Math.min(20, Math.round(o.spots)));
          if (spotsSlider) spotsSlider.set(state.spots.count);
          updateSpots();
          applyMode();
          host.emit('fill');
        }
      }
    }
  };

  tool.__viewer = {
    state, view, shell, host, tool, handles, group, rebuild, compute, computeField: () => compute({ regrid: true }),
    startPlace, startMove, loadPlan, inletMesh, bodyMesh, spotGroup,
    get partMesh() { return part.mesh; }
  };
  return tool;
}
