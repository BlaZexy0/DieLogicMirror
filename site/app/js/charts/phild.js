/* (φ, L/D)-Auslegungsfenster: Machbarkeit der Füllkammer bei fester Dosiermenge.

   Geometrische Formulierung: Bei festem Dosiervolumen V legt jeder Punkt
   (φ, r = L/D) genau eine Kammer fest:
     D(φ, r) = ∛(4V / (π·φ·r)),   L(φ, r) = ∛(4V·r² / (π·φ))
   Jede Grenze (Ø-Bereich, Längenbereich, Pressrest, v_krit) ist eine monotone
   Schranke r(φ) — das machbare Gebiet ist das Band r_lo(φ) ≤ r ≤ r_hi(φ)
   und wird als ein geschlossenes Polygon gefüllt statt pixelweise. */

import { seq, fmt } from '../core/format.js';
import { total } from '../core/physics.js';
import { frac, sqrt, cbrt } from './mathfmt.js';

const PI = Math.PI, GRAV = 9.81;
const R_MIN = 1, R_MAX = 12;

/* Nogowizin-Faktor f(φ) der kritischen Geschwindigkeit. */
function fPhi(phi) { return 1.386 - 1.915 * phi + 0.615 * phi * phi; }

export default {
  id: 'phild',
  title: 'Auslegungsfenster (φ, L/D)',
  desc: 'Machbarkeit der Füllkammer bei fester Dosiermenge',
  inputs: ['part', 'runner', 'overflow', 'biscuit', 'density', 'dmin', 'dmax', 'lmin', 'lmax', 'biscuitMin', 'v1sel', 'fillMin', 'fillMax', 'diam', 'length'],

  calc(v) {
    const rho = v.density;
    const V = (total(v) + v.biscuit) / rho, Vb = v.biscuit / rho;
    const k = 4 * V / PI;
    const Dmin = v.dmin / 1000, Dmax = v.dmax / 1000;
    const Lmin = v.lmin / 1000, Lmax = v.lmax / 1000;
    const bmin = v.biscuitMin / 1000;
    const Db = bmin > 0 ? Math.sqrt(4 * Vb / (PI * bmin)) : Infinity; // max. Ø aus Pressrest
    const DmaxEff = Math.min(Dmax, Db);
    const v1 = v.v1sel;

    /* Grenzkurven als r(φ) */
    const rD = (phi, D) => k / (phi * D * D * D);                    // konst. Ø: Hyperbel
    const rL = (phi, L) => Math.sqrt(PI * L * L * L * phi / (4 * V)); // konst. L: Wurzelkurve
    const rCrit = phi => {                                            // v1 ≤ v_krit ⇔ D ≥ Dc(φ)
      if (!(v1 > 0)) return Infinity;
      const f = fPhi(phi), Dc = v1 * v1 / (GRAV * f * f);
      return rD(phi, Dc);
    };

    /* Machbares Band: Polygon(e) zwischen r_lo(φ) und r_hi(φ) */
    const phis = seq(0.02, 0.98, 481);
    const band = [];
    let lo = [], hi = [];
    for (const phi of phis) {
      const rlo = Math.max(rD(phi, DmaxEff), rL(phi, Lmin));
      const rhi = Math.min(rD(phi, Dmin), rL(phi, Lmax), rCrit(phi));
      const a = Math.max(rlo, R_MIN), b = Math.min(rhi, R_MAX);
      if (b > a + 1e-9) { lo.push([phi * 100, a]); hi.push([phi * 100, b]); }
      else if (lo.length) { band.push(lo.concat(hi.reverse())); lo = []; hi = []; }
    }
    if (lo.length) band.push(lo.concat(hi.reverse()));

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
      xl: 'Anfangs-Füllgrad φ in %', yl: 'Kammerverhältnis L/D',
      info: 'Dosiert ' + fmt(V * 1e6) + ' cm³ (inkl. Pressrest) · jedes (φ, L/D) legt genau eine Kammer (Ø, L) fest'
    };
  },

  /* Mathe-Erklärung für die Einzelseite (chart.html). Statische Gleichungen;
     die <b data-m="…">-Platzhalter werden von renderMath() live befüllt. */
  mathHTML() {
    return `
<h4>1 · Volumen aus der Massenbilanz</h4>
<div class="eq">V = ${frac('m<sub>dos</sub>', 'ρ')} = ${frac('m<sub>Bauteil</sub> + m<sub>Anguss</sub> + m<sub>Überlauf</sub> + m<sub>Pressrest</sub>', 'ρ')}</div>
<div class="eq">V<sub>b</sub> = ${frac('m<sub>Pressrest</sub>', 'ρ')}</div>
<p class="math-note">Aktuell: V = <b data-m="V"></b> · V<sub>b</sub> = <b data-m="Vb"></b></p>

<h4>2 · Koordinaten und Transformation</h4>
<p class="math-note">Achsen: Anfangs-Füllgrad φ = V / (A·L) und Kammerverhältnis r = L/D mit Kolbenfläche A = π·D²/4.
Da das Dosiervolumen V fest ist, legt jeder Punkt (φ, r) genau eine Kammer fest:</p>
<div class="eq">V = φ · ${frac('π · D²', '4')} · L</div>
<div class="eq">D(φ, r) = ${cbrt(frac('4V', 'π · φ · r'), true)}&emsp;&emsp;L(φ, r) = r · D = ${cbrt(frac('4V · r²', 'π · φ'), true)}</div>
<div class="eq">Umkehrung:&ensp;φ(D, L) = ${frac('4V', 'π · D² · L')}&emsp;&emsp;r(D, L) = ${frac('L', 'D')}</div>

<h4>3 · Grenzkurven</h4>
<p class="math-note">Jede Grenze wird zu einer Schranke für r bei gegebenem φ. Kurven konstanten Durchmessers sind
Hyperbeln (r ∝ 1/φ), Kurven konstanter Länge sind Wurzelkurven (r ∝ √φ).</p>
<div class="eq">Ø-Bereich:&ensp;r = ${frac('4V', 'π · φ · D³')}&ensp;mit D = D<sub>min</sub> (obere Grenze) bzw. D = D<sub>max</sub> (untere Grenze)</div>
<div class="eq">Längenbereich:&ensp;r = ${sqrt(frac('π · L³ · φ', '4V'), true)}&ensp;mit L = L<sub>max</sub> (obere) bzw. L = L<sub>min</sub> (untere Grenze)</div>
<div class="eq">Pressrest:&ensp;b = ${frac('V<sub>b</sub>', 'A')} = ${frac('4V<sub>b</sub>', 'π · D²')} ≥ b<sub>min</sub>&ensp;⇔&ensp;D ≤ D<sub>b</sub> = ${sqrt(frac('4V<sub>b</sub>', 'π · b<sub>min</sub>'), true)}&ensp;⇒&ensp;r ≥ ${frac('4V', 'π · φ · D<sub>b</sub>³')}</div>
<p class="math-note">Aktuell: D<sub>b</sub> = <b data-m="Db"></b> — der Mindest-Pressrest begrenzt den maximalen Kolben-Ø.</p>
<div class="eq">Langsame Phase (Nogowizin):&ensp;v<sub>krit</sub>(D, φ) = ${sqrt('9,81 · D')} · f(φ)&ensp;mit&ensp;f(φ) = 1,386 − 1,915·φ + 0,615·φ²</div>
<div class="eq">v₁ ≤ v<sub>krit</sub>&ensp;⇔&ensp;D ≥ D<sub>c</sub>(φ) = ${frac('v₁²', '9,81 · f(φ)²')}&ensp;⇒&ensp;r ≤ ${frac('4V', 'π · φ · D<sub>c</sub>(φ)³')} = ${frac('4V · 9,81³ · f(φ)⁶', 'π · φ · v₁⁶')}</div>

<h4>4 · Machbares Band</h4>
<div class="eq">r<sub>lo</sub>(φ) = max( ${frac('4V', 'π · φ · min(D<sub>max</sub>, D<sub>b</sub>)³')},&ensp;${sqrt(frac('π · L<sub>min</sub>³ · φ', '4V'), true)} )</div>
<div class="eq">r<sub>hi</sub>(φ) = min( ${frac('4V', 'π · φ · D<sub>min</sub>³')},&ensp;${sqrt(frac('π · L<sub>max</sub>³ · φ', '4V'), true)},&ensp;${frac('4V · 9,81³ · f(φ)⁶', 'π · φ · v₁⁶')} )</div>
<div class="eq">machbar&ensp;⇔&ensp;r<sub>lo</sub>(φ) ≤ r ≤ r<sub>hi</sub>(φ)</div>

<h4>5 · Geometrische Deutung</h4>
<p class="math-note">Das machbare Gebiet ist das Bild des Maschinen-Rechtecks
[D<sub>min</sub>, D<sub>max</sub>] × [L<sub>min</sub>, L<sub>max</sub>] unter der Abbildung (D, L) → (φ, r) —
ein „verzerrtes Rechteck" zwischen zwei Hyperbeln und zwei Wurzelkurven, beschnitten durch die Pressrest-
und die v<sub>krit</sub>-Kurve. Seine Ecken sind die vier Grenzkombinationen:</p>
<div class="math-corners" data-m="corners"></div>`;
  },

  renderMath(el, v) {
    const rho = v.density;
    const V = (v.part + v.runner + v.overflow + v.biscuit) / rho, Vb = v.biscuit / rho;
    const bmin = v.biscuitMin / 1000;
    const Db = bmin > 0 ? Math.sqrt(4 * Vb / (PI * bmin)) : Infinity;
    const set = (key, val) => { const s = el.querySelector('[data-m="' + key + '"]'); if (s) s.innerHTML = val; };
    set('V', fmt(V * 1e6) + ' cm³');
    set('Vb', fmt(Vb * 1e6) + ' cm³');
    set('Db', isFinite(Db) ? fmt(Db * 1000) + ' mm' : '— (kein Mindest-Pressrest gesetzt)');
    const corner = (Dmm, Lmm) => {
      const phi = 4 * V / (PI * Math.pow(Dmm / 1000, 2) * (Lmm / 1000));
      const r = Lmm / Dmm;
      const out = phi >= 1 ? ' — <span class="math-out">außerhalb (φ ≥ 100 %, Kammer zu klein)</span>' : '';
      return '<li>Ø ' + fmt(Dmm) + ' × L ' + fmt(Lmm) + ' mm → φ = ' + fmt(phi * 100) + ' %, L/D = ' + fmt(r) + out + '</li>';
    };
    set('corners', '<ul>'
      + corner(v.dmin, v.lmin) + corner(v.dmin, v.lmax)
      + corner(v.dmax, v.lmin) + corner(v.dmax, v.lmax) + '</ul>');
  }
};
