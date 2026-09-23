/* Die Seitenpipeline der Auslegung — EINE für das Dashboard (main.js), die
   Einzelseiten (single.js) und den Auslegungsschritt der Werkbank
   (3d-studio/js/werkbank/design.js). Vorher trug jede Seite ihre eigene
   Kopie, und die der Werkbank lief auseinander: sie blendete die Vakuum-
   Felder nach einem Modellwechsel nicht um und zeichnete beim Wechsel des
   Farbschemas nicht neu.

     createRender   Seitenleiste nachführen, prüfen, rechnen, zeichnen
     buildDashboard Kammerkarte, Kennzahlen und eine Karte je Diagramm
     startPage      abgeleiteten Zustand herstellen, Luftsimulation und
                    Seite abonnieren, Farbschema und Fenstergröße

   Kurvengenerator und Auto-Flächen laufen als Preparer in notify()
   (core/curvegen.js, core/autofit.js); gerechnet werden sie je Eingabe
   einmal, nicht noch einmal beim Zeichnen. */

import { state, subscribe, prepare } from '../core/state.js';
import { computeShot } from '../core/physics.js';
import { curveGenMessage } from '../core/curvegen.js';
import '../core/autofit.js';                        // Preparer: Auto-Flächen nach der Kurve
import { initSim } from '../core/simstore.js';
import { charts } from '../charts/registry.js';
import { validate, refreshAuto, updateFieldVisibility, highlightInputs, clearHighlights } from './inputs.js';
import { renderCurveTable } from './curveTable.js';
import { renderKpis } from './kpis.js';
import { buildChamberCard, renderChamber } from './chamber.js';
import { buildCard, renderCard, paintCard } from './cards.js';

/* Die Renderfunktion einer Seite.
   opts.curve     die Kurventabelle nachführen (Einzelseiten ohne Kurven-UI: false)
   opts.blocked(v, grund)  gesperrt, und es gibt noch keinen gültigen Stand:
                  die Karten nennen den Grund
   opts.draw(v, shot)      gültig gerechnet: zeichnen
   render() liefert das Schussergebnis oder null (gesperrt). */
export function createRender(opts) {
  let gueltig = false;                              // gab es schon einen gültigen Stand?
  return function render() {
    const v = state.values;
    refreshAuto();
    updateFieldVisibility();
    if (opts.curve !== false && state.curveGen.mode !== 'points') renderCurveTable(curveGenMessage());
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
      if (!gueltig) opts.blocked(v, 'Eingaben außerhalb des zulässigen Bereichs: ' + (urteil.msgs[0] || 'siehe Seitenleiste') + '.');
      return null;
    }
    gueltig = true;
    const shot = computeShot(v, state.curve);
    opts.draw(v, shot);
    return shot;
  };
}

/* 🎯 einer Karte: die Eingaben des Diagramms in der Seitenleiste hervorheben;
   derselbe Knopf noch einmal hebt es auf. */
function highlighter() {
  let aktiv = null;
  return (def, btn) => {
    document.querySelectorAll('.hl-btn.active').forEach(b => { if (b !== btn) b.classList.remove('active'); });
    if (aktiv === def) {
      aktiv = null;
      btn.classList.remove('active');
      clearHighlights();
      return;
    }
    aktiv = def;
    btn.classList.add('active');
    highlightInputs(def.inputs, { curve: def.usesCurve });
  };
}

/* Das ganze Dashboard: die Kammerkarte in el.chamber (Schema, Lineal,
   Kennwerte der Füllkammer), die Prüfpanels in el.summary und eine Karte je
   Diagramm in el.charts (mit ↗ zur Einzelseite und 🎯). draw und block
   passen zu createRender, repaint malt nach einem Farbschema-Wechsel aus
   den vorhandenen Daten neu, ohne zu rechnen. */
export function buildDashboard(el) {
  const chamberCard = buildChamberCard(el.chamber);
  const chamberKpis = chamberCard.querySelector('#chamber-kpis');
  const onHighlight = highlighter();
  const cards = {};
  charts.forEach(def => { cards[def.id] = buildCard(def, el.charts, { link: true, onHighlight }); });
  return {
    draw(v, shot) {
      renderChamber(chamberCard, v);
      renderKpis(el.summary, v, shot, chamberKpis);
      charts.forEach(def => renderCard(cards[def.id], def, v, shot));
    },
    block(v, grund) {
      charts.forEach(def => renderCard(cards[def.id], def, v, null, grund));
    },
    /* Die Diagramme tragen Rollen, keine Farbwerte; die Füllkammer trägt
       die Farbwerte im SVG und wird neu gebaut. Kennzahlen, Leisten und
       Lineal sind CSS-Tokens und folgen von allein. */
    repaint() {
      charts.forEach(def => paintCard(cards[def.id], def));
      if (chamberCard._v) renderChamber(chamberCard, chamberCard._v);
    }
  };
}

/* Seite starten. Der geladene Zustand kommt ohne notify() herein: der
   abgeleitete Teil (generierte Kurve, Auto-Flächen) wird hier einmal
   hergestellt, bevor die Luftsimulation ihn sieht. Die Simulation
   abonniert VOR der Seite (core/simstore.js), damit die Diagramme ihr
   frisches Ergebnis zeichnen.
   opts.sim      Luftsimulation starten (Einzelseiten nur, wenn das
                 Diagramm sie liest)
   opts.repaint  beim Wechsel des Farbschemas (shared/schemes.js) neu malen
   opts.resize   bei Größenänderung des Fensters neu zeichnen — die Karten
                 messen ihre Breite beim Zeichnen */
export function startPage(render, opts = {}) {
  prepare();
  if (opts.sim !== false) initSim();
  subscribe(render);
  if (opts.repaint) document.addEventListener('dielogic:scheme', opts.repaint);
  if (opts.resize !== false) {
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 120); });
  }
}
