/* Die Farben des 3D-Studios: ROLLEN der Palette (/shared/palette.js),
   keine Farbwerte. Jedes Werkzeug fragt hier nach dem, was es malt (die
   Schmelze, der Anguss, eine Achse, „gut" oder „schlecht"), und bekommt
   die Farbe des gewählten Schemas. So hat dieselbe Sache in jedem
   Werkzeug, im Diagramm und in den Bildern der Theorie dieselbe Farbe,
   und ein Schemawechsel erreicht auch das 3D-Bild.

   Drei Arten von Farben, nie vermischt:
     · Sachfarben: ein Ding (Schmelze, Anguss, Pressrest, Überlauf,
       Werkzeug und Anschnitt, Luft, Vakuum, Temperierung, Stahl, Kolben,
       das Bauteil, die Achsen). Abstufungen einer Sache entstehen durch
       Mischen mit der Fläche (heller) oder der Schrift (dunkler), nie durch
       einen fremden Farbton.
     · Farbleisten: die Skalen, an denen man einen Messwert abliest
       (Wandstärke, Abstand, Füllgrad, Haftung, Geschwindigkeit, Ankunft,
       Entformschräge). Sie sind FEST, in jedem Schema dieselben, und
       stehen in palette.js (LEISTEN): `turbo` für die Felder, `draft` für
       die Entformschräge, `speed` für das Flussschema.
     · Die Ampel: nur, wo geurteilt wird (Hinterschnitt, zu nah,
       Durchbruch, verletzt). Nichts anderes nimmt ihre Farben.

   Gelesen wird beim Malen, nicht beim Laden: die Getter unten geben den
   Wert des Schemas von JETZT. Wer malt, malt bei einem Wechsel neu
   (onScheme, das Ereignis „dielogic:scheme" aus shared/schemes.js).
   Ohne Palette (die Tests unter Node) gelten die Standardwerte der Rollen
   und die Stützstellen der Leisten, die hier als Rückfall stehen, und ein
   einfacher Ersatz mischt linear zwischen den Rollen; der Test
   tests/web/farbrollen.test.mjs prüft, dass jeder Rückfall der Palette
   gleicht. */

const P = () => (typeof globalThis !== 'undefined' && globalThis.__PALETTE__) || null;
/** Eine Rolle der Palette; `fallback` ist ihr Standardwert (ohne Palette). */
export const pal = (name, fallback) => { const p = P(); return (p && p[name]) || fallback; };
/** fn bei jedem Wechsel des Farbschemas rufen. */
export function onScheme(fn) {
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('dielogic:scheme', fn);
}

/* ── Die Rollen, die das Studio malt ─────────────────────────── */
export const ROLE = Object.freeze({
  /* Schrift, Flächen, Bedienung */
  get text() { return pal('text', '#002733'); },
  get muted() { return pal('muted', '#4c6870'); },
  get mutedLight() { return pal('mutedLight', '#9aacb4'); },
  get surface() { return pal('surface', '#ffffff'); },
  get border() { return pal('border', '#ccd4d6'); },
  get borderLight() { return pal('borderLight', '#e5e9eb'); },
  get viewport() { return pal('viewport', '#e8eef0'); },
  get primary() { return pal('primary', '#008c82'); },
  get primaryLight() { return pal('primaryLight', '#3fc2b6'); },
  /* Ampel und Hervorhebung */
  get ok() { return pal('ok', '#159a4c'); },
  get caution() { return pal('caution', '#e0a400'); },
  get bad() { return pal('bad', '#b42318'); },
  get mark() { return pal('mark', '#b23797'); },
  get markWarm() { return pal('markWarm', '#f66e5c'); },
  get markCool() { return pal('markCool', '#19bdfc'); },
  get halfMov() { return pal('halfMov', '#e66685'); },
  get halfFix() { return pal('halfFix', '#fbde4e'); },
  /* Sachfarben */
  get machine() { return pal('machine', '#ac6eef'); },
  get melt() { return pal('melt', '#008c82'); },
  get runner() { return pal('runner', '#006665'); },
  get overflow() { return pal('overflow', '#8bbfb8'); },
  get biscuit() { return pal('biscuit', '#82979f'); },
  get die() { return pal('die', '#2e65a0'); },
  get air() { return pal('air', '#68a7cc'); },
  get vacuum() { return pal('vacuum', '#296485'); },
  get cool() { return pal('cool', '#1e3a71'); },
  get steel() { return pal('steel', '#dae1e2'); },
  get steelDark() { return pal('steelDark', '#7b9096'); },
  get piston() { return pal('piston', '#36545d'); },
  get part() { return pal('part', '#bec9cc'); },
  get axisX() { return pal('axisX', '#ac6eef'); },
  get axisY() { return pal('axisY', '#68a7cc'); },
  get axisZ() { return pal('axisZ', '#2e65a0'); }
});

