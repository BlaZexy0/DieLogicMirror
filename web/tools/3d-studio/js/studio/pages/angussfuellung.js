/* Seite angussfuellung.html: ohne Bauteil — das Werkzeug füllt ein
   Angusssystem, kein Gussteil. ?engine=sph wählt die Partikel vor (dorthin
   leitet angussfuellung-sph.html um), ?demo=… das Beispiel. */
import { bootPage } from '../host.js';
import { createAngussfuellungTool } from '../../simulation/anguss.js';
import { HELP } from '../../simulation/anguss-help.js';

export const __viewer = bootPage({
  id: 'angussfuellung', name: 'angussfuellung', title: 'Angussfüllung', help: HELP, tool: createAngussfuellungTool, part: false,
  sceneOpts: { cameraStart: [230, 210, 280], target: [0, 0, 60], minDistance: 3, maxDistance: 30000 }
});
