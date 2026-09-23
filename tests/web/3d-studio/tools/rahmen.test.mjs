/* Was der gemeinsame Rahmen jedem Werkzeug verspricht — geprüft an einem
   Designer (Überlaufdesigner), weil der alles hat: Entwurf, Verlauf, Griffe,
   Kopfzeilen-Klappen. Die Fälle stammen aus der Prüfung vom 22.09.: der
   Entwurfsstreifen überlebte einen Bauteilwechsel und setzte den Plan des
   vorigen aufs neue, Strg+Z ging nach einem Zug am Regler ins Leere, Esc im
   Feld nahm die Auswahl weg, ein Doppelklick auf den Hauptknopf brach den
   Lauf gleich wieder ab.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/rahmen.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mountPage, wait } from './fixture.mjs';

let P, cam, canvas, b, c;
const zeiger = (t, x, y, extra = {}) => canvas.dispatch(t, { button: 0, clientX: x, clientY: y, stopPropagation() {}, preventDefault() {}, ...extra });
const klick = (x, y) => { zeiger('pointerdown', x, y); zeiger('pointerup', x, y); };
const schauAuf = (from, to) => { cam.position.set(...from); cam.up.set(0, 1, 0); cam.lookAt(...to); cam.updateMatrixWorld(true); P.v.view.scene.updateMatrixWorld(true); };
const chip = id => P.doc.querySelector('[data-chip="' + id + '"]');
const anzahl = () => Object.keys(P.v.state.plan.items).length;
const teil = async id => { P.doc.getElementById('demo-select').value = id; await P.host.part.pickDemo(id); await wait(() => P.v.state.ready, 1200); };
const setzen = () => { chip('bohne').dispatch('click'); klick(400, 300); };

before(async () => {
  P = await mountPage('ueberlauf.html', 'js/studio/pages/ueberlauf.js');
  cam = P.v.view.camera;
  canvas = P.v.view.renderer.domElement;
  b = P.host.part.model.bounds;
  c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  schauAuf([b.max[0] + 400, c[1], c[2]], c);
});

test('Entwurf: das Angebot gehört SEINEM Bauteil — ein Wechsel nimmt es mit, Wiederherstellen ist ein Schritt', async () => {
  const { ui, host } = P;
  setzen();
  assert.equal(anzahl(), 1);
  /* Gleich wechseln, ohne die Entprellsekunde abzuwarten: was wartet, gehört dem Getriebedeckel. */
  await teil('oil_pan');
  assert.equal(anzahl(), 0, 'ein neues Bauteil beginnt leer');
  const draft = JSON.parse(globalThis.localStorage.getItem('studio:ueberlauf:gearbox_cover'));
  assert.equal(Object.keys(draft.doc.items).length, 1, 'die Bohne liegt im Entwurf des Getriebedeckels');
  assert.equal(globalThis.localStorage.getItem('studio:ueberlauf:oil_pan'), null, 'nichts Fremdes bei der Ölwanne');
  assert.ok(ui('banner').hidden, 'für die Ölwanne gibt es nichts anzubieten');

  await teil('gearbox_cover');
  assert.ok(!ui('banner').hidden, 'zurück beim Getriebedeckel fragt der Rahmen');
  assert.match(ui('banner').textContent, /für dieses Bauteil wiederherstellen/);
  /* Ohne zu antworten weiter: das Angebot darf nicht mitwandern. */
  await teil('oil_pan');
  assert.ok(ui('banner').hidden, 'der Streifen geht mit seinem Bauteil');

  await teil('gearbox_cover');
  ui('banner').querySelector('.btn-primary').dispatch('click');
  assert.equal(anzahl(), 1, 'wiederhergestellt');
  assert.ok(host.history.canUndo, 'als Schritt: Rückgängig holt den Stand davor zurück');
  assert.ok(host.store.dirty, 'ein Entwurf ist keine gespeicherte Datei');
  host.undo();
  assert.equal(anzahl(), 0);
  host.redo();
  assert.equal(anzahl(), 1);
});

