/* Der Gastgeber eines Werkzeugs: Rahmen, Bauteil, Abstandsfeld, Verlauf,
   Entwurf, Rechnungen und Dateien — alles, was ein Werkzeug von seiner
   Umgebung braucht, an einem Ort. Die Einzelseiten bauen einen Gastgeber
   für ihr eines Werkzeug (createHost); die Werkbank ist ein Gastgeber für
   sechs.

   Ein Werkzeug ist eine Fabrik createXTool(host), die zurückgibt:
     id, modes [{ id, label, hint, help, html, enter(), leave(), primary() }],
     toJSON(), fromJSON(obj), accepts [Formatkennung], exports [{ label, enabled, run }],
     serialize()/restore() für den Verlauf (wahlweise), keys { Delete, Escape } (wahlweise),
     onPartStart() — ein Bauteil BEGINNT zu laden (das alte Ergebnis gilt ab
       jetzt nicht mehr als fertig), onPart(model) — es ist da,
     settingsOnly — das Werkzeug hat nur Einstellungen, keinen Plan (die
       Analysen): sie werden je Bauteil still gemerkt und beim nächsten Mal
       übernommen (mit „Zurücksetzen", dazu resetSettings()); kein
       „Ungespeichert", keine Frage beim Verlassen. Ein Plan (die Designer)
       wird dagegen nie still übernommen, und die Seite fragt, bevor er
       verloren geht.
   Ein Werkzeug mit ZWEI Bauteilen (die Abstandsanalyse) verzichtet auf das
   Bauteil des Gastgebers (createHost({ part: false })): es lädt seine Dateien
   selbst, nennt mit host.settingsFor(schlüssel) das Paar, zu dem seine
   Einstellungen gehören, nimmt abgelegte Netze über host.dropPart entgegen
   und startet in tool.start().
   Der Gastgeber verdrahtet Reiter, Hauptknopf, Speichern, Exportieren,
   Öffnen, Rückgängig, Entwurf und Tasten — das Werkzeug kümmert sich nur
   um seine Sache. */

import { createShell } from './shell.js';
import { createPart } from './part.js';
import { createHistory } from './history.js';
import { createStore } from './store.js';
import { createJobRunner } from './job.js';
import { openAny, saveJSON, planName, wireDrop } from './files.js';
import { buildField, fieldSize, fieldExtrema, suggestCell, CELL_RANGE } from '../part/field.js';
import { fmtWhen } from './format.js';

const MAX_SAMPLES = 16e6;

