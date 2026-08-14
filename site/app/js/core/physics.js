/* HPDC-Physik (portiert aus hpdc_math): Füllkammer, kritische Geschwindigkeit,
   Bewegungsprofil der Schusskurve und das komplette Schussmodell mit
   Ereignissen und Prüfungen. Reine Rechenlogik, kein DOM. */

import { fmt, seq } from './format.js';

const PI = Math.PI;

/* ── Massen- und Geometrie-Helfer ── */
export function total(v) { return v.part + v.runner + v.overflow; }
export function afterGate(v) { return v.part + v.overflow; }
export function pistonArea(v) { return 0.25 * PI * v.diam * v.diam; }           // mm²
export function travel(m, v) { return 1e9 * (m / v.density) / pistonArea(v); }  // mm für Masse m

/* Höhe eines Kreissegments mit Flächenanteil phi (bisektion). */
export function segHeight(phi) {
  if (phi <= 0) return 0;
  if (phi >= 1) return 1;
  let lo = 0, hi = 1, mid = 0.5;
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    const f = (Math.acos(1 - 2 * mid) - 2 * (1 - 2 * mid) * Math.sqrt(Math.max(0, mid * (1 - mid)))) / PI;
    if (f < phi) lo = mid; else hi = mid;
  }
  return mid;
}

/* Kritische Kolbengeschwindigkeit 1. Phase: bilineare Interpolation der
   OpenFOAM-CFD-Tabelle (site/assets/v_krit_sim.csv → core/vkritTable.js),
   v_krit = √(9,81·D)·f(D, φ). Die CFD zeigt gegenüber der Flachwasser-
   theorie: Brechen VOR Deckenberührung (Theorie ab φ ≈ 0,3 zunehmend
   optimistisch) und einen Klein-Ø-Abschlag bei hohen Füllgraden — deshalb
   Tabelle statt Formel. Randregeln: D auf 60–300 mm geklemmt; φ < 0,1
   nutzt die 0,1-Spalte (konservativ, f steigt zu kleinen φ); φ > 0,9
   läuft linear auf 0 bei φ = 1. Details: Theorie-Artikel „Kritische
   Kolbengeschwindigkeit". D in m. */
import { VKRIT_D_MM, VKRIT_PHI, VKRIT_F } from './vkritTable.js';

function tableF(Dmm, phi) {
  const Dc = Math.max(VKRIT_D_MM[0], Math.min(VKRIT_D_MM[VKRIT_D_MM.length - 1], Dmm));
  let i = 0;
  while (i < VKRIT_D_MM.length - 2 && VKRIT_D_MM[i + 1] < Dc) i++;
  const tD = (Dc - VKRIT_D_MM[i]) / (VKRIT_D_MM[i + 1] - VKRIT_D_MM[i]);
  const row = j => VKRIT_F[i][j] * (1 - tD) + VKRIT_F[i + 1][j] * tD;
  const pLo = VKRIT_PHI[0], pHi = VKRIT_PHI[VKRIT_PHI.length - 1];
  if (phi <= pLo) return row(0);
  if (phi >= pHi) return row(VKRIT_PHI.length - 1) * Math.max(0, (1 - phi) / (1 - pHi));
  let j = 0;
  while (j < VKRIT_PHI.length - 2 && VKRIT_PHI[j + 1] < phi) j++;
  const tP = (phi - VKRIT_PHI[j]) / (VKRIT_PHI[j + 1] - VKRIT_PHI[j]);
  return row(j) * (1 - tP) + row(j + 1) * tP;
}

export function vCrit(Dm, phi) {
  return Math.sqrt(9.81 * Dm) * tableF(Dm * 1000, phi);
}

/* Flachwassertheorie als Referenz (Deckenkriterium, DieLogic-Segment-Fit
   ans exakte Integral ∫√(g·T/A)dh; max. 0,25 % Abweichung vom Integral —
   aber gegenüber der CFD ab mittleren Füllgraden optimistisch). */
export function vCritTheory(Dm, phi) {
  const p = Math.max(0, Math.min(1, phi));
  const u = Math.cbrt(p);
  return Math.sqrt(9.81 * Dm) * Math.pow(1 - p, 5 / 6)
    * (2.3173 - 2.4762 * u + 1.3404 * u * u - 0.3552 * p);
}

/* Klassische Näherung nach Nogowizin (Referenz). */
export function vCritNogowizin(Dm, phi) {
  return Math.sqrt(9.81 * Dm) * (1.386 - 1.915 * phi + 0.615 * phi * phi);
}

