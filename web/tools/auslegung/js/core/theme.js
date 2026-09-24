/* Die Diagrammfarben der Auslegung: dieselben Objekte wie window.__THEME__
   aus /shared/theme.js (klassisches Script, lädt vor den Modulen).

   Hier wird nichts kopiert. shared/theme.js leitet die Rollen der Diagramme
   aus der Palette ab (derive()), und bei jedem Wechsel des Farbschemas füllt
   derive() theme.chart, theme.limits, theme.map und theme.mapLines an Ort
   und Stelle neu. Wer eine Referenz auf diese Objekte hält, sieht darum
   immer das aktuelle Schema. theme.heatStops ist die feste Farbleiste der
   Heatmaps, in jedem Schema dieselbe.
   Die Renderer lesen die Werte zur Zeichenzeit; die Diagrammdaten tragen
   nur Rollennamen (s.c = 'ink', 'die' …), aufgelöst von farbe() beim
   Zeichnen. So zeichnet ein Schemawechsel dieselben Daten neu, ohne sie
   neu zu rechnen, und der PNG-Export sieht das Schema, das gerade gilt. */

const G = typeof window !== 'undefined' ? window : globalThis;

/* Ist shared/theme.js schon geladen (Seite, Tests, Theorie-Generator), ist
   `theme` genau dieses Objekt. Sonst füllt loadTheme() es nach, und zwar
   mit Verweisen auf die lebenden Unterobjekte, nicht mit ihren Werten. */
export const theme = G.__THEME__ || {};

export async function loadTheme() {
  const data = G.__THEME__;
  if (!data) throw new Error('/shared/theme.js nicht geladen (window.__THEME__ fehlt).');
  if (data !== theme) Object.assign(theme, data);
  return theme;
}

/* Farbe zur Zeichenzeit: eine Rolle der Diagramme ('ink', 'machine',
   'feasible' …) wird aus theme.chart gelesen; alles andere gilt schon als
   Farbwert (der Theorie-Generator reicht Werte durch). */
export function farbe(c) {
  const C = theme.chart;
  return (c && C && typeof C[c] === 'string') ? C[c] : c;
}
