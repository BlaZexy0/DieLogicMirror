/* Projekt-Modul (web/shared/project.js): Speicher, Migration des alten
   Dashboard-Schlüssels, Abschnitte, Querbezüge, Export/Import.
     node --test tests/web/project.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

globalThis.window = globalThis;
/* Node kennt kein window: eine minimale EventTarget-Attrappe, damit der
   storage-Listener aus project.js überhaupt angemeldet werden kann. */
const bus = new EventTarget();
globalThis.addEventListener = bus.addEventListener.bind(bus);
globalThis.removeEventListener = bus.removeEventListener.bind(bus);
globalThis.dispatchEvent = bus.dispatchEvent.bind(bus);

const P = require(path.join(site, 'shared/project.js'));

/* Ein zweiter, unabhängiger Modul-Zustand = ein zweiter Tab auf demselben
   localStorage. */
function loadProject() {
  const f = require.resolve(path.join(site, 'shared/project.js'));
  delete require.cache[f];
  const M = require(f);
  globalThis.__PROJECT__ = P;      // das Global bleibt beim Haupt-Exemplar
  return M;
}
function storageEvent(key) {
  bus.dispatchEvent(Object.assign(new Event('storage'), { key: key ?? P.STORE_KEY }));
}
const Z = require(path.join(site, 'tools/zyklus/zyklus-logic.js'));

function memStorage(init) {
  const mem = new Map(Object.entries(init || {}));
  return { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k), mem };
}
function fresh(init) { P._reset(); const s = memStorage(init); P.init(s); return s; }

test('leerer Speicher → kein Projekt; Abschnitte sind dann null/false', () => {
  fresh();
  assert.equal(P.list().length, 0);
  assert.equal(P.current(), null);
  assert.equal(P.getSection('design'), null);
  assert.equal(P.setSection('design', { values: {} }), false);
  assert.deepEqual(P.derived(), { mpart: null, mdose: null, tz: null, machine: null, machinePreset: null, alloy: null, Tcast: null, Tdie: null, area: null, Acav: null, sources: {} });
  P.create({ name: 'A' });
  assert.equal(P.current().name, 'A');
});

test('Abschnitte: setSection/getSection liefern Kopien und markieren dirty', () => {
  fresh(); P.create({ name: 'A' }); P.current().dirty = false;
  assert.equal(P.current().dirty, false);
  assert.ok(P.setSection('cycle', Z.defaultState()));
  const c = P.getSection('cycle');
  c.durs.schuss = 99;
  assert.equal(P.getSection('cycle').durs.schuss, 4, 'getSection liefert eine Kopie');
  assert.equal(P.current().dirty, true);
  assert.throws(() => P.setSection('fremd', {}), /Unbekannter Abschnitt/);
});

test('Speicher überlebt einen Neustart (gleicher Storage)', () => {
  const s = fresh();
  P.create({ name: 'DieCastPartA', description: 'Getriebegehäuse' });
  P.setSection('cost', { values: { tz: 40 } });
  const id = P.current().id;
  P._reset();
  P.init(s);
  assert.equal(P.current().id, id);
  assert.equal(P.current().name, 'DieCastPartA');
  assert.equal(P.getSection('cost').values.tz, 40);
  assert.equal(P.list().length, 1);
});

test('Projekte: anlegen, wechseln, umbenennen, duplizieren, entfernen', () => {
  fresh();
  const a = P.create({ name: 'A' });
  const b = P.create({ name: 'B' });
  assert.equal(P.current().id, b.id);
  assert.ok(P.select(a.id));
  assert.equal(P.current().id, a.id);
  assert.ok(!P.select('gibt-es-nicht'));
  P.update(a.id, { name: 'A neu', customer: 'ACME', partNo: '4711' });
  assert.equal(P.get(a.id).name, 'A neu');
  assert.equal(P.get(a.id).customer, 'ACME');
  P.setSection('design', { values: { part: 3 } });
  const d = P.duplicate(a.id);
  assert.equal(d.name, 'A neu (Kopie)');
  assert.equal(d.design.values.part, 3);
  assert.equal(d.remote, null);
  assert.equal(P.list().length, 3);
  assert.ok(P.remove(d.id));
  assert.notEqual(P.current().id, d.id);
  P.remove(a.id); P.remove(b.id);
  assert.equal(P.list().length, 0);
  assert.equal(P.current(), null);
});

