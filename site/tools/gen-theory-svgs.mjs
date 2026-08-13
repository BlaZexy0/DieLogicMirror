/* Erzeugt statische SVGs der echten Dashboard-Diagramme: ein minimaler
   Canvas-2D-Recorder spielt drawAny() ab und schreibt SVG-Dateien.
   Abdeckung: genau die API, die drawLine/drawLimits/base.js benutzen. */
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  svg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" font-family="Arial, Helvetica, sans-serif" role="img">` +
      `<defs>${this.defs.join('')}</defs>` + this.out.join('\n') + '</svg>';
  }
}

/* ── Konfiguration + Module laden (wie render-smoke) ── */
require(path.join(site, 'app/config/theme.js'));
require(path.join(site, 'app/config/machines.js'));
require(path.join(site, 'app/config/alloys.js'));
require(path.join(site, 'app/config/parts.js'));
require(path.join(site, 'app/shared/contract.js'));
require(path.join(site, 'app/shared/clampmodel.js'));
const { theme } = await import(path.join(site, 'app/js/core/theme.js'));
Object.assign(theme, globalThis.__THEME__);

const { allFields, DEFAULT_CURVE } = await import(path.join(site, 'app/js/config/fields.js'));
const { computeShot } = await import(path.join(site, 'app/js/core/physics.js'));
const { drawAny } = await import(path.join(site, 'app/js/render/draw.js'));
const { chartsById } = await import(path.join(site, 'app/js/charts/registry.js'));

const values = {};
for (const f of allFields()) values[f.key] = f.def;
const shot = computeShot(values, DEFAULT_CURVE.map(p => p.slice()));

const outDir = path.join(site, 'assets/theorie');
mkdirSync(outDir, { recursive: true });

const W = 880, H = 560;
const jobs = [
  { file: 'pq2-q.svg', id: 'pq2', tab: 'q', tab2: 'pm' },
  { file: 'pq2-q2.svg', id: 'pq2', tab: 'q2', tab2: 'pm' },
  { file: 'pq2-pw.svg', id: 'pq2', tab: 'q', tab2: 'pw' },
];
for (const j of jobs) {
  const def = chartsById[j.id];
  if (j.tab) def.tab = j.tab;
  if (j.tab2) def.tab2 = j.tab2;
  const d = def.calc(values, { shot });
  if (d.err) { console.error(j.file + ': ' + d.err); continue; }
  d.title = def.title;
  const ctx = new SVGCtx(W, H);
  drawAny(ctx, W, H, d, def);
  writeFileSync(path.join(outDir, j.file), ctx.svg());
  console.log('geschrieben: ' + j.file);
}
