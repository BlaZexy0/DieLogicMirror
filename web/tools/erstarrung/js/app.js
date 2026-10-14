/* Erstarrungssimulation (/tools/erstarrung/) — Einstieg und Verdrahtung.

   Der zweite Assistent unter „Simulation", neben „Füllsimulation":
   derselbe Rahmen des 3D-Studios mit einer Leiste von Schritten, die wie ein
   Ablaufplan nacheinander frei werden.

     1 Körper       Bauteil, Anguss, Pressrest, Überläufe aus STL/GLB
     2 Anguss       der Angussdesigner des Studios — oder aus Datei
     3 Überläufe    der Überlaufdesigner des Studios — oder aus Datei / ohne
     4 Kolben       die Kreisfläche des Pressrests, dahinter die Kolbenspitze
     5 Form         Formblock (Stahl um das Gussteil), Trennebene, Hälften
     6 Kühlung      gerade Kühlkanäle (wahlweise)
     7 Netz         Zellgröße in Gussteil und Stahl
     8 Prozess      Legierung, Temperaturen, Nachdruck, ein Schuss / Zyklen
     9 Auswertung   Bilder, Graphiken und Bericht nach der Rechnung
    10 Fall         der OpenFOAM-Fall für dieLogicSolFoam als ZIP

   Körper, Designer und Rahmen wie bei „Füllsimulation" (dessen
   js/steps.js liefert den Schritt Körper); der Plan ist derselbe mit
   plan.sol dazu. Der Fall entsteht in einem Worker (js/worker.js →
   js/build.js → js/core/solcase.js). */

import { createHost } from '../../3d-studio/js/studio/host.js';
import { mountStages } from '../../3d-studio/js/studio/stages.js';
import { createAngussTool } from '../../3d-studio/js/runner/tool.js';
import { createUeberlaufTool } from '../../3d-studio/js/vents/tool.js';
import { createVorschlag } from '../../3d-studio/js/werkbank/vorschlag.js';
import { readGLBMeshes } from '../../3d-studio/js/part/glbio.js';
import { guessRole, processFromProject } from '../../simulation/js/plan.js';
import { createKoerperTool, readBodies } from '../../simulation/js/steps.js';
import { createSolPlan } from './plan.js';
import { createSolLayer, createKolbenTool, createFormTool, createKuehlungTool, createNetzTool, createProzessTool, createAuswertungTool, createExportTool } from './steps.js';
import { build as buildDirect } from './build.js';
import { HELP } from './help.js';

export const FORMAT = 'dielogic-erstarrung';
export const FORMAT_VERSION = 1;
const EXAMPLE = '/examples/gusstraube.glb';

const mount = document.getElementById('studio');
mount.setAttribute('data-page', 'erstarrung');
const host = createHost({
  mount, id: 'erstarrung', title: 'Erstarrungssimulation', help: HELP, start: 'gearbox_cover',
  sceneOpts: { cameraStart: [420, -760, 520], target: [0, 0, -40], minDistance: 3, maxDistance: 30000 }
});
const { shell } = host;
host.ready = false;

const plan = createSolPlan();
/* Gieß- und Formtemperatur aus der Auslegung des Projekts; die Schmelze am
   Füllende 20 K unter der Gießtemperatur */
{
  const d = processFromProject(window.__PROJECT__);
  if (d.Tcast > 0) { plan.sol.process.Tcast = d.Tcast; plan.sol.process.Tfill = d.Tcast - 20; }
  if (d.Tdie > 0) plan.sol.process.Tdie = d.Tdie;
}
const layer = createSolLayer(host, plan);

