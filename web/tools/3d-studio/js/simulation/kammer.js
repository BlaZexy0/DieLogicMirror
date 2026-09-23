/* Kammerfüllung — das Werkzeug im gemeinsamen Rahmen.

   Die Füllkammer als liegender Zylinder: Durchmesser, Länge und Füllgrad;
   der Kolben fährt die Schusskurve — die
   DieLogic-Kurve des Projekts oder zweistufig v₁/v₂. Beim Start steht die
   Schmelze ruhig unten in der Kammer; dann schiebt der Kolben, und die Welle
   läuft. Heraus kommt: wann die Schmelze den Laufkanal erreicht („Kammer
   voll", gegen die Kurve), wie viel Luft die Welle einschließt, und das Bild
   zu jeder Zeit am Regler, die Schmelze nach Geschwindigkeit gefärbt.

   Gerechnet wird mit dem Gitter (js/lbm/), mit Partikeln (js/sph/) oder mit
   dem Metamodell (js/meta/) — ein Schalter, drei Verfahren (core.js,
   engines/). Das Werkzeug hat kein Bauteil und keine Datei als Quelle:
   createHost({ part: false }), die Einstellungen gehören zu EINEM Schlüssel
   („kammer").

   Die Modi: Kammer · Kurve · Simulation · Ergebnis. Kammer, Kolben und
   Kolben stehen immer im Bild, dazu die ruhende Schmelze bis zum Stand
   des Füllgrads. „Simulieren" und der Zeitregler stehen unten unter dem
   Knopf und gelten in JEDEM Modus: steht ein Lauf, zeigt das Bild die
   gerechnete Schmelze und der Kolben fährt mit dem Regler — wer an der
   Kammer dreht, sieht sein Ergebnis dabei (und verliert es, wenn die
   Änderung ein anderes Problem stellt). */

import * as T from 'three';
import { segButtons, segButtonSet, slider, numberInput, parseNumber, clampNote } from '../ui/controls.js';
import { kpis, esc } from '../studio/rows.js';
import { fmtPlain, fmtUnit, fmtFixed, rangeText } from '../studio/format.js';
import { fillLevel } from '../lbm/sleeve.js';
import * as F from '../runner/flow.js';
import { shotTimeline } from '../runner/shottime.js';
import { state as design } from '../../../auslegung/js/core/state.js';
import { generateCurve } from '../../../auslegung/js/core/curvegen.js';
import { buildProfile, rhoSolidus, vCrit } from '../../../auslegung/js/core/physics.js';
import { createSimCore, ENGINES, engineFromUrl } from './core.js';
import { env, probeGpu } from './engines/env.js';
import { compareTable } from './table.js';
import { onScheme, steelShade, ROLE } from '../part/colors.js';
import { MODES, DARSTELLUNG } from './kammer-panel.js';

export const FORMAT = 'dielogic-kammerfuellung';
export const FORMAT_VERSION = 1;

/* Die Vorgaben an EINER Stelle: die Felder der Seitenleiste werden daraus
   beschrieben (syncFields), „Zurücksetzen" führt hierher zurück. Die beiden
   alten Seiten trugen v₁ doppelt — „0,5" als Text im HTML, 0.5 im Skript. */
/* Der Auslass in der Stirnfläche ist keine Eingabe: Er folgt dem Durchmesser
   (Breite D/3, Tiefe D/6 — bei Ø 90 die 30 × 15 mm, mit denen die Seite immer
   gerechnet hat). Er ist Randbedingung der Rechnung, kein Entwurf: der
   Laufkanal wird im Angussdesigner ausgelegt, und das Metamodell kennt
   ohnehin nur sein eigenes Fenster (engines/meta.js). Darum steht er auch
   nicht im Bild. */
const outletFor = d => ({ outletW: d / 3, outletH: d / 6 });
/** Reicht die Kurve bis „Kammer voll"? Sonst ist tFull NaN (updateProblem). */
const reaches = cv => !!cv && Number.isFinite(cv.tFull);

