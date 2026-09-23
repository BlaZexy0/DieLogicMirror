/* Formaufbau-Viewer (form.html).

   Eine Form als bearbeitbare Baugruppe (js/assembly.js): voreingestellt
   kommt assets/die.glb, dazu lassen sich STL-Dateien in Gruppen laden,
   Teile umbenennen, verschieben, färben und entfernen, Gruppen anlegen —
   und das Ganze als eine GLB speichern und wieder laden. Die Seitenleiste
   (js/ui/assembly-sidebar.js) zeichnet die Gruppen, hier läuft die
   Verdrahtung: Dateien, Regler, Schnitt, Hover — und das HERVORHEBEN.

   Hervorheben ist der Heizkühlplan für die Halle: ein Tipp auf ein Teil
   (in der Leiste oder im Bild), auf eine Gruppe oder auf „Temperierung",
   und genau das bleibt deckend, alles andere wird blass — der Stahl unter
   seine Deckkraft, Gussteil und Anguss ebenso. Ein zweiter Tipp nimmt
   es wieder heraus, „Aufheben" räumt alles. Die Hervorhebung ist eine
   Sache der Ansicht, nicht der Baugruppe: sie steht nicht in der GLB.

   Die Zuordnung Modell ↔ Seitenleiste läuft über Knotennamen und
   userData (glTF-extras) — beides überlebt den GLB-Roundtrip. Der Viewer
   kennt die Geometrie NUR über die GLB; eine extern erzeugte Datei
   (CAD-Export) funktioniert, solange sie die Knoten „fixedRoot" und
   „movingRoot" mit Teil-Knoten darunter trägt (Namen, die die Registry
   nicht kennt, landen in „Sonstige Teile"). */

import * as T from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { initScene } from './scene.js';
import { initClipCaps } from './clipcaps.js';
import { createAssembly, SLIDE_DIRS } from './assembly.js';
import { MATERIAL_CLASSES } from './materials.js';
import { mountAssemblySidebar } from './ui/assembly-sidebar.js';
import { wireViewControls } from './ui/sidebar.js';
import { mountViewBar } from './ui/viewbar.js';
import { parseSTL } from './part/stlio.js';
import { isGLB } from './part/glbio.js';
import { fmt, parseNumber } from './studio/format.js';
import { onScheme } from './part/colors.js';

const $ = id => document.getElementById(id);

/* Handle für die Browser-Konsole UND für den Verdrahtungstest
   (tests/viewer.test.mjs). */
export const __viewer = { state: { ready: false }, lastExport: null };

const container = $('viewport');
const status = $('status');
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';
/* Die Statuszeile im Bild: der Hover schreibt hinein, welches Teil unter
   dem Zeiger liegt, sonst steht dort der Ruhetext — und der ist eine
   Fehlermeldung, solange eine ansteht. Früher überschrieb das erste
   Zucken der Maus die Meldung, bevor jemand sie gelesen hatte. */
let problem = '';
const resting = () => problem || IDLE;
/* Was sich als Form laden lässt, in einem Satz für die Meldungen. */
const LOADABLE = 'Laden lässt sich eine GLB, die der Formaufbau gespeichert hat, oder eine mit den Knoten „fixedRoot" und „movingRoot".';
status.textContent = 'Modell lädt …';

/* Blick von der festen Seite (−z): beim „Form öffnen" fährt die
   bewegliche Hälfte vom Betrachter weg und gibt die Kavität frei. */
const view = initScene(container, {
  cameraStart: [2000, 900, -1900], target: [0, 0, 20],
  minDistance: 250, maxDistance: 10000
});
mountViewBar(container, view);

let asm = null;
let clip = null;
let sidebar = null;
const ui = { opacity: $('opacity').value / 100, open: 0, clip: null, highlight: new Set() };

/* ── Darstellung ─────────────────────────────────────────────── */
/* Blass, aber noch da: so viel bleibt von einem nicht hervorgehobenen
   Teil — der Stahl fast weg, das Gegossene als Schemen, damit die Lage
   des Kreises im Teil lesbar bleibt. */