/* ── Die Schritte ────────────────────────────────────────────── */
const svg = d => '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + d + '</svg>';
const ICON = {
  koerper: svg('<path d="M13 2 L23 8 L13 14 L3 8 Z"/><path d="M3 8 L3 18 L13 24 L23 18 L23 8"/><path d="M13 14 L13 24"/>'),
  anguss: svg('<circle cx="5" cy="13" r="3"/><path d="M8 13 H13 C16 13 16 7 19 7 H23"/><path d="M13 13 C16 13 16 19 19 19 H23"/>'),
  ueberlauf: svg('<path d="M3 8 L11 8 L11 18 L3 18 Z"/><path d="M11 13 H14"/><path d="M14 10 H20 a3 3 0 0 1 0 6 H14 Z"/>'),
  form: svg('<rect x="3" y="4" width="20" height="18" rx="1"/><path d="M3 13 H23" stroke-dasharray="2.5 2"/><path d="M9 9 H17 V17 H9 Z"/>'),
  kuehlung: svg('<rect x="3" y="4" width="20" height="18" rx="1"/><circle cx="8.5" cy="9" r="2"/><circle cx="17.5" cy="9" r="2"/><circle cx="8.5" cy="17" r="2"/><circle cx="17.5" cy="17" r="2"/>'),
  einlass: svg('<ellipse cx="13" cy="7" rx="8" ry="3"/><path d="M5 7 V19 a8 3 0 0 0 16 0 V7"/><path d="M13 25 V15 M10 18 L13 15 L16 18"/>'),
  auslass: svg('<path d="M4 20 H22"/><path d="M8 20 V12 H18 V20"/><path d="M13 12 V3 M10 6 L13 3 L16 6"/>'),
  netz: svg('<path d="M3 3 H23 V23 H3 Z"/><path d="M3 10 H23 M3 16 H23 M10 3 V23 M16 3 V23"/>'),
  schuss: svg('<path d="M3 22 H23"/><path d="M3 22 V4"/><path d="M5 19 C9 18 10 9 14 9 H22"/>'),
  prozess: svg('<path d="M11 4 a2.5 2.5 0 0 1 5 0 V15.5 a5 5 0 1 1 -5 0 Z"/><path d="M13.5 9 V18.5"/><circle cx="13.5" cy="19.5" r="1.6"/><path d="M19 7 H22 M19 11 H22"/>'),
  auswertung: svg('<rect x="3" y="5" width="20" height="15" rx="1.5"/><path d="M6 8 V17" stroke-width="2.4"/><path d="M10 16 L14 11 L17 14 L21 9"/>'),
  fall: svg('<path d="M6 3 H16 L21 8 V23 H6 Z"/><path d="M16 3 V8 H21"/><path d="M13.5 11 V19 M10 16 L13.5 19.5 L17 16"/>')
};

const vorschlag = createVorschlag({ part: host.part });
let tools = {};
const app = {
  refresh, loadExample, addFiles, removePart, build, nextPrimary,
  get tools() { return tools; }
};

