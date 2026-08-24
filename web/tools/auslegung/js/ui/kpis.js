/* Kennzahlen oberhalb der Diagramme: die Füllkammer/Massen-Gruppe lebt in
   der Kammerkarte (ui/chamber.js — Schema, ausgerichtetes Kolbenweg-Lineal,
   Kennwerte, Prüfzeilen, Urteil im Kopf), darunter drei Prüfpanels:
   Schusskurve/Anschnitt · Zuhaltung/Maschine ·
   Schusskurve/Anschnitt · Thermik/Qualität. Alle Werte sind dieselben
   Formeln wie in den Diagrammen.

   Ein Panel hat drei Teile: einen Kopf mit Gruppenurteil, einen Streifen
   reiner Kennwerte (ohne Bewertung) und die Prüfzeilen mit fester
   Spaltenordnung Name · Wert · Leiste · Urteil — so stehen alle Leisten
   einer Gruppe in einer Spalte und lassen sich wie ein Messprotokoll lesen.
   Leisten: Zielband → Bullet (Track = plausibler Bereich, Band = Ziel,
   Marker = Ist), Limit → Meter (Füllung = Auslastung, Farbe = Bewertung:
   ok → knapp ab 80 % → verletzt über 100 %). Jede Bewertung trägt ein
   Text-Tag (✓/!/✕) — nie Farbe allein. „Keine Daten" ist neutral.
   Das Füllkammer-Panel zeigt den Kolbenweg als Lineal (1. Phase bis
   „Kammer voll", danach die Schmelzesäule aus Anguss, Bauteil + Überlauf
   und Pressrest). Die Prüfleiste (#checkbar) fasst alle bewerteten Zeilen
   mit Prüfpunkten je Gruppe zusammen. */

import { fmt, subHTML } from '../core/format.js';
import { total, afterGate, pistonArea, travel, injForceEff, hydArea, cavityVolume, cavityTravel, biscuitSolid, intensStroke, rhoSolidus } from '../core/physics.js';
import { pqCore } from '../charts/pq2.js';
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

/* Panel: Kopf mit Gruppenurteil, Kennwertstreifen, Zusatz (z. B. Lineal),
   Prüfzeilen. rowsFn wird erst hier aufgerufen, damit die Zeilen der
   richtigen Gruppe zugeordnet werden. */
function groupVerdict(mine) {
  if (!mine.length) return '';
  const bad = mine.filter(c => c.status === 'bad').length;
  const warn = mine.filter(c => c.status === 'warn').length;
  const verdict = bad ? bad + ' verletzt' : warn ? warn + ' knapp' : 'alle erfüllt';
  return '<b>' + (mine.length - bad) + '/' + mine.length + '</b><span class="dotrow">' + dotsHTML(mine) + '</span><span>' + verdict + '</span>';
}

function panel(title, short, kvHtml, rowsFn, extraHtml = '', cls = '') {
  GROUP = short;
  const n0 = CHECKS.length;
  const rowsHtml = rowsFn();
  const mine = CHECKS.slice(n0);
  return '<div class="kpanel ' + cls + '">'
    + '<div class="kpanel-head"><h3>' + title + '</h3>'
    + (mine.length ? '<div class="kverdict">' + groupVerdict(mine) + '</div>' : '')
    + '</div>'
    + (kvHtml ? '<div class="kvs">' + kvHtml + '</div>' : '')
    + extraHtml
    + '<div class="krows">' + rowsHtml + '</div></div>';
}

const clampPct = x => Math.max(0, Math.min(100, x));

/* Bullet: Track über [lo, hi], Zielband [bandLo, bandHi], Marker bei val.
   Nicht-endliche Anteile (z. B. hi == lo bei Null-Eingaben) → 0 %. */
function bullet(lo, hi, bandLo, bandHi, val, lblL, lblM, lblR) {
  const pct = x => { const p = 100 * (x - lo) / (hi - lo); return isFinite(p) ? clampPct(p) : 0; };
  return '<div class="kpi-bullet">'
    + '<span class="band" style="left:' + pct(bandLo) + '%;width:' + (pct(bandHi) - pct(bandLo)) + '%"></span>'
    + '<span class="mark" style="left:' + pct(val) + '%"></span></div>'
    + '<div class="kpi-scale"><span>' + lblL + '</span><span>' + lblM + '</span><span>' + lblR + '</span></div>';
}

