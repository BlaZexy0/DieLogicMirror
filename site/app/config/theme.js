/* Farbschema des Dashboards — hier direkt editieren, kein Build nötig.
   'ui' wird als CSS-Variablen auf die Seite angewendet, 'chart' wird von den
   Canvas-Renderern gelesen, 'limits' färbt die Grenzen/Restriktionen der
   Diagramme (Schlüssel = limit-id, Fallback chart.limit),
   'map'/'mapLines' färben das (φ, λ)-Auslegungsfenster, 'heatStops' ist
   die Farbrampe der Heatmaps (RGB-Stützstellen von niedrig nach hoch).
   Hinweis: bei eigenen Farben auf ausreichenden Kontrast und
   unterscheidbare Helligkeit der Serienfarben achten (Farbfehlsichtigkeit). */

window.__THEME__ = {
  "name": "DieLogic Teal (Standard)",
  "ui": {
    "deep": "#002733",
    "green": "#008c82",
    "pale": "#e5f3f2",
    "bg": "#f3f6f6",
    "line": "#ccd4d6",
    "muted": "#4c6870",
    "blue": "#8cbee6",
    "surface": "#ffffff",
    "headerFrom": "#002733",
    "headerTo": "#00534d",
    "ok": "#0d7a3c",
    "okBorder": "#12a150",
    "warnText": "#a67600",
    "warnBorder": "#e0a400",
    "bad": "#b42318"
  },
  "chart": {
    "surface": "#ffffff",
    "text": "#002733",
    "grid": "#e5e9eb",
    "axis": "#ccd4d6",
    "series1": "#002733",
    "series2": "#008c82",
    "series3": "#8cbee6",
    "series4": "#e0a400",
    "marker": "#b42318",
    "limit": "#8c5a00",
    "crit": "#c2447e",
    "event": "#9aacb2",
    "areaFill": "rgba(0,39,51,.07)",
    "band": "rgba(0,140,130,.13)",
    "bandLine": "rgba(0,140,130,.65)",
    "iso": "#4c6870",
    "isoLine": "rgba(76,104,112,.6)",
    "maskFill": "rgba(226,231,233,.93)",
    "okFill": "rgba(0,140,130,.30)"
  },
  "limits": {
    "gateMin": "#7b5cd6",
    "gateMax": "#c2447e",
    "atom": "#4b2ea3",
    "tmax": "#b28000",
    "vent": "#4c6870",
    "vAirMax": "#4c6870",
    "hydr": "#a34d1c",
    "vmax": "#8c5a00",
    "vcrit": "#c2447e",
    "mpe": "#000000",
    "fill100": "#5f8391",
    "force": "#8c5a00",
    "intTime": "#8c5a00",
    "ventAvail": "#8c5a00"
  },
  "map": {
    "ok": "rgba(0,140,130,.30)",
    "bore": "rgba(18,58,107,.34)",
    "len": "rgba(154,119,232,.34)",
    "bisc": "rgba(224,164,0,.36)",
    "crit": "rgba(194,68,126,.34)"
  },
  "mapLines": {
    "bore": "#123a6b",
    "len": "#7b5cd6",
    "bisc": "#b28000",
    "crit": "#c2447e"
  },
  "heatStops": [
    [48, 18, 59],
    [55, 117, 197],
    [29, 172, 213],
    [103, 235, 115],
    [245, 194, 37],
    [250, 126, 29],
    [122, 4, 3]
  ]
};
