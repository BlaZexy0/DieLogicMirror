/* Werkbank (werkbank.html) — Einstieg und Verdrahtung.

   Ein Bauteil, ein Viewport, sechs Schritte in einer Leiste links — und
   jeder Schritt ist das Werkzeug seiner Einzelseite, gebaut von derselben
   Fabrik (js/<werkzeug>/tool.js), im selben Rahmen (js/studio/):

     1 Bauteil       Entformung + Wandstärke   js/entformung/, js/wandstaerke/
     2 Anguss        der Angussdesigner, im Modus System der Vorschlag
                                               js/runner/, js/werkbank/vorschlag.js
     3 Füllung       die Füllabschätzung, die Anschnitte aus dem Anguss
                                               js/fill/, js/werkbank/filltime.js
     4 Überläufe     der Überlaufdesigner      js/vents/
     5 Temperierung  der Temperierkanal-Designer js/cooling/
     6 Auslegung     das Dashboard mit den Zahlen aus dem Modell
                                               js/werkbank/design.js, measure.js

   Mehrere Werkzeuge auf einer Seite richtet js/studio/stages.js ein: je
   Werkzeug ein Gast-Gastgeber, der nur durchlässt, was ihm gehört. Was hier
   steht, ist das, was nur die Werkbank hat — das Gemeinsame zwischen den
   Schritten:
     · EIN Abstandsfeld für Wandstärke, Füllung und Temperierung
       (host.field.shared), von Anfang an so breit, wie die Abstandsfläche der
       Temperierung es braucht (bandWanted) — sonst rechnete der Schritt das
       Feld ein zweites Mal, breiter;
     · die Ereignisse zwischen den Schritten (host.on/emit): der Anguss gibt
       der Füllung ihre Anschnitte, die Überläufe dem Anguss sein
       Gussvolumen, die Füllung den Überläufen die letzten Stellen, die
       Auslegung dem Anguss seine Kurve, alle der Auslegung ihre Zahlen;
     · das DOKUMENT der Seite: ein Verlauf und ein Entwurf für alle Schritte,
       die Werkbank-Datei (unverändert „dielogic-werkbank" Fassung 1),
       Öffnen, Exportieren, die Tasten des Werkzeugs, das dran ist.

   Rahmen: das Bauteilsystem der Analyseseiten — Trennebene z = 0, die
   Form öffnet nach +z. Der Anguss liegt als Nut in der beweglichen Hälfte
   (z > 0), Achse −z. */

import { createHost } from '../studio/host.js';
import { mountStages } from '../studio/stages.js';
import { checkFormat } from '../studio/planio.js';
import { createEntformungTool, FORMAT as FORMAT_ENTFORMUNG } from '../entformung/tool.js';
import { createWandstaerkeTool, FORMAT as FORMAT_WANDSTAERKE } from '../wandstaerke/tool.js';
import { createAngussTool } from '../runner/tool.js';
import { createFuellungTool } from '../fill/tool.js';
import { createUeberlaufTool } from '../vents/tool.js';
import { createTemperierTool } from '../cooling/tool.js';
import { FORMAT as FORMAT_ANGUSS } from '../runner/graph.js';
import { FORMAT as FORMAT_LUFT } from '../vents/model.js';
import { FORMAT as FORMAT_TEMPERIER } from '../cooling/model.js';
import { FORMAT as FORMAT_FUELLUNG } from '../fill/model.js';
import { createDesignTool } from './design.js';
import { createVorschlag } from './vorschlag.js';
import { HELP } from './help.js';

export const FORMAT = 'dielogic-werkbank';
export const FORMAT_VERSION = 1;

const mount = document.getElementById('studio');
mount.setAttribute('data-page', 'werkbank');
const host = createHost({
  mount, id: 'werkbank', title: 'Werkbank', help: HELP, start: 'gearbox_cover',
  sceneOpts: { cameraStart: [520, -640, 470], target: [0, 0, 0], minDistance: 3, maxDistance: 30000 }
});
const { shell } = host;
host.ready = false;

/* ── Das eine Abstandsfeld ───────────────────────────────────── */
host.field.shared = true;
host.field.bandWanted = 12;

