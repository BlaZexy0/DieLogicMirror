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
  mirrorPoint, mirrorDir, rad, clamp
} from './vec.js';
import { ELEMENT } from '../part/colors.js';

export const FORMAT = 'dielogic-anguss';
export const FORMAT_VERSION = 1;

/* Die Grenzen der Werte, die eine Angussdatei trägt, [min, max] in mm (die
   Neigung in Grad, die Straffheit als Faktor). Dieselben gelten in den
   Feldern und Reglern des Angussdesigners (runner/tool.js, panel.js); beim
   Laden werden sie geklemmt. Vorher übernahm fromJSON die Werte einer Datei
   ungeprüft: Schrittweite 0,001, Neigung 89°, eine negative Kanalbreite. */
export const LIMITS = Object.freeze({
  draft: [0, 15], radius: [0, 20], branchR: [0, 40], tension: [0.3, 1.8], step: [0.2, 10], gateH: [0.3, 30],
  w: [1, 400], h: [0.4, 200], gateLen: [0, 60], gateW: [1, 600], biscuitD: [10, 400], biscuitT: [1, 300]
});
const within = (v, k) => clamp(v, LIMITS[k][0], LIMITS[k][1]);

/** Die sechs Hauptrichtungen — dieselbe Schreibweise wie js/solids.js. */
export const AXES = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1]
};

/** Knotenarten. Die Farbe ist zugleich die Farbe des Griffs im Viewport
    (js/part/colors.js, ELEMENT): Punkt, Verzweigung und Spiegelpunkt heben
    sich vom Anguss ab, der Punkt in der Hervorhebung, die Verzweigung im
    Violett der Maschine, der Spiegelpunkt in der hellen Hervorhebung; der
    Pressrest trägt seine Sachfarbe, der Anschnitt die des Werkzeugs. Sie
    folgt dem Farbschema. */
export const TYPES = {
  root:   { label: 'Pressrest', get color() { return ELEMENT.pressrest; } },
  point:  { label: 'Punkt', get color() { return ELEMENT.punkt; } },
  branch: { label: 'Verzweigung', get color() { return ELEMENT.verzweigung; } },
  mirror: { label: 'Spiegelpunkt', get color() { return ELEMENT.spiegelpunkt; } },
  gate:   { label: 'Anschnitt', get color() { return ELEMENT.anschnitt; } }
};

/**
 * Ein Anschnitt kann seine Richtung ans Bauteil binden: `aim` ist der
 * Einheitsvektor, in dem er MÜNDEN soll — hineingesetzt, indem man einen
 * Punkt auf dem Referenzbauteil anklickt (dann ist es dessen nach innen
 * gerichtete Flächennormale). Ohne `aim` folgt die Richtung wie bei jedem
 * anderen Punkt der Sehne vom Vorgänger, und genau das ist beim Anschnitt
 * falsch: er zeigt ins Bauteil, nicht dorthin, wo zufällig der Punkt
 * davor liegt. Wer den Vorgänger verschiebt, drehte den Anschnitt mit.
 */

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
  branchR: 4,        // Zwickelradius: Verrundung der Innenkante an jeder Gabelung, mm
  tension: 1.0,      // Straffheit der Splines
  step: 1.0,         // Abtastschritt entlang der Mittellinie, mm
  gateH: 2.0         // Anschnitthöhe, mm — Vorgabe für alle Anschnitte ohne eigene
};

export function emptyGraph() {
  return {
    format: FORMAT, version: FORMAT_VERSION,
    biscuit: { pos: [0, 0, 0], axis: '+y', d: 90, t: 25 },
    draft: DEF.draft, radius: DEF.radius, branchR: DEF.branchR, tension: DEF.tension, step: DEF.step,
    gateH: DEF.gateH,
    nodes: {}, rootId: null, seq: 0
  };
}

/* Eine neue id ist nie eine schon vergebene: aus einer Datei kann eine
   Kennung stammen, die der Zähler später selbst erreicht hätte. */
