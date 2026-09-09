/* Abstandsanalyse-Viewer (abstand.html).

   Zwei Dateien, ein Abstand. Für jeden Punkt der Oberfläche A wird der
   kürzeste Weg zur Oberfläche B gesucht (und umgekehrt), und beide Netze
   werden damit eingefärbt. Die Grenzen der Farbskala setzt der Nutzer —
   ohne das wäre die Karte nur schön: erst „interessant ist der Bereich
   zwischen 8 und 20 mm" macht daraus eine Aussage.

   Gerechnet wird auf Knopfdruck (js/part/distance.js), aus demselben
   Grund wie auf den anderen Bauteil-Seiten: bei großen Netzen dauert es.
   Die Skalengrenzen dagegen wirken sofort — sie färben nur um, sie
   rechnen nicht neu. Nur die SUCHGRENZE gehört zur Rechnung: weiter als
   bis dorthin wird nicht gesucht.

   Grobe Netze werden vor der Messung verfeinert. Eine ebene Wand aus
   zwei Dreiecken hat vier Eckpunkte; zwischen ihnen würde linear
   interpoliert, und der wahre Abstandsverlauf ginge verloren — genau auf
   so einer Wand liegt aber der interessante Fall. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountPartSource, frame } from './partsource.js';
import { buildModel } from './model.js';
import { refine } from '../mesh.js';
import { buildLocator, distanceToMesh, distanceStats, insideFraction } from './distance.js';
import {
  $, fmt, facts, segButtons, slider, numberInput, runControl, colorbar, gradient
} from '../ui/controls.js';
import * as C from './colors.js';

const container = $('viewport');
const status = $('status');
const busy = $('busy');
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';

const view = initScene(container, {
  cameraStart: [320, 240, 320], target: [0, 0, 0],
  minDistance: 5, maxDistance: 20000
});
mountViewBar(container, view);

/* ── Zustand ─────────────────────────────────────────────────── */
const side = () => ({ name: '', model: null, dist: null, stats: null });
/* Marke für den Abbruch — kein Fehler, sondern eine Entscheidung. */
const CANCELLED = '__abgebrochen__';

const state = {
  a: side(), b: side(),
  reach: 50,
  scale: { min: 0, max: 20 },
  color: 'a',
  opacity: 1,
  analysed: false, stale: true, running: false, ready: false, cancel: false,
  ms: 0
};

const group = new T.Group();
view.scene.add(group);

/* Zwei Netze mit Punktfarben. Ungefärbt bleibt eines schlicht grau —
   sonst konkurrieren zwei Farbskalen um dieselbe Aufmerksamkeit. */
function makeMesh(plain) {
  const mat = new T.MeshStandardMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.6, metalness: 0.08,
    flatShading: true, side: T.DoubleSide
  });
  mat.userData.plain = plain;
  const m = new T.Mesh(new T.BufferGeometry(), mat);
  group.add(m);
  return m;
}
const meshA = makeMesh(0.78);
const meshB = makeMesh(0.62);

/* ── Bauteile laden ──────────────────────────────────────────── */
function mount(key, suffix, startId) {
  return mountPartSource({
    busy, viewport: key === 'a' ? container : null, suffix,
    filter: () => true, start: startId,
    onStart: name => { state.ready = false; state[key].name = name; },
    onLoad: model => {
      /* Fein genug für eine punktweise Karte — sonst hat die Einfärbung
         auf großen ebenen Flächen nichts zu interpolieren. Nicht feiner
         als nötig: der Abstand ändert sich über eine Fläche langsam, und
         jeder zusätzliche Punkt kostet eine vollständige Suche. Rund
         achtzig Schritte über die Diagonale reichen für ein Bild und
         bleiben in Sekunden rechenbar. */
      const fine = refine(model.tris, model.bounds.diag / 80, 150000);
      state[key].model = fine.length !== model.tris.length ? buildModel(fine) : model;
      state[key].dist = null;
      state[key].stats = null;
      state.analysed = false;
      state.stale = true;
      buildGeometry(key);
      fitBoth();
      showMeshFacts(key, model, state[key].model);
      applyColors();
      updateRunButton();
      updateFacts();
      state.ready = true;
    }
  });
}
const sourceA = mount('a', '-a', 'oil_pan');
const sourceB = mount('b', '-b', 'coolmov');

function buildGeometry(key) {
  const m = state[key].model;
  const mesh = key === 'a' ? meshA : meshB;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(Float32Array.from(m.tris), 3));
  g.setAttribute('color', new T.BufferAttribute(new Float32Array(m.tris.length), 3));
  g.computeVertexNormals();
  mesh.geometry.dispose();
  mesh.geometry = g;
}

