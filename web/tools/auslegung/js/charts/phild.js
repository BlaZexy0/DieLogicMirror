/* (φ, λ)-Auslegungsfenster: Machbarkeit der Füllkammer bei fester Dosiermenge.

   Geometrische Formulierung: Bei festem Dosiervolumen V legt jeder Punkt
   (φ, r = L/D) genau eine Kammer fest:
     D(φ, r) = ∛(4V / (π·φ·r)),   L(φ, r) = ∛(4V·r² / (π·φ))
   Jede Grenze (Ø-Bereich, Längenbereich, Pressrest, v_krit) ist eine monotone
   Schranke r(φ) — das machbare Gebiet ist das Band r_lo(φ) ≤ r ≤ r_hi(φ)
   und wird als ein geschlossenes Polygon gefüllt statt pixelweise. */

import { seq, fmt, subHTML } from '../core/format.js';
import { total, vCrit, cavityVolume } from '../core/physics.js';
import { feasibleBand } from '../core/limits.js';
import { eq } from './mathfmt.js';

const PI = Math.PI;
const R_MIN = 1, R_MAX = 12;

/* Grenz-Ø der kritischen Geschwindigkeit: v₁ ≤ v_krit(D, φ) ⇔ D ≥ D_c(φ).
   v_krit kommt aus der CFD-Tabelle (core/physics.js) und ist in D monoton —
   D_c per Bisektion. */
