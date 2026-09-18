/* Verhaltenstest der Synchronisation (web/shared/projectbar.js).

   Diese Datei trug fünf der zwölf CRITICAL- und vier der HIGH-Befunde des
   Code-Reviews — und hatte keinen einzigen Test. Hier läuft sie gegen ein
   winziges DOM (dieselbe Attrappe wie die Viewer-Tests) und einen
   Papier-Server, dessen Antworten der Test vorgibt: so lässt sich prüfen,
   was ohne Browser sonst niemand prüft — welche Requests in welcher
   Reihenfolge rausgehen und was die Leiste dabei anzeigt.

     node --test tests/web/projectbar.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildDocument } from './3d-studio/stubs/dom.mjs';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

/* ── Uhr: die Entprellung (1,2 s) und der Wiederholungstakt (8 s) sollen
      nicht in Echtzeit ablaufen. ───────────────────────────────────────── */
const realSetTimeout = globalThis.setTimeout;
let clock = 0, timers = [], timerSeq = 0;
globalThis.setTimeout = (fn, ms) => { timers.push({ id: ++timerSeq, fn, at: clock + (Number(ms) || 0) }); return timerSeq; };
globalThis.clearTimeout = id => { timers = timers.filter(t => t.id !== id); };

const settle = () => new Promise(r => realSetTimeout(r, 0));
async function tick(ms = 0) {
  clock += ms;
  for (let round = 0; round < 40; round++) {
    const due = timers.filter(t => t.at <= clock).sort((a, b) => a.at - b.at);
    timers = timers.filter(t => t.at > clock);
    for (const t of due) t.fn();
    await settle();
    if (!timers.some(t => t.at <= clock)) break;
  }
  for (let i = 0; i < 12; i++) await settle();
}

/* ── Papier-Server ───────────────────────────────────────────────────── */
function makeServer() {
  const srv = {
    projects: {}, log: [], stamp: 100,
    /* Test-Haken: (method, path) → { status } erzwingt eine Antwort. */
    intercept: null,
    calls(re) { return srv.log.filter(l => re.test(l)); }
  };
  const iso = n => '2026-08-31T00:00:' + String(n).padStart(2, '0') + '.000000+00:00';
  const out = p => ({
    id: p.id, name: p.name, description: p.description, customer: p.customer,
    part_no: p.part_no, rev: p.rev, created_at: p.created_at,
    updated_at: p.updated_at, draft_at: p.draft_at
  });

  srv.handle = (method, url, body) => {
    srv.log.push(method + ' ' + url);
    const forced = srv.intercept && srv.intercept(method, url, body);
    if (forced) return forced;

    if (url === '/api/auth/me') {
      return { status: 200, data: { user: { id: 'u1', name: 'Anna', email: 'a@x.de', role: 'admin' }, org: { id: 'org1', slug: 'x', name: 'X' } } };
    }
    if (method === 'GET' && url === '/api/projects') {
      return { status: 200, data: Object.values(srv.projects).filter(p => !p.archived).map(out) };
    }
    if (method === 'POST' && url === '/api/projects') {
      const id = body.id || 'srv' + (++srv.stamp);
      const have = srv.projects[id];
      if (have && have.archived) return { status: 409, data: { detail: 'archiviert' } };
      if (have) return { status: 201, data: out(have) };
      const t = iso(++srv.stamp);
      srv.projects[id] = { id, name: body.name, description: body.description || '', customer: body.customer || '',
        part_no: body.part_no || '', rev: 0, created_at: t, updated_at: t,
        draft_at: body.data ? t : null, data: body.data || {} };
      return { status: 201, data: out(srv.projects[id]) };
    }
    const m = url.match(/^\/api\/projects\/([^/]+)(\/draft)?$/);
    if (m) {
      const p = srv.projects[m[1]];
      if (!p || p.archived) return { status: 404, data: { detail: 'Projekt nicht gefunden.' } };
      if (method === 'GET') return { status: 200, data: Object.assign(out(p), { data: p.data, head: null }) };
      if (m[2]) {
        if (body.base_draft_at != null && p.draft_at != null
            && body.base_draft_at !== p.draft_at
            && JSON.stringify(p.data) !== JSON.stringify(body.data)) {
          return { status: 409, data: { detail: 'Auf dem Server liegt ein neuerer Arbeitsstand.' } };
        }
        p.data = body.data;
        p.draft_at = p.updated_at = iso(++srv.stamp);
        return { status: 200, data: { draft_at: p.draft_at, updated_at: p.updated_at } };
      }
      Object.assign(p, { name: body.name, description: body.description, customer: body.customer, part_no: body.part_no });
      p.updated_at = iso(++srv.stamp);
      return { status: 200, data: out(p) };
    }
    return { status: 404, data: { detail: 'unbekannt' } };
  };
  return srv;
}

