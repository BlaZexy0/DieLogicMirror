/* Einstieg Einzelseite (chart.html?id=<chart-id>): ein Diagramm in voller
   Breite, in der Sidebar nur die Eingaben, die dieses Diagramm beeinflussen.
   Rechnen und Zeichnen: ui/page.js, dieselbe Pipeline wie das Dashboard. */

import { loadTheme } from './core/theme.js';
import { subHTML } from './core/format.js';
import { charts, chartsById } from './charts/registry.js';
import { PRESET_KEYS, PRESET_DOMAINS } from './config/fields.js';
import { buildInputs } from './ui/inputs.js';
import { initPresetSelect } from './ui/presets.js';
import { renderCurveTable, wireAddPoint } from './ui/curveTable.js';
import { buildCard, renderCard, paintCard } from './ui/cards.js';
import { createRender, startPage } from './ui/page.js';

const id = new URLSearchParams(location.search).get('id');
const def = chartsById[id] || charts[0];

async function init() {
  await loadTheme();
  document.title = def.title + ' · DieLogic Dashboard';
  document.getElementById('chartTitle').textContent = def.title;
  document.getElementById('chartDesc').innerHTML = subHTML(def.desc);
  document.getElementById('chartSub').innerHTML = subHTML(def.desc);

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

  /* Preset-Auswahlen nur zeigen, wenn das Diagramm Felder der Domäne nutzt */
  for (const dom of PRESET_DOMAINS) {
    const uses = def.inputs.some(k => PRESET_KEYS[k] === dom.id);
    if (uses) initPresetSelect(dom, document.getElementById(dom.selId));
    else document.getElementById(dom.groupElId).style.display = 'none';
  }

  buildInputs(document.getElementById('groups'), new Set(def.inputs));

  if (def.usesCurve) {
    renderCurveTable();
    wireAddPoint(document.getElementById('addPoint'));
  } else {
    document.getElementById('curve-group').style.display = 'none';
  }

  const card = buildCard(def, document.getElementById('charts'), { link: false, forceWide: true, fitHeight: true });

  /* Mathe-Erklärung unter dem Diagramm (nur auf der Einzelseite) */
  let mathSec = null;
  if (def.mathHTML) {
    mathSec = document.createElement('section');
    mathSec.className = 'card wide math-panel';
    mathSec.innerHTML =
      '<div class="head"><div><h3>Mathematik &amp; Herleitung</h3>' +
      '<small>Alle Gleichungen dieses Diagramms · Zahlenwerte folgen den Eingaben live</small></div></div>' +
      '<div class="body math-body">' + def.mathHTML() + '</div>';
    document.getElementById('charts').appendChild(mathSec);
  }

  /* Die generierte Kurve gilt auch für Diagramme ohne Kurven-UI; nur die
     Tabelle dazu gibt es dann nicht. */
  const render = createRender({
    curve: !!def.usesCurve,
    blocked: (v, grund) => renderCard(card, def, v, null, grund),
    draw: (v, shot) => {
      renderCard(card, def, v, shot);
      if (mathSec && def.renderMath) def.renderMath(mathSec, v, shot);
    }
  });
  /* Farbschema gewechselt: das Diagramm aus seinen Daten neu zeichnen
     (Rollen statt Farbwerten, siehe ui/cards.js paintCard). */
  startPage(render, { sim: !!def.usesSim, repaint: () => paintCard(card, def) });
  requestAnimationFrame(() => requestAnimationFrame(render));
}

init().catch(e => {
  const el = document.getElementById('error');
  if (el) el.textContent = 'Initialisierungsfehler: ' + e.message;
  console.error(e);
});
