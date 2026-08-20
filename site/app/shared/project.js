/* DieLogic – app/shared/project.js
   Das Projekt ist die gemeinsame Klammer aller Werkzeuge: ein Bauteil/Auftrag
   („DieCastPartA") mit Beschreibung und je einem Abschnitt pro Werkzeug —

     design    Dashboard + alle Diagramme (Eingaben, Schusskurve, Presets)
     geometry  Sprengflächenanalyse (STL-Dateien, Zuordnung, Dichte, Ergebnis)
     cycle     Zyklusanalyse (Phasendauern, Schieber, Parallelvorgänge)
     cost      Teilekosten (Preise, Sätze, Überschreibungen der verknüpften Felder)

   Jede Seite liest ihren Abschnitt mit getSection() und schreibt ihn mit
   setSection(). Die Querbezüge (Massen → Schussgewicht, Zyklus → Zykluszeit)
   liefert derived(): so rechnen alle Werkzeuge auf demselben Stand.

   Ablage: localStorage['dielogic-projects-v1'] = { currentId, projects: {id: doc} }.
   Ohne Konto bleibt alles lokal im Browser; mit Konto spiegelt
   projectbar.js die Projekte auf den Server (Revisionen je Speichern).
   Der alte Dashboard-Schlüssel (hpdc-dashboard-state-v1) wird beim ersten
   Laden in ein Projekt „Übernommene Auslegung" überführt.

   Klassisches Script: Browser-Global window.__PROJECT__, CommonJS-Export für
   Tests. Muss vor den ES-Modulen (js/core/state.js) geladen sein. */
