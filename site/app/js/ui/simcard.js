/* Simulationskarte „Luftdruck in der Kammer" — serverseitig gerechnet
   (hpdcsim). Debounced Fetch bei jeder Zustandsänderung; ohne erreichbares
   Backend bleibt die Karte mit einem Hinweis stehen, der Rest des Dashboards
   ist davon unabhängig. */

import { state, subscribe } from '../core/state.js';
import { theme } from '../core/theme.js';
import { drawAny } from '../render/draw.js';
import { fmt } from '../core/format.js';
import { toSimPayload, fetchSim } from '../core/simapi.js';

const P_CLIP_MBAR = 10000;   // Anzeige kappen: Modell divergiert bei Restluft → 0
const DEBOUNCE_MS = 350;

let card = null, statusEl = null, timer = null, ctrl = null, lastRes = null;

const EVENT_NAMES = {
  pour_hole_sealed: 'Einguss dicht',
  sleeve_full: 'Kammer voll',
  runner_full: 'Anguss gefüllt',
  part_full: 'Bauteil gefüllt',
  overflow_full: 'Überlauf gefüllt',
  shot_end: 'Schussende'
};

export function initSimCard(container) {
  if (!container) return;
  card = document.createElement('div');
  card.className = 'card wide';
  card.innerHTML =
    '<div class="head"><div><h3>Luftdruck in der Kammer (Simulation)</h3>' +
    '<small>hpdcsim — quasistatisches Schussmodell, serverseitig gerechnet</small></div>' +
    '<div class="head-right"><small>Backend</small></div></div>' +
    '<div class="body"><div class="canvas-wrap"><canvas></canvas></div>' +
    '<div class="hover-value" data-status>Warte auf erste Berechnung …</div></div>';
  container.appendChild(card);
  statusEl = card.querySelector('[data-status]');

  subscribe(schedule);
  window.addEventListener('resize', () => { if (lastRes) draw(); });
  schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, DEBOUNCE_MS);
}

async function run() {
  if (ctrl) ctrl.abort();
  ctrl = new AbortController();
  statusEl.textContent = 'Simulation läuft …';
  try {
    lastRes = await fetchSim(toSimPayload(state.values, state.curve), ctrl.signal);
    draw();
    statusEl.innerHTML = statusText(lastRes);
  } catch (e) {
    if (e.name === 'AbortError') return;
    lastRes = null;
    drawEmpty(e instanceof TypeError
      ? 'Simulations-Backend nicht erreichbar'
      : e.message);
    statusEl.innerHTML = e instanceof TypeError
      ? 'Kein Backend: Die Simulation braucht den DieLogic-Server ' +
        '(<code>uvicorn backend.app:app</code>, siehe backend/README). ' +
        'Alle übrigen Diagramme rechnen weiter lokal.'
      : '⚠ ' + e.message;
  }
}

function statusText(res) {
  const m = res.meta;
  const parts = ['φ = ' + fmt(m.phi * 100) + ' %',
    'Füllende bei ' + fmt(m.fill_complete_mm) + ' mm',
    'Pressrest ' + fmt(m.biscuit_mm) + ' mm'];
  if (m.curve_clamped) parts.push('Kurve am Füllende gekappt');
  if (res.critical_crossing) {
    parts.push('<b>v<sub>krit</sub> überschritten ab ' +
      fmt(res.critical_crossing.s_mm) + ' mm (Garber/López)</b>');
  }
  return parts.join(' · ');
}

function buildSpec(res) {
  const s = res.samples;
  const x = [], y = [];
  for (let i = 0; i < s.s_mm.length; i++) {
    const p = s.p_air_mbar[i];
    if (s.s_mm[i] === null || p === null || p > P_CLIP_MBAR) break;
    x.push(s.s_mm[i]);
    y.push(p);
  }
  return {
    x,
    ys: [{ n: 'Luftdruck [mbar]', c: theme.chart.series2, y }],
    xl: 'Kolbenweg s [mm]',
    yl: 'p Luft [mbar]',
    info: 'Anzeige bis ' + fmt(P_CLIP_MBAR) + ' mbar — nahe der vollständigen ' +
      'Füllung divergiert das Modell (Restluftvolumen → 0).'
  };
}

function draw() {
  drawTo(buildSpec(lastRes));
}

function drawEmpty(msg) {
  drawTo({ err: msg, title: 'Luftdruck in der Kammer' });
}

function drawTo(spec) {
  const wrap = card.querySelector('.canvas-wrap');
  const w = Math.max(340, Math.floor(wrap.clientWidth || 600));
  const h = Math.round(w * 0.45);
  wrap.style.height = h + 'px';
  const cv = wrap.querySelector('canvas');
  const pr = window.devicePixelRatio || 1;
  cv.width = w * pr; cv.height = h * pr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const x = cv.getContext('2d');
  x.setTransform(pr, 0, 0, pr, 0, 0);
  drawAny(x, w, h, spec, { id: 'simair' });
}
