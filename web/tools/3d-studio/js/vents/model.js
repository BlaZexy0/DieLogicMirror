/* Der Überlaufplan: Überläufe und Entlüftungen am Bauteil.

   Eine Druckgießform füllt sich in Millisekunden; die Luft in der
   Kavität muss in derselben Zeit hinaus. Dafür sitzen am Ende des
   Fließwegs — dort, wo die Schmelze zuletzt ankommt — Überlaufbohnen:
   Taschen, über einen dünnen Steg mit dem Bauteil verbunden. Sie nehmen
   die erste, kalte und oxidhaltige Front auf, und von ihnen führen
   flache Entlüftungskanäle die Luft weiter zum Formrand oder in ein
   Waschbrett (Chill-Vent), in dessen Wellen die Schmelze erstarrt, bevor
   sie hinaus kann.

   Der Plan ist eine Liste solcher Elemente. Jedes sitzt auf der
   Bauteiloberfläche und richtet sich nach ihr: die nach außen gerichtete
   Flächennormale ist seine HOCHACHSE — die offene Seite von Steg, Bohne
   und Kanal zeigt dorthin, die Tiefe wächst entgegen. Das Element selbst
   liegt IN der Wandebene; wohin es in ihr weist, sagt die Drehung um die
   Normale. Was daraus an Geometrie wird, rechnet js/vents/geom.js;
   dieses Modul kennt kein Three.js und läuft in den Tests unter Node. */

import { add, cross, norm, dot, rotate, rad } from '../runner/vec.js';

export const FORMAT = 'dielogic-luft';
export const FORMAT_VERSION = 2;

/** Die Arten — Farbe für Griff, Pfeil und Körper; Vorgaben in mm. */
export const TYPES = {
  bohne: {
    label: 'Überlaufbohne', color: '#e07b39',
    hint: 'Tasche am Ende des Fließwegs: sammelt die erste, kalte und oxidhaltige Schmelze.',
    params: { stegW: 10, stegH: 1.0, stegL: 3, wellW: 14, wellL: 22, wellD: 6, draft: 5, wellR: 1.5 }
  },
  entlueftet: {
    label: 'Überlauf mit Entlüftung', color: '#2e6da4',
    hint: 'Bohne mit flachem Entlüftungskanal, der die Luft weiter zum Formrand führt.',
    params: { stegW: 10, stegH: 1.0, stegL: 3, wellW: 14, wellL: 22, wellD: 6, draft: 5, wellR: 1.5, ventW: 12, ventH: 0.15, ventL: 30 }
  },
  waschbrett: {
    label: 'Waschbrett (Chill-Vent)', color: '#9a77e8',
    hint: 'Gewellter Kanal: die Schmelze erstarrt in den Wellen, die Luft kommt hindurch.',
    params: { stegW: 30, stegH: 0.8, stegL: 3, poolL: 10, poolH: 2.5, ventW: 40, ventH: 0.5, waves: 7, amp: 3, waveL: 6 }
  },
  schlitz: {
    label: 'Entlüftungsschlitz', color: '#4c9f70',
    hint: 'Nur der flache Kanal, ohne Bohne — wo Luft hinaus muss, aber nichts gesammelt wird.',
    params: { ventW: 12, ventH: 0.15, ventL: 20 }
  }
};

/** Bezeichnung, Grenzen und Einheit je Maß — für die Felder im Auswahlfeld. */
export const PARAM_META = {
  stegW: { label: 'Stegbreite', min: 1, max: 200, unit: 'mm' },
  stegH: { label: 'Steghöhe', min: 0.2, max: 5, unit: 'mm' },
  stegL: { label: 'Stegtiefe', min: 0.5, max: 30, unit: 'mm' },
  wellW: { label: 'Bohnenbreite', min: 3, max: 120, unit: 'mm' },
  wellL: { label: 'Bohnenlänge', min: 3, max: 200, unit: 'mm' },
  wellD: { label: 'Bohnentiefe', min: 0.5, max: 40, unit: 'mm' },
  draft: { label: 'Entformschräge', min: 0, max: 20, unit: '°' },
  wellR: { label: 'Bodenradius', min: 0, max: 20, unit: 'mm' },
  poolL: { label: 'Sammler-Länge', min: 1, max: 60, unit: 'mm' },
  poolH: { label: 'Sammler-Höhe', min: 0.3, max: 15, unit: 'mm' },
  ventW: { label: 'Kanalbreite', min: 1, max: 300, unit: 'mm' },
  ventH: { label: 'Kanalhöhe', min: 0.05, max: 3, unit: 'mm' },
  ventL: { label: 'Kanallänge', min: 1, max: 400, unit: 'mm' },
  waves: { label: 'Wellen', min: 1, max: 30, step: 1, unit: '' },
  amp: { label: 'Wellenhöhe', min: 0.5, max: 20, unit: 'mm' },
  waveL: { label: 'Wellenlänge', min: 1, max: 60, unit: 'mm' }
};