const STEPS = [
  { id: 'koerper', label: 'Körper', title: 'Die Körper der Form laden und ihre Rollen setzen', icon: ICON.koerper,
    lead: 'Die Gusskörper als STL oder GLB laden, in mm im Bauteilsystem (Trennebene z = 0) — Bauteil, Anguss, Pressrest, Überläufe; mehrere auf einmal, auch per Ablegen ins Bild. Kommen Anguss und Pressrest (oder Überläufe) als Dateien, entfallen die Schritte der Designer.',
    done: () => plan.has('part'), why: 'Es fehlt ein Körper mit der Rolle Bauteil.',
    tools: [{ id: 'koerper', create: g => createKoerperTool(g, { plan, layer, app }) }] },
  /* Anguss und Überläufe: nur der Designer — geladen wird unter „Körper".
     Kommen Anguss und Pressrest (bzw. Überläufe) dort aus Dateien, braucht
     es den Schritt nicht: er verschwindet aus der Leiste (skip). */
  { id: 'anguss', label: 'Anguss', title: 'Anguss und Pressrest im Angussdesigner', icon: ICON.anguss,
    lead: 'Anguss und Pressrest im Angussdesigner des Studios bauen. Für das Netz verlängert die Seite die Anschnitte um zwei Zellen ins Bauteil.',
    skip: () => fromFiles('runner', 'biscuit'),
    done: () => plan.has('runner') || plan.has('biscuit'),
    why: 'Im Angussdesigner einen Anguss bauen — oder Anguss und Pressrest unter „Körper" laden.',
    tools: [{ id: 'anguss', create: g => createAngussTool(g, {
      partFrame: true, propose: vorschlag.attach,
      castVolume: () => (host.part.model ? Math.abs(host.part.model.volume) + tools.ueberlauf.link.volume() : NaN)
    }) }] },
  { id: 'ueberlauf', label: 'Überläufe', title: 'Überläufe im Überlaufdesigner (wahlweise)', icon: ICON.ueberlauf,
    lead: 'Überläufe im Überlaufdesigner setzen. Der Schritt ist wahlweise: ohne Überläufe geht es mit dem Knopf unter dem des Designers weiter.',
    skip: () => fromFiles('overflow'),
    optional: true,
    done: () => plan.has('overflow'),
    tools: [{ id: 'ueberlauf', create: g => createUeberlaufTool(g, {}) }] },
  { id: 'kolben', label: 'Kolben', title: 'Die Kolbenfläche am Pressrest', icon: ICON.einlass,
    lead: 'Die Kreisfläche des Pressrests, an der der Kolben anliegt. Vorgeschlagen ist die größte Kreisfläche; „Andere Fläche wählen" nimmt eine andere. Dahinter liegt die Kolbenspitze aus Kupfer bis zum Rand des Formblocks.',
    done: () => !!plan.inlet, why: 'Die Kolbenfläche ist noch nicht gewählt.',
    tools: [{ id: 'kolben', create: g => createKolbenTool(g, { plan, layer, app }) }] },
  { id: 'form', label: 'Form', title: 'Formblock und Trennebene', icon: ICON.form,
    lead: 'Wie viel Stahl um das Gussteil liegt und wo die Trennebene ist. Die feste Formhälfte ist die Seite des Kolbens (gelb), die bewegliche rosa; beide aus Warmarbeitsstahl.',
    done: () => plan.sol.die.margin > 0, why: 'Der Formblock fehlt.',
    tools: [{ id: 'form', create: g => createFormTool(g, { plan, app }) }] },
  { id: 'kuehlung', label: 'Kühlung', title: 'Kühlkanäle in der Form (wahlweise)', icon: ICON.kuehlung,
    lead: 'Gerade Kühlkanäle mit Ø, Wasser und Wärmeübergang. „Vorschlag setzen" legt je Formhälfte zwei; ohne Kanäle gibt die Form ihre Wärme nur nach außen ab.',
    optional: true,
    done: () => plan.sol.channels.length > 0,
    tools: [{ id: 'kuehlung', create: g => createKuehlungTool(g, { plan, layer, app }) }] },
  { id: 'netz', label: 'Netz', title: 'Zellgröße in Gussteil und Form', icon: ICON.netz,
    lead: 'Das Netz für snappyHexMesh: im Gussteil und in einem Band um es herum die Zellgröße des Gussteils, weiter draußen im Stahl größere Zellen. Vorgeschlagen sind zwei Zellen über die dünnste Bauteilwand.',
    done: () => plan.sol.mesh.cell > 0 && plan.sol.mesh.nProc >= 1, why: 'Die Zellgröße fehlt.',
    tools: [{ id: 'netz', create: g => createNetzTool(g, { plan, app }) }] },
  { id: 'prozess', label: 'Prozess', title: 'Legierung, Temperaturen, Nachdruck, Zyklen', icon: ICON.prozess,
    lead: 'Die Legierung, Temperaturen von Schmelze, Form und Kolben, Füllzeit und Nachdruck — ein Schuss bis das Gussteil fest ist, oder mehrere Zyklen mit Öffnen und Sprühen.',
    done: () => tools.prozess && tools.prozess.valid(),
    get why() { return tools.prozess ? tools.prozess.why() : ''; },
    tools: [{ id: 'prozess', create: g => createProzessTool(g, { plan, app }) }] },
  { id: 'auswertung', label: 'Auswertung', title: 'Bilder, Graphiken und Bericht', icon: ICON.auswertung,
    lead: 'Was nach der Rechnung entsteht: Bilder je Kennwert und Ansicht, die Erstarrungsfolge als Bildreihe, Graphiken der Erstarrung und der Temperaturen und ein Bericht (auswertung/bericht.html).',
    done: () => plan.sol.post.criteria.length > 0 && plan.sol.post.views.length > 0, why: 'Mindestens ein Kennwert und eine Ansicht.',
    tools: [{ id: 'auswertung', create: g => createAuswertungTool(g, { plan, app }) }] },
  { id: 'fall', label: 'Fall', title: 'Den OpenFOAM-Fall herunterladen', icon: ICON.fall,
    lead: 'Der Fall als ZIP (JJJJ-MM-TT_Name_Erstarrung): im Hauptordner Allrun und die Skripte der Auswertung, in simulation/ der OpenFOAM-Fall für dieLogicSolFoam. Entpacken, OpenFOAM v2606 laden, ./Allrun — am Ende liegt der Bericht in auswertung/bericht.html.',
    done: () => plan.exported, why: '',
    tools: [{ id: 'export', create: g => createExportTool(g, { plan, app }) }] }
];

