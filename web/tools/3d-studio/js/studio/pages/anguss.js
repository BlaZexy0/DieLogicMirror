/* Seite anguss.html: ein Gastgeber, ein Werkzeug. Der Angussdesigner beginnt
   mit seinem Beispiel (?demo=…) und OHNE Bauteil — das Referenzbauteil kommt
   über den Bauteil-Chip oder mit dem Beispiel, das es mitbringt; deshalb
   startet hier das Werkzeug, nicht die Bauteilquelle des Gastgebers. */
import { createHost } from '../host.js';
import { createAngussTool } from '../../runner/tool.js';
import { HELP } from '../../runner/help.js';

/* Ohne Bodenraster: der Anguss ist ein freistehender Körper, den man von
   allen Seiten ansieht — ein Raster darunter gäbe ihm ein „unten", das er
   nicht hat, und läge bei jeder schrägen Ansicht im Bild. */
const host = createHost({
  mount: document.getElementById('studio'), id: 'anguss', title: 'Angussdesigner', help: HELP,
  sceneOpts: { cameraStart: [230, 210, 280], target: [0, 0, 60], grid: false, minDistance: 3, maxDistance: 30000 }
});
const tool = host.mountTool(createAngussTool);
export const __viewer = tool.__viewer;
window.__form3d = window.__anguss = __viewer;
tool.start();
