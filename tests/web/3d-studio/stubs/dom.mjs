/* Winziges DOM für die Viewer-Tests.

   Es kann so viel, wie die Seiten des 3D-Studios brauchen: die echte
   HTML-Seite VERSCHACHTELT nachbauen, Elemente über id oder Selektor
   finden (Tag, .klasse, #id, [attr], [attr="wert"], :not(), Nachfahren-
   und Kind-Kombinatoren), Kinder anlegen (createElement, innerHTML,
   insertAdjacentHTML, insertBefore), Klassenlisten, dataset, Ereignisse
   auslösen, die aufsteigen. Gerendert wird nichts; Maße sind fest
   (Viewport 800 × 600).

   Vorher wurde flach geparst — jedes Start-Tag ein Kind des body — und
   ids kannte nur eine einmal beim Bauen gefüllte Tabelle. Der gemeinsame
   Rahmen des Studios (js/studio/shell.js) baut seine Felder zur
   Laufzeit; damit ihn die Tests fahren können, ist das DOM jetzt ein
   Baum, und getElementById sucht darin. */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'web', 'tools', '3d-studio');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);

const parseAttrs = str => {
  const out = {};
  for (const m of str.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = m[2] !== undefined ? m[2] : m[3];
  const rest = str.replace(/([\w:.-]+)\s*=\s*(?:"[^"]*"|'[^']*')/g, ' ');
  for (const m of rest.matchAll(/(?:^|\s)([\w-]+)(?=\s|$)/g)) if (!(m[1] in out)) out[m[1]] = '';
  return out;
};

const decode = s => s
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

const camel = k => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const kebab = k => k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

/* Das Textknoten-Gegenstück: ein Element ohne Tag, nur Text. */
class TextNode {
  constructor(text) { this.nodeType = 3; this.textContent = String(text ?? ''); this.parentNode = null; this.children = []; }
  get nodeValue() { return this.textContent; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); }
  descendants(out = []) { return out; }
}

class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.attrs = {};
    this.style = { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; }, removeProperty(k) { delete this[k]; } };
    this.listeners = {};
    this.parentNode = null;
    this._text = '';
    this._html = '';
    this.disabled = false;
    this.checked = false;
    this._value = '';
    this._selIdx = undefined;
    this.files = [];
    const self = this;
    this.classList = {
      add(...c) { for (const x of c) if (x) self._classes().add(x); self._sync(); },
      remove(...c) { for (const x of c) self._classes().delete(x); self._sync(); },
      toggle(c, on) {
        const s = self._classes();
        const want = on === undefined ? !s.has(c) : !!on;
        if (want) s.add(c); else s.delete(c);
        self._sync();
        return want;
      },
      contains(c) { return self._classes().has(c); },
      get length() { return self._classes().size; }
    };
    /* dataset spiegelt die data-*-Attribute — in beide Richtungen. */
    this.dataset = new Proxy({}, {
      get: (_, k) => (typeof k === 'string' ? self.attrs['data-' + kebab(k)] : undefined),
      set: (_, k, v) => { self.attrs['data-' + kebab(k)] = String(v); return true; },
      has: (_, k) => ('data-' + kebab(k)) in self.attrs,
      deleteProperty: (_, k) => { delete self.attrs['data-' + kebab(k)]; return true; },
      ownKeys: () => Object.keys(self.attrs).filter(k => k.startsWith('data-')).map(k => camel(k.slice(5))),
      getOwnPropertyDescriptor: (_, k) => ({ enumerable: true, configurable: true, value: self.attrs['data-' + kebab(k)] })
    });
  }
  _classes() {
    if (!this._cls) this._cls = new Set((this.attrs.class || '').split(/\s+/).filter(Boolean));
    return this._cls;
  }
  _sync() { this.attrs.class = [...this._classes()].join(' '); }

  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'class') this._cls = null;
    if (k === 'value' && this.tagName !== 'OPTION') this.value = String(v);
    if (k === 'checked') this.checked = true;
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; if (k === 'class') this._cls = null; if (k === 'checked') this.checked = false; }
  toggleAttribute(k, on) {
    const want = on === undefined ? !(k in this.attrs) : !!on;
    if (want) this.attrs[k] = ''; else delete this.attrs[k];
    return want;
  }
  /* value und selectedIndex hängen bei einer Auswahlliste zusammen wie im
     Browser: wer den Wert setzt, wählt die Option; selectedIndex = −1 heißt
     „nichts gewählt" (so markieren die Seiten ein hochgeladenes Bauteil). */
  get value() { return this._value; }
  set value(v) { this._value = v == null ? '' : String(v); if (this.tagName === 'SELECT') this._selIdx = undefined; }
  get selectedIndex() {
    if (this.tagName !== 'SELECT') return this._selIdx ?? 0;
    if (this._selIdx === -1) return -1;
    return this.options.findIndex(o => o.value === this._value);
  }
  set selectedIndex(i) {
    this._selIdx = i;
    if (this.tagName !== 'SELECT') return;
    if (i < 0) this._value = '';
    else if (this.options[i]) { this._value = this.options[i].value; this._selIdx = undefined; }
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; this._cls = null; }
  get title() { return this.attrs.title || ''; }
  set title(v) { this.attrs.title = String(v); }
  get hidden() { return 'hidden' in this.attrs; }
  set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
  get open() { return 'open' in this.attrs; }
  set open(v) { if (v) this.attrs.open = ''; else delete this.attrs.open; }
  get type() { return this.attrs.type || ''; }
  set type(v) { this.attrs.type = String(v); }
  get name() { return this.attrs.name || ''; }
  set name(v) { this.attrs.name = String(v); }
  get htmlFor() { return this.attrs.for || ''; }
  set htmlFor(v) { this.attrs.for = String(v); }
  get placeholder() { return this.attrs.placeholder || ''; }
  set placeholder(v) { this.attrs.placeholder = String(v); }
  get min() { return this.attrs.min ?? ''; }
  set min(v) { this.attrs.min = String(v); }
  get max() { return this.attrs.max ?? ''; }
  set max(v) { this.attrs.max = String(v); }
  get step() { return this.attrs.step ?? ''; }
  set step(v) { this.attrs.step = String(v); }
  get defaultValue() { return this.attrs.value ?? ''; }
  get options() { return this.children.filter(c => c.tagName === 'OPTION'); }
  get selectedOptions() { return this.options.filter(o => o.value === this.value); }

  /* Eigener Text plus der aller Nachfahren — wie im echten DOM; der
     Setter räumt die Kinder weg. */
  get textContent() {
    let t = this._text;
    for (const c of this.children) t += c.textContent;
    return t;
  }
  set textContent(v) { this._text = v == null ? '' : String(v); this.children = []; this._html = ''; }
  get innerText() { return this.textContent; }
  set innerText(v) { this.textContent = v; }

  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v);
    this._text = '';
    this.children = [];
    parseInto(this, this._html);
  }
  get outerHTML() { return '<' + this.tagName.toLowerCase() + '>' + this._html + '</' + this.tagName.toLowerCase() + '>'; }

  appendChild(c) { if (c.parentNode) c.remove(); this.children.push(c); c.parentNode = this; return c; }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? new TextNode(c) : c); }
  prepend(...cs) { for (const c of [...cs].reverse()) { const n = typeof c === 'string' ? new TextNode(c) : c; if (n.parentNode) n.remove(); this.children.unshift(n); n.parentNode = this; } }
  insertBefore(c, ref) {
    if (c.parentNode) c.remove();
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  replaceChildren(...cs) { this.children = []; this._text = ''; this._html = ''; this.append(...cs); }
  replaceWith(...cs) {
    const p = this.parentNode;
    if (!p) return;
    const i = p.children.indexOf(this);
    p.children.splice(i, 1, ...cs.map(c => (typeof c === 'string' ? new TextNode(c) : c)));
    for (const c of p.children) c.parentNode = p;
    this.parentNode = null;
  }
  before(...cs) { const p = this.parentNode; if (p) for (const c of cs) p.insertBefore(c, this); }
  after(...cs) {
    const p = this.parentNode;
    if (!p) return;
    const i = p.children.indexOf(this);
    p.children.splice(i + 1, 0, ...cs);
    for (const c of cs) { if (c.parentNode && c.parentNode !== p) c.remove(); c.parentNode = p; }
  }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this);
    this.parentNode = null;
  }
  insertAdjacentHTML(pos, html) {
    const frag = new El('fragment');
    parseInto(frag, String(html));
    const nodes = frag.children.slice();
    if (pos === 'beforeend') for (const n of nodes) this.appendChild(n);
    else if (pos === 'afterbegin') this.prepend(...nodes);
    else if (pos === 'beforebegin') this.before(...nodes);
    else if (pos === 'afterend') this.after(...nodes);
  }
  insertAdjacentElement(pos, el) { if (pos === 'beforeend') this.appendChild(el); else if (pos === 'afterbegin') this.prepend(el); else if (pos === 'beforebegin') this.before(el); else this.after(el); return el; }
  contains(el) { let n = el; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  cloneNode(deep) {
    const c = new El(this.tagName);
    c.attrs = { ...this.attrs }; c._cls = null; c._text = this._text; c._html = this._html; c.value = this.value; c.checked = this.checked;
    if (deep) for (const k of this.children) c.appendChild(k.cloneNode ? k.cloneNode(true) : new TextNode(k.textContent));
    return c;
  }
  get childNodes() { return this.children; }
  get childElementCount() { return this.children.filter(c => c.nodeType === 1).length; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get firstElementChild() { return this.children.find(c => c.nodeType === 1) || null; }
  get lastElementChild() { const e = this.children.filter(c => c.nodeType === 1); return e[e.length - 1] || null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get nextElementSibling() {
    const p = this.parentNode; if (!p) return null;
    const sib = p.children.filter(c => c.nodeType === 1); return sib[sib.indexOf(this) + 1] || null;
  }
  get previousElementSibling() {
    const p = this.parentNode; if (!p) return null;
    const sib = p.children.filter(c => c.nodeType === 1); return sib[sib.indexOf(this) - 1] || null;
  }

  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn);
  }
  /* Ereignisse steigen auf wie im echten DOM — die Viewer hängen ihre
     Zuhörer teils an den Container und suchen das Ziel mit closest(). */
  dispatch(type, extra = {}) {
    let stopped = false, prevented = false;
    const ev = {
      type, target: this, bubbles: true,
      preventDefault() { prevented = true; }, stopPropagation() { stopped = true; }, stopImmediatePropagation() { stopped = true; },
      get defaultPrevented() { return prevented; },
      ...extra
    };
    let node = this;
    while (node && !stopped) {
      ev.currentTarget = node;
      for (const fn of [...(node.listeners[type] || [])]) fn.call(node, ev);
      node = node.parentNode;
    }
    if (!stopped && globalThis.document && globalThis.document.listeners) {
      ev.currentTarget = globalThis.document;
      for (const fn of [...(globalThis.document.listeners[type] || [])]) fn.call(globalThis.document, ev);
    }
    return ev;
  }
  dispatchEvent(ev) {
    const extra = {};
    for (const k of ['key', 'code', 'ctrlKey', 'metaKey', 'shiftKey', 'altKey', 'clientX', 'clientY', 'button', 'buttons',
      'pointerId', 'pointerType', 'detail', 'dataTransfer', 'relatedTarget', 'deltaY', 'deltaX']) {
      if (ev[k] !== undefined) extra[k] = ev[k];
    }
    this.dispatch(ev.type, extra);
    return true;
  }

  descendants(out = []) {
    for (const c of this.children) { if (c.nodeType === 1) { out.push(c); c.descendants(out); } }
    return out;
  }
  matches(sel) { return matchSelector(this, sel); }
  querySelector(sel) { return this.descendants().find(e => matchSelector(e, sel)) || null; }
  querySelectorAll(sel) { return this.descendants().filter(e => matchSelector(e, sel)); }
  closest(sel) {
    let n = this;
    while (n && n.nodeType === 1) { if (matchSelector(n, sel)) return n; n = n.parentNode; }
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }; }
  get clientWidth() { return 800; }
  get clientHeight() { return 600; }
  get offsetWidth() { return 800; }
  get offsetHeight() { return 600; }
  get scrollHeight() { return 600; }
  get scrollWidth() { return 800; }
  click() { this.dispatch('click'); }
  focus() { if (globalThis.document) globalThis.document.activeElement = this; }
  blur() { if (globalThis.document && globalThis.document.activeElement === this) globalThis.document.activeElement = globalThis.document.body; }
  select() {}
  scrollIntoView() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
}