const stages = mountStages(host, { stages: STEPS.map(s => ({ ...s })) });
tools = stages.tools;

/* ── Ablaufplan: ein Schritt öffnet sich erst, wenn die davor erledigt sind ── */
/** Kommen alle diese Rollen unter „Körper" aus Dateien (nicht aus einem Designer)? */
const DESIGNED = ['runner', 'biscuit', 'vents'];
function fromFiles(...roles) {
  return roles.every(r => plan.included().some(b => b.role === r && !DESIGNED.includes(b.src)));
}
const stepIndex = id => STEPS.findIndex(s => s.id === id);
const isSkipped = s => { try { return !!(s.skip && s.skip()); } catch { return false; } };
/* Für den Ablauf erledigt: übersprungen, wahlweise oder fertig. */
const isDone = s => { if (isSkipped(s) || s.optional) return true; try { return !!s.done(); } catch { return false; } };
function firstOpen() { const i = STEPS.findIndex(s => !isDone(s)); return i < 0 ? STEPS.length - 1 : i; }
const unlocked = id => { const s = STEPS[stepIndex(id)]; return !!s && !isSkipped(s) && stepIndex(id) <= firstOpen(); };
/** Der nächste Schritt, den es gibt (übersprungene zählen nicht). */
const nextOf = i => STEPS.slice(i + 1).find(s => !isSkipped(s)) || null;
const rail = shell.ui('rail');
rail.classList.add('sim-flow');
/* Wo man schon war: erst dann zeigt die Leiste einen Schritt als erledigt —
   Prozess und Auswertung sind mit ihren Vorgaben schon „fertig", bevor man
   sie gesehen hat. */
const seen = new Set();
function lockRail() {
  const open = firstOpen(), here = stepIndex(shell.group);
  let n = 0;
  for (const b of rail.querySelectorAll('[data-stage]')) {
    const i = stepIndex(b.getAttribute('data-stage')), s = STEPS[i];
    const skip = isSkipped(s);
    b.hidden = skip;
    if (skip) continue;
    /* durchgezählt wird, was in der Leiste steht */
    const num = b.querySelector('.st-step-num');
    if (num) num.textContent = String(++n);
    const locked = i > open;
    b.classList.toggle('locked', locked);
    /* Erledigt zeigt die Fläche des Schritts (keine Punkte): fertig — ein
       wahlweiser Schritt ohne Inhalt erst, wenn man an ihm vorbei ist */
    let done;
    try { done = !!s.done(); } catch { done = false; }
    b.classList.toggle('sim-done', (done && (seen.has(s.id) || i < here)) || (!!s.optional && here > i));
    b.setAttribute('aria-disabled', locked ? 'true' : 'false');
    b.title = locked ? s.title + ' — erst ' + STEPS.slice(0, i).filter(x => !isDone(x)).map(x => x.label).join(', ')
      : s.title + (s.optional ? ' — wahlweise' : '');
  }
}
const block = ev => {
  const b = ev.target.closest && ev.target.closest('[data-stage]');
  if (!b || unlocked(b.getAttribute('data-stage'))) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  const i = stepIndex(b.getAttribute('data-stage'));
  const need = STEPS.slice(0, i).filter(s => !isDone(s));
  if (need.length) shell.toast('Erst ' + need.map(s => '„' + s.label + '"').join(', ') + ': ' + need[0].why, { ms: 6000 });
};
rail.addEventListener('click', block, true);
/* Tasten wie in jeder Leiste — aber nur über die Schritte, die dastehen und offen sind. */
rail.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' || ev.key === ' ') { block(ev); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) return;
  const list = [...rail.querySelectorAll('[data-stage]')].filter(b => unlocked(b.getAttribute('data-stage')));
  const i = list.indexOf(ev.target.closest && ev.target.closest('[data-stage]'));
  if (i < 0 || !list.length) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  const j = ev.key === 'ArrowDown' ? (i + 1) % list.length : ev.key === 'ArrowUp' ? (i - 1 + list.length) % list.length : ev.key === 'Home' ? 0 : list.length - 1;
  stages.activate(list[j].getAttribute('data-stage'));
  list[j].focus();
}, true);