export function createHost({ mount, id, title, help = '', start = null, sceneOpts = {}, part = true }) {
  const shell = createShell({ mount, title, help, sceneOpts });
  const listeners = {};
  const host = {
    id, shell, ui: shell.ui, view: shell.view, viewport: shell.viewport, aim: shell.aim,
    tool: null, ready: false,
    on(ev, fn) { (listeners[ev] ||= []).push(fn); },
    emit(ev, ...args) { for (const fn of listeners[ev] || []) { try { fn(...args); } catch (err) { console.error(ev, err); } } }
  };

  /* ── Bauteil ─────────────────────────────────────────────── */
  if (!part) shell.header.hidePart();
  host.part = !part ? null : createPart({
    shell, start,
    onStart: () => { host.ready = false; if (host.tool && host.tool.onPartStart) host.tool.onPartStart(); },
    onLoad: async (model, name) => {
      field.data = null; field.stats = null; field.stale = false; field.promise = null;
      if (field.hAuto) field.h = suggestCell(model);
      store.setPart(host.part.key);
      host.emit('part', model, name);
      if (host.tool && host.tool.onPart) await host.tool.onPart(model, name);
      offerDraft();
      host.ready = true;
    }
  });

  /* ── Das Abstandsfeld: einmal je Bauteil und Zellkante ──── */
  const field = {
    data: null, stats: null, h: 3, hAuto: true, stale: false, promise: null, ms: 0,
    setCell(v) {
      field.h = Math.max(CELL_RANGE[0], Math.min(CELL_RANGE[1], v));
      field.hAuto = false;
      if (field.data && Math.abs(field.data.h - field.h) > 1e-9) { field.stale = true; host.emit('field-stale'); }
      return field.h;
    },
    /** Was das Feld kosten würde. */
    estimate(opts = {}) {
      const m = host.part && host.part.model;
      if (!m) return null;
      const h = opts.h || field.h;
      return fieldSize(m, 0, opts.band ?? 3 * h, { h, pad: opts.pad ?? 2 * h });
    },
    /** Das Feld holen — vorhanden oder jetzt rechnen (mit Fortschritt und Abbruch). */
    async ensure(opts = {}) {
      const m = host.part && host.part.model;
      if (!m) return null;
      const h = opts.h || field.h;
      const band = opts.band ?? 3 * h, pad = opts.pad ?? 2 * h;
      const fits = f => f && Math.abs(f.h - h) < 1e-9 && f.band >= band - 1e-6 && f.padCells >= Math.round(pad / h) - 1e-6;
      if (!opts.force && !field.stale && fits(field.data)) return field.data;
      const t0 = performance.now();
      let size = fieldSize(m, 0, band, { h, pad });
      let hh = h;
      while (size.samples > MAX_SAMPLES) { hh = Math.round(hh * 110) / 100; size = fieldSize(m, 0, band, { h: hh, pad }); }
      const f = await buildField(m, { h: hh, band, pad, onProgress: opts.onProgress, signal: opts.signal });
      f.padCells = Math.round(pad / hh);
      if (host.part.model !== m) return null;
      field.data = f;
      field.stats = fieldExtrema(f);
      field.stale = false;
      field.ms = performance.now() - t0;
      field.lifted = hh !== h ? hh : null;
      host.emit('field', f);
      return f;
    }
  };
  host.field = field;

  /* ── Entwurf, Verlauf, Rechnungen ────────────────────────── */
  const store = createStore({ tool: id });
  host.store = store;
  host.jobs = createJobRunner(shell);
  let history = null;
  store.guard();
  const settingsOnly = () => !!(host.tool && host.tool.settingsOnly);
  store.onState(s => {
    if (settingsOnly()) { shell.header.setSave({ state: '' }); return; }
    shell.header.setSave({ state: s.dirty ? (s.lastSaved ? 'draft' : 'dirty') : (s.lastSaved ? 'saved' : ''), when: s.lastSaved });
  });

  /** Das Werkzeug meldet eine Änderung: Verlauf, Entwurf, Kopfzeile. */
  host.changed = (label = '', opts = {}) => {
    if (history && !opts.silent) history.commit(label);
    store.save(() => host.tool.toJSON(), { quiet: settingsOnly() });
  };

  /** Für Werkzeuge ohne das Bauteil des Gastgebers: zu welchem Schlüssel
      (etwa dem Dateipaar) die Einstellungen gehören — und gleich nachsehen,
      ob dafür welche gemerkt sind. */
  host.settingsFor = key => { store.setPart(key); offerDraft(); };

  function offerDraft() {
    const tool = host.tool;
    if (!tool) return;
    const d = store.peek();
    if (!d) return;
    let same = false;
    try { same = JSON.stringify(d.doc) === JSON.stringify(tool.toJSON()); } catch { /* egal */ }
    if (same) return;
    if (tool.settingsOnly) {
      /* Einstellungen kommen still zurück — aber sichtbar und umkehrbar. */
      try { tool.fromJSON(d.doc); } catch { store.discard(); return; }
      shell.toast('Einstellungen vom ' + fmtWhen(d.when) + ' übernommen.', {
        action: 'Zurücksetzen',
        onAction: () => { store.discard(); if (tool.resetSettings) tool.resetSettings(); }
      });
      return;
    }
    shell.banner({
      text: 'Entwurf vom ' + fmtWhen(d.when) + ' für dieses Bauteil wiederherstellen?',
      actions: [
        { label: 'Wiederherstellen', primary: true, onClick: () => { tool.fromJSON(d.doc); if (history) history.reset(); shell.toast('Entwurf wiederhergestellt.'); } },
        { label: 'Verwerfen', onClick: () => store.discard() }
      ]
    });
  }

  /* ── Dateien ─────────────────────────────────────────────── */
  async function openFile(file) {
    try {
      await openAny(file, {
        json: (obj, name) => {
          const tool = host.tool;
          if (tool && tool.accepts && tool.accepts.includes(obj.format)) {
            tool.fromJSON(obj);
            if (history) history.reset();
            store.markSaved();
            shell.toast('„' + name + '" geladen.');
          } else if (host.openJSON) host.openJSON(obj, name);
          else throw new Error('„' + name + '" gehört zu einem anderen Werkzeug (Kennung „' + obj.format + '").');
        },
        part: (tris, name, note) => {
          if (host.dropPart) return host.dropPart(tris, name, note);
          if (!host.part) throw new Error('Dieses Werkzeug nimmt hier kein Bauteil entgegen.');
          const sel = document.getElementById('demo-select');
          if (sel) sel.selectedIndex = -1;
          return host.part.load(tris, name, note);
        }
      });
    } catch (err) {
      const warn = document.getElementById('model-warn');
      if (warn) warn.textContent = err.message;
      shell.toast(err.message, { ms: 8000 });
      console.error(err);
    }
  }
  host.openFile = openFile;
  wireDrop(shell.viewport, openFile);
  /* Der Dateiknopf der Bauteil-Klappe nimmt auch Pläne: partsource.js
     liest nur Netze, deshalb greift der Gastgeber vor. */
  const input = document.getElementById('stl-input');
  const stlBtn = document.getElementById('stl-btn');
  if (host.part && input && stlBtn) {
    const fresh = input.cloneNode(true);
    input.replaceWith(fresh);
    fresh.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
    const freshBtn = stlBtn.cloneNode(true);
    stlBtn.replaceWith(freshBtn);
    freshBtn.addEventListener('click', () => fresh.click());
  }

  /* ── Das Werkzeug einbauen ───────────────────────────────── */
  host.mountTool = factory => {
    const tool = factory(host);
    host.tool = tool;
    shell.setModes(tool.modes);
    shell.onMode((id, prev) => {
      const from = tool.modes.find(m => m.id === prev), to = tool.modes.find(m => m.id === id);
      if (from && from.leave) from.leave();
      if (to && to.enter) to.enter();
      host.refreshActions();
    });
    host.refreshActions = () => {
      const m = tool.modes.find(x => x.id === shell.mode);
      const spec = m && m.primary ? m.primary() : null;
      shell.setPrimary(spec);
    };
    if (tool.serialize && tool.restore) {
      history = createHistory({ serialize: tool.serialize, restore: doc => { tool.restore(doc); host.refreshActions(); } });
      host.history = history;
      history.on(h => shell.header.setUndo({ visible: true, canUndo: h.canUndo, canRedo: h.canRedo, undoLabel: h.undoLabel, redoLabel: h.redoLabel }));
      shell.header.onUndo(() => { if (history.undo()) store.save(() => tool.toJSON()); });
      shell.header.onRedo(() => { if (history.redo()) store.save(() => tool.toJSON()); });
      history.reset();
    } else shell.header.setUndo({ visible: false });
    const docName = () => (host.part ? host.part.name : (tool.docName ? tool.docName() : ''));
    shell.header.onSave(() => {
      saveJSON(tool.toJSON(), planName(docName(), id));
      store.markSaved();
      shell.toast('Gespeichert: ' + planName(docName(), id));
    });
    shell.header.setExports(tool.exports || []);
    shell.onKey((ev, ctx) => {
      if ((ev.ctrlKey || ev.metaKey) && !ctx.inInput && history) {
        if (ev.key === 'z' || ev.key === 'Z') { if (ev.shiftKey) history.redo(); else history.undo(); store.save(() => tool.toJSON()); return true; }
        if (ev.key === 'y' || ev.key === 'Y') { history.redo(); store.save(() => tool.toJSON()); return true; }
      }
      if (ev.key === 'Escape') {
        if (shell.aim && host.cancelAim && host.cancelAim()) return true;
        if (tool.keys && tool.keys.Escape) return tool.keys.Escape(ev) !== false;
        return false;
      }
      if (ctx.inInput) return false;
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && tool.keys && tool.keys.Delete) return tool.keys.Delete(ev) !== false;
      if ((ev.key === 'f' || ev.key === 'F') && !ev.ctrlKey && !ev.metaKey) { shell.fit(); return true; }
      return false;
    });
    if (tool.mounted) tool.mounted();
    const first = tool.startMode || tool.modes[0].id;
    shell.setMode(first);
    return tool;
  };

  /** Loslegen: Bauteil laden (?part=… oder Vorgabe) — oder das Werkzeug lädt selbst. */
  host.start = () => (host.part ? host.part.start() : (host.tool && host.tool.start ? host.tool.start() : null));
  return host;
}
