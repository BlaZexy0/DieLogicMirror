/* Was Angussfüllung und Kammerfüllung gemeinsam haben — seit aus vier
   Seiten zwei Werkzeuge geworden sind: EIN Werkzeug, zwei Rechenverfahren
   (engines/lbm.js „Gitter", engines/sph.js „Partikel"), ein Schalter.

   Hier liegt alles, was vom Verfahren nichts wissen muss:
     · der Schalter, das Feld für Zellkante bzw. Partikelabstand (leer
       gelassen gilt der Vorschlag des Verfahrens), die Zeile „was das kostet"
     · der Lauf als echte Arbeit des Rahmens (host.jobs): der Hauptknopf
       heißt währenddessen „Abbrechen" und IST zu erreichen — die alten
       Seiten sperrten ihren Knopf beim Start, der Abbruch-Zweig dahinter
       war tot. Nach einem Abbruch gibt es kein Ergebnis.
     · je Verfahren EIN Ergebnis zum selben Problem — stehen beide, zeigt
       das Werkzeug sie nebeneinander; ändert sich das Problem, gehen beide
     · das Bild: Zeitregler, Abspielen, Schmelze nach Geschwindigkeit mit
       ihrer Skala, „Bild" wählt das Verfahren, wenn beide gerechnet sind

   Das Werkzeug gibt dazu: problem() (oder null und blocked() sagt warum),
   die Texte zum Bild (frameText), was mit dem Bild mitwandert (onFrame — der
   Kolben der Kammer), ob die Schmelze gerade zu sehen ist (meltVisible) und
   render() für seine Tabelle. */

import { lbm } from './engines/lbm.js';
import { sph } from './engines/sph.js';
import { env } from './engines/env.js';
import { segButtons, segButtonSet, slider, numberInput, facts, colorbar } from '../ui/controls.js';
import { speedColorbar } from '../lbm/paint.js';
import { fmtPlain, fmtUnit } from '../studio/format.js';
import { PLAY, PAUSE } from './panel-common.js';

export const ENGINES = { lbm, sph };
export const ENGINE_IDS = ['lbm', 'sph'];
const RUN = 'Simulieren';
const WITH = { lbm: 'dem Gitter', sph: 'Partikeln' };

/** ?engine=sph (auch „partikel") wählt die Partikel vor — dorthin leiten die
    alten Seiten …-sph.html um. Ohne Angabe: null. */
export function engineFromUrl() {
  const e = (new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('engine') || '').toLowerCase();
  return e === 'sph' || e === 'partikel' ? 'sph' : e === 'lbm' || e === 'gitter' ? 'lbm' : null;
}

