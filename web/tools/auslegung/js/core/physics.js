/* HPDC-Physik (portiert aus hpdc_math): Füllkammer, kritische Geschwindigkeit,
   Bewegungsprofil der Schusskurve und das komplette Schussmodell mit
   Ereignissen und Prüfungen. Dazu die abgeleiteten Größen, die Diagramme,
   Kennzahlen, Kurvengenerator und Domänenprüfung teilen (Füllgrad,
   NADCA-Füllzeit, spezifischer Gießdruck, Entlüftungsbedarf …): jede steht
   hier genau einmal, statt in jedem Verbraucher neu hergeleitet zu werden.
   Reine Rechenlogik, kein DOM. */

import { fmt, seq } from './format.js';

const PI = Math.PI;

/* ── Massen- und Geometrie-Helfer ── */
export function total(v) { return v.part + v.runner + v.overflow; }
export function afterGate(v) { return v.part + v.overflow; }
export function doseMass(v) { return total(v) + v.biscuit; }                     // kg Dosiergewicht (inkl. Pressrest)
export function doseVolume(v) { return doseMass(v) / v.density; }                // m³, flüssig dosiert
export function pistonArea(v) { return 0.25 * PI * v.diam * v.diam; }           // mm²
export function travel(m, v) { return 1e9 * (m / v.density) / pistonArea(v); }  // mm Flüssigsäule der Masse m

/* Füllgrad φ (Anteil, nicht %) einer Kammer Ø D × L in mm; ohne Angabe die
   gewählte Kammer. Eine Formel für Schussmodell, Domänenprüfung, Kurven-
   generator, Kennzahlen, Füllkammer-Schema und die Füllgrad-Diagramme.
   fillDiameter ist die Umkehrung: der Ø, der bei L den Füllgrad φ ergibt. */
export function fillRatio(v, Dmm = v.diam, Lmm = v.length) {
  return 1e9 * doseVolume(v) / (Lmm * (0.25 * PI * Dmm * Dmm));
}
export function fillDiameter(v, phi, Lmm = v.length) {
  return Math.sqrt(1e9 * doseVolume(v) / (Lmm * 0.25 * PI * phi));
}

/* Zwei Dichten: In der Füllkammer steht die Schmelze flüssig (density) —
   Füllgrad, „Kammer voll" und die Säule im Kammerrohr rechnen damit. Die
   Hohlräume von Anguss, Bauteil und Überlauf sind dagegen feste Geometrie:
   das Werkzeug ist um das lineare Schwindmaß s größer gebaut als das kalte
   Bauteil (densitySolid), die Kavität fasst also V = m·(1+s)³/ρ_s — das ist
   die Dichte bei Solidus ρ_sol = ρ_s/(1+s)³. Die Differenz zwischen der
   flüssig dosierten Masse und dem, was die Kavität beim Füllende flüssig
   aufnimmt, schiebt der Kolben in der Nachverdichtung nach; der Pressrest
   ist am Ende fest und wird mit ρ_sol gegen das Minimum geprüft.
   Ohne Feststoffdichte (alte Projekte, Presets ohne den Wert) fällt alles
   auf die Flüssigdichte zurück. */
export function rhoSolidus(v) {
  if (!(v.densitySolid > 0)) return v.density;
  const k = 1 + (v.shrink > 0 ? v.shrink / 100 : 0);
  return v.densitySolid / (k * k * k);
}
export function cavityVolume(m, v) { return m / rhoSolidus(v); }                         // m³ Hohlraum der festen Masse m
export function cavityTravel(m, v) { return 1e9 * cavityVolume(m, v) / pistonArea(v); }  // mm Kolbenweg dafür
export function biscuitSolid(v) { return cavityTravel(v.biscuit, v); }                   // mm Pressrest fest (Endlage)
/* Hub Nachverdichtung + Schwindung [mm]: vom Füllende (Kavität flüssig voll) bis zur
   Endlage (Pressrest fest) — speist Erstarrungsschwund von Kavität und Pressrest. */
export function intensStroke(v) {
  return travel(doseMass(v), v) - cavityTravel(total(v), v) - biscuitSolid(v);
}
/* Antriebskolbenfläche A_h = F_max/P_max [cm²] aus dem Maschinen-Preset
   (Gießkraft bei max. Akkumulatordruck); 1 kN/bar = 100 cm². */
