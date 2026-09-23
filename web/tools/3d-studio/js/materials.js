/* Werkstoffklassen des Formaufbau-Viewers.

   Der NAME eines Materials ist das Vertragsstück zwischen Modell und
   Viewer: er überlebt den GLB-Roundtrip und steuert dort die Deckkraft
   Stahl ('steel') und den Versatz der Schnitt-Deckflächen: der Inhalt
   liegt vor dem Stahl (js/clipcaps.js). Die Farbe einer Deckfläche ist
   die ihres Teils, eine Deckfläche je Teil und Klasse. Hier steht die
   Tabelle einmal — für den Zusammenbau aus Stücken
   (scripts/3d-studio/build-die-stl.mjs) und
   für Teile, die der Anwender im Viewer lädt (js/assembly.js). */

import * as T from 'three';
import { roleColor } from './registry.js';

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

/* Die Farbe, die ein Teil einer Klasse bekommt, solange niemand eine andere
   wählt: eine Rolle (js/registry.js, roleColor) — so folgt sie dem
   Farbschema. Stahl in einer mittleren Stufe, das Gegossene in den
   Sachfarben der Schmelze, die Temperierung fest dunkel und beweglich hell,
   der Kolben Kolben, die Stifte die Kante des Stahls. */
export const CLASS_ROLE = {
  steel: 'steel:0.56', castPart: 'melt', castRunner: 'runner', castOverflow: 'overflow',
  coolFix: 'cool', coolMov: 'cool:0.45', plunger: 'piston', pins: 'steelDark'
};
/** Kolben und Stifte haben die Farbe ihrer Klasse, gleich was das Teil trägt. */
export const FIXED_COLOR = new Set(['plunger', 'pins']);
/** Der Wert der Klassenrolle im Schema von jetzt. */
export const classColor = name => roleColor(CLASS_ROLE[name] || CLASS_ROLE.steel);

/* Fast ohne Metallanteil: ohne Umgebungskarte hat ein metallisches
   Material nichts zu spiegeln — es wird nur dunkel, wo kein Licht
   hinfällt. Kolben und Stifte tragen die Farbe ihrer Klasse, alles andere
   die Farbe seiner Baugruppe. */
export function materialSpec(name, color) {
  return {
    steel:    { color, roughness: 0.55, metalness: 0.35 },
    plunger:  { color: classColor('plunger'), roughness: 0.5, metalness: 0.5 },
    pins:     { color: classColor('pins'), roughness: 0.5, metalness: 0.5 },
    coolFix:  { color, roughness: 0.35, metalness: 0.3 },
    coolMov:  { color, roughness: 0.35, metalness: 0.3 }
  }[name] || { color, roughness: 0.55, metalness: 0.25 };
}

/** Materialinstanz einer Klasse; color als Zahl (0xrrggbb) oder '#rrggbb'. */
export function makeMaterial(name, color) {
  const m = new T.MeshStandardMaterial(materialSpec(name, color));
  m.name = name;
  return m;
}
