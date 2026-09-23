/* Die abgeleiteten Größen der Auslegung stehen je genau einmal in
   core/physics.js (und der PQ²-Arbeitspunkt in pqCore). Vorher wurde der
   Füllgrad an zwölf Stellen neu hergeleitet, die NADCA-Füllzeit an fünf mit
   drei verschiedenen Nullschutz-Varianten, der spezifische Gießdruck an
   sechs. Dieser Test hält fest:
     1. jede Hilfsfunktion rechnet, was die alten Stellen rechneten — die
        alten Formeln stehen hier wörtlich als Vergleich;
     2. wo die Vereinheitlichung einen Randfall ändert, gilt die sichere
        Variante (ein Guard liefert NaN, nie einen Wert);
     3. die Verbraucher benutzen die Funktionen, statt sie nachzubauen.
   node --test tests/web/abgeleitet.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { site, ladeSkripte, themeLaden, auslegung, defaults, kpiZiele } from './stubs/dashboard.mjs';

ladeSkripte();
await themeLaden();

const Ph = await auslegung('core/physics.js');
const { pqCore } = await auslegung('charts/pq2.js');
const { DEFAULT_CURVE } = await auslegung('config/fields.js');
const { generateCurve } = await auslegung('core/curvegen.js');
const PI = Math.PI;
const CLAMP = globalThis.__CLAMP_MODEL__;

const close = (a, b, rel = 1e-12, msg = '') =>
  assert.ok(a === b || Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b)), `${msg} ${a} ≠ ${b}`);

/* Eingaben, über die verglichen wird: die Vorgaben und Abwandlungen davon. */
const VARIANTEN = [
  {}, { diam: 90, length: 450 }, { part: 30, runner: 5, biscuit: 2 }, { overflow: 0 },
  { density: 1650, densitySolid: 1810, shrink: 0.6 }, { pAccOp: 140 }, { gate: 450, gateTh: 1.5 },
  { eccX: 120, eccY: -80, tieX: 900, tieY: 700 }, { wall: 1.2, Tcast: 700, Tflow: 600, Tdie: 250 }
].map(o => Object.assign(defaults(), o));

test('Füllgrad und Dosiervolumen: eine Formel für alle alten Stellen', () => {
  for (const v of VARIANTEN) {
    const Vdos = (v.runner + v.part + v.overflow + v.biscuit) / v.density;
    assert.equal(Ph.doseMass(v), Ph.total(v) + v.biscuit);
    assert.equal(Ph.doseVolume(v), Vdos, 'Summenreihenfolge egal: exakt dieselbe Zahl');
    const phi = Ph.fillRatio(v);
    /* computeShot (A in m², L in m), Domänenprüfung und Kurvengenerator (mm),
       Kennzahlen (in %), (φ, λ)-Fenster (Ecke aus D und L) */
    close(phi, Vdos / (0.25 * PI * Math.pow(v.diam / 1000, 2) * (v.length / 1000)), 1e-12, 'computeShot');
    assert.equal(phi, 1e9 * Vdos / (v.length * Ph.pistonArea(v)), 'Kurvengenerator/Schema: bitgleich');
    close(100 * phi, 100e9 * Vdos / (v.length * Ph.pistonArea(v)), 1e-12, 'Kennzahl');
    close(Ph.fillRatio(v, 120, 700), 4 * Vdos / (PI * 0.12 * 0.12 * 0.7), 1e-12, 'Fenster-Ecke');
    /* die Umkehrung: der Ø, der bei L den Füllgrad φ ergibt */
    for (const f of [0.3, 0.55, 1]) close(Ph.fillRatio(v, Ph.fillDiameter(v, f, 800), 800), f, 1e-12, 'Umkehrung');
    close(Ph.fillDiameter(v, 1, 800), Math.sqrt(4e9 * Vdos / (PI * 800)), 1e-12, 'D₁₀₀ der Füllgrad-Heatmap');
  }
});

