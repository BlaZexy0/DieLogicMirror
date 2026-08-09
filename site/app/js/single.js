/* Einstieg Einzelseite (chart.html?id=<chart-id>): ein Diagramm in voller
   Breite, in der Sidebar nur die Eingaben, die dieses Diagramm beeinflussen. */

import { loadTheme } from './core/theme.js';
import { state, subscribe } from './core/state.js';
import { computeShot } from './core/physics.js';
import { charts, chartsById } from './charts/registry.js';
import { PRESET_KEYS } from './config/fields.js';
import { buildInputs, validate } from './ui/inputs.js';
import { initPresetSelect } from './ui/presets.js';
import { renderCurveTable, wireAddPoint } from './ui/curveTable.js';
import { buildCard, renderCard } from './ui/cards.js';

const id = new URLSearchParams(location.search).get('id');
const def = chartsById[id] || charts[0];
let card = null;
let mathSec = null;

function render() {
  const v = state.values;
  const shot = computeShot(v, state.curve);
  validate(v);
  renderCard(card, def, v, shot);
  if (mathSec && def.renderMath) def.renderMath(mathSec, v, shot);
}

async function init() {
  await loadTheme();
  document.title = def.title + ' · DieLogic Dashboard';
  document.getElementById('chartTitle').textContent = def.title;
  document.getElementById('chartDesc').textContent = def.desc;

  /* Navigation zwischen den Einzelseiten */
  const nav = document.getElementById('chartNav');
  charts.forEach(c => {
    const op = document.createElement('option');
    op.value = c.id;
    op.textContent = c.title;
    if (c === def) op.selected = true;
    nav.appendChild(op);
  });
  nav.onchange = () => { location.href = 'chart.html?id=' + nav.value; };

  /* Maschinen-Preset nur zeigen, wenn das Diagramm Preset-Felder nutzt */
  const showPreset = def.inputs.some(k => PRESET_KEYS[k]);
  if (showPreset) await initPresetSelect(document.getElementById('machineSel'));
  else document.getElementById('preset-group').style.display = 'none';

  buildInputs(document.getElementById('groups'), new Set(def.inputs));

  if (def.usesCurve) {
    renderCurveTable();
    wireAddPoint(document.getElementById('addPoint'));
  } else {
    document.getElementById('curve-group').style.display = 'none';
  }

  card = buildCard(def, document.getElementById('charts'), { link: false, forceWide: true, fitHeight: true });

  /* Mathe-Erklärung unter dem Diagramm (nur auf der Einzelseite) */
  if (def.mathHTML) {
    mathSec = document.createElement('section');
    mathSec.className = 'card wide math-panel';
    mathSec.innerHTML =
      '<div class="head"><div><h3>Mathematik &amp; Herleitung</h3>' +
      '<small>Alle Gleichungen dieses Diagramms — Zahlenwerte folgen den Eingaben live</small></div></div>' +
      '<div class="body math-body">' + def.mathHTML() + '</div>';
    document.getElementById('charts').appendChild(mathSec);
  }

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
