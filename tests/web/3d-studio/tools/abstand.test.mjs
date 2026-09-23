/* Abstandsanalyse im gemeinsamen Rahmen: zwei Dateien im Modus „Dateien",
   die Rechnung als abbrechbare Arbeit, Kennzahlen mit Urteil, die Skala als
   eigener Modus, Anzeige unter „Darstellung". Die Fälle stammen aus
   viewer.test.mjs.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/abstand.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mountPage, wait, kpiText } from './fixture.mjs';

/* Messwerte nie mit assert.equal vergleichen (siehe wandstaerke.test.mjs). */
const same = (a, b, msg) => assert.ok(a === b, msg);
/* Ungefärbt steht ein Netz im Grau des Bauteils (Rolle part, als Punktfarbe
   linear), B eine Stufe dunkler — ohne Palette die Standardwerte. */
const C = await import('../../../../web/tools/3d-studio/js/part/colors.js');
const plainOf = key => C.linRgb(key === 'a' ? C.ROLE.part : C.mixHex(C.ROLE.part, 'text', 0.25));
let P;

before(async () => {
  P = await mountPage('abstand.html', 'js/studio/pages/abstand.js');
});

test('Zwei Dateien als Chips A und B in der Kopfzeile, nichts gerechnet', () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  assert.ok(s.a.model && s.b.model, 'beide Dateien geladen');
  assert.ok(s.a.name.includes('Ölwanne'), 'A ist die Ölwanne, das Gussteil der Form: ' + s.a.name);
  assert.ok(s.b.name.includes('Temperierung fest'), 'B ist die Temperierung der festen Hälfte: ' + s.b.name);
  assert.equal(s.analysed, false, 'ohne Bestätigung wird nicht gerechnet');
  assert.deepEqual(doc.querySelectorAll('[role="tab"]').map(b => b.getAttribute('data-mode')), ['abstand', 'skala']);
  assert.equal(shell.mode, 'abstand', 'die Seite beginnt bei der Rechnung');
  assert.equal(ui('part').hidden, true, 'zwei Dateien — der eine Bauteil-Chip der Kopfzeile entfällt …');
  /* … an seiner Stelle stehen zwei, A und B, jeder mit derselben Klappe:
     Beispielteil, „Datei öffnen …", „Zum Bauteil" mit den Kennzahlen. */
  assert.ok(ui('part-chip-a') && ui('part-chip-b'), 'Chips A und B');
  assert.match(ui('part-name-a').textContent, /Ölwanne/);
  assert.match(ui('part-name-b').textContent, /Temperierung fest/);
  for (const k of ['a', 'b']) {
    const pop = ui('part-pop-' + k);
    assert.ok(pop.hidden, k + ': die Klappe ist zu');
    ui('part-chip-' + k).dispatch('click');
    assert.ok(!pop.hidden, k + ': ein Klick öffnet sie');
    assert.ok(pop.querySelector('#demo-select-' + k) && pop.querySelector('#stl-btn-' + k) && pop.querySelector('#model-warn-' + k));
    assert.match(doc.getElementById('model-facts-' + k).innerHTML, /Volumen/, k + ': Zum Bauteil nennt die Kennzahlen');
  }
  assert.ok(ui('part-pop-a').hidden, 'B zu öffnen schließt A');
  ui('part-chip-b').dispatch('click');
  assert.ok(ui('part-pop-b').hidden, 'ein zweiter Klick schließt B');
  assert.ok(doc.getElementById('demo-select-a').innerHTML.includes('coolmov'), 'Gegenstücke sind hier wählbar');
  assert.equal(doc.querySelector('.st-mode #demo-select-a'), null, 'die Seitenleiste lädt keine Dateien mehr');
  assert.equal(ui('primary').textContent, 'Abstand berechnen');
  assert.match(ui('note').textContent, /Noch nicht gerechnet: .* Punkte gegen .* Dreiecke/);
  /* Anzeigeoptionen stehen unter „Darstellung". */
  const bar = doc.getElementById('viewport').querySelector('.view-bar');
  assert.equal(bar.querySelector('[data-darstellung]').hidden, false);
  assert.ok(ui('show-a') && ui('show-b') && ui('opacity'));
});