function fitBoth() {
  const box = new T.Box3();
  for (const [key, mesh] of [['a', meshA], ['b', meshB]]) {
    if (state[key].model) box.expandByObject(mesh);
  }
  if (!box.isEmpty()) view.fitTo(box);
}

function showMeshFacts(key, raw, used) {
  const s = used.bounds.size;
  facts('model-facts' + '-' + key, [
    ['Dreiecke', fmt(used.faceCount, 0)
      + (used.faceCount !== raw.faceCount ? ' (verfeinert aus ' + fmt(raw.faceCount, 0) + ')' : '')],
    ['Abmessungen', s.map(v => fmt(v)).join(' × ') + ' mm'],
    ['Oberfläche', fmt(used.surface / 100) + ' cm²']
  ]);
}

/* ── Rechnen auf Bestätigung ─────────────────────────────────── */
async function runDistance() {
  if (!state.a.model || !state.b.model || state.running) return;
  state.running = true;
  state.cancel = false;
  state.ready = false;
  updateRunButton();
  const t0 = performance.now();
  try {
    busy.classList.add('on');
    await frame();
    const jobs = [['a', 'b'], ['b', 'a']];
    for (const [from, to] of jobs) {
      busy.textContent = 'Abstand ' + from.toUpperCase() + ' → ' + to.toUpperCase() + ' …';
      await frame();
      const loc = buildLocator(state[to].model.tris, { maxDist: state.reach });
      state[from].dist = await distanceToMesh(state[from].model, loc, {
        maxDist: state.reach,
        onProgress: p => {
          /* Der einzige Punkt, an dem die Rechnung die Kontrolle abgibt —
             also auch der einzige, an dem sie sich abbrechen lässt. Ohne
             das lief eine zu groß gewählte Suchgrenze minutenlang durch,
             ohne Ausweg. */
          if (state.cancel) throw new Error(CANCELLED);
          busy.textContent = 'Abstand ' + from.toUpperCase() + ' → ' + to.toUpperCase()
            + ' … ' + Math.round(p * 100) + ' %';
        }
      });
      state[from].stats = distanceStats(state[from].model, state[from].dist);
      /* Der Abstand ist vorzeichenlos: ein Kanal 5 mm UNTER der Oberfläche
         und einer 5 mm INNEN im Bauteil liefern denselben Wert. Für eine
         Abstandsanalyse Gussteil ↔ Temperierung ist das die gefährliche
         Verwechslung — deshalb wird der Anteil innenliegender Punkte
         mitgemessen und gemeldet. */
      state[from].inside = insideFraction(state[from].model, loc);
    }
    state.ms = performance.now() - t0;
    state.analysed = true;
    state.stale = false;
    /* Die Skala reicht nach jeder Rechnung von der kleinsten zur größten
       gemessenen Entfernung — eine Skala 0 bis 20 bei Messwerten von 8
       bis 45 zeigte die Hälfte des Bildes in einer Farbe. Von Hand
       lässt sie sich danach weiter einengen. */
    scaleFromStats();
    applyColors();
    updateFacts();
  } catch (err) {
    if (err.message === CANCELLED) {
      $('model-warn-a').textContent = 'Abstandsrechnung abgebrochen — das Bild zeigt noch die vorige Rechnung.';
      state.stale = true;
    } else {
      $('model-warn-a').textContent = 'Der Abstand konnte nicht gerechnet werden: ' + err.message;
      console.error(err);
    }
  } finally {
    busy.classList.remove('on');
    state.running = false;
    state.cancel = false;
    state.ready = true;
    updateRunButton();
  }
}

function markStale() {
  if (!state.a.model || !state.b.model) return;
  state.stale = true;
  updateRunButton();
}

const setRun = runControl('run-distance', 'distance-state');

/* Die Rechenzeit wächst steil mit der Suchgrenze: sie legt fest, wie weit
   die Suche für jeden Punkt mindestens absuchen muss, bevor sie „nichts in
   Reichweite" sagen darf. Gemessen an 235k Dreiecken: 20 mm → 90 ms,
   300 mm → 50 s. Ab dieser Schwelle wird gewarnt, bevor gerechnet wird. */
function reachWarning() {
  const a = state.a.model, b = state.b.model;
  if (!a || !b) return '';
  const diag = Math.max(a.bounds.diag, b.bounds.diag);
  if (!(state.reach > diag * 0.25)) return '';
  return ' Die Suchgrenze ist groß gegenüber den Teilen (' + fmt(state.reach)
    + ' mm zu ' + fmt(diag) + ' mm Diagonale) — das kann lange dauern.';
}

