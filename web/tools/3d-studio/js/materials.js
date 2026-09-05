/* Werkstoffklassen des Formaufbau-Viewers.

   Der NAME eines Materials ist das Vertragsstück zwischen Modell und
   Viewer: er überlebt den GLB-Roundtrip und steuert dort die
   Stahl-Transparenz ('steel') und die Farbe der Schnitt-Deckflächen (eine
   Klasse je Name, js/clipcaps.js). Hier steht die Tabelle einmal — für
   den Zusammenbau aus Stücken (js/components.js) und für Teile, die der
   Anwender im Viewer lädt (js/assembly.js). */

import * as T from 'three';

export const MATERIAL_CLASSES = [
  { key: 'steel',        label: 'Stahl' },
  { key: 'castPart',     label: 'Gussteil' },
  { key: 'castRunner',   label: 'Anguss + Pressrest' },
  { key: 'castOverflow', label: 'Überläufe + Entlüftung' },
  { key: 'coolFix',      label: 'Temperierung fest' },
  { key: 'coolMov',      label: 'Temperierung beweglich' },
  { key: 'plunger',      label: 'Gießkolben' },
  { key: 'pins',         label: 'Stifte' }
];

/* Fast ohne Metallanteil: ohne Umgebungskarte hat ein metallisches
   Material nichts zu spiegeln — es wird nur dunkel, wo kein Licht
   hinfällt. Kolben und Stifte haben feste Farben, alles andere trägt die
   Farbe seiner Baugruppe. */
export function materialSpec(name, color) {
  return {
    steel:    { color, roughness: 0.55, metalness: 0.35 },
    plunger:  { color: 0xb8722d, roughness: 0.5, metalness: 0.5 },
    pins:     { color: 0x4a565c, roughness: 0.5, metalness: 0.5 },
    coolFix:  { color, roughness: 0.35, metalness: 0.3 },
    coolMov:  { color, roughness: 0.35, metalness: 0.3 }
  }[name] || { color, roughness: 0.55, metalness: 0.25 };
}

/** Materialinstanz einer Klasse; color als Zahl (0xrrggbb) oder '#rrggbb'. */
export function makeMaterial(name, color) {
  const c = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
  const m = new T.MeshStandardMaterial(materialSpec(name, c));
  m.name = name;
  return m;
}
