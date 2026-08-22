/* DieLogic – web/shared/orgpresets.js
   Stammdaten der Organisation über die Beispiel-Presets legen: Maschinen,
   Legierungen, Bauteiltypen (window.__MACHINES__/__ALLOYS__/__PARTS__) und
   Kosten & Sätze (window.__KOSTEN__.defaults). Nach den shared/examples/*.js laden.

   Synchron: der zuletzt vom Server geholte Stand liegt im localStorage und
   wird sofort angewendet — die ES-Module des Dashboards lesen die Globals
   beim Import. Asynchron: /api/org/settings neu holen; weicht der Stand ab,
   Cache aktualisieren und die Seite einmal neu laden. Ohne Konto/Backend
   bleiben die Beispielwerte.
   Klassisches Script, CommonJS-Export der reinen Funktionen für Tests. */
(function (root) {
  'use strict';

  var CACHE_KEY = 'dielogic-org-settings-v1';
  var TARGETS = {
    machines: ['__MACHINES__', 'machines'],
    alloys:   ['__ALLOYS__', 'alloys'],
    parts:    ['__PARTS__', 'parts']
  };

  /* Einstellungen {key: {data}} auf die Globals anwenden. Listen ersetzen
     die Beispiel-Liste (eine Firma hat IHRE Maschinen); Kosten werden über
     die Beispielwerte gemischt (nur gesetzte Schlüssel). Gibt an, was
     angewendet wurde. */
  function apply(settings, globals) {
    var applied = [];
    if (!settings || typeof settings !== 'object') return applied;
    for (var key in TARGETS) {
      var s = settings[key];
      var list = s && Array.isArray(s.data) ? s.data : (Array.isArray(s) ? s : null);
      if (!list || !list.length) continue;
      var g = TARGETS[key][0], lk = TARGETS[key][1];
      globals[g] = globals[g] || {};
      globals[g][lk] = list.map(function (p) { return { id: p.id, name: p.name, fields: Object.assign({}, p.fields) }; });
      globals[g].source = 'org';
      applied.push(key);
    }
    var k = settings.kosten;
    var kd = k && k.data && typeof k.data === 'object' ? k.data : (k && typeof k === 'object' && !('data' in k) ? k : null);
    if (kd && Object.keys(kd).length) {
      globals.__KOSTEN__ = globals.__KOSTEN__ || { defaults: {} };
      globals.__KOSTEN__.defaults = Object.assign({}, globals.__KOSTEN__.defaults, kd);
      globals.__KOSTEN__.source = 'org';
      applied.push('kosten');
    }
    return applied;
  }

  /* Nur die Daten je Schlüssel vergleichen (updated_at ignorieren). */
  function same(a, b) {
    var pick = function (s) {
      var o = {};
      if (s && typeof s === 'object') for (var k in s) o[k] = s[k] && s[k].data !== undefined ? s[k].data : s[k];
      return JSON.stringify(o);
    };
    return pick(a) === pick(b);
  }

  function readCache(storage) {
    try { var raw = storage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  var api = { CACHE_KEY: CACHE_KEY, apply: apply, same: same, readCache: readCache };
  root.__ORG_PRESETS__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ── Browser ── */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var cached = readCache(window.localStorage || { getItem: function () { return null; } });
  apply(cached, window);

  if (location.protocol === 'file:' || typeof fetch !== 'function') return;
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) {
        /* Nicht angemeldet: Cache einer früheren Sitzung verwerfen */
        if (r.status === 401 && cached) { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }
        return null;
      }
      return fetch('/api/org/settings', { credentials: 'same-origin' }).then(function (r2) { return r2.ok ? r2.json() : null; });
    })
    .then(function (settings) {
      if (settings === null) {
        if (cached && !same(cached, null)) { var k0 = 'dl-org-reload'; if (!sessionStorage.getItem(k0)) { sessionStorage.setItem(k0, '1'); location.reload(); } }
        return;
      }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch (e) {}
      if (!same(settings, cached)) {
        var key = 'dl-org-reload';
        if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); location.reload(); return; }
      }
      sessionStorage.removeItem('dl-org-reload');
    })
    .catch(function () {});
})(typeof window !== 'undefined' ? window : globalThis);