const GHOST = { steel: 0.06, other: 0.14 };

/* Deckkraft Stahl und Hervorhebung in einem Durchgang: ein Material je
   Teil (js/assembly.js sorgt dafür), also Deckkraft je Teil. Hervor-
   gehobene Teile leuchten leicht aus sich heraus, damit auch ein dunkler
   Kreis vor dem blassen Stahl steht. Das alles ändert nur das Bild: die
   GLB bekommt saubere Kopien der Materialien (js/assembly.js). */
function applyLook() {
  if (!asm) return;
  const hl = ui.highlight, any = hl.size > 0;
  for (const it of asm.items) {
    const on = hl.has(it.id);
    it.object.traverse(o => {
      if (!o.isMesh || o.userData.stencilTwin || !o.material) return;
      const m = o.material;
      const steel = m.name === 'steel';
      let a = steel ? ui.opacity : 1;
      if (any) a = on ? 1 : Math.min(a, steel ? GHOST.steel : GHOST.other);
      m.opacity = a;
      m.transparent = a < 0.999;
      m.depthWrite = a >= 0.999;   // vermeidet Sortier-Artefakte, solange es durchscheint
      if (m.emissive) {
        if (any && on) m.emissive.copy(m.color).multiplyScalar(0.22); else m.emissive.setHex(0);
      }
      m.needsUpdate = true;
    });
  }
  /* Die Schnittflächen der hervorgehobenen Teile bleiben kräftig. */
  if (clip) clip.setActive(any ? hl : null);
  view.invalidate();
}

function setSteelOpacity(o) {
  ui.opacity = o;
  applyLook();
}

/* ── Hervorheben ─────────────────────────────────────────────── */
const highlighted = id => ui.highlight.has(id);

/** Genau diese Teile hervorheben (leer = keins). */
function setHighlight(ids) {
  ui.highlight = new Set([...ids].filter(id => asm && asm.itemOf(id)));
  afterHighlight();
}

/** Teile umschalten: sind alle schon hervorgehoben, gehen sie heraus,
    sonst kommen sie dazu — so wirkt ein Tipp auf ein Teil, auf eine
    Gruppe und auf „Temperierung" gleich. */
function toggleHighlight(ids) {
  if (!asm) return;
  const list = [...ids].filter(id => asm.itemOf(id));
  if (!list.length) return;
  const all = list.every(id => ui.highlight.has(id));
  for (const id of list) { if (all) ui.highlight.delete(id); else ui.highlight.add(id); }
  afterHighlight();
}

function clearHighlight() {
  if (!ui.highlight.size) return;
  ui.highlight.clear();
  afterHighlight();
}

function afterHighlight() {
  applyLook();
  if (sidebar) sidebar.render();
  syncQuick();
}

/* Die Temperierung: alle Teile in Gruppen der Klassen coolFix/coolMov. */
function coolingIds() {
  if (!asm) return [];
  const cool = new Set(asm.groups.filter(g => g.mat === 'coolFix' || g.mat === 'coolMov').map(g => g.key));
  return asm.items.filter(i => cool.has(i.group)).map(i => i.id);
}

/* Die Schnellknöpfe über der Liste. */
function syncQuick() {
  const n = ui.highlight.size;
  const cool = coolingIds();
  $('hl-clear').disabled = !n;
  $('hl-clear').textContent = n ? 'Aufheben (' + n + ')' : 'Aufheben';
  $('hl-cooling').disabled = !cool.length;
  $('hl-cooling').classList.toggle('active', n > 0 && n === cool.length && cool.every(id => ui.highlight.has(id)));
}
$('hl-cooling').addEventListener('click', () => toggleHighlight(coolingIds()));
$('hl-clear').addEventListener('click', clearHighlight);
$('show-all').addEventListener('click', () => {
  if (!asm) return;
  for (const it of asm.items) asm.setVisible(it.id, true);
  ui.highlight.clear();
  afterHighlight();
  changed({ visibility: true });
});

