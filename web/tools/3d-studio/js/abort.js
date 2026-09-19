/* Der Abbruch einer langen Rechnung — als Fehler mit dem Namen, den der
   Browser bei AbortController vergibt. Die Rechenmodule (Feld,
   Sichtbarkeit, Füllung, Abstand, Simulationen) prüfen an ihren
   Haltepunkten `signal.aborted` und werfen ihn; die Aufrufer erkennen
   ihn mit isAbort und behandeln ihn als Entscheidung, nicht als Panne. */

export function abortError() {
  const e = new Error('abgebrochen');
  e.name = 'AbortError';
  return e;
}

export const isAbort = err => !!err && err.name === 'AbortError';
