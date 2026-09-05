/* Formaufbau als bearbeitbare Baugruppe.

   Ein Modell ist ein Baum aus Three.js-Gruppen:
     die
     ├─ fixedRoot   (bleibt stehen)
     └─ movingRoot  (fährt beim „Form öffnen" nach +z)
   und darunter je TEIL eine Gruppe mit dem Namen der Teil-id, in der die
   Meshes liegen. Welches Teil zu welcher GRUPPE der Seitenleiste gehört
   (Feste Seite, Temperierung, Schieber, Gussteil …), welche Seite eine
   Gruppe hat und ob sie ein Schieber ist, steht als Metadaten am Wurzel-
   knoten (userData.formaufbau → glTF-extras) und überlebt so den
   GLB-Roundtrip. Eine GLB ohne diese Metadaten (die ausgelieferte
   Ölwannen-Form, jede fremd erzeugte Datei mit den Registry-Namen) wird
   über js/registry.js in die Standardgruppen einsortiert.

   Alles hier ist DOM-frei; die Seitenleiste (js/ui/assembly-sidebar.js)
   und der Viewer (js/die.js) rufen nur diese Funktionen. */

import * as T from 'three';
import { COMPONENTS } from './registry.js';
import { CFG } from './config.js';
import { makeMaterial } from './materials.js';
import { smoothNormals, indexTriangles } from './mesh.js';

export const FORMAT = 'dielogic-formaufbau';
export const VERSION = 1;

/* Standardgruppen. side: 'fix' bleibt stehen, 'mov' fährt mit der
   beweglichen Hälfte. mat: Werkstoffklasse neuer Teile. slide: ein
   Schieber fährt beim Öffnen zusätzlich in der Trennebene heraus. */
export const DEFAULT_GROUPS = [
  { key: 'fix',     title: 'Feste Seite',            side: 'fix', mat: 'steel',    color: '#9aa7ad' },
  { key: 'coolFix', title: 'Temperierung fest',      side: 'fix', mat: 'coolFix',  color: '#c0392b' },
  { key: 'mov',     title: 'Bewegliche Seite',       side: 'mov', mat: 'steel',    color: '#a7b3b9' },
  { key: 'coolMov', title: 'Temperierung beweglich', side: 'mov', mat: 'coolMov',  color: '#2e6da4' },
  { key: 'slider',  title: 'Schieber',               side: 'mov', mat: 'steel',    color: '#8a7f6a',
    slide: { axis: 'x', sign: 1, travel: 120 } },
  { key: 'cast',    title: 'Gussteil',               side: 'mov', mat: 'castPart', color: '#d4a908' }
];

export const SLIDE_DIRS = [
  { key: '',   label: 'kein Schieber' },
  { key: '+x', label: 'fährt nach +X', axis: 'x', sign: 1 },
  { key: '-x', label: 'fährt nach −X', axis: 'x', sign: -1 },
  { key: '+y', label: 'fährt nach +Y', axis: 'y', sign: 1 },
  { key: '-y', label: 'fährt nach −Y', axis: 'y', sign: -1 }
];

/* Registry-Baugruppe → Standardgruppe (für Dateien ohne Metadaten). */
function legacyGroup(c) {
  if (c.side === 'cast') return 'cast';
  if (c.sub === 'Temperierung') return c.side === 'fix' ? 'coolFix' : 'coolMov';
  return c.side;
}

const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'teil';

/** Dreieckssuppe → indizierte Geometrie mit weichen Normalen über den
    Knickwinkel; so sehen geladene STL aus wie die Stücke der Form. */
export function geometryOf(tris, crease = 32) {
  const { position, normal, index } = indexTriangles(tris, smoothNormals(tris, crease));
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(position, 3));
  g.setAttribute('normal', new T.BufferAttribute(normal, 3));
  g.setIndex(new T.BufferAttribute(position.length / 3 > 65535 ? index : Uint16Array.from(index), 1));
  return g;
}

