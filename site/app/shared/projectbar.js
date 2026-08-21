/* DieLogic – app/shared/projectbar.js
   Projektleiste auf allen Werkzeugseiten: zeigt das aktuelle Projekt,
   wechselt zwischen Projekten, legt neue an, bearbeitet Name/Beschreibung.
   Die Datenbank ist die Quelle: ohne Anmeldung leitet die Leiste zur
   Konto-Seite um; jede Änderung wird (entprellt) als Arbeitsstand zum
   Server synchronisiert, fremde Stände werden hereingeholt. „Revision"
   legt einen benannten Schnappschuss an. Alles Weitere (Export/Import,
   Kopie, Archivieren, Zurücksetzen, Verlauf, Mitglieder) liegt gesammelt
   auf der Konto-Seite (app/konto.html).

   Einbindung (nach project.js):
     <script src="../app/shared/projectbar.js" data-base=".."></script>
   Ohne data-mount entsteht eine volle Leiste direkt unter der Site-Navigation;
   mit data-mount="<id>" eine kompakte Variante in diesem Element (Dashboard-
   Kopfzeile). Selbstversorgend: Styles werden mit injiziert. */
(function () {
  'use strict';

  var C = window.__PALETTE__;   // app/config/palette.js — vor nav.js geladen
  var P = window.__PROJECT__;
  if (!P) throw new Error('shared/project.js muss vor projectbar.js geladen sein.');

  var script = document.currentScript;
  var base = (script && script.dataset.base ? script.dataset.base : '.').replace(/\/+$/, '');
  var mountId = script && script.dataset.mount;
  var compact = !!mountId;
  var KONTO = base + '/app/konto.html';

  var session = null;      // { user, org }
  var busy = false;

  /* ── Hilfen ───────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  async function api(method, path, body, extra) {
    var r = await fetch(path, Object.assign({
      method: method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }, extra || {}));
    if (r.status === 204) return null;
    var data = null;
    try { data = await r.json(); } catch (e) { /* keine JSON-Antwort */ }
    if (!r.ok) {
      var msg = data && typeof data.detail === 'string' ? data.detail : 'HTTP ' + r.status;
      var err = new Error(msg); err.status = r.status; throw err;
    }
    return data;
  }

  /* ── Markup ───────────────────────────────────────────────── */

  var CSS = '\
.dl-pb{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;padding:.4rem 2rem;background:' + C.surface + ';border-bottom:1px solid ' + C.borderLight + ';font:13px/1.4 -apple-system,"Inter",BlinkMacSystemFont,"Segoe UI",sans-serif;color:' + C.dark + ';position:relative;z-index:50}\
.dl-pb-label{font-weight:700;color:' + C.muted + ';font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;margin-right:.2rem}\
.dl-pb select{font:inherit;font-weight:600;padding:.3rem 1.6rem .3rem .5rem;border:1px solid ' + C.border + ';border-radius:7px;background:' + C.surface2 + ';color:' + C.dark + ';max-width:320px}\
.dl-pb-desc{color:' + C.muted + ';max-width:34rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
.dl-pb-btn{font:inherit;font-size:12px;font-weight:600;padding:.3rem .6rem;border:1px solid ' + C.border + ';border-radius:7px;background:' + C.surface + ';color:' + C.dark + ';cursor:pointer;text-decoration:none;white-space:nowrap}\
.dl-pb-btn:hover{border-color:' + C.primary + ';color:' + C.primary + '}\
.dl-pb-btn.primary{background:' + C.primary + ';border-color:' + C.primary + ';color:' + C.surface + '}\
.dl-pb-btn.primary:hover{background:' + C.primary2 + '}\
.dl-pb-btn:disabled{opacity:.5;cursor:default}\
.dl-pb-sp{flex:1}\
.dl-pb-status{color:' + C.muted + ';font-size:12px;white-space:nowrap}\
.dl-pb-status.dirty{color:' + C.warn + ';font-weight:600}\
.dl-pb-status.pending{color:' + C.warnText + '}\
.dl-pb-user{color:' + C.muted + ';font-size:12px;white-space:nowrap}\
.dl-pb-user a{color:' + C.primary + ';text-decoration:none;font-weight:600}\
.dl-pb-dialog{border:0;border-radius:12px;padding:0;max-width:32rem;width:calc(100% - 2rem);box-shadow:0 18px 50px rgba(0,39,51,.25);font:14px/1.45 -apple-system,"Inter",BlinkMacSystemFont,"Segoe UI",sans-serif;color:' + C.dark + '}\
.dl-pb-dialog::backdrop{background:rgba(0,39,51,.45)}\
.dl-pb-dialog form{padding:1.2rem 1.4rem}\
.dl-pb-dialog h3{margin:0 0 .8rem;font-size:1.05rem}\
.dl-pb-dialog label{display:block;font-size:12px;font-weight:600;color:' + C.muted + ';margin:.6rem 0 .2rem}\
.dl-pb-dialog input,.dl-pb-dialog textarea{width:100%;font:inherit;padding:.45rem .6rem;border:1px solid ' + C.border + ';border-radius:7px;box-sizing:border-box}\
.dl-pb-dialog textarea{min-height:4.5rem;resize:vertical}\
.dl-pb-row{display:flex;gap:.6rem}.dl-pb-row>*{flex:1}\
.dl-pb-actions{display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem}\
.dl-pb-err{color:' + C.warn + ';font-size:12px;margin-top:.5rem;min-height:1em}\
/* kompakt (Dashboard-Kopf, dunkler Grund) */\
.dl-pb.compact{padding:0;background:none;border:0;color:' + C.surface + ';gap:.4rem;flex-wrap:nowrap}\
.dl-pb.compact .dl-pb-label{color:rgba(255,255,255,.75)}\
.dl-pb.compact select{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.45);color:' + C.surface + ';max-width:260px}\
.dl-pb.compact select option{color:' + C.dark + '}\
.dl-pb.compact .dl-pb-btn{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.45);color:' + C.surface + '}\
.dl-pb.compact .dl-pb-btn:hover{background:rgba(255,255,255,.26)}\
.dl-pb.compact .dl-pb-btn.primary{background:' + C.primaryLight + ';border-color:' + C.primaryLight + ';color:' + C.dark + '}\
.dl-pb.compact .dl-pb-status{color:rgba(255,255,255,.8)}\
.dl-pb.compact .dl-pb-status.dirty{color:' + C.warnSoft + '}\
.dl-pb.compact .dl-pb-status.pending{color:' + C.gold + '}\
.dl-pb.compact .dl-pb-user{color:rgba(255,255,255,.8)}.dl-pb.compact .dl-pb-user a{color:' + C.surface + '}\
@media (max-width:900px){.dl-pb-desc{display:none}.dl-pb{padding:.4rem 1rem}}';

  var syncState = { status: 'idle', at: null, error: null }; // idle | saving | ok | error

  function render() {
    var cur = P.current();
    if (!cur) return '<span class="dl-pb-label">Projekt</span><span class="dl-pb-status">' + (session ? 'wird angelegt …' : '—') + '</span>';
    var opts = P.list().map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === cur.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');

    var cloud = '';
    if (session) {
      var status, cls = '';
      if (syncState.status === 'saving' || cur.dirty) { status = 'speichert …'; cls = ' pending'; }
      else if (syncState.status === 'error') { status = 'nicht synchronisiert — ' + syncState.error; cls = ' dirty'; }
      else status = 'gespeichert' + (cur.remote && cur.remote.rev ? ' · Rev ' + cur.remote.rev : '') + (syncState.at ? ' · ' + fmtTime(syncState.at) : '');
      cloud = '<span class="dl-pb-status' + cls + '" id="dl-pb-status" title="Die Datenbank ist der Stand der Wahrheit — Änderungen werden automatisch übertragen.">' + esc(status) + '</span>'
        + '<button class="dl-pb-btn primary" id="dl-pb-save" title="Benannten Schnappschuss (Revision) des aktuellen Stands anlegen">⎘ Revision</button>';
    }

    return '<span class="dl-pb-label">Projekt</span>'
      + '<select id="dl-pb-select" title="Projekt wechseln">' + opts + '</select>'
      + '<button class="dl-pb-btn" id="dl-pb-edit" title="Name, Beschreibung, Kunde, Teilenummer">✎</button>'
      + (compact ? '' : '<span class="dl-pb-desc" title="' + esc(cur.description) + '">' + esc(cur.description) + '</span>')
      + '<span class="dl-pb-sp"></span>'
      + '<button class="dl-pb-btn" id="dl-pb-new">+ Neu</button>'
      + '<a class="dl-pb-btn" href="' + KONTO + '" title="Alle Projekte: Verlauf, Export, Import, Kopie, Konto">Projekte …</a>'
      + cloud;
  }

  var DIALOG = '<dialog class="dl-pb-dialog" id="dl-pb-dialog"><form method="dialog" id="dl-pb-form">'
    + '<h3 id="dl-pb-dlg-title">Projekt</h3>'
    + '<label for="dl-pb-f-name">Projektname</label><input id="dl-pb-f-name" required maxlength="200" placeholder="z. B. DieCastPartA">'
    + '<label for="dl-pb-f-desc">Beschreibung</label><textarea id="dl-pb-f-desc" maxlength="5000" placeholder="Bauteil, Legierung, Stückzahl, Stand …"></textarea>'
    + '<div class="dl-pb-row"><div><label for="dl-pb-f-cust">Kunde</label><input id="dl-pb-f-cust" maxlength="200"></div>'
    + '<div><label for="dl-pb-f-pno">Teilenummer</label><input id="dl-pb-f-pno" maxlength="100"></div></div>'
    + '<div class="dl-pb-err" id="dl-pb-dlg-err"></div>'
    + '<div class="dl-pb-actions"><button type="button" class="dl-pb-btn" id="dl-pb-dlg-cancel">Abbrechen</button>'
    + '<button type="submit" class="dl-pb-btn primary" id="dl-pb-dlg-ok">Übernehmen</button></div>'
    + '</form></dialog>'
    + '<dialog class="dl-pb-dialog" id="dl-pb-savedlg"><form method="dialog">'
    + '<h3>Revision anlegen</h3>'
    + '<label for="dl-pb-f-note">Notiz (optional)</label><input id="dl-pb-f-note" maxlength="500" placeholder="z. B. Anschnitt auf 2.100 mm² vergrößert">'
    + '<div class="dl-pb-err" id="dl-pb-save-err"></div>'
    + '<div class="dl-pb-actions"><button type="button" class="dl-pb-btn" id="dl-pb-save-cancel">Abbrechen</button>'
    + '<button type="submit" class="dl-pb-btn primary">Revision anlegen</button></div>'
    + '</form></dialog>';

  var bar;

  function mount() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    bar = document.createElement('div');
    bar.className = 'dl-pb' + (compact ? ' compact' : '');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Projekt');
    var host = mountId ? el(mountId) : null;
    if (host) host.appendChild(bar);
    else {
      var nav = document.querySelector('.dl-nav');
      if (nav) nav.insertAdjacentElement('afterend', bar);
      else document.body.insertAdjacentElement('afterbegin', bar);
    }
    document.body.insertAdjacentHTML('beforeend', DIALOG);
    refresh();
    wire();
  }

  function refresh() { bar.innerHTML = render(); }

  /* ── Dialoge ──────────────────────────────────────────────── */

  function openMeta(title, p, onOk) {
    el('dl-pb-dlg-title').textContent = title;
    el('dl-pb-f-name').value = p ? p.name : '';
    el('dl-pb-f-desc').value = p ? p.description : '';
    el('dl-pb-f-cust').value = p ? p.customer : '';
    el('dl-pb-f-pno').value = p ? p.partNo : '';
    el('dl-pb-dlg-err').textContent = '';
    var dlg = el('dl-pb-dialog');
    var form = el('dl-pb-form');
    form.onsubmit = function (e) {
      e.preventDefault();
      var name = el('dl-pb-f-name').value.trim();
      if (!name) { el('dl-pb-dlg-err').textContent = 'Bitte einen Projektnamen angeben.'; return; }
      onOk({ name: name, description: el('dl-pb-f-desc').value.trim(),
        customer: el('dl-pb-f-cust').value.trim(), partNo: el('dl-pb-f-pno').value.trim() });
      dlg.close();
    };
    el('dl-pb-dlg-cancel').onclick = function () { dlg.close(); };
    dlg.showModal();
    el('dl-pb-f-name').focus();
  }

  /* ── Ereignisse ───────────────────────────────────────────── */

  function wire() {
    bar.addEventListener('change', function (e) {
      if (e.target.id === 'dl-pb-select') {
        if (P.select(e.target.value)) location.reload();
      }
    });

    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button, a');
      if (!b) return;
      var cur = P.current();
      if (!cur && b.id !== 'dl-pb-new') return;
      switch (b.id) {
        case 'dl-pb-edit':
          openMeta('Projekt bearbeiten', cur, function (meta) { P.update(cur.id, meta); refresh(); });
          break;
        case 'dl-pb-new':
          openMeta('Neues Projekt', null, function (meta) { P.create(meta); location.reload(); });
          break;
        case 'dl-pb-save':
          openSave(cur);
          break;
      }
    });

    window.addEventListener(P.EVENT, function (e) {
      if (!busy) refresh();
      if (session && e.detail && e.detail.id) scheduleSync(e.detail.id);
    });
    window.addEventListener('pagehide', function () { flushSync(true); });
  }

  /* ── Server: Sitzung, Synchronisation, Revisionen ─────────── */

  function metaOf(p) { return { name: p.name, description: p.description, customer: p.customer, part_no: p.partNo }; }

  /* Einen lokalen Stand zum Server bringen: unbekannt → anlegen,
     bekannt → Arbeitsstand (+ Stammdaten) aktualisieren. keepalive für
     den letzten Versuch beim Verlassen der Seite. */
  async function push(p, keepalive) {
    var stamp = p.updatedAt;
    var opts = keepalive ? { keepalive: true } : {};
    if (p.remote) {
      await api('PUT', '/api/projects/' + p.remote.id, metaOf(p), opts);
      await api('PUT', '/api/projects/' + p.remote.id + '/draft', { data: P.sectionsOf(p) }, opts);
      if (P.get(p.id) && P.get(p.id).updatedAt === stamp) P.markSaved(p.id, { id: p.remote.id, rev: p.remote.rev });
    } else {
      var res = await api('POST', '/api/projects', Object.assign({ data: P.sectionsOf(p) }, metaOf(p)), opts);
      if (P.get(p.id) && P.get(p.id).updatedAt === stamp) P.markSaved(p.id, { id: res.id, rev: res.rev });
      else { var q = P.get(p.id); if (q) { q.remote = { id: res.id, rev: res.rev, savedAt: new Date().toISOString() }; P.put(q, q.id === P.current().id); } }
    }
  }

  var timer = null, pending = {};
  function scheduleSync(id) {
    pending[id] = true;
    clearTimeout(timer);
    timer = setTimeout(function () { flushSync(false); }, 1200);
    if (syncState.status !== 'saving') { syncState.status = 'saving'; refresh(); }
  }

  async function flushSync(keepalive) {
    clearTimeout(timer);
    var ids = Object.keys(pending); pending = {};
    var dirty = P.list().filter(function (p) { return p.dirty || ids.indexOf(p.id) >= 0 || !p.remote; });
    if (!session || !dirty.length) { if (syncState.status === 'saving') { syncState.status = 'ok'; refresh(); } return; }
    busy = true;
    syncState.status = 'saving';
    try {
      for (var i = 0; i < dirty.length; i++) await push(dirty[i], keepalive);
      syncState = { status: 'ok', at: new Date().toISOString(), error: null };
    } catch (err) {
      syncState = { status: 'error', at: syncState.at, error: err.message };
      dirty.forEach(function (p) { pending[p.id] = true; });
      timer = setTimeout(function () { flushSync(false); }, 8000);   // später erneut
    } finally { busy = false; }
    refresh();
  }

  function openSave(cur) {
    var dlg = el('dl-pb-savedlg');
    el('dl-pb-f-note').value = '';
    el('dl-pb-save-err').textContent = '';
    dlg.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      saveRevision(cur, el('dl-pb-f-note').value.trim()).then(function () { dlg.close(); },
        function (err) { el('dl-pb-save-err').textContent = 'Revision fehlgeschlagen: ' + err.message; });
    };
    el('dl-pb-save-cancel').onclick = function () { dlg.close(); };
    dlg.showModal();
  }

  async function saveRevision(cur, note) {
    await flushSync(false);
    var p = P.get(cur.id);
    if (!p.remote) throw new Error('Projekt ist noch nicht synchronisiert.');
    busy = true;
    try {
      var res = await api('POST', '/api/projects/' + p.remote.id + '/revisions', { data: P.sectionsOf(p), note: note });
      P.markSaved(p.id, { id: p.remote.id, rev: res.rev });
      syncState = { status: 'ok', at: new Date().toISOString(), error: null };
    } finally { busy = false; }
    refresh();
  }

  /* Server → Browser: neue Projekte übernehmen, bekannte ersetzen, wenn
     der Server neuer ist und hier nichts Unübertragenes liegt. Ändert sich
     das aktuelle Projekt, einmal neu laden. */
  async function pull() {
    var remote = await api('GET', '/api/projects');
    var byRemote = {};
    P.list().forEach(function (p) { if (p.remote) byRemote[p.remote.id] = p; });
    var curId = P.current() ? P.current().id : null, curChanged = false;
    for (var i = 0; i < remote.length; i++) {
      var r = remote[i], have = byRemote[r.id];
      if (have && (have.dirty || (have.remote.savedAt && have.remote.savedAt >= r.updated_at))) continue;
      var full = await api('GET', '/api/projects/' + r.id);
      var doc = Object.assign({ id: have ? have.id : undefined, name: full.name, description: full.description,
        customer: full.customer, partNo: full.part_no, createdAt: full.created_at, updatedAt: full.updated_at,
        remote: { id: full.id, rev: full.rev, savedAt: full.updated_at }, dirty: false }, full.data || {});
      var put = P.put(doc, false);
      if (have && have.id === curId && put) curChanged = true;
    }
    /* Organisation ohne Projekt: das erste auf dem Server anlegen. */
    if (!remote.length && !P.list().length) {
      var res = await api('POST', '/api/projects', { name: 'Erstes Projekt', description: 'Angelegt beim ersten Öffnen der Werkzeuge.', data: {} });
      P.put({ name: res.name, description: res.description, remote: { id: res.id, rev: res.rev, savedAt: res.updated_at }, dirty: false }, true);
      curChanged = true;
    }
    if (!P.current() && P.list().length) { P.select(P.list()[0].id); curChanged = true; }
    if (curChanged) {
      var key = 'dl-pb-reloaded-' + curId;
      if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); location.reload(); return; }
    }
    refresh();
  }

  async function initSession() {
    try {
      session = await api('GET', '/api/auth/me');
    } catch (err) {
      session = null;
      if (err.status === 401) {
        /* Die Werkzeuge arbeiten nur mit Konto — die Datenbank ist die Quelle. */
        location.replace(KONTO + '?next=' + encodeURIComponent(location.pathname + location.search));
        return;
      }
      bar.insertAdjacentHTML('beforeend', '<span class="dl-pb-status dirty">Backend nicht erreichbar — Änderungen bleiben nur in diesem Browser.</span>');
      return;
    }
    refresh();
    if (session) {
      try { await flushSync(false); await pull(); }
      catch (err) { console.warn('Projektabgleich fehlgeschlagen:', err.message); }
    }
  }

  function start() {
    mount();
    initSession();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
