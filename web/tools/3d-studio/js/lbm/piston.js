/* Der Kolben und die Einheiten der Rechnung.

   Die Schmelze steht beim Start voll im Pressrest — „Kammer voll" auf
   der DieLogic-Kurve —, und ab da schiebt der Kolben mit der Kurve:
   erst mit v_krit, dann die Rampe der zweiten Phase. Die Kurve kommt aus
   js/runner/shottime.js (shotTimeline) und kennt zu jeder Zeit ab
   Kolbenstart die Kolbengeschwindigkeit (profile.atTime).

   Gittereinheiten: die Zellkante ist dx, der Zeitschritt dt folgt aus
   der schnellsten Stelle im Anguss — die Gittergeschwindigkeit soll dort
   etwa 0,06 bleiben (die LBM ist ein Verfahren für kleine Machzahlen;
   über 0,2 wird sie unstabil). Schnellste Stelle: der Kolbenstrom durch
   den kleinsten Laufkanalquerschnitt vor den Anschnitten — der Steg
   selbst ist nur eine Zelle hoch und zählt nicht, dort hört die Rechnung
   ohnehin auf. Die Zähigkeit auf dem Gitter wäre für Aluminium um
   Größenordnungen unter dem Stabilen; τ bleibt deshalb bei tau0 stehen
   und die Rechnung ist ein grobes LES (js/lbm/fslbm.js). */

/**
 * Kolbenkurve ab „Kammer voll".
 *   timeline  aus shotTimeline: { tFull, shot.profile, A (m²) }
 * → { tEnd (s ab Kammer voll bis Kurvenende), v(t) in m/s, vMax, A }
 */
export function pistonCurve(timeline) {
  const prof = timeline.shot.profile;
  const t0 = timeline.tFull;
  const tEnd = Math.max(0, prof.endTime - t0);
  let vMax = 0;
  const n = 200;
  for (let i = 0; i <= n; i++) vMax = Math.max(vMax, prof.atTime(t0 + tEnd * i / n).v);
  return {
    t0, tEnd, A: timeline.A, vMax,
    v: t => prof.atTime(t0 + Math.min(Math.max(t, 0), tEnd)).v
  };
}

/** Kleinster Laufkanalquerschnitt (m²) — ohne Steg und ohne den Übergang
    auf den Anschnitt: der läuft auf die Anschnittfläche zu, und die
    ist zwei Zellen hoch; mit ihr als Maß würde der Zeitschritt für den
    ganzen Anguss winzig. Wo es nur Übergang gibt (Fächer, „über die
    ganze Länge"), zählt dessen Anfang. */
export function minRunnerArea(net) {
  let a = Infinity, start = Infinity;
  for (const e of net.edges) {
    for (const s of e.sections) if (!s.land && !s.trans) a = Math.min(a, s.area);
    if (e.sections.length) start = Math.min(start, e.sections[0].area);
  }
  const best = Number.isFinite(a) ? a : start;
  return Number.isFinite(best) ? best * 1e-6 : 1e-4;
}

/**
 * Einheiten der Rechnung.
 *   h        Zellkante in mm
 *   vMax     größte Kolbengeschwindigkeit m/s
 *   A        Kolbenfläche m²
 *   aMin     kleinster Kanalquerschnitt m²
 *   nu       kinematische Zähigkeit m²/s
 * → { dx, dt, uTarget, tau0, nuLat, nuEff, vRunMax, uIn(v) }
 */
export function latticeUnits({ h, vMax, A, aMin, nu, uTarget = 0.06, tauMin = 0.51 }) {
  const dx = h * 1e-3;
  const vRunMax = Math.max(vMax * A / Math.max(aMin, dx * dx), vMax, 1e-3);
  const dt = uTarget * dx / vRunMax;
  const nuLat = nu * dt / (dx * dx);
  const tau0 = Math.max(tauMin, 0.5 + 3 * nuLat);
  const nuEff = (tau0 - 0.5) / 3 * dx * dx / dt;
  return { dx, dt, uTarget, tau0, nuLat, nuEff, vRunMax, uIn: v => v * dt / dx };
}
