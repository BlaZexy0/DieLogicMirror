/* Der Gastgeber eines Werkzeugs: Rahmen, Bauteil, Abstandsfeld, Verlauf,
   Entwurf, Rechnungen und Dateien — alles, was ein Werkzeug von seiner
   Umgebung braucht, an einem Ort. Jede Werkzeugseite baut EINEN Gastgeber
   für ihr eines Werkzeug (bootPage).

   DER VERTRAG. Ein Werkzeug ist eine Fabrik createXTool(host), die ein
   Objekt zurückgibt; alles, was der Gastgeber vom Werkzeug wissen will,
   steht darin — er schreibt nichts von außen an sich selbst:
     id, modes [{ id, label, hint, help, html, enter(), leave(), primary() }]
       (enter/leave/primary wahlweise; primary() liefert den Hauptknopf
       { label, onClick, disabled, hidden, kind, reason, noteKind } oder null),
     startMode, mounted() — die Felder der Modi stehen jetzt auf der Seite,
     toJSON(), fromJSON(obj), accepts [Formatkennung],
     exports [{ label, enabled, reason, run }],
     serialize()/restore(doc) für den Verlauf (wahlweise),
     keys { Delete, Escape } (wahlweise; true: die Taste ist verbraucht),
     cancelDrag() — Esc während eines Zugs am Griff: abbrechen, true, wenn
       einer lief (wahlweise; kommt vor jedem anderen Esc, auch im Feld),
     cancelAim() — Esc im Zielmodus: abbrechen, true, wenn gezielt wurde,
     dropPart(tris, name, note) — ein geöffnetes oder abgelegtes Netz, wenn
       das Werkzeug seine Bauteile selbst hält (die Abstandsanalyse: A oder B?),
     openJSON(obj, name) — eine Datei, die nicht zu accepts gehört (die
       Angussfüllung nimmt Anguss- und Werkbankdateien),
     openFiles(files) — wer seine Dateien selbst liest, bekommt sie roh und
       alle, die abgelegt wurden (der Formaufbau: eine GLB ist dort eine
       ganze Form, mehrere STL kommen auf einmal),
     save() — wessen Dokument keine JSON-Datei ist (die GLB des
       Formaufbaus), schreibt beim Speichern selbst und liefert, was nach
       „Gespeichert:" steht (null: nichts geschrieben); saveTitle nennt es
       am Knopf,
     onPartStart() — ein Bauteil BEGINNT zu laden (das alte Ergebnis gilt ab
       jetzt nicht mehr als fertig), onPart(model, name) — es ist da,
     start() — wer ohne das Bauteil des Gastgebers anfängt, lädt selbst,
     docName() — der Name der Plandatei ohne Bauteil,
     settingsOnly — das Werkzeug hat nur Einstellungen, keinen Plan (die
       Analysen): sie werden je Bauteil still gemerkt und beim nächsten Mal
       übernommen (mit „Zurücksetzen", dazu resetSettings()); kein
       „Ungespeichert", keine Frage beim Verlassen. Ein Plan (die Designer)
       wird dagegen nie still übernommen, und die Seite fragt, bevor er
       verloren geht.

   Was das Werkzeug vom Gastgeber bekommt — und NUR das benutzt es:
     host.shell, host.ui(name), host.view, host.viewport, host.aim,
     host.part (oder null), host.field, host.jobs,
     host.changed(label, { coalesce, ms }) — eine abgeschlossene Änderung:
       Verlauf, Entwurf, Kopfzeile. Ohne Änderung ist es keine. Mit
       `coalesce` (ein Schlüssel) sind Reglerschritte unter demselben
       Schlüssel innerhalb von `ms` EIN Schritt,
     host.toastUndo(text) — nach changed(): „… entfernt · Rückgängig",
     host.removed(was, text) — beides in einem: der Schritt „<was> entfernt"
       und sein Toast,
     host.revert() — zum letzten Schritt zurück, ohne Schritt (Esc beim Zug),
     host.resetHistory() — ein neuer Anfang (neues Bauteil, neues System),
     host.refreshActions() — der Hauptknopf des Modus neu,
     host.settingsFor(key) — für Werkzeuge ohne das Bauteil des Gastgebers:
       zu welchem Schlüssel die Einstellungen gehören,
     host.openFile(file) — eine Datei, wie aus dem Knopf der Klappe.

   Ein Werkzeug mit ZWEI Bauteilen (die Abstandsanalyse) verzichtet auf das
   Bauteil des Gastgebers (part: false): es lädt seine Dateien selbst, nennt
   mit host.settingsFor(schlüssel) das Paar, zu dem seine Einstellungen
   gehören, und nimmt abgelegte Netze mit dropPart entgegen. Der Gastgeber
   verdrahtet Reiter, Hauptknopf, Speichern, Exportieren, Öffnen,
   Rückgängig, Entwurf und Tasten — das Werkzeug kümmert sich nur um seine
   Sache. */