test('NADCA-Füllzeit: eine Formel, ein Nullschutz', () => {
  const alt = (v, s = v.wall) => v.kfill * s * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / (v.Tflow - v.Tdie);
  for (const v of VARIANTEN) {
    assert.equal(Ph.nadcaFillMs(v), alt(v), 'bitgleich mit der alten Formel');
    assert.equal(Ph.nadcaFillMs(v, 2.5), alt(v, 2.5));
    assert.equal(Ph.nadcaReserve(v), v.Tcast - v.Tflow + v.Sfrac * v.Zconst);
  }
  /* Der eine Nullschutz: ohne Gefälle zur Form, ohne positive Reserve oder
     ohne Wandstärke gibt es keine Empfehlung — vorher lieferten zwei der
     fünf Stellen hier eine negative Zeit, die die Kennzahl als „erfüllt"
     wertete. */
  const v = defaults();
  for (const bad of [{ Tflow: 200, Tdie: 200 }, { Tflow: 150, Tdie: 200 }, { Tflow: 700, Sfrac: 0 },
    { Tflow: 100, Tdie: 200, Tcast: 50, Sfrac: 0 }, { wall: 0 }, { kfill: -1 }, { Tdie: NaN }]) {
    assert.ok(Number.isNaN(Ph.nadcaFillMs(Object.assign({}, v, bad))), 'kein Wert bei ' + JSON.stringify(bad));
  }
});

test('NADCA ohne Empfehlung: Kurvengenerator, Diagramm und Kennzahl sagen es', async () => {
  const v = Object.assign(defaults(), { Tflow: 700, Sfrac: 0 });       // Reserve −40 °C
  assert.match(generateCurve(v, { mode: 'lopez' }).error, /NADCA-Füllzeit nicht berechenbar/);
  const ftwall = (await auslegung('charts/ftwall.js')).default;
  assert.match(ftwall.calc(v).err, /Keine Empfehlung/);
  const { renderKpis } = await auslegung('ui/kpis.js');
  const z = kpiZiele();
  renderKpis(z.el, v, Ph.computeShot(v, DEFAULT_CURVE.map(p => p.slice())), z.chamberEl);
  const zeile = z.el.innerHTML.match(/<div class="krow (\w+)" id="kpi-nadca-füllzeit">.*?<\/div><\/div>/);
  assert.ok(zeile, 'NADCA-Zeile fehlt');
  assert.equal(zeile[1], 'nodata', 'vorher: „✓ −735 %" gegen eine negative Empfehlung');
  assert.match(zeile[0], /keine Empfehlung/);
});

test('spezifischer Gießdruck, Maschinenmaximum und p₀ sind dieselbe Größe', () => {
  for (const v of VARIANTEN) {
    const F = Ph.injForceEff(v);
    assert.equal(Ph.specPressure(v), F * 1e4 / Ph.pistonArea(v), 'Kennzahl, Luftblase');
    assert.equal(Ph.specPressure(v, 110), F * 1e4 / (0.25 * PI * 110 * 110), 'Kurve über Kolben-Ø');
    assert.equal(Ph.pMaxMachine(v), F * 1e4 / (0.25 * PI * v.dmin * v.dmin));
    assert.equal(pqCore(v).p0, Ph.specPressure(v), 'statischer Metalldruck im PQ²');
  }
  assert.ok(Number.isNaN(Ph.specPressure(Object.assign(defaults(), { pAccOp: 0 }))), 'ohne gültige Drücke keine Kraft');
});

test('Zuhaltung: Hebelfaktor, Nachdruckgrenze und Kraftbedarf wie vorher inline', () => {
  for (const v of VARIANTEN) {
    const k = (v.tieX > 0 && v.tieY > 0) ? CLAMP.leverK(v.eccX, v.eccY, v.tieX, v.tieY) : 1;
    assert.equal(Ph.leverFactor(v), k);
    assert.equal(Ph.clampPMax(v), CLAMP.pMax(v.force, v.area, v.safety, k));
    assert.equal(Ph.clampForceNeeded(v), CLAMP.forceKN(v.psel, v.area, v.safety, 1));
  }
  assert.equal(Ph.leverFactor(Object.assign(defaults(), { tieX: 0 })), 1, 'ohne Säulenfeld zentrisch');
});

test('Füllzeit bei v₂, Kolbengeschwindigkeit zur Füllzeit, Entlüftungsbedarf', () => {
  for (const v of VARIANTEN) {
    const Va = Ph.cavityVolume(Ph.afterGate(v), v), Vm = Ph.cavityVolume(Ph.total(v), v);
    for (const v2 of [0.5, 3.2, 7]) {
      assert.equal(Ph.fillTimeAt(v, v2), 1e9 * Va / (v2 * Ph.pistonArea(v)), 'Entlüftungsbedarf, Kennzahl: bitgleich');
      close(Ph.fillTimeAt(v, v2), 1e9 * Va / (v2 * 0.25 * PI * v.diam * v.diam), 1e-12, 'Füllzeit-Heatmap');
      /* dieselbe Beziehung nach v_p aufgelöst */
      close(Ph.pistonSpeedFor(v, Ph.fillTimeAt(v, v2)), v2, 1e-12, 'Umkehrung');
    }
    for (const t of [20, 72.5, 150]) {
      assert.equal(Ph.ventAreaFor(v, t), Vm / (t / 1000) / v.vAirMax * 1e6);
    }
  }
  /* Nullschutz wie vorher in Kennzahl und Erklärung — jetzt auch im Diagramm */
  const v = defaults();
  for (const [t, over] of [[0, {}], [NaN, {}], [-5, {}], [50, { vAirMax: 0 }], [50, { vAirMax: -1 }]]) {
    assert.ok(Number.isNaN(Ph.ventAreaFor(Object.assign({}, v, over), t)), `t ${t} ${JSON.stringify(over)}`);
  }
});