export function createSimCore(opts) {
  const { host, state, group, kind } = opts;
  const { shell, view, ui } = host;

  Object.assign(state, {
    engine: engineFromUrl() || 'lbm',
    cell: { lbm: null, sph: null },          // null: der Vorschlag des Verfahrens gilt
    results: { lbm: null, sph: null },
    bild: 'lbm', frame: 0, playing: null,
    running: false, cancelled: false, failed: '', stamp: 0, progressText: '',
    forceCpu: false, openGates: true         // für den Vergleich beider Kerne im Browser-Test
  });
  /* Die Namen der alten Seiten, für Testgriffe und Skripte: state.result ist
     das Ergebnis des GEWÄHLTEN Verfahrens, h die Zellkante, d der Abstand. */
  Object.defineProperties(state, {
    result: { get: () => state.results[state.engine], enumerable: false },
    h: { get: () => cellOf('lbm'), enumerable: false },
    d: { get: () => cellOf('sph'), enumerable: false }
  });

  const displays = {};
  for (const id of ENGINE_IDS) { displays[id] = ENGINES[id].createDisplay(); group.add(displays[id].object); }

  /* ── Auflösung und Aufwand ───────────────────────────────── */
  let cache = {};
  const memo = (key, make) => (key in cache ? cache[key] : (cache[key] = make()));
  const suggestion = id => { const p = opts.problem(); return p ? memo('s:' + id + env.gpu, () => ENGINES[id].suggest(p)) : 3; };
  function cellOf(id) { return state.cell[id] ?? suggestion(id); }
  function estimateNow() {
    const p = opts.problem();
    if (!p) return null;
    const id = state.engine, c = cellOf(id);
    return memo('e:' + id + c + state.forceCpu + env.gpu, () => ENGINES[id].estimate(p, c, { forceCpu: state.forceCpu }));
  }
  const range = lbm.range({ kind });

  let wired = false;
  const changed = label => { if (wired) host.changed(label); };

  function syncEngine() {
    const eng = ENGINES[state.engine];
    segButtonSet(ui('engine-seg'), state.engine);
    ui('cell-label').textContent = eng.cellLabel;
    ui('cell').value = fmtPlain(cellOf(state.engine), 2);
    const est = estimateNow();
    ui('estimate').textContent = est ? est.text : '';
    ui('engine-note').textContent = est ? est.note : '';
    ui('engine-warn').textContent = est ? est.blocked : '';
  }

  function setEngine(id) {
    if (!ENGINES[id]) return;
    state.engine = id;
    /* Die Kennzeichen von gerade eben gehörten zum anderen Verfahren. */
    state.cancelled = false; state.failed = '';
    syncEngine();
    host.refreshActions();
  }

  /* ── Ergebnisse ──────────────────────────────────────────── */
  /** Wessen Bild zu sehen ist: das gewählte „Bild", sonst was es gibt. */
  const shown = () => state.results[state.bild] || state.results.lbm || state.results.sph || null;

  /** Das Problem hat sich geändert: beide Ergebnisse gehören zum alten. */
  function invalidate() {
    state.stamp++;
    cache = {};
    if (state.running) host.jobs.cancel();
    state.results.lbm = null; state.results.sph = null;
    state.frame = 0; state.cancelled = false; state.failed = '';
    stopPlay();
    if (wired) { syncEngine(); renderResults(); host.refreshActions(); }
  }

  async function simulate() {
    const p = opts.problem(), id = state.engine, est = estimateNow();
    if (state.running || !p || !est || est.blocked) return null;
    const cell = cellOf(id), stamp = state.stamp;
    /* Das vorige Ergebnis dieses Verfahrens geht mit dem Start: achtzig
       Bilder je Lauf sind viel Speicher, und ein abgebrochener Lauf soll
       nicht aussehen wie ein fertiger von vorhin. */
    state.results[id] = null;
    state.running = true; state.ready = false; state.cancelled = false; state.failed = '';
    state.progressText = ENGINES[id].label + ' …';
    stopPlay();
    renderResults();
    host.refreshActions();
    const result = await host.jobs.run({
      label: RUN, note: ENGINES[id].label + ' …',
      run: (signal, progress) => ENGINES[id].run(p, {
        cell, signal, forceCpu: state.forceCpu, openGates: state.openGates,
        progress: (f, text) => { if (text) state.progressText = text; progress(f, text); }
      }),
      onCancel: () => { state.cancelled = true; }
    }).catch(err => {
      state.failed = (err && err.message) || String(err);
      console.error(err);
      return null;
    });
    state.running = false; state.ready = true;
    const ok = result && stamp === state.stamp;
    if (ok) {
      state.results[id] = result;
      state.bild = id;
      state.frame = result.snapshots.length - 1;
    }
    renderResults();
    host.refreshActions();
    /* Wer simuliert, will das Ergebnis sehen — wer inzwischen woanders ist, bleibt dort. */
    if (ok && shell.mode === 'simulation') shell.setMode('ergebnis');
    return ok ? result : null;
  }

  /* ── Das Bild ────────────────────────────────────────────── */
  const clampFrame = r => Math.max(0, Math.min(r.snapshots.length - 1, state.frame));
  const timeText = r => (r ? opts.frameText(r.snapshots[clampFrame(r)], r).time : '');

  function applyView() {
    const r = shell.mode === 'ergebnis' ? shown() : null;
    const melt = !!r && opts.meltVisible();
    for (const id of ENGINE_IDS) if (!melt || r.engine !== id) displays[id].hide();
    if (melt) {
      displays[r.engine].show(r, clampFrame(r));
      /* Der Zusatz darf umbrechen (css/studio-simulation.css): einzeilig macht er
         die Skala so breit, dass sie im schmalen Bild (halbes Fenster, Tablett
         hochkant) die Hinweiszeile unten links trifft. */
      const bar = speedColorbar(r.vScale, opts.until);
      colorbar({ ...bar, extra: '<span class="sim-cb-note">' + bar.extra + '</span>' });
    } else colorbar(null);
    const snap = r ? r.snapshots[clampFrame(r)] : null;
    if (wired) {
      /* Der Zeitregler bewegt die Schmelze — ohne sie (Ankunftsfarben) täte er nichts, also steht er nicht da. */
      ui('time-row').hidden = !!r && !melt;
      if (!melt) stopPlay();
      ui('t-slider-val').textContent = timeText(r);
      ui('t-info').textContent = snap ? opts.frameText(snap, r).info : '';
    }
    opts.onFrame(snap, r);
    view.invalidate();
  }

  function showFrame(k) {
    state.frame = k;
    applyView();
  }

  function stopPlay() {
    if (state.playing) { clearInterval(state.playing); state.playing = null; }
    if (wired) setPlayButton(false);
  }
  function setPlayButton(playing) {
    const b = ui('play');
    b.innerHTML = playing ? PAUSE : PLAY;
    b.title = playing ? 'Anhalten' : 'Abspielen';
    b.setAttribute('aria-label', b.title);
  }
  function togglePlay() {
    if (state.playing) { stopPlay(); return; }
    const r = shown();
    if (!r) return;
    setPlayButton(true);
    if (state.frame >= r.snapshots.length - 1) state.frame = 0;
    state.playing = setInterval(() => {
      const now = shown();
      if (!now || shell.mode !== 'ergebnis') { stopPlay(); return; }
      state.frame++;
      if (state.frame >= now.snapshots.length) { state.frame = now.snapshots.length - 1; stopPlay(); }
      ui('t-slider').value = String(state.frame);
      showFrame(state.frame);
    }, 110);
  }

  /** Alles, was von den Ergebnissen abhängt: Tabelle des Werkzeugs, „Bild",
      Regler, Kennzahlen des Laufs — und das Bild selbst. */
  function renderResults() {
    if (!wired) return;
    const r = shown();
    const both = !!(state.results.lbm && state.results.sph);
    ui('bild-row').hidden = !both;
    if (r) segButtonSet(ui('bild-seg'), r.engine);
    ui('playback').hidden = !r;
    if (r) {
      state.frame = clampFrame(r);
      ui('t-slider').max = String(r.snapshots.length - 1);
      ui('t-slider').value = String(state.frame);
    }
    ui('run-details').hidden = !r;
    ui('run-details').querySelector('summary').textContent = r ? 'Rechnung · ' + ENGINES[r.engine].label : 'Rechnung';
    facts(ui('run-facts'), r ? r.facts : []);
    opts.render();
    applyView();
  }

  /* ── Der Hauptknopf ──────────────────────────────────────── */
  function primary() {
    /* Während eines Laufs: „Abbrechen" steht in JEDEM Modus (der Rahmen zeigt es,
       solange die Arbeit läuft), und die Zeile darunter gehört dem Fortschritt —
       auch gleich nach einem Moduswechsel, der sie leert, nicht erst beim
       nächsten Bild der Rechnung. */
    if (state.running) return { label: RUN, reason: state.progressText, noteKind: 'busy' };
    if (shell.mode !== 'simulation' && shell.mode !== 'ergebnis') return null;
    if (!opts.problem()) return { label: RUN, disabled: true, reason: opts.blocked() };
    const est = estimateNow();
    if (est.blocked) return { label: RUN, disabled: true, reason: est.blocked };
    const id = state.engine, r = state.results[id];
    if (state.failed) return { label: RUN, onClick: simulate, noteKind: 'bad', reason: 'Die Rechnung ist gescheitert: ' + state.failed };
    if (state.cancelled && !r) return { label: RUN, onClick: simulate, noteKind: 'warn', reason: 'Abgebrochen: es gibt kein Ergebnis.' };
    if (shell.mode === 'ergebnis') {
      if (r) return { hidden: true, reason: opts.resultNote(r) };
      const other = shown();
      return { label: RUN, onClick: simulate, reason: 'Mit ' + WITH[id] + ' noch nicht gerechnet'
        + (other ? ' (das Bild zeigt die Rechnung mit ' + WITH[other.engine] + ').' : '.') };
    }
    return { label: RUN, onClick: simulate, reason: r
      ? 'Gerechnet mit ' + fmtUnit(r.cell, 'mm') + ' in ' + fmtUnit(r.ms / 1000, 's') + ', steht unter „Ergebnis". Ein neuer Lauf ersetzt es.'
      : '' };
  }

  /* ── Verdrahtung (die Felder stehen erst jetzt auf der Seite) ─ */
  function mounted() {
    segButtons(ui('engine-seg'), v => { setEngine(v); changed('Rechenverfahren'); });
    numberInput(ui('cell'), v => {
      state.cell[state.engine] = v;
      cache = {};
      syncEngine();
      host.refreshActions();
      changed(ENGINES[state.engine].cellLabel);
      return v;
    }, { min: range[0], max: range[1], unit: 'mm' });
    segButtons(ui('bild-seg'), v => { state.bild = v; stopPlay(); renderResults(); });
    slider(ui('t-slider'), v => { if (wired) { stopPlay(); showFrame(v); } }, () => timeText(shown()), ui('t-slider-val'));
    ui('play').addEventListener('click', togglePlay);
    wired = true;
    setPlayButton(false);
    syncEngine();
    renderResults();
  }

  return {
    mounted, simulate, invalidate, setEngine, syncEngine, renderResults, applyView, showFrame, stopPlay, primary,
    cellOf, shown, displays,
    /** Neue Maße, neues System: die Auflösung folgt wieder dem Vorschlag. */
    autoCell() { state.cell.lbm = null; state.cell.sph = null; cache = {}; if (wired) syncEngine(); },
    /** Der Teil der Einstellungen, der beiden Werkzeugen gemeinsam ist. */
    settings: () => ({ engine: state.engine, cell: { lbm: state.cell.lbm, sph: state.cell.sph } }),
    /** … und zurück. `keepEngine`: die Adresse (?engine=…) hat das Verfahren
        schon bestimmt — gemerkte Einstellungen überstimmen sie nicht. */
    applySettings(obj, { keepEngine = false } = {}) {
      const num = v => (Number.isFinite(v) ? Math.max(range[0], Math.min(range[1], v)) : null);
      const c = obj && obj.cell ? obj.cell : {};
      state.cell.lbm = num(c.lbm); state.cell.sph = num(c.sph);
      cache = {};
      if (!keepEngine && obj && ENGINES[obj.engine]) state.engine = obj.engine;
      if (wired) { syncEngine(); host.refreshActions(); }
    }
  };
}
