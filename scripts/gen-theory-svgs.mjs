/* Erzeugt statische SVGs der echten Dashboard-Diagramme: ein minimaler
   Canvas-2D-Recorder spielt drawAny() ab und schreibt SVG-Dateien.
   Abdeckung: genau die API, die drawLine/drawLimits/base.js benutzen. */
import path from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
    }, { get(t, k) { return k in t ? t[k] : t[k]; }, set(t, k, v) { t[k] = v; return true; } });
  }
  toSVG(id) {
    let d = '', out = '';
    for (const op of this.ops) {
      if (op.t === 'M') d += `M${op.a} ${op.b}`;
      else if (op.t === 'L') d += `L${op.a} ${op.b}`;
      else if (op.t === 'stroke') {
        out += `<path d="${d}" fill="none" stroke="${op.style}" stroke-opacity="${op.alpha ?? 1}" stroke-width="${op.w || 1}"/>`;
      }
    }
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${this.width}" height="${this.height}">${out}</pattern>`;
  }
}

globalThis.window = globalThis;
globalThis.document = {
  createElement: tag => new PatternCanvas(),
  body: {},
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

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

  _fillAttr() {
    if (typeof this.fillStyle === 'object' && this.fillStyle && this.fillStyle.__pattern) {
      const pc = this.fillStyle.__pattern;
      if (!this.patterns.has(pc)) {
        const id = 'pat' + this.patterns.size;
        this.patterns.set(pc, id);
        this.defs.push(pc.toSVG(id));
      }
      return `url(#${this.patterns.get(pc)})`;
    }
    return this.fillStyle;
  }
  createPattern(c) { return { __pattern: c }; }

  _emitPath(p, mode) {
    const dash = this.dash.length ? ` stroke-dasharray="${this.dash.join(' ')}"` : '';
    if (p.isCircle()) {
      const s = p.segs[0];
      if (mode === 'fill') this.out.push(`<circle cx="${s.cx.toFixed(2)}" cy="${s.cy.toFixed(2)}" r="${s.r}" fill="${this._fillAttr()}"${this._alpha()}${this._tf()}/>`);
      else this.out.push(`<circle cx="${s.cx.toFixed(2)}" cy="${s.cy.toFixed(2)}" r="${s.r}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}"${dash}${this._alpha()}${this._tf()}/>`);
      return;
    }
    if (mode === 'fill') this.out.push(`<path d="${p.d()}" fill="${this._fillAttr()}" fill-rule="nonzero"${this._alpha()}${this._tf()}/>`);
    else this.out.push(`<path d="${p.d()}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}"${dash} stroke-linejoin="round"${this._alpha()}${this._tf()}/>`);
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
    this.out.push(`<rect x="${a.toFixed(2)}" y="${b.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${this._fillAttr()}"${this._alpha()}${this._tf()}/>`);
  }
  strokeRect(a, b, w, h) {
    this.out.push(`<rect x="${a.toFixed(2)}" y="${b.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.lineWidth}"${this._alpha()}${this._tf()}/>`);
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
    this.out.push(`<text x="${a.toFixed(2)}" y="${b.toFixed(2)}" font-family="${f.family}" font-size="${f.size}" font-weight="${f.weight}" fill="${this.fillStyle}" text-anchor="${anchor}"${this._tf()}>${esc(s)}</text>`);
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
    this.out.push(`<text x="${a.toFixed(2)}" y="${b.toFixed(2)}" font-family="${f.family}" font-size="${f.size}" font-weight="${f.weight}" fill="${this.fillStyle}" text-anchor="${anchor}"${this._tf()}>${inner}</text>`);
  }
  svg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" font-family="Arial, Helvetica, sans-serif" role="img">` +
      `<defs>${this.defs.join('')}</defs>` + this.out.join('\n') + '</svg>';
  }
}

