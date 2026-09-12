/* Der Temperierplan: Kühlstiche und Kanäle um ein Bauteil.

   Eine Druckgießform wird temperiert, indem Bohrungen im Stahl von
   Wasser oder Öl durchströmt werden — Kanäle, die durch den Einsatz
   laufen, und Kühlstiche, Sacklöcher, die von der Rückseite bis kurz
   vor die Kavität reichen und dort mit einem Kern oder einer
   Sprudelröhre arbeiten. Was zählt, ist der Abstand zur Kavität: zu nah
   heißt Durchbruchgefahr und Risse, zu weit heißt, die Kühlung greift
   nicht. Deshalb werden die Elemente hier auf der ABSTANDSFLÄCHE
   gesetzt — der Fläche, die überall denselben Abstand zum Bauteil hat.

   Zwei Arten:
     stich   Kühlstich: Spitze (halbkugelig, wie das Ende eines Bohrers)
             am gesetzten Punkt, von dort um `len` entlang `dir` vom
             Bauteil weg. Durchmesser `d`.
     kanal   gerader Kanal zwischen zwei Punkten a und b, ebene Enden.
             Durchmesser `d`.

   Das Modul kennt kein Three.js; die Körper baut js/cooling/geom.js. */

import { add, sub, norm, len, addScaled } from '../runner/vec.js';

export const FORMAT = 'dielogic-temperier';
export const FORMAT_VERSION = 1;

export const TYPES = {
  stich: { label: 'Kühlstich', color: '#e07b39', params: { d: 20, len: 200 } },
  kanal: { label: 'Kanal', color: '#2e6da4', params: { d: 10 } }
};

export const PARAM_META = {
  d: { label: 'Durchmesser', min: 2, max: 60, unit: 'mm' },
  len: { label: 'Länge', min: 5, max: 1000, unit: 'mm' }
};

/** Wie die Richtung eines Kühlstichs beim Setzen bestimmt wird. */
export const DIRECTIONS = {
  normal: { label: 'Normale', hint: 'senkrecht zur Abstandsfläche, vom Bauteil weg' },
  blick:  { label: 'Blick', hint: 'auf die Kamera zu — so, wie man gerade schaut' },
  x: { label: 'X', hint: 'entlang X, vom Bauteil weg' },
  y: { label: 'Y', hint: 'entlang Y, vom Bauteil weg' },
  z: { label: 'Z', hint: 'entlang Z, vom Bauteil weg' }
};

export function emptyPlan() {
  return { format: FORMAT, version: FORMAT_VERSION, dist: 20, items: {}, seq: 0 };
}

export const allItems = plan => Object.values(plan.items);

const unit = v => {
  const u = norm(v);
  return (u[0] || u[1] || u[2]) ? u : [0, 0, 1];
};

/**
 * Richtung eines Kühlstichs aus der Wahl: `outward` ist die nach außen
 * gerichtete Normale der Abstandsfläche am Punkt, `toCamera` der
 * Einheitsvektor zur Kamera. Bei X/Y/Z zählt das Vorzeichen, das vom
 * Bauteil weg zeigt.
 */
export function directionFor(mode, outward, toCamera) {
  if (mode === 'blick' && toCamera) return unit(toCamera);
  const i = { x: 0, y: 1, z: 2 }[mode];
  if (i !== undefined) {
    const a = [0, 0, 0];
    a[i] = outward[i] < 0 ? -1 : 1;
    return a;
  }
  return unit(outward);
}

export function addStich(plan, p, dir, params = {}) {
  const it = {
    id: 't' + (++plan.seq), type: 'stich',
    p: p.slice(0, 3), dir: unit(dir),
    d: params.d ?? TYPES.stich.params.d, len: params.len ?? TYPES.stich.params.len
  };
  /* Automatisch gesetzte Stiche merken sich das — der nächste Lauf der
     Automatik räumt sie weg, von Hand gesetzte bleiben. */
  if (params.auto) it.auto = true;
  plan.items[it.id] = it;
  return it;
}

