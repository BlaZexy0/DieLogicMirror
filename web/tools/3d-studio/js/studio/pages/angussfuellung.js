/* Seite angussfuellung.html: ein Gastgeber ohne Bauteil — das Werkzeug füllt
   ein Angusssystem, kein Gussteil. ?engine=sph wählt die Partikel vor
   (dorthin leitet angussfuellung-sph.html um), ?demo=… das Beispiel. */
import { createHost } from '../host.js';
import { createAngussfuellungTool } from '../../simulation/anguss.js';
import { HELP } from '../../simulation/anguss-help.js';

const host = createHost({
  mount: document.getElementById('studio'), id: 'angussfuellung', title: 'Angussfüllung', help: HELP, part: false,
  sceneOpts: { cameraStart: [230, 210, 280], target: [0, 0, 60], minDistance: 3, maxDistance: 30000 }
});
const tool = host.mountTool(createAngussfuellungTool);
export const __viewer = tool.__viewer;
window.__form3d = window.__angussfuellung = __viewer;
await host.start();
