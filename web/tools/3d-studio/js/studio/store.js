/* Entwürfe im Browser — was man gerade tut, geht nicht verloren.

   Je Werkzeug und Bauteil ein Schlüssel in localStorage:
     studio:<werkzeug>:<bauteil> = { v, when, doc }
   save() schreibt entprellt nach jeder Änderung, peek() sagt beim Laden,
   ob ein Entwurf da ist (der Rahmen bietet ihn an, wendet ihn nie still
   an), markSaved() nach „Speichern"/Export räumt das Schmutzige weg.
   Ohne localStorage (privates Fenster, gesperrt) tut alles so, als sei
   nichts da — kein Fehler, nur kein Entwurf. */

const PREFIX = 'studio:';
const MAX_BYTES = 512 * 1024;

function storage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = PREFIX + 'probe';
    s.setItem(probe, '1'); s.removeItem(probe);
    return s;
  } catch { return null; }
}

export function createStore({ tool, debounce = 1000 } = {}) {
  let partKey = '';
  let timer = 0;
  let dirty = false;          // geändert seit dem letzten Speichern/Export
  let lastSaved = 0;          // Zeitpunkt des letzten Entwurfs
  let onState = null;
  let pending = null;         // wartet noch auf den entprellten Schreibvorgang
  const key = () => PREFIX + tool + ':' + (partKey || '-');
  const notify = () => { if (onState) onState(api); };

  const api = {
    get available() { return !!storage(); },
    get dirty() { return dirty; },
    get partKey() { return partKey; },
    get lastSaved() { return lastSaved; },
    setPart(k) { partKey = String(k || ''); },
    onState(fn) { onState = fn; },

    /** Entwurf ablegen — entprellt, damit ein Regler nicht hundertmal schreibt.
        `quiet`: nur merken, nichts als ungesichert melden — für Werkzeuge,
        die bloß Einstellungen haben (kein Plan, der verloren gehen könnte). */
    save(getDoc, { quiet = false } = {}) {
      if (!quiet) { dirty = true; notify(); }
      pending = getDoc;
      clearTimeout(timer);
      timer = setTimeout(() => api.flush(getDoc), debounce);
    },
    flush(getDoc) {
      clearTimeout(timer);
      pending = null;
      const s = storage();
      if (!s) return false;
      let text;
      try { text = JSON.stringify({ v: 1, when: Date.now(), part: partKey, doc: getDoc() }); }
      catch { return false; }
      if (text.length > MAX_BYTES) return false;
      try { s.setItem(key(), text); } catch { return false; }
      lastSaved = Date.now();
      notify();
      return true;
    },
    /** Gibt es einen Entwurf für dieses Werkzeug und Bauteil? */
    peek() {
      const s = storage();
      if (!s) return null;
      try {
        const raw = s.getItem(key());
        if (!raw) return null;
        const obj = JSON.parse(raw);
        return obj && obj.doc ? obj : null;
      } catch { return null; }
    },
    /** Entwürfe dieses Werkzeugs für ANDERE Bauteile (Hinweis, nie stille Übernahme). */
    others() {
      const s = storage();
      if (!s) return [];
      const out = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (!k || !k.startsWith(PREFIX + tool + ':') || k === key()) continue;
        try { const o = JSON.parse(s.getItem(k)); if (o && o.doc) out.push({ part: o.part, when: o.when }); } catch { /* kaputt: ignorieren */ }
      }
      return out;
    },
    discard() {
      clearTimeout(timer);
      pending = null;
      const s = storage();
      if (s) try { s.removeItem(key()); } catch { /* egal */ }
      dirty = false;
      lastSaved = 0;
      notify();
    },
    /** Nach „Speichern"/Export: der Stand ist gesichert. Der Entwurf bleibt
        (er ist derselbe Stand), nur die Warnung beim Verlassen entfällt. */
    markSaved() { dirty = false; lastSaved = Date.now(); notify(); },
    /** Für den Rahmen: beforeunload nur, wenn etwas Ungesichertes da ist. */
    guard() {
      if (typeof window === 'undefined' || !window.addEventListener) return;
      window.addEventListener('beforeunload', ev => {
        if (!dirty) return;
        ev.preventDefault();
        ev.returnValue = '';
      });
      /* Wer innerhalb der Entprellzeit geht, nähme die letzte Änderung sonst
         nicht mit: beim Verlassen wird geschrieben, was noch wartet. */
      window.addEventListener('pagehide', () => { if (pending) api.flush(pending); });
    }
  };
  return api;
}
