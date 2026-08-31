/* DieLogic – web/shared/projectbar.js
   Projektleiste auf allen Werkzeugseiten: zeigt das aktuelle Projekt,
   wechselt zwischen Projekten, legt neue an, bearbeitet Name/Beschreibung.
   Die Datenbank ist die Quelle: ohne Anmeldung leitet die Leiste zur
   Konto-Seite um; jede Änderung wird (entprellt) als Arbeitsstand zum
   Server synchronisiert, fremde Stände werden hereingeholt. „Revision"
   legt einen benannten Schnappschuss an. Alles Weitere (Export/Import,
   Kopie, Archivieren, Zurücksetzen, Verlauf, Mitglieder) liegt gesammelt
   auf der Konto-Seite (/konto/).

   Einbindung (nach project.js):
     <script src="/shared/projectbar.js" data-base=".."></script>
   Die Leiste sitzt auf allen Seiten gleich: direkt unter der Site-Navigation,
   feste Höhe 44px (das Dashboard rechnet seine Kopfzeile damit, css/site.css).
   Selbstversorgend: Styles werden mit injiziert. */
(function () {
  'use strict';

  var C = window.__PALETTE__;   // shared/palette.js — vor nav.js geladen
  var P = window.__PROJECT__;
  if (!P) throw new Error('shared/project.js muss vor projectbar.js geladen sein.');

  var script = document.currentScript;
  var base = (script && script.dataset.base ? script.dataset.base : '').replace(/\/+$/, '');
  var KONTO = base + '/konto/';

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
.dl-pb{display:flex;align-items:center;gap:.5rem;flex-wrap:nowrap;min-height:44px;box-sizing:border-box;padding:.3rem 2rem;overflow:hidden;background:' + C.surface + ';border-bottom:1px solid ' + C.borderLight + ';font:13px/1.4 -apple-system,"Inter",BlinkMacSystemFont,"Segoe UI",sans-serif;color:' + C.dark + ';position:relative;z-index:50}\
.dl-pb-label{font-weight:700;color:' + C.muted + ';font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;margin-right:.2rem}\
.dl-pb select{font:inherit;font-weight:600;padding:.3rem 1.6rem .3rem .5rem;border:1px solid ' + C.border + ';border-radius:7px;background:' + C.surface2 + ';color:' + C.dark + ';width:16rem;max-width:40vw;flex:0 0 auto}\
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
@media (max-width:1100px){.dl-pb-desc{display:none}.dl-pb{padding:.3rem 1rem}}';

  var syncState = { status: 'idle', at: null, error: null }; // idle | saving | ok | error
  /* Projekte, deren Autosave der Server mit 409 abgelehnt hat: dort liegt ein
     fremder, neuerer Stand. Sie werden nicht weiter gepusht — der Anwender
     entscheidet, ob er den Serverstand lädt. */
  var conflicts = {};

  function render() {
    var cur = P.current();
    if (!cur) return '<span class="dl-pb-label">Projekt</span><span class="dl-pb-status">' + (session ? 'wird angelegt …' : '—') + '</span>';
    var opts = P.list().map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === cur.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');

    var cloud = '';
    if (session) {
      var h = statusHTML();
      cloud = '<span class="' + h.cls + '" id="dl-pb-status" title="Die Datenbank ist der Stand der Wahrheit — Änderungen werden automatisch übertragen.">' + esc(h.text) + '</span>'
        + (h.conflict ? '<button class="dl-pb-btn" id="dl-pb-conflict" title="Den lokalen Stand verwerfen und den Stand vom Server laden">Serverstand laden</button>' : '')
        + '<button class="dl-pb-btn primary" id="dl-pb-save" title="Benannten Schnappschuss (Revision) des aktuellen Stands anlegen">⎘ Revision</button>';
    }

    return '<span class="dl-pb-label">Projekt</span>'
      + '<select id="dl-pb-select" title="Projekt wechseln">' + opts + '</select>'
      + '<button class="dl-pb-btn" id="dl-pb-edit" title="Name, Beschreibung, Kunde, Teilenummer">✎</button>'
      + '<span class="dl-pb-desc" title="' + esc(cur.description) + '">' + esc(cur.description) + '</span>'
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
    seen = sectionSnapshot();
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    bar = document.createElement('div');
    bar.className = 'dl-pb';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Projekt');
    var nav = document.querySelector('.dl-nav');
    if (nav) nav.insertAdjacentElement('afterend', bar);
    else document.body.insertAdjacentElement('afterbegin', bar);
    document.body.insertAdjacentHTML('beforeend', DIALOG);
    refresh();
    wire();
  }

  /* Leiste neu aufbauen — aber nie, solange das Projekt-Select fokussiert
     (= aufgeklappt) ist: innerHTML würde die Liste unter der Maus schließen.
     Dann wird der Neuaufbau bis zum Verlassen des Selects aufgeschoben. */
  var refreshPending = false;
  function refresh() {
    var sel = el('dl-pb-select');
    if (sel && document.activeElement === sel) { refreshPending = true; return; }
    refreshPending = false;
    bar.innerHTML = render();
  }
  function statusHTML() {
    var cur = P.current();
    if (!cur || !session) return null;
    var status, cls = '', conflict = !!conflicts[cur.id];
    if (conflict) { status = 'Konflikt — auf dem Server liegt ein neuerer Stand'; cls = ' dirty'; }
    else if (syncState.status === 'saving' || cur.dirty) { status = 'speichert …'; cls = ' pending'; }
    else if (syncState.status === 'error') { status = 'nicht synchronisiert — ' + syncState.error; cls = ' dirty'; }
    else status = 'gespeichert' + (cur.remote && cur.remote.rev ? ' · Rev ' + cur.remote.rev : '') + (syncState.at ? ' · ' + fmtTime(syncState.at) : '');
    return { text: status, cls: 'dl-pb-status' + cls, conflict: conflict };
  }
  /* Nur den Sync-Status aktualisieren (kein Neuaufbau) — reicht für alle
     Änderungen während der Arbeit; volle refresh() nur bei Projektwechsel. */
  function refreshStatus() {
    var st = el('dl-pb-status'), h = statusHTML();
    if (!st || !h) { refresh(); return; }
    if (!!h.conflict !== !!el('dl-pb-conflict')) { refresh(); return; }
    st.textContent = h.text;
    st.className = h.cls;
  }

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
        case 'dl-pb-conflict':
          if (!window.confirm('Der lokale Stand dieses Projekts wird verworfen und durch den Stand vom Server ersetzt.\n\nVorher sichern? Auf /konto/ liegen Export und „Als Kopie öffnen".')) break;
          loadServerState(cur).catch(function (err) { alert('Serverstand konnte nicht geladen werden: ' + err.message); });
          break;
      }
    });

    window.addEventListener(P.EVENT, function (e) {
      var type = e.detail && e.detail.type;
      if (!busy) { if (type === 'section' || type === 'saved') refreshStatus(); else refresh(); }
      /* Nur echte lokale Änderungen anstoßen. 'saved' kommt aus markSaved()
         unmittelbar nach jedem erfolgreichen Push — es hier mitzunehmen hieße:
         pushen, weil gerade gepusht wurde (Endlosschleife). */
      if (session && e.detail && e.detail.id && LOCAL_CHANGE.indexOf(type) >= 0) scheduleSync(e.detail.id);
      /* 'external' = ein anderer Tab hat geschrieben. Weichen die Abschnitte
         von dem ab, worauf diese Seite aufgebaut ist, hilft nur ein Neuaufbau —
         sonst schiebt der nächste Tastendruck den alten Stand zurück. */
      if (type === 'external') { if (sectionSnapshot() !== seen) location.reload(); }
      else seen = sectionSnapshot();
    });
    /* Aufgeschobenen Neuaufbau nachholen, sobald das Select verlassen wird */
    bar.addEventListener('focusout', function (e) {
      if (e.target && e.target.id === 'dl-pb-select' && refreshPending) setTimeout(refresh, 0);
    });
    window.addEventListener('pagehide', function () { flushSync(true); });
  }

  /* ── Server: Sitzung, Synchronisation, Revisionen ─────────── */

  function metaOf(p) { return { name: p.name, description: p.description, customer: p.customer, part_no: p.partNo }; }

  /* Fingerabdruck der Werkzeug-Abschnitte des aktuellen Projekts — die Daten,
     auf denen der Seitenzustand aufsetzt. Ändert er sich, ohne dass diese Seite
     ihn geändert hat, ist der Zustand im Arbeitsspeicher veraltet. */
  function sectionSnapshot() {
    var cur = P.current();
    return cur ? cur.id + '|' + JSON.stringify(P.sectionsOf(cur)) : '';
  }
  var seen = null;

  /* Einen lokalen Stand zum Server bringen: unbekannt → anlegen,
     bekannt → Arbeitsstand (+ Stammdaten) aktualisieren. keepalive für
     den letzten Versuch beim Verlassen der Seite. */
  async function push(p, keepalive) {
    var stamp = p.updatedAt;
    var opts = keepalive ? { keepalive: true } : {};
    if (p.remote) {
      await api('PUT', '/api/projects/' + p.remote.id, metaOf(p), opts);
      /* base_draft_at ist der Stand, auf dem dieser Push aufsetzt. Hat der
         Server inzwischen einen anderen, antwortet er 409 statt zu überschreiben. */
      var d = await api('PUT', '/api/projects/' + p.remote.id + '/draft',
        { data: P.sectionsOf(p), base_draft_at: p.remote.draftAt || null }, opts);
      var at = d && d.draft_at;
      if (P.get(p.id) && P.get(p.id).updatedAt === stamp) P.markSaved(p.id, { id: p.remote.id, rev: p.remote.rev, draftAt: at, savedAt: d && d.updated_at });
      else { var r = P.get(p.id); if (r && r.remote && at) r.remote.draftAt = at; }
    } else {
      /* Die stabile lokale id als Idempotenz-Schlüssel: geht die Antwort
         verloren (Tab schließt, Reload), legt der nächste Versuch kein
         zweites Projekt an, sondern bekommt dasselbe zurück. */
      var res = await api('POST', '/api/projects', Object.assign({ id: p.id, data: P.sectionsOf(p) }, metaOf(p)), opts);
      if (P.get(p.id) && P.get(p.id).updatedAt === stamp) P.markSaved(p.id, { id: res.id, rev: res.rev, draftAt: res.draft_at, savedAt: res.updated_at });
      else { var q = P.get(p.id); if (q) { q.remote = { id: res.id, rev: res.rev, savedAt: res.updated_at, draftAt: res.draft_at || null }; P.put(q, q.id === P.current().id); } }
    }
  }

  var LOCAL_CHANGE = ['create', 'update', 'section', 'put', 'remove'];
  var timer = null, pending = {};
  function scheduleSync(id) {
    pending[id] = true;
    clearTimeout(timer);
    timer = setTimeout(function () { flushSync(false); }, 1200);
    if (syncState.status !== 'saving') { syncState.status = 'saving'; refreshStatus(); }
  }

  /* Ein Lauf zur Zeit. Ein zweiter, paralleler Lauf würde dieselben Projekte
     erneut aufnehmen, weil p.remote erst nach der Antwort des ersten gesetzt
     ist — er wird hinter dem laufenden eingereiht. */
  var inflight = null, rerun = false;
  function flushSync(keepalive) {
    if (inflight) { rerun = true; return inflight; }
    inflight = doFlush(keepalive).then(function () {
      inflight = null;
      if (rerun) { rerun = false; return flushSync(false); }
    }, function (err) { inflight = null; throw err; });
    return inflight;
  }

  async function doFlush(keepalive) {
    clearTimeout(timer);
    pending = {};
    /* pending stößt den Lauf an — es ist kein Grund, einen sauberen Stand zu
       pushen. Zu senden ist, was lokal geändert oder noch nie angelegt wurde;
       Projekte mit offenem Konflikt bleiben liegen. */
    var dirty = P.list().filter(function (p) { return (p.dirty || !p.remote) && !conflicts[p.id]; });
    if (!session || !dirty.length) { if (syncState.status === 'saving') { syncState.status = 'ok'; refreshStatus(); } return; }
    busy = true;
    syncState.status = 'saving';
    var failed = null, gotConflict = false;
    try {
      for (var i = 0; i < dirty.length; i++) {
        try { await push(dirty[i], keepalive); }
        catch (err) {
          /* 409: fremder, neuerer Stand. Ein Wiederholungsversuch würde ihn nur
             erneut abgelehnt bekommen — das Projekt bleibt liegen und wird
             gemeldet. Alle anderen Projekte werden trotzdem übertragen. */
          if (err.status === 409) { conflicts[dirty[i].id] = true; gotConflict = true; continue; }
          failed = err; pending[dirty[i].id] = true;
          if (err.status === 401) { session = null; break; }
        }
      }
    } finally { busy = false; }
    if (failed) {
      syncState = { status: 'error', at: syncState.at, error: failed.message };
      timer = setTimeout(function () { flushSync(false); }, 8000);   // später erneut
    } else syncState = { status: 'ok', at: new Date().toISOString(), error: null };
    if (gotConflict) refresh(); else refreshStatus();
  }

  /* Konflikt auflösen: den lokalen Stand verwerfen und den Serverstand laden. */
  async function loadServerState(cur) {
    if (!cur.remote) return;
    var full = await api('GET', '/api/projects/' + cur.remote.id);
    delete conflicts[cur.id];
    P.put(Object.assign({ id: cur.id, name: full.name, description: full.description,
      customer: full.customer, partNo: full.part_no, createdAt: full.created_at, updatedAt: full.updated_at,
      remote: { id: full.id, rev: full.rev, savedAt: full.updated_at, draftAt: full.draft_at }, dirty: false },
      full.data || {}), true);
    location.reload();
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
    refreshStatus();
  }

  /* Server → Browser: neue Projekte übernehmen, bekannte ersetzen, wenn
     der Server neuer ist und hier nichts Unübertragenes liegt. Ändert sich
     das aktuelle Projekt, einmal neu laden. */
  async function pull() {
    var remote = await api('GET', '/api/projects');
    var byRemote = {};
    P.list().forEach(function (p) { if (p.remote) byRemote[p.remote.id] = p; });
    var curId = P.current() ? P.current().id : null, curChanged = false;
    var before = sectionSnapshot();
    for (var i = 0; i < remote.length; i++) {
      var r = remote[i], have = byRemote[r.id];
      if (have && (have.dirty || (have.remote.savedAt && have.remote.savedAt >= r.updated_at))) continue;
      var full = await api('GET', '/api/projects/' + r.id);
      var doc = Object.assign({ id: have ? have.id : undefined, name: full.name, description: full.description,
        customer: full.customer, partNo: full.part_no, createdAt: full.created_at, updatedAt: full.updated_at,
        remote: { id: full.id, rev: full.rev, savedAt: full.updated_at, draftAt: full.draft_at }, dirty: false }, full.data || {});
      var put = P.put(doc, false);
      if (have && have.id === curId && put) curChanged = true;
    }
    /* Organisation ohne Projekt: das erste auf dem Server anlegen. */
    if (!remote.length && !P.list().length) {
      var res = await api('POST', '/api/projects', { name: 'Erstes Projekt', description: 'Angelegt beim ersten Öffnen der Werkzeuge.', data: {} });
      P.put({ name: res.name, description: res.description, remote: { id: res.id, rev: res.rev, savedAt: res.updated_at, draftAt: res.draft_at }, dirty: false }, true);
      curChanged = true;
    }
    if (!P.current() && P.list().length) { P.select(P.list()[0].id); curChanged = true; }
    /* Der localStorage trägt jetzt den fremden Stand — die laufende Seite hält
       aber noch ihre Kopie im Speicher, und ein Tastendruck würde sie zurück
       auf den Server schieben. Deshalb neu aufbauen, sobald sich die Abschnitte
       des aktuellen Projekts wirklich geändert haben. Der Inhaltsvergleich
       schließt einen Reload-Kreisel aus (danach ist lokal == Server) und
       ersetzt die alte Sperre, die genau einmal je Sitzung griff. */
    if (curChanged && sectionSnapshot() !== before) { location.reload(); return; }
    refresh();
  }

  async function initSession() {
    try {
      session = await api('GET', '/api/auth/me');
      /* Vor jedem Lesen und jedem Push: gehört der lokale Cache diesem Konto?
         Ein fremder Bestand wird verworfen, statt angezeigt und hochgeladen. */
      if (session && session.org && P.bindAccount(session.org.id)) { location.reload(); return; }
    } catch (err) {
      session = null;
      if (err.status === 401) {
        /* Abgelaufene oder fremde Sitzung: nichts von diesem Konto bleibt auf
           dem Gerät liegen (dasselbe Muster wie orgpresets.js). */
        P.clearAll();
        /* Die Werkzeuge arbeiten nur mit Konto — die Datenbank ist die Quelle. */
        location.replace(KONTO + '?next=' + encodeURIComponent(location.pathname + location.search));
        return;
      }
      bar.insertAdjacentHTML('beforeend', '<span class="dl-pb-status dirty">Backend nicht erreichbar — Änderungen bleiben nur in diesem Browser.</span>');
      return;
    }
    refresh();
    if (session) {
      /* Erst holen, dann senden. Umgekehrt schiebt schon das bloße Öffnen einer
         Werkzeugseite ihren Default-Abschnitt über den Stand einer Kollegin. */
      try { await pull(); await flushSync(false); }
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
