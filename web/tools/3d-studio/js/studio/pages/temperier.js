/* Seite temperier.html. */
import { bootPage } from '../host.js';
import { createTemperierTool } from '../../cooling/tool.js';
import { HELP } from '../../cooling/help.js';

export const __viewer = bootPage({
  id: 'temperier', name: 'temperier', title: 'Temperierkanal-Designer', help: HELP, tool: createTemperierTool, start: 'gearbox_cover',
  sceneOpts: { cameraStart: [320, 260, 320], target: [0, 0, 0], minDistance: 3, maxDistance: 30000 }
});
