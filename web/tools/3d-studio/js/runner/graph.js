/* Das Angusssystem als GRAPH — nicht als Spline.

   Der Spline ist nur die Darstellung einer Kante. Was der Anwender
   bearbeitet und was gespeichert wird, ist ein Baum aus Knoten:
   Pressrest → Punkte → Verzweigungen → Anschnitte. Alles Weitere
   (Kurve, Querschnitt, Netz, Verluste) wird daraus abgeleitet und nie
   gespeichert. Der Grund ist derselbe wie überall im Studio: es soll
   genau EINE Quelle geben. Ein Spline mit Stützpunkten UND eine
   Netzstruktur nebeneinander liefen unweigerlich auseinander, sobald
   eine Verzweigung verschoben oder gespiegelt wird.

   ARBEITSEBENE. Jeder Knoten trägt eine Ebene, in der er sich
   verschieben lässt. Voreingestellt ist die des Vorgängers — beim
   Pressrest die Trennebene (Normale = Ausstoßrichtung). Sie lässt sich
   je Knoten kippen: `tilt` = [längs, quer] in Grad, gedreht um die
   Laufrichtung bzw. um die Querachse. Gespeichert wird nur das
   Winkelpaar; die Normale selbst leitet sich daraus und aus der
   Vorgängernormale ab. So bleibt eine gespiegelte Seite automatisch
   richtig gekippt.

   SPIEGELUNG. Eine Verzweigung mit `mirror` hält ihre zweite Seite als
   Spiegelbild der ersten — Ebene durch den Knoten, aufgespannt von
   Zulaufrichtung und Ebenennormale. Bearbeitet wird immer die Seite,
   die der Anwender angefasst hat (die „führende"); die andere wird
   nachgezogen, wobei vorhandene Knoten-ids erhalten bleiben, damit eine
   Auswahl das Nachziehen überlebt.

   Ein `mirror`-Knoten (Spiegelpunkt) ist dieselbe Mechanik mit fest
   50:50 und verborgener Gegenseite: man bearbeitet einen Ast, es
   entstehen zwei. */

import {
  add, sub, scale, addScaled, dot, cross, norm, len, rotate,
  mirrorPoint, rad, clamp
} from './vec.js';

export const FORMAT = 'dielogic-anguss';
export const FORMAT_VERSION = 1;

/** Die sechs Hauptrichtungen — dieselbe Schreibweise wie js/solids.js. */
export const AXES = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1]
};

/** Knotenarten. Die Farbe ist zugleich die Farbe des Griffs im Viewport. */
export const TYPES = {
  root:   { label: 'Pressrest', color: '#557786' },
  point:  { label: 'Punkt', color: '#008c82' },
  branch: { label: 'Verzweigung', color: '#d4a908' },
  mirror: { label: 'Spiegelpunkt', color: '#9a77e8' },
  gate:   { label: 'Anschnitt', color: '#e07b39' }
};

/** Übergang vom Laufkanal in den Anschnitt. */
export const TRANSITIONS = {
  ende:    { label: 'kurz vor dem Anschnitt', zeta: 0.25, share: 0.3 },
  kegel:   { label: 'über die ganze Länge', zeta: 0.10, share: 1.0 },
  faecher: { label: 'Fächer (breiter, flacher)', zeta: 0.15, share: 1.0 },
  stufe:   { label: 'Absatz (unstetig)', zeta: 0.50, share: 0.02 }
};

const DEF = {
  draft: 5,          // Entformschräge der Kanäle, Grad
  radius: 1.5,       // Eckenradius am Kanalboden, mm
  tension: 1.0,      // Straffheit der Splines
  step: 1.0          // Abtastschritt entlang der Mittellinie, mm
};

export function emptyGraph() {
  return {
    format: FORMAT, version: FORMAT_VERSION,
    biscuit: { pos: [0, 0, 0], axis: '+y', d: 90, t: 25 },
    draft: DEF.draft, radius: DEF.radius, tension: DEF.tension, step: DEF.step,
    nodes: {}, rootId: null, seq: 0
  };
}

