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
import { computeShot, rhoSolidus, fillRatio, cavityTravel, total } from '../../auslegung/js/core/physics.js';
import { volume } from './core/geometry.js';

/* 1. Phase: das Gesetz bis „Kammer voll"; 2. Phase: V₂ automatisch (die
   Auslegung wählt es für die NADCA-Füllzeit, Rampe mit ihrem a_max) oder
   von Hand mit a₂. Mit V₁ von Hand ist auch V₂ von Hand. */
export const CURVE_MODES = [['focus', 'DieLogic'], ['lopez', 'López'], ['v1v2', 'V₁ von Hand']];
export const V2_MODES = [['auto', 'V₂ automatisch'], ['manual', 'V₂ von Hand']];
export const DEFAULT_SHOT = { mode: 'focus', chamber: false, length: null, kappa: 0.95, v1: 0.4, a1: 5, v2Mode: 'auto', v2: 4, a2: 30 };
/** Wird V₂ von Hand gesetzt? */
export const v2Manual = S => S.mode === 'v1v2' || S.v2Mode === 'manual';

/* Rampe v0 → v2 mit a ab s0, dann Plateau bis sEnd (wie die Auslegung: Weg
   aufgerundet, die Beschleunigung überschreitet a nie). → erreichtes v oder
   null, wenn v2 erreicht wird. s in mm, v in m/s, a in m/s². */
function rampTo(pts, v0, v2, s0, sEnd, a) {
  const end = Math.ceil(sEnd * 10) / 10;
  const ds = Math.max(Math.ceil(Math.abs(v2 * v2 - v0 * v0) / (2 * a) * 1e4) / 10 + 0.2, 1);
  if (s0 + ds < end - 0.5) { pts.push([s0 + ds, v2], [end, v2]); return null; }
  const up = v2 >= v0;
  const vv = Math.sqrt(Math.max(v0 * v0 + (up ? 2 : -2) * a * (end - s0) / 1000, 0));
  const vEnd = up ? Math.floor(vv * 1000) / 1000 : Math.ceil(vv * 1000) / 1000;
  pts.push([end, vEnd]);
  return vEnd;
}

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
  /* 2. Phase von Hand: ab „Kammer voll" mit a₂ auf V₂ — für jedes Gesetz
     der 1. Phase gleich. Reicht der Weg bis zum Füllende nicht, sagt die
     Seite, welches a₂ V₂ erreichte. */
  let points = gen.points, warn = gen.warn || null, v2 = gen.v2, a2 = v.amax, a2Need = NaN, v2Reached = NaN;
  const manual = v2Manual(S);
  if (manual) {
    if (!(S.v2 > 0 && S.a2 > 0)) return { error: 'V₂ und a₂ müssen größer als null sein.' };
    const sFill = (1 - fillRatio(v)) * v.length, sEnd = sFill + cavityTravel(total(v), v);
    const sR = Math.ceil(sFill * 10) / 10;
    points = gen.points.filter(p => p[0] <= sR + 1e-9);
    if (!points.length) return { error: 'Die 1. Phase endet nicht vor „Kammer voll".' };
    const vTop = points[points.length - 1][1];
    if (points[points.length - 1][0] < sR) points.push([sR, vTop]);
    const w = rampTo(points, vTop, S.v2, sR, sEnd, S.a2);
    v2 = S.v2; a2 = S.a2; warn = null;
    if (w !== null) {
      v2Reached = w;
      a2Need = Math.abs(S.v2 * S.v2 - vTop * vTop) / (2 * Math.max(sEnd - sR, 1) / 1000);
      warn = 'V₂ ' + fmtN(S.v2, 2) + ' m/s wird bis zum Füllende nicht erreicht, nur ' + fmtN(w, 2) + ' m/s: dafür braucht es a₂ ≥ ' + fmtN(a2Need, 0) + ' m/s².';
    }
  }
  let shot;
  try { shot = computeShot(v, points); } catch (e) { return { error: String(e && e.message || e) }; }
  if (shot.error) return { error: shot.error };
  const full = shot.events[0], end = shot.events[3];
  if (!full.inP) return { error: 'Die Kurve endet vor „Kammer voll".' };
  const prof = shot.profile;
  const tFull = full.t, tEnd = end.inP ? end.t : prof.endTime;
  /* ab „Kammer voll": die Knoten des Profils (zwischen ihnen ist v linear in t) */
  const inletTable = [[0, full.v]];
  for (let k = 0; k < prof.t.length; k++) if (prof.t[k] > tFull + 1e-9) inletTable.push([prof.t[k] - tFull, prof.v[k]]);
  return {
    v, points, shot, warn, events: shot.events,
    v2, a2, v2Manual: manual, v2Reached, a2Need, tNadca: gen.tN,
    phi: shot.phi, tFull, tEnd, sFull: full.s, sEnd: end.s,
    diam: v.diam, length: v.length, depth, stroke: v.length - depth,
    Vdose: shot.Vdose * 1e9, inletTable,
    vAtPart: shot.events[2].inP ? shot.events[2].v : NaN,
    fillMs: shot.fill
  };
}

