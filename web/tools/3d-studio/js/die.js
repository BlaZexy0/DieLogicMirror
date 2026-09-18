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
   seine Transparenz, Gussteil und Anguss ebenso. Ein zweiter Tipp nimmt
   es wieder heraus, „Aufheben" räumt alles. Die Hervorhebung ist eine
   Sache der Ansicht, nicht der Baugruppe: sie steht nicht in der GLB.

   Die Zuordnung Modell ↔ Seitenleiste läuft über Knotennamen und
   userData (glTF-extras) — beides überlebt den GLB-Roundtrip. Der Viewer
   kennt die Geometrie NUR über die GLB; eine extern erzeugte Datei
   (CAD-Export) funktioniert, solange sie die Knoten „die", „fixedRoot"
   und „movingRoot" mit benannten Teil-Knoten darunter trägt. */

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

const $ = id => document.getElementById(id);

/* Handle für die Browser-Konsole UND für den Verdrahtungstest
   (tests/viewer.test.mjs). */
export const __viewer = { state: { ready: false }, lastExport: null };

const container = $('viewport');
const status = $('status');
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';
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

/* Stahl-Transparenz und Hervorhebung in einem Durchgang: ein Material je
   Teil (js/assembly.js sorgt dafür), also Deckkraft je Teil. Hervor-
   gehobene Teile leuchten leicht aus sich heraus, damit auch ein dunkler
   Kreis vor dem blassen Stahl steht. */
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
      m.depthWrite = a >= 0.999;   // vermeidet Sortier-Artefakte bei Transparenz
      if (m.emissive) {
        if (any && on) m.emissive.copy(m.color).multiplyScalar(0.22); else m.emissive.setHex(0);
      }
      m.needsUpdate = true;
    });
  }
  if (clip) clip.setClassAlpha(any ? activeClasses() : null);
  view.invalidate();
}

function setSteelOpacity(o) {
  ui.opacity = o;
  applyLook();
}

/* Die Werkstoffklassen der hervorgehobenen Teile — deren Schnittflächen
   bleiben kräftig. */
function activeClasses() {
  const out = new Set();
  for (const id of ui.highlight) {
    const it = asm.itemOf(id);
    if (it) it.object.traverse(o => { if (o.isMesh && o.material && !o.userData.stencilTwin) out.add(o.material.name || 'steel'); });
  }
  return out;
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
});

/* Nach jeder Änderung an den Teilen: Schnitt-Zwillinge neu, Stahl-
   Transparenz auf neue Materialien, Öffnungsversatz nachziehen. Reine
   Sichtbarkeitswechsel brauchen davon nichts. */
function changed(info = {}) {
  if (!asm) return;
  if (!info.visibility) {
    clip.refresh(asm.scene);
    applyLook();
    asm.setOpen(ui.open);
  }
  note();
  view.invalidate();
}

function note(text) {
  if (text) { $('file-note').textContent = text; return; }
  if (asm) $('file-note').textContent = asm.items.length + ' Teile in ' + asm.groups.length + ' Gruppen';
}

/* ── Modell übernehmen ───────────────────────────────────────── */
function adopt(scene, sourceName) {
  let next;
  try {
    next = createAssembly(scene);
  } catch (err) {
    status.textContent = err.message + ' Datei neu erzeugen: in openscad_parts ./render_die.sh --studio';
    $('file-warn').textContent = err.message;
    console.error(err);
    return false;
  }
  if (asm) { view.scene.remove(asm.scene); asm.dispose(); }
  asm = next;
  ui.highlight.clear();                      // eine Hervorhebung gehört zum alten Modell
  view.scene.add(scene);
  if (!clip) clip = initClipCaps(view.scene, scene); else clip.refresh(scene);
  if (ui.clip) clip.setClip(ui.clip);
  sidebar = mountAssemblySidebar($('components'), asm, {
    onChanged: changed, onAddFiles: pickFiles, targetSelect: $('stl-target'),
    onHighlight: toggleHighlight, highlighted
  });
  applyLook();
  syncQuick();
  asm.setOpen(ui.open);
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
    status.textContent = 'assets/die.glb fehlt oder ist defekt. Neu erzeugen: in openscad_parts ./render_die.sh --studio';
    console.error(err);
  });

/* ── Regler und Schnitt ──────────────────────────────────────── */
wireViewControls({
  onOpacity: setSteelOpacity,
  onOpen: t => { ui.open = t; if (asm) { asm.setOpen(t); view.invalidate(); } },
  onClip: s => { ui.clip = { ...s }; if (clip) { clip.setClip(s); view.invalidate(); } }
});

/* ── Dateien ─────────────────────────────────────────────────── */
function pickFiles(groupKey) {
  if (groupKey) $('stl-target').value = groupKey;
  $('stl-input').click();
}

