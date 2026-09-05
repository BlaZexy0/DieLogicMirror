/* Formaufbau-Viewer (form.html).

   Eine Form als bearbeitbare Baugruppe (js/assembly.js): voreingestellt
   kommt assets/die.glb, dazu lassen sich STL-Dateien in Gruppen laden,
   Teile umbenennen, verschieben und entfernen, Gruppen anlegen — und das
   Ganze als eine GLB speichern und wieder laden. Die Seitenleiste
   (js/ui/assembly-sidebar.js) zeichnet die Gruppen, hier läuft die
   Verdrahtung: Dateien, Regler, Schnitt, Hover.

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
import { mountNav } from './ui/nav.js';
import { parseSTL } from './part/stlio.js';
import { isGLB } from './part/glbio.js';

mountNav('form.html');

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
const ui = { opacity: $('opacity').value / 100, open: 0, clip: null };

/* ── Darstellung ─────────────────────────────────────────────── */
function setSteelOpacity(o) {
  ui.opacity = o;
  if (!asm) return;
  const mats = new Set();
  asm.scene.traverse(x => { if (x.isMesh && x.material && x.material.name === 'steel') mats.add(x.material); });
  for (const m of mats) {
    m.opacity = o;
    m.transparent = o < 0.999;
    m.depthWrite = o >= 0.999;   // vermeidet Sortier-Artefakte bei Transparenz
    m.needsUpdate = true;
  }
  view.invalidate();
}

/* Nach jeder Änderung an den Teilen: Schnitt-Zwillinge neu, Stahl-
   Transparenz auf neue Materialien, Öffnungsversatz nachziehen. Reine
   Sichtbarkeitswechsel brauchen davon nichts. */
function changed(info = {}) {
  if (!asm) return;
  if (!info.visibility) {
    clip.refresh(asm.scene);
    setSteelOpacity(ui.opacity);
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
  view.scene.add(scene);
  if (!clip) clip = initClipCaps(view.scene, scene); else clip.refresh(scene);
  if (ui.clip) clip.setClip(ui.clip);
  sidebar = mountAssemblySidebar($('components'), asm, { onChanged: changed, onAddFiles: pickFiles, targetSelect: $('stl-target') });
  setSteelOpacity(ui.opacity);
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
    status.textContent = 'assets/die.glb fehlt oder ist defekt — neu erzeugen: in openscad_parts ./render_die.sh --studio';
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

/* ── Hover: Teil unter der Maus in der Statusleiste nennen ────── */
const ray = new T.Raycaster();
view.renderer.domElement.addEventListener('pointermove', ev => {
  if (!asm) return;
  const r = view.renderer.domElement.getBoundingClientRect();
  const p = new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(p, view.camera);
  const hits = ray.intersectObjects(asm.items.filter(i => i.object.visible).map(i => i.object), true);
  /* Die unsichtbaren Stencil-Zwillinge tragen kein compId und fallen durch. */
  const hit = hits.find(h => h.object.userData.compId && !h.object.userData.stencilTwin);
  status.textContent = hit ? (asm.labelOf(hit.object.userData.compId) || IDLE) : IDLE;
});
view.renderer.domElement.addEventListener('pointerleave', () => { status.textContent = IDLE; });

Object.assign(__viewer, { view, setSteelOpacity, adopt, saveGLB, addFiles });
window.__form3d = __viewer;
