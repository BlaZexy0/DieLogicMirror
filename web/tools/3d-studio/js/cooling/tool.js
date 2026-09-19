/* Temperierkanal-Designer — das Werkzeug im gemeinsamen Rahmen.

   Um das Bauteil liegt die ABSTANDSFLÄCHE: die Fläche, die überall
   denselben Abstand zur Kavität hat (voreingestellt 20 mm). Sie kommt aus
   dem Rasterfeld des Gastgebers (host.field, js/part/field.js) und wird
   beim Laden des Bauteils gerechnet — als Rechnung mit Fortschritt und
   Abbruch; ein neues Bauteil bricht die laufende ab und beginnt von vorn.
   Wie fein, sagt die ZELLKANTE in mm, mit einer Vorgabe aus dem Bauteil
   (ein 64stel der längsten Kante: hier zählt die Fläche außen, nicht die
   Wand innen). Auf ihr werden die Elemente gesetzt:

     Kühlstich   ein Klick — die Spitze sitzt am Punkt, der Stich läuft
                 vom Bauteil weg: senkrecht zur Fläche, auf die Kamera zu
                 oder entlang X/Y/Z, wie man es wählt.
     Kanal       zwei Klicks, ein Ende hier, das andere dort.

   Danach bewegt man Enden frei im Raum — es gibt keine Arbeitsebene,
   deshalb hat jedes Ende drei Achsenpfeile (js/handles.js) und rutscht
   ohne Pfeil in der Bildebene; wahlweise wandern beide Enden zugleich.

   Was zählt, ist der WANDABSTAND: der kleinste Abstand der Bohrungswand
   zur Kavität, aus dem Feld entlang der Achse abgetastet. Geprüft wird er
   gegen den MINDEST-WANDABSTAND des Plans (Vorgabe: Achsabstand − Ø/2 der
   dicksten Vorgabe) — nicht mehr gegen den Achsabstand selbst: daran
   scheiterte früher jede Bohrung, die das Werkzeug mit seinen eigenen
   Vorgaben gesetzt hatte. Wer ihn unterschreitet, steht in der Warnfarbe im
   Bild und im Modus „Prüfung" in der Liste.

   Die Modi: Bauteil · Abstandsfläche · Setzen · Prüfung. Bohrungen und
   Griffe sind der Plan und stehen in jedem Modus im Bild; die
   Abstandsfläche gehört den Modi „Abstandsfläche" und „Setzen" (auf ihr
   wird gezielt — wer anderswo einen Chip oder den Pfeil wählt, landet in
   „Setzen"). Jede abgeschlossene Änderung geht an den Gastgeber
   (host.changed): Rückgängig, Entwurf, „Ungespeichert". */

import * as T from 'three';
import { facts, segButtons, slider, numberInput } from '../ui/controls.js';
import { fmt, fmtPlain, fmtUnit } from '../studio/format.js';
import { kpis } from '../studio/rows.js';
import { baseName } from '../studio/files.js';
import { sampleField, CELL_RANGE } from '../part/field.js';
import { surfaceNets } from '../part/surfacenets.js';
import { writeSTL } from '../part/stlio.js';
import { createHandles, SELECTED_RING } from '../handles.js';
import { setTris, download, safeName, dirText } from '../ui/common.js';
import * as M from './model.js';
import { buildItem, buildAll, volumeOf, wallClearance, wallVerdict } from './geom.js';
import { planCooling } from './auto.js';
import { MODES, INSPECTOR, GROUPS, DARSTELLUNG } from './panel.js';

const SHELL_COLOR = '#3fc2b6';
const SHELL_OPACITY = 0.22;
/* Wer den Mindest-Wandabstand unterschreitet: ein Rot, das sich vom Orange
   der Kühlstiche und vom Blau der Kanäle gleich weit absetzt. */
const TIGHT_COLOR = '#c2185b';
/* Was das Feld nicht besser weiß: der Feldwert ist zwischen den
   Rasterpunkten interpoliert, die Abstandsfläche liegt als Dreiecksnetz
   darin. Ein Viertel der Zellkante deckt beides — gemessen am Beispielteil
   liegen Spitzen auf der Fläche um weniger als ein Zehntel daneben. */
const TOL_CELLS = 0.25;
/* Zwei Bohrungen, die sich berühren, sind eine: enger als 1,5 × Ø setzt die
   Automatik nicht, gleich was der Regler sagt — und sagt es dazu. */
const SPACING_FACTOR = 1.5;
/* Was das Feld kostet: je Dreieck werden die Zellen im Band um es herum
   besucht, (2·Band/Zellkante + 1)³ Stück, rund 17 ns je Besuch (gemessen am
   Getriebedeckel, 60 000 Dreiecke: 6,5 mm → 1,5 s, 3 mm → 10 s, 2 mm → 33 s).
   js/part/field.js gibt die Kontrolle 40-mal je Feld ab — dauert es Minuten,
   stockt die Seite zwischendurch sekundenlang. Was absehbar länger als
   HOLD_S braucht, beginnt deshalb nicht von selbst, sondern auf Knopfdruck,
   und die Zeile am Knopf sagt, womit zu rechnen ist. */
const NS_PER_VISIT = 17;
const HOLD_S = 20;
const AUTO = 'Kühlstiche automatisch setzen';
const RUN = 'Abstandsfläche berechnen';
const MISS = 'Daneben — die Stelle muss auf der Abstandsfläche liegen.';
const NEEDS_PART = 'Zuerst ein Bauteil laden — die Abstandsfläche entsteht daraus, und auf ihr wird gesetzt.';
const SHOWS_SHELL = ['flaeche', 'setzen'];
const AIM_DIR = { normal: 'senkrecht zur Fläche', blick: 'auf die Kamera zu', x: 'entlang X', y: 'entlang Y', z: 'entlang Z' };

const same = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;

/* Ein Kanal hat zwei Griffe, „t3:a" und „t3:b"; ein Kühlstich einen an der Spitze. */
const splitId = id => { const i = (id || '').indexOf(':'); return i < 0 ? [id, 'p'] : [id.slice(0, i), id.slice(i + 1)]; };