/* Meter: Füllung = Auslastung (Ist/Limit), Limit-Marke bei Überschreitung. */
function meter(util) {
  const fill = clampPct(100 * Math.min(util, 1));
  const lim = util > 1 ? clampPct(100 / util) : 100;
  return '<div class="kpi-meter"><span class="fill" style="width:' + fill + '%"></span>'
    + '<span class="limit" style="left:' + lim + '%"></span></div>';
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

/* Kolbenweg-Lineal: 0 … L. Bis s_voll (= (1 − φ)·L) läuft die 1. Phase,
   danach die Formfüllung (Anguss, Bauteil + Überlauf — Kavitäten fest, ρ_sol),
   dann der Hub für Nachverdichtung + Schwindung Δs (der Kolben speist Abkühl- und Erstarrungsschwund)
   bis zur Endlage mit festem Pressrest. Läuft die flüssige Säule p3 über
   die Kammer hinaus (p3 > L), wird die Skala auf p3 gedehnt und die
   Kammerlänge als Grenze markiert.
   Darüber eine zweite, dünne Spur: ab wo die Einfüllöffnung dicht ist und
   über welchen Kolbenweg Vakuum gezogen wird (vacStart bis Füllende). */
function rulerHTML(v, g) {
  const { L, fill, sFill, p1, cav, intens, bisc, p3 } = g;
  const span = Math.max(L, p3);
  const over = p3 > L;
  /* g.x0/g.x1: Lage der aktiven Länge in Anteilen der Kartenbreite — damit
     liegt das Lineal exakt unter der Kolbenstirn bzw. dem Kammerende des
     Schemas. Ohne Angabe volle Breite. */
  const P0 = 100 * (g.x0 || 0), P1 = 100 * (g.x1 != null ? g.x1 : 1);
  const x = s => (P0 + (P1 - P0) * Math.max(0, Math.min(span, s)) / span).toFixed(2) + '%';
  const w = len => ((P1 - P0) * Math.max(0, len) / span).toFixed(2) + '%';
  const vacOn = v.vacModel && v.vacModel !== 'aus' && v.vacStart >= 0;
  const sEnd = over ? span : sFill + cav;                      // Füllende
  const vacHtml = '<div class="kr-vac' + (vacOn ? '' : ' off') + '">'
    + '<span class="vl" style="margin-left:' + P0.toFixed(2) + '%">' + (vacOn
      ? 'Vakuum ab ' + fmt(Math.round(v.vacStart)) + ' mm bis Füllende ' + fmt(Math.round(sEnd)) + ' mm'
      : 'ohne Vakuum')
    + (v.sealStroke > 0 ? ' · Einfüllöffnung dicht ab ' + fmt(Math.round(v.sealStroke)) + ' mm' : '') + '</span>'
    + '<div class="kr-vtrack">'
    + (g.x0 != null ? '<span class="base" style="left:' + x(0) + ';width:' + w(span) + '"></span>' : '')
    + (vacOn && sEnd > v.vacStart ? '<span class="seg" style="left:' + x(v.vacStart) + ';width:' + w(Math.min(span, sEnd) - Math.max(0, v.vacStart)) + '"></span>' : '')
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
  return '<div class="kruler' + (over ? ' over' : '') + (g.x0 != null ? ' aligned' : '') + '">'
    /* Im ausgerichteten Modus stehen D und L bereits im Schema darüber */
    + (g.x0 != null ? '' : '<div class="kr-head"><span>Kolbenweg</span><span>Ø ' + fmt(v.diam) + ' × L ' + fmt(L) + ' mm</span></div>')
    + vacHtml
    /* Obere Beschriftung: „Füllende" rechtsbündig an seiner Marke; die
       Kammerlänge steht im Kopf und nur dann auch hier, wenn Platz ist. */
    + '<div class="kr-lbl top"><span style="left:' + x(0) + '">0</span>'
    + (over ? '' : '<span style="left:' + x(sFill) + '">Kammer voll ' + mm(sFill) + '</span>')
    + (over ? '' : '<span style="left:' + x(sEnd) + '" class="end">Füllende ' + mm(sEnd) + '</span>')
    + (over || sEnd / span < 0.72 ? '<span style="left:' + x(L) + '" class="end">' + mm(L) + ' mm</span>' : '') + '</div>'
    + '<div class="kr-track">'
    + (g.x0 != null ? '<span class="seg base" style="left:' + x(0) + ';width:' + w(span) + '"></span>' : '')
    + segs
    + '<i class="tick" style="left:' + x(0) + '"></i>'
    + (over ? '' : '<i class="tick" style="left:' + x(sFill) + '"></i><i class="tick" style="left:' + x(sEnd) + '"></i>')
    + '<i class="tick' + (over ? ' lim' : '') + '" style="left:' + x(L) + '"></i>'
    + '</div>'
    + '<div class="kr-lbl bot">'
    + (over
      ? '<span style="left:0">Schmelzesäule ' + mm(p3) + ' mm — ' + mm(p3 - L) + ' mm länger als die Kammer</span>'
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
   übrigen Panels. Ohne chamberEl rendert alles als Panels in el.
   Die Prüfleiste landet in #checkbar, falls vorhanden. */
export function renderKpis(el, v, shot, chamberEl) {
  CHECKS = [];
  const A = pistonArea(v);
  const mdos = total(v) + v.biscuit;
  const Vdos = mdos / v.density;                                   // m³
  const req = window.__CLAMP_MODEL__.forceKN(v.psel, v.area, v.safety, 1);
  const fill = 100e9 * Vdos / (v.length * A);
  const p3 = travel(mdos, v);                                     // flüssige Säule in der Kammer
  const sFill = (1 - fill / 100) * v.length;
  const p1 = cavityTravel(v.runner, v);                           // Kavitäten fest (ρ_sol)
  const cav = cavityTravel(total(v), v);
  const biscLen = biscuitSolid(v);                                // Pressrest fest (Endlage)
  const biscLiquid = travel(v.biscuit, v);
  const intens = intensStroke(v);                                 // Nachverdichtungshub
  const ratioLD = v.length / v.diam;
  const eta = mdos > 0 ? 100 * v.part / mdos : NaN;

  /* Zuhaltung + spezifischer Gießdruck (Rechenkern: shared/clampmodel.js) */
  const kClamp = (v.tieX > 0 && v.tieY > 0)
    ? window.__CLAMP_MODEL__.leverK(v.eccX, v.eccY, v.tieX, v.tieY) : 1;
  const pMaxClamp = window.__CLAMP_MODEL__.pMax(v.force, v.area, v.safety, kClamp);
  const Feff = injForceEff(v);
  const pSpec = Feff * 1e4 / A;

  /* PQ²-Arbeitspunkt (gleiche Rechnung wie im PQ²-Diagramm) */
  /* PQ²-Arbeitspunkt und Hüllkurve: dieselbe Rechnung wie im PQ²-Diagramm (pqCore) */
  const v2 = !shot.error && shot.v2 != null ? shot.v2 : NaN;
  const pq = pqCore(v);
  const Qs = pq ? pq.Qs : null, ps = pq ? pq.ps : null;
  const aMPE = (Feff > 0 && v.vmax > 0)
    ? (2 * Math.sqrt(3) / 9) * Feff * 1e3 * v.vmax / 1e6 : null;   // MW
  /* Realer Betriebspunkt: Q = A_K·v₂ auf der Werkzeuglinie (Schnittpunkt = ungedrosselt) */
  const Qop = pq && isFinite(v2) && v2 > 0 ? pq.Ap * v2 : null;
  const pOp = Qop !== null ? pq.Cdie * Qop * Qop : null;
  /* Maschinenlinie am Arbeitspunkt: verfügbarer Metalldruck ungedrosselt (0 über Q_dry) */
  const pMop = Qop !== null ? (Qop < pq.Qmax ? pq.p0 * (1 - (Qop / pq.Qmax) ** 2) : 0) : null;
  const pwOp = Qop !== null ? pOp * 1e5 * Qop / 1e6 : (pq ? pq.ps * 1e5 * pq.Qs / 1e6 : null);   // MW

  /* Anschnittgeschwindigkeit: bevorzugt aus der Schusskurve (Bauteil gefüllt);
     sonst mit v2 = mittlerer Kolbengeschw. nach Anschnitt (ebenfalls Kurve) */
  const gvMean = v.gate > 0 ? v2 * A / v.gate : NaN;
  const evPart = !shot.error && shot.events && shot.events[2];
  const gvShot = evPart && evPart.inP && evPart.gv != null ? evPart.gv : null;
  const gvShown = gvShot != null ? gvShot : gvMean;

  /* Zerstäubung: Ist-J aus der Anschnittgeschwindigkeit (Herman/NADCA,
     UPCT Gl. 2.38) — Umkehrung der v_a-Grenze im PQ²-Diagramm, dieselben
     Zoll-Einheiten: J = (v_a/0,0254)^1,71 · (t/25,4) · (ρ·3,6127e-5). */
  const Jist = (isFinite(gvShown) && gvShown > 0 && v.gateTh > 0 && v.density > 0)
    ? Math.pow(gvShown / 0.0254, 1.71) * (v.gateTh / 25.4) * (v.density * 3.6127e-5) : NaN;

  /* Thermik und Qualität */
  const denN = v.Tflow - v.Tdie;
  const tNadca = denN !== 0 ? v.kfill * v.wall * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / denN : NaN;
  const Vm = cavityVolume(total(v), v);
  const tOp = 1e9 * cavityVolume(afterGate(v), v) / (v2 * A);
  const Areq = tOp > 0 && v.vAirMax > 0 ? Vm / (tOp / 1000) / v.vAirMax * 1e6 : NaN;
  const tErst = v.solK * v.gateTh * v.gateTh;

  const chamberKvs =
    kv('Dosiergewicht', fmt(mdos) + ' kg', 'Bauteil + Anguss + Überlauf + Pressrest ' + fmt(v.biscuit) + ' kg')
    + kv('Dosiervolumen', fmt(Vdos * 1e6) + ' cm³', 'inkl. Pressrest · Flüssigdichte ' + fmt(v.density) + ' kg/m³')
    + kv('Materialausbeute', fmt(eta) + ' %', 'Bauteil / Dosiergewicht · Rest ist Kreislaufmaterial')
    + kv('Kammerverhältnis λ', fmt(ratioLD), 'λ = L/D der gewählten Kammer')
    + kv('Nachverdichtung + Schwindung', fmt(intens) + ' mm', 'Kolbenweg vom Füllende bis zur Endlage — speist Abkühl- und Erstarrungsschwund; die Schmelze verliert schon vor Solidus Temperatur und damit Dichte (ρ flüssig ' + fmt(v.density) + ' → ρ_sol ' + fmt(Math.round(rhoSolidus(v))) + ' kg/m³)');
  GROUP = 'Füllkammer';
  const nCh0 = CHECKS.length;
  const chamberRows =
      row('Füllgrad', fmt(fill) + ' %', 'inkl. Pressrest',
        bandStatus(fill, v.fillMin, v.fillMax), bandTag(fill, v.fillMin, v.fillMax),
        bullet(0, 100, v.fillMin, v.fillMax, fill,
          '0 %', 'Ziel ' + fmt(v.fillMin) + '–' + fmt(v.fillMax), '100 %'))
      + row('Pressrest', fmt(biscLen) + ' mm', 'fest in der Endlage · flüssig am Füllende ' + fmt(biscLiquid) + ' mm · Minimum ' + fmt(v.biscuitMin) + ' mm',
        minStatus(biscLen, v.biscuitMin), minTag(biscLen, v.biscuitMin),
        bullet(0, Math.max(1.6 * v.biscuitMin, 1.15 * biscLen), v.biscuitMin, Math.max(1.6 * v.biscuitMin, 1.15 * biscLen), biscLen,
          '0 mm', 'min ' + fmt(v.biscuitMin), fmt(Math.max(1.6 * v.biscuitMin, 1.15 * biscLen)) + ' mm'));
  const chamberChecks = CHECKS.slice(nCh0);
  const rulerGeom = { L: v.length, fill, sFill, p1, cav, intens, bisc: biscLen, p3 };

  const uClamp = v.force > 0 ? req / v.force : NaN;
  const uHold = pMaxClamp > 0 ? v.psel / pMaxClamp : NaN;
  const uPw = (aMPE !== null && pwOp !== null && aMPE > 0) ? pwOp / aMPE : null;

  const restHtml = '<div class="kpanel-grid">'
    + panel('Schusskurve und Anschnitt', 'Schusskurve',
      (shot.error ? '' : kv('Schusszeit', fmt(shot.profile.endTime) + ' s', 'Dauer der Schusskurve') + kv('Kurvenhub', fmt(shot.profile.travel * 1000) + ' mm', 'Weg der Schusskurve'))
      /* PQ²-Arbeitspunkt als Kennwerte: Kolbengeschwindigkeit, Metalldruck des
         Werkzeugs und verfügbarer Druck der Maschine bei diesem Volumenstrom */
      + (Qop !== null
        ? kv('PQ²-Arbeitspunkt v₂', fmt(v2) + ' m/s', 'Kolbengeschwindigkeit der 2. Phase aus der Schusskurve · Q = ' + fmt(Qop * 1000) + ' l/s · Schnittpunkt ungedrosselt ' + fmt(Qs / pq.Ap) + ' m/s')
          + kv('PQ²-Arbeitspunkt p_m', fmt(pOp) + ' bar', 'Metalldruck des Werkzeugs am Arbeitspunkt · p = C_W·Q²')
          + kv('Maschinenlinie bei Q_AP', fmt(pMop) + ' bar', 'ungedrosselt verfügbarer Metalldruck beim Arbeitspunkt-Volumenstrom · Drosselverlust ' + (pMop > pOp ? fmt(pMop - pOp) + ' bar' : 'keiner'))
        : Qs !== null
          ? kv('Schnittpunkt ungedrosselt', fmt(Qs / pq.Ap) + ' m/s', 'Maschine × Werkzeug · Q = ' + fmt(Qs * 1000) + ' l/s · p_s = ' + fmt(ps) + ' bar · keine Schusskurve')
          : ''),
      () => {
        /* Reihenfolge: Kolben (1. Phase, Maschinenlimits) → Anschnitt (v_a, J) →
           Füllzeit (Ist, NADCA) → Entlüftung. Ohne gültige Kurve steht an Stelle
           von v₁ eine Fehlerzeile. Der PQ²-Arbeitspunkt erscheint nur als Zeile,
           wenn v₂ über dem Schnittpunkt liegt (sonst Kennwert im Kopf). */
        const rV1 = shot.error ? row('Schusskurve', 'Fehler', shot.error, 'bad', 'ungültig')
          : row('v₁ vs. v_krit (1. Phase)', fmt(shot.v1) + ' m/s',
          'v_krit ' + fmt(shot.vcrit) + ' m/s (CFD-Tabelle) · max. bis „Kammer voll" · v₂ ' + (shot.v2 == null ? '—' : fmt(shot.v2) + ' m/s'),
          utilStatus(shot.v1 / shot.vcrit), utilTag(shot.v1 / shot.vcrit), meter(shot.v1 / shot.vcrit));
        const rLim = (shot.error
        ? row('Kurve vs. Maschinenlimits', '—', 'Schusskurve ungültig', 'nodata')
        : (() => {
          const aPk = Math.max(shot.profile.amax, -shot.profile.amin, 0);
          const uV = v.vmax > 0 ? shot.profile.vmax / v.vmax : 0;
          const uA = v.amax > 0 ? aPk / v.amax : 0;
          const worst = Math.max(uV, uA);
          const rows =
            '<div class="meter-row"><span class="mlbl">v</span>' + meter(uV)
            + '<span class="mval">' + fmt(shot.profile.vmax) + '/' + fmt(v.vmax) + '</span></div>'
            + '<div class="meter-row"><span class="mlbl">a</span>' + meter(uA)
            + '<span class="mval">' + fmt(aPk) + '/' + fmt(v.amax) + '</span></div>';
          return row('Kurve vs. Maschinenlimits', fmt(100 * worst) + ' %',
            'Spitzen v/a gegen Maschinenlimits m/s · m/s²',
            utilStatus(worst),
            utilStatus(worst) === 'ok' ? '' : (uV >= uA ? 'v ' : 'a ') + pctTag(worst),
            rows);
        })());
        const rQop = (Qop !== null && Qop > Qs
        ? row('PQ²-Arbeitspunkt', fmt(v2) + ' m/s',
          'v₂ über dem Schnittpunkt Maschine × Werkzeug (' + fmt(Qs / pq.Ap) + ' m/s) — mit dieser Gießkraft nicht erreichbar',
          'bad', 'nicht erreichbar', meter(Qop / Qs))
        : '');
        const rGv = (isFinite(gvShown)
        ? row('Anschnittgeschwindigkeit', fmt(gvShown) + ' m/s',
          (gvShot != null ? 'aus Schusskurve (Bauteil gefüllt) · Mittel v₂ → ' + fmt(gvMean) + ' m/s' : 'aus v₂ (Mittel nach Anschnitt)'),
          bandStatus(gvShown, v.gateMin, v.gateMax), bandTag(gvShown, v.gateMin, v.gateMax),
          bullet(0, Math.max(1.2 * v.gateMax, 1.05 * gvShown), v.gateMin, v.gateMax, gvShown,
            '0 m/s', 'Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax), fmt(Math.max(1.2 * v.gateMax, 1.05 * gvShown)) + ' m/s'))
        : row('Anschnittgeschwindigkeit', '—', 'braucht v₂ aus der Schusskurve', 'nodata'));
        const rJ = (isFinite(Jist) && v.JatomMin > 0
        ? row('Zerstäubung (J-Faktor)', fmt(Jist),
          'Ist-J bei v_a ' + fmt(gvShown) + ' m/s · Band ' + fmt(v.JatomMin) + '–' + fmt(v.JatomMax) + ' (Herman/NADCA)',
          bandStatus(Jist, v.JatomMin, v.JatomMax), bandTag(Jist, v.JatomMin, v.JatomMax),
          bullet(0, Math.max(1.2 * v.JatomMax, 1.05 * Jist), v.JatomMin, v.JatomMax, Jist,
            '0', 'Band ' + fmt(v.JatomMin) + '–' + fmt(v.JatomMax), fmt(Math.max(1.2 * v.JatomMax, 1.05 * Jist))))
        : row('Zerstäubung (J-Faktor)', '—', 'braucht Anschnittgeschwindigkeit, -dicke und Dichte', 'nodata'));
        const rFz = shot.error ? '' : (shot.fill === null
          ? row('Füllzeit ab Anschnitt', '—', 'Kurve endet vor „Überlauf gefüllt" — Kurvenhub verlängern', 'nodata')
          : row('Füllzeit ab Anschnitt', fmt(shot.fill) + ' ms', 'aus Schusskurve · max ' + fmt(v.tmax) + ' ms',
            utilStatus(shot.fill / v.tmax), utilTag(shot.fill / v.tmax), meter(shot.fill / v.tmax)));
        const rNadca = (!isFinite(tNadca) || shot.error || shot.fill === null
        ? row('NADCA-Füllzeit', isFinite(tNadca) ? fmt(tNadca) + ' ms' : '—',
          'empfohlen bei s = ' + fmt(v.wall) + ' mm · Ist-Füllzeit fehlt', 'nodata')
        : row('NADCA-Füllzeit', fmt(shot.fill) + ' ms',
          'Ist-Füllzeit in % der Empfehlung ≤ ' + fmt(tNadca) + ' ms bei s = ' + fmt(v.wall) + ' mm',
          utilStatus(shot.fill / tNadca),
          fmt(Math.round(100 * shot.fill / tNadca)) + ' %', meter(shot.fill / tNadca)));
        const rVent = (isFinite(Areq) && v.vent > 0
        ? row('Entlüftungsbedarf', fmt(Areq) + ' mm²',
          'vorhanden ' + fmt(v.vent) + ' mm² · bei t_f ' + fmt(tOp) + ' ms (v₂-Mittel)',
          utilStatus(Areq / v.vent), utilTag(Areq / v.vent), meter(Areq / v.vent))
        : row('Entlüftungsbedarf', '—', 'braucht v₂ aus der Schusskurve und Entlüftungsfläche', 'nodata'));
        return rV1 + rLim + rQop + rGv + rJ + rFz + rNadca + rVent;
      }, '', 'tall')

    + panel('Zuhaltung und Maschine', 'Zuhaltung', '', () =>
      (isFinite(uClamp)
        ? row('Schließkraft-Auslastung', fmt(100 * uClamp) + ' %',
          fmt(req) + ' von ' + fmt(v.force) + ' kN (' + fmt(req / 10) + ' t) · S = ' + fmt(v.safety) + ' eingerechnet',
          utilStatus(uClamp), pctTag(uClamp), meter(uClamp))
        : row('Schließkraft-Auslastung', '—', 'braucht Maschinenkraft', 'nodata'))
      + (isFinite(uHold)
        ? row('Nachdruck-Auslastung', fmt(100 * uHold) + ' %',
          'Auslegung ' + fmt(v.psel) + ' von max. ' + fmt(pMaxClamp) + ' bar (Zuhaltung · e = (' + fmt(v.eccX) + ', ' + fmt(v.eccY) + ') mm · k = ' + fmt(kClamp) + ')',
          utilStatus(uHold), pctTag(uHold), meter(uHold))
        : row('Nachdruck-Auslastung', '—', 'Zuhaltungsmodell unvollständig', 'nodata'))
      + (v.pAcc > 0 && v.injForce > 0
        ? row('Gießkraft', fmt(Feff) + ' kN',
          'Akkumulatordruck ' + fmt(Math.min(v.pAccOp, v.pAcc)) + ' von max. ' + fmt(v.pAcc) + ' bar · A_h = ' + fmt(hydArea(v)) + ' cm² · max. ' + fmt(v.injForce) + ' kN',
          v.pAccOp > v.pAcc ? 'bad' : 'ok', v.pAccOp > v.pAcc ? 'über Maximum' : fmt(Math.round(100 * Feff / v.injForce)) + ' %', meter(Feff / v.injForce))
        : row('Gießkraft', '—', 'braucht Gießkraft und Akkumulatordruck max.', 'nodata'))
      + row('Spez. Gießdruck', fmt(pSpec) + ' bar', 'Gießkraft ' + fmt(Feff) + ' kN / Kolbenfläche',
        bandStatus(pSpec, v.psel, pMaxClamp), bandTag(pSpec, v.psel, pMaxClamp),
        bullet(0, 1.1 * Math.max(pSpec, pMaxClamp), v.psel, pMaxClamp, pSpec,
          '0', 'Band ' + fmt(Math.round(v.psel)) + '–' + fmt(Math.round(pMaxClamp)), fmt(Math.round(1.1 * Math.max(pSpec, pMaxClamp))) + ' bar'))
      + (uPw !== null
        ? row('PQ²-Leistungsauslastung', fmt(100 * uPw) + ' %',
          'Arbeitspunkt ' + fmt(pwOp) + ' von ' + fmt(aMPE) + ' MW Hüllkurve (2√3/9)·F_G·v_dry',
          utilStatus(uPw), pctTag(uPw), meter(uPw))
        : row('PQ²-Leistungsauslastung', '—', 'Eingaben unvollständig (Gießkraft, v_max, Anschnitt)', 'nodata')))

    + panel('Thermik und Qualität', 'Thermik', '', () =>
      row('Anschnitt-Erstarrung', fmt(tErst) + ' ms',
        'k·s² bei s = ' + fmt(v.gateTh) + ' mm · Nachdruckaufbau ' + fmt(v.intTime) + ' ms',
        minStatus(tErst, v.intTime), minTag(tErst, v.intTime),
        bullet(0, Math.max(1.5 * v.intTime, 1.15 * tErst), v.intTime, Math.max(1.5 * v.intTime, 1.15 * tErst), tErst,
          '0 ms', 'min ' + fmt(v.intTime) + ' (Nachdruckaufbau)', fmt(Math.max(1.5 * v.intTime, 1.15 * tErst)) + ' ms')))
    + '</div>';

  if (chamberEl) {
    /* Kammerkarte (ui/chamber.js): Lineal unter dem Schema — an der aktiven
       Länge ausgerichtet —, dann Kennwerte und Prüfzeilen; Urteil im Kopf. */
    chamberEl.innerHTML = '<div class="kvs">' + chamberKvs + '</div><div class="krows">' + chamberRows + '</div>';
    const rEl = document.getElementById('chamber-ruler');
    if (rEl) rEl.innerHTML = rulerHTML(v, { ...rulerGeom, x0: ACTIVE_SPAN.x0, x1: ACTIVE_SPAN.x1 });
    const vEl = document.getElementById('chamber-verdict');
    if (vEl) vEl.innerHTML = groupVerdict(chamberChecks);
    el.innerHTML = restHtml;
    wireLinks(chamberEl.closest('.chamber-card') || chamberEl);
  } else {
    el.innerHTML = '<div class="kpanel"><div class="kpanel-head"><h3>Füllkammer und Massenbilanz</h3>'
      + '<div class="kverdict">' + groupVerdict(chamberChecks) + '</div></div>'
      + '<div class="kvs">' + chamberKvs + '</div>' + rulerHTML(v, rulerGeom)
      + '<div class="krows">' + chamberRows + '</div></div>' + restHtml;
  }

  wireLinks(el);
  const bar = document.getElementById('checkbar');
  if (bar) {
    bar.innerHTML = checklistHTML();
    wireLinks(bar);
  }
}