export function hydArea(v) { return v.pAcc > 0 ? v.injForce / v.pAcc * 100 : NaN; }
/* Gießkraft im Betrieb [kN]: F_G = P_ein · A_h, der eingestellte Druck auf
   das Maximum begrenzt. Ohne gültige Drücke gab es bisher die MAXIMALE
   Kraft zurück — die am wenigsten konservative Annahme, ausgerechnet dann,
   wenn die Eingaben unbrauchbar sind. Jetzt NaN: die Kennzahl zeigt „—"
   und die Prüfung schlägt an, statt eine Maschine größer aussehen zu
   lassen, als sie ist. */
export function injForceEff(v) {
  if (!(v.injForce > 0)) return NaN;
  if (!(v.pAccOp > 0) || !(v.pAcc > 0)) return NaN;
  return v.injForce * Math.min(v.pAccOp, v.pAcc) / v.pAcc;
}
/* Spezifischer Gießdruck [bar]: die wirksame Gießkraft auf der Kolbenfläche
   Ø D in mm (p [bar] = 10⁴ · F [kN] / A [mm²]), ohne Angabe der montierte
   Kolben — derselbe statische Metalldruck p₀ wie im PQ²-Diagramm. */
export function specPressure(v, Dmm = v.diam) { return injForceEff(v) * 1e4 / (0.25 * PI * Dmm * Dmm); }
/* Max. spezifischer Gießdruck der Maschine: auf dem kleinsten Kolben (Ø dmin)
   — obere Grenze der Druckachsen und für psel. */
export function pMaxMachine(v) { return specPressure(v, v.dmin); }

/* Zuhaltung, gerechnet in shared/clampmodel.js (klassisches Script vor den
   Modulen, window.__CLAMP_MODEL__): der Hebelfaktor k der Außermittigkeit
   (ohne Säulenfeld 1) und der höchste Nachdruck, den die Zuhaltung hält,
   p_max = F_s / (100 · S · k · A). */
export function leverFactor(v) {
  return (v.tieX > 0 && v.tieY > 0) ? globalThis.__CLAMP_MODEL__.leverK(v.eccX, v.eccY, v.tieX, v.tieY) : 1;
}
export function clampPMax(v) { return globalThis.__CLAMP_MODEL__.pMax(v.force, v.area, v.safety, leverFactor(v)); }
/* Nötige Schließkraft [kN] beim Nachdruck psel, zentrisch: 100 · S · p · A. */
export function clampForceNeeded(v) { return globalThis.__CLAMP_MODEL__.forceKN(v.psel, v.area, v.safety, 1); }

/* Empfohlene Füllzeit nach NADCA [ms] bei der Wandstärke s (ohne Angabe die
   des Bauteils): t_f = k · s · (T_guss − T_fließ + S_zul · Z) / (T_fließ −
   T_form). Eine Formel für Diagramm, Kennzahl, Kurvengenerator und Auto-
   Flächen, mit EINEM Nullschutz: ohne Gefälle zur Form oder ohne positive
   Reserve gibt es keine Empfehlung (NaN), nie einen Wert. nadcaReserve ist
   der Zähler, die thermische Reserve der Schmelze in °C. */
export function nadcaReserve(v) { return v.Tcast - v.Tflow + v.Sfrac * v.Zconst; }
export function nadcaFillMs(v, wall = v.wall) {
  const den = v.Tflow - v.Tdie;
  if (!(den > 0)) return NaN;
  const t = v.kfill * wall * nadcaReserve(v) / den;
  return t > 0 ? t : NaN;
}

/* Kontinuität ab Anschnitt: die Kavität von Bauteil + Überlauf (fest, ρ_sol)
   ist V_a = A_K · v_p · t_f. Die Füllzeit [ms] bei der Kolbengeschwindig-
   keit vp [m/s]; pistonSpeedFor ist dieselbe Beziehung nach v_p aufgelöst
   und hat darum dieselbe Form. Kolben-Ø in mm, ohne Angabe der montierte. */
export function fillTimeAt(v, vp, Dmm = v.diam) {
  return 1e9 * cavityVolume(afterGate(v), v) / (vp * (0.25 * PI * Dmm * Dmm));
}
export function pistonSpeedFor(v, tMs, Dmm = v.diam) { return fillTimeAt(v, tMs, Dmm); }

