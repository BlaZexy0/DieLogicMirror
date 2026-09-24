/* Die Farben des 3D-Studios (js/part/colors.js): Sachfarben und Urteile sind
   Rollen der Palette und kommen aus dem gewählten Schema, die Farbleisten
   sind fest (Wunsch vom 23.09.: wieder die Leisten von vorher, in jedem
   Schema dieselben). Hier geprüft:
     · jede Elementart trägt ihre Farbe aus ELEMENT: die Knoten des Angusses,
       die Bohne und das Waschbrett in der Hervorhebung, in Limette und
       Himmelblau, fern vom Anguss; Luft, Temperierung und Werkzeug in ihren
       Sachfarben; Richtungen und Achsen die Achsenrollen; keine davon ist
       eine Farbe der Ampel;
     · ein Wechsel des Schemas färbt alles um, auch was ein Modell sich merkt
       (der Anschnitt der Füllung);
     · die Farbleisten `heat` und `draft` sind die von palette.js (die
       Felder und das Flussschema lesen `heat`, die Leiste der Auslegung),
       mit und ohne Palette dieselben und in jedem Schema gleich; die Stufe
       der Entformschräge sitzt am Grenzwert; Punktfarben linear;
     · ohne Palette (Node) gelten die Standardwerte der Rollen;
     · die Rollen der Formaufbau-Teile: nur Sachfarben, eine Datei kann keine
       Ampel und keinen Unsinn hineinschreiben.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/farben.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web');
const js = f => import(pathToFileURL(path.join(site, 'tools/3d-studio/js', f)).href);

/* Wie im Browser: erst die Palette, dann die Schemata; ein Dokument, auf dem
   „dielogic:scheme" ankommt (ohne <html>, das Umfärben der Tokens entfällt). */
globalThis.window = globalThis;
globalThis.document = Object.assign(new EventTarget(), { documentElement: null, querySelector: () => null });
const P = require(path.join(site, 'shared/palette.js'));
const S = require(path.join(site, 'shared/schemes.js'));

const C = await js('part/colors.js');
const VENTS = await js('vents/model.js');
const COOL = await js('cooling/model.js');
const FILL = await js('fill/model.js');
const G = await js('runner/graph.js');
const R = await js('registry.js');
const CHART = await js('runner/chart.js');

