/* Lange Rechnungen — ein Muster für alle: der Hauptknopf wird zu
   „Abbrechen", darunter läuft der Fortschritt, im Viewport steht, was
   gerade passiert; das Werkzeug bekommt ein AbortSignal, das die
   Rechenmodule an ihren Haltepunkten prüfen (js/abort.js). Ein Abbruch
   ist eine Entscheidung, keine Panne: run() liefert dann null.

   Eine Rechnung kann auch ÜBERHOLT werden — EIN Weg für alle Werkzeuge:
   ein neues Bauteil beginnt zu laden (der Gastgeber ruft supersede()),
   oder eine neue Rechnung beginnt, solange die alte noch läuft. Die alte
   endet dann still: ihr onCancel kommt nicht (niemand hat abgebrochen),
   run() liefert null, und an ihrem Auftrag steht spec.superseded — das
   Werkzeug fasst danach nichts mehr an, der neue Stand gehört dem, der
   überholt hat. Die neue Rechnung beginnt, sobald die alte an ihrem
   nächsten Haltepunkt aufgegeben hat. */

import { isAbort } from '../abort.js';

export function createJobRunner(shell) {
  let current = null;
  const api = {
    get running() { return !!current; },
    /**
     * spec.label     was der Knopf vorher hieß (für die Meldung)
     * spec.run       async (signal, progress) → Ergebnis; progress(p, text)
     * spec.note      erste Fortschrittszeile
     * spec.onCancel  nach dem Abbruch durch den Anwender (z. B. Hinweis „das Bild zeigt noch …")
     * spec.quiet     ohne Schleier über dem Bild — für kurze Nachrechnungen, die
     *                das Werkzeug selbst anstößt; Knopf und Fortschritt bleiben
     * Danach: spec.superseded, wenn die Rechnung überholt wurde.
     */
    async run(spec) {
      /* Läuft noch eine, ist sie überholt: still beenden und warten, bis sie
         aufgegeben hat. Kommt währenddessen eine dritte, gewinnt die. */
      while (current) {
        const old = current;
        api.supersede();
        await old.done;
      }
      const ac = new AbortController();
      let finish = null;
      const job = current = { ac, spec, done: new Promise(r => { finish = r; }) };
      /* Der Hauptknopf heißt jetzt „Abbrechen" — und er bricht auch ab. */
      shell.setBusy(true, spec.note || (spec.label ? spec.label + ' …' : 'Rechnet …'), () => api.cancel(), { veil: !spec.quiet });
      shell.progress(0, spec.note || '');
      const progress = (p, text) => { if (current === job) shell.progress(p, text); };
      try {
        return await spec.run(ac.signal, progress);
      } catch (err) {
        if (isAbort(err)) { if (!spec.superseded && spec.onCancel) spec.onCancel(); return null; }
        throw err;
      } finally {
        current = null;
        shell.progress(null);
        shell.setBusy(false);
        finish();
      }
    },
    /** „Abbrechen": der Anwender will nicht mehr. */
    cancel() { if (current) current.ac.abort(); },
    /** Überholt: die laufende Rechnung endet still (ohne onCancel). */
    supersede() {
      if (!current) return;
      current.spec.superseded = true;
      current.ac.abort();
    }
  };
  return api;
}
