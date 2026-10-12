/* Die Schusskurve der Simulation — mit den Generatoren der Auslegung
   (auslegung/js/core/curvegen.js), angewandt auf das MODELL: Kolben-Ø =
   Einlass (die Kreisfläche des Pressrests), Kammerlänge aus der Auslegung
   oder von Hand, Massen aus den Volumen der Körper je Rolle, Legierung und
   Temperaturen aus dem Prozess. Daraus Füllgrad, „Kammer voll", Füllende
   und die Kurve selbst — und was der Fall daraus braucht:

     ohne Kammer  die Rechnung beginnt bei „Kammer voll": der Pressrest ist
                  voll, der Kolben drückt über den Einlass mit v(t) ab dort
                  (inletTable: [t − t_voll, v])
     mit Kammer   die Rechnung beginnt beim Kolbenstart: die Schmelze liegt
                  mit dem Füllgrad φ in der Kammer, der Kolben fährt die
                  ganze Kurve (points: [s mm, v m/s], libshotSleeve)

   Nur auf der Seite (braucht den Zustand der Auslegung, window); der
   Worker bekommt das Ergebnis als Zahlen (payloadOf). */

import { state } from '../../auslegung/js/core/state.js';
import { generateCurve } from '../../auslegung/js/core/curvegen.js';
import { computeShot, rhoSolidus } from '../../auslegung/js/core/physics.js';
import { volume } from './core/geometry.js';

export const CURVE_MODES = [['focus', 'DieLogic'], ['lopez', 'López'], ['v1v2', 'V₁ / V₂']];
export const DEFAULT_SHOT = { mode: 'focus', chamber: false, length: null, kappa: 0.95, v1: 0.4, a1: 5, v2: 4, a2: 30 };

/** Die Kammerlänge, mit der gerechnet wird: von Hand, sonst die der Auslegung. */
export const chamberLength = shot => (shot.length > 0 ? shot.length : state.values.length);

/**
 * → { error } oder { v, points, shot (computeShot), phi, tFull, tEnd, sFull, sEnd,
 *     diam, length, depth, stroke, Vdose (mm³), inletTable, warn, events }
 */
export function shotPlan(plan) {
  const S = Object.assign({}, DEFAULT_SHOT, plan.shot || {});
  const inl = plan.inlet;
  if (!inl) return { error: 'Erst den Einlass wählen: er gibt den Kolben-Ø.' };
  const P = plan.process;
  const v = Object.assign({}, state.values, {
    density: P.rho, Tcast: P.Tcast, Tdie: P.Tdie, Tliq: P.Tliq, Tsol: P.Tsol, hf: P.hf, cpL: P.cp
  });
  v.diam = 2 * Math.sqrt(inl.area / Math.PI);
  v.length = chamberLength(S);
  const depth = inl.depth > 0 ? inl.depth : 0;
  if (!(v.length > depth + 1)) return { error: 'Die Kammer (' + Math.round(v.length) + ' mm) ist nicht länger als der Pressrest (' + Math.round(depth) + ' mm).' };
  /* Massen aus dem Modell: die Kavitäten sind feste Geometrie (ρ_sol) */
  const rho = rhoSolidus(v);
  const vol = role => plan.included().filter(b => b.role === role).reduce((s, b) => s + Math.abs(volume(b.tris)), 0);
  const biscuitV = vol('biscuit') || inl.area * depth;
  Object.assign(v, { part: vol('part') * 1e-9 * rho, runner: vol('runner') * 1e-9 * rho, overflow: vol('overflow') * 1e-9 * rho, biscuit: biscuitV * 1e-9 * rho });
  /* Ohne Anguss im Modell (Einlass am Bauteil) rechnet die Auslegung mit einem Hauch */
  if (!(v.runner > 0)) v.runner = 1e-6;
  const gen = generateCurve(v, { mode: S.mode, kappa: S.kappa, v1: S.v1, a1: S.a1, v2: S.v2, a2: S.a2 });
  if (gen.error) return { error: gen.error };
  let shot;
  try { shot = computeShot(v, gen.points); } catch (e) { return { error: String(e && e.message || e) }; }
  if (shot.error) return { error: shot.error };
  const full = shot.events[0], end = shot.events[3];
  if (!full.inP) return { error: 'Die Kurve endet vor „Kammer voll".' };
  const prof = shot.profile;
  const tFull = full.t, tEnd = end.inP ? end.t : prof.endTime;
  /* ab „Kammer voll": die Knoten des Profils (zwischen ihnen ist v linear in t) */
  const inletTable = [[0, full.v]];
  for (let k = 0; k < prof.t.length; k++) if (prof.t[k] > tFull + 1e-9) inletTable.push([prof.t[k] - tFull, prof.v[k]]);
  return {
    v, points: gen.points, shot, warn: gen.warn || null, events: shot.events,
    phi: shot.phi, tFull, tEnd, sFull: full.s, sEnd: end.s,
    diam: v.diam, length: v.length, depth, stroke: v.length - depth,
    Vdose: shot.Vdose * 1e9, inletTable,
    vAtPart: shot.events[2].inP ? shot.events[2].v : NaN,
    fillMs: shot.fill
  };
}

