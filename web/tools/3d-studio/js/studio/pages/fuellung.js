/* Seite fuellung.html. */
import { bootPage } from '../host.js';
import { createFuellungTool } from '../../fill/tool.js';
import { HELP } from '../../fill/help.js';

export const __viewer = bootPage({
  id: 'fuellung', name: 'fuellung', title: 'Füllabschätzung', help: HELP, tool: createFuellungTool, start: 'gearbox_cover',
  sceneOpts: { cameraStart: [260, 200, 260], target: [0, 0, 0], minDistance: 3, maxDistance: 30000 }
});