export function waveSpeed(Dm, phi) {
  if (phi <= 0 || phi >= 0.995) return NaN;
  const y = segHeight(phi);
  const chord = 2 * Math.sqrt(Math.max(1e-12, y * (1 - y))) * Dm;
  return Math.sqrt(9.81 * (phi * PI * Dm * Dm / 4) / chord);
}

/* Bewegungsprofil: stückweise konstante Beschleunigung.
   v1² = v0² + 2aΔs, Δt = 2Δs/(v0+v1). Punkte: [s in mm, v in m/s]. */
export function buildProfile(pts) {
  const arr = pts.filter(p => isFinite(p[0]) && isFinite(p[1])).map(p => [p[0] / 1000, p[1]]);
  if (!arr.length) throw 'Keine gültigen Kurvenpunkte.';
  if (arr[0][0] > 0) arr.unshift([0, 0]);
  const s = arr.map(p => p[0]), v = arr.map(p => p[1]);
  let i;
  for (i = 0; i < s.length; i++) {
    if (v[i] < 0) throw 'Geschwindigkeiten müssen ≥ 0 sein.';
    if (i && s[i] <= s[i - 1]) throw 'Wegpunkte müssen streng steigend sein.';
    if (i && v[i - 1] + v[i] <= 0) throw 'Kein Segment darf an beiden Enden v = 0 haben.';
  }
  const a = [], dt = [], t = [0];
  for (i = 1; i < s.length; i++) {
    const ds = s[i] - s[i - 1];
    a.push((v[i] * v[i] - v[i - 1] * v[i - 1]) / (2 * ds));
    dt.push(2 * ds / (v[i - 1] + v[i]));
    t.push(t[t.length - 1] + dt[dt.length - 1]);
  }
  function segAtS(sx) { for (let k = 0; k < s.length - 1; k++) if (sx <= s[k + 1] + 1e-12) return k; return s.length - 2; }
  function segAtT(tx) { for (let k = 0; k < t.length - 1; k++) if (tx <= t[k + 1] + 1e-12) return k; return t.length - 2; }
  return {
    s, v, a, t,
    travel: s[s.length - 1],
    endTime: t[t.length - 1],
    vmax: Math.max.apply(null, v),
    amax: a.length ? Math.max.apply(null, a) : 0,
    amin: a.length ? Math.min.apply(null, a) : 0,
    atPos(sx) {
      sx = Math.min(Math.max(sx, 0), this.travel);
      const k = segAtS(sx), v2 = v[k] * v[k] + 2 * a[k] * (sx - s[k]), vv = Math.sqrt(Math.max(0, v2));
      const d = Math.abs(a[k]) > 1e-12 ? (vv - v[k]) / a[k] : (v[k] > 0 ? (sx - s[k]) / v[k] : 0);
      return { t: t[k] + d, s: sx, v: vv, a: a[k] };
    },
    atTime(tx) {
      tx = Math.min(Math.max(tx, 0), this.endTime);
      const k = segAtT(tx), d = tx - t[k];
      return { t: tx, s: s[k] + v[k] * d + 0.5 * a[k] * d * d, v: v[k] + a[k] * d, a: a[k] };
    },
    samples(n) {
      const ts = seq(0, this.endTime, n).concat(t).sort((x, y) => x - y);
      const out = { t: [], s: [], v: [], a: [] };
      let last = -1;
      for (let j = 0; j < ts.length; j++) {
        if (ts[j] - last < 1e-9) continue;
        last = ts[j];
        const q = this.atTime(ts[j]);
        out.t.push(q.t); out.s.push(q.s * 1000); out.v.push(q.v); out.a.push(q.a);
      }
      return out;
    },
    maxVelBefore(sLim) {
      let m = 0;
      for (let j = 0; j < s.length; j++) if (s[j] <= sLim) m = Math.max(m, v[j]);
      if (sLim > 0 && sLim < this.travel) m = Math.max(m, this.atPos(sLim).v);
      return m;
    }
  };
}

/* Schussmodell: Füllkammer + Ereignisse + Prüfungen.
   v = Eingabewerte, curvePoints = Schusskurven-Wegpunkte. */