/* ── Rechnen mit Farben ──────────────────────────────────────── */
export const hex2rgb = h => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255
];
const hexOf = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
/* Ein Schlüssel der Palette (oder dieser Liste) oder schon ein Hexwert. */
const wert = x => (x.charAt(0) === '#' ? x : ROLE[x]);

/** Zwei Farben mischen, t = 0 … 1; a, b: Rolle oder Hexwert → Hex. Die
    Palette mischt im OK-Lab-Raum, der Rückfall linear. */
export function mixHex(a, b, t) {
  const p = P();
  if (p && p.mix) return p.mix(a, b, t);
  const A = hex2rgb(wert(a)), B = hex2rgb(wert(b)), s = Math.max(0, Math.min(1, t));
  return hexOf([A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s]);
}

/* ── Farbleisten ─────────────────────────────────────────────── */
/* Fest und in jedem Schema gleich (palette.js, LEISTEN). Stützstellen
   [t, Farbe], zwei an derselben Stelle sind eine Stufe; gemischt wird
   linear in sRGB, wie palette.js es tut. */
function turboPoly(t) {
  const x = Math.max(0, Math.min(1, t));
  const x2 = x * x, x3 = x2 * x, x4 = x3 * x, x5 = x4 * x;
  const c = v => Math.max(0, Math.min(1, v));
  return [
    c(0.13572138 + 4.61539260 * x - 42.66032258 * x2 + 132.13108234 * x3 - 152.94239396 * x4 + 59.28637943 * x5),
    c(0.09140261 + 2.19418839 * x + 4.84296658 * x2 - 14.18503333 * x3 + 4.27729857 * x4 + 2.82956604 * x5),
    c(0.10667330 + 12.64194608 * x - 60.58204836 * x2 + 110.36276771 * x3 - 89.90310912 * x4 + 27.34824973 * x5)
  ];
}
const leiste = (name, rueckfall) => { const p = P(); return (p && p.leisten && p.leisten[name]) || rueckfall; };
const LEISTE = {
  get turbo() { return leiste('turbo', turboPoly); },
  get draft() { return leiste('draft', [[0, '#b42318'], [1 / 3, '#d4a908'], [1 / 3, '#7cc4a0'], [1, '#0d7a3c']]); },
  get speed() { return leiste('speed', [[0, '#2e6da4'], [1 / 3, '#3fc2b6'], [2 / 3, '#d4a908'], [1, '#b42318']]); }
};

/** Farbe auf einer Farbleiste ('turbo', 'draft', 'speed') als [r, g, b]
    mit 0 … 1, t = 0 … 1; NaN gibt null. */
export function scaleRgb(name, t) {
  if (!(t === t)) return null;
  const l = LEISTE[name], x = Math.max(0, Math.min(1, t));
  if (typeof l === 'function') return l(x);
  let i = l.length - 2;
  while (i > 0 && x < l[i][0]) i--;        // von oben: an einer Stufe gilt die obere Seite
  const a = hex2rgb(l[i][1]), b = hex2rgb(l[i + 1][1]), w = l[i + 1][0] - l[i][0];
  const u = w > 0 ? Math.min(1, (x - l[i][0]) / w) : 1;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
/** Dasselbe als Hex (Legende, Materialfarbe); NaN gibt null. */
export function scale(name, t) {
  const c = scaleRgb(name, t);
  return c ? hexOf(c) : null;
}

/** Wo ein Messwert (0 … 1) auf der Leiste `turbo` liegt, wenn ihre fast
    schwarzen Enden wegbleiben: das Stück von sattem Blau bis sattem Rot.
    Wandstärke, Abstand und Haftung — am Bauteil, auf der Karte und in der
    Skala — lesen die Leiste so; vorher trug die Haftkarte ein anderes
    Stück (0,05 … 0,95) als das Bauteil daneben unter derselben Skala. */
export const turboTrim = t => 0.08 + 0.84 * Math.max(0, Math.min(1, t));

/* Für viele Werte je Bild (Punktfarben, Texturen): eine Tafel mit n Farben,
   r, g, b je Eintrag 0 … 255. Die Leisten sind fest; gemerkt wird je
   Leiste und Größe. */
const TAFELN = {};
export function lut(name, n = 256) {
  const key = name + '/' + n;
  if (TAFELN[key]) return TAFELN[key];
  const out = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) out.set(scaleRgb(name, n > 1 ? i / (n - 1) : 0).map(v => Math.round(v * 255)), 3 * i);
  return (TAFELN[key] = out);
}
/* three.js rechnet im LINEAREN Raum: eine Materialfarbe aus Hex wandelt es
   selbst, Punktfarben (vertexColors) gehen dagegen ungewandelt in die
   Beleuchtung. Mit den Werten der Palette als Punktfarbe stünde dieselbe
   Rolle auf dem Bauteil heller da als am Körper daneben und in der
   Legende. Punktfarben kommen deshalb linear (linRgb, lutLinear,
   scaleFn); Texturen aus der Tafel tragen stattdessen colorSpace = sRGB. */
const toLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** Hex → [r, g, b] linear, für Punktfarben. */
export const linRgb = hex => hex2rgb(hex).map(toLin);

/* Die Tafel als Float 0 … 1: `lutFloat` wie die Leiste (für eigene
   Shader ohne Farbraumwandlung, die Partikel), `lutLinear` linear (für
   Punktfarben). Gemerkt an der Tafel selbst. */
const FLOAT = new WeakMap(), LINEAR = new WeakMap();
export function lutFloat(name, n = 256) {
  const tab = lut(name, n);
  let f = FLOAT.get(tab);
  if (!f) { f = Float32Array.from(tab, v => v / 255); FLOAT.set(tab, f); }
  return f;
}
export function lutLinear(name, n = 256) {
  const tab = lut(name, n);
  let f = LINEAR.get(tab);
  if (!f) { f = Float32Array.from(tab, v => toLin(v / 255)); LINEAR.set(tab, f); }
  return f;
}
/** Leser für viele Punktfarben: gibt t → [r, g, b] (linear) über die Tafel
    zurück. Einmal je Malen holen, nicht je Wert. */
export function scaleFn(name, n = 256) {
  const f = lutLinear(name, n), k = n - 1;
  return t => {
    const i = 3 * Math.round(Math.max(0, Math.min(1, t)) * k);
    return [f[i], f[i + 1], f[i + 2]];
  };
}

/* ── Achsen und Entformrichtungen ────────────────────────────── */
const ACHSE = ['axisX', 'axisY', 'axisZ'];
/** Achsen X, Y, Z: das Achsenkreuz, die Achsenpfeile der Griffe. */
export const axisColors = () => ACHSE.map(k => ROLE[k]);
/* Die Gegenrichtung ist eine Abstufung derselben Achse: −X und −Y heller,
   −Z dunkler. Die helle Stufe von Z fiele auf Y — beide Achsen sind
   Blautöne (Werkzeug und Luft), in manchen Schemata lagen +Y und ein helles
   −Z nur ΔE 3 auseinander. So trennen sich alle sechs in jedem Schema um
   mindestens ΔE 9 (OK-Lab, tests/web/3d-studio/farben.test.mjs). */
const GEGEN = [['surface', 0.4], ['surface', 0.55], ['text', 0.55]];
/** Die sechs Entformrichtungen (Reihenfolge wie js/part/visibility.js:
    +X, −X, +Y, −Y, +Z, −Z): die Farbe der Achse, die Gegenrichtung eine
    Stufe davon. So stehen die Schieber da; die beiden Hälften tragen ihre
    Rolle (sideColor). */
export function regionColor(label) {
  const a = label >> 1;
  return label % 2 ? mixHex(ACHSE[a], GEGEN[a][0], GEGEN[a][1]) : ROLE[ACHSE[a]];
}
/** Die Farbe eines Formteils in der Entformung: die beiden Hälften nach
    ihrer Rolle (half +1 die bewegliche Seite `halfMov`, −1 die feste
    `halfFix`), die Schieber (half 0) nach ihrer Richtung. Die Rolle kommt
    aus der Zuordnung (halfOf in js/part/segment.js): wer die bewegliche
    Seite tauscht, tauscht die Farben der Hälften. Früher trugen auch die
    Hälften ihre Richtung, +Z und −Z waren zwei Stufen desselben Blaus. */
export const sideColor = (label, half) => (half > 0 ? ROLE.halfMov : half < 0 ? ROLE.halfFix : regionColor(label));

/* ── Stahl ───────────────────────────────────────────────────── */
/** Eine Abstufung des Stahls zwischen der Fläche (t = 0, `steel`) und der
    Kante (t = 1, `steelDark`): die Teile der Form (js/registry.js) und die
    Füllkammer der Kammerfüllung sind Stahl, jedes in seiner Stufe, damit
    Nachbarn sich trennen. */
export const steelShade = t => mixHex('steel', 'steelDark', t);

/* ── Urteile ─────────────────────────────────────────────────── */
/** Hinterschnitt: ein Urteil, „schlecht". Im Bild der Schrägen dunkler,
    damit er sich vom „schlecht" der zu kleinen Schrägen abhebt. */