/* Entlüftungsbedarf [mm²]: die Luft der ganzen Kavität (fest, ρ_sol) muss in
   der Füllzeit t_f [ms] mit höchstens v_luft,max durch die Entlüftung,
   A = V_luft / (t_f · v_luft,max). NaN ohne Füllzeit oder Grenze. */
export function ventAreaFor(v, tMs) {
  if (!(tMs > 0) || !(v.vAirMax > 0)) return NaN;
  return cavityVolume(total(v), v) / (tMs / 1000) / v.vAirMax * 1e6;
}

/* Zerstäubung nach Herman/NADCA (UPCT Gl. 2.38): J = v_a^1,71 · e_p · ρ,
   empirisch in inch-pound-Einheiten (v_a in in/s, Anschnittdicke e_p in
   inch, ρ in lb/in³). atomJ: der Faktor zur Anschnittgeschwindigkeit in
   m/s; atomSpeed: die Umkehrung, die v_a-Grenze zu einem J. NaN ohne
   Anschnittdicke oder Dichte. */
export function atomJ(v, va) {
  if (!isFinite(va) || !(va > 0) || !(v.gateTh > 0) || !(v.density > 0)) return NaN;
  return Math.pow(va / 0.0254, 1.71) * (v.gateTh / 25.4) * (v.density * 3.6127e-5);
}
export function atomSpeed(v, J) {
  if (!(J > 0) || !(v.gateTh > 0) || !(v.density > 0)) return NaN;
  return Math.pow(J / ((v.gateTh / 25.4) * (v.density * 3.6127e-5)), 1 / 1.71) * 0.0254;
}

/* Höhe h/D eines Kreissegments mit Flächenanteil phi (Bisektion) — die
   Füllhöhe der Kammer (auch im Schema, ui/chamber.js). */