/* Abstand zweier Farben in OK-Lab (×100), wie im Test der Schemata. */
function oklab(h) {
  const c = P.hexRgb(h).map(v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
const dE = (a, b) => { const p = oklab(a), q = oklab(b); return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
/* Zwei Hexwerte, die sich je Kanal um höchstens eine Stufe unterscheiden. */
const near = (a, b) => [1, 3, 5].every(i => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 1);
const toLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

const LEISTEN = ['heat', 'draft'];
/* Die Stellen, an denen die Leisten verglichen werden: ein feines Raster
   und die Stufe der Schräge (1/3) mit ihren Nachbarn. */
const STELLEN = [...Array.from({ length: 101 }, (_, i) => i / 100), 1 / 3 - 1e-9, 1 / 3, 1 / 3 + 1e-9, -0.5, 1.5];

/* Was eine Elementart, eine Richtung oder eine Achse ist — keine davon ein Urteil. */
const things = () => ({
  'Überlaufbohne': VENTS.TYPES.bohne.color, 'Überlauf mit Entlüftung': VENTS.TYPES.entlueftet.color,
  'Waschbrett': VENTS.TYPES.waschbrett.color, 'Schlitz': VENTS.TYPES.schlitz.color, 'Kanalpunkt': C.ELEMENT.kanalpunkt,
  'Kühlstich': COOL.TYPES.stich.color, 'Kanal': COOL.TYPES.kanal.color, 'Anschnitt (Füllung)': FILL.inletColor(),
  ...Object.fromEntries(Object.entries(G.TYPES).map(([k, t]) => ['Knoten ' + k, t.color])),
  ...Object.fromEntries([0, 1, 2, 3, 4, 5].map(l => ['Richtung ' + l, C.regionColor(l)])),
  ...Object.fromEntries(C.axisColors().map((c, i) => ['Achse ' + 'XYZ'[i], c]))
});

test('Standard: jede Elementart trägt ihre Farbe', () => {
  S.set('teal');
  const c = S.colors('teal');
  /* Was ein Designer setzt, hebt sich vom Anguss ab: die Hervorhebung und
     ihre Geschwister Limette und Himmelblau (Koralle bis 24.09.: auf dem
     orangen Anguss verschwand sie). */
  assert.equal(VENTS.TYPES.bohne.color, c.mark, 'die Bohne in der Hervorhebung');
  assert.equal(VENTS.TYPES.waschbrett.color, c.markLime, 'das Waschbrett in Limette');
  assert.equal(G.TYPES.point.color, c.mark, 'der Punkt in der Hervorhebung');
  assert.equal(G.TYPES.branch.color, c.markLime, 'die Verzweigung in Limette');
  assert.equal(G.TYPES.mirror.color, c.markCool, 'der Spiegelpunkt in Himmelblau');
  /* Die übrigen tragen die Sachfarbe ihrer Sache. */
  assert.equal(VENTS.TYPES.entlueftet.color, c.air);
  assert.equal(VENTS.TYPES.schlitz.color, P.mix('air', 'surface', 0.4), 'der Schlitz ist die hellere Luft');
  assert.equal(C.ELEMENT.kanalpunkt, P.mix('air', 'surface', 0.7), 'die Kanalpunkte noch heller');
  assert.equal(COOL.TYPES.stich.color, c.cool);
  assert.equal(COOL.TYPES.kanal.color, P.mix('cool', 'surface', 0.45), 'der Kanal ist die hellere Temperierung');
  assert.equal(FILL.inletColor(), c.die, 'der Anschnitt gehört zum Werkzeug');
  assert.equal(G.TYPES.root.color, c.biscuit);
  assert.equal(G.TYPES.gate.color, c.die);
  assert.deepEqual(C.axisColors(), [c.axisX, c.axisY, c.axisZ]);
  assert.equal(C.regionColor(0), c.axisX, '+X');
  assert.equal(C.regionColor(1), P.mix('axisX', 'surface', 0.4), '−X heller');
  assert.equal(C.regionColor(3), P.mix('axisY', 'surface', 0.55), '−Y heller');
  assert.equal(C.regionColor(5), P.mix('axisZ', 'text', 0.55), '−Z dunkler: hell fiele es auf +Y');
  assert.equal(C.regionColor(4), c.axisZ, '+Z');
  assert.equal(C.undercutColor(), c.bad, 'der Hinterschnitt ist ein Urteil');
  /* Die Hälften tragen ihre Rolle, die Schieber ihre Richtung. */
  assert.equal(C.sideColor(4, 1), c.halfMov, 'die bewegliche Seite in Rose');
  assert.equal(C.sideColor(5, -1), c.halfFix, 'die feste Seite in Gelb');
  assert.equal(C.sideColor(5, 1), c.halfMov, 'getauscht: die Farbe folgt der Rolle, nicht der Richtung');
  assert.equal(C.sideColor(0, 0), C.regionColor(0), 'ein Schieber in seiner Richtung');
});

test('In jedem Schema: die Arten sind unterscheidbar, und keine sieht aus wie ein Urteil', () => {
  for (const s of S.list) {
    S.set(s.id);
    const all = things();
    const ampel = ['ok', 'caution', 'bad'].map(k => P[k]);
    for (const [name, hex] of Object.entries(all)) {
      assert.match(hex, /^#[0-9a-f]{6}$/, s.id + ': ' + name);
      for (const a of ampel) assert.ok(dE(hex, a) >= 8, s.id + ': ' + name + ' ' + hex + ' liegt zu nah an der Ampel ' + a);
    }
    /* Arten, die nebeneinander im selben Werkzeug stehen, auseinander. */
    const groups = [
      [['Überlaufbohne', 'Überlauf mit Entlüftung', 'Waschbrett', 'Schlitz', 'Kanalpunkt'], 5],
      [['Kühlstich', 'Kanal'], 5],
      [['Knoten root', 'Knoten point', 'Knoten branch', 'Knoten mirror', 'Knoten gate'], 5],
      [['Richtung 0', 'Richtung 1', 'Richtung 2', 'Richtung 3', 'Richtung 4', 'Richtung 5'], 9]
    ];
    for (const [g, min] of groups) {
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          assert.ok(dE(all[g[i]], all[g[j]]) >= min, s.id + ': ' + g[i] + ' und ' + g[j] + ' fast gleich (' + dE(all[g[i]], all[g[j]]).toFixed(1) + ')');
        }
      }
    }
  }
  S.set('teal');
});

test('In jedem Schema: Knoten, Bohne und Waschbrett liegen weit weg vom Anguss und voneinander', () => {
  /* Rückmeldung vom 23.09.: in den Tönen der Schmelze verschwanden Bohne,
     Waschbrett und die Knoten im Lauf. Was im Anguss sitzt oder an ihm
     hängt, muss sich deutlich von ihm abheben. */
  assert.ok(S.list.length >= 3 && ['teal', 'stahl', 'graphit'].every(id => S.list.some(s => s.id === id)), 'die drei Schemata');
  for (const s of S.list) {
    S.set(s.id);
    const E = C.ELEMENT, runner = P.runner;
    const far = (a, b, min, text) => assert.ok(dE(a, b) >= min, s.id + ': ' + text + ' nur ΔE ' + dE(a, b).toFixed(1) + ' (' + a + ' / ' + b + ')');
    for (const k of ['punkt', 'verzweigung', 'spiegelpunkt']) far(E[k], runner, 18, 'Knoten ' + k + ' am Anguss');
    for (const k of ['bohne', 'waschbrett']) far(E[k], runner, 18, k + ' am Anguss');
    far(E.bohne, E.waschbrett, 20, 'Bohne und Waschbrett');
    const nodes = ['pressrest', 'punkt', 'verzweigung', 'spiegelpunkt', 'anschnitt'];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) far(E[nodes[i]], E[nodes[j]], 15, 'Knoten ' + nodes[i] + ' und ' + nodes[j]);
    }
    /* Die drei Punktarten, die der Anwender setzt, klar getrennt (24.09.). */
    for (const [a, b] of [['punkt', 'verzweigung'], ['punkt', 'spiegelpunkt'], ['verzweigung', 'spiegelpunkt']]) far(E[a], E[b], 20, a + ' und ' + b);
  }
  S.set('teal');
});