const newId = g => 'k' + (++g.seq);

/* ── Zugriff ─────────────────────────────────────────────────── */
export const node = (g, id) => g.nodes[id] || null;
export const root = g => g.nodes[g.rootId] || null;
export const parentOf = (g, id) => (g.nodes[id] && g.nodes[id].parent ? g.nodes[g.nodes[id].parent] : null);
export const childrenOf = (g, id) => (g.nodes[id] ? g.nodes[id].children.map(c => g.nodes[c]).filter(Boolean) : []);

/** Tiefensuche ab dem Pressrest, Eltern immer vor ihren Kindern. */
export function walk(g, fn) {
  const stack = g.rootId ? [g.rootId] : [];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || !g.nodes[id]) continue;
    seen.add(id);
    fn(g.nodes[id]);
    for (let i = g.nodes[id].children.length - 1; i >= 0; i--) stack.push(g.nodes[id].children[i]);
  }
}

export function allNodes(g) {
  const out = [];
  walk(g, n => out.push(n));
  return out;
}

/** Alle Kanten als { from, to } in derselben Reihenfolge wie walk(). */
export function edges(g) {
  const out = [];
  walk(g, n => { for (const c of n.children) if (g.nodes[c]) out.push({ from: n, to: g.nodes[c] }); });
  return out;
}

/** Anteil des Stroms, der von `n` in das Kind `childId` gehen SOLL.
    Bei einer Gabelung mit zwei Ästen entscheidet `ratio`, sonst geht
    alles bzw. zu gleichen Teilen weiter. */
export function branchShare(g, n, childId) {
  const kids = n.children.filter(c => g.nodes[c]);
  if (kids.length <= 1) return 1;
  if (kids.length === 2) {
    const r = n.ratio === undefined ? 0.5 : n.ratio;
    return kids[0] === childId ? r : 1 - r;
  }
  return 1 / kids.length;
}

/** Weg vom Pressrest bis zum Knoten (einschließlich beider). */
export function pathTo(g, id) {
  const out = [];
  let n = g.nodes[id];
  while (n) { out.unshift(n); n = n.parent ? g.nodes[n.parent] : null; }
  return out;
}

/* ── Ebenen und Richtungen ───────────────────────────────────── */

/** Sehne vom Vorgänger zu diesem Knoten (Weltrichtung, normiert). */
export function chordDir(g, n) {
  const p = parentOf(g, n.id);
  if (!p) return AXES[g.biscuit.axis];
  const d = norm(sub(n.pos, p.pos));
  return (d[0] || d[1] || d[2]) ? d : planeAxisU(g, p);
}

/**
 * Normale der Arbeitsebene eines Knotens (Weltvektor, normiert).
 *
 * Zwei Kippungen, und sie tun UNTERSCHIEDLICHES:
 *
 *   längs (roll)  dreht die Normale um die Laufrichtung. Der Kanal legt
 *                 sich auf die Seite — das ändert die Lage des Profils.
 *   quer (pitch)  dreht sie um die Querachse in der Ebene. Die Ebene
 *                 stellt sich schräg; wer den Punkt jetzt zieht, hebt
 *                 ihn aus der Trennebene heraus. Das ist die Rampe.
 *
 * Die Normale wird hier bewusst NICHT gegen die Laufrichtung senkrecht
 * gestellt: dann wäre die Querkippung wirkungslos (sie dreht die Normale
 * genau in die Laufrichtung hinein, und das Senkrechtstellen nähme sie
 * wieder heraus). Für das PROFIL muss sie senkrecht stehen — das
 * besorgt frameNormal() in js/runner/curve.js an jedem Schnitt einzeln.
 */