test('Abstand auf Knopfdruck: beide Richtungen, Kennzahlen, Skala aus den Messwerten', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  ui('primary').dispatch('click');
  await wait(() => s.analysed && !s.running, 1600);
  assert.equal(shell.mode, 'abstand', 'wer bei den Dateien rechnet, landet bei den Zahlen');
  assert.ok(s.a.dist && s.a.dist.length === s.a.model.vertexCount, 'ein Wert je Punkt von A');
  assert.ok(s.b.dist && s.b.dist.length === s.b.model.vertexCount, 'ein Wert je Punkt von B');
  /* Beide Richtungen müssen (fast) denselben kleinsten Abstand finden — der
     kürzeste Weg zwischen zwei Flächen ist symmetrisch. Gemessen wird an den
     Eckpunkten des verfeinerten Netzes (Schritt diag/80): ein Unterschied von
     einem Bruchteil des Schritts ist Abtastung, kein Fehler. */
  const step = Math.max(s.a.model.bounds.diag, s.b.model.bounds.diag) / 80;
  assert.ok(Math.abs(s.a.stats.min - s.b.stats.min) < step / 4,
    'kleinster Abstand von beiden Seiten gleich: ' + s.a.stats.min.toFixed(2) + ' / ' + s.b.stats.min.toFixed(2));
  assert.ok(s.a.stats.min > 0, 'die Körper berühren sich nicht');
  const lo = Math.min(s.a.stats.min, s.b.stats.min), hi = Math.max(s.a.stats.max, s.b.stats.max);
  assert.ok(Math.abs(s.scale.min - lo) <= 0.1 + 1e-9 && Math.abs(s.scale.max - hi) <= 0.1 + 1e-9, 'Grenzen aus den Messwerten');
  assert.equal(ui('scale-min').value, String(s.scale.min).replace('.', ','));
  assert.match(kpiText(ui('dist-kpis')), /A → B.*mm.*Mittel A.*B → A.*Mittel B/);
  assert.equal(ui('dist-warn').textContent, '', 'keine Durchdringung');
  assert.ok(ui('dist-facts').innerHTML.includes('Rechenzeit'));
  assert.equal(ui('primary').hidden, true, 'aktuell — kein Knopf');
  assert.match(ui('note').textContent, /Abstand ist aktuell/);
});

test('Ein fehlgeschlagenes Beispielteil meldet sich, statt die Seite zu töten', async () => {
  const { doc } = P;
  const echt = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => null });
  try {
    const sel = doc.getElementById('demo-select-a');
    const before = sel.value;
    sel.value = sel.options[sel.options.length - 1].value;
    sel.dispatch('change');
    await wait(() => /konnte nicht geladen werden|fehlt/.test(doc.getElementById('model-warn-a').textContent), 80, 10);
    sel.value = before;
  } finally {
    globalThis.fetch = echt;
  }
});

