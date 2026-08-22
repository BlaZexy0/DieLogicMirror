/* Liest das Diagramm-Farbschema aus /shared/theme.js (window.__THEME__,
   klassisches Script). Die Canvas-Renderer lesen theme.chart / theme.map /
   theme.heatStops zur Zeichenzeit; UI-Farben kommen aus /shared/palette.js. */

export const theme = {};

export async function loadTheme() {
  const data = window.__THEME__;
  if (!data) throw new Error('/shared/theme.js nicht geladen (window.__THEME__ fehlt).');
  Object.assign(theme, data);
  return theme;
}