const newId = g => {
  let id;
  do { id = 'k' + (++g.seq); } while (g.nodes[id]);
  return id;
};

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
    /* Nur der Spiegelpunkt spiegelt von sich aus. Eine Verzweigung hat
       zwei eigenständige Äste; das Spiegel-Häkchen schaltet die
       Kopplung zu. Lange spiegelte auch sie von Anfang an — dann gab es
       zwei Knotenarten, die dasselbe taten. */
    n.mirror = type === 'mirror';
  }
  if (type === 'gate') {
    n.gate = { h: g.gateH || DEF.gateH, hAuto: true, len: 4, w: 20, auto: true, transition: 'ende' };
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
  /* Eine gespiegelte Gabelung hat genau zwei Äste. Ein dritter schaltete
     die Spiegelung stillschweigend ab (isMirrorBranch), und wer ihn später
     wieder entfernte, bekam sie zurück: das Nachziehen überschrieb dann,
     was an der anderen Seite inzwischen geändert war. */
  if (isMirrorBranch(p) && p.children.length >= 2) return null;
  let made;
  if (type === 'branch' || type === 'mirror') {
    made = makeNode(g, type, p, suggestPos(g, p));
    const a1 = makeNode(g, 'gate', made, suggestPos(g, made, 30));
    const a2 = makeNode(g, 'gate', made, suggestPos(g, made, -30));
    a1.w = a2.w = made.w * 0.55; a1.h = a2.h = made.h * 0.8;
  } else {
    made = makeNode(g, type, p, suggestPos(g, p));
    if (type === 'gate') { made.w = p.w * 0.8; made.h = p.h * 0.7; }
  }
  /* Ein Punkt mit einem zweiten Abgang IST eine Verzweigung — geometrisch
     war er es schon (curve.js teilt den Zulauf, sweep.js baut das
     Hosenstück), nur fehlten ihm Aufteilung und Spiegel-Häkchen, und er
     teilte fest 50:50. Das Gegenstück steht in removeNode. */
  if (p.type === 'point' && p.children.length >= 2) {
    p.type = 'branch';
    p.ratio = 0.5;
    p.mirror = false;
  }
  /* Nachziehen ab dem Neuen: ein Spiegelpunkt legt seine Gegenseite an,
     und liegt der Neue auf der führenden Seite einer Spiegelung, bekommt
     die Gegenseite ihn SOFORT — nicht erst beim nächsten Zug. Sonst stand
     die Gabelung eine Weile nur auf einer Seite, und so wurde sie auch
     gespeichert. */
  syncFrom(g, made.id);
  return made;
}

/** Punkt zwischen einen Knoten und seinen Vorgänger einfügen. */
export function insertBefore(g, id, type = 'point') {
  const n = g.nodes[id], p = parentOf(g, id);
  if (!n || !p) return null;
  const mid = scale(add(n.pos, p.pos), 0.5);
  const m = makeNode(g, type, p, mid);
  /* makeNode hängt den Neuen HINTEN an; hier soll er aber an die Stelle
     des alten Kindes. Ohne das Herausnehmen stand er zweimal in der
     Liste — bei einer Verzweigung hatte sie danach drei Einträge, und
     drei Kinder sind für isMirrorBranch keine Gabelung mehr: die
     Spiegelung hörte stillschweigend auf zu arbeiten. */
  p.children = p.children.filter(c => c !== m.id);
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
  /* Eine Verzweigung ohne Gabelung ist keine mehr — und der Ast, der
     bleibt, ist keine nachgezogene Seite mehr: die Marke bestimmte sonst
     später, welche Seite führt, wenn hier wieder gespiegelt wird. */
  if ((p.type === 'branch' || p.type === 'mirror') && p.children.length < 2 && p.parent) {
    p.type = 'point';
    delete p.ratio; delete p.mirror;
    for (const c of p.children) if (g.nodes[c]) delete g.nodes[c].follower;
  }
  syncFrom(g, p.id);
  return true;
}

/* ── Spiegeln ────────────────────────────────────────────────── */

/* Eine Gabelung mit Spiegelung. Auch mit nur EINEM Kind: dann legt das
   Nachziehen die Gegenseite erst an — so beschreibt ein Beispiel oder
   eine Datei nur die eine Seite, und die andere entsteht daraus. */
export const isMirrorBranch = n => (n.type === 'branch' || n.type === 'mirror')
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
    /* Die gebundene Richtung wird an derselben Ebene gespiegelt wie die
       Lage — sonst zeigte die Gegenseite am Bauteil vorbei. */
    if (s.aim) d.aim = mirrorDir(s.aim, normal); else delete d.aim;
    /* Was die Quelle NICHT hat, hat die Kopie auch nicht: ein wieder-
       verwendeter Knoten behielt sonst das Verhältnis einer Verzweigung,
       die er längst nicht mehr ist — die Gegenseite teilte 80:20, die
       führende 50:50. */
    if (s.ratio !== undefined) d.ratio = s.ratio; else delete d.ratio;
    if (s.mirror !== undefined) d.mirror = s.mirror; else delete d.mirror;
    if (s.gate) d.gate = { ...s.gate }; else delete d.gate;
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