test('Skala, Einfärben, Darstellung, Farbskala — und die Suchgrenze verlangt eine neue Rechnung', () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  const colorAt = (mesh, f) => { const c = mesh.geometry.getAttribute('color').array; return [c[f * 9], c[f * 9 + 1], c[f * 9 + 2]].map(x => +x.toFixed(3)).join(','); };
  /* Über viele Dreiecke vergleichen — ein einzelnes kann in beiden Skalen am Anschlag liegen. */
  const fingerprint = mesh => { const c = mesh.geometry.getAttribute('color').array; let h = 0; for (let i = 0; i < c.length; i += 97) h = (h * 31 + Math.round(c[i] * 255)) | 0; return h; };

  shell.setMode('skala');
  const before = fingerprint(v.meshA), distRef = s.a.dist;
  const mn = ui('scale-min'), mx = ui('scale-max');
  mn.value = '5'; mn.dispatch('change');
  mx.value = '40'; mx.dispatch('change');
  assert.equal(s.scale.min, 5);
  assert.equal(s.scale.max, 40);
  assert.equal(s.stale, false, 'Umfärben ist keine neue Rechnung');
  same(s.a.dist, distRef, 'dieselben Messwerte');
  assert.notEqual(fingerprint(v.meshA), before, 'andere Einfärbung');

  ui('scale-auto').dispatch('click');
  assert.ok(Math.abs(s.scale.min - s.a.stats.min) < 0.2 || Math.abs(s.scale.min - s.b.stats.min) < 0.2, 'Minimum übernommen: ' + s.scale.min);
  assert.ok(s.scale.max >= s.scale.min, 'Grenzen in der richtigen Reihenfolge');
  assert.equal(ui('scale-min').value, String(s.scale.min).replace('.', ','));

  /* Einfärbung umschalten: das ungefärbte Netz wird einfarbig. */
  const seg = ui('color-seg').querySelectorAll('button');
  seg.find(b => b.dataset.value === 'b').dispatch('click');
  assert.equal(s.color, 'b');
  assert.equal(colorAt(v.meshA, 0), plainOf('a').map(x => +x.toFixed(3)).join(','), 'A steht jetzt im Grau des Bauteils');
  assert.equal(colorAt(v.meshA, 7), colorAt(v.meshA, 0), 'einfarbig');
  seg.find(b => b.dataset.value === 'both').dispatch('click');

  /* Ausblenden und Deckkraft: unter „Darstellung". */
  const showB = ui('show-b');
  showB.checked = false; showB.dispatch('change');
  assert.equal(v.meshB.visible, false, 'B ausgeblendet');
  assert.equal(v.meshA.visible, true, 'A bleibt');
  showB.checked = true; showB.dispatch('change');
  assert.equal(v.meshB.visible, true);
  ui('opacity').value = '40'; ui('opacity').dispatch('input');
  assert.ok(Math.abs(v.meshA.material.opacity - 0.4) < 1e-9 && v.meshA.material.transparent);
  ui('opacity').value = '100'; ui('opacity').dispatch('input');

  /* Farbskala mit den gesetzten Grenzen. */
  const bar = doc.getElementById('colorbar');
  assert.ok(bar.classList.contains('on'), 'Skala sichtbar');
  assert.equal(doc.getElementById('cb-title').textContent, 'Abstand A ↔ B');
  assert.ok(doc.getElementById('cb-ticks').innerHTML.includes('≥'), 'oberes Ende als „ab" beschriftet');
  assert.ok(doc.getElementById('cb-scale').style.background.includes('linear-gradient'));
  /* Die Karte steht in beiden Modi — sie gehört zur Rechnung, nicht zu einem Reiter. */
  shell.setMode('skala');
  assert.ok(bar.classList.contains('on'));
  shell.setMode('abstand');

  /* Suchgrenze gehört zur Rechnung, nicht zur Anzeige. */
  const reach = ui('reach');
  reach.value = '12'; reach.dispatch('change');
  assert.equal(s.reach, 12);
  assert.equal(s.stale, true, 'die Suchgrenze verlangt eine neue Rechnung');
  assert.equal(ui('primary').textContent, 'Abstand neu berechnen');
  assert.match(ui('note').textContent, /Suchgrenze geändert/);
  reach.value = '0'; reach.dispatch('change');
  assert.equal(s.reach, 0.01, 'geklemmt');
  assert.match(reach.closest('.row').querySelector('.clamp-note').textContent, /begrenzt/);
});