/* ── Selektoren ────────────────────────────────────────────────
   Eine Liste (Komma), je Selektor eine Kette einfacher Selektoren mit
   Nachfahren- (Leerraum) oder Kind-Kombinator (>). Ein einfacher
   Selektor: Tag, #id, .klasse, [attr], [attr="wert"], :not(…), :empty,
   :first-child, :last-child, :checked, :disabled. */
const SIMPLE = /^(\*|[a-zA-Z][\w-]*)?((?:#[\w-]+|\.[\w-]+|\[[^\]]+\]|:not\([^)]*\)|:[\w-]+)*)$/;

function matchCompound(el, comp) {
  const m = SIMPLE.exec(comp.trim());
  if (!m) return false;
  const tag = m[1], rest = m[2] || '';
  if (tag && tag !== '*' && el.tagName !== tag.toUpperCase()) return false;
  for (const t of rest.matchAll(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:not\([^)]*\)|:[\w-]+/g)) {
    const s = t[0];
    if (s[0] === '#') { if (el.id !== s.slice(1)) return false; continue; }
    if (s[0] === '.') { if (!el._classes().has(s.slice(1))) return false; continue; }
    if (s[0] === '[') {
      const a = /^\[([\w:-]+)(?:([~|^$*]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]$/.exec(s);
      if (!a) return false;
      if (!(a[1] in el.attrs)) return false;
      if (a[2] !== undefined) {
        const want = a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : a[5];
        const have = el.attrs[a[1]];
        if (a[2] === '=' && have !== want) return false;
        if (a[2] === '^=' && !have.startsWith(want)) return false;
        if (a[2] === '$=' && !have.endsWith(want)) return false;
        if (a[2] === '*=' && !have.includes(want)) return false;
        if (a[2] === '~=' && !have.split(/\s+/).includes(want)) return false;
      }
      continue;
    }
    if (s.startsWith(':not(')) { if (matchSelector(el, s.slice(5, -1))) return false; continue; }
    if (s === ':empty') { if (el.children.length || el._text) return false; continue; }
    if (s === ':first-child') { const p = el.parentNode; if (!p || p.children.filter(c => c.nodeType === 1)[0] !== el) return false; continue; }
    if (s === ':last-child') { const p = el.parentNode; if (!p) return false; const e = p.children.filter(c => c.nodeType === 1); if (e[e.length - 1] !== el) return false; continue; }
    if (s === ':checked') { if (!el.checked) return false; continue; }
    if (s === ':disabled') { if (!el.disabled && !('disabled' in el.attrs)) return false; continue; }
    if (s === ':enabled') { if (el.disabled || 'disabled' in el.attrs) return false; continue; }
    return false;
  }
  return true;
}

function splitChain(sel) {
  /* „a > b c" → [{comp:'a', comb:null}, {comp:'b', comb:'>'}, {comp:'c', comb:' '}] */
  const out = [];
  let buf = '', depth = 0, comb = null;
  const flush = () => { if (buf.trim()) { out.push({ comp: buf.trim(), comb }); buf = ''; comb = ' '; } };
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && ch === '>') { flush(); comb = '>'; continue; }
    if (depth === 0 && /\s/.test(ch)) { flush(); continue; }
    buf += ch;
  }
  flush();
  if (out.length) out[0].comb = null;
  return out;
}

function matchChain(el, chain, i) {
  if (!matchCompound(el, chain[i].comp)) return false;
  if (i === 0) return true;
  const comb = chain[i].comb;
  if (comb === '>') return !!(el.parentNode && el.parentNode.nodeType === 1 && matchChain(el.parentNode, chain, i - 1));
  let p = el.parentNode;
  while (p && p.nodeType === 1) { if (matchChain(p, chain, i - 1)) return true; p = p.parentNode; }
  return false;
}

const chainCache = new Map();
function matchSelector(el, sel) {
  for (const part of String(sel).split(',')) {
    const s = part.trim();
    if (!s) continue;
    let chain = chainCache.get(s);
    if (!chain) { chain = splitChain(s); chainCache.set(s, chain); }
    if (chain.length && matchChain(el, chain, chain.length - 1)) return true;
  }
  return false;
}

/* ── Parser ────────────────────────────────────────────────────
   Ein Stapel: Start-Tag → neues Kind, Ende-Tag → zurück zum Elter;
   leere Elemente (input, br, …) und „/>" bleiben ohne Kinder; script
   und style nehmen ihren Inhalt als Text. Kommentare und <!DOCTYPE>
   werden übersprungen. */
function parseInto(root, html) {
  const tagRe = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let current = root, last = 0, m;
  const text = (from, to) => {
    if (to <= from) return;
    const t = html.slice(from, to);
    if (!t.trim()) return;
    current._text += decode(t.replace(/\s+/g, ' '));
  };
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0].startsWith('<!')) { text(last, m.index); last = tagRe.lastIndex; continue; }
    text(last, m.index);
    last = tagRe.lastIndex;
    const [, close, rawTag, attrStr, selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (close) {
      let n = current;
      while (n && n !== root && n.tagName !== tag.toUpperCase()) n = n.parentNode;
      if (n && n !== root) current = n.parentNode || root;
      continue;
    }
    const el = new El(tag);
    const attrs = parseAttrs(attrStr || '');
    for (const [k, v] of Object.entries(attrs)) el.attrs[k] = v;
    el._cls = null;
    if (attrs.value !== undefined) el.value = attrs.value;
    if ('checked' in attrs) el.checked = true;
    if ('disabled' in attrs) el.disabled = true;
    if ('selected' in attrs) el.selected = true;
    current.appendChild(el);
    if (RAW.has(tag)) {
      const end = html.indexOf('</' + tag, tagRe.lastIndex);
      const stop = end < 0 ? html.length : end;
      el._text = html.slice(tagRe.lastIndex, stop);
      tagRe.lastIndex = stop;
      last = stop;
      continue;
    }
    if (VOID.has(tag) || selfClose) continue;
    current = el;
  }
  text(last, html.length);
}

