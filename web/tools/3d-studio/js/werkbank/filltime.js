/* Die Zeit der Füllung — auf der Schusskurve, Anschnitt für Anschnitt.

   Die Füllabschätzung kennt keine Zeit: sie ordnet die Zellen nach der
   Ankunft der Front und nennt den FÜLLGRAD, bei dem jede voll wird.
   Die Schusskurve kennt die Zeit — und der Anguss, wann jeder Anschnitt
   erreicht ist (js/werkbank/shottime.js). Beides zusammen gibt der
   Füllung eine Uhr:

   Ab dem ersten Anschnitt strömt Schmelze in die Kavität — aber nur der
   Anteil der Anschnitte, die schon offen sind; die übrigen Äste füllen
   noch den Anguss. Der Zustrom ist also Kolbenfläche mal
   Kolbengeschwindigkeit mal Summe der offenen Anteile, und das aufsummierte
   Volumen ist der Füllgrad des Bauteils. Umgekehrt gehört zu jedem
   Füllgrad eine Zeit ab Kolbenstart — und zum Öffnen eines späteren
   Anschnitts ein Füllgrad, den die früheren bis dahin geschafft haben.
   Das ist der Vorsprung, mit dem die Front der früheren Anschnitte in
   der Rechnung startet.

   Kein DOM, kein Three.js: die Tests rechnen es nach. */

/**
 * Die Uhr der Füllung.
 *   timeline  aus shotTimeline: { A (m²), shot.profile } — die Kurve
 *   gates     [{ id, tArrive (s ab Kolbenstart), share (0..1) }]; Anschnitte
 *             ohne endliche Ankunft (die Kurve endet vorher) bleiben zu
 *   opts.steps  Stützstellen der Integration
 * → null ohne offenen Anschnitt, sonst
 *   { tFirst, tCurveEnd, gates: [{id, t, share, open}], volumeAtTime(t),
 *     timeAtVolume(V), maxVolume }  — Volumen in m³, Zeiten in s ab Kolbenstart
 */
export function fillClock(timeline, gates, opts = {}) {
  const steps = Math.max(200, opts.steps || 4000);
  const prof = timeline.shot.profile;
  const A = timeline.A;
  const open = gates.filter(g => Number.isFinite(g.tArrive)).map(g => ({ id: g.id, t: g.tArrive, share: g.share, open: true }));
  const closed = gates.filter(g => !Number.isFinite(g.tArrive)).map(g => ({ id: g.id, t: NaN, share: g.share, open: false }));
  if (!open.length) return null;
  open.sort((a, b) => a.t - b.t);
  const tFirst = open[0].t;
  const tEnd = prof.endTime;
  const sumShare = open.reduce((a, g) => a + g.share, 0) || 1;
  /* Offene Anteile zur Zeit t — auf die Summe aller offenen normiert, damit
     nach dem letzten Anschnitt der ganze Strom in die Kavität geht, auch
     wenn ein Ast nie erreicht wird. */
  const shareAt = t => {
    let s = 0;
    for (const g of open) if (g.t <= t + 1e-12) s += g.share;
    return s / sumShare;
  };
  /* Trapezregel über die Kurve; an den Öffnungszeiten liegen Stützstellen,
     und der offene Anteil ist innerhalb eines Intervalls der vom Anfang —
     er springt genau an den Stützstellen, nicht dazwischen. */
  const ts = [];
  for (let i = 0; i <= steps; i++) ts.push(tFirst + (tEnd - tFirst) * i / steps);
  for (const g of open) if (g.t > tFirst && g.t < tEnd) ts.push(g.t);
  ts.sort((a, b) => a - b);
  const T = [], V = [];
  let acc = 0, prevT = tFirst, prevV = prof.atTime(tFirst).v;
  T.push(tFirst); V.push(0);
  for (let i = 1; i < ts.length; i++) {
    const t = ts[i];
    if (t - prevT < 1e-12) continue;
    const v = prof.atTime(t).v;
    acc += A * shareAt(prevT) * 0.5 * (prevV + v) * (t - prevT);
    T.push(t); V.push(acc);
    prevT = t; prevV = v;
  }
  const maxVolume = acc;
  const lerpIn = (xs, ys, x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const f = (x - xs[lo]) / Math.max(xs[hi] - xs[lo], 1e-15);
    return ys[lo] + (ys[hi] - ys[lo]) * f;
  };
  return {
    tFirst, tCurveEnd: tEnd, gates: open.concat(closed), maxVolume,
    /** Zustrom in die Kavität bis t, m³. */
    volumeAtTime: t => (t <= tFirst ? 0 : lerpIn(T, V, t)),
    /** Zeit ab Kolbenstart, zu der V (m³) in der Kavität ist — null, wenn die Kurve vorher endet. */
    timeAtVolume: v => (v <= 0 ? tFirst : v > maxVolume + 1e-15 ? null : lerpIn(V, T, v))
  };
}

/**
 * Der Vorsprung je Anschnitt als Füllgrad: wie viel des Volumens `vol`
 * (m³, das Raster der Füllung) die früheren Anschnitte gefüllt haben, wenn
 * dieser öffnet. → { id: q (0..1) }, zu Anschnitte ohne Ankunft 1.
 */
export function openingFractions(clock, vol) {
  const out = {};
  for (const g of clock.gates) {
    out[g.id] = g.open && vol > 0 ? Math.max(0, Math.min(1, clock.volumeAtTime(g.t) / vol)) : 1;
  }
  return out;
}

/**
 * Füllgrad → Einheiten der Füllrechnung: aus einem Lauf ohne Vorsprung
 * (arrival je Zelle in Wegeinheiten) die Ankunft, bei der der Füllgrad q
 * erreicht war. → Funktion q ↦ Einheiten.
 */
export function unitsForFraction(arrival) {
  const list = [];
  for (let i = 0; i < arrival.length; i++) if (Number.isFinite(arrival[i])) list.push(arrival[i]);
  const sorted = Float32Array.from(list).sort();
  const n = sorted.length;
  return q => (n ? sorted[Math.max(0, Math.min(n - 1, Math.round(q * (n - 1))))] : 0);
}