/** Ist der Knoten nur die nachgezogene Gegenseite einer Spiegelung?
    Solche Knoten bekommen keinen Griff — man bearbeitet die andere Seite.

    Gespiegelt wird an ZWEI Knotenarten: am Spiegelpunkt und an der
    Verzweigung mit gesetztem Spiegel-Häkchen. Hier stand lange nur der
    Spiegelpunkt — die Gegenseite einer spiegelnden VERZWEIGUNG galt
    damit als führend: ihre Griffe fingen Klicks ab, und wer den
    Zwilling anfasste, dessen Änderung wurde beim Nachziehen von der
    echten Seite wieder überschrieben. */
export function isFollower(g, id) {
  let n = g.nodes[id];
  while (n && n.parent) {
    const p = g.nodes[n.parent];
    if (isMirrorBranch(p) && n.follower) return true;
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

/**
 * Die Ausstoßrichtung umstellen und das System mitdrehen: um den
 * Pressrest, auf dem kürzesten Weg von der alten Achse zur neuen. Die
 * Trennebene kippt, und der Anguss liegt weiter in ihr — mit allem, was
 * eine Richtung hat: auch die ans Bauteil gebundenen Mündungen drehen mit.
 * Blieben sie stehen, zeigte nach dem Umschalten jeder gebundene
 * Anschnitt aus seiner Ebene heraus.
 * → { axis, ang } der Drehung, damit der Aufrufer das Bauteil mitdrehen
 *   kann; ang = 0 heißt: es gab nichts zu drehen.
 */
export function turnSystem(g, key) {
  const from = AXES[g.biscuit.axis], to = AXES[key];
  if (!from || !to) return { axis: [0, 0, 1], ang: 0 };
  let axis = cross(from, to);
  const ang = Math.acos(clamp(dot(from, to), -1, 1));
  if (len(axis) < 1e-9) axis = cross(from, Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  axis = norm(axis);
  if (ang > 1e-9) {
    const o = g.biscuit.pos;
    for (const n of allNodes(g)) {
      n.pos = add(o, rotate(sub(n.pos, o), axis, ang));
      if (n.aim) n.aim = norm(rotate(n.aim, axis, ang));
    }
  }
  g.biscuit.axis = key;
  setBiscuit(g, {});
  return { axis, ang };
}

/** Knoten in seiner Arbeitsebene verschieben: der Anteil senkrecht zur
    Ebene wird verworfen. */
export function moveInPlane(g, id, target) {
  const n = g.nodes[id];
  if (!n) return;
  const nn = planeNormal(g, n);
  setPos(g, id, addScaled(target, nn, -dot(sub(target, n.pos), nn)));
}

/** Anschnitt an einen Punkt des Bauteils setzen: dorthin rücken UND die
    Mündungsrichtung festhalten. Beides gehört zusammen — ein Anschnitt,
    der am richtigen Ort in die falsche Richtung zeigt, ist keiner. */
export function aimAt(g, id, point, dir) {
  const n = g.nodes[id];
  if (!n || n.type !== 'gate') return;
  const d = norm(dir);
  if (!len(d)) return;
  n.aim = d;
  /* Auf den Hundertstelmillimeter: ein Strahl trifft auf 1e-13 genau,
     und so stünde es dann im Feld und in der Datei. */
  n.pos = [point[0], point[1], point[2]].map(v => Math.round(v * 100) / 100);
  syncFrom(g, id);
}

/** Wie weit die gebundene Mündung aus der Arbeitsebene des Anschnitts
    herauszeigt, in Grad — 0 heißt: sie liegt in der Ebene. Ein Anschnitt
    liegt in der Trennebene und kann nur in ihr ins Bauteil münden; was
    steiler steht, ist in einer zweiteiligen Form nicht zu bauen. */
export function aimTilt(g, n) {
  if (!n || !n.aim) return 0;
  const c = Math.abs(dot(norm(n.aim), planeNormal(g, n)));
  return Math.asin(Math.min(1, c)) * 180 / Math.PI;
}

/** Die Anschnitthöhe des Systems: Vorgabe für jeden Anschnitt, der keine
    eigene hat (`gate.hAuto`). Die Höhe ist die dünnste Stelle des ganzen
    Systems und in aller Regel für alle Anschnitte dieselbe — sie
    zehnmal einzutippen ist Arbeit ohne Gewinn. Wer einem Anschnitt eine
    eigene Höhe gibt, nimmt ihn aus der Vorgabe heraus. */
export function setGateHeight(g, h) {
  g.gateH = h;
  for (const n of allNodes(g)) {
    if (n.type === 'gate' && n.gate && n.gate.hAuto) n.gate.h = h;
  }
  return g;
}

/** Bindung lösen — die Richtung folgt wieder der Sehne vom Vorgänger. */
export function clearAim(g, id) {
  const n = g.nodes[id];
  if (!n || !n.aim) return;
  delete n.aim;
  syncFrom(g, id);
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
    if (n.aim) o.aim = n.aim.map(v => +v.toFixed(6));
    if (n.follower) o.follower = true;
    return o;
  });
  return {
    format: FORMAT, version: FORMAT_VERSION,
    biscuit: { ...g.biscuit, pos: g.biscuit.pos.slice() },
    draft: g.draft, radius: g.radius, branchR: g.branchR, tension: g.tension, step: g.step,
    gateH: g.gateH,
    rootId: g.rootId, nodes
  };
}

/* Kennungen kommen aus der Datei und landen in der Seite: in der Kopfzeile
   des Auswahlfelds, in den Sätzen der Prüfliste, in der Tabelle der
   Angussfüllung. Erlaubt ist, was das Werkzeug selbst vergibt („k12"), und
   was ein Mensch sinnvoll hineinschreibt: ein Buchstabe, dann Buchstaben,
   Ziffern, _ und -, höchstens 32 Zeichen. Eine Datei mit anderen Kennungen
   wird abgewiesen, nicht umgeschrieben — eine Kennung mit spitzen Klammern
   ist kein Tippfehler. Die Namen, die jedes Objekt schon mitbringt
   („constructor", „toString"), sind ebenfalls keine: nachgeschlagen in
   `nodes`, fände man sonst etwas, das nie gespeichert war. */
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const validId = id => typeof id === 'string' && ID.test(id) && !(id in Object.prototype);
const ID_RULE = 'erlaubt sind Buchstaben, Ziffern, „_" und „-", vorn ein Buchstabe, höchstens 32 Zeichen';

/* Zahlen aus der Datei: endlich, sonst die Vorgabe — eine Zeichenkette oder
   ein fehlender Wert rechnete sich sonst als NaN durch die ganze Kette. */
const num = (v, def) => {
  const x = typeof v === 'string' ? (v.trim() ? Number(v) : NaN) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : def;
};
const vec = (a, n, def) => (Array.isArray(a) && a.length === n ? a.map((v, i) => num(v, def[i])) : def.slice());
const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);

