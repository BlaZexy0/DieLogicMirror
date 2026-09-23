/* Erzeugt die Diagramme der Theorie-Artikel (web/assets/theorie/) als
   statische SVGs: ein minimaler Canvas-2D-Recorder spielt die echten
   Dashboard-Renderer (drawAny()) mit den Standardwerten ab und schreibt, was
   sie zeichnen, als SVG. Abdeckung: genau die API, die drawLine/drawLimits/
   base.js benutzen.

   Farben sind Rollen. Auf der Seite setzt shared/svgfarben.js die Bilder ins
   Dokument, dort gelten die CSS-Tokens des gewählten Schemas. Dafür trägt
   jede Farbe ihre Rolle als Klasse (f-melt: Füllung in der Farbe der
   Schmelze, s-die: Strich in der des Werkzeugs) und daneben den Standardwert
   der Rolle als gewöhnliches Attribut: als Datei geöffnet (Browser,
   Inkscape) zeigt das Bild den Standard.

   Welche Rolle hinter einem Farbwert steht, verrät der Wert allein nicht:
   im Standard sind Schrift und Petrol dasselbe #002733, die Achse X und die
   Maschine dasselbe #ac6eef. Darum zeichnet der Generator mit Wächterfarben:
   jede Rolle der Palette bekommt für die Dauer des Zeichnens einen eigenen
   Wert, den es sonst nirgends gibt, theme.derive() leitet daraus die Rollen
   der Diagramme ab, und jede Farbe, die ein Renderer setzt, führt eindeutig
   auf ihre Rolle zurück, auch als rgba() mit Deckkraft. Die Deckkraft wird
   zu fill-opacity/stroke-opacity: rgba() in einem Attribut zeigt Inkscape
   schwarz. Was sich nicht zurückführen lässt (ein fester Farbwert im
   Renderer, eine Mischfarbe aus P.mix, eine fehlende Rolle), bricht ab, mit
   der Stelle im Renderer: dann gehört der Renderer repariert, nicht das
   Bild. Weiß und Schwarz mit Deckkraft (Licht und Schatten) bleiben, wie
   sie sind.

   Nebenbei zieht der Lauf die handgezeichneten Bilder im selben Ordner nach:
   dort steht zu jeder Rollenklasse der Standardwert von Hand. Ändert sich
   ein Standard in shared/palette.js, schreibt der Generator ihn nach; die CI
   regeneriert und prüft, dass danach nichts abweicht.

     node scripts/gen-theory-svgs.mjs */
import path from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HIER = fileURLToPath(import.meta.url);
const site = path.join(path.dirname(HIER), '..', 'web');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const zahl = v => String(+(+v).toFixed(3));