/* Aus dem echten HTML den Baum nachbauen — so bleibt der Test an die
   Seite gekoppelt. Kopf und Rumpf hängen unter documentElement. */
export function buildDocument(html) {
  const root = new El('html');
  parseInto(root, html);
  let htmlEl = root.children.find(c => c.tagName === 'HTML');
  if (!htmlEl) { htmlEl = root; }
  let head = htmlEl.children.find(c => c.tagName === 'HEAD');
  let body = htmlEl.children.find(c => c.tagName === 'BODY');
  if (!head) { head = new El('head'); htmlEl.prepend(head); }
  if (!body) {
    body = new El('body');
    for (const c of htmlEl.children.slice()) if (c !== head) body.appendChild(c);
    htmlEl.appendChild(body);
  }
  const byId = {
    get(id) { return htmlEl.descendants().find(e => e.id === id) || null; }
  };
  const doc = {
    body, head, documentElement: htmlEl, nodeType: 9,
    activeElement: body, title: '', hidden: false, visibilityState: 'visible', readyState: 'complete',
    getElementById: id => htmlEl.descendants().find(e => e.id === id) || null,
    createElement: tag => new El(tag),
    createElementNS: (ns, tag) => new El(tag),
    createTextNode: t => new TextNode(t),
    createDocumentFragment: () => new El('fragment'),
    querySelector: sel => htmlEl.descendants().find(e => matchSelector(e, sel)) || null,
    querySelectorAll: sel => htmlEl.descendants().filter(e => matchSelector(e, sel)),
    contains: el => htmlEl.contains(el),
    /* Tastendrücke landen auf dem Dokument (Entf, Esc) — dieselbe
       kleine Ereignismaschine wie an den Elementen. Ein Ereignis, das an
       einem Element ausgelöst wird, kommt nach dem Aufstieg auch hier an. */
    listeners: {},
    addEventListener(type, fn) { (doc.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { doc.listeners[type] = (doc.listeners[type] || []).filter(f => f !== fn); },
    dispatch(type, extra = {}) {
      const ev = { type, target: body, currentTarget: doc, preventDefault() {}, stopPropagation() {}, ...extra };
      for (const fn of [...(doc.listeners[type] || [])]) fn.call(doc, ev);
      return ev;
    },
    dispatchEvent(ev) { doc.dispatch(ev.type, { key: ev.key, detail: ev.detail }); return true; }
  };
  doc.defaultView = globalThis;
  return { doc, byId, El };
}

/* Ein Ereignisziel für window: beforeunload, storage, resize … */
function windowEvents() {
  if (typeof globalThis.addEventListener === 'function') return;
  const ls = {};
  globalThis.addEventListener = (t, fn) => { (ls[t] ||= []).push(fn); };
  globalThis.removeEventListener = (t, fn) => { ls[t] = (ls[t] || []).filter(f => f !== fn); };
  globalThis.dispatchEvent = ev => { for (const fn of [...(ls[ev.type] || [])]) fn(ev); return true; };
}

/* localStorage im Speicher — die Entwürfe des Studios landen hier. */
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  };
}