/* Nach jeder Änderung an den Teilen: Schnitt-Zwillinge neu, Deckkraft
   Stahl auf neue Materialien, Öffnungsversatz nachziehen. Ein Farbwechsel
   färbt nur die Schnittflächen nach, ein Sichtbarkeitswechsel sagt dem
   Schnitt nur, was zu sehen ist. */
function changed(info = {}) {
  if (!asm) return;
  /* Ein entferntes Teil bleibt nicht hervorgehoben: sonst bliebe die ganze
     Form blass, und „Aufheben (1)" zählte ein Teil, das es nicht mehr gibt. */
  let pruned = false;
  for (const id of [...ui.highlight]) if (!asm.itemOf(id)) { ui.highlight.delete(id); pruned = true; }
  if (info.color) {
    clip.recolor();
    applyLook();
  } else if (!info.visibility) {
    asm.setOpen(ui.open);
    clip.refresh(asm.scene, asm.bounds());
    applyLook();
  } else {
    clip.update();
    if (pruned) applyLook();
  }
  syncQuick();
  note();
  view.invalidate();
}

function note(text) {
  if (text) { $('file-note').textContent = text; return; }
  if (asm) $('file-note').textContent = asm.items.length + ' Teile in ' + asm.groups.length + ' Gruppen';
}

/* ── Modell übernehmen ───────────────────────────────────────── */
/* fit: eine Datei von außen hat ihre eigene Größe und Lage — sie kommt ins
   Bild, und die Zoomgrenzen richten sich nach ihr (fest 250 mm bis 10 m
   passte nur zur Beispielform). Die Beispielform behält ihre Startansicht. */
function adopt(scene, sourceName, { fit = false } = {}) {
  let next;
  try {
    next = createAssembly(scene);
  } catch (err) {
    status.textContent = err.message + ' ' + LOADABLE;
    problem = status.textContent;
    $('file-warn').textContent = problem;
    console.error(err);
    return false;
  }
  if (asm) { view.scene.remove(asm.scene); asm.dispose(); }
  asm = next;
  ui.highlight.clear();                      // eine Hervorhebung gehört zum alten Modell
  view.scene.add(scene);
  if (!clip) clip = initClipCaps(view.scene, scene, asm.bounds()); else clip.refresh(scene, asm.bounds());
  if (ui.clip) clip.setClip(ui.clip);
  sidebar = mountAssemblySidebar($('components'), asm, {
    onChanged: changed, onAddFiles: pickFiles, targetSelect: $('stl-target'),
    onHighlight: toggleHighlight, highlighted
  });
  applyLook();
  syncQuick();
  asm.setOpen(ui.open);
  clip.update();
  if (fit) view.fitTo(scene);
  problem = '';
  $('file-warn').textContent = '';
  note();
  $('file-source').textContent = sourceName;
  Object.assign(__viewer, { dieScene: scene, movingRoot: asm.movingRoot, asm, clip, sidebar, setSteelOpacity, adopt });
  __viewer.state.ready = true;
  status.textContent = IDLE;
  view.invalidate();
  return true;
}

new GLTFLoader().load('assets/die.glb', gltf => adopt(gltf.scene, 'assets/die.glb'),
  undefined,
  err => {
    problem = 'Die Beispielform (assets/die.glb) ließ sich nicht laden. Eine eigene Form öffnet „GLB laden" in der Seitenleiste.';
    status.textContent = problem;
    console.error(err);
  });

/* Ein Wechsel des Farbschemas: die voreingestellten Farben der Teile folgen
   ihm (js/assembly.js, recolor), die gewählten bleiben. Danach die Leiste,
   die Schnittflächen und die Hervorhebung, die aus den Farben leuchtet. */
onScheme(() => {
  if (!asm) return;
  asm.recolor();
  if (sidebar) sidebar.render();
  if (clip) clip.recolor();
  applyLook();
});