test('Entwurf: „Verwerfen" löscht nur, was angeboten wurde — nicht die Arbeit seither', async () => {
  const { ui, host } = P;
  host.store.flushPending();
  await teil('oil_pan');
  await teil('gearbox_cover');
  assert.ok(!ui('banner').hidden, 'der Entwurf mit der Bohne wird angeboten');
  /* Weiterarbeiten, ohne zu antworten, dann doch „Verwerfen". */
  schauAuf([b.max[0] + 400, c[1], c[2] + 30], [c[0], c[1], c[2] + 30]);
  setzen();
  host.store.flushPending();
  ui('banner').querySelectorAll('.btn').find(x => /Verwerfen/.test(x.textContent)).dispatch('click');
  const now = JSON.parse(globalThis.localStorage.getItem('studio:ueberlauf:gearbox_cover'));
  assert.ok(now && Object.keys(now.doc.items).length === anzahl(), 'der Entwurf der neuen Arbeit bleibt');
  assert.ok(host.store.dirty, 'und sie gilt weiter als ungespeichert');
});

test('Tasten: Strg+Z wirkt auch mit Fokus auf einem Regler, im Textfeld gehört es dem Text; Esc im Feld lässt die Auswahl', () => {
  const { v, ui, host } = P;
  const vorher = anzahl();
  setzen();
  assert.equal(anzahl(), vorher + 1);
  const slider = ui('inspector-body').querySelector('input[type="range"]') || P.doc.querySelector('.st-root input[type="range"]');
  assert.ok(slider, 'ein Regler zum Fokussieren');
  P.doc.dispatch('keydown', { key: 'z', ctrlKey: true, target: slider, preventDefault() {} });
  assert.equal(anzahl(), vorher, 'Strg+Z nach dem Zug am Regler nimmt das Setzen zurück');
  host.redo();
  assert.equal(anzahl(), vorher + 1);
  const text = ui('inspector-body').querySelector('input[type="text"]');
  assert.ok(text, 'ein Textfeld im Auswahlfeld');
  P.doc.dispatch('keydown', { key: 'z', ctrlKey: true, target: text, preventDefault() {} });
  assert.equal(anzahl(), vorher + 1, 'im Textfeld nimmt Strg+Z nichts vom Plan zurück');
  text.focus();
  const sel = v.handles.selected;
  assert.ok(sel, 'etwas ist gewählt');
  P.doc.dispatch('keydown', { key: 'Escape', target: text, preventDefault() {} });
  assert.equal(v.handles.selected, sel, 'Esc im Feld nimmt die Auswahl NICHT weg');
  assert.notEqual(P.doc.activeElement, text, 'sondern verlässt das Feld');
  P.doc.dispatch('keydown', { key: 'Escape', target: canvas, preventDefault() {} });
  assert.equal(v.handles.selected, null, 'Esc außerhalb hebt die Auswahl auf');
});

/* „Darstellung" ist eine Klappe des Rahmens wie die Bauteil-Klappe:
   höchstens eine offen, Esc schließt sie und lässt die Auswahl stehen.
   Vorher hatte sie eigene Zuhörer: Esc schloss sie und hob danach noch
   die Auswahl auf (23.09.). */
test('Darstellung: höchstens eine Klappe offen, Esc schließt sie und lässt die Auswahl', () => {
  const { ui, v } = P;
  const knopf = P.doc.querySelector('[data-darstellung]'), klappe = P.doc.querySelector('[data-ui="darstellung"]');
  setzen();
  const sel = v.handles.selected;
  assert.ok(sel, 'etwas ist gewählt');
  ui('part-chip').dispatch('click');
  assert.equal(ui('part-pop').hidden, false);
  knopf.dispatch('click');
  assert.equal(klappe.hidden, false, 'Darstellung ist offen');
  assert.equal(ui('part-pop').hidden, true, 'die Bauteil-Klappe ist zu');
  P.doc.dispatch('keydown', { key: 'Escape', target: canvas, preventDefault() {} });
  assert.equal(klappe.hidden, true, 'Esc schließt Darstellung');
  assert.equal(v.handles.selected, sel, 'und lässt die Auswahl stehen');
  P.doc.dispatch('keydown', { key: 'Escape', target: canvas, preventDefault() {} });
  assert.equal(v.handles.selected, null, 'erst das nächste Esc hebt sie auf');
  P.host.undo();                                   // die Bohne wieder heraus: die folgenden Tests greifen die erste
});

