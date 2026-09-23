/* Die Eingabedomäne als erste Verteidigungslinie.

   Vorher: die Domäne war auf vier Orte verteilt (drei Namenslisten in
   inputs.js, 45 HTML-Attribute, 27 ConvertError im Backend, verstreute
   Guards), validate() lief NACH computeShot und niemand fragte das Ergebnis
   ab. Ungültige Zahlen flossen ungehindert in alle 19 Diagramme, die sich
   deshalb jede für sich wehren mussten — 90 isFinite-Prüfungen.

   Jetzt: eine Domäne (config/fields.js), eine Sperre (render()). Diese Datei
   prüft, dass die Sperre hält — und dass sie nie im Weg steht. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { site, ladeSkripte, themeLaden, auslegung, defaults, canvasGlobals } from './stubs/dashboard.mjs';

/* inputs.js zieht über core/state.js das Projektmodul mit (window.__PROJECT__);
   renderCard zeichnet mit dem Theme (wie render-smoke.test.mjs). */
globalThis.devicePixelRatio = 1;
canvasGlobals();
Object.assign(globalThis.document, { querySelectorAll: () => [], getElementById: () => null });
ladeSkripte();
await themeLaden();

const { allFields, PAIRS, domainFields } = await auslegung('config/fields.js');
const { checkValues, checkField, clampToDomain } = await auslegung('core/domain.js');

/* ── Die Sperre fängt genau das ab, wogegen sich die Diagramme wehrten ──── */

/* Dieselbe Matrix, gegen die render-smoke.test.mjs prüft, dass kein Diagramm
   wirft. Hier die schärfere Aussage: diese Werte erreichen ein Diagramm gar
   nicht erst. Das ist der Unterschied zwischen „jede Ausnahme behandeln" und
   „dafür sorgen, dass sie nicht eintritt". */
const ENTARTET = [['leer (0)', 0], ['negativ', -1], ['nicht endlich', NaN], ['sehr groß', 1e12]];
const KEYS = ['gate', 'vmax', 'diam', 'length', 'part', 'density', 'vent',
  'injForce', 'gateMin', 'gateMax', 'Tliq', 'Tdie', 'wall'];

for (const [label, bad] of ENTARTET) {
  test(`sperre: ${label} in einem der 13 Kernfelder wird abgewiesen`, () => {
    for (const key of KEYS) {
      const v = Object.assign(defaults(), { [key]: bad });
      const urteil = checkValues(v);
      /* 'leer (0)' ist bei den Nichtnegativ-Feldern zulässig — dort muss die
         Domäne durchlassen, sonst wäre sie zu eng. */
      const f = domainFields().find(x => x.key === key);
      const erlaubt = checkField(f, bad) === null;
      if (erlaubt) continue;
      assert.ok(!urteil.ok, `${key} = ${label} kommt durch die Sperre`);
      assert.ok(urteil.bad.has(key), `${key} = ${label} wird nicht markiert`);
    }
  });
}

test('sperre: zusammenfallende Grenzenpaare werden abgewiesen', () => {
  for (const [a, b, val] of [['gateMin', 'gateMax', 40], ['dmin', 'dmax', 120],
    ['wallMin', 'wallMax', 3], ['fillMin', 'fillMax', 50]]) {
    const v = Object.assign(defaults(), { [a]: val, [b]: val });
    const urteil = checkValues(v);
    const strikt = PAIRS.find(r => r.a === a && r.b === b && r.op === '<');
    if (!strikt) continue;         // '<=' erlaubt Gleichheit bewusst
    assert.ok(!urteil.ok, `${a} = ${b} = ${val} kommt durch die Sperre`);
    assert.ok(urteil.bad.has(a) && urteil.bad.has(b), `${a}/${b} nicht markiert`);
  }
  /* dmin = dmax = 120 macht die Kolben-Ø-Achse zur Länge null — genau der
     Fall aus H-17. Er ist jetzt vor dem Diagramm gestoppt. */
  const v = Object.assign(defaults(), { dmin: 120, dmax: 120 });
  assert.equal(checkValues(v).ok, false);
});

