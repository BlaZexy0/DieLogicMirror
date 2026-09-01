/* Querschnitte automatisch abstufen — von den Anschnitten rückwärts.

   Die Regel „der Querschnitt darf nicht wachsen" von Hand einzuhalten
   ist mühsam, sobald es mehr als eine Verzweigung gibt: jeder Anschnitt
   verlangt seinen Strom, jede Gabelung teilt ihn, und jede Änderung an
   einer Stelle verschiebt alles davor. Genau das rechnet diese Funktion
   in einem Durchgang:

     1. Am Anschnitt ist die Fläche durch die Zielgeschwindigkeit
        festgelegt:  A = Q_Anteil / v_Ziel.
     2. Der zuführende Kanal bekommt das `runnerRatio`-fache davon —
        er soll deutlich größer sein, damit der Anschnitt zuletzt gefüllt
        wird und der Nachdruck ihn erreicht.
     3. Weiter stromaufwärts ist jeder Kanal die Summe seiner Abgänge,
        geteilt durch `taper` (< 1, also etwas GRÖSSER als die Summe).
        Das ist die übliche Verjüngung von 5 bis 15 % je Abschnitt.
     4. Aus der Fläche werden Breite und Tiefe über das gewünschte
        Seitenverhältnis zurückgerechnet — mit der ECHTEN Trapezfläche
        samt Schräge und Radius, nicht mit b·h (`dimsForArea` in
        js/runner/profile.js). */

import * as G from './graph.js';
import { dimsForArea } from './profile.js';
import { flowRate, nominalShares } from './flow.js';

export const DEFAULT_SIZING = {
  taper: 0.9,          // Querschnitt je Abschnitt: Summe der Abgänge / taper
  aspect: 0.65,        // Tiefe / Breite
  runnerRatio: 1.6     // Kanal am Anschnitt / Anschnittfläche
};

/**
 * Alle Querschnitte neu abstufen. Verändert den Graphen.
 * Die Anschnitte selbst bleiben, wie sie sind (ihre Höhe ist eine
 * Konstruktionsentscheidung, ihre Breite kommt aus `applyAutoGates`).
 */
export function autoTaper(g, proc, opts = {}) {
  const o = { ...DEFAULT_SIZING, ...opts };
  const share = nominalShares(g);
  const Q = flowRate(proc);
  const wanted = {};

  const need = id => {
    const n = g.nodes[id];
    const kids = n.children.filter(c => g.nodes[c]);
    if (n.type === 'gate' || !kids.length) {
      const gArea = n.gate
        ? Math.max(n.gate.w * n.gate.h, 1)
        : Q * (share[id] || 0) / Math.max(proc.vGate, 1) * 1e6;
      wanted[id] = gArea * o.runnerRatio;
      return wanted[id];
    }
    let sum = 0;
    for (const c of kids) sum += need(c);
    wanted[id] = sum / Math.max(o.taper, 0.3);
    return wanted[id];
  };
  need(g.rootId);

  for (const n of G.allNodes(g)) {
    const d = dimsForArea(wanted[n.id], o.aspect, g.draft, g.radius);
    n.w = Math.round(d.w * 10) / 10;
    n.h = Math.round(d.h * 10) / 10;
  }
  /* Der Pressrest speist alles — sein Anschluss darf nicht breiter sein
     als der Pressrest selbst. */
  const r = G.root(g);
  if (r.w > g.biscuit.d * 0.9) {
    const f = g.biscuit.d * 0.9 / r.w;
    r.w = Math.round(r.w * f * 10) / 10;
    r.h = Math.round(r.h * f * 10) / 10;
  }
  return G.normalizeMirrors(g);
}