(function (root) {
  'use strict';

  var STORE_KEY = 'dielogic-projects-v1';
  var LEGACY_KEY = 'hpdc-dashboard-state-v1';
  var SCHEMA = 1;
  var SECTIONS = ['design', 'geometry', 'cycle', 'cost'];
  var EVENT = 'dielogic:project';

  var storage = null;   // localStorage-artig (getItem/setItem/removeItem)
  var store = null;     // { currentId, projects }

  function nowISO() { return new Date().toISOString(); }
  function newId() {
    var s = '';
    for (var i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
    return 'p' + Date.now().toString(16) + s;
  }
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function str(x, max) { return typeof x === 'string' ? x.slice(0, max || 5000) : ''; }

  /* ── Dokument ──────────────────────────────────────────────── */

  function newProject(meta) {
    meta = meta || {};
    var t = nowISO();
    return {
      id: newId(), schema: SCHEMA,
      name: str(meta.name, 200) || 'Neues Projekt',
      description: str(meta.description, 5000),
      customer: str(meta.customer, 200), partNo: str(meta.partNo, 100),
      createdAt: t, updatedAt: t,
      design: null, geometry: null, cycle: null, cost: null,
      /* Serverseite: { id, rev, savedAt } sobald das Projekt im Konto liegt;
         dirty = lokale Änderungen seit dem letzten Speichern. */
      remote: null, dirty: false
    };
  }

  /* Fremde Daten (Import, Server, alter Speicher) in ein gültiges Dokument
     überführen — unbekannte Schlüssel fallen weg, Typen werden erzwungen. */
  function sanitize(doc) {
    if (!isObj(doc)) return null;
    var p = newProject({ name: doc.name, description: doc.description, customer: doc.customer, partNo: doc.partNo });
    if (typeof doc.id === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(doc.id)) p.id = doc.id;
    if (typeof doc.createdAt === 'string') p.createdAt = doc.createdAt;
    if (typeof doc.updatedAt === 'string') p.updatedAt = doc.updatedAt;
    SECTIONS.forEach(function (s) { p[s] = isObj(doc[s]) ? clone(doc[s]) : null; });
    if (isObj(doc.remote) && typeof doc.remote.id === 'string') {
      p.remote = { id: doc.remote.id, rev: Number(doc.remote.rev) || 0, savedAt: str(doc.remote.savedAt, 40) };
    }
    p.dirty = !!doc.dirty;
    return p;
  }

  /* Nur die Werkzeug-Abschnitte — das ist der Inhalt einer Server-Revision. */
  function sectionsOf(doc) {
    var d = {};
    SECTIONS.forEach(function (s) { if (doc[s]) d[s] = clone(doc[s]); });
    return d;
  }

  /* ── Speicher ──────────────────────────────────────────────── */

  function readJSON(key) {
    try { var raw = storage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  function save() {
    try { storage.setItem(STORE_KEY, JSON.stringify(store)); return true; }
    catch (e) { return false; /* voll oder deaktiviert */ }
  }

  function emit(type, id) {
    if (typeof root.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function') return;
    try { root.dispatchEvent(new root.CustomEvent(EVENT, { detail: { type: type, id: id } })); }
    catch (e) { /* kein DOM */ }
  }

  /* Speicher laden; ohne Speicher: Migration des alten Dashboard-Zustands
     oder ein leeres Startprojekt. */
  function init(stor) {
    storage = stor || root.localStorage || { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
    var raw = readJSON(STORE_KEY);
    store = { currentId: '', projects: {} };
    if (isObj(raw) && isObj(raw.projects)) {
      Object.keys(raw.projects).forEach(function (id) {
        var p = sanitize(raw.projects[id]);
        if (p) { p.id = id; store.projects[id] = p; }
      });
      if (typeof raw.currentId === 'string') store.currentId = raw.currentId;
    }
    if (!Object.keys(store.projects).length) {
      var legacy = readJSON(LEGACY_KEY);
      var p = newProject(isObj(legacy) && isObj(legacy.values)
        ? { name: 'Übernommene Auslegung', description: 'Automatisch aus dem bisherigen Dashboard-Stand dieses Browsers übernommen.' }
        : { name: 'Beispielprojekt', description: 'Startprojekt mit den Standardwerten — umbenennen oder ein neues Projekt anlegen.' });
      if (isObj(legacy) && isObj(legacy.values)) p.design = clone(legacy);
      store.projects[p.id] = p;
      store.currentId = p.id;
      save();
    }
    if (!store.projects[store.currentId]) {
      store.currentId = list()[0].id;
      save();
    }
    return store;
  }

  function ensure() { if (!store) init(); }

  /* ── Projekte ──────────────────────────────────────────────── */

  function list() {
    ensure();
    return Object.keys(store.projects).map(function (id) { return store.projects[id]; })
      .sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
  }

  function current() { ensure(); return store.projects[store.currentId]; }
  function get(id) { ensure(); return store.projects[id] || null; }

  function select(id) {
    ensure();
    if (!store.projects[id] || id === store.currentId) return false;
    store.currentId = id;
    save();
    emit('select', id);
    return true;
  }

  function create(meta) {
    ensure();
    var p = newProject(meta);
    p.dirty = true;
    store.projects[p.id] = p;
    store.currentId = p.id;
    save();
    emit('create', p.id);
    return p;
  }

  function update(id, meta) {
    var p = get(id);
    if (!p) return null;
    if (meta.name != null) p.name = str(meta.name, 200) || p.name;
    if (meta.description != null) p.description = str(meta.description, 5000);
    if (meta.customer != null) p.customer = str(meta.customer, 200);
    if (meta.partNo != null) p.partNo = str(meta.partNo, 100);
    p.updatedAt = nowISO();
    p.dirty = true;
    save();
    emit('update', id);
    return p;
  }

  function duplicate(id, name) {
    var src = get(id);
    if (!src) return null;
    var p = sanitize(src);
    p.id = newId();
    p.name = name || (src.name + ' (Kopie)');
    p.createdAt = p.updatedAt = nowISO();
    p.remote = null;
    p.dirty = true;
    store.projects[p.id] = p;
    store.currentId = p.id;
    save();
    emit('create', p.id);
    return p;
  }

  function remove(id) {
    ensure();
    if (!store.projects[id]) return false;
    delete store.projects[id];
    if (!Object.keys(store.projects).length) {
      var p = newProject({ name: 'Neues Projekt' });
      store.projects[p.id] = p;
    }
    if (store.currentId === id) store.currentId = list()[0].id;
    save();
    emit('remove', id);
    return true;
  }

  /* Nach erfolgreichem Speichern auf dem Server: Serverstand merken,
     lokale Änderungen gelten als übertragen. */
  function markSaved(id, remote) {
    var p = get(id);
    if (!p) return null;
    p.remote = { id: String(remote.id), rev: Number(remote.rev) || 0, savedAt: nowISO() };
    p.dirty = false;
    save();
    emit('saved', id);
    return p;
  }

  /* Fertiges Dokument einsetzen (Import, Server-Abruf). Gleiche id → ersetzen. */
  function put(doc, makeCurrent) {
    ensure();
    var p = sanitize(doc);
    if (!p) return null;
    store.projects[p.id] = p;
    if (makeCurrent) store.currentId = p.id;
    save();
    emit('put', p.id);
    return p;
  }

  /* Unberührtes Startprojekt (kein Abschnitt, nie bearbeitet, kein
     Serverbezug) — wird nicht in die Datenbank übernommen. */
  function isEmptyStarter(p) {
    return !p.remote && !p.dirty && SECTIONS.every(function (s) { return !p[s]; });
  }

  /* ── Abschnitte ────────────────────────────────────────────── */

  function getSection(name) {
    if (SECTIONS.indexOf(name) < 0) throw new Error('Unbekannter Abschnitt: ' + name);
    var p = current();
    return p[name] ? clone(p[name]) : null;
  }

  function setSection(name, data) {
    if (SECTIONS.indexOf(name) < 0) throw new Error('Unbekannter Abschnitt: ' + name);
    var p = current();
    var next = isObj(data) ? clone(data) : null;
    /* Unverändert (z. B. Seite nur geöffnet und gerendert) → kein neuer
       Stand, sonst gälte jedes Öffnen als ungespeicherte Änderung. */
    if (JSON.stringify(p[name]) === JSON.stringify(next)) return true;
    p[name] = next;
    p.updatedAt = nowISO();
    p.dirty = true;
    var ok = save();
    emit('section', p.id);
    return ok;
  }

  /* Teilwerte in den design-Abschnitt mischen (Übernahme aus der
     STL-Analyse): nicht betroffene Eingaben und die Schusskurve bleiben. */
  function mergeDesign(values, machineId) {
    var d = getSection('design') || {};
    d.values = Object.assign({}, d.values, values);
    if (machineId != null) d.machine = machineId;
    return setSection('design', d);
  }

  /* ── Querbezüge ────────────────────────────────────────────── */

  /* Werte, die ein Werkzeug aus den Abschnitten der anderen bezieht —
     mit Herkunft, damit die Seite sie ausweisen kann.
       mpart  Bauteilgewicht [kg]      ⇐ design.values.part
       mdose  Schussgewicht [kg]       ⇐ part + runner + overflow + biscuit
       tz     Zykluszeit [s]           ⇐ cycle (Zeitleiste, __ZYKLUS_LOGIC__)
       machine Maschinen-Preset        ⇐ design.machine
     Fehlende Quellen liefern null. */
  function derived(doc) {
    var p = doc || current();
    var out = { mpart: null, mdose: null, tz: null, machine: null, sources: {} };
    var v = p.design && isObj(p.design.values) ? p.design.values : null;
    if (v) {
      var part = Number(v.part), runner = Number(v.runner), overflow = Number(v.overflow), biscuit = Number(v.biscuit);
      if (isFinite(part) && part > 0) { out.mpart = part; out.sources.mpart = 'Auslegung (Bauteilgewicht)'; }
      if ([part, runner, overflow, biscuit].every(function (x) { return isFinite(x) && x >= 0; }) && part > 0) {
        out.mdose = Math.round((part + runner + overflow + biscuit) * 1000) / 1000;
        out.sources.mdose = 'Auslegung (Bauteil + Anguss + Überlauf + Pressrest)';
      }
    }
    if (p.design && typeof p.design.machine === 'string' && p.design.machine) {
      out.machine = p.design.machine;
      out.sources.machine = 'Auslegung (Maschinen-Preset)';
    }
    var Z = root.__ZYKLUS_LOGIC__;
    if (p.cycle && Z && typeof Z.extrasFromState === 'function') {
      try {
        var r = Z.layoutCycle(p.cycle.durs, Z.extrasFromState(p.cycle));
        if (isFinite(r.total) && r.total > 0) {
          out.tz = Math.round(r.total * 10) / 10;
          out.sources.tz = 'Zyklusanalyse (Zeitleiste)';
        }
      } catch (e) { /* unvollständiger Zyklus-Abschnitt */ }
    }
    return out;
  }

  /* ── Export / Import ───────────────────────────────────────── */

  function exportJSON(id) {
    var p = id ? get(id) : current();
    if (!p) return null;
    var doc = sanitize(p);
    delete doc.remote;
    delete doc.dirty;
    return JSON.stringify({ app: 'DieLogic', kind: 'project', schema: SCHEMA, project: doc }, null, 2);
  }

  /* Liefert das eingesetzte Projekt oder wirft mit verständlicher Meldung. */
  function importJSON(text) {
    var data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('Keine gültige JSON-Datei.'); }
    var doc = isObj(data) && isObj(data.project) ? data.project : data;
    if (!isObj(doc) || typeof doc.name !== 'string') throw new Error('Das ist keine DieLogic-Projektdatei.');
    if (doc.schema != null && Number(doc.schema) > SCHEMA) throw new Error('Die Datei stammt aus einer neueren DieLogic-Version.');
    var p = sanitize(doc);
    p.id = newId();           // Import ist immer ein neues Projekt
    p.remote = null;
    p.dirty = true;
    return put(p, true);
  }

  /* Dateiname für den Export: „DieLogic_DieCastPartA.json" */
  function fileName(p) {
    p = p || current();
    return 'DieLogic_' + (p.name || 'Projekt').replace(/[^\wäöüÄÖÜß.-]+/g, '_').slice(0, 60) + '.json';
  }

  var api = {
    STORE_KEY: STORE_KEY, LEGACY_KEY: LEGACY_KEY, SECTIONS: SECTIONS, EVENT: EVENT, SCHEMA: SCHEMA,
    init: init, list: list, current: current, get: get, select: select,
    create: create, update: update, duplicate: duplicate, remove: remove, put: put, markSaved: markSaved,
    getSection: getSection, setSection: setSection, mergeDesign: mergeDesign,
    sectionsOf: sectionsOf, derived: derived, isEmptyStarter: isEmptyStarter,
    exportJSON: exportJSON, importJSON: importJSON, fileName: fileName,
    _reset: function () { store = null; storage = null; }
  };
  root.__PROJECT__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
