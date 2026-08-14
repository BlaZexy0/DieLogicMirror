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

/* Reihenfolge = thematische Gruppen: Schusskurve/Arbeitspunkt/Fenster ·
   Füllkammer · Anschnitt · Füllzeit/Thermik · Entlüftung ·
   Maschine/Zuhaltung · Ausbringung. nav.js listet dieselbe Reihenfolge. */
export const charts = [
  shotcurve, pq2, phild,
  fill, sleeve, slowshot,
  gate, windowChart, gvwall, gatesol,
  filltime, ftwall,
  vent, ventreq,
  area, machine, pspec,
  yieldChart
];

export const chartsById = {};
charts.forEach(c => { chartsById[c.id] = c; });