test('Abbrechen: die Rechnung hält an, das vorige Bild bleibt', async () => {
  const { v, ui } = P;
  const s = v.state;
  const reach = ui('reach');
  reach.value = '400'; reach.dispatch('change');
  assert.match(ui('note').textContent, /groß gegenüber den Teilen/, 'die Warnung steht VOR dem Rechnen da');
  const distRef = s.a.dist;
  ui('primary').dispatch('click');
  await wait(() => s.running, 200, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen');
  ui('primary').dispatch('click');
  await wait(() => !s.running && s.ready, 1600);
  same(s.a.dist, distRef, 'die vorigen Messwerte bleiben');
  assert.equal(s.stale, true);
  assert.match(ui('note').textContent, /Abgebrochen: Das Bild zeigt noch die vorige Rechnung/);
  assert.equal(ui('primary').textContent, 'Abstand neu berechnen');
});

test('Ablegen fragt, ob A oder B; Einstellungen als Datei und zurücksetzen', async () => {
  const { doc, v, ui } = P;
  const s = v.state;
  const { writeSTL } = await import('../../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../../web/tools/3d-studio/js/solids.js');
  const buf = writeSTL(S.box(40, 30, 20), 'test');
  const vp = doc.getElementById('viewport');
  vp.dispatch('drop', { dataTransfer: { files: [{ name: 'klotz.stl', arrayBuffer: () => Promise.resolve(buf), byteLength: buf.byteLength }] } });
  await wait(() => !ui('banner').hidden, 80, 10);
  assert.match(ui('banner').textContent, /klotz\.stl.*laden als/);
  const btns = ui('banner').querySelectorAll('button');
  assert.deepEqual(btns.map(b => b.textContent), ['Datei A', 'Datei B']);
  btns[1].dispatch('click');
  await wait(() => s.ready && s.b.name === 'klotz.stl', 400);
  assert.equal(s.analysed, false, 'eine neue Datei verlangt eine neue Rechnung');
  assert.ok(s.a.name.includes('Ölwanne'), 'A bleibt');

  const doc1 = v.tool.toJSON();
  assert.equal(doc1.format, 'dielogic-abstand');
  assert.equal(doc1.reach, s.reach);
  v.tool.fromJSON({ ...doc1, reach: 25, color: 'both', opacity: 0.5, showB: false });
  assert.equal(s.reach, 25);
  assert.equal(ui('reach').value, '25');
  assert.equal(s.color, 'both');
  assert.equal(v.meshB.visible, false);
  assert.equal(ui('opacity').value, '50');
  assert.throws(() => v.tool.fromJSON({ format: 'dielogic-entformung', version: 1 }), /keine Datei der Abstandsanalyse/);
  v.tool.resetSettings();
  assert.equal(s.reach, 50);
  assert.equal(v.meshB.visible, true);
  assert.equal(v.tool.settingsOnly, true);
});

/* Eine Datei als A oder B ablegen — wie der Anwender: ins Bild ziehen, im
   Streifen die Seite wählen. */
async function loadAs(key, name, tris) {
  const { doc, v, ui } = P;
  const { writeSTL } = await import('../../../../web/tools/3d-studio/js/part/stlio.js');
  const buf = writeSTL(tris, 'test');
  doc.getElementById('viewport').dispatch('drop', { dataTransfer: { files: [{ name, arrayBuffer: () => Promise.resolve(buf), byteLength: buf.byteLength }] } });
  await wait(() => !ui('banner').hidden, 80, 10);
  ui('banner').querySelectorAll('button')[key === 'a' ? 0 : 1].dispatch('click');
  await wait(() => v.state.ready && v.state[key].name === name && !v.state.running, 400);
}
const solids = () => import('../../../../web/tools/3d-studio/js/solids.js');

test('Eine neue Datei während der Rechnung: die Rechnung des alten Paares endet still', async () => {
  const { doc, v, ui, host } = P;
  const s = v.state;
  const S = await solids();
  /* Ein Paar, das Sekunden rechnet: die Ölwanne gegen die Temperierung. */
  const sel = doc.getElementById('demo-select-b');
  sel.value = 'coolfix'; sel.dispatch('change');
  await wait(() => s.ready && /Temperierung fest/.test(s.b.name), 400);
  ui('reach').value = '50'; ui('reach').dispatch('change');
  ui('primary').dispatch('click');
  await wait(() => s.running, 200, 5);
  await loadAs('b', 'klotz-neu.stl', S.box(40, 30, 20));
  await new Promise(r => setTimeout(r, 30));
  assert.equal(host.jobs.running, false, 'die Rechnung des alten Paares ist beendet, nicht erst nach Sekunden');
  assert.equal(s.running, false);
  assert.equal(s.cancelled, false, 'das war kein Abbruch des Anwenders');
  assert.equal(s.analysed, false, 'für das neue Paar ist noch nichts gerechnet');
  same(s.a.dist, null, 'und nichts vom alten steht auf A');
  assert.equal(ui('primary').textContent, 'Abstand berechnen');
  assert.match(ui('note').textContent, /Noch nicht gerechnet/);
});

test('Eine neue Datei: nichts bleibt vom alten Paar stehen, auch nicht auf der anderen Seite', async () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  const S = await solids();
  /* Würfel von 20 mm (grobe Netze werden verfeinert — größere Teile kosten
     hier nur Zeit). B steckt zu einem Viertel in A: eine Durchdringung. */
  await loadAs('a', 'wuerfel-a.stl', S.box(20, 20, 20));
  await loadAs('b', 'wuerfel-b.stl', S.translate(S.box(20, 20, 20), 15, 0, 0));
  shell.setMode('abstand');
  ui('primary').dispatch('click');
  await wait(() => s.analysed && !s.running, 1600);
  ui('color-seg').querySelectorAll('button').find(b => b.dataset.value === 'both').dispatch('click');
  const bar = doc.getElementById('colorbar');
  assert.ok(bar.classList.contains('on'), 'gerechnet: die Skala steht');
  assert.match(kpiText(ui('dist-kpis')), /A → B/);
  assert.match(ui('dist-warn').textContent, /INNERHALB/, 'die Teile durchdringen sich');
  assert.ok(ui('dist-facts').innerHTML.includes('Rechenzeit'));

  await loadAs('b', 'wuerfel-c.stl', S.translate(S.box(20, 20, 20), 0, 80, 0));
  assert.equal(s.analysed, false);
  same(s.a.dist, null, 'A war gegen das alte B gemessen: seine Werte gelten nicht mehr');
  same(s.b.dist, null);
  assert.ok(!s.a.stats && !s.b.stats && s.a.inside === 0 && s.b.inside === 0);
  const plain = plainOf('a').map(x => Math.fround(x));
  const colA = v.meshA.geometry.getAttribute('color').array;
  let coloured = 0;
  for (let i = 0; i < colA.length; i += 7) if (colA[i] !== plain[i % 3]) coloured++;
  assert.equal(coloured, 0, 'A ist wieder im Grau des Bauteils, nicht nach Abständen zum alten B gefärbt');
  assert.ok(!bar.classList.contains('on'), 'keine Skala ohne Messwerte');
  assert.equal(kpiText(ui('dist-kpis')), '', 'keine Kennzahlen des alten Paares');
  assert.equal(ui('dist-warn').textContent, '', 'keine Warnung des alten Paares');
  assert.ok(!ui('dist-facts').innerHTML.includes('Rechenzeit'), 'keine Rechenzeit des alten Paares');
  assert.match(ui('note').textContent, /Noch nicht gerechnet/);
});

