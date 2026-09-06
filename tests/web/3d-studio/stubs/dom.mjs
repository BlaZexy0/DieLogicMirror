/* Winziges DOM für die Viewer-Tests.

   Es kann genau so viel, wie die Viewer benutzen: Elemente über id
   finden, Kinder anlegen (auch über innerHTML), einfache Selektoren
   (Tagname, [attribut], [attribut="wert"]), Klassenlisten, Ereignisse
   auslösen. Das reicht, um die komplette Verdrahtung von app.js, die.js,
   sidebar.js, viewbar.js und nav.js auszuführen — inklusive der
   Rückrufe der Regler und Schalter. Gerendert wird nichts. */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'web', 'tools', '3d-studio');
const ALL = [];

const parseAttrs = str => {
  const out = {};
  for (const m of str.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  for (const m of str.matchAll(/(?:^|\s)([\w-]+)(?=\s|$)/g)) if (!(m[1] in out)) out[m[1]] = '';
  return out;
};

class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this._text = '';
    this._html = '';
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.files = [];
    this.options = [];
    this.selectedIndex = 0;
    const self = this;
    this.classList = {
      add(...c) { for (const x of c) self._classes().add(x); self._sync(); },
      remove(...c) { for (const x of c) self._classes().delete(x); self._sync(); },
      toggle(c, on) {
        const s = self._classes();
        const want = on === undefined ? !s.has(c) : !!on;
        if (want) s.add(c); else s.delete(c);
        self._sync();
        return want;
      },
      contains(c) { return self._classes().has(c); }
    };
    ALL.push(this);
  }
  _classes() {
    if (!this._cls) this._cls = new Set((this.attrs.class || '').split(/\s+/).filter(Boolean));
    return this._cls;
  }
  _sync() { this.attrs.class = [...this._classes()].join(' '); }

  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this._cls = null; }
  getAttribute(k) { return this.attrs[k]; }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; this._cls = null; }

  get textContent() { return this._text; }
  set textContent(v) { this._text = v == null ? '' : String(v); }

  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v);
    this.children = [];
    /* Flache Auswertung: jedes Start-Tag wird ein Kind. Für die
       Selektoren der Viewer reicht das — sie suchen nie über
       Verschachtelungsebenen hinweg nach Struktur, nur nach Tag oder
       Attribut. */
    for (const m of this._html.matchAll(/<([a-zA-Z][\w-]*)([^>]*?)\/?>/g)) {
      const child = new El(m[1]);
      const attrs = parseAttrs(m[2] || '');
      for (const [k, val] of Object.entries(attrs)) {
        child.attrs[k] = val;
        if (k.startsWith('data-')) child.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = val;
        if (k === 'checked') child.checked = true;
      }
      child._cls = null;
      child.parentNode = this;
      this.children.push(child);
    }
  }

  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  prepend(c) { this.children.unshift(c); c.parentNode = this; return c; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this);
  }

  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn);
  }
  /* Ereignisse steigen auf wie im echten DOM — die Viewer hängen ihre
     Zuhörer teils an den Container und suchen das Ziel mit closest(). */
  dispatch(type, extra = {}) {
    let stopped = false;
    const ev = {
      type, target: this, preventDefault() {}, stopPropagation() { stopped = true; }, ...extra
    };
    let node = this;
    while (node && !stopped) {
      ev.currentTarget = node;
      for (const fn of [...(node.listeners[type] || [])]) fn(ev);
      node = node.parentNode;
    }
    return ev;
  }

  descendants(out = []) {
    for (const c of this.children) { out.push(c); c.descendants(out); }
    return out;
  }
  matches(sel) { return matchOne(this, sel); }
  querySelector(sel) { return this.descendants().find(e => matchOne(e, sel)) || null; }
  querySelectorAll(sel) { return this.descendants().filter(e => matchOne(e, sel)); }
  closest(sel) {
    let n = this;
    while (n) { if (matchOne(n, sel)) return n; n = n.parentNode; }
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; }
  get clientWidth() { return 800; }
  get clientHeight() { return 600; }
  click() { this.dispatch('click'); }
}

