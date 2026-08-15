/* Tests für das Teilen per Link (app/js/core/share.js):
   Kodier-Roundtrip, Übernahme eines Share-Links in den Zustand und
   Robustheit gegen kaputte Links. Läuft mit: node --test */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Browser-Umgebung stubben — state.js braucht Vertrag, localStorage und
   die Preset-Configs; share.js braucht location und history. */
globalThis.window = globalThis;
require(path.join(site, 'app/shared/contract.js'));
require(path.join(site, 'app/config/machines.js'));
require(path.join(site, 'app/config/alloys.js'));
require(path.join(site, 'app/config/parts.js'));
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.location = new URL('https://dielogic.example/app/index.html');
globalThis.history = { replaceState: (s, t, url) => { globalThis.location = new URL(url, globalThis.location); } };

const { state, resetState } = await import(path.join(site, 'app/js/core/state.js'));
const { encodeShare, decodeShare, shareURL, consumeShareLink } =
  await import(path.join(site, 'app/js/core/share.js'));

test('share: encode/decode-Roundtrip ist verlustfrei (inkl. Umlauten)', () => {
  const data = { values: { part: 12.5, vacModel: 'aus' }, note: 'Größe ü/ß', curve: [[60, 0.4]] };
  assert.deepEqual(decodeShare(encodeShare(data)), data);
  /* base64url: keine Zeichen, die in URLs kodiert werden müssten */
  assert.match(encodeShare(data), /^[A-Za-z0-9_-]+$/);
});

test('share: shareURL → consumeShareLink stellt den Zustand wieder her', () => {
  resetState();
  state.values.part = 42;
  state.values.vacModel = 'ideal';
  state.machine = 'hcc340';
  state.curve = [[10, 0.5], [500, 3]];
  state.curveGen.mode = 'lopez';

  const url = shareURL();
  resetState();
  assert.notEqual(state.values.part, 42);

  globalThis.location = new URL(url);
  assert.equal(consumeShareLink(), true);
  assert.equal(state.values.part, 42);
  assert.equal(state.values.vacModel, 'ideal');
  assert.equal(state.machine, 'hcc340');
  assert.deepEqual(state.curve, [[10, 0.5], [500, 3]]);
  assert.equal(state.curveGen.mode, 'lopez');
  /* Fragment ist nach der Übernahme aus der URL entfernt */
  assert.equal(globalThis.location.hash, '');
});

test('share: kaputter oder fehlender Link wird ignoriert', () => {
  resetState();
  const before = JSON.stringify(state.values);

  globalThis.location = new URL('https://dielogic.example/app/index.html');
  assert.equal(consumeShareLink(), false);

  globalThis.location = new URL('https://dielogic.example/app/index.html#s=kein-gueltiges-base64json');
  assert.equal(consumeShareLink(), false);
  assert.equal(JSON.stringify(state.values), before);
});
