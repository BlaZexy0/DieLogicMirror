/* Automatisch generiert von build.py — NICHT von Hand bearbeiten.
   Quelle sind die ES-Module unter js/. */
(function () {
'use strict';
var __registry = {}, __cache = {};
function __define(id, fn) { __registry[id] = fn; }
function __require(id) {
  if (__cache[id]) return __cache[id].exports;
  if (!__registry[id]) throw new Error('Modul fehlt im Bundle: ' + id);
  var m = __cache[id] = { exports: {} };
  __registry[id](m.exports, __require);
  return m.exports;
}
__define('js/core/theme.js', function (exports, __require) {
/* Liest das Farbschema aus config/theme.js (setzt window.__THEME__ per
   klassischem <script>-Tag — funktioniert über http UND file://) und wendet
   den UI-Teil als CSS-Variablen an. Die Canvas-Renderer lesen theme.chart /
   theme.map / theme.heatStops zur Zeichenzeit. */

const theme = {};

async function loadTheme() {
  const data = window.__THEME__;
  if (!data) throw new Error('config/theme.js nicht geladen (window.__THEME__ fehlt).');
  Object.assign(theme, data);
  applyCssVars();
  return theme;
}

function applyCssVars() {
  const u = theme.ui || {};
  const root = document.documentElement.style;
  const map = {
    '--deep': u.deep, '--green': u.green, '--pale': u.pale, '--bg': u.bg,
    '--line': u.line, '--muted': u.muted, '--blue': u.blue, '--surface': u.surface,
    '--header-from': u.headerFrom, '--header-to': u.headerTo,
    '--ok': u.ok, '--ok-border': u.okBorder,
    '--warn-text': u.warnText, '--warn-border': u.warnBorder, '--bad': u.bad
  };
  for (const k in map) if (map[k]) root.setProperty(k, map[k]);
}

exports.loadTheme = loadTheme;
exports.theme = theme;
});
__define('js/config/fields.js', function (exports, __require) {
/* Definition aller Eingabefelder (Gruppen, Labels, Einheiten, Defaults).
   Die 'key'-Namen sind die kanonischen Feldnamen — Charts referenzieren sie
   in ihrer inputs-Liste, Maschinen-Presets (config/machines.json) setzen sie. */

const groups = [
  {
    id: 'machine', title: 'Maschine und Druck',
    fields: [
      { key: 'force',  label: 'Maschinenkraft',    unit: 'kN',  def: 13500 },
      { key: 'area',   label: 'Sprengfläche',      unit: 'm²',  def: 0.15 },
      { key: 'pmin',   label: 'Druck min.',        unit: 'bar', def: 100 },
      { key: 'pmax',   label: 'Druck max.',        unit: 'bar', def: 1200 },
      { key: 'psel',   label: 'Auslegungsdruck',   unit: 'bar', def: 600 },
      { key: 'safety', label: 'Sicherheitsfaktor', unit: '-',   def: 1.3 }
    ]
  },
  {
    id: 'clamping', title: 'Zuhaltung (Säulen und Schwerpunkt)',
    fields: [
      { key: 'tieX', label: 'Säulenabstand horizontal', unit: 'mm', def: 1100 },
      { key: 'tieY', label: 'Säulenabstand vertikal',   unit: 'mm', def: 1100 },
      { key: 'eccX', label: 'Außermittigkeit Schwerpunkt x', unit: 'mm', def: 40 },
      { key: 'eccY', label: 'Außermittigkeit Schwerpunkt y', unit: 'mm', def: 25 }
    ]
  },
  {
    id: 'mass', title: 'Massenbilanz',
    fields: [
      { key: 'part',     label: 'Bauteilgewicht',   unit: 'kg',    def: 12 },
      { key: 'runner',   label: 'Angussgewicht',    unit: 'kg',    def: 3 },
      { key: 'overflow', label: 'Überlaufgewicht',  unit: 'kg',    def: 2 },
      { key: 'biscuit',  label: 'Pressrestgewicht', unit: 'kg',    def: 1.2 },
      { key: 'density',  label: 'Dichte',           unit: 'kg/m³', def: 2700 }
    ]
  },
  {
    id: 'chamber', title: 'Füllkammer und Kolben', wide: true,
    columns: [
      {
        title: 'Kolben',
        fields: [
          { key: 'diam', label: 'Gewählter Kolben-Ø', unit: 'mm', def: 150 },
          { key: 'dmin', label: 'Kolben-Ø min.',      unit: 'mm', def: 120 },
          { key: 'dmax', label: 'Kolben-Ø max.',      unit: 'mm', def: 200 }
        ]
      },
      {
        title: 'Kammerlänge',
        fields: [
          { key: 'length', label: 'Gewählte Kammerlänge', unit: 'mm', def: 700 },
          { key: 'lmin',   label: 'Kammerlänge min.',     unit: 'mm', def: 500 },
          { key: 'lmax',   label: 'Kammerlänge max.',     unit: 'mm', def: 900 }
        ]
      }
    ]
  },
  {
    id: 'gating', title: 'Anschnitt und Entlüftung',
    fields: [
      { key: 'gate', label: 'Anschnittfläche',   unit: 'mm²', def: 1800 },
      { key: 'vent', label: 'Entlüftungsfläche', unit: 'mm²', def: 800 }
    ]
  },
  {
    id: 'process', title: 'Prozessfenster', wide: true,
    fields: [
      { key: 'vmin',    label: 'Kolbengeschw. min.',        unit: 'm/s', def: 1 },
      { key: 'vmax',    label: 'Kolbengeschw. max.',        unit: 'm/s', def: 7 },
      { key: 'amax',    label: 'Beschleunigung max.',       unit: 'm/s²', def: 60 },
      { key: 'vsel',    label: 'Gewählte Kolbengeschw.',    unit: 'm/s', def: 4 },
      { key: 'v1sel',   label: 'Kolbengeschw. 1. Phase',    unit: 'm/s', def: 0.4 },
      { key: 'tmax',    label: 'Füllzeit max.',             unit: 'ms',  def: 100 },
      { key: 'fillMin', label: 'Füllgrad Ziel min.',        unit: '%',   def: 40 },
      { key: 'fillMax', label: 'Füllgrad Ziel max.',        unit: '%',   def: 60 },
      { key: 'gateMin', label: 'Anschnittgeschw. Ziel min.', unit: 'm/s', def: 30 },
      { key: 'gateMax', label: 'Anschnittgeschw. Ziel max.', unit: 'm/s', def: 50 }
    ]
  },
  {
    id: 'geometry', title: 'Bauteilgeometrie und Thermik', wide: true,
    fields: [
      { key: 'wall',    label: 'Wandstärke',      unit: 'mm',    def: 3.5 },
      { key: 'wallMin', label: 'Wandstärke min.', unit: 'mm',    def: 1.5 },
      { key: 'wallMax', label: 'Wandstärke max.', unit: 'mm',    def: 8 },
      { key: 'Tcast',   label: 'Gießtemperatur',  unit: '°C',    def: 660 },
      { key: 'Tflow',   label: 'Min. Fließtemp.', unit: '°C',    def: 580 },
      { key: 'Tdie',    label: 'Formtemperatur',  unit: '°C',    def: 200 },
      { key: 'Sfrac',   label: 'Zul. Erstarrung', unit: '%',     def: 20 },
      { key: 'Zconst',  label: 'Z-Konstante',     unit: '°C/%',  def: 4.8 },
      { key: 'kfill',   label: 'NADCA-Faktor k',  unit: 'ms/mm', def: 35 }
    ]
  },
  {
    id: 'hydraulics', title: 'Hydraulik und Ausbringung', wide: true,
    fields: [
      { key: 'injForce',   label: 'Gießkraft (Schuss)',       unit: 'kN',     def: 2000 },
      { key: 'Cd',         label: 'Durchflussbeiwert',        unit: '-',      def: 0.5 },
      { key: 'pSpecMin',   label: 'Ziel-Gießdruck min.',      unit: 'bar',    def: 800 },
      { key: 'pSpecMax',   label: 'Ziel-Gießdruck max.',      unit: 'bar',    def: 1200 },
      { key: 'vAirMax',    label: 'Max. Entlüftungsgeschw.',  unit: 'm/s',    def: 150 },
      { key: 'biscuitMin', label: 'Pressrest min.',           unit: 'mm',     def: 25 },
      { key: 'gateTh',     label: 'Anschnittdicke',           unit: 'mm',     def: 3 },
      { key: 'solK',       label: 'Erstarrungskonstante',     unit: 'ms/mm²', def: 10 },
      { key: 'intTime',    label: 'Nachdruckzeit',            unit: 'ms',     def: 60 }
    ]
  }
];

/* Felder, die von Maschinen-Presets gesetzt werden. Handänderung eines dieser
   Felder setzt die Preset-Auswahl auf „manuell" zurück. */
const PRESET_KEYS = { force: 1, vmax: 1, amax: 1, dmin: 1, dmax: 1, lmax: 1, injForce: 1, tieX: 1, tieY: 1 };

/* Standard-Schusskurve: Wegpunkte [s in mm, v in m/s]. */
const DEFAULT_CURVE = [[60, 0.4], [318, 0.4], [470, 4], [675, 4]];

function allFields() {
  const a = [];
  for (const g of groups) {
    if (g.columns) g.columns.forEach(c => a.push(...c.fields));
    else a.push(...g.fields);
  }
  return a;
}

exports.allFields = allFields;
exports.groups = groups;
exports.PRESET_KEYS = PRESET_KEYS;
exports.DEFAULT_CURVE = DEFAULT_CURVE;
});
__define('js/core/state.js', function (exports, __require) {
/* Zentraler Zustand: Eingabewerte, Schusskurve, gewähltes Maschinen-Preset.
   UI-Module schreiben in den Zustand und rufen notify(); die Seiten-Einstiege
   (main.js / single.js) abonnieren mit subscribe() und rendern neu.

   Der Zustand wird in localStorage gespiegelt: Dashboard und Einzelseiten
   sehen dieselbe Auslegung, und ein Reload verliert nichts. */

const { allFields, DEFAULT_CURVE } = __require('js/config/fields.js');
const STORAGE_KEY = 'hpdc-dashboard-state-v1';

const state = {
  values: {},
  curve: DEFAULT_CURVE.map(p => p.slice()),
  machine: ''
};

for (const f of allFields()) state.values[f.key] = f.def;
loadPersisted();

const subscribers = [];

function subscribe(fn) { subscribers.push(fn); }

function notify() { persist(); subscribers.forEach(fn => fn()); }

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.values) {
      for (const k in state.values) {
        const x = Number(data.values[k]);
        if (data.values[k] != null && isFinite(x)) state.values[k] = x;
      }
    }
    if (Array.isArray(data.curve) && data.curve.length) {
      state.curve = data.curve
        .filter(p => Array.isArray(p) && p.length >= 2)
        .map(p => [Number(p[0]), Number(p[1])]);
    }
    if (typeof data.machine === 'string') state.machine = data.machine;
  } catch (e) {
    console.warn('Gespeicherter Zustand konnte nicht geladen werden — Defaults werden verwendet.', e);
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      values: state.values, curve: state.curve, machine: state.machine
    }));
  } catch (e) { /* localStorage voll oder deaktiviert — Zustand lebt dann nur in der Seite */ }
}

/* Alles auf die Defaults zurücksetzen (und persistieren). */
function resetState() {
  for (const f of allFields()) state.values[f.key] = f.def;
  state.curve = DEFAULT_CURVE.map(p => p.slice());
  state.machine = '';
  persist();
}