export const undercutColor = () => ROLE.bad;
export const undercutDark = () => mixHex('bad', 'text', 0.4);

/** Wo ein Entformwinkel (Grad) auf der Leiste `draft` liegt: t = Winkel
    durch den dreifachen Grenzwert. Bis zum Grenzwert (t = 1/3) von Rot
    nach Gold, darüber von hellem zu sattem Grün; Hinterschnitt (unter 0°)
    bleibt Rot. */
export const draftT = (deg, limit) => deg / (3 * Math.max(limit, 0.01));
/** Die Farbe dazu als Hex (Legende, Skala). */
export const draftHex = (deg, limit) => scale('draft', draftT(deg, limit));
/** Dieselbe als Punktfarbe [r, g, b], linear. Ohne Tafel: an der Stufe
    entschiede sonst das Runden der Tafel die Seite. */
export const draftColor = (deg, limit) => scaleRgb('draft', draftT(deg, limit)).map(toLin);

/* ── Elementarten der Designer ───────────────────────────────── */
/* Was ein Designer setzt, muss sich vom Anguss abheben (Rückmeldung vom
   23.09.: in den Tönen der Schmelze verschwanden Bohne, Waschbrett und
   die Knoten im Lauf). Diese Arten tragen darum nicht die Farbe der
   Schmelze, sondern die Hervorhebung und ihre zwei Geschwister markWarm
   (Koralle) und markCool (Himmelblau). Die Punktarten untereinander sollen
   ebenso klar getrennt sein (Rückmeldung vom 24.09.: Punkt, Verzweigung
   und Spiegelpunkt lagen in Magenta, Violett und hellem Magenta zu nah
   beieinander); die drei liegen in jedem Schema paarweise bei ΔE ≥ 20.
     Anguss     Punkt = Hervorhebung, Verzweigung = Koralle, Spiegelpunkt =
                Himmelblau (seine nachgezogene Gegenseite ist blass,
                VIEW.follower). Pressrest = Pressrest, Anschnitt = Werkzeug
                (wie in den Diagrammen).
     Überlauf   Bohne = Hervorhebung, Waschbrett = Koralle. Die Entlüftung
                ist Luft: Bohne mit Entlüftung = Luft, der Schlitz die
                hellere Luft, die Kanalpunkte noch heller, damit sie nicht
                wie ein Schlitz aussehen.
     Temperierung  Kühlstich = Temperierung, Kanal = die hellere.
     Füllung    Anschnitt = Werkzeug.
   tests/web/3d-studio/farben.test.mjs rechnet in jedem Schema nach, dass
   die Knoten, die Bohne und das Waschbrett weit genug vom Anguss und
   voneinander liegen. */
export const ELEMENT = Object.freeze({
  get pressrest() { return ROLE.biscuit; },
  get punkt() { return ROLE.mark; },
  get verzweigung() { return ROLE.markWarm; },
  get spiegelpunkt() { return ROLE.markCool; },
  get anschnitt() { return ROLE.die; },
  get bohne() { return ROLE.mark; },
  get entlueftet() { return ROLE.air; },
  get waschbrett() { return ROLE.markWarm; },
  get schlitz() { return mixHex('air', 'surface', 0.4); },
  get kanalpunkt() { return mixHex('air', 'surface', 0.7); },
  get stich() { return ROLE.cool; },
  get kanal() { return mixHex('cool', 'surface', 0.45); }
});

/* ── Bedienung und Hilfsflächen ──────────────────────────────── */
/* Was keine Sache ist, sondern Bedienung: die Auswahl in der Tinte des
   Schemas, die Arbeitsebene und der angefahrene Pfeil in der Marke, die
   nachgezogene Gegenseite blass. Die Hilfsflächen (Isofläche,
   Abstandsfläche) sind Bauhilfen, kein Körper der Form: eine Rolle, die
   helle Marke, durchscheinend. Wo keine Daten sind, steht das Bauteil in
   seinem Grau. Die zuletzt gefüllten Stellen sind Kennpunkte der Füllung
   (Hervorhebung), kein Urteil. */
export const VIEW = Object.freeze({
  get selected() { return ROLE.text; },
  get plane() { return ROLE.primaryLight; },
  get planeEdge() { return ROLE.primary; },
  get hot() { return ROLE.primary; },
  get follower() { return ROLE.mutedLight; },
  get helper() { return ROLE.primaryLight; },
  get noData() { return ROLE.part; },
  get lastFilled() { return ROLE.mark; },
  get lines() { return ROLE.text; },
  get edges() { return ROLE.muted; }
});
