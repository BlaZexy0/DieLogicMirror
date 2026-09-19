/* Seite wandstaerke.html: ein Gastgeber, ein Werkzeug. */
import { createHost } from '../host.js';
import { createWandstaerkeTool } from '../../wandstaerke/tool.js';
import { HELP } from '../../wandstaerke/help.js';

const host = createHost({
  mount: document.getElementById('studio'), id: 'wandstaerke', title: 'Wandstärkenanalyse', help: HELP,
  sceneOpts: { cameraStart: [260, 200, 260], target: [0, 0, 0], minDistance: 5, maxDistance: 20000 }
});
const tool = host.mountTool(createWandstaerkeTool);
export const __viewer = tool.__viewer;
window.__form3d = window.__wandstaerke = __viewer;
host.start();