/* ── Regler und Schnitt ──────────────────────────────────────── */
wireViewControls({
  onOpacity: setSteelOpacity,
  onOpen: t => { ui.open = t; if (asm) { asm.setOpen(t); clip.update(); view.invalidate(); } },
  onClip: s => { ui.clip = { ...s }; if (clip) { clip.setClip(s); view.invalidate(); } }
});

/* ── Dateien ─────────────────────────────────────────────────── */
function pickFiles(groupKey) {
  if (groupKey) $('stl-target').value = groupKey;
  $('stl-input').click();
}

/* Ein Lesefehler steht an der Datei-Leiste UND im Bild: wer eine Datei ins
   Bild gezogen hat, schaut dorthin. */
function fileFailed(name, err) {
  problem = 'Die Datei „' + name + '" konnte nicht gelesen werden: ' + err.message;
  $('file-warn').textContent = problem;
  status.textContent = problem;
}

function loadGLBBuffer(buf, name) {
  return new Promise((res, rej) => {
    new GLTFLoader().parse(buf, '', gltf => { res(adopt(gltf.scene, name, { fit: true })); },
      err => { fileFailed(name, err); rej(err); });
  });
}

/** STL-Dateien in die Zielgruppe; eine GLB darunter ersetzt die ganze Baugruppe. */
async function addFiles(files, groupKey = $('stl-target').value) {
  let added = 0;
  if (problem && asm) { problem = ''; $('file-warn').textContent = ''; status.textContent = IDLE; }
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      if (isGLB(buf)) { await loadGLBBuffer(buf, f.name); continue; }
      if (!asm) throw new Error('zuerst eine Form laden (GLB)');
      const tris = parseSTL(buf);
      if (!tris.length) throw new Error('keine Dreiecke');
      asm.addItem({ group: groupKey, label: f.name.replace(/\.stl$/i, ''), tris });
      added++;
    } catch (err) {
      fileFailed(f.name, err);
      console.error(err);
    }
  }
  if (added) { sidebar.render(); changed(); }
}

$('stl-btn').addEventListener('click', () => pickFiles());
$('stl-input').addEventListener('change', e => {
  const files = [...e.target.files];
  e.target.value = '';
  __viewer.pending = addFiles(files);
});
$('glb-btn').addEventListener('click', () => $('glb-input').click());
$('glb-input').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  /* Ein Lesefehler steht schon in der Leiste und im Bild (fileFailed). */
  if (f) __viewer.pending = f.arrayBuffer().then(buf => loadGLBBuffer(buf, f.name)).catch(err => { console.error(err); });
});

for (const ev of ['dragenter', 'dragover']) {
  container.addEventListener(ev, e => { e.preventDefault(); container.classList.add('dragover'); });
}
for (const ev of ['dragleave', 'drop']) {
  container.addEventListener(ev, e => { e.preventDefault(); container.classList.remove('dragover'); });
}
container.addEventListener('drop', e => {
  const files = e.dataTransfer ? [...e.dataTransfer.files] : [];
  if (files.length) __viewer.pending = addFiles(files);
});

/** Die ganze Baugruppe als binäres glTF, Metadaten als extras. */
async function saveGLB() {
  if (!asm) return null;
  const { GLTFExporter } = await import('../vendor/three/GLTFExporter.js');
  const root = asm.toExportRoot();
  const buf = await new Promise((res, rej) => new GLTFExporter().parse(root, res, rej, { binary: true }));
  __viewer.lastExport = buf;
  const name = (String($('glb-name').value || 'formaufbau').trim().replace(/\.glb$/i, '') || 'formaufbau') + '.glb';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
  a.download = name;
  a.click();
  if (URL.revokeObjectURL) setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  note('Gespeichert: ' + name + ' · ' + fmt(buf.byteLength / 1024, 0) + ' kB · '
    + asm.items.length + ' Teile in ' + asm.groups.length + ' Gruppen');
  return buf;
}
$('glb-save').addEventListener('click', () => { __viewer.pending = saveGLB(); });