test('Zerstäubung: der J-Faktor und seine Umkehrung sind eine Formel', () => {
  for (const v of VARIANTEN) {
    for (const va of [12, 38.5, 60]) {
      /* Kennzahl: Ist-J aus der Anschnittgeschwindigkeit */
      assert.equal(Ph.atomJ(v, va), Math.pow(va / 0.0254, 1.71) * (v.gateTh / 25.4) * (v.density * 3.6127e-5));
      close(Ph.atomSpeed(v, Ph.atomJ(v, va)), va, 1e-12, 'Umkehrung');
    }
    /* PQ²-Grenzen aus J_min / J_max */
    const c = pqCore(v);
    assert.equal(c.vaAtom, Math.pow(v.JatomMin / ((v.gateTh / 25.4) * (v.density * 3.6127e-5)), 1 / 1.71) * 0.0254);
    assert.equal(c.vaAtomMax, Ph.atomSpeed(v, v.JatomMax));
  }
  const v = defaults();
  for (const [va, over] of [[NaN, {}], [0, {}], [Infinity, {}], [40, { gateTh: 0 }], [40, { density: 0 }]]) {
    assert.ok(Number.isNaN(Ph.atomJ(Object.assign({}, v, over), va)), `J bei v_a ${va} ${JSON.stringify(over)}`);
  }
  assert.ok(Number.isNaN(Ph.atomSpeed(v, 0)) && Number.isNaN(Ph.atomSpeed(Object.assign({}, v, { gateTh: 0 }), 750)));
});

test('PQ²: Maschinenlinie, Betriebspunkt und v_a-Druck kommen aus pqCore', () => {
  for (const v of VARIANTEN) {
    const c = pqCore(v);
    assert.equal(c.pEnv, undefined, 'pEnv las niemand');
    for (const Q of [0, c.Qs * 0.5, c.Qs, c.Qmax * 0.99]) {
      close(c.machineLine(Q), c.p0 * (1 - (Q / c.Qmax) ** 2), 1e-12, 'Maschinenlinie');
    }
    for (const v2 of [0.4 * c.Qs / c.Ap, 1.5 * c.Qmax / c.Ap]) {
      const op = c.opAt(v2), Qop = c.Ap * v2;
      assert.equal(op.Q, Qop);
      assert.equal(op.p, c.Cdie * Qop * Qop);
      assert.equal(op.pM, Qop < c.Qmax ? c.machineLine(Qop) : 0, 'jenseits von Q_dry: 0');
      assert.equal(op.tf, c.Vag / Qop * 1000);
    }
    assert.equal(c.opAt(NaN), null);
    assert.equal(c.opAt(0), null);
    assert.equal(c.pGate(40), v.density * (40 / v.Cd) * (40 / v.Cd) / 2 / 1e5);
    /* Hüllkurvenkonstante: in der Kennzahl wurde sie nachgerechnet */
    close(c.aMPE / 1e6, (2 * Math.sqrt(3) / 9) * Ph.injForceEff(v) * 1e3 * v.vmax / 1e6, 1e-12, 'a');
  }
});

/* Die alten Implementierungen, wörtlich: chamber.js fillHeightFrac (Bisektion
   über den Mittelpunktswinkel), phild.js DcritFor (m) und slowshot.js Dstar
   (mm, 40 Schritte). */