export function emptyPlan() {
  return { format: FORMAT, version: FORMAT_VERSION, items: {}, seq: 0 };
}

export const allItems = plan => Object.values(plan.items);

const unit = d => {
  const u = norm(d);
  return (u[0] || u[1] || u[2]) ? u : [1, 0, 0];
};

/** Element anlegen: `dir` ist die nach AUSSEN gerichtete Flächennormale
    am Ort — die Hochachse des Elements. Wer die nach innen gerichtete
    hat, negiert sie. */
export function addItem(plan, type, pos, dir) {
  const t = TYPES[type] ? type : 'bohne';
  const it = {
    id: 'l' + (++plan.seq), type: t,
    pos: pos.slice(0, 3), dir: unit(dir), rot: 0,
    p: { ...TYPES[t].params }
  };
  plan.items[it.id] = it;
  return it;
}

export function removeItem(plan, id) { delete plan.items[id]; }

/** Art wechseln — Maße, die die neue Art auch hat, bleiben. */
export function setType(plan, id, type) {
  const it = plan.items[id];
  if (!it || !TYPES[type]) return;
  const next = { ...TYPES[type].params };
  for (const k of Object.keys(next)) if (it.p[k] !== undefined) next[k] = it.p[k];
  it.type = type;
  it.p = next;
}

export function setPos(plan, id, pos) {
  const it = plan.items[id];
  if (it) it.pos = pos.slice(0, 3);
}

/** Ort und Richtung neu setzen (der Klick auf den Pfeil, dann aufs
    Bauteil). Die Drehung bleibt: sie ist eine Absicht. */
export function placeAt(plan, id, pos, dir) {
  const it = plan.items[id];
  if (!it) return;
  it.pos = pos.slice(0, 3);
  it.dir = unit(dir);
}

export function setRot(plan, id, deg) {
  const it = plan.items[id];
  if (it) it.rot = Math.max(-180, Math.min(180, Number(deg) || 0));
}

/**
 * Das lokale Dreibein eines Elements: n „oben" ist die Flächennormale
 * nach außen (dorthin liegt die offene Seite von Steg und Bohne, die
 * Tiefe wächst nach −n), d die Längsrichtung IN der Wandebene, r quer.
 * Um n gedreht mit `rot`. Rechtshändig: x = d, y = r, z = n.
 *
 * Woher die Längsrichtung ohne Trennebene kommt: von der Weltachse, die
 * am wenigsten mit n zusammenfällt, in die Ebene gelegt — so gibt es
 * keine Stelle, an der das Dreibein umkippt, und zwei benachbarte
 * Elemente auf derselben Wand liegen gleich. Ein Element, das entlang
 * der Normalen von der Wand abstünde, wäre ein Turm, kein Überlauf: die
 * Bohne liegt in der Trennebene, und die ist hier die Wand.
 */
export function frameOf(item) {
  const n = unit(item.dir);
  const ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  let d = norm(cross(cross(n, ref), n));                      // ref in die Ebene gelegt
  const a = rad(item.rot || 0);
  if (a) d = rotate(d, n, a);
  const r = norm(cross(n, d));
  return { o: item.pos, d, r, n };
}

/** Lokale Koordinaten (x längs der Achse, y quer, z „oben") → Welt. */
export const toWorld = (f, x, y, z) => add(f.o, add(add([f.d[0] * x, f.d[1] * x, f.d[2] * x],
  [f.r[0] * y, f.r[1] * y, f.r[2] * y]), [f.n[0] * z, f.n[1] * z, f.n[2] * z]));

/* ── Speichern und Laden ─────────────────────────────────────── */

export function toJSON(plan) {
  return {
    format: FORMAT, version: FORMAT_VERSION,
    items: allItems(plan).map(it => ({
      id: it.id, type: it.type,
      pos: it.pos.map(v => +v.toFixed(4)), dir: it.dir.map(v => +v.toFixed(6)),
      rot: it.rot || 0, p: { ...it.p }
    }))
  };
}

export function fromJSON(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Überlaufdatei (Kennung „' + FORMAT + '" fehlt).');
  if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
  const plan = emptyPlan();
  for (const raw of Array.isArray(obj.items) ? obj.items : []) {
    const type = TYPES[raw.type] ? raw.type : 'bohne';
    const it = {
      id: String(raw.id || ('l' + (plan.seq + 1))), type,
      pos: (raw.pos || [0, 0, 0]).map(Number), dir: unit((raw.dir || [1, 0, 0]).map(Number)),
      rot: Number(raw.rot) || 0,
      p: { ...TYPES[type].params }
    };
    for (const k of Object.keys(it.p)) if (raw.p && Number.isFinite(Number(raw.p[k]))) it.p[k] = Number(raw.p[k]);
    plan.items[it.id] = it;
    const num = +it.id.replace(/\D/g, '');
    if (Number.isFinite(num)) plan.seq = Math.max(plan.seq, num);
  }
  return plan;
}

export { dot };
