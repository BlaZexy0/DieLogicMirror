/* Schusskurven-Generatoren: erzeugen Wegpunkte [s mm, v m/s] für die
   generierten Modi (state.curveGen.mode):

   'focus' — die DieLogic-Kurve: fokussierendes Kolbengesetz für die runde
     Kammer (physics.focusLaw): jede Charakteristik der Kolbenwelle trifft
     die Stirnwand im selben Augenblick, das Gesetz erreicht die Decken-
     geschwindigkeit U_H genau bei „Kammer voll". Gekappt bei
     min(κ·U_H, v_krit) — κ nach der Studie des Papiers (DieLogic_OF,
     claude_paper: zulässig bis etwa 1,0·U_H, sicher 0,95·U_H), v_krit, damit
     die Prüfung der 1. Phase dieselbe Grenze sieht —, Plateau bis „Kammer
     voll", dann dieselbe 2. Phase wie 'lopez'.

   'lopez' — López-Faura-Hernández-Anfahrt (Theorie „Nebenbedingungen",
     Profil P5): v(t) = 2c₀[(1 − c₀t/ℓ)^(−1/3) − 1] mit c₀ = waveSpeed
     (Schwerewellen-Geschwindigkeit des ruhenden Bads) und ℓ ≈ L, bis
     v_krit (CFD-Tabelle) erreicht ist; Plateau bis „Kammer voll"; dann
     Rampe mit a_max auf v₂ — so gewählt, dass die Füllzeit ab Anschnitt
     (Anguss gefüllt → Überlauf gefüllt) inklusive der noch laufenden
     Rampe genau die empfohlene NADCA-Füllzeit trifft (v₂ ≤ v_max).

   'v1v2' — Rampe mit a₁ auf V₁, Plateau bis „Kammer voll", Rampe mit a₂
     auf V₂ bis zum Schussende (L − Pressrest).

   Reine Rechenlogik + ein dünner state-Wrapper (applyCurveGen), der als
   Preparer bei jedem notify() läuft; seine Meldung hält curveGenMessage()
   für die Kurventabelle bereit. */

import { state, addPreparer } from './state.js';
import { fmt } from './format.js';
import { total, fillRatio, vCrit, waveSpeed, focusLaw, cavityTravel, nadcaFillMs, pistonSpeedFor } from './physics.js';

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

/* Rampe von vFrom Richtung vTo ab s0 mit Beschleunigungsbetrag a, dann
   Plateau bis sEnd; a = 0 heißt „kein Limit" (kürzestmögliche Rampe).
   Reicht der Weg für die Rampe nicht, endet sie bei sEnd mit der tatsächlich
   erreichten Geschwindigkeit — die
   Beschleunigung überschreitet a dadurch nie. a in m/s², s in mm.
   Rückgabe: erreichte End-Geschwindigkeit, oder null wenn vTo erreicht wird. */
function ramp(pts, vFrom, vTo, s0, sEnd, a) {
  /* Endpunkt aufrunden, damit die Kurve den Gesamthub sicher abdeckt */
  const end = Math.ceil(sEnd * 10) / 10;
  let ds = a > 0 ? Math.abs(vTo * vTo - vFrom * vFrom) / (2 * a) * 1000 : 5;
  /* Aufrunden + kleine Marge: die 0,1-mm-Rundung der Punkte darf die
     Beschleunigung nur senken, nie über das Limit heben */
  ds = Math.max(Math.ceil(ds * 10) / 10 + 0.2, 1);
  if (a <= 0 || s0 + ds < sEnd - 0.5) {
    if (s0 + ds < sEnd - 0.5) pts.push([s0 + ds, vTo]);
    pts.push([end, vTo]);
    return null;
  }
  /* Rampe passt nicht: v² = v₀² ± 2a·Δs bis zum Schussende. Δs ab dem
     gerundeten s0 (clean() rundet ebenso), v in die sichere Richtung
     gerundet — beim Beschleunigen ab, beim Bremsen auf. */
  const s0r = Math.round(s0 * 10) / 10;
  const dsm = Math.max(end - s0r, 0.1) / 1000;
  const up = vTo >= vFrom;
  const v = Math.sqrt(Math.max(vFrom * vFrom + (up ? 2 : -2) * a * dsm, 0));
  const vEnd = up ? Math.floor(v * 1000) / 1000 : Math.ceil(v * 1000) / 1000;
  pts.push([end, vEnd]);
  return vEnd;
}

/* Füllzeit ab Anschnitt [ms] für eine 2. Phase „Rampe mit a ab s0 von v0 auf
   v2, dann Plateau": t(sOver) − t(sGate). Alle s in mm, v in m/s, a in m/s². */