/* ── Die Schritte ────────────────────────────────────────────── */
const ICON = {
  bauteil: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M13 2 L23 8 L13 14 L3 8 Z"/><path d="M3 8 L3 18 L13 24 L23 18 L23 8"/><path d="M13 14 L13 24"/></svg>',
  anguss: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'
    + '<circle cx="5" cy="13" r="3"/><path d="M8 13 H13 C16 13 16 7 19 7 H23"/><path d="M13 13 C16 13 16 19 19 19 H23"/><path d="M22 5 V9 M22 17 V21"/></svg>',
  fuellung: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'
    + '<path d="M3 6 H23 V20 H3 Z"/><path d="M3 6 L3 20" stroke-width="3"/><path d="M7 6 V20" stroke-dasharray="1.5 2"/><path d="M12 6 C11 10 13 12 12 20"/><path d="M17 6 C16 11 18 15 17 20"/></svg>',
  ueberlauf: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'
    + '<path d="M3 8 L11 8 L11 18 L3 18 Z"/><path d="M11 13 H14"/><path d="M14 10 H20 a3 3 0 0 1 0 6 H14 Z"/><path d="M23 13 H25"/></svg>',
  temperier: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'
    + '<rect x="6" y="9" width="14" height="10" rx="2"/><path d="M3 4 H23" stroke-dasharray="2 2"/><path d="M13 4 V9"/><path d="M8 22 V25 M18 22 V25"/></svg>',
  auslegung: '<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'
    + '<path d="M3 22 H23"/><path d="M3 22 V4"/><path d="M6 18 C10 6 14 6 22 8"/><path d="M6 12 L11 10 L15 14 L22 13"/></svg>'
};

const vorschlag = createVorschlag({ part: host.part });
let tools = {};
const viewer = id => tools[id].__viewer;
const stages = mountStages(host, {
  stages: [
    {
      id: 'bauteil', label: 'Bauteil', title: 'Entformung und Wandstärke des Bauteils', icon: ICON.bauteil,
      /* Die Analysen zeigen das Bauteil für sich: Anguss, Überläufe und Bohrungen stehen hier nicht im Bild. */
      solo: true,
      done: () => viewer('entformung').state.analysed,
      tools: [
        /* Die Werkbank rechnet mit Z — sagt die Analyse etwas anderes, liegt das Teil falsch. */
        { id: 'entformung', create: g => createEntformungTool(g, { axisNote: seg => (seg.mainAxis === 2 ? '' : 'Die Werkbank rechnet mit Z: das Teil liegt vermutlich falsch herum.') }) },
        { id: 'wandstaerke', create: g => createWandstaerkeTool(g) }
      ]
    },
    {
      id: 'anguss', label: 'Anguss', title: 'Angusssystem: Pressrest, Laufkanäle, Anschnitte', icon: ICON.anguss,
      done: () => !!tools.anguss.link.graphDoc(),
      tools: [{
        id: 'anguss', create: g => createAngussTool(g, {
          partFrame: true, propose: vorschlag.attach,
          /* Das Gussvolumen: Bauteil plus Überläufe. */
          castVolume: () => (host.part.model ? Math.abs(host.part.model.volume) + tools.ueberlauf.link.volume() : NaN)
        })
      }]
    },
    {
      id: 'fuellung', label: 'Füllung', title: 'Füllabschätzung von den Anschnitten des Angusses aus', icon: ICON.fuellung,
      done: () => !!viewer('fuellung').state.result,
      tools: [{
        id: 'fuellung', create: g => createFuellungTool(g, {
          derive: { inlets: () => tools.anguss.link.gateMouths(), curve: () => tools.anguss.link.curve() }
        })
      }]
    },
    {
      id: 'ueberlauf', label: 'Überläufe', title: 'Überläufe und Entlüftungen am Bauteil', icon: ICON.ueberlauf,
      done: () => tools.ueberlauf.link.volume() > 0,
      tools: [{ id: 'ueberlauf', create: g => createUeberlaufTool(g, { spots: () => tools.fuellung.link.spots() }) }]
    },
    {
      id: 'temperier', label: 'Temperierung', title: 'Kühlstiche und Kanäle auf der Abstandsfläche', icon: ICON.temperier,
      done: () => tools.temperier.link.doc().items.length > 0,
      tools: [{ id: 'temperier', create: g => createTemperierTool(g) }]
    },
    {
      id: 'auslegung', label: 'Auslegung', title: 'Gießtechnische Auslegung mit den Zahlen aus dem Modell', icon: ICON.auslegung,
      done: () => viewer('auslegung').state.drawn,
      tools: [{ id: 'auslegung', create: g => createDesignTool(g, { runner: () => tools.anguss.link, vents: () => tools.ueberlauf.link }) }]
    }
  ]
});
tools = stages.tools;
/* Von Anfang an so breit, wie die Abstandsfläche der Temperierung es braucht. */
host.field.bandWanted = Math.max(host.field.bandWanted, tools.temperier.link.band());