/** Kolbenweg über der Zeit (ab Kolbenstart) für render.py: [t s, s mm]. */
export function pistonTable(sp, n = 120) {
  const prof = sp.shot.profile, out = [];
  for (let i = 0; i <= n; i++) {
    const t = prof.endTime * i / n, q = prof.atTime(t);
    out.push([Number(t.toFixed(6)), Number((q.s * 1000).toFixed(3))]);
  }
  return out;
}

/** Die Kurve als kleines SVG: v über dem Kolbenweg, Ereignisse, der
    gerechnete Teil hervorgehoben (ohne Kammer: ab „Kammer voll"). */
export function curveSVG(sp, { chamber = false, width = 300, height = 150 } = {}) {
  const prof = sp.shot.profile;
  const smax = Math.max(prof.travel * 1000, sp.length);
  const vmax = Math.max(...prof.v) * 1.15 || 1;
  const L = 34, R = 8, T = 10, B = 24, W = width - L - R, H = height - T - B;
  const X = s => L + W * s / smax, Y = vv => T + H * (1 - vv / vmax);
  /* zwischen den Knoten: v² linear in s — fein abtasten */
  const pts = [];
  for (let i = 0; i <= 200; i++) { const s = prof.travel * i / 200; pts.push([s * 1000, prof.atPos(s).v]); }
  const path = pts.map(([s, vv], i) => (i ? 'L' : 'M') + X(s).toFixed(1) + ' ' + Y(vv).toFixed(1)).join(' ');
  const simFrom = chamber ? 0 : sp.sFull;
  const ev = sp.events.filter(e => e.inP).map((e, i) => '<line x1="' + X(e.s).toFixed(1) + '" x2="' + X(e.s).toFixed(1) + '" y1="' + T + '" y2="' + (T + H) + '" class="ev"/>'
    /* rechts am Rand nach links beschriften, damit nichts übersteht */
    + (X(e.s) > L + W - 28
      ? '<text x="' + (X(e.s) - 2).toFixed(1) + '" y="' + (T + 9 + 10 * (i % 2)) + '" class="evl" text-anchor="end">' + ['voll', 'Anguss', 'Teil', 'Überl.'][i] + '</text>'
      : '<text x="' + (X(e.s) + 2).toFixed(1) + '" y="' + (T + 9 + 10 * (i % 2)) + '" class="evl">' + ['voll', 'Anguss', 'Teil', 'Überl.'][i] + '</text>')).join('');
  const ticks = [0, 0.5, 1].map(f => '<text x="' + (L - 4) + '" y="' + (Y(vmax / 1.15 * f) + 3).toFixed(1) + '" class="ax" text-anchor="end">' + (vmax / 1.15 * f).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + '</text>').join('');
  return '<svg class="sim-curve" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Schusskurve: Kolbengeschwindigkeit über dem Kolbenweg">'
    + '<rect x="' + X(simFrom).toFixed(1) + '" y="' + T + '" width="' + (X(smax) - X(simFrom)).toFixed(1) + '" height="' + H + '" class="sim"/>'
    + '<line x1="' + L + '" x2="' + (L + W) + '" y1="' + (T + H) + '" y2="' + (T + H) + '" class="axl"/>'
    + '<line x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + (T + H) + '" class="axl"/>'
    + ev + ticks
    + '<path d="' + path + '" class="v"/>'
    + '<text x="' + (L + W) + '" y="' + (height - 6) + '" class="ax" text-anchor="end">Kolbenweg ' + Math.round(smax) + ' mm</text>'
    + '<text x="' + L + '" y="' + (height - 6) + '" class="ax">0</text>'
    + '<text x="2" y="' + (T + 8) + '" class="ax">m/s</text>'
    + '</svg>';
}