test('In jedem Schema: die Formhälften weit auseinander, auch bei Rot-Grün-Schwäche', () => {
  /* Rückmeldung vom 24.09.: die beiden Hälften waren zwei Stufen desselben
     Blaus. Jetzt Rose und Gelb. Lachs und Mint lagen bei Deuteranopie nur
     ΔE 7 auseinander; geprüft wird darum auch mit den Simulationen nach
     Machado, Oliveira und Fernandes (2009), Schweregrad 1, in linearem RGB. */
  const SIM = {
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]
  };
  const sim = (hex, m) => '#' + m.map(r => {
    const c = P.hexRgb(hex).map(toLin);
    const v = Math.min(1, Math.max(0, r[0] * c[0] + r[1] * c[1] + r[2] * c[2]));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)).toString(16).padStart(2, '0');
  }).join('');
  for (const s of S.list) {
    S.set(s.id);
    const mov = C.sideColor(4, 1), fix = C.sideColor(5, -1);
    const far = (a, b, min, text) => assert.ok(dE(a, b) >= min, s.id + ': ' + text + ' nur ΔE ' + dE(a, b).toFixed(1) + ' (' + a + ' / ' + b + ')');
    far(mov, fix, 30, 'bewegliche und feste Seite');
    for (const [k, m] of Object.entries(SIM)) far(sim(mov, m), sim(fix, m), 20, 'die Hälften bei ' + k);
    for (const h of [mov, fix]) {
      for (let l = 0; l < 6; l++) far(h, C.regionColor(l), 15, 'Hälfte und Schieber ' + l);
      far(h, C.undercutColor(), 15, 'Hälfte und Hinterschnitt');
    }
  }
  S.set('teal');
});

