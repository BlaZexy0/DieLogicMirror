/* Beispiel-Angusssysteme.

   Sie stehen bewusst NICHT in js/runner/graph.js. Ein Beispiel soll in
   sich stimmig sein — die Querschnitte müssen zum voreingestellten
   Prozess passen, sonst begrüßt die Seite den Anwender mit einer Liste
   verletzter Regeln, die er nicht verursacht hat. Stimmig heißt aber:
   durch die Auslegung gelaufen (js/runner/sizing.js), und die kennt den
   Prozess und die Strömung. Der Graph selbst darf davon nichts wissen,
   sonst schlössen sich die Module zum Ring.

   Beschrieben wird deshalb nur die GESTALT — wo die Punkte liegen, wie
   verzweigt wird, wie hoch der Anschnitt ist. Alle Breiten und Tiefen
   rechnet `autoTaper` aus den Anschnitten rückwärts; bei gespiegelten
   Verzweigungen genügt eine Seite, die andere entsteht von selbst. */

import * as G from './graph.js';
import * as F from './flow.js';
import { autoTaper, DEFAULT_SIZING } from './sizing.js';

const mk = (g, parent, type, pos, extra) => {
  const n = G.makeNode(g, type, parent, pos);
  if (extra) Object.assign(n, extra);
  return n;
};

const GATE = { h: 2.2, len: 4, w: 26, auto: true, transition: 'ende' };

/* Nach dem Aufbau einmal durch die Auslegung: Anschnittbreiten aus der
   Zielgeschwindigkeit, danach alle Querschnitte von hinten nach vorn. */
function finish(g) {
  G.normalizeMirrors(g);
  F.applyAutoGates(g, F.DEFAULT_PROCESS);
  autoTaper(g, F.DEFAULT_PROCESS, DEFAULT_SIZING);
  return g;
}

/** Zwei Anschnitte, symmetrisch — der übliche Einstieg. */
export function demoTwoGates() {
  const g = G.emptyGraph();
  G.setBiscuit(g, { pos: [0, 0, 0], axis: '+y', d: 90, t: 25 });
  const p1 = mk(g, G.root(g), 'point', [0, 0, 62]);
  const b = mk(g, p1, 'branch', [0, 0, 118]);
  const l = mk(g, b, 'point', [-50, 0, 180]);
  mk(g, l, 'gate', [-84, 0, 214], { gate: { ...GATE } });
  return finish(g);
}

/** Vier Anschnitte über zwei Verzweigungsebenen. */
export function demoFourGates() {
  const g = G.emptyGraph();
  G.setBiscuit(g, { pos: [0, 0, 0], axis: '+y', d: 100, t: 28 });
  const p1 = mk(g, G.root(g), 'point', [0, 0, 55]);
  const b1 = mk(g, p1, 'branch', [0, 0, 108]);
  const m = mk(g, b1, 'point', [-52, 0, 170]);
  const b2 = mk(g, m, 'branch', [-92, 0, 212]);
  mk(g, b2, 'gate', [-128, 0, 244], { gate: { ...GATE, h: 1.8 } });
  return finish(g);
}

/** Ein breiter Fächeranschnitt — der Klassiker für flache Teile: der
    Querschnitt wird nicht kleiner, sondern flacher und breiter. */
export function demoFan() {
  const g = G.emptyGraph();
  G.setBiscuit(g, { pos: [0, 0, 0], axis: '+y', d: 80, t: 22 });
  const p = mk(g, G.root(g), 'point', [0, 0, 70]);
  mk(g, p, 'gate', [0, 0, 130], { gate: { h: 2.4, len: 5, w: 90, auto: true, transition: 'faecher' } });
  return finish(g);
}

/** Eine Stufe im Verteiler: der zweite Punkt liegt gekippt, der Kanal
    verlässt die Trennebene und geht auf der anderen Höhe weiter. */
export function demoStep() {
  const g = G.emptyGraph();
  G.setBiscuit(g, { pos: [0, 0, 0], axis: '+y', d: 90, t: 25 });
  const p1 = mk(g, G.root(g), 'point', [0, 0, 58]);
  const p2 = mk(g, p1, 'point', [0, -18, 108], { tilt: [0, 22] });
  const b = mk(g, p2, 'mirror', [0, -18, 156]);
  mk(g, b, 'gate', [-58, -18, 216], { gate: { ...GATE } });
  return finish(g);
}

export const DEMOS = [
  { id: 'zwei', label: 'Zwei Anschnitte (symmetrisch)', build: demoTwoGates },
  { id: 'vier', label: 'Vier Anschnitte (zwei Ebenen)', build: demoFourGates },
  { id: 'faecher', label: 'Ein Fächeranschnitt', build: demoFan },
  { id: 'stufe', label: 'Verteiler mit Stufe und Spiegelpunkt', build: demoStep }
];
