/* Diagramm-Karten: DOM-Aufbau (Kopf, Tabs, Buttons, Canvas, Hover-Zeile)
   und das Neuzeichnen einer Karte. */

import { subHTML } from '../core/format.js';
import { drawAny } from '../render/draw.js';
import { showHover, HOVER_IDLE } from '../render/hover.js';
import { notify } from '../core/state.js';
import { copyChart, exportShotCSV } from './export.js';

const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const TARGET_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>';

/* opts: { link: Link zur Einzelseite anzeigen, forceWide: volle Breite,
   fitHeight: Canvas-Höhe an den sichtbaren Inhaltsbereich anpassen (Einzelseite),
   onHighlight(def, btn): Callback des Eingabe-Hervorheben-Buttons } */
export function buildCard(def, container, opts = {}) {
  const card = document.createElement('article');
  card.className = 'card' + ((def.wide || opts.forceWide) ? ' wide' : '');
  card.dataset.chart = def.id;
  if (opts.fitHeight) card.dataset.fit = '1';

  let tabsHtml = '';
  if (def.tabs) {
    tabsHtml = '<div class="tabs">' + def.tabs.map(t =>
      '<button data-tab="' + t[0] + '"' + (def.tab === t[0] ? ' class="active"' : '') + '>' + t[1] + '</button>'
    ).join('') + '</div>';
  }
  /* Zweite Tab-Gruppe (y-Achsenmodi, z. B. PQ²): beide Tab-Gruppen wandern
     in eine eigene Zeile unter dem Kopf, damit Titel und Buttons einzeilig
     bleiben wie bei allen anderen Diagrammen. */
  let tabbarHtml = '';
  if (def.tabs2) {
    const tabs2Html = '<div class="tabs">' + def.tabs2.map(t =>
      '<button data-tab2="' + t[0] + '"' + (def.tab2 === t[0] ? ' class="active"' : '') + '>' + t[1] + '</button>'
    ).join('') + '</div>';
    tabbarHtml = '<div class="tabbar">' +
      '<span class="tabbar-group"><span class="tabbar-label">x</span>' + tabsHtml + '</span>' +
      '<span class="tabbar-group"><span class="tabbar-label">y</span>' + tabs2Html + '</span></div>';
    tabsHtml = '';
  }
  const hlHtml = opts.onHighlight
    ? '<button class="hl-btn" title="Eingaben dieses Diagramms in der Seitenleiste hervorheben" aria-label="Eingaben hervorheben">' + TARGET_SVG + '</button>'
    : '';
  const csvHtml = def.csv
    ? '<button class="csv-btn" title="Kurven-Samples als CSV herunterladen">CSV ⬇</button>'
    : '';
  const linkHtml = opts.link
    ? '<a class="single-link" href="chart.html?id=' + def.id + '" title="Diagramm als Einzelseite öffnen">↗</a>'
    : '';

  card.innerHTML =
    '<div class="head"><div><h3>' + def.title + '</h3><small>' + subHTML(def.desc) + '</small></div>' +
    '<div class="head-right">' + tabsHtml + hlHtml + csvHtml +
    '<button class="png-btn" title="Als PNG kopieren" aria-label="Als PNG kopieren">' + COPY_SVG + '</button>' +
    linkHtml + '</div></div>' +
    tabbarHtml +
    '<div class="body"><div class="canvas-wrap"><canvas></canvas></div>' +
    '<div class="hover-value">' + HOVER_IDLE + '</div>' +
    (def.extraHTML ? def.extraHTML() : '') + '</div>';

  card.querySelectorAll('.tabs button').forEach(b => {
    b.onclick = () => {
      if (b.dataset.tab2) def.tab2 = b.dataset.tab2; else def.tab = b.dataset.tab;
      b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      notify();
    };
  });
  card.querySelector('.png-btn').onclick = () => copyChart(card, def);
  const csvBtn = card.querySelector('.csv-btn');
  if (csvBtn) csvBtn.onclick = () => exportShotCSV(card.shot);
  const hlBtn = card.querySelector('.hl-btn');
  if (hlBtn) hlBtn.onclick = () => opts.onHighlight(def, hlBtn);

  const cv = card.querySelector('canvas');
  cv.onmousemove = ev => showHover(card, ev);
  cv.onmouseleave = () => { card.querySelector('.hover-value').textContent = HOVER_IDLE; };

  container.appendChild(card);
  return card;
}

export function renderCard(card, def, v, shot) {
  /* Fehler-Isolation je Diagramm: die Karten werden in einer Schleife
     gerendert (main.js). Ein Wurf in calc() riss bisher alle folgenden mit —
     sie behielten still ihr altes Bild, während die Seitenleiste bereits neue
     Zahlen zeigte. Der Fehlerkanal d.err existiert (render/draw.js). */
  let d;
  try { d = def.calc(v, { shot }) || { err: 'Kein Ergebnis.' }; }
  catch (e) { d = { err: (e && e.message) || String(e) }; }
  d.title = def.title;
  card.data = d;
  card.shot = shot;

  const wrap = card.querySelector('.canvas-wrap');
  const w = Math.max(340, Math.floor(wrap.clientWidth || 600));
  let h = Math.round(w * (def.aspect || 0.8));
  /* Einzelseite: Höhe so kappen, dass Diagramm + Hover-Zeile in den sichtbaren
     Inhaltsbereich passen (nur im Desktop-Layout mit fester Spaltenhöhe). */
  if (card.dataset.fit && document.documentElement.clientWidth > 1080) {
    const cont = card.closest('.content');
    const head = card.querySelector('.head');
    const tabbar = card.querySelector('.tabbar');
    if (cont && cont.clientHeight > 300) {
      const avail = cont.clientHeight - (head ? head.offsetHeight : 52)
        - (tabbar ? tabbar.offsetHeight : 0) - 96;
      h = Math.max(300, Math.min(h, avail));
    }
  }
  wrap.style.height = h + 'px';
  const cv = wrap.querySelector('canvas');
  const pr = window.devicePixelRatio || 1;
  cv.width = w * pr; cv.height = h * pr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const x = cv.getContext('2d');
  x.setTransform(pr, 0, 0, pr, 0, 0);
  try { drawAny(x, w, h, d, def); }
  catch (e) { drawAny(x, w, h, { err: (e && e.message) || String(e), title: d.title }, def); }

  if (def.renderExtras) { try { def.renderExtras(card, shot, v); } catch (e) { /* Karte bleibt lesbar */ } }
}