test('Umschalten färbt Designer, Anguss, Richtungen und Achsen um', () => {
  S.set('stahl');
  const c = S.colors('stahl');
  assert.notEqual(c.mark, S.colors('teal').mark, 'Stahlblau hat eine eigene Hervorhebung');
  assert.equal(VENTS.TYPES.bohne.color, c.mark);
  assert.equal(VENTS.TYPES.waschbrett.color, c.markLime);
  assert.equal(VENTS.TYPES.entlueftet.color, c.air);
  assert.equal(COOL.TYPES.stich.color, c.cool);
  assert.equal(FILL.inletColor(), c.die, 'der Anschnitt der Füllung zieht mit dem Ereignis nach');
  assert.equal(G.TYPES.point.color, c.mark);
  assert.equal(G.TYPES.gate.color, c.die);
  assert.deepEqual(C.axisColors(), [c.axisX, c.axisY, c.axisZ]);
  assert.equal(C.regionColor(5), P.mix('axisZ', 'text', 0.55));
  assert.equal(C.ROLE.viewport, c.viewport, 'die Fläche hinter dem Körper');
  /* Ein entfallenes Schema landet beim nächsten der drei (S.alias). */
  assert.equal(S.set('kupfer'), 'graphit');
  assert.equal(C.ROLE.part, S.colors('graphit').part, 'das Bauteil hat das Grau des Schemas');
  assert.equal(FILL.inletColor(), S.colors('graphit').die);
  S.set('teal');
  assert.equal(FILL.inletColor(), P.die);
});

test('Farbleisten: die von palette.js, heat blau → grün → rot, Punktfarben linear', () => {
  S.set('teal');
  for (const name of LEISTEN) {
    for (const t of STELLEN) {
      assert.equal(C.scale(name, t), P.scale(name, t), name + ' bei ' + t);
      const a = C.scaleRgb(name, t), b = P.scaleRgb(name, t);
      assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-12), name + ' als [r, g, b] bei ' + t);
    }
    assert.equal(C.scale(name, NaN), null, name + ': NaN gibt keine Farbe');
    assert.equal(C.scaleRgb(name, NaN), null);
  }
  /* heat: Dunkelviolett über Blau, Grün und Gelb nach Dunkelrot. */
  const lo = C.scaleRgb('heat', 0.25), mid = C.scaleRgb('heat', 0.5), hi = C.scaleRgb('heat', 0.85);
  assert.ok(lo[2] > 0.75 && lo[2] > lo[1] && lo[1] > lo[0], 'heat unten blau');
  assert.ok(mid[1] > mid[0] && mid[1] > mid[2], 'heat in der Mitte grün');
  assert.ok(hi[0] > 0.8 && hi[0] > hi[2], 'heat oben rot');
  /* Das Flussschema des Angussdesigners liest heat, beschnitten wie die
     Felder (seit 24.09.; vorher eine eigene Leiste `speed`). */
  assert.equal(CHART.speedColor(2, 4), P.scale('heat', C.heatTrim(0.5)), 'die Bänder auf heat');
  assert.equal(CHART.speedColor(9, 4), P.scale('heat', C.heatTrim(1)), 'was schneller ist, bleibt am roten Ende');
  assert.equal(CHART.speedColor(0, 0), P.scale('heat', C.heatTrim(0)));
  /* Die Tafeln: n Farben, r, g, b je Eintrag; Float wie die Leiste, linear
     für Punktfarben. */
  const tab = C.lut('heat');
  assert.equal(tab.length, 256 * 3);
  for (const k of [0, 64, 128, 200, 255]) {
    const want = P.hexRgb(P.scale('heat', k / 255)).map(v => Math.round(v * 255));
    assert.deepEqual([tab[3 * k], tab[3 * k + 1], tab[3 * k + 2]], want, 'Tafel bei ' + k);
    const f = C.lutFloat('heat'), l = C.lutLinear('heat');
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(f[3 * k + i] - want[i] / 255) < 1e-6, 'lutFloat bei ' + k);
      assert.ok(Math.abs(l[3 * k + i] - toLin(want[i] / 255)) < 1e-6, 'lutLinear bei ' + k);
    }
  }
  assert.equal(C.lut('draft', 2).length, 6);
  const heat = C.scaleFn('heat');
  assert.deepEqual(heat(0.5).map(v => +v.toFixed(3)), C.linRgb(P.scale('heat', 128 / 255)).map(v => +v.toFixed(3)), 'scaleFn liest die lineare Tafel');
  assert.deepEqual(heat(-1), heat(0), 'geklemmt');
  assert.deepEqual(heat(2), heat(1));
  /* Linear heißt: dieselbe Rolle als Punktfarbe sieht aus wie als Material. */
  const lin = C.linRgb(P.part), srgb = P.hexRgb(P.part);
  for (let i = 0; i < 3; i++) assert.ok(lin[i] < srgb[i], 'linear ist dunkler als sRGB');
  /* Was es mit den Leisten nicht mehr gibt. */
  assert.equal(C.fieldT, undefined, 'kein Versatz in die Leiste: die Felder nehmen, was ihr Werkzeug verlangt');
  assert.equal(C.FIELD_T0, undefined);
  assert.equal(C.COUNT_COLORS, undefined);
  assert.equal(C.OPEN_COLOR, undefined);
});