/* ── Konfiguration + Module laden (wie render-smoke) ── */
require(path.join(site, 'shared/palette.js'));
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
require(path.join(site, 'shared/project.js'));
require(path.join(site, 'shared/theme.js'));
require(path.join(site, 'shared/examples/machines.js'));
require(path.join(site, 'shared/examples/alloys.js'));
require(path.join(site, 'shared/examples/parts.js'));
require(path.join(site, 'shared/clampmodel.js'));
const { theme } = await import(path.join(site, 'tools/auslegung/js/core/theme.js'));
Object.assign(theme, globalThis.__THEME__);

const { allFields, DEFAULT_CURVE } = await import(path.join(site, 'tools/auslegung/js/config/fields.js'));
const { computeShot, vCritTheory } = await import(path.join(site, 'tools/auslegung/js/core/physics.js'));
const { drawAny } = await import(path.join(site, 'tools/auslegung/js/render/draw.js'));
const { chartsById } = await import(path.join(site, 'tools/auslegung/js/charts/registry.js'));

const values = {};
for (const f of allFields()) values[f.key] = f.def;
const shot = computeShot(values, DEFAULT_CURVE.map(p => p.slice()));

const outDir = path.join(site, 'assets/theorie');
mkdirSync(outDir, { recursive: true });

/* ── Ein Bild für alle Fits: exakte Segment-Lösung, Nogowizin-Polynom,
   Segment-Fit und OpenFOAM-CFD (Mittel + Spanne) in einem Diagramm.
   Deckenkriterium: v_krit/√(gD) = ∫_{y0}^{1} √(T̂(y)/Â(y)) dy mit
   T̂ = 2√(y(1−y)) (Sehne), Â = φ(y)·π/4 (Segmentfläche), y = h/D.
   x-Bereich = CFD-Raster (φ 0,1–0,9), damit das Spannen-Band nicht über
   seine Datenlage hinaus verlängert wird. */
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
  const C = theme.chart;
  return {
    title: 'Die Fits im Vergleich — exakte Lösung, Nogowizin, Segment-Fit und CFD',
    info: 'f = v_krit/√(g·D) · Nogowizin: ≈2 % für φ = 0,2–0,75, am Rand bis 28 % · Segment-Fit (DieLogic-Theorie): ≤ 0,25 % überall · CFD ab φ ≈ 0,3 unter allen Flachwasser-Kurven',
    x,
    ys: [
      { n: 'exakte Lösung (Integral)', c: C.series1, y: yE },
      { n: 'Nogowizin 1,386 − 1,915·φ + 0,615·φ²', c: (theme.limits && theme.limits.vcrit) || C.crit, y: yN },
      { n: 'Segment-Fit (1−φ)^(5/6)·(2,3173 − 2,4762·φ^(1/3) + 1,3404·φ^(2/3) − 0,3552·φ)', c: C.series2, y: yS },
      { n: 'OpenFOAM-CFD (Mittel über Ø 60–300 mm)', c: C.series4, y: yC }
    ],
    xl: 'Füllgrad φ in %',
    yl: 'v_krit / √(g·D)',
    y0: 0,
    limits: [
      { id: 'simSpread', label: 'CFD-Spanne über Ø 60–300 mm', on: 'y', min: interp(cLo), max: interp(cHi), severity: 'target' },
      { id: 'fillBand', label: 'Füllgrad-Ziel 40–60 %', on: 'x', min: 40, max: 60, severity: 'target' }
    ]
  };
}

const W = 880, H = 560;
/* Didaktisch reduzierte PQ²-Varianten für die Theorieseite: nur die beiden
   Kennlinien und die graue Hüllkurven-Maske — kein Band, keine Fenstergrenzen.
   keepPt lässt zusätzlich den Arbeitspunkt stehen. */
