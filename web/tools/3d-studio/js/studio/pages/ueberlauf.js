/* Seite ueberlauf.html: ein Gastgeber, ein Werkzeug. */
import { createHost } from '../host.js';
import { createUeberlaufTool } from '../../vents/tool.js';
import { HELP } from '../../vents/help.js';

const host = createHost({
  mount: document.getElementById('studio'), id: 'ueberlauf', title: 'Überlaufdesigner', help: HELP, start: 'gearbox_cover',
  sceneOpts: { cameraStart: [260, 200, 260], target: [0, 0, 0], grid: false, minDistance: 3, maxDistance: 30000 }
});
const tool = host.mountTool(createUeberlaufTool);
export const __viewer = tool.__viewer;
window.__form3d = window.__ueberlauf = __viewer;
host.start();