function updateRunButton() {
  if (state.running) return setRun({ label: 'Abbrechen', warn: true, note: 'Rechnet … Abbrechen bricht ab und behält das vorige Bild.' });
  if (!state.a.model || !state.b.model) {
    return setRun({ label: 'Abstand berechnen', disabled: true, note: 'Es fehlt noch eine Datei.' });
  }
  if (!state.analysed) {
    return setRun({ label: 'Abstand berechnen', warn: !!reachWarning(),
      note: 'Noch nicht gerechnet — ' + fmt(state.a.model.vertexCount + state.b.model.vertexCount, 0)
        + ' Punkte gegen ' + fmt(state.a.model.faceCount + state.b.model.faceCount, 0) + ' Dreiecke.'
        + reachWarning() });
  }
  if (state.stale) {
    return setRun({ label: 'Abstand neu berechnen', warn: true,
      note: 'Datei oder Suchgrenze geändert — das Bild zeigt noch die vorige Rechnung.' + reachWarning() });
  }
  setRun({ label: 'Abstand ist aktuell', outline: true, disabled: true });
}

/* ── Einfärben ───────────────────────────────────────────────── */
function applyColors() {
  for (const [key, mesh] of [['a', meshA], ['b', meshB]]) {
    const s = state[key];
    mesh.visible = !!s.model && $('show-' + key).checked;
    if (!s.model) continue;
    const col = mesh.geometry.getAttribute('color');
    const arr = col.array;
    const wantColor = state.color === 'both' || state.color === key;
    const plain = mesh.material.userData.plain;

    if (!wantColor || !s.dist) {
      arr.fill(plain);
    } else {
      const { min, max } = state.scale;
      const { index, faceCount } = s.model;
      for (let f = 0; f < faceCount; f++) {
        for (let e = 0; e < 3; e++) {
          const rgb = distRgb(s.dist[index[f * 3 + e]], min, max);
          arr[f * 9 + e * 3] = rgb[0];
          arr[f * 9 + e * 3 + 1] = rgb[1];
          arr[f * 9 + e * 3 + 2] = rgb[2];
        }
      }
    }
    col.needsUpdate = true;
  }
  updateColorbar();
}

/* Turbo, wie in der Wandstärkenanalyse: nah ist rot (kritisch), fern
   blau; benutzt wird das Stück von sattem Blau bis sattem Rot, die
   dunklen Enden bleiben weg. */
const turbo = t => C.turbo(0.08 + 0.84 * Math.max(0, Math.min(1, t)));
function distRgb(v, min, max) {
  const u = max > min ? (v - min) / (max - min) : 0;
  return turbo(1 - u);
}

function updateColorbar() {
  const anyColored = state.analysed
    && ((state.color !== 'b' && meshA.visible) || (state.color !== 'a' && meshB.visible));
  if (!anyColored) return colorbar(null);
  const { min, max } = state.scale;
  colorbar({
    title: 'Abstand A ↔ B',
    stops: gradient(t => rgbOf(turbo(1 - t))),
    ticks: [max, min + 0.75 * (max - min), min + 0.5 * (max - min), min + 0.25 * (max - min), min]
      .map((v, i) => (i === 0 ? '≥ ' : i === 4 ? '≤ ' : '') + fmt(v)),
    extra: 'mm · nah rot, fern blau'
  });
}
const rgbOf = rgb => 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';

function updateFacts() {
  const rows = [];
  for (const key of ['a', 'b']) {
    const s = state[key];
    if (!s.stats) continue;
    const cap = s.stats.max >= state.reach - 1e-6;
    rows.push([key.toUpperCase() + ' → ' + (key === 'a' ? 'B' : 'A'),
      fmt(s.stats.min) + ' … ' + (cap ? '≥ ' : '') + fmt(s.stats.max) + ' mm']);
    rows.push(['Mittel ' + key.toUpperCase() + ' (flächengewichtet)', fmt(s.stats.mean) + ' mm']);
    if (s.inside > 0.001) {
      rows.push(['Punkte ' + key.toUpperCase() + ' im anderen Netz', fmt(100 * s.inside, 1) + ' %']);
    }
  }
  if (rows.length) rows.push(['Rechenzeit', state.ms.toFixed(0) + ' ms']);
  facts('distance-facts', rows);

  /* Der gemessene Abstand sagt nichts darüber, auf WELCHER Seite der Fläche
     ein Punkt liegt. Überlappen sich die Netze, ist der Abstand dort kein
     Freiraum, sondern eine Durchdringung. */
  const drin = ['a', 'b'].filter(k => state[k].inside > 0.001);
  $('model-warn-a').textContent = drin.length
    ? 'Achtung: ' + drin.map(k => fmt(100 * state[k].inside, 1) + ' % der Punkte von '
      + k.toUpperCase()).join(' und ')
      + ' liegen INNERHALB des anderen Netzes — die Teile durchdringen sich. '
      + 'Der gemessene Abstand ist dort kein Freiraum.'
    : '';
}