/* ── Gruppe anlegen ──────────────────────────────────────────── */
$('group-mat').innerHTML = MATERIAL_CLASSES.map(m => '<option value="' + m.key + '">' + m.label + '</option>').join('');
$('group-slide').innerHTML = SLIDE_DIRS.map(d => '<option value="' + d.key + '">' + d.label + '</option>').join('');
/* Ein Fehler im Formular steht im Formular, nicht unten bei den Dateien. */
const groupWarn = text => { $('group-warn').textContent = text; };
const showGroupForm = on => {
  $('group-form').classList.toggle('hidden', !on);
  $('group-new').classList.toggle('hidden', on);
  groupWarn('');
};
$('group-new').addEventListener('click', () => { $('group-title').value = ''; showGroupForm(true); });
$('group-cancel').addEventListener('click', () => showGroupForm(false));
$('group-add').addEventListener('click', () => {
  if (!asm) return;
  if (!String($('group-title').value).trim()) { groupWarn('Die Gruppe braucht einen Namen.'); return; }
  const dir = SLIDE_DIRS.find(d => d.key === $('group-slide').value);
  const slides = !!(dir && dir.axis);
  /* Deutsch gelesen: „1.500" sind 1500 mm, „1,5" anderthalb. */
  const travel = parseNumber($('group-travel').value);
  if (slides && (travel === null || travel < 0)) { groupWarn('Der Schieberweg braucht eine Zahl in mm, 0 oder mehr.'); return; }
  const g = asm.addGroup({
    title: $('group-title').value, side: $('group-side').value, mat: $('group-mat').value,
    slide: slides ? { axis: dir.axis, sign: dir.sign, travel } : null
  });
  if (!g) { groupWarn('Die Gruppe braucht einen Namen.'); return; }
  showGroupForm(false);
  sidebar.render();
  changed({ visibility: true });
});

/* ── Hover und Tipp im Bild ──────────────────────────────────── */
const canvas = view.renderer.domElement;
const ray = new T.Raycaster();
const BOTH = new T.MeshBasicMaterial({ side: T.DoubleSide });
const nm = new T.Matrix3(), nw = new T.Vector3(), cross = new T.Vector3();

/* Alle Treffer entlang des Strahls, Vorder- UND Rückseiten, nach Abstand.
   Die Rückseiten braucht der Schnitt (unten): an ihnen sieht man, ob die
   Schnittebene gerade in einem Körper liegt. Dafür trägt jedes Mesh für
   die Dauer des Tests ein beidseitiges Material — gezeichnet wird damit
   nie. Die Stencil-Zwillinge des Schnitts (dieselbe Geometrie noch zweimal)
   bleiben draußen. */
function hitsAlong(objects) {
  const out = [];
  for (const root of objects) {
    root.traverseVisible(o => {
      if (!o.isMesh || o.userData.stencilTwin || !o.userData.compId) return;
      const m = o.material;
      o.material = BOTH;
      try { o.raycast(ray, out); } finally { o.material = m; }
    });
  }
  return out.sort((a, b) => a.distance - b.distance);
}
/* Zeigt die getroffene Fläche zur Kamera? */
function facing(h) {
  nm.getNormalMatrix(h.object.matrixWorld);
  return nw.copy(h.face.normal).applyMatrix3(nm).dot(ray.ray.direction) < 0;
}
/* Zu sehen ist eine Vorderseite — oder jede Seite, die ihr Material zeigt. */
function seen(h) {
  const side = h.object.material.side;
  return side === T.DoubleSide || (side === T.BackSide) !== facing(h);
}

