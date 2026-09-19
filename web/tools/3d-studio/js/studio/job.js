/* Lange Rechnungen — ein Muster für alle: der Hauptknopf wird zu
   „Abbrechen", darunter läuft der Fortschritt, im Viewport steht, was
   gerade passiert; das Werkzeug bekommt ein AbortSignal, das die
   Rechenmodule an ihren Haltepunkten prüfen (js/abort.js). Ein Abbruch
   ist eine Entscheidung, keine Panne: run() liefert dann null. */

import { isAbort } from '../abort.js';

export function createJobRunner(shell) {
  let current = null;
  const api = {
    get running() { return !!current; },
    get label() { return current ? current.label : ''; },
    /**
     * spec.label   was der Knopf vorher hieß (für die Meldung)
     * spec.run     async (signal, progress) → Ergebnis; progress(p, text)
     * spec.note    erste Fortschrittszeile
     * spec.onCancel  nach dem Abbruch (z. B. Hinweis „das Bild zeigt noch …")
     */
    async run(spec) {
      if (current) return null;
      const ac = new AbortController();
      current = { ac, label: spec.label || '' };
      /* Der Hauptknopf heißt jetzt „Abbrechen" — und er bricht auch ab. */
      shell.setBusy(true, spec.note || (spec.label ? spec.label + ' …' : 'Rechnet …'), () => api.cancel());
      shell.progress(0, spec.note || '');
      const progress = (p, text) => { if (current && current.ac === ac) shell.progress(p, text); };
      try {
        return await spec.run(ac.signal, progress);
      } catch (err) {
        if (isAbort(err)) { if (spec.onCancel) spec.onCancel(); return null; }
        throw err;
      } finally {
        current = null;
        shell.progress(null);
        shell.setBusy(false);
      }
    },
    cancel() { if (current) current.ac.abort(); }
  };
  return api;
}