const DEFAULTS = {
  spec: { d: 90, length: 450, fill: 0.4 },
  curveMode: 'dielogic', v1: 0.5, v2: 2, a: 100, alloy: 'al', opacity: 0.25,
  /* Wegpunkte wie im Dashboard: [Weg mm, v m/s]. Beim ersten Wechsel auf
     „Punkte" kommen die des Projekts, sonst diese. */
  points: [[100, 0.5], [270, 0.5], [340, 2]]
};
/* Die Beschleunigung ab 1 m/s²: das Metamodell kennt Rampen bis 0,5 g (4,9 m/s²), und
   bei der alten Untergrenze von 5 m/s² ließ sich keine zweistufige Kurve mit ihm rechnen. */
const LIMITS = {
  d: [20, 300], length: [50, 2000], fill: [0.1, 0.9],
  v1: [0.05, 5], v2: [0.1, 12], a: [1, 2000],
  /* Die Wegpunkte: der Weg so weit wie die längste Kammer, die Geschwindigkeit wie v₂. */
  s: [0, 2000], v: [0, 12]
};
const clampTo = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

export function createKammerfuellungTool(host) {
  const { shell, view } = host;
  const ui = host.ui;

  const state = {
    spec: { ...DEFAULTS.spec },
    curveMode: DEFAULTS.curveMode, v1: DEFAULTS.v1, v2: DEFAULTS.v2, a: DEFAULTS.a, alloy: DEFAULTS.alloy,
    points: DEFAULTS.points.map(pt => pt.slice()), punkteGeholt: false,
    curve: null, curveError: '',      // curve: { profile, tFull (NaN: nie), sFill, sEnd, vcrit, v2, v2Soll, A, warn }
    opacity: DEFAULTS.opacity, ready: false
  };

  /* ── Szene: Kammer als Zylinder entlang x, Kolben als Scheibe ─── */
  const group = new T.Group();
  view.scene.add(group);
  /* Die Dinge in ihren Sachfarben (js/part/colors.js): die Kammer ist
     Stahl, in derselben Stufe wie die Füllkammer im Formaufbau
     (js/registry.js), durchscheinend; der Kolben ist Kolben. */
  const sleeveColor = () => steelShade(0.62);
  const sleeveMat = new T.MeshStandardMaterial({ color: sleeveColor(), roughness: 0.55, metalness: 0.1, side: T.DoubleSide, transparent: true, opacity: 0.25, depthWrite: false });
  const sleeveMesh = new T.Mesh(new T.BufferGeometry(), sleeveMat);
  const plungerMesh = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({ color: ROLE.piston, roughness: 0.5, metalness: 0.3, side: T.DoubleSide }));
  /* Die ruhende Schmelze vor dem Schuss: ohne sie änderte der Regler
     „Füllgrad" nur Zahlen. Sie trägt die Farbe der Schmelze; im Ergebnis
     löst sie das Bild des Laufs ab, das seine Skala mitbringt. */
  const restMesh = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({
    color: ROLE.melt, roughness: 0.5, metalness: 0.05, side: T.DoubleSide, transparent: true, opacity: 0.85
  }));
  group.add(sleeveMesh, plungerMesh, restMesh);

  function rebuildScene() {
    const { d, length } = state.spec;
    const R = d / 2;
    const cyl = new T.CylinderGeometry(R, R, length, 64, 1, true);
    cyl.rotateZ(-Math.PI / 2);
    cyl.translate(length / 2, 0, 0);
    sleeveMesh.geometry.dispose();
    sleeveMesh.geometry = cyl;
    placePlunger(0);
    /* Das Kreissegment unter dem Spiegel (fillLevel aus js/lbm/sleeve.js),
       über die Länge gezogen; ein Haar kleiner als die Kammer, damit die
       Flächen nicht flimmern. */
    const r = R - 0.3, level = fillLevel(state.spec.fill, R);
    const half = Math.acos(Math.max(-1, Math.min(1, (R - level) / r)));
    const seg = new T.Shape();
    seg.absarc(0, 0, r, -Math.PI / 2 - half, -Math.PI / 2 + half, false);
    seg.closePath();
    const melt = new T.ExtrudeGeometry(seg, { depth: length, bevelEnabled: false, curveSegments: 40 });
    melt.rotateY(Math.PI / 2);                     // gezogen wird entlang z — die Kammer liegt entlang x
    restMesh.geometry.dispose();
    restMesh.geometry = melt;
    view.invalidate();
  }
  /* Die Scheibe nur neu bauen, wenn sich Lage oder Durchmesser ändern —
     applyView ruft hier bei jedem Moduswechsel und jedem Bild vorbei. */
  let plungerKey = '';
  function placePlunger(s) {
    const R = state.spec.d / 2;
    if (plungerKey === s + '|' + R) return;
    plungerKey = s + '|' + R;
    const disc = new T.CylinderGeometry(R, R, 4, 64);
    disc.rotateZ(-Math.PI / 2);
    disc.translate(s - 2, 0, 0);
    plungerMesh.geometry.dispose();
    plungerMesh.geometry = disc;
  }
  /* Eingepasst wird die Kammer — F, „Einpassen" und Doppelklick fragen hier. */
  const sceneBox = () => new T.Box3().setFromObject(sleeveMesh);
  shell.setFitTarget(sceneBox);
  const fitScene = () => shell.fit(sceneBox());

  /* ── Gemeinsamer Teil: Verfahren, Lauf, Bild ─────────────── */
  const core = createSimCore({
    host, state, group, kind: 'kammer',
    until: 'bis Kammer voll',
    /* Die Kerne wollen den Auslass im spec — sie bekommen den abgeleiteten.
       Eine Kurve, die vor „Kammer voll" endet, stellt kein Problem: die
       Rechnung fragt nach genau diesem Punkt, und keines der drei Verfahren
       käme ehrlich dorthin (das Metamodell kennt die Kurve nur bis dorthin,
       Gitter und Partikel hielten am Ende der Kurve an). */
    problem: () => (reaches(state.curve)
      ? { kind: 'kammer', spec: { ...state.spec, ...outletFor(state.spec.d) }, curve: state.curve, alloy: F.ALLOYS[state.alloy] || F.ALLOYS.al }
      : null),
    /* In EINER Zeile (sie steht in jedem Modus); was fehlt, sagt die Kennzahl im Modus „Kurve". */
    blocked: () => (state.curve
      ? 'Die Kurve endet vor „Kammer voll" (' + fmtUnit(state.curve.sEnd, 'mm', 0) + ').'
      : 'Keine Kurve: ' + state.curveError),
    frameText: snap => ({
      time: fmtUnit(snap.t * 1000, 'ms', 0),
      /* Was im Bild steht (unten links): wo der Kolben ist, wie schnell er dort
         fährt — die Kurve sagt es zu jeder Zeit — und was die Welle einschließt. */
      info: 'Kolben ' + fmtUnit(snap.s, 'mm', 0)
        + (state.curve ? ' · v ' + fmtUnit(state.curve.profile.atTime(snap.t).v, 'm/s') : '')
        + ' · Luft ' + fmtUnit(snap.air, 'cm³')
        + (snap.bubbles > 0 ? ' (' + fmtPlain(snap.bubbles, 0) + (snap.bubbles === 1 ? ' Blase)' : ' Blasen)') : '')
    }),
    meltVisible: () => true,
    /* Der Zeitregler steht unter dem Hauptknopf — also gehört das Bild des
       Laufs in jeden Modus, nicht nur in „Ergebnis". */
    resultEverywhere: true,
    /* Der Kolben wandert mit dem Bild; ohne Bild steht er in Startlage. */
    onFrame: snap => { placePlunger(snap ? snap.s : 0); restMesh.visible = !snap; applyLook(); },
    render: renderTable
  });
  /* Ein Wechsel des Farbschemas: Kammer, Kolben und ruhende Schmelze
     umfärben, das Bild des Laufs neu zeigen (es holt seine Skala dabei). */
  onScheme(() => {
    sleeveMat.color.set(sleeveColor());
    plungerMesh.material.color.set(ROLE.piston);
    restMesh.material.color.set(ROLE.melt);
    core.applyView();
  });

  /* ── Kammer und Kurve ────────────────────────────────────── */
  /* Die Auslegungswerte mit der Kammer von hier: Kolben-Ø, Länge, und die
     Massen so, dass der Füllgrad stimmt (die Kurve rechnet ihn aus den
     Massen). Der Pressrest bekommt 25 mm, der Anguss ein Zehntel des Rests,
     das Bauteil den Rest — für die zweite Phase der Kurve. */
  function valuesFor() {
    const { d, length, fill } = state.spec;
    const v = { ...design.values, diam: d, length };
    const A = Math.PI * d * d / 4;
    const liquid = A * length * fill;                                   // mm³
    const solid = liquid * v.density / rhoSolidus(v);                   // mm³ fest
    const biscuit = Math.min(solid * 0.3, A * 25);
    const runner = (solid - biscuit) * 0.1;
    const part = solid - biscuit - runner;
    return { v, volumes: { part, runner, overflow: 0, biscuit } };
  }

  /* Kammer oder Kurve geändert: ein anderes Problem — beide Ergebnisse gehen.
     `why` ist die Bezeichnung des Felds: bricht ein Lauf deshalb ab, sagt er
     es (core.invalidate). */
  function updateProblem(why = '') {
    const { v, volumes } = valuesFor();
    const { d, length, fill } = state.spec;
    const A = Math.PI * d * d / 4;
    const sFill = (1 - fill) * length;
    try {
      let profile, tFull, warn, v2, v2Soll = null;
      if (state.curveMode === 'dielogic') {
        const tl = shotTimeline(v, volumes, { diam: d, length });
        if (tl.error) throw new Error(tl.error);
        profile = tl.shot.profile; tFull = tl.tFull; warn = tl.warn; v2 = tl.v2;
      } else if (state.curveMode === 'punkte') {
        /* Die eigenen Wegpunkte: genau wie im Dashboard gelesen — zwischen den
           Punkten konstant beschleunigt, der Ursprung kommt von selbst dazu. */
        const pts = state.points.filter(pt => Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
        if (pts.length < 1) throw new Error('Mindestens ein Wegpunkt.');
        for (let i = 1; i < pts.length; i++) if (pts[i][0] <= pts[i - 1][0]) throw new Error('Der Weg muss von Punkt zu Punkt zunehmen (Zeile ' + (i + 1) + ').');
        profile = buildProfile(pts);
        tFull = profile.atPos(sFill / 1000).t;
        v2 = pts[pts.length - 1][1];
        warn = '';
      } else {
        for (const k of ['part', 'runner', 'overflow', 'biscuit']) v[k] = volumes[k] * 1e-9 * rhoSolidus(v);
        const gen = generateCurve(v, { mode: 'v1v2', v1: state.v1, a1: state.a, v2: state.v2, a2: state.a });
        if (gen.error) throw new Error(gen.error);
        profile = buildProfile(gen.points);
        tFull = profile.atPos(sFill / 1000).t;
        /* Reicht die Rampe auf v₂ nicht bis vor das Schussende (gen.warn), sagt es die
           Kennzahl „2. Phase" mit dem, was erreicht wird — keine eigene Warnzeile: mit
           v₁ / v₂ hat der Modus „Kurve" dafür keinen Platz (die drei Zeilen schoben das
           Feld v₁ über den Schalter der Kurve, gemessen 2026-09-22), und gerechnet wird
           ohnehin nur bis „Kammer voll". Mit a bis 4,9 m/s² (so weit kennt das Metamodell
           die Rampen) kommt das bei den meisten Kammern vor. */
        v2 = gen.warn ? profile.v[profile.v.length - 1] : state.v2;
        v2Soll = gen.warn ? state.v2 : null;
        warn = '';
      }
      /* Endet die Kurve vor „Kammer voll", wird es nie erreicht. atPos() hält
         am Ende der Kurve an: sonst stünde „Kammer voll bei …" mit der Zeit
         ihres letzten Punkts da (NaN heißt hier „nie"). */
      const sEnd = profile.travel * 1000;
      if (sEnd < sFill - 1e-6) tFull = NaN;
      state.curve = { profile, tFull, sFill, sEnd, vcrit: vCrit(d / 1000, fill), v2, v2Soll, A: A * 1e-6, warn };
      state.curveError = '';
    } catch (err) {
      state.curve = null;
      state.curveError = err.message || String(err);
    }
    kpis(ui('sleeve-kpis'), [
      { label: 'Kammervolumen', value: fmtUnit(A * length / 1000, 'cm³', 0), note: 'davon Schmelze ' + fmtUnit(A * length * fill / 1000, 'cm³', 0) },
      { label: 'Kammer voll', value: 'nach ' + fmtUnit(sFill, 'mm', 0), note: 'Kolbenweg, bis die Schmelze die Kammer füllt' }
    ]);
    const cv = state.curve;
    ui('curve-warn').textContent = cv ? (cv.warn || '') : 'Keine Kurve: ' + state.curveError;
    /* Die Notizen der Kennzahlen sind HTML: v<sub>krit</sub> wie in der Hilfe. */
    kpis(ui('curve-kpis'), cv ? [
      { label: '1. Phase', value: 'bis ' + fmtUnit(cv.profile.maxVelBefore(sFill / 1000), 'm/s'), note: 'v<sub>krit</sub> ' + fmtUnit(cv.vcrit, 'm/s') },
      reaches(cv)
        ? { label: 'Kammer voll', value: 'bei ' + fmtUnit(cv.tFull * 1000, 'ms', 0), note: 'nach ' + fmtUnit(sFill, 'mm', 0) + ' Kolbenweg' }
        : { label: 'Kammer voll', value: 'wird nicht erreicht', verdict: 'warn', note: 'die Kurve müsste bis ' + fmtUnit(sFill, 'mm', 0) + ' reichen' },
      cv.v2Soll
        ? { label: '2. Phase', value: 'v₂ ' + fmtUnit(cv.v2, 'm/s'), verdict: 'warn', note: 'statt ' + fmtUnit(cv.v2Soll, 'm/s') + ': a erhöhen oder v₂ senken' }
        : { label: '2. Phase', value: 'v₂ ' + fmtUnit(cv.v2, 'm/s'), note: 'die Kurve endet bei ' + fmtUnit(cv.sEnd, 'mm', 0) }
    ] : []);
    rebuildScene();
    core.invalidate(why);
  }

  /* ── Ergebnis: Kammer voll und Luft, beide Verfahren und die Kurve ─ */
  function renderTable() {
    const cv = state.curve;
    const res = core.ids.map(id => state.results[id]);
    const shownNow = core.shown();
    const last = r => r.snapshots[r.snapshots.length - 1];
    const cell = (fn, digits) => res.map(r => { if (!r) return '—'; const v = fn(r); return Number.isFinite(v) ? fmtFixed(v, digits) : 'nie'; });
    /* Die Kurve erreicht „Kammer voll" nur, wenn sie bis dorthin reicht. */
    const curveCell = v => (!cv ? '—' : reaches(cv) ? fmtFixed(v, 0) : 'nie');
    compareTable(ui('result-table'), {
      caption: 'Zeiten ab Kolbenstart',
      cols: [
        ...core.ids.map((id, i) => ({ label: ENGINES[id].short || ENGINES[id].label, off: !res[i], shown: !!shownNow && shownNow.engine === id && !!res[i] })),
        { label: 'Kurve' }
      ],
      rows: [
        { label: 'Kammer voll, ms', cells: [...cell(r => (r.full ? r.full.t * 1000 : NaN), 0), curveCell(cv && cv.tFull * 1000)] },
        { label: '… Kolbenweg, mm', cells: [...cell(r => (r.full ? r.full.s : NaN), 0), curveCell(cv && cv.sFill)] },
        /* Wann das Höchste war und in wie vielen Blasen: am Zeitregler, Bild für Bild. */
        { label: 'Luft höchstens, cm³', cells: [...cell(r => r.airMax.air, 1), ''] },
        { label: 'Luft am Ende, cm³', cells: [...cell(r => last(r).air, 1), ''] }
      ]
    });
  }

  function applyLook() {
    sleeveMat.opacity = state.opacity;
    sleeveMat.transparent = state.opacity < 1;
    sleeveMat.depthWrite = state.opacity >= 1;
    sleeveMat.needsUpdate = true;
    view.invalidate();
  }

  /* ── Die Wegpunkte (Modus „Punkte") ─────────────────────── */
  const MAX_PUNKTE = 10;
  /* Je Spalte der Zeile: Grenzen und Einheit — geklemmt wird wie bei v₁ und v₂. */
  const PUNKT_FELD = [{ limits: LIMITS.s, unit: 'mm' }, { limits: LIMITS.v, unit: 'm/s' }];

  /* Die Liste neu bauen: nur, wenn Zeilen dazukommen oder gehen (und beim
     Laden). Ein geänderter Wert bleibt, wo er ist — siehe den Zuhörer unten. */
  function renderPunkte() {
    ui('punkte-liste').innerHTML = state.points.map((pt, i) =>
      '<div class="kf-punkt">'
      + '<input type="text" inputmode="decimal" data-punkt="' + i + '" data-feld="0" value="' + esc(fmtPlain(pt[0])) + '" aria-label="Weg des ' + (i + 1) + '. Punktes" spellcheck="false" autocomplete="off">'
      + '<span class="unit">mm</span>'
      + '<input type="text" inputmode="decimal" data-punkt="' + i + '" data-feld="1" value="' + esc(fmtPlain(pt[1])) + '" aria-label="Geschwindigkeit des ' + (i + 1) + '. Punktes" spellcheck="false" autocomplete="off">'
      + '<span class="unit">m/s</span>'
      + (state.points.length > 1
        ? '<button type="button" class="kf-weg" data-loesch="' + i + '" title="Punkt entfernen" aria-label="Punkt entfernen">✕</button>'
        : '<span></span>')
      + '</div>').join('');
    ui('punkt-plus').disabled = state.points.length >= MAX_PUNKTE;
  }

  /* „auf … begrenzt" wie unter einem Feld von numberInput. Die Punktzeile ist
     ein Raster aus fünf Spalten ohne Bezeichnung davor: der Hinweis geht über
     die ganze Breite und rückt nicht unter die Felder ein (css/studio.css). */
  function punktNote(el, text) { clampNote(el, text); }

  /* Beim ersten Mal die Kurve des Projekts übernehmen — dieselben Punkte wie
     im Dashboard, von dort aus weiterzueditieren. */
  function punkteHolen() {
    if (state.punkteGeholt) return;
    state.punkteGeholt = true;
    const ausProjekt = Array.isArray(design.curve) ? design.curve.filter(pt => Number.isFinite(pt[0]) && Number.isFinite(pt[1])) : [];
    if (ausProjekt.length) state.points = ausProjekt.slice(0, MAX_PUNKTE).map(pt => [pt[0], pt[1]]);
  }

  /* ── Modi ────────────────────────────────────────────────── */
  const modes = MODES.map(m => ({ ...m }));
  for (const m of modes) { m.primary = core.primary; m.enter = () => core.applyView(); m.leave = () => core.stopPlay(); }

  /* ── Verdrahtung ─────────────────────────────────────────── */
  let wired = false;
  const changed = label => { if (wired) host.changed(label); };
  /** Ein Feld, das das Problem ändert: neu aufstellen, dann dem Rahmen melden. */
  const edit = label => { updateProblem(label); changed(label); };
  let opacityEl = null;
  const urlEngine = engineFromUrl();
  let starting = true;

  /* Die Felder aus dem Zustand beschreiben — eine Quelle für die Vorgaben. */
  function syncFields() {
    const s = state.spec;
    ui('sl-d').value = fmtPlain(s.d); ui('sl-len').value = fmtPlain(s.length);
    ui('sl-fill').value = String(Math.round(s.fill * 100));
    ui('sl-fill-val').textContent = Math.round(s.fill * 100) + ' %';
    ui('sl-v1').value = fmtPlain(state.v1); ui('sl-v2').value = fmtPlain(state.v2); ui('sl-a').value = fmtPlain(state.a);
    ui('alloy').value = state.alloy;
    segButtonSet(ui('curve-seg'), state.curveMode);
    ui('v1v2-block').hidden = state.curveMode !== 'v1v2';
    ui('punkte-block').hidden = state.curveMode !== 'punkte';
    renderPunkte();
    if (opacityEl) {
      opacityEl.value = String(Math.round(state.opacity * 100));
      opacityEl.parentNode.querySelector('.val').textContent = opacityEl.value + ' %';
    }
  }

  function mounted() {
    ui('alloy').innerHTML = Object.entries(F.ALLOYS).map(([k, x]) => '<option value="' + k + '">' + x.label + '</option>').join('');
    /* Neue Maße: die Auflösung folgt wieder dem Vorschlag, das Bild passt neu ein. */
    const resized = label => { core.autoCell(); updateProblem(label); fitScene(); changed(label); };
    numberInput(ui('sl-d'), v => { state.spec.d = v; resized('Durchmesser'); return v; }, { min: LIMITS.d[0], max: LIMITS.d[1], unit: 'mm' });
    numberInput(ui('sl-len'), v => { state.spec.length = v; resized('Länge'); return v; }, { min: LIMITS.length[0], max: LIMITS.length[1], unit: 'mm' });
    slider(ui('sl-fill'), v => { if (!wired) return; state.spec.fill = v / 100; edit('Füllgrad'); }, v => v + ' %');
    segButtons(ui('curve-seg'), v => {
      state.curveMode = v;
      if (v === 'punkte') punkteHolen();
      ui('v1v2-block').hidden = v !== 'v1v2';
      ui('punkte-block').hidden = v !== 'punkte';
      renderPunkte();
      edit('Schusskurve');
    });
    /* Die Punktliste wächst und schrumpft: EIN Zuhörer für alle Zeilen.
       Der Wert wird geklemmt wie v₁ und v₂ und an Ort und Stelle
       zurückgeschrieben — die Liste neu zu bauen hieße, mit Tab von Feld zu
       Feld stünde der Fokus auf einem Feld, das es nicht mehr gibt. Unlesbares
       wird als „schlecht" markiert, der letzte gültige Wert bleibt (wie bei numberInput). */
    ui('punkte-liste').addEventListener('change', e => {
      const el = e.target.closest ? e.target.closest('[data-punkt]') : null;
      if (!el) return;
      const i = +el.getAttribute('data-punkt'), f = +el.getAttribute('data-feld');
      const wert = parseNumber(el.value);
      if (wert === null || !state.points[i] || !PUNKT_FELD[f]) { el.classList.add('bad'); return; }
      el.classList.remove('bad');
      const { limits, unit } = PUNKT_FELD[f], use = clampTo(wert, limits);
      if (use !== wert) punktNote(el, 'auf ' + fmtPlain(use) + ' ' + unit + ' begrenzt (' + rangeText(limits[0], limits[1], unit) + ')');
      state.points[i][f] = use;
      el.value = fmtPlain(use);
      edit('Wegpunkt');
    });
    /* Zeilen gehen und kommen: dann doch neu bauen, und der Fokus landet, wo
       man weitermacht — beim ✕ an derselben Stelle, im Weg des neuen Punkts. */
    const fokus = sel => { const el = ui('punkte-liste').querySelector(sel) || ui('punkt-plus'); if (el && el.focus) el.focus(); };
    ui('punkte-liste').addEventListener('click', e => {
      const b = e.target.closest ? e.target.closest('[data-loesch]') : null;
      if (!b || state.points.length < 2) return;
      const i = +b.getAttribute('data-loesch');
      state.points.splice(i, 1);
      renderPunkte();
      fokus('[data-loesch="' + Math.min(i, state.points.length - 1) + '"]');
      updateProblem('Wegpunkt');
      changed('Wegpunkt entfernt');
    });
    ui('punkt-plus').addEventListener('click', () => {
      if (state.points.length >= MAX_PUNKTE) return;
      const letzt = state.points[state.points.length - 1] || [0, 0];
      state.points.push([clampTo(letzt[0] + 50, LIMITS.s), letzt[1]]);
      renderPunkte();
      fokus('[data-punkt="' + (state.points.length - 1) + '"][data-feld="0"]');
      edit('Wegpunkt');
    });
    numberInput(ui('sl-v1'), v => { state.v1 = v; edit('v₁'); return v; }, { min: LIMITS.v1[0], max: LIMITS.v1[1], unit: 'm/s' });
    numberInput(ui('sl-v2'), v => { state.v2 = v; edit('v₂'); return v; }, { min: LIMITS.v2[0], max: LIMITS.v2[1], unit: 'm/s' });
    numberInput(ui('sl-a'), v => { state.a = v; edit('Beschleunigung'); return v; }, { min: LIMITS.a[0], max: LIMITS.a[1], unit: 'm/s²' });
    /* Die Legierung gehört zum Problem (Zähigkeit des Gitters, Dichte der Partikel). */
    ui('alloy').addEventListener('change', e => { state.alloy = e.target.value; edit('Legierung'); });
    const pop = shell.darstellung(DARSTELLUNG);
    opacityEl = pop.querySelector('[data-ui="opacity"]');
    slider(opacityEl, v => { state.opacity = v / 100; applyLook(); changed('Deckkraft'); }, v => v + ' %');
    core.mounted();
    syncFields();
    wired = true;
  }

  /* ── Einstellungen: merken, laden, zurücksetzen ──────────── */
  const toJSON = () => ({
    format: FORMAT, version: FORMAT_VERSION, ...core.settings(),
    spec: { ...state.spec }, curveMode: state.curveMode, v1: state.v1, v2: state.v2, a: state.a, alloy: state.alloy,
    points: state.points.map(pt => pt.slice()), opacity: state.opacity
  });
  function fromJSON(obj) {
    if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Datei der Kammerfüllung.');
    if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
    /* Was das Problem stellt — mit „Punkte" gehören die Wegpunkte dazu: eine
       Datei, die sich nur in ihnen unterschied, ließ sonst die alte Kurve stehen
       (die Liste zeigte die neuen Punkte, Kennzahlen, Tabelle und Lauf die alten). */
    const problemOf = () => JSON.stringify([state.spec, state.curveMode, state.v1, state.v2, state.a, state.alloy,
      state.curveMode === 'punkte' ? state.points : null]);
    const before = problemOf();
    const sizeBefore = state.spec.d + '×' + state.spec.length;
    const s = obj.spec || {};
    /* Ältere Dateien tragen noch outletW/outletH: sie werden nicht mehr gelesen. */
    for (const k of ['d', 'length', 'fill']) if (Number.isFinite(s[k])) state.spec[k] = clampTo(s[k], LIMITS[k]);
    state.curveMode = ['v1v2', 'punkte'].includes(obj.curveMode) ? obj.curveMode : 'dielogic';
    if (Array.isArray(obj.points)) {
      const pts = obj.points.filter(pt => Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
      if (pts.length) { state.points = pts.slice(0, MAX_PUNKTE).map(pt => [clampTo(pt[0], LIMITS.s), clampTo(pt[1], LIMITS.v)]); state.punkteGeholt = true; }
    }
    for (const k of ['v1', 'v2', 'a']) if (Number.isFinite(obj[k])) state[k] = clampTo(obj[k], LIMITS[k]);
    /* Eigene Schlüssel: „constructor" steht auch in F.ALLOYS, nur nicht als Legierung. */
    if (Object.hasOwn(F.ALLOYS, obj.alloy)) state.alloy = obj.alloy;
    state.opacity = Number.isFinite(obj.opacity) ? clampTo(obj.opacity, [0.05, 1]) : DEFAULTS.opacity;
    syncFields();
    if (before !== problemOf()) updateProblem();
    core.applySettings(obj, { keepEngine: starting && !!urlEngine });
    if (sizeBefore !== state.spec.d + '×' + state.spec.length) fitScene();
    applyLook();
    core.renderResults();
    host.refreshActions();
  }
  const resetSettings = () => fromJSON({
    format: FORMAT, version: FORMAT_VERSION, engine: urlEngine || core.defaultEngine, cell: {},
    ...DEFAULTS, spec: { ...DEFAULTS.spec }
  });

  async function start() {
    await probeGpu();
    updateProblem();
    fitScene();
    state.ready = true;
    /* Ein Werkzeug ohne Quelle: die Einstellungen gehören zu EINEM Schlüssel. */
    host.settingsFor('kammer');
    starting = false;
  }

  const tool = {
    id: 'kammerfuellung', modes, startMode: 'kammer', settingsOnly: true,
    mounted, start, toJSON, fromJSON, resetSettings, accepts: [FORMAT], exports: [],
    docName: () => 'kammer-' + fmtPlain(state.spec.d, 0) + 'x' + fmtPlain(state.spec.length, 0),
    state, group
  };
  tool.__viewer = {
    state, view, shell, host, tool, core, group, sleeveMesh, plungerMesh, restMesh,
    simulate: core.simulate, showFrame: core.showFrame,
    get meltMesh() { return core.displays.lbm.object; },
    get points() { return core.displays.sph.points; },
    get gpu() { return env.gpu; },
    /* Was eingepasst wird — tests/browser/ux.spec.mjs misst daran, ob das Modell im Bild liegt. */
    get partMesh() { return sleeveMesh; }
  };
  return tool;
}