/* ── Die Sperre steht nie im Weg ───────────────────────────────────────── */

test('sperre: die Vorgabewerte kommen durch — sonst wäre die Anwendung tot', () => {
  const urteil = checkValues(defaults());
  assert.ok(urteil.ok, 'Vorgaben verletzen die Domäne: ' + urteil.msgs.join(' · '));
});

/* Jede mitgelieferte Legierung, Maschine und jedes Bauteil muss die Domäne
   erfüllen. Ein Preset, das die Sperre auslöst, wäre für den Anwender eine
   Sackgasse: er wählt es aus der Liste und das Dashboard friert ein. */
test('sperre: jede Voreinstellung erfüllt die Domäne', () => {
  ladeSkripte(['alloys.js', 'machines.js', 'parts.js'].map(datei => 'shared/examples/' + datei));
  const quellen = [
    ['Legierung', globalThis.__ALLOYS__ && globalThis.__ALLOYS__.alloys],
    ['Maschine', globalThis.__MACHINES__ && globalThis.__MACHINES__.machines],
    ['Bauteil', globalThis.__PARTS__ && globalThis.__PARTS__.parts],
  ];
  let geprueft = 0;
  for (const [art, liste] of quellen) {
    assert.ok(Array.isArray(liste) && liste.length, `${art}-Presets nicht geladen`);
    for (const p of liste) {
      const v = Object.assign(defaults(), p.fields || {});
      /* Genau der Weg, den die Anwendung geht: Preset übernehmen, dann die
         abhängigen Werte nachführen (core/state.js, ui/presets.js). */
      clampToDomain(v);
      /* Ohne die abgeleiteten Grenzen: ein Maschinen-Preset sagt nichts über
         das Bauteil. Ob der Schuss in die Kammer passt, ist eine Aussage über
         die Kombination — dafür der Test darunter. */
      const urteil = checkValues(v, { abgeleitet: false });
      assert.ok(urteil.ok,
        `${art} „${p.id || p.name}" verletzt die Domäne: ${urteil.msgs.join(' · ')} ` +
        `[${[...urteil.bad].map(k => k + '=' + v[k]).join(', ')}]`);
      geprueft++;
    }
  }
  assert.ok(geprueft >= 10, `nur ${geprueft} Presets geprüft`);
});

/* Realistische Betriebspunkte müssen durchkommen — die Plausibilitätsgrenzen
   sind nicht dazu da, Arbeit zu verhindern. Kleinstmaschine bis Großanlage. */
test('sperre: von der 400-kN-Zink- bis zur 44.000-kN-Anlage kommt alles durch', () => {
  const faelle = [
    ['Zink-Warmkammer klein', { force: 400, injForce: 60, vmax: 4, dmin: 30, dmax: 50,
      diam: 40, lmin: 100, lmax: 200, length: 150, sealStroke: 60, part: 0.05,
      runner: 0.02, overflow: 0.01, biscuit: 0.01, density: 6600, densitySolid: 6900,
      Tcast: 420, Tflow: 390, Tliq: 387, Tsol: 380, Tdie: 180, gate: 60, psel: 250 }],
    ['Aluminium groß', { force: 44000, injForce: 3500, vmax: 10, dmin: 140, dmax: 220,
      diam: 200, lmin: 700, lmax: 1400, length: 1200, sealStroke: 300, part: 45,
      runner: 8, overflow: 5, biscuit: 4, area: 2.4, gate: 12000, vent: 4000, psel: 900 }],
    ['Magnesium dünnwandig', { density: 1650, densitySolid: 1800, Tcast: 680, Tflow: 620,
      Tliq: 610, Tsol: 560, Tdie: 250, wall: 1.2, wallMin: 0.8, wallMax: 3, shrink: 0.7 }],
  ];
  for (const [name, f] of faelle) {
    const urteil = checkValues(Object.assign(defaults(), f));
    assert.ok(urteil.ok, `„${name}" wird fälschlich gesperrt: ${urteil.msgs.join(' · ')} ` +
      `[${[...urteil.bad].join(', ')}]`);
  }
});