export function fillTimeMs(v0, v2, a, s0, sGate, sOver) {
  const dRamp = a > 0 ? (v2 * v2 - v0 * v0) / (2 * a) * 1000 : 0;   // Rampenweg [mm]
  const sRampEnd = s0 + dRamp;
  const tAt = s => {
    /* Vor dem Rampenbeginn fährt der Kolben mit v0 — die 1. Phase. Ohne
       diesen Zweig wurde die Rampe rückwärts extrapoliert, und weil
       max(…, 0) die Wurzel abschneidet, sättigte das Ergebnis: mit dem
       Anschnitt 50 mm vor dem Rampenbeginn kamen 51,25 statt 91,25 ms
       heraus, und 350/300/200 mm lieferten alle denselben Wert. */
    if (s < s0) return v0 > 0 ? (s - s0) / 1000 / v0 : 0;
    if (s <= sRampEnd && a > 0) return (Math.sqrt(Math.max(v0 * v0 + 2 * a * (s - s0) / 1000, 0)) - v0) / a;
    const tRamp = a > 0 ? (v2 - v0) / a : 0;
    return tRamp + (s - sRampEnd) / 1000 / v2;
  };
  return (tAt(sOver) - tAt(sGate)) * 1000;
}

/* Plateau bis „Kammer voll" und 2. Phase, gemeinsam für 'focus' und
   'lopez': pts endet mit der Anfahrt, deren letzter Punkt vReached erreicht. */
function plateauAndFill(v, pts, vReached, sFill, sEnd) {
  /* Plateau abrunden, damit die Rundung v nicht über v_krit hebt */
  const vTop = Math.floor(vReached * 1000) / 1000;
  pts[pts.length - 1][1] = vTop;
  /* Plateau-Ende AUF 0,1 mm aufrunden: die Rampe der 2. Phase darf nie
     vor „Kammer voll" beginnen — sonst liegt v bei s_voll schon über
     v_krit (Prüfung der 1. Phase nimmt das Maximum bis genau s_voll). */
  const sR = Math.ceil(sFill * 10) / 10;
  if (pts[pts.length - 1][0] < sR) pts.push([sR, vTop]);
  else pts[pts.length - 1][0] = sR;

  /* 2. Phase: v₂ so, dass die Füllzeit ab Anschnitt die empfohlene
     NADCA-Füllzeit trifft — mit der Rampe, die ab „Kammer voll" noch in
     die Formfüllung hineinläuft (bei a_max = 0: sofort auf v₂). */
  const tNadca = nadcaFillMs(v);
  if (!(tNadca > 0)) return { error: 'NADCA-Füllzeit nicht berechenbar: Temperaturen und k prüfen.' };
  /* Die NADCA-Empfehlung, höchstens aber die zulässige Füllzeit t_max —
     sonst verletzte die erzeugte Kurve ihre eigene Füllzeit-Prüfung. */
  const tN = v.tmax > 0 ? Math.min(tNadca, v.tmax) : tNadca;
  const tLabel = tN < tNadca ? 'Füllzeit max. ' + fmt(tN) + ' ms' : 'NADCA-Füllzeit ' + fmt(tN) + ' ms';
  const sGate = sR + cavityTravel(v.runner, v);             // Anguss gefüllt [mm]
  const sOver = sR + cavityTravel(total(v), v);             // Überlauf gefüllt [mm]
  const vFlat = pistonSpeedFor(v, tN);                      // ohne Rampe nötig
  const want = v2 => fillTimeMs(vTop, v2, v.amax, sR, sGate, sOver);
  let v2, warn = null;
  const vCap = v.vmax > 0 ? v.vmax : Infinity;
  if (!(v.amax > 0)) {
    /* ramp() setzt auch ohne a_max eine kurze Rampe, die fillTimeMs nicht
       kennt: dieselbe Marge wie unten, damit die Füllzeit nicht über tN rutscht. */
    v2 = Math.min(Math.ceil(vFlat * 1000 + 10) / 1000, vCap);
    if (vFlat > vCap) warn = 'v_max ' + fmt(vCap) + ' m/s reicht für die ' + tLabel + ' nicht; erreichbar sind ' + fmt(want(vCap)) + ' ms.';
  } else {
    /* Schnellstmögliche 2. Phase: volle Rampe bis zum Schussende, höchstens v_max */
    const vEndMax = Math.floor(Math.sqrt(vTop * vTop + 2 * v.amax * (sEnd - sR) / 1000) * 1000) / 1000;
    const vFast = Math.min(vCap, vEndMax);
    if (want(vFast) > tN) {
      v2 = vFast;
      warn = (vEndMax < vCap ? 'a_max ' + fmt(v.amax) + ' m/s²' : 'v_max ' + fmt(vCap) + ' m/s')
        + ' reicht für die ' + tLabel + ' nicht; die Kurve fährt die schnellste mögliche 2. Phase, Füllzeit ≈ ' + fmt(want(vFast)) + ' ms.';
    } else {
      let lo = vTop, hi = vFast;
      for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (want(m) > tN) lo = m; else hi = m; }
      /* aufrunden + 0,01 m/s Marge: die 0,1-mm-Rundung der Wegpunkte darf die
         Füllzeit nicht über die NADCA-Empfehlung heben */
      v2 = Math.ceil(hi * 1000 + 10) / 1000;
    }
  }
  const w = ramp(pts, vTop, v2, sR, sEnd, v.amax);
  if (w !== null && !warn) warn = 'a_max reicht nicht: 2. Phase erreicht ' + fmt(w) + ' statt ' + fmt(v2) + ' m/s.';
  return { points: clean(pts), warn, v2, tN };
}

