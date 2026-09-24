/* Lattice-Boltzmann mit freier Oberfläche — der Kern, in JavaScript.

   Das Verfahren ist das von Körner u. a. (2005) für die Formfüllung:
   eine EINPHASIGE LBM (nur die Schmelze wird gerechnet, das Gas ist
   ein Druck), in der jede Zelle voll, leer oder Front ist. Frontzellen
   tragen eine MASSE, die sich aus dem Austausch der Verteilungen mit
   den Nachbarn ändert; wird sie größer als die Dichte, ist die Zelle
   voll, wird sie negativ, ist sie leer — und die Nachbarn rücken als
   neue Front nach. Verteilungen, die aus dem Gas kämen, gibt es nicht;
   sie werden aus dem Gleichgewicht zur Gasdichte 1 und der Geschwindig-
   keit der Zelle rekonstruiert, ebenso die aus der Richtung der
   Oberflächennormalen (Thürey), damit die Front druckfrei bleibt.

   Ein Schritt sind fünf Durchgänge über alle Zellen; jeder liest nur,
   was der vorige geschrieben hat, damit dieselben Durchgänge auf der
   GPU zellweise parallel laufen können (js/lbm/gpu.js ist die
   Abschrift in WGSL — gleiche Puffer, gleiche Reihenfolge):

     1  strömen + stoßen + Masse     (Front und volle Zellen; Kolben-
                                      zellen bekommen ihr Gleichgewicht)
     2  markieren                    (Front → voll / leer)
     3  Nachbarn                     (leer neben neu voll → Front,
                                      voll neben neu leer → Front,
                                      Widersprüche zugunsten voll)
     4  anlegen + zählen             (neue Frontzellen aus dem Mittel
                                      der Nachbarn; Überschuss der
                                      gewandelten Zellen und die Zahl
                                      ihrer Front-Nachbarn)
     5  anwenden                     (Flaggen setzen, Überschuss
                                      einsammeln, Ankunft stempeln)

   Stoß: BGK mit Smagorinsky-Zusatz — die Schmelze ist so dünnflüssig,
   dass die echte Zähigkeit auf dem Gitter nicht stabil wäre; τ liegt
   deshalb nie unter tau0, und der Wirbelzusatz macht aus dem Rest ein
   grobes LES. Schwerkraft als Volumenkraft nach Guo (2002): die
   Geschwindigkeit um die halbe Kraft verschoben, ein Quellterm im Stoß;
   im Anguss steht sie auf null (in den Millisekunden der Füllung fällt
   die Schmelze keinen Millimeter), in der Füllkammer trägt sie die Welle.
   Keine Oberflächenspannung.

   DER KOLBEN kann wandern (Füllkammer): vor dem Schritt wird die
   Zellschicht `ip` (Index entlang x) zum Kolben — Schmelze mit der
   Kolbengeschwindigkeit —, alles davor zu Stahl. Was der Kolben
   überfährt, hat er vorher als Zustrom eingeschoben; die Masse geht im
   Mittel auf. Ohne Kolbenwanderung (NO_PLUNGER) bleibt die Kolbenfläche,
   wie das Gitter sie anlegt.

   Speicher: je Richtung ein Feld über alle Zellen (i·N + idx), zwei
   Sätze im Wechsel; die Zellwerte in einem Gleitkomma- und einem
   Ganzzahlpuffer nach js/lbm/lattice.js (FF, FU) — der Gleitkommapuffer
   ebenfalls DOPPELT: Durchgang 1 liest Füllstand, Dichte und
   Geschwindigkeit der Nachbarn und schreibt dieselben Felder für die
   eigene Zelle; in einem Puffer sähe eine spätere Zelle schon neue Werte
   (und auf der GPU je nach Thread alte oder neue). Das Gitter hat einen
   Rand aus Wandzellen, deshalb braucht kein Nachbarzugriff eine
   Bereichsprüfung. Kein DOM — die Tests rechnen damit. */

