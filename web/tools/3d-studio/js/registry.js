/* Baugruppen-Registry: reine Metadaten, keine Three.js-Abhängigkeit.
   Gemeinsame Quelle für den Viewer (Sidebar, GLB-Zuordnung) und den
   Geometrie-Generator (js/components.js, tools/export.html).

   side: 'fix' bleibt stehen, 'mov' und 'cast' fahren beim „Form öffnen"
   mit (das Gussteil bleibt beim Öffnen auf der beweglichen Hälfte).

   sub: optionale Untergruppe innerhalb einer Seite. Die Temperierung
   steht so je Hälfte eingerückt unter einer eigenen Überschrift mit
   eigenem Schalter — ein Kreis lässt sich damit allein betrachten.

   role: die Farbe als ROLLE des Farbschemas (js/part/colors.js), kein
   Wert. `color` nennt den Wert des Schemas von jetzt. So hat die
   Beispielform die Sachfarben jedes Werkzeugs: das Gussteil ist Schmelze,
   Anguss und Pressrest der Anguss, die Überläufe Überlauf, die Kreise
   Temperierung (die feste Hälfte dunkel, die bewegliche hell), die
   Stahlteile Stahl, jedes in einer eigenen Stufe, damit Nachbarn sich
   trennen. Eine Rolle schreibt sich
     'melt'          die Sachfarbe selbst,
     'steel:0.45'    Stahl, Stufe 0,45 zwischen Fläche und Kante,
     'cool:0.22'     Temperierung, um 0,22 zur Fläche hin aufgehellt. */

import { ROLE, mixHex, steelShade } from './part/colors.js';

/* Welche Rollen ein Teil tragen darf: die Sachfarben, keine Ampel und keine
   Bedienung — ein Teil der Form ist kein Urteil. */
const PART_ROLES = new Set(['melt', 'runner', 'overflow', 'biscuit', 'die', 'air', 'vacuum', 'cool', 'steel', 'steelDark', 'piston', 'part']);

/** Der Wert einer Rolle im Schema von jetzt — null, wenn es keine ist (eine
    Datei kann alles hineinschreiben). */
export function roleColor(role) {
  const m = /^([a-zA-Z]+)(?::(0(?:\.\d+)?|1(?:\.0+)?))?$/.exec(typeof role === 'string' ? role : '');
  if (!m || !PART_ROLES.has(m[1])) return null;
  if (m[2] === undefined) return ROLE[m[1]];
  const t = Number(m[2]);
  return m[1] === 'steel' ? steelShade(t) : mixHex(m[1], 'surface', t);
}

const comp = (id, label, side, role, sub) => ({ id, label, side, ...(sub ? { sub } : {}), role, get color() { return roleColor(this.role); } });

export const GROUPS = [
  { key: 'fix',  title: 'Feste Seite' },
  { key: 'mov',  title: 'Bewegliche Seite' },
  { key: 'cast', title: 'Gussteil' }
];

export const COMPONENTS = [
  comp('fixHalf',      'Feste Formhälfte',          'fix', 'steel:0.45'),
  comp('fixInsert',    'Formeinsatz fest',          'fix', 'steel:0.84'),
  comp('sleeve',       'Füllkammer + Gießkolben',   'fix', 'steel:0.62'),
  comp('guidePillars', 'Führungssäulen',            'fix', 'steel:0.56'),
  comp('ventBlockFix', 'Entlüftung (feste Hälfte)', 'fix', 'steel:0.74'),
  comp('coolFixL',     'Kreis links',   'fix', 'cool', 'Temperierung'),
  comp('coolFixR',     'Kreis rechts',  'fix', 'cool:0.22', 'Temperierung'),

  comp('movHalf',      'Bewegliche Formhälfte',     'mov', 'steel:0.35'),
  comp('movInsert',    'Formeinsatz beweglich',     'mov', 'steel:0.68'),
  comp('ejBox',        'Auswerferkasten + Aufspannplatte', 'mov', 'steel:0.5'),
  comp('ejector',      'Auswerferpaket (Platten + Stifte)', 'mov', 'steel:1'),
  comp('guideBushings', 'Führungsbuchsen',          'mov', 'steel:0.9'),
  comp('ventBlockMov', 'Entlüftung (bewegl. Hälfte)', 'mov', 'steel:0.78'),
  comp('coolMovL',     'Kreis links',   'mov', 'cool:0.45', 'Temperierung'),
  comp('coolMovR',     'Kreis rechts',  'mov', 'cool:0.6', 'Temperierung'),

  comp('castPart',     'Bauteil',                   'cast', 'melt'),
  comp('castRunner',   'Anguss + Pressrest',        'cast', 'runner'),
  comp('castOverflow', 'Überläufe + Entlüftungskanal', 'cast', 'overflow')
];

export const BY_ID = Object.fromEntries(COMPONENTS.map(c => [c.id, c]));
