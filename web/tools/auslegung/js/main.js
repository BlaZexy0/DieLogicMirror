/* Einstieg Dashboard-Seite (index.html): alle Diagramme + KPIs + volle Sidebar. */

import { loadTheme } from './core/theme.js';
import { state, subscribe } from './core/state.js';
import { computeShot } from './core/physics.js';
import { applyCurveGen } from './core/curvegen.js';
import { applyAuto } from './core/autofit.js';
import { charts } from './charts/registry.js';
import { buildInputs, validate, highlightInputs, clearHighlights, refreshAuto } from './ui/inputs.js';
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

let letzterGueltigerStand = false;

function render() {
  const v = state.values;
  /* Generierte Kurvenmodi: Wegpunkte aus den aktuellen Eingaben neu erzeugen */
  const genErr = applyCurveGen(v);
  applyAuto(v);
  refreshAuto();
  if (state.curveGen.mode !== 'points') renderCurveTable(genErr);
  /* Erst prüfen, dann rechnen. Liegt eine Eingabe außerhalb der Domäne, wird
     NICHT gerechnet: die Zahlen kämen sonst in computeShot und in alle 19
     Diagramme, die sich dann jede für sich dagegen wehren müssten. */
  const urteil = validate(v);
  document.body.classList.toggle('inputs-invalid', !urteil.ok);
  if (!urteil.ok) {
    /* Beim Tippen ist eine Eingabe kurzzeitig ungültig — dann bleibt der
       letzte gültige Stand stehen (sichtbar abgeblendet), statt zu flackern.
       Nur wenn es noch keinen gibt (Projekt mit ungültigen Werten geladen),
       wird der Grund in die Karten geschrieben. */
    if (letzterGueltigerStand) return;
    const grund = 'Eingaben außerhalb des zulässigen Bereichs: ' +
      (urteil.msgs[0] || 'siehe Seitenleiste') + '.';
    charts.forEach(def => renderCard(cards[def.id], def, v, null, grund));
    return;
  }
  letzterGueltigerStand = true;

  const shot = computeShot(v, state.curve);
  renderChamber(chamberCard, v);
  renderKpis(document.getElementById('summary'), v, shot, document.getElementById('chamber-kpis'));
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
