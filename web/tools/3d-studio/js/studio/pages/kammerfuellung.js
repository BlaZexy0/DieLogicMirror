/* Seite kammerfuellung.html: ohne Bauteil — die Kammer ist ein Zylinder
   aus drei Maßen. ?engine=sph wählt die Partikel vor (dorthin leitet
   kammerfuellung-sph.html um). */
import { bootPage } from '../host.js';
import { createKammerfuellungTool } from '../../simulation/kammer.js';
import { HELP } from '../../simulation/kammer-help.js';

export const __viewer = bootPage({
  id: 'kammerfuellung', name: 'kammerfuellung', title: 'Kammerfüllung', help: HELP, tool: createKammerfuellungTool, part: false,
  sceneOpts: { cameraStart: [225, 120, 620], target: [225, 0, 0], minDistance: 3, maxDistance: 30000 }
});
