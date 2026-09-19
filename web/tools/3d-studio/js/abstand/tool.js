/* Abstandsanalyse — das Werkzeug im gemeinsamen Rahmen.

   Zwei Dateien, ein Abstand. Für jeden Punkt der Oberfläche A wird der
   kürzeste Weg zur Oberfläche B gesucht (und umgekehrt), und beide Netze
   werden damit eingefärbt. Die Grenzen der Farbskala setzt der Nutzer —
   ohne das wäre die Karte nur schön: erst „interessant ist der Bereich
   zwischen 8 und 20 mm" macht daraus eine Aussage.

   Gerechnet wird auf Knopfdruck (js/part/distance.js), mit Fortschritt und
   Abbrechen. Die Skalengrenzen wirken sofort — sie färben nur um. Nur die
   SUCHGRENZE gehört zur Rechnung: weiter als bis dorthin wird nicht gesucht.

   Das Werkzeug hat ZWEI Bauteile und verzichtet deshalb auf das eine des
   Gastgebers (createHost({ part: false })): die beiden Quellen stehen im
   Modus „Dateien", ein abgelegtes Netz fragt, ob es A oder B sein soll.
   Die Modi: Dateien (beide Netze grau) · Abstand (Rechnung, Kennzahlen) ·
   Skala (Grenzen, Einfärben) — die Karte steht in Abstand und Skala.

   Grobe Netze werden vor der Messung verfeinert. Eine ebene Wand aus zwei
   Dreiecken hat vier Eckpunkte; zwischen ihnen würde linear interpoliert,
   und der wahre Abstandsverlauf ginge verloren. */

import * as T from 'three';
import { mountPartSource } from '../part/partsource.js';
import { buildModel } from '../part/model.js';
import { refine } from '../mesh.js';
import { buildLocator, distanceToMesh, distanceStats, insideFraction } from '../part/distance.js';
import { facts, segButtons, segButtonSet, slider, numberInput, colorbar, gradient } from '../ui/controls.js';
import { fmt, fmtPlain, fmtUnit, fmtFixed } from '../studio/format.js';
import { kpis } from '../studio/rows.js';
import * as C from '../part/colors.js';
import { MODES, DARSTELLUNG } from './panel.js';

export const FORMAT = 'dielogic-abstand';
export const FORMAT_VERSION = 1;

const RUN = 'Abstand berechnen';
const REACH = [0.01, 1e5];
/* Turbo, wie in der Wandstärkenanalyse: nah ist rot (kritisch), fern blau;
   benutzt wird das Stück von sattem Blau bis sattem Rot. */
const turbo = t => C.turbo(0.08 + 0.84 * Math.max(0, Math.min(1, t)));
const rgbOf = rgb => 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';