function fillHeightFracAlt(phi) {
  if (!(phi > 0)) return 0;
  if (phi >= 1) return 1;
  let lo = 0, hi = 2 * Math.PI;
  for (let i = 0; i < 60; i++) {
    const th = (lo + hi) / 2;
    if ((th - Math.sin(th)) / (2 * Math.PI) < phi) lo = th; else hi = th;
  }
  return (1 - Math.cos((lo + hi) / 4)) / 2;
}
function DcritForAlt(v1, phi) {
  let lo = 0.01, hi = 2;
  if (Ph.vCrit(hi, phi) < v1) return Infinity;
  if (Ph.vCrit(lo, phi) >= v1) return lo;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (Ph.vCrit(m, phi) < v1) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function DstarAlt(v1, phi, dmin, dmax) {
  const span = dmax - dmin;
  let lo = dmin, hi = dmax;
  if (Ph.vCrit(lo / 1000, phi) >= v1) return dmin - span;
  if (Ph.vCrit(hi / 1000, phi) < v1) return dmax + span;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (Ph.vCrit(m / 1000, phi) < v1) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

test('Füllhöhe: segHeight ersetzt die zweite Implementierung der Kammer', () => {
  let max = 0;
  for (let i = 1; i < 1000; i++) {
    const phi = i / 1000;
    max = Math.max(max, Math.abs(Ph.segHeight(phi) - fillHeightFracAlt(phi)));
  }
  assert.ok(max < 1e-12, 'größte Abweichung ' + max);
  for (const phi of [0, -1, NaN, 1, 2]) assert.equal(Ph.segHeight(phi), fillHeightFracAlt(phi), 'Rand bei ' + phi);
  const chamber = readFileSync(path.join(site, 'tools/auslegung/js/ui/chamber.js'), 'utf8');
  assert.ok(!/function fillHeightFrac/.test(chamber) && /segHeight/.test(chamber), 'die Kammer nimmt segHeight');
});

test('Grenz-Ø der 1. Phase: eine Bisektion für (φ, λ)-Fenster und v_krit-Heatmap', () => {
  for (const v1 of [0.2, 0.45, 0.8, 1.6, 5]) {
    for (const phi of [0.05, 0.2, 0.5, 0.8, 0.95]) {
      /* (φ, λ)-Fenster: bitgleich */
      const D = Ph.critDiameter(v1, phi, 0.01, 2);
      const alt = DcritForAlt(v1, phi);
      assert.equal(D === -Infinity ? 0.01 : D, alt, `phild v₁ ${v1} φ ${phi}`);
      /* Heatmap: in mm, Ø-Bereich 90–150; 50 statt 40 Schritte (5·10⁻¹¹ mm) */
      const Dh = Ph.critDiameter(v1, phi, 0.09, 0.15);
      const neu = Dh === -Infinity ? 90 - 60 : Dh === Infinity ? 150 + 60 : Dh * 1000;
      assert.ok(Math.abs(neu - DstarAlt(v1, phi, 90, 150)) < 1e-9, `slowshot v₁ ${v1} φ ${phi}: ${neu}`);
    }
  }
});

test('v₁/v₂ aus dem Schussergebnis: NaN ohne gültige Kurve', () => {
  const shot = Ph.computeShot(defaults(), DEFAULT_CURVE.map(p => p.slice()));
  assert.equal(Ph.shotSpeed(shot, 'v2'), shot.v2);
  assert.equal(Ph.shotSpeed(shot, 'v1'), shot.v1);
  for (const s of [null, undefined, { error: 'x', v2: 3 }, { v2: null }, { v2: 0 }]) {
    assert.ok(Number.isNaN(Ph.shotSpeed(s, 'v2')), JSON.stringify(s));
  }
});

test('Schussergebnis: ohne wave, Prüfungen als schlichte Objekte', () => {
  const shot = Ph.computeShot(defaults(), DEFAULT_CURVE.map(p => p.slice()));
  assert.equal(shot.wave, undefined, 'wave las niemand');
  assert.ok(shot.checks.length > 5 && shot.checks.every(c => !Array.isArray(c) && typeof c.ok === 'boolean'));
});

test('die Diagramme bauen die Größen nicht mehr nach', () => {
  const dir = path.join(site, 'tools/auslegung/js');
  const quellen = [...readdirSync(path.join(dir, 'charts')).map(f => 'charts/' + f), 'ui/kpis.js', 'ui/chamber.js',
    'core/curvegen.js', 'core/autofit.js', 'core/domain.js'];
  for (const f of quellen) {
    const src = readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/total\(v\) \+ v\.biscuit|v\.part \+ v\.runner \+ v\.overflow \+ v\.biscuit/.test(src), f + ': Dosiermasse nachgebaut');
    assert.ok(!/Sfrac \* v\.Zconst/.test(src), f + ': NADCA-Formel nachgebaut');
    assert.ok(!/3\.6127e-5/.test(src), f + ': J-Faktor nachgebaut');
    assert.ok(!/__CLAMP_MODEL__\.(leverK|pMax)\(/.test(src), f + ': Zuhaltung nachgebaut');
    assert.ok(!/const set = \(k(ey)?, val\) =>/.test(src), f + ': eigener set()-Helfer statt mathSetter');
  }
});
