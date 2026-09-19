/* Seite kammerfuellung.html: ein Gastgeber ohne Bauteil — die Kammer ist ein
   Zylinder aus drei Maßen. ?engine=sph wählt die Partikel vor (dorthin
   leitet kammerfuellung-sph.html um). */
import { createHost } from '../host.js';
import { createKammerfuellungTool } from '../../simulation/kammer.js';
import { HELP } from '../../simulation/kammer-help.js';

const host = createHost({
  mount: document.getElementById('studio'), id: 'kammerfuellung', title: 'Kammerfüllung', help: HELP, part: false,
  sceneOpts: { cameraStart: [225, 120, 620], target: [225, 0, 0], minDistance: 3, maxDistance: 30000 }
});
const tool = host.mountTool(createKammerfuellungTool);
export const __viewer = tool.__viewer;
window.__form3d = window.__kammerfuellung = __viewer;
await host.start();
