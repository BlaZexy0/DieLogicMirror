/* Eine Eingabe, die sich nicht simulieren lässt — mit einer Meldung für den
   Anwender. Die Schusskurve zeigt sie neben dem Diagramm an (früher kam sie
   als HTTP 422 vom Server). Alles andere (RangeError) ist ein Bruch der
   Invarianten dieser Schicht, also ein Programmfehler. */
export class SimError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SimError';
  }
}
