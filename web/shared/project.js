/* DieLogic – web/shared/project.js
   Das Projekt ist die gemeinsame Klammer aller Werkzeuge: ein Bauteil/Auftrag
   („DieCastPartA") mit Beschreibung und je einem Abschnitt pro Werkzeug —

     design    Dashboard + alle Diagramme (Eingaben, Schusskurve, Presets)
     geometry  Sprengflächenanalyse (STL-Dateien, Zuordnung, Dichte, Ergebnis)
     cycle     Zyklusanalyse (Phasendauern, Schieber, Parallelvorgänge)
     cost      Teilekosten (Preise, Sätze, Überschreibungen der verknüpften Felder)

   Jede Seite liest ihren Abschnitt mit getSection() und schreibt ihn mit
   setSection(). Die Querbezüge (Massen → Schussgewicht, Zyklus → Zykluszeit)
   liefert derived(): so rechnen alle Werkzeuge auf demselben Stand.

   Ablage: localStorage['dielogic-projects-v1'] = { currentId, projects: {id: doc} }
   — ein Cache der Datenbank; projectbar.js synchronisiert (Arbeitsstand
   laufend, Revisionen auf Wunsch).

   Klassisches Script: Browser-Global window.__PROJECT__, CommonJS-Export für
   Tests. Muss vor den ES-Modulen (js/core/state.js) geladen sein. */