const simplify = keepPt => d => {
  d.limits = d.limits.filter(l => l.mask);
  delete d.feasible; delete d.feasibleSplit;
  if (!keepPt) { delete d.pt; delete d.ptl; }
};
const jobs = [
  /* Grundbild im Q²-Modus: dort sind beide Kennlinien Geraden — der
     namensgebende Trick des Diagramms wird sichtbar. xFull hält die Achse
     wie beim interaktiven Slider bis Q_dry des größten Kolbens fest. */
  { file: 'pq2-grund.svg', id: 'pq2', tab: 'q2', tab2: 'pm', xFull: true, post: d => { simplify(false)(d); delete d.segs; d.title = 'PQ²-Grundbild — im Q²-Maßstab werden beide Kennlinien zu Geraden'; } },
  /* Einzelbilder für die Herleitungs-Abschnitte: nur je eine Kennlinie. */
  { file: 'pq2-maschine.svg', id: 'pq2', tab: 'q', tab2: 'pm', post: d => {
    simplify(false)(d);
    delete d.pt2; delete d.ptl2; delete d.segs;             // Schnittpunkt/Drossel gehören zur Werkzeuglinie
    d.ys = d.ys.filter(sr => /Maschine/.test(sr.n));
    d.title = 'Die Maschinenlinie — und die Hüllkurve als Grenze aller Kolben';
  } },
  /* Werkzeuglinie: drei Anschnittflächen zeigen den A_a²-Hebel — ohne
     Maschinenanteile, y-Achse auf die steilste Linie skaliert. */
  { file: 'pq2-werkzeug.svg', build: () => {
    const def = chartsById.pq2; def.tab = 'q'; def.tab2 = 'pm';
    const wz = (gate, c, w) => {
      const q = def.calc({ ...values, gate }, { shot });
      const sr = q.ys.find(x => /Werkzeug/.test(x.n));
      return { ...sr, n: 'A_a = ' + gate + ' mm²' + (gate === values.gate ? ' (gewählt)' : ''), c, w };
    };
    const C = theme.chart;
    const d = def.calc(values, { shot });
    d.ys = [wz(Math.round(values.gate / 1.5), C.warn || '#c2447e', 1.6),
            wz(values.gate, C.series2, 2.4),
            wz(Math.round(values.gate * 1.5), '#557786', 1.6)];
    d.limits = []; delete d.feasible; delete d.feasibleSplit;
    delete d.pt; delete d.ptl; delete d.pt2; delete d.ptl2; delete d.segs;
    d.y1 = 1.12 * Math.max(...d.ys[0].y.filter(Number.isFinite));
    d.title = 'Die Werkzeuglinie — die Anschnittfläche stellt die Steilheit';
    d.info = 'p_W = ρ/(2·c_d²·A_a²) · Q² — kleinere Fläche: steiler (mehr Druck je Volumenstrom), größere: flacher';
    return { d, def };
  } },
  { file: 'pq2-q.svg', id: 'pq2', tab: 'q', tab2: 'pm' },
  { file: 'pq2-q2.svg', id: 'pq2', tab: 'q2', tab2: 'pm', post: simplify(true) },
  { file: 'pq2-pw.svg', id: 'pq2', tab: 'q', tab2: 'pw' },
  { file: 'shotcurve-sv.svg', id: 'shotcurve', tab: 'sv' },
  { file: 'vkrit-fits.svg', build: vkritFits },
  /* Diagramme für den Entlüftungs-/Vakuum-Artikel (entlueftung-vakuum.html).
     Blasendiagramm ohne Vakuum-Modell: die simulierte Restdruck-Kurve gibt
     es nur mit Backend — die Theorieseite erklärt das in der Bildunterschrift. */
  { file: 'vent.svg', id: 'vent' },
  { file: 'ventreq.svg', id: 'ventreq' },
  { file: 'bubble.svg', build: () => {
    const def = chartsById.bubble;
    const d = def.calc({ ...values, vacModel: 'aus' });
    d.title = def.title;
    return { d, def };
  } },
];
for (const j of jobs) {
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
    if (d.err) { console.error(j.file + ': ' + d.err); continue; }
    d.title = def.title;
    if (j.post) j.post(d);
  }
  const ctx = new SVGCtx(W, H);
  drawAny(ctx, W, H, d, def);
  writeFileSync(path.join(outDir, j.file), ctx.svg());
  console.log('geschrieben: ' + j.file);
}