test('derived: Massen aus der Auslegung, Zykluszeit aus der Zyklusanalyse', () => {
  fresh(); P.create({ name: 'A' });
  assert.deepEqual(P.derived(), { mpart: null, mdose: null, tz: null, machine: null, machinePreset: null, alloy: null, Tcast: null, Tdie: null, area: null, Acav: null, sources: {} });
  P.setSection('design', { values: { part: 12, runner: 3, overflow: 2, biscuit: 1.2 }, machine: 'hcc800' });
  let d = P.derived();
  assert.equal(d.mpart, 12);
  assert.equal(d.mdose, 18.2);
  assert.equal(d.machine, 'hcc800');
  assert.equal(d.tz, null);
  P.setSection('cycle', Z.defaultState());
  d = P.derived();
  assert.equal(d.tz, 52);   // 8+4+15+5+6+8+4+2 — Parallelvorgänge enden davor
  assert.match(d.sources.tz, /Zyklusanalyse/);
  /* Ein Parallelvorgang, der über den Hauptzyklus hinausragt, verlängert den Zyklus */
  const c = Z.defaultState();
  c.sections.handling.push({ label: 'Lange Ablage', anchor: 'mainEnd', lag: 0, dur: 3.5 });
  P.setSection('cycle', c);
  assert.equal(P.derived().tz, 55.5);
  /* Wärmebilanz: Temperaturen + Sprengfläche aus der Auslegung, Presets über die Listen, Gravurfläche aus den STL-Netzen */
  assert.equal(P.derived().Tdie, null);
  assert.equal(P.derived().alloy, null);
  P.setSection('design', { values: { part: 12, runner: 3, overflow: 2, biscuit: 1.2, Tdie: 210, Tcast: 665, area: 0.2 }, machine: 'hcc800', alloy: 'alsi12' });
  d = P.derived();
  assert.equal(d.Tdie, 210); assert.equal(d.Tcast, 665); assert.equal(d.area, 0.2);
  assert.equal(d.alloy, null, 'ohne geladene Preset-Liste und ohne Thermik-Werte keine Legierung');
  assert.equal(d.machinePreset, null);
  /* Preset-Listen geladen (wie auf den Werkzeugseiten): id → Eintrag, Stammdaten-Overlay inklusive */
  globalThis.window = globalThis;
  require(path.join(site, 'shared/examples/alloys.js'));
  require(path.join(site, 'shared/examples/machines.js'));
  d = P.derived();
  assert.equal(d.alloy.id, 'alsi12'); assert.match(d.alloy.name, /AlSi12/); assert.equal(d.alloy.fields.hf, 400);
  assert.equal(d.machinePreset.id, 'hcc800'); assert.equal(d.machinePreset.fields.tieX, 900);
  assert.match(d.sources.alloy, /Legierungs-Preset/);
  /* Unbekannte Preset-id, aber vollständige Legierungswerte in der Auslegung → manuelle Legierung */
  P.setSection('design', { values: { Tcast: 650, Tliq: 600, Tsol: 550, hf: 390, cp20: 900, cpS: 1000, cpL: 1100 }, alloy: 'eigene' });
  d = P.derived();
  assert.equal(d.alloy.id, 'eigene'); assert.equal(d.alloy.fields.Tliq, 600); assert.match(d.sources.alloy, /Legierungswerte/);
  delete globalThis.window; delete globalThis.__ALLOYS__; delete globalThis.__MACHINES__;
  assert.equal(d.Acav, null);
  P.setSection('geometry', { files: [{ name: 'a', area: 250000 }, { name: 'b', area: 150000 }, { name: 'c', area: 'x' }] });
  d = P.derived();
  assert.equal(d.Acav, 0.4);   // 400 000 mm² → 0,4 m²
  assert.match(d.sources.Acav, /Sprengflächenanalyse/);
});

test('zyklus: sanitizeState repariert Lücken und erzwingt Zahlen', () => {
  const st = Z.sanitizeState({ durs: { schuss: '5', halten: -1 }, schieber: [{ name: 'S', pullDur: 'x' }, null], sections: { spray: [{ label: 'A', anchor: 'halten', lag: 0, dur: 2 }] } });
  assert.equal(st.durs.schuss, 5);
  assert.equal(st.durs.halten, 15, 'negativ → Standard');
  assert.equal(st.durs.dosieren, 8, 'fehlend → Standard');
  assert.equal(st.schieber.length, 1);
  assert.equal(st.schieber[0].pullDur, 0);
  assert.equal(st.sections.spray.length, 1);
  assert.equal(st.sections.handling.length, 1, 'fehlender Abschnitt → Standard');
  assert.deepEqual(Z.sanitizeState(null), Z.defaultState());
  assert.equal(Z.extrasFromState(Z.defaultState()).length, 4); // 1 Schieber × 2 + 2 Einträge
});

