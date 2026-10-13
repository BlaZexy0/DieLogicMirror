/* Der Plan der Simulation: alles, was die Schritte der Seite einstellen,
   an einem Ort — die Körper (aus Dateien, aus den Designern, das Bauteil),
   der Einlass, die Auslässe, Netz, Prozess, Auswertung.

   Ein Körper ist ein geschlossenes Dreiecksnetz in mm (Float64Array) mit
   einer ROLLE: part, runner, biscuit, overflow, other. Einlass und
   Auslässe merken sich ihren Körper und die Dreiecke ihrer Fläche; ändert
   sich das Netz des Körpers (ein Designer baut den Anguss neu), gelten sie
   nicht mehr und fallen weg. */

import { DEFAULTS } from './core/casegen.js';
import { defaultPost, normalizePost } from './core/render.js';
import { DEFAULT_SHOT } from './shot.js';

export const ROLES = [
  ['part', 'Bauteil'], ['runner', 'Anguss'], ['biscuit', 'Pressrest'], ['overflow', 'Überlauf'], ['other', 'Sonstiges']
];
export const roleLabel = r => (ROLES.find(x => x[0] === r) || [r, r])[1];

/** Die Rolle aus dem Namen raten (Gusstraube, die-Datei, Dateinamen). */
export function guessRole(name) {
  const n = String(name || '').toLowerCase();
  if (/pressrest|biscuit|tablette|cake/.test(n)) return 'biscuit';
  /* Überlauf vor Anguss: „Überlauf" enthält „lauf" */
  if (/überl|ueberl|overflow|vent|luft/.test(n)) return 'overflow';
  if (/anguss|runner|gate|lauf/.test(n)) return 'runner';
  if (/bauteil|part|cast|guss|teil/.test(n)) return 'part';
  return 'other';
}

/** Ein kleiner Fingerabdruck des Netzes: Länge und Stichproben. */
export function stamp(tris) {
  let h = tris.length;
  const step = Math.max(1, Math.floor(tris.length / 97));
  for (let i = 0; i < tris.length; i += step) h = (h * 31 + Math.round(tris[i] * 1000)) | 0;
  return h;
}