/* Vorgabe der Zellkante: ein 64stel der längsten Bauteilkante, auf glatte
   Werte gerundet (halbe Millimeter ab 1 mm, darunter Zehntel). Nicht die
   halbe Wanddicke wie bei Wandstärke und Füllung — das Feld reicht hier
   weit nach außen, und die Fläche im Abstand braucht keine Zellen, die
   eine Wand auflösen. */
export function suggestShellCell(model) {
  const longest = Math.max(...model.bounds.size) || 1;
  const h = Math.max(CELL_RANGE[0], Math.min(CELL_RANGE[1], longest / 64));
  return h >= 1 ? Math.round(h * 2) / 2 : Math.round(h * 10) / 10;
}

export function createTemperierTool(host) {
  const { shell, view, part, field: hostField } = host;
  const ui = host.ui;

  const state = {
    plan: M.emptyPlan(), field: null, fieldH: 0, shellDist: null, shellCount: 0, lifted: null,
    h: 6, hAuto: true, dirMode: 'normal', both: false, shellClear: true,
    defaults: { d: 20, len: 200, kd: 10 },
    /* 30 mm: die Vorgabe liegt AUF dem Boden von 1,5 × Ø 20 — früher stand der
       Regler auf 25 und es wurde still mit 30 gerechnet. */
    auto: { count: 8, spacing: 30, replace: true, stats: null, last: null },
    checks: new Map(),                       // id → { c, verdict }
    placing: null, pending: null, openGroup: GROUPS[0],
    running: false, queued: false, cancelled: false, held: false, ready: false, ms: 0,
    /** Zeigt das Bild eine Fläche, die nicht (mehr) zu den Einstellungen passt? */
    get stale() { return !!part.model && !(state.shellDist === state.plan.dist && state.field && Math.abs(state.fieldH - state.h) < 1e-9); },
    get model() { return part.model; },
    get name() { return part.name; }
  };
  let wired = false;

  /* ── Szene ───────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);

  /* Die Abstandsfläche: voreingestellt durchscheinend, damit man das
     Bauteil darin sieht, und dann nicht in die Tiefe schreibend, damit
     die Elemente auf ihr nicht flackern. Sie ist das Ziel des Zielmodus.
     Deckend (Darstellung) zeigt sie ihre Form — Taschen, Rippenschatten,
     wo die Fläche eng wird — und die Stiche und Kanäle davor. */
  const shellMat = new T.MeshStandardMaterial({
    color: SHELL_COLOR, roughness: 0.6, metalness: 0.02, transparent: true, opacity: SHELL_OPACITY,
    depthWrite: false, side: T.DoubleSide, flatShading: true
  });
  function setShellClear(on) {
    state.shellClear = on;
    shellMat.transparent = on;
    shellMat.opacity = on ? SHELL_OPACITY : 1;
    shellMat.depthWrite = !on;
    shellMat.needsUpdate = true;
    view.invalidate();
  }
  const shellMesh = new T.Mesh(new T.BufferGeometry(), shellMat);
  shellMesh.visible = false;
  group.add(shellMesh);

  /* Je Art ein Körper in der Artfarbe — und einer für alle, die zu nah
     an der Kavität stehen. */
  const bodyMat = color => new T.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, side: T.DoubleSide });
  const meshes = { tight: new T.Mesh(new T.BufferGeometry(), bodyMat(TIGHT_COLOR)) };
  for (const [type, meta] of Object.entries(M.TYPES)) meshes[type] = new T.Mesh(new T.BufferGeometry(), bodyMat(meta.color));
  for (const m of Object.values(meshes)) group.add(m);

  const hasShell = () => state.shellDist !== null;

  /* „Einpassen" (Knopf, F, Doppelklick) passt ein, was JETZT im Bild steht:
     Bauteil, Bohrungen — ein Kühlstich ragt 200 mm hinaus — und die
     Abstandsfläche, wo sie zu sehen ist. Der Rahmen fragt jedes Mal nach. */
  function fitBox() {
    const box = new T.Box3();
    if (part.model && part.mesh.visible) box.expandByObject(part.mesh);
    for (const m of [...Object.values(meshes), shellMesh]) if (m.visible) box.expandByObject(m);
    return box.isEmpty() ? null : box;
  }
  shell.setFitTarget(fitBox);

  /* ── Griffe: alle frei im Raum, mit Achsenpfeilen ─────────── */
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
      if (what !== 'drop') return;
      syncSelection();
      /* Ein Zug ist EIN Schritt, gemeldet beim Loslassen. Ein bloßer Klick auf
         den Griff endet auch mit „drop" — ohne Änderung meldet der Gastgeber
         dann nichts (host.changed prüft den Verlauf). */
      const s = sel();
      host.changed(!s || s.it.type === 'stich' ? 'Kühlstich verschoben' : state.both ? 'Kanal verschoben' : 'Kanalende verschoben');
    },
    onAim: id => startMove(id)
  });

  /* ── Prüfen: Wandabstand gegen den Mindest-Wandabstand ───── */
  const minWall = () => M.minWallOf(state.plan, state.defaults.d, state.defaults.kd);
  const tolerance = () => (state.field ? TOL_CELLS * state.field.h : 0);
  const clearanceOf = it => (state.field ? wallClearance(it, (x, y, z) => sampleField(state.field, x, y, z)) : null);
  function judge() {
    state.checks.clear();
    const min = minWall(), tol = tolerance();
    for (const it of M.allItems(state.plan)) {
      const raw = clearanceOf(it);
      const c = raw !== null && Number.isFinite(raw) ? raw : null;
      state.checks.set(it.id, { c, verdict: wallVerdict(c, min, tol) });
    }
  }
  const verdictOf = id => (state.checks.get(id) || { verdict: '' }).verdict;
  const isTight = id => { const v = verdictOf(id); return v === 'warn' || v === 'bad'; };
  /** Die Elemente unter dem Mindest-Wandabstand, das engste zuerst. */
  const offenders = () => M.allItems(state.plan).filter(it => isTight(it.id))
    .sort((p, q) => state.checks.get(p.id).c - state.checks.get(q.id).c);

  const label = it => M.TYPES[it.type].label + ' ' + it.id;
  /* „Eingehalten" bei 9,7 gegen 10 mm verlangt eine Erklärung: so genau ist das Feld. */
  const within = c => (c !== null && c < minWall() ? ' (das Feld ist auf ± ' + fmtUnit(tolerance(), 'mm') + ' genau)' : '');
  const verdictNote = (verdict, min, c) => (verdict === 'bad' ? 'Durchbruch — die Bohrung schneidet das Bauteil'
    : verdict === 'warn' ? 'unter dem Mindest-Wandabstand von ' + fmtUnit(min, 'mm')
      : verdict === 'ok' ? 'Mindest-Wandabstand ' + fmtUnit(min, 'mm') + ' eingehalten' + within(c) : '');

  /* ── Kette: Plan → Anzeige ───────────────────────────────── */
  function rebuild(mode) {
    judge();
    const by = { tight: [] };
    for (const type of Object.keys(M.TYPES)) by[type] = [];
    for (const it of M.allItems(state.plan)) by[isTight(it.id) ? 'tight' : it.type].push(buildItem(it));
    for (const key of Object.keys(meshes)) setTris(meshes[key], [].concat(...by[key]), true);
    handles.refresh();
    view.invalidate();
    if (mode === 'drag') { syncSelLive(); return; }
    updateChecks();
    if (wired && !state.running) host.refreshActions();
  }

  /* Modus „Prüfung": Kennzahlen mit Urteil, darunter die Liste derer, die
     zu nah stehen — ein Klick wählt das Element und holt es ins Bild. */
  function updateChecks() {
    if (!wired) return;
    const items = M.allItems(state.plan);
    let length = 0, minC = Infinity;
    for (const it of items) {
      length += M.lengthOf(it);
      const ch = state.checks.get(it.id);
      if (ch && ch.c !== null && ch.c < minC) minC = ch.c;
    }
    const off = offenders();
    const min = minWall();
    const worst = off.some(it => verdictOf(it.id) === 'bad') ? 'bad' : off.length ? 'warn' : Number.isFinite(minC) ? 'ok' : '';
    kpis(ui('plan-kpis'), [
      { label: 'Kühlstiche', value: fmt(items.filter(i => i.type === 'stich').length, 0) },
      { label: 'Kanäle', value: fmt(items.filter(i => i.type === 'kanal').length, 0) },
      { label: 'Gesamtlänge', value: fmtUnit(length, 'mm', 0) },
      { label: 'kleinster Wandabstand', value: Number.isFinite(minC) ? fmtUnit(minC, 'mm') : '—', verdict: worst,
        note: !items.length ? '' : !state.field ? 'erst mit der Abstandsfläche'
          : 'Mindest-Wandabstand ' + fmtUnit(min, 'mm') + (off.length ? ' · ' + fmt(off.length, 0) + (off.length === 1 ? ' Element' : ' Elemente') + ' darunter'
            : ' · eingehalten' + within(Number.isFinite(minC) ? minC : null)) }
    ]);
    const cur = sel();
    ui('offender-list').innerHTML = off.map(it => {
      const ch = state.checks.get(it.id);
      return '<button type="button" class="st-list-row ' + ch.verdict + (cur && cur.it.id === it.id ? ' active' : '') + '" data-item="' + it.id + '">'
        + '<span class="dot" style="background:' + M.TYPES[it.type].color + '"></span>'
        + '<span class="name">' + label(it) + (it.auto ? ' · automatisch' : '') + '</span>'
        + '<span class="val">' + (ch.verdict === 'bad' ? 'Durchbruch' : fmtUnit(ch.c, 'mm')) + '</span></button>';
    }).join('');
    ui('offender-note').textContent = off.length ? 'Ein Klick wählt es und holt es heran.'
      : !items.length ? 'Noch nichts gesetzt.' : !state.field ? 'Geprüft wird, sobald die Abstandsfläche steht.'
        : 'Kein Element unterschreitet den Mindest-Wandabstand.';
    shell.setTabBadge('pruefung', off.length ? String(off.length) : '', worst === 'bad' ? 'bad' : 'warn');
    updateLegend();
  }

  /* ── Abstandsfläche ──────────────────────────────────────── */
  /* Das Feld reicht nach außen bis über den Abstand hinaus; ein Abstand
     innerhalb des Bandes kostet nur das Ableiten, mehr ein neues Feld. Kommt
     währenddessen ein anderes Bauteil oder ein anderer Wert, bricht die
     laufende Rechnung ab und beginnt mit dem neuen Stand von vorn. */
  let rerun = false, shellTimer = 0;
  const bandFor = dist => dist * 1.3 + 5;
  const fieldFits = () => !!state.field && state.field.band >= state.plan.dist + 1 && Math.abs(state.fieldH - state.h) < 1e-9;
  /** Sekunden, die ein neues Feld mit den jetzigen Einstellungen etwa braucht. */
  function estimate() {
    if (!part.model) return 0;
    const n = 2 * bandFor(state.plan.dist) / state.h + 1;
    return part.model.faceCount * n * n * n * NS_PER_VISIT / 1e9;
  }
  const fmtDuration = sec => (sec < 90 ? 'etwa ' + fmt(Math.max(5, Math.round(sec / 5) * 5), 0) + ' s' : 'etwa ' + fmt(Math.round(sec / 60), 0) + ' min');

  /** Die Fläche nachziehen. `asked`: der Anwender hat den Knopf gedrückt —
      sonst beginnt ein Feld, das absehbar lange dauert, nicht von selbst. */
  async function computeShell(asked = false) {
    clearTimeout(shellTimer);
    state.queued = false;
    const model = part.model;
    if (!model) return;
    if (state.running) { rerun = true; host.jobs.cancel(); return; }
    const dist = state.plan.dist, h = state.h;
    state.cancelled = false;
    state.held = false;
    ui('shell-warn').textContent = '';
    if (fieldFits()) { if (state.shellDist !== dist) derive(dist); finish(); return; }
    if (asked !== true && estimate() > HOLD_S) { state.held = true; state.ready = true; finish(); return; }

    state.running = true; state.ready = false;
    host.refreshActions();
    shell.renderChips();
    const band = bandFor(dist);
    const t0 = performance.now();
    const f = await host.jobs.run({
      label: RUN, note: 'Abstandsfeld rastern …',
      /* Der Rand um das Bauteil muss das Band fassen — die Fläche liegt AUSSEN. */
      run: (signal, progress) => hostField.ensure({
        h, band, pad: band + 3 * h, signal,
        onProgress: (p, what) => progress(p, 'Abstandsfeld · ' + what + ' … ' + Math.round(p * 100) + ' %')
      }),
      onCancel: () => { state.cancelled = !rerun; }
    }).catch(err => {
      ui('shell-warn').textContent = 'Die Abstandsfläche konnte nicht gerechnet werden: ' + err.message;
      console.error(err);
      return null;
    });
    state.running = false;
    if (f && part.model === model) {
      state.field = f;
      state.fieldH = h;
      state.lifted = Math.abs(f.h - h) > 1e-9 ? f.h : null;
      state.ms = performance.now() - t0;
      try { derive(dist); } catch (err) {
        ui('shell-warn').textContent = 'Die Abstandsfläche konnte nicht gerechnet werden: ' + err.message;
        console.error(err);
      }
    }
    const again = rerun || part.model !== model;
    rerun = false;
    state.ready = !again;
    finish();
    if (again) computeShell();
  }
  function derive(dist) {
    const tris = surfaceNets(state.field, dist);
    setTris(shellMesh, tris, true);
    state.shellDist = dist;
    state.shellCount = tris.length / 9;
  }
  function finish() {
    updateShellFacts();
    applyMode();
    rebuild();
    syncSelection();
    shell.renderChips();
    host.refreshActions();
  }
  /* Erst wenn Regler oder Feld stillstehen. */
  function scheduleShell() {
    clearTimeout(shellTimer);
    state.queued = true;
    shellTimer = setTimeout(computeShell, 250);
  }

  function updateShellFacts() {
    if (!wired) return;
    const f = state.field;
    kpis(ui('shell-kpis'), hasShell() ? [
      { label: 'Fläche im Abstand', value: fmtUnit(state.shellDist, 'mm', 0), verdict: state.stale ? 'warn' : 'ok',
        note: state.stale ? 'das Bild zeigt noch diese Fläche — die Einstellungen haben sich seither geändert' : '' }
    ] : []);
    facts(ui('shell-facts'), f && hasShell() ? [
      ['Dreiecke der Fläche', fmt(state.shellCount, 0)],
      ['Zellkante', fmtUnit(f.h, 'mm', 2)],
      ['Raster', f.dims.join(' × ')],
      ['Feld reicht bis', fmtUnit(f.band, 'mm')],
      ['Rechenzeit', fmtUnit(state.ms / 1000, 's')]
    ] : []);
    if (state.lifted && f) ui('shell-warn').textContent = 'Zellkante auf ' + fmtUnit(f.h, 'mm', 2) + ' angehoben — das Raster wäre sonst zu groß.';
  }

  /* Der Mindest-Wandabstand: mit „Auto" folgt das Feld den Einstellungen
     und ist gesperrt; ohne steht dort, was im Plan steht. */
  function syncMinWall() {
    if (!wired) return;
    const auto = !Number.isFinite(state.plan.minWall);
    ui('min-wall-auto').checked = auto;
    ui('min-wall').disabled = auto;
    ui('min-wall').value = fmtPlain(minWall(), 1);
  }
  function syncDist() {
    if (!wired) return;
    ui('dist').value = String(state.plan.dist);
    ui('dist-val').textContent = fmt(state.plan.dist, 0) + ' mm';
  }

  /* ── Auswahl ─────────────────────────────────────────────── */
  const sel = () => {
    if (!handles.selected) return null;
    const [id, end] = splitId(handles.selected);
    const it = state.plan.items[id];
    return it ? { it, end } : null;
  };
  const posOf = s => (s.it.type === 'stich' ? s.it.p : s.it[s.end]);

  /* Was sich beim Ziehen mitbewegt: Lage und Urteil. */
  function syncSelLive() {
    const s = sel();
    if (!s || !wired) return;
    const pos = posOf(s);
    for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) ui(k).value = fmtPlain(pos[i], 1);
    const ch = state.checks.get(s.it.id) || { c: null, verdict: '' };
    kpis(ui('sel-kpis'), [{
      label: 'Wandabstand', value: ch.c === null ? '—' : fmtUnit(ch.c, 'mm'), verdict: ch.verdict,
      note: ch.c === null ? 'erst mit der Abstandsfläche' : verdictNote(ch.verdict, minWall(), ch.c)
    }]);
  }

  function syncSelection() {
    if (!wired) return;
    const s = sel();
    updateChecks();
    if (!s) { shell.inspector.hide(); shell.status(''); return; }
    const { it, end } = s;
    const meta = M.TYPES[it.type];
    const stich = it.type === 'stich';
    shell.inspector.show({
      title: '<span class="dot" style="background:' + meta.color + '"></span>' + meta.label + ' <code>' + it.id + '</code>'
        + (stich ? '' : ' <em>Ende ' + end.toUpperCase() + '</em>') + (it.auto ? ' <em>automatisch</em>' : '')
    });
    shell.status('<b>Achsenpfeil</b>: je Achse · <b>Punkt</b>: in der Bildebene · '
      + (stich ? '<b>Pfeil</b>: neu setzen · ' : '') + '<b>Entf</b>: entfernen');
    ui('sel-d').value = fmtPlain(it.d, 2);
    ui('sel-len-row').hidden = !stich;
    ui('sel-dir-row').hidden = !stich;
    ui('sel-both-row').hidden = stich;
    if (stich) {
      ui('sel-len').value = fmtPlain(it.len, 2);
      ui('sel-dir').textContent = dirText(it.dir);
    }
    ui('sel-both').checked = state.both;
    syncSelLive();
    facts(ui('sel-facts'), [
      ['Länge', fmtUnit(M.lengthOf(it), 'mm')],
      ['Wasserinhalt', fmtUnit(volumeOf(it) / 1000, 'cm³', 2)],
      ['Mindest-Wandabstand', fmtUnit(minWall(), 'mm')]
    ]);
    showGroup();
  }

  /* Die gewählte Gruppe des Auswahlfelds zeigen — die andere verbergen. */
  function showGroup() {
    for (const b of ui('sel-groups').querySelectorAll('[data-group-tab]')) {
      const on = b.getAttribute('data-group-tab') === state.openGroup;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const g of shell.inspector.body.querySelectorAll('[data-group]')) g.hidden = g.getAttribute('data-group') !== state.openGroup;
  }

  /* Entfernen fragt nicht; „Rückgängig" holt es zurück. */
  function removeSelected() {
    const s = sel();
    if (!s) return false;
    const name = label(s.it);
    M.removeItem(state.plan, s.it.id);
    handles.select(null);
    rebuild();
    host.changed(name + ' entfernt');
    host.toastUndo(name + ' entfernt.');
    return true;
  }

  /* Ein Element ins Bild holen: eingepasst wird sein Quader samt Umgebung,
     vom Rahmen in den freien Teil des Bildes — neben oder unter das
     Auswahlfeld, je nachdem, wo mehr Platz ist. „Einpassen" (F) holt danach
     wieder das Ganze: der Rahmen fragt dafür fitBox, nicht den letzten Quader. */
  function focusOn(it) {
    const { a, b } = M.axisOf(it);
    const box = new T.Box3().setFromPoints([new T.Vector3(...a), new T.Vector3(...b)]).expandByScalar(it.d);
    shell.fit(box, 1.8);
  }

  /* ── Zielmodus: setzen und neu setzen ────────────────────── */
  const aim = shell.aim;
  const stillAiming = () => handles.aiming;
  function cancelAim() {
    const was = handles.aiming;
    handles.cancelAim();
    aim.hide();
    state.placing = null;
    state.pending = null;
    shell.renderChips();
    return was;
  }
  host.cancelAim = cancelAim;
  const noShellReason = () => (!part.model ? NEEDS_PART
    : state.running ? 'Die Abstandsfläche wird gerade gerechnet — gleich lässt sich setzen.'
      : 'Noch keine Abstandsfläche — im Modus „Abstandsfläche" berechnen.');
  const toCamera = point => {
    const c = view.camera.position;
    return [c.x - point[0], c.y - point[1], c.z - point[2]];
  };
  /* Der Strahl liefert die nach INNEN gerichtete Normale der Fläche, also
     zum Bauteil hin; der Stich läuft nach außen. */
  const dirAt = hit => M.directionFor(state.dirMode, [-hit.dir[0], -hit.dir[1], -hit.dir[2]], toCamera(hit.point));
  /* Gezielt wird auf die Abstandsfläche, und die steht im Modus „Setzen" im Bild. */
  const toSetzen = () => { if (shell.mode !== 'setzen') shell.setMode('setzen'); };

  function startPlace(type) {
    if (!M.TYPES[type]) return;
    if (!hasShell() || state.running) { shell.toast(noShellReason()); return; }
    if (state.placing === type) { cancelAim(); return; }          // derselbe Chip noch einmal: doch nicht
    cancelAim();
    toSetzen();
    handles.select(null);
    state.placing = type;
    aim.onCancel = cancelAim;
    if (type === 'stich') {
      /* Kurz: im schmalen Bild hat der Hinweis 350 px — die lange Fassung der
         Richtung (M.DIRECTIONS[…].hint) steht in der Hilfe. */
      aim.show(true, 'Kühlstich: auf die Abstandsfläche klicken — er läuft ' + AIM_DIR[state.dirMode] + '. Esc bricht ab.');
      handles.armAim({
        onHit: hit => {
          aim.hide();
          state.placing = null;
          const it = M.addStich(state.plan, hit.point, dirAt(hit), { d: state.defaults.d, len: state.defaults.len });
          rebuild();
          handles.select(it.id);
          shell.renderChips();
          host.changed(label(it) + ' gesetzt');
        },
        onMiss: () => aim.miss(MISS, stillAiming)
      });
    } else {
      aim.show(true, 'Kanal: das erste Ende auf der Abstandsfläche anklicken. Esc bricht ab.');
      handles.armAim({
        onHit: hit => {
          state.pending = hit.point.slice();
          aim.show(true, 'Kanal: jetzt das andere Ende anklicken. Esc bricht ab.');
          handles.armAim({
            onHit: hit2 => {
              aim.hide();
              state.placing = null;
              const it = M.addKanal(state.plan, state.pending, hit2.point, { d: state.defaults.kd });
              state.pending = null;
              rebuild();
              handles.select(it.id + ':b');
              shell.renderChips();
              host.changed(label(it) + ' gesetzt');
            },
            onMiss: () => aim.miss(MISS, stillAiming)
          });
        },
        onMiss: () => aim.miss(MISS, stillAiming)
      });
    }
    shell.renderChips();
  }

  /** Der Pfeil eines Kühlstichs: Spitze und Richtung neu setzen. */
  function startMove(id) {
    const it = state.plan.items[splitId(id)[0]];
    if (!it || it.type !== 'stich') return;
    if (!hasShell() || state.running) { shell.toast(noShellReason()); return; }
    toSetzen();
    aim.show(true, 'Kühlstich ' + it.id + ': die neue Stelle auf der Abstandsfläche anklicken. Esc bricht ab.');
    aim.onCancel = cancelAim;
    handles.armAim({
      onHit: hit => {
        aim.hide();
        M.placeStich(state.plan, it.id, hit.point, dirAt(hit));
        rebuild();
        syncSelection();
        host.changed(label(it) + ' neu gesetzt');
      },
      onMiss: () => aim.miss(MISS, stillAiming)
    });
  }

  shell.setChips([
    ['stich', 'Kühlstich', 'Ein Klick auf die Abstandsfläche: dort sitzt die Spitze.'],
    ['kanal', 'Kanal (2 Punkte)', 'Zwei Klicks auf die Abstandsfläche: die beiden Enden.']
  ].map(([type, text, title]) => ({
    id: type, label: text, icon: M.TYPES[type].color, title,
    enabled: () => hasShell() && !state.running, reason: noShellReason,
    active: () => state.placing === type,
    onClick: () => startPlace(type)
  })));

  /* ── Automatik ───────────────────────────────────────────── */
  /* N Kühlstiche auf der Abstandsfläche, so verteilt, dass jede Stelle im
     Bauteil — dicke eher als dünne — eine Bohrung in der Nähe hat
     (js/cooling/auto.js). Die Richtung folgt der Wahl unter „Richtung";
     bei „Normale" ist es der Feldgradient an der Stelle. */
  const spacingUsed = () => {
    const floor = state.defaults.d * SPACING_FACTOR;
    return { value: Math.max(state.auto.spacing, floor), floored: state.auto.spacing < floor };
  };
  function runAuto() {
    if (!hasShell() || !state.field || state.running) { shell.toast(noShellReason()); return; }
    cancelAim();
    const pos = shellMesh.geometry.attributes.position;
    if (!pos || !pos.array.length) return;
    if (state.auto.replace) M.removeAuto(state.plan);
    const sp = spacingUsed();
    const res = planCooling(state.field, pos.array, { count: state.auto.count, minSpacing: sp.value });
    for (const site of res.sites) {
      const dir = M.directionFor(state.dirMode, site.n, toCamera(site.p));
      M.addStich(state.plan, site.p, dir, { d: state.defaults.d, len: state.defaults.len, auto: true });
    }
    state.auto.stats = res.stats;
    state.auto.last = { placed: res.sites.length, wanted: state.auto.count, spacing: sp.value };
    handles.select(null);
    updateAutoFacts();
    rebuild();
    host.changed(fmt(res.sites.length, 0) + (res.sites.length === 1 ? ' Kühlstich' : ' Kühlstiche') + ' automatisch gesetzt');
  }
  /* Was der letzte Lauf gebracht hat, steht zugeklappt in der „Prüfung" —
     und nur, solange es einen gab (ein geladener Plan kennt keinen). */
  function updateAutoFacts() {
    const last = state.auto.last, st = state.auto.stats;
    ui('auto-details').hidden = !(last && st);
    facts(ui('auto-facts'), last && st ? [
      ['gesetzt', fmt(last.placed, 0) + (last.placed === 1 ? ' Kühlstich' : ' Kühlstiche')],
      ['Stichabstand min.', fmtUnit(last.spacing, 'mm')],
      ['mittlerer Abstand', fmtUnit(st.mean, 'mm')],
      ['größter Abstand', fmtUnit(st.max, 'mm')]
    ] : []);
  }
  /* Die Zeile unter dem Knopf sagt, was der Lauf gebracht hat, wer davon zu
     nah steht — und womit gerechnet wird, wenn der Regler unter 1,5 × Ø liegt. */
  function autoPrimary() {
    if (!part.model) return { label: AUTO, disabled: true, reason: 'Zuerst ein Bauteil laden.' };
    if (!hasShell()) return { label: AUTO, disabled: true, reason: state.cancelled ? 'Abgebrochen — es gibt noch keine Abstandsfläche (Modus „Abstandsfläche").' : 'Die Abstandsfläche steht noch aus.' };
    const notes = [];
    let warn = false;
    const last = state.auto.last;
    if (last) {
      notes.push(fmt(last.placed, 0) + (last.placed === 1 ? ' Kühlstich' : ' Kühlstiche') + ' gesetzt');
      if (last.placed < last.wanted) { warn = true; notes.push('nur so viele Stellen halten den Mindestabstand — Abstand kleiner wählen oder weniger Bohrungen'); }
    }
    const tight = M.allItems(state.plan).filter(it => it.auto && isTight(it.id)).length;
    if (tight) { warn = true; notes.push(fmt(tight, 0) + ' automatische unter dem Mindest-Wandabstand — siehe „Prüfung"'); }
    const sp = spacingUsed();
    if (sp.floored) notes.push('Stiche halten ' + fmtUnit(sp.value, 'mm') + ' Abstand, nicht ' + fmtUnit(state.auto.spacing, 'mm') + ': mindestens 1,5 × Ø ' + fmtPlain(state.defaults.d));
    return { label: AUTO, onClick: runAuto, reason: notes.join(' · '), noteKind: warn ? 'warn' : '' };
  }
  function shellPrimary() {
    if (!part.model) return { label: RUN, disabled: true, reason: 'Zuerst ein Bauteil laden.' };
    const was = hasShell() ? ' — das Bild zeigt noch die vorige Fläche (' + fmtUnit(state.shellDist, 'mm', 0) + ', Zellkante ' + fmtUnit(state.field.h, 'mm', 2) + ').' : ' — es gibt noch keine Abstandsfläche.';
    const run = () => computeShell(true);
    const cost = fieldFits() ? '' : ' Das Feld braucht ' + fmtDuration(estimate()) + '.';
    if (state.cancelled) return { label: RUN, onClick: run, noteKind: 'warn', reason: 'Abgebrochen' + was + cost };
    if (state.held) return { label: RUN, onClick: run, noteKind: 'warn', reason: 'Das Feld braucht mit diesen Einstellungen ' + fmtDuration(estimate()) + ' — gerechnet wird deshalb erst auf Knopfdruck. Eine größere Zellkante geht schneller.' };
    if (state.stale && !state.queued) return { label: RUN, onClick: run, noteKind: hasShell() ? 'warn' : '', reason: (hasShell() ? 'Einstellungen geändert' + was : 'Noch keine Abstandsfläche.') + cost };
    /* Aktuell: nichts zu tun, also kein Knopf — die Zeile sagt, wie es weitergeht. */
    return { hidden: true, noteKind: 'ok', reason: state.queued ? '' : 'Die Abstandsfläche steht — weiter mit „Setzen".' };
  }

  /* ── Modi: jeder besitzt, was er zeigt ───────────────────── */
  function applyMode() {
    shellMesh.visible = SHOWS_SHELL.includes(shell.mode) && hasShell() && state.shellCount > 0;
    part.setLook({ visible: true, colors: false });
    updateLegend();
    view.invalidate();
  }
  /* Die Legende nennt nur, was im Bild ist: die Warnfarbe, solange etwas zu
     nah steht, die Fläche in den Modi, die sie zeigen. */
  function updateLegend() {
    const row = (color, text, extra = '') => '<div class="lg-row"><span class="dot" style="background:' + color + extra + '"></span>' + text + '</div>';
    shell.legend(Object.values(M.TYPES).map(t => row(t.color, t.label)).join('')
      + (offenders().length ? row(TIGHT_COLOR, 'zu nah an der Kavität') : '')
      + (shellMesh.visible ? row(SHELL_COLOR, 'Abstandsfläche', ';opacity:.5') : '')
      + '<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>');
  }
  const modes = MODES.map(m => ({ ...m, enter: applyMode, leave() {}, primary: () => null }));
  const by = Object.fromEntries(modes.map(m => [m.id, m]));
  by.flaeche.primary = shellPrimary;
  by.setzen.primary = autoPrimary;
  /* Wer „Setzen" verlässt, zielt nicht mehr: die Fläche geht womöglich aus dem Bild. */
  by.setzen.leave = () => { cancelAim(); };

  /* ── Verdrahten: sobald der Rahmen die Felder eingesetzt hat ── */
  function mounted() {
    shell.inspector.body.innerHTML = INSPECTOR;
    shell.inspector.onClose(() => handles.select(null));
    ui('sel-groups').addEventListener('click', ev => {
      const b = ev.target.closest('[data-group-tab]');
      if (!b) return;
      state.openGroup = b.getAttribute('data-group-tab');
      showGroup();
    });

    /* Abstandsfläche. slider() meldet seinen Anfangswert schon beim Einbau —
       das ist keine Änderung. */
    slider(ui('dist'), v => {
      if (!wired || v === state.plan.dist) return;
      state.plan.dist = v;
      syncMinWall();
      rebuild();
      updateShellFacts();
      if (host.history) host.history.coalesce('dist', 'Achsabstand geändert');
      host.changed('', { silent: true });
      scheduleShell();
    }, v => fmt(v, 0) + ' mm', ui('dist-val'));
    /* Die Zellkante: eintippen, bestätigen, das Feld wird neu gerastert.
       Einmal gesetzt, bleibt sie auch für das nächste Bauteil stehen. Sie
       gehört zur Seite, nicht zum Plan — also kein Schritt im Verlauf. */
    numberInput(ui('cell'), v => {
      /* Nur ein ANDERER Wert ist eine Änderung: der Browser meldet „change"
         noch einmal, wenn das Feld den Fokus verliert — etwa beim Klick auf
         „Abbrechen", und der begänne die Rechnung sonst gleich von vorn. */
      if (same(v, state.h)) return state.h;
      state.hAuto = false;
      state.h = v;
      updateShellFacts();
      /* Auch zurück auf die Zellkante des vorhandenen Feldes: dann ist nichts zu
         rechnen, aber ein „Abgebrochen" oder „erst auf Knopfdruck" von vorhin
         gilt nicht mehr — computeShell merkt selbst, dass das Feld passt. */
      scheduleShell();
      return state.h;
    }, { min: CELL_RANGE[0], max: CELL_RANGE[1], unit: 'mm' });
    numberInput(ui('min-wall'), v => {
      if (same(v, state.plan.minWall)) return v;
      state.plan.minWall = v;
      rebuild();
      syncSelection();
      host.changed('Mindest-Wandabstand geändert');
      return v;
    }, { min: M.MIN_WALL_RANGE[0], max: M.MIN_WALL_RANGE[1], unit: 'mm' });
    ui('min-wall-auto').addEventListener('change', e => {
      /* Haken heraus: der Wert bleibt stehen und gehört ab jetzt dem Plan. */
      if (e.target.checked) delete state.plan.minWall;
      else state.plan.minWall = Math.round(minWall() * 10) / 10;
      syncMinWall();
      rebuild();
      syncSelection();
      host.changed(e.target.checked ? 'Mindest-Wandabstand: Auto' : 'Mindest-Wandabstand von Hand');
    });

    /* Setzen: Richtung, Vorgaben, Automatik — Einstellungen der Seite. Die
       Durchmesser bestimmen mit „Auto" den Mindest-Wandabstand. */
    segButtons(ui('dir-seg'), v => { if (M.DIRECTIONS[v]) state.dirMode = v; });
    const vorgabe = (name, key, meta) => numberInput(ui(name), v => {
      if (same(v, state.defaults[key])) return v;
      state.defaults[key] = v;
      syncMinWall();
      rebuild();
      syncSelection();
      return v;
    }, { min: meta.min, max: meta.max, unit: 'mm' });
    vorgabe('def-d', 'd', M.PARAM_META.d);
    vorgabe('def-len', 'len', M.PARAM_META.len);
    vorgabe('def-kd', 'kd', M.PARAM_META.d);
    slider(ui('auto-count'), v => { state.auto.count = v; }, v => fmt(v, 0), ui('auto-count-val'));
    slider(ui('auto-spacing'), v => { state.auto.spacing = v; if (wired) host.refreshActions(); }, v => fmt(v, 0) + ' mm', ui('auto-spacing-val'));
    ui('auto-replace').addEventListener('change', e => { state.auto.replace = e.target.checked; });

    /* Prüfung: die Liste wählt und holt ins Bild. */
    ui('offender-list').addEventListener('click', ev => {
      const row = ev.target.closest('[data-item]');
      const it = row ? state.plan.items[row.getAttribute('data-item')] : null;
      if (!it) return;
      /* Beim Kanal das Ende, das der Kavität näher ist. */
      let id = it.id;
      if (it.type === 'kanal') {
        const va = state.field ? sampleField(state.field, ...it.a) : 0, vb = state.field ? sampleField(state.field, ...it.b) : 0;
        id += vb < va ? ':b' : ':a';
      }
      handles.select(id);
      focusOn(it);
    });

    /* Auswahlfeld. */
    const mass = (name, key, what) => numberInput(ui(name), v => {
      const s = sel();
      if (!s || (key === 'len' && s.it.type !== 'stich') || same(v, s.it[key])) return v;
      s.it[key] = v;
      rebuild();
      syncSelection();
      host.changed(what + ' geändert');
      return v;
    }, { min: M.PARAM_META[key].min, max: M.PARAM_META[key].max, unit: 'mm' });
    mass('sel-d', 'd', 'Durchmesser');
    mass('sel-len', 'len', 'Länge');
    for (const [name, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
      numberInput(ui(name), v => {
        const s = sel();
        if (!s) return v;
        const pos = posOf(s).slice();
        /* Das Feld zeigt eine Nachkommastelle: derselbe Text ist keine Änderung. */
        if (fmtPlain(pos[axis], 1) === fmtPlain(v, 1)) return undefined;
        pos[axis] = v;
        M.setEnd(state.plan, s.it.id, s.end, pos, state.both);
        rebuild();
        syncSelection();
        host.changed('Lage geändert');
        return undefined;                                          // syncSelection hat das Feld schon gesetzt
      });
    }
    ui('sel-both').addEventListener('change', e => { state.both = e.target.checked; });
    ui('del-item').addEventListener('click', () => removeSelected());

    /* Darstellung: Deckkraft des Bauteils, Abstandsfläche durchscheinend oder
       deckend. Der Rahmen verdrahtet ⓘ nur in der Seitenleiste — hier selbst. */
    const pop = shell.darstellung(DARSTELLUNG);
    slider(pop.querySelector('[data-ui="opacity"]'), v => part.setOpacity(v / 100), v => v + ' %', pop.querySelector('[data-ui="opacity-val"]'));
    pop.querySelector('[data-ui="shell-clear"]').addEventListener('change', e => setShellClear(e.target.checked));
    for (const b of pop.querySelectorAll('[data-help]')) {
      b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); shell.help.show(b.getAttribute('data-help')); });
    }

    wired = true;
    syncDist();
    syncMinWall();
    updateShellFacts();
    updateAutoFacts();
    rebuild();
    syncSelection();
  }

  /* ── Plan laden, Bauteil ─────────────────────────────────── */
  function loadPlan(plan, later = false) {
    cancelAim();
    state.plan = plan;
    state.auto.last = null; state.auto.stats = null;
    handles.select(null);
    syncDist();
    syncMinWall();
    updateAutoFacts();
    rebuild();
    syncSelection();
    /* Beim Laden eines Bauteils erst NACH onPart: js/part/partsource.js räumt
       seinen Schleier weg, sobald onLoad zurückkehrt — die Rechnung setzt ihren
       danach. Läuft noch eine (für das vorige Teil), bricht computeShell sie ab
       und beginnt mit dem neuen Stand von vorn. */
    if (!part.model || !state.stale) return;
    if (later) setTimeout(() => computeShell(), 0);
    else computeShell();
  }

  function onPart(model) {
    /* Ein Element sitzt vor der Wand EINES Bauteils: ein neues beginnt leer —
       mit dem Achsabstand und dem Mindest-Wandabstand, die gerade gelten. Der
       bisherige Plan bleibt als Entwurf bei seinem Bauteil. */
    const fresh = M.emptyPlan();
    fresh.dist = state.plan.dist;
    if (Number.isFinite(state.plan.minWall)) fresh.minWall = state.plan.minWall;
    state.field = null; state.fieldH = 0; state.shellDist = null; state.shellCount = 0; state.lifted = null;
    state.cancelled = false; state.held = false; state.ready = false;
    setTris(shellMesh, []);
    if (state.hAuto) { state.h = suggestShellCell(model); ui('cell').value = fmtPlain(state.h); }
    loadPlan(fresh, true);
    if (host.history) host.history.reset();
    updateShellFacts();
    applyMode();
    shell.renderChips();
    host.refreshActions();
  }

  const fileName = () => safeName((baseName(part.name) || 'bauteil') + '-temperierung');
  const tool = {
    id: 'temperier',
    modes,
    startMode: 'setzen',
    accepts: [M.FORMAT],
    toJSON: () => M.toJSON(state.plan),
    fromJSON: obj => loadPlan(M.fromJSON(obj)),
    serialize: () => M.toJSON(state.plan),
    /* Rückgängig: der Plan wie er war — die Auswahl bleibt, wenn es sie noch
       gibt; kam genau EIN Element zurück (ein Entfernen wurde zurückgenommen),
       ist es gewählt: man sieht, was wieder da ist, und Entf trifft es erneut.
       Ein anderer Achsabstand zieht die Fläche nach. */
    restore(doc) {
      const keep = handles.selected;
      const before = new Set(Object.keys(state.plan.items));
      cancelAim();
      state.plan = M.fromJSON(doc);
      const back = Object.values(state.plan.items).filter(x => !before.has(x.id));
      const [id, end] = splitId(keep);
      const it = id ? state.plan.items[id] : null;
      const still = it && (it.type === 'stich' ? end === 'p' : end === 'a' || end === 'b');
      handles.select(still ? keep : back.length === 1 ? back[0].id + (back[0].type === 'kanal' ? ':a' : '') : null);
      syncDist();
      syncMinWall();
      rebuild();
      syncSelection();
      if (part.model && state.stale) scheduleShell();
    },
    exports: [{
      label: 'Bohrungen als STL',
      enabled: () => M.allItems(state.plan).length > 0, reason: 'Noch nichts gesetzt.',
      run: () => download(new Blob([writeSTL(buildAll(state.plan), 'DieLogic Temperierung')], { type: 'model/stl' }), fileName() + '.stl')
    }],
    keys: {
      Delete: () => removeSelected(),
      Escape: () => { if (!handles.selected) return false; handles.select(null); return true; }
    },
    onPartStart() { state.ready = false; },
    onPart,
    mounted
  };

  tool.__viewer = {
    state, view, shell, host, tool, handles, group, shellMesh, meshes,
    rebuild, startPlace, startMove, computeShell, loadPlan, runAuto, focusOn, offenders,
    get partMesh() { return host.part.mesh; }
  };
  return tool;
}