/** Das Teil unter dem Zeiger (Teil-id) oder null. */
function pick(ev) {
  if (!asm) return null;
  const r = canvas.getBoundingClientRect();
  const p = new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  asm.scene.updateMatrixWorld();
  ray.setFromCamera(p, view.camera);
  const hits = hitsAlong(asm.items.filter(i => i.object.visible).map(i => i.object));
  /* Blasse Teile zählen nicht — sonst träfe der Tipp auf einen Kreis den
     Stahl davor. */
  const counts = h => !ui.highlight.size || ui.highlight.has(h.object.userData.compId);
  const idOf = h => (h ? h.object.userData.compId : null);
  const plane = clip && clip.activePlane();
  if (!plane) return idOf(hits.find(h => counts(h) && seen(h)));

  /* Mit Schnittebene: was im weggeschnittenen Halbraum liegt, ist nicht zu
     sehen — der Raycaster von Three.js kennt die Ebene nicht und träfe die
     Platte davor, der Tipp auf einen Kreis im Schnitt hob den Stahl hervor.
     Steht die Kamera auf der stehenden Seite, zählt die erste Fläche vor der
     Ebene. Sonst (der übliche Blick in den Schnitt) zeigt sich dort, wo der
     Strahl die Ebene durchstößt, die Schnittfläche des Körpers, in dem der
     Punkt liegt: dessen erster Treffer dahinter ist eine Rückseite. Liegt
     er in mehreren — ein Kreis steckt im Stahl —, liegt die Schnittfläche
     des Inhalts vorn, wie beim Zeichnen (js/clipcaps.js). Liegt er in
     keinem, zählt die erste Fläche dahinter. */
  if (plane.distanceToPoint(ray.ray.origin) >= 0) {
    return idOf(hits.find(h => plane.distanceToPoint(h.point) >= 0 && counts(h) && seen(h)));
  }
  if (!ray.ray.intersectPlane(plane, cross)) return null;
  const at = cross.distanceTo(ray.ray.origin);
  const behind = hits.filter(h => h.distance > at);
  const first = new Map();
  for (const h of behind) if (!first.has(h.object)) first.set(h.object, h);
  let inside = null;
  for (const h of first.values()) {
    if (!counts(h) || facing(h)) continue;
    if (!inside || (inside.object.material.name === 'steel' && h.object.material.name !== 'steel')) inside = h;
  }
  return idOf(inside || behind.find(h => counts(h) && seen(h)));
}

/* Hover: ein Treffertest geht über alle Dreiecke der Form (die Beispiel-
   form hat 153 000). Deshalb höchstens einer je Bild und keiner, solange
   eine Taste gedrückt ist — beim Drehen und Verschieben will niemand
   wissen, was gerade unter dem Zeiger vorbeizieht. */
let hoverAt = null;
canvas.addEventListener('pointermove', ev => {
  if (!asm || ev.buttons) { hoverAt = null; return; }
  const queued = hoverAt !== null;
  hoverAt = { clientX: ev.clientX, clientY: ev.clientY };
  if (queued) return;
  requestAnimationFrame(() => {
    const at = hoverAt;
    hoverAt = null;
    if (!at || !asm) return;
    const id = pick(at);
    status.textContent = id ? (asm.labelOf(id) || resting()) : resting();
  });
});
canvas.addEventListener('pointerleave', () => { hoverAt = null; status.textContent = resting(); });

/* Ein Tipp (kein Ziehen: kaum bewegt, kurz) hebt das Teil darunter
   hervor oder nimmt es heraus; ein Tipp ins Leere hebt alles auf. So
   lässt sich der Kreis direkt im Bild wählen — in der Halle am Tablet. */
let press = null;
canvas.addEventListener('pointerdown', ev => {
  press = ev.button === 0 || ev.button === undefined ? { x: ev.clientX, y: ev.clientY, t: performance.now() } : null;
});
canvas.addEventListener('pointerup', ev => {
  if (!press || !asm) return;
  const moved = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
  const dt = performance.now() - press.t;
  press = null;
  if (moved > 6 || dt > 700) return;
  const id = pick(ev);
  if (id) toggleHighlight([id]); else clearHighlight();
});

Object.assign(__viewer, { view, ui, setSteelOpacity, applyLook, setHighlight, toggleHighlight, clearHighlight, adopt, saveGLB, addFiles, pick });
window.__form3d = __viewer;
