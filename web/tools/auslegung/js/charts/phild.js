/* (φ, λ)-Auslegungsfenster: Machbarkeit der Füllkammer bei fester Dosiermenge.

   Geometrische Formulierung: Bei festem Dosiervolumen V legt jeder Punkt
   (φ, r = L/D) genau eine Kammer fest:
     D(φ, r) = ∛(4V / (π·φ·r)),   L(φ, r) = ∛(4V·r² / (π·φ))
   Jede Grenze (Ø-Bereich, Längenbereich, Pressrest, v_krit) ist eine monotone
   Schranke r(φ) — das machbare Gebiet ist das Band r_lo(φ) ≤ r ≤ r_hi(φ)
   und wird als ein geschlossenes Polygon gefüllt statt pixelweise. */

import { seq, fmt } from '../core/format.js';
import { doseVolume, fillRatio, vCrit, critDiameter, cavityVolume, shotSpeed } from '../core/physics.js';
import { feasibleBand } from '../core/limits.js';
import { eq, mathSetter } from './mathfmt.js';

const PI = Math.PI;
const R_MIN = 1, R_MAX = 12;
const D_LO = 0.01, D_HI = 2;                    // Suchbereich des Grenz-Ø in m

/* Kerngrößen für calc() und renderMath(): Dosiervolumen V (flüssig), das
   Pressrestvolumen V_b (fest, ρ_sol, geprüft gegen die Mindestlänge) und
   der größte Ø D_b in m, bei dem der Pressrest sie noch hält (ohne
   Mindestlänge unbeschränkt). */
function kern(v) {
  const V = doseVolume(v), Vb = cavityVolume(v.biscuit, v);
  const bmin = v.biscuitMin / 1000;
  return { V, Vb, Db: bmin > 0 ? Math.sqrt(4 * Vb / (PI * bmin)) : Infinity };
}

