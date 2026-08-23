/* PQ²-Diagramm: Achsen mit Kolbenbezug bleiben physikalisch —
   v_p-Achse endet bei v_max des montierten Kolbens (kein anderer Ø mischt
   sich ein), Hydraulikdruck-Achse nie über P_acc (auch die Hüllkurve),
   Q-/t_f-Achsen zeigen weiter die Erreichbarkeit über alle Kolben-Ø. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
require(path.join(site, 'shared/palette.js'));
require(path.join(site, 'shared/theme.js'));
require(path.join(site, 'shared/examples/machines.js'));
require(path.join(site, 'shared/project.js'));
require(path.join(site, 'shared/clampmodel.js'));
const { theme } = await import(path.join(site, 'tools/auslegung/js/core/theme.js'));
Object.assign(theme, globalThis.__THEME__);
const { allFields } = await import(path.join(site, 'tools/auslegung/js/config/fields.js'));
const pq2 = (await import(path.join(site, 'tools/auslegung/js/charts/pq2.js'))).default;
const { pqCore } = await import(path.join(site, 'tools/auslegung/js/charts/pq2.js'));
const { injForceEff, pMaxMachine } = await import(path.join(site, 'tools/auslegung/js/core/physics.js'));

const defaults = () => { const v = {}; for (const f of allFields()) v[f.key] = f.def; return v; };
const calc = (v, tab, tab2) => { pq2.tab = tab; pq2.tab2 = tab2; return pq2.calc(v); };
const maskOf = q => q.limits.find(l => l.mask);
const closeTo = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);
const maskMax = q => Math.max(...q.x.map(x => maskOf(q).fn(x)).filter(Number.isFinite));

test('pq2: v_p-Achse endet bei v_max und zeigt nur den montierten Kolben', () => {
  for (const dmax of [200, 420, 800]) {
    const v = Object.assign(defaults(), { dmax });
    const q = calc(v, 'vp', 'pm');
    assert.ok(!q.err, q.err);
    assert.ok(q.x[q.x.length - 1] <= v.vmax + 1e-9, `x-Ende ${q.x[q.x.length - 1]} > v_max ${v.vmax} (dmax ${dmax})`);
    /* Grenze = Maschinenlinie des montierten Kolbens: statisch p₀, bei v_max null */
    const c = pqCore(v);
    assert.ok(Math.abs(maskMax(q) - c.p0) < 1e-6 * c.p0, 'Maske beginnt bei p₀');
    assert.ok(Math.abs(maskOf(q).fn(v.vmax)) < 1e-6, 'Maske endet bei v_max auf 0');
    assert.equal(q.feasibleSplit, undefined, 'kein „anderer Kolben-Ø" auf der v_p-Achse');
    const m = q.ys.find(s => /^Maschine/.test(s.n));
    assert.ok(m && m.c === theme.chart.series4, 'Maschinenlinie bleibt eine Serie in Serienfarbe');
    /* Arbeitspunkt liegt im Bild */
    assert.ok(q.pt[0] > 0 && q.pt[0] <= v.vmax);
  }
  /* Q-/Q²-Achse: bis Q_dry des montierten Kolbens, Hüllkurve anderer Ø und Split bleiben;
     t_f-Achse zeigt weiter alle Kolben-Ø */
  const v = defaults();
  const c = pqCore(v);
  for (const tab of ['q', 'q2']) {
    const q = calc(v, tab, 'pm');
    const Qend = tab === 'q' ? q.x[q.x.length - 1] / 1000 : Math.sqrt(q.x[q.x.length - 1]) / 1000;
    closeTo(Qend, c.Qmax, 1e-9);
    assert.ok(q.feasibleSplit && typeof q.feasibleSplit.fn === 'function');
    assert.ok(maskMax(q) > c.p0, 'Hüllkurve über p₀ des montierten Kolbens (kleinerer Ø erreicht mehr Druck)');
    /* Maschinenlinie endet exakt auf der Achse (letzte endliche Stützstelle = 0 bei Q_dry) */
    const m = q.ys.find(s => /^Maschine/.test(s.n));
    const fin = m.y.filter(Number.isFinite);
    closeTo(fin[fin.length - 1], 0, 1e-9);
  }
  const qt = calc(v, 'tf', 'pm');
  const Qt = qt.x.map(x => c.Vag / (x / 1000));
  closeTo(Math.max(...Qt), c.Ahi * v.vmax, 1e-9);
  const mt = qt.ys.find(s => /^Maschine/.test(s.n));
  assert.ok(mt.y.some(y => Number.isFinite(y) && Math.abs(y) < 1e-9), 't_f-Achse: Maschinenlinie erreicht 0 bei Q_dry');
});

test('pq2: Hydraulikdruck-Achse bleibt ≤ P_acc — montierter Kolben und Hüllkurve', () => {
  for (const [tab, diam] of [['q', 150], ['q', 90], ['vp', 150], ['tf', 150], ['q2', 300]]) {
    const v = Object.assign(defaults(), { diam });
    const q = calc(v, tab, 'ph');
    assert.ok(!q.err, q.err);
    assert.ok(maskMax(q) <= v.pAccOp * (1 + 1e-9), `${tab}/Ø${diam}: Maske ${maskMax(q)} > P_acc ${v.pAccOp}`);
    /* Q → 0 liegt im Bild (außer t_f-Achse, die bei 250 ms endet): dort statisch genau P_acc */
    if (tab !== 'tf') assert.ok(Math.abs(maskMax(q) - v.pAccOp) < 1e-6 * v.pAccOp, `${tab}/Ø${diam}: Maske erreicht P_acc statisch`);
    assert.ok(Math.abs(q.y1 - 1.05 * v.pAccOp) < 1e-9, 'y-Achse bis 1,05·P_acc');
    /* Maschinenlinie des montierten Kolbens: statisch exakt P_acc */
    const m = q.ys.find(s => /^Maschine/.test(s.n));
    if (m && tab !== 'tf') assert.ok(Math.abs(m.y[0] - v.pAccOp) < 1e-3 * v.pAccOp, 'Maschinenlinie startet bei P_acc: ' + m.y[0]);
    if (m) assert.ok(m.y.filter(Number.isFinite).every(y => y <= v.pAccOp * (1 + 1e-9)), 'Maschinenlinie über P_acc');
  }
});

