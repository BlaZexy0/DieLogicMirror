/* Formaufbau-Viewer (form.html).

   Einstieg: Szene aufbauen, Formmodell aus assets/die.glb laden
   (Standard-glTF, erzeugt über tools/export.html bzw. tools/build-glb.mjs),
   Seitenleiste, Ansichtsleiste, Schnitt und Hover verdrahten.

   Die Zuordnung Modell ↔ Seitenleiste läuft über Gruppen-Namen und
   userData.compId (glTF-extras) — beides überlebt den GLB-Roundtrip.
   Der Viewer kennt die Geometrie NUR über die GLB; eine extern erzeugte
   Datei (CAD-Export) funktioniert, solange sie diese Namen trägt. */

import * as T from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { initScene } from './scene.js';
import { initClipCaps } from './clipcaps.js';
import { CFG } from './config.js';
import { GROUPS, COMPONENTS } from './registry.js';
import { buildComponentList, wireViewControls } from './ui/sidebar.js';
import { mountViewBar } from './ui/viewbar.js';
import { mountNav } from './ui/nav.js';

mountNav('form.html');

/* Handle für die Browser-Konsole UND für den Verdrahtungstest
   (tests/viewer.test.mjs). */
export const __viewer = {};

const container = document.getElementById('viewport');
const status = document.getElementById('status');
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';
status.textContent = 'Modell lädt …';

/* Blick von der festen Seite (−z): beim „Form öffnen" fährt die
   bewegliche Hälfte vom Betrachter weg und gibt die Kavität frei. */
const view = initScene(container, {
  cameraStart: [2000, 900, -1900], target: [0, 0, 20],
  minDistance: 250, maxDistance: 10000
});
mountViewBar(container, view);

new GLTFLoader().load('assets/die.glb', gltf => init(gltf.scene),
  undefined,
  err => {
    status.textContent = 'assets/die.glb fehlt oder ist defekt — neu erzeugen mit '
      + '„node tools/build-glb.mjs" oder tools/export.html (README).';
    console.error(err);
  });

function init(dieScene) {
  view.scene.add(dieScene);
  /* Die GLB muss den Knoten „movingRoot" mitbringen — daran hängt die
     bewegliche Formhälfte. Fehlte er, warf der Öffnen-Regler beim ersten
     Zug einen TypeError, statt zu sagen, was der Datei fehlt. */
  const movingRoot = dieScene.getObjectByName('movingRoot');
  if (!movingRoot) {
    status.textContent = 'Der Baugruppe fehlt der Knoten „movingRoot" — die bewegliche '
      + 'Formhälfte lässt sich nicht öffnen. Datei neu erzeugen: node tools/build-glb.mjs';
    const opener = document.getElementById('open');
    if (opener) opener.disabled = true;
  }

  /* Seitenleiste: eine Zeile je Registry-Baugruppe, Objekt über den Gruppennamen. */
  const items = COMPONENTS.map(c => ({ ...c, object: dieScene.getObjectByName(c.id) }))
    .filter(i => i.object);
  buildComponentList(document.getElementById('components'), GROUPS, items,
    (id, on) => { const it = items.find(i => i.id === id); if (it) it.object.visible = on; });

  /* Stahl-Transparenz: alle Materialien mit Namen 'steel' aus der GLB. */
  const steelMats = new Set();
  dieScene.traverse(o => { if (o.isMesh && o.material.name === 'steel') steelMats.add(o.material); });
  function setSteelOpacity(o) {
    for (const m of steelMats) {
      m.opacity = o;
      m.transparent = o < 0.999;
      m.depthWrite = o >= 0.999;   // vermeidet Sortier-Artefakte bei Transparenz
      m.needsUpdate = true;
    }
  }

  const clip = initClipCaps(view.scene, dieScene);
  Object.assign(__viewer, { view, dieScene, movingRoot, items, clip, setSteelOpacity });
  window.__form3d = __viewer;

  wireViewControls({
    onOpacity: setSteelOpacity,
    onOpen: t => { if (movingRoot) movingRoot.position.z = t * CFG.openTravel; },
    onClip: clip.setClip
  });
  setSteelOpacity(document.getElementById('opacity').value / 100);

  /* Hover: Baugruppe unter der Maus in der Statusleiste nennen. Die
     unsichtbaren Stencil-Zwillinge tragen kein compId und fallen durch. */
  const ray = new T.Raycaster();
  const labelOf = Object.fromEntries(COMPONENTS.map(c => [c.id, c.label]));
  status.textContent = IDLE;
  view.renderer.domElement.addEventListener('pointermove', ev => {
    const r = view.renderer.domElement.getBoundingClientRect();
    const p = new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, view.camera);
    const hits = ray.intersectObjects(items.filter(i => i.object.visible).map(i => i.object), true);
    const hit = hits.find(h => h.object.userData.compId);
    status.textContent = hit ? labelOf[hit.object.userData.compId] : IDLE;
  });
  view.renderer.domElement.addEventListener('pointerleave', () => { status.textContent = IDLE; });
}