test('Export/Import: Rundreise als neues Projekt, Fremddateien werden abgewiesen', () => {
  fresh(); P.create({ name: 'x' });
  P.update(P.current().id, { name: 'DieCastPartA', description: 'Test' });
  P.setSection('design', { values: { part: 5 } });
  P.markSaved(P.current().id, { id: 'srv1', rev: 3 });
  const txt = P.exportJSON();
  const j = JSON.parse(txt);
  assert.equal(j.app, 'DieLogic');
  assert.equal(j.project.name, 'DieCastPartA');
  assert.equal(j.project.remote, undefined, 'Serverbezug wird nicht exportiert');
  assert.equal(P.fileName(), 'DieLogic_DieCastPartA.json');

  const before = P.current().id;
  const imp = P.importJSON(txt);
  assert.notEqual(imp.id, before, 'Import ist ein neues Projekt');
  assert.equal(P.current().id, imp.id);
  assert.equal(imp.design.values.part, 5);
  assert.equal(imp.remote, null);
  assert.equal(imp.dirty, true);

  assert.throws(() => P.importJSON('{kaputt'), /JSON/);
  assert.throws(() => P.importJSON('{"foo":1}'), /DieLogic-Projektdatei/);
  assert.throws(() => P.importJSON(JSON.stringify({ project: { name: 'x', schema: 99 } })), /neueren/);
  /* Unbekannte Schlüssel und falsche Typen fallen weg */
  const odd = P.importJSON(JSON.stringify({ name: 'Odd', design: 'nein', cycle: { durs: {} }, evil: 1 }));
  assert.equal(odd.design, null);
  assert.deepEqual(odd.cycle, { durs: {} });
  assert.equal(odd.evil, undefined);
});

test('markSaved: Serverbezug setzen, dirty zurücknehmen; put ersetzt gleiche id', () => {
  fresh();
  const cur = P.create({ name: 'A' });
  P.setSection('design', { values: { part: 1 } });
  assert.equal(cur.dirty, true);
  P.markSaved(cur.id, { id: 'srv9', rev: 2 });
  assert.equal(P.current().dirty, false);
  assert.equal(P.current().remote.rev, 2);
  P.put({ id: cur.id, name: 'Vom Server', design: { values: { part: 2 } }, remote: { id: 'srv9', rev: 3 } }, true);
  assert.equal(P.list().length, 1);
  assert.equal(P.current().name, 'Vom Server');
  assert.equal(P.getSection('design').values.part, 2);
});

test('kaputter Speicher → leer; unbekannte currentId → erstes Projekt', () => {
  fresh({ [P.STORE_KEY]: '{kaputt' });
  assert.equal(P.list().length, 0);
  fresh({ [P.STORE_KEY]: JSON.stringify({ currentId: 'weg', projects: { abc123: { name: 'X' } } }) });
  assert.equal(P.current().id, 'abc123', 'unbekannte currentId → erstes Projekt');
});


test('zwei Tabs auf einem Speicher: keiner löscht die Arbeit des anderen', () => {
  const s = memStorage();
  const A = loadProject(); A.init(s);
  const B = loadProject(); B.init(s);

  A.create({ name: 'Projekt A' });
  const idA = A.current().id;
  A.setSection('design', { values: { part: 42 } });

  /* B kennt A's Projekt noch nicht — es hat seine Kopie beim Start gelesen. */
  B.create({ name: 'Projekt B' });
  const idB = B.current().id;
  B.setSection('cycle', { durs: { schuss: 7 } });

  /* Ein Tastendruck in A: früher hat das B's Projekt vernichtet. */
  A.update(idA, { customer: 'Kunde' });

  const disk = JSON.parse(s.mem.get(P.STORE_KEY));
  assert.deepEqual(Object.keys(disk.projects).sort(), [idA, idB].sort(), 'beide Projekte stehen noch');
  assert.equal(disk.projects[idA].design.values.part, 42, 'A behält seinen Abschnitt');
  assert.equal(disk.projects[idB].cycle.durs.schuss, 7, 'B behält seinen Abschnitt');
  assert.equal(A.list().length, 2, 'A hat B\'s Projekt beim Schreiben übernommen');
  assert.equal(A.current().id, idA, 'die eigene Auswahl bleibt');

  /* Löschen muss weiterhin durchschlagen. */
  A.remove(idB);
  assert.deepEqual(Object.keys(JSON.parse(s.mem.get(P.STORE_KEY)).projects), [idA]);
});