/** „Weiter" eines Schritts: zum nächsten, den es gibt — gesperrt, solange
    der Schritt nicht erledigt ist. Der Überlauf-Schritt ist wahlweise: ohne
    Überläufe heißt der Knopf so. */
function nextStep(stage) {
  const i = stepIndex(stage), s = STEPS[i], next = nextOf(i);
  if (!next) return null;
  const ok = isDone(s);
  const label = s.optional && !s.done() ? 'Ohne ' + s.label + ' weiter: ' + next.label : 'Weiter: ' + next.label;
  return { label, next: next.id, ok, reason: ok ? '' : s.why };
}
function nextPrimary(stage) {
  const n = nextStep(stage);
  return n && { label: n.label, onClick: () => stages.activate(n.next), disabled: !n.ok, reason: n.reason };
}

/* Die Designer haben ihren eigenen Hauptknopf; ihr „Weiter" steht darunter
   im Zusatzstreifen der Aktionsleiste. */
const DESIGNER_STAGES = ['anguss', 'ueberlauf'];
function designerNext(st = shell.group) {
  if (!DESIGNER_STAGES.includes(st)) { shell.setActionsExtra(null); return; }
  const n = nextStep(st);
  if (!n) { shell.setActionsExtra(null); return; }
  let btn = shell.ui('sim-next');
  if (!btn) {
    shell.setActionsExtra('<button type="button" class="btn btn-sm btn-outline block-btn" data-ui="sim-next"></button>'
      + '<div class="st-hintline" data-ui="sim-next-note" hidden></div>');
    btn = shell.ui('sim-next');
    btn.addEventListener('click', () => { const m = nextStep(shell.group); if (m && m.ok) stages.activate(m.next); });
  }
  btn.textContent = n.label;
  btn.disabled = !n.ok;
  const note = shell.ui('sim-next-note');
  note.textContent = n.reason;
  note.hidden = !n.reason;
}
shell.onMode((id, prev, info) => { if (info.group !== info.prevGroup) { shell.setActionsExtra(null); designerNext(info.group); } });

/* Über jedem Schritt seine Überschrift und was er tut — auch über den
   Designern, deren Panel sonst gleich mit ihren Reitern beginnt. */
const head = document.createElement('div');
head.className = 'sim-head';
head.innerHTML = '<div class="sim-head-step"></div><h2></h2><p></p>';
shell.ui('panel').prepend(head);
function paintHead() {
  const s = STEPS[stepIndex(shell.group)];
  head.hidden = !s;
  if (!s) return;
  const shown = STEPS.filter(x => !isSkipped(x));
  head.querySelector('.sim-head-step').textContent = 'Schritt ' + (shown.indexOf(s) + 1) + ' von ' + shown.length + (s.optional ? ' · wahlweise' : '');
  head.querySelector('h2').textContent = s.label;
  head.querySelector('p').textContent = s.lead || '';
}
shell.onMode((id, prev, info) => { if (info.group !== info.prevGroup) { seen.add(info.group); lockRail(); paintHead(); dieShown(); } });
/* Formblock und Kanäle erst ab dem Kolben: vorher geht es nur um die Körper */
function dieShown() { layer.dieVisible = stepIndex(shell.group) >= stepIndex('kolben'); }