/* ── Die Sperre rechnet wirklich nicht ─────────────────────────────────── */

/* Die kleine Maschine mit dem großen Kolben — der Fehler, den die Sperre
   aufgedeckt hat. Ohne das Nachführen rechnete das Dashboard auf einem
   Kammerquerschnitt, den die gewählte Maschine nicht hat. */
test('nachführen: eine kleinere Maschine bringt den Kolben-Ø mit', () => {
  ladeSkripte(['shared/examples/machines.js']);
  const klein = globalThis.__MACHINES__.machines.find(m => m.id === 'hcc200');
  assert.ok(klein, 'Preset hcc200 fehlt');

  const v = Object.assign(defaults(), klein.fields);
  assert.equal(checkValues(v).ok, false, 'ohne Nachführen wäre der Zustand gültig?');
  assert.equal(v.diam, 150, 'Ausgangslage: Kolben der Vorgabemaschine');

  const gezogen = clampToDomain(v);
  assert.ok(gezogen.includes('diam'), 'Kolben-Ø wurde nicht nachgeführt');
  assert.equal(v.diam, klein.fields.dmax, `Kolben-Ø ${v.diam} statt dmax ${klein.fields.dmax}`);
  assert.equal(v.length, klein.fields.lmax, `Kammerlänge ${v.length} statt lmax ${klein.fields.lmax}`);
  assert.ok(v.pAccOp <= v.pAcc, `Akkudruck ${v.pAccOp} über dem Maschinenmaximum ${v.pAcc}`);
  assert.ok(v.sealStroke <= v.length, 'Verschluss-Hub liegt außerhalb der Kammer');
  const nach = checkValues(v, { abgeleitet: false });
  assert.ok(nach.ok, 'nach dem Nachführen immer noch ungültig: ' + nach.msgs.join(' · '));

  /* Was das Nachführen NICHT reparieren kann und auch nicht soll: der
     Vorgabeschuss von 18,2 kg passt nicht in eine 350-mm-Kammer mit Ø70 mm.
     Vorher rechnete das Dashboard hier einen Füllgrad von 8522,6 %; jetzt
     sagt es, dass der Schuss nicht hineinpasst. */
  const voll = checkValues(v);
  assert.equal(voll.ok, false, 'ein 18-kg-Schuss in einer 200-t-Maschine gilt als gültig?');
  assert.match(voll.msgs.join(' '), /Dosiervolumen übersteigt das Kammervolumen/);
});

/* Die Lücke aus H-39: Werte, die der Browser durchließ und der Server abwies.
   Beide Seiten müssen dieselbe Antwort geben. */
test('lücke: was die Simulation abweist, weist der Browser schon ab', () => {
  const faelle = [
    ['runner', 0, /Anguss/i],
    ['biscuit', 0, /Pressrest/i],
    ['part', 1000, /Dosiervolumen/],
    ['overflow', 1000, /Dosiervolumen/],
    ['density', 20000, /Nachverdichtungshub/],
    ['shrink', 5, /Nachverdichtungshub/],
  ];
  for (const [k, x, muster] of faelle) {
    const urteil = checkValues(Object.assign(defaults(), { [k]: x }));
    assert.equal(urteil.ok, false, `${k} = ${x} kommt im Browser durch, die Simulation weist es ab`);
    assert.match(urteil.msgs.join(' · '), muster, `${k} = ${x}: falsche Begründung`);
  }
});

/* Was NICHT nachgeführt werden darf: die Zielbänder des Anwenders. Sie
   gehören ihm, nicht der Maschine. */