export function generateCurve(v, g) {
  const phi = fillRatio(v);
  if (!(phi > 0 && phi < 1)) return { error: 'Füllgrad außerhalb (0, 1), Kurve nicht generierbar.' };
  const sFill = (1 - phi) * v.length;                       // „Kammer voll" [mm]
  const sEnd = sFill + cavityTravel(total(v), v);            // Füllende: Kavität (fest, ρ_sol) voll [mm]

  if (g.mode === 'focus') {
    const D = v.diam / 1000;
    const law = focusLaw(phi);
    const vc = vCrit(D, phi);
    if (!law || !(vc > 0)) return { error: 'Fokusgesetz nicht berechenbar (Füllgrad prüfen).' };
    const kappa = g.kappa > 0 ? Math.min(g.kappa, 1) : 0.95;
    const sc = Math.sqrt(9.81 * D);                          // √(gD) [m/s]
    const UH = law.UH * sc;
    const cap = Math.min(kappa * UH, vc);
    /* Stützstellen gleichmäßig in der Zeit bis zum Erreichen der Kappe;
       zwischen ihnen beschleunigt das Profil konstant (v² linear in s). */
    const at = (x, xs, ys) => {
      let i = 1;
      while (i < xs.length - 1 && xs[i] < x) i++;
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + Math.max(0, Math.min(1, t)) * (ys[i] - ys[i - 1]);
    };
    const tauC = cap >= UH ? 1 : at(cap / sc, law.U, law.tau);
    const pts = [];
    const N = 10;
    for (let i = 1; i <= N; i++) {
      const tau = tauC * i / N;
      pts.push([at(tau, law.tau, law.xi) * v.length, at(tau, law.tau, law.U) * sc]);
    }
    return plateauAndFill(v, pts, Math.min(pts[N - 1][1], cap), sFill, sEnd);
  }

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
    return plateauAndFill(v, pts, vOf(tEnd), sFill, sEnd);
  }

  if (g.mode === 'v1v2') {
    if (!(g.v1 > 0 && g.a1 > 0 && g.v2 > 0 && g.a2 > 0))
      return { error: 'V₁, V₂, a₁ und a₂ müssen > 0 sein.' };
    const s1 = g.v1 * g.v1 / (2 * g.a1) * 1000;
    if (s1 >= sFill - 0.5)
      return { error: 'Rampe auf V₁ (' + Math.round(s1) + ' mm) reicht über „Kammer voll" (' + Math.round(sFill) + ' mm): a₁ erhöhen oder V₁ senken.' };
    /* Plateau-Ende auf 0,1 mm AUFrunden wie bei 'lopez': clean() rundet
       sonst ab, und die Rampe begänne vor „Kammer voll" (v₁ > V₁). */
    const sR = Math.ceil(sFill * 10) / 10;
    const pts = [[s1, g.v1], [sR, g.v1]];
    const w = ramp(pts, g.v1, g.v2, sR, sEnd, g.a2);
    return {
      points: clean(pts),
      warn: w === null ? null
        : 'Rampe auf V₂ passt nicht vor das Schussende: erreicht ' + fmt(w) + ' statt ' + fmt(g.v2) + ' m/s (a₂ erhöhen oder V₂ senken).'
    };
  }

  return { error: 'Unbekannter Kurvenmodus „' + g.mode + '".' };
}

/* In generierten Modi state.curve aus den aktuellen Eingaben neu erzeugen.
   Rückgabe: Fehler-/Hinweistext oder null; bei Fehler bleibt die letzte
   Kurve stehen, ein Hinweis (z. B. gekappte Rampe) übernimmt die Kurve. */
export function applyCurveGen(v) {
  const g = state.curveGen;
  if (!g || g.mode === 'points') return null;
  const r = generateCurve(v, g);
  if (r.error) return r.error;
  state.curve = r.points;
  return r.warn || null;
}

/* Generierte Kurven VOR persist() und den Subscribern aktualisieren:
   localStorage und alle Subscriber (z. B. die Luftsimulation in
   core/simstore.js) sehen so dieselbe Kurve wie die Diagramme — sonst
   hinge das von der Subscriber-Reihenfolge ab. Die Seiten rechnen die
   Kurve danach nicht noch einmal; die Meldung des Laufs holen sie sich
   hier (ui/page.js → Kurventabelle). */
let meldung = null;
export function curveGenMessage() { return meldung; }
addPreparer(() => { meldung = applyCurveGen(state.values); });