/* ── Seite aufbauen und projectbar.js laden ──────────────────────────── */
function boot({ store = null } = {}) {
  const { El } = buildDocument('');
  if (!El.prototype.insertAdjacentElement) {
    El.prototype.insertAdjacentElement = function (pos, el) {
      if (pos === 'afterbegin') this.children.unshift(el); else this.children.push(el);
      el.parentNode = this; return el;
    };
    El.prototype.insertAdjacentHTML = function (pos, html) {
      const tmp = new El('div'); tmp.innerHTML = html;
      for (const c of tmp.children) { c.parentNode = this; this.children.push(c); }
    };
    Object.defineProperty(El.prototype, 'onsubmit', { get() { return this._os; }, set(v) { this._os = v; } });
    El.prototype.showModal = function () {};
    El.prototype.close = function () {};
  }
  const body = new El('body'), head = new El('head');
  const doc = {
    body, head, documentElement: new El('html'), readyState: 'complete',
    activeElement: null, visibilityState: 'visible',
    currentScript: { dataset: { base: '' } },
    createElement: t => new El(t),
    getElementById: id => body.descendants().find(e => e.id === id) || null,
    querySelector: sel => body.descendants().find(e => e.matches(sel)) || null,
    querySelectorAll: sel => body.descendants().filter(e => e.matches(sel)),
    listeners: {},
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    fire(t) { for (const fn of this.listeners[t] || []) fn({ type: t }); }
  };

  const bus = new EventTarget();
  globalThis.window = globalThis;
  globalThis.document = doc;
  globalThis.addEventListener = bus.addEventListener.bind(bus);
  globalThis.removeEventListener = bus.removeEventListener.bind(bus);
  globalThis.dispatchEvent = bus.dispatchEvent.bind(bus);
  globalThis.confirm = () => true;
  globalThis.alert = () => {};

  const nav = { reloads: 0, replaced: null };
  globalThis.location = {
    pathname: '/tools/zyklus/', search: '', origin: 'http://test',
    reload() { nav.reloads++; }, replace(u) { nav.replaced = u; }
  };

  const mem = new Map(store ? Object.entries(store) : []);
  globalThis.localStorage = {
    getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k), mem
  };

  const srv = makeServer();
  globalThis.fetch = async (url, opts = {}) => {
    const r = srv.handle(opts.method || 'GET', String(url), opts.body ? JSON.parse(opts.body) : null);
    return { ok: r.status < 400, status: r.status, json: async () => r.data };
  };

  for (const f of ['shared/palette.js', 'shared/project.js']) {
    const abs = require.resolve(path.join(site, f));
    delete require.cache[abs];
    require(abs);
  }
  const P = globalThis.__PROJECT__;
  P._reset();
  P.init(globalThis.localStorage);

  const barAbs = require.resolve(path.join(site, 'shared/projectbar.js'));
  delete require.cache[barAbs];
  require(barAbs);                     // führt start() sofort aus

  /* Nach refreshStatus() steht der Text im Element, nach einem vollen
     refresh() nur im innerHTML der Leiste (die Attrappe wertet keinen
     Textinhalt aus) — beide Wege lesen. */
  const statusText = () => {
    const el = doc.getElementById('dl-pb-status');
    if (el && el.textContent) return el.textContent;
    const bar = doc.querySelector('.dl-pb');
    const m = bar && bar.innerHTML.match(/id="dl-pb-status"[^>]*>([^<]*)</);
    return m ? m[1] : (el ? '' : null);
  };
  return { P, srv, doc, nav, statusText, mem };
}

/* ── Tests ───────────────────────────────────────────────────────────── */

