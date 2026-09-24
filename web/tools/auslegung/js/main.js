/* Einstieg Dashboard-Seite (index.html): alle Diagramme + KPIs + volle Sidebar.
   Rechnen und Zeichnen: ui/page.js, dieselbe Pipeline wie Einzelseite und
   Werkbank. */

import { loadTheme } from './core/theme.js';
import { buildInputs } from './ui/inputs.js';
import { initPresetSelects } from './ui/presets.js';
import { renderCurveTable, wireAddPoint } from './ui/curveTable.js';
import { createRender, buildDashboard, startPage } from './ui/page.js';

async function init() {
  await loadTheme();
  initPresetSelects();
  buildInputs(document.getElementById('groups'));
  renderCurveTable();
  wireAddPoint(document.getElementById('addPoint'));

  const dash = buildDashboard({
    chamber: document.getElementById('chamber'),
    summary: document.getElementById('summary'),
    charts: document.getElementById('charts')
  });
  const render = createRender({ blocked: dash.block, draw: dash.draw });
  startPage(render, { repaint: dash.repaint });
  requestAnimationFrame(() => requestAnimationFrame(render));
}

init().catch(e => {
  const el = document.getElementById('error');
  if (el) el.textContent = 'Initialisierungsfehler: ' + e.message;
  console.error(e);
});
