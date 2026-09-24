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
   Plan (Format dielogic-fuellung, Fassung 1 — unverändert). */

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

export function createFuellungTool(host) {
  const { shell, view, part, field: hostField } = host;
  const ui = host.ui;

  let placer = null;
  const state = {
    plan: M.emptyPlan(), defaults: { ...M.DEFAULTS },
    /** Wird gerade ein Anschnitt gesetzt (der Chip ist aktiv)? */
    get placing() { return !!(placer && placer.placing); },
    h: 3, hAuto: true, field: null, cells: 0, gridMs: 0,
    result: null, surf: null, ms: 0,
    /* stale: das Ergebnis passt nicht (mehr) zum Plan. auto: der erste Lauf
       ist gelaufen — Änderungen rechnen von selbst nach. */
    stale: true, auto: false, running: false, phase: '', queued: false, cancelled: false, error: '',
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

  /* ── Kette: Plan → Anzeige ───────────────────────────────── */
  function rebuild(mode) {
    setTris(inletMesh, buildAll(state.plan));
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
    ui('item-list').innerHTML = items.map(it => {
      const inf = inletInfo(it.id);
      const thin = !!inf && !inf.closed && inf.seeds <= 1;
      const fills = !inf ? '' : inf.closed ? ' · füllt nichts ⚠' : ' · füllt ' + fillsText(inf) + ' des Volumens' + (thin ? ' ⚠' : '');
      return listRow({
        id: it.id, color: M.inletColor(), name: esc(label(it)), value: fmt(it.w, 1) + ' × ' + fmt(it.h, 1) + ' mm',
        sub: fmtUnit(100 * (sh[it.id] || 0), '%') + ' Strom' + fills,
        cls: 'fu-row' + (thin || (inf && inf.closed) ? ' warn' : ''), active: it.id === cur
      });
    }).join('');
    ui('item-empty').hidden = items.length > 0;
    ui('item-count').textContent = items.length ? '· ' + fmt(items.length, 0) : '';
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
  const gridParams = () => ({ h: state.h, band: Math.max(2.5 * state.h, 1.5), pad: 2 * state.h });
  const cellChanged = () => !!state.field && Math.abs(state.field.h - state.h) > 1e-9;

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
    if (lifted && Math.abs(state.h - asked) < 1e-9) {
      state.h = f.h;
      ui('cell').value = fmtPlain(f.h);
      ui('cell-note').textContent = 'Feiner geht hier nicht: ' + LIMIT_TEXT + ' Rasterpunkte sind die Grenze, die Zellkante steht auf ' + fmtUnit(f.h, 'mm', 2) + '.';
    } else if (!lifted) ui('cell-note').textContent = '';
    /* Ein Ergebnis gehört zu SEINEM Raster: mit dem neuen ist das alte weg. */
    dropResult();
  }

  function updateGridFacts() {
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
    else if (items && state.auto) { updateResult(); timer = setTimeout(() => compute({ quiet: true }), RESOLVE_MS); }
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
        return { f, res, rev: myRev, ms: performance.now() - t1 };
      },
      onCancel: () => { state.cancelled = true; }
    }).catch(err => {
      state.error = err.message;
      console.error(err);
      return null;
    });
  }

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
      state.surf = fracToSurface(out.f, out.res.frac);
      state.ms = out.ms;
      state.stale = out.rev !== rev;
      state.auto = true;
    } else {
      /* Kein neues Ergebnis: was nicht zum Plan passt, bleibt nicht stehen. Nach
         einem Abbruch (oder einem Fehler) rechnet die Seite erst nach dem
         nächsten Knopfdruck wieder von selbst. */
      if (state.stale || !state.result) { state.result = null; state.surf = null; }
      if (state.cancelled || state.error) state.auto = false;
    }
    if (state.error) ui('fill-warn').textContent = 'Die Füllung konnte nicht gerechnet werden: ' + state.error;
    state.ready = true;
    updateResult();
    refresh();
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
    kpis(ui('result-kpis'), state.result && s ? [
      { label: 'letzte Stelle', value: fmtUnit(100 * s.frac, '%'), note: 'bei ' + [s.x, s.y, s.z].map(v => fmt(v, 0)).join(' / ') + ' mm' }
    ] : []);
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
    shell.colorbar(on && state.show === 'farbe' ? {
      title: 'Füllgrad',
      stops: gradient(t => scale('turbo', t)),
      ticks: [100, 75, 50, 25, 0].map(v => v + ' %')
    } : null);
    shell.legend(legendRow(M.inletColor(), 'Anschnitt')
      + (body ? legendRow(ROLE.melt, 'Schmelze bis ' + fmt(100 * state.q, 0) + ' %') : '')
      + (spotGroup.visible ? legendRow(spotColor(), 'zuletzt gefüllt') : '')
      + selectedRow());
    if (wired) updateResultKpis();
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

  shell.setChips([{
    id: 'anschnitt', label: 'Anschnitt setzen', icon: () => M.inletColor(),
    title: 'Die Stelle am Bauteil anklicken, an der die Schmelze eintritt.',
    enabled: () => !!part.model, reason: NEEDS_PART,
    active: () => state.placing,
    onClick: startPlace
  }]);

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

  const modes = MODES.map(m => ({ ...m, enter: () => { syncGates(); applyMode(); } }));
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
    onListPick(ui('item-list'), id => handles.select(id));
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
    slider(ui('q'), v => { state.q = v / 100; applySoon(); }, v => v + ' %', null, { fire: false });
    slider(ui('spots-count'), v => { state.spots.count = v; applyMode(); }, v => (v ? String(v) : 'keine'), null, { fire: false });

    const pop = shell.darstellung(DARSTELLUNG);
    slider(pop.querySelector('[data-ui="opacity"]'), v => { state.opacity = v / 100; applyMode(); }, v => v + ' %', pop.querySelector('[data-ui="opacity-val"]'), { fire: false });

    wired = true;
    rebuild();
    syncSelection();
    updateResult();
  }

  /* ── Plan laden, Bauteil ─────────────────────────────────── */
  let alpha = null;                                  // der Regler der Dünnwand-Bremse (mounted)
  function loadPlan(plan) {
    placer.cancel();
    state.plan = plan;
    handles.select(null);
    alpha.set(state.plan.alpha);
    rebuild();
    syncSelection();
    planChanged();
  }

  const tool = {
    id: 'fuellung',
    modes,
    startMode: 'anschnitte',
    accepts: [M.FORMAT],
    toJSON: () => M.toJSON(state.plan),
    fromJSON: obj => loadPlan(M.fromJSON(obj)),
    serialize: () => M.toJSON(state.plan),
    /* Rückgängig: der Plan wie er war — die Auswahl bleibt, wenn es sie noch
       gibt. Kommt dabei genau EIN Anschnitt zurück (das Entfernen wurde
       zurückgenommen), ist er gewählt: man sieht, was wieder da ist, und Entf
       träfe ihn wieder. */
    restore(doc) {
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
      state.field = null; state.cells = 0; state.result = null; state.surf = null;
      state.stale = true; state.auto = false; state.cancelled = false; state.error = '';
      shown.paintFor = shown.bodyFor = shown.spotsFor = null;
      /* Solange niemand eine Zellkante gesetzt hat, kommt sie vom Teil. */
      if (state.hAuto) { state.h = part.cellSuggestion; ui('cell').value = fmtPlain(state.h); }
      hostField.h = state.h;
      ui('cell-note').textContent = '';
      ui('fill-warn').textContent = '';
      /* Ein Anschnitt sitzt auf der Wand EINES Bauteils: ein neues beginnt leer
         (α bleibt — das ist eine Annahme, keine Stelle am Teil). Der bisherige
         Plan bleibt als Entwurf bei seinem Bauteil. */
      const plan = M.emptyPlan();
      plan.alpha = state.plan.alpha;
      loadPlan(plan);
      host.resetHistory();
      shell.renderChips();
      refresh();
      state.ready = true;
    },
    mounted
  };

  tool.__viewer = {
    state, view, shell, host, tool, handles, group, rebuild, compute, computeField: () => compute({ regrid: true }),
    startPlace, startMove, loadPlan, inletMesh, bodyMesh, spotGroup,
    get partMesh() { return part.mesh; }
  };
  return tool;
}