test('Start: erst holen, dann senden — eine Werkzeugseite überschreibt keinen fremden Stand (C-3)', async () => {
  const { srv } = boot();
  await tick(0);
  const order = srv.log.filter(l => /\/api\/(projects|auth)/.test(l));
  const firstGet = order.findIndex(l => l === 'GET /api/projects');
  const firstWrite = order.findIndex(l => /^(PUT|POST) \/api\/projects/.test(l));
  assert.ok(firstGet >= 0, 'pull() muss laufen: ' + order.join(' | '));
  assert.ok(firstWrite === -1 || firstGet < firstWrite,
    'pull() muss vor dem ersten Schreibzugriff kommen: ' + order.join(' | '));
});

test('Leerer Browser, Projekt auf dem Server: Seite baut neu auf, statt ihren Default-Stand darüberzuschieben', async () => {
  /* Der Fall „Kollegin öffnet die Seite auf einem anderen Rechner": der
     Cache ist leer, der Server hat den Arbeitsstand. Das erste geholte
     Projekt wird beim Ablegen still zum aktuellen — die Seite hat ihren
     Zustand aber schon aus Defaults aufgebaut. Ohne Reload schrieb sie ihn
     beim nächsten Rendern in den Abschnitt und pushte ihn mit passendem
     base_draft_at: der Server nahm die Defaults an, die Arbeit war weg. */
  const { P, srv, nav } = boot();
  srv.projects.srv1 = { id: 'srv1', name: 'Ölwanne', description: '', customer: '', part_no: '', rev: 0,
    created_at: '2026-08-31T00:00:01.000000+00:00', updated_at: '2026-08-31T00:00:05.000000+00:00',
    draft_at: '2026-08-31T00:00:05.000000+00:00', data: { design: { values: { pAccOp: 197 } } } };
  await tick(0);
  assert.equal(nav.reloads, 1, 'die Seite muss mit dem Serverstand neu aufbauen');
  assert.equal(P.current().remote.id, 'srv1');
  assert.equal(P.getSection('design').values.pAccOp, 197);
  /* Was die Seite vor dem Reload noch tut (Rendern, Default-Zustand
     schreiben), darf nicht als Änderung zum Server gehen. */
  assert.equal(srv.calls(/^PUT .*\/draft$/).length, 0, 'kein Draft-Push beim ersten Öffnen: ' + srv.log.join(' | '));
  assert.equal(srv.projects.srv1.data.design.values.pAccOp, 197);
});

test('Autosave läuft nicht endlos — ein Push je Änderung (C-2)', async () => {
  const { P, srv } = boot();
  await tick(0);
  srv.log.length = 0;

  P.setSection('design', { values: { part: 42 } });
  await tick(1300);
  const first = srv.calls(/PUT .*\/draft/).length;
  assert.equal(first, 1, 'genau ein Draft-Push je Änderung');

  /* Ohne weitere Eingabe darf nichts mehr passieren — der alte Code schrieb
     hier im Sekundentakt weiter, weil 'saved' erneut scheduleSync auslöste. */
  for (let i = 0; i < 20; i++) await tick(1300);
  assert.equal(srv.calls(/PUT .*\/draft/).length, first,
    'ohne Eingabe darf kein weiterer Push entstehen (gemessen waren es 26 in 15 s)');
});

test('Tab-Wechsel speichert den Draft, bevor die Seite verschwindet (H-08)', async () => {
  const { P, srv, doc } = boot();
  await tick(0);
  P.setSection('cycle', { durs: { schuss: 7 } });
  srv.log.length = 0;

  doc.visibilityState = 'hidden';
  doc.fire('visibilitychange');
  await tick(0);

  assert.equal(srv.calls(/PUT .*\/draft/).length, 1,
    'beim Verstecken der Seite muss der Arbeitsstand raus: ' + srv.log.join(' | '));
});

test('pagehide setzt beide Requests ab, den Draft zuerst (H-08)', async () => {
  const { P, srv } = boot();
  await tick(0);
  P.setSection('cycle', { durs: { schuss: 9 } });
  srv.log.length = 0;

  /* pagehide-Zuhörer hängt am window-Bus. */
  globalThis.dispatchEvent(new Event('pagehide'));
  await settle();

  const writes = srv.log.filter(l => /^PUT \/api\/projects/.test(l));
  assert.ok(writes.length >= 2, 'beide PUTs müssen abgesetzt sein: ' + srv.log.join(' | '));
  assert.match(writes[0], /\/draft$/,
    'der Arbeitsstand muss zuerst gehen — vorher ging nur der Metadaten-PUT raus');
});

