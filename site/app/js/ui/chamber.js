/* Füllkammer-Schema oberhalb der KPI-Kacheln: Seitenansicht (Schnitt) mit
   aktiver Länge L, Kolben-Ø D, Füllgrad φ, Hub bis „Kammer voll“ und der
   Einfüllöffnung. Drei Ausführungen des Kammerendes wählbar: bündig an der
   Trennebene, mit Verdränger, oder verlängert in die Auswerferseite.
   Reines SVG; Werte kommen aus denselben Formeln wie die KPIs. Alle Stile
   sind inline, damit der PNG-Export ohne Seiten-CSS funktioniert. */

import { fmt } from '../core/format.js';
import { total, pistonArea } from '../core/physics.js';

const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

/* ── Zeichnungs-Konstanten (px im viewBox 1030×440) ── */
const XP = 225;                 // Kolbenstirn (Startposition)
const X0 = 110;                 // Kammerrohr links
const XA = 800;                 // aktives Ende (fest — die Zahlen sind live)
const YT = 130, YB = 290;       // Bohrung oben/unten
const WT = 20;                  // Wandstärke

/* Kammerende-Varianten: gleiche aktive Länge, anderes Rohrende. */
const VARIANTS = {
  A: { tubeEnd: XA },           // Rohr endet an der Trennebene
  B: { tubeEnd: XA + 66 },      // Rohr länger, Verdränger füllt das Ende
  C: { tubeEnd: XA - 82 }       // Rohr kürzer, Schmelze läuft ins Werkzeug
};
let variant = 'A';

function themeColors() {
  const P = window.__PALETTE__;
  return {
    deep: P.dark,
    green: P.primary,
    muted: P.muted,
    surface: P.surface
  };
}

/* Text mit weißem Halo (Bemaßungen und Beschriftungen), Stile inline. */
function label(x, y, t, o) {
  o = o || {};
  return '<text x="' + x + '" y="' + y + '" font-family="Arial, sans-serif"'
    + ' font-size="' + (o.size || 11) + '"' + (o.bold ? ' font-weight="bold"' : '')
    + ' fill="' + o.fill + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '')
    + (o.transform ? ' transform="' + o.transform + '"' : '')
    + ' paint-order="stroke" stroke="' + (o.halo || '#fff') + '" stroke-width="3" stroke-linejoin="round">'
    + t + '</text>';
}

function dimH(x1, x2, y, text, col, marker, o) {
  return '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + col
    + '" stroke-width="' + ((o && o.width) || 1) + '" marker-start="url(#' + marker + ')" marker-end="url(#' + marker + ')"/>'
    + label((x1 + x2) / 2, y - 6, text, { fill: col, anchor: 'middle', size: (o && o.size) || 11, bold: o && o.bold });
}

function ext(x, y1, y2, col) {
  return '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke="' + col + '" stroke-width=".7"/>';
}