test('Entformschräge: die Stufe sitzt am Grenzwert, beim Dreifachen sattes Grün', () => {
  S.set('teal');
  for (const lim of [0.5, 1.5, 2]) {
    assert.equal(C.draftT(lim, lim), 1 / 3, 'der Grenzwert bei einem Drittel der Leiste');
    assert.equal(C.draftT(3 * lim, lim), 1);
    assert.equal(C.draftHex(0, lim), '#b42318', '0° rot');
    assert.equal(C.draftHex(-2, lim), '#b42318', 'darunter bleibt es rot');
    const below = C.draftHex(lim * (1 - 1e-9), lim);
    assert.ok(near(below, '#d4a908'), 'knapp unter dem Grenzwert Gold: ' + below);
    assert.equal(C.draftHex(lim, lim), '#7cc4a0', 'am Grenzwert helles Grün');
    assert.ok(dE(below, C.draftHex(lim, lim)) > 12, 'eine Stufe, kein Übergang');
    assert.equal(C.draftHex(3 * lim, lim), '#0d7a3c', 'beim Dreifachen sattes Grün');
    assert.equal(C.draftHex(10 * lim, lim), '#0d7a3c', 'darüber bleibt es');
    /* Der Verlauf dazwischen: rot → gold unter dem Grenzwert, hell → satt darüber. */
    assert.equal(C.draftHex(lim / 2, lim), P.scale('draft', 1 / 6));
    assert.equal(C.draftHex(2 * lim, lim), P.scale('draft', 2 / 3));
    /* Als Punktfarbe dieselbe Farbe, linear — auch an der Stufe exakt. */
    for (const [deg, hex] of [[0, '#b42318'], [lim, '#7cc4a0'], [3 * lim, '#0d7a3c']]) {
      const got = C.draftColor(deg, lim), want = C.linRgb(hex);
      assert.ok(got.every((v, i) => Math.abs(v - want[i]) < 1e-9), 'draftColor bei ' + deg + '°');
    }
    const just = C.draftColor(lim * (1 - 1e-9), lim), gold = C.linRgb('#d4a908');
    assert.ok(just.every((v, i) => Math.abs(v - gold[i]) < 1e-3), 'knapp darunter Gold, nicht Grün');
  }
  assert.equal(C.undercutDark(), P.mix('bad', 'text', 0.4));
});

test('Die Farbleisten sind in jedem Schema dieselben', () => {
  S.set('teal');
  const ref = Object.fromEntries(LEISTEN.map(name => [name, STELLEN.map(t => C.scale(name, t))]));
  const refDraft = [0, 1, 1.5, 2, 4.5, 6].map(deg => C.draftHex(deg, 1.5));
  const refSpeed = [0, 1, 2, 3].map(v => CHART.speedColor(v, 3));
  const refTab = Array.from(C.lut('heat'));
  for (const s of S.list) {
    assert.equal(S.set(s.id), s.id);
    for (const name of LEISTEN) assert.deepEqual(STELLEN.map(t => C.scale(name, t)), ref[name], s.id + ': ' + name);
    assert.deepEqual([0, 1, 1.5, 2, 4.5, 6].map(deg => C.draftHex(deg, 1.5)), refDraft, s.id + ': Entformschräge');
    assert.deepEqual([0, 1, 2, 3].map(v => CHART.speedColor(v, 3)), refSpeed, s.id + ': Flussschema');
    const tab = C.lut('heat');
    assert.ok(tab.length === refTab.length && tab.every((v, i) => v === refTab[i]), s.id + ': Tafel');
  }
  S.set('teal');
});

