/* Einstieg Dashboard-Seite (index.html): alle Diagramme + KPIs + volle Sidebar. */

import { loadTheme } from './core/theme.js';
import { state, subscribe, notify, resetState } from './core/state.js';
import { computeShot } from './core/physics.js';
import { applyCurveGen } from './core/curvegen.js';
import { charts } from './charts/registry.js';
import { buildInputs, validate, highlightInputs, clearHighlights, applyValues } from './ui/inputs.js';
import { initPresetSelects } from './ui/presets.js';
import { renderCurveTable, wireAddPoint } from './ui/curveTable.js';
import { renderKpis } from './ui/kpis.js';
import { buildChamberCard, renderChamber } from './ui/chamber.js';
import { buildCard, renderCard } from './ui/cards.js';
import { initSim } from './core/simstore.js';
import { shareURL, consumeShareLink } from './core/share.js';

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
  /* Generierte Kurvenmodi: Wegpunkte aus den aktuellen Eingaben neu erzeugen */
  const genErr = applyCurveGen(v);
  if (state.curveGen.mode !== 'points') renderCurveTable(genErr);
  const shot = computeShot(v, state.curve);
  validate(v);
  renderChamber(chamberCard, v);
  renderKpis(document.getElementById('summary'), v, shot, document.getElementById('chamber-kpis'));
  charts.forEach(def => renderCard(cards[def.id], def, v, shot));
}

async function init() {
  /* Vor dem Aufbau der Eingaben, damit ein geteilter Stand überall greift. */
  consumeShareLink();
  await loadTheme();
  initPresetSelects();
  buildInputs(document.getElementById('groups'));
  renderCurveTable();
  wireAddPoint(document.getElementById('addPoint'));

  chamberCard = buildChamberCard(document.getElementById('chamber'));
  const chartsEl = document.getElementById('charts');
  charts.forEach(def => { cards[def.id] = buildCard(def, chartsEl, { link: true, onHighlight }); });
  initSim();

  const shareBtn = document.getElementById('shareBtn');
  shareBtn.onclick = () => {
    const url = shareURL();
    const done = () => {
      const old = shareBtn.textContent;
      shareBtn.textContent = 'Kopiert ✓';
      setTimeout(() => { shareBtn.textContent = old; }, 1600);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('Link kopieren:', url));
    else prompt('Link kopieren:', url);
  };

  document.getElementById('resetBtn').onclick = () => {
    resetState();
    applyValues(state.values);
    /* Preset-Selects synchronisiert notify() über ihre Subscriber. */
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
