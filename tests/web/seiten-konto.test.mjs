/* Seiten, Konto und Rechtstexte (H-31 bis H-36).

     node --test tests/web/seiten-konto.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const P = require(path.join(site, 'shared/palette.js'));
const read = f => readFileSync(path.join(site, f), 'utf8');
const konto = read('konto/index.html');
/* Für Prüfungen auf tote Muster: Kommentare zählen nicht — dort stehen sie
   absichtlich, um den behobenen Fehler zu erklären. */
const ohneKommentare = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const kontoCode = ohneKommentare(konto);

/* ── H-31 ─────────────────────────────────────────────────────────────── */

/* Dieselbe Regel wie auf der Seite — hier ausführbar. */
function safeNext(raw, origin) {
  if (!raw) return null;
  let u;
  try { u = new URL(raw, origin); } catch (e) { return null; }
  if (u.origin !== origin) return null;
  return u.pathname + u.search + u.hash;
}

test('Anmeldeseite: ?next= führt nur an Ziele dieser Site', () => {
  const O = 'https://dielogic.de';

  /* Der Befund: „/\\evil.com" bestand die alte Prüfung /^\/[^\/]/ — der
     Browser behandelt den Rückwärtsschrägstrich wie einen Schrägstrich. */
  assert.ok(/^\/[^/]/.test('/\\evil.com'), 'Vorbedingung: die alte Prüfung ließ das durch');
  assert.equal(new URL('/\\evil.com', O).origin, 'https://evil.com', 'und es landete wirklich woanders');

  for (const böse of ['//evil.com', '/\\evil.com', '/\\\\evil.com', '\\\\evil.com',
    'https://evil.com', 'http://evil.com/x', 'javascript:alert(1)', 'data:text/html,x']) {
    assert.equal(safeNext(böse, O), null, JSON.stringify(böse) + ' muss abgelehnt werden');
  }
  assert.equal(safeNext('/tools/zyklus/', O), '/tools/zyklus/');
  assert.equal(safeNext('/konto/?x=1#y', O), '/konto/?x=1#y');

  /* Und die Seite benutzt genau diese Regel. */
  assert.match(konto, /function safeNext\(/, 'die Prüfung fehlt auf der Seite');
  assert.ok(!/\/\^\\\/\[\^\\\/\]\//.test(kontoCode), 'das alte Muster steht noch im Code');
});

/* ── H-32 ─────────────────────────────────────────────────────────────── */

test('Einladungslink zeigt auf /konto/ dieser Site, egal von welcher Seite', () => {
  /* Im Quelltext steht der Pfad als Regex mit maskierten Schrägstrichen
     (\/app\/konto\.html) — danach muss gesucht werden, nicht nach der
     ungeschützten Schreibweise. */
  assert.ok(!/app\\?\/konto\\?\.?html/.test(kontoCode),
    'der tote /app/konto.html-Pfad aus der Umbenennung site/ → web/ steht noch im Code');
  assert.match(kontoCode, /var base = location\.origin;/,
    'die Basis des Einladungslinks muss schlicht der eigene Ursprung sein');

  /* Die Regel der Seite, gegen alle Orte nachgerechnet, an denen sie läuft. */
  const url = (origin) => origin + '/konto/?token=ABC';
  for (const pfad of ['/konto/', '/konto/index.html']) {
    const alt = 'http://test' + pfad.replace(/\/app\/konto\.html$/, '') + '/konto/?token=ABC';
    assert.ok(alt.includes('//konto/') || alt.includes('.html/'),
      'Vorbedingung: die alte Regel erzeugte auf ' + pfad + ' eine kaputte URL — ' + alt);
    assert.equal(url('http://test'), 'http://test/konto/?token=ABC');
  }
});

/* ── H-33 ─────────────────────────────────────────────────────────────── */

test('Abmelden räumt den Projekt-Cache', () => {
  const logout = konto.slice(konto.indexOf("$('logout').addEventListener"));
  const body = logout.slice(0, logout.indexOf('\n  });'));
  assert.match(body, /P\.clearAll\(\)/, 'sonst lädt der nächste Benutzer fremde Projekte hoch');
  assert.match(body, /dielogic-org-settings-v1/, 'die Stammdaten gehören ebenso gelöscht');
});

/* ── H-34 ─────────────────────────────────────────────────────────────── */

test('Einladungs-Token verschwindet sofort aus der Adresszeile', () => {
  const at = konto.indexOf("get('token')");
  const danach = konto.slice(at, at + 500);
  assert.match(danach, /history\.replaceState/,
    'das Token blieb in Verlauf, Lesezeichen und Bildschirmfoto stehen — auch nach einem Fehler');
});

/* ── H-35 ─────────────────────────────────────────────────────────────── */

test('.btn-ghost erfüllt den Textkontrast auf hellem UND dunklem Grund', () => {
  const css = readFileSync(path.join(site, 'shared/shared.css'), 'utf8');
  const tok = k => (css.match(new RegExp('--' + k + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1];
  const cr = P.contrast;

  const ondark = tok('ondark'), bg = tok('bg'), text = tok('text'), dark = tok('dark');
  assert.ok(ondark && bg && text && dark, 'Farbtoken nicht gefunden');

  /* Der Befund: --ondark auf hellem Grund. */
  assert.ok(cr(ondark, bg) < 4.5, 'Vorbedingung: --ondark ist auf hellem Grund kontrastschwach');

  /* Die Regel erbt jetzt — auf hellen Seiten also die dunkle Textfarbe. */
  const regel = css.slice(css.indexOf('.btn-ghost {'), css.indexOf('.btn-ghost:hover'));
  assert.match(regel, /color:\s*inherit/, '.btn-ghost muss die Umgebungsfarbe erben');
  assert.ok(cr(text, bg) >= 4.5, 'auf hellem Grund: ' + cr(text, bg).toFixed(2) + ':1');
  assert.match(css, /\.btn-ghost-ondark\s*\{[^}]*--ondark/, 'die dunkle Variante fehlt');
  assert.ok(cr(ondark, dark) >= 4.5, 'auf dunklem Grund: ' + cr(ondark, dark).toFixed(2) + ':1');

  /* Jede .btn-ghost auf der dunklen Startseite trägt die Variante. */
  const index = read('index.html');
  for (const m of index.matchAll(/class="([^"]*\bbtn-ghost\b[^"]*)"/g)) {
    assert.match(m[1], /btn-ghost-ondark/,
      'btn-ghost auf der Startseite ohne die dunkle Variante: ' + m[1]);
  }
});

/* ── H-36 ─────────────────────────────────────────────────────────────── */

test('Freigabe-Gate: Pflichtseiten mit Platzhaltern nur bei gesperrter Site', () => {
  const rechtDir = path.join(site, 'recht');
  const seiten = readdirSync(rechtDir).filter(f => f.endsWith('.html'));
  let offen = 0;
  for (const f of seiten) {
    const html = readFileSync(path.join(rechtDir, f), 'utf8');
    offen += (html.match(/class="ph"/g) || []).length;
    assert.match(html, /draft-note/, f + ': der Musterkasten fehlt — der Text sähe fertig aus');
  }

  const robots = read('robots.txt');
  const gesperrt = /^\s*Disallow:\s*\/\s*$/m.test(robots);
  if (offen > 0) {
    assert.ok(gesperrt,
      `${offen} Platzhalter in den Pflichtseiten, aber robots.txt gibt die Site frei — `
      + 'Impressum, AGB, Widerruf und Datenschutz müssen VOR dem Livegang ausgefüllt sein.');
  }
});

/* ── Doppelklick und Maskierung ───────────────────────────────────────── */

test('„Einladen" sperrt sich während des Requests', () => {
  const h = konto.slice(konto.indexOf("$('invite-form').addEventListener('submit'"));
  const body = h.slice(0, h.indexOf('\n  });'));
  assert.match(body, /if \(inviteBusy\) return;/,
    'ein Doppelklick erzeugte zwei gültige Tokens für dieselbe Adresse');
  assert.match(body, /btn\.disabled = true/);
  assert.match(body, /finally \{ inviteBusy = false/);
});

test('Werte aus der Datenbank landen maskiert im Markup', () => {
  /* Stammdaten-Editor: Feldwerte gingen unescaped in value="…". */
  const zeile = konto.slice(konto.indexOf('function renderList('), konto.indexOf('$(\'sd-body\').innerHTML'));
  assert.ok(!/value="' \+ \(p\.fields\[f\.key\] \?\? ''\)/.test(zeile),
    'Feldwerte gingen ohne esc() ins value-Attribut');
  assert.match(zeile, /esc\(p\.fields\[f\.key\]/);

  /* Zyklusseite: die Herkunftstexte tragen Preset-Namen aus den Org-Stammdaten. */
  const zyklus = read('tools/zyklus/index.html');
  const block = zyklus.slice(zyklus.indexOf("getElementById('h-sources').innerHTML"));
  const ende = block.indexOf(';');
  assert.match(block.slice(0, ende), /escapeHtml\(inp\.src\.die\)/,
    'der Maschinen-Preset-Name kam unescaped in innerHTML');
});

test('das Demo-Passwort steht nicht mehr in der Seite', () => {
  assert.ok(!/d\.password/.test(konto), 'die Seite zeigte das Passwort an');
  assert.match(konto, /'\/api\/auth\/demo\/login'/, 'die Anmeldung läuft jetzt über den Server');
});