/** Baugruppe aus einem geladenen Modell (gltf.scene oder ein Ersatz). */
export function createAssembly(scene) {
  const die = scene.getObjectByName('die') || scene;
  const fixedRoot = scene.getObjectByName('fixedRoot');
  const movingRoot = scene.getObjectByName('movingRoot');
  if (!fixedRoot || !movingRoot) throw new Error('Der Baugruppe fehlen die Knoten „fixedRoot"/„movingRoot".');

  const meta = die.userData && die.userData.formaufbau;
  const groups = [];
  const items = [];
  let openTravel = CFG.openTravel;
  let openT = 0;

  const tag = (object, id) => object.traverse(o => { o.userData.compId = id; });

  if (meta && Array.isArray(meta.groups) && Array.isArray(meta.items)) {
    for (const g of meta.groups) groups.push({ ...g, slide: g.slide ? { ...g.slide } : null });
    for (const it of meta.items) {
      const object = scene.getObjectByName(it.id);
      if (!object || !groups.some(g => g.key === it.group)) continue;
      tag(object, it.id);
      items.push({ id: it.id, label: it.label || it.id, group: it.group, color: it.color || '#9aa7ad', object });
    }
    if (Number.isFinite(meta.openTravel)) openTravel = meta.openTravel;
  } else {
    for (const g of DEFAULT_GROUPS) groups.push({ ...g, slide: g.slide ? { ...g.slide } : null });
    for (const c of COMPONENTS) {
      const object = scene.getObjectByName(c.id);
      if (!object) continue;
      tag(object, c.id);
      items.push({ id: c.id, label: c.label, group: legacyGroup(c), color: c.color, object });
    }
  }

  const groupOf = key => groups.find(g => g.key === key);
  const itemOf = id => items.find(i => i.id === id);
  const rootFor = g => (g.side === 'fix' ? fixedRoot : movingRoot);
  const uniqueId = base => {
    let id = slug(base), n = 2;
    while (items.some(i => i.id === id) || scene.getObjectByName(id)) id = slug(base) + '_' + n++;
    return id;
  };
  const uniqueKey = base => {
    let key = slug(base), n = 2;
    while (groups.some(g => g.key === key)) key = slug(base) + '_' + n++;
    return key;
  };
  const meshesOf = object => {
    const out = [];
    object.traverse(o => { if (o.isMesh && !o.userData.stencilTwin) out.push(o); });
    return out;
  };

  /* Öffnen: die bewegliche Hälfte fährt in z, Schieber zusätzlich in der
     Trennebene — als Versatz ihres Teil-Knotens, damit die Stencil-
     Zwillinge des Schnitts (Kinder desselben Knotens) mitfahren. */
  function setOpen(t) {
    openT = t;
    movingRoot.position.z = t * openTravel;
    for (const it of items) {
      const g = groupOf(it.group);
      const s = g && g.slide;
      it.object.position.set(0, 0, 0);
      if (s) it.object.position[s.axis] = s.sign * s.travel * t;
    }
  }

  function addItem({ group, label, tris, color }) {
    const g = groupOf(group);
    if (!g) throw new Error('Unbekannte Gruppe: ' + group);
    const id = uniqueId(label);
    const object = new T.Group();
    object.name = id;
    const mesh = new T.Mesh(geometryOf(tris), makeMaterial(g.mat, color || g.color));
    mesh.name = id + '_' + g.mat;
    object.add(mesh);
    tag(object, id);
    rootFor(g).add(object);
    const item = { id, label, group, color: color || g.color, object };
    items.push(item);
    setOpen(openT);
    return item;
  }

  function removeItem(id) {
    const it = itemOf(id);
    if (!it) return false;
    it.object.removeFromParent();
    for (const m of meshesOf(it.object)) { m.geometry.dispose(); m.material.dispose(); }
    items.splice(items.indexOf(it), 1);
    return true;
  }

  function renameItem(id, label) {
    const it = itemOf(id);
    if (!it || !label.trim()) return false;
    it.label = label.trim();
    return true;
  }

  /* In eine andere Gruppe: Seite wechseln heißt Elternknoten wechseln,
     und das Teil bekommt die Werkstoffklasse der neuen Gruppe. */
  function moveItem(id, groupKey) {
    const it = itemOf(id), g = groupOf(groupKey);
    if (!it || !g || it.group === groupKey) return false;
    const from = groupOf(it.group);
    it.group = groupKey;
    if (!from || from.side !== g.side) rootFor(g).add(it.object);
    for (const m of meshesOf(it.object)) {
      if (m.material.name === g.mat) continue;
      m.material.dispose();
      m.material = makeMaterial(g.mat, it.color);
      m.name = it.id + '_' + g.mat;
    }
    setOpen(openT);
    return true;
  }

  function addGroup({ title, side = 'mov', mat = 'steel', color, slide = null }) {
    if (!title || !title.trim()) return null;
    const g = { key: uniqueKey(title), title: title.trim(), side, mat, color: color || '#8d9aa1',
      slide: slide ? { axis: slide.axis, sign: slide.sign, travel: Number(slide.travel) || 0 } : null };
    groups.push(g);
    return g;
  }

  function removeGroup(key) {
    const g = groupOf(key);
    if (!g || items.some(i => i.group === key)) return false;
    groups.splice(groups.indexOf(g), 1);
    return true;
  }

  function renameGroup(key, title) {
    const g = groupOf(key);
    if (!g || !title.trim()) return false;
    g.title = title.trim();
    return true;
  }

  const setVisible = (id, on) => { const it = itemOf(id); if (it) it.object.visible = on; };
  const labelOf = id => { const it = itemOf(id); return it ? it.label : null; };

  /** Metadaten, wie sie an den Wurzelknoten kommen. */
  function metadata() {
    return {
      format: FORMAT, version: VERSION, openTravel,
      groups: groups.map(g => ({ key: g.key, title: g.title, side: g.side, mat: g.mat, color: g.color,
        ...(g.slide ? { slide: { ...g.slide } } : {}) })),
      items: items.map(i => ({ id: i.id, label: i.label, group: i.group, color: i.color }))
    };
  }

  /** Sauberer Baum für den Export: ohne Stencil-Zwillinge, ohne Öffnungs-
      versatz, Metadaten als userData (→ extras) am Wurzelknoten. */
  function toExportRoot() {
    const root = new T.Group(); root.name = 'die';
    const fr = new T.Group(); fr.name = 'fixedRoot';
    const mr = new T.Group(); mr.name = 'movingRoot';
    root.add(fr, mr);
    for (const it of items) {
      const g = groupOf(it.group);
      const node = new T.Group();
      node.name = it.id;
      node.userData.compId = it.id;
      for (const m of meshesOf(it.object)) {
        const c = new T.Mesh(m.geometry, m.material);
        c.name = m.name;
        c.userData.compId = it.id;
        c.position.copy(m.position); c.quaternion.copy(m.quaternion); c.scale.copy(m.scale);
        node.add(c);
      }
      (g && g.side === 'fix' ? fr : mr).add(node);
    }
    root.userData.formaufbau = metadata();
    return root;
  }

  function dispose() {
    for (const it of items) for (const m of meshesOf(it.object)) { m.geometry.dispose(); m.material.dispose(); }
    scene.removeFromParent();
  }

  return {
    scene, die, fixedRoot, movingRoot, groups, items,
    get openTravel() { return openTravel; },
    setOpen, addItem, removeItem, renameItem, moveItem, addGroup, removeGroup, renameGroup,
    setVisible, labelOf, groupOf, itemOf, metadata, toExportRoot, dispose
  };
}
