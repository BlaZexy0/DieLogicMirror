/* Einstieg Dashboard-Seite (index.html): alle Diagramme + KPIs + volle Sidebar. */

import { loadTheme } from './core/theme.js';
import { state, subscribe, notify, resetState } from './core/state.js';
import { computeShot } from './core/physics.js';
import { charts } from './charts/registry.js';
import { buildInputs, validate, highlightInputs, clearHighlights, applyValues } from './ui/inputs.js';
import { initPresetSelects } from './ui/presets.js';
import { renderCurveTable, wireAddPoint } from './ui/curveTable.js';
import { renderKpis } from './ui/kpis.js';
import { buildChamberCard, renderChamber } from './ui/chamber.js';
import { buildCard, renderCard } from './ui/cards.js';
import { initSim } from './core/simstore.js';

const cards = {};
let chamberCard = null;
let activeHl = null;

function onHighlight(def, btn) {
  document.querySelectorAll('.hl-btn.active').forEach(b => { if (b !== btn) b.classList.remove('active'); });
  if (activeHl === def) {
    activeHl = null;
    btn.classList.remove('active');
    clearHighlights();
    return;
  }
  activeHl = def;
  btn.classList.add('active');
  highlightInputs(def.inputs, { curve: def.usesCurve });
}

function render() {
  const v = state.values;
  const shot = computeShot(v, state.curve);
  validate(v);
  renderChamber(chamberCard, v);
  renderKpis(document.getElementById('summary'), v, shot);
  charts.forEach(def => renderCard(cards[def.id], def, v, shot));
}

async function init() {
  await loadTheme();
  initPresetSelects();
  buildInputs(document.getElementById('groups'));
  renderCurveTable();
  wireAddPoint(document.getElementById('addPoint'));

  chamberCard = buildChamberCard(document.getElementById('chamber'));
  const chartsEl = document.getElementById('charts');
  charts.forEach(def => { cards[def.id] = buildCard(def, chartsEl, { link: true, onHighlight }); });
  initSim();

  document.getElementById('resetBtn').onclick = () => {
    resetState();
    applyValues(state.values);
    ['machineSel', 'alloySel', 'partSel'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.value = '';
    });
    renderCurveTable();
    notify();
  };

  let rt;
  window.onresize = () => { clearTimeout(rt); rt = setTimeout(render, 120); };

  subscribe(render);
  requestAnimationFrame(() => requestAnimationFrame(render));
}

init().catch(e => {
  const el = document.getElementById('error');
  if (el) el.textContent = 'Initialisierungsfehler: ' + e.message;
  console.error(e);
});