test('Suchgrenze während der Rechnung geändert: veraltet, und „≥" bleibt bei der Grenze der Rechnung', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  const S = await solids();
  /* A reicht bis x = 10, B beginnt bei x = 40: A misst 30 bis über 50 mm. */
  await loadAs('b', 'wuerfel-d.stl', S.translate(S.box(20, 20, 20), 50, 0, 0));
  shell.setMode('abstand');
  const reach = ui('reach');
  reach.value = '40'; reach.dispatch('change');
  ui('primary').dispatch('click');
  assert.equal(s.running, true);
  reach.value = '100'; reach.dispatch('change');          // umentschieden, während gerechnet wird
  await wait(() => s.analysed && !s.running, 1600);
  assert.equal(s.measuredReach, 40, 'gerechnet wurde mit der Grenze vom Start');
  assert.equal(s.stale, true, 'das Ergebnis passt nicht mehr zur Eingabe');
  assert.equal(ui('primary').textContent, 'Abstand neu berechnen');
  assert.match(ui('note').textContent, /Suchgrenze geändert/);
  assert.ok(s.a.stats.max >= 40 - 1e-6, 'A stößt an die Grenze: ' + s.a.stats.max);
  assert.match(kpiText(ui('dist-kpis')), /A → B.*≥ 40,0 mm/, 'an der Grenze der Rechnung steht „≥" (nicht an der Eingabe 100)');
  /* Zurück zur Grenze der Rechnung: wieder aktuell, ohne neu zu rechnen. */
  reach.value = '40'; reach.dispatch('change');
  assert.equal(s.stale, false);
  assert.match(ui('note').textContent, /Abstand ist aktuell/);
});