/* ── Was zwischen den Schritten läuft ────────────────────────── */
const each = fn => { try { fn(); } catch (err) { console.error(err); } };
host.on('runner', () => { each(() => tools.fuellung.link.inletsChanged()); tools.auslegung.link.modelChanged(); stages.refreshRail(); });
host.on('vents', () => { each(() => tools.anguss.link.syncVolume()); tools.auslegung.link.modelChanged(); stages.refreshRail(); });
host.on('fill', () => { tools.ueberlauf.link.spotsChanged(); stages.refreshRail(); });
host.on('cooling', () => stages.refreshRail());
host.on('design', () => tools.anguss.link.curveChanged());
host.on('field', () => {
  each(() => tools.wandstaerke.link.fieldChanged());
  each(() => tools.fuellung.link.fieldChanged());
  each(() => tools.temperier.link.fieldChanged());
  tools.auslegung.link.modelChanged();
});

/* ── Die Werkbank-Datei: alle Pläne, das Bauteil als Verweis ─── */
function toJSON() {
  const an = tools.anguss.link;
  return {
    format: FORMAT, version: FORMAT_VERSION,
    part: { demo: host.part.demoId, name: host.part.name },
    anguss: an.graphDoc(),
    prozess: an.procDoc(),
    fuellung: tools.fuellung.link.doc(),
    luft: tools.ueberlauf.link.doc(),
    temperier: tools.temperier.link.doc()
  };
}

/* Die Pläne einer Werkbank-Datei an das Bauteil, das da ist — der Entwurf
   (host.js) und das Öffnen einer Datei nehmen denselben Weg. Was die Datei
   nicht hat, bleibt. */
function applyPlans(obj) {
  checkFormat(obj, FORMAT, FORMAT_VERSION, 'Das ist keine Werkbank-Datei (Kennung „' + FORMAT + '" fehlt).');
  const an = tools.anguss;
  if (obj.prozess) an.link.setProc(obj.prozess);
  if (obj.anguss) an.fromJSON(obj.anguss);
  if (obj.fuellung) tools.fuellung.link.load(obj.fuellung);
  if (obj.luft) tools.ueberlauf.link.load(obj.luft);
  if (obj.temperier) tools.temperier.link.load(obj.temperier);
  stages.refreshRail();
}

/** Eine Werkbank-Datei öffnen: gehört sie zu einem anderen Beispielteil,
    kommt erst dieses — dann die Pläne. Ein eigenes Netz steht nicht in der
    Datei; die Pläne gehen dann an das Bauteil, das da ist. */
async function loadWerkbank(obj, name = '') {
  checkFormat(obj, FORMAT, FORMAT_VERSION, 'Das ist keine Werkbank-Datei (Kennung „' + FORMAT + '" fehlt).');
  const demo = obj.part && obj.part.demo;
  let note = '';
  if (demo && demo !== host.part.demoId) {
    const ok = await host.part.pickDemo(demo);
    if (!ok) throw new Error('Das Beispielteil der Datei ließ sich nicht laden.');
  } else if (!demo && obj.part && obj.part.name && obj.part.name !== host.part.name) {
    note = ' Sie gehört zum Bauteil „' + obj.part.name + '"; das Netz steht nicht darin, die Pläne liegen jetzt am geladenen Bauteil.';
  }
  applyPlans(obj);
  host.resetHistory();
  host.store.markSaved();
  shell.banner(null);
  shell.toast((name ? '„' + name + '" geladen.' : 'Werkbank-Datei geladen.') + note, { ms: note ? 9000 : 6000 });
}

/* Welcher Schritt eine Plandatei eines Einzelwerkzeugs nimmt. */
const ROUTE = {
  [FORMAT_ANGUSS]: ['anguss', 'anguss'], [FORMAT_LUFT]: ['ueberlauf', 'ueberlauf'], [FORMAT_TEMPERIER]: ['temperier', 'temperier'],
  [FORMAT_ENTFORMUNG]: ['bauteil', 'entformung'], [FORMAT_WANDSTAERKE]: ['bauteil', 'wandstaerke']
};
/** Eine JSON-Datei, gleich woher (Bauteil-Chip, Ablegen): die Werkbank-Datei
    oder der Plan eines Schritts — der geht an seinen Schritt, als Schritt im
    Verlauf. */
