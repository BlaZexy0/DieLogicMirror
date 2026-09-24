/* Bauteilquelle — die Bauteil-Klappe eines Werkzeugs: Beispielteil wählen,
   eine Datei laden, das Netz aufbereiten und die Kennzahlen zeigen.

   Die Felder bekommt sie übergeben (`fields`: select, input, button, warn,
   note, facts; note und facts dürfen fehlen) — der Rahmen reicht die seiner
   Klappe (js/studio/shell.js, header.partFields; die Abstandsanalyse je
   Chip eine).

   Was sie über ein geladenes Teil weiß, gibt sie MIT: onLoad(model, name,
   { name, demoId, warning, note }). Vorher las der Rahmen Auswahl und
   Warnzeile hinterher aus der Seite zurück.

   Eine Datei aus dem Knopf der Klappe geht an onFile, wenn es das gibt: der
   Rahmen nimmt dort auch Pläne entgegen (js/studio/host.js). Sonst liest
   die Quelle sie selbst. Beispielteile kommen als fertige GLB aus
   assets/parts/ — genauso wie eine hochgeladene Datei; erkannt wird am
   Dateikopf, nicht an der Endung (js/studio/files.js, parsePart).

   Wer schnell hintereinander wählt, bekommt das ZULETZT Gewählte: jede
   Wahl zieht eine Nummer, und ein Laden, das überholt wurde, gibt auf.
   Vorher gewann das langsamere Beispielteil — das Bild zeigte die
   Ölwanne, Chip und Entwurfsschlüssel den Kühlkörper.
   Scheitert ein Laden, sagt es onError(text) (der Rahmen zeigt einen
   Toast): die Zeile der Warnung steht in der zugeklappten Bauteil-Klappe,
   dort las sie niemand. */

import { buildModel, openEdgeRatio } from './model.js';
import { DEMO_PARTS, loadDemo } from './demoparts.js';
import { fmt } from '../studio/format.js';
import { facts } from '../ui/controls.js';
import { readBuffer } from '../ui/common.js';
import { parsePart } from '../studio/files.js';

/* Auf ein vollständig gezeichnetes Bild warten — sonst steht der
   Fortschrittstext erst da, wenn die Rechnung schon vorbei ist. */
const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * @param opts.fields   { select, input, button, warn, note?, facts? }
 * @param opts.setBusy  text → der Schleier über dem Bild, null nimmt ihn weg
 * @param opts.onFile   file → eine Datei aus dem Knopf der Klappe; ohne: als Netz lesen
 * @param opts.onStart  name → ein Laden beginnt
 * @param opts.onLoad   (model, name, { name, demoId, warning, note }) → es ist da
 * @param opts.onError  text → ein Laden ist gescheitert
 */