import { Q, C, W, OPP, FLAG, NEVER, NO_PLUNGER, FF, FU, feq } from './lattice.js';

export const PARAMS = {
  tau0: 0.51,         // Relaxationszeit der Zähigkeit, nie darunter
  smagorinsky: 0.1,   // Konstante des Wirbelzusatzes
  kappa: 1e-3,        // Toleranz der Umwandlung Front ↔ voll/leer
  uMax: 0.25,         // Klemme der Gittergeschwindigkeit (Stabilität)
  g: [0, 0, 0]        // Schwerkraft in Gittereinheiten (Δx/Δt²)
};

export function createSolver(domain, params = {}) {
  const P = { ...PARAMS, ...params };
  const N = domain.N;
  const [nx, ny] = domain.dims;
  const OFF = C.map(c => c[0] + c[1] * nx + c[2] * nx * ny);
  const { WALL, GAS, INTERFACE, FLUID, INLET, OUTLET, TO_FLUID, TO_GAS, TO_IF_GAS, TO_IF_FLUID } = FLAG;

  let fA = new Float32Array(Q * N), fB = new Float32Array(Q * N);
  /* cfO: die Werte vor dem Schritt (Durchgang 1 liest sie), cfN: die
     neuen (Durchgang 1 schreibt, die übrigen lesen und schreiben). */
  let cfO = new Float32Array(FF.COUNT_F * N), cfN = new Float32Array(FF.COUNT_F * N);
  const cu = new Uint32Array(FU.COUNT_U * N);
  const MASS = FF.MASS * N, RHO = FF.RHO * N, UX = FF.UX * N, UY = FF.UY * N, UZ = FF.UZ * N,
    EPS = FF.EPS * N, EXCESS = FF.EXCESS * N;
  const FL = FU.FLAG * N, NEW1 = FU.NEW1 * N, NEW2 = FU.NEW2 * N, COUNT = FU.COUNT * N,
    ARRIVAL = FU.ARRIVAL * N, SENSOR = FU.SENSOR * N, SHAPE = FU.SHAPE * N;
  const gx = P.g[0], gy = P.g[1], gz = P.g[2];

  /* Anfang: volle und Kolbenzellen in Ruhe — mit der Dichte aus
     domain.rho0, wenn es sie gibt (hydrostatisch unter Schwerkraft),
     sonst 1 —, Frontzellen halb voll, Verteilungen im Gleichgewicht. */
  for (let idx = 0; idx < N; idx++) {
    const fl = domain.flags[idx];
    cu[FL + idx] = fl; cu[NEW1 + idx] = fl; cu[NEW2 + idx] = fl;
    cu[ARRIVAL + idx] = NEVER;
    cu[SENSOR + idx] = domain.sensor ? domain.sensor[idx] : 0;
    cu[SHAPE + idx] = domain.shape ? domain.shape[idx] : (fl === WALL ? 0 : 1);
    const r0 = domain.rho0 && domain.rho0[idx] > 0 ? domain.rho0[idx] : 1;
    cfO[RHO + idx] = r0;
    const m = fl === FLUID || fl === INLET ? r0 : fl === INTERFACE ? 0.5 * r0 : 0;
    cfO[MASS + idx] = m; cfO[EPS + idx] = fl === INTERFACE ? 0.5 : (m > 0 ? 1 : 0);
    if (fl === FLUID || fl === INLET || fl === INTERFACE) cu[ARRIVAL + idx] = 0;
    for (let i = 0; i < Q; i++) { fA[i * N + idx] = W[i] * r0; fB[i * N + idx] = W[i] * r0; }
  }
  cfN.set(cfO);
  const gateArrival = new Uint32Array((domain.gates || []).length).fill(NEVER);
  let lost = 0;

  const fi = new Float64Array(Q), fe = new Float64Array(Q);
  const sq2 = Math.sqrt(2), Csq = P.smagorinsky * P.smagorinsky;

  /* Rekonstruktion einer Verteilung, die aus dem Gas käme. */
  const recon = (i, ux, uy, uz, fOppOld) => feq(i, 1, ux, uy, uz) + feq(OPP[i], 1, ux, uy, uz) - fOppOld;

  /* Der Kolben: Nichtgleichgewichts-Extrapolation (Guo 2002). Das nackte
     Gleichgewicht zur Kolbengeschwindigkeit war halb Druck-, halb
     Geschwindigkeitsrand — der Zustrom lag zehn Prozent unter dem Soll.
     Mit dem Nichtgleichgewichtsanteil der Zelle davor stimmt er. */
  const inDir = domain.inletDir || 0;
  const inOff = OFF[inDir];

  /* Der Kolben wandert: Schicht ip wird Kolben — Einlass, wo Schmelze
     steht, Wand, wo Luft ist —, alles davor Stahl. */
  function pass0(uIn, ip) {
    if (ip === NO_PLUNGER) return;
    const nxy = nx * ny;
    for (let k = 0; k < N / nxy; k++) for (let j = 0; j < ny; j++) {
      const row = (k * ny + j) * nx;
      for (let i = 0; i <= ip && i < nx; i++) {
        const idx = row + i;
        const fl = cu[FL + idx];
        if (fl === WALL || fl === INLET && i === ip) continue;
        if (i < ip || cu[SHAPE + idx] !== 1 || fl === GAS || fl === OUTLET) {
          cu[FL + idx] = WALL; cu[NEW1 + idx] = WALL; cu[NEW2 + idx] = WALL;
          cfO[MASS + idx] = 0; cfO[EPS + idx] = 0;
        } else {
          cu[FL + idx] = INLET; cu[NEW1 + idx] = INLET; cu[NEW2 + idx] = INLET;
          cfO[RHO + idx] = 1; cfO[UX + idx] = uIn[0]; cfO[UY + idx] = uIn[1]; cfO[UZ + idx] = uIn[2];
          cfO[MASS + idx] = 1; cfO[EPS + idx] = 1;
          for (let q = 0; q < Q; q++) fA[q * N + idx] = feq(q, 1, uIn[0], uIn[1], uIn[2]);
        }
      }
    }
  }

  function pass1(uIn) {
    for (let idx = 0; idx < N; idx++) {
      const fl = cu[FL + idx];
      if (fl === INLET) {
        const nb = idx + inOff;
        const nfl = cu[FL + nb];
        if (inDir && (nfl === FLUID || nfl === INTERFACE)) {
          const r = cfO[RHO + nb], vx = cfO[UX + nb], vy = cfO[UY + nb], vz = cfO[UZ + nb];
          for (let i = 0; i < Q; i++) {
            fB[i * N + idx] = feq(i, r, uIn[0], uIn[1], uIn[2]) + (fA[i * N + nb] - feq(i, r, vx, vy, vz));
          }
          cfN[RHO + idx] = r;
        } else {
          for (let i = 0; i < Q; i++) fB[i * N + idx] = feq(i, 1, uIn[0], uIn[1], uIn[2]);
          cfN[RHO + idx] = 1;
        }
        cfN[UX + idx] = uIn[0]; cfN[UY + idx] = uIn[1]; cfN[UZ + idx] = uIn[2];
        cfN[MASS + idx] = 1; cfN[EPS + idx] = 1; cfN[EXCESS + idx] = 0;
        continue;
      }
      if (fl !== FLUID && fl !== INTERFACE) {
        /* Unbeteiligt: die Werte mitnehmen, damit der neue Satz vollständig ist. */
        cfN[MASS + idx] = cfO[MASS + idx]; cfN[RHO + idx] = cfO[RHO + idx];
        cfN[UX + idx] = cfO[UX + idx]; cfN[UY + idx] = cfO[UY + idx]; cfN[UZ + idx] = cfO[UZ + idx];
        cfN[EPS + idx] = cfO[EPS + idx]; cfN[EXCESS + idx] = cfO[EXCESS + idx];
        continue;
      }
      const uxo = cfO[UX + idx], uyo = cfO[UY + idx], uzo = cfO[UZ + idx];
      const epsOld = cfO[EPS + idx];
      /* Normale der Front aus dem Füllstand der Nachbarn — zum Gas hin. */
      let nX = 0, nY = 0, nZ = 0;
      if (fl === INTERFACE) {
        const e = k => (cu[FL + k] === WALL ? epsOld : cfO[EPS + k]);
        nX = e(idx - 1) - e(idx + 1);
        nY = e(idx - nx) - e(idx + nx);
        nZ = e(idx - nx * ny) - e(idx + nx * ny);
        const l = Math.hypot(nX, nY, nZ);
        if (l > 1e-12) { nX /= l; nY /= l; nZ /= l; } else { nX = nY = nZ = 0; }
      }
      /* Strömen (ziehend): f_i kommt vom Nachbarn in Richtung −c_i. */
      for (let i = 0; i < Q; i++) {
        const nb = idx - OFF[i];
        const nfl = cu[FL + nb];
        if (nfl === WALL) fi[i] = fA[OPP[i] * N + idx];
        else if (nfl === GAS || nfl === OUTLET) fi[i] = recon(i, uxo, uyo, uzo, fA[OPP[i] * N + idx]);
        else if (fl === INTERFACE && i > 0 && -(nX * C[i][0] + nY * C[i][1] + nZ * C[i][2]) > 0) {
          fi[i] = recon(i, uxo, uyo, uzo, fA[OPP[i] * N + idx]);
        } else fi[i] = fA[i * N + nb];
      }
      /* Massenaustausch der Front mit vollen und Frontnachbarn. */
      let dm = 0;
      if (fl === INTERFACE) {
        for (let i = 1; i < Q; i++) {
          const nb = idx + OFF[i];
          const nfl = cu[FL + nb];
          if (nfl === FLUID || nfl === INLET) dm += fA[OPP[i] * N + nb] - fA[i * N + idx];
          else if (nfl === INTERFACE) dm += (fA[OPP[i] * N + nb] - fA[i * N + idx]) * 0.5 * (epsOld + cfO[EPS + nb]);
        }
      }
      /* Makroskopisch, um die halbe Kraft verschoben (Guo), geklemmt. */
      let rho = 0, ux = 0, uy = 0, uz = 0;
      for (let i = 0; i < Q; i++) { const v = fi[i]; rho += v; ux += C[i][0] * v; uy += C[i][1] * v; uz += C[i][2] * v; }
      if (!(rho > 1e-9)) rho = 1e-9;
      const Fx = rho * gx, Fy = rho * gy, Fz = rho * gz;
      ux = (ux + 0.5 * Fx) / rho; uy = (uy + 0.5 * Fy) / rho; uz = (uz + 0.5 * Fz) / rho;
      const sp = Math.hypot(ux, uy, uz);
      if (sp > P.uMax) { const s = P.uMax / sp; ux *= s; uy *= s; uz *= s; }
      /* Gleichgewicht und Nichtgleichgewichtsspannung für Smagorinsky. */
      let pxx = 0, pyy = 0, pzz = 0, pxy = 0, pxz = 0, pyz = 0;
      for (let i = 0; i < Q; i++) {
        fe[i] = feq(i, rho, ux, uy, uz);
        const d = fi[i] - fe[i];
        const c = C[i];
        pxx += c[0] * c[0] * d; pyy += c[1] * c[1] * d; pzz += c[2] * c[2] * d;
        pxy += c[0] * c[1] * d; pxz += c[0] * c[2] * d; pyz += c[1] * c[2] * d;
      }
      const qn = Math.sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2 * (pxy * pxy + pxz * pxz + pyz * pyz));
      const tau = 0.5 * (P.tau0 + Math.sqrt(P.tau0 * P.tau0 + 18 * sq2 * Csq * qn / rho));
      const om = 1 / tau;
      if (Fx || Fy || Fz) {
        const fac = 1 - 0.5 * om;
        const uF = ux * Fx + uy * Fy + uz * Fz;
        for (let i = 0; i < Q; i++) {
          const c = C[i];
          const cF = c[0] * Fx + c[1] * Fy + c[2] * Fz;
          const cU = c[0] * ux + c[1] * uy + c[2] * uz;
          const S = fac * W[i] * (3 * cF + 9 * cU * cF - 3 * uF);
          fB[i * N + idx] = fi[i] - om * (fi[i] - fe[i]) + S;
        }
      } else {
        for (let i = 0; i < Q; i++) fB[i * N + idx] = fi[i] - om * (fi[i] - fe[i]);
      }
      cfN[RHO + idx] = rho; cfN[UX + idx] = ux; cfN[UY + idx] = uy; cfN[UZ + idx] = uz;
      cfN[EXCESS + idx] = 0;
      if (fl === FLUID) { cfN[MASS + idx] = rho; cfN[EPS + idx] = 1; }
      else {
        const m = cfO[MASS + idx] + dm;
        cfN[MASS + idx] = m;
        cfN[EPS + idx] = Math.min(1, Math.max(0, m / rho));
      }
    }
  }

  function pass2() {
    for (let idx = 0; idx < N; idx++) {
      const fl = cu[FL + idx];
      if (fl === WALL) continue;
      let nf = fl;
      if (fl === INTERFACE) {
        const m = cfN[MASS + idx], r = cfN[RHO + idx];
        let hasGas = false, hasFluid = false;
        for (let i = 1; i < Q; i++) {
          const nfl = cu[FL + idx + OFF[i]];
          if (nfl === GAS || nfl === OUTLET) hasGas = true;
          else if (nfl === FLUID || nfl === INLET) hasFluid = true;
        }
        if (m > (1 + P.kappa) * r) nf = TO_FLUID;
        else if (m < -P.kappa * r) nf = TO_GAS;
        else if (!hasGas) nf = TO_FLUID;
        else if (!hasFluid && m < 0.1 * r) nf = TO_GAS;
      }
      cu[NEW1 + idx] = nf;
    }
  }

  function pass3() {
    for (let idx = 0; idx < N; idx++) {
      const fl = cu[FL + idx];
      if (fl === WALL) continue;
      let nf = cu[NEW1 + idx];
      if (fl === GAS) {
        for (let i = 1; i < Q; i++) if (cu[NEW1 + idx + OFF[i]] === TO_FLUID) { nf = TO_IF_GAS; break; }
      } else if (fl === FLUID) {
        for (let i = 1; i < Q; i++) if (cu[NEW1 + idx + OFF[i]] === TO_GAS) { nf = TO_IF_FLUID; break; }
      } else if (nf === TO_GAS) {
        for (let i = 1; i < Q; i++) if (cu[NEW1 + idx + OFF[i]] === TO_FLUID) { nf = INTERFACE; break; }
      }
      cu[NEW2 + idx] = nf;
    }
  }

  function pass4() {
    for (let idx = 0; idx < N; idx++) {
      const nf = cu[NEW2 + idx];
      if (nf === TO_IF_GAS) {
        let r = 0, ux = 0, uy = 0, uz = 0, n = 0;
        for (let i = 1; i < Q; i++) {
          const nb = idx + OFF[i];
          const nfl = cu[FL + nb];
          if (nfl === FLUID || nfl === INTERFACE || nfl === INLET) {
            r += cfN[RHO + nb]; ux += cfN[UX + nb]; uy += cfN[UY + nb]; uz += cfN[UZ + nb]; n++;
          }
        }
        if (n) { r /= n; ux /= n; uy /= n; uz /= n; } else { r = 1; ux = uy = uz = 0; }
        for (let i = 0; i < Q; i++) fB[i * N + idx] = feq(i, r, ux, uy, uz);
        cfN[RHO + idx] = r; cfN[UX + idx] = ux; cfN[UY + idx] = uy; cfN[UZ + idx] = uz;
        cfN[MASS + idx] = 0; cfN[EPS + idx] = 0;
      } else if (nf === TO_FLUID || nf === TO_GAS) {
        cfN[EXCESS + idx] = nf === TO_FLUID ? cfN[MASS + idx] - cfN[RHO + idx] : cfN[MASS + idx];
        let cnt = 0;
        for (let i = 1; i < Q; i++) {
          const n2 = cu[NEW2 + idx + OFF[i]];
          if (n2 === INTERFACE || n2 === TO_IF_GAS || n2 === TO_IF_FLUID) cnt++;
        }
        cu[COUNT + idx] = cnt;
        if (!cnt) lost += cfN[EXCESS + idx];
      }
    }
  }

  function pass5(step) {
    for (let idx = 0; idx < N; idx++) {
      const nf = cu[NEW2 + idx];
      if (nf === WALL) continue;
      let fl = nf;
      if (nf === TO_FLUID) { fl = FLUID; cfN[MASS + idx] = cfN[RHO + idx]; cfN[EPS + idx] = 1; }
      else if (nf === TO_GAS) { fl = GAS; cfN[MASS + idx] = 0; cfN[EPS + idx] = 0; cfN[UX + idx] = 0; cfN[UY + idx] = 0; cfN[UZ + idx] = 0; }
      else if (nf === TO_IF_GAS) fl = INTERFACE;
      else if (nf === TO_IF_FLUID) { fl = INTERFACE; cfN[MASS + idx] = cfN[RHO + idx]; }
      if (fl === INTERFACE) {
        let m = cfN[MASS + idx];
        for (let i = 1; i < Q; i++) {
          const nb = idx + OFF[i];
          const n2 = cu[NEW2 + nb];
          if (n2 === TO_FLUID || n2 === TO_GAS) {
            const cnt = cu[COUNT + nb];
            if (cnt) m += cfN[EXCESS + nb] / cnt;
          }
        }
        cfN[MASS + idx] = m;
        cfN[EPS + idx] = Math.min(1, Math.max(0, m / cfN[RHO + idx]));
      }
      cu[FL + idx] = fl;
      if ((fl === INTERFACE || fl === FLUID) && cu[ARRIVAL + idx] === NEVER) {
        cu[ARRIVAL + idx] = step;
        const g = cu[SENSOR + idx];
        if (g && step < gateArrival[g - 1]) gateArrival[g - 1] = step;
      }
    }
  }

  return {
    N, gateArrival,
    /** Ein Zeitschritt mit der Kolbengeschwindigkeit uIn (Gittereinheiten)
        und, wenn der Kolben wandert, seiner Zellschicht ip. */
    step(uIn, s, ip = NO_PLUNGER) {
      pass0(uIn, ip); pass1(uIn); pass2(); pass3(); pass4(); pass5(s);
      const t = fA; fA = fB; fB = t;
      const c = cfO; cfO = cfN; cfN = c;
    },
    /** Füllstand je Zelle (0 … 1). */
    fill() { return cfO.subarray(EPS, EPS + N); },
    /** Geschwindigkeit je Zelle in Gittereinheiten: N-mal x, dann y, dann z. */
    velocity() { return cfO.subarray(UX, UX + 3 * N); },
    /** Ankunftsschritt je Zelle (NEVER = nie). */
    arrival() { return cu.subarray(ARRIVAL, ARRIVAL + N); },
    flags() { return cu.subarray(FL, FL + N); },
    /** Masse über alle Schmelzezellen, ohne Kolbenzellen; und was beim
        Umwandeln ohne Front-Nachbarn verloren ging. */
    totals() {
      let m = 0;
      for (let idx = 0; idx < N; idx++) {
        const fl = cu[FL + idx];
        if (fl === FLUID || fl === INTERFACE) m += cfO[MASS + idx];
      }
      return { mass: m, lost };
    },
    dispose() {}
  };
}
