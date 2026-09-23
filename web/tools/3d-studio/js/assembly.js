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
   über js/registry.js in die Standardgruppen einsortiert. Was weder die
   Metadaten noch die Registry kennt (ein CAD-Export mit eigenen Namen),
   kommt je Seite in „Sonstige Teile" — sonst würde es gezeichnet, wäre
   aber kein Teil: nie blass, nicht antippbar, nicht in der gespeicherten
   Datei.

   FARBEN: eine voreingestellte Farbe ist eine ROLLE des Farbschemas
   (js/registry.js, roleColor) und folgt ihm — beim Laden und bei jedem
   Wechsel (recolor). Was der Anwender im Farbwähler setzt, ist ein Wert
   und bleibt; ebenso eine Farbe, die als Wert in einer Datei steht (eine
   ältere Datei, ein CAD-Export). Gruppe und Teil tragen dafür `color`
   (der Wert, den man sieht) und `role` (die Rolle oder null); beides steht
   in den Metadaten. Die Teile der Registry sind Voreinstellung: eine Datei
   ohne Metadaten bekommt deren Rollen, auch wenn ihre Materialien noch
   die Farben tragen, mit denen sie gebaut wurde (assets/die.glb).

   Die Lage der Knoten bleibt, wie sie in der Datei steht: ein CAD-Export
   setzt Teile und Baugruppen mit eigenen Versätzen, Drehungen und
   Maßstäben. Das Öffnen legt seinen Weg OBEN DRAUF, und der Export
   schreibt die ganze Kette mit.

   Alles hier ist DOM-frei; die Seitenleiste (js/ui/assembly-sidebar.js)
   und der Viewer (js/die.js) rufen nur diese Funktionen. */

import * as T from 'three';
import { COMPONENTS, roleColor } from './registry.js';
import { CFG } from './config.js';
import { makeMaterial, CLASS_ROLE, FIXED_COLOR, classColor } from './materials.js';
import { smoothNormals, indexTriangles } from './mesh.js';

export const FORMAT = 'dielogic-formaufbau';
export const VERSION = 1;

/* Standardgruppen. side: 'fix' bleibt stehen, 'mov' fährt mit der
   beweglichen Hälfte. mat: Werkstoffklasse neuer Teile. role: ihre Farbe
   als Rolle (die Stufen wie in js/registry.js). slide: ein Schieber fährt
   beim Öffnen zusätzlich in der Trennebene heraus. */