export function createPlan() {
  let seq = 0;
  const listeners = [];
  const plan = {
    title: 'Simulation',
    bodies: [],                 // { id, name, role, src, tris, include, stamp }
    inlet: null,                // { bodyId, stamp, faces, centroid, normal, area, radius, depth, depthAuto }
    outlets: [],                // { bodyId, stamp, faces, centroid, normal, area, mode, Cd }
    mesh: Object.assign({}, DEFAULTS.mesh, { level: 2 }),
    process: Object.assign({}, DEFAULTS.process),
    post: defaultPost(),
    shot: Object.assign({}, DEFAULT_SHOT),
    exported: false,

    on(fn) { listeners.push(fn); },
    changed(what) { plan.exported = false; for (const fn of listeners) fn(what); },

    body(id) { return plan.bodies.find(b => b.id === id) || null; },
    included() { return plan.bodies.filter(b => b.include && b.tris && b.tris.length >= 36); },
    has(role) { return plan.included().some(b => b.role === role); },

    /** Einen Körper setzen oder ersetzen (gleiche Quelle `src` und gleicher
        Schlüssel `key`: die Designer liefern ihren Körper immer wieder neu). */
    put({ key, name, role, src, tris, include = true }) {
      let b = key ? plan.bodies.find(x => x.key === key) : null;
      const st = stamp(tris);
      if (b) {
        if (b.stamp === st) return b;
        b.tris = tris; b.stamp = st; b.name = name || b.name;
      } else {
        b = { id: 'b' + (++seq), key: key || null, name, role: role || guessRole(name), src, tris, include, stamp: st };
        plan.bodies.push(b);
      }
      plan.dropStale();
      plan.changed('bodies');
      return b;
    },
    remove(id) {
      plan.bodies = plan.bodies.filter(b => b.id !== id);
      plan.dropStale();
      plan.changed('bodies');
    },
    /** Einlass und Auslässe, deren Körper fehlt, ausgeschlossen ist oder
        ein anderes Netz hat, fallen weg. */
    dropStale() {
      const ok = sel => { const b = sel && plan.body(sel.bodyId); return !!(b && b.include && b.stamp === sel.stamp); };
      if (plan.inlet && !ok(plan.inlet)) plan.inlet = null;
      plan.outlets = plan.outlets.filter(ok);
    },

    /** Die Einstellungen (ohne Netze) — Verlauf, Entwurf, Datei. */
    settings() {
      const sel = s => s && { bodyId: s.bodyId, stamp: s.stamp, faces: s.faces.slice(), centroid: s.centroid, normal: s.normal, area: s.area, radius: s.radius, depth: s.depth, depthAuto: s.depthAuto, mode: s.mode, Cd: s.Cd };
      return {
        title: plan.title,
        bodies: plan.bodies.map(b => ({ id: b.id, name: b.name, role: b.role, src: b.src, include: b.include, stamp: b.stamp, extra: b.extra, extraSet: b.extraSet })),
        inlet: sel(plan.inlet), outlets: plan.outlets.map(sel),
        mesh: Object.assign({}, plan.mesh), process: Object.assign({}, plan.process),
        shot: Object.assign({}, plan.shot), post: JSON.parse(JSON.stringify(plan.post))
      };
    },
    /** Einstellungen zurückholen; Körper bleiben, nur Rolle und „mit" folgen. */
    apply(s) {
      if (!s) return;
      if (s.title) plan.title = s.title;
      for (const m of s.bodies || []) {
        const b = plan.body(m.id) || plan.bodies.find(x => x.stamp === m.stamp && x.name === m.name);
        if (b) { b.role = m.role; b.include = m.include !== false; if (m.extraSet) { b.extra = m.extra; b.extraSet = true; } }
      }
      const map = sel => {
        if (!sel) return null;
        const b = plan.body(sel.bodyId) || plan.bodies.find(x => x.stamp === sel.stamp);
        return b && b.stamp === sel.stamp ? Object.assign({}, sel, { bodyId: b.id, faces: sel.faces.slice() }) : null;
      };
      plan.inlet = map(s.inlet);
      plan.outlets = (s.outlets || []).map(map).filter(Boolean);
      /* ein gespeicherter Plan von vor dem Vorschlag (13.10.) hat seine
         Zellgröße selbst gewählt: sie bleibt */
      if (s.mesh) Object.assign(plan.mesh, s.mesh, s.mesh.cell > 0 && s.mesh.cellSet === undefined ? { cellSet: true } : {});
      if (s.process) Object.assign(plan.process, s.process);
      if (s.shot) Object.assign(plan.shot, s.shot);
      if (s.post) plan.post = normalizePost(JSON.parse(JSON.stringify(s.post)));
      plan.changed('apply');
    }
  };
  return plan;
}

/** Die Werte der Auslegung des Projekts als Vorgabe für den Prozess. */
export function processFromProject(project) {
  try {
    const d = project && project.getSection && project.getSection('design');
    const v = d && d.values;
    if (!v) return {};
    const out = {};
    const take = (k, src) => { const x = Number(v[src]); if (isFinite(x) && x > 0) out[k] = x; };
    take('Tcast', 'Tcast'); take('Tdie', 'Tdie'); take('rho', 'density'); take('cp', 'cpL');
    take('hf', 'hf'); take('Tliq', 'Tliq'); take('Tsol', 'Tsol');
    /* Kolbengeschwindigkeit der 2. Phase: die größte der Schusskurve */
    if (Array.isArray(d.curve) && d.curve.length) {
      const vmax = Math.max(...d.curve.map(p => Number(p[1])).filter(isFinite));
      if (vmax > 0.5 && vmax < 20) out.v2 = vmax;
      const first = Number(d.curve[0] && d.curve[0][1]);
      if (first > 0 && first < out.v2) out.vStart = first;
    }
    return out;
  } catch { return {}; }
}