/* variantKey nur für Tests — im Betrieb kommt die Variante aus den Tabs. */
export function buildSvg(v, variantKey) {
  const va = variantKey || variant;
  const C = themeColors();
  const A = pistonArea(v);
  const mdos = total(v) + v.biscuit;
  const phiRaw = 1e9 * (mdos / v.density) / (v.length * A);
  const phi = isFinite(phiRaw) ? Math.min(Math.max(phiRaw, 0), 1) : 0;
  const sF = (1 - phi) * v.length;

  const tubeEnd = VARIANTS[va].tubeEnd;
  const part = tubeEnd;                          // Trennebene: das Rohr endet immer dort
  const XF0 = part - 110, DIE1 = part + 150;     // feste Hälfte (vom Rohr durchdrungen), Auswerferseite
  const ghost = Math.min(Math.max(XP + (1 - phi) * (XA - XP), XP + 2), XA - 2);
  const meltH = phi * (YB - YT), mTop = YB - meltH;

  /* px pro mm entlang der Kammer; Einfüllöffnung endet beim Verschluss-Hub.
     Nicht-finite Eingaben (leeres Feld, veralteter Zustand) fallen auf die
     Defaults zurück, damit die Wände nie mit NaN-Koordinaten verschwinden. */
  const pxmm = (isFinite(v.length) && v.length > 0) ? (XA - XP) / v.length : 575 / 700;
  const seal = isFinite(v.sealStroke) ? v.sealStroke : 150;
  const vac = isFinite(v.vacStart) ? v.vacStart : 150;
  const PH1 = Math.min(Math.max(XP + seal * pxmm, XP + 80), tubeEnd - 50);
  const PH0 = PH1 - 80;
  const vacX = Math.min(Math.max(XP + vac * pxmm, XP + 10), tubeEnd - 4);

  let s = '<svg viewBox="0 0 1030 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Füllkammer Seitenansicht">';
  s += '<defs>'
    + '<pattern id="ch-steel" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">'
    + '<rect width="7" height="7" fill="#dde6e8"/><line x1="0" y1="0" x2="0" y2="7" stroke="#8aa0a8" stroke-width="1.1"/></pattern>'
    + '<pattern id="ch-die" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(-45)">'
    + '<rect width="9" height="9" fill="#e8eef0"/><line x1="0" y1="0" x2="0" y2="9" stroke="#9fb3ba" stroke-width="1"/></pattern>'
    + '<pattern id="ch-displ" patternUnits="userSpaceOnUse" width="6" height="6">'
    + '<rect width="6" height="6" fill="#cfd9dc"/><line x1="0" y1="6" x2="6" y2="0" stroke="#6d858e" stroke-width="1"/></pattern>'
    + '<linearGradient id="ch-melt" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#f6b34f"/><stop offset="1" stop-color="#e8912a"/></linearGradient>'
    + '<marker id="ch-maD" orient="auto" markerWidth="9" markerHeight="8" refX="8" refY="4"><path d="M0,0.6 L8,4 L0,7.4 z" fill="' + C.deep + '"/></marker>'
    + '<marker id="ch-maG" orient="auto" markerWidth="9" markerHeight="8" refX="8" refY="4"><path d="M0,0.6 L8,4 L0,7.4 z" fill="' + C.green + '"/></marker>'
    + '<marker id="ch-maM" orient="auto" markerWidth="9" markerHeight="8" refX="8" refY="4"><path d="M0,0.6 L8,4 L0,7.4 z" fill="' + C.muted + '"/></marker>'
    + '</defs>';

  /* Werkzeug: feste Hälfte (vom Kammerrohr durchdrungen) + Auswerferseite */
  s += '<rect x="' + XF0 + '" y="70" width="' + (part - XF0) + '" height="300" fill="url(#ch-die)" stroke="#7d949c" stroke-width="1.2"/>';
  s += '<rect x="' + part + '" y="70" width="' + (DIE1 - part) + '" height="300" fill="url(#ch-die)" stroke="#7d949c" stroke-width="1.2"/>';
  s += label((XF0 + part) / 2, 388, 'feste Seite', { fill: C.muted, anchor: 'middle', size: 10.5 });
  s += label((part + DIE1) / 2, 388, 'Auswerferseite', { fill: C.muted, anchor: 'middle', size: 10.5 });
  s += label(part - 10, 62, 'Trennebene', { fill: C.muted, anchor: 'end', size: 10.5 });

  /* Variante C: Bohrung läuft durchs Werkzeug bis zum aktiven Ende weiter */
  if (va === 'C') {
    s += '<rect x="' + tubeEnd + '" y="' + YT + '" width="' + (XA - tubeEnd) + '" height="' + (YB - YT) + '" fill="' + C.surface + '"/>';
    s += '<line x1="' + XA + '" y1="' + YT + '" x2="' + XA + '" y2="' + YB + '" stroke="#7d949c" stroke-width="2"/>';
    s += '<line x1="' + (tubeEnd + 24) + '" y1="' + YT + '" x2="' + XA + '" y2="' + YT + '" stroke="#7d949c" stroke-width="1.2"/>';
    s += '<line x1="' + tubeEnd + '" y1="' + YB + '" x2="' + XA + '" y2="' + YB + '" stroke="#7d949c" stroke-width="1.2"/>';
  }

  /* Bohrung + Kammerwände (mit Lücke für die Einfüllöffnung) */
  s += '<rect x="' + X0 + '" y="' + YT + '" width="' + (tubeEnd - X0) + '" height="' + (YB - YT) + '" fill="' + C.surface + '"/>';
  s += '<rect x="' + X0 + '" y="' + (YT - WT) + '" width="' + (PH0 - X0) + '" height="' + WT + '" fill="url(#ch-steel)" stroke="#5d747c" stroke-width="1"/>';
  s += '<rect x="' + PH1 + '" y="' + (YT - WT) + '" width="' + (tubeEnd - PH1) + '" height="' + WT + '" fill="url(#ch-steel)" stroke="#5d747c" stroke-width="1"/>';
  s += '<rect x="' + X0 + '" y="' + YB + '" width="' + (tubeEnd - X0) + '" height="' + WT + '" fill="url(#ch-steel)" stroke="#5d747c" stroke-width="1"/>';

  /* Schmelze: glatte Oberfläche, ab Kolbenstirn bis zum aktiven Ende */
  if (meltH > 0.5) {
    s += '<rect x="' + XP + '" y="' + mTop + '" width="' + (XA - XP) + '" height="' + meltH + '" fill="url(#ch-melt)"/>';
    s += '<line x1="' + XP + '" y1="' + mTop + '" x2="' + XA + '" y2="' + mTop + '" stroke="#c97b16" stroke-width="1.5"/>';
    s += label((XP + XA) / 2 + 15, Math.min(mTop + meltH / 2 + 4, YB - 8), 'Dosiergewicht ' + fmt(mdos) + ' kg',
      { fill: '#7a480e', anchor: 'middle', size: 12, bold: true, halo: '#ffe3bd' });
  }

  /* Einguss-Strahl durch die Öffnung */
  s += '<rect x="' + ((PH0 + PH1) / 2 - 5) + '" y="58" width="10" height="' + (Math.max(mTop, YT + 4) - 58) + '" rx="4" fill="#f2a844" opacity=".75"/>';

  /* Kolben (Startposition: in der Kammer, vor der Einfüllöffnung) */
  s += '<rect x="40" y="188" width="112" height="44" rx="3" fill="#b9c7cc" stroke="#5d747c" stroke-width="1"/>';
  s += '<rect x="150" y="' + YT + '" width="' + (XP - 150) + '" height="' + (YB - YT) + '" fill="#9fb3ba" stroke="#41565e" stroke-width="1.3"/>';
  s += '<line x1="' + XP + '" y1="' + YT + '" x2="' + XP + '" y2="' + YB + '" stroke="#25353b" stroke-width="2.5"/>';

  /* Kolbenstirn bei „Kammer voll“ + Hub dorthin */
  s += '<line x1="' + ghost + '" y1="' + YT + '" x2="' + ghost + '" y2="' + YB + '" stroke="' + C.muted + '" stroke-width="1.6" stroke-dasharray="6 5"/>';
  s += dimH(XP, ghost, 158, 'Hub bis „Kammer voll“ = ' + fmt(sF) + ' mm', C.deep, 'ch-maD');

  /* Einfüllöffnung verschlossen: Hub ab Kolbenstirn, bis die Öffnung dicht ist */
  s += ext(XP, 126, 58, C.muted) + ext(PH1, 108, 86, C.muted);
  s += '<line x1="' + XP + '" y1="92" x2="' + PH1 + '" y2="92" stroke="' + C.deep + '" stroke-width="1" marker-start="url(#ch-maD)" marker-end="url(#ch-maD)"/>';
  s += label(PH0 - 8, 86, 'Einfüllöffnung verschlossen = ' + fmt(seal) + ' mm', { fill: C.deep, anchor: 'end' });

  /* Darüber: Vakuum ab Kolbenweg (Eingabe aus der Vakuum-Gruppe) */
  s += ext(vacX, 108, 64, C.muted);
  s += '<line x1="' + XP + '" y1="70" x2="' + vacX + '" y2="70" stroke="' + C.deep + '" stroke-width="1" marker-start="url(#ch-maD)" marker-end="url(#ch-maD)"/>';
  s += label(vacX + 8, 74, 'Vakuum ab Kolbenweg = ' + fmt(vac) + ' mm', { fill: C.deep });

  /* Kolben-Ø D am offenen Kammerende */
  s += '<line x1="88" y1="' + YT + '" x2="' + X0 + '" y2="' + YT + '" stroke="' + C.muted + '" stroke-width=".7"/>';
  s += '<line x1="88" y1="' + YB + '" x2="' + X0 + '" y2="' + YB + '" stroke="' + C.muted + '" stroke-width=".7"/>';
  s += '<line x1="94" y1="' + YT + '" x2="94" y2="' + YB + '" stroke="' + C.deep + '" stroke-width="1" marker-start="url(#ch-maD)" marker-end="url(#ch-maD)"/>';
  s += label(82, 210, 'Kolben-Ø D = ' + fmt(v.diam) + ' mm', { fill: C.deep, anchor: 'middle', transform: 'rotate(-90 82 210)' });

  /* Füllgrad φ: Beschriftung am Schmelzespiegel, kein Maß */
  s += label(650, mTop - 9, 'Füllgrad φ = ' + fmt(phiRaw * 100) + ' %', { fill: C.deep, anchor: 'end' });

  /* aktive Länge L (grün, ab Kolbenstirn) */
  s += ext(XP, YB + WT + 2, 356, C.muted) + ext(XA, (va === 'C' ? YB : YB + WT) + 2, 356, C.muted);
  s += dimH(XP, XA, 348, 'aktive Länge L = ' + fmt(v.length) + ' mm', C.green, 'ch-maG', { width: 1.6, size: 12, bold: true });
  s += label(XP, 368, 'ab Kolbenstirn', { fill: C.green, size: 10.5, bold: true });

  /* Kammerrohr gesamt (grau) — nur der Hinweis, kein Maß */
  s += ext(X0, YB + WT + 2, 416, C.muted) + ext(tubeEnd, YB + WT + 2, 416, C.muted);
  s += dimH(X0, tubeEnd, 408, 'Kammerrohr ≠ L', C.muted, 'ch-maM');

  /* Anguss: Öffnung nach oben in der Auswerferseite, direkt an der Trennebene */
  const runner = (x0, yBot, leftWallBot) =>
    '<rect x="' + x0 + '" y="70" width="24" height="' + (yBot - 70) + '" fill="' + C.surface + '"/>'
    + '<line x1="' + x0 + '" y1="70" x2="' + x0 + '" y2="' + leftWallBot + '" stroke="#7d949c" stroke-width="1.2"/>'
    + '<line x1="' + (x0 + 24) + '" y1="70" x2="' + (x0 + 24) + '" y2="' + yBot + '" stroke="#7d949c" stroke-width="1.2"/>';

  if (va === 'A') {
    s += '<line x1="' + XA + '" y1="180" x2="' + XA + '" y2="' + YB + '" stroke="#7d949c" stroke-width="2"/>';
    s += runner(part, 180, YT) + '<line x1="' + part + '" y1="180" x2="' + (part + 24) + '" y2="180" stroke="#7d949c" stroke-width="1.2"/>';
  } else if (va === 'B') {
    /* Verdränger: massiv von unten bis 80 % von D, Öffnung oben zum Werkzeug */
    const dTop = YB - 0.8 * (YB - YT);
    s += '<rect x="' + XA + '" y="' + dTop + '" width="' + (tubeEnd - XA) + '" height="' + (YB - dTop) + '" fill="url(#ch-displ)" stroke="#41565e" stroke-width="1.3"/>';
    s += runner(part, dTop, YT) + '<line x1="' + part + '" y1="' + dTop + '" x2="' + (part + 24) + '" y2="' + dTop + '" stroke="#7d949c" stroke-width="1.2"/>';
    s += label((XA + tubeEnd) / 2, 100, 'Verdränger', { fill: C.deep, anchor: 'middle', size: 11.5, bold: true });
    s += '<line x1="' + ((XA + tubeEnd) / 2) + '" y1="104" x2="' + ((XA + tubeEnd) / 2) + '" y2="' + (dTop + 8) + '" stroke="' + C.muted + '" stroke-width=".8"/>';
  } else {
    s += runner(part, YT, YT);
  }

  /* Trennebene zuletzt: in C sichtbar über der Schmelze */
  s += '<line x1="' + part + '" y1="70" x2="' + part + '" y2="370" stroke="#7d949c" stroke-width="1" stroke-dasharray="7 5" opacity=".85"/>';

  return s + '</svg>';
}

