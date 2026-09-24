/* Was Angussfüllung und Kammerfüllung gemeinsam haben — seit aus vier
   Seiten zwei Werkzeuge geworden sind: EIN Werkzeug, mehrere Rechenverfahren
   (engines/lbm.js „Gitter", engines/sph.js „Partikel", engines/meta.js
   „Metamodell" — nur für die Kammer), ein Schalter.

   Hier liegt alles, was vom Verfahren nichts wissen muss:
     · der Schalter, das Feld für Zellkante bzw. Partikelabstand (leer
       gelassen gilt der Vorschlag des Verfahrens; ein Verfahren ohne eigene
       Auflösung hat kein Feld), die Zeile „was das kostet"
     · der Lauf als echte Arbeit des Rahmens (host.jobs): der Hauptknopf
       heißt währenddessen „Abbrechen" und IST zu erreichen — die alten
       Seiten sperrten ihren Knopf beim Start, der Abbruch-Zweig dahinter
       war tot. Nach einem Abbruch gibt es kein Ergebnis.
     · der Knopf selbst: „Simulieren" steht in JEDEM Modus, nicht nur unter
       „Simulation" — und der Zeitregler darunter, im Streifen des Rahmens
       (shell.setActionsExtra), nicht im Modus „Ergebnis"
     · je Verfahren EIN Ergebnis zum selben Problem — stehen mehrere, zeigt
       das Werkzeug sie nebeneinander; ändert sich das Problem, gehen alle
     · das Bild: Zeitregler, Abspielen, Schmelze nach Geschwindigkeit mit
       ihrer Skala, „Bild" wählt das Verfahren, wenn mehrere gerechnet sind

   Das Werkzeug gibt dazu: problem() (oder null und blocked() sagt warum),
   die Texte zum Bild (frameText), was mit dem Bild mitwandert (onFrame — der
   Kolben der Kammer), ob die Schmelze gerade zu sehen ist (meltVisible) und
   render() für seine Tabelle. */

import { lbm } from './engines/lbm.js';
import { sph } from './engines/sph.js';
import { meta } from './engines/meta.js';
import { env } from './engines/env.js';
import { segButtons, segButtonSet, slider, numberInput, clampNote, facts, colorbar } from '../ui/controls.js';
import { speedColorbar } from '../lbm/paint.js';
import { fmtPlain, fmtUnit, rangeText } from '../studio/format.js';
import { PLAY, PAUSE, PLAYBACK_ROWS } from './panel-common.js';

export const ENGINES = { lbm, sph, meta };
/* Die Reihenfolge der Schalter — und damit der Spalten der Tabelle. Das erste
   Verfahren, das ein Werkzeug hat, ist seine Vorgabe: die Kammerfüllung
   beginnt beim Metamodell (Sekunden statt Minuten), die Angussfüllung beim
   Gitter, denn dort gibt es das Modell nicht. */
const ALL_IDS = ['meta', 'lbm', 'sph'];
/** Welche Verfahren zu einem Werkzeug gehören: das Metamodell kennt nur die Kammer. */
export const engineIds = kind => ALL_IDS.filter(id => !ENGINES[id].kinds || ENGINES[id].kinds.includes(kind));
/** Womit ein Werkzeug anfängt, wenn nichts anderes gemerkt oder verlangt ist. */
export const defaultEngine = kind => engineIds(kind)[0];
const RUN = 'Simulieren';
const WITH = { lbm: 'dem Gitter', sph: 'Partikeln', meta: 'dem Metamodell' };

/** ?engine=sph (auch „partikel") wählt die Partikel vor — dorthin leiten die
    alten Seiten …-sph.html um; ?engine=meta (auch „metamodell") das Metamodell
    der Kammerfüllung. Ohne Angabe: null. */
export function engineFromUrl() {
  const e = (new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('engine') || '').toLowerCase();
  if (e === 'sph' || e === 'partikel') return 'sph';
  if (e === 'lbm' || e === 'gitter') return 'lbm';
  if (e === 'meta' || e === 'metamodell') return 'meta';
  return null;
}

