/* Dispatcher: wählt anhand der Diagrammdaten den passenden Renderer. */

import { drawLine } from './line.js';
import { drawHeat } from './heat.js';
import { drawMap } from './map.js';
import { drawDonut } from './donut.js';
import { text, fillRich } from './base.js';
import { theme } from '../core/theme.js';

export function drawAny(x, w, h, d, def) {
  if (d.err) { errCanvas(x, w, h, d); return; }
  if ((def && def.heat) || d.z) drawHeat(x, w, h, d);
  else if (d.kind === 'map') drawMap(x, w, h, d);
  else if (d.kind === 'donut') drawDonut(x, w, h, d);
  else drawLine(x, w, h, d);
}

function errCanvas(x, w, h, d) {
  x.fillStyle = theme.chart.surface;
  x.fillRect(0, 0, w, h);
  text(x, d.title || '', w / 2, 22, 'center', 'bold 15px Arial');
  x.fillStyle = theme.chart.badText;
  x.textAlign = 'center'; x.font = 'bold 13px Arial';
  fillRich(x, '⚠ ' + d.err, w / 2, h / 2);
}
