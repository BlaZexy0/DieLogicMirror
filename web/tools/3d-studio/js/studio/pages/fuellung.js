/* Seite fuellung.html: ein Gastgeber, ein Werkzeug. */
import { createHost } from '../host.js';
import { createFuellungTool } from '../../fill/tool.js';
import { HELP } from '../../fill/help.js';

const host = createHost({
  mount: document.getElementById('studio'), id: 'fuellung', title: 'Füllabschätzung', help: HELP, start: 'gearbox_cover',
  sceneOpts: { cameraStart: [260, 200, 260], target: [0, 0, 0], grid: false, minDistance: 3, maxDistance: 30000 }
});
const tool = host.mountTool(createFuellungTool);
export const __viewer = tool.__viewer;
window.__form3d = window.__fuellung = __viewer;
host.start();
