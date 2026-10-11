/* Registry aller Diagramme. Ein neues Diagramm = neue Datei in js/charts/
   + ein Import hier. Die Reihenfolge bestimmt die Anordnung im Dashboard. */

import shotcurve from './shotcurve.js';
import pq2 from './pq2.js';
import phild from './phild.js';
import area from './area.js';
import machine from './machine.js';
import filltime from './filltime.js';
import fill from './fill.js';
import vent from './vent.js';
import sleeve from './sleeve.js';
import gate from './gate.js';
import slowshot from './slowshot.js';
import pspec from './pspec.js';
import windowChart from './window.js';
import ftwall from './ftwall.js';
import gvwall from './gvwall.js';
import ventreq from './ventreq.js';
import yieldChart from './yield.js';
import gatesol from './gatesol.js';
import bubble from './bubble.js';

/* Reihenfolge = thematische Gruppen: Schusskurve/Arbeitspunkt/Fenster ·
   Füllkammer · Anschnitt · Füllzeit/Thermik · Entlüftung ·
   Maschine/Zuhaltung · Ausbringung. nav.js listet dieselbe Reihenfolge. */
export const charts = [
  shotcurve, pq2, phild,
  fill, sleeve, slowshot,
  gate, windowChart, gvwall, gatesol, bubble,
  filltime, ftwall,
  vent, ventreq,
  area, machine, pspec,
  yieldChart
];

/* Wer die Schusskurve liest (usesCurve), liest über computeShot auch die
   Eingaben, die „Kammer voll" und die Füllereignisse festlegen — Kammer,
   Massen, Dichten, Anschnitt. Sie gehören deshalb in jede solche inputs-
   Liste (🎯-Hervorhebung, Einzelseite chart.html); vorher fehlten sie, und
   z. B. die Kammerlänge verschob den Punkt im Füllzeit-Diagramm, ohne auf
   dessen Einzelseite zu stehen. Die Eingaben der Kurvengeneratoren
   (Thermik, NADCA) bleiben außen vor: sie zählen nur in den erzeugten Modi. */
export const SHOT_INPUTS = ['diam', 'length', 'part', 'runner', 'overflow', 'biscuit', 'density', 'densitySolid', 'shrink', 'gate'];
for (const c of charts) {
  if (c.usesCurve) c.inputs = c.inputs.concat(SHOT_INPUTS.filter(k => !c.inputs.includes(k)));
}

export const chartsById = {};
charts.forEach(c => { chartsById[c.id] = c; });