/** Alle automatisch gesetzten Stiche entfernen. */
export function removeAuto(plan) {
  for (const it of allItems(plan)) if (it.auto) delete plan.items[it.id];
}

export function addKanal(plan, a, b, params = {}) {
  const it = {
    id: 't' + (++plan.seq), type: 'kanal',
    a: a.slice(0, 3), b: b.slice(0, 3),
    d: params.d ?? TYPES.kanal.params.d
  };
  plan.items[it.id] = it;
  return it;
}

export function removeItem(plan, id) { delete plan.items[id]; }

/** Die Endpunkte eines Elements in der Welt: a am Bauteil, b außen. */
export function axisOf(item) {
  if (item.type === 'stich') return { a: item.p.slice(), b: addScaled(item.p, item.dir, item.len) };
  return { a: item.a.slice(), b: item.b.slice() };
}

export const lengthOf = item => (item.type === 'stich' ? item.len : len(sub(item.b, item.a)));

/**
 * Einen Endpunkt setzen. `end` ist 'p' beim Kühlstich (die Spitze), 'a'
 * oder 'b' beim Kanal. Mit `both` wandert das ganze Element um denselben
 * Versatz — der Kanal behält Länge und Richtung.
 */
export function setEnd(plan, id, end, pos, both = false) {
  const it = plan.items[id];
  if (!it) return;
  if (it.type === 'stich') { it.p = pos.slice(0, 3); return; }
  const key = end === 'a' ? 'a' : 'b';
  const delta = sub(pos, it[key]);
  it[key] = pos.slice(0, 3);
  if (both) {
    const other = key === 'a' ? 'b' : 'a';
    it[other] = add(it[other], delta);
  }
}

/** Ort und Richtung eines Kühlstichs neu setzen (der Pfeil, dann die Fläche). */
export function placeStich(plan, id, p, dir) {
  const it = plan.items[id];
  if (!it || it.type !== 'stich') return;
  it.p = p.slice(0, 3);
  it.dir = unit(dir);
}

/* ── Speichern und Laden ─────────────────────────────────────── */

export function toJSON(plan) {
  const r4 = v => +v.toFixed(4);
  return {
    format: FORMAT, version: FORMAT_VERSION, dist: plan.dist,
    items: allItems(plan).map(it => (it.type === 'stich'
      ? { id: it.id, type: 'stich', p: it.p.map(r4), dir: it.dir.map(v => +v.toFixed(6)), d: it.d, len: it.len, ...(it.auto ? { auto: true } : {}) }
      : { id: it.id, type: 'kanal', a: it.a.map(r4), b: it.b.map(r4), d: it.d }))
  };
}

export function fromJSON(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Temperierdatei (Kennung „' + FORMAT + '" fehlt).');
  if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
  const plan = emptyPlan();
  if (Number.isFinite(obj.dist)) plan.dist = Math.max(1, Math.min(200, Number(obj.dist)));
  for (const raw of Array.isArray(obj.items) ? obj.items : []) {
    const num = +String(raw.id || '').replace(/\D/g, '');
    const id = raw.id ? String(raw.id) : 't' + (plan.seq + 1);
    const n = v => (Array.isArray(v) ? v.map(Number) : [0, 0, 0]);
    if (raw.type === 'kanal') {
      plan.items[id] = { id, type: 'kanal', a: n(raw.a), b: n(raw.b), d: Number(raw.d) || TYPES.kanal.params.d };
    } else {
      plan.items[id] = { id, type: 'stich', p: n(raw.p), dir: unit(n(raw.dir)),
        d: Number(raw.d) || TYPES.stich.params.d, len: Number(raw.len) || TYPES.stich.params.len };
      if (raw.auto) plan.items[id].auto = true;
    }
    if (Number.isFinite(num)) plan.seq = Math.max(plan.seq, num);
  }
  return plan;
}