/* ── Bedienung ───────────────────────────────────────────────── */
numberInput('reach', v => {
  state.reach = Math.max(0.01, Math.min(1e5, v));
  markStale();
  return state.reach;
});
$('run-distance').addEventListener('click', () => {
  if (state.running) { state.cancel = true; return; }
  runDistance();
});

/* Skalengrenzen färben nur um — sie rechnen nichts neu. */
numberInput('scale-min', v => { state.scale.min = v; applyColors(); return v; });
numberInput('scale-max', v => { state.scale.max = v; applyColors(); return v; });

/** Grenzen aus den Messwerten beider Seiten: kleinster bis größter Abstand. */
function scaleFromStats() {
  const all = ['a', 'b'].map(k => state[k].stats).filter(Boolean);
  if (!all.length) return false;
  const lo = Math.min(...all.map(s => s.min));
  const hi = Math.max(...all.map(s => s.max));
  state.scale.min = Math.floor(lo * 10) / 10;
  state.scale.max = Math.max(state.scale.min + 0.1, Math.ceil(hi * 10) / 10);
  $('scale-min').value = fmt(state.scale.min);
  $('scale-max').value = fmt(state.scale.max);
  return true;
}
$('scale-auto').addEventListener('click', () => { if (scaleFromStats()) applyColors(); });

segButtons('color-seg', v => { state.color = v; applyColors(); });
for (const key of ['a', 'b']) {
  $('show-' + key).addEventListener('change', () => applyColors());
}
slider('opacity', v => {
  state.opacity = v / 100;
  for (const mesh of [meshA, meshB]) {
    mesh.material.opacity = state.opacity;
    mesh.material.transparent = state.opacity < 0.999;
    mesh.material.depthWrite = state.opacity >= 0.999;
    mesh.material.needsUpdate = true;
  }
}, v => v + ' %');

/* Hover: gemessener Abstand am Dreieck unter der Maus.

   Wie auf der Bauteilseite läuft der Strahlentest ohne Beschleunigungs-
   struktur über die ganzen Netze — hier sogar über ZWEI. Deshalb wird nur
   die letzte Zeigerposition gemerkt und höchstens einmal je Bild
   ausgewertet. */
const ray = new T.Raycaster();
status.textContent = IDLE;
let hoverAt = null, hoverQueued = false;

view.renderer.domElement.addEventListener('pointermove', ev => {
  hoverAt = { x: ev.clientX, y: ev.clientY };
  if (hoverQueued) return;
  hoverQueued = true;
  requestAnimationFrame(() => { hoverQueued = false; if (hoverAt) evalHover(hoverAt); });
});

function evalHover(at) {
  if (!state.analysed) { status.textContent = IDLE; return; }
  const r = view.renderer.domElement.getBoundingClientRect();
  const p = new T.Vector2(((at.x - r.left) / r.width) * 2 - 1, -((at.y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(p, view.camera);
  const hit = ray.intersectObjects([meshA, meshB].filter(m => m.visible), false)[0];
  if (!hit) { status.textContent = IDLE; return; }
  const key = hit.object === meshA ? 'a' : 'b';
  const s = state[key];
  if (!s.dist) { status.textContent = IDLE; return; }
  let d = 0;
  for (let e = 0; e < 3; e++) d += s.dist[s.model.index[hit.faceIndex * 3 + e]];
  d /= 3;
  status.textContent = 'Datei ' + key.toUpperCase() + ' · Abstand zur Gegenseite '
    + (d >= state.reach - 1e-6 ? '≥ ' : '') + fmt(d) + ' mm';
}
view.renderer.domElement.addEventListener('pointerleave', () => {
  hoverAt = null;
  status.textContent = IDLE;
});

export const __viewer = { state, view, meshA, meshB, runDistance, applyColors };
window.__form3d = __viewer;

/* B zuerst, damit A zuletzt einpasst und die Ansicht beide zeigt. */
await sourceB.start();
await sourceA.start();