export function installGlobals(doc) {
  globalThis.document = doc;
  globalThis.window = globalThis;
  windowEvents();
  globalThis.devicePixelRatio = 1;
  globalThis.innerWidth = 1400;
  globalThis.innerHeight = 900;
  globalThis.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 0);
  globalThis.cancelAnimationFrame = id => clearTimeout(id);
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.location = { search: '', href: 'http://test/entformungsanalyse.html', pathname: '/entformungsanalyse.html' };
  if (!globalThis.localStorage) globalThis.localStorage = memoryStorage();
  if (!globalThis.sessionStorage) globalThis.sessionStorage = memoryStorage();
  if (!globalThis.matchMedia) globalThis.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  if (!globalThis.getComputedStyle) globalThis.getComputedStyle = el => ({ getPropertyValue: k => (el && el.style && el.style[k]) || '' });
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => 'blob:test';
    globalThis.URL.revokeObjectURL = () => {};
  }
  /* Die Seiten holen ihre Beispielteile mit fetch() aus assets/parts/.
     Hier kommt dieselbe Datei aus dem Projektordner — der Test prüft
     also genau das, was ausgeliefert wird. */
  globalThis.fetch = async url => {
    const file = resolve(ROOT, String(url).replace(/^\.?\//, ''));
    if (!existsSync(file)) return { ok: false, status: 404, arrayBuffer: async () => null, text: async () => '' };
    const buf = readFileSync(file);
    return {
      ok: true, status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      text: async () => buf.toString('utf8')
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
    readAsText(blob) {
      Promise.resolve(blob.text ? blob.text() : String(blob)).then(t => {
        this.result = t;
        this.onload && this.onload();
        this.onloadend && this.onloadend();
      });
    }
  };
}

export { El, TextNode };