test('Kopfzeile: Esc schließt die offene Bauteil-Klappe; der Streifen holt die weggenommene Seitenleiste zurück', () => {
  const { ui, shell } = P;
  ui('part-chip').dispatch('click');
  assert.ok(!ui('part-pop').hidden, 'die Klappe ist offen');
  P.doc.dispatch('keydown', { key: 'Escape', target: P.doc.body, preventDefault() {} });
  assert.ok(ui('part-pop').hidden, 'Esc schließt sie');
  ui('panel-toggle').dispatch('click');
  assert.ok(ui('layout').classList.contains('panel-closed'), '☰ nimmt die Seitenleiste weg');
  shell.banner({ text: 'Als A oder als B laden?', actions: [{ label: 'A' }, { label: 'B' }] });
  assert.ok(!ui('layout').classList.contains('panel-closed'), 'eine Frage im Streifen holt sie zurück');
  shell.banner(null);
});

test('Hauptknopf: der zweite Klick eines Doppelklicks bricht den Lauf nicht ab, ein eigener Klick schon', async () => {
  const { ui, shell } = P;
  let cancelled = 0;
  shell.setPrimary({ label: 'Rechnen', onClick: () => shell.setBusy(true, 'Rechnet …', () => { cancelled++; shell.setBusy(false); }) });
  ui('primary').dispatch('click', { detail: 1 });
  assert.equal(ui('primary').textContent, 'Abbrechen', 'der Lauf beginnt');
  ui('primary').dispatch('click', { detail: 2 });
  assert.equal(cancelled, 0, 'der zweite Klick des Doppelklicks bricht nichts ab');
  assert.equal(ui('primary').textContent, 'Abbrechen');
  ui('primary').dispatch('click', { detail: 1 });
  assert.equal(cancelled, 1, 'ein eigener Klick bricht ab');
  shell.setPrimary(null);
});

test('Hilfe: das ⓘ ist kein Knopf im Label — Eingabe und Leertaste öffnen die Hilfe trotzdem', () => {
  const { ui } = P;
  const i = P.doc.querySelector('.st-root .st-info');
  assert.ok(i, 'es gibt ein ⓘ');
  assert.equal(i.tagName, 'SPAN');
  assert.equal(i.getAttribute('role'), 'button');
  assert.ok(ui('help').hidden);
  i.dispatch('keydown', { key: 'Enter', target: i, preventDefault() {}, stopPropagation() {} });
  assert.ok(!ui('help').hidden, 'Eingabe öffnet die Hilfe');
  ui('help-close').dispatch('click');
  assert.ok(ui('help').hidden);
});

test('Griffe: cancelDrag beendet einen Zug ohne „drop" und meldet „cancel"', () => {
  const { v } = P;
  const id = Object.keys(v.state.plan.items)[0];
  const m = v.handles.group.children.find(x => x.userData && x.userData.id === id);
  assert.ok(m, 'der Griff der Bohne');
  cam.updateMatrixWorld(true);
  const q = m.position.clone().project(cam);
  const x = (q.x + 1) / 2 * 800, y = (1 - q.y) / 2 * 600;
  zeiger('pointerdown', x, y);
  assert.ok(v.handles.dragging, 'der Zug beginnt');
  assert.equal(v.handles.cancelDrag(), id);
  assert.ok(!v.handles.dragging, 'und ist vorbei');
  assert.ok(v.view.controls.enabled, 'die Kamera ist wieder frei');
  assert.equal(v.handles.cancelDrag(), null, 'ohne Zug nichts zu tun');
  zeiger('pointerup', x, y);
});
