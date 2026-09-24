/* Füllkammer-Schema oberhalb der KPI-Kacheln: Seitenansicht (Schnitt) mit
   aktiver Länge L, Kolben-Ø D, Füllgrad φ, Hub bis „Kammer voll“ und der
   Einfüllöffnung. Drei Ausführungen des Kammerendes wählbar: bündig an der
   Trennebene, mit Verdränger, oder verlängert in die Auswerferseite.
   Reines SVG; Werte kommen aus denselben Formeln wie die KPIs. Alle Stile
   sind inline, damit der PNG-Export ohne Seiten-CSS funktioniert.

   Farben: Rollen der Palette (shared/palette.js), beim Bauen gelesen und
   als Werte ins SVG geschrieben, nicht als var(--…): der PNG-Export rastert
   das SVG ohne die Seite und kennt deren Tokens nicht. Nach einem Wechsel
   des Farbschemas baut die Seite die Zeichnung neu (ui/page.js).
     Stahl       Kammerwand `steel` mit Schraffur und Kante in `steelDark`;
                 Formhälften dieselbe Rolle, heller (Deckkraft); der
                 Verdränger `steelDark`; die Trennebene gestrichelt.
     Schmelze    `melt` (nach oben heller), der Spiegel in `runner`, der
                 Eingussstrahl `melt`; Schrift darauf in `text`.
     Kolben      `piston`, die Stange heller, die Stirn in `text`.
     Maße        `text` und `muted`; die aktive Länge L und die Füllhöhe h
                 als betonte Maße in `primary` (Marke als Hervorhebung einer
                 Beschriftung, kein Messwert und kein Urteil). */

import { fmt } from '../core/format.js';
import { doseMass, fillRatio, segHeight } from '../core/physics.js';
import { COPY_SVG, copyPngBlob } from './export.js';

/* ── Zeichnungs-Konstanten (px im viewBox 1030×440) ── */
const XP = 225;                 // Kolbenstirn (Startposition)
const X0 = 110;                 // Kammerrohr links
const XA = 800;                 // aktives Ende (fest — die Zahlen sind live)
/* Sichtfeld: links der Seitenansicht steht die Frontansicht der Kammer
   (Kreis mit Ø D und Füllhöhe h). */
const VX = -216, VW = 1246;     // viewBox: x-Start und Breite
/* Lage der aktiven Länge im viewBox — das Kolbenweg-Lineal der
   Massenbilanz richtet sich daran aus (ui/kpis.js). */
export const ACTIVE_SPAN = { x0: (XP - VX) / VW, x1: (XA - VX) / VW };

const YT = 130, YB = 290;       // Bohrung oben/unten
const WT = 20;                  // Wandstärke

/* Kammerende-Varianten: gleiche aktive Länge, anderes Rohrende. */
const VARIANTS = {
  A: { tubeEnd: XA },           // Rohr endet an der Trennebene
  B: { tubeEnd: XA + 66 },      // Rohr länger, Verdränger füllt das Ende
  C: { tubeEnd: XA - 82 }       // Rohr kürzer, Schmelze läuft ins Werkzeug
};
let variant = 'A';

/* Die Farben der Zeichnung, frisch aus dem aktuellen Schema. */
function themeColors() {
  const P = window.__PALETTE__;
  return {
    text: P.text,
    primary: P.primary,
    muted: P.muted,
    surface: P.surface,
    steel: P.steel,
    steelDark: P.steelDark,
    piston: P.piston,
    melt: P.melt,
    meltTop: P.mix('melt', 'surface', 0.25),
    runner: P.runner
  };
}

/* Text mit Halo in der Fläche (Bemaßungen und Beschriftungen), Stile inline. */
function label(x, y, t, o) {
  o = o || {};
  return '<text x="' + x + '" y="' + y + '" font-family="Arial, sans-serif"'
    + ' font-size="' + (o.size || 11) + '"' + (o.bold ? ' font-weight="bold"' : '')
    + ' fill="' + o.fill + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '')
    + (o.transform ? ' transform="' + o.transform + '"' : '')
    + ' paint-order="stroke" stroke="' + o.halo + '" stroke-width="3" stroke-linejoin="round">'
    + t + '</text>';
}