globalThis.window = globalThis;
globalThis.document = {
  createElement: () => new PatternCanvas(),
  body: {},
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

/* ── Rollen und Wächterfarben ── */
require(path.join(site, 'shared/palette.js'));
const P = globalThis.__PALETTE__;
const STANDARD = { ...P.colors };                 // die Standardwerte (Schema „teal")
const ROLLEN = Object.keys(STANDARD);
const WAECHTER = {};                              // Rolle → Wächterfarbe
const ZU_ROLLE = new Map();                       // 'r,g,b' einer Wächterfarbe → Rolle
if (ROLLEN.length > 200) throw new Error('mehr Rollen, als es Wächterfarben gibt');
ROLLEN.forEach((k, i) => {
  /* Rot zählt die Rollen durch und macht jeden Wächter eindeutig, Grün und
     Blau sind gestreut: eine Mischung zweier Wächter landet so praktisch nie
     auf einem dritten, sondern fällt als unbekannte Farbe auf. */
  const rgb = [16 + i, (i * 97 + 41) & 255, (i * 53 + 199) & 255];
  WAECHTER[k] = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  ZU_ROLLE.set(rgb.join(','), k);
});
const token = k => P.cssName(k).slice(2);         // steelDark → steel-dark

/* Die Palette an Ort und Stelle umbelegen, wie es schemes.js tut, und die
   Rollen der Diagramme neu ableiten. */
function paletteSetzen(werte) {
  for (const k of ROLLEN) { P.colors[k] = werte[k]; P[k] = werte[k]; }
  globalThis.__THEME__.derive();
}

/* Farbwert → { rolle, a } | { neutral, a } | { keine } | null (unbekannt). */
function lesen(c) {
  if (c === 'none' || c === 'transparent') return { keine: true };
  if (typeof c !== 'string') return null;
  const s = c.trim().toLowerCase();
  let m, rgb, a = 1;
  if ((m = /^#([0-9a-f]{3})$/.exec(s))) rgb = [...m[1]].map(h => parseInt(h + h, 16));
  else if ((m = /^#([0-9a-f]{6})$/.exec(s))) rgb = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  else if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s))) {
    rgb = [+m[1], +m[2], +m[3]];
    if (m[4] != null) a = +m[4];
  } else return null;
  const rolle = ZU_ROLLE.get(rgb.join(','));
  if (rolle) return { rolle, a };
  if (rgb.every(v => v === 255)) return { neutral: '#ffffff', a };
  if (rgb.every(v => v === 0)) return { neutral: '#000000', a };
  return null;
}

/* Unbekannte Farben: wo sie zuerst gesetzt wurden (die erste Zeile des
   Aufrufstapels außerhalb dieses Skripts, also im Renderer), und was damit
   gezeichnet werden sollte. */
const WOHER = new Map();
let fehler = [];
function merken(v) {
  if (v && typeof v === 'object') return;           // Muster (Schraffur)
  if (lesen(v) || WOHER.has(String(v))) return;
  const zeilen = (new Error().stack || '').split('\n').slice(1);
  const z = zeilen.find(l => !l.includes(HIER)) || '';
  WOHER.set(String(v), z.trim().replace(/^at\s+/, '').replace(pathToFileURL(path.join(site, '..')).href + '/', ''));
}

/* Eine Farbe als Attribut: der Standardwert ihrer Rolle, die Deckkraft
   getrennt, die Rolle als Klasse (in `klassen` gesammelt). alpha: Deckkraft
   obendrauf (Schraffur). */
function farbAttr(name, c, klassen, was, alpha = 1) {
  const f = lesen(c);
  if (!f) {
    fehler.push({ farbe: String(c), wo: WOHER.get(String(c)) || '(unbekannt)', was });
    return ` ${name}="${esc(String(c))}"`;
  }
  if (f.keine) return ` ${name}="none"`;
  const a = f.a * alpha;
  const deck = a < 1 ? ` ${name}-opacity="${zahl(a)}"` : '';
  if (f.neutral) return ` ${name}="${f.neutral}"${deck}`;
  klassen.push((name === 'fill' ? 'f-' : 's-') + token(f.rolle));
  return ` ${name}="${STANDARD[f.rolle]}"${deck}`;
}
const klasse = k => (k.length ? ` class="${k.join(' ')}"` : '');

/* ── Mini-Canvas für Schraffur-Pattern (hatch() in render/limits.js) ── */
class PatternCanvas {
  constructor() { this.width = 0; this.height = 0; this.ops = []; }
  getContext() {
    const c = this;
    return new Proxy({
      beginPath() { c.ops.push({ t: 'begin' }); },
      moveTo(a, b) { c.ops.push({ t: 'M', a, b }); },
      lineTo(a, b) { c.ops.push({ t: 'L', a, b }); },
      stroke() { c.ops.push({ t: 'stroke', style: this.strokeStyle, alpha: this.globalAlpha, w: this.lineWidth }); },
    }, {
      get(t, k) { return t[k]; },
      set(t, k, v) { if (k === 'strokeStyle') merken(v); t[k] = v; return true; },
    });
  }
  toSVG(id) {
    let d = '', out = '';
    for (const op of this.ops) {
      if (op.t === 'M') d += `M${op.a} ${op.b}`;
      else if (op.t === 'L') d += `L${op.a} ${op.b}`;
      else if (op.t === 'stroke') {
        const k = [];
        const st = farbAttr('stroke', op.style, k, 'Schraffur', op.alpha ?? 1);
        out += `<path d="${d}" fill="none"${st} stroke-width="${op.w || 1}"${klasse(k)}/>`;
      }
    }
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${this.width}" height="${this.height}">${out}</pattern>`;
  }
}

/* ── Path2D-Recorder ── */
class P2D {
  constructor(d) { this.segs = d ? [{ t: 'raw', d }] : []; }
  moveTo(a, b) { this.segs.push({ t: 'M', a, b }); }
  lineTo(a, b) { this.segs.push({ t: 'L', a, b }); }
  closePath() { this.segs.push({ t: 'Z' }); }
  rect(a, b, w, h) { this.segs.push({ t: 'rect', a, b, w, h }); }
  arc(cx, cy, r, s, e) { this.segs.push({ t: 'arc', cx, cy, r, s, e }); }
  isCircle() { return this.segs.length === 1 && this.segs[0].t === 'arc' && Math.abs(this.segs[0].e - this.segs[0].s) >= 2 * Math.PI - 1e-6; }
  d() {
    let d = '';
    for (const s of this.segs) {
      if (s.t === 'raw') d += s.d;
      else if (s.t === 'M') d += `M${s.a.toFixed(2)} ${s.b.toFixed(2)}`;
      else if (s.t === 'L') d += `L${s.a.toFixed(2)} ${s.b.toFixed(2)}`;
      else if (s.t === 'Z') d += 'Z';
      else if (s.t === 'rect') d += `M${s.a.toFixed(2)} ${s.b.toFixed(2)}h${s.w.toFixed(2)}v${s.h.toFixed(2)}h${(-s.w).toFixed(2)}Z`;
      else if (s.t === 'arc') {
        const { cx, cy, r } = s;
        d += `M${(cx + r).toFixed(2)} ${cy.toFixed(2)}A${r} ${r} 0 1 0 ${(cx - r).toFixed(2)} ${cy.toFixed(2)}A${r} ${r} 0 1 0 ${(cx + r).toFixed(2)} ${cy.toFixed(2)}Z`;
      }
    }
    return d;
  }
}
globalThis.Path2D = P2D;

/* ── SVG-Kontext ── */
class SVGCtx {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.out = [];
    this.defs = [];
    this.patterns = new Map();
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1;
    this.font = '11px Arial'; this.textAlign = 'left'; this.globalAlpha = 1;
    this.dash = [];
    this.path = new P2D();
    this.tf = [];                 // aktive transform-Strings
    this.stack = [];              // save(): { groups, tf, styles }
    this.clipId = 0;
  }
  /* Farben laufen über Zugriffsfunktionen: eine unbekannte Farbe merkt sich
     die Stelle im Renderer, die sie gesetzt hat. */
  get fillStyle() { return this._fill; }
  set fillStyle(v) { merken(v); this._fill = v; }
  get strokeStyle() { return this._stroke; }
  set strokeStyle(v) { merken(v); this._stroke = v; }
  save() {
    this.stack.push({ groups: 0, tf: this.tf.slice(), s: { f: this.fillStyle, st: this.strokeStyle, lw: this.lineWidth, fo: this.font, ta: this.textAlign, ga: this.globalAlpha, da: this.dash.slice() } });
  }
  restore() {
    const fr = this.stack.pop();
    if (!fr) return;
    for (let i = 0; i < fr.groups; i++) this.out.push('</g>');
    this.tf = fr.tf;
    Object.assign(this, { fillStyle: fr.s.f, strokeStyle: fr.s.st, lineWidth: fr.s.lw, font: fr.s.fo, textAlign: fr.s.ta, globalAlpha: fr.s.ga, dash: fr.s.da });
  }
  translate(a, b) { this.tf.push(`translate(${a.toFixed(2)} ${b.toFixed(2)})`); }
  rotate(r) { this.tf.push(`rotate(${(r * 180 / Math.PI).toFixed(2)})`); }
  setTransform() { /* nur von renderCard (dpr) genutzt — hier nicht */ }
  _tf() { return this.tf.length ? ` transform="${this.tf.join(' ')}"` : ''; }
  _alpha() { return this.globalAlpha < 1 ? ` opacity="${this.globalAlpha}"` : ''; }

  beginPath() { this.path = new P2D(); }
  moveTo(a, b) { this.path.moveTo(a, b); }
  lineTo(a, b) { this.path.lineTo(a, b); }
  closePath() { this.path.closePath(); }
  rect(a, b, w, h) { this.path.rect(a, b, w, h); }
  arc(cx, cy, r, s, e) { this.path.arc(cx, cy, r, s, e); }
  setLineDash(d) { this.dash = d || []; }

  _fillAttr(k, was) {
    if (typeof this.fillStyle === 'object' && this.fillStyle && this.fillStyle.__pattern) {
      const pc = this.fillStyle.__pattern;
      if (!this.patterns.has(pc)) {
        const id = 'pat' + this.patterns.size;
        this.patterns.set(pc, id);
        this.defs.push(pc.toSVG(id));
      }
      return ` fill="url(#${this.patterns.get(pc)})"`;
    }
    return farbAttr('fill', this.fillStyle, k, was);
  }
  createPattern(c) { return { __pattern: c }; }

  _emitPath(p, mode) {
    const dash = this.dash.length ? ` stroke-dasharray="${this.dash.join(' ')}"` : '';
    const k = [];
    if (p.isCircle()) {
      const s = p.segs[0];
      const pos = `cx="${s.cx.toFixed(2)}" cy="${s.cy.toFixed(2)}" r="${s.r}"`;
      if (mode === 'fill') this.out.push(`<circle ${pos}${this._fillAttr(k, 'Kreis (Füllung)')}${klasse(k)}${this._alpha()}${this._tf()}/>`);
      else this.out.push(`<circle ${pos} fill="none"${farbAttr('stroke', this.strokeStyle, k, 'Kreis (Strich)')} stroke-width="${this.lineWidth}"${dash}${klasse(k)}${this._alpha()}${this._tf()}/>`);
      return;
    }
    if (mode === 'fill') this.out.push(`<path d="${p.d()}"${this._fillAttr(k, 'Fläche')} fill-rule="nonzero"${klasse(k)}${this._alpha()}${this._tf()}/>`);
    else this.out.push(`<path d="${p.d()}" fill="none"${farbAttr('stroke', this.strokeStyle, k, 'Linie')} stroke-width="${this.lineWidth}"${dash} stroke-linejoin="round"${klasse(k)}${this._alpha()}${this._tf()}/>`);
  }
  fill(p) { this._emitPath(p instanceof P2D ? p : this.path, 'fill'); }
  stroke() { this._emitPath(this.path, 'stroke'); }
  clip(p) {
    const cp = p instanceof P2D ? p : this.path;
    const id = 'clip' + (this.clipId++);
    this.defs.push(`<clipPath id="${id}"><path d="${cp.d()}"/></clipPath>`);
    this.out.push(`<g clip-path="url(#${id})">`);
    if (this.stack.length) this.stack[this.stack.length - 1].groups++;
  }
  fillRect(a, b, w, h) {
    const k = [];
    this.out.push(`<rect x="${a.toFixed(2)}" y="${b.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}"${this._fillAttr(k, 'Rechteck')}${klasse(k)}${this._alpha()}${this._tf()}/>`);
  }
  strokeRect(a, b, w, h) {
    const k = [];
    this.out.push(`<rect x="${a.toFixed(2)}" y="${b.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="none"${farbAttr('stroke', this.strokeStyle, k, 'Rahmen')} stroke-width="${this.lineWidth}"${klasse(k)}${this._alpha()}${this._tf()}/>`);
  }
  _font() {
    const m = /(bold )?([\d.]+)px (.+)/.exec(this.font) || [null, '', 11, 'Arial'];
    return { weight: m[1] ? '700' : '400', size: parseFloat(m[2]), family: 'Arial, Helvetica, sans-serif' };
  }
  measureText(s) { return { width: String(s).length * this._font().size * 0.55 }; }
  fillText(s, a, b) {
    if (s === '' || s == null) return;
    const f = this._font();
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start';
    const k = [];
    const farbe = this._fillAttr(k, 'Text „' + s + '"');
    this.out.push(`<text x="${a.toFixed(2)}" y="${b.toFixed(2)}" font-family="${f.family}" font-size="${f.size}" font-weight="${f.weight}"${farbe}${klasse(k)} text-anchor="${anchor}"${this._tf()}>${esc(s)}</text>`);
  }
  /* Indizes („v_a", „P_{acc}") als <tspan> in EINEM <text> — der SVG-Renderer
     setzt die Segmente mit echten Glyphenbreiten (measureText ist hier nur
     eine Schätzung; render/base.js fillRich ruft diese Methode, wenn vorhanden). */
  fillRich(s, a, b) {
    const f = this._font();
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start';
    const sub = Math.round(f.size * 0.78 * 10) / 10, dy = (f.size * 0.28).toFixed(2);
    const re = /_(?:\{([^}]*)\}|([A-Za-z0-9]+(?:,[A-Za-z0-9]+)*))/g;
    let inner = '', last = 0, m, lowered = false;
    const plain = txt => { if (!txt) return; inner += lowered ? `<tspan dy="-${dy}">${esc(txt)}</tspan>` : esc(txt); lowered = false; };
    s = String(s);
    while ((m = re.exec(s))) {
      plain(s.slice(last, m.index));
      inner += `<tspan font-size="${sub}" dy="${dy}">${esc(m[1] != null ? m[1] : m[2])}</tspan>`;
      lowered = true; last = re.lastIndex;
    }
    plain(s.slice(last));
    const k = [];
    const farbe = this._fillAttr(k, 'Text „' + s + '"');
    this.out.push(`<text x="${a.toFixed(2)}" y="${b.toFixed(2)}" font-family="${f.family}" font-size="${f.size}" font-weight="${f.weight}"${farbe}${klasse(k)} text-anchor="${anchor}"${this._tf()}>${inner}</text>`);
  }
  svg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" font-family="Arial, Helvetica, sans-serif" role="img">` +
      `<defs>${this.defs.join('')}</defs>` + this.out.join('\n') + '</svg>';
  }
}

/* ── Konfiguration + Module laden (wie render-smoke) ── */
require(path.join(site, 'shared/project.js'));
require(path.join(site, 'shared/theme.js'));
require(path.join(site, 'shared/examples/machines.js'));
require(path.join(site, 'shared/examples/alloys.js'));
require(path.join(site, 'shared/examples/parts.js'));
require(path.join(site, 'shared/clampmodel.js'));
const { theme } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/core/theme.js')).href);
if (theme !== globalThis.__THEME__) Object.assign(theme, globalThis.__THEME__);

const { allFields, DEFAULT_CURVE } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/config/fields.js')).href);
const { computeShot, vCritTheory } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/core/physics.js')).href);
const { drawAny } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/render/draw.js')).href);
const { chartsById } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/charts/registry.js')).href);

const values = {};
for (const f of allFields()) values[f.key] = f.def;
const shot = computeShot(values, DEFAULT_CURVE.map(p => p.slice()));

const outDir = path.join(site, 'assets/theorie');
mkdirSync(outDir, { recursive: true });

/* ── Ein Bild für alle Fits: exakte Segment-Lösung, Nogowizin-Polynom,
   Segment-Fit und OpenFOAM-CFD (Mittel + Spanne) in einem Diagramm.
   Deckenkriterium: v_krit/√(gD) = ∫_{y0}^{1} √(T̂(y)/Â(y)) dy mit
   T̂ = 2√(y(1−y)) (Sehne), Â = φ(y)·π/4 (Segmentfläche), y = h/D.
   x-Bereich = CFD-Raster (φ 0,1–0,9), damit die Spanne nicht über ihre
   Datenlage hinaus verlängert wird.
   Farben: alle vier Kurven sind dieselbe Größe. Die drei aus der
   Flachwassertheorie tragen die Hauptfarbe `ink` und unterscheiden sich
   über Breite, Deckkraft und Strich: die exakte Lösung breit und hell, der
   Segment-Fit gestrichelt darauf (er liegt deckungsgleich, so bleiben beide
   sichtbar), Nogowizin punktiert. Die CFD ist das v_krit, mit dem das
   Dashboard rechnet, und trägt darum dessen Rolle `process` (wie die Grenze
   „v_krit 1. Phase" in der Schusskurve); ihre Spanne über alle Bohrungen
   als helles Band derselben Rolle. Nur das Füllgrad-Ziel ist ein Urteil
   (Zielband in `target`); die Spanne ist Streuung der Daten und bekommt
   darum Fläche und Rand ausdrücklich (l.c, l.edge), sonst sähe sie wie ein
   zweites Ziel aus. */
function vkritFits() {
  const PI = Math.PI;
  const areaFrac = y => (Math.acos(1 - 2 * y) - 2 * (1 - 2 * y) * Math.sqrt(Math.max(0, y * (1 - y)))) / PI;
  const segH = phi => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (areaFrac(m) < phi) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  const fExact = phi0 => {
    const y0 = segH(phi0), n = 4000;
    let s = 0;
    for (let i = 0; i <= n; i++) {
      const y = Math.min(y0 + (1 - y0) * i / n, 1 - 1e-12);
      const w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
      s += w * Math.sqrt(2 * Math.sqrt(Math.max(1e-15, y * (1 - y))) / (areaFrac(y) * PI / 4));
    }
    return s * (1 - y0) / n / 3;
  };
  const nog = phi => 1.386 - 1.915 * phi + 0.615 * phi * phi;

  /* CFD-Läufe je Füllgrad bündeln: Mittel und Spanne über alle Bohrungen. */
  const rows = readFileSync(path.join(site, '../fixtures/vkrit/v_krit_sim.csv'), 'utf8')
    .trim().split('\n').slice(1).map(l => l.split(';').map(Number));
  const g = 9.81;
  const byPhi = new Map();
  for (const [D, phi, V] of rows) {
    const f = V / Math.sqrt(g * D / 1000);
    if (!byPhi.has(phi)) byPhi.set(phi, []);
    byPhi.get(phi).push(f);
  }
  const phis = [...byPhi.keys()].sort((a, b) => a - b);
  const cx = phis.map(p => p * 100);
  const cMean = phis.map(p => byPhi.get(p).reduce((a, b) => a + b) / byPhi.get(p).length);
  const cLo = phis.map(p => Math.min(...byPhi.get(p)));
  const cHi = phis.map(p => Math.max(...byPhi.get(p)));
  const at = xv => {
    let k = 0;
    while (k < cx.length - 2 && cx[k + 1] < xv) k++;
    const t = Math.max(0, Math.min(1, (xv - cx[k]) / (cx[k + 1] - cx[k])));
    return { k, t };
  };
  const interp = arr => xv => { const { k, t } = at(xv); return arr[k] * (1 - t) + arr[k + 1] * t; };

  /* Feines gemeinsames Raster im CFD-Bereich; die analytischen Kurven
     werden direkt ausgewertet, das CFD-Mittel linear interpoliert. */
  const x = [], yE = [], yN = [], yS = [], yC = [];
  for (let p = cx[0]; p <= cx[cx.length - 1] + 1e-9; p++) {
    const phi = p / 100;
    x.push(p); yE.push(fExact(phi)); yN.push(nog(phi)); yS.push(vCritTheory(1 / 9.81, phi));
    yC.push(interp(cMean)(p));
  }
  return {
    title: 'Die Fits im Vergleich: exakte Lösung, Nogowizin, Segment-Fit und CFD',
    info: 'f = v_krit/√(g·D) · Nogowizin: ≈2 % für φ = 0,2–0,75, am Rand bis 28 % · Segment-Fit (DieLogic-Theorie): ≤ 0,25 % überall · CFD ab φ ≈ 0,3 unter allen Flachwasser-Kurven',
    x,
    ys: [
      { n: 'exakte Lösung (Integral)', c: 'ink', w: 5, alpha: 0.3, y: yE },
      { n: 'Segment-Fit (1−φ)^(5/6)·(2,3173 − 2,4762·φ^(1/3) + 1,3404·φ^(2/3) − 0,3552·φ)', c: 'ink', w: 1.8, dash: [7, 4], y: yS },
      { n: 'Nogowizin 1,386 − 1,915·φ + 0,615·φ²', c: 'ink', w: 1.8, dash: [1.5, 3], y: yN },
      { n: 'OpenFOAM-CFD (Mittel über Ø 60–300 mm)', c: 'process', y: yC }
    ],
    xl: 'Füllgrad φ in %',
    yl: 'v_krit / √(g·D)',
    y0: 0,
    /* Keine Beschriftung im Diagramm: die der schmalen Spanne läge mitten
       auf den Kurven. Beide Bänder stehen in der Legende. */
    limitText: 'legend',
    limits: [
      { id: 'simSpread', label: 'CFD-Spanne über Ø 60–300 mm', on: 'y', min: interp(cLo), max: interp(cHi), severity: 'target',
        c: P.rgba('process', 0.16), edge: P.rgba('process', 0.6) },
      { id: 'fillBand', label: 'Füllgrad-Ziel 40–60 %', on: 'x', min: 40, max: 60, severity: 'target' }
    ]
  };
}

/* ── Werkzeuglinie: drei Anschnittflächen zeigen den A_a²-Hebel, ohne
   Maschinenanteile, y-Achse auf die steilste Linie skaliert. Alle drei sind
   Werkzeuglinien (`die`); die gewählte durchgezogen und kräftiger, die
   kleinere Fläche lang gestrichelt, die größere punktiert. */
function werkzeug() {
  const def = chartsById.pq2; def.tab = 'q'; def.tab2 = 'pm'; def.xFull = false;
  const wz = (gate, stil) => {
    const q = def.calc({ ...values, gate }, { shot });
    const sr = q.ys.find(x => /Werkzeug/.test(x.n));
    return { ...sr, n: 'A_a = ' + gate + ' mm²' + (gate === values.gate ? ' (gewählt)' : ''), c: 'die', dash: undefined, alpha: undefined, ...stil };
  };
  const d = def.calc(values, { shot });
  d.ys = [wz(Math.round(values.gate / 1.5), { w: 2, dash: [9, 4] }),
          wz(values.gate, { w: 2.8 }),
          wz(Math.round(values.gate * 1.5), { w: 2, dash: [1.5, 3.5] })];
  d.limits = []; delete d.feasible; delete d.feasibleSplit;
  delete d.pt; delete d.ptl; delete d.pt2; delete d.ptl2; delete d.segs;
  d.y1 = 1.12 * Math.max(...d.ys[0].y.filter(Number.isFinite));
  d.title = 'Die Werkzeuglinie: die Anschnittfläche stellt die Steilheit';
  d.info = 'p_W = ρ/(2·c_d²·A_a²) · Q²; kleinere Fläche: steiler (mehr Druck je Volumenstrom), größere: flacher';
  return { d, def };
}

const W = 880, H = 560;
/* Didaktisch reduzierte PQ²-Varianten für die Theorieseite: nur die beiden
   Kennlinien und die Hüllkurven-Maske, kein Band, keine Fenstergrenzen, kein
   Arbeitspunkt (theorie/pq2.html zeichnet das Grundbild live genauso). */
const simplify = d => {
  d.limits = d.limits.filter(l => l.mask);
  delete d.feasible; delete d.feasibleSplit;
  delete d.pt; delete d.ptl;
};
const jobs = [
  /* Grundbild im Q²-Modus: dort sind beide Kennlinien Geraden — der
     namensgebende Trick des Diagramms wird sichtbar. xFull hält die Achse
     wie beim interaktiven Slider bis Q_dry des größten Kolbens fest. */
  { file: 'pq2-grund.svg', id: 'pq2', tab: 'q2', tab2: 'pm', xFull: true, post: d => { simplify(d); delete d.segs; d.title = 'PQ²-Grundbild: im Q²-Maßstab werden beide Kennlinien zu Geraden'; } },
  /* Einzelbilder für die Herleitungs-Abschnitte: nur je eine Kennlinie. */
  { file: 'pq2-maschine.svg', id: 'pq2', tab: 'q', tab2: 'pm', post: d => {
    simplify(d);
    delete d.pt2; delete d.ptl2; delete d.segs;             // Schnittpunkt/Drossel gehören zur Werkzeuglinie
    d.ys = d.ys.filter(sr => /Maschine/.test(sr.n));
    d.title = 'Die Maschinenlinie und die Hüllkurve als Grenze aller Kolben';
  } },
  { file: 'pq2-werkzeug.svg', build: werkzeug },
  { file: 'pq2-q.svg', id: 'pq2', tab: 'q', tab2: 'pm' },
  { file: 'pq2-pw.svg', id: 'pq2', tab: 'q', tab2: 'pw' },
  { file: 'shotcurve-sv.svg', id: 'shotcurve', tab: 'sv' },
  { file: 'vkrit-fits.svg', build: vkritFits },
  /* Diagramme für den Entlüftungs-/Vakuum-Artikel (entlueftung-vakuum.html).
     Blasendiagramm ohne Vakuum-Modell: die Restdruck-Kurve mit Vakuum kommt
     aus der Luftsimulation des Dashboards und steht darum nicht im
     statischen Bild; die Theorieseite erklärt das in der Bildunterschrift. */
  { file: 'vent.svg', id: 'vent' },
  { file: 'ventreq.svg', id: 'ventreq' },
  { file: 'bubble.svg', build: () => {
    const def = chartsById.bubble;
    const d = def.calc({ ...values, vacModel: 'aus' });
    d.title = def.title;
    return { d, def };
  } },
];

/* ── Zeichnen: mit Wächterfarben, damit jede Farbe ihre Rolle verrät ── */
paletteSetzen(WAECHTER);
const kaputt = [];
for (const j of jobs) {
  fehler = [];
  let d, def = null;
  if (j.build) {
    d = j.build();
    if (d && d.d) { def = d.def; d = d.d; }
  } else {
    def = chartsById[j.id];
    if (j.tab) def.tab = j.tab;
    if (j.tab2) def.tab2 = j.tab2;
    def.xFull = !!j.xFull;   // je Job zurücksetzen — die pq2-Jobs teilen sich das def-Objekt
    d = def.calc(values, { shot });
    if (d.err) { kaputt.push({ datei: j.file, meldung: 'Rechenfehler: ' + d.err }); continue; }
    d.title = def.title;
    if (j.post) j.post(d);
  }
  const ctx = new SVGCtx(W, H);
  drawAny(ctx, W, H, d, def);
  if (fehler.length) { kaputt.push({ datei: j.file, fehler }); continue; }
  writeFileSync(path.join(outDir, j.file), ctx.svg());
  console.log('geschrieben: ' + j.file);
}
paletteSetzen(STANDARD);

/* ── Handgezeichnete Bilder: zu jeder Rollenklasse den Standardwert ihrer
   Rolle ins Attribut schreiben (f- → fill, s- → stroke, c- → stop-color). ── */
const ATTR = { f: 'fill', s: 'stroke', c: 'stop-color' };
const ZU_TOKEN = new Map(ROLLEN.map(k => [token(k), k]));
for (const datei of readdirSync(outDir).filter(f => f.endsWith('.svg') && !jobs.some(j => j.file === f)).sort()) {
  const alt = readFileSync(path.join(outDir, datei), 'utf8');
  const neu = alt.replace(/<([a-zA-Z][\w:-]*)\b([^>]*)>/g, (tag, name, attrs) => {
    const kl = (attrs.match(/\sclass="([^"]*)"/) || [])[1];
    if (!kl) return tag;
    for (const k of kl.split(/\s+/)) {
      const m = /^([fsc])-(.+)$/.exec(k);
      if (!m) continue;
      const rolle = ZU_TOKEN.get(m[2]);
      if (!rolle) { kaputt.push({ datei, meldung: `Klasse ${k} nennt keine Rolle der Palette` }); continue; }
      attrs = attrs.replace(new RegExp('(\\s' + ATTR[m[1]] + '=")[^"]*"'), '$1' + STANDARD[rolle] + '"');
    }
    return '<' + name + attrs + '>';
  });
  if (neu !== alt) {
    writeFileSync(path.join(outDir, datei), neu);
    console.log('nachgezogen: ' + datei);
  }
}

if (kaputt.length) {
  const zeilen = [];
  for (const k of kaputt) {
    if (k.meldung) { zeilen.push(`  ${k.datei}: ${k.meldung}`); continue; }
    const gruppen = new Map();
    for (const f of k.fehler) {
      const key = f.farbe + ' ← ' + f.wo;
      if (!gruppen.has(key)) gruppen.set(key, new Set());
      gruppen.get(key).add(f.was);
    }
    zeilen.push(`  ${k.datei}: ${k.fehler.length} Farben ohne Rolle, nicht geschrieben`);
    for (const [key, was] of gruppen) zeilen.push(`    ${key}   (${[...was].slice(0, 3).join(', ')}${was.size > 3 ? ' …' : ''})`);
  }
  throw new Error('Theorie-Bilder: Farben ohne Rolle der Palette\n' + zeilen.join('\n'));
}