test('Serverseitig archiviertes Projekt wird nicht zum Zombie (H-09)', async () => {
  const { P, srv, statusText } = boot();
  await tick(0);
  const localId = P.current().id;
  const deadId = P.current().remote.id;

  /* Jemand archiviert das Projekt auf /konto/ — der Server kennt es nicht mehr. */
  srv.intercept = (m, u) => (u.startsWith('/api/projects/' + deadId) ? { status: 404, data: { detail: 'Projekt nicht gefunden.' } } : null);
  P.setSection('design', { values: { part: 1 } });
  await tick(1300);

  assert.match(statusText() || '', /Server|archiviert|nicht mehr/,
    'der Anwender muss erfahren, was mit dem Projekt passiert ist');
  assert.equal(P.get(localId), null, 'die Karteileiche verschwindet aus dem Cache');
  assert.equal(P.list().length, 1, 'die ungespeicherte Arbeit bleibt als eigenes Projekt erhalten');
  assert.equal(P.getSection('design').values.part, 1, 'und zwar inhaltlich unverändert');

  /* Der tote Pfad darf nicht alle 8 s erneut angefragt werden. */
  srv.log.length = 0;
  for (let i = 0; i < 5; i++) await tick(8100);
  assert.equal(srv.calls(new RegExp('(PUT|POST) /api/projects/' + deadId)).length, 0,
    'der 404 wurde vorher endlos wiederholt: ' + srv.log.join(' | '));
});

test('Abgelaufene Sitzung wird gemeldet, nicht verschluckt (H-10)', async () => {
  const { P, srv, statusText } = boot();
  await tick(0);

  srv.intercept = (m, u) => (/^\/api\/projects/.test(u) && m !== 'GET' ? { status: 401, data: { detail: 'Nicht angemeldet.' } } : null);
  P.setSection('design', { values: { part: 5 } });
  await tick(1300);

  assert.match(statusText() || '', /Sitzung abgelaufen/,
    'vorher stand hier „speichert …", weil cur.dirty in statusHTML gewann');
  assert.ok(document.getElementById('dl-pb-relogin'), 'es braucht einen Weg zurück zur Anmeldung');

  srv.log.length = 0;
  for (let i = 0; i < 5; i++) await tick(8100);
  assert.equal(srv.calls(/PUT|POST/).length, 0, 'ein 401 gehört nicht in den Wiederholungstakt');
});

test('Voller Browser-Speicher wird in der Leiste sichtbar (H-11)', async () => {
  const { P, statusText, mem } = boot();
  await tick(0);
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };

  P.setSection('design', { values: { part: 8 } });
  await tick(0);
  assert.match(statusText() || '', /Speicher voll oder gesperrt/,
    'vorher meldete die Leiste „gespeichert", während nichts gespeichert wurde');
  globalThis.localStorage.setItem = (k, v) => mem.set(k, v);
});

test('Konflikt: ein fremder, neuerer Stand wird nicht überschrieben (C-3/C-4)', async () => {
  const { P, srv, statusText } = boot();
  await tick(0);
  P.setSection('design', { values: { part: 1 } });
  await tick(1300);

  const remote = Object.values(srv.projects)[0];
  const mine = P.current();
  /* Kollegin schreibt: der Server steht auf einem neueren Draft-Stempel. */
  remote.data = { design: { values: { part: 555 } } };
  remote.draft_at = '2026-08-31T23:59:59.000000+00:00';

  P.setSection('design', { values: { part: 77 } });
  await tick(1300);

  assert.deepEqual(remote.data, { design: { values: { part: 555 } } },
    'der fremde Stand darf nicht überschrieben werden');
  assert.match(statusText() || '', /Konflikt/);
  assert.ok(document.getElementById('dl-pb-conflict'), 'es braucht einen Ausweg aus dem Konflikt');
  assert.equal(mine.id, P.current().id);
});