export const DEFAULT_GROUPS = [
  { key: 'fix',     title: 'Feste Seite',            side: 'fix', mat: 'steel',    role: 'steel:0.45' },
  { key: 'coolFix', title: 'Temperierung fest',      side: 'fix', mat: 'coolFix',  role: 'cool' },
  { key: 'mov',     title: 'Bewegliche Seite',       side: 'mov', mat: 'steel',    role: 'steel:0.35' },
  { key: 'coolMov', title: 'Temperierung beweglich', side: 'mov', mat: 'coolMov',  role: 'cool:0.45' },
  { key: 'slider',  title: 'Schieber',               side: 'mov', mat: 'steel',    role: 'steel:0.7',
    slide: { axis: 'x', sign: 1, travel: 120 } },
  { key: 'cast',    title: 'Gussteil',               side: 'mov', mat: 'castPart', role: 'melt' }
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

/* Farben als '#rrggbb' — so kommen sie aus dem Farbwähler und so stehen
   sie in den Metadaten. */
const normalizeHex = c => {
  const m = String(c || '').trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? '#' + m[1].toLowerCase() : null;
};
/* Die Farbe einer Gruppe oder eines Teils aus der Datei: eine gültige Rolle
   gilt (ihr Wert kommt aus dem Schema von jetzt), sonst ein Wert, sonst die
   Voreinstellung `fallback` ({ color, role }). */
function readColor(x, fallback) {
  const byRole = x ? roleColor(x.role) : null;
  if (byRole) return { color: byRole, role: x.role };
  const hex = x ? normalizeHex(x.color) : null;
  return hex ? { color: hex, role: null } : { ...fallback };
}
/** Die Voreinstellung einer Werkstoffklasse: ihre Rolle samt Wert. */
const classDefault = mat => { const role = CLASS_ROLE[mat] || CLASS_ROLE.steel; return { color: roleColor(role), role }; };

/* Eine Gruppe aus den Metadaten einer Datei. Die Datei kann von irgendwo
   kommen: übernommen wird nur, was hier Sinn ergibt — eine unbekannte
   Seite oder ein Schieber ohne Achse ließe sonst die Seitenleiste oder
   das Öffnen stolpern. Ohne brauchbare Farbe bekommt sie die ihrer Klasse. */
function readGroup(g) {
  if (!g || typeof g.key !== 'string' || !g.key) return null;
  const s = g.slide;
  const travel = s ? Number(s.travel) : NaN;
  const mat = typeof g.mat === 'string' && g.mat ? g.mat : 'steel';
  return {
    key: g.key, title: String(g.title || g.key).trim() || g.key, side: g.side === 'fix' ? 'fix' : 'mov',
    mat, ...readColor(g, classDefault(mat)),
    slide: s && ['x', 'y', 'z'].includes(s.axis) && Number.isFinite(travel)
      ? { axis: s.axis, sign: s.sign < 0 ? -1 : 1, travel } : null
  };
}

/* Die Gruppen für Teile, die niemand kennt — je Seite eine, in der Farbe
   des Stahls (die Teile darin behalten die Farbe aus ihrer Datei). */
const OTHER = {
  fix: { key: 'otherFix', title: 'Sonstige Teile fest', side: 'fix', mat: 'steel', role: CLASS_ROLE.steel, slide: null },
  mov: { key: 'otherMov', title: 'Sonstige Teile beweglich', side: 'mov', mat: 'steel', role: CLASS_ROLE.steel, slide: null }
};
const otherGroup = side => ({ ...OTHER[side], color: roleColor(OTHER[side].role) });

/* Freigeben, was die Grafikkarte hält: Geometrien, Materialien und ihre
   Texturen, für JEDEN Knoten darunter. Die Stencil-Zwillinge des Schnitts
   teilen die Geometrie mit ihrem Original, ihr Material gehört dem Schnitt
   (js/clipcaps.js). */
function release(root) {
  root.traverse(o => {
    if (o.userData.stencilTwin) return;
    if (o.geometry) o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
}

/* Für die Datei: die Farbe des Teils, deckend, ohne Leuchten. Deckkraft
   und Hervorhebung sind Sache der Ansicht (js/die.js stellt sie an den
   Materialien im Bild ein) und gehören nicht in die GLB. */
function fileMaterial(m) {
  const c = m.clone();
  c.opacity = 1;
  c.transparent = false;
  c.depthWrite = true;
  if (c.emissive) c.emissive.setHex(0);
  c.clippingPlanes = null;
  return c;
}

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
  const groupOf = key => groups.find(g => g.key === key);
  const itemOf = id => items.find(i => i.id === id);
  const rootFor = g => (g.side === 'fix' ? fixedRoot : movingRoot);
  const uniqueId = base => {
    let id = slug(base), n = 2;
    while (items.some(i => i.id === id) || scene.getObjectByName(id)) id = slug(base) + '_' + n++;
    return id;
  };
  const roots = new Set([scene, die, fixedRoot, movingRoot]);
  const within = (o, root) => { for (let p = o.parent; p; p = p.parent) if (p === root) return true; return false; };

  /* Ein Teil hängt unter der Wurzel seiner Seite — steht es in der Datei
     woanders, zieht es dorthin um, ohne seine Lage im Raum zu ändern. */
  function take(object, id, fields) {
    const g = groupOf(fields.group);
    if (!within(object, rootFor(g))) rootFor(g).attach(object);
    tag(object, id);
    const item = { id, ...fields, object };
    items.push(item);
    return item;
  }

  if (meta && Array.isArray(meta.groups) && Array.isArray(meta.items)) {
    for (const raw of meta.groups) {
      const g = readGroup(raw);
      if (g && !groupOf(g.key)) groups.push(g);
    }
    for (const it of meta.items) {
      if (!it || typeof it.id !== 'string' || itemOf(it.id)) continue;
      const object = scene.getObjectByName(it.id);
      const g = groupOf(it.group);
      if (!object || roots.has(object) || !g) continue;
      /* Ohne brauchbare Farbe die der Gruppe — als Rolle, wenn sie eine hat. */
      take(object, it.id, { label: String(it.label || it.id), group: it.group, ...readColor(it, { color: g.color, role: g.role }) });
    }
    if (Number.isFinite(meta.openTravel)) openTravel = meta.openTravel;
  } else {
    for (const g of DEFAULT_GROUPS) groups.push({ ...g, color: roleColor(g.role), slide: g.slide ? { ...g.slide } : null });
    for (const c of COMPONENTS) {
      const object = scene.getObjectByName(c.id);
      if (!object || roots.has(object)) continue;
      take(object, c.id, { label: c.label, group: legacyGroup(c), color: c.color, role: c.role });
    }
  }

  /* Alles Übrige: je Mesh, das zu keinem Teil gehört, der oberste Knoten
     darüber, der weder eine Wurzel ist noch ein Teil enthält — bei einem
     CAD-Export also das Kind von fixedRoot/movingRoot, wie der Viewer es
     erwartet (js/die.js). Es heißt, wie es in der Datei heißt; ist der Name
     leer oder schon vergeben, bekommt der Knoten einen eigenen. */
  (function adoptTheRest() {
    const owned = new Set(items.map(i => i.object));
    const holders = new Set();
    const hold = o => { for (let p = o.parent; p; p = p.parent) holders.add(p); };
    owned.forEach(hold);
    const inside = o => { for (let p = o; p; p = p.parent) if (owned.has(p)) return true; return false; };
    const loose = [];
    scene.traverse(o => { if (o.isMesh && !o.userData.stencilTwin && !inside(o)) loose.push(o); });
    for (const mesh of loose) {
      if (inside(mesh)) continue;                 // mit einem früheren Knoten schon übernommen
      let node = mesh;
      while (node.parent && !roots.has(node.parent) && !holders.has(node.parent)) node = node.parent;
      const side = within(node, movingRoot) ? 'mov' : 'fix';
      if (!groupOf(OTHER[side].key)) groups.push(otherGroup(side));
      const name = node.name || mesh.name;
      const id = node.name && !itemOf(node.name) && scene.getObjectByName(node.name) === node ? node.name : uniqueId(name || 'Teil');
      node.name = id;
      /* Die Farbe aus der Datei ist ein Wert und bleibt; ohne Farbe die der Gruppe. */
      const m = mesh.material;
      const hex = m && m.color && normalizeHex('#' + m.color.getHexString());
      const g = groupOf(OTHER[side].key);
      take(node, id, { label: name || id, group: OTHER[side].key, ...(hex ? { color: hex, role: null } : { color: g.color, role: g.role }) });
      owned.add(node);
      hold(node);
    }
  })();

  /* Die Lage bei geschlossener Form, wie sie in der Datei steht. setOpen
     rechnet von hier aus, statt die Knoten auf null zu setzen — das warf
     jeden Versatz aus einem CAD-Export weg. */
  const basePos = new Map();
  const remember = o => basePos.set(o, o.position.clone());
  remember(movingRoot);
  for (const it of items) remember(it.object);
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

  /* Jedes Teil bekommt eigene Materialien: eine fremd erzeugte GLB darf
     ein Material über mehrere Knoten teilen, aber Farbe, Hervorhebung und
     Deckkraft gelten hier je Teil — ein geteiltes Material trüge die
     Änderung des einen Teils in das andere. */
  (function ownMaterials() {
    const owner = new Map();
    for (const it of items) {
      for (const m of meshesOf(it.object)) {
        const who = owner.get(m.material);
        if (who && who !== it.id) m.material = m.material.clone();
        owner.set(m.material, it.id);
      }
    }
  })();

  /* Die Farben ins Bild: Teile mit Rolle bekommen deren Wert (beim Laden
     tragen ihre Materialien noch die Farben der Datei), Kolben und Stifte
     die ihrer Klasse. Ein Teil mit einem Wert bleibt, wie es ist. Beim
     Laden und bei jedem Wechsel des Farbschemas (recolor). */
  function paint(it) {
    for (const m of meshesOf(it.object)) {
      const cls = m.material.name;
      if (FIXED_COLOR.has(cls)) m.material.color.set(classColor(cls));
      else if (it.role) m.material.color.set(it.color);
      else continue;
      m.material.needsUpdate = true;
    }
  }
  function recolor() {
    for (const g of groups) if (g.role) g.color = roleColor(g.role) || g.color;
    for (const it of items) {
      if (it.role) it.color = roleColor(it.role) || it.color;
      paint(it);
    }
  }
  recolor();

  /* Öffnen: die bewegliche Hälfte fährt in z, Schieber zusätzlich in der
     Trennebene — als Versatz ihres Teil-Knotens, damit die Stencil-
     Zwillinge des Schnitts (Kinder desselben Knotens) mitfahren. Der
     Versatz kommt auf die Lage aus der Datei. */
  function setOpen(t) {
    openT = t;
    movingRoot.position.copy(basePos.get(movingRoot));
    movingRoot.position.z += t * openTravel;
    for (const it of items) {
      const g = groupOf(it.group);
      const s = g && g.slide;
      it.object.position.copy(basePos.get(it.object));
      if (s) it.object.position[s.axis] += s.sign * s.travel * t;
    }
  }

  /* Etwas bei geschlossener Form tun (Umhängen, Export, Kasten) und den
     Öffnungsweg danach wiederherstellen. */
  function closed(fn) {
    const t = openT;
    setOpen(0);
    scene.updateMatrixWorld(true);
    try { return fn(); } finally { setOpen(t); scene.updateMatrixWorld(true); }
  }

  function addItem({ group, label, tris, color }) {
    const g = groupOf(group);
    if (!g) throw new Error('Unbekannte Gruppe: ' + group);
    const id = uniqueId(label);
    const object = new T.Group();
    object.name = id;
    /* Ohne eigene Farbe die der Gruppe — mit ihrer Rolle, damit das Teil
       dem Schema folgt wie seine Nachbarn. */
    const hex = normalizeHex(color);
    const own = hex ? { color: hex, role: null } : { color: g.color, role: g.role || null };
    const mesh = new T.Mesh(geometryOf(tris), makeMaterial(g.mat, own.color));
    mesh.name = id + '_' + g.mat;
    object.add(mesh);
    tag(object, id);
    rootFor(g).add(object);
    const item = { id, label, group, ...own, object };
    items.push(item);
    remember(object);
    setOpen(openT);
    return item;
  }

  function removeItem(id) {
    const it = itemOf(id);
    if (!it) return false;
    it.object.removeFromParent();
    release(it.object);
    basePos.delete(it.object);
    items.splice(items.indexOf(it), 1);
    return true;
  }

  function renameItem(id, label) {
    const it = itemOf(id);
    if (!it || !label.trim()) return false;
    it.label = label.trim();
    return true;
  }

  /* Farbe eines Teils: Material und Metadatum. Beides überlebt den
     GLB-Roundtrip — die Materialfarbe in der Datei, das Metadatum in den
     extras. Eine gewählte Farbe ist ein Wert: das Teil folgt dem
     Farbschema danach nicht mehr. Kolben und Stifte behalten die Farbe
     ihrer Klasse. */
  function setColor(id, color) {
    const it = itemOf(id), hex = normalizeHex(color);
    if (!it || !hex) return false;
    it.color = hex;
    it.role = null;
    for (const m of meshesOf(it.object)) {
      if (FIXED_COLOR.has(m.material.name)) continue;
      m.material.color.set(hex);
      m.material.needsUpdate = true;
    }
    return true;
  }

  /** Eine Farbe für alle Teile der Gruppe — und für neue Teile darin. */
  function setGroupColor(key, color) {
    const g = groupOf(key), hex = normalizeHex(color);
    if (!g || !hex) return false;
    g.color = hex;
    g.role = null;
    for (const it of items) if (it.group === key) setColor(it.id, hex);
    return true;
  }

  /* In eine andere Gruppe: Seite wechseln heißt Elternknoten wechseln —
     bei geschlossener Form, damit das Teil bleibt, wo es in der Form sitzt —,
     und das Teil bekommt die Werkstoffklasse der neuen Gruppe. */
  function moveItem(id, groupKey) {
    const it = itemOf(id), g = groupOf(groupKey);
    if (!it || !g || it.group === groupKey) return false;
    const from = groupOf(it.group);
    if (!from || from.side !== g.side) {
      closed(() => { rootFor(g).attach(it.object); remember(it.object); });
    }
    it.group = groupKey;
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
    /* Ohne Farbe die Voreinstellung ihrer Werkstoffklasse, als Rolle. */
    const hex = normalizeHex(color);
    const g = { key: uniqueKey(title), title: title.trim(), side, mat, ...(hex ? { color: hex, role: null } : classDefault(mat)),
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

  /** Metadaten, wie sie an den Wurzelknoten kommen. Eine Rolle steht neben
      ihrem Wert: wer die Datei wieder lädt, bekommt die Rolle (im Schema von
      dann), ein älteres Programm den Wert. */
  function metadata() {
    const role = x => (x.role ? { role: x.role } : {});
    return {
      format: FORMAT, version: VERSION, openTravel,
      groups: groups.map(g => ({ key: g.key, title: g.title, side: g.side, mat: g.mat, color: g.color, ...role(g),
        ...(g.slide ? { slide: { ...g.slide } } : {}) })),
      items: items.map(i => ({ id: i.id, label: i.label, group: i.group, color: i.color, ...role(i) }))
    };
  }

  /** Sauberer Baum für den Export: ohne Stencil-Zwillinge, bei geschlossener
      Form, Metadaten als userData (→ extras) am Wurzelknoten. Jeder Knoten
      bekommt seine GANZE Lage relativ zu dem, woran er in der Datei hängt —
      die Wurzeln relativ zu „die", ein Teil relativ zu seiner Wurzel, ein
      Mesh relativ zu seinem Teil —, auch wenn im Modell Baugruppen-Knoten
      dazwischen liegen. Die Materialien sind saubere Kopien (fileMaterial). */
  function toExportRoot() {
    return closed(() => {
      const inv = new T.Matrix4(), rel = new T.Matrix4();
      const place = (node, o, frame) => {
        rel.copy(o.matrixWorld).premultiply(inv.copy(frame.matrixWorld).invert());
        rel.decompose(node.position, node.quaternion, node.scale);
      };
      const root = new T.Group(); root.name = 'die';
      const fr = new T.Group(); fr.name = 'fixedRoot';
      const mr = new T.Group(); mr.name = 'movingRoot';
      place(root, die, scene);
      place(fr, fixedRoot, die);
      place(mr, movingRoot, die);
      root.add(fr, mr);
      const clean = new Map();
      for (const it of items) {
        const g = groupOf(it.group);
        const side = g && g.side === 'fix' ? fixedRoot : movingRoot;
        const node = new T.Group();
        node.name = it.id;
        node.userData.compId = it.id;
        place(node, it.object, side);
        for (const m of meshesOf(it.object)) {
          if (!clean.has(m.material)) clean.set(m.material, fileMaterial(m.material));
          const c = new T.Mesh(m.geometry, clean.get(m.material));
          c.name = m.name;
          c.userData.compId = it.id;
          place(c, m, it.object);
          node.add(c);
        }
        (side === fixedRoot ? fr : mr).add(node);
      }
      root.userData.formaufbau = metadata();
      return root;
    });
  }

  /** Der Kasten der Form, geschlossen UND ganz geöffnet: daran hängt der Weg
      der Schnittebene (js/clipcaps.js), und der soll beim Öffnen nicht
      springen. */
  function bounds() {
    const box = new T.Box3();
    const t = openT;
    for (const s of [0, 1]) { setOpen(s); box.union(new T.Box3().setFromObject(scene)); }
    setOpen(t);
    scene.updateMatrixWorld(true);
    return box;
  }

  function dispose() {
    release(scene);
    scene.removeFromParent();
  }

  return {
    scene, die, fixedRoot, movingRoot, groups, items,
    get openTravel() { return openTravel; },
    setOpen, addItem, removeItem, renameItem, moveItem, setColor, setGroupColor, recolor,
    addGroup, removeGroup, renameGroup,
    setVisible, labelOf, groupOf, itemOf, metadata, toExportRoot, bounds, dispose
  };
}