function ext(x, y1, y2, col) {
  return '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke="' + col + '" stroke-width=".7"/>';
}

/* variantKey nur für Tests — im Betrieb kommt die Variante aus den Tabs. */
export function buildSvg(v, variantKey) {
  const va = variantKey || variant;
  const C = themeColors();
  /* Beschriftung mit Halo in der Fläche (Standard) */
  const lbl = (x, y, t, o) => label(x, y, t, Object.assign({ halo: C.surface }, o));
  const dimH = (x1, x2, y, text, col, marker, o) =>
    '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + col
    + '" stroke-width="' + ((o && o.width) || 1) + '" marker-start="url(#' + marker + ')" marker-end="url(#' + marker + ')"/>'
    + lbl((x1 + x2) / 2, y - 6, text, { fill: col, anchor: 'middle', size: (o && o.size) || 11, bold: o && o.bold });
  const mdos = doseMass(v);
  const phiRaw = fillRatio(v);
  const phi = isFinite(phiRaw) ? Math.min(Math.max(phiRaw, 0), 1) : 0;
  const sF = (1 - phi) * v.length;
  /* Füllhöhe h/D der Schmelze: Kreissegment mit Flächenanteil φ (Theorie
     „Kreissegmente der Füllkammer") — Seiten- und Frontansicht */
  const hFrac = segHeight(phi);

  const tubeEnd = VARIANTS[va].tubeEnd;
  const part = tubeEnd;                          // Trennebene: das Rohr endet immer dort
  const XF0 = part - 110, DIE1 = part + 150;     // feste Hälfte (vom Rohr durchdrungen), Auswerferseite
  const ghost = Math.min(Math.max(XP + (1 - phi) * (XA - XP), XP + 2), XA - 2);
  const meltH = hFrac * (YB - YT), mTop = YB - meltH;

  /* px pro mm entlang der Kammer; Einfüllöffnung endet beim Verschluss-Hub.
     Nicht-finite Eingaben (leeres Feld, veralteter Zustand) fallen auf die
     Defaults zurück, damit die Wände nie mit NaN-Koordinaten verschwinden. */
  const pxmm = (isFinite(v.length) && v.length > 0) ? (XA - XP) / v.length : 575 / 700;
  const seal = isFinite(v.sealStroke) ? v.sealStroke : 150;
  const PH1 = Math.min(Math.max(XP + seal * pxmm, XP + 80), tubeEnd - 50);
  const PH0 = PH1 - 80;

  let s = '<svg viewBox="' + VX + ' 0 ' + VW + ' 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Füllkammer: Frontansicht (Ø D, Füllhöhe h) und Seitenansicht">';
  /* Stahl: Kammerwand voll, Formhälften heller (Deckkraft), Verdränger in
     der Kantenfarbe; die Schraffur in steelDark. */
  s += '<defs>'
    + '<pattern id="ch-steel" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">'
    + '<rect width="7" height="7" fill="' + C.steel + '"/><line x1="0" y1="0" x2="0" y2="7" stroke="' + C.steelDark + '" stroke-opacity=".8" stroke-width="1.1"/></pattern>'
    + '<pattern id="ch-die" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(-45)">'
    + '<rect width="9" height="9" fill="' + C.steel + '" fill-opacity=".55"/><line x1="0" y1="0" x2="0" y2="9" stroke="' + C.steelDark + '" stroke-opacity=".5" stroke-width="1"/></pattern>'
    + '<pattern id="ch-displ" patternUnits="userSpaceOnUse" width="6" height="6">'
    + '<rect width="6" height="6" fill="' + C.steelDark + '" fill-opacity=".35"/><line x1="0" y1="6" x2="6" y2="0" stroke="' + C.steelDark + '" stroke-width="1"/></pattern>'
    + '<linearGradient id="ch-melt" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="' + C.meltTop + '"/><stop offset="1" stop-color="' + C.melt + '"/></linearGradient>'
    + '<marker id="ch-maD" orient="auto" markerWidth="9" markerHeight="8" refX="8" refY="4"><path d="M0,0.6 L8,4 L0,7.4 z" fill="' + C.text + '"/></marker>'
    + '<marker id="ch-maG" orient="auto" markerWidth="9" markerHeight="8" refX="8" refY="4"><path d="M0,0.6 L8,4 L0,7.4 z" fill="' + C.primary + '"/></marker>'
    + '<marker id="ch-maM" orient="auto" markerWidth="9" markerHeight="8" refX="8" refY="4"><path d="M0,0.6 L8,4 L0,7.4 z" fill="' + C.muted + '"/></marker>'
    + '</defs>';

  /* Werkzeug: feste Hälfte (vom Kammerrohr durchdrungen) + Auswerferseite */
  s += '<rect x="' + XF0 + '" y="70" width="' + (part - XF0) + '" height="300" fill="url(#ch-die)" stroke="' + C.steelDark + '" stroke-width="1.2"/>';
  s += '<rect x="' + part + '" y="70" width="' + (DIE1 - part) + '" height="300" fill="url(#ch-die)" stroke="' + C.steelDark + '" stroke-width="1.2"/>';
  s += lbl((XF0 + part) / 2, 388, 'feste Seite', { fill: C.muted, anchor: 'middle', size: 10.5 });
  s += lbl((part + DIE1) / 2, 388, 'Auswerferseite', { fill: C.muted, anchor: 'middle', size: 10.5 });
  s += lbl(part - 10, 62, 'Trennebene', { fill: C.muted, anchor: 'end', size: 10.5 });

  /* Variante C: Bohrung läuft durchs Werkzeug bis zum aktiven Ende weiter */
  if (va === 'C') {
    s += '<rect x="' + tubeEnd + '" y="' + YT + '" width="' + (XA - tubeEnd) + '" height="' + (YB - YT) + '" fill="' + C.surface + '"/>';
    s += '<line x1="' + XA + '" y1="' + YT + '" x2="' + XA + '" y2="' + YB + '" stroke="' + C.steelDark + '" stroke-width="2"/>';
    s += '<line x1="' + (tubeEnd + 24) + '" y1="' + YT + '" x2="' + XA + '" y2="' + YT + '" stroke="' + C.steelDark + '" stroke-width="1.2"/>';
    s += '<line x1="' + tubeEnd + '" y1="' + YB + '" x2="' + XA + '" y2="' + YB + '" stroke="' + C.steelDark + '" stroke-width="1.2"/>';
  }

  /* Bohrung + Kammerwände (mit Lücke für die Einfüllöffnung) */
  s += '<rect x="' + X0 + '" y="' + YT + '" width="' + (tubeEnd - X0) + '" height="' + (YB - YT) + '" fill="' + C.surface + '"/>';
  s += '<rect x="' + X0 + '" y="' + (YT - WT) + '" width="' + (PH0 - X0) + '" height="' + WT + '" fill="url(#ch-steel)" stroke="' + C.steelDark + '" stroke-width="1"/>';
  s += '<rect x="' + PH1 + '" y="' + (YT - WT) + '" width="' + (tubeEnd - PH1) + '" height="' + WT + '" fill="url(#ch-steel)" stroke="' + C.steelDark + '" stroke-width="1"/>';
  s += '<rect x="' + X0 + '" y="' + YB + '" width="' + (tubeEnd - X0) + '" height="' + WT + '" fill="url(#ch-steel)" stroke="' + C.steelDark + '" stroke-width="1"/>';

  /* Schmelze: glatte Oberfläche, ab Kolbenstirn bis zum aktiven Ende */
  if (meltH > 0.5) {
    s += '<rect x="' + XP + '" y="' + mTop + '" width="' + (XA - XP) + '" height="' + meltH + '" fill="url(#ch-melt)"/>';
    s += '<line x1="' + XP + '" y1="' + mTop + '" x2="' + XA + '" y2="' + mTop + '" stroke="' + C.runner + '" stroke-width="1.5"/>';
    s += lbl((XP + XA) / 2 + 15, Math.min(mTop + meltH / 2 + 4, YB - 8), 'Dosiergewicht ' + fmt(mdos) + ' kg',
      { fill: C.text, anchor: 'middle', size: 12, bold: true });
  }

  /* Einguss-Strahl durch die Öffnung */
  s += '<rect x="' + ((PH0 + PH1) / 2 - 5) + '" y="58" width="10" height="' + (Math.max(mTop, YT + 4) - 58) + '" rx="4" fill="' + C.melt + '" opacity=".75"/>';

  /* Kolben (Startposition: in der Kammer, vor der Einfüllöffnung): die
     Stange heller als der Kopf, die Stirn als kräftige Kante */
  s += '<rect x="40" y="188" width="112" height="44" rx="3" fill="' + C.piston + '" fill-opacity=".4" stroke="' + C.piston + '" stroke-width="1"/>';
  s += '<rect x="150" y="' + YT + '" width="' + (XP - 150) + '" height="' + (YB - YT) + '" fill="' + C.piston + '" fill-opacity=".8" stroke="' + C.piston + '" stroke-width="1.3"/>';
  s += '<line x1="' + XP + '" y1="' + YT + '" x2="' + XP + '" y2="' + YB + '" stroke="' + C.text + '" stroke-width="2.5"/>';

  /* Kolbenstirn bei „Kammer voll“ + Hub dorthin */
  s += '<line x1="' + ghost + '" y1="' + YT + '" x2="' + ghost + '" y2="' + YB + '" stroke="' + C.muted + '" stroke-width="1.6" stroke-dasharray="6 5"/>';
  s += dimH(XP, ghost, 158, 'Hub bis „Kammer voll“ = ' + fmt(sF) + ' mm', C.text, 'ch-maD');

  /* Einfüllöffnung verschlossen: Hub ab Kolbenstirn, bis die Öffnung dicht ist */
  s += ext(XP, 126, 58, C.muted) + ext(PH1, 108, 86, C.muted);
  s += '<line x1="' + XP + '" y1="92" x2="' + PH1 + '" y2="92" stroke="' + C.text + '" stroke-width="1" marker-start="url(#ch-maD)" marker-end="url(#ch-maD)"/>';
  s += lbl(PH0 - 8, 86, 'Einfüllöffnung verschlossen = ' + fmt(seal) + ' mm', { fill: C.text, anchor: 'end' });


  /* Kolben-Ø D am offenen Kammerende */
  s += '<line x1="88" y1="' + YT + '" x2="' + X0 + '" y2="' + YT + '" stroke="' + C.muted + '" stroke-width=".7"/>';
  s += '<line x1="88" y1="' + YB + '" x2="' + X0 + '" y2="' + YB + '" stroke="' + C.muted + '" stroke-width=".7"/>';
  s += '<line x1="94" y1="' + YT + '" x2="94" y2="' + YB + '" stroke="' + C.text + '" stroke-width="1" marker-start="url(#ch-maD)" marker-end="url(#ch-maD)"/>';
  s += lbl(82, 210, 'Kolben-Ø D = ' + fmt(v.diam) + ' mm', { fill: C.text, anchor: 'middle', transform: 'rotate(-90 82 210)' });

  /* Füllgrad φ: Beschriftung am Schmelzespiegel, kein Maß */
  s += lbl(650, mTop - 9, 'Füllgrad φ = ' + fmt(phiRaw * 100) + ' %', { fill: C.text, anchor: 'end' });

  /* aktive Länge L (betont, ab Kolbenstirn) */
  s += ext(XP, YB + WT + 2, 356, C.muted) + ext(XA, (va === 'C' ? YB : YB + WT) + 2, 356, C.muted);
  s += dimH(XP, XA, 348, 'aktive Länge L = ' + fmt(v.length) + ' mm', C.primary, 'ch-maG', { width: 1.6, size: 12, bold: true });
  s += lbl(XP, 368, 'ab Kolbenstirn', { fill: C.primary, size: 10.5, bold: true });

  /* Kammerrohr gesamt (gedämpft) — nur der Hinweis, kein Maß */
  s += ext(X0, YB + WT + 2, 416, C.muted) + ext(tubeEnd, YB + WT + 2, 416, C.muted);
  s += dimH(X0, tubeEnd, 408, 'Kammerrohr ≠ L', C.muted, 'ch-maM');

  /* Anguss: Öffnung nach oben in der Auswerferseite, direkt an der Trennebene */
  const runner = (x0, yBot, leftWallBot) =>
    '<rect x="' + x0 + '" y="70" width="24" height="' + (yBot - 70) + '" fill="' + C.surface + '"/>'
    + '<line x1="' + x0 + '" y1="70" x2="' + x0 + '" y2="' + leftWallBot + '" stroke="' + C.steelDark + '" stroke-width="1.2"/>'
    + '<line x1="' + (x0 + 24) + '" y1="70" x2="' + (x0 + 24) + '" y2="' + yBot + '" stroke="' + C.steelDark + '" stroke-width="1.2"/>';

  if (va === 'A') {
    s += '<line x1="' + XA + '" y1="180" x2="' + XA + '" y2="' + YB + '" stroke="' + C.steelDark + '" stroke-width="2"/>';
    s += runner(part, 180, YT) + '<line x1="' + part + '" y1="180" x2="' + (part + 24) + '" y2="180" stroke="' + C.steelDark + '" stroke-width="1.2"/>';
  } else if (va === 'B') {
    /* Verdränger: massiv von unten bis 80 % von D, Öffnung oben zum Werkzeug */
    const dTop = YB - 0.8 * (YB - YT);
    s += '<rect x="' + XA + '" y="' + dTop + '" width="' + (tubeEnd - XA) + '" height="' + (YB - dTop) + '" fill="url(#ch-displ)" stroke="' + C.steelDark + '" stroke-width="1.3"/>';
    s += runner(part, dTop, YT) + '<line x1="' + part + '" y1="' + dTop + '" x2="' + (part + 24) + '" y2="' + dTop + '" stroke="' + C.steelDark + '" stroke-width="1.2"/>';
    s += lbl((XA + tubeEnd) / 2, 100, 'Verdränger', { fill: C.text, anchor: 'middle', size: 11.5, bold: true });
    s += '<line x1="' + ((XA + tubeEnd) / 2) + '" y1="104" x2="' + ((XA + tubeEnd) / 2) + '" y2="' + (dTop + 8) + '" stroke="' + C.muted + '" stroke-width=".8"/>';
  } else {
    s += runner(part, YT, YT);
  }

  /* Trennebene zuletzt: in C sichtbar über der Schmelze */
  s += '<line x1="' + part + '" y1="70" x2="' + part + '" y2="370" stroke="' + C.steelDark + '" stroke-width="1" stroke-dasharray="7 5" opacity=".85"/>';

  /* ── Frontansicht: Kreis mit Ø D und Füllhöhe h, gleiche Größe wie die
     Bohrung der Seitenansicht (Ø = YB − YT), links daneben ── */
  const FCX = -84, FCY = (YT + YB) / 2, FR = (YB - YT) / 2;   // Luft zwischen Ring und Kolbenstange
  const hPx = hFrac * 2 * FR, yLevel = FCY + FR - hPx;
  const hMM = hFrac * v.diam;
  s += '<circle cx="' + FCX + '" cy="' + FCY + '" r="' + (FR + WT) + '" fill="url(#ch-steel)" stroke="' + C.steelDark + '" stroke-width="1"/>';
  s += '<circle cx="' + FCX + '" cy="' + FCY + '" r="' + FR + '" fill="' + C.surface + '" stroke="' + C.steelDark + '" stroke-width="1.2"/>';
  if (hPx > 0.5 && hPx < 2 * FR - 0.5) {
    const halfChord = Math.sqrt(Math.max(FR * FR - (yLevel - FCY) * (yLevel - FCY), 0));
    s += '<path d="M ' + (FCX - halfChord) + ' ' + yLevel + ' A ' + FR + ' ' + FR + ' 0 ' + (hPx > FR ? 1 : 0) + ' 0 ' + (FCX + halfChord) + ' ' + yLevel + ' Z" fill="url(#ch-melt)"/>';
    s += '<line x1="' + (FCX - halfChord) + '" y1="' + yLevel + '" x2="' + (FCX + halfChord) + '" y2="' + yLevel + '" stroke="' + C.runner + '" stroke-width="1.5"/>';
  } else if (hPx >= 2 * FR - 0.5) {
    s += '<circle cx="' + FCX + '" cy="' + FCY + '" r="' + FR + '" fill="url(#ch-melt)"/>';
  }
  /* Bohrungswand liegt vor der Schmelze — Kontur nachziehen */
  s += '<circle cx="' + FCX + '" cy="' + FCY + '" r="' + FR + '" fill="none" stroke="' + C.steelDark + '" stroke-width="1.2"/>';
  /* Ø D quer durch den Kreis */
  s += '<line x1="' + (FCX - FR) + '" y1="' + FCY + '" x2="' + (FCX + FR) + '" y2="' + FCY + '" stroke="' + C.text + '" stroke-width="1" marker-start="url(#ch-maD)" marker-end="url(#ch-maD)" stroke-dasharray="3 3"/>';
  s += lbl(FCX, FCY - 8, 'D = ' + fmt(v.diam) + ' mm', { fill: C.text, anchor: 'middle', size: 11, bold: true });
  /* Füllhöhe h links neben dem Kreis, Beschriftung gedreht (wie Kolben-Ø) */
  const hx = FCX - FR - WT - 14;
  s += '<line x1="' + hx + '" y1="' + (FCY + FR) + '" x2="' + hx + '" y2="' + yLevel + '" stroke="' + C.primary + '" stroke-width="1.2" marker-start="url(#ch-maG)" marker-end="url(#ch-maG)"/>';
  s += '<line x1="' + (FCX - Math.sqrt(Math.max(FR * FR - (yLevel - FCY) * (yLevel - FCY), 0))) + '" y1="' + yLevel + '" x2="' + (hx - 4) + '" y2="' + yLevel + '" stroke="' + C.muted + '" stroke-width=".7"/>';
  s += '<line x1="' + FCX + '" y1="' + (FCY + FR) + '" x2="' + (hx - 4) + '" y2="' + (FCY + FR) + '" stroke="' + C.muted + '" stroke-width=".7"/>';
  s += lbl(hx - 6, (FCY + FR + yLevel) / 2, 'h = ' + fmt(hMM) + ' mm', { fill: C.primary, size: 11, bold: true, anchor: 'middle', transform: 'rotate(-90 ' + (hx - 6) + ' ' + ((FCY + FR + yLevel) / 2) + ')' });
  s += lbl(FCX, YB + WT + 24, 'Frontansicht', { fill: C.muted, anchor: 'middle', size: 10.5 });

  return s + '</svg>';
}