(function (root) {
  'use strict';

  var STORE_KEY = 'dielogic-projects-v1';
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
      /* draftAt ist der Stempel der Server-Uhr, auf dem dieser Stand aufsetzt —
         die Marke der optimistischen Sperre beim Autosave. */
      p.remote = { id: doc.remote.id, rev: Number(doc.remote.rev) || 0,
        savedAt: str(doc.remote.savedAt, 40), draftAt: str(doc.remote.draftAt, 40) || null };
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

  /* Alle Tabs teilen sich einen Speicherschlüssel. Ein Tab, der seine ganze
     Kopie schreibt, löscht damit alles, was ein anderer seit dem Laden
     geändert hat. Deshalb wird vor jedem Schreiben neu eingelesen und nur das
     gerade geänderte Projekt aus dem Speicher darüber gelegt; fremde
     Projekte bleiben stehen und werden zugleich hier übernommen.
       id - das geänderte Projekt. Fehlt es im Speicher, gilt es als gelöscht
            und fällt auch auf der Platte weg. Ohne id gewinnt die Platte
            vollständig (Auswahl wechseln, Start). */
  function mergeFromDisk(id) {
    var disk = readJSON(STORE_KEY);
    if (!isObj(disk) || !isObj(disk.projects)) return store.projects;
    var next = {};
    Object.keys(disk.projects).forEach(function (k) {
      if (k === id) return;                    // unten aus dem Speicher gesetzt
      var p = sanitize(disk.projects[k]);
      if (!p) return;
      p.id = k;
      var mine = store.projects[k];
      /* Identität wahren, solange sich nichts geändert hat - Aufrufer halten
         Referenzen auf das Projektobjekt. */
      next[k] = (mine && JSON.stringify(mine) === JSON.stringify(p)) ? mine : p;
    });
    if (id && store.projects[id]) next[id] = store.projects[id];
    return next;
  }

  function firstId(projects) {
    return Object.keys(projects).sort(function (a, b) {
      return projects[a].updatedAt < projects[b].updatedAt ? 1 : -1;
    })[0] || '';
  }

  /* Voller oder abgeschalteter Speicher (Privatmodus, Quota, blockierte
     Site-Daten) ist kein Randfall: keiner der vier Aufrufer prüfte den
     Rückgabewert, und die Leiste meldete danach „gespeichert", während die
     Arbeit nirgends lag. Der Fehler wird deshalb zusätzlich über den
     Ereigniskanal gemeldet — einmal je Zustandswechsel, damit ein volles
     localStorage nicht bei jedem Tastendruck ein Ereignis auslöst. */
  var writeFailed = false;
  function save(id, replaceAll) {
    if (!store) return false;
    if (!replaceAll) store.projects = mergeFromDisk(id);
    if (!store.projects[store.currentId]) store.currentId = firstId(store.projects);
    try {
      storage.setItem(STORE_KEY, JSON.stringify(store));
      if (writeFailed) { writeFailed = false; emit('storage-ok'); }
      return true;
    } catch (e) {
      if (!writeFailed) { writeFailed = true; emit('storage-error'); }
      return false;   // voll oder deaktiviert
    }
  }

  /* Für die Oberfläche: liegt der letzte Schreibversuch daneben? */
  function storageOk() { return !writeFailed; }

  /* Ein anderer Tab hat geschrieben: den fremden Stand übernehmen, ohne
     selbst zu schreiben, und die Oberfläche unterrichten. */
  function adoptExternal() {
    if (!store) return;
    var before = JSON.stringify(store.projects) + '|' + store.currentId;
    store.projects = mergeFromDisk(null);
    if (!store.projects[store.currentId]) store.currentId = firstId(store.projects);
    if (JSON.stringify(store.projects) + '|' + store.currentId === before) return;
    emit('external');
  }

  var watching = false;
  function watchStorage() {
    if (watching || typeof root.addEventListener !== 'function') return;
    watching = true;
    root.addEventListener('storage', function (e) {
      if (e && e.key != null && e.key !== STORE_KEY) return;
      adoptExternal();
    });
  }

  function emit(type, id) {
    if (typeof root.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function') return;
    try { root.dispatchEvent(new root.CustomEvent(EVENT, { detail: { type: type, id: id } })); }
    catch (e) { /* kein DOM */ }
  }

  /* Speicher laden. Ohne Projekte bleibt der Cache leer — projectbar.js
     holt die Projekte der Organisation bzw. legt das erste an. */
  function init(stor) {
    storage = stor || root.localStorage || { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
    var raw = readJSON(STORE_KEY);
    store = { currentId: '', projects: {}, owner: '' };
    if (isObj(raw) && isObj(raw.projects)) {
      if (typeof raw.owner === 'string') store.owner = raw.owner;
      Object.keys(raw.projects).forEach(function (id) {
        var p = sanitize(raw.projects[id]);
        if (p) { p.id = id; store.projects[id] = p; }
      });
      if (typeof raw.currentId === 'string') store.currentId = raw.currentId;
    }
    if (!store.projects[store.currentId]) {
      store.currentId = Object.keys(store.projects).length ? list()[0].id : '';
      save();
    }
    watchStorage();
    return store;
  }

  function ensure() { if (!store) init(); }

  /* ── Kontobindung ──────────────────────────────────────────────
     Der Cache liegt in einem Schlüssel, den jedes Konto auf diesem Gerät
     sieht. Er gehört deshalb genau einer Organisation: meldet sich eine
     andere an, wird er verworfen, bevor irgendetwas gelesen oder zum Server
     geschickt wird. Sonst sieht der nächste Benutzer Namen, Kunden und alle
     Werkzeugabschnitte des vorigen — und lädt sie in seine eigene
     Organisation hoch. */
  function bindAccount(orgId) {
    ensure();
    orgId = String(orgId || '');
    if (!orgId) return false;
    if (store.owner && store.owner !== orgId) {
      store.projects = {};
      store.currentId = '';
      store.owner = orgId;
      save(null, true);
      emit('clear');
      return true;                 // fremder Bestand verworfen
    }
    if (store.owner !== orgId) { store.owner = orgId; save(); }
    return false;
  }

  /* Abmelden oder abgelaufene Sitzung: nichts von diesem Konto bleibt liegen. */
  function clearAll() {
    ensure();
    store.projects = {};
    store.currentId = '';
    store.owner = '';
    save(null, true);
    emit('clear');
    return true;
  }

  /* ── Projekte ──────────────────────────────────────────────── */

  function list() {
    ensure();
    return Object.keys(store.projects).map(function (id) { return store.projects[id]; })
      .sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
  }

  function current() { ensure(); return store.projects[store.currentId] || null; }
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
    save(p.id);
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
    save(id);
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
    save(p.id);
    emit('create', p.id);
    return p;
  }

  function remove(id) {
    ensure();
    if (!store.projects[id]) return false;
    delete store.projects[id];
    if (store.currentId === id) store.currentId = Object.keys(store.projects).length ? list()[0].id : '';
    save(id);
    emit('remove', id);
    return true;
  }

  /* Nach erfolgreichem Speichern auf dem Server: Serverstand merken,
     lokale Änderungen gelten als übertragen. */
  function markSaved(id, remote) {
    var p = get(id);
    if (!p) return null;
    /* savedAt und draftAt sind Stempel der Server-Uhr — nur so lassen sie sich
       später gegen die Zeitstempel der Projektliste vergleichen. */
    p.remote = { id: String(remote.id), rev: Number(remote.rev) || 0,
      savedAt: remote.savedAt ? String(remote.savedAt) : nowISO(),
      draftAt: remote.draftAt ? String(remote.draftAt) : (p.remote ? p.remote.draftAt : null) };
    p.dirty = false;
    save(id);
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
    save(p.id);
    emit('put', p.id);
    return p;
  }

  /* ── Abschnitte ────────────────────────────────────────────── */

  function getSection(name) {
    if (SECTIONS.indexOf(name) < 0) throw new Error('Unbekannter Abschnitt: ' + name);
    var p = current();
    return p && p[name] ? clone(p[name]) : null;
  }

  function setSection(name, data) {
    if (SECTIONS.indexOf(name) < 0) throw new Error('Unbekannter Abschnitt: ' + name);
    var p = current();
    if (!p) return false;
    var next = isObj(data) ? clone(data) : null;
    /* Unverändert (z. B. Seite nur geöffnet und gerendert) → kein neuer
       Stand, sonst gälte jedes Öffnen als ungespeicherte Änderung. */
    if (JSON.stringify(p[name]) === JSON.stringify(next)) return true;
    p[name] = next;
    p.updatedAt = nowISO();
    p.dirty = true;
    var ok = save(p.id);
    emit('section', p.id);
    return ok;
  }

  /* Teilwerte in den design-Abschnitt mischen (Übernahme aus der
     STL-Analyse): nicht betroffene Eingaben und die Schusskurve bleiben. */
  function mergeDesign(values, machineId, alloyId) {
    var d = getSection('design') || {};
    d.values = Object.assign({}, d.values, values);
    if (machineId != null) d.machine = machineId;
    if (alloyId != null) d.alloy = alloyId;
    return setSection('design', d);
  }

  /* ── Querbezüge ────────────────────────────────────────────── */

  /* Werte, die ein Werkzeug aus den Abschnitten der anderen bezieht —
     mit Herkunft, damit die Seite sie ausweisen kann.
       mpart  Bauteilgewicht [kg]      ⇐ design.values.part
       mdose  Schussgewicht [kg]       ⇐ part + runner + overflow + biscuit
       tz     Zykluszeit [s]           ⇐ cycle (Zeitleiste, __ZYKLUS_LOGIC__)
       machine Maschinen-Preset        ⇐ design.machine
       machinePreset { id, name, fields } ⇐ design.machine über window.__MACHINES__
       alloy  { id, name, fields }     ⇐ design.alloy über window.__ALLOYS__
                                        (sonst Legierungswerte aus design.values)
       Tcast, Tdie, area               ⇐ design.values (Gieß-, Formtemperatur, Sprengfläche)
       Acav   Formgravuroberfläche [m²] ⇐ geometry.files[].area (Summe)
     Fehlende Quellen liefern null. */
  function derived(doc) {
    var p = doc || current();
    var out = { mpart: null, mdose: null, tz: null, machine: null, machinePreset: null, alloy: null, Tcast: null, Tdie: null, area: null, Acav: null, sources: {} };
    if (!p) return out;
    var v = p.design && isObj(p.design.values) ? p.design.values : null;
    if (v) {
      var part = Number(v.part), runner = Number(v.runner), overflow = Number(v.overflow), biscuit = Number(v.biscuit);
      if (isFinite(part) && part > 0) { out.mpart = part; out.sources.mpart = 'Auslegung (Bauteilgewicht)'; }
      if ([part, runner, overflow, biscuit].every(function (x) { return isFinite(x) && x >= 0; }) && part > 0) {
        out.mdose = Math.round((part + runner + overflow + biscuit) * 1000) / 1000;
        out.sources.mdose = 'Auslegung (Bauteil + Anguss + Überlauf + Pressrest)';
      }
    }
    if (v) {
      ['Tcast', 'Tdie', 'area'].forEach(function (k) {
        var x = Number(v[k]);
        if (isFinite(x) && x > 0) { out[k] = x; out.sources[k] = 'Auslegung (' + { Tcast: 'Gießtemperatur', Tdie: 'Formtemperatur', area: 'Sprengfläche' }[k] + ')'; }
      });
    }
    /* Presets des Projekts: id → Eintrag der (ggf. durch Stammdaten
       ersetzten) Preset-Listen, sofern die Seite sie geladen hat. */
    function preset(listGlobal, listKey, id) {
      var g = root[listGlobal];
      var list = g && Array.isArray(g[listKey]) ? g[listKey] : [];
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
      return null;
    }
    if (p.design && typeof p.design.machine === 'string' && p.design.machine) {
      out.machine = p.design.machine;
      out.sources.machine = 'Auslegung (Maschinen-Preset)';
      var m = preset('__MACHINES__', 'machines', p.design.machine);
      if (m) { out.machinePreset = { id: m.id, name: m.name, fields: clone(m.fields || {}) }; }
    }
    if (p.design && typeof p.design.alloy === 'string' && p.design.alloy) {
      var a = preset('__ALLOYS__', 'alloys', p.design.alloy);
      if (a) { out.alloy = { id: a.id, name: a.name, fields: clone(a.fields || {}) }; out.sources.alloy = 'Auslegung (Legierungs-Preset)'; }
    }
    if (!out.alloy && v) {
      /* Kein Preset auflösbar (manuell oder Liste nicht geladen): Legierungswerte der Auslegung */
      var f = {}, all = true;
      ['density', 'Tcast', 'Tflow', 'Tliq', 'Tsol', 'hf', 'cp20', 'cpS', 'cpL'].forEach(function (k) {
        var x = Number(v[k]); if (isFinite(x)) f[k] = x; else if (k !== 'Tflow' && k !== 'density') all = false;
      });
      if (all) { out.alloy = { id: p.design.alloy || 'manuell', name: 'Legierungswerte der Auslegung', fields: f }; out.sources.alloy = 'Auslegung (Legierungswerte)'; }
    }
    if (p.geometry && Array.isArray(p.geometry.files)) {
      var A = 0;
      p.geometry.files.forEach(function (f) { var a = Number(f && f.area); if (isFinite(a) && a > 0) A += a; });
      if (A > 0) { out.Acav = Math.round(A * 1e-6 * 1e4) / 1e4; out.sources.Acav = 'Sprengflächenanalyse (Netzoberfläche aller STL)'; }
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
    p = p || current() || {};
    return 'DieLogic_' + (p.name || 'Projekt').replace(/[^\wäöüÄÖÜß.-]+/g, '_').slice(0, 60) + '.json';
  }

  var api = {
    STORE_KEY: STORE_KEY, SECTIONS: SECTIONS, EVENT: EVENT, SCHEMA: SCHEMA,
    init: init, list: list, current: current, get: get, select: select,
    create: create, update: update, duplicate: duplicate, remove: remove, put: put, markSaved: markSaved,
    bindAccount: bindAccount, clearAll: clearAll, storageOk: storageOk,
    getSection: getSection, setSection: setSection, mergeDesign: mergeDesign,
    sectionsOf: sectionsOf, derived: derived,
    exportJSON: exportJSON, importJSON: importJSON, fileName: fileName,
    _reset: function () { store = null; storage = null; }
  };
  root.__PROJECT__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
