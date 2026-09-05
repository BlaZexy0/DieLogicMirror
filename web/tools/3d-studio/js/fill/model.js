/* Der Füllplan: rechteckige Anschnitte auf dem Bauteil.

   Ein Anschnitt sitzt auf der Oberfläche — Ort ist der geklickte Punkt,
   Hochachse die nach außen gerichtete Flächennormale (die Schmelze
   tritt entgegen ein), das Rechteck liegt in der Wandebene: Breite quer,
   Höhe längs, gedreht um die Normale. Sein Anteil am Strom folgt seiner
   Fläche, solange man ihn nicht selbst setzt.

   Das Modul kennt kein Three.js; was daraus wird, rechnet
   js/fill/solve.js. */

import { add, cross, norm, dot, rotate, rad } from '../runner/vec.js';

export const FORMAT = 'dielogic-fuellung';
export const FORMAT_VERSION = 1;

export const COLOR = '#e07b39';
export const DEFAULTS = { w: 30, h: 2 };

export const PARAM_META = {
  w: { label: 'Breite', min: 1, max: 400, unit: 'mm' },
  h: { label: 'Höhe', min: 0.3, max: 40, unit: 'mm' },
  share: { label: 'Anteil', min: 1, max: 100, unit: '%' }
};

export function emptyPlan() {
  return { format: FORMAT, version: FORMAT_VERSION, items: {}, seq: 0, fillTime: 45, alpha: 0.5 };
}

export const allItems = plan => Object.values(plan.items);

const unit = v => {
  const u = norm(v);
  return (u[0] || u[1] || u[2]) ? u : [1, 0, 0];
};

/** Anschnitt anlegen: `normal` ist die nach AUSSEN gerichtete Normale. */
export function addInlet(plan, pos, normal, params = {}) {
  const it = {
    id: 'a' + (++plan.seq), pos: pos.slice(0, 3), n: unit(normal), rot: 0,
    w: params.w ?? DEFAULTS.w, h: params.h ?? DEFAULTS.h,
    share: null                                             // null: aus der Fläche
  };
  plan.items[it.id] = it;
  return it;
}

export function removeItem(plan, id) { delete plan.items[id]; }
export function setPos(plan, id, pos) { const it = plan.items[id]; if (it) it.pos = pos.slice(0, 3); }
export function placeAt(plan, id, pos, normal) {
  const it = plan.items[id];
  if (!it) return;
  it.pos = pos.slice(0, 3);
  it.n = unit(normal);
}
export function setRot(plan, id, deg) {
  const it = plan.items[id];
  if (it) it.rot = Math.max(-180, Math.min(180, Number(deg) || 0));
}

/** Dreibein: n nach außen, u quer (Breite), v längs (Höhe) — in der Wand. */
export function frameOf(item) {
  const n = unit(item.n);
  const ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  let v = norm(cross(cross(n, ref), n));
  const a = rad(item.rot || 0);
  if (a) v = rotate(v, n, a);
  const u = norm(cross(n, v));
  return { o: item.pos, n, u, v };
}

export const areaOf = item => item.w * item.h;

/** Anteile am Strom, Summe 1: eigene Anteile zählen, der Rest verteilt
    sich nach Fläche auf die übrigen. */
export function shares(plan) {
  const items = allItems(plan);
  const out = {};
  if (!items.length) return out;
  const fixed = items.filter(i => i.share !== null && i.share !== undefined);
  const free = items.filter(i => !(i.share !== null && i.share !== undefined));
  let used = 0;
  for (const i of fixed) { out[i.id] = Math.max(0, Math.min(1, i.share / 100)); used += out[i.id]; }
  const rest = Math.max(0, 1 - used);
  const area = free.reduce((a, i) => a + areaOf(i), 0);
  for (const i of free) out[i.id] = area > 0 ? rest * areaOf(i) / area : rest / free.length;
  const sum = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(out)) out[k] /= sum;
  return out;
}

/** Die vier Ecken des Rechtecks in der Welt (für die Anzeige). */
export function corners(item) {
  const f = frameOf(item);
  const hw = item.w / 2, hh = item.h / 2;
  const at = (a, b) => add(add(f.o, [f.u[0] * a, f.u[1] * a, f.u[2] * a]), [f.v[0] * b, f.v[1] * b, f.v[2] * b]);
  return [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)];
}

/* ── Speichern und Laden ─────────────────────────────────────── */

export function toJSON(plan) {
  const r4 = v => +v.toFixed(4);
  return {
    format: FORMAT, version: FORMAT_VERSION, fillTime: plan.fillTime, alpha: plan.alpha,
    items: allItems(plan).map(it => ({
      id: it.id, pos: it.pos.map(r4), n: it.n.map(v => +v.toFixed(6)), rot: it.rot || 0,
      w: it.w, h: it.h, ...(it.share !== null && it.share !== undefined ? { share: it.share } : {})
    }))
  };
}

export function fromJSON(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Fülldatei (Kennung „' + FORMAT + '" fehlt).');
  if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
  const plan = emptyPlan();
  if (Number.isFinite(obj.fillTime)) plan.fillTime = Math.max(1, Math.min(5000, Number(obj.fillTime)));
  if (Number.isFinite(obj.alpha)) plan.alpha = Math.max(0, Math.min(2, Number(obj.alpha)));
  for (const raw of Array.isArray(obj.items) ? obj.items : []) {
    const id = raw.id ? String(raw.id) : 'a' + (plan.seq + 1);
    const n = v => (Array.isArray(v) ? v.map(Number) : [0, 0, 0]);
    plan.items[id] = {
      id, pos: n(raw.pos), n: unit(n(raw.n)), rot: Number(raw.rot) || 0,
      w: Number(raw.w) || DEFAULTS.w, h: Number(raw.h) || DEFAULTS.h,
      share: Number.isFinite(Number(raw.share)) && raw.share !== undefined && raw.share !== null ? Number(raw.share) : null
    };
    const num = +id.replace(/\D/g, '');
    if (Number.isFinite(num)) plan.seq = Math.max(plan.seq, num);
  }
  return plan;
}

export { dot };