export function mountPartSource({ fields, onStart, onLoad, onError = null, setBusy = null,
                                  onFile = null, filter = p => !p.pairOnly, start: startId = null }) {
  const f = fields;
  const sel = f.select;
  const veil = setBusy || (() => {});
  const list = DEMO_PARTS.filter(filter);
  /* Die Nummer der jüngsten Wahl (Beispielteil, Datei). */
  let seq = 0;
  const warn = text => { if (f.warn) f.warn.textContent = text; };
  /* Eine Meldung, die jemand sehen soll: in die Klappe UND nach außen. */
  const fail = text => {
    warn(text);
    if (onError) onError(text);
  };
  sel.innerHTML = list.map(p => '<option value="' + p.id + '">' + p.label + '</option>').join('');
  sel.addEventListener('change', () => pickDemo(sel.value));

  f.button.addEventListener('click', () => f.input.click());
  f.input.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!onFile) { readFile(file); return; }
    onFile(file);
    e.target.value = '';
  });

  /* Eine Datei als Netz lesen. Ein gescheiterter Lesevorgang (Datei entfernt,
     Rechte, Lesefehler) bleibt nicht stumm: der Schleier geht, die Meldung
     kommt (js/ui/common.js, readBuffer). */
  async function readFile(file) {
    const my = ++seq;
    let part;
    try { part = parsePart(await readBuffer(file), file.name); }
    catch (err) {
      if (my === seq) { veil(null); fail(err.message); }
      return false;
    }
    if (my !== seq) return false;                                 // inzwischen anders gewählt
    return loadFile(part.tris, file.name, part.note, my);
  }

  /** Eine Datei übernehmen. Das Beispielteil gilt erst als abgewählt, wenn
      sie wirklich geladen wird — ein zu kleines Netz ließ die Liste sonst
      leer zurück. → true, wenn sie geladen wurde. */
  async function loadFile(tris, name, note, token) {
    const my = token || ++seq;
    const before = sel.selectedIndex;
    sel.selectedIndex = -1;
    const ok = await load(tris, name, note, my);
    if (!ok && my === seq) sel.selectedIndex = before;
    return ok;
  }

  /** Ein Netz übernehmen → true, wenn es geladen wurde. `token`: die Nummer
      der Wahl, die hierher führte (sonst zieht load() eine eigene);
      `demoId`: das Beispielteil, wenn es eines ist. */
  async function load(tris, name, note, token, demoId = null) {
    const my = token || ++seq;
    if (!tris || tris.length < 36) {
      veil(null);
      fail('Das Netz enthält weniger als vier Dreiecke.');
      return false;
    }
    if (my !== seq) return false;
    if (onStart) onStart(name);
    /* Nicht jede Seite will die Beschreibung des Beispielteils sehen. */
    if (f.note) f.note.textContent = note || '';
    /* Die Größenwarnung stand bisher in showFacts — also NACH buildModel,
       das bei 197k Dreiecken rund 1,5 s den Hauptthread blockiert. Sie kam
       damit an, wenn die Arbeit längst getan war. Jetzt vorher, aus der
       Rohzahl der Dreiecke. */
    const raw = tris.length / 9;
    warn(raw > BIG_MESH
      ? 'Großes Netz (' + fmt(raw, 0) + ' Dreiecke): Aufbereitung und jede Rechnung dauern entsprechend.'
      : '');
    veil(raw > BIG_MESH ? 'Netz aufbereiten (' + fmt(raw, 0) + ' Dreiecke) …' : 'Netz aufbereiten …');
    await frame();
    /* Während des Bildes kann schon die nächste Wahl gekommen sein. */
    if (my !== seq) return false;
    try {
      const model = buildModel(tris);
      const warning = showFacts(model, f);
      await onLoad(model, name, { name, demoId, warning, note: note || '' });
      return true;
    } catch (err) {
      fail('Das Netz konnte nicht aufbereitet werden: ' + err.message);
      console.error(err);
      return false;
    } finally {
      if (my === seq) veil(null);
    }
  }

  /** Ein Beispielteil laden — die Liste zeigt es gleich als gewählt. */
  async function pickDemo(partId) {
    const my = ++seq;
    sel.value = partId;
    veil('Beispielteil laden …');
    try {
      const p = await loadDemo(partId);
      if (my !== seq) return false;                               // inzwischen anders gewählt
      return await load(p.tris, p.label, p.note, my, partId);
    } catch (err) {
      if (my !== seq) return false;
      veil(null);
      fail('Beispielteil „' + partId + '" konnte nicht geladen werden: ' + err.message);
      console.error(err);
      return false;
    }
  }

  /* Beispielteil aus der Adresszeile (?part=…) oder das vorgegebene. */
  function start() {
    const wanted = new URLSearchParams(location.search).get('part');
    const first = list.find(p => p.id === wanted) || list.find(p => p.id === startId) || list[0];
    return pickDemo(first.id);
  }

  return {
    load, loadFile, pickDemo, start, fields: f,
    /** Keines gewählt: die Liste zeigt sonst von sich aus das erste Teil —
        der Angussdesigner beginnt ohne Bauteil. */
    deselect() { sel.selectedIndex = -1; },
    /** Eine Meldung in die Zeile der Klappe. */
    warn
  };
}

/* Ab hier gilt ein Netz als groß: Aufbereitung und Rechnungen sind dann
   spürbar, und der Anwender soll das VOR der Wartezeit erfahren. */
const BIG_MESH = 150000;

/* Kennzahlen in die Klappe, alle Hinweise zum Netz in die Warnzeile.
   → der Text der Hinweise ('' ohne). */
function showFacts(m, f) {
  const s = m.bounds.size;
  if (f.facts) {
    facts(f.facts, [
      ['Dreiecke', fmt(m.faceCount, 0)
        + (m.faceCount !== m.rawFaceCount ? ' (roh ' + fmt(m.rawFaceCount, 0) + ')' : '')],
      ['Abmessungen', s.map(v => fmt(v)).join(' × ') + ' mm'],
      ['Volumen', fmt(m.volume / 1000) + ' cm³'],
      ['Wanddicke 2V/A', m.wall !== null ? fmt(m.wall) + ' mm' : '—'],
      ['Oberfläche', fmt(m.totalArea / 100) + ' cm²']
    ]);
  }

  /* Alle Hinweise sammeln statt beim ersten aufzuhören: die Größenwarnung
     stand vorher mit return vor der Mannigfaltigkeitsprüfung — bei einem
     großen UND offenen Netz erfuhr man nur das Erste. */
  const notes = [];
  if (m.faceCount > BIG_MESH) {
    notes.push('Großes Netz (' + fmt(m.faceCount, 0) + ' Dreiecke): jede Rechnung dauert entsprechend.');
  }
  if (m.flippedFaces) {
    notes.push(fmt(m.flippedFaces, 0) + ' Dreiecke waren gegenläufig gewickelt und wurden ausgerichtet.');
  }
  const openFrac = openEdgeRatio(m);
  if (openFrac > 0.005) {
    notes.push('Achtung: ' + fmt(100 * openFrac, 1)
      + ' % der Kanten haben keinen Nachbarn: das Netz ist offen oder nicht mannigfaltig.');
  }
  if (m.volume <= 0 && openFrac <= 0.005) {
    notes.push('Das Volumen ist nicht positiv: die Dreiecke zeigen nach innen oder das Netz überlappt sich.');
  }
  const text = notes.join(' ');
  if (f.warn) f.warn.textContent = text;
  return text;
}