export function computeShot(v, curvePoints) {
  let prof;
  try { prof = buildProfile(curvePoints); }
  catch (e) { return { error: '' + e }; }

  const A = 0.25 * PI * Math.pow(v.diam / 1000, 2), rho = v.density, L = v.length / 1000;
  const Vr = v.runner / rho, Vp = v.part / rho, Vo = v.overflow / rho, Vb = v.biscuit / rho;
  const Vdose = Vr + Vp + Vo + Vb;
  const phi = Vdose / (A * L);
  if (phi >= 1) return { error: 'Dosiervolumen (' + fmt(Vdose * 1e6) + ' cm³) übersteigt das Kammervolumen — Füllgrad ≥ 100 %.' };
  if (phi <= 0) return { error: 'Dosiervolumen ist null.' };

  const sFill = (1 - phi) * L;
  const vcrit = vCrit(v.diam / 1000, phi);
  const gateR = v.gate > 0 ? pistonArea(v) / v.gate : null;

  const evs = [];
  let cum = 0;
  const names = [['Kammer voll', 0], ['Anguss gefüllt', Vr], ['Bauteil gefüllt', Vp], ['Überlauf gefüllt', Vo]];
  for (let i = 0; i < names.length; i++) {
    cum += names[i][1];
    const st = sFill + cum / A;
    const ev = { name: names[i][0], s: st * 1000, inP: st <= prof.travel + 1e-9 };
    if (ev.inP) {
      const q = prof.atPos(st);
      ev.t = q.t; ev.v = q.v; ev.gv = gateR ? q.v * gateR : null;
    }
    evs.push(ev);
  }

  const totalStroke = sFill + (Vr + Vp + Vo) / A, biscLen = Vb / A;
  let fill = null;
  if (evs[1].inP && evs[3].inP) fill = (evs[3].t - evs[1].t) * 1000;
  /* v1 = max. Kolbengeschwindigkeit bis „Kammer voll" (1. Phase);
     v2 = mittlere Kolbengeschwindigkeit nach dem Anschnitt (2. Phase):
     Weg/Zeit zwischen „Anguss gefüllt" und „Überlauf gefüllt". */
  const v1 = prof.maxVelBefore(sFill);
  const v2 = (evs[1].inP && evs[3].inP && evs[3].t > evs[1].t)
    ? (evs[3].s - evs[1].s) / 1000 / (evs[3].t - evs[1].t) : null;

  const checks = [];
  checks.push([v1 <= vcrit + 1e-9, '1. Phase: max. ' + fmt(v1) + ' m/s bis Kammer voll ' + (v1 <= vcrit ? '≤' : '>') + ' v_krit ' + fmt(vcrit) + ' m/s (CFD).']);
  checks.push([prof.vmax <= v.vmax + 1e-9, 'Spitzengeschwindigkeit ' + fmt(prof.vmax) + ' m/s ' + (prof.vmax <= v.vmax ? '≤' : '>') + ' Maschinenlimit ' + fmt(v.vmax) + ' m/s.']);
  const aPk = Math.max(prof.amax, -prof.amin, 0);
  if (v.amax > 0) checks.push([aPk <= v.amax + 1e-9, 'Spitzenbeschleunigung ' + fmt(aPk) + ' m/s² ' + (aPk <= v.amax ? '≤' : '>') + ' Maschinenlimit ' + fmt(v.amax) + ' m/s².']);
  checks.push([prof.travel >= totalStroke - 1e-9, 'Kurvenhub ' + fmt(prof.travel * 1000) + ' mm ' + (prof.travel >= totalStroke ? 'deckt' : 'deckt NICHT') + ' den Gesamthub ' + fmt(totalStroke * 1000) + ' mm ab.']);
  checks.push([prof.travel <= L - biscLen + 2e-3, 'Kurvenende ' + fmt(prof.travel * 1000) + ' mm bleibt vor dem Pressrest (Kammer ' + fmt(v.length) + ' mm − Pressrest ' + fmt(biscLen * 1000) + ' mm).']);
  checks.push([biscLen * 1000 >= v.biscuitMin, 'Pressrest ' + fmt(biscLen * 1000) + ' mm ' + (biscLen * 1000 >= v.biscuitMin ? '≥' : '<') + ' Minimum ' + fmt(v.biscuitMin) + ' mm.']);
  if (fill !== null) checks.push([fill <= v.tmax, 'Füllzeit ab Anschnitt ' + fmt(fill) + ' ms ' + (fill <= v.tmax ? '≤' : '>') + ' Maximum ' + fmt(v.tmax) + ' ms.']);
  if (gateR && evs[2].inP) checks.push([evs[2].gv >= v.gateMin && evs[2].gv <= v.gateMax, 'Anschnittgeschwindigkeit bei Bauteilfüllung ' + fmt(evs[2].gv) + ' m/s im Zielband ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s.']);

  return {
    profile: prof, samples: prof.samples(320), events: evs,
    phi, sFill, vcrit, wave: waveSpeed(v.diam / 1000, phi),
    gateR, totalStroke, biscLen, fill, v1, v2, Vdose, checks
  };
}
