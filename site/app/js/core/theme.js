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
  const map = {
    '--deep': u.deep, '--green': u.green, '--pale': u.pale, '--bg': u.bg,
    '--line': u.line, '--muted': u.muted, '--blue': u.blue, '--surface': u.surface,
    '--header-from': u.headerFrom, '--header-to': u.headerTo,
    '--ok': u.ok, '--ok-border': u.okBorder,
    '--warn-text': u.warnText, '--warn-border': u.warnBorder, '--bad': u.bad
  };
  for (const k in map) if (map[k]) root.setProperty(k, map[k]);
}