export function createAbstandTool(host) {
  const { shell, view } = host;
  const ui = host.ui;
  const side = () => ({ name: '', model: null, dist: null, stats: null, inside: 0 });

  const state = {
    a: side(), b: side(),
    reach: 50,
    scale: { min: 0, max: 20 },
    color: 'a', opacity: 1, showA: true, showB: true,
    analysed: false, stale: true, running: false, cancelled: false, ready: false,
    ms: 0
  };

  /* Zwei Netze mit Punktfarben. Ungefärbt bleibt eines schlicht grau —
     sonst konkurrieren zwei Farbskalen um dieselbe Aufmerksamkeit. */
  const group = new T.Group();
  view.scene.add(group);
  function makeMesh(plain) {
    const mat = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.6, metalness: 0.08, flatShading: true, side: T.DoubleSide });
    mat.userData.plain = plain;
    const m = new T.Mesh(new T.BufferGeometry(), mat);
    group.add(m);
    return m;
  }
  const meshA = makeMesh(0.78), meshB = makeMesh(0.62);
  const meshOf = key => (key === 'a' ? meshA : meshB);

  /* ── Dateien laden ───────────────────────────────────────── */
  const sources = {};
  function mountSource(key, startId) {
    sources[key] = mountPartSource({
      busy: shell.busyEl, viewport: null, suffix: '-' + key, filter: () => true, start: startId,
      onStart: name => { state.ready = false; state[key].name = name; },
      onLoad: model => {
        /* Fein genug für eine punktweise Karte — nicht feiner als nötig: der
           Abstand ändert sich über eine Fläche langsam, und jeder zusätzliche
           Punkt kostet eine vollständige Suche. Rund achtzig Schritte über die
           Diagonale reichen für ein Bild und bleiben in Sekunden rechenbar. */
        const fine = refine(model.tris, model.bounds.diag / 80, 150000);
        const s = state[key];
        s.model = fine.length !== model.tris.length ? buildModel(fine) : model;
        s.dist = null; s.stats = null; s.inside = 0;
        state.analysed = false; state.stale = true; state.cancelled = false;
        buildGeometry(key);
        fitBoth();
        applyColors();
        updateKpis();
        state.ready = !!(state.a.model && state.b.model);
        if (state.ready) host.settingsFor(state.a.name + ' | ' + state.b.name);
        host.refreshActions();
      }
    });
  }

  function buildGeometry(key) {
    const m = state[key].model;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(Float32Array.from(m.tris), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(m.tris.length), 3));
    g.computeVertexNormals();
    meshOf(key).geometry.dispose();
    meshOf(key).geometry = g;
  }

  function fitBoth() {
    const box = new T.Box3();
    for (const key of ['a', 'b']) if (state[key].model) box.expandByObject(meshOf(key));
    if (!box.isEmpty()) shell.fit(box);
  }

  /* Ein abgelegtes Netz: A oder B? */
  function dropPart(tris, name, note) {
    shell.banner({
      text: '„' + name + '" laden als …',
      actions: ['a', 'b'].map(key => ({
        label: 'Datei ' + key.toUpperCase(), primary: key === 'a',
        onClick: () => { document.getElementById('demo-select-' + key).selectedIndex = -1; sources[key].load(tris, name, note); }
      }))
    });
  }

  /* ── Rechnen auf Bestätigung ─────────────────────────────── */
  async function runDistance() {
    if (!state.a.model || !state.b.model || state.running) return;
    /* Wer bei den Dateien rechnet, will die Zahlen sehen. */
    const advance = shell.mode === 'dateien';
    state.running = true; state.cancelled = false; state.ready = false;
    host.refreshActions();
    const t0 = performance.now();
    const A = state.a.model, B = state.b.model, reach = state.reach;
    const result = await host.jobs.run({
      label: RUN, note: 'Abstand rechnen …',
      run: async (signal, progress) => {
        const out = {};
        const pairs = [['a', 'b'], ['b', 'a']];
        for (let i = 0; i < pairs.length; i++) {
          const [from, to] = pairs[i];
          const text = 'Abstand ' + from.toUpperCase() + ' → ' + to.toUpperCase();
          progress(i / 2, text + ' …');
          const loc = buildLocator(state[to].model.tris, { maxDist: reach });
          const dist = await distanceToMesh(state[from].model, loc, {
            maxDist: reach, signal,
            onProgress: p => progress((i + p) / 2, text + ' … ' + Math.round(p * 100) + ' %')
          });
          /* Der Abstand ist vorzeichenlos — deshalb wird der Anteil
             innenliegender Punkte mitgemessen (siehe Hilfe „Innen oder außen"). */
          out[from] = { dist, stats: distanceStats(state[from].model, dist), inside: insideFraction(state[from].model, loc) };
        }
        return out;
      },
      onCancel: () => { state.cancelled = true; }
    }).catch(err => {
      shell.toast('Der Abstand konnte nicht gerechnet werden: ' + err.message, { ms: 9000 });
      console.error(err);
      return null;
    });
    state.running = false;
    if (result && state.a.model === A && state.b.model === B) {
      for (const key of ['a', 'b']) Object.assign(state[key], result[key]);
      state.ms = performance.now() - t0;
      state.analysed = true;
      state.stale = false;
      /* Die Skala reicht nach jeder Rechnung von der kleinsten zur größten
         gemessenen Entfernung — eine Skala 0 bis 20 bei Messwerten von 8 bis
         45 zeigte die Hälfte des Bildes in einer Farbe. Von Hand lässt sie
         sich danach weiter einengen. */
      scaleFromStats();
      updateKpis();
    }
    state.ready = true;
    if (result && advance) shell.setMode('abstand');
    applyColors();
    host.refreshActions();
  }

  function markStale() {
    if (!state.a.model || !state.b.model) return;
    state.stale = true; state.cancelled = false;
    host.refreshActions();
  }

  /* Die Rechenzeit wächst steil mit der Suchgrenze (siehe Hilfe). Ab dieser
     Schwelle wird gewarnt, bevor gerechnet wird. */
  function reachWarning() {
    const a = state.a.model, b = state.b.model;
    if (!a || !b) return '';
    const diag = Math.max(a.bounds.diag, b.bounds.diag);
    if (!(state.reach > diag * 0.25)) return '';
    return ' Die Suchgrenze ist groß gegenüber den Teilen (' + fmtUnit(state.reach, 'mm') + ' zu ' + fmtUnit(diag, 'mm', 0)
      + ' Diagonale) — das kann lange dauern.';
  }

  function primary() {
    if (!state.a.model || !state.b.model) return { label: RUN, disabled: true, reason: 'Es fehlt noch eine Datei.' };
    if (!state.analysed) {
      return { label: RUN, onClick: runDistance, noteKind: state.cancelled || reachWarning() ? 'warn' : '',
        reason: (state.cancelled ? 'Abgebrochen — noch nichts gerechnet. ' : 'Noch nicht gerechnet — ')
          + fmt(state.a.model.vertexCount + state.b.model.vertexCount, 0) + ' Punkte gegen '
          + fmt(state.a.model.faceCount + state.b.model.faceCount, 0) + ' Dreiecke.' + reachWarning() };
    }
    if (state.stale) {
      return { label: 'Abstand neu berechnen', onClick: runDistance, noteKind: 'warn',
        reason: (state.cancelled ? 'Abgebrochen' : 'Datei oder Suchgrenze geändert') + ' — das Bild zeigt noch die vorige Rechnung.' + reachWarning() };
    }
    /* Aktuell: nichts zu tun, also kein Knopf. */
    return shell.mode === 'abstand' ? { hidden: true, noteKind: 'ok', reason: 'Der Abstand ist aktuell — die Grenzen der Farben stehen unter „Skala".' } : null;
  }

  /* ── Einfärben ───────────────────────────────────────────── */
  function applyColors() {
    const map = shell.mode !== 'dateien';              // bei den Dateien stehen beide Netze grau
    for (const key of ['a', 'b']) {
      const s = state[key], mesh = meshOf(key);
      mesh.visible = !!s.model && (key === 'a' ? state.showA : state.showB);
      if (!s.model) continue;
      const col = mesh.geometry.getAttribute('color');
      const arr = col.array;
      const wantColor = map && (state.color === 'both' || state.color === key);
      if (!wantColor || !s.dist) arr.fill(mesh.material.userData.plain);
      else {
        const { min, max } = state.scale;
        const { index, faceCount } = s.model;
        for (let f = 0; f < faceCount; f++) {
          for (let e = 0; e < 3; e++) {
            const v = s.dist[index[f * 3 + e]];
            const rgb = turbo(1 - (max > min ? (v - min) / (max - min) : 0));
            arr[f * 9 + e * 3] = rgb[0]; arr[f * 9 + e * 3 + 1] = rgb[1]; arr[f * 9 + e * 3 + 2] = rgb[2];
          }
        }
      }
      col.needsUpdate = true;
    }
    updateColorbar();
    view.invalidate();
  }

  function updateColorbar() {
    const anyColored = state.analysed && shell.mode !== 'dateien'
      && ((state.color !== 'b' && meshA.visible) || (state.color !== 'a' && meshB.visible));
    if (!anyColored) return colorbar(null);
    const { min, max } = state.scale;
    colorbar({
      title: 'Abstand A ↔ B',
      stops: gradient(t => rgbOf(turbo(1 - t))),
      ticks: [max, min + 0.75 * (max - min), min + 0.5 * (max - min), min + 0.25 * (max - min), min]
        .map((v, i) => (i === 0 ? '≥ ' : i === 4 ? '≤ ' : '') + fmtFixed(v, 1)),
      extra: 'mm · nah rot, fern blau'
    });
  }

  /* Die Kennzahlen: je Richtung kleinster … größter Abstand und das Mittel.
     Punkte INNERHALB des anderen Netzes sind eine Durchdringung — rot. */
  function updateKpis() {
    const rows = [];
    for (const key of ['a', 'b']) {
      const s = state[key];
      if (!s.stats) continue;
      const K = key.toUpperCase(), other = key === 'a' ? 'B' : 'A';
      const cap = s.stats.max >= state.reach - 1e-6;
      rows.push({ label: K + ' → ' + other, value: fmtFixed(s.stats.min, 1) + ' … ' + (cap ? '≥ ' : '') + fmtFixed(s.stats.max, 1) + ' mm' });
      rows.push({ label: 'Mittel ' + K, value: fmtFixed(s.stats.mean, 1) + ' mm' });
      if (s.inside > 0.001) rows.push({ label: 'Punkte ' + K + ' in ' + other, value: fmtFixed(100 * s.inside, 1) + ' %', verdict: 'bad' });
    }
    kpis(ui('dist-kpis'), rows);
    facts(ui('dist-facts'), rows.length ? [
      ['Punkte', fmt(state.a.model.vertexCount + state.b.model.vertexCount, 0)],
      ['Dreiecke', fmt(state.a.model.faceCount + state.b.model.faceCount, 0)],
      ['Rechenzeit', fmtUnit(state.ms, 'ms')]
    ] : []);
    const drin = ['a', 'b'].filter(k => state[k].inside > 0.001);
    ui('dist-warn').textContent = drin.length
      ? 'Achtung: ' + drin.map(k => fmtFixed(100 * state[k].inside, 1) + ' % der Punkte von ' + k.toUpperCase()).join(' und ')
        + ' liegen INNERHALB des anderen Netzes — die Teile durchdringen sich. Der gemessene Abstand ist dort kein Freiraum.'
      : '';
  }

  /** Grenzen aus den Messwerten beider Seiten: kleinster bis größter Abstand. */
  function scaleFromStats() {
    const all = ['a', 'b'].map(k => state[k].stats).filter(Boolean);
    if (!all.length) return false;
    const lo = Math.min(...all.map(s => s.min)), hi = Math.max(...all.map(s => s.max));
    state.scale.min = Math.floor(lo * 10) / 10;
    state.scale.max = Math.max(state.scale.min + 0.1, Math.ceil(hi * 10) / 10);
    ui('scale-min').value = fmtPlain(state.scale.min);
    ui('scale-max').value = fmtPlain(state.scale.max);
    return true;
  }

  /* ── Modi ────────────────────────────────────────────────── */
  const modes = MODES.map(m => ({ ...m }));
  for (const m of modes) { m.primary = primary; m.enter = () => applyColors(); m.leave = () => {}; }

  /* ── Verdrahtung ─────────────────────────────────────────── */
  let wired = false;
  const changed = label => { if (wired) host.changed(label); };
  const els = {};

  function mounted() {
    mountSource('a', 'oil_pan');
    mountSource('b', 'coolfix');
    host.dropPart = dropPart;

    numberInput(ui('reach'), v => { state.reach = v; markStale(); changed('Suchgrenze'); return v; }, { min: REACH[0], max: REACH[1], unit: 'mm' });
    /* Skalengrenzen färben nur um — sie rechnen nichts neu. */
    numberInput(ui('scale-min'), v => { state.scale.min = v; applyColors(); return v; });
    numberInput(ui('scale-max'), v => { state.scale.max = v; applyColors(); return v; });
    ui('scale-auto').addEventListener('click', () => {
      if (scaleFromStats()) applyColors();
      else shell.toast('Zuerst den Abstand berechnen — dann gibt es Messwerte.');
    });
    segButtons(ui('color-seg'), v => { state.color = v; applyColors(); changed('Einfärben'); });

    const pop = shell.darstellung(DARSTELLUNG);
    const q = name => pop.querySelector('[data-ui="' + name + '"]');
    els.showA = q('show-a'); els.showB = q('show-b'); els.opacity = q('opacity');
    els.showA.addEventListener('change', () => { state.showA = els.showA.checked; applyColors(); changed('Datei A zeigen'); });
    els.showB.addEventListener('change', () => { state.showB = els.showB.checked; applyColors(); changed('Datei B zeigen'); });
    slider(els.opacity, v => { setOpacity(v / 100); changed('Deckkraft'); }, v => v + ' %');
    wireHover();
    wired = true;
  }

  function setOpacity(o) {
    state.opacity = o;
    for (const mesh of [meshA, meshB]) {
      mesh.material.opacity = o;
      mesh.material.transparent = o < 0.999;
      mesh.material.depthWrite = o >= 0.999;
      mesh.material.needsUpdate = true;
    }
    view.invalidate();
  }

  /* Hover: gemessener Abstand am Dreieck unter dem Zeiger. Der Strahlentest
     läuft ohne Beschleunigungsstruktur über ZWEI Netze — deshalb wird nur die
     letzte Zeigerposition gemerkt und höchstens einmal je Bild ausgewertet. */
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
      if (!state.analysed) return clear();
      const r = canvas.getBoundingClientRect();
      const p = new T.Vector2(((at.x - r.left) / r.width) * 2 - 1, -((at.y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, view.camera);
      const hit = ray.intersectObjects([meshA, meshB].filter(m => m.visible), false)[0];
      if (!hit) return clear();
      const key = hit.object === meshA ? 'a' : 'b';
      const s = state[key];
      if (!s.dist) return clear();
      let d = 0;
      for (let e = 0; e < 3; e++) d += s.dist[s.model.index[hit.faceIndex * 3 + e]];
      d /= 3;
      shell.status('<b>Datei ' + key.toUpperCase() + '</b> · Abstand zur Gegenseite ' + (d >= state.reach - 1e-6 ? '≥ ' : '') + fmtUnit(d, 'mm'));
      shown = true;
    }
  }

  /* ── Einstellungen: merken, laden, zurücksetzen ──────────── */
  const toJSON = () => ({ format: FORMAT, version: FORMAT_VERSION, reach: state.reach, color: state.color, opacity: state.opacity, showA: state.showA, showB: state.showB });
  function fromJSON(obj) {
    if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Datei der Abstandsanalyse.');
    if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
    if (Number.isFinite(obj.reach)) {
      const r = Math.max(REACH[0], Math.min(REACH[1], obj.reach));
      if (Math.abs(r - state.reach) > 1e-9) { state.reach = r; markStale(); }
      ui('reach').value = fmtPlain(state.reach);
    }
    state.color = ['a', 'b', 'both'].includes(obj.color) ? obj.color : 'a';
    segButtonSet(ui('color-seg'), state.color);
    state.showA = obj.showA !== false; state.showB = obj.showB !== false;
    els.showA.checked = state.showA; els.showB.checked = state.showB;
    const o = Number.isFinite(obj.opacity) ? Math.max(0.15, Math.min(1, obj.opacity)) : 1;
    els.opacity.value = String(Math.round(o * 100));
    els.opacity.parentNode.querySelector('.val').textContent = els.opacity.value + ' %';
    setOpacity(o);
    applyColors();
    host.refreshActions();
  }
  const resetSettings = () => fromJSON({ format: FORMAT, version: FORMAT_VERSION, reach: 50, color: 'a', opacity: 1, showA: true, showB: true });

  /* B zuerst, damit A zuletzt einpasst und die Ansicht beide zeigt. */
  async function start() { await sources.b.start(); await sources.a.start(); }

  const tool = {
    id: 'abstand', modes, startMode: 'dateien', settingsOnly: true,
    mounted, start, toJSON, fromJSON, resetSettings, accepts: [FORMAT], exports: [],
    docName: () => (state.a.name || 'a') + '-' + (state.b.name || 'b'),
    state, group
  };
  tool.__viewer = { state, view, meshA, meshB, runDistance, applyColors, shell, host, tool };
  return tool;
}