test('storage-Ereignis: der fremde Stand wird übernommen', () => {
  const s = memStorage();
  const A = loadProject(); A.init(s);
  const B = loadProject(); B.init(s);

  A.create({ name: 'Von A' });
  assert.equal(B.list().length, 0, 'B hat noch den Stand vom Start');
  storageEvent();
  assert.equal(B.list().length, 1, 'B hat den fremden Stand übernommen');
  assert.equal(B.list()[0].name, 'Von A');
  assert.equal(B.current().id, A.current().id, 'ohne eigene Auswahl gilt das erste Projekt');

  /* Fremder Schlüssel geht das Projektmodul nichts an. */
  A.update(A.current().id, { name: 'Umbenannt' });
  storageEvent('anderer-schluessel');
  assert.equal(B.get(A.current().id).name, 'Von A', 'fremder Schlüssel wird ignoriert');
  storageEvent();
  assert.equal(B.get(A.current().id).name, 'Umbenannt');
});

test('Kontobindung: ein fremdes Konto findet den Cache leer vor', () => {
  const s = memStorage();
  P._reset(); P.init(s);
  assert.equal(P.bindAccount('org-anna'), false, 'erstes Konto übernimmt den Bestand');
  P.create({ name: 'Getriebegehäuse', customer: 'ACME' });
  P.setSection('design', { values: { part: 12 } });

  /* Anderer Tab, anderes Konto — derselbe Browser, derselbe Schlüssel. */
  P._reset(); P.init(s);
  assert.equal(P.list().length, 1, 'ohne Bindung läge alles offen');
  assert.equal(P.bindAccount('org-bob'), true, 'fremder Bestand wird verworfen');
  assert.equal(P.list().length, 0);
  assert.equal(P.current(), null);
  assert.equal(JSON.parse(s.mem.get(P.STORE_KEY)).projects && Object.keys(JSON.parse(s.mem.get(P.STORE_KEY)).projects).length, 0,
    'auch auf der Platte ist nichts mehr');

  /* Dasselbe Konto erneut: kein Verwerfen. */
  P.create({ name: 'Bobs Projekt' });
  assert.equal(P.bindAccount('org-bob'), false);
  assert.equal(P.list().length, 1);

  /* Abmelden räumt auf und hebt die Bindung auf. */
  P.clearAll();
  assert.equal(P.list().length, 0);
  assert.equal(P.bindAccount('org-anna'), false, 'nach clearAll gehört der leere Cache dem nächsten Konto');
});

test('voller Speicher wird gemeldet, nicht verschluckt', () => {
  const events = [];
  /* Der Ereigniskanal des Moduls hängt an globalThis (siehe oben) — hier
     genügt es, mitzuhören. */
  const on = e => events.push(e.detail && e.detail.type);
  globalThis.addEventListener(P.EVENT, on);

  let full = false;
  const mem = new Map();
  const s = {
    getItem: k => mem.get(k) ?? null,
    setItem: (k, v) => { if (full) { const e = new Error('QuotaExceeded'); e.name = 'QuotaExceededError'; throw e; } mem.set(k, v); },
    removeItem: k => mem.delete(k), mem
  };
  P._reset(); P.init(s);
  P.create({ name: 'A' });
  assert.equal(P.storageOk(), true);

  full = true;
  events.length = 0;
  assert.equal(P.setSection('design', { values: { part: 1 } }), false, 'save meldet den Fehlschlag');
  assert.equal(P.storageOk(), false, 'die Oberfläche kann den Zustand abfragen');
  assert.ok(events.includes('storage-error'), 'der Fehlschlag wird gemeldet');

  /* Einmal je Zustandswechsel — nicht bei jedem Tastendruck. */
  events.length = 0;
  P.setSection('design', { values: { part: 2 } });
  assert.ok(!events.includes('storage-error'), 'keine Ereignisflut');

  full = false;
  events.length = 0;
  P.setSection('design', { values: { part: 3 } });
  assert.equal(P.storageOk(), true);
  assert.ok(events.includes('storage-ok'), 'Erholung wird ebenfalls gemeldet');

  globalThis.removeEventListener(P.EVENT, on);
});