function refresh() {
  /* Steht man auf einem Schritt, den es nicht mehr gibt (Anguss eben als
     Datei geladen), geht es zum ersten offenen. */
  const cur = STEPS[stepIndex(shell.group)];
  if (cur) seen.add(cur.id);
  if (cur && isSkipped(cur)) stages.activate(STEPS[firstOpen()].id);
  stages.refreshRail();
  lockRail();
  host.refreshActions();
  designerNext();
  paintHead();
}
plan.on(() => refresh());

/* ── Körper: Dateien, Bauteil des Studios, Designer ─────────── */
let hostPartKey = null;
/** Dateien laden → Körper. Das erste Bauteil wird das Bauteil des Studios
    (an ihm bauen die Designer), alles andere kommt in den Plan. */
async function addFiles(files, forceRole = null) {
  let list;
  try { list = await readBodies(files); } catch (err) { shell.toast(err.message, { ms: 8000 }); return []; }
  for (const b of list) {
    const role = forceRole || guessRole(b.name);
    if (role === 'part' && !plan.bodies.some(x => x.src === 'part')) {
      hostPartKey = 'part:' + b.name;
      await host.part.load(b.tris, b.name);
    } else {
      plan.put({ key: 'file:' + b.name + ':' + plan.bodies.length, name: b.name, role, src: 'file', tris: b.tris });
    }
  }
  if (list.length) host.changed(list.length === 1 ? '„' + list[0].name + '" geladen' : list.length + ' Körper geladen');
  refresh();
  return list;
}
/** Das Bauteil des Studios entfernen. Der Rahmen kennt kein „ohne
    Bauteil": sein Netz bleibt geladen, bis ein neues kommt — die Seite
    nimmt es aus dem Plan, „Körper" verbirgt es im Bild, der Kopf zeigt
    keins. Liegt ein weiteres Bauteil als Datei da, wird das das Bauteil
    des Studios. Ohne Bauteil ist „Körper" nicht erledigt: Weiter und die
    Schritte danach bleiben gesperrt. */
async function removePart() {
  const b = plan.bodies.find(x => x.src === 'part');
  if (!b) return;
  plan.remove(b.id);
  const next = plan.included().find(x => x.src === 'file' && x.role === 'part');
  if (next) {
    plan.remove(next.id);
    hostPartKey = 'part:' + next.name;
    await host.part.load(next.tris, next.name);
  } else {
    host.part.deselect();
    shell.header.setPart('', null);
  }
  refresh();
}
async function loadExample() {
  shell.loading('Beispiel laden …');
  try {
    const buf = await (await fetch(EXAMPLE)).arrayBuffer();
    for (const b of [...plan.bodies]) if (b.src === 'file') plan.remove(b.id);
    plan.inlet = null; plan.outlets = [];
    plan.title = 'Gusstraube';
    plan.sol.channels = [];
    const meshes = readGLBMeshes(buf);
    const part = meshes.find(m => /bauteil/i.test(m.name));
    for (const m of meshes) if (m !== part) plan.put({ key: 'file:' + m.name, name: m.name, role: guessRole(m.name), src: 'file', tris: Float64Array.from(m.tris) });
    if (part) await host.part.load(Float64Array.from(part.tris), 'Bauteil (Gusstraube)');
    shell.toast('Beispiel Gusstraube: Bauteil, Anguss, Pressrest und Überläufe als Dateien geladen.');
  } catch (err) {
    shell.toast('Beispiel ließ sich nicht laden: ' + err.message, { ms: 8000 });
    console.error(err);
  } finally {
    shell.loading(null);
    refresh();
  }
}
/* Anschnittzungen: der Angussdesigner legt die Mündung genau an die
   Bauteilwand, die Anschnitt-Nut liegt über der Trennebene (z = 0 … h). Im
   Voxelfeld der Werkbank reicht das; im Netz der Rechnung berühren sich
   Anguss und Bauteil dann nur auf einem Hauch (gemessen 0,05 mm), und das
   Bauteil hängt ab. Je Mündung ein Quader mit dem Querschnitt des
   Anschnitts (Breite w quer, Höhe h über der Trennebene), 1 mm zurück in
   den Anguss und zwei Zellen weit über das Bauteil — so liegt die Nut auf
   der Kavität auf, wie in der Form. */