test('Ohne Palette gelten die Standardwerte der Rollen und dieselben Leisten', () => {
  S.set('stahl');
  const saved = globalThis.__PALETTE__;
  const mit = Object.fromEntries(LEISTEN.map(name => [name, STELLEN.map(t => C.scale(name, t))]));
  try {
    delete globalThis.__PALETTE__;
    for (const key of Object.keys(C.ROLE)) assert.equal(C.ROLE[key], S.base[key], 'Rückfall für ' + key);
    for (const name of LEISTEN) assert.deepEqual(STELLEN.map(t => C.scale(name, t)), mit[name], 'ohne Palette dieselbe Leiste ' + name);
    assert.equal(C.draftHex(1.5, 1.5), '#7cc4a0');
    assert.equal(C.mixHex('air', 'surface', 0), S.base.air);
    assert.equal(C.ELEMENT.bohne, S.base.mark, 'die Bohne in der Hervorhebung des Standards');
  } finally {
    globalThis.__PALETTE__ = saved;
    S.set('teal');
  }
});

test('Formaufbau: Teile tragen Rollen, nur Sachfarben, die dem Schema folgen', () => {
  S.set('teal');
  assert.equal(R.roleColor('melt'), P.melt);
  assert.equal(R.roleColor('steel:0.5'), P.mix('steel', 'steelDark', 0.5));
  assert.equal(R.roleColor('cool:0.45'), P.mix('cool', 'surface', 0.45));
  for (const bad of ['bad', 'ok', 'mark', 'primary', 'constructor', '__proto__', 'melt:2', 'steel:-1', '#ff0000', 'melt;x', '', null, 3]) {
    assert.equal(R.roleColor(bad), null, 'keine Rolle für ein Teil: ' + String(bad));
  }
  const cast = R.BY_ID.castPart, cool = R.BY_ID.coolFixL;
  assert.equal(cast.color, P.melt, 'das Gussteil ist Schmelze');
  assert.equal(R.BY_ID.castRunner.color, P.runner);
  assert.equal(R.BY_ID.castOverflow.color, P.overflow);
  assert.equal(cool.color, P.cool);
  S.set('graphit');
  /* Die Schmelze ist seit 24.09. in jedem Schema dasselbe Orange; dem Schema
     folgt, was dort anders aussieht, etwa die Temperierung. */
  assert.equal(cast.color, S.colors('graphit').melt, 'das Gussteil ist in jedem Schema Schmelze');
  assert.notEqual(S.colors('graphit').cool, S.colors('teal').cool);
  assert.equal(cool.color, S.colors('graphit').cool, 'die Voreinstellung folgt dem Schema');
  S.set('teal');
  /* Die Stahlteile: Stufen zwischen Fläche und Kante, Nachbarn getrennt. */
  const steel = R.COMPONENTS.filter(c => c.role.startsWith('steel')).map(c => c.color);
  assert.equal(new Set(steel).size, steel.length, 'jedes Stahlteil in einer eigenen Stufe');
});

test('Datei und Kopie: ein Getter ist beim Speichern und Kopieren ein gewöhnlicher Wert', () => {
  S.set('graphit');
  const g = S.colors('graphit');
  assert.notEqual(g.mark, S.colors('teal').mark, 'Graphit hat eine eigene Hervorhebung');
  const copy = { ...VENTS.TYPES.bohne };
  assert.equal(copy.color, g.mark);
  S.set('teal');
  assert.equal(copy.color, g.mark, 'die Kopie hält ihren Wert');
  assert.equal(VENTS.TYPES.bohne.color, P.mark, 'das Original folgt dem Schema');
  assert.equal(JSON.parse(JSON.stringify(G.TYPES)).gate.color, P.die);
});
