/* Kennzahlen oberhalb der Diagramme: die Füllkammer/Massen-Gruppe lebt in
   der Kammerkarte (ui/chamber.js — Schema, ausgerichtetes Kolbenweg-Lineal,
   Kennwerte, Prüfzeilen, Urteil im Kopf), darunter drei Prüfpanels:
   Schusskurve/Anschnitt · Zuhaltung/Maschine · Thermik/Qualität. Alle
   Werte kommen aus denselben Funktionen wie die Diagramme (core/physics.js,
   pqCore in charts/pq2.js).

   Ein Panel hat drei Teile: einen Kopf mit Gruppenurteil, einen Streifen
   reiner Kennwerte (ohne Bewertung) und die Prüfzeilen mit fester
   Spaltenordnung Name · Wert · Leiste · Urteil — so stehen alle Leisten
   einer Gruppe in einer Spalte und lassen sich wie ein Messprotokoll lesen.
   Leisten: Zielband → Bullet (Track = plausibler Bereich, Band = Ziel,
   Marker = Ist), Limit → Meter (Füllung = Auslastung, Farbe = Bewertung:
   ok → knapp ab 80 % → verletzt über 100 %). Jede Bewertung trägt ein
   Text-Tag (✓/!/✕) — nie Farbe allein. „Keine Daten" ist neutral.
   Die Kammerkarte zeigt den Kolbenweg als Lineal (1. Phase bis „Kammer
   voll", danach die Schmelzesäule aus Anguss, Bauteil + Überlauf und
   Pressrest). Die Prüfleiste (#checkbar) fasst alle bewerteten Zeilen
   mit Prüfpunkten je Gruppe zusammen. */

import { fmt, subHTML } from '../core/format.js';
import {
  total, pistonArea, travel, doseMass, doseVolume, fillRatio, injForceEff, hydArea, specPressure,
  leverFactor, clampPMax, clampForceNeeded, nadcaFillMs, fillTimeAt, ventAreaFor, atomJ,
  cavityTravel, biscuitSolid, intensStroke, rhoSolidus, shotSpeed, sleeveLoss, fillEndSpike
} from '../core/physics.js';
import { pqCore } from '../charts/pq2.js';
import { ratio as bubbleRatio, vacPressure } from '../charts/bubble.js';
import { sim } from '../core/simstore.js';
import { ACTIVE_SPAN } from './chamber.js';

/* Während eines Renders eingesammelte Prüfungen für die Prüfleiste. */
let CHECKS = [];
let GROUP = '';

const ICON = { ok: '✓', warn: '!', bad: '✕', nodata: '' };

function slug(name) {
  return 'kpi-' + name.toLowerCase().replace(/[^a-zäöüß0-9]+/g, '-');
}

/* „18,2 kg" → Zahl und Einheit getrennt setzen; Werte ohne Einheit
   („2.934,35", „—", „Fehler") bleiben, wie sie sind. */
function valueHTML(value) {
  const m = /^([\d.,−-]+)\s+(.+)$/.exec(value);
  return m ? m[1] + '<i>' + subHTML(m[2]) + '</i>' : subHTML(value);
}

/* Eine Prüfzeile. status: 'info' (reine Zahl) · 'ok' · 'warn' · 'bad' ·
   'nodata'. tagText ergänzt das Icon (z. B. 'im Band', '+12 %'). barHtml
   ist eine optionale Bullet-/Meter-Leiste in der dritten Spalte. */