test('Skala: die Grenzen bleiben in ihrer Reihenfolge, das geschobene Feld sagt es', () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  shell.setMode('skala');
  const mn = ui('scale-min'), mx = ui('scale-max');
  const note = el => el.closest('.row').querySelector('.clamp-note').textContent;
  mn.value = '0'; mn.dispatch('change');
  mx.value = '20'; mx.dispatch('change');
  /* Das Minimum über das Maximum: das Maximum geht mit — nicht das ganze Netz in einer Farbe. */
  mn.value = '30'; mn.dispatch('change');
  assert.equal(s.scale.min, 30, 'das Getippte gilt');
  assert.ok(Math.abs(s.scale.max - 30.1) < 1e-9, 'das Maximum ist mitgegangen: ' + s.scale.max);
  assert.equal(mx.value, '30,1');
  assert.match(note(mx), /30,1 mm angehoben \(über dem Minimum\)/);
  mx.value = '40'; mx.dispatch('change');
  assert.deepEqual([s.scale.min, s.scale.max], [30, 40], 'in dieser Reihenfolge getippt: 30 bis 40');
  /* Umgekehrt: das Maximum unter das Minimum schiebt das Minimum. */
  mx.value = '10'; mx.dispatch('change');
  assert.equal(s.scale.max, 10);
  assert.ok(Math.abs(s.scale.min - 9.9) < 1e-9);
  assert.equal(mn.value, '9,9');
  assert.match(note(mn), /9,9 mm gesenkt \(unter dem Maximum\)/);
  mn.value = '5'; mn.dispatch('change');
  assert.deepEqual([s.scale.min, s.scale.max], [5, 10]);
  /* Die Skala liest sich richtig herum: oben „≥" das Maximum, unten „≤" das Minimum. */
  const ticks = doc.getElementById('cb-ticks').innerHTML;
  assert.ok(ticks.indexOf('≥ 10,0') >= 0 && ticks.indexOf('≤ 5,0') > ticks.indexOf('≥ 10,0'), ticks);
  ui('scale-auto').dispatch('click');
  shell.setMode('abstand');
});

test('Eine Datei, die sich nicht laden lässt, meldet sich im Bild; das vorige Netz bleibt', async () => {
  const { doc, v, ui } = P;
  const s = v.state;
  const { writeSTL } = await import('../../../../web/tools/3d-studio/js/part/stlio.js');
  const buf = writeSTL(new Float64Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 0, 0, 10, 0, 0, 0, 10]), 'flaeche');
  const before = s.b.model;
  const chip = ui('part-name-b').textContent;
  ui('toast').hidden = true;
  const input = doc.getElementById('stl-input-b');
  input.files = [{ name: 'flaeche.stl', arrayBuffer: () => Promise.resolve(buf), byteLength: buf.byteLength }];
  input.dispatch('change');
  await wait(() => !ui('toast').hidden, 80, 10);
  assert.match(ui('toast').textContent, /weniger als vier Dreiecke/, 'die Meldung steht im Bild, nicht nur in der zugeklappten Klappe');
  same(s.b.model, before, 'das vorige Netz bleibt');
  assert.equal(ui('part-name-b').textContent, chip, 'und der Chip nennt es weiter');
  assert.equal(s.ready, true);
});