test('nachführen: Zielbänder bleiben unangetastet', () => {
  const v = Object.assign(defaults(), { fillMin: 35, fillMax: 70, gateMin: 25, gateMax: 60 });
  clampToDomain(v);
  assert.deepEqual([v.fillMin, v.fillMax, v.gateMin, v.gateMax], [35, 70, 25, 60]);
});

test('sperre: renderCard ruft calc() nicht auf, wenn gesperrt', async () => {
  const { renderCard } = await auslegung('ui/cards.js');
  let gerufen = 0;
  const def = { id: 'probe', title: 'Probe', calc: () => { gerufen++; return { series: [] }; } };
  const card = stubCard();
  renderCard(card, def, defaults(), null, 'Eingaben außerhalb des zulässigen Bereichs.');
  assert.equal(gerufen, 0, 'calc() wurde trotz Sperre gerufen');
  assert.match(card.data.err, /außerhalb des zulässigen Bereichs/);
  renderCard(card, def, defaults(), { t: [] });
  assert.equal(gerufen, 1, 'calc() wurde ohne Sperre nicht gerufen');
});

/* Minimale DOM-Attrappe: nur was renderCard anfasst. */
function stubCard() {
  const ctx = new Proxy({}, { get: (_, k) => (k === 'canvas' ? {} : () => {}) });
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const wrap = { clientWidth: 600, style: {}, querySelector: () => canvas };
  const card = {
    dataset: {}, data: null, shot: null,
    querySelector: s => (s === '.canvas-wrap' ? wrap : s === 'canvas' ? canvas : null),
    closest: () => null,
  };
  return card;
}

/* ── Die Übersicht bleibt am Code ──────────────────────────────────────── */

test('domäne: jede Paarregel nennt existierende Felder und einen Text', () => {
  const keys = new Set(domainFields().map(f => f.key));
  for (const r of PAIRS) {
    for (const k of [r.a, r.b, r.key, r.lo, r.hi].filter(Boolean))
      assert.ok(keys.has(k), `PAIRS nennt unbekanntes Feld „${k}"`);
    assert.ok(r.text && r.text.length > 10, `Paarregel ohne verständlichen Text: ${JSON.stringify(r)}`);
    assert.ok(['<', '<=', 'in'].includes(r.op), `Paarregel mit unbekanntem op: ${r.op}`);
  }
});

/* Auto-Felder schreiben berechnete Werte in den Zustand. Verließe so ein Wert
   die Domäne, bliebe die Anwendung an etwas hängen, das der Anwender nie
   eingetippt hat — und er könnte es nicht korrigieren, weil das Feld
   schreibgeschützt ist. Deshalb wird an der Quelle geklemmt. */
test('auto: berechnete Werte bleiben in der Domäne', async () => {
  const { state } = await auslegung('core/state.js');
  const { applyAuto } = await auslegung('core/autofit.js');
  const felder = Object.fromEntries(allFields().map(f => [f.key, f]));
  state.auto.gate = true; state.auto.vent = true;

  /* Zielgeschwindigkeit gegen null: die ideale Anschnittfläche geht gegen
     unendlich (A = V/(t·v)). Ohne Klemme stünden hier Millionen mm². */
  const v = Object.assign(defaults(), { gateMin: 0, gateMax: 0.001, vAirMax: 0.001 });
  applyAuto(v);
  assert.equal(checkField(felder.gate, v.gate), null, `gate = ${v.gate} verlässt die Domäne`);
  assert.equal(checkField(felder.vent, v.vent), null, `vent = ${v.vent} verlässt die Domäne`);
  assert.equal(v.gate, felder.gate.max, 'nicht auf die Obergrenze geklemmt');

  /* Normalfall: die Klemme darf nicht eingreifen. */
  const w = defaults();
  applyAuto(w);
  assert.ok(w.gate > 0 && w.gate < felder.gate.max, `gate = ${w.gate} wurde unnötig geklemmt`);
  state.auto.gate = false; state.auto.vent = false;
});

