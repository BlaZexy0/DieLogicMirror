/* Seite temperier.html: ein Gastgeber, ein Werkzeug. */
import { createHost } from '../host.js';
import { createTemperierTool } from '../../cooling/tool.js';
import { HELP } from '../../cooling/help.js';

const host = createHost({
  mount: document.getElementById('studio'), id: 'temperier', title: 'Temperierkanal-Designer', help: HELP, start: 'gearbox_cover',
  sceneOpts: { cameraStart: [320, 260, 320], target: [0, 0, 0], grid: false, minDistance: 3, maxDistance: 30000 }
});
const tool = host.mountTool(createTemperierTool);
export const __viewer = tool.__viewer;
window.__form3d = window.__temperier = __viewer;
host.start();
