/* Der Füllplan: rechteckige Anschnitte auf dem Bauteil.

   Ein Anschnitt sitzt auf der Oberfläche — Ort ist der geklickte Punkt,
   Hochachse die nach außen gerichtete Flächennormale (die Schmelze
   tritt entgegen ein), das Rechteck liegt in der Wandebene: Breite quer,
   Höhe längs, gedreht um die Normale. Sein Anteil am Strom folgt seiner
   Fläche, solange man ihn nicht selbst setzt.

   Das Modul kennt kein Three.js; was daraus wird, rechnet
   js/fill/solve.js. */

import { add, normOr, clamp, wallFrame } from '../runner/vec.js';
import { ELEMENT, onScheme } from '../part/colors.js';
import { checkFormat, fileIds, filePoint, fileNumber } from '../studio/planio.js';

export const FORMAT = 'dielogic-fuellung';
export const FORMAT_VERSION = 1;

/** Die Farbe des Anschnitts: er gehört zum Werkzeug (Sachfarbe `die`,
    js/part/colors.js), wie in den Diagrammen der Auslegung. Gelesen beim
    Malen — so gilt immer das Schema von jetzt, gleich wer bei einem
    Wechsel zuerst hinhört. */
export const inletColor = () => ELEMENT.anschnitt;
/** Nur noch für die Werkbank (js/werkbank/fill.js), bis sie auf die
    Bausteine der Werkzeuge umzieht: dieselbe Farbe als Variable, die ein
    Wechsel des Schemas nachzieht. */
export let COLOR = ELEMENT.anschnitt;
onScheme(() => { COLOR = ELEMENT.anschnitt; });
export const DEFAULTS = { w: 30, h: 2 };

export const PARAM_META = {
  w: { label: 'Breite', min: 1, max: 400, unit: 'mm' },
  h: { label: 'Höhe', min: 0.3, max: 40, unit: 'mm' },
  share: { label: 'Anteil', min: 1, max: 100, unit: '%' }
};

/** Der Regler der Dünnwand-Bremse (js/fill/panel.js) — und was eine Datei darf. */
export const ALPHA_RANGE = [0, 1];

/* Keine Füllzeit im Plan: die Rechnung kennt keine Zeit, und eine
   Umrechnung des Füllgrads in Millisekunden sagte nichts, was der
   Füllgrad nicht schon sagt. Ältere Dateien dürfen sie noch tragen. */
export function emptyPlan() {
  return { format: FORMAT, version: FORMAT_VERSION, items: {}, seq: 0, alpha: 0.5 };
}

export const allItems = plan => Object.values(plan.items);

const unit = v => normOr(v, [1, 0, 0]);

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

/** Dreibein: n nach außen, u quer (Breite), v längs (Höhe) — in der Wand
    (js/runner/vec.js, wallFrame: v ist dort d, u ist r). */
export function frameOf(item) {
  const { n, d, r } = wallFrame(unit(item.n), item.rot);
  return { o: item.pos, n, u: r, v: d };
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

/** Die vier Ecken des Rechtecks in der Welt — die Tests messen daran das
    Dreibein; den Körper im Bild baut js/fill/geom.js (inletBody). */
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
    format: FORMAT, version: FORMAT_VERSION, alpha: plan.alpha,
    items: allItems(plan).map(it => ({
      id: it.id, pos: it.pos.map(r4), n: it.n.map(v => +v.toFixed(6)), rot: it.rot || 0,
      w: it.w, h: it.h, ...(it.share !== null && it.share !== undefined ? { share: it.share } : {})
    }))
  };
}

/* Kennungen, Punkte und Zahlen aus der Datei prüft js/studio/planio.js —
   wie bei den anderen Plänen. */
export function fromJSON(obj) {
  checkFormat(obj, FORMAT, FORMAT_VERSION, 'Das ist keine Fülldatei (Kennung „' + FORMAT + '" fehlt).');
  const plan = emptyPlan();
  /* Werte in den Grenzen der Felder: der Regler von α reicht von 0 bis 1,
     ein Anteil von 1 bis 100 % — mehr soll auch aus einer Datei nicht kommen. */
  plan.alpha = fileNumber(obj.alpha, { min: ALPHA_RANGE[0], max: ALPHA_RANGE[1] }, plan.alpha);
  const list = Array.isArray(obj.items) ? obj.items : [];
  const { ids, seq } = fileIds(list, 'a', 'Anschnitt');
  list.forEach((raw, i) => {
    const id = ids[i];
    plan.items[id] = {
      id, pos: filePoint(raw.pos, 'Anschnitt ' + id), n: unit((Array.isArray(raw.n) ? raw.n : [1, 0, 0]).map(Number)),
      rot: clamp(Number(raw.rot) || 0, -180, 180),
      w: fileNumber(raw.w, PARAM_META.w, DEFAULTS.w), h: fileNumber(raw.h, PARAM_META.h, DEFAULTS.h),
      share: fileNumber(raw.share, PARAM_META.share, null)
    };
  });
  plan.seq = seq;
  return plan;
}
