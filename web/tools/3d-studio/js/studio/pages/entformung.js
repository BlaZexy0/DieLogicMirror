/* Seite entformungsanalyse.html: ein Gastgeber, ein Werkzeug. */
import { createHost } from '../host.js';
import { createEntformungTool } from '../../entformung/tool.js';
import { HELP } from '../../entformung/help.js';

const host = createHost({
  mount: document.getElementById('studio'), id: 'entformung', title: 'Entformungsanalyse', help: HELP,
  sceneOpts: { cameraStart: [260, 200, 260], target: [0, 0, 0], minDistance: 5, maxDistance: 20000 }
});
const tool = host.mountTool(createEntformungTool);
export const __viewer = tool.__viewer;
window.__form3d = window.__entformung = __viewer;
host.start();