function row(label, value, sub, status = 'info', tagText = '', barHtml = '') {
  const id = slug(label);
  if (status === 'ok' || status === 'warn' || status === 'bad')
    CHECKS.push({ name: label, status, id, group: GROUP });
  const tagHtml = status !== 'info'
    ? '<span class="tag">' + (ICON[status] ? ICON[status] + ' ' : '') + (tagText || (status === 'nodata' ? 'keine Daten' : '')) + '</span>'
    : '<span></span>';
  return '<div class="krow ' + status + '" id="' + id + '">'
    + '<div class="klbl" title="' + sub.replace(/"/g, '&quot;') + '">' + subHTML(label) + '<small>' + subHTML(sub) + '</small></div>'
    + '<b>' + valueHTML(value) + '</b>'
    + '<div class="kbar">' + barHtml + '</div>'
    + subHTML(tagHtml) + '</div>';
}

/* Kennwert im Kopfstreifen eines Panels (keine Bewertung). */
function kv(label, value, sub = '') {
  return '<div class="kv"' + (sub ? ' title="' + sub.replace(/"/g, '&quot;') + '"' : '') + '><small>' + subHTML(label) + '</small><b>' + valueHTML(value) + '</b></div>';
}

/* Gruppenurteil: erfüllt/gesamt, Prüfpunkte, Befund in Worten. */
function groupVerdict(mine) {
  if (!mine.length) return '';
  const bad = mine.filter(c => c.status === 'bad').length;
  const warn = mine.filter(c => c.status === 'warn').length;
  const verdict = bad ? bad + ' verletzt' : warn ? warn + ' knapp' : 'alle erfüllt';
  return '<b>' + (mine.length - bad) + '/' + mine.length + '</b><span class="dotrow">' + dotsHTML(mine) + '</span><span>' + verdict + '</span>';
}

/* Panel: Kopf mit Gruppenurteil, Kennwertstreifen, Prüfzeilen. rowsFn wird
   erst hier aufgerufen, damit die Zeilen der richtigen Gruppe zugeordnet
   werden. */
function panel(title, short, kvHtml, rowsFn, cls = '') {
  GROUP = short;
  const n0 = CHECKS.length;
  const rowsHtml = rowsFn();
  const mine = CHECKS.slice(n0);
  return '<div class="kpanel ' + cls + '">'
    + '<div class="kpanel-head"><h3>' + title + '</h3>'
    + (mine.length ? '<div class="kverdict">' + groupVerdict(mine) + '</div>' : '')
    + '</div>'
    + (kvHtml ? '<div class="kvs">' + kvHtml + '</div>' : '')
    + '<div class="krows">' + rowsHtml + '</div></div>';
}

/* Jede Prozentangabe, die in ein style-Attribut geht, läuft hier durch.
   Eine Länge in Prozent ist per Definition endlich und liegt in [0, 100] —
   das an EINER Stelle sicherzustellen ist weniger und verlässlicher als an
   jeder Schreibstelle einzeln zu prüfen. Vorher entstanden aus
   Null-Spannen und unbrauchbaren Eingaben style="width:NaN%" und
   style="width:-12.34%", die der Browser stillschweigend verwirft. */
const clampPct = x => (isFinite(x) ? Math.max(0, Math.min(100, x)) : 0);
const pctStr = x => clampPct(x).toFixed(2) + '%';

/* Bullet: Track über [lo, hi], Zielband [bandLo, bandHi], Marker bei val.
   Nicht-endliche Anteile (z. B. hi == lo bei Null-Eingaben) → 0 %. */
function bullet(lo, hi, bandLo, bandHi, val, lblL, lblM, lblR) {
  const pct = x => clampPct(100 * (x - lo) / (hi - lo));
  return '<div class="kpi-bullet">'
    + '<span class="band" style="left:' + pctStr(pct(bandLo)) + ';width:' + pctStr(pct(bandHi) - pct(bandLo)) + '"></span>'
    + '<span class="mark" style="left:' + pctStr(pct(val)) + '"></span></div>'
    + '<div class="kpi-scale"><span>' + lblL + '</span><span>' + lblM + '</span><span>' + lblR + '</span></div>';
}

/* Meter: Füllung = Auslastung (Ist/Limit), Limit-Marke bei Überschreitung.
   Ohne Auslastung (unbrauchbare Eingaben) bleibt der Balken leer — vorher
   entstand daraus style="width:NaN%", ein ungültiger CSS-Wert. Der Text
   daneben zeigt bereits „—". */
function meter(util) {
  const fill = pctStr(100 * Math.min(util, 1));
  const lim = pctStr(util > 1 ? 100 / util : 100);
  return '<div class="kpi-meter"><span class="fill" style="width:' + fill + '"></span>'
    + '<span class="limit" style="left:' + lim + '"></span></div>';
}

/* Bewertung einer Auslastung: verletzt über 100 %, knapp ab 80 %. */
function utilStatus(util) {
  return util > 1 + 1e-9 ? 'bad' : util >= 0.8 ? 'warn' : 'ok';
}
function utilTag(util) {
  return fmt(Math.round(100 * util)) + ' %' + (util > 1 + 1e-9 ? '' : util >= 0.8 ? ' knapp' : '');
}
/* Tag für Zeilen, deren Wert selbst die Auslastung in % ist —
   die Zahl nicht wiederholen, nur das Urteil. */
function pctTag(util) {
  return util > 1 + 1e-9 ? 'über Limit' : util >= 0.8 ? 'knapp' : '';
}

/* Zielband-Bewertung. */
function bandStatus(x, lo, hi) { return x < lo ? 'bad' : x > hi ? 'bad' : 'ok'; }
function bandTag(x, lo, hi) { return x < lo ? 'unter Band' : x > hi ? 'über Band' : 'im Band'; }

/* Mindestwert-Bewertung (Ist muss über min liegen): Marge als Tag. */
function minStatus(x, min) { return x < min ? 'bad' : x < 1.1 * min ? 'warn' : 'ok'; }
function minTag(x, min) {
  const pct = 100 * Math.abs(x / min - 1);
  const txt = fmt(pct < 10 ? Math.round(10 * pct) / 10 : Math.round(pct));   // knappe Margen mit einer Nachkommastelle
  return x < min ? txt + ' % unter min' : '+' + txt + ' %';
}

/* Die drei Zeilenarten mit Leiste. Grenze: Meter der Auslastung util (Tag
   ohne Angabe „n %" bzw. „knapp"). Zielband [lo, hi]: Bullet von 0 bis top.
   Mindestwert: Bullet von 0 bis top, das Band beginnt beim Minimum; die
   Skala trägt unit. */
function limitRow(label, value, sub, util, tag = utilTag(util)) {
  return row(label, value, sub, utilStatus(util), tag, meter(util));
}
function bandRow(label, value, sub, x, lo, hi, top, lblL, lblM, lblR) {
  return row(label, value, sub, bandStatus(x, lo, hi), bandTag(x, lo, hi), bullet(0, top, lo, hi, x, lblL, lblM, lblR));
}
function minRow(label, value, sub, x, min, top, unit, lblM) {
  return row(label, value, sub, minStatus(x, min), minTag(x, min),
    bullet(0, top, min, top, x, '0 ' + unit, lblM, fmt(top) + ' ' + unit));
}

/* Kolbenweg-Lineal: 0 … L. Bis s_voll (= (1 − φ)·L) läuft die 1. Phase,
   danach die Formfüllung (Anguss, Bauteil + Überlauf — Kavitäten fest, ρ_sol),
   dann der Hub für Nachverdichtung + Schwindung Δs (der Kolben speist Abkühl- und Erstarrungsschwund)
   bis zur Endlage mit festem Pressrest. Läuft die flüssige Säule p3 über
   die Kammer hinaus (p3 > L), wird die Skala auf p3 gedehnt und die
   Kammerlänge als Grenze markiert.
   Darüber eine zweite, dünne Spur: ab wo die Einfüllöffnung dicht ist und
   über welchen Kolbenweg Vakuum gezogen wird (vacStart bis Ventilschluss:
   Füllende, gewählter Kolbenweg oder — nach Offenzeit — der Hub aus der
   Simulation, solange sie keinen liefert das Füllende). */
function simEventStroke(id) {
  const ev = sim.data && Array.isArray(sim.data.events) && sim.data.events.find(e => e.id === id);
  return ev && Number.isFinite(ev.s_mm) ? ev.s_mm : null;
}

function vacuumEnd(v, sEnd) {
  const r = x => fmt(Math.round(x));
  if (v.vacEnd === 'stroke' && v.vacEndStroke > v.vacStart) {
    const to = Math.min(v.vacEndStroke, sEnd);
    return { to, label: 'bis Kolbenweg ' + r(to) + ' mm' };
  }
  if (v.vacEnd === 'time' && v.vacEndTime > 0) {
    const s = simEventStroke('vacuum_end');
    const to = s !== null ? Math.min(s, sEnd) : sEnd;
    return { to, label: 'für ' + fmt(v.vacEndTime) + ' ms' + (s !== null ? ' (bis ' + r(to) + ' mm)' : '') };
  }
  return { to: sEnd, label: 'bis Füllende ' + r(sEnd) + ' mm' };
}

function rulerHTML(v, g) {
  const { L, fill, sFill, p1, cav, intens, bisc, p3 } = g;
  const span = Math.max(L, p3);
  const over = p3 > L;
  /* g.x0/g.x1: Lage der aktiven Länge in Anteilen der Kartenbreite — damit
     liegt das Lineal exakt unter der Kolbenstirn bzw. dem Kammerende des
     Schemas (ui/chamber.js ACTIVE_SPAN); Ø und L stehen dort schon. */
  const P0 = 100 * g.x0, P1 = 100 * g.x1;
  const x = s => pctStr(P0 + (P1 - P0) * Math.max(0, Math.min(span, s)) / span);
  const w = len => pctStr((P1 - P0) * Math.max(0, len) / span);
  const vacOn = v.vacModel && v.vacModel !== 'aus' && v.vacStart >= 0;
  const sEnd = over ? span : sFill + cav;                      // Füllende
  const vacTo = vacuumEnd(v, sEnd);
  const vacHtml = '<div class="kr-vac' + (vacOn ? '' : ' off') + '">'
    + '<span class="vl" style="margin-left:' + pctStr(P0) + '">' + (vacOn
      ? 'Vakuum ab ' + fmt(Math.round(v.vacStart)) + ' mm ' + vacTo.label
      : 'ohne Vakuum')
    + (v.sealStroke > 0 ? ' · Einfüllöffnung dicht ab ' + fmt(Math.round(v.sealStroke)) + ' mm' : '') + '</span>'
    + '<div class="kr-vtrack">'
    + '<span class="base" style="left:' + x(0) + ';width:' + w(span) + '"></span>'
    + (vacOn && vacTo.to > v.vacStart ? '<span class="seg" style="left:' + x(v.vacStart) + ';width:' + w(Math.min(span, vacTo.to) - Math.max(0, v.vacStart)) + '"></span>' : '')
    + (v.sealStroke > 0 ? '<i class="tick seal" style="left:' + x(v.sealStroke) + '" title="Einfüllöffnung verschlossen"></i>' : '')
    + '</div></div>';
  const mm = x => fmt(Math.round(x));
  const s0 = over ? 0 : sFill;                                 // Beginn der Schmelzesäule
  const partLen = Math.max(0, cav - p1);
  const segs = over
    ? '<span class="seg part" style="left:0;width:' + w(p3) + '"></span>'
    : '<span class="seg run" style="left:' + x(s0) + ';width:' + w(p1) + '"></span>'
      + '<span class="seg part" style="left:' + x(s0 + p1) + ';width:' + w(partLen) + '"></span>'
      + '<span class="seg nv" style="left:' + x(s0 + cav) + ';width:' + w(intens) + '"></span>'
      + '<span class="seg bisc" style="left:' + x(s0 + cav + intens) + ';width:' + w(bisc) + '"></span>';
  return '<div class="kruler' + (over ? ' over' : '') + '">'
    + vacHtml
    /* Obere Beschriftung: „Füllende" rechtsbündig an seiner Marke; die
       Kammerlänge steht im Kopf und nur dann auch hier, wenn Platz ist. */
    + '<div class="kr-lbl top"><span style="left:' + x(0) + '">0</span>'
    + (over ? '' : '<span style="left:' + x(sFill) + '">Kammer voll ' + mm(sFill) + '</span>')
    + (over ? '' : '<span style="left:' + x(sEnd) + '" class="end">Füllende ' + mm(sEnd) + '</span>')
    + (over || sEnd / span < 0.72 ? '<span style="left:' + x(L) + '" class="end">' + mm(L) + ' mm</span>' : '') + '</div>'
    + '<div class="kr-track">'
    + '<span class="seg base" style="left:' + x(0) + ';width:' + w(span) + '"></span>'
    + segs
    + '<i class="tick" style="left:' + x(0) + '"></i>'
    + (over ? '' : '<i class="tick" style="left:' + x(sFill) + '"></i><i class="tick" style="left:' + x(sEnd) + '"></i>')
    + '<i class="tick' + (over ? ' lim' : '') + '" style="left:' + x(L) + '"></i>'
    + '</div>'
    + '<div class="kr-lbl bot">'
    + (over
      ? '<span style="left:0">Schmelzesäule ' + mm(p3) + ' mm, ' + mm(p3 - L) + ' mm länger als die Kammer</span>'
      : '<span style="left:' + x(sFill / 2) + '">1. Phase · Füllgrad ' + fmt(fill) + ' %</span>'
        + '<span style="left:' + x(sFill + cav / 2) + '">Formfüllung ' + mm(cav) + ' mm</span>'
        + (intens / span > 0.06 ? '<span style="left:' + x(sFill + cav + intens / 2) + '">Δs ' + mm(intens) + '</span>' : ''))
    + '</div>'
    + '<div class="kr-legend"><span><i class="run"></i>Anguss ' + mm(p1) + '</span>'
    + '<span><i class="part"></i>Bauteil + Überlauf ' + mm(partLen) + '</span>'
    + '<span><i class="nv"></i>Nachverdichtung + Schwindung ' + mm(intens) + '</span>'
    + '<span><i class="bisc"></i>Pressrest fest ' + mm(bisc) + ' mm</span></div>'
    + '</div>';
}

function dotsHTML(list) {
  return list.map(c =>
    '<button class="dot ' + c.status + '" data-target="' + c.id + '" title="' + c.name.replace(/"/g, '&quot;') + '" aria-label="' + c.name.replace(/"/g, '&quot;') + '"></button>').join('');
}

/* Prüfleiste: Gesamturteil, Prüfpunkte je Gruppe, verletzte/knappe Zeilen
   namentlich. */
function checklistHTML() {
  const rated = CHECKS;
  if (!rated.length) return '';
  const failed = rated.filter(c => c.status === 'bad');
  const tight = rated.filter(c => c.status === 'warn');
  /* Reihenfolge der Prüfleiste = Ablauf des Schusses, unabhängig von der Panel-Reihenfolge */
  const ORDER = ['Füllkammer', 'Schusskurve', 'Zuhaltung', 'Thermik'];
  const groups = [...new Set(rated.map(c => c.group))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const links = list => list.map(c =>
    '<button class="ck-link" data-target="' + c.id + '">' + subHTML(c.name) + '</button>').join(' · ');
  let msg = '';
  if (failed.length) msg += '<span class="fails">✕ verletzt: ' + links(failed) + '</span>';
  if (tight.length) msg += '<span class="tights">! knapp: ' + links(tight) + '</span>';
  return '<div class="checkbar">'
    + '<div class="verdict"><b>' + (rated.length - failed.length) + '</b><span class="of">/' + rated.length + '</span><small>Prüfungen erfüllt</small></div>'
    + '<div class="ck-groups">' + groups.map(g =>
      '<div><span class="gname">' + g + '</span><span class="dotrow">' + dotsHTML(rated.filter(c => c.group === g)) + '</span></div>').join('') + '</div>'
    + (msg ? '<div class="calls">' + msg + '</div>' : '<div class="calls"><span class="allok">alle Prüfungen erfüllt</span></div>')
    + '</div>';
}

function flashTo(id) {
  const t = document.getElementById(id);
  if (!t) return;
  t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  t.classList.add('flash');
  setTimeout(() => t.classList.remove('flash'), 1200);
}

function wireLinks(root) {
  root.querySelectorAll('[data-target]').forEach(b => {
    b.onclick = () => flashTo(b.dataset.target);
  });
}

/* chamberEl: #chamber-kpis in der Kammerkarte (Kennwerte + Prüfzeilen;
   Lineal → #chamber-ruler, Urteil → #chamber-verdict); el bekommt die
   übrigen Panels. Die Prüfleiste landet in #checkbar, falls vorhanden. */
export function renderKpis(el, v, shot, chamberEl) {
  CHECKS = [];
  const mdos = doseMass(v);
  const Vdos = doseVolume(v);                                     // m³
  const req = clampForceNeeded(v);
  const phi = fillRatio(v);
  const fill = 100 * phi;
  const p3 = travel(mdos, v);                                     // flüssige Säule in der Kammer
  const sFill = (1 - phi) * v.length;
  const p1 = cavityTravel(v.runner, v);                           // Kavitäten fest (ρ_sol)
  const cav = cavityTravel(total(v), v);
  const biscLen = biscuitSolid(v);                                // Pressrest fest (Endlage)
  /* „Flüssig am Füllende" ist der Schmelzerest in der Kammer (L − Gesamthub),
     nicht die Flüssigsäule der Pressrestmasse allein: physics.js nennt beide
     biscLiquid, sie unterscheiden sich um Faktor ~2,4 (66,9 vs. 28,3 mm bei
     den Defaults). Die Kammer-KPI muss dieselbe Größe zeigen wie die Prüfung
     „Nachverdichtung + Schwindung", die darauf aufbaut. */
  const biscLiquid = shot && !shot.error && isFinite(shot.biscLiquid) ? shot.biscLiquid * 1000 : NaN;
  const intens = intensStroke(v);                                 // Nachverdichtungshub
  const ratioLD = v.length / v.diam;
  const eta = mdos > 0 ? 100 * v.part / mdos : NaN;

  /* Zuhaltung + spezifischer Gießdruck (Rechenkern: shared/clampmodel.js) */
  const kClamp = leverFactor(v);
  const pMaxClamp = clampPMax(v);
  const Feff = injForceEff(v);
  const pSpec = specPressure(v);

  /* PQ²-Arbeitspunkt und Hüllkurve: dieselbe Rechnung wie im PQ²-Diagramm
     (pqCore). Der reale Betriebspunkt liegt bei Q = A_K·v₂ auf der
     Werkzeuglinie, der Schnittpunkt ist der ungedrosselte; pM ist die
     Maschinenlinie dort, der ungedrosselt verfügbare Metalldruck. */
  const v2 = shotSpeed(shot, 'v2');
  const pq = pqCore(v);
  const Qs = pq ? pq.Qs : null, ps = pq ? pq.ps : null;
  const aMPE = pq ? pq.aMPE / 1e6 : null;                         // MW
  const op = pq ? pq.opAt(v2) : null;
  const pwOp = op ? op.p * 1e5 * op.Q / 1e6 : (pq ? pq.ps * 1e5 * pq.Qs / 1e6 : null);   // MW

  /* Anschnittgeschwindigkeit: bevorzugt aus der Schusskurve (Bauteil gefüllt);
     sonst mit v2 = mittlerer Kolbengeschw. nach Anschnitt (ebenfalls Kurve) */
  const gvMean = v.gate > 0 ? v2 * pistonArea(v) / v.gate : NaN;
  const evPart = !shot.error && shot.events && shot.events[2];
  const gvShot = evPart && evPart.inP && evPart.gv != null ? evPart.gv : null;
  const gvShown = gvShot != null ? gvShot : gvMean;

  /* Zerstäubung: Ist-J aus der Anschnittgeschwindigkeit (Herman/NADCA,
     UPCT Gl. 2.38) — die Umkehrung der v_a-Grenze im PQ²-Diagramm. */
  const Jist = atomJ(v, gvShown);

  /* Thermik und Qualität */
  const tNadca = nadcaFillMs(v);
  const tOp = fillTimeAt(v, v2);
  const Areq = ventAreaFor(v, tOp);
  const tErst = v.solK * v.gateTh * v.gateTh;

  /* Luftblasen-Kompression beim gewählten Nachdruck — dieselbe Rechnung wie
     das Blasendiagramm: p_vor = Umgebungsdruck, mit Vakuum der simulierte
     Restluftdruck beim Füllende. */
  const pVacB = vacPressure(v);
  const rBub = (v.psel > 0 && v.Tliq > v.Tdie && v.Tdie > -273.15)
    ? bubbleRatio(v, v.psel, pVacB !== null ? pVacB : undefined) : NaN;

  /* Füllende aus der Schusskurve: Zeit für den Wärmeverlust in der Kammer
     (Verweilzeit + Schuss bis „Überlauf gefüllt"), Kolbengeschwindigkeit
     für die Druckspitze. */
  const evEnd = !shot.error && shot.events && shot.events[3] && shot.events[3].inP ? shot.events[3] : null;
  const heat = evEnd ? sleeveLoss(v, v.dwell + evEnd.t) : null;
  const spike = evEnd ? fillEndSpike(v, evEnd.v) : null;
  const fSpike = spike && v.area > 0 ? globalThis.__CLAMP_MODEL__.forceKN(spike.peak, v.area, 1, kClamp) : NaN;
  const uSpike = v.force > 0 ? fSpike / v.force : NaN;

  const chamberKvs =
    kv('Dosiergewicht', fmt(mdos) + ' kg', 'Bauteil + Anguss + Überlauf + Pressrest ' + fmt(v.biscuit) + ' kg')
    + kv('Dosiervolumen', fmt(Vdos * 1e6) + ' cm³', 'inkl. Pressrest · Flüssigdichte ' + fmt(v.density) + ' kg/m³')
    + kv('Materialausbeute', fmt(eta) + ' %', 'Bauteil / Dosiergewicht · Rest ist Kreislaufmaterial')
    + kv('Kammerverhältnis λ', fmt(ratioLD), 'λ = L/D der gewählten Kammer')
    + kv('Nachverdichtung + Schwindung', fmt(intens) + ' mm', 'Kolbenweg vom Füllende bis zur Endlage; speist Abkühl- und Erstarrungsschwund; die Schmelze verliert schon vor Solidus Temperatur und damit Dichte (ρ flüssig ' + fmt(v.density) + ' → ρ_sol ' + fmt(Math.round(rhoSolidus(v))) + ' kg/m³)');
  GROUP = 'Füllkammer';
  const nCh0 = CHECKS.length;
  const chamberRows =
      bandRow('Füllgrad', fmt(fill) + ' %', 'inkl. Pressrest', fill, v.fillMin, v.fillMax,
        100, '0 %', 'Ziel ' + fmt(v.fillMin) + '–' + fmt(v.fillMax), '100 %')
      + minRow('Pressrest', fmt(biscLen) + ' mm', 'fest in der Endlage · flüssig am Füllende ' + (isFinite(biscLiquid) ? fmt(biscLiquid) + ' mm' : '—') + ' · Minimum ' + fmt(v.biscuitMin) + ' mm',
        biscLen, v.biscuitMin, Math.max(1.6 * v.biscuitMin, 1.15 * biscLen), 'mm', 'min ' + fmt(v.biscuitMin));
  const chamberChecks = CHECKS.slice(nCh0);

  const uClamp = v.force > 0 ? req / v.force : NaN;
  const uHold = pMaxClamp > 0 ? v.psel / pMaxClamp : NaN;
  const uPw = (aMPE !== null && pwOp !== null && aMPE > 0) ? pwOp / aMPE : null;

  const restHtml = '<div class="kpanel-grid">'
    + panel('Schusskurve und Anschnitt', 'Schusskurve',
      (shot.error ? '' : kv('Schusszeit', fmt(shot.profile.endTime) + ' s', 'Dauer der Schusskurve') + kv('Kurvenhub', fmt(shot.profile.travel * 1000) + ' mm', 'Weg der Schusskurve'))
      /* PQ²-Arbeitspunkt als Kennwerte: Kolbengeschwindigkeit, Metalldruck des
         Werkzeugs und verfügbarer Druck der Maschine bei diesem Volumenstrom */
      + (op
        ? kv('PQ²-Arbeitspunkt v₂', fmt(v2) + ' m/s', 'Kolbengeschwindigkeit der 2. Phase aus der Schusskurve · Q = ' + fmt(op.Q * 1000) + ' l/s · Schnittpunkt ungedrosselt ' + fmt(Qs / pq.Ap) + ' m/s')
          + kv('PQ²-Arbeitspunkt p_m', fmt(op.p) + ' bar', 'Metalldruck des Werkzeugs am Arbeitspunkt · p = C_W·Q²')
          + kv('Maschinenlinie bei Q_AP', fmt(op.pM) + ' bar', 'ungedrosselt verfügbarer Metalldruck beim Arbeitspunkt-Volumenstrom · Drosselverlust ' + (op.pM > op.p ? fmt(op.pM - op.p) + ' bar' : 'keiner'))
        : Qs !== null
          ? kv('Schnittpunkt ungedrosselt', fmt(Qs / pq.Ap) + ' m/s', 'Maschine × Werkzeug · Q = ' + fmt(Qs * 1000) + ' l/s · p_s = ' + fmt(ps) + ' bar · keine Schusskurve')
          : ''),
      () => {
        /* Reihenfolge: Kolben (1. Phase, Maschinenlimits) → Anschnitt (v_a, J) →
           Füllzeit (Ist, NADCA) → Entlüftung. Ohne gültige Kurve steht an Stelle
           von v₁ eine Fehlerzeile. Der PQ²-Arbeitspunkt erscheint nur als Zeile,
           wenn v₂ über dem Schnittpunkt liegt (sonst Kennwert im Kopf). */
        const rV1 = shot.error ? row('Schusskurve', 'Fehler', shot.error, 'bad', 'ungültig')
          : limitRow('v₁ vs. v_krit (1. Phase)', fmt(shot.v1) + ' m/s',
            'v_krit ' + fmt(shot.vcrit) + ' m/s (CFD-Tabelle) · max. bis „Kammer voll" · v₂ ' + (shot.v2 == null ? '—' : fmt(shot.v2) + ' m/s'),
            shot.v1 / shot.vcrit);
        const rLim = (shot.error
        ? row('Kurve vs. Maschinenlimits', '—', 'Schusskurve ungültig', 'nodata')
        : (() => {
          const aPk = Math.max(shot.profile.amax, -shot.profile.amin, 0);
          const uV = v.vmax > 0 ? shot.profile.vmax / v.vmax : 0;
          const uA = v.amax > 0 ? aPk / v.amax : 0;
          const worst = Math.max(uV, uA);
          const rows =
            '<div class="meter-row"><span class="mlbl">v</span>' + meter(uV) + '</div>'
            + '<div class="meter-row"><span class="mlbl">a</span>' + meter(uA) + '</div>';
          return row('Kurve vs. Maschinenlimits', fmt(100 * worst) + ' %',
            'Spitzen v/a gegen Maschinenlimits m/s · m/s²',
            utilStatus(worst),
            utilStatus(worst) === 'ok' ? '' : (uV >= uA ? 'v ' : 'a ') + pctTag(worst),
            rows);
        })());
        const rQop = (op && op.Q > Qs
        ? row('PQ²-Arbeitspunkt', fmt(v2) + ' m/s',
          'v₂ über dem Schnittpunkt Maschine × Werkzeug (' + fmt(Qs / pq.Ap) + ' m/s), mit dieser Gießkraft nicht erreichbar',
          'bad', 'nicht erreichbar', meter(op.Q / Qs))
        : '');
        const gvTop = Math.max(1.2 * v.gateMax, 1.05 * gvShown);
        const rGv = (isFinite(gvShown)
        ? bandRow('Anschnittgeschwindigkeit', fmt(gvShown) + ' m/s',
          (gvShot != null ? 'aus Schusskurve (Bauteil gefüllt) · Mittel v₂ → ' + fmt(gvMean) + ' m/s' : 'aus v₂ (Mittel nach Anschnitt)'),
          gvShown, v.gateMin, v.gateMax, gvTop, '0 m/s', 'Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax), fmt(gvTop) + ' m/s')
        : row('Anschnittgeschwindigkeit', '—', 'braucht v₂ aus der Schusskurve', 'nodata'));
        const jTop = Math.max(1.2 * v.JatomMax, 1.05 * Jist);
        const rJ = (isFinite(Jist) && v.JatomMin > 0
        ? bandRow('Zerstäubung (J-Faktor)', fmt(Jist),
          'Ist-J bei v_a ' + fmt(gvShown) + ' m/s · Band ' + fmt(v.JatomMin) + '–' + fmt(v.JatomMax) + ' (Herman/NADCA)',
          Jist, v.JatomMin, v.JatomMax, jTop, '0', 'Band ' + fmt(v.JatomMin) + '–' + fmt(v.JatomMax), fmt(jTop))
        : row('Zerstäubung (J-Faktor)', '—', 'braucht Anschnittgeschwindigkeit, -dicke und Dichte', 'nodata'));
        const rFz = shot.error ? '' : (shot.fill === null
          ? row('Füllzeit ab Anschnitt', '—', 'Kurve endet vor „Überlauf gefüllt": Kurvenhub verlängern', 'nodata')
          : limitRow('Füllzeit ab Anschnitt', fmt(shot.fill) + ' ms', 'aus Schusskurve · max ' + fmt(v.tmax) + ' ms', shot.fill / v.tmax));
        /* Ohne Empfehlung (core/physics.js nadcaFillMs: kein Gefälle zur Form
           oder keine positive Reserve) sagt die Zeile das, statt eine fehlende
           Ist-Füllzeit zu melden. */
        const rNadca = (!isFinite(tNadca) || shot.error || shot.fill === null
        ? row('NADCA-Füllzeit', isFinite(tNadca) ? fmt(tNadca) + ' ms' : '—',
          isFinite(tNadca) ? 'empfohlen bei s = ' + fmt(v.wall) + ' mm · Ist-Füllzeit fehlt'
            : 'keine Empfehlung bei s = ' + fmt(v.wall) + ' mm: Temperaturen und zul. Erstarrung prüfen', 'nodata')
        : limitRow('NADCA-Füllzeit', fmt(shot.fill) + ' ms',
          'Ist-Füllzeit in % der Empfehlung ≤ ' + fmt(tNadca) + ' ms bei s = ' + fmt(v.wall) + ' mm',
          shot.fill / tNadca, fmt(Math.round(100 * shot.fill / tNadca)) + ' %'));
        const rVent = (isFinite(Areq) && v.vent > 0
        ? limitRow('Entlüftungsbedarf', fmt(Areq) + ' mm²',
          'vorhanden ' + fmt(v.vent) + ' mm² · bei t_f ' + fmt(tOp) + ' ms (v₂-Mittel)', Areq / v.vent)
        : row('Entlüftungsbedarf', '—', 'braucht v₂ aus der Schusskurve und Entlüftungsfläche', 'nodata'));
        return rV1 + rLim + rQop + rGv + rJ + rFz + rNadca + rVent;
      }, 'tall')

    + panel('Zuhaltung und Maschine', 'Zuhaltung', '', () => {
      const pTop = 1.1 * Math.max(pSpec, pMaxClamp);
      return (isFinite(uClamp)
        ? limitRow('Schließkraft-Auslastung', fmt(100 * uClamp) + ' %',
          fmt(req) + ' von ' + fmt(v.force) + ' kN (' + fmt(req / 10) + ' t) · S = ' + fmt(v.safety) + ' eingerechnet',
          uClamp, pctTag(uClamp))
        : row('Schließkraft-Auslastung', '—', 'braucht Maschinenkraft', 'nodata'))
      + (isFinite(uHold)
        ? limitRow('Nachdruck-Auslastung', fmt(100 * uHold) + ' %',
          'Nachdruck ' + fmt(v.psel) + ' von max. ' + fmt(pMaxClamp) + ' bar (Zuhaltung · e = (' + fmt(v.eccX) + ', ' + fmt(v.eccY) + ') mm · k = ' + fmt(kClamp) + ')',
          uHold, pctTag(uHold))
        : row('Nachdruck-Auslastung', '—', 'Zuhaltungsmodell unvollständig', 'nodata'))
      + (isFinite(uSpike)
        ? limitRow('Zuhaltung bei Druckspitze', fmt(spike.peak) + ' bar',
          'Füllende bei v_p ' + fmt(spike.vp) + ' m/s: Wasserschlag ρ·a·v_p ' + fmt(spike.hammer) + ' bar + Anschnitt ' + fmt(spike.gateP)
          + ' bar · ' + fmt(fSpike) + ' von ' + fmt(v.force) + ' kN ohne Sicherheitsfaktor (k = ' + fmt(kClamp) + ') · eine Bremsung vor dem Füllende senkt die Spitze',
          uSpike, pctTag(uSpike))
        : row('Zuhaltung bei Druckspitze', '—', 'braucht eine Schusskurve bis zum Füllende, Sprengfläche, Maschinenkraft und Schallgeschwindigkeit', 'nodata'))
      + (v.pAcc > 0 && v.injForce > 0
        ? row('Gießkraft', fmt(Feff) + ' kN',
          'Akkumulatordruck ' + fmt(Math.min(v.pAccOp, v.pAcc)) + ' von max. ' + fmt(v.pAcc) + ' bar · A_h = ' + fmt(hydArea(v)) + ' cm² · max. ' + fmt(v.injForce) + ' kN',
          v.pAccOp > v.pAcc ? 'bad' : 'ok', v.pAccOp > v.pAcc ? 'über Maximum' : fmt(Math.round(100 * Feff / v.injForce)) + ' %', meter(Feff / v.injForce))
        : row('Gießkraft', '—', 'braucht Gießkraft und Akkumulatordruck max.', 'nodata'))
      + bandRow('Spez. Gießdruck', fmt(pSpec) + ' bar', 'Gießkraft ' + fmt(Feff) + ' kN / Kolbenfläche',
        pSpec, v.psel, pMaxClamp, pTop, '0', 'Band ' + fmt(Math.round(v.psel)) + '–' + fmt(Math.round(pMaxClamp)), fmt(Math.round(pTop)) + ' bar')
      + (uPw !== null
        ? limitRow('PQ²-Leistungsauslastung', fmt(100 * uPw) + ' %',
          'Arbeitspunkt ' + fmt(pwOp) + ' von ' + fmt(aMPE) + ' MW Hüllkurve (2√3/9)·F_G·v_dry',
          uPw, pctTag(uPw))
        : row('PQ²-Leistungsauslastung', '—', 'Eingaben unvollständig (Gießkraft, v_max, Anschnitt)', 'nodata'));
    })

    + panel('Thermik und Qualität', 'Thermik',
      (isFinite(rBub)
        ? kv('Luftblasen-Kompression D_vor/D_nach', fmt(rBub),
          'Ø-Verhältnis der eingeschlossenen Luftblase beim Nachdruck ' + fmt(v.psel) + ' bar · p_vor '
          + (pVacB !== null ? fmt(pVacB * 1000) + ' mbar (Vakuum-Simulation)' : '1013 mbar (ohne Vakuum)')
          + ' · Blasenvolumen auf ' + fmt(100 / (rBub * rBub * rBub)) + ' %')
        : ''), () =>
      minRow('Anschnitt-Erstarrung', fmt(tErst) + ' ms',
        'k·s² bei s = ' + fmt(v.gateTh) + ' mm · Nachdruckaufbau ' + fmt(v.intTime) + ' ms',
        tErst, v.intTime, Math.max(1.5 * v.intTime, 1.15 * tErst), 'ms', 'min ' + fmt(v.intTime) + ' (Nachdruckaufbau)')
      + (heat
        ? limitRow('Wärmeverlust Füllkammer', fmt(heat.dT) + ' K',
          'Schmelze am Füllende ' + fmt(heat.Tmelt) + ' °C · Überhitzung ' + fmt(v.Tcast - v.Tliq) + ' K ' + (isFinite(heat.used) ? 'zu ' + fmt(Math.round(100 * heat.used)) + ' % verbraucht' : 'nicht vorhanden')
          + (heat.solidMean > 0 ? ' · ' + fmt(100 * heat.solidMean) + ' % im Mittel erstarrt' : '')
          + ' · Randschale höchstens ' + fmt(100 * heat.shellMax) + ' % · ' + fmt(heat.tS) + ' s Kontakt auf ' + fmt(heat.area) + ' m² bei Kammer ' + fmt(v.sleeveT) + ' °C',
          heat.used, isFinite(heat.used) ? fmt(Math.round(100 * heat.used)) + ' %' : 'ohne Überhitzung')
        : row('Wärmeverlust Füllkammer', '—', 'braucht eine Schusskurve bis zum Füllende, Gießtemperatur über Liquidus und Kammertemperatur', 'nodata')))
    + '</div>';

  /* Kammerkarte (ui/chamber.js): Lineal unter dem Schema — an der aktiven
     Länge ausgerichtet —, dann Kennwerte und Prüfzeilen; Urteil im Kopf. */
  chamberEl.innerHTML = '<div class="kvs">' + chamberKvs + '</div><div class="krows">' + chamberRows + '</div>';
  const rEl = document.getElementById('chamber-ruler');
  if (rEl) rEl.innerHTML = rulerHTML(v, { L: v.length, fill, sFill, p1, cav, intens, bisc: biscLen, p3, x0: ACTIVE_SPAN.x0, x1: ACTIVE_SPAN.x1 });
  const vEl = document.getElementById('chamber-verdict');
  if (vEl) vEl.innerHTML = groupVerdict(chamberChecks);
  el.innerHTML = restHtml;
  wireLinks(chamberEl.closest('.chamber-card') || chamberEl);
  wireLinks(el);
  const bar = document.getElementById('checkbar');
  if (bar) {
    bar.innerHTML = checklistHTML();
    wireLinks(bar);
  }
}