export default {
  id: 'phild',
  title: 'Auslegungsfenster (φ, λ)',
  desc: 'Machbarkeit der Füllkammer bei fester Dosiermenge',
  inputs: ['part', 'runner', 'overflow', 'biscuit', 'density', 'densitySolid', 'shrink', 'dmin', 'dmax', 'lmin', 'lmax', 'biscuitMin', 'fillMin', 'fillMax', 'diam', 'length'],
  usesCurve: true,

  calc(v, o) {
    /* Dosierung flüssig; der Pressrest wird fest (ρ_sol) gegen das Minimum geprüft */
    const { V, Vb, Db } = kern(v);
    const k = 4 * V / PI;
    const Dmin = v.dmin / 1000, Dmax = v.dmax / 1000;
    const Lmin = v.lmin / 1000, Lmax = v.lmax / 1000;
    const DmaxEff = Math.min(Dmax, Db);
    /* v1 = max. Kolbengeschwindigkeit bis „Kammer voll" aus der Schusskurve
       (NaN ohne Kurve: dann gibt es keine v_krit-Grenze) */
    const v1 = shotSpeed(o && o.shot, 'v1');

    /* Grenzkurven als r(φ) */
    const rD = (phi, D) => k / (phi * D * D * D);                    // konst. Ø: Hyperbel
    const rL = (phi, L) => Math.sqrt(PI * L * L * L * phi / (4 * V)); // konst. L: Wurzelkurve
    const rCrit = phi => {                                            // v1 ≤ v_krit ⇔ D ≥ Dc(φ)
      if (!(v1 > 0)) return Infinity;
      const Dc = critDiameter(v1, phi, D_LO, D_HI);                   // Infinity: selbst Ø 2 m zu langsam
      return isFinite(Dc) ? rD(phi, Dc) : Dc < 0 ? rD(phi, D_LO) : 0;
    };

    /* Machbares Band: Polygon(e) zwischen r_lo(φ) und r_hi(φ) — Scanline-
       Hüllkurven aus core/limits.js (max der unteren, min der oberen
       Schranken; das Band zerfällt automatisch, wo es sich zuschnürt). */
    const phis = seq(0.02, 0.98, 481);
    const band = feasibleBand(phis,
      [phi => rD(phi, DmaxEff), phi => rL(phi, Lmin)],
      [phi => rD(phi, Dmin), phi => rL(phi, Lmax), rCrit],
      R_MIN, R_MAX)
      .polys.map(poly => poly.map(([phi, r]) => [phi * 100, r]));

    /* Grenzkurven zum Zeichnen */
    const cphis = seq(0.02, 0.98, 241);
    const curve = (t, l, fn) => ({ t, l, p: cphis.map(phi => [phi * 100, fn(phi)]).filter(p => isFinite(p[1])) });
    const curves = [
      curve('bore', 'Ø min ' + fmt(v.dmin), phi => rD(phi, Dmin)),
      curve('bore', 'Ø max ' + fmt(v.dmax), phi => rD(phi, Dmax)),
      curve('len', 'L min ' + fmt(v.lmin), phi => rL(phi, Lmin)),
      curve('len', 'L max ' + fmt(v.lmax), phi => rL(phi, Lmax))
    ];
    if (isFinite(Db) && Db < Dmax) curves.push(curve('bisc', 'Pressrest: Ø ≤ ' + fmt(Db * 1000), phi => rD(phi, Db)));
    if (v1 > 0) curves.push(curve('crit', 'v_krit (v₁ = ' + fmt(v1) + ' m/s)', rCrit));

    /* Dezente Iso-Hilfslinien (konstanter Ø bzw. konstante Kammerlänge) */
    const iso = [];
    let cand = [];
    for (let dmm = 50; dmm <= 1500; dmm += 50) {
      const rTest = 4 * V / (PI * 0.5 * Math.pow(dmm / 1000, 3));
      if (rTest >= 0.5 && rTest <= 30) cand.push(dmm);
    }
    while (cand.length > 6) cand = cand.filter((_, i) => i % 2 === 0);
    cand.forEach(dv => {
      const p = [];
      phis.forEach(phi => {
        const r = rD(phi, dv / 1000);
        if (r >= R_MIN && r <= R_MAX) p.push([phi * 100, r]);
      });
      if (p.length > 1) iso.push({ l: 'Ø ' + dv, p });
    });
    [0.3, 0.5, 0.7, 0.9, 1.2, 1.5, 2].forEach(Lv => {
      const p = [];
      seq(R_MIN, R_MAX, 60).forEach(r => {
        const phi = 4 * V * r * r / (PI * Lv * Lv * Lv);
        if (phi >= 0.02 && phi <= 0.98) p.push([phi * 100, r]);
      });
      if (p.length > 1) iso.push({ l: 'L ' + fmt(Lv * 1000), p, end: 1 });
    });

    /* Ist-Punkt */
    const phiCur = fillRatio(v), rCur = v.length / v.diam;
    let cur = null;
    if (phiCur > 0 && phiCur < 1)
      cur = { phi: phiCur * 100, r: rCur, l: 'Ist: Ø ' + fmt(v.diam) + ' · L ' + fmt(v.length) + ' · φ ' + fmt(phiCur * 100) + ' %' };

    return {
      kind: 'map', rMin: R_MIN, rMax: R_MAX,
      band, curves, iso, cur,
      fillMin: v.fillMin, fillMax: v.fillMax,
      /* Ein Punkt (φ als Anteil, r = λ) exakt aus den Formeln: die Kammer,
         die er festlegt, und die Grenzen, die sie verletzt (Schlüssel wie
         render/map.js MAP_LABELS) — für den Hover (render/hover.js). */
      classify(phi, r) {
        const D = Math.cbrt(4 * V / (PI * phi * r));      // m
        const L = r * D;                                  // m
        const b = 4 * Vb / (PI * D * D) * 1000;           // mm Pressrest fest
        const vc = vCrit(D, phi);                         // m/s
        const bad = [];
        if (D * 1000 < v.dmin || D * 1000 > v.dmax) bad.push('bore');
        if (L * 1000 < v.lmin || L * 1000 > v.lmax) bad.push('len');
        if (b < v.biscuitMin) bad.push('bisc');
        if (v1 > vc) bad.push('crit');
        return { D, L, b, vc, bad };
      },
      xl: 'Anfangs-Füllgrad φ in %', yl: 'Kammerverhältnis λ = L/D',
      info: 'Dosiert ' + fmt(V * 1e6) + ' cm³ (inkl. Pressrest) · jedes (φ, λ) legt genau eine Kammer (Ø, L) fest'
    };
  },

  /* Mathe-Erklärung für die Einzelseite (chart.html). Statische Gleichungen;
     die <b data-m="…">-Platzhalter werden von renderMath() live befüllt. */
  mathHTML() {
    return `
<h4>1 · Volumen aus der Massenbilanz</h4>
<p class="math-note">Das Auslegungsfenster beantwortet die Kammerfrage als Ganzes: <em>Welche Kombinationen aus
Kolben-Ø und Kammerlänge sind mit diesem Schuss überhaupt machbar?</em> Fester Ausgangspunkt ist das dosierte
Volumen, flüssig, denn so liegt es in der Kammer. Nur der Pressrest wird fest gerechnet (ρ<sub>sol</sub> =
ρ<sub>s</sub>/(1+s)³), weil seine Mindestlänge eine Prüfung der Endlage ist:</p>
${eq('V = \\frac{m_{\\text{dos}}}{\\rho } = \\frac{m_{\\text{Bauteil}} + m_{\\text{Anguss}} + m_{\\text{Überlauf}} + m_{\\text{Pressrest}}}{\\rho }')}
${eq('V_{b} = \\frac{m_{\\text{Pressrest}}}{\\rho_{\\text{sol}}}')}
<p class="math-note">Aktuell: V = <b data-m="V"></b> · V<sub>b</sub> = <b data-m="Vb"></b></p>

<h4>2 · Koordinaten und Transformation</h4>
<p class="math-note">Achsen: Anfangs-Füllgrad φ = V / (A·L) und Kammerverhältnis λ = L/D (in den Formeln kurz r) mit Kolbenfläche A = π·D²/4.
Da das Dosiervolumen V fest ist, legt jeder Punkt (φ, r) genau eine Kammer fest:</p>
${eq('V = \\varphi \\cdot \\frac{\\pi \\cdot D^{2}}{4} \\cdot L')}
${eq('D(\\varphi , r) = \\sqrt[3]{\\frac{4V}{\\pi \\cdot \\varphi \\cdot r}} \\qquad L(\\varphi , r) = r \\cdot D = \\sqrt[3]{\\frac{4V \\cdot r^{2}}{\\pi \\cdot \\varphi }}')}
${eq('\\text{Umkehrung:}\\ \\; \\varphi (D, L) = \\frac{4V}{\\pi \\cdot D^{2} \\cdot L} \\qquad r(D, L) = \\frac{L}{D}')}

<h4>3 · Grenzkurven</h4>
<p class="math-note">Jede Grenze wird zu einer Schranke für r bei gegebenem φ. Kurven konstanten Durchmessers sind
Hyperbeln (r ∝ 1/φ), Kurven konstanter Länge sind Wurzelkurven (r ∝ √φ).</p>
${eq('\\text{Ø-Bereich:}\\ \\; r = \\frac{4V}{\\pi \\cdot \\varphi \\cdot D^{3}} \\;\\ \\text{mit}\\ D = D_{\\min}\\ (\\text{obere Grenze})\\ \\text{bzw.}\\ D = D_{\\max}\\ (\\text{untere Grenze})')}
${eq('\\text{Längenbereich:}\\ \\; r = \\sqrt{\\frac{\\pi \\cdot L^{3} \\cdot \\varphi }{4V}} \\;\\ \\text{mit}\\ L = L_{\\max}\\ (\\text{obere})\\ \\text{bzw.}\\ L = L_{\\min}\\ (\\text{untere Grenze})')}
${eq('\\text{Pressrest:}\\ \\; b = \\frac{V_{b}}{A} = \\frac{4V_{b}}{\\pi \\cdot D^{2}} \\ge b_{\\min} \\; \\Leftrightarrow \\; D \\le D_{b} = \\sqrt{\\frac{4V_{b}}{\\pi \\cdot b_{\\min}}} \\; \\Rightarrow \\; r \\ge \\frac{4V}{\\pi \\cdot \\varphi \\cdot D_{b}^{3}}')}
<p class="math-note">Aktuell: D<sub>b</sub> = <b data-m="Db"></b>; der Mindest-Pressrest begrenzt den maximalen Kolben-Ø.</p>
${eq('\\text{Langsame Phase:}\\ \\; v_{1} \\le v_{\\text{krit}}(D, \\varphi) = \\sqrt{9{,}81 \\cdot D} \\cdot f(D, \\varphi) \\qquad \\text{mit}\\ f\\ \\text{aus der OpenFOAM-CFD-Tabelle}\\\\ (\\text{bilinear interpoliert}),\\ \\text{Grenz-Ø per Bisektion}')}
${eq('v_{1} \\le v_{\\text{krit}} \\; \\Leftrightarrow \\; D \\ge D_{c}(\\varphi) = \\frac{v_{1}^{2}}{9{,}81 \\cdot f(\\varphi)^{2}} \\; \\Rightarrow \\; r \\le \\frac{4V}{\\pi \\cdot \\varphi \\cdot D_{c}(\\varphi)^{3}} = \\frac{4V \\cdot 9{,}81^{3} \\cdot f(\\varphi)^{6}}{\\pi \\cdot \\varphi \\cdot v_{1}^{6}}')}

<h4>4 · Machbares Band</h4>
${eq('r_{\\text{lo}}(\\varphi) = \\max\\left( \\frac{4V}{\\pi \\cdot \\varphi \\cdot \\min(D_{\\max}, D_{b})^{3}}, \\; \\sqrt{\\frac{\\pi \\cdot L_{\\min}^{3} \\cdot \\varphi }{4V}} \\right)')}
${eq('r_{\\text{hi}}(\\varphi) = \\min\\left( \\frac{4V}{\\pi \\cdot \\varphi \\cdot D_{\\min}^{3}}, \\; \\sqrt{\\frac{\\pi \\cdot L_{\\max}^{3} \\cdot \\varphi }{4V}}, \\; \\frac{4V \\cdot 9{,}81^{3} \\cdot f(\\varphi)^{6}}{\\pi \\cdot \\varphi \\cdot v_{1}^{6}} \\right)')}
${eq('\\text{machbar}\\ \\; \\Leftrightarrow \\; r_{\\text{lo}}(\\varphi) \\le r \\le r_{\\text{hi}}(\\varphi)')}

<h4>5 · Geometrische Deutung</h4>
<p class="math-note">Das machbare Gebiet ist das Bild des Maschinen-Rechtecks
[D<sub>min</sub>, D<sub>max</sub>] × [L<sub>min</sub>, L<sub>max</sub>] unter der Abbildung (D, L) → (φ, r):
ein „verzerrtes Rechteck" zwischen zwei Hyperbeln und zwei Wurzelkurven, beschnitten durch die Pressrest-
und die v<sub>krit</sub>-Kurve. Seine Ecken sind die vier Grenzkombinationen:</p>
<div class="math-corners" data-m="corners"></div>`;
  },

  renderMath(el, v) {
    const { V, Vb, Db } = kern(v);
    const set = mathSetter(el);
    set('V', fmt(V * 1e6) + ' cm³');
    set('Vb', fmt(Vb * 1e6) + ' cm³');
    set('Db', isFinite(Db) ? fmt(Db * 1000) + ' mm' : '(kein Mindest-Pressrest gesetzt)');
    const corner = (Dmm, Lmm) => {
      const phi = fillRatio(v, Dmm, Lmm);
      const r = Lmm / Dmm;
      const out = phi >= 1 ? ' · <span class="math-out">außerhalb (φ ≥ 100 %, Kammer zu klein)</span>' : '';
      return '<li>Ø ' + fmt(Dmm) + ' × L ' + fmt(Lmm) + ' mm → φ = ' + fmt(phi * 100) + ' %, λ = ' + fmt(r) + out + '</li>';
    };
    set('corners', '<ul>'
      + corner(v.dmin, v.lmin) + corner(v.dmin, v.lmax)
      + corner(v.dmax, v.lmin) + corner(v.dmax, v.lmax) + '</ul>');
  }
};
