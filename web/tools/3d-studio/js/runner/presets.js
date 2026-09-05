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
  /* Die Vorgabe der Anschnitthöhe ist die der Beispiele; ein Anschnitt
     mit abweichender Höhe (der Fächer, die zweite Ebene) hat eine eigene. */
  g.gateH = GATE.h;
  for (const n of G.allNodes(g)) {
    if (n.type === 'gate' && n.gate && n.gate.hAuto === undefined) {
      n.gate.hAuto = Math.abs(n.gate.h - g.gateH) < 1e-9;
    }
  }
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
  /* Deutlich seitlich der Zulaufrichtung: der gespiegelte Zwilling landet
     auf der ANDEREN Seite davon. Mit dem alten, fast geraden Abgang lagen
     beide Anschnitte 8 mm auseinander — zwei Kanäle, die sich fast ganz
     durchdrangen und wie einer aussahen. */
  mk(g, b2, 'gate', [-137, 0, 230], { gate: { ...GATE, h: 1.8 } });
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

/** Ölwanne aus openscad_parts: vier Anschnitte an der langen Flanschkante
    (z = 470, dorthin schiebt `ref` das Referenzteil), je zwei aus einer
    zweiten Verzweigung, senkrecht auf die Kante zu. Die Bögen bleiben
    flach — unter 2 × dh löst sich die Strömung ab (Regel „Zu enger
    Bogen") — und die zweite Verzweigung wird mit lotrechtem Zulauf
    angefahren, damit ihr Zwilling auf derselben Höhe landet. */
export function demoOilPan() {
  const g = G.emptyGraph();
  G.setBiscuit(g, { pos: [0, 0, 0], axis: '+y', d: 100, t: 28 });
  const p1 = mk(g, G.root(g), 'point', [0, 0, 60]);
  const b1 = mk(g, p1, 'branch', [0, 0, 110]);
  const m1 = mk(g, b1, 'point', [-70, 0, 190]);
  const m2 = mk(g, m1, 'point', [-100, 0, 260]);
  const b2 = mk(g, m2, 'branch', [-100, 0, 320]);
  const q = mk(g, b2, 'point', [-150, 0, 410]);
  mk(g, q, 'gate', [-150, 0, 470], { gate: { ...GATE } });
  return finish(g);
}

/* `ref`: ein Beispiel darf ein Referenzteil mitbringen. Die Datei ist
   eine GLB aus assets/parts/ (Trennebene des Teils bei z = 0, Entformung
   +z); rotX dreht sie in die Lage des Angussdesigners (Trennebene y = 0,
   Kavität nach +y), translate schiebt sie an die Anschnitte. */
export const DEMOS = [
  { id: 'zwei', label: 'Zwei Anschnitte (symmetrisch)', build: demoTwoGates },
  { id: 'vier', label: 'Vier Anschnitte (zwei Ebenen)', build: demoFourGates },
  { id: 'faecher', label: 'Ein Fächeranschnitt', build: demoFan },
  { id: 'stufe', label: 'Verteiler mit Stufe und Spiegelpunkt', build: demoStep },
  { id: 'oelwanne', label: 'Ölwanne: vier Anschnitte am Flansch', build: demoOilPan,
    ref: { file: 'assets/parts/oil_pan.glb', name: 'Ölwanne', rotX: 90, translate: [0, 0, 637] } }
];
