/* Liest das Farbschema aus config/theme.js (setzt window.__THEME__ per
   klassischem <script>-Tag — funktioniert über http UND file://) und wendet
   den UI-Teil als CSS-Variablen an. Die Canvas-Renderer lesen theme.chart /
   theme.map / theme.heatStops zur Zeichenzeit. */

export const theme = {};

export async function loadTheme() {
  const data = window.__THEME__;
  if (!data) throw new Error('config/theme.js nicht geladen (window.__THEME__ fehlt).');
  Object.assign(theme, data);
  applyCssVars();
  return theme;
}

function applyCssVars() {
  const u = theme.ui || {};
  const root = document.documentElement.style;
  /* Schlüssel wie in config/palette.js → CSS-Variable (camelCase → kebab) */
  const map = {};
  for (const k in u) map['--' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = u[k];
  for (const k in map) if (map[k]) root.setProperty(k, map[k]);
}