test('pq2: Metalldruck-Achse — Hüllkurve unverändert (a/Q zwischen den Berührpunkten)', () => {
  const v = defaults(); const c = pqCore(v);
  const q = calc(v, 'q', 'pm');
  const Qmid = (c.QtLo + c.QtHi) / 2;
  assert.ok(Math.abs(maskOf(q).fn(Qmid * 1000) - c.aMPE / Qmid / 1e5) < 1e-6, 'a/Q zwischen den Berührpunkten');
  assert.ok(Math.abs(c.pReach(c.Qs) - maskOf(q).fn(c.Qs * 1000)) < 1e-9);
});

test('pq2: eingestellter Akkumulatordruck skaliert Gießkraft, p₀, Hüllkurve und Hydraulikachse', async () => {
  const v = defaults();                       // Nenn: 2000 kN bei 160 bar
  const half = Object.assign({}, v, { pAccOp: 80 });
  closeTo(injForceEff(v), v.injForce);
  closeTo(injForceEff(half), v.injForce / 2);
  closeTo(pMaxMachine(half), pMaxMachine(v) / 2);
  const c1 = pqCore(v), c2 = pqCore(half);
  closeTo(c2.FG, c1.FG / 2); closeTo(c2.p0, c1.p0 / 2); closeTo(c2.aMPE, c1.aMPE / 2);
  assert.ok(c2.Qs < c1.Qs, 'weniger Druck → kleinerer Arbeitspunkt');
  /* Hydraulikachse: statisch beim eingestellten Druck, nie darüber */
  const q = calc(half, 'q', 'ph');
  closeTo(maskMax(q), 80, 1e-6);
  const m = q.ys.find(s => /^Maschine/.test(s.n));
  closeTo(m.y[0], 80, 0.1);
  /* Metalldruck-Hüllkurve ebenfalls halbiert */
  const qm1 = calc(v, 'q', 'pm'), qm2 = calc(half, 'q', 'pm');
  closeTo(maskMax(qm2), maskMax(qm1) / 2, 1e-6);
  /* fehlende/ungültige Drücke → Maximalkraft; über dem Maximum wird gekappt */
  closeTo(injForceEff(Object.assign({}, v, { pAccOp: 0 })), v.injForce);
  closeTo(injForceEff(Object.assign({}, v, { pAcc: 0 })), v.injForce);
  closeTo(injForceEff(Object.assign({}, v, { pAccOp: 999 })), v.injForce);
  closeTo(pqCore(Object.assign({}, v, { pAccOp: 999 })).p0, c1.p0);
  closeTo(calc(Object.assign({}, v, { pAccOp: 999 }), 'q', 'ph').y1, 1.05 * v.pAcc);
  /* Antriebskolben aus dem Preset: 2000 kN / 160 bar = 1250 cm² (1 kN/bar = 100 cm²) */
  const { hydArea } = await import(path.join(site, 'tools/auslegung/js/core/physics.js'));
  closeTo(hydArea(v), 1250);
});

test('pq2: Arbeitspunkt aus der Schusskurve (Q = A_K·v₂ auf der Werkzeuglinie), Schnittpunkt als Referenz', async () => {
  const v = defaults();
  const c = pqCore(v);
  /* ohne Schusskurve: nur der Schnittpunkt */
  const q0 = calc(v, 'q', 'pm');
  closeTo(q0.pt[0], c.Qs * 1000); assert.equal(q0.pt2, undefined); assert.match(q0.ptl, /Schnittpunkt/);
  /* mit Schusskurve v₂ unter dem Schnittpunkt: Betriebspunkt auf der Werkzeuglinie, Drosselsegment bis zur Maschinenlinie */
  const v2 = 0.6 * c.Qs / c.Ap;
  pq2.tab = 'q'; pq2.tab2 = 'pm';
  const q = pq2.calc(v, { shot: { v2 } });
  const Qop = c.Ap * v2;
  closeTo(q.pt[0], Qop * 1000); closeTo(q.pt[1], c.Cdie * Qop * Qop);
  closeTo(q.pt2[0], c.Qs * 1000); closeTo(q.pt2[1], c.ps);
  assert.match(q.ptl, /Schusskurve/); assert.match(q.ptl2, /ungedrosselt/);
  assert.equal(q.segs.length, 1);
  closeTo(q.segs[0].y2, c.p0 * (1 - (Qop / c.Qmax) ** 2));        // Maschinenlinie bei Q_op
  assert.ok(q.segs[0].y2 > q.segs[0].y1, 'Drosselverlust positiv');
  /* v₂ über dem Schnittpunkt: kein Drosselsegment (Maschinenlinie liegt unter der Werkzeuglinie) */
  const qh = pq2.calc(v, { shot: { v2: 1.3 * c.Qs / c.Ap } });
  assert.equal(qh.segs, undefined);
  /* t_f-Achse: derselbe Punkt in Füllzeit */
  pq2.tab = 'tf';
  const qt = pq2.calc(v, { shot: { v2 } });
  closeTo(qt.pt[0], c.Vag / Qop * 1000);
  /* Erklärung: Live-Werte vorhanden */
  const el = { querySelector: () => null }; pq2.renderMath(el, v, { v2 });
});