/* PNG-Export: SVG serialisieren, in 2× auf Canvas rastern und über
   denselben Weg wie die Diagramme kopieren (ui/export.js copyPngBlob). */
function copyPng(card) {
  const svg = card.querySelector('.chamber-draw svg');
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const S = 2, W = VW, H = 440;
    const o = document.createElement('canvas');
    o.width = W * S; o.height = H * S;
    const x = o.getContext('2d');
    x.fillStyle = themeColors().surface;
    x.fillRect(0, 0, o.width, o.height);
    x.drawImage(img, 0, 0, o.width, o.height);
    o.toBlob(blob => copyPngBlob(blob, card.querySelector('.png-btn'), 'DieLogic_Fuellkammer.png'), 'image/png');
  };
  img.src = url;
}

export function buildChamberCard(container) {
  const card = document.createElement('article');
  card.className = 'card chamber-card';
  card.innerHTML =
    '<div class="head"><div><h3>Füllkammer und Massenbilanz</h3><small>Seitenansicht · aktive Länge L, Kolben-Ø D, Füllgrad φ, Hub bis „Kammer voll“ · Kolbenweg-Lineal und Prüfungen darunter</small></div>'
    + '<div class="head-right"><span class="kverdict" id="chamber-verdict"></span><span class="tabbar-label">Darstellung:</span><div class="tabs">'
    + '<button data-v="A" class="active">Bündig</button>'
    + '<button data-v="B">Verdränger</button>'
    + '<button data-v="C">Verlängert</button>'
    + '</div><button class="png-btn" title="Als PNG kopieren" aria-label="Als PNG kopieren">' + COPY_SVG + '</button></div></div>'
    + '<div class="body chamber-svg"><div class="chamber-inner"><div class="chamber-draw"></div><div id="chamber-ruler"></div></div></div>'
    + '<div id="chamber-kpis"></div>';

  card.querySelectorAll('.tabs button').forEach(b => {
    b.onclick = () => {
      variant = b.dataset.v;
      card.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
      if (card._v) renderChamber(card, card._v);
    };
  });
  card.querySelector('.png-btn').onclick = () => copyPng(card);

  container.appendChild(card);
  return card;
}

export function renderChamber(card, v) {
  card._v = v;
  card.querySelector('.chamber-draw').innerHTML = buildSvg(v);
}