exports.subscribe = subscribe;
exports.notify = notify;
exports.persist = persist;
exports.resetState = resetState;
exports.state = state;
});
__define('js/core/format.js', function (exports, __require) {
/* Zahlformatierung und kleine numerische Helfer. */

function fmt(x) {
  return (x === null || x === undefined || !isFinite(x))
    ? '—'
    : Number(x).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/* n gleichmäßig verteilte Werte von a bis b (inklusive). */
function seq(a, b, n) {
  const r = [];
  for (let i = 0; i < n; i++) r.push(a + (b - a) * i / (n - 1));
  return r;
}

exports.fmt = fmt;
exports.seq = seq;
});
__define('js/core/physics.js', function (exports, __require) {
/* HPDC-Physik (portiert aus hpdc_math): Füllkammer, kritische Geschwindigkeit,
   Bewegungsprofil der Schusskurve und das komplette Schussmodell mit
   Ereignissen und Prüfungen. Reine Rechenlogik, kein DOM. */

const { fmt, seq } = __require('js/core/format.js');
const PI = Math.PI;

/* ── Massen- und Geometrie-Helfer ── */
function total(v) { return v.part + v.runner + v.overflow; }
function afterGate(v) { return v.part + v.overflow; }
function pistonArea(v) { return 0.25 * PI * v.diam * v.diam; }           // mm²
function travel(m, v) { return 1e9 * (m / v.density) / pistonArea(v); }  // mm für Masse m

/* Höhe eines Kreissegments mit Flächenanteil phi (bisektion). */
function segHeight(phi) {
  if (phi <= 0) return 0;
  if (phi >= 1) return 1;
  let lo = 0, hi = 1, mid = 0.5;
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    const f = (Math.acos(1 - 2 * mid) - 2 * (1 - 2 * mid) * Math.sqrt(Math.max(0, mid * (1 - mid)))) / PI;
    if (f < phi) lo = mid; else hi = mid;
  }
  return mid;
}

/* Kritische Kolbengeschwindigkeit 1. Phase nach Nogowizin. D in m. */
function vCrit(Dm, phi) {
  return Math.sqrt(9.81 * Dm) * (1.386 - 1.915 * phi + 0.615 * phi * phi);
}

function waveSpeed(Dm, phi) {
  if (phi <= 0 || phi >= 0.995) return NaN;
  const y = segHeight(phi);
  const chord = 2 * Math.sqrt(Math.max(1e-12, y * (1 - y))) * Dm;
  return Math.sqrt(9.81 * (phi * PI * Dm * Dm / 4) / chord);
}

/* Bewegungsprofil: stückweise konstante Beschleunigung.
   v1² = v0² + 2aΔs, Δt = 2Δs/(v0+v1). Punkte: [s in mm, v in m/s]. */
function buildProfile(pts) {
  const arr = pts.filter(p => isFinite(p[0]) && isFinite(p[1])).map(p => [p[0] / 1000, p[1]]);
  if (!arr.length) throw 'Keine gültigen Kurvenpunkte.';
  if (arr[0][0] > 0) arr.unshift([0, 0]);
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

/* Schussmodell: Füllkammer + Ereignisse + Prüfungen.
   v = Eingabewerte, curvePoints = Schusskurven-Wegpunkte. */
function computeShot(v, curvePoints) {
  let prof;
  try { prof = buildProfile(curvePoints); }
  catch (e) { return { error: '' + e }; }

  const A = 0.25 * PI * Math.pow(v.diam / 1000, 2), rho = v.density, L = v.length / 1000;
  const Vr = v.runner / rho, Vp = v.part / rho, Vo = v.overflow / rho, Vb = v.biscuit / rho;
  const Vdose = Vr + Vp + Vo + Vb;
  const phi = Vdose / (A * L);
  if (phi >= 1) return { error: 'Dosiervolumen (' + fmt(Vdose * 1e6) + ' cm³) übersteigt das Kammervolumen — Füllgrad ≥ 100 %.' };
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
      ev.t = q.t; ev.v = q.v; ev.gv = gateR ? q.v * gateR : null;
    }
    evs.push(ev);
  }

  const totalStroke = sFill + (Vr + Vp + Vo) / A, biscLen = Vb / A;
  let fill = null;
  if (evs[1].inP && evs[3].inP) fill = (evs[3].t - evs[1].t) * 1000;
  const vSlow = prof.maxVelBefore(sFill);

  const checks = [];
  checks.push([vSlow <= vcrit + 1e-9, '1. Phase: max. ' + fmt(vSlow) + ' m/s bis Kammer voll ' + (vSlow <= vcrit ? '≤' : '>') + ' v_krit ' + fmt(vcrit) + ' m/s (Nogowizin).']);
  checks.push([prof.vmax <= v.vmax + 1e-9, 'Spitzengeschwindigkeit ' + fmt(prof.vmax) + ' m/s ' + (prof.vmax <= v.vmax ? '≤' : '>') + ' Maschinenlimit ' + fmt(v.vmax) + ' m/s.']);
  const aPk = Math.max(prof.amax, -prof.amin, 0);
  if (v.amax > 0) checks.push([aPk <= v.amax + 1e-9, 'Spitzenbeschleunigung ' + fmt(aPk) + ' m/s² ' + (aPk <= v.amax ? '≤' : '>') + ' Maschinenlimit ' + fmt(v.amax) + ' m/s².']);
  checks.push([prof.travel >= totalStroke - 1e-9, 'Kurvenhub ' + fmt(prof.travel * 1000) + ' mm ' + (prof.travel >= totalStroke ? 'deckt' : 'deckt NICHT') + ' den Gesamthub ' + fmt(totalStroke * 1000) + ' mm ab.']);
  checks.push([prof.travel <= L - biscLen + 2e-3, 'Kurvenende ' + fmt(prof.travel * 1000) + ' mm bleibt vor dem Pressrest (Kammer ' + fmt(v.length) + ' mm − Pressrest ' + fmt(biscLen * 1000) + ' mm).']);
  checks.push([biscLen * 1000 >= v.biscuitMin, 'Pressrest ' + fmt(biscLen * 1000) + ' mm ' + (biscLen * 1000 >= v.biscuitMin ? '≥' : '<') + ' Minimum ' + fmt(v.biscuitMin) + ' mm.']);
  if (fill !== null) checks.push([fill <= v.tmax, 'Füllzeit ab Anschnitt ' + fmt(fill) + ' ms ' + (fill <= v.tmax ? '≤' : '>') + ' Maximum ' + fmt(v.tmax) + ' ms.']);
  if (gateR && evs[2].inP) checks.push([evs[2].gv >= v.gateMin && evs[2].gv <= v.gateMax, 'Anschnittgeschwindigkeit bei Bauteilfüllung ' + fmt(evs[2].gv) + ' m/s im Zielband ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s.']);

  return {
    profile: prof, samples: prof.samples(320), events: evs,
    phi, sFill, vcrit, wave: waveSpeed(v.diam / 1000, phi),
    gateR, totalStroke, biscLen, fill, vSlow, Vdose, checks
  };
}

exports.total = total;
exports.afterGate = afterGate;
exports.pistonArea = pistonArea;
exports.travel = travel;
exports.segHeight = segHeight;
exports.vCrit = vCrit;
exports.waveSpeed = waveSpeed;
exports.buildProfile = buildProfile;
exports.computeShot = computeShot;
});
__define('js/charts/helpers.js', function (exports, __require) {
/* Kleine Bau-Helfer für Diagrammdaten (Serien, Linien-Spezifikation, Heatmap-Raster). */

const { seq } = __require('js/core/format.js');
function series(n, c, x, fn) { return { n, c, y: x.map(fn) }; }

function line(x, ys, xl, yl, info) { return { x, ys, xl, yl, info }; }

function heat(x0, x1, y0, y1, fn, xl, yl, cl, lo, hi, levels) {
  const x = seq(x0, x1, 81), y = seq(y0, y1, 61), z = [];
  for (let j = 0; j < y.length; j++) {
    z[j] = [];
    for (let i = 0; i < x.length; i++) z[j][i] = fn(x[i], y[j]);
  }
  return { x, y, z, xl, yl, cl, lo, hi, levels };
}

exports.series = series;
exports.line = line;
exports.heat = heat;
});
__define('js/charts/mathfmt.js', function (exports, __require) {
/* Hilfsfunktionen für sauber formatierte Formeln in den Mathe-Erklärungen:
   echte Brüche (Zähler über Nenner) und Wurzeln mit Überstrich — reines
   HTML/CSS (Styles in css/main.css), keine externe Mathe-Bibliothek. */

const frac = (num, den) =>
  '<span class="frac"><span class="num">' + num + '</span><span class="den">' + den + '</span></span>';

/* tall: größeres Wurzelzeichen, wenn der Radikand ein Bruch ist. */
const sqrt = (rad, tall) =>
  '<span class="sqrt' + (tall ? ' tall' : '') + '"><span class="rad">' + rad + '</span></span>';

const cbrt = (rad, tall) =>
  '<span class="sqrt cbrt' + (tall ? ' tall' : '') + '"><span class="rad">' + rad + '</span></span>';

exports.frac = frac;
exports.sqrt = sqrt;
exports.cbrt = cbrt;
});
__define('js/charts/shotcurve.js', function (exports, __require) {
/* Schusskurve: Kolbenbewegung (t–v / t–s / s–v) mit Prozessereignissen,
   Ereignistabelle und Plausibilitätsprüfungen. */

const { series, line } = __require('js/charts/helpers.js');
const { fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const { frac, sqrt } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'shotcurve',
  title: 'Schusskurve',
  desc: 'Kolbenbewegung mit Prozessereignissen',
  wide: true,
  aspect: 0.42,
  tab: 'sv',
  tabs: [['tv', 't–v'], ['ts', 't–s'], ['sv', 's–v']],
  usesCurve: true,
  csv: true,
  inputs: ['part', 'runner', 'overflow', 'biscuit', 'density', 'diam', 'length', 'gate', 'vmax', 'amax', 'tmax', 'biscuitMin', 'gateMin', 'gateMax'],

  calc(v, { shot }) {
    if (shot.error) return { err: shot.error, title: this.title };
    const C = theme.chart;
    const sm = shot.samples, tb = this.tab;
    let x, y, xl, yl;
    if (tb === 'tv') { x = sm.t; y = sm.v; xl = 'Zeit in s'; yl = 'Kolbengeschwindigkeit m/s'; }
    else if (tb === 'ts') { x = sm.t; y = sm.s; xl = 'Zeit in s'; yl = 'Weg in mm'; }
    else { x = sm.s; y = sm.v; xl = 'Weg in mm'; yl = 'Kolbengeschwindigkeit m/s'; }

    const q = line(x, [series('Kolben', C.series1, x, (_, i) => y[i])], xl, yl,
      'Dosiert ' + fmt(shot.Vdose * 1e6) + ' cm³ · Füllgrad ' + fmt(shot.phi * 100) + ' % · Kammer voll bei ' + fmt(shot.sFill * 1000) + ' mm');
    q.ys[0].y = y;
    q.area = 1;
    q.y0 = 0;

    q.events = shot.events.filter(e => e.inP).map((e, i) => ({
      x: tb === 'sv' ? e.s : e.t,
      y: tb === 'ts' ? e.s : e.v,
      n: i + 1, l: e.name
    }));

    if (tb !== 'ts') {
      q.hrefs = [{ y: shot.vcrit, l: 'v_krit 1. Phase ' + fmt(shot.vcrit) + ' m/s', c: C.crit }];
      if (v.vmax <= Math.max.apply(null, q.ys[0].y) * 1.35)
        q.hrefs.push({ y: v.vmax, l: 'v_max Maschine ' + fmt(v.vmax) + ' m/s', c: C.limit });
      q.y1 = Math.max(Math.max.apply(null, q.ys[0].y), shot.vcrit) * 1.12;
    } else {
      q.hrefs = [{ y: shot.totalStroke * 1000, l: 'Gesamthub ' + fmt(shot.totalStroke * 1000) + ' mm', c: C.limit }];
    }

    const nodes = shot.profile;
    q.pts = [];
    for (let i = 0; i < nodes.s.length; i++) {
      q.pts.push({ x: tb === 'sv' ? nodes.s[i] * 1000 : nodes.t[i], y: tb === 'ts' ? nodes.s[i] * 1000 : nodes.v[i] });
    }
    return q;
  },

  /* Zusätzliches Markup unter dem Canvas: Ereignistabelle + Prüfliste. */
  extraHTML() {
    return '<div class="sc-extra"><table class="ev-table"><thead><tr><th></th><th>Ereignis</th><th>Hub [mm]</th><th>Zeit [s]</th><th>Kolben-v [m/s]</th><th>Anschnitt-v [m/s]</th></tr></thead><tbody class="sc-events"></tbody></table><ul class="checks sc-checks"></ul></div>';
  },

  renderExtras(card, shot) {
    const eb = card.querySelector('.sc-events'), cl = card.querySelector('.sc-checks');
    if (!eb) return;
    eb.textContent = ''; cl.textContent = '';
    if (shot.error) {
      eb.innerHTML = '<tr><td colspan="6" class="ev-off">' + shot.error + '</td></tr>';
      return;
    }
    shot.events.forEach((e, i) => {
      const tr = document.createElement('tr'), c0 = document.createElement('td');
      const chip = document.createElement('span');
      chip.className = 'ev-chip'; chip.textContent = i + 1;
      c0.appendChild(chip); tr.appendChild(c0);
      let cells = [e.name, fmt(e.s)];
      if (e.inP) cells = cells.concat([fmt(e.t), fmt(e.v), e.gv === null ? '—' : fmt(e.gv)]);
      cells.forEach(val => {
        const td = document.createElement('td');
        td.textContent = val; tr.appendChild(td);
      });
      if (!e.inP) {
        const td = document.createElement('td');
        td.colSpan = 3; td.className = 'ev-off'; td.textContent = 'außerhalb der Kurve';
        tr.appendChild(td);
      }
      eb.appendChild(tr);
    });
    shot.checks.forEach(c => {
      const li = document.createElement('li'), ic = document.createElement('span');
      ic.className = 'ck ' + (c[0] ? 'ok' : 'bad');
      ic.textContent = c[0] ? '✓' : '✗';
      li.appendChild(ic);
      const sp = document.createElement('span');
      sp.textContent = c[1];
      li.appendChild(sp);
      cl.appendChild(li);
    });
  },

  mathHTML() {
    return `
<h4>1 · Bewegungsprofil (stückweise konstante Beschleunigung)</h4>
<p class="math-note">Die Schusskurve wird durch Wegpunkte (s<sub>i</sub>, v<sub>i</sub>) definiert; der Ursprung
(0 mm, 0 m/s) wird automatisch ergänzt. Zwischen zwei Punkten ist die Beschleunigung konstant — aus den
Kinematikbeziehungen folgt je Segment:</p>
<div class="eq">a<sub>i</sub> = ${frac('v<sub>i</sub>² − v<sub>i−1</sub>²', '2 · (s<sub>i</sub> − s<sub>i−1</sub>)')}&emsp;&emsp;Δt<sub>i</sub> = ${frac('2 · (s<sub>i</sub> − s<sub>i−1</sub>)', 'v<sub>i−1</sub> + v<sub>i</sub>')}</div>
<div class="eq">v(s) = ${sqrt('v<sub>i−1</sub>² + 2 · a<sub>i</sub> · (s − s<sub>i−1</sub>)')}&emsp;&emsp;s(t) = s<sub>i−1</sub> + v<sub>i−1</sub> · Δt + ½ · a<sub>i</sub> · Δt²</div>
<p class="math-note">Aktuell: Schusszeit = <b data-m="tEnd"></b> · Kurvenhub = <b data-m="hub"></b> ·
Spitzengeschwindigkeit = <b data-m="vpk"></b> · Spitzenbeschleunigung = <b data-m="apk"></b></p>

<h4>2 · Füllkammer und Prozessereignisse</h4>
<p class="math-note">Der Füllgrad bestimmt, wo die Kammer voll ist; jedes weitere Ereignis folgt aus der
Kontinuität (kumuliertes Volumen durch Kolbenfläche):</p>
<div class="eq">φ = ${frac('V<sub>dos</sub>', 'A<sub>K</sub> · L')}&emsp;⇒&emsp;s<sub>voll</sub> = (1 − φ) · L</div>
<div class="eq">s<sub>Ereignis</sub> = s<sub>voll</sub> + ${frac('ΣV<sub>i</sub>', 'A<sub>K</sub>')}&emsp;(nacheinander: Anguss, Bauteil, Überlauf)&emsp;·&emsp;l<sub>Pressrest</sub> = ${frac('V<sub>b</sub>', 'A<sub>K</sub>')}</div>
<p class="math-note">Aktuell: φ = <b data-m="phi"></b> · Kammer voll bei <b data-m="sfill"></b> ·
Gesamthub = <b data-m="stroke"></b> · Pressrest = <b data-m="lb"></b></p>

<h4>3 · Abgeleitete Größen und Prüfungen</h4>
<div class="eq">v<sub>a</sub> = v<sub>p</sub> · ${frac('A<sub>K</sub>', 'A<sub>a</sub>')}&emsp;(Anschnittgeschwindigkeit aus der Kolbengeschwindigkeit)</div>
<div class="eq">t<sub>f</sub> = t(Überlauf gefüllt) − t(Anguss gefüllt)&emsp;(Füllzeit ab Anschnitt)</div>
<div class="eq">v<sub>krit</sub>(D, φ) = ${sqrt('9,81 · D')} · f(φ)&emsp;mit&emsp;f(φ) = 1,386 − 1,915·φ + 0,615·φ²&emsp;(Nogowizin — Grenze der 1. Phase bis „Kammer voll")</div>
<p class="math-note">Aktuell: A<sub>K</sub>/A<sub>a</sub> = <b data-m="ratio"></b> · t<sub>f</sub> = <b data-m="tf"></b> ·
v<sub>krit</sub> = <b data-m="vcrit"></b> · max. v der 1. Phase = <b data-m="vslow"></b></p>`;
  },

  renderMath(el, v, shot) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    if (!shot || shot.error) {
      ['tEnd', 'hub', 'vpk', 'apk', 'phi', 'sfill', 'stroke', 'lb', 'ratio', 'tf', 'vcrit', 'vslow']
        .forEach(k => set(k, '—'));
      return;
    }
    const p = shot.profile;
    set('tEnd', fmt(p.endTime) + ' s');
    set('hub', fmt(p.travel * 1000) + ' mm');
    set('vpk', fmt(p.vmax) + ' m/s');
    set('apk', fmt(Math.max(p.amax, -p.amin, 0)) + ' m/s²');
    set('phi', fmt(shot.phi * 100) + ' %');
    set('sfill', fmt(shot.sFill * 1000) + ' mm');
    set('stroke', fmt(shot.totalStroke * 1000) + ' mm');
    set('lb', fmt(shot.biscLen * 1000) + ' mm');
    set('ratio', shot.gateR ? fmt(shot.gateR) : '—');
    set('tf', shot.fill === null ? '—' : fmt(shot.fill) + ' ms');
    set('vcrit', fmt(shot.vcrit) + ' m/s');
    set('vslow', fmt(shot.vSlow) + ' m/s');
  }
};

});
__define('js/charts/pq2.js', function (exports, __require) {
/* PQ²-Diagramm nach dem Formalismus von M. A. Pego Guerra, „Die Casting
   Design. A Parametric Approach", Carleton University 1997 (Kap. 2–3),
   dort nach CSIRO [23] und Karni [13]:
   – Werkzeuglinie (Die Line):      P = (C_t/A_g²)·Q²,  C_t = ρ/(2·C_d²)
   – Maschinenlinie (CSIRO-Form):   P = p₀·(1 − Q²/Q_dry²)
   – Machine Performance Envelope:  P = a/Q,  a = (2√3/9)·F_G·v_dry
   – Operational Window: t_f- und v_a-Grenzen inkl. Entlüftungsbedingung.
   Achsenmodi Q / Q² / v_p / t_f. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { pistonArea, afterGate, total } = __require('js/core/physics.js');
const { theme } = __require('js/core/theme.js');
const { frac, sqrt } = __require('js/charts/mathfmt.js');
const PI = Math.PI, S3 = Math.sqrt(3);

/* Gemeinsame Kerngrößen für calc() und renderMath(). null bei ungültigen Eingaben. */
function pqCore(v) {
  if (!(v.gate > 0) || !(v.Cd > 0) || !(v.vmax > 0) || !(v.injForce > 0) || !(v.density > 0) || !(v.diam > 0)) return null;
  const Ap = pistonArea(v) * 1e-6;                              // Kolbenfläche m²
  const p0 = v.injForce * 1e4 / pistonArea(v);                  // statischer Metalldruck bar (= P_acc·A_h/A_K)
  const Qmax = Ap * v.vmax;                                     // Trockenschuss-Volumenstrom m³/s
  const Ag = v.gate * 1e-6;                                     // Anschnittfläche m²
  const Cdie = v.density / (2 * v.Cd * v.Cd * Ag * Ag) / 1e5;   // Werkzeugkonstante C_t/A_g² in bar/(m³/s)²
  const Qs = Math.sqrt(p0 / (Cdie + p0 / (Qmax * Qmax)));       // Arbeitspunkt m³/s
  const Vag = afterGate(v) / v.density;                         // Volumen ab Anschnitt m³
  /* Machine Performance Envelope (Pego Guerra Gl. 2.13/2.14):
     P = a/Q mit a = (2√3/9)·F_G·v_dry — Leistungskonstante des Akkumulators.
     Gültig zwischen den Berührpunkten Q_t = A_K·v_dry/√3 von Ø min und Ø max. */
  const aMPE = (2 * S3 / 9) * (v.injForce * 1e3) * v.vmax;      // W
  const pEnv = Q => aMPE / Q / 1e5;                             // bar
  const QtLo = 0.25 * PI * Math.pow(v.dmin / 1000, 2) * v.vmax / S3;
  const QtHi = 0.25 * PI * Math.pow(v.dmax / 1000, 2) * v.vmax / S3;
  /* Hydraulische v_a-Grenze (J-Faktor, J = C_d): v_a = J·√(2·p₀/ρ) */
  const vaHydr = v.Cd * Math.sqrt(2 * p0 * 1e5 / v.density);
  /* Minimale Füllzeit aus der Entlüftungsbedingung (Operational Window, Zone C):
     die verdrängte Luft V_luft muss durch A_ent mit höchstens v_luft,max entweichen. */
  const tVent = (v.vent > 0 && v.vAirMax > 0) ? (total(v) / v.density) / (v.vent * 1e-6 * v.vAirMax) : NaN;
  return { Ap, p0, Qmax, Ag, Cdie, Qs, Vag, ps: Cdie * Qs * Qs, aMPE, pEnv, QtLo, QtHi, vaHydr, tVent };
}

exports.default = {
  id: 'pq2',
  title: 'PQ²-Diagramm (Arbeitspunkt)',
  desc: 'Maschine × Werkzeug · MPE-Hüllkurve · Operational Window · Achsenmodi Q, Q², v_p, t_f',
  tab: 'q',
  tabs: [['q', 'Q'], ['q2', 'Q²'], ['vp', 'v_p'], ['tf', 't_f']],
  inputs: ['gate', 'Cd', 'vmax', 'injForce', 'diam', 'dmin', 'dmax', 'density', 'part', 'runner', 'overflow', 'vent', 'vAirMax', 'tmax', 'gateMin', 'gateMax'],

  calc(v) {
    const c = pqCore(v);
    if (!c) return { err: 'Anschnittfläche, Cd, v_max und Gießkraft müssen > 0 sein.' };
    const C = theme.chart;
    const { Ap, p0, Qmax, Ag, Cdie, Qs, Vag, pEnv, QtLo, QtHi, tVent } = c;
    const tb = this.tab;

    const tfOp = Vag / Qs * 1000;
    const tfPlot = 2.5 * Math.max(tfOp, v.tmax || 0) || 500;

    let fx, xl, Qlo = 0;
    if (tb === 'q') { fx = Q => Q * 1000; xl = 'Durchfluss Q in l/s'; }
    else if (tb === 'q2') { fx = Q => Q * Q * 1e6; xl = 'Q² in (l/s)² — Maschinenlinie wird Gerade'; }
    else if (tb === 'vp') { fx = Q => Q / Ap; xl = 'Kolbengeschwindigkeit v_p in m/s'; }
    else { fx = Q => Q > 0 ? Vag / Q * 1000 : Infinity; xl = 'Füllzeit ab Anschnitt t_f in ms (Bauteil + Überlauf)'; Qlo = Vag / (tfPlot / 1000); }

    const Qarr = seq(Math.max(Qlo, Qmax * 1e-4), Qmax, 160);
    if (tb === 'tf') Qarr.reverse();
    const x = Qarr.map(fx);

    const ys = [
      series('Maschine (Ø ' + fmt(v.diam) + ')', C.series1, Qarr, Q => p0 * (1 - (Q / Qmax) * (Q / Qmax))),
      series('Werkzeug', C.series2, Qarr, Q => Cdie * Q * Q)
    ];
    if (isFinite(QtLo) && isFinite(QtHi) && QtHi > QtLo)
      ys.push(series('MPE (alle Ø)', C.series4, Qarr, Q => (Q >= QtLo && Q <= QtHi) ? pEnv(Q) : NaN));

    const q = line(x, ys, xl, 'Metalldruck in bar',
      'Statisch ' + fmt(p0) + ' bar · Q_dry ' + fmt(Qmax * 1000) + ' l/s · Cd=' + fmt(v.Cd) + ' · MPE a = ' + fmt(c.aMPE / 1e6) + ' MW (Ø ' + fmt(v.dmin) + '–' + fmt(v.dmax) + ')');
    q.y0 = 0; q.y1 = p0 * 1.05;

    const xMinD = Math.min(x[0], x[x.length - 1]), xMaxD = Math.max(x[0], x[x.length - 1]);
    function band(qa, qb, c2, l) {
      let a = fx(Math.max(qa, 1e-9));
      let b = qb === null ? (tb === 'tf' ? xMinD : xMaxD) : fx(qb);
      if (qa <= 0) a = tb === 'tf' ? xMaxD : xMinD;
      let lo = Math.min(a, b), hi = Math.max(a, b);
      lo = Math.max(lo, xMinD); hi = Math.min(hi, xMaxD);
      if (hi > lo) return { x0: lo, x1: hi, c: c2, l };
    }
    q.vbands = [];
    let b;
    if (v.gateMin > 0 && Ag > 0) { b = band(0, v.gateMin * Ag, C.bandNoAtom, 'keine Zerstäubung'); if (b) q.vbands.push(b); }
    if (v.gateMax > 0 && Ag > 0) { b = band(v.gateMax * Ag, null, C.bandErosion, 'Erosionsrisiko'); if (b) q.vbands.push(b); }
    if (v.tmax > 0) { b = band(0, Vag / (v.tmax / 1000), C.bandSlow, 'Füllung zu langsam'); if (b) q.vbands.push(b); }

    /* Grenzlinien: v_a-Fenster, hydraulisches Limit (J), Entlüftungsbedingung (OW Zone C) */
    const cMin = (theme.mapLines && theme.mapLines.len) || '#7b5cd6';
    q.vlines = [];
    if (v.gateMin > 0 && Ag > 0) q.vlines.push({ x: fx(v.gateMin * Ag), l: 'v_a min ' + fmt(v.gateMin) + ' m/s', c: cMin });
    if (v.gateMax > 0 && Ag > 0) q.vlines.push({ x: fx(v.gateMax * Ag), l: 'v_a max ' + fmt(v.gateMax) + ' m/s', c: C.crit });
    if (c.vaHydr > 0) q.vlines.push({ x: fx(c.vaHydr * Ag), l: 'hydraul. Limit (J) ' + fmt(c.vaHydr) + ' m/s', c: C.limit });
    if (isFinite(tVent) && tVent > 0) q.vlines.push({ x: fx(Vag / tVent), l: 'Entlüftung: t_f ≥ ' + fmt(tVent * 1000) + ' ms', c: C.iso });

    const opx = fx(Qs);
    const unit = tb === 'q' ? ' l/s' : tb === 'q2' ? ' (l/s)²' : tb === 'vp' ? ' m/s' : ' ms';
    q.pt = [opx, Cdie * Qs * Qs];
    q.ptl = 'Arbeitspunkt ' + fmt(opx) + unit + ' / ' + fmt(Cdie * Qs * Qs) + ' bar';
    return q;
  },

  /* Mathe-Erklärung nach Pego Guerra (1997), Kap. 2–3. Live-Werte via data-m. */
  mathHTML() {
    return `
<p class="math-note"><b>Quelle:</b> M. A. Pego Guerra, <i>Die Casting Design. A Parametric Approach</i>,
Carleton University, 1997, Kap. 2–3 — dort nach CSIRO (P–Q², 1977) und Karni (Machine Performance
Envelope). Gleichungsnummern unten beziehen sich auf diese Arbeit.</p>

<h4>1 · Grundgrößen</h4>
<div class="eq">A<sub>K</sub> = ${frac('π · D²', '4')}&emsp;·&emsp;p₀ = ${frac('F<sub>G</sub>', 'A<sub>K</sub>')} = P<sub>acc</sub> · ${frac('A<sub>h</sub>', 'A<sub>K</sub>')}&emsp;·&emsp;Q<sub>dry</sub> = A<sub>K</sub> · v<sub>dry</sub>&emsp;·&emsp;V<sub>a</sub> = ${frac('m<sub>Bauteil</sub> + m<sub>Überlauf</sub>', 'ρ')}</div>
<p class="math-note">Die Gießkraft F<sub>G</sub> = P<sub>acc</sub>·A<sub>h</sub> stammt aus Akkumulatordruck × Antriebskolbenfläche;
v<sub>dry</sub> ist die <b>Trockenschuss-Geschwindigkeit</b> (Kolben ohne Metall, alle Verluste im Schusskreis) —
unser Eingabefeld „Kolbengeschw. max.". Aktuell: A<sub>K</sub> = <b data-m="AK"></b> · p₀ = <b data-m="p0"></b> ·
Q<sub>dry</sub> = <b data-m="Qmax"></b> · V<sub>a</sub> = <b data-m="Va"></b></p>

<h4>2 · Werkzeuglinie (Die Line) — Gl. 2.3/2.5</h4>
<p class="math-note">Energieerhaltung (Bernoulli) vom Kolben bis zum Anschnitt, Kavitätsdruck ≈ 0 bei
funktionierender Entlüftung. Alle Verluste stecken im zusammengesetzten Durchflussbeiwert:</p>
<div class="eq">P = C<sub>t</sub> · v<sub>a</sub>²&emsp;(2.3)&emsp;⇒&emsp;mit v<sub>a</sub> = Q/A<sub>a</sub>:&emsp;P<sub>W</sub>(Q) = ${frac('C<sub>t</sub>', 'A<sub>a</sub>²')} · Q²&emsp;(2.5)&emsp;mit&emsp;C<sub>t</sub> = ${frac('ρ', '2 · C<sub>d</sub>²')}</div>
<p class="math-note">C<sub>d</sub> ≈ 0,5 für Aluminium, 0,5–0,6 für Zink; C<sub>t</sub> misst die Effizienz des
Lauf-/Anschnittsystems und wird in der Praxis aus Messungen bestimmt. Steigung der Geraden im Q²-Modus:
C<sub>W</sub> = C<sub>t</sub>/A<sub>a</sub>². Aktuell: C<sub>W</sub> = <b data-m="CW"></b></p>

<h4>3 · Maschinenlinie — Gl. 2.6–2.9</h4>
<p class="math-note">Hydraulikseite: P<sub>h</sub> = P<sub>acc</sub> − K<sub>v</sub>·v² (2.6); Kräftegleichgewicht am
Kolben P = P<sub>h</sub>·A<sub>h</sub>/A<sub>K</sub> (2.7). Mit v = Q/A<sub>K</sub> folgt die Karni-Form und daraus die
von CSIRO experimentell bestätigte Form über die Trockenschuss-Geschwindigkeit:</p>
<div class="eq">P<sub>M</sub>(Q) = P<sub>acc</sub> · ${frac('A<sub>h</sub>', 'A<sub>K</sub>')} − K<sub>t</sub> · Q²&emsp;(2.8)&emsp;⇔&emsp;P<sub>M</sub>(Q) = p₀ · ( 1 − ${frac('Q²', 'Q<sub>dry</sub>²')} )&emsp;(2.9)</div>
<p class="math-note">Nullstellen: Q = 0 → voller statischer Druck p₀; Q = Q<sub>dry</sub> → alle Leistung geht in
die Kolbenbewegung, kein Druck aufs Metall. Im Q²-Modus eine Gerade mit Steigung −p₀/Q<sub>dry</sub>².</p>

<h4>4 · Machine Performance Envelope (Hüllkurve) — Gl. 2.10–2.14</h4>
<p class="math-note">Jeder Kolben-Ø liefert eine eigene Maschinenlinie. Die MPE ist die Einhüllende aller
dieser Linien — <b>Herleitung A (Karni, physikalisch)</b>: Die Leistung des Akkumulators ist näherungsweise
konstant, Power = P·A<sub>K</sub>·v = P<sub>acc</sub>·A<sub>h</sub>·v ≈ const (2.10–2.12) — eine Hyperbel P·Q = const:</p>
<div class="eq">P<sub>env</sub>(Q) = ${frac('a', 'Q')}&emsp;(2.13)&emsp;mit&emsp;a = ${frac('2·√3', '9')} · A<sub>h</sub> · P<sub>acc</sub> · v<sub>dry</sub> = ${frac('2·√3', '9')} · F<sub>G</sub> · v<sub>dry</sub>&emsp;(2.14)</div>
<p class="math-note"><b>Herleitung B (formal)</b>: p<sub>M</sub>(Q; A<sub>K</sub>) = F<sub>G</sub>/A<sub>K</sub> − F<sub>G</sub>·Q²/(A<sub>K</sub>³·v<sub>dry</sub>²)
nach dem Scharparameter A<sub>K</sub> maximieren: ∂p/∂A<sub>K</sub> = 0 ⇒ A<sub>K,opt</sub>(Q) = √3·Q/v<sub>dry</sub>;
Einsetzen liefert dieselbe Hyperbel. Jede Kolbenparabel berührt die MPE genau einmal — bei
v<sub>p</sub> = v<sub>dry</sub>/√3 ≈ 0,577·v<sub>dry</sub> und P = ⅔·p₀(D). Die MPE ist eine reine
Maschineneigenschaft (unabhängig von Kolben und Werkzeug); a hat die Dimension einer Leistung — die
Energie, die der Akkumulator während der Einspritzphase an die Schmelze abgibt.</p>
<p class="math-note">Gezeichnet zwischen den Berührpunkten Q<sub>t</sub> = A<sub>K</sub>·v<sub>dry</sub>/√3 von
Ø<sub>min</sub> und Ø<sub>max</sub>; außerhalb gilt die Parabel des Grenz-Kolbens. Aktuell:
a = <b data-m="aMPE"></b> · gültig für Q = <b data-m="Qt"></b> · Berührpunkt aktueller Kolben bei
<b data-m="Qtcur"></b> · optimaler Kolben-Ø am Arbeitspunkt: <b data-m="Dopt"></b></p>

<h4>5 · Arbeitspunkt — Gl. 2.15/2.16</h4>
<p class="math-note">Schnittpunkt Maschinen- × Werkzeuglinie. Mit der MPE-Konstante a lässt sich die
Maschinenlinie äquivalent schreiben und der Arbeitspunkt lösen:</p>
<div class="eq">P<sub>M</sub> = p₀ · ( 1 − ${frac('4', '27')} · ${frac('p₀² · Q²', 'a²')} )&emsp;(2.15)&emsp;⇒&emsp;Q<sub>s</sub>² = ${frac('p₀', 'C<sub>t</sub>/A<sub>a</sub>² + (4/27) · p₀²/a²')}&emsp;(2.16)</div>
<div class="eq">gleichwertig:&emsp;Q<sub>s</sub> = ${sqrt(frac('p₀', 'C<sub>W</sub> + p₀ / Q<sub>dry</sub>²'), true)}&emsp;&emsp;p<sub>s</sub> = C<sub>W</sub> · Q<sub>s</sub>²</div>
<p class="math-note">Aktuell: Q<sub>s</sub> = <b data-m="Qs"></b> · p<sub>s</sub> = <b data-m="ps"></b></p>

<h4>6 · Achsenmodi und Operational Window — Gl. 3.1–3.3</h4>
<p class="math-note">Die Druckachse lässt sich in Anschnittgeschwindigkeit übersetzen, die
Volumenstromachse in Füllzeit — dieselben zwei Linien in vier Koordinaten:</p>
<div class="eq">v<sub>a</sub>(P) = C<sub>d</sub> · ${sqrt(frac('2 · P', 'ρ'), true)}&emsp;(3.1)&emsp;·&emsp;v<sub>p</sub> = ${frac('Q', 'A<sub>K</sub>')}&emsp;·&emsp;t<sub>f</sub> = ${frac('V<sub>a</sub>', 'Q')}&emsp;(3.3)</div>
<p class="math-note">Das <b>Operational Window</b> ist das Rechteck [t<sub>f,min</sub>, t<sub>f,max</sub>] ×
[v<sub>a,min</sub>, v<sub>a,max</sub>]. Verletzungsfolgen (Fig. 3.1/3.2): über t<sub>f,max</sub> (Zone A) kalte
Läufe und schlechte Oberflächen, unter v<sub>a,min</sub> (B) poröser Guss (keine Zerstäubung), unter
t<sub>f,min</sub> (C) unvollständige Entlüftung, über v<sub>a,max</sub> (D) Formerosion und Kleben.
Aktuell am Arbeitspunkt: v<sub>p</sub> = <b data-m="vp"></b> · v<sub>a</sub> = <b data-m="va"></b> ·
t<sub>f</sub> = <b data-m="tf"></b></p>

<h4>7 · Füllzeit- und v_a-Grenzen</h4>
<p class="math-note">Untergrenzen der Füllzeit aus drei unabhängigen Bedingungen; die schärfste gilt:</p>
<div class="eq">Entlüftung (Zone C):&ensp;t<sub>f</sub> ≥ t<sub>vent</sub> = ${frac('V<sub>luft</sub>', 'A<sub>ent</sub> · v<sub>luft,max</sub>')}&emsp;·&emsp;Erosion:&ensp;t<sub>f</sub> ≥ ${frac('V<sub>a</sub>', 'A<sub>a</sub> · v<sub>a,max</sub>')}&emsp;·&emsp;Hydraulik (J = C<sub>d</sub>):&ensp;t<sub>f</sub> ≥ ${frac('V<sub>a</sub>', 'A<sub>a</sub> · v<sub>a,hydr</sub>')}&ensp;mit&ensp;v<sub>a,hydr</sub> = J · ${sqrt(frac('2 · p₀', 'ρ'), true)}</div>
<div class="eq">Obergrenzen:&ensp;t<sub>f</sub> ≤ ${frac('V<sub>a</sub>', 'A<sub>a</sub> · v<sub>a,min</sub>')}&ensp;(Zerstäubung)&emsp;und&emsp;t<sub>f</sub> ≤ t<sub>max</sub>&ensp;(thermisch — NADCA-Formel, siehe „Empfohlene Füllzeit")</div>
<p class="math-note">Aktuell: t<sub>vent</sub> = <b data-m="tVent"></b> · t<sub>min,Erosion</sub> = <b data-m="tminE"></b> ·
t<sub>min,J</sub> = <b data-m="tminJ"></b> (v<sub>a,hydr</sub> = <b data-m="vah"></b>) ·
t<sub>max,Zerstäubung</sub> = <b data-m="tmaxZ"></b> · Arbeitspunkt t<sub>f</sub> = <b data-m="tf2"></b></p>

<h4>8 · Extremwerte der Anschnittfläche — Kap. 3.3</h4>
<p class="math-note">Werkzeuglinien durch die Ecken des Operational Window liefern die zulässige Spanne der
Anschnittfläche (Fig. 3.3): steilste Linie durch (t<sub>f,max</sub>, v<sub>a,max</sub>), flachste durch
(t<sub>f,min</sub>, v<sub>a,min</sub>):</p>
<div class="eq">A<sub>a,min</sub> = ${frac('V<sub>a</sub>', 't<sub>f,max</sub> · v<sub>a,max</sub>')}&emsp;&emsp;A<sub>a,max</sub> = ${frac('V<sub>a</sub>', 't<sub>f,min</sub> · v<sub>a,min</sub>')}&emsp;mit&ensp;t<sub>f,min</sub> = max(t<sub>vent</sub>, t<sub>min,J</sub>)</div>
<p class="math-note">Die Länge der Werkzeuglinie innerhalb von Fenster und MPE ist nach Karni ein Maß für die
<b>Flexibilität</b> der Auslegung. Aktuell: zulässige Spanne <b data-m="AgRange"></b> · gewählt
A<sub>a</sub> = <b data-m="AgSel"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const c = pqCore(v);
    if (!c) {
      ['AK', 'p0', 'Qmax', 'Va', 'CW', 'Qs', 'ps', 'vp', 'va', 'tf', 'tf2', 'Qt', 'Qtcur', 'Dopt', 'aMPE',
        'vah', 'tminJ', 'tminE', 'tmaxZ', 'tVent', 'AgRange', 'AgSel'].forEach(k => set(k, '—'));
      return;
    }
    set('AK', fmt(pistonArea(v)) + ' mm²');
    set('p0', fmt(c.p0) + ' bar');
    set('Qmax', fmt(c.Qmax * 1000) + ' l/s');
    set('Va', fmt(c.Vag * 1e6) + ' cm³');
    const cw = c.Cdie / 1e6;
    set('CW', Number(cw.toPrecision(3)).toLocaleString('de-DE', { maximumFractionDigits: 6 }) + ' bar/(l/s)²');
    set('Qs', fmt(c.Qs * 1000) + ' l/s');
    set('ps', fmt(c.ps) + ' bar');
    set('vp', fmt(c.Qs / c.Ap) + ' m/s');
    set('va', fmt(c.Qs / c.Ag) + ' m/s');
    const tf = c.Vag / c.Qs * 1000;
    set('tf', fmt(tf) + ' ms');
    set('tf2', fmt(tf) + ' ms');
    /* MPE */
    set('aMPE', fmt(c.aMPE / 1e6) + ' MW');
    set('Qt', fmt(c.QtLo * 1000) + '–' + fmt(c.QtHi * 1000) + ' l/s (Ø ' + fmt(v.dmin) + '–' + fmt(v.dmax) + ')');
    set('Qtcur', fmt(c.Ap * v.vmax / S3 * 1000) + ' l/s (v_p = ' + fmt(v.vmax / S3) + ' m/s, P = ' + fmt(2 * c.p0 / 3) + ' bar)');
    const Dopt = Math.sqrt(4 * S3 * c.Qs / (PI * v.vmax)) * 1000;
    set('Dopt', 'Ø ' + fmt(Dopt) + ' mm (A_opt = √3·Q_s/v_dry)');
    /* Füllzeitgrenzen */
    set('vah', fmt(c.vaHydr) + ' m/s');
    const tminJ = c.Vag / (c.Ag * c.vaHydr) * 1000;
    set('tminJ', fmt(tminJ) + ' ms');
    set('tminE', v.gateMax > 0 ? fmt(c.Vag / (c.Ag * v.gateMax) * 1000) + ' ms' : '—');
    set('tmaxZ', v.gateMin > 0 ? fmt(c.Vag / (c.Ag * v.gateMin) * 1000) + ' ms' : '—');
    set('tVent', isFinite(c.tVent) ? fmt(c.tVent * 1000) + ' ms' : '—');
    /* Extremwerte der Anschnittfläche */
    const tfMinS = Math.max(isFinite(c.tVent) ? c.tVent : 0, tminJ / 1000);
    const tfMaxS = v.tmax > 0 ? v.tmax / 1000 : NaN;
    if (tfMaxS > 0 && tfMinS > 0 && v.gateMin > 0 && v.gateMax > 0) {
      const AgMin = c.Vag / (tfMaxS * v.gateMax) * 1e6;
      const AgMax = c.Vag / (tfMinS * v.gateMin) * 1e6;
      const ok = v.gate >= AgMin && v.gate <= AgMax;
      set('AgRange', fmt(AgMin) + '–' + fmt(AgMax) + ' mm²');
      set('AgSel', fmt(v.gate) + ' mm² ' + (ok ? '✓ innerhalb' : '✗ außerhalb'));
    } else {
      set('AgRange', '—'); set('AgSel', fmt(v.gate) + ' mm²');
    }
  }
};

});
__define('js/charts/phild.js', function (exports, __require) {
/* (φ, L/D)-Auslegungsfenster: Machbarkeit der Füllkammer bei fester Dosiermenge.

   Geometrische Formulierung: Bei festem Dosiervolumen V legt jeder Punkt
   (φ, r = L/D) genau eine Kammer fest:
     D(φ, r) = ∛(4V / (π·φ·r)),   L(φ, r) = ∛(4V·r² / (π·φ))
   Jede Grenze (Ø-Bereich, Längenbereich, Pressrest, v_krit) ist eine monotone
   Schranke r(φ) — das machbare Gebiet ist das Band r_lo(φ) ≤ r ≤ r_hi(φ)
   und wird als ein geschlossenes Polygon gefüllt statt pixelweise. */

const { seq, fmt } = __require('js/core/format.js');
const { total } = __require('js/core/physics.js');
const { frac, sqrt, cbrt } = __require('js/charts/mathfmt.js');
const PI = Math.PI, GRAV = 9.81;
const R_MIN = 1, R_MAX = 12;

/* Nogowizin-Faktor f(φ) der kritischen Geschwindigkeit. */
function fPhi(phi) { return 1.386 - 1.915 * phi + 0.615 * phi * phi; }

exports.default = {
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

});
__define('js/charts/area.js', function (exports, __require) {
/* Zulässige Sprengfläche über Druck. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const { frac } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'area',
  title: 'Zulässige Sprengfläche',
  desc: 'Maschinenkraft und Druck',
  inputs: ['force', 'safety', 'pmin', 'pmax', 'psel', 'area'],

  calc(v) {
    const C = theme.chart;
    const x = seq(v.pmin, v.pmax, 140);
    const q = line(x, [
      series('S=1,00', C.series1, x, p => 0.01 * v.force / p),
      series('S=' + fmt(v.safety), C.series2, x, p => 0.01 * v.force / (v.safety * p))
    ], 'Druck in bar', 'Max. Sprengfläche m²', 'Kraft ' + fmt(v.force) + ' kN · S=' + fmt(v.safety));
    q.pt = [v.psel, v.area];
    q.ptl = 'Auslegung: ' + fmt(v.psel) + ' bar / ' + fmt(v.area) + ' m²';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Kräftegleichgewicht an der Form</h4>
<p class="math-note">Der Metalldruck p wirkt auf die projizierte Fläche der Kavität in Öffnungsrichtung
(Sprengfläche A) und versucht, die Form aufzudrücken. Die Schließkraft muss mit Sicherheitsfaktor S
dagegenhalten:</p>
<div class="eq">F<sub>auf</sub> = p · A&emsp;&emsp;F<sub>schließ</sub> ≥ S · p · A</div>

<h4>2 · Zulässige Sprengfläche</h4>
<div class="eq">A<sub>max</sub>(p) = ${frac('F<sub>schließ</sub>', 'S · p')}&emsp;&emsp;in Einheiten: A [m²] = ${frac('F [kN]', '100 · S · p [bar]')}&ensp;(1 bar = 100 kN/m²)</div>
<p class="math-note">Aktuell bei p = <b data-m="psel"></b>: A<sub>max</sub>(S = 1) = <b data-m="a1"></b> ·
A<sub>max</sub>(S = <span data-m="S"></span>) = <b data-m="aS"></b> · gewählt: A = <b data-m="asel"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    set('psel', fmt(v.psel) + ' bar');
    set('S', fmt(v.safety));
    set('a1', v.psel > 0 ? fmt(0.01 * v.force / v.psel) + ' m²' : '—');
    set('aS', v.psel > 0 && v.safety > 0 ? fmt(0.01 * v.force / (v.safety * v.psel)) + ' m²' : '—');
    set('asel', fmt(v.area) + ' m²');
  }
};

});
__define('js/charts/machine.js', function (exports, __require) {
/* Erforderliche Maschinengröße (Kraftbedarf über Druck). */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const { frac } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'machine',
  title: 'Erforderliche Maschinengröße',
  desc: 'Kraftbedarf über Druck',
  inputs: ['area', 'safety', 'pmin', 'pmax', 'psel', 'force'],

  calc(v) {
    const C = theme.chart;
    const x = seq(v.pmin, v.pmax, 140);
    const q = line(x, [
      series('S=1,00', C.series1, x, p => v.area * p / 0.01),
      series('S=' + fmt(v.safety), C.series2, x, p => v.area * v.safety * p / 0.01)
    ], 'Druck in bar', 'Maschinengröße kN', 'Fläche ' + fmt(v.area) + ' m² · S=' + fmt(v.safety));
    q.pt = [v.psel, v.area * v.safety * v.psel / 0.01];
    q.ptl = 'Bedarf: ' + fmt(v.area * v.safety * v.psel / 0.01) + ' kN';
    q.href = v.force;
    q.hrefl = 'Verfügbar ' + fmt(v.force) + ' kN';
    return q;
  },

  mathHTML() {
    return `
<h4>Erforderliche Schließkraft</h4>
<p class="math-note">Umkehrung der Sprengflächen-Beziehung: bei gegebener Sprengfläche A und Auslegungsdruck p
muss die Maschine mindestens aufbringen:</p>
<div class="eq">F<sub>erf</sub>(p) = S · p · A · 100&emsp;(F in kN, p in bar, A in m² — 1 bar = 100 kN/m²)</div>
<p class="math-note">Die beiden Kurven zeigen S = 1 (physikalisches Minimum) und den gewählten
Sicherheitsfaktor; die gestrichelte Linie ist die verfügbare Maschinenkraft. Umstellung nach A liefert das
Diagramm „Zulässige Sprengfläche": A<sub>max</sub> = ${frac('F<sub>schließ</sub>', '100 · S · p')}.</p>
<p class="math-note">Aktuell bei p = <b data-m="psel"></b>: F<sub>erf</sub> = <b data-m="freq"></b> ·
verfügbar = <b data-m="favail"></b> · Auslastung = <b data-m="util"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const freq = v.area * v.safety * v.psel * 100;
    set('psel', fmt(v.psel) + ' bar');
    set('freq', fmt(freq) + ' kN');
    set('favail', fmt(v.force) + ' kN');
    set('util', v.force > 0 ? fmt(100 * freq / v.force) + ' %' : '—');
  }
};

});
__define('js/charts/clamp.js', function (exports, __require) {
/* Zuhaltungs-Rechner: maximal möglicher Nachdruck bei außermittigem
   Schwerpunkt der Sprengfläche. Modell: starre Aufspannplatte auf vier
   Säulen im Abstand a_x × a_y, lineare Lastverteilung (Hebelgesetz) —
   die meistbelastete Säule begrenzt den zulässigen Metalldruck. */

const { heat } = __require('js/charts/helpers.js');
const { fmt } = __require('js/core/format.js');
const { frac } = __require('js/charts/mathfmt.js');
/* Hebelfaktor k: Mehrbelastung der meistbelasteten Säule gegenüber zentrischem Angriff. */
function leverK(v, ex, ey) {
  return 1 + 2 * Math.abs(ex) / v.tieX + 2 * Math.abs(ey) / v.tieY;
}

/* Max. Nachdruck [bar] bei Außermittigkeit (ex, ey): F in kN, A in m² → Faktor 100. */
function pMax(v, ex, ey) {
  return v.force / (100 * v.area * v.safety * leverK(v, ex, ey));
}

/* Größte „runde" Stufe ≤ x (für Konturlevels). */
function niceStep(x) {
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  for (const s of [10, 5, 2.5, 2, 1]) if (s * mag <= x) return s * mag;
  return mag;
}

exports.default = {
  id: 'clamp',
  title: 'Max. Nachdruck (Zuhaltung)',
  desc: 'Säulenlast bei außermittigem Schwerpunkt',
  heat: true,
  inputs: ['force', 'area', 'safety', 'psel', 'tieX', 'tieY', 'eccX', 'eccY'],

  calc(v) {
    if (!(v.force > 0) || !(v.area > 0) || !(v.safety > 0) || !(v.tieX > 0) || !(v.tieY > 0))
      return { err: 'Maschinenkraft, Sprengfläche, Sicherheitsfaktor und Säulenabstände müssen > 0 sein.' };
    const exMax = v.tieX / 4, eyMax = v.tieY / 4;
    const hi = pMax(v, 0, 0);            // zentrisch (k = 1)
    const lo = pMax(v, exMax, eyMax);    // Ecke des Plots (k = 2)
    const step = niceStep((hi - lo) / 5);
    const levels = [];
    for (let L = Math.ceil(lo / step) * step; L < hi - 1e-9; L += step) levels.push(Number(L.toFixed(2)));

    const q = heat(0, exMax, 0, eyMax, (ex, ey) => pMax(v, ex, ey),
      'Außermittigkeit e_x mm', 'Außermittigkeit e_y mm', 'Max. Nachdruck bar', lo, hi, levels);
    const p = pMax(v, v.eccX, v.eccY);
    q.pt = [Math.abs(v.eccX), Math.abs(v.eccY)];
    q.ptl = 'e = (' + fmt(v.eccX) + ', ' + fmt(v.eccY) + ') mm → ' + fmt(p) + ' bar';
    q.info = 'F_s ' + fmt(v.force) + ' kN · Säulen ' + fmt(v.tieX) + ' × ' + fmt(v.tieY) + ' mm · S = ' + fmt(v.safety) + ' · zentrisch ' + fmt(hi) + ' bar';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Säulenlastverteilung (Hebelgesetz)</h4>
<p class="math-note">Die Aufdrückkraft F<sub>auf</sub> = p · A greift im Schwerpunkt der Sprengfläche an.
Liegt er um (e<sub>x</sub>, e<sub>y</sub>) außerhalb der Säulenmitte, verteilt sich die Last ungleich auf die
vier Säulen (Abstand a<sub>x</sub> × a<sub>y</sub>; starre Platte, lineare Verteilung):</p>
<div class="eq">F<sub>i</sub> = F<sub>auf</sub> · ( ¼ ± ${frac('e<sub>x</sub>', '2 · a<sub>x</sub>')} ± ${frac('e<sub>y</sub>', '2 · a<sub>y</sub>')} )</div>
<div class="eq">F<sub>Säule,max</sub> = ${frac('F<sub>auf</sub>', '4')} · k&emsp;mit&emsp;k = 1 + ${frac('2 · e<sub>x</sub>', 'a<sub>x</sub>')} + ${frac('2 · e<sub>y</sub>', 'a<sub>y</sub>')}</div>
<p class="math-note">Aktuell: k = <b data-m="k"></b> — die meistbelastete Säule trägt das k-fache einer
zentrisch belasteten Säule.</p>

<h4>2 · Zulässige Aufdrückkraft und maximaler Nachdruck</h4>
<p class="math-note">Jede Säule trägt nominell F<sub>s</sub>/4. Mit Sicherheitsfaktor S muss die
meistbelastete Säule darunter bleiben:</p>
<div class="eq">S · ${frac('F<sub>auf</sub>', '4')} · k ≤ ${frac('F<sub>s</sub>', '4')}&emsp;⇔&emsp;F<sub>auf,max</sub> = ${frac('F<sub>s</sub>', 'S · k')}</div>
<div class="eq">p<sub>max</sub> = ${frac('F<sub>auf,max</sub>', 'A')} = ${frac('F<sub>s</sub>', '100 · S · k · A')}&emsp;(p in bar, F in kN, A in m²)</div>
<p class="math-note">Bei e = 0 ist k = 1 — dann ist p<sub>max</sub> exakt die Beziehung aus „Zulässige
Sprengfläche" / „Erforderliche Maschinengröße". Aktuell: F<sub>auf,max</sub> = <b data-m="Fmax"></b> ·
p<sub>max</sub> = <b data-m="pmax"></b> ⇒ <b data-m="cmp"></b></p>

<h4>3 · Umkehrung und Abhebe-Prüfung</h4>
<div class="eq">A<sub>max</sub>(p) = ${frac('F<sub>s</sub>', '100 · S · k · p')}&emsp;(zulässige Sprengfläche bei Druck p)</div>
<div class="eq">Abheben, wenn&ensp;m = ${frac('2 · e<sub>x</sub>', 'a<sub>x</sub>')} + ${frac('2 · e<sub>y</sub>', 'a<sub>y</sub>')} ≥ 1&emsp;(F<sub>Säule,min</sub> ≤ 0 — die Form klafft an der gegenüberliegenden Ecke)</div>
<p class="math-note">Aktuell bei p = p<sub>sel</sub> = <span data-m="psel"></span>:
A<sub>max</sub> = <b data-m="Amax"></b> · Säulenkräfte max/min = <b data-m="Fs1"></b> / <b data-m="Fs4"></b> ·
m = <b data-m="m"></b> ⇒ <b data-m="lift"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    if (!(v.force > 0) || !(v.area > 0) || !(v.safety > 0) || !(v.tieX > 0) || !(v.tieY > 0)) {
      ['k', 'Fmax', 'pmax', 'cmp', 'psel', 'Amax', 'Fs1', 'Fs4', 'm', 'lift'].forEach(x => set(x, '—'));
      return;
    }
    const k = leverK(v, v.eccX, v.eccY);
    const m = k - 1;
    const pmax = pMax(v, v.eccX, v.eccY);
    const Fauf = 100 * v.area * v.psel;
    set('k', fmt(k));
    set('Fmax', fmt(v.force / (v.safety * k)) + ' kN');
    set('pmax', fmt(pmax) + ' bar');
    set('cmp', v.psel <= pmax
      ? '✓ p<sub>sel</sub> = ' + fmt(v.psel) + ' bar ≤ p<sub>max</sub>'
      : '✗ p<sub>sel</sub> = ' + fmt(v.psel) + ' bar > p<sub>max</sub> — Nachdruck reduzieren, zentrieren oder größere Maschine');
    set('psel', fmt(v.psel) + ' bar');
    set('Amax', v.psel > 0 ? fmt(v.force / (100 * v.safety * k * v.psel)) + ' m²' : '—');
    set('Fs1', fmt(Fauf / 4 * (1 + m)) + ' kN');
    set('Fs4', fmt(Fauf / 4 * (1 - m)) + ' kN');
    set('m', fmt(m));
    set('lift', m >= 1 ? '✗ Abheben — Schwerpunkt zu weit außermittig' : '✓ kein Abheben');
  }
};

});
__define('js/charts/filltime.js', function (exports, __require) {
/* Füllzeit ab Anschnitt (Heatmap: Füllzeit × Kolben-Ø → Kolbengeschwindigkeit). */

const { heat } = __require('js/charts/helpers.js');
const { fmt } = __require('js/core/format.js');
const { afterGate } = __require('js/core/physics.js');
const { frac } = __require('js/charts/mathfmt.js');
const PI = Math.PI;

exports.default = {
  id: 'filltime',
  title: 'Füllzeit ab Anschnitt',
  desc: 'Bauteil + Überlauf',
  heat: true,
  inputs: ['tmax', 'dmin', 'dmax', 'part', 'overflow', 'density', 'vsel', 'diam'],

  calc(v) {
    const q = heat(0.1, v.tmax, v.dmin, v.dmax,
      (t, d) => 1e9 * (afterGate(v) / v.density) / (t * 0.25 * PI * d * d),
      'Füllzeit ms', 'Kolben-Ø mm', 'Kolbengeschwindigkeit m/s', 1, 8, [1, 2, 3, 4, 5, 6, 7, 8]);
    q.info = 'Ab Anschnitt ' + fmt(afterGate(v)) + ' kg · Bauteil + Überlauf';
    const tOp = 1e9 * (afterGate(v) / v.density) / (v.vsel * 0.25 * PI * v.diam * v.diam);
    q.pt = [tOp, v.diam];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm · ' + fmt(v.vsel) + ' m/s → ' + fmt(tOp) + ' ms';
    return q;
  },

  mathHTML() {
    return `
<h4>Füllzeit, Kolben-Ø und Kolbengeschwindigkeit</h4>
<p class="math-note">Kontinuität: das Volumen ab Anschnitt V<sub>a</sub> (Bauteil + Überlauf, ohne Anguss und
Pressrest) muss in der Füllzeit t<sub>f</sub> vom Kolben gefördert werden:</p>
<div class="eq">V<sub>a</sub> = ${frac('m<sub>Bauteil</sub> + m<sub>Überlauf</sub>', 'ρ')}&emsp;&emsp;Q = ${frac('V<sub>a</sub>', 't<sub>f</sub>')} = A<sub>K</sub> · v<sub>p</sub></div>
<div class="eq">⇒&emsp;v<sub>p</sub>(t<sub>f</sub>, D) = ${frac('V<sub>a</sub>', 't<sub>f</sub> · A<sub>K</sub>')} = ${frac('4 · V<sub>a</sub>', 't<sub>f</sub> · π · D²')}</div>
<p class="math-note">Die Heatmap zeigt v<sub>p</sub> über (t<sub>f</sub>, D); die weißen Konturen sind Linien
konstanter Kolbengeschwindigkeit. Aktuell: V<sub>a</sub> = <b data-m="Va"></b> · bei Ø <span data-m="D"></span>
und v<sub>p</sub> = <span data-m="vsel"></span>: t<sub>f</sub> = <b data-m="tf"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const Va = afterGate(v) / v.density;
    set('Va', fmt(Va * 1e6) + ' cm³');
    set('D', fmt(v.diam) + ' mm');
    set('vsel', fmt(v.vsel) + ' m/s');
    const tf = 1e9 * Va / (v.vsel * 0.25 * PI * v.diam * v.diam);
    set('tf', isFinite(tf) ? fmt(tf) + ' ms' : '—');
  }
};

});
__define('js/charts/fill.js', function (exports, __require) {
/* Füllgrad der Füllkammer (Heatmap: Kammerlänge × Kolben-Ø → Füllgrad). */

const { heat } = __require('js/charts/helpers.js');
const { fmt } = __require('js/core/format.js');
const { total } = __require('js/core/physics.js');
const { frac } = __require('js/charts/mathfmt.js');
const PI = Math.PI;

exports.default = {
  id: 'fill',
  title: 'Füllgrad der Füllkammer',
  desc: 'Dosiergewicht inkl. Pressrest',
  heat: true,
  inputs: ['lmin', 'lmax', 'dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'diam'],

  calc(v) {
    const q = heat(v.lmin, v.lmax, v.dmin, v.dmax,
      (L, d) => 100e9 * ((total(v) + v.biscuit) / v.density) / (L * 0.25 * PI * d * d),
      'Kammerlänge mm', 'Kolben-Ø mm', 'Füllgrad %', 0, 100, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    q.info = 'Dosiergewicht ' + fmt(total(v) + v.biscuit) + ' kg (inkl. Pressrest)';
    q.pt = [v.length, v.diam];
    q.ptl = 'Kammer ' + fmt(v.length) + ' mm · Ø ' + fmt(v.diam) + ' mm';
    return q;
  },

  mathHTML() {
    return `
<h4>Füllgrad der Füllkammer</h4>
<p class="math-note">Das Dosiervolumen (inkl. Pressrest — siehe Konvention in der Seitenleiste) im Verhältnis
zum Kammervolumen:</p>
<div class="eq">V<sub>dos</sub> = ${frac('m<sub>Bauteil</sub> + m<sub>Anguss</sub> + m<sub>Überlauf</sub> + m<sub>Pressrest</sub>', 'ρ')}</div>
<div class="eq">φ(L, D) = ${frac('V<sub>dos</sub>', 'A<sub>K</sub> · L')} · 100 % = ${frac('4 · V<sub>dos</sub>', 'π · D² · L')} · 100 %</div>
<p class="math-note">Die Heatmap zeigt φ über (L, D); niedriger Füllgrad heißt viel Luft in der Kammer,
hoher Füllgrad wenig Reserve für die 1. Phase. Aktuell: V<sub>dos</sub> = <b data-m="Vdos"></b> ·
φ(Ø <span data-m="D"></span>, L <span data-m="L"></span>) = <b data-m="phi"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const Vdos = (total(v) + v.biscuit) / v.density;
    set('Vdos', fmt(Vdos * 1e6) + ' cm³');
    set('D', fmt(v.diam) + ' mm');
    set('L', fmt(v.length) + ' mm');
    const phi = 100e9 * Vdos / (v.length * 0.25 * PI * v.diam * v.diam);
    set('phi', isFinite(phi) ? fmt(phi) + ' %' : '—');
  }
};

});
__define('js/charts/vent.js', function (exports, __require) {
/* Entlüftungsgeschwindigkeit über Kolbengeschwindigkeit. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { pistonArea } = __require('js/core/physics.js');
const { theme } = __require('js/core/theme.js');
const { frac } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'vent',
  title: 'Entlüftungsgeschwindigkeit',
  desc: 'Querschnittsverhältnis',
  inputs: ['vmin', 'vmax', 'diam', 'vent', 'vsel'],

  calc(v) {
    const A = pistonArea(v);
    const x = seq(v.vmin, v.vmax, 140);
    const q = line(x, [series('Entlüftung', theme.chart.series1, x, s => s * A / v.vent)],
      'Kolbengeschwindigkeit m/s', 'Entlüftungsgeschwindigkeit m/s',
      'Ø ' + fmt(v.diam) + ' mm · Entlüftung ' + fmt(v.vent) + ' mm²');
    q.pt = [v.vsel, v.vsel * A / v.vent];
    q.ptl = fmt(v.vsel) + ' m/s → ' + fmt(v.vsel * A / v.vent) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Entlüftungsgeschwindigkeit</h4>
<p class="math-note">Kontinuität: die vom Kolben verdrängte Luft muss durch die Entlüftungsfläche
A<sub>ent</sub> entweichen — je kleiner die Fläche im Verhältnis zur Kolbenfläche, desto schneller die
Luftströmung:</p>
<div class="eq">v<sub>ent</sub> = v<sub>p</sub> · ${frac('A<sub>K</sub>', 'A<sub>ent</sub>')}</div>
<p class="math-note">Aktuell: A<sub>K</sub> = <b data-m="AK"></b> · Übersetzung A<sub>K</sub>/A<sub>ent</sub> = <b data-m="ratio"></b> ·
bei v<sub>p</sub> = <span data-m="vsel"></span>: v<sub>ent</sub> = <b data-m="vent"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const A = pistonArea(v);
    set('AK', fmt(A) + ' mm²');
    set('ratio', v.vent > 0 ? fmt(A / v.vent) : '—');
    set('vsel', fmt(v.vsel) + ' m/s');
    set('vent', v.vent > 0 ? fmt(v.vsel * A / v.vent) + ' m/s' : '—');
  }
};

});
__define('js/charts/sleeve.js', function (exports, __require) {
/* Füllkammer-Auswahl: Füllgrad über Kolben-Ø mit Zielband. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { total } = __require('js/core/physics.js');
const { theme } = __require('js/core/theme.js');
const { frac, sqrt } = __require('js/charts/mathfmt.js');
const PI = Math.PI;

exports.default = {
  id: 'sleeve',
  title: 'Füllkammer-Auswahl',
  desc: 'Füllgrad (inkl. Pressrest) mit Zielbereich',
  inputs: ['dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'fillMin', 'fillMax', 'diam'],

  calc(v) {
    const x = seq(v.dmin, v.dmax, 140);
    const q = line(x, [series('Füllgrad', theme.chart.series1, x,
      d => 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * 0.25 * PI * d * d))],
      'Kolben-Ø mm', 'Füllgrad %',
      'Dosiert ' + fmt(total(v) + v.biscuit) + ' kg (inkl. Pressrest) · Kammer ' + fmt(v.length) + ' mm');
    q.band = [v.fillMin, v.fillMax];
    q.y0 = 0; q.y1 = 100;
    const fOp = 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * 0.25 * PI * v.diam * v.diam);
    q.pt = [v.diam, fOp];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm → ' + fmt(fOp) + ' %';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Füllgrad über Kolben-Ø</h4>
<p class="math-note">Bei fester Kammerlänge L sinkt der Füllgrad quadratisch mit dem Kolben-Ø:</p>
<div class="eq">φ(D) = ${frac('V<sub>dos</sub>', 'A<sub>K</sub>(D) · L')} · 100 % = ${frac('4 · V<sub>dos</sub>', 'π · D² · L')} · 100 %</div>

<h4>2 · Umkehrung: Ø-Bereich für das Zielband</h4>
<div class="eq">D(φ) = ${sqrt(frac('4 · V<sub>dos</sub>', 'π · φ · L'), true)}&emsp;— hoher Ziel-Füllgrad verlangt einen kleinen Kolben und umgekehrt</div>
<p class="math-note">Aktuell: φ(Ø <span data-m="D"></span>) = <b data-m="phi"></b> · Zielband
<span data-m="band"></span> ⇒ zulässiger Ø-Bereich <b data-m="Dband"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const Vdos = (total(v) + v.biscuit) / v.density;
    const phi = 100e9 * Vdos / (v.length * 0.25 * PI * v.diam * v.diam);
    const Dof = phiPct => Math.sqrt(100e9 * Vdos / (v.length * 0.25 * PI * phiPct));
    set('D', fmt(v.diam) + ' mm');
    set('phi', isFinite(phi) ? fmt(phi) + ' %' : '—');
    set('band', fmt(v.fillMin) + '–' + fmt(v.fillMax) + ' %');
    set('Dband', (v.fillMin > 0 && v.fillMax > 0)
      ? 'Ø ' + fmt(Dof(v.fillMax)) + '–' + fmt(Dof(v.fillMin)) + ' mm'
      : '—');
  }
};

});
__define('js/charts/gate.js', function (exports, __require) {
/* Anschnittfläche für Zielgeschwindigkeit. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { pistonArea } = __require('js/core/physics.js');
const { theme } = __require('js/core/theme.js');
const { frac } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'gate',
  title: 'Anschnittfläche für Zielgeschwindigkeit',
  desc: 'Auslegung Anschnittfenster',
  inputs: ['vmin', 'vmax', 'diam', 'gateMin', 'gateMax', 'gate', 'vsel'],

  calc(v) {
    const C = theme.chart;
    const A = pistonArea(v);
    const x = seq(v.vmin, v.vmax, 140);
    const q = line(x, [
      series(fmt(v.gateMin) + ' m/s', C.series1, x, s => s * A / v.gateMin),
      series(fmt(v.gateMax) + ' m/s', C.series2, x, s => s * A / v.gateMax)
    ], 'Kolbengeschwindigkeit m/s', 'Anschnittfläche mm²',
      'Ø ' + fmt(v.diam) + ' mm · Auswahl ' + fmt(v.gate) + ' mm²');
    q.pt = [v.vsel, v.gate];
    q.ptl = 'Auswahl ' + fmt(v.gate) + ' mm² bei ' + fmt(v.vsel) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Anschnittfläche aus der Zielgeschwindigkeit</h4>
<p class="math-note">Kontinuität: derselbe Volumenstrom fließt durch Kolben und Anschnitt,
Q = A<sub>K</sub> · v<sub>p</sub> = A<sub>a</sub> · v<sub>a</sub>. Für eine Ziel-Anschnittgeschwindigkeit
v<sub>a</sub> folgt die nötige Fläche:</p>
<div class="eq">A<sub>a</sub>(v<sub>p</sub>) = ${frac('A<sub>K</sub> · v<sub>p</sub>', 'v<sub>a</sub>')}</div>
<p class="math-note">Die beiden Kurven gelten für v<sub>a</sub> = Ziel-min (obere Kurve — langsame Zielgeschwindigkeit
braucht große Fläche) und Ziel-max (untere Kurve); dazwischen liegt das zulässige Fenster.</p>
<p class="math-note">Aktuell bei v<sub>p</sub> = <span data-m="vsel"></span>:
A<sub>a</sub>(v<sub>a</sub> = <span data-m="gmin"></span>) = <b data-m="Amax"></b> ·
A<sub>a</sub>(v<sub>a</sub> = <span data-m="gmax"></span>) = <b data-m="Amin"></b> ·
Auswahl A<sub>a</sub> = <b data-m="Asel"></b> ⇒ v<sub>a</sub> = <b data-m="va"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const A = pistonArea(v);
    set('vsel', fmt(v.vsel) + ' m/s');
    set('gmin', fmt(v.gateMin) + ' m/s');
    set('gmax', fmt(v.gateMax) + ' m/s');
    set('Amax', v.gateMin > 0 ? fmt(A * v.vsel / v.gateMin) + ' mm²' : '—');
    set('Amin', v.gateMax > 0 ? fmt(A * v.vsel / v.gateMax) + ' mm²' : '—');
    set('Asel', fmt(v.gate) + ' mm²');
    set('va', v.gate > 0 ? fmt(v.vsel * A / v.gate) + ' m/s' : '—');
  }
};

});
__define('js/charts/slowshot.js', function (exports, __require) {
/* Kritische Kolbengeschwindigkeit der 1. Phase als Heatmap — nach Nogowizin,
   identisch zur Prüfung in der Schusskurve und zur v_krit-Grenze im
   (φ, L/D)-Auslegungsfenster. */

const { heat } = __require('js/charts/helpers.js');
const { fmt } = __require('js/core/format.js');
const { total, pistonArea, vCrit } = __require('js/core/physics.js');
const { sqrt } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'slowshot',
  title: 'Kritische Kolbengeschw. 1. Phase',
  desc: 'Nogowizin — konsistent zur Schusskurve',
  heat: true,
  inputs: ['dmin', 'dmax', 'part', 'runner', 'overflow', 'biscuit', 'density', 'length', 'diam', 'v1sel'],

  calc(v) {
    /* Farbskala an den Ø-Bereich anpassen: Maximum bei kleinstem Füllgrad und größtem Ø. */
    const hiRaw = vCrit(v.dmax / 1000, 0.02);
    const step = hiRaw > 3 ? 0.5 : hiRaw > 1.5 ? 0.25 : 0.1;
    const hi = Math.max(step, Math.ceil(hiRaw / step) * step);
    const levels = [];
    for (let L = step; L < hi - 1e-9; L += step) levels.push(Number(L.toFixed(2)));

    const q = heat(0, 100, v.dmin, v.dmax,
      (ff, d) => vCrit(d / 1000, ff / 100),
      'Füllgrad %', 'Kolben-Ø mm', 'Krit. Kolbengeschw. m/s', 0, hi, levels);
    const ff = 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * pistonArea(v));
    q.pt = [ff, v.diam];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm · Füllgrad ' + fmt(ff) + ' %';
    q.info = 'Nogowizin — identisch zur Schusskurven-Prüfung · Füllgrad inkl. Pressrest · v₁ = ' + fmt(v.v1sel) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Kritische Kolbengeschwindigkeit der 1. Phase (Nogowizin)</h4>
<p class="math-note">Die langsame Phase soll eine Schmelzewelle vor dem Kolben herschieben, ohne sie zu
überschlagen und Luft einzuwirbeln. Die Grenzgeschwindigkeit skaliert mit der
Schwerewellen-Geschwindigkeit √(g·D) und fällt mit dem Füllgrad:</p>
<div class="eq">v<sub>krit</sub>(D, φ) = ${sqrt('9,81 · D')} · f(φ)&emsp;mit&emsp;f(φ) = 1,386 − 1,915·φ + 0,615·φ²</div>
<p class="math-note">Dieselbe Formel wird in der Schusskurven-Prüfung („1. Phase bis Kammer voll") und als
v<sub>krit</sub>-Grenze im (φ, L/D)-Auslegungsfenster verwendet — alle drei Diagramme sind konsistent.
φ ist der Füllgrad inkl. Pressrest (Dosiergewicht).</p>
<p class="math-note">Aktuell: φ = <b data-m="phi"></b> · v<sub>krit</sub>(Ø <span data-m="D"></span>) = <b data-m="vc"></b> ·
gewählte v₁ = <b data-m="v1"></b> ⇒ <b data-m="cmp"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const ff = 100e9 * ((total(v) + v.biscuit) / v.density) / (v.length * pistonArea(v));
    const vc = vCrit(v.diam / 1000, ff / 100);
    set('phi', isFinite(ff) ? fmt(ff) + ' %' : '—');
    set('D', fmt(v.diam) + ' mm');
    set('vc', isFinite(vc) ? fmt(vc) + ' m/s' : '—');
    set('v1', fmt(v.v1sel) + ' m/s');
    set('cmp', isFinite(vc)
      ? (v.v1sel <= vc ? '✓ v₁ ≤ v<sub>krit</sub>' : '✗ v₁ > v<sub>krit</sub>')
      : '—');
  }
};

});
__define('js/charts/pspec.js', function (exports, __require) {
/* Spezifischer Gießdruck über Kolben-Ø. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const { frac, sqrt } = __require('js/charts/mathfmt.js');
const PI = Math.PI;

exports.default = {
  id: 'pspec',
  title: 'Spezifischer Gießdruck',
  desc: 'über Kolben-Ø',
  inputs: ['dmin', 'dmax', 'injForce', 'pSpecMin', 'pSpecMax', 'diam'],

  calc(v) {
    const x = seq(v.dmin, v.dmax, 140);
    const f = d => v.injForce * 1e4 / (0.25 * PI * d * d);
    const q = line(x, [series('Gießdruck', theme.chart.series1, x, f)],
      'Kolben-Ø mm', 'Spez. Gießdruck bar', 'Gießkraft ' + fmt(v.injForce) + ' kN');
    q.band = [v.pSpecMin, v.pSpecMax];
    q.y0 = 0;
    q.pt = [v.diam, f(v.diam)];
    q.ptl = 'Ø ' + fmt(v.diam) + ' mm → ' + fmt(f(v.diam)) + ' bar';
    return q;
  },

  mathHTML() {
    return `
<h4>1 · Spezifischer Gießdruck</h4>
<p class="math-note">Die dynamische Gießkraft F<sub>G</sub> wirkt über die Kolbenfläche auf die Schmelze —
das ist derselbe statische Metalldruck p₀ wie im PQ²-Diagramm:</p>
<div class="eq">p<sub>spez</sub>(D) = ${frac('F<sub>G</sub>', 'A<sub>K</sub>')} = ${frac('4 · F<sub>G</sub>', 'π · D²')}&emsp;(in Einheiten: p [bar] = 10⁴ · F [kN] / A [mm²])</div>

<h4>2 · Ø-Bereich für das Zielband</h4>
<div class="eq">D(p) = ${sqrt(frac('4 · F<sub>G</sub>', 'π · p'), true)}&emsp;⇒&emsp;Zielband p<sub>min</sub> … p<sub>max</sub> ⇔ Ø von D(p<sub>max</sub>) bis D(p<sub>min</sub>)</div>
<p class="math-note">Aktuell: p<sub>spez</sub>(Ø <span data-m="D"></span>) = <b data-m="p"></b> ·
Zielband <span data-m="band"></span> ⇒ Ø-Bereich <b data-m="Dband"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const p = v.injForce * 1e4 / (0.25 * PI * v.diam * v.diam);
    const Dof = pb => Math.sqrt(v.injForce * 1e4 / (0.25 * PI * pb));
    set('D', fmt(v.diam) + ' mm');
    set('p', isFinite(p) ? fmt(p) + ' bar' : '—');
    set('band', fmt(v.pSpecMin) + '–' + fmt(v.pSpecMax) + ' bar');
    set('Dband', (v.pSpecMin > 0 && v.pSpecMax > 0)
      ? 'Ø ' + fmt(Dof(v.pSpecMax)) + '–' + fmt(Dof(v.pSpecMin)) + ' mm'
      : '—');
  }
};

});
__define('js/charts/window.js', function (exports, __require) {
/* Prozessfenster Anschnitt (Heatmap: Kolbengeschw. × Anschnittfläche → Anschnittgeschw.). */

const { heat } = __require('js/charts/helpers.js');
const { fmt } = __require('js/core/format.js');
const { pistonArea } = __require('js/core/physics.js');
const { frac } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'window',
  title: 'Prozessfenster Anschnitt',
  desc: 'Anschnittgeschw. als Feld',
  heat: true,
  inputs: ['vmin', 'vmax', 'gate', 'diam', 'gateMin', 'gateMax', 'vsel'],

  calc(v) {
    const Ap = pistonArea(v);
    const q = heat(v.vmin, v.vmax, v.gate * 0.3, v.gate * 2,
      (vp, Ag) => vp * Ap / Ag,
      'Kolbengeschw. m/s', 'Anschnittfläche mm²', 'Anschnittgeschw. m/s',
      0, 80, [v.gateMin, 40, v.gateMax, 60, 70]);
    q.pt = [v.vsel, v.gate];
    q.ptl = 'Ist ' + fmt(v.vsel) + ' m/s · ' + fmt(v.gate) + ' mm²';
    q.info = 'Zielband ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Prozessfenster Anschnitt</h4>
<p class="math-note">Dieselbe Kontinuitätsbeziehung wie beim Anschnittflächen-Diagramm, hier als Feld über
Kolbengeschwindigkeit und Anschnittfläche:</p>
<div class="eq">v<sub>a</sub>(v<sub>p</sub>, A<sub>a</sub>) = v<sub>p</sub> · ${frac('A<sub>K</sub>', 'A<sub>a</sub>')}</div>
<p class="math-note">Die weißen Konturen sind Linien konstanter Anschnittgeschwindigkeit; das Zielband ist
v<sub>a</sub> = <span data-m="band"></span>. Aktuell: v<sub>a</sub>(v<sub>p</sub> = <span data-m="vsel"></span>,
A<sub>a</sub> = <span data-m="Ag"></span>) = <b data-m="va"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    set('band', fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
    set('vsel', fmt(v.vsel) + ' m/s');
    set('Ag', fmt(v.gate) + ' mm²');
    set('va', v.gate > 0 ? fmt(v.vsel * pistonArea(v) / v.gate) + ' m/s' : '—');
  }
};

});
__define('js/charts/ftwall.js', function (exports, __require) {
/* Empfohlene Füllzeit nach NADCA über Wandstärke. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const { frac } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'ftwall',
  title: 'Empfohlene Füllzeit',
  desc: 'NADCA über Wandstärke',
  inputs: ['wallMin', 'wallMax', 'kfill', 'Tcast', 'Tflow', 'Tdie', 'Sfrac', 'Zconst', 'tmax', 'wall'],

  calc(v) {
    const x = seq(v.wallMin, v.wallMax, 140);
    const f = s => v.kfill * s * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / (v.Tflow - v.Tdie);
    const q = line(x, [series('Empf. Füllzeit', theme.chart.series1, x, f)],
      'Wandstärke mm', 'Füllzeit ms', 'Tguss ' + fmt(v.Tcast) + ' °C · Tform ' + fmt(v.Tdie) + ' °C');
    q.y0 = 0;
    q.href = v.tmax;
    q.hrefl = 'tmax ' + fmt(v.tmax) + ' ms';
    q.pt = [v.wall, f(v.wall)];
    q.ptl = fmt(v.wall) + ' mm → ' + fmt(f(v.wall)) + ' ms';
    return q;
  },

  mathHTML() {
    return `
<h4>Empfohlene Füllzeit nach NADCA</h4>
<p class="math-note">Die zulässige Füllzeit wächst linear mit der Wandstärke s und mit der Überhitzung der
Schmelze und sinkt mit kälterer Form. Der zulässige erstarrte Anteil S<sub>zul</sub> geht über die
Z-Konstante als äquivalente Temperaturspanne ein:</p>
<div class="eq">t<sub>f</sub>(s) = k · s · ${frac('T<sub>guss</sub> − T<sub>fließ</sub> + S<sub>zul</sub> · Z', 'T<sub>fließ</sub> − T<sub>form</sub>')}</div>
<p class="math-note">Zähler: nutzbare thermische Reserve der Schmelze [°C] · Nenner: treibendes
Temperaturgefälle zur Form [°C] · k: NADCA-Faktor [ms/mm].</p>
<p class="math-note">Aktuell: Zähler = <b data-m="num"></b> · Nenner = <b data-m="den"></b> ·
t<sub>f</sub>(s = <span data-m="s"></span>) = <b data-m="tf"></b> · Limit t<sub>max</sub> = <b data-m="tmax"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const num = v.Tcast - v.Tflow + v.Sfrac * v.Zconst;
    const den = v.Tflow - v.Tdie;
    set('num', fmt(num) + ' °C');
    set('den', fmt(den) + ' °C');
    set('s', fmt(v.wall) + ' mm');
    set('tf', den !== 0 ? fmt(v.kfill * v.wall * num / den) + ' ms' : '—');
    set('tmax', fmt(v.tmax) + ' ms');
  }
};

});
__define('js/charts/gvwall.js', function (exports, __require) {
/* Empfohlene Anschnittgeschwindigkeit über Wandstärke mit Zielband. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const { frac } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'gvwall',
  title: 'Anschnittgeschw. über Wandstärke',
  desc: 'Empfehlung mit Zielband',
  inputs: ['wallMin', 'wallMax', 'gateMin', 'gateMax', 'wall'],

  calc(v) {
    const x = seq(v.wallMin, v.wallMax, 140);
    const f = s => v.gateMax - (v.gateMax - v.gateMin) * (s - v.wallMin) / (v.wallMax - v.wallMin);
    const q = line(x, [series('Empfehlung', theme.chart.series1, x, f)],
      'Wandstärke mm', 'Anschnittgeschw. m/s', 'Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
    q.band = [v.gateMin, v.gateMax];
    q.y0 = 0;
    q.pt = [v.wall, f(v.wall)];
    q.ptl = fmt(v.wall) + ' mm → ' + fmt(f(v.wall)) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Anschnittgeschwindigkeit über Wandstärke</h4>
<p class="math-note">Dünne Wände erstarren schnell und brauchen hohe Anschnittgeschwindigkeit, dicke Wände
vertragen langsamere Füllung. Zwischen den Grenzen des Wandstärkenbereichs wird linear interpoliert:</p>
<div class="eq">v<sub>a</sub>(s) = v<sub>a,max</sub> − ( v<sub>a,max</sub> − v<sub>a,min</sub> ) · ${frac('s − s<sub>min</sub>', 's<sub>max</sub> − s<sub>min</sub>')}</div>
<p class="math-note">Bei s = s<sub>min</sub> gilt v<sub>a,max</sub>, bei s = s<sub>max</sub> gilt
v<sub>a,min</sub>. Aktuell: v<sub>a</sub>(s = <span data-m="s"></span>) = <b data-m="va"></b> ·
Zielband <span data-m="band"></span></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const span = v.wallMax - v.wallMin;
    const va = span !== 0 ? v.gateMax - (v.gateMax - v.gateMin) * (v.wall - v.wallMin) / span : NaN;
    set('s', fmt(v.wall) + ' mm');
    set('va', isFinite(va) ? fmt(va) + ' m/s' : '—');
    set('band', fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
  }
};

});
__define('js/charts/ventreq.js', function (exports, __require) {
/* Entlüftungsbedarf über Füllzeit. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { total, afterGate, pistonArea } = __require('js/core/physics.js');
const { theme } = __require('js/core/theme.js');
const { frac } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'ventreq',
  title: 'Entlüftungsbedarf',
  desc: 'über Füllzeit',
  inputs: ['part', 'runner', 'overflow', 'density', 'tmax', 'vAirMax', 'vent', 'gate', 'vsel', 'diam'],

  calc(v) {
    const C = theme.chart;
    const Vm = total(v) / v.density;
    const f = t => Vm / (t / 1000) / v.vAirMax * 1e6;
    /* y-Achse knapp über der größten Referenz (Anschnittfläche / Ist-Entlüftung /
       Bedarf bei t_max) kappen — die Hyperbel explodiert sonst bei kleinen t
       und drückt den lesbaren Bereich zusammen. x beginnt, wo die Kurve ins
       Bild kommt. */
    const yCap = Math.max(v.gate, v.vent, f(v.tmax)) * 1.15;
    let t0 = 0.95 * 1e9 * Vm / (v.vAirMax * yCap);
    if (!isFinite(t0) || t0 < 1 || t0 >= v.tmax) t0 = 1;
    const x = seq(t0, v.tmax, 140);
    const q = line(x, [series('Erf. Entlüftung', C.series1, x, f)],
      'Füllzeit ms', 'Erf. Entlüftungsfläche mm²',
      'Luftvolumen ' + fmt(Vm * 1e6) + ' cm³ · ' + fmt(v.vAirMax) + ' m/s');
    q.y0 = 0;
    q.y1 = yCap;
    q.hrefs = [
      { y: v.vent, l: 'Ist Entlüftung ' + fmt(v.vent) + ' mm²' },
      { y: v.gate, l: 'Anschnittfläche ' + fmt(v.gate) + ' mm²', c: C.series2 }
    ];
    const tOp = 1e9 * (afterGate(v) / v.density) / (v.vsel * pistonArea(v));
    q.pt = [tOp, f(tOp)];
    q.ptl = fmt(tOp) + ' ms → ' + fmt(f(tOp)) + ' mm²';
    return q;
  },

  mathHTML() {
    return `
<h4>Erforderliche Entlüftungsfläche</h4>
<p class="math-note">Die Luft im Formhohlraum (≈ verdrängtes Gesamtvolumen der Füllung,
V<sub>luft</sub> = m<sub>ges</sub> / ρ) muss während der Füllzeit t<sub>f</sub> mit höchstens
v<sub>luft,max</sub> entweichen — sonst staut sie sich und wird eingeschlossen:</p>
<div class="eq">A<sub>ent,erf</sub>(t<sub>f</sub>) = ${frac('V<sub>luft</sub>', 't<sub>f</sub> · v<sub>luft,max</sub>')}</div>
<p class="math-note">Kurze Füllzeiten verlangen große Entlüftungsflächen (Hyperbel). Die gestrichelten Linien
zeigen die vorhandene Entlüftungsfläche und als Referenz die Anschnittfläche — die Entlüftung liegt
üblicherweise in deren Größenordnung (häufige Faustregel: rund die Hälfte der Anschnittfläche).</p>
<p class="math-note">Aktuell: V<sub>luft</sub> = <b data-m="V"></b> · Betriebspunkt t<sub>f</sub> = <b data-m="tf"></b>
(aus v<sub>sel</sub> und Kolben-Ø) ⇒ A<sub>ent,erf</sub> = <b data-m="Areq"></b> · vorhanden <b data-m="Avail"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const Vm = total(v) / v.density;
    const tOp = 1e9 * (afterGate(v) / v.density) / (v.vsel * pistonArea(v));
    const Areq = v.vAirMax > 0 && tOp > 0 ? Vm / (tOp / 1000) / v.vAirMax * 1e6 : NaN;
    set('V', fmt(Vm * 1e6) + ' cm³');
    set('tf', isFinite(tOp) ? fmt(tOp) + ' ms' : '—');
    set('Areq', isFinite(Areq) ? fmt(Areq) + ' mm²' : '—');
    set('Avail', fmt(v.vent) + ' mm²');
  }
};

});
__define('js/charts/yield.js', function (exports, __require) {
/* Materialausbeute als Ringdiagramm (Anteile am Dosiergewicht). */

const { fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const { frac } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'yield',
  title: 'Materialausbeute',
  desc: 'Ringdiagramm · Anteile am Dosiergewicht (inkl. Pressrest)',
  inputs: ['part', 'runner', 'overflow', 'biscuit'],

  calc(v) {
    const C = theme.chart;
    const segs = [
      { n: 'Bauteil',   kg: v.part,     c: C.series2 },
      { n: 'Anguss',    kg: v.runner,   c: C.series1 },
      { n: 'Überlauf',  kg: v.overflow, c: C.series3 },
      { n: 'Pressrest', kg: v.biscuit,  c: C.series4 }
    ].filter(s => s.kg > 0);
    let tot = 0;
    segs.forEach(s => { tot += s.kg; });
    return {
      kind: 'donut', segs, total: tot,
      share: tot > 0 ? 100 * v.part / tot : 0,
      info: 'Dosiergewicht ' + fmt(tot) + ' kg · Ausbeute = Bauteil / Dosiergewicht'
    };
  },

  mathHTML() {
    return `
<h4>Materialausbeute</h4>
<div class="eq">m<sub>dos</sub> = m<sub>Bauteil</sub> + m<sub>Anguss</sub> + m<sub>Überlauf</sub> + m<sub>Pressrest</sub></div>
<div class="eq">η = ${frac('m<sub>Bauteil</sub>', 'm<sub>dos</sub>')} · 100 %&emsp;&emsp;Anteil<sub>i</sub> = ${frac('m<sub>i</sub>', 'm<sub>dos</sub>')} · 100 %</div>
<p class="math-note">η ist der Anteil der dosierten Schmelze, der im Bauteil landet; Anguss, Überlauf und
Pressrest gehen ins Recycling (Kreislaufmaterial kostet Energie und Ofenkapazität).</p>
<p class="math-note">Aktuell: m<sub>dos</sub> = <b data-m="mdos"></b> · η = <b data-m="eta"></b> ·
Anteile: Bauteil <b data-m="aB"></b> · Anguss <b data-m="aA"></b> · Überlauf <b data-m="aU"></b> ·
Pressrest <b data-m="aP"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    const tot = v.part + v.runner + v.overflow + v.biscuit;
    const pct = m => tot > 0 ? fmt(100 * m / tot) + ' %' : '—';
    set('mdos', fmt(tot) + ' kg');
    set('eta', pct(v.part));
    set('aB', pct(v.part));
    set('aA', pct(v.runner));
    set('aU', pct(v.overflow));
    set('aP', pct(v.biscuit));
  }
};

});
__define('js/charts/gatesol.js', function (exports, __require) {
/* Anschnitt-Erstarrungszeit über Anschnittdicke. */

const { series, line } = __require('js/charts/helpers.js');
const { seq, fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const { frac, sqrt } = __require('js/charts/mathfmt.js');
exports.default = {
  id: 'gatesol',
  title: 'Anschnitt-Erstarrungszeit',
  desc: 'über Anschnittdicke',
  inputs: ['gateTh', 'solK', 'intTime'],

  calc(v) {
    const x = seq(0.5, v.gateTh * 2.5, 140);
    const f = s => v.solK * s * s;
    const q = line(x, [series('Erstarrungszeit', theme.chart.series1, x, f)],
      'Anschnittdicke mm', 'Erstarrungszeit ms', 'Konstante ' + fmt(v.solK) + ' ms/mm²');
    q.y0 = 0;
    q.href = v.intTime;
    q.hrefl = 'Nachdruck ' + fmt(v.intTime) + ' ms';
    q.pt = [v.gateTh, f(v.gateTh)];
    q.ptl = fmt(v.gateTh) + ' mm → ' + fmt(f(v.gateTh)) + ' ms';
    return q;
  },

  mathHTML() {
    return `
<h4>Erstarrungszeit des Anschnitts</h4>
<p class="math-note">Die Erstarrungszeit wächst quadratisch mit der Dicke (Chvorinov-artiger Ansatz mit der
Erstarrungskonstante k<sub>s</sub>):</p>
<div class="eq">t<sub>erst</sub>(s) = k<sub>s</sub> · s²</div>
<p class="math-note">Der Anschnitt darf erst nach Ende der Nachdruckzeit t<sub>N</sub> zufrieren, sonst ist
die Kavität vom Nachdruck abgeschnitten, bevor die Schwindung ausgeglichen ist:</p>
<div class="eq">t<sub>erst</sub> ≥ t<sub>N</sub>&ensp;⇔&ensp;s ≥ ${sqrt(frac('t<sub>N</sub>', 'k<sub>s</sub>'), true)}</div>
<p class="math-note">Aktuell: t<sub>erst</sub>(s = <span data-m="s"></span>) = <b data-m="t"></b> ·
Nachdruckzeit t<sub>N</sub> = <b data-m="tN"></b> ⇒ Mindestdicke = <b data-m="smin"></b></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = val; };
    set('s', fmt(v.gateTh) + ' mm');
    set('t', fmt(v.solK * v.gateTh * v.gateTh) + ' ms');
    set('tN', fmt(v.intTime) + ' ms');
    set('smin', v.solK > 0 ? fmt(Math.sqrt(v.intTime / v.solK)) + ' mm' : '—');
  }
};

});
__define('js/charts/registry.js', function (exports, __require) {
/* Registry aller Diagramme. Ein neues Diagramm = neue Datei in js/charts/
   + ein Import hier. Die Reihenfolge bestimmt die Anordnung im Dashboard. */

const shotcurve = __require('js/charts/shotcurve.js').default;
const pq2 = __require('js/charts/pq2.js').default;
const phild = __require('js/charts/phild.js').default;
const area = __require('js/charts/area.js').default;
const machine = __require('js/charts/machine.js').default;
const clamp = __require('js/charts/clamp.js').default;
const filltime = __require('js/charts/filltime.js').default;
const fill = __require('js/charts/fill.js').default;
const vent = __require('js/charts/vent.js').default;
const sleeve = __require('js/charts/sleeve.js').default;
const gate = __require('js/charts/gate.js').default;
const slowshot = __require('js/charts/slowshot.js').default;
const pspec = __require('js/charts/pspec.js').default;
const windowChart = __require('js/charts/window.js').default;
const ftwall = __require('js/charts/ftwall.js').default;
const gvwall = __require('js/charts/gvwall.js').default;
const ventreq = __require('js/charts/ventreq.js').default;
const yieldChart = __require('js/charts/yield.js').default;
const gatesol = __require('js/charts/gatesol.js').default;
const charts = [
  shotcurve, pq2, phild,
  area, machine, clamp, filltime, fill, vent, sleeve, gate, slowshot,
  pspec, windowChart, ftwall, gvwall, ventreq, yieldChart, gatesol
];

const chartsById = {};
charts.forEach(c => { chartsById[c.id] = c; });

exports.charts = charts;
exports.chartsById = chartsById;
});
__define('js/ui/inputs.js', function (exports, __require) {
/* Baut die Eingabe-Sidebar aus der Felddefinition, validiert Grenzen und
   hebt auf Wunsch die Eingaben eines Diagramms hervor. */

const { groups, PRESET_KEYS } = __require('js/config/fields.js');
const { state, notify } = __require('js/core/state.js');
function fieldHTML(f) {
  return '<div class="field" data-field="' + f.key + '"><label>' + f.label +
    ' <span class="unit">' + f.unit + '</span></label>' +
    '<input data-k="' + f.key + '" type="number" step="any" value="' + f.def + '"></div>';
}

/* onlyKeys: optionales Set von Feldnamen — dann werden nur diese Felder
   gebaut (Einzelseiten-Modus). Leere Gruppen entfallen. */
function buildInputs(container, onlyKeys = null) {
  const keep = f => !onlyKeys || onlyKeys.has(f.key);
  for (const g of groups) {
    let inner;
    if (g.columns) {
      const cols = g.columns
        .map(c => ({ title: c.title, fields: c.fields.filter(keep) }))
        .filter(c => c.fields.length);
      if (!cols.length) continue;
      inner = '<div class="chamber-grid">' + cols.map(c =>
        '<div class="input-column"><h4>' + c.title + '</h4>' + c.fields.map(fieldHTML).join('') + '</div>'
      ).join('') + '</div>';
    } else {
      const fs = g.fields.filter(keep);
      if (!fs.length) continue;
      inner = '<div class="fields">' + fs.map(fieldHTML).join('') + '</div>';
    }
    const el = document.createElement('div');
    el.className = 'group' + (g.wide ? ' wide' : '');
    el.dataset.group = g.id;
    el.innerHTML = '<h3>' + g.title + '</h3>' + inner;
    container.appendChild(el);
  }

  container.querySelectorAll('input[data-k]').forEach(e => {
    e.value = state.values[e.dataset.k];
    e.oninput = () => {
      state.values[e.dataset.k] = Number(e.value);
      if (PRESET_KEYS[e.dataset.k]) {
        state.machine = '';
        const ms = document.getElementById('machineSel');
        if (ms) ms.value = '';
      }
      notify();
    };
  });
}

/* Werte programmatisch setzen (Preset, JSON-Import) — aktualisiert Zustand
   und sichtbare Eingabefelder. */
function applyValues(fields) {
  for (const k in fields) {
    if (fields[k] == null) continue;
    state.values[k] = Number(fields[k]);
    const e = document.querySelector('[data-k="' + k + '"]');
    if (e) e.value = fields[k];
  }
}

/* Felder, die zwingend > 0 sein müssen (Divisionen, Achsen, Wurzeln). */
const POSITIVE_KEYS = ['density', 'diam', 'length', 'gate', 'vent', 'Cd',
  'force', 'injForce', 'area', 'psel', 'safety', 'vmax', 'vsel', 'tmax', 'vAirMax', 'solK',
  'tieX', 'tieY'];

function validate(v) {
  const bad = new Set();
  const msgs = [];

  /* min/max-Paare: strict = Gleichheit ebenfalls ungültig (Achsen/Divisionen). */
  const pair = (a, b, label, strict) => {
    if (!isFinite(v[a]) || !isFinite(v[b])) return;
    if (strict ? v[a] >= v[b] : v[a] > v[b]) { bad.add(a); bad.add(b); msgs.push(label); }
  };
  pair('pmin', 'pmax', 'Druck min ≥ max', true);
  pair('dmin', 'dmax', 'Kolben-Ø min ≥ max', true);
  pair('lmin', 'lmax', 'Kammerlänge min ≥ max', true);
  pair('vmin', 'vmax', 'Kolbengeschw. min ≥ max', true);
  pair('wallMin', 'wallMax', 'Wandstärke min ≥ max', true);
  pair('fillMin', 'fillMax', 'Füllgrad-Ziel min > max', false);
  pair('gateMin', 'gateMax', 'Anschnittgeschw.-Ziel min > max', false);
  pair('pSpecMin', 'pSpecMax', 'Ziel-Gießdruck min > max', false);

  let nonpos = false;
  for (const k of POSITIVE_KEYS) if (!(v[k] > 0)) { bad.add(k); nonpos = true; }
  if (nonpos) msgs.push('rot markierte Felder müssen > 0 sein');

  /* Gewählte Werte gegen ihre Grenzen. */
  if (v.diam < v.dmin || v.diam > v.dmax) bad.add('diam');
  if (v.length < v.lmin || v.length > v.lmax) bad.add('length');
  if (v.vsel < v.vmin || v.vsel > v.vmax) bad.add('vsel');
  if (v.psel < v.pmin || v.psel > v.pmax) bad.add('psel');

  document.querySelectorAll('input[data-k]').forEach(e =>
    e.classList.toggle('invalid', bad.has(e.dataset.k)));
  const err = document.getElementById('error');
  if (err) err.textContent = msgs.length ? '⚠ ' + msgs.join(' · ') : '';
}

/* Hervorhebung der Eingaben eines Diagramms. */
function highlightInputs(keys, opts = {}) {
  clearHighlights();
  const set = new Set(keys);
  let first = null;
  document.querySelectorAll('.field[data-field]').forEach(el => {
    if (set.has(el.dataset.field)) {
      el.classList.add('hl');
      const grp = el.closest('.group');
      if (grp) grp.classList.add('hl');
      if (!first) first = el;
    }
  });
  if (opts.curve) {
    const cg = document.getElementById('curve-group');
    if (cg) { cg.classList.add('hl'); if (!first) first = cg; }
  }
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearHighlights() {
  document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl'));
}

exports.buildInputs = buildInputs;
exports.applyValues = applyValues;
exports.validate = validate;
exports.highlightInputs = highlightInputs;
exports.clearHighlights = clearHighlights;
});
__define('js/core/machines.js', function (exports, __require) {
/* Liest die Maschinen-Presets aus config/machines.js (setzt
   window.__MACHINES__ per klassischem <script>-Tag — funktioniert über
   http UND file://). Das Array wird mutiert, nicht ersetzt, damit importierte
   Referenzen in jedem Lademodus gültig bleiben. */

const machines = [];

async function loadMachines() {
  const data = window.__MACHINES__;
  if (!data) throw new Error('config/machines.js nicht geladen (window.__MACHINES__ fehlt).');
  machines.length = 0;
  (data.machines || []).forEach(m => machines.push(m));
  return machines;
}

function machineById(id) {
  return machines.find(m => m.id === id) || null;
}

exports.loadMachines = loadMachines;
exports.machineById = machineById;
exports.machines = machines;
});
__define('js/ui/presets.js', function (exports, __require) {
/* Maschinen-Preset-Auswahl: befüllt das Select aus config/machines.json und
   wendet ein gewähltes Preset auf die Eingabefelder an. */

const { loadMachines, machines, machineById } = __require('js/core/machines.js');
const { state, notify } = __require('js/core/state.js');
const { applyValues } = __require('js/ui/inputs.js');
async function initPresetSelect(sel) {
  await loadMachines();
  machines.forEach(m => {
    const op = document.createElement('option');
    op.value = m.id;
    op.textContent = m.name;
    sel.appendChild(op);
  });
  sel.value = state.machine || '';
  sel.onchange = () => {
    state.machine = sel.value;
    const m = machineById(sel.value);
    if (m) applyValues(m.fields);
    notify();
  };
}

exports.initPresetSelect = initPresetSelect;
});
__define('js/ui/curveTable.js', function (exports, __require) {
/* Editierbare Tabelle der Schusskurven-Wegpunkte. */

const { state, notify } = __require('js/core/state.js');
function renderCurveTable() {
  const body = document.getElementById('curveBody');
  if (!body) return;
  body.textContent = '';
  state.curve.forEach((p, i) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'), td2 = document.createElement('td'), td3 = document.createElement('td');
    const i1 = document.createElement('input'), i2 = document.createElement('input');
    const del = document.createElement('button');
    i1.type = 'number'; i1.step = '10'; i1.value = p[0];
    i1.oninput = () => { state.curve[i][0] = parseFloat(i1.value); notify(); };
    i2.type = 'number'; i2.step = '0.1'; i2.value = p[1];
    i2.oninput = () => { state.curve[i][1] = parseFloat(i2.value); notify(); };
    del.className = 'row-del'; del.title = 'Punkt entfernen'; del.textContent = '✕';
    del.onclick = () => { state.curve.splice(i, 1); renderCurveTable(); notify(); };
    td1.appendChild(i1); td2.appendChild(i2); td3.appendChild(del);
    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
    body.appendChild(tr);
  });
}

function wireAddPoint(btn) {
  btn.onclick = () => {
    const last = state.curve[state.curve.length - 1] || [0, 0];
    state.curve.push([last[0] + 50, last[1]]);
    renderCurveTable();
    notify();
  };
}

exports.renderCurveTable = renderCurveTable;
exports.wireAddPoint = wireAddPoint;
});
__define('js/ui/kpis.js', function (exports, __require) {
/* KPI-Kacheln oberhalb der Diagramme, gruppiert nach Themen:
   Füllkammer/Massen · Zuhaltung/Maschine · Schusskurve/Anschnitt ·
   Thermik/Qualität. Alle Werte sind dieselben Formeln wie in den Diagrammen. */

const { fmt } = __require('js/core/format.js');
const { total, afterGate, pistonArea, travel } = __require('js/core/physics.js');
function kpi(a, b, c, s) {
  return '<div class="kpi' + (s ? ' ' + s : '') + '"><span>' + a + '</span><b>' + b + '</b><small>' + c + '</small></div>';
}
function band(x, lo, hi) { return x < lo || x > hi ? 'warn' : 'ok'; }
function cap(x, lim) { return x > lim ? 'bad' : 'ok'; }
function group(title, tiles) {
  return '<div class="kpi-head">' + title + '</div><div class="kpi-grid">' + tiles + '</div>';
}

function renderKpis(el, v, shot) {
  const A = pistonArea(v);
  const mdos = total(v) + v.biscuit;
  const Vdos = mdos / v.density;                                   // m³
  const req = v.area * v.safety * v.psel / 0.01;
  const fill = 100e9 * Vdos / (v.length * A);
  const p1 = travel(v.runner, v);
  const p3 = travel(mdos, v);
  const sFill = (1 - fill / 100) * v.length;
  const biscLen = travel(v.biscuit, v);
  const ratioLD = v.length / v.diam;
  const eta = mdos > 0 ? 100 * v.part / mdos : NaN;

  /* Zuhaltung + spezifischer Gießdruck */
  const kClamp = 1 + 2 * Math.abs(v.eccX) / v.tieX + 2 * Math.abs(v.eccY) / v.tieY;
  const pMaxClamp = v.force / (100 * v.area * v.safety * kClamp);
  const pSpec = v.injForce * 1e4 / A;

  /* PQ²-Arbeitspunkt (gleiche Rechnung wie im PQ²-Diagramm) */
  let Qs = null, ps = null;
  if (v.gate > 0 && v.Cd > 0 && v.vmax > 0 && v.injForce > 0 && v.density > 0 && v.diam > 0) {
    const Ap = A * 1e-6, p0 = v.injForce * 1e4 / A, Qmax = Ap * v.vmax, Ag = v.gate * 1e-6;
    const Cdie = v.density / (2 * v.Cd * v.Cd * Ag * Ag) / 1e5;
    Qs = Math.sqrt(p0 / (Cdie + p0 / (Qmax * Qmax)));
    ps = Cdie * Qs * Qs;
  }

  /* Anschnittgeschwindigkeit: bevorzugt aus der Schusskurve (Bauteil gefüllt) */
  const gvStat = v.vsel * A / v.gate;
  const evPart = !shot.error && shot.events && shot.events[2];
  const gvShot = evPart && evPart.inP && evPart.gv != null ? evPart.gv : null;
  const gvShown = gvShot != null ? gvShot : gvStat;

  /* Thermik und Qualität */
  const denN = v.Tflow - v.Tdie;
  const tNadca = denN !== 0 ? v.kfill * v.wall * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / denN : NaN;
  const Vm = total(v) / v.density;
  const tOp = 1e9 * (afterGate(v) / v.density) / (v.vsel * A);
  const Areq = tOp > 0 && v.vAirMax > 0 ? Vm / (tOp / 1000) / v.vAirMax * 1e6 : NaN;
  const tErst = v.solK * v.gateTh * v.gateTh;

  el.innerHTML =
    group('Füllkammer und Massenbilanz',
      kpi('Dosiergewicht', fmt(mdos) + ' kg', 'Bauteil + Anguss + Überlauf + Pressrest ' + fmt(v.biscuit) + ' kg')
      + kpi('Dosiervolumen', fmt(Vdos * 1e6) + ' cm³', 'inkl. Pressrest · Dichte ' + fmt(v.density) + ' kg/m³')
      + kpi('Materialausbeute', fmt(eta) + ' %', 'Bauteil / Dosiergewicht · Rest ist Kreislaufmaterial')
      + kpi('Füllgrad', fmt(fill) + ' %', 'Ziel ' + fmt(v.fillMin) + '–' + fmt(v.fillMax) + ' % · inkl. Pressrest', band(fill, v.fillMin, v.fillMax))
      + kpi('Kammerverhältnis L/D', fmt(ratioLD), 'gewählte Kammer · Ø ' + fmt(v.diam) + ' × L ' + fmt(v.length) + ' mm')
      + kpi('Kammer voll bei', fmt(sFill) + ' mm', 'Füllgrad inkl. Pressrest ' + fmt(fill) + ' %', cap(fill, 100))
      + kpi('Anschnitt erreicht', fmt(p1) + ' mm', 'nur Angussvolumen')
      + kpi('Gesamtschuss gefüllt', fmt(p3) + ' mm', 'inkl. Pressrest · Kammer ' + fmt(v.length) + ' mm' + (p3 > v.length ? ' · Überlauf!' : ''), cap(p3, v.length))
      + kpi('Pressrest', fmt(biscLen) + ' mm', 'min ' + fmt(v.biscuitMin) + ' mm', biscLen < v.biscuitMin ? 'bad' : 'ok'))

    + group('Zuhaltung und Maschine',
      kpi('Benötigte Schließkraft', fmt(req / 10) + ' t', fmt(req) + ' kN / ' + fmt(v.force) + ' kN verfügbar', cap(req, v.force))
      + kpi('Max. Nachdruck', fmt(pMaxClamp) + ' bar', 'Zuhaltung · e = (' + fmt(v.eccX) + ', ' + fmt(v.eccY) + ') mm · S = ' + fmt(v.safety), cap(v.psel, pMaxClamp))
      + kpi('Spez. Gießdruck', fmt(pSpec) + ' bar', 'Gießkraft / Kolbenfläche · Ziel ' + fmt(v.pSpecMin) + '–' + fmt(v.pSpecMax) + ' bar', band(pSpec, v.pSpecMin, v.pSpecMax)))

    + group('Schusskurve und Anschnitt',
      kpi('Anschnittgeschwindigkeit', fmt(gvShown) + ' m/s',
        (gvShot != null
          ? 'aus Schusskurve (Bauteil gefüllt) · stationär ' + fmt(gvStat) + ' m/s'
          : 'stationär bei gewählter Kolbengeschw.')
        + ' · Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s', band(gvShown, v.gateMin, v.gateMax))
      + kpi('PQ²-Arbeitspunkt', Qs === null ? '—' : fmt(Qs * 1000) + ' l/s',
        Qs === null ? 'Eingaben unvollständig' : 'Metalldruck p_s ' + fmt(ps) + ' bar · Schnittpunkt Maschine × Werkzeug', Qs === null ? 'warn' : undefined)
      + (shot.error
        ? kpi('Schusskurve', 'Fehler', shot.error, 'bad')
        : kpi('Schusszeit', fmt(shot.profile.endTime) + ' s', 'Kurvenhub ' + fmt(shot.profile.travel * 1000) + ' mm')
        + kpi('Füllzeit ab Anschnitt', shot.fill === null ? '—' : fmt(shot.fill) + ' ms', 'aus Schusskurve · max ' + fmt(v.tmax) + ' ms', shot.fill === null ? 'warn' : cap(shot.fill, v.tmax))
        + kpi('v_krit 1. Phase', fmt(shot.vcrit) + ' m/s', 'Ist max. ' + fmt(shot.vSlow) + ' m/s (Nogowizin)', cap(shot.vSlow, shot.vcrit))))

    + group('Thermik und Qualität',
      kpi('Empf. Füllzeit (NADCA)', fmt(tNadca) + ' ms',
        'bei s = ' + fmt(v.wall) + ' mm · Ist ' + (shot.error || shot.fill === null ? '—' : fmt(shot.fill)) + ' ms aus Schusskurve',
        (shot.error || shot.fill === null || !isFinite(tNadca)) ? 'warn' : cap(shot.fill, tNadca))
      + kpi('Entlüftungsbedarf', fmt(Areq) + ' mm²',
        'bei t_f ' + fmt(tOp) + ' ms (stationär) · vorhanden ' + fmt(v.vent) + ' mm²', isFinite(Areq) ? cap(Areq, v.vent) : 'warn')
      + kpi('Anschnitt-Erstarrung', fmt(tErst) + ' ms',
        'k·s² bei s = ' + fmt(v.gateTh) + ' mm · Nachdruck ' + fmt(v.intTime) + ' ms', tErst < v.intTime ? 'bad' : 'ok')
      + (shot.error
        ? kpi('Kurve vs. Maschinenlimits', '—', 'Schusskurve ungültig', 'warn')
        : (() => {
          const aPk = Math.max(shot.profile.amax, -shot.profile.amin, 0);
          const ok = shot.profile.vmax <= v.vmax + 1e-9 && (!(v.amax > 0) || aPk <= v.amax + 1e-9);
          return kpi('Kurve vs. Maschinenlimits', fmt(shot.profile.vmax) + ' m/s · ' + fmt(aPk) + ' m/s²',
            'Spitzen v/a · Limits ' + fmt(v.vmax) + ' m/s · ' + fmt(v.amax) + ' m/s²', ok ? 'ok' : 'bad');
        })()));
}

exports.renderKpis = renderKpis;
});
__define('js/render/base.js', function (exports, __require) {
/* Gemeinsame Canvas-Bausteine: Rahmen, Achsen, Überschrift, Betriebspunkt-
   Marker, Turbo-Farbrampe und Konturlinien. Alle Farben kommen aus dem Theme. */

const { fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const PI = Math.PI;

function frame(w, h, heatmap) {
  return { L: 75, R: heatmap ? 92 : 50, T: 92, B: 58, pw: w - 75 - (heatmap ? 92 : 50), ph: h - 150 };
}

function text(x, s, a, b, al, font) {
  x.fillStyle = theme.chart.text;
  x.textAlign = al || 'center';
  x.font = font || '11px Arial';
  x.fillText(s, a, b);
}

function heading(x, w, h, d) {
  x.fillStyle = theme.chart.surface;
  x.fillRect(0, 0, w, h);
  text(x, d.title, w / 2, 22, 'center', 'bold 15px Arial');
  text(x, d.info || '', w / 2, 42);
  x.strokeStyle = theme.chart.axis;
  x.beginPath(); x.moveTo(40, 55); x.lineTo(w - 40, 55); x.stroke();
}

function axes(x, w, h, f, x0, x1, y0, y1, d) {
  for (let i = 0; i <= 5; i++) {
    const X = f.L + i * f.pw / 5, Y = f.T + i * f.ph / 5;
    x.strokeStyle = theme.chart.grid;
    x.beginPath(); x.moveTo(X, f.T); x.lineTo(X, h - f.B); x.stroke();
    x.beginPath(); x.moveTo(f.L, Y); x.lineTo(w - f.R, Y); x.stroke();
    text(x, fmt(x0 + i * (x1 - x0) / 5), X, h - f.B + 18);
    text(x, fmt(y1 - i * (y1 - y0) / 5), f.L - 7, Y + 4, 'right');
  }
  text(x, d.xl, f.L + f.pw / 2, h - 11);
  x.save(); x.translate(14, f.T + f.ph / 2); x.rotate(-PI / 2); text(x, d.yl, 0, 0); x.restore();
}

/* Roter Betriebspunkt-Marker mit Führungslinien und Label. */
function marker(x, f, px, py, label) {
  if (px < f.L - 2 || px > f.L + f.pw + 2 || py < f.T - 2 || py > f.T + f.ph + 2) return;
  const MC = theme.chart.marker;
  x.save();
  x.strokeStyle = MC; x.lineWidth = 1; x.setLineDash([4, 3]);
  x.beginPath(); x.moveTo(f.L, py); x.lineTo(px, py); x.moveTo(px, f.T + f.ph); x.lineTo(px, py); x.stroke();
  x.setLineDash([]);
  x.beginPath(); x.arc(px, py, 6, 0, 2 * PI); x.fillStyle = theme.chart.surface; x.fill();
  x.lineWidth = 2.2; x.strokeStyle = MC; x.stroke();
  x.beginPath(); x.arc(px, py, 2, 0, 2 * PI); x.fillStyle = MC; x.fill();
  if (label) {
    x.font = 'bold 11px Arial'; x.textAlign = 'left';
    const tw = x.measureText(label).width;
    let lx = px + 11, ly = py - 9;
    if (lx + tw + 6 > f.L + f.pw) lx = px - tw - 19;
    if (ly < f.T + 12) ly = py + 22;
    x.fillStyle = 'rgba(255,255,255,.88)';
    x.fillRect(lx - 4, ly - 11, tw + 8, 15);
    x.fillStyle = MC; x.fillText(label, lx, ly);
  }
  x.restore();
}

/* Farbrampe für Heatmaps; Stützstellen aus theme.heatStops. */
function turbo(t) {
  t = Math.max(0, Math.min(1, t));
  const k = theme.heatStops;
  const u = t * (k.length - 1), i = Math.min(k.length - 2, Math.floor(u)), q = u - i;
  const a = k[i], b = k[i + 1];
  return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * q) + ',' + Math.round(a[1] + (b[1] - a[1]) * q) + ',' + Math.round(a[2] + (b[2] - a[2]) * q) + ')';
}

/* Marching-Squares-Konturen mit Wertelabels. */
function contours(ctx, f, d) {
  const nx = d.x.length, ny = d.y.length, cw = f.pw / (nx - 1), ch = f.ph / (ny - 1);
  ctx.save();
  ctx.lineWidth = 1.15; ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
  for (let li = 0; li < d.levels.length; li++) {
    const L = d.levels[li];
    ctx.beginPath();
    let label = null;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const v = [d.z[j][i], d.z[j][i + 1], d.z[j + 1][i + 1], d.z[j + 1][i]];
      const p = [];
      const X = a => f.L + a * cw, Y = a => f.T + f.ph - a * ch;
      const cut = (a, b) => b === a ? 0.5 : (L - a) / (b - a);
      if ((v[0] - L) * (v[1] - L) < 0) p.push([X(i + cut(v[0], v[1])), Y(j)]);
      if ((v[1] - L) * (v[2] - L) < 0) p.push([X(i + 1), Y(j + cut(v[1], v[2]))]);
      if ((v[2] - L) * (v[3] - L) < 0) p.push([X(i + 1 - cut(v[2], v[3])), Y(j + 1)]);
      if ((v[3] - L) * (v[0] - L) < 0) p.push([X(i), Y(j + 1 - cut(v[3], v[0]))]);
      if (p.length >= 2) {
        ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]);
        if (!label && i > nx * 0.35 && i < nx * 0.65 && j > ny * 0.2 && j < ny * 0.8) label = p[0];
      }
    }
    ctx.stroke();
    if (label) {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fillRect(label[0] - 14, label[1] - 8, 28, 14);
      ctx.fillStyle = theme.chart.text;
      ctx.fillText(fmt(L), label[0], label[1] + 3);
    }
  }
  ctx.restore();
}

exports.frame = frame;
exports.text = text;
exports.heading = heading;
exports.axes = axes;
exports.marker = marker;
exports.turbo = turbo;
exports.contours = contours;
});
__define('js/render/line.js', function (exports, __require) {
/* Liniendiagramme: Serien, Zielbänder, vertikale Bänder, Ereignismarker,
   horizontale Referenzlinien, Betriebspunkt. */

const { frame, heading, axes, marker, text } = __require('js/render/base.js');
const { theme } = __require('js/core/theme.js');
const PI = Math.PI;

function drawLine(x, w, h, d) {
  heading(x, w, h, d);
  const C = theme.chart;
  const f = frame(w, h, false);
  const x0 = d.x[0], x1 = d.x[d.x.length - 1];
  let all = [];
  for (let i = 0; i < d.ys.length; i++) all = all.concat(d.ys[i].y.filter(isFinite));
  let y0 = d.y0 == null ? Math.min.apply(null, [0].concat(all)) : d.y0;
  let y1 = d.y1 == null ? Math.max.apply(null, all) * 1.08 : d.y1;
  if (d.hrefs) for (let i = 0; i < d.hrefs.length; i++) if (d.y1 == null) y1 = Math.max(y1, d.hrefs[i].y * 1.08);
  axes(x, w, h, f, x0, x1, y0, y1, d);
  const X = a => f.L + (a - x0) / (x1 - x0) * f.pw;
  const Y = a => f.T + (y1 - a) / (y1 - y0) * f.ph;

  /* vertikale Bereichs-Bänder (z. B. „keine Zerstäubung" im PQ²) */
  if (d.vbands) for (let i = 0; i < d.vbands.length; i++) {
    const vb = d.vbands[i];
    const px0 = Math.max(f.L, Math.min(f.L + f.pw, X(vb.x0)));
    const px1 = Math.max(f.L, Math.min(f.L + f.pw, X(vb.x1)));
    if (px1 - px0 > 1) {
      x.fillStyle = vb.c;
      x.fillRect(px0, f.T, px1 - px0, f.ph);
      if (px1 - px0 > 68) {
        x.fillStyle = C.text; x.textAlign = 'center'; x.font = '10px Arial';
        x.fillText(vb.l, (px0 + px1) / 2, f.T + 13 + 13 * i);
      }
    }
  }

  /* vertikale Grenzlinien, Beschriftung läuft entlang der Linie nach oben */
  if (d.vlines) for (let i = 0; i < d.vlines.length; i++) {
    const vl = d.vlines[i], px = X(vl.x);
    if (px < f.L + 1 || px > f.L + f.pw - 1) continue;
    x.save();
    x.strokeStyle = vl.c || C.limit; x.lineWidth = 1.3; x.setLineDash([5, 4]);
    x.beginPath(); x.moveTo(px, f.T); x.lineTo(px, f.T + f.ph); x.stroke();
    x.setLineDash([]);
    x.fillStyle = vl.c || C.limit; x.font = '10px Arial'; x.textAlign = 'left';
    x.translate(px - 4, f.T + f.ph - 8); x.rotate(-PI / 2); x.fillText(vl.l, 0, 0);
    x.restore();
  }

  /* horizontales Zielband */
  if (d.band) {
    x.fillStyle = C.band;
    x.fillRect(f.L, Y(d.band[1]), f.pw, Y(d.band[0]) - Y(d.band[1]));
    text(x, 'Zielbereich', w - f.R - 4, Y(d.band[1]) + 13, 'right');
  }

  /* Prozessereignisse (nummerierte Chips + vertikale Linien) */
  if (d.events) for (let i = 0; i < d.events.length; i++) {
    const ev = d.events[i], ex = X(ev.x);
    if (ex < f.L || ex > f.L + f.pw) continue;
    x.strokeStyle = C.event; x.lineWidth = 1; x.globalAlpha = 0.75;
    x.beginPath(); x.moveTo(ex, f.T + 14); x.lineTo(ex, f.T + f.ph); x.stroke();
    x.globalAlpha = 1;
    if (ev.y != null) {
      x.beginPath(); x.arc(ex, Y(ev.y), 4.5, 0, 2 * PI);
      x.fillStyle = C.surface; x.fill();
      x.strokeStyle = C.event; x.lineWidth = 1.5; x.stroke();
    }
    x.beginPath(); x.arc(ex, f.T + 4, 9, 0, 2 * PI);
    x.fillStyle = C.surface; x.fill();
    x.strokeStyle = C.series2; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = C.series2; x.textAlign = 'center'; x.font = 'bold 10px Arial';
    x.fillText('' + ev.n, ex, f.T + 7.5);
  }

  x.save();
  x.beginPath(); x.rect(f.L - 1, f.T - 1, f.pw + 2, f.ph + 2); x.clip();

  /* Flächenfüllung unter der ersten Serie */
  if (d.area) {
    let ad = 'M' + X(d.x[0]).toFixed(1) + ' ' + Y(Math.max(y0, 0)).toFixed(1);
    for (let j = 0; j < d.x.length; j++) ad += 'L' + X(d.x[j]).toFixed(1) + ' ' + Y(d.ys[0].y[j]).toFixed(1);
    ad += 'L' + X(d.x[d.x.length - 1]).toFixed(1) + ' ' + Y(Math.max(y0, 0)).toFixed(1) + 'Z';
    x.fillStyle = C.areaFill;
    x.fill(new Path2D(ad));
  }

  for (let i = 0; i < d.ys.length; i++) {
    x.strokeStyle = d.ys[i].c; x.lineWidth = 2; x.beginPath();
    let started = false;
    for (let j = 0; j < d.x.length; j++) {
      if (!isFinite(d.ys[i].y[j])) { started = false; continue; }
      started ? x.lineTo(X(d.x[j]), Y(d.ys[i].y[j])) : x.moveTo(X(d.x[j]), Y(d.ys[i].y[j]));
      started = true;
    }
    x.stroke();
  }

  /* Kurven-Stützpunkte (Schusskurve) */
  if (d.pts) for (let i = 0; i < d.pts.length; i++) {
    const pt = d.pts[i];
    x.beginPath(); x.arc(X(pt.x), Y(pt.y), 4, 0, 2 * PI);
    x.fillStyle = C.series1; x.fill();
    x.strokeStyle = C.surface; x.lineWidth = 2; x.stroke();
  }
  x.restore();

  /* Legende */
  for (let i = 0; i < d.ys.length; i++) {
    x.fillStyle = d.ys[i].c;
    x.fillRect(f.L + i * 140, 66, 12, 3);
    text(x, d.ys[i].n, f.L + 17 + i * 140, 72, 'left');
  }

  /* horizontale Referenzlinien */
  let hrefs = d.hrefs || [];
  if (d.href != null) hrefs = hrefs.concat([{ y: d.href, l: d.hrefl, c: C.limit }]);
  for (let i = 0; i < hrefs.length; i++) {
    const hr = hrefs[i];
    if (hr.y < y0 || hr.y > y1) continue;
    x.save();
    x.strokeStyle = hr.c || C.limit; x.lineWidth = 1.4; x.setLineDash([6, 4]);
    x.beginPath(); x.moveTo(f.L, Y(hr.y)); x.lineTo(w - f.R, Y(hr.y)); x.stroke();
    x.setLineDash([]);
    x.fillStyle = hr.c || C.limit; x.textAlign = 'right'; x.font = '11px Arial';
    x.fillText(hr.l || '', w - f.R - 4, Y(hr.y) - 4);
    x.restore();
  }

  if (d.pt) marker(x, f, X(d.pt[0]), Y(d.pt[1]), d.ptl);
}

exports.drawLine = drawLine;
});
__define('js/render/heat.js', function (exports, __require) {
/* Heatmaps mit Farbrampe, Konturlinien und Farbbalken. */

const { frame, heading, axes, marker, text, turbo, contours } = __require('js/render/base.js');
const { fmt } = __require('js/core/format.js');
const PI = Math.PI;

function drawHeat(x, w, h, d) {
  heading(x, w, h, d);
  const f = frame(w, h, true);
  const cw = f.pw / d.x.length, ch = f.ph / d.y.length;
  const bx = w - f.R + 18, bw = 17;
  for (let j = 0; j < d.y.length; j++) for (let i = 0; i < d.x.length; i++) {
    x.fillStyle = turbo((d.z[j][i] - d.lo) / (d.hi - d.lo));
    x.fillRect(f.L + i * cw, f.T + f.ph - (j + 1) * ch, cw + 1, ch + 1);
  }
  contours(x, f, d);
  axes(x, w, h, f, d.x[0], d.x[d.x.length - 1], d.y[0], d.y[d.y.length - 1], d);
  for (let i = 0; i < 100; i++) {
    x.fillStyle = turbo(1 - i / 99);
    x.fillRect(bx, f.T + i * f.ph / 100, bw, f.ph / 100 + 1);
  }
  for (let i = 0; i <= 5; i++) text(x, fmt(d.hi - i * (d.hi - d.lo) / 5), bx + bw + 5, f.T + i * f.ph / 5 + 4, 'left');
  x.save(); x.translate(w - 8, f.T + f.ph / 2); x.rotate(-PI / 2); text(x, d.cl, 0, 0); x.restore();
  if (d.pt) {
    const mx0 = d.x[0], mx1 = d.x[d.x.length - 1], my0 = d.y[0], my1 = d.y[d.y.length - 1];
    marker(x, f, f.L + (d.pt[0] - mx0) / (mx1 - mx0) * f.pw, f.T + (my1 - d.pt[1]) / (my1 - my0) * f.ph, d.ptl);
  }
}

exports.drawHeat = drawHeat;
});
__define('js/render/map.js', function (exports, __require) {
/* (φ, L/D)-Auslegungskarte, geometrisch: das machbare Band wird als Polygon
   gefüllt, die Grenzen als analytische Kurven mit Beschriftung gezeichnet.
   Labels werden kollisionsfrei platziert: Grenzkurven-Labels haben Vorrang,
   Iso-Labels weichen aus oder entfallen. */

const { frame, heading, axes, marker } = __require('js/render/base.js');
const { fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
/* Texte der Verletzungsarten — auch vom Hover verwendet. */
const MAP_LABELS = {
  ok: 'machbar',
  bore: 'Kolben-Ø-Bereich verletzt',
  len: 'Kammerlängen-Bereich verletzt',
  bisc: 'Pressrest zu dünn',
  crit: 'v 1. Phase > v_krit'
};

const LEGEND = [
  ['ok', 'machbares Band'],
  ['bore', 'Kolben-Ø-Grenzen'],
  ['len', 'Kammerlängen-Grenzen'],
  ['bisc', 'Pressrest-Grenze (max. Ø)'],
  ['crit', 'v_krit-Grenze (1. Phase)']
];

const LINE_FALLBACK = { bore: '#123a6b', len: '#7b5cd6', bisc: '#b28000', crit: '#c2447e' };

function lineColor(t) { return (theme.mapLines && theme.mapLines[t]) || LINE_FALLBACK[t]; }

function drawMap(x, w, h, d) {
  heading(x, w, h, d);
  const C = theme.chart, MAPC = theme.map;
  const f = frame(w, h, false);
  const x0 = 0, x1 = 100, y0 = d.rMin, y1 = d.rMax;
  const X = a => f.L + (a - x0) / (x1 - x0) * f.pw;
  const Y = a => f.T + (y1 - a) / (y1 - y0) * f.ph;
  axes(x, w, h, f, x0, x1, y0, y1, d);

  /* Kollisionsfreie Label-Platzierung: belegte Rechtecke merken; ein Label,
     das nirgendwo Platz findet, entfällt. Gibt die Position zurück oder null. */
  const placed = [];
  function tryLabel(bx, by, lw, lh) {
    if (bx < f.L + 1) bx = f.L + 1;
    if (bx + lw > f.L + f.pw - 1) bx = f.L + f.pw - 1 - lw;
    if (by < f.T + 1 || by + lh > f.T + f.ph - 1) return null;
    for (const r of placed) {
      if (bx < r[0] + r[2] && bx + lw > r[0] && by < r[1] + r[3] && by + lh > r[1]) return null;
    }
    placed.push([bx, by, lw, lh]);
    return [bx, by];
  }

  x.save();
  x.beginPath(); x.rect(f.L, f.T, f.pw, f.ph); x.clip();

  /* Machbares Band als gefüllte Polygone */
  x.fillStyle = MAPC.ok;
  d.band.forEach(poly => {
    if (poly.length < 3) return;
    x.beginPath();
    x.moveTo(X(poly[0][0]), Y(poly[0][1]));
    for (let i = 1; i < poly.length; i++) x.lineTo(X(poly[i][0]), Y(poly[i][1]));
    x.closePath();
    x.fill();
  });

  /* Zielband-Text vormerken (wird unten gezeichnet, reserviert aber Platz) */
  let zielRect = null;
  if (d.fillMin > 0) {
    x.font = '10px Arial';
    const zl = 'Ziel φ ' + fmt(d.fillMin) + '–' + fmt(d.fillMax) + ' %';
    const tw = x.measureText(zl).width;
    const cx = X((d.fillMin + d.fillMax) / 2);
    const pos = tryLabel(cx - tw / 2 - 2, f.T + f.ph - 17, tw + 4, 13);
    if (pos) zielRect = { l: zl, x: pos[0] + 2 + tw / 2, y: pos[1] + 11 };
  }

  /* Dezente Iso-Hilfslinien zeichnen, Labels erst nach den Kurvenlabels platzieren */
  const isoLabels = [];
  x.strokeStyle = C.isoLine; x.lineWidth = 0.8;
  x.globalAlpha = 0.55;
  d.iso.forEach(iso => {
    x.beginPath();
    const vis = [];
    for (let i = 0; i < iso.p.length; i++) {
      const ax = X(iso.p[i][0]), ay = Y(iso.p[i][1]);
      vis.push([ax, ay]);
      vis.length === 1 ? x.moveTo(ax, ay) : x.lineTo(ax, ay);
    }
    x.stroke();
    if (vis.length > 1) {
      const anchor = iso.end ? vis[vis.length - 1] : vis[0];
      isoLabels.push({ l: iso.l, cands: [anchor, vis[Math.floor(vis.length / 2)]] });
    }
  });
  x.globalAlpha = 1;

  /* Grenzkurven mit Beschriftung (Vorrang bei der Platzierung) */
  d.curves.forEach((c, idx) => {
    const col = lineColor(c.t);
    x.strokeStyle = col; x.lineWidth = 1.8;
    x.beginPath();
    let started = false;
    for (let i = 0; i < c.p.length; i++) {
      const ax = X(c.p[i][0]), ay = Y(c.p[i][1]);
      started ? x.lineTo(ax, ay) : x.moveTo(ax, ay);
      started = true;
    }
    x.stroke();

    const visPts = c.p.filter(p => p[1] > y0 + 0.1 && p[1] < y1 - 0.1);
    if (visPts.length > 3) {
      x.font = 'bold 10px Arial';
      const tw = x.measureText(c.l).width;
      const base = 0.25 + (idx % 3) * 0.22;
      const cands = [base, base + 0.15, base - 0.15, base + 0.3, base - 0.3, 0.5, 0.75];
      for (const fr of cands) {
        const at = visPts[Math.max(0, Math.min(visPts.length - 1, Math.floor(visPts.length * fr)))];
        const pos = tryLabel(X(at[0]) - tw / 2 - 3, Y(at[1]) - 16, tw + 6, 13);
        if (pos) {
          x.fillStyle = 'rgba(255,255,255,.88)';
          x.fillRect(pos[0], pos[1], tw + 6, 13);
          x.fillStyle = col; x.textAlign = 'left';
          x.fillText(c.l, pos[0] + 3, pos[1] + 10);
          break;
        }
      }
    }
  });

  /* Iso-Labels in die verbleibenden Lücken */
  x.font = '9.5px Arial'; x.fillStyle = C.iso; x.globalAlpha = 0.8;
  isoLabels.forEach(il => {
    const tw = x.measureText(il.l).width;
    for (const a2 of il.cands) {
      const pos = tryLabel(a2[0] + 2, a2[1] - 13, tw + 4, 11);
      if (pos) { x.textAlign = 'left'; x.fillText(il.l, pos[0] + 2, pos[1] + 9); break; }
    }
  });
  x.globalAlpha = 1;

  /* Füllgrad-Zielband */
  x.strokeStyle = C.series1; x.setLineDash([5, 4]); x.lineWidth = 1.2;
  [d.fillMin, d.fillMax].forEach(fv => {
    if (fv > 0 && fv < 100) { x.beginPath(); x.moveTo(X(fv), f.T); x.lineTo(X(fv), f.T + f.ph); x.stroke(); }
  });
  x.setLineDash([]);
  if (zielRect) {
    x.fillStyle = C.series1; x.font = '10px Arial'; x.textAlign = 'center';
    x.fillText(zielRect.l, zielRect.x, zielRect.y);
  }

  x.restore();

  /* Legende */
  let lx = f.L, ly = 64;
  x.font = '10.5px Arial';
  for (const [key, lab] of LEGEND) {
    if (key === 'bisc' && !d.curves.some(c => c.t === 'bisc')) continue;
    if (key === 'crit' && !d.curves.some(c => c.t === 'crit')) continue;
    const tw = x.measureText(lab).width;
    if (lx + tw + 22 > w - f.R) { lx = f.L; ly += 13; }
    if (key === 'ok') {
      x.fillStyle = theme.map.ok; x.fillRect(lx, ly - 8, 11, 9);
      x.strokeStyle = C.axis; x.strokeRect(lx, ly - 8, 11, 9);
    } else {
      x.fillStyle = lineColor(key); x.fillRect(lx, ly - 6, 11, 3);
    }
    x.fillStyle = C.text; x.textAlign = 'left'; x.fillText(lab, lx + 15, ly);
    lx += tw + 30;
  }

  if (d.cur) marker(x, f, X(d.cur.phi), Y(d.cur.r), d.cur.l);
}

exports.drawMap = drawMap;
exports.MAP_LABELS = MAP_LABELS;
});
__define('js/render/donut.js', function (exports, __require) {
/* Ringdiagramm (Materialausbeute). */

const { heading } = __require('js/render/base.js');
const { fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const PI = Math.PI;

function donutGeom(w, h) {
  const T = 62, B = 24, cy = T + (h - T - B) / 2;
  const R = Math.min(w * 0.27, (h - T - B) * 0.40);
  const cx = Math.max(R + 22, w * 0.32);
  return { cx, cy, R, r0: R * 0.6 };
}

function drawDonut(x, w, h, d) {
  heading(x, w, h, d);
  const C = theme.chart;
  const g = donutGeom(w, h), tot = d.total || 1;
  let a0 = -PI / 2;
  for (let i = 0; i < d.segs.length; i++) {
    const s = d.segs[i], a1 = a0 + 2 * PI * s.kg / tot;
    x.beginPath();
    x.arc(g.cx, g.cy, g.R, a0, a1);
    x.arc(g.cx, g.cy, g.r0, a1, a0, true);
    x.closePath();
    x.fillStyle = s.c; x.fill();
    x.strokeStyle = C.surface; x.lineWidth = 2; x.stroke();
    a0 = a1;
  }
  x.fillStyle = C.text; x.textAlign = 'center'; x.font = 'bold 26px Arial';
  x.fillText(fmt(d.share) + ' %', g.cx, g.cy + 2);
  x.fillStyle = theme.ui.muted; x.font = '11px Arial';
  x.fillText('Ausbeute', g.cx, g.cy + 20);

  let lx = g.cx + g.R + 24, ly = g.cy - (d.segs.length - 1) * 13;
  x.font = '11.5px Arial';
  for (let i = 0; i < d.segs.length; i++) {
    const s = d.segs[i];
    x.fillStyle = s.c; x.fillRect(lx, ly - 9, 11, 11);
    x.strokeStyle = C.surface; x.strokeRect(lx, ly - 9, 11, 11);
    x.fillStyle = C.text; x.textAlign = 'left';
    x.fillText(s.n + '  ' + fmt(s.kg) + ' kg · ' + fmt(100 * s.kg / tot) + ' %', lx + 17, ly);
    ly += 26;
  }
}

exports.donutGeom = donutGeom;
exports.drawDonut = drawDonut;
});
__define('js/render/draw.js', function (exports, __require) {
/* Dispatcher: wählt anhand der Diagrammdaten den passenden Renderer. */

const { drawLine } = __require('js/render/line.js');
const { drawHeat } = __require('js/render/heat.js');
const { drawMap } = __require('js/render/map.js');
const { drawDonut } = __require('js/render/donut.js');
const { text } = __require('js/render/base.js');
const { theme } = __require('js/core/theme.js');
function drawAny(x, w, h, d, def) {
  if (d.err) { errCanvas(x, w, h, d); return; }
  if ((def && def.heat) || d.z) drawHeat(x, w, h, d);
  else if (d.kind === 'map') drawMap(x, w, h, d);
  else if (d.kind === 'donut') drawDonut(x, w, h, d);
  else drawLine(x, w, h, d);
}

function errCanvas(x, w, h, d) {
  x.fillStyle = theme.chart.surface;
  x.fillRect(0, 0, w, h);
  text(x, d.title || '', w / 2, 22, 'center', 'bold 15px Arial');
  x.fillStyle = theme.ui.bad;
  x.textAlign = 'center'; x.font = 'bold 13px Arial';
  x.fillText('⚠ ' + d.err, w / 2, h / 2);
}

exports.drawAny = drawAny;
});
__define('js/render/hover.js', function (exports, __require) {
/* Hover-Auswertung: zeigt unter jedem Diagramm den Wert an der Mausposition. */

const { frame } = __require('js/render/base.js');
const { donutGeom } = __require('js/render/donut.js');
const { MAP_LABELS } = __require('js/render/map.js');
const { fmt } = __require('js/core/format.js');
const { theme } = __require('js/core/theme.js');
const { vCrit } = __require('js/core/physics.js');
const PI = Math.PI;
const HOVER_IDLE = 'Bewege die Maus über das Diagramm, um den aktuellen Wert anzuzeigen.';

function interp(xs, ys, xv) {
  if (xv <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (xv <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (xv - xs[i - 1]) / (xs[i] - xs[i - 1]);
  }
  return ys[ys.length - 1];
}

function heatVal(d, xv, yv) {
  const nx = d.x.length, ny = d.y.length;
  let i = 0, j = 0;
  while (i < nx - 2 && d.x[i + 1] < xv) i++;
  while (j < ny - 2 && d.y[j + 1] < yv) j++;
  let tx = (xv - d.x[i]) / (d.x[i + 1] - d.x[i]);
  let ty = (yv - d.y[j]) / (d.y[j + 1] - d.y[j]);
  tx = Math.max(0, Math.min(1, tx)); ty = Math.max(0, Math.min(1, ty));
  const z00 = d.z[j][i], z10 = d.z[j][i + 1], z01 = d.z[j + 1][i], z11 = d.z[j + 1][i + 1];
  return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) + z01 * (1 - tx) * ty + z11 * tx * ty;
}

function showHover(card, ev) {
  const d = card.data, box = card.querySelector('.hover-value'), cv = card.querySelector('canvas');
  const r = cv.getBoundingClientRect(), w = r.width, h = r.height;
  const px = ev.clientX - r.left, py = ev.clientY - r.top;
  if (!d || d.err) { box.textContent = HOVER_IDLE; return; }

  if (d.kind === 'donut') {
    const g = donutGeom(w, h), dx = px - g.cx, dy = py - g.cy, rr = Math.sqrt(dx * dx + dy * dy);
    if (rr < g.r0 || rr > g.R) { box.textContent = HOVER_IDLE; return; }
    const ang = (Math.atan2(dy, dx) + PI / 2 + 2 * PI) % (2 * PI);
    let acc = 0;
    for (let i = 0; i < d.segs.length; i++) {
      acc += 2 * PI * d.segs[i].kg / d.total;
      if (ang <= acc) {
        box.innerHTML = '<b>' + d.segs[i].n + ':</b> ' + fmt(d.segs[i].kg) + ' kg · ' + fmt(100 * d.segs[i].kg / d.total) + ' % vom Dosiergewicht (' + fmt(d.total) + ' kg)';
        return;
      }
    }
    box.textContent = HOVER_IDLE; return;
  }

  const f = d.z ? frame(w, h, true) : frame(w, h, false);
  if (px < f.L || px > w - f.R || py < f.T || py > h - f.B) { box.textContent = HOVER_IDLE; return; }

  if (d.kind === 'map') {
    /* Exakt aus den Formeln ausgewertet — kein Raster-Snapping. */
    const xv = (px - f.L) / f.pw * 100;
    const yv = d.rMax - (py - f.T) / f.ph * (d.rMax - d.rMin);
    const phi = xv / 100, P = d.params;
    if (phi <= 0 || phi >= 1 || yv <= 0) { box.textContent = HOVER_IDLE; return; }
    const D = Math.cbrt(4 * P.V / (PI * phi * yv));       // m
    const L = yv * D;                                     // m
    const b = 4 * P.Vb / (PI * D * D) * 1000;             // mm
    const vc = vCrit(D, phi);                             // m/s
    const bad = [];
    if (D * 1000 < P.dmin || D * 1000 > P.dmax) bad.push('bore');
    if (L * 1000 < P.lmin || L * 1000 > P.lmax) bad.push('len');
    if (b < P.biscuitMin) bad.push('bisc');
    if (P.v1 > vc) bad.push('crit');
    const verdict = bad.length
      ? '<b style="color:' + theme.ui.bad + '">verletzt: ' + bad.map(k => MAP_LABELS[k]).join(', ') + '</b>'
      : '<b style="color:' + theme.ui.ok + '">MACHBAR</b>';
    box.innerHTML = '<b>φ:</b> ' + fmt(xv) + ' % · <b>L/D:</b> ' + fmt(yv) + ' → <b>Ø</b> ' + fmt(D * 1000) + ' mm · <b>L</b> ' + fmt(L * 1000) + ' mm · <b>Pressrest</b> ' + fmt(b) + ' mm · <b>v_krit</b> ' + fmt(vc) + ' m/s · ' + verdict;
    return;
  }

  const x0 = d.x[0], x1 = d.x[d.x.length - 1];
  const xv = x0 + (px - f.L) / f.pw * (x1 - x0);
  if (d.z) {
    const y0 = d.y[0], y1 = d.y[d.y.length - 1];
    const yv = y1 - (py - f.T) / f.ph * (y1 - y0);
    box.innerHTML = '<b>' + d.xl + ':</b> ' + fmt(xv) + ' · <b>' + d.yl + ':</b> ' + fmt(yv) + ' · <b>' + d.cl + ':</b> ' + fmt(heatVal(d, xv, yv));
  } else {
    let msg = '<b>' + d.xl + ':</b> ' + fmt(xv);
    for (let i = 0; i < d.ys.length; i++) msg += ' · <b>' + d.ys[i].n + ':</b> ' + fmt(interp(d.x, d.ys[i].y, xv));
    box.innerHTML = msg + ' <span class="unit">' + d.yl + '</span>';
  }
}

exports.showHover = showHover;
exports.HOVER_IDLE = HOVER_IDLE;
});
__define('js/ui/export.js', function (exports, __require) {
/* Export/Import: PNG in Zwischenablage, Schusskurven-CSV, Auslegung als JSON. */

const { drawAny } = __require('js/render/draw.js');
const { state, notify } = __require('js/core/state.js');
const { applyValues } = __require('js/ui/inputs.js');
const { renderCurveTable } = __require('js/ui/curveTable.js');
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/* Diagramm hochauflösend neu zeichnen und als PNG kopieren (Fallback: Download). */
function copyChart(card, def) {
  const d = card.data;
  const W = def && def.wide ? 1400 : 1000;
  const H = def && def.wide ? Math.round(1400 * (def.aspect || 0.5)) : 800;
  const o = document.createElement('canvas');
  o.width = W; o.height = H;
  drawAny(o.getContext('2d'), W, H, d, def);
  o.toBlob(blob => {
    const b = card.querySelector('.png-btn'), old = b.innerHTML;
    const ok = () => { b.classList.add('copied'); b.innerHTML = CHECK_SVG; };
    if (navigator.clipboard && window.ClipboardItem)
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(ok, () => { download(blob, 'DieLogic_' + def.id + '.png'); ok(); });
    else { download(blob, 'DieLogic_' + def.id + '.png'); ok(); }
    setTimeout(() => { b.classList.remove('copied'); b.innerHTML = old; }, 1400);
  }, 'image/png');
}

/* Schusskurven-Samples + Ereignisse als CSV. */
function exportShotCSV(shot) {
  if (!shot || shot.error) { alert('Schusskurve ungültig — kein Export möglich.'); return; }
  const sm = shot.samples, gate = !!shot.gateR;
  let csv = 'zeit_s,weg_mm,geschwindigkeit_m_s,beschleunigung_m_s2' + (gate ? ',anschnittgeschwindigkeit_m_s' : '') + '\n';
  for (let i = 0; i < sm.t.length; i++) {
    csv += sm.t[i].toFixed(6) + ',' + sm.s[i].toFixed(3) + ',' + sm.v[i].toFixed(4) + ',' + sm.a[i].toFixed(3)
      + (gate ? ',' + (sm.v[i] * shot.gateR).toFixed(3) : '') + '\n';
  }
  csv += '\nereignis,hub_mm,zeit_s,kolben_v_m_s,anschnitt_v_m_s\n';
  shot.events.forEach(e => {
    csv += e.name.replace(/,/g, ';') + ',' + e.s.toFixed(2) + ','
      + (e.inP ? e.t.toFixed(4) : '') + ',' + (e.inP ? e.v.toFixed(4) : '') + ','
      + (e.inP && e.gv !== null ? e.gv.toFixed(3) : '') + '\n';
  });
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'DieLogic_Schusskurve.csv');
}

/* Komplette Auslegung (Werte + Kurve + Preset) als JSON-Datei. */
function saveStateJSON() {
  const data = { values: state.values, curve: state.curve, machine: state.machine };
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'DieLogic_Auslegung.json');
  const sb = document.getElementById('saveBtn');
  if (sb) {
    const old = sb.textContent;
    sb.textContent = 'Gespeichert ✓';
    setTimeout(() => { sb.textContent = old; }, 1600);
  }
}

/* JSON-Auslegung laden und anwenden. */
function loadStateJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (data.values) applyValues(data.values);
      if (Array.isArray(data.curve) && data.curve.length) {
        state.curve = data.curve.map(p => [Number(p[0]), Number(p[1])]);
        renderCurveTable();
      }
      state.machine = data.machine || '';
      const ms = document.getElementById('machineSel');
      if (ms) ms.value = state.machine;
      notify();
    } catch (e) {
      alert('Datei konnte nicht gelesen werden: ' + e.message);
    }
  };
  r.readAsText(file);
}

exports.copyChart = copyChart;
exports.exportShotCSV = exportShotCSV;
exports.saveStateJSON = saveStateJSON;
exports.loadStateJSON = loadStateJSON;
});
__define('js/ui/cards.js', function (exports, __require) {
/* Diagramm-Karten: DOM-Aufbau (Kopf, Tabs, Buttons, Canvas, Hover-Zeile)
   und das Neuzeichnen einer Karte. */

const { drawAny } = __require('js/render/draw.js');
const { showHover, HOVER_IDLE } = __require('js/render/hover.js');
const { notify } = __require('js/core/state.js');
const { copyChart, exportShotCSV } = __require('js/ui/export.js');
const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const TARGET_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>';

/* opts: { link: Link zur Einzelseite anzeigen, forceWide: volle Breite,
   fitHeight: Canvas-Höhe an den sichtbaren Inhaltsbereich anpassen (Einzelseite),
   onHighlight(def, btn): Callback des Eingabe-Hervorheben-Buttons } */
function buildCard(def, container, opts = {}) {
  const card = document.createElement('article');
  card.className = 'card' + ((def.wide || opts.forceWide) ? ' wide' : '');
  card.dataset.chart = def.id;
  if (opts.fitHeight) card.dataset.fit = '1';

  let tabsHtml = '';
  if (def.tabs) {
    tabsHtml = '<div class="tabs">' + def.tabs.map(t =>
      '<button data-tab="' + t[0] + '"' + (def.tab === t[0] ? ' class="active"' : '') + '>' + t[1] + '</button>'
    ).join('') + '</div>';
  }
  const hlHtml = opts.onHighlight
    ? '<button class="hl-btn" title="Eingaben dieses Diagramms in der Seitenleiste hervorheben" aria-label="Eingaben hervorheben">' + TARGET_SVG + '</button>'
    : '';
  const csvHtml = def.csv
    ? '<button class="csv-btn" title="Kurven-Samples als CSV herunterladen">CSV ⬇</button>'
    : '';
  const linkHtml = opts.link
    ? '<a class="single-link" href="chart.html?id=' + def.id + '" title="Diagramm als Einzelseite öffnen">↗</a>'
    : '';

  card.innerHTML =
    '<div class="head"><div><h3>' + def.title + '</h3><small>' + def.desc + '</small></div>' +
    '<div class="head-right">' + tabsHtml + hlHtml + csvHtml +
    '<button class="png-btn" title="Als PNG kopieren" aria-label="Als PNG kopieren">' + COPY_SVG + '</button>' +
    linkHtml + '</div></div>' +
    '<div class="body"><div class="canvas-wrap"><canvas></canvas></div>' +
    '<div class="hover-value">' + HOVER_IDLE + '</div>' +
    (def.extraHTML ? def.extraHTML() : '') + '</div>';

  card.querySelectorAll('.tabs button').forEach(b => {
    b.onclick = () => {
      def.tab = b.dataset.tab;
      b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      notify();
    };
  });
  card.querySelector('.png-btn').onclick = () => copyChart(card, def);
  const csvBtn = card.querySelector('.csv-btn');
  if (csvBtn) csvBtn.onclick = () => exportShotCSV(card.shot);
  const hlBtn = card.querySelector('.hl-btn');
  if (hlBtn) hlBtn.onclick = () => opts.onHighlight(def, hlBtn);

  const cv = card.querySelector('canvas');
  cv.onmousemove = ev => showHover(card, ev);
  cv.onmouseleave = () => { card.querySelector('.hover-value').textContent = HOVER_IDLE; };

  container.appendChild(card);
  return card;
}

function renderCard(card, def, v, shot) {
  const d = def.calc(v, { shot });
  d.title = def.title;
  card.data = d;
  card.shot = shot;

  const wrap = card.querySelector('.canvas-wrap');
  const w = Math.max(340, Math.floor(wrap.clientWidth || 600));
  let h = Math.round(w * (def.aspect || 0.8));
  /* Einzelseite: Höhe so kappen, dass Diagramm + Hover-Zeile in den sichtbaren
     Inhaltsbereich passen (nur im Desktop-Layout mit fester Spaltenhöhe). */
  if (card.dataset.fit && document.documentElement.clientWidth > 1080) {
    const cont = card.closest('.content');
    const head = card.querySelector('.head');
    if (cont && cont.clientHeight > 300) {
      const avail = cont.clientHeight - (head ? head.offsetHeight : 52) - 96;
      h = Math.max(300, Math.min(h, avail));
    }
  }
  wrap.style.height = h + 'px';
  const cv = wrap.querySelector('canvas');
  const pr = window.devicePixelRatio || 1;
  cv.width = w * pr; cv.height = h * pr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const x = cv.getContext('2d');
  x.setTransform(pr, 0, 0, pr, 0, 0);
  drawAny(x, w, h, d, def);

  if (def.renderExtras) def.renderExtras(card, shot, v);
}

exports.buildCard = buildCard;
exports.renderCard = renderCard;
});
__define('js/core/simapi.js', function (exports, __require) {
/* Anbindung an das Simulations-Backend (hpdcsim hinter FastAPI, backend/).
   Reines Fetch — bei statischem Hosting oder file:// schlägt der Aufruf fehl
   und die Simulationskarte zeigt einen Hinweis (graceful degradation). */

function toSimPayload(values, curve, count = 400) {
  return { values, curve, count };
}

async function fetchSim(payload, signal) {
  const r = await fetch('/api/sim/shot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try {
      const j = await r.json();
      if (typeof j.detail === 'string') msg = j.detail;
    } catch (e) { /* Nicht-JSON-Fehlerseite */ }
    throw new Error(msg);
  }
  return r.json();
}

exports.toSimPayload = toSimPayload;
exports.fetchSim = fetchSim;
});
__define('js/ui/simcard.js', function (exports, __require) {
/* Simulationskarte „Luftdruck in der Kammer" — serverseitig gerechnet
   (hpdcsim). Debounced Fetch bei jeder Zustandsänderung; ohne erreichbares
   Backend bleibt die Karte mit einem Hinweis stehen, der Rest des Dashboards
   ist davon unabhängig. */

const { state, subscribe } = __require('js/core/state.js');
const { theme } = __require('js/core/theme.js');
const { drawAny } = __require('js/render/draw.js');
const { fmt } = __require('js/core/format.js');
const { toSimPayload, fetchSim } = __require('js/core/simapi.js');
const P_CLIP_MBAR = 10000;   // Anzeige kappen: Modell divergiert bei Restluft → 0
const DEBOUNCE_MS = 350;

let card = null, statusEl = null, timer = null, ctrl = null, lastRes = null;

const EVENT_NAMES = {
  pour_hole_sealed: 'Einguss dicht',
  sleeve_full: 'Kammer voll',
  runner_full: 'Anguss gefüllt',
  part_full: 'Bauteil gefüllt',
  overflow_full: 'Überlauf gefüllt',
  shot_end: 'Schussende'
};

function initSimCard(container) {
  if (!container) return;
  card = document.createElement('div');
  card.className = 'card wide';
  card.innerHTML =
    '<div class="head"><div><h3>Luftdruck in der Kammer (Simulation)</h3>' +
    '<small>hpdcsim — quasistatisches Schussmodell, serverseitig gerechnet</small></div>' +
    '<div class="head-right"><small>Backend</small></div></div>' +
    '<div class="body"><div class="canvas-wrap"><canvas></canvas></div>' +
    '<div class="hover-value" data-status>Warte auf erste Berechnung …</div></div>';
  container.appendChild(card);
  statusEl = card.querySelector('[data-status]');

  subscribe(schedule);
  window.addEventListener('resize', () => { if (lastRes) draw(); });
  schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, DEBOUNCE_MS);
}

async function run() {
  if (ctrl) ctrl.abort();
  ctrl = new AbortController();
  statusEl.textContent = 'Simulation läuft …';
  try {
    lastRes = await fetchSim(toSimPayload(state.values, state.curve), ctrl.signal);
    draw();
    statusEl.innerHTML = statusText(lastRes);
  } catch (e) {
    if (e.name === 'AbortError') return;
    lastRes = null;
    drawEmpty(e instanceof TypeError
      ? 'Simulations-Backend nicht erreichbar'
      : e.message);
    statusEl.innerHTML = e instanceof TypeError
      ? 'Kein Backend: Die Simulation braucht den DieLogic-Server ' +
        '(<code>uvicorn backend.app:app</code>, siehe backend/README). ' +
        'Alle übrigen Diagramme rechnen weiter lokal.'
      : '⚠ ' + e.message;
  }
}

function statusText(res) {
  const m = res.meta;
  const parts = ['φ = ' + fmt(m.phi * 100) + ' %',
    'Füllende bei ' + fmt(m.fill_complete_mm) + ' mm',
    'Pressrest ' + fmt(m.biscuit_mm) + ' mm'];
  if (m.curve_clamped) parts.push('Kurve am Füllende gekappt');
  if (res.critical_crossing) {
    parts.push('<b>v<sub>krit</sub> überschritten ab ' +
      fmt(res.critical_crossing.s_mm) + ' mm (Garber/López)</b>');
  }
  return parts.join(' · ');
}

function buildSpec(res) {
  const s = res.samples;
  const x = [], y = [];
  for (let i = 0; i < s.s_mm.length; i++) {
    const p = s.p_air_mbar[i];
    if (s.s_mm[i] === null || p === null || p > P_CLIP_MBAR) break;
    x.push(s.s_mm[i]);
    y.push(p);
  }
  return {
    x,
    ys: [{ n: 'Luftdruck [mbar]', c: theme.chart.series2, y }],
    xl: 'Kolbenweg s [mm]',
    yl: 'p Luft [mbar]',
    info: 'Anzeige bis ' + fmt(P_CLIP_MBAR) + ' mbar — nahe der vollständigen ' +
      'Füllung divergiert das Modell (Restluftvolumen → 0).'
  };
}

function draw() {
  drawTo(buildSpec(lastRes));
}

function drawEmpty(msg) {
  drawTo({ err: msg, title: 'Luftdruck in der Kammer' });
}

function drawTo(spec) {
  const wrap = card.querySelector('.canvas-wrap');
  const w = Math.max(340, Math.floor(wrap.clientWidth || 600));
  const h = Math.round(w * 0.45);
  wrap.style.height = h + 'px';
  const cv = wrap.querySelector('canvas');
  const pr = window.devicePixelRatio || 1;
  cv.width = w * pr; cv.height = h * pr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const x = cv.getContext('2d');
  x.setTransform(pr, 0, 0, pr, 0, 0);
  drawAny(x, w, h, spec, { id: 'simair' });
}

exports.initSimCard = initSimCard;
});
__define('js/main.js', function (exports, __require) {
/* Einstieg Dashboard-Seite (index.html): alle Diagramme + KPIs + volle Sidebar. */

const { loadTheme } = __require('js/core/theme.js');
const { state, subscribe, notify, resetState } = __require('js/core/state.js');
const { computeShot } = __require('js/core/physics.js');
const { charts } = __require('js/charts/registry.js');
const { buildInputs, validate, highlightInputs, clearHighlights, applyValues } = __require('js/ui/inputs.js');
const { initPresetSelect } = __require('js/ui/presets.js');
const { renderCurveTable, wireAddPoint } = __require('js/ui/curveTable.js');
const { renderKpis } = __require('js/ui/kpis.js');
const { buildCard, renderCard } = __require('js/ui/cards.js');
const { initSimCard } = __require('js/ui/simcard.js');
const cards = {};
let activeHl = null;

function onHighlight(def, btn) {
  document.querySelectorAll('.hl-btn.active').forEach(b => { if (b !== btn) b.classList.remove('active'); });
  if (activeHl === def) {
    activeHl = null;
    btn.classList.remove('active');
    clearHighlights();
    return;
  }
  activeHl = def;
  btn.classList.add('active');
  highlightInputs(def.inputs, { curve: def.usesCurve });
}

function render() {
  const v = state.values;
  const shot = computeShot(v, state.curve);
  validate(v);
  renderKpis(document.getElementById('summary'), v, shot);
  charts.forEach(def => renderCard(cards[def.id], def, v, shot));
}

async function init() {
  await loadTheme();
  await initPresetSelect(document.getElementById('machineSel'));
  buildInputs(document.getElementById('groups'));
  renderCurveTable();
  wireAddPoint(document.getElementById('addPoint'));

  const chartsEl = document.getElementById('charts');
  charts.forEach(def => { cards[def.id] = buildCard(def, chartsEl, { link: true, onHighlight }); });
  initSimCard(document.getElementById('simcharts'));

  document.getElementById('resetBtn').onclick = () => {
    resetState();
    applyValues(state.values);
    const ms = document.getElementById('machineSel');
    if (ms) ms.value = '';
    renderCurveTable();
    notify();
  };

  let rt;
  window.onresize = () => { clearTimeout(rt); rt = setTimeout(render, 120); };

  subscribe(render);
  requestAnimationFrame(() => requestAnimationFrame(render));
}

init().catch(e => {
  const el = document.getElementById('error');
  if (el) el.textContent = 'Initialisierungsfehler: ' + e.message;
  console.error(e);
});

});
__define('js/single.js', function (exports, __require) {
/* Einstieg Einzelseite (chart.html?id=<chart-id>): ein Diagramm in voller
   Breite, in der Sidebar nur die Eingaben, die dieses Diagramm beeinflussen. */

const { loadTheme } = __require('js/core/theme.js');
const { state, subscribe } = __require('js/core/state.js');
const { computeShot } = __require('js/core/physics.js');
const { charts, chartsById } = __require('js/charts/registry.js');
const { PRESET_KEYS } = __require('js/config/fields.js');
const { buildInputs, validate } = __require('js/ui/inputs.js');
const { initPresetSelect } = __require('js/ui/presets.js');
const { renderCurveTable, wireAddPoint } = __require('js/ui/curveTable.js');
const { buildCard, renderCard } = __require('js/ui/cards.js');
const id = new URLSearchParams(location.search).get('id');
const def = chartsById[id] || charts[0];
let card = null;
let mathSec = null;

function render() {
  const v = state.values;
  const shot = computeShot(v, state.curve);
  validate(v);
  renderCard(card, def, v, shot);
  if (mathSec && def.renderMath) def.renderMath(mathSec, v, shot);
}

async function init() {
  await loadTheme();
  document.title = def.title + ' · DieLogic Dashboard';
  document.getElementById('chartTitle').textContent = def.title;
  document.getElementById('chartDesc').textContent = def.desc;

  /* Navigation zwischen den Einzelseiten */
  const nav = document.getElementById('chartNav');
  charts.forEach(c => {
    const op = document.createElement('option');
    op.value = c.id;
    op.textContent = c.title;
    if (c === def) op.selected = true;
    nav.appendChild(op);
  });
  nav.onchange = () => { location.href = 'chart.html?id=' + nav.value; };

  /* Maschinen-Preset nur zeigen, wenn das Diagramm Preset-Felder nutzt */
  const showPreset = def.inputs.some(k => PRESET_KEYS[k]);
  if (showPreset) await initPresetSelect(document.getElementById('machineSel'));
  else document.getElementById('preset-group').style.display = 'none';

  buildInputs(document.getElementById('groups'), new Set(def.inputs));

  if (def.usesCurve) {
    renderCurveTable();
    wireAddPoint(document.getElementById('addPoint'));
  } else {
    document.getElementById('curve-group').style.display = 'none';
  }

  card = buildCard(def, document.getElementById('charts'), { link: false, forceWide: true, fitHeight: true });

  /* Mathe-Erklärung unter dem Diagramm (nur auf der Einzelseite) */
  if (def.mathHTML) {
    mathSec = document.createElement('section');
    mathSec.className = 'card wide math-panel';
    mathSec.innerHTML =
      '<div class="head"><div><h3>Mathematik &amp; Herleitung</h3>' +
      '<small>Alle Gleichungen dieses Diagramms — Zahlenwerte folgen den Eingaben live</small></div></div>' +
      '<div class="body math-body">' + def.mathHTML() + '</div>';
    document.getElementById('charts').appendChild(mathSec);
  }

  let rt;
  window.onresize = () => { clearTimeout(rt); rt = setTimeout(render, 120); };

  subscribe(render);
  requestAnimationFrame(() => requestAnimationFrame(render));
}

init().catch(e => {
  const el = document.getElementById('error');
  if (el) el.textContent = 'Initialisierungsfehler: ' + e.message;
  console.error(e);
});

});

var __el = document.currentScript;
var __entry = (__el && __el.getAttribute('data-entry')) || 'main';
__require('js/' + __entry + '.js');
})();