function matchOne(el, sel) {
  for (const part of sel.split(',').map(s => s.trim())) {
    if (!part) continue;
    const attr = part.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (attr) {
      if (!(attr[1] in el.attrs)) continue;
      if (attr[2] !== undefined && el.attrs[attr[1]] !== attr[2]) continue;
      return true;
    }
    if (part.startsWith('.')) { if (el._classes().has(part.slice(1))) return true; continue; }
    if (part.startsWith('#')) { if (el.id === part.slice(1)) return true; continue; }
    if (el.tagName === part.toUpperCase()) return true;
  }
  return false;
}

/* Aus dem echten HTML alle Elemente mit id (plus die Knöpfe in .seg-
   Gruppen) nachbauen — so bleibt der Test an die Seite gekoppelt. */
export function buildDocument(html) {
  const body = new El('body');
  const byId = new Map();
  const mk = (tag, attrs) => {
    const el = new El(tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.attrs[k] = v;
      if (k.startsWith('data-')) el.dataset[k.slice(5)] = v;
    }
    el._cls = null;
    if (attrs.value !== undefined) el.value = attrs.value;
    if ('checked' in attrs) el.checked = true;
    body.appendChild(el);
    if (el.id) byId.set(el.id, el);
    return el;
  };

  /* Jedes Start-Tag der Seite wird flach übernommen; Knöpfe und Eingaben
     hängen wir zusätzlich unter ihren id-Container, damit
     querySelectorAll('button') innerhalb einer .seg-Gruppe funktioniert. */
  let current = null;
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const [, close, tag, attrStr] = m;
    if (close) { if (current && current.tagName === tag.toUpperCase()) current = null; continue; }
    const attrs = parseAttrs(attrStr || '');
    const el = mk(tag, attrs);
    if (current) { current.appendChild(el); }
    if (attrs.class && /\bseg\b/.test(attrs.class)) current = el;
    else if (attrs.id && /-detail$/.test(attrs.id)) current = el;
  }

  const doc = {
    body,
    documentElement: body,
    getElementById: id => byId.get(id) || null,
    createElement: tag => new El(tag),
    querySelector: sel => body.descendants().find(e => matchOne(e, sel)) || null,
    querySelectorAll: sel => body.descendants().filter(e => matchOne(e, sel)),
    /* Tastendrücke landen auf dem Dokument (Entf, Esc) — dieselbe
       kleine Ereignismaschine wie an den Elementen. */
    listeners: {},
    addEventListener(type, fn) { (doc.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { doc.listeners[type] = (doc.listeners[type] || []).filter(f => f !== fn); },
    dispatch(type, extra = {}) {
      const ev = { type, target: body, preventDefault() {}, stopPropagation() {}, ...extra };
      for (const fn of [...(doc.listeners[type] || [])]) fn(ev);
      return ev;
    }
  };
  return { doc, byId, El };
}

export function installGlobals(doc) {
  globalThis.document = doc;
  globalThis.window = globalThis;
  globalThis.devicePixelRatio = 1;
  globalThis.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 0);
  globalThis.cancelAnimationFrame = id => clearTimeout(id);
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.location = { search: '', href: 'http://test/entformungsanalyse.html' };
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => 'blob:test';
    globalThis.URL.revokeObjectURL = () => {};
  }
  /* Die Seiten holen ihre Beispielteile mit fetch() aus assets/parts/.
     Hier kommt dieselbe Datei aus dem Projektordner — der Test prüft
     also genau das, was ausgeliefert wird. */
  globalThis.fetch = async url => {
    const file = resolve(ROOT, String(url).replace(/^\.?\//, ''));
    if (!existsSync(file)) return { ok: false, status: 404, arrayBuffer: async () => null };
    const buf = readFileSync(file);
    return {
      ok: true, status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    };
  };
  /* onload für die Viewer, onloadend für den GLTFExporter (binärer Block). */
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer ? blob.arrayBuffer() : blob).then(buf => {
        this.result = buf;
        this.onload && this.onload();
        this.onloadend && this.onloadend();
      });
    }
  };
}
