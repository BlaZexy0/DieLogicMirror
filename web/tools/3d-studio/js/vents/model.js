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
export const FORMAT_VERSION = 3;

/* Der Entlüftungskanal des „Überlaufs mit Entlüftung" ist ein Zug von
   Punkten IN DER WANDEBENE des Elements, gemessen vom Ende der Bohne aus
   (x längs, y quer, in mm). Er beginnt an einer zweiten Kugel am Ende
   der Bohne; von dort werden die rechteckigen Kanäle Punkt für Punkt
   gezogen. Weil die Punkte in den Ebenenkoordinaten stehen, bleiben sie
   in der Ebene — beim Ziehen, beim Drehen, beim Versetzen der Bohne. */
export const VENT_DEFAULT = [[50, 0]];
export const VENT_STEP = 50;

/** Die Arten — Farbe für Griff, Pfeil und Körper; Vorgaben in mm.
    Die Vorgaben passen zu den Beispielteilen: Aluminium-Gussteile der
    1200-bis-1600-t-Klasse mit 4 mm Wand. Bohnen 28 × 40 × 10 mm an
    einem 20 mm breiten, 1,2 mm dicken Steg; Entlüftungskanäle 25 mm
    breit und 0,15 mm hoch (der Spalt hängt an der Legierung, nicht am
    Teil: dünn genug, dass kein Aluminium hindurchkommt); das Waschbrett
    80 mm breit. Kleinere Teile bekommen kleinere Maße im Auswahlfeld. */
export const TYPES = {
  bohne: {
    label: 'Überlaufbohne', color: '#e07b39',
    hint: 'Tasche am Ende des Fließwegs: sammelt die erste, kalte und oxidhaltige Schmelze.',
    params: { stegW: 20, stegH: 1.2, stegL: 4, wellW: 28, wellL: 40, wellD: 10, draft: 5, wellR: 2.5 }
  },
  entlueftet: {
    label: 'Überlauf mit Entlüftung', color: '#2e6da4',
    hint: 'Bohne mit flachem Entlüftungskanal: ab der Kugel am Bohnenende Punkt für Punkt in der Wandebene gezogen.',
    params: { stegW: 20, stegH: 1.2, stegL: 4, wellW: 28, wellL: 40, wellD: 10, draft: 5, wellR: 2.5, ventW: 25, ventH: 0.15 }
  },
  waschbrett: {
    label: 'Waschbrett (Chill-Vent)', color: '#9a77e8',
    hint: 'Gewellter Kanal: die Schmelze erstarrt in den Wellen, die Luft kommt hindurch.',
    params: { stegW: 60, stegH: 1.0, stegL: 4, poolL: 15, poolH: 3.5, ventW: 80, ventH: 0.6, waves: 9, amp: 4, waveL: 9 }
  },
  schlitz: {
    label: 'Entlüftungsschlitz', color: '#4c9f70',
    hint: 'Nur der flache Kanal, ohne Bohne — wo Luft hinaus muss, aber nichts gesammelt wird.',
    params: { ventW: 25, ventH: 0.15, ventL: 50 }
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
  if (t === 'entlueftet') it.vent = VENT_DEFAULT.map(q => q.slice());
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
  if (type === 'entlueftet' && !(it.vent && it.vent.length)) it.vent = VENT_DEFAULT.map(q => q.slice());
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

/** Welt → lokale Ebenenkoordinaten [x, y] (z fällt weg: in die Ebene gelotet). */
export const toLocal = (f, p) => {
  const v = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
  return [dot(v, f.d), dot(v, f.r)];
};

/* ── Der Entlüftungskanal ────────────────────────────────────── */

/** Lokale x-Lage des Bohnenendes — dort beginnt der Kanal. */
export const ventExitX = item => item.p.stegL + item.p.wellL;

/** Die Kanalpunkte eines Elements (lokal, ab dem Bohnenende). */
export const ventPoints = item => (item.type === 'entlueftet' ? (item.vent || VENT_DEFAULT) : []);

/** Bohnenende und Kanalpunkte in Weltkoordinaten. */
export function ventWorld(item) {
  const f = frameOf(item);
  const x0 = ventExitX(item);
  return {
    exit: toWorld(f, x0, 0, 0),
    points: ventPoints(item).map(q => toWorld(f, x0 + q[0], q[1], 0))
  };
}

/** Kanalpunkt k (1 = der erste nach der Bohne) aus einem Weltpunkt setzen —
    in die Wandebene gelotet, damit er in ihr bleibt. */
export function setVentPoint(plan, id, k, pos) {
  const it = plan.items[id];
  if (!it || it.type !== 'entlueftet' || !it.vent || k < 1 || k > it.vent.length) return false;
  const l = toLocal(frameOf(it), pos);
  it.vent[k - 1] = [l[0] - ventExitX(it), l[1]];
  return true;
}

/** Einen Punkt anhängen: in der Richtung des letzten Stücks weiter. */
export function addVentPoint(plan, id) {
  const it = plan.items[id];
  if (!it || it.type !== 'entlueftet') return -1;
  if (!it.vent) it.vent = [];
  const n = it.vent.length;
  const last = n ? it.vent[n - 1] : [0, 0];
  const prev = n > 1 ? it.vent[n - 2] : [0, 0];
  let dx = last[0] - prev[0], dy = last[1] - prev[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
  it.vent.push([last[0] + dx * VENT_STEP, last[1] + dy * VENT_STEP]);
  return it.vent.length;
}

/** Punkt k entfernen — der letzte bleibt, sonst hätte der Kanal kein Ende. */
export function removeVentPoint(plan, id, k) {
  const it = plan.items[id];
  if (!it || !it.vent || it.vent.length <= 1 || k < 1 || k > it.vent.length) return false;
  it.vent.splice(k - 1, 1);
  return true;
}

/* ── Speichern und Laden ─────────────────────────────────────── */

export function toJSON(plan) {
  return {
    format: FORMAT, version: FORMAT_VERSION,
    items: allItems(plan).map(it => ({
      id: it.id, type: it.type,
      pos: it.pos.map(v => +v.toFixed(4)), dir: it.dir.map(v => +v.toFixed(6)),
      rot: it.rot || 0, p: { ...it.p },
      ...(it.type === 'entlueftet' ? { vent: ventPoints(it).map(q => [+q[0].toFixed(3), +q[1].toFixed(3)]) } : {})
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
    if (type === 'entlueftet') {
      const pts = Array.isArray(raw.vent)
        ? raw.vent.map(q => [Number(q[0]), Number(q[1])]).filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1]))
        : [];
      /* Fassung 2 kannte nur eine Kanallänge längs der Bohne. */
      const oldL = raw.p && Number.isFinite(Number(raw.p.ventL)) ? Number(raw.p.ventL) : VENT_STEP;
      it.vent = pts.length ? pts : [[oldL, 0]];
    }
    plan.items[it.id] = it;
    const num = +it.id.replace(/\D/g, '');
    if (Number.isFinite(num)) plan.seq = Math.max(plan.seq, num);
  }
  return plan;
}

export { dot };