/** Kolbenweg über der Zeit (ab Kolbenstart) für bilder.py und bericht.py: [t s, s mm]. */
export function pistonTable(sp, n = 120) {
  const prof = sp.shot.profile, out = [];
  for (let i = 0; i <= n; i++) {
    const t = prof.endTime * i / n, q = prof.atTime(t);
    out.push([Number(t.toFixed(6)), Number((q.s * 1000).toFixed(3))]);
  }
  return out;
}

const fmtN = (x, d = 0) => (isFinite(x) ? Number(x).toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');
/** Ein runder Schritt für höchstens n Teilungen über span. */
function niceStep(span, n) {
  const raw = span / Math.max(n, 1), p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
export const EVENT_SHORT = ['Kammer voll', 'Anguss voll', 'Bauteil voll', 'Überläufe voll'];

/** Der Ausschnitt des Bilds: der ganze Schuss oder die Formfüllung (ab kurz
    vor „Kammer voll"). → { s0, s1, vmax } in mm, m/s */
function curveRange(sp, view) {
  const prof = sp.shot.profile, s1 = prof.travel * 1000;
  const s0 = view === 'fill' ? Math.max(0, sp.sFull - 0.12 * Math.max(s1 - sp.sFull, 1)) : 0;
  let vm = 0;
  for (let i = 0; i <= 200; i++) vm = Math.max(vm, prof.atPos((s0 + (s1 - s0) * i / 200) / 1000).v);
  if (view !== 'fill' && sp.shot.vcrit > 0) vm = Math.max(vm, sp.shot.vcrit);
  const st = niceStep(vm * 1.12 || 1, 4);
  return { s0, s1, vmax: Math.ceil(vm * 1.12 / st) * st || 1, vstep: st };
}
/* klein im Viewbox-Maß: im Panel (~290 px) steht die Schrift so fast 1:1 */
const GEO = { width: 300, height: 200, L: 32, R: 10, T: 24, B: 24 };

/** Die Schusskurve als SVG: v über dem Kolbenweg, die beiden Phasen, v_krit,
    die Ereignisse (nummeriert wie in der Legende), der gerechnete Teil als
    Balken auf der Achse (ohne Kammer: ab „Kammer voll") und ein Zeiger, den
    curveCursor bewegt. view: 'all' | 'fill'. */
export function curveSVG(sp, { chamber = false, view = 'all' } = {}) {
  const prof = sp.shot.profile;
  const { width, height, L, R, T, B } = GEO, W = width - L - R, H = height - T - B;
  const { s0, s1, vmax, vstep } = curveRange(sp, view);
  const X = s => L + W * (s - s0) / (s1 - s0), Y = vv => T + H * (1 - vv / vmax);
  const f1 = x => x.toFixed(1);
  const pts = [];
  for (let i = 0; i <= 240; i++) { const s = s0 + (s1 - s0) * i / 240; pts.push([s, prof.atPos(s / 1000).v]); }
  const line = pts.map(([s, vv], i) => (i ? 'L' : 'M') + f1(X(s)) + ' ' + f1(Y(vv))).join(' ');
  const area = line + ' L' + f1(X(s1)) + ' ' + f1(T + H) + ' L' + f1(X(s0)) + ' ' + f1(T + H) + ' Z';
  const out = [];
  /* Raster und Achsen */
  for (let y = 0; y <= vmax + 1e-9; y += vstep) {
    out.push('<line x1="' + L + '" x2="' + (L + W) + '" y1="' + f1(Y(y)) + '" y2="' + f1(Y(y)) + '" class="' + (y === 0 ? 'axl' : 'grid') + '"/>');
    out.push('<text x="' + (L - 5) + '" y="' + f1(Y(y) + 3) + '" class="ax" text-anchor="end">' + fmtN(y, vstep < 1 ? 1 : 0) + '</text>');
  }
  const xs = niceStep(s1 - s0, 5);
  for (let x = Math.ceil(s0 / xs) * xs; x <= s1 + 1e-9; x += xs) {
    if (X(x) > L + W - 26) continue;
    out.push('<line x1="' + f1(X(x)) + '" x2="' + f1(X(x)) + '" y1="' + (T + H) + '" y2="' + (T + H + 3) + '" class="axl"/>');
    out.push('<text x="' + f1(X(x)) + '" y="' + (T + H + 13) + '" class="ax" text-anchor="middle">' + fmtN(x) + '</text>');
  }
  out.push('<text x="' + (L + W) + '" y="' + (T + H + 13) + '" class="ax" text-anchor="end">mm</text>');
  out.push('<text x="' + (L - 5) + '" y="' + (T - 10) + '" class="ax" text-anchor="end">m/s</text>');
  /* die Phasen: die zweite getönt, beide benannt */
  const xF = Math.max(L, Math.min(L + W, X(sp.sFull)));
  out.push('<rect x="' + f1(xF) + '" y="' + T + '" width="' + f1(L + W - xF) + '" height="' + H + '" class="ph2"/>');
  if (xF - L > 52) out.push('<text x="' + f1((L + xF) / 2) + '" y="' + (T - 10) + '" class="phl" text-anchor="middle">1. Phase</text>');
  if (L + W - xF > 52) out.push('<text x="' + f1((xF + L + W) / 2) + '" y="' + (T - 10) + '" class="phl" text-anchor="middle">2. Phase</text>');
  else out.push('<text x="' + f1(L + W) + '" y="' + (T - 10) + '" class="phl" text-anchor="end">2. Ph.</text>');
  /* v_krit gilt in der 1. Phase */
  const vc = sp.shot.vcrit;
  if (vc > 0 && vc < vmax && xF > L + 4) {
    out.push('<line x1="' + L + '" x2="' + f1(xF) + '" y1="' + f1(Y(vc)) + '" y2="' + f1(Y(vc)) + '" class="crit"/>');
    if (xF - L > 80) out.push('<text x="' + (L + 3) + '" y="' + f1(Y(vc) - 4) + '" class="critl">v<tspan baseline-shift="sub" font-size="75%">krit</tspan> ' + fmtN(vc, 2) + '</text>');
  }
  out.push('<path d="' + area + '" class="area"/>', '<path d="' + line + '" class="v"/>');
  /* V₂ über dem Plateau am Ende (wird es nicht erreicht: am Ende, „erreicht") */
  const vEnd = prof.atPos(prof.travel).v, short = sp.v2Manual && isFinite(sp.v2Reached);
  const plat = pts.find(([, vv], i) => i > 0 && pts[i][0] >= sp.sFull && vv >= vEnd * 0.995);
  const xv = short || !plat ? L + W - 16 : Math.max(X(plat[0]) + 4, Math.min((X(plat[0]) + L + W) / 2, L + W - 30));
  out.push('<text x="' + f1(xv) + '" y="' + f1(Math.max(T + 10, Y(vEnd) - 7)) + '" class="v2l" text-anchor="' + (short || !plat ? 'end' : 'middle') + '">' + (short ? 'erreicht ' : 'V₂ ') + fmtN(vEnd, 2) + '</text>');
  /* gerechnet: Balken auf der Achse */
  const simFrom = chamber ? 0 : sp.sFull;
  if (simFrom < s1) out.push('<line x1="' + f1(Math.max(L, X(simFrom))) + '" x2="' + f1(L + W) + '" y1="' + (T + H) + '" y2="' + (T + H) + '" class="simbar"/>');
  /* Ereignisse: nummeriert auf der Kurve, zu nah beieinander nur als Punkt */
  let lastX = -1e9;
  sp.events.forEach((e, i) => {
    if (!e.inP || e.s < s0 - 1e-6) return;
    const x = X(e.s), y = Y(e.v);
    out.push('<line x1="' + f1(x) + '" x2="' + f1(x) + '" y1="' + T + '" y2="' + (T + H) + '" class="ev"/>');
    if (x - lastX >= 15) { out.push('<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="6.5" class="evc"/><text x="' + f1(x) + '" y="' + f1(y + 3) + '" class="evn" text-anchor="middle">' + (i + 1) + '</text>'); lastX = x; }
    else out.push('<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="2.6" class="evd"/>');
  });
  out.push('<g class="cur" visibility="hidden"><line class="curl" y1="' + T + '" y2="' + (T + H) + '"/><circle class="curc" r="3.5"/><rect class="curb" height="16" rx="3"/><text class="curt" y="' + (T + 12) + '"></text></g>');
  return '<svg class="sim-curve" viewBox="0 0 ' + width + ' ' + height + '" data-s0="' + s0 + '" data-s1="' + s1 + '" data-vmax="' + vmax + '" role="img" aria-label="Schusskurve: Kolbengeschwindigkeit über dem Kolbenweg">' + out.join('') + '</svg>';
}

/** Der Zeiger im Kurvenbild: Weg, Geschwindigkeit und Zeit unter der Maus
    (clientX), null blendet ihn aus. */
export function curveCursor(svg, sp, clientX) {
  const g = svg && svg.querySelector('.cur');
  if (!g) return;
  if (clientX == null) { g.setAttribute('visibility', 'hidden'); return; }
  const { width, height, L, R, T, B } = GEO, W = width - L - R, H = height - T - B;
  const r = svg.getBoundingClientRect(), x = (clientX - r.left) * width / r.width;
  const s0 = Number(svg.dataset.s0), s1 = Number(svg.dataset.s1), vmax = Number(svg.dataset.vmax);
  if (x < L || x > L + W) { g.setAttribute('visibility', 'hidden'); return; }
  const s = s0 + (s1 - s0) * (x - L) / W, q = sp.shot.profile.atPos(s / 1000), y = T + H * (1 - q.v / vmax);
  const txt = fmtN(s) + ' mm · ' + fmtN(q.v, 2) + ' m/s · ' + fmtN(q.t * 1000) + ' ms';
  const tw = txt.length * 6 + 10, left = x + tw + 6 > L + W;
  g.querySelector('.curl').setAttribute('x1', x.toFixed(1)); g.querySelector('.curl').setAttribute('x2', x.toFixed(1));
  g.querySelector('.curc').setAttribute('cx', x.toFixed(1)); g.querySelector('.curc').setAttribute('cy', y.toFixed(1));
  const bx = left ? x - tw - 4 : x + 4;
  g.querySelector('.curb').setAttribute('x', bx.toFixed(1)); g.querySelector('.curb').setAttribute('y', String(T + 1)); g.querySelector('.curb').setAttribute('width', tw.toFixed(1));
  const t = g.querySelector('.curt'); t.setAttribute('x', (bx + 5).toFixed(1)); t.textContent = txt;
  g.setAttribute('visibility', 'visible');
}

/** Die Legende unter dem Bild: die Ereignisse mit Weg, Zeit und v. */
export function curveLegend(sp, { chamber = false } = {}) {
  const rows = sp.events.map((e, i) => (e.inP
    ? '<li><b>' + (i + 1) + '</b><span>' + EVENT_SHORT[i] + '</span><small>' + fmtN(e.s) + ' mm · ' + fmtN(e.t * 1000) + ' ms · ' + fmtN(e.v, 2) + ' m/s</small></li>'
    : '')).join('');
  return '<ol class="sim-curve-legend">' + rows
    + '<li class="sim-curve-sim"><b></b><span>gerechnet</span><small>' + (chamber ? 'der ganze Schuss (mit Kammer)' : 'ab „Kammer voll"') + '</small></li></ol>';
}