/* PNG-Export: SVG serialisieren, in 2× auf Canvas rastern, in die
   Zwischenablage kopieren (Fallback: Download) — wie bei den Diagrammen. */
function copyPng(card) {
  const svg = card.querySelector('svg');
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const S = 2, W = 1030, H = 440;
    const o = document.createElement('canvas');
    o.width = W * S; o.height = H * S;
    const x = o.getContext('2d');
    x.fillStyle = themeColors().surface;
    x.fillRect(0, 0, o.width, o.height);
    x.drawImage(img, 0, 0, o.width, o.height);
    o.toBlob(blob => {
      const b = card.querySelector('.png-btn'), old = b.innerHTML;
      const ok = () => { b.classList.add('copied'); b.innerHTML = CHECK_SVG; };
      const fallback = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'DieLogic_Fuellkammer.png';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(a.href);
      };
      if (navigator.clipboard && window.ClipboardItem)
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(ok, () => { fallback(); ok(); });
      else { fallback(); ok(); }
      setTimeout(() => { b.classList.remove('copied'); b.innerHTML = old; }, 1400);
    }, 'image/png');
  };
  img.src = url;
}

export function buildChamberCard(container) {
  const card = document.createElement('article');
  card.className = 'card chamber-card';
  card.innerHTML =
    '<div class="head"><div><h3>Füllkammer</h3><small>Seitenansicht · aktive Länge L, Kolben-Ø D, Füllgrad φ, Hub bis „Kammer voll“</small></div>'
    + '<div class="head-right"><span class="tabbar-label">Darstellung:</span><div class="tabs">'
    + '<button data-v="A" class="active">Bündig</button>'
    + '<button data-v="B">Verdränger</button>'
    + '<button data-v="C">Verlängert</button>'
    + '</div><button class="png-btn" title="Als PNG kopieren" aria-label="Als PNG kopieren">' + COPY_SVG + '</button></div></div>'
    + '<div class="body chamber-svg"></div>';

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
  card.querySelector('.chamber-svg').innerHTML = buildSvg(v);
}