function tongueTris(m, L) {
  const d = [m.dir[0], m.dir[1], 0], dl = Math.hypot(d[0], d[1]) || 1;
  const u = [d[0] / dl, d[1] / dl, 0], wv = [-u[1], u[0], 0];
  const o = [0, 1, 2].map(k => m.pos[k] - u[k] * 1 - wv[k] * m.w / 2);
  const ax = [u.map(x => x * (L + 1)), wv.map(x => x * m.w), [0, 0, m.h]];
  const P = (a, b, c) => [0, 1, 2].map(k => o[k] + a * ax[0][k] + b * ax[1][k] + c * ax[2][k]);
  const v = [P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0), P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)];
  const q = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 4, 7, 3], [1, 2, 6, 5]];
  const out = [];
  for (const [a, b, c, e] of q) out.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[e]);
  /* nach außen orientieren (Divergenzsatz) */
  let vol = 0;
  for (let i = 0; i < out.length; i += 9) vol += out[i] * (out[i + 4] * out[i + 8] - out[i + 5] * out[i + 7]) - out[i + 1] * (out[i + 3] * out[i + 8] - out[i + 5] * out[i + 6]) + out[i + 2] * (out[i + 3] * out[i + 7] - out[i + 4] * out[i + 6]);
  if (vol < 0) for (let i = 0; i < out.length; i += 9) for (let k = 0; k < 3; k++) { const t = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = t; }
  return out;
}
function syncDesigners() {
  const soups = tools.anguss.link.soups();
  const put = (key, name, role, src, tris) => {
    const b = plan.bodies.find(x => x.key === key);
    if (tris && tris.length >= 36) plan.put({ key, name, role, src, tris: Float64Array.from(tris) });
    else if (b) plan.remove(b.id);
  };
  put('designer:runner', 'Anguss (Designer)', 'runner', 'runner', soups[0]);
  put('designer:biscuit', 'Pressrest (Designer)', 'biscuit', 'biscuit', soups[1]);
  put('designer:vents', 'Überläufe (Designer)', 'overflow', 'vents', tools.ueberlauf.link.tris());
  const mouths = soups.length ? tools.anguss.link.gateMouths() : [];
  const L = 2 * plan.sol.mesh.cell;
  put('designer:tongues', 'Anschnittzungen (Designer)', 'runner', 'runner', mouths.length ? mouths.flatMap(m => tongueTris(m, L)) : null);
}
/* Die Zungen wachsen mit der Zellgröße mit. */
plan.on(w => { if (w === 'sol' && plan.bodies.some(b => b.key === 'designer:tongues')) { const L = 2 * plan.sol.mesh.cell; if (L !== lastTongue) { lastTongue = L; try { syncDesigners(); } catch (err) { console.error(err); } } } });
let lastTongue = NaN;
host.on('runner', () => { try { syncDesigners(); } catch (err) { console.error(err); } refresh(); });
host.on('vents', () => { try { tools.anguss.link.syncVolume(); syncDesigners(); } catch (err) { console.error(err); } refresh(); });

/* ── Rechnungen: im Worker, sonst direkt ─────────────────────── */
function build(payload, progress) {
  if (typeof Worker === 'undefined') return buildDirect(payload, progress);
  return inWorker(payload, progress);
}
function inWorker(payload, progress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ev => {
      const m = ev.data;
      if (m.progress) progress(m.progress);
      else if (m.error) { w.terminate(); reject(new Error(m.error)); }
      else if (m.done) { w.terminate(); resolve(m); }
    };
    w.onerror = ev => { w.terminate(); reject(new Error(ev.message || 'Der Worker ist abgestürzt.')); };
    w.postMessage(payload);
  });
}

