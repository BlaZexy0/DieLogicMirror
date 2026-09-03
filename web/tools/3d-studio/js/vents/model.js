/* Der Luftbohnen-Plan: Überläufe und Entlüftungen am Bauteil.

   Eine Druckgießform füllt sich in Millisekunden; die Luft in der
   Kavität muss in derselben Zeit hinaus. Dafür sitzen am Ende des
   Fließwegs — dort, wo die Schmelze zuletzt ankommt — Überlaufbohnen:
   Taschen in der Trennebene, über einen dünnen Steg mit dem Bauteil
   verbunden. Sie nehmen die erste, kalte und oxidhaltige Front auf, und
   von ihnen führen flache Entlüftungskanäle die Luft weiter zum
   Formrand oder in ein Waschbrett (Chill-Vent), in dessen Wellen die
   Schmelze erstarrt, bevor sie hinaus kann.

   Der Plan ist eine Liste solcher Elemente. Jedes hat einen Ort auf der
   Bauteilwand, eine Richtung (vom Bauteil weg, in der Trennebene), eine
   Drehung um die Ausstoßachse und seine Maße. Was daraus an Geometrie
   wird, rechnet js/vents/geom.js; dieses Modul kennt kein Three.js und
   läuft in den Tests unter Node. */

import { add, sub, cross, norm, dot, rotate, addScaled, rad } from '../runner/vec.js';

export const FORMAT = 'dielogic-luft';
export const FORMAT_VERSION = 1;

export const AXES = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1]
};

/** Die Arten — Farbe für Griff, Pfeil und Körper; Vorgaben in mm. */
export const TYPES = {
  bohne: {
    label: 'Überlaufbohne', color: '#e07b39',
    hint: 'Tasche am Ende des Fließwegs: sammelt die erste, kalte und oxidhaltige Schmelze.',
    params: { stegW: 10, stegH: 1.0, stegL: 3, wellW: 14, wellL: 22, wellD: 6 }
  },
  entlueftet: {
    label: 'Überlauf mit Entlüftung', color: '#2e6da4',
    hint: 'Bohne mit flachem Entlüftungskanal, der die Luft weiter zum Formrand führt.',
    params: { stegW: 10, stegH: 1.0, stegL: 3, wellW: 14, wellL: 22, wellD: 6, ventW: 12, ventH: 0.15, ventL: 30 }
  },
  waschbrett: {
    label: 'Waschbrett (Chill-Vent)', color: '#9a77e8',
    hint: 'Gewellter Kanal: die Schmelze erstarrt in den Wellen, die Luft kommt hindurch.',
    params: { stegW: 30, stegH: 0.8, stegL: 3, ventW: 40, ventH: 0.5, waves: 7, amp: 3, waveL: 6 }
  },
  schlitz: {
    label: 'Entlüftungsschlitz', color: '#4c9f70',
    hint: 'Nur der flache Kanal, ohne Bohne — wo Luft hinaus muss, aber nichts gesammelt wird.',
    params: { ventW: 12, ventH: 0.15, ventL: 20 }
  }
};

/** Bezeichnung, Grenzen und Einheit je Maß — für die Felder im Auswahlfeld. */
export const PARAM_META = {
  stegW: { label: 'Stegbreite', min: 1, max: 200 },
  stegH: { label: 'Steghöhe', min: 0.2, max: 5 },
  stegL: { label: 'Stegtiefe', min: 0.5, max: 30 },
  wellW: { label: 'Bohnenbreite', min: 3, max: 120 },
  wellL: { label: 'Bohnenlänge', min: 3, max: 200 },
  wellD: { label: 'Bohnentiefe', min: 0.5, max: 40 },
  ventW: { label: 'Kanalbreite', min: 1, max: 300 },
  ventH: { label: 'Kanalhöhe', min: 0.05, max: 3 },
  ventL: { label: 'Kanallänge', min: 1, max: 400 },
  waves: { label: 'Wellen', min: 1, max: 30, step: 1 },
  amp: { label: 'Wellenhöhe', min: 0.5, max: 20 },
  waveL: { label: 'Wellenlänge', min: 1, max: 60 }
};

