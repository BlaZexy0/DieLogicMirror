/* Seite anguss.html. Der Angussdesigner beginnt mit seinem Beispiel
   (?demo=…) und OHNE Bauteil — das Referenzbauteil kommt über den
   Bauteil-Chip oder mit dem Beispiel, das es mitbringt; deshalb fängt das
   Werkzeug selbst an (tool.start), nicht die Bauteilquelle des Gastgebers. */
import { bootPage } from '../host.js';
import { createAngussTool } from '../../runner/tool.js';
import { HELP } from '../../runner/help.js';

export const __viewer = bootPage({
  id: 'anguss', name: 'anguss', title: 'Angussdesigner', help: HELP, tool: createAngussTool,
  sceneOpts: { cameraStart: [230, 210, 280], target: [0, 0, 60], minDistance: 3, maxDistance: 30000 }
});