function loadGLBBuffer(buf, name) {
  return new Promise((res, rej) => {
    new GLTFLoader().parse(buf, '', gltf => { res(adopt(gltf.scene, name)); },
      err => { $('file-warn').textContent = 'Die Datei „' + name + '" konnte nicht gelesen werden: ' + err.message; rej(err); });
  });
}

/** STL-Dateien in die Zielgruppe; eine GLB darunter ersetzt die ganze Baugruppe. */
async function addFiles(files, groupKey = $('stl-target').value) {
  if (!asm) return;
  let added = 0;
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      if (isGLB(buf)) { await loadGLBBuffer(buf, f.name); continue; }
      const tris = parseSTL(buf);
      if (!tris.length) throw new Error('keine Dreiecke');
      asm.addItem({ group: groupKey, label: f.name.replace(/\.stl$/i, ''), tris });
      added++;
    } catch (err) {
      $('file-warn').textContent = 'Die Datei „' + f.name + '" konnte nicht gelesen werden: ' + err.message;
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
  if (f) __viewer.pending = f.arrayBuffer().then(buf => loadGLBBuffer(buf, f.name));
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
  note('Gespeichert: ' + name + ' · ' + (buf.byteLength / 1024).toFixed(0) + ' kB · '
    + asm.items.length + ' Teile in ' + asm.groups.length + ' Gruppen');
  return buf;
}
$('glb-save').addEventListener('click', () => { __viewer.pending = saveGLB(); });

/* ── Gruppe anlegen ──────────────────────────────────────────── */
$('group-mat').innerHTML = MATERIAL_CLASSES.map(m => '<option value="' + m.key + '">' + m.label + '</option>').join('');
$('group-slide').innerHTML = SLIDE_DIRS.map(d => '<option value="' + d.key + '">' + d.label + '</option>').join('');
const showGroupForm = on => { $('group-form').classList.toggle('hidden', !on); $('group-new').classList.toggle('hidden', on); };
$('group-new').addEventListener('click', () => { $('group-title').value = ''; showGroupForm(true); });
$('group-cancel').addEventListener('click', () => showGroupForm(false));
$('group-add').addEventListener('click', () => {
  if (!asm) return;
  const dir = SLIDE_DIRS.find(d => d.key === $('group-slide').value);
  const travel = parseFloat(String($('group-travel').value).replace(',', '.'));
  const g = asm.addGroup({
    title: $('group-title').value, side: $('group-side').value, mat: $('group-mat').value,
    slide: dir && dir.axis ? { axis: dir.axis, sign: dir.sign, travel: Number.isFinite(travel) ? travel : 0 } : null
  });
  if (!g) { $('file-warn').textContent = 'Die Gruppe braucht einen Namen.'; return; }
  $('file-warn').textContent = '';
  showGroupForm(false);
  sidebar.render();
  changed({ visibility: true });
});

/* ── Hover und Tipp im Bild ──────────────────────────────────── */
const ray = new T.Raycaster();
/** Das Teil unter dem Zeiger (Teil-id) oder null. */
function pick(ev) {
  if (!asm) return null;
  const r = view.renderer.domElement.getBoundingClientRect();
  const p = new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(p, view.camera);
  const hits = ray.intersectObjects(asm.items.filter(i => i.object.visible).map(i => i.object), true);
  /* Die unsichtbaren Stencil-Zwillinge tragen kein compId und fallen durch.
     Blasse Teile zählen nicht — sonst träfe der Tipp auf einen Kreis den
     Stahl davor. */
  const hit = hits.find(h => h.object.userData.compId && !h.object.userData.stencilTwin
    && (!ui.highlight.size || ui.highlight.has(h.object.userData.compId)));
  return hit ? hit.object.userData.compId : null;
}
view.renderer.domElement.addEventListener('pointermove', ev => {
  if (!asm) return;
  const id = pick(ev);
  status.textContent = id ? (asm.labelOf(id) || IDLE) : IDLE;
});
view.renderer.domElement.addEventListener('pointerleave', () => { status.textContent = IDLE; });

/* Ein Tipp (kein Ziehen: kaum bewegt, kurz) hebt das Teil darunter
   hervor oder nimmt es heraus; ein Tipp ins Leere hebt alles auf. So
   lässt sich der Kreis direkt im Bild wählen — in der Halle am Tablet. */
let press = null;
view.renderer.domElement.addEventListener('pointerdown', ev => {
  press = ev.button === 0 || ev.button === undefined ? { x: ev.clientX, y: ev.clientY, t: performance.now() } : null;
});
view.renderer.domElement.addEventListener('pointerup', ev => {
  if (!press || !asm) return;
  const moved = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
  const dt = performance.now() - press.t;
  press = null;
  if (moved > 6 || dt > 700) return;
  const id = pick(ev);
  if (id) toggleHighlight([id]); else clearHighlight();
});

Object.assign(__viewer, { view, ui, setSteelOpacity, applyLook, setHighlight, toggleHighlight, clearHighlight, adopt, saveGLB, addFiles });
window.__form3d = __viewer;