export function emptyPlan() {
  return { format: FORMAT, version: FORMAT_VERSION, axis: '+y', items: {}, seq: 0 };
}

export const allItems = plan => Object.values(plan.items);
export const normalOf = plan => AXES[plan.axis] || AXES['+y'];

/** Richtung in die Trennebene legen und normieren; ist nichts übrig
    (senkrecht getroffen), irgendeine Richtung in der Ebene. */
export function inPlane(plan, dir) {
  const n = normalOf(plan);
  let d = norm(addScaled(dir, n, -dot(dir, n)));
  if (!(d[0] || d[1] || d[2])) {
    const h = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    d = norm(cross(n, h));
  }
  return d;
}

/** Element anlegen: `dir` zeigt vom Bauteil WEG (dorthin wächst die
    Bohne); wer die nach innen gerichtete Normale hat, negiert sie. */
export function addItem(plan, type, pos, dir) {
  const t = TYPES[type] ? type : 'bohne';
  const it = {
    id: 'l' + (++plan.seq), type: t,
    pos: pos.slice(0, 3), dir: inPlane(plan, dir), rot: 0,
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
  it.dir = inPlane(plan, dir);
}

export function setRot(plan, id, deg) {
  const it = plan.items[id];
  if (it) it.rot = Math.max(-180, Math.min(180, Number(deg) || 0));
}

/** Das lokale Dreibein eines Elements: d in Fließrichtung (vom Bauteil
    weg, um `rot` gedreht), n die Ausstoßachse, r = n × d quer — ein
    rechtshändiges System (x = d, y = r, z = n). */
export function frameOf(plan, item) {
  const n = normalOf(plan);
  const d = norm(rotate(inPlane(plan, item.dir), n, rad(item.rot || 0)));
  return { o: item.pos, d, n, r: norm(cross(n, d)) };
}

/** Lokale Koordinaten (x längs, y quer, z auf der Achse) → Welt. */
export const toWorld = (f, x, y, z) => add(f.o, add(add([f.d[0] * x, f.d[1] * x, f.d[2] * x],
  [f.r[0] * y, f.r[1] * y, f.r[2] * y]), [f.n[0] * z, f.n[1] * z, f.n[2] * z]));

/* ── Speichern und Laden ─────────────────────────────────────── */

export function toJSON(plan) {
  return {
    format: FORMAT, version: FORMAT_VERSION, axis: plan.axis,
    items: allItems(plan).map(it => ({
      id: it.id, type: it.type,
      pos: it.pos.map(v => +v.toFixed(4)), dir: it.dir.map(v => +v.toFixed(6)),
      rot: it.rot || 0, p: { ...it.p }
    }))
  };
}

export function fromJSON(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Luftbohnen-Datei (Kennung „' + FORMAT + '" fehlt).');
  if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
  const plan = emptyPlan();
  if (AXES[obj.axis]) plan.axis = obj.axis;
  for (const raw of Array.isArray(obj.items) ? obj.items : []) {
    const type = TYPES[raw.type] ? raw.type : 'bohne';
    const it = {
      id: String(raw.id || ('l' + (plan.seq + 1))), type,
      pos: (raw.pos || [0, 0, 0]).map(Number), dir: inPlane(plan, (raw.dir || [1, 0, 0]).map(Number)),
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

/* ── Prüfregeln ──────────────────────────────────────────────── */

const fmt = (v, n = 2) => v.toLocaleString('de-DE', { maximumFractionDigits: n });

/** Was jeder Gießer über Überläufe und Entlüftungen im Kopf hat — als
    Liste mit Stufe, Titel und Satz, jeder Satz mit Ort und Zahl. */
export function checkPlan(plan) {
  const out = [];
  const add = (level, title, text) => out.push({ level, title, text });
  const items = allItems(plan);
  if (!items.length) {
    add('note', 'Noch keine Luftbohne',
      'Eine Art wählen und die Stelle am Bauteil anklicken, an der die Schmelze zuletzt ankommt.');
    return out;
  }
  const label = it => TYPES[it.type].label + ' ' + it.id;

  /* 1. Entlüftungskanäle: zu hoch, und die Schmelze läuft hinaus. Für
     Aluminium 0,10 bis 0,15 mm, Magnesium bis 0,2, Zink deutlich darunter. */
  let vent = null;
  for (const it of items) {
    if (it.p.ventH === undefined || it.type === 'waschbrett') continue;
    if (!vent || it.p.ventH > vent.p.ventH) vent = it;
  }
  if (vent && vent.p.ventH > 0.2) {
    add(vent.p.ventH > 0.3 ? 'bad' : 'warn', 'Entlüftungskanal zu hoch',
      label(vent) + ' hat ' + fmt(vent.p.ventH) + ' mm Kanalhöhe. Über 0,15 bis 0,2 mm läuft die '
      + 'Schmelze in den Kanal und aus der Form; die Luft muss durch einen Spalt, den sie nicht füllt.');
  } else if (vent) {
    add('ok', 'Entlüftungskanäle flach genug',
      'Höchste Kanalhöhe ' + fmt(vent.p.ventH) + ' mm — die Luft kommt hinaus, die Schmelze nicht.');
  }

  /* 2. Waschbrett: der Spalt darf größer sein, die Wellen kühlen — aber
     nicht beliebig. */
  for (const it of items) {
    if (it.type !== 'waschbrett') continue;
    if (it.p.ventH > 0.7) {
      add('warn', 'Waschbrett-Spalt weit',
        label(it) + ' hat ' + fmt(it.p.ventH) + ' mm Spalt. Üblich sind 0,3 bis 0,6 mm — darüber '
        + 'erstarrt die Schmelze nicht mehr in den Wellen, bevor sie hindurch ist.');
    }
    if (it.p.waves * it.p.waveL < 25) {
      add('warn', 'Waschbrett kurz',
        label(it) + ' ist nur ' + fmt(it.p.waves * it.p.waveL, 0) + ' mm lang. Die Schmelze braucht '
        + 'Weg, um in den Wellen zu erstarren; unter etwa 25 mm hält das Brett nicht dicht.');
    }
  }

  /* 3. Der Steg ist die Sollbruchstelle — und der Engpass für die Front. */
  for (const it of items) {
    if (it.p.stegH === undefined) continue;
    if (it.p.stegH > 1.5) {
      add('warn', 'Steg dick',
        label(it) + ': ' + fmt(it.p.stegH) + ' mm Steghöhe. Über 1,5 mm bricht die Bohne beim '
        + 'Putzen nicht mehr sauber ab und reißt das Bauteil an.');
    } else if (it.p.stegH < 0.5) {
      add('warn', 'Steg dünn',
        label(it) + ': ' + fmt(it.p.stegH) + ' mm Steghöhe. Unter 0,5 mm friert der Steg ein, '
        + 'bevor die Bohne voll ist — sie sammelt dann nichts.');
    }
  }

  /* 4. Die Bohne muss etwas fassen: zu flach oder zu klein bringt nichts. */
  for (const it of items) {
    if (it.p.wellD === undefined) continue;
    const v = it.p.wellW * it.p.wellL * it.p.wellD;
    if (v < 300) {
      add('warn', 'Bohne klein',
        label(it) + ' fasst nur rund ' + fmt(v / 1000, 2) + ' cm³. Eine Überlaufbohne soll die kalte '
        + 'Front aufnehmen — unter einem halben Kubikzentimeter ist sie voll, bevor die Front durch ist.');
    }
  }
  if (out.every(r => r.level === 'ok')) {
    add('ok', 'Stege und Bohnen im üblichen Maß', items.length + ' Element(e), nichts zu beanstanden.');
  }
  return out;
}
