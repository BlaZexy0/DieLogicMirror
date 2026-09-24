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
  /* Was noch auf den entprellten Schreibvorgang wartet — als ABZUG von dem
     Moment, in dem es gemeldet wurde, samt Bauteil: wer später schreibt
     (Wecker, neues Bauteil, Verlassen), schreibt genau das, auch wenn das
     Werkzeug inzwischen längst für ein anderes Bauteil steht. */
  let pending = null;         // { part, doc } oder null
  const keyOf = k => PREFIX + tool + ':' + (k || '-');
  const key = () => keyOf(partKey);
  const notify = () => { if (onState) onState(api); };
  function write(part, doc) {
    const s = storage();
    if (!s) return false;
    let text;
    try { text = JSON.stringify({ v: 1, when: Date.now(), part, doc }); }
    catch { return false; }
    if (text.length > MAX_BYTES) return false;
    try { s.setItem(keyOf(part), text); } catch { return false; }
    lastSaved = Date.now();
    notify();
    return true;
  }

  const api = {
    get dirty() { return dirty; },
    get partKey() { return partKey; },
    get lastSaved() { return lastSaved; },
    /** Ein anderes Bauteil: was noch wartet, gehört dem bisherigen und wird
        JETZT unter dessen Schlüssel geschrieben — der Wecker schrieb es sonst
        eine Sekunde später unter den neuen, und das frische, leere Blatt des
        neuen Bauteils überschrieb dessen Entwurf. Das neue Bauteil beginnt
        ohne Ungesichertes: der bisherige Stand liegt sicher im Entwurf. */
    setPart(k) {
      const next = String(k || '');
      api.flushPending();
      if (next === partKey) return;
      partKey = next;
      dirty = false;
      lastSaved = 0;
      notify();
    },
    /** Was noch wartet, sofort schreiben (der Rahmen tut es, bevor ein neues
        Bauteil zu laden beginnt und das Werkzeug seinen Stand wegräumt). */
    flushPending() {
      clearTimeout(timer);
      if (!pending) return false;
      const { part, doc } = pending;
      pending = null;
      return write(part, doc);
    },
    onState(fn) { onState = fn; },

    /** Entwurf ablegen — entprellt, damit ein Regler nicht hundertmal schreibt.
        `quiet`: nur merken, nichts als ungesichert melden — für Werkzeuge,
        die bloß Einstellungen haben (kein Plan, der verloren gehen könnte). */
    save(getDoc, { quiet = false } = {}) {
      if (!quiet) { dirty = true; notify(); }
      let doc;
      try { doc = getDoc(); } catch { return; }
      pending = { part: partKey, doc };
      clearTimeout(timer);
      timer = setTimeout(() => api.flushPending(), debounce);
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
      window.addEventListener('pagehide', () => api.flushPending());
    }
  };
  return api;
}