import { createShell } from './shell.js';
import { createPart } from './part.js';
import { createHistory } from './history.js';
import { createStore } from './store.js';
import { createJobRunner } from './job.js';
import { openAny, saveJSON, planName, wireDrop } from './files.js';
import { buildField, planField, fieldExtrema, suggestCell, CELL_RANGE } from '../part/field.js';
import { fmtWhen } from './format.js';

export function createHost({ mount, id, title, help = '', start = null, sceneOpts = {}, part = true }) {
  const shell = createShell({ mount, title, help, sceneOpts });
  mount.setAttribute('data-tool', id);      // css/studio.css: Regeln, die nur EIN Werkzeug betreffen
  const host = {
    id, shell, ui: shell.ui, view: shell.view, viewport: shell.viewport, aim: shell.aim,
    tool: null
  };
  const jobs = createJobRunner(shell);
  host.jobs = jobs;

  /* ── Bauteil ─────────────────────────────────────────────── */
  if (!part) shell.header.hidePart();
  host.part = !part ? null : createPart({
    shell, start, onFile: file => openFile(file),
    /* Was vom bisherigen Bauteil noch nicht geschrieben ist, jetzt — bevor
       das Werkzeug seinen Stand für das neue wegräumt. Eine Rechnung für das
       alte Bauteil endet still: ihr Ergebnis gehört niemandem mehr. */
    onStart: () => {
      store.flushPending();
      jobs.supersede();
      if (host.tool && host.tool.onPartStart) host.tool.onPartStart();
    },
    onLoad: async (model, name) => {
      field.data = null; field.stats = null; field.stale = false;
      if (field.hAuto) field.h = suggestCell(model);
      store.setPart(host.part.key);
      if (host.tool && host.tool.onPart) await host.tool.onPart(model, name);
      offerDraft();
    }
  });

  /* ── Das Abstandsfeld: einmal je Bauteil und Zellkante ──── */
  const asked = f => (f.hAsked ?? f.h);
  /* Band nach außen und Rand um das Bauteil (mm): ohne Angabe drei und
     zwei Zellen, so viel braucht die Wandstärke. */
  const extent = (opts, h) => ({ h, band: opts.band ?? 3 * h, pad: opts.pad ?? 2 * h });
  const field = {
    data: null, stats: null, h: 3, hAuto: true, stale: false,
    setCell(v) {
      field.h = Math.max(CELL_RANGE[0], Math.min(CELL_RANGE[1], v));
      field.hAuto = false;
      /* Veraltet ist das Feld genau dann, wenn seine Kante von der gewählten
         abweicht — wer zur Kante des Feldes zurückkehrt, braucht kein neues. */
      const stale = !!(field.data && Math.abs(asked(field.data) - field.h) > 1e-9);
      field.stale = stale;
      return field.h;
    },
    /** Was das Feld kosten würde und mit welcher Kante es entsteht
        (js/part/field.js, planField) — für die Vorschau der Werkzeuge. */
    plan(opts = {}) {
      const m = host.part && host.part.model;
      return m ? planField(m, extent(opts, opts.h || field.h)) : null;
    },
    /** Das Feld holen — vorhanden oder jetzt rechnen (mit Fortschritt und Abbruch). */
    async ensure(opts = {}) {
      const m = host.part && host.part.model;
      if (!m) return null;
      const { h, band, pad } = extent(opts, opts.h || field.h);
      /* Verglichen wird mit dem, was BESTELLT war: ein Feld, das über 16 Mio.
         Punkten gröber gerastert wurde, passte sonst nie und galt nach jedem
         Blick auf die Zellkante als veraltet. */
      const fits = f => f && Math.abs(asked(f) - h) < 1e-9 && f.band >= band - 1e-6 && (f.padAsked ?? f.padCells * f.h) >= pad - 1e-6;
      if (!opts.force && !field.stale && fits(field.data)) return field.data;
      const hh = planField(m, { h, band, pad }).est.h;
      const f = await buildField(m, { h: hh, band, pad, onProgress: opts.onProgress, signal: opts.signal });
      f.padCells = Math.round(pad / hh);
      f.hAsked = h;
      f.padAsked = pad;
      if (host.part.model !== m) return null;
      field.data = f;
      field.stats = fieldExtrema(f);
      field.stale = false;
      return f;
    }
  };
  host.field = field;

  /* ── Entwurf, Verlauf ────────────────────────────────────── */
  const store = createStore({ tool: id });
  host.store = store;                       // für die Tests; die Werkzeuge melden über changed()
  let history = null;
  store.guard();
  const settingsOnly = () => !!(host.tool && host.tool.settingsOnly);
  store.onState(s => {
    if (settingsOnly()) { shell.header.setSave({ state: '' }); return; }
    shell.header.setSave({ state: s.dirty ? (s.lastSaved ? 'draft' : 'dirty') : (s.lastSaved ? 'saved' : ''), when: s.lastSaved });
  });

  /** Das Werkzeug meldet eine Änderung: Verlauf, Entwurf, Kopfzeile. */
  host.changed = (label = '', opts = {}) => {
    if (history) {
      /* Reglerdrehen: ein Eintrag, solange man am selben Regler dreht. */
      if (opts.coalesce) history.coalesce(opts.coalesce, label, opts.ms);
      /* Eine Meldung ohne Änderung ist keine: ein bloßer Klick auf einen Griff
         endet bei js/handles.js mit „drop", und die Seite stand danach auf
         „Ungespeichert", ohne dass sich etwas getan hätte. */
      else if (!history.commit(label)) return;
    }
    host.dropUndoToast();
    store.save(() => host.tool.toJSON(), { quiet: settingsOnly() });
  };

  /** Einen Schritt zurück oder wieder vor — Kopfzeile, Strg+Z/Y und das
      „Rückgängig" im Toast nach dem Entfernen gehen alle hier durch. */
  host.undo = () => { host.dropUndoToast(); if (!history || !history.undo()) return false; store.save(() => host.tool.toJSON()); return true; };
  host.redo = () => { host.dropUndoToast(); if (!history || !history.redo()) return false; store.save(() => host.tool.toJSON()); return true; };
  /** Zum zuletzt eingetragenen Stand zurück, ohne Schritt — für den Zug am
      Griff, den Esc abbricht (js/handles.js, onChange('cancel')). */
  host.revert = () => !!(history && history.revert());
  /** Ein neuer Anfang: der jetzige Stand ist der erste, nichts davor. */
  host.resetHistory = () => { if (history) history.reset(); };
  /** „… entfernt · Rückgängig": der Toast gehört zu GENAU dem Schritt, der
      eben gemeldet wurde. Bewegt sich der Verlauf danach (Strg+Z, ein neuer
      Schritt), verschwindet er — sonst nähme sein Knopf später einen ganz
      anderen Schritt zurück als den, von dem er spricht. Nach host.changed(). */
  let undoToast = false;
  host.toastUndo = text => { shell.toast(text, { action: 'Rückgängig', onAction: () => { undoToast = false; host.undo(); } }); undoToast = true; };
  host.dropUndoToast = () => { if (undoToast) { undoToast = false; shell.hideToast(); } };
  /** Etwas ist entfernt — gefragt wird nicht: der Schritt „<was> entfernt"
      und der Toast mit „Rückgängig" (`text`, sonst „<was> entfernt."). */
  host.removed = (what, text = what + ' entfernt.') => { host.changed(what + ' entfernt'); host.toastUndo(text); };

  /** Für Werkzeuge ohne das Bauteil des Gastgebers: zu welchem Schlüssel
      (etwa dem Dateipaar) die Einstellungen gehören — und gleich nachsehen,
      ob dafür welche gemerkt sind. */
  host.settingsFor = key => { store.setPart(key); offerDraft(); };

  /* Ein Angebot gilt für GENAU den Schlüssel, für den es gemacht wurde: ein
     neues Bauteil nimmt es mit weg, auch wenn es selbst keinen Entwurf hat —
     vorher blieb der Streifen stehen, sprach weiter von „diesem Bauteil" und
     setzte beim Klick den Plan des vorigen aufs neue. */
  function offerDraft() {
    const tool = host.tool;
    if (!tool) return;
    shell.banner(null);
    const key = store.partKey;
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
        onAction: () => { if (store.partKey !== key) return; store.discard(); if (tool.resetSettings) tool.resetSettings(); }
      });
      return;
    }
    shell.banner({
      text: 'Entwurf vom ' + fmtWhen(d.when) + (key ? ' für dieses Bauteil' : '') + ' wiederherstellen?',
      actions: [
        { label: 'Wiederherstellen', primary: true, onClick: () => restoreDraft(d, key) },
        /* Verworfen wird nur, was angeboten wurde: hat man inzwischen weiter-
           gearbeitet, liegt unter dem Schlüssel schon der neue Stand. */
        { label: 'Verwerfen', onClick: () => { const now = store.peek(); if (store.partKey === key && now && now.when === d.when) store.discard(); } }
      ]
    });
  }
  /* Wiederherstellen ist ein SCHRITT: wer inzwischen weitergearbeitet hat,
     holt seinen Stand mit Rückgängig zurück. Danach ist der Plan ein Entwurf,
     keine gespeicherte Datei — die Kopfzeile sagt es, und Verlassen fragt. */
  function restoreDraft(d, key) {
    const tool = host.tool;
    if (!tool || store.partKey !== key) return;
    try { tool.fromJSON(d.doc); }
    catch (err) {
      shell.toast('Der Entwurf lässt sich nicht wiederherstellen: ' + err.message, { ms: 8000 });
      console.error(err);
      return;
    }
    if (history) history.commit('Entwurf wiederhergestellt');
    host.refreshActions();
    store.save(() => tool.toJSON());
    shell.toast('Entwurf wiederhergestellt.');
  }

  /* ── Dateien ─────────────────────────────────────────────── */
  /* Der Knopf der Bauteil-Klappe und das Ablegen im Bild nehmen beides: ein
     Netz und einen Plan. Was es ist, sagt der Inhalt (js/studio/files.js). */
  async function openFile(file) {
    const tool = host.tool;
    try {
      await openAny(file, {
        json: (obj, name) => {
          if (tool && tool.accepts && tool.accepts.includes(obj.format)) {
            tool.fromJSON(obj);
            host.resetHistory();
            /* Einstellungen aus einer Datei gelten wie selbst gesetzte: gemerkt. */
            if (tool.settingsOnly) store.save(() => tool.toJSON(), { quiet: true });
            store.markSaved();
            shell.toast('„' + name + '" geladen.');
          } else if (tool && tool.openJSON) tool.openJSON(obj, name);
          else throw new Error('„' + name + '" gehört zu einem anderen Werkzeug (Kennung „' + obj.format + '").');
        },
        part: async (tris, name, note) => {
          if (tool && tool.dropPart) return tool.dropPart(tris, name, note);
          if (!host.part) throw new Error('Dieses Werkzeug nimmt hier kein Bauteil entgegen.');
          return host.part.load(tris, name, note);
        }
      });
    } catch (err) {
      const warn = shell.header.partFields.warn;
      if (warn) warn.textContent = err.message;
      shell.toast(err.message, { ms: 8000 });
      console.error(err);
    }
  }
  host.openFile = openFile;
  /* Abgelegt wird eine Datei — oder, für ein Werkzeug, das seine Dateien
     selbst liest (openFiles), alle auf einmal. */
  wireDrop(shell.viewport, files => (host.tool && host.tool.openFiles ? host.tool.openFiles(files) : openFile(files[0])), { multiple: true });

  /* ── Das Werkzeug einbauen ───────────────────────────────── */
  host.mountTool = factory => {
    const tool = factory(host);
    host.tool = tool;
    shell.setModes(tool.modes);
    shell.onMode((id, prev) => {
      const from = tool.modes.find(m => m.id === prev), to = tool.modes.find(m => m.id === id);
      if (from && from.leave) from.leave();
      /* Die Zeile unter dem Hauptknopf gehört dem Modus: ein Modus, der keine
         eigene setzt, erbte sonst die des vorigen. Läuft eine Rechnung,
         schreibt ihr Fortschritt sie gleich wieder. */
      shell.setNote('');
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
      host.history = history;               // für die Tests; die Werkzeuge melden über changed()
      history.on(h => shell.header.setUndo({ visible: true, canUndo: h.canUndo, canRedo: h.canRedo, undoLabel: h.undoLabel, redoLabel: h.redoLabel }));
      shell.header.onUndo(() => host.undo());
      shell.header.onRedo(() => host.redo());
      history.reset();
    } else shell.header.setUndo({ visible: false });
    const docName = () => (host.part ? host.part.name : (tool.docName ? tool.docName() : ''));
    /* Speichern schreibt den Plan als JSON — außer das Werkzeug schreibt
       sein Dokument selbst (save: die GLB des Formaufbaus). Gespeichert ist
       es erst, wenn die Datei da ist. */
    if (tool.saveTitle) shell.ui('save').title = tool.saveTitle;
    shell.header.onSave(async () => {
      if (tool.save) {
        let what;
        try { what = await tool.save(); }
        catch (err) {
          shell.toast('Speichern ging nicht: ' + err.message, { ms: 8000 });
          console.error(err);
          return;
        }
        if (!what) return;
        store.markSaved();
        shell.toast('Gespeichert: ' + what);
        return;
      }
      saveJSON(tool.toJSON(), planName(docName(), id));
      store.markSaved();
      shell.toast('Gespeichert: ' + planName(docName(), id));
    });
    shell.header.setExports(tool.exports || []);
    shell.onKey((ev, ctx) => {
      /* Im Textfeld gehört Strg+Z dem Text; überall sonst (auch nach einem
         Zug am Regler, dessen Fokus noch steht) dem Plan. */
      if ((ev.ctrlKey || ev.metaKey) && !ctx.inText && history) {
        if (ev.key === 'z' || ev.key === 'Z') { if (ev.shiftKey) host.redo(); else host.undo(); return true; }
        if (ev.key === 'y' || ev.key === 'Y') { host.redo(); return true; }
      }
      if (ev.key === 'Escape') {
        /* Ein laufender Zug am Griff zuerst — auch wenn ein Feld noch den
           Fokus hat: js/handles.js verhindert beim Griff das Wegnehmen des
           Fokus, und Esc verließe sonst nur das Feld. */
        if (tool.cancelDrag && tool.cancelDrag()) return true;
        if (tool.cancelAim && tool.cancelAim()) return true;
        /* Esc im Feld verlässt das Feld — und nimmt NICHT die Auswahl weg:
           das Auswahlfeld, in dem man tippt, verschwände sonst samt Eingabe. */
        if (ctx.inInput) { if (ev.target && ev.target.blur) ev.target.blur(); return true; }
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

  /** Loslegen: das Werkzeug, wenn es selbst anfängt (start) — sonst das
      Bauteil (?part=… oder die Vorgabe). */
  host.start = () => {
    const tool = host.tool;
    if (tool && tool.start) return tool.start();
    return host.part ? host.part.start() : null;
  };
  return host;
}

/**
 * Eine Werkzeugseite: EIN Gastgeber, EIN Werkzeug, und los. `name` ist der
 * Testgriff (window.__<name>, dazu window.__form3d wie auf jeder 3D-Seite).
 * → der Testgriff des Werkzeugs (tool.__viewer), sofort — das Laden läuft.
 */
export function bootPage({ tool: factory, name, ...opts }) {
  const host = createHost({ mount: document.getElementById('studio'), ...opts });
  const tool = host.mountTool(factory);
  const handle = tool.__viewer;
  window.__form3d = handle;
  window['__' + name] = handle;
  Promise.resolve(host.start()).catch(err => console.error(err));
  return handle;
}