async function openJSON(obj, name = '') {
  const f = obj && obj.format;
  if (f === FORMAT) return loadWerkbank(obj, name);
  if (f === FORMAT_FUELLUNG) throw new Error('Füllpläne braucht die Werkbank nicht: ihre Anschnitte kommen aus dem Anguss.');
  const route = ROUTE[f];
  if (!route) throw new Error('„' + name + '" gehört zu keinem Schritt der Werkbank (unbekannte Kennung „' + f + '").');
  tools[route[1]].fromJSON(obj);
  stages.activate(route[0]);
  host.changed('„' + name + '" geladen');
  shell.toast('„' + name + '" geladen.');
}

/* ── Das Dokument der Seite ──────────────────────────────────── */
/* Der Verlauf: je Schritt sein eigener Abzug (serialize), zurückgesetzt
   wird nur, was sich unterscheidet — Rückgängig nach einem Zug an einem
   Überlauf rechnet den Anguss nicht neu. */
const PLAN_TOOLS = ['anguss', 'fuellung', 'ueberlauf', 'temperier'];
const serialize = () => Object.fromEntries(PLAN_TOOLS.map(id => [id, tools[id].serialize()]));
function restore(doc) {
  const now = serialize();
  for (const id of PLAN_TOOLS) {
    if (doc[id] !== undefined && JSON.stringify(doc[id]) !== JSON.stringify(now[id])) tools[id].restore(doc[id]);
  }
  stages.refreshRail();
}
const active = () => stages.tool;
const STAGE_LABEL = { entformung: 'Entformung', wandstaerke: 'Wandstärke', anguss: 'Anguss', fuellung: 'Füllung', ueberlauf: 'Überläufe', temperier: 'Temperierung', auslegung: 'Auslegung' };
const doc = {
  id: 'werkbank', settingsOnly: false, accepts: [],
  toJSON, fromJSON: applyPlans, openJSON, serialize, restore,
  docName: () => host.part.name,
  exports: Object.entries(tools).flatMap(([id, t]) => (t.exports || []).map(e => ({ ...e, label: STAGE_LABEL[id] + ': ' + e.label }))),
  keys: {
    Delete: ev => { const t = active(); return !!(t && t.keys && t.keys.Delete) && t.keys.Delete(ev) !== false; },
    Escape: ev => { const t = active(); return !!(t && t.keys && t.keys.Escape) && t.keys.Escape(ev) !== false; }
  },
  cancelDrag: () => { const t = active(); return !!(t && t.cancelDrag && t.cancelDrag()); },
  cancelAim: () => { const t = active(); return !!(t && t.cancelAim && t.cancelAim()); },
  onPartStart() {
    host.ready = false;
    for (const t of Object.values(tools)) if (t.onPartStart) t.onPartStart();
  },
  /* Ein neues Bauteil: jeder Schritt fängt für sich neu an (leere Pläne, die
     Analyse läuft), dann der Vorschlag für den Anguss — und ein neuer Anfang
     im Verlauf, das Bild auf das Ganze. */
  async onPart(model, name) {
    for (const t of Object.values(tools)) if (t.onPart) await t.onPart(model, name);
    vorschlag.propose(vorschlag.gates);
    host.resetHistory();
    stages.refreshRail();
    shell.fit();
    host.ready = true;
  }
};
host.wireDoc(doc);

/* ── Los ─────────────────────────────────────────────────────── */
stages.start(new URLSearchParams(location.search).get('schritt') || 'bauteil');
Promise.resolve(host.start()).catch(err => console.error(err));

export const __viewer = {
  host, ctx: host, shell, view: host.view, field: host.field, part: host.part,
  tools, stages: Object.fromEntries(Object.keys(tools).map(id => [id, viewer(id)])),
  get state() { return { ready: host.ready, stage: stages.stage }; },
  activate: (stage, mode) => stages.activate(stage, mode),
  toJSON, loadWerkbank, loadJSON: openJSON, applyPlans, vorschlag
};
window.__werkbank = __viewer;
