/* Schusskurven-Generatoren: erzeugen Wegpunkte [s mm, v m/s] für die
   beiden generierten Modi (state.curveGen.mode):

   'lopez' — López-Faura-Hernández-Anfahrt (Theorie „Nebenbedingungen",
     Profil P5): v(t) = 2c₀[(1 − c₀t/ℓ)^(−1/3) − 1] mit c₀ = waveSpeed
     (Schwerewellen-Geschwindigkeit des ruhenden Bads) und ℓ ≈ L, bis
     v_krit (CFD-Tabelle) erreicht ist; Plateau bis „Kammer voll"; dann
     Rampe mit a_max auf die Geschwindigkeit der NADCA-Füllzeit.

   'v1v2' — Rampe mit a₁ auf V₁, Plateau bis „Kammer voll", Rampe mit a₂
     auf V₂ bis zum Schussende (L − Pressrest).

   Reine Rechenlogik + ein dünner state-Wrapper (applyCurveGen). */

import { state } from './state.js';
import { total, afterGate, pistonArea, vCrit, waveSpeed } from './physics.js';

/* Punkte aufräumen: runden, streng steigende s erzwingen. */
function clean(pts) {
  const out = [];
  for (const p of pts) {
    const s = Math.round(p[0] * 10) / 10, vv = Math.round(p[1] * 1000) / 1000;
    if (!isFinite(s) || !isFinite(vv)) continue;
    if (out.length && s <= out[out.length - 1][0]) continue;
    out.push([s, vv]);
  }
  return out;
}

/* Rampe von vFrom auf vTo ab s0, dann Plateau bis sEnd. a in m/s², s in mm. */
function ramp(pts, vFrom, vTo, s0, sEnd, a) {
  let ds = a > 0 ? Math.abs(vTo * vTo - vFrom * vFrom) / (2 * a) * 1000 : 5;
  /* Aufrunden + kleine Marge: die 0,1-mm-Rundung der Punkte darf die
     Beschleunigung nur senken, nie über das Limit heben */
  ds = Math.max(Math.ceil(ds * 10) / 10 + 0.2, 1);
  if (s0 + ds < sEnd - 0.5) pts.push([s0 + ds, vTo]);
  /* Endpunkt aufrunden, damit die Kurve den Gesamthub sicher abdeckt */
  pts.push([Math.ceil(sEnd * 10) / 10, vTo]);
}

export function generateCurve(v, g) {
  const A = pistonArea(v);
  const mdos = total(v) + v.biscuit;
  const phi = 1e9 * (mdos / v.density) / (v.length * A);
  if (!(phi > 0 && phi < 1)) return { error: 'Füllgrad außerhalb (0, 1) — Kurve nicht generierbar.' };
  const sFill = (1 - phi) * v.length;                       // „Kammer voll" [mm]
  const sEnd = sFill + 1e9 * (total(v) / v.density) / A;    // Schussende = L − Pressrest [mm]

  if (g.mode === 'lopez') {
    const D = v.diam / 1000, l = v.length / 1000;
    const c0 = waveSpeed(D, phi);
    if (!(c0 > 0)) return { error: 'Wellengeschwindigkeit c₀ nicht berechenbar (Füllgrad prüfen).' };
    const vc = vCrit(D, phi);
    if (!(vc > 0)) return { error: 'v_krit nicht berechenbar.' };

    /* Anfahrt: v(t) und x(t) aus dem P5-Gesetz; t* = Erreichen von v_krit */
    const vOf = t => 2 * c0 * (Math.pow(1 - c0 * t / l, -1 / 3) - 1);
    const xOf = t => (3 * l * (1 - Math.pow(1 - c0 * t / l, 2 / 3)) - 2 * c0 * t) * 1000;
    let tEnd = (l / c0) * (1 - Math.pow(1 + vc / (2 * c0), -3));
    /* Falls v_krit erst nach „Kammer voll" erreicht würde: bei sFill kappen */
    if (xOf(tEnd) > sFill) {
      let lo = 0, hi = tEnd;
      for (let i = 0; i < 50; i++) {
        const m = (lo + hi) / 2;
        if (xOf(m) < sFill) lo = m; else hi = m;
      }
      tEnd = (lo + hi) / 2;
    }
    const pts = [];
    for (let i = 1; i <= 6; i++) {
      const t = tEnd * i / 6;
      pts.push([xOf(t), vOf(t)]);
    }
    /* Plateau abrunden, damit die Rundung v nicht über v_krit hebt */
    const vTop = Math.floor(vOf(tEnd) * 1000) / 1000;
    pts[pts.length - 1][1] = vTop;
    if (pts[pts.length - 1][0] < sFill - 0.5) pts.push([sFill, vTop]);

    /* 2. Phase: Geschwindigkeit für die empfohlene NADCA-Füllzeit */
    const denN = v.Tflow - v.Tdie;
    const tN = denN !== 0 ? v.kfill * v.wall * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / denN : NaN;
    if (!(tN > 0)) return { error: 'NADCA-Füllzeit nicht berechenbar — Temperaturen und k prüfen.' };
    let v2 = 1e9 * (afterGate(v) / v.density) / (tN * A);
    if (v.vmax > 0) v2 = Math.min(v2, v.vmax);
    ramp(pts, vTop, v2, sFill, sEnd, v.amax);
    return { points: clean(pts) };
  }

  if (g.mode === 'v1v2') {
    if (!(g.v1 > 0 && g.a1 > 0 && g.v2 > 0 && g.a2 > 0))
      return { error: 'V₁, V₂, a₁ und a₂ müssen > 0 sein.' };
    const s1 = g.v1 * g.v1 / (2 * g.a1) * 1000;
    if (s1 >= sFill - 0.5)
      return { error: 'Rampe auf V₁ (' + Math.round(s1) + ' mm) reicht über „Kammer voll" (' + Math.round(sFill) + ' mm) — a₁ erhöhen oder V₁ senken.' };
    const pts = [[s1, g.v1], [sFill, g.v1]];
    ramp(pts, g.v1, g.v2, sFill, sEnd, g.a2);
    return { points: clean(pts) };
  }

  return { error: 'Unbekannter Kurvenmodus „' + g.mode + '".' };
}

/* In generierten Modi state.curve aus den aktuellen Eingaben neu erzeugen.
   Rückgabe: Fehlertext oder null; bei Fehler bleibt die letzte Kurve stehen. */
export function applyCurveGen(v) {
  const g = state.curveGen;
  if (!g || g.mode === 'points') return null;
  const r = generateCurve(v, g);
  if (r.error) return r.error;
  state.curve = r.points;
  return null;
}