export function fromJSON(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Angussdatei (Kennung „' + FORMAT + '" fehlt).');
  if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
  const g = emptyGraph();
  const b = obj.biscuit && typeof obj.biscuit === 'object' ? obj.biscuit : {};
  g.biscuit.pos = vec(b.pos, 3, [0, 0, 0]);
  g.biscuit.axis = own(AXES, b.axis) ? b.axis : '+y';
  g.biscuit.d = within(num(b.d, 90), 'biscuitD');
  g.biscuit.t = within(num(b.t, 25), 'biscuitT');
  /* Ältere Dateien kennen den Zwickelradius nicht — dann gilt die Vorgabe. */
  for (const k of ['draft', 'radius', 'branchR', 'tension', 'step', 'gateH']) if (Number.isFinite(obj[k])) g[k] = within(obj[k], k);
  const list = Array.isArray(obj.nodes) ? obj.nodes : [];
  if (!list.length) throw new Error('Die Datei enthält keine Knoten.');
  if (obj.rootId !== undefined && obj.rootId !== null && !validId(obj.rootId)) {
    throw new Error('Der Wurzelknoten der Datei hat eine ungültige Kennung: ' + ID_RULE + '.');
  }
  list.forEach((n, i) => {
    const where = 'Knoten Nr. ' + (i + 1);
    if (!n || typeof n !== 'object') throw new Error(where + ' der Datei ist kein Knoten.');
    if (!validId(n.id)) throw new Error(where + ' der Datei hat eine ungültige Kennung: ' + ID_RULE + '.');
    if (own(g.nodes, n.id)) throw new Error('Die Kennung „' + n.id + '" kommt in der Datei zweimal vor.');
    const kids = Array.isArray(n.children) ? n.children : [];
    const parent = n.parent === '' || n.parent === undefined ? null : n.parent;
    if ((parent !== null && !validId(parent)) || !kids.every(validId)) {
      throw new Error(where + ' der Datei (' + n.id + ') verweist auf eine ungültige Kennung: ' + ID_RULE + '.');
    }
    const node = g.nodes[n.id] = {
      id: n.id, type: own(TYPES, n.type) ? n.type : 'point',
      parent, children: [...new Set(kids)],
      pos: vec(n.pos, 3, [0, 0, 0]), tilt: vec(n.tilt, 2, [0, 0]),
      w: within(num(n.w, 0) || 10, 'w'), h: within(num(n.h, 0) || 6, 'h')
    };
    if (n.ratio !== undefined) node.ratio = clamp(num(n.ratio, 0.5) || 0.5, 0.05, 0.95);
    if (n.mirror !== undefined) node.mirror = !!n.mirror;
    if (n.gate && typeof n.gate === 'object') {
      const s = n.gate;
      const gate = {
        h: within(num(s.h, g.gateH), 'gateH'), len: within(num(s.len, 4), 'gateLen'), w: within(num(s.w, 20), 'gateW'),
        auto: s.auto === undefined ? true : !!s.auto,
        /* Auch der Übergang ist ein Wort aus der Datei: nur die bekannten. */
        transition: own(TRANSITIONS, s.transition) ? s.transition : 'ende'
      };
      /* Ältere Dateien kennen die Vorgabe nicht: was auf der Vorgabe
         steht, folgt ihr; was davon abweicht, ist eine eigene Höhe. */
      gate.hAuto = s.hAuto === undefined ? Math.abs(gate.h - g.gateH) < 1e-9 : !!s.hAuto;
      node.gate = gate;
    }
    if (Array.isArray(n.aim) && n.aim.length === 3) {
      const a = vec(n.aim, 3, [0, 0, 0]);
      if (len(a) > 1e-12) node.aim = norm(a);
    }
    if (n.follower) node.follower = true;
    const k = Number(n.id.replace(/\D/g, '') || 0);
    if (Number.isSafeInteger(k)) g.seq = Math.max(g.seq, k);
  });
  /* Verwaiste Verweise entfernen — eine von Hand bearbeitete Datei soll
     die Seite nicht töten, sondern so weit wie möglich funktionieren. */
  for (const n of Object.values(g.nodes)) {
    n.children = n.children.filter(c => own(g.nodes, c) && g.nodes[c].parent === n.id);
    if (n.parent && !own(g.nodes, n.parent)) n.parent = null;
  }
  g.rootId = own(g.nodes, obj.rootId) ? obj.rootId
    : (Object.values(g.nodes).find(n => !n.parent) || {}).id;
  if (!g.rootId) throw new Error('Die Datei hat keinen Wurzelknoten.');
  const r = g.nodes[g.rootId];
  /* Die Wurzel hat keinen Vorgänger — auch dann nicht, wenn die Datei im
     Kreis verweist; und was von ihr aus nicht zu erreichen ist, gehört
     nicht zum System (ein Ring aus Knoten ließe jeden Weg nach oben nie
     enden). */
  if (r.parent && own(g.nodes, r.parent)) g.nodes[r.parent].children = g.nodes[r.parent].children.filter(c => c !== r.id);
  r.parent = null;
  r.type = 'root';
  r.pos = g.biscuit.pos.slice();
  const reach = new Set(allNodes(g).map(n => n.id));
  for (const id of Object.keys(g.nodes)) if (!reach.has(id)) delete g.nodes[id];
  for (const n of Object.values(g.nodes)) {
    if (n.type === 'root' && n.id !== r.id) n.type = 'point';
    /* Dieselben Regeln wie beim Bearbeiten: ein Punkt mit zwei Abgängen
       ist eine Verzweigung (addChild), eine Spiegelung hat genau zwei Äste. */
    if (n.type === 'point' && n.children.length >= 2) {
      n.type = 'branch';
      if (n.ratio === undefined) n.ratio = 0.5;
      if (n.mirror === undefined) n.mirror = false;
    }
    if (n.mirror && n.children.length > 2) n.mirror = false;
  }
  return normalizeMirrors(g);
}