export function segHeight(phi) {
  if (!(phi > 0)) return 0;
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
   OpenFOAM-CFD-Tabelle (fixtures/vkrit/v_krit_sim.csv → core/vkritTable.js),
   v_krit = √(9,81·D)·f(D, φ). Die CFD zeigt gegenüber der Flachwasser-
   theorie: Brechen VOR Deckenberührung (Theorie ab φ ≈ 0,3 zunehmend
   optimistisch) und einen Klein-Ø-Abschlag bei hohen Füllgraden — deshalb
   Tabelle statt Formel. Randregeln: D auf 60–300 mm geklemmt; φ < 0,1
   nutzt die 0,1-Spalte (konservativ, f steigt zu kleinen φ); φ > 0,9
   läuft linear auf 0 bei φ = 1. Details: Theorie-Artikel „Kritische
   Kolbengeschwindigkeit". D in m. */
import { VKRIT_D_MM, VKRIT_PHI, VKRIT_F, VKRIT_GRAVITY } from './vkritTable.js';

function tableF(Dmm, phi) {
  /* Über dem Gitter wird geklemmt. DARUNTER wurde bisher ebenfalls geklemmt —
     und weil f mit D steigt, meldete das für kleine Durchmesser ein zu HOHES
     v_krit: die unsichere Richtung. Stattdessen wird die Steigung der ersten
     beiden Stützstellen fortgesetzt (tD wird negativ), was den Verlauf der
     Daten weiterführt und konservativ ist. Python macht dasselbe. */
  const Dc = Math.min(VKRIT_D_MM[VKRIT_D_MM.length - 1], Dmm);
  let i = 0;
  while (i < VKRIT_D_MM.length - 2 && VKRIT_D_MM[i + 1] < Dc) i++;
  const tD = (Dc - VKRIT_D_MM[i]) / (VKRIT_D_MM[i + 1] - VKRIT_D_MM[i]);
  const row = j => Math.max(0, VKRIT_F[i][j] * (1 - tD) + VKRIT_F[i + 1][j] * tD);
  const pLo = VKRIT_PHI[0], pHi = VKRIT_PHI[VKRIT_PHI.length - 1];
  if (phi <= pLo) return row(0);
  if (phi >= pHi) return row(VKRIT_PHI.length - 1) * Math.max(0, (1 - phi) / (1 - pHi));
  let j = 0;
  while (j < VKRIT_PHI.length - 2 && VKRIT_PHI[j + 1] < phi) j++;
  const tP = (phi - VKRIT_PHI[j]) / (VKRIT_PHI[j + 1] - VKRIT_PHI[j]);
  return row(j) * (1 - tP) + row(j + 1) * tP;
}

export function vCrit(Dm, phi) {
  /* Mit derselben Konstante entnormieren, mit der die Tabelle normiert
     wurde — sie kommt aus dem Generator (vkritTable.js). */
  return Math.sqrt(VKRIT_GRAVITY * Dm) * tableF(Dm * 1000, phi);
}

/* Grenz-Ø der 1. Phase in m: der kleinste Ø in [lo, hi], bei dem v₁ ≤
   v_krit(D, φ) gilt. v_krit steigt mit D, deshalb per Bisektion; −Infinity
   heißt „schon lo reicht", Infinity „selbst hi ist zu langsam". Für das
   (φ, λ)-Fenster und die v_krit-Heatmap. */
export function critDiameter(v1, phi, lo, hi) {
  if (vCrit(lo, phi) >= v1) return -Infinity;
  if (vCrit(hi, phi) < v1) return Infinity;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (vCrit(m, phi) < v1) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
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
  /* Ein einziger Punkt bei s = 0 ergibt kein Segment: travel und endTime
     werden 0 und samples() liefert stumm NaN für s, v und a — jedes
     Diagramm rechnet danach mit Unsinn weiter. */
  if (arr.length < 2) throw 'Die Schusskurve braucht mindestens einen Wegpunkt bei s > 0.';
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

/* v₁ bzw. v₂ (key) aus einem computeShot-Ergebnis; NaN ohne gültige Kurve —
   fmt() zeigt dann „—", und jeder Vergleich mit > 0 fällt durch. */
export function shotSpeed(shot, key) {
  const x = shot && !shot.error ? shot[key] : NaN;
  return x > 0 ? x : NaN;
}

/* Schussmodell: Füllkammer + Ereignisse + Prüfungen.
   v = Eingabewerte, curvePoints = Schusskurven-Wegpunkte. */
export function computeShot(v, curvePoints) {
  let prof;
  try { prof = buildProfile(curvePoints); }
  catch (e) { return { error: '' + e }; }

  const A = 0.25 * PI * Math.pow(v.diam / 1000, 2), L = v.length / 1000;
  /* Kavitäten fest (ρ_sol), Dosierung flüssig (ρ) — siehe rhoSolidus */
  const rhoS = rhoSolidus(v);
  const Vr = v.runner / rhoS, Vp = v.part / rhoS, Vo = v.overflow / rhoS;
  const Vdose = doseVolume(v);
  const phi = fillRatio(v);
  if (phi >= 1) return { error: 'Dosiervolumen (' + fmt(Vdose * 1e6) + ' cm³) übersteigt das Kammervolumen: Füllgrad ≥ 100 %.' };
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
      ev.t = q.t; ev.v = q.v;
      /* Erst ab „Anguss gefüllt" fließt Schmelze durch den Anschnitt. Bei
         „Kammer voll" (i = 0) steht noch nichts im Anschnitt — dort eine
         Geschwindigkeit auszugeben, war eine erfundene Zahl (die
         Luftsimulation meldet an derselben Stelle 0: airsim/process.js setzt
         den Anschnittstrom nur in den Regionen part/overflow/complete). */
      ev.gv = (gateR && i > 0) ? q.v * gateR : null;
    }
    evs.push(ev);
  }

  /* Füllende (Kavität flüssig voll), dann Nachverdichtung bis zur Endlage
     L − Pressrest fest; biscLen = fester Pressrest (Prüfgröße), biscLiquid =
     Schmelzerest in der Kammer beim Füllende. */
  const totalStroke = sFill + (Vr + Vp + Vo) / A;
  const biscLen = (v.biscuit / rhoS) / A;
  const biscLiquid = L - totalStroke;
  /* NICHT klemmen: ein negativer Hub bedeutet, dass die Kavität samt festem
     Pressrest mehr Platz braucht, als die Dosierung flüssig hergibt — ein
     unmöglicher Schuss. Ihn als 0 mm anzuzeigen ließ die Zahl harmlos
     aussehen; die Luftsimulation lehnt denselben Fall ab (airsim/config.js). */
  const intens = biscLiquid - biscLen;
  let fill = null;
  if (evs[1].inP && evs[3].inP) fill = (evs[3].t - evs[1].t) * 1000;
  /* v1 = max. Kolbengeschwindigkeit bis „Kammer voll" (1. Phase);
     v2 = mittlere Kolbengeschwindigkeit nach dem Anschnitt (2. Phase):
     Weg/Zeit zwischen „Anguss gefüllt" und „Überlauf gefüllt". */
  const v1 = prof.maxVelBefore(sFill);
  const v2 = (evs[1].inP && evs[3].inP && evs[3].t > evs[1].t)
    ? (evs[3].s - evs[1].s) / 1000 / (evs[3].t - evs[1].t) : null;

  /* Jede Prüfung trägt eine id: die Liste ist nicht positionsstabil —
     der Beschleunigungseintrag, die Füllzeit und die Anschnittgeschwindig-
     keit stehen nur unter Bedingungen darin. Wer über den Index zugreift,
     trifft je nach Eingabe eine andere Prüfung. */
  const checks = [];
  const check = (id, ok, text) => checks.push({ id, ok: !!ok, text });
  check('vcrit', v1 <= vcrit + 1e-9, '1. Phase: max. ' + fmt(v1) + ' m/s bis Kammer voll ' + (v1 <= vcrit ? '≤' : '>') + ' v_krit ' + fmt(vcrit) + ' m/s (CFD).');
  check('vmax', prof.vmax <= v.vmax + 1e-9, 'Spitzengeschwindigkeit ' + fmt(prof.vmax) + ' m/s ' + (prof.vmax <= v.vmax ? '≤' : '>') + ' Maschinenlimit ' + fmt(v.vmax) + ' m/s.');
  const aPk = Math.max(prof.amax, -prof.amin, 0);
  if (v.amax > 0) check('amax', aPk <= v.amax + 1e-9, 'Spitzenbeschleunigung ' + fmt(aPk) + ' m/s² ' + (aPk <= v.amax ? '≤' : '>') + ' Maschinenlimit ' + fmt(v.amax) + ' m/s².');
  check('travel', prof.travel >= totalStroke - 1e-9, 'Kurvenhub ' + fmt(prof.travel * 1000) + ' mm ' + (prof.travel >= totalStroke ? 'deckt' : 'deckt NICHT') + ' den Gesamthub ' + fmt(totalStroke * 1000) + ' mm ab.');
  check('endlage', prof.travel <= L - biscLen + 2e-3, 'Kurvenende ' + fmt(prof.travel * 1000) + ' mm bleibt vor der Endlage (Kammer ' + fmt(v.length) + ' mm − Pressrest fest ' + fmt(biscLen * 1000) + ' mm).');
  check('biscuit', biscLen * 1000 >= v.biscuitMin, 'Pressrest fest ' + fmt(biscLen * 1000) + ' mm ' + (biscLen * 1000 >= v.biscuitMin ? '≥' : '<') + ' Minimum ' + fmt(v.biscuitMin) + ' mm (Hub Nachverdichtung + Schwindung ' + fmt(intens * 1000) + ' mm).');
  /* Eigene Prüfung: die Pressrest-Zeile oben prüft nur die feste Länge und
     blieb deshalb erfüllt, während der Hub negativ war — ein Schuss, bei dem
     Kavität und Pressrest fest mehr Platz brauchen, als die Dosierung
     flüssig hergibt. */
  check('intens', intens >= -1e-9, 'Nachverdichtung + Schwindung ' + fmt(intens * 1000) + ' mm '
    + (intens >= -1e-9 ? '≥ 0: die Dosierung deckt Kavität und Pressrest.'
      : '< 0: Kavität und Pressrest fest brauchen mehr Platz, als die Dosierung flüssig hergibt (Feststoffdichte unter der Schmelzedichte?).'));
  if (fill !== null) check('filltime', fill <= v.tmax, 'Füllzeit ab Anschnitt ' + fmt(fill) + ' ms ' + (fill <= v.tmax ? '≤' : '>') + ' Maximum ' + fmt(v.tmax) + ' ms.');
  if (gateR && evs[2].inP) check('gatev', evs[2].gv >= v.gateMin && evs[2].gv <= v.gateMax, 'Anschnittgeschwindigkeit bei Bauteilfüllung ' + fmt(evs[2].gv) + ' m/s im Zielband ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s.');

  return {
    profile: prof, samples: prof.samples(320), events: evs,
    phi, sFill, vcrit, gateR, totalStroke, biscLen, biscLiquid, intens, fill, v1, v2, Vdose, checks
  };
}