/* Der abgeblendete Stand nützt nichts, wenn die Regel auf Elemente zeigt, die
   es nicht gibt. Genau so ging schon einmal eine Warnung ins Leere („die-warn"
   existierte nicht). Die Verdrahtung wird deshalb geprüft, nicht angenommen. */
test('sperre: die Abblend-Regel trifft Elemente, die es gibt', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(path.join(site, 'tools/auslegung/css/main.css'), 'utf8');
  const html = readFileSync(path.join(site, 'tools/auslegung/index.html'), 'utf8');

  const regel = css.match(/body\.inputs-invalid[^{]*\{/);
  assert.ok(regel, 'keine .inputs-invalid-Regel in main.css');
  const ids = [...regel[0].matchAll(/#([\w-]+)/g)].map(m => m[1]);
  assert.ok(ids.length, 'die Regel nennt keine id');
  for (const id of ids)
    assert.ok(html.includes(`id="${id}"`), `.inputs-invalid zeigt auf #${id} — das Element gibt es nicht`);

  const cls = [...regel[0].matchAll(/\.(?!inputs-invalid)([\w-]+)/g)].map(m => m[1]);
  for (const c of cls)
    assert.ok(css.includes('.' + c + ' ') || css.includes('.' + c + '{') || css.includes('.' + c + ','),
      `.inputs-invalid zeigt auf .${c} — die Klasse kommt sonst nirgends vor`);

  /* Und die Seitenpipeline (Dashboard, Einzelseite, Werkbank) muss die
     Klasse auch setzen. */
  const js = readFileSync(path.join(site, 'tools/auslegung/js/ui/page.js'), 'utf8');
  assert.match(js, /classList\.toggle\('inputs-invalid'/, 'ui/page.js setzt die Klasse nicht');
});

/* ── Felder, die zum gewählten Vakuum-Modell nicht gehören ─────────── */

const { hiddenFields } = await auslegung('config/fields.js');

test('hiddenFields: je Vakuum-Modell nur die Felder, die es braucht', () => {
  const v = defaults();
  const sichtbar = k => !hiddenFields(v).has(k);
  v.vacModel = 'aus';
  for (const k of ['ventGap', 'ventLen', 'vacPump', 'vacTank', 'vacStart', 'vacEnd', 'vacEndStroke', 'vacEndTime'])
    assert.ok(!sichtbar(k), `ohne Vakuum: ${k} müsste ausgeblendet sein`);
  assert.ok(sichtbar('vent'), 'die Entlüftungsfläche treibt KPIs und bleibt immer sichtbar');
  v.vacModel = 'ideal';
  assert.ok(sichtbar('vacPump') && sichtbar('vacStart') && sichtbar('vacEnd'));
  assert.ok(!sichtbar('ventGap') && !sichtbar('ventLen') && !sichtbar('vacTank'), 'Sofort-Enddruck kennt keinen Kanal und keinen Tank');
  v.vacModel = 'conductance';
  assert.ok(sichtbar('ventGap') && sichtbar('ventLen') && !sichtbar('vacTank'));
  v.vacModel = 'tank';
  assert.ok(sichtbar('vacTank'));
  /* Ventilschluss: nur das Zahlenfeld des gewählten Modus */
  v.vacEnd = 'fill';
  assert.ok(!sichtbar('vacEndStroke') && !sichtbar('vacEndTime'));
  v.vacEnd = 'stroke';
  assert.ok(sichtbar('vacEndStroke') && !sichtbar('vacEndTime'));
  v.vacEnd = 'time';
  assert.ok(!sichtbar('vacEndStroke') && sichtbar('vacEndTime'));
});

test('checkValues: ein ausgeblendetes Feld sperrt die Rechnung nicht', () => {
  const v = defaults();
  v.vacModel = 'conductance';
  v.vacTank = 0;                       // ungültig, aber nur das Tankmodell liest es
  assert.equal(checkValues(v).ok, true);
  v.vacModel = 'tank';
  const urteil = checkValues(v);
  assert.equal(urteil.ok, false);
  assert.ok(urteil.bad.has('vacTank'));
});