/* ── Das Dokument der Seite ──────────────────────────────────── */
function toJSON() {
  return {
    format: FORMAT, version: FORMAT_VERSION,
    part: { demo: host.part.demoId, name: host.part.name },
    plan: plan.settings(),
    anguss: tools.anguss.link.graphDoc(), prozess: tools.anguss.link.procDoc(), luft: tools.ueberlauf.link.doc()
  };
}
function applyDoc(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Simulationsdatei (Kennung „' + FORMAT + '" fehlt).');
  if (obj.prozess) tools.anguss.link.setProc(obj.prozess);
  if (obj.anguss) tools.anguss.fromJSON(obj.anguss);
  if (obj.luft) tools.ueberlauf.link.load(obj.luft);
  plan.apply(obj.plan);
  refresh();
}
const PLAN_TOOLS = ['anguss', 'ueberlauf'];
const doc = {
  id: 'erstarrung', settingsOnly: false, accepts: [FORMAT],
  toJSON, fromJSON: applyDoc,
  openJSON(obj, name) { applyDoc(obj); shell.toast('„' + name + '" geladen.'); },
  openFiles: files => addFiles([...files]),
  serialize: () => ({ plan: plan.settings(), ...Object.fromEntries(PLAN_TOOLS.map(id => [id, tools[id].serialize()])) }),
  restore(d) {
    for (const id of PLAN_TOOLS) if (d[id] !== undefined && JSON.stringify(d[id]) !== JSON.stringify(tools[id].serialize())) tools[id].restore(d[id]);
    plan.apply(d.plan);
    refresh();
  },
  docName: () => plan.title,
  exports: Object.entries(tools).flatMap(([id, t]) => (t.exports || []).map(e => ({ ...e, label: (id === 'export' ? '' : id + ': ') + e.label }))),
  keys: {
    Delete: ev => { const t = stages.tool; return !!(t && t.keys && t.keys.Delete) && t.keys.Delete(ev) !== false; },
    Escape: ev => { const t = stages.tool; return !!(t && t.keys && t.keys.Escape) && t.keys.Escape(ev) !== false; }
  },
  cancelDrag: () => { const t = stages.tool; return !!(t && t.cancelDrag && t.cancelDrag()); },
  cancelAim: () => { const t = stages.tool; return !!(t && t.cancelAim && t.cancelAim()); },
  onPartStart() {
    host.ready = false;
    for (const t of Object.values(tools)) if (t.onPartStart) t.onPartStart();
  },
  async onPart(model, name) {
    for (const t of Object.values(tools)) if (t.onPart) await t.onPart(model, name);
    const old = plan.bodies.find(b => b.src === 'part');
    if (old) plan.remove(old.id);
    plan.put({ key: 'host-part', name, role: 'part', src: 'part', tris: Float64Array.from(model.tris) });
    if (hostPartKey && !name.includes('Gusstraube')) plan.title = name.replace(/\.[^.]+$/, '');
    hostPartKey = null;
    host.resetHistory();
    shell.fit();
    host.ready = true;
    refresh();
  },
  /* Ohne ?part= das Beispiel mit allen Körpern, sonst das Beispielteil der Liste */
  start: () => (new URLSearchParams(location.search).get('part') ? host.part.start() : loadExample())
};
host.wireDoc(doc);

/* ── Los ─────────────────────────────────────────────────────── */
const want = new URLSearchParams(location.search).get('schritt');
stages.start('koerper');
refresh();
Promise.resolve(host.start()).then(() => { if (want && unlocked(want)) stages.activate(want); }).catch(err => console.error(err));

export const __viewer = {
  host, shell, plan, tools, layer, stages, app, toJSON, applyDoc,
  get state() { return { ready: host.ready, stage: stages.stage, open: STEPS[firstOpen()].id, shown: STEPS.filter(s => !isSkipped(s)).map(s => s.id) }; },
  activate: id => (unlocked(id) ? stages.activate(id) : false)
};
window.__erstarrung = __viewer;