export function planeNormal(g, n) {
  if (!n.parent) return AXES[g.biscuit.axis];
  const p = parentOf(g, n.id);
  const base = planeNormal(g, p);
  const e = chordDir(g, n);
  const [roll, pitch] = n.tilt || [0, 0];
  let out = base;
  if (roll) out = rotate(out, e, rad(roll));
  if (pitch) {
    const q = cross(base, e);
    if (len(q) > 1e-9) out = rotate(out, q, rad(clamp(pitch, -75, 75)));
  }
  return norm(out);
}

/** Irgendeine Achse in der Arbeitsebene — nur für Notfälle (Sehne = 0). */
function planeAxisU(g, n) {
  const nn = planeNormal(g, n);
  const h = Math.abs(nn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return norm(cross(nn, h));
}

/** Spiegelebene einer Verzweigung: enthält Zulaufrichtung und Normale. */
export function mirrorPlaneOf(g, n) {
  const nn = planeNormal(g, n);
  const inDir = n.parent ? chordDir(g, n) : AXES[g.biscuit.axis];
  let m = cross(inDir, nn);
  if (len(m) < 1e-9) m = planeAxisU(g, n);
  return { origin: n.pos.slice(), normal: norm(m) };
}

/* ── Aufbau ──────────────────────────────────────────────────── */

export function makeNode(g, type, parent, pos) {
  const n = {
    id: newId(g), type, parent: parent ? parent.id : null, children: [],
    pos: pos.slice(), tilt: [0, 0],
    w: parent ? parent.w * 0.9 : 24, h: parent ? parent.h * 0.9 : 12
  };
  if (type === 'branch' || type === 'mirror') {
    n.ratio = 0.5;
    n.mirror = true;              // bei 'branch' abschaltbar, bei 'mirror' fest
  }
  if (type === 'gate') {
    n.gate = { h: 2.0, len: 4, w: 20, auto: true, transition: 'ende' };
  }
  g.nodes[n.id] = n;
  if (parent) parent.children.push(n.id);
  return n;
}

/** Neuen Pressrest samt Wurzelknoten anlegen. */
export function setBiscuit(g, spec) {
  Object.assign(g.biscuit, spec);
  if (!g.rootId) {
    const r = makeNode(g, 'root', null, g.biscuit.pos);
    r.w = Math.min(28, g.biscuit.d * 0.32);
    r.h = Math.max(8, r.w * 0.6);
    g.rootId = r.id;
  } else {
    g.nodes[g.rootId].pos = g.biscuit.pos.slice();
  }
  return g;
}

/** Vorschlag für die Lage eines neuen Kindes: geradeaus weiter in der
    Arbeitsebene des Vorgängers, halbe bisherige Schrittweite. */
function suggestPos(g, parent, angleDeg = 0) {
  const nn = planeNormal(g, parent);
  const gp = parentOf(g, parent.id);
  let dir = gp ? norm(sub(parent.pos, gp.pos)) : null;
  if (!dir || !len(dir)) dir = planeAxisU(g, parent);
  /* In der Ebene halten und um den gewünschten Winkel drehen. */
  dir = norm(addScaled(dir, nn, -dot(dir, nn)));
  if (!len(dir)) dir = planeAxisU(g, parent);
  if (angleDeg) dir = rotate(dir, nn, rad(angleDeg));
  const step = gp ? Math.max(20, len(sub(parent.pos, gp.pos)) * 0.8) : Math.max(30, g.biscuit.d * 0.6);
  return addScaled(parent.pos, dir, step);
}

/** Kind anhängen. Bei Verzweigung und Spiegelpunkt entstehen zwei. */
export function addChild(g, parentId, type = 'point') {
  const p = g.nodes[parentId];
  if (!p) return null;
  if (p.type === 'gate') return null;                 // hinter dem Anschnitt ist Schluss
  if (type === 'branch' || type === 'mirror') {
    const b = makeNode(g, type, p, suggestPos(g, p));
    const a1 = makeNode(g, 'gate', b, suggestPos(g, b, 30));
    const a2 = makeNode(g, 'gate', b, suggestPos(g, b, -30));
    a1.w = a2.w = b.w * 0.55; a1.h = a2.h = b.h * 0.8;
    syncMirror(g, b, a1.id);
    return b;
  }
  const n = makeNode(g, type, p, suggestPos(g, p));
  if (type === 'gate') { n.w = p.w * 0.8; n.h = p.h * 0.7; }
  syncFrom(g, n.id);
  return n;
}

/** Punkt zwischen einen Knoten und seinen Vorgänger einfügen. */
export function insertBefore(g, id, type = 'point') {
  const n = g.nodes[id], p = parentOf(g, id);
  if (!n || !p) return null;
  const mid = scale(add(n.pos, p.pos), 0.5);
  const m = makeNode(g, type, p, mid);
  p.children[p.children.indexOf(id)] = m.id;
  m.children = [id];
  n.parent = m.id;
  m.w = (p.w + n.w) / 2; m.h = (p.h + n.h) / 2;
  syncFrom(g, m.id);
  return m;
}

/** Knoten löschen. Ein Knoten mit genau einem Kind wird überbrückt,
    sonst fällt der ganze Teilbaum weg. Der Pressrest bleibt. */
export function removeNode(g, id) {
  const n = g.nodes[id];
  if (!n || !n.parent) return false;
  const p = g.nodes[n.parent];
  const at = p.children.indexOf(id);
  if (n.children.length === 1) {
    const c = g.nodes[n.children[0]];
    p.children[at] = c.id;
    c.parent = p.id;
    delete g.nodes[id];
  } else {
    p.children.splice(at, 1);
    const drop = [];
    const rec = k => { drop.push(k); for (const c of g.nodes[k].children) rec(c); };
    rec(id);
    for (const k of drop) delete g.nodes[k];
  }
  /* Eine Verzweigung ohne Gabelung ist keine mehr. */
  if ((p.type === 'branch' || p.type === 'mirror') && p.children.length < 2 && p.parent) {
    p.type = 'point';
    delete p.ratio; delete p.mirror;
  }
  syncFrom(g, p.id);
  return true;
}

/* ── Spiegeln ────────────────────────────────────────────────── */

/* Eine Gabelung mit Spiegelung. Auch mit nur EINEM Kind: dann legt das
   Nachziehen die Gegenseite erst an — so beschreibt ein Beispiel oder
   eine Datei nur die eine Seite, und die andere entsteht daraus. */
const isMirrorBranch = n => (n.type === 'branch' || n.type === 'mirror')
  && n.mirror && n.children.length >= 1 && n.children.length <= 2;

/** Die führende Seite: die, die der Anwender bearbeitet. Ohne Hinweis
    ist es die erste — die zweite trägt nach jedem Nachziehen `follower`. */
const leadOf = (g, b) => (g.nodes[b.children[0]] && g.nodes[b.children[0]].follower ? b.children[1] : b.children[0]);

/** Nach einer Änderung an `id` alle betroffenen Spiegelseiten nachziehen.
    Der Weg nach oben merkt sich, durch welches Kind er kam — dieses Kind
    ist die führende Seite, denn dort hat der Anwender angefasst. */
export function syncFrom(g, id) {
  let n = g.nodes[id];
  let via = null;
  while (n) {
    if (isMirrorBranch(n)) {
      syncMirror(g, n, via && n.children.indexOf(via) >= 0 ? via : leadOf(g, n));
    }
    via = n.id;
    n = n.parent ? g.nodes[n.parent] : null;
  }
}

/** Alle Spiegelseiten einmal durchrechnen — nach dem Laden einer Datei
    oder eines Beispiels. */
export function normalizeMirrors(g) {
  /* Von unten nach oben: eine Verzweigung darf erst kopiert werden,
     wenn die Verzweigungen UNTER ihr schon vollständig sind — sonst
     erbt die Gegenseite einen halben Teilbaum. allNodes() liefert
     Eltern vor Kindern, also rückwärts durchlaufen. */
  for (const n of allNodes(g).reverse()) if (isMirrorBranch(n)) syncMirror(g, n, leadOf(g, n));
  return g;
}

/** Die Gegenseite einer Verzweigung als Spiegelbild der führenden Seite
    nachziehen. Vorhandene ids werden wiederverwendet, damit eine
    Auswahl auf der Gegenseite nicht bei jedem Zug verlorengeht. */
export function syncMirror(g, branch, leadChildId) {
  const b = typeof branch === 'string' ? g.nodes[branch] : branch;
  if (!b || !b.children.length || b.children.length > 2) return;
  const lead = b.children.indexOf(leadChildId) >= 0 ? leadChildId : b.children[0];
  const follow = b.children.find(c => c !== lead);
  const { origin, normal } = mirrorPlaneOf(g, b);
  b.ratio = 0.5;

  const copy = (srcId, dstId, parentId) => {
    const s = g.nodes[srcId];
    let d = dstId && g.nodes[dstId] ? g.nodes[dstId] : null;
    if (!d) {
      d = { id: newId(g), children: [] };
      g.nodes[d.id] = d;
    }
    d.type = s.type;
    d.parent = parentId;
    delete d.follower;
    d.pos = mirrorPoint(s.pos, origin, normal);
    /* Spiegeln kehrt den Drehsinn um: die Längsneigung wechselt das
       Vorzeichen, die Querneigung bleibt (Herleitung im README). */
    d.tilt = [-(s.tilt ? s.tilt[0] : 0), s.tilt ? s.tilt[1] : 0];
    d.w = s.w; d.h = s.h;
    if (s.ratio !== undefined) d.ratio = s.ratio;
    if (s.mirror !== undefined) d.mirror = s.mirror;
    if (s.gate) d.gate = { ...s.gate };
    const old = d.children.slice();
    d.children = [];
    s.children.forEach((sc, i) => {
      const kid = copy(sc, old[i], d.id);
      d.children.push(kid.id);
    });
    for (const rest of old.slice(s.children.length)) dropSubtree(g, rest);
    return d;
  };
  const made = copy(lead, follow, b.id);
  made.follower = true;
  g.nodes[lead].follower = false;
  b.children = b.children[0] === lead ? [lead, made.id] : [made.id, lead];
}

function dropSubtree(g, id) {
  if (!g.nodes[id]) return;
  for (const c of g.nodes[id].children.slice()) dropSubtree(g, c);
  delete g.nodes[id];
}

/** Ist der Knoten nur die nachgezogene Gegenseite eines Spiegelpunktes?
    Solche Knoten bekommen keinen Griff — man bearbeitet die andere Seite. */
export function isFollower(g, id) {
  let n = g.nodes[id];
  while (n && n.parent) {
    const p = g.nodes[n.parent];
    if (p.type === 'mirror' && n.follower) return true;
    n = p;
  }
  return false;
}

/* ── Bearbeiten ──────────────────────────────────────────────── */

/**
 * Knoten verschieben (Weltkoordinaten).
 *
 * Der Pressrest zieht das GANZE System mit. Er ist der Anker, an dem der
 * Anguss hängt; ihn allein zu verschieben hieße, die erste Kante zu
 * dehnen und den entworfenen Verlauf zu verlieren. Wer den Ursprung
 * versetzt, meint die Maschine, nicht den Kanal.
 */
export function setPos(g, id, pos) {
  const n = g.nodes[id];
  if (!n) return;
  if (!n.parent) {
    const d = sub(pos, n.pos);
    for (const m of allNodes(g)) m.pos = add(m.pos, d);
    g.biscuit.pos = g.nodes[id].pos.slice();
    return;
  }
  n.pos = [pos[0], pos[1], pos[2]];
  syncFrom(g, id);
}

/** Knoten in seiner Arbeitsebene verschieben: der Anteil senkrecht zur
    Ebene wird verworfen. */
export function moveInPlane(g, id, target) {
  const n = g.nodes[id];
  if (!n) return;
  const nn = planeNormal(g, n);
  setPos(g, id, addScaled(target, nn, -dot(sub(target, n.pos), nn)));
}

export function setField(g, id, key, value) {
  const n = g.nodes[id];
  if (!n) return;
  if (key === 'gate') Object.assign(n.gate, value);
  else n[key] = value;
  syncFrom(g, id);
}

/* ── Speichern und Laden ─────────────────────────────────────── */

export function toJSON(g) {
  const nodes = allNodes(g).map(n => {
    const o = { id: n.id, type: n.type, parent: n.parent, children: n.children.slice(),
      pos: n.pos.map(v => +v.toFixed(4)), tilt: n.tilt.slice(),
      w: +n.w.toFixed(4), h: +n.h.toFixed(4) };
    if (n.ratio !== undefined) o.ratio = n.ratio;
    if (n.mirror !== undefined) o.mirror = n.mirror;
    if (n.gate) o.gate = { ...n.gate };
    if (n.follower) o.follower = true;
    return o;
  });
  return {
    format: FORMAT, version: FORMAT_VERSION,
    biscuit: { ...g.biscuit, pos: g.biscuit.pos.slice() },
    draft: g.draft, radius: g.radius, tension: g.tension, step: g.step,
    rootId: g.rootId, nodes
  };
}

export function fromJSON(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Angussdatei (Kennung „' + FORMAT + '" fehlt).');
  if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
  const g = emptyGraph();
  Object.assign(g.biscuit, obj.biscuit || {});
  if (!AXES[g.biscuit.axis]) g.biscuit.axis = '+y';
  for (const k of ['draft', 'radius', 'tension', 'step']) if (Number.isFinite(obj[k])) g[k] = obj[k];
  const list = Array.isArray(obj.nodes) ? obj.nodes : [];
  if (!list.length) throw new Error('Die Datei enthält keine Knoten.');
  for (const n of list) {
    g.nodes[n.id] = {
      id: n.id, type: TYPES[n.type] ? n.type : 'point',
      parent: n.parent || null, children: Array.isArray(n.children) ? n.children.slice() : [],
      pos: (n.pos || [0, 0, 0]).map(Number), tilt: (n.tilt || [0, 0]).map(Number),
      w: Number(n.w) || 10, h: Number(n.h) || 6
    };
    if (n.ratio !== undefined) g.nodes[n.id].ratio = clamp(Number(n.ratio) || 0.5, 0.05, 0.95);
    if (n.mirror !== undefined) g.nodes[n.id].mirror = !!n.mirror;
    if (n.gate) g.nodes[n.id].gate = { h: 2, len: 4, w: 20, auto: true, transition: 'ende', ...n.gate };
    if (n.follower) g.nodes[n.id].follower = true;
    const num = +String(n.id).replace(/\D/g, '');
    if (Number.isFinite(num)) g.seq = Math.max(g.seq, num);
  }
  /* Verwaiste Verweise entfernen — eine von Hand bearbeitete Datei soll
     die Seite nicht töten, sondern so weit wie möglich funktionieren. */
  for (const n of Object.values(g.nodes)) {
    n.children = n.children.filter(c => g.nodes[c] && g.nodes[c].parent === n.id);
    if (n.parent && !g.nodes[n.parent]) n.parent = null;
  }
  g.rootId = obj.rootId && g.nodes[obj.rootId] ? obj.rootId
    : (Object.values(g.nodes).find(n => !n.parent) || {}).id;
  if (!g.rootId) throw new Error('Die Datei hat keinen Wurzelknoten.');
  g.nodes[g.rootId].type = 'root';
  g.nodes[g.rootId].pos = g.biscuit.pos.slice();
  return normalizeMirrors(g);
}
