/* Rückgängig und Wiederholen — ein Stapel von Abzügen.

   Jedes Werkzeug hat EINE Quelle der Wahrheit (Graph, Plan), und die
   lässt sich als JSON abziehen (toJSON) und zurücksetzen (fromJSON). Also
   ist der Verlauf eine Liste solcher Abzüge: commit() nach jeder
   abgeschlossenen Änderung, begin()/end() um einen Zug am Griff (ein
   Eintrag für den ganzen Zug, nicht einer je Maussschritt), coalesce()
   für Regler (ein Eintrag, solange man am selben Regler dreht). */

export function createHistory({ serialize, restore, limit = 100 } = {}) {
  let past = [];      // Abzüge vor dem aktuellen Stand
  let future = [];    // was rückgängig gemacht wurde
  let present = null; // der aktuelle Abzug (als Text)
  let open = null;    // begin() offen: der Stand vor dem Zug
  let coalesceKey = null, coalesceTimer = 0;
  const listeners = [];
  const snap = () => JSON.stringify(serialize());
  const emit = () => { for (const fn of listeners) fn(api); };

  const api = {
    /** Den jetzigen Stand als Ausgangspunkt merken (nach dem Laden). */
    reset() { past = []; future = []; present = snap(); open = null; coalesceKey = null; emit(); },
    /** Eine abgeschlossene Änderung eintragen. */
    commit(label = '') {
      const now = snap();
      if (present === null) { present = now; emit(); return false; }
      if (now === present) return false;
      past.push({ state: present, label });
      if (past.length > limit) past.shift();
      present = now;
      future = [];
      coalesceKey = null;
      emit();
      return true;
    },
    /** Ein Zug beginnt: den Stand davor festhalten … */
    begin() { if (open === null) open = present === null ? snap() : present; },
    /** … und beim Loslassen als EINEN Eintrag ablegen. */
    end(label = '') {
      if (open === null) return api.commit(label);
      const before = open;
      open = null;
      const now = snap();
      if (now === before) { present = now; return false; }
      past.push({ state: before, label });
      if (past.length > limit) past.shift();
      present = now;
      future = [];
      emit();
      return true;
    },
    /** Reglerdrehen: mehrere Änderungen unter demselben Schlüssel
        innerhalb von `ms` sind ein Eintrag. */
    coalesce(key, label = '', ms = 400) {
      if (coalesceKey !== key) { api.commit(label); coalesceKey = key; }
      else present = snap();
      clearTimeout(coalesceTimer);
      coalesceTimer = setTimeout(() => { coalesceKey = null; }, ms);
    },
    /** Zum zuletzt eingetragenen Stand zurück, ohne Eintrag: was seitdem
        geschah, war nie ein Schritt (ein Zug am Griff, den Esc abbricht). */
    revert() {
      if (present === null || snap() === present) { open = null; return false; }
      open = null;
      restore(JSON.parse(present));
      emit();
      return true;
    },
    undo() {
      coalesceKey = null; clearTimeout(coalesceTimer);
      if (!past.length) return false;
      const entry = past.pop();
      future.push({ state: present, label: entry.label });
      present = entry.state;
      restore(JSON.parse(present));
      emit();
      return true;
    },
    redo() {
      coalesceKey = null; clearTimeout(coalesceTimer);
      if (!future.length) return false;
      const entry = future.pop();
      past.push({ state: present, label: entry.label });
      present = entry.state;
      restore(JSON.parse(present));
      emit();
      return true;
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get undoLabel() { return past.length ? past[past.length - 1].label : ''; },
    get redoLabel() { return future.length ? future[future.length - 1].label : ''; },
    get depth() { return past.length; },
    on(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
  };
  return api;
}