export function createSimCore(opts) {
  const { host, state, group, kind } = opts;
  const { shell, view, ui } = host;
  const IDS = engineIds(kind);
  const emptyPerEngine = () => Object.fromEntries(IDS.map(id => [id, null]));

  /* ?engine=… gilt nur, wenn dieses Werkzeug das Verfahren hat: „meta" an der
     Angussfüllung wäre ein Verfahren ohne Bild und ohne Kern. */
  const urlEngine = engineFromUrl();
  const START_ENGINE = IDS.includes(urlEngine) ? urlEngine : IDS[0];
  Object.assign(state, {
    engine: START_ENGINE,
    cell: emptyPerEngine(),                  // null: der Vorschlag des Verfahrens gilt
    results: emptyPerEngine(),
    bild: START_ENGINE, frame: 0, playing: null,
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
  for (const id of IDS) { displays[id] = ENGINES[id].createDisplay(); group.add(displays[id].object); }

  /* ── Auflösung und Aufwand ───────────────────────────────── */
  let cache = {};
  const memo = (key, make) => (key in cache ? cache[key] : (cache[key] = make()));
  const suggestion = id => { const p = opts.problem(); return p ? memo('s:' + id + env.gpu, () => ENGINES[id].suggest(p)) : 3; };
  function cellOf(id) { return state.cell[id] ?? suggestion(id); }
  /* Gemerkt je Problem — und nach jedem Lauf vergessen (simulate): der Lauf
     hat das Tempo dieses Geräts gelernt, und das Metamodell ist geladen. Bis
     2026-09-22 stand danach noch „wird beim ersten Lauf geladen" da, und
     „grob … s" kannte das Gelernte nicht. */
  function estimateNow() {
    const p = opts.problem();
    if (!p) return null;
    const id = state.engine, c = cellOf(id);
    return memo('e:' + id + c + state.forceCpu + env.gpu, () => ENGINES[id].estimate(p, c, { forceCpu: state.forceCpu }));
  }
  /* Die Grenzen des Felds gehören dem Verfahren, dessen Feld gerade dasteht
     (Zellkante oder Partikelabstand); das Metamodell hat keins. */
  const rangeOf = id => ENGINES[id].range({ kind });

  let wired = false;                       // die Felder stehen auf der Seite (mounted)

  function syncEngine() {
    const eng = ENGINES[state.engine];
    segButtonSet(ui('engine-seg'), state.engine);
    /* Ein Verfahren ohne eigene Auflösung (das Metamodell rechnet auf dem Gitter, das es gelernt
       hat) bekommt kein Feld — die Zeile darunter sagt stattdessen, was das Gitter IST. */
    ui('cell-row').hidden = !eng.cellLabel;
    if (eng.cellLabel) {
      ui('cell-label').textContent = eng.cellLabel;
      ui('cell').value = fmtPlain(cellOf(state.engine), 2);
    }
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
  const shown = () => state.results[state.bild] || IDS.map(id => state.results[id]).find(Boolean) || null;
  /** Wo das Ergebnis zu sehen ist: die Kammerfüllung zeigt es in JEDEM Modus — ihr Zeitregler steht
      unten unter dem Hauptknopf und gälte sonst für ein Bild, das gerade nicht da ist. Die
      Angussfüllung behält ihr Ergebnis im Modus „Ergebnis", wo auch die Ankunftsfarben wohnen. */
  const resultShown = () => (opts.resultEverywhere ? true : shell.mode === 'ergebnis');

  /* Warum ein Lauf ohne Ergebnis endete: null heißt „Abbrechen" gedrückt,
     sonst hat ihn eine Änderung überholt — dann die Bezeichnung des Felds
     (oder '', wenn das Werkzeug keine nennt). Bis 2026-09-22 hieß beides
     nur „Abgebrochen", und wer am Füllgrad gedreht hatte, rätselte. Kurz:
     die Zeile steht in jedem Modus, und „Beschleunigung" ist lang. */
  let stoppedBy = null;
  const cancelNote = () => (stoppedBy === null ? 'Abgebrochen: es gibt kein Ergebnis.'
    : stoppedBy ? 'Abgebrochen: „' + stoppedBy + '" wurde geändert.'
      : 'Abgebrochen: die Eingaben wurden geändert.');

  /** Das Problem hat sich geändert: beide Ergebnisse gehören zum alten.
      `why`: welches Feld — ein laufender Lauf endet, und die Zeile sagt es. */
  function invalidate(why = '') {
    state.stamp++;
    cache = {};
    if (state.running) { stoppedBy = why; host.jobs.cancel(); }
    for (const id of IDS) state.results[id] = null;
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
    stoppedBy = null;
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
    } else if (result) state.cancelled = true;          // fertig, aber zum alten Problem: wie überholt
    /* Neu schätzen: gelerntes Tempo, geladenes Modell (siehe estimateNow). */
    cache = {};
    syncEngine();
    renderResults();
    host.refreshActions();
    /* Wer simuliert, will das Ergebnis sehen — wer inzwischen woanders ist, bleibt dort. */
    if (ok && shell.mode === 'simulation') shell.setMode('ergebnis');
    return ok ? result : null;
  }

  /* ── Das Bild ────────────────────────────────────────────── */
  const clampFrame = r => Math.max(0, Math.min(r.snapshots.length - 1, state.frame));

  function applyView() {
    const r = resultShown() ? shown() : null;
    const melt = !!r && opts.meltVisible();
    for (const id of IDS) if (!melt || r.engine !== id) displays[id].hide();
    if (melt) {
      displays[r.engine].show(r, clampFrame(r));
      /* Der Zusatz darf umbrechen (css/studio.css): einzeilig macht er
         die Skala so breit, dass sie im schmalen Bild (halbes Fenster, Tablett
         hochkant) die Hinweiszeile unten links trifft. */
      const bar = speedColorbar(r.vScale, opts.until);
      colorbar({ ...bar, extra: '<span class="sim-cb-note">' + bar.extra + '</span>' });
    } else colorbar(null);
    const snap = r ? r.snapshots[clampFrame(r)] : null;
    if (wired) {
      /* Der Zeitregler STEHT immer da, gleich ob es etwas abzuspielen gibt: er
         gehört zum Streifen unter dem Knopf, und ein Kasten, der erst nach dem
         Lauf erscheint, schöbe den Hauptknopf jedes Mal nach oben. Ohne Bild
         (kein Ergebnis, oder Ankunftsfarben) ist er nur nicht scharf. */
      const spielbar = !!melt;
      ui('t-slider').disabled = !spielbar;
      ui('play').disabled = !spielbar;
      ui('time-row').classList.toggle('off', !spielbar);
      if (!melt) stopPlay();
      /* Was das Bild zeigt, steht IM Bild (unten links) — nicht in der
         Seitenleiste: dort nähme es den Modi eine Zeile, und gelesen wird es
         neben der Welle, nicht neben den Feldern. */
      const txt = melt && snap ? opts.frameText(snap, r) : null;
      shell.status(txt ? '<b>' + txt.time + '</b> · ' + txt.info : '');
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
      /* Abgespielt wird, wo das Bild steht — seit der Regler unter dem Knopf
         sitzt, ist das jeder Modus (resultShown). Die alte Prüfung auf
         „ergebnis" hielt das Abspielen überall sonst sofort wieder an. */
      if (!now || !resultShown()) { stopPlay(); return; }
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
    ui('bild-row').hidden = IDS.filter(id => state.results[id]).length < 2;
    if (r) segButtonSet(ui('bild-seg'), r.engine);
    ui('result-extra').hidden = !r;
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
  /** Was der fertige Lauf gekostet hat — ein Verfahren ohne Auflösung nennt keine. */
  const ranWith = r => (r.cell ? 'Gerechnet mit ' + fmtUnit(r.cell, 'mm') + ' in ' : 'Gerechnet in ') + fmtUnit(r.ms / 1000, 's');

  function primary() {
    /* Während eines Laufs: „Abbrechen" steht in JEDEM Modus (der Rahmen zeigt es,
       solange die Arbeit läuft), und die Zeile darunter gehört dem Fortschritt —
       auch gleich nach einem Moduswechsel, der sie leert, nicht erst beim
       nächsten Bild der Rechnung. */
    if (state.running) return { label: RUN, reason: state.progressText, noteKind: 'busy' };
    /* „Simulieren" steht ebenfalls in jedem Modus: der Lauf gehört zum Werkzeug,
       nicht zu einem Reiter — wer an der Kammer oder der Kurve dreht, rechnet
       gleich dort neu, statt erst nach „Simulation" zu wechseln. */
    if (!opts.problem()) return { label: RUN, disabled: true, reason: opts.blocked() };
    /* Die Zeile unter dem Knopf steht in jedem Modus: das Verfahren sagt es dort
       in EINER Zeile (blockedShort), der Modus „Simulation" ausführlich. */
    const est = estimateNow();
    if (est.blocked) return { label: RUN, disabled: true, reason: est.blockedShort || est.blocked };
    const id = state.engine, r = state.results[id];
    if (state.failed) return { label: RUN, onClick: simulate, noteKind: 'bad', reason: 'Die Rechnung ist gescheitert: ' + state.failed };
    if (state.cancelled && !r) return { label: RUN, onClick: simulate, noteKind: 'warn', reason: cancelNote() };
    /* Steht das Ergebnis dieses Verfahrens, lädt der Knopf nicht mehr ein: er
       wird zum Umriss, und die Zeile sagt, was dieser Lauf gekostet hat — kurz:
       sie steht in jedem Modus da und nähme der Seitenleiste sonst zwei Zeilen
       (tests/browser/ux.spec.mjs misst das, in Firefox' breiterer Schrift). */
    if (r) return { label: RUN, kind: 'outline', onClick: simulate, reason: ranWith(r) + '.' };
    const other = shown();
    return { label: RUN, onClick: simulate, reason: other
      ? 'Mit ' + WITH[id] + ' noch nicht gerechnet (das Bild zeigt die Rechnung mit ' + WITH[other.engine] + ').'
      : 'Noch nicht gerechnet.' };
  }

  /* ── Verdrahtung (die Felder stehen erst jetzt auf der Seite) ─ */
  function mounted() {
    /* Zeitregler und Abspielen gehören nicht in einen Reiter, sondern unter den
       Hauptknopf: das Bild des Laufs ist da, gleich wo man gerade einstellt. */
    shell.setActionsExtra(PLAYBACK_ROWS);
    segButtons(ui('engine-seg'), v => { setEngine(v); host.changed('Rechenverfahren'); });
    /* Geklemmt wird hier, nicht in numberInput: dessen Grenzen stehen beim
       Anlegen fest, dieses Feld gehört aber dem gewählten Verfahren. */
    numberInput(ui('cell'), v => {
      if (!ENGINES[state.engine].cellLabel) return v;       // das Metamodell hat keins (die Zeile ist verborgen)
      const [lo, hi] = rangeOf(state.engine), use = Math.max(lo, Math.min(hi, v));
      if (use !== v) clampNote(ui('cell'), 'auf ' + fmtPlain(use) + ' mm begrenzt (' + rangeText(lo, hi, 'mm') + ')');
      state.cell[state.engine] = use;
      cache = {};
      syncEngine();
      host.refreshActions();
      host.changed(ENGINES[state.engine].cellLabel);
      return use;
    }, { unit: 'mm' });
    segButtons(ui('bild-seg'), v => { state.bild = v; stopPlay(); renderResults(); });
    /* Ohne Anzeige dahinter: die Zeit steht unten links im Bild. */
    slider(ui('t-slider'), v => { stopPlay(); showFrame(v); }, null, null, { fire: false });
    ui('play').addEventListener('click', togglePlay);
    wired = true;
    setPlayButton(false);
    syncEngine();
    renderResults();
  }

  return {
    mounted, simulate, invalidate, setEngine, syncEngine, renderResults, applyView, showFrame, stopPlay, primary,
    cellOf, shown, displays, ids: IDS, defaultEngine: IDS[0],
    /** Neue Maße, neues System: die Auflösung folgt wieder dem Vorschlag. */
    autoCell() { for (const id of IDS) state.cell[id] = null; cache = {}; if (wired) syncEngine(); },
    /** Der Teil der Einstellungen, der beiden Werkzeugen gemeinsam ist. */
    settings: () => ({ engine: state.engine, cell: Object.fromEntries(IDS.filter(id => ENGINES[id].cellLabel).map(id => [id, state.cell[id]])) }),
    /** … und zurück. `keepEngine`: die Adresse (?engine=…) hat das Verfahren
        schon bestimmt — gemerkte Einstellungen überstimmen sie nicht. */
    applySettings(obj, { keepEngine = false } = {}) {
      const num = (id, v) => { if (!Number.isFinite(v)) return null; const [lo, hi] = rangeOf(id); return Math.max(lo, Math.min(hi, v)); };
      const c = obj && obj.cell ? obj.cell : {};
      for (const id of IDS) state.cell[id] = ENGINES[id].cellLabel ? num(id, c[id]) : null;
      cache = {};
      if (!keepEngine && obj && IDS.includes(obj.engine)) state.engine = obj.engine;
      if (wired) { syncEngine(); host.refreshActions(); }
    }
  };
}