function DcritFor(v1, phi) {
  let lo = 0.01, hi = 2;                        // m
  if (vCrit(hi, phi) < v1) return Infinity;     // selbst Ø 2 m zu langsam
  if (vCrit(lo, phi) >= v1) return lo;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (vCrit(m, phi) < v1) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

export default {
  id: 'phild',
  title: 'Auslegungsfenster (φ, λ)',
  desc: 'Machbarkeit der Füllkammer bei fester Dosiermenge',
  inputs: ['part', 'runner', 'overflow', 'biscuit', 'density', 'densitySolid', 'shrink', 'dmin', 'dmax', 'lmin', 'lmax', 'biscuitMin', 'fillMin', 'fillMax', 'diam', 'length'],
  usesCurve: true,

  calc(v, o) {
    const rho = v.density;
    /* Dosierung flüssig; der Pressrest wird fest (ρ_sol) gegen das Minimum geprüft */
    const V = (total(v) + v.biscuit) / rho, Vb = cavityVolume(v.biscuit, v);
    const k = 4 * V / PI;
    const Dmin = v.dmin / 1000, Dmax = v.dmax / 1000;
    const Lmin = v.lmin / 1000, Lmax = v.lmax / 1000;
    const bmin = v.biscuitMin / 1000;
    const Db = bmin > 0 ? Math.sqrt(4 * Vb / (PI * bmin)) : Infinity; // max. Ø aus Pressrest
    const DmaxEff = Math.min(Dmax, Db);
    /* v1 = max. Kolbengeschwindigkeit bis „Kammer voll" aus der Schusskurve */
    const v1 = o && o.shot && !o.shot.error && o.shot.v1 > 0 ? o.shot.v1 : 0;

    /* Grenzkurven als r(φ) */
    const rD = (phi, D) => k / (phi * D * D * D);                    // konst. Ø: Hyperbel
    const rL = (phi, L) => Math.sqrt(PI * L * L * L * phi / (4 * V)); // konst. L: Wurzelkurve
    const rCrit = phi => {                                            // v1 ≤ v_krit ⇔ D ≥ Dc(φ)
      if (!(v1 > 0)) return Infinity;
      const Dc = DcritFor(v1, phi);
      return isFinite(Dc) ? rD(phi, Dc) : 0;
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
    const Acur = 0.25 * PI * Math.pow(v.diam / 1000, 2);
    const phiCur = V / (Acur * (v.length / 1000)), rCur = v.length / v.diam;
    let cur = null;
    if (phiCur > 0 && phiCur < 1)
      cur = { phi: phiCur * 100, r: rCur, l: 'Ist: Ø ' + fmt(v.diam) + ' · L ' + fmt(v.length) + ' · φ ' + fmt(phiCur * 100) + ' %' };

    return {
      kind: 'map', rMin: R_MIN, rMax: R_MAX,
      band, curves, iso, cur,
      fillMin: v.fillMin, fillMax: v.fillMax,
      params: { V, Vb, dmin: v.dmin, dmax: v.dmax, lmin: v.lmin, lmax: v.lmax, Db: Db * 1000, biscuitMin: v.biscuitMin, v1 },
      xl: 'Anfangs-Füllgrad φ in %', yl: 'Kammerverhältnis λ = L/D',
      info: 'Dosiert ' + fmt(V * 1e6) + ' cm³ (inkl. Pressrest) · jedes (φ, λ) legt genau eine Kammer (Ø, L) fest'
    };
  },

  /* Mathe-Erklärung für die Einzelseite (chart.html). Statische Gleichungen;
     die <b data-m="…">-Platzhalter werden von renderMath() live befüllt. */
  mathHTML() {
    return `
<h4>1 · Volumen aus der Massenbilanz</h4>
${eq('V = \\frac{m_{\\text{dos}}}{\\rho } = \\frac{m_{\\text{Bauteil}} + m_{\\text{Anguss}} + m_{\\text{Überlauf}} + m_{\\text{Pressrest}}}{\\rho }')}
${eq('V_{b} = \\frac{m_{\\text{Pressrest}}}{\\rho }')}
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
<p class="math-note">Aktuell: D<sub>b</sub> = <b data-m="Db"></b> — der Mindest-Pressrest begrenzt den maximalen Kolben-Ø.</p>
${eq('\\text{Langsame Phase:}\\ \\; v_{1} \\le v_{\\text{krit}}(D, \\varphi) = \\sqrt{9{,}81 \\cdot D} \\cdot f(D, \\varphi) \\; \\;\\text{—}\\; \\; f\\ \\text{aus der OpenFOAM-CFD-Tabelle}\\\\ (\\text{bilinear interpoliert}),\\ \\text{Grenz-Ø per Bisektion}')}
${eq('v_{1} \\le v_{\\text{krit}} \\; \\Leftrightarrow \\; D \\ge D_{c}(\\varphi) = \\frac{v_{1}^{2}}{9{,}81 \\cdot f(\\varphi)^{2}} \\; \\Rightarrow \\; r \\le \\frac{4V}{\\pi \\cdot \\varphi \\cdot D_{c}(\\varphi)^{3}} = \\frac{4V \\cdot 9{,}81^{3} \\cdot f(\\varphi)^{6}}{\\pi \\cdot \\varphi \\cdot v_{1}^{6}}')}

<h4>4 · Machbares Band</h4>
${eq('r_{\\text{lo}}(\\varphi) = \\max\\left( \\frac{4V}{\\pi \\cdot \\varphi \\cdot \\min(D_{\\max}, D_{b})^{3}}, \\; \\sqrt{\\frac{\\pi \\cdot L_{\\min}^{3} \\cdot \\varphi }{4V}} \\right)')}
${eq('r_{\\text{hi}}(\\varphi) = \\min\\left( \\frac{4V}{\\pi \\cdot \\varphi \\cdot D_{\\min}^{3}}, \\; \\sqrt{\\frac{\\pi \\cdot L_{\\max}^{3} \\cdot \\varphi }{4V}}, \\; \\frac{4V \\cdot 9{,}81^{3} \\cdot f(\\varphi)^{6}}{\\pi \\cdot \\varphi \\cdot v_{1}^{6}} \\right)')}
${eq('\\text{machbar}\\ \\; \\Leftrightarrow \\; r_{\\text{lo}}(\\varphi) \\le r \\le r_{\\text{hi}}(\\varphi)')}

<h4>5 · Geometrische Deutung</h4>
<p class="math-note">Das machbare Gebiet ist das Bild des Maschinen-Rechtecks
[D<sub>min</sub>, D<sub>max</sub>] × [L<sub>min</sub>, L<sub>max</sub>] unter der Abbildung (D, L) → (φ, r) —
ein „verzerrtes Rechteck" zwischen zwei Hyperbeln und zwei Wurzelkurven, beschnitten durch die Pressrest-
und die v<sub>krit</sub>-Kurve. Seine Ecken sind die vier Grenzkombinationen:</p>
<div class="math-corners" data-m="corners"></div>`;
  },

  renderMath(el, v) {
    const rho = v.density;
    const V = (v.part + v.runner + v.overflow + v.biscuit) / rho, Vb = cavityVolume(v.biscuit, v);
    const bmin = v.biscuitMin / 1000;
    const Db = bmin > 0 ? Math.sqrt(4 * Vb / (PI * bmin)) : Infinity;
    const set = (key, val) => { const s = el.querySelector('[data-m="' + key + '"]'); if (s) s.innerHTML = subHTML(val); };
    set('V', fmt(V * 1e6) + ' cm³');
    set('Vb', fmt(Vb * 1e6) + ' cm³');
    set('Db', isFinite(Db) ? fmt(Db * 1000) + ' mm' : '— (kein Mindest-Pressrest gesetzt)');
    const corner = (Dmm, Lmm) => {
      const phi = 4 * V / (PI * Math.pow(Dmm / 1000, 2) * (Lmm / 1000));
      const r = Lmm / Dmm;
      const out = phi >= 1 ? ' — <span class="math-out">außerhalb (φ ≥ 100 %, Kammer zu klein)</span>' : '';
      return '<li>Ø ' + fmt(Dmm) + ' × L ' + fmt(Lmm) + ' mm → φ = ' + fmt(phi * 100) + ' %, λ = ' + fmt(r) + out + '</li>';
    };
    set('corners', '<ul>'
      + corner(v.dmin, v.lmin) + corner(v.dmin, v.lmax)
      + corner(v.dmax, v.lmin) + corner(v.dmax, v.lmax) + '</ul>');
  }
};
