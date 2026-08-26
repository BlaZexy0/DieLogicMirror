/* Baugruppen-Registry: reine Metadaten, keine Three.js-Abhängigkeit.
   Gemeinsame Quelle für den Viewer (Sidebar, GLB-Zuordnung) und den
   Geometrie-Generator (js/components.js, tools/export.html).

   side: 'fix' bleibt stehen, 'mov' und 'cast' fahren beim „Form öffnen"
   mit (das Gussteil bleibt beim Öffnen auf der beweglichen Hälfte).

   sub: optionale Untergruppe innerhalb einer Seite. Die Temperierung
   steht so je Hälfte eingerückt unter einer eigenen Überschrift mit
   eigenem Schalter — ein Kreis lässt sich damit allein betrachten. */

export const GROUPS = [
  { key: 'fix',  title: 'Feste Seite' },
  { key: 'mov',  title: 'Bewegliche Seite' },
  { key: 'cast', title: 'Gussteil' }
];

export const COMPONENTS = [
  { id: 'fixHalf',      label: 'Feste Formhälfte',          side: 'fix',  color: '#9aa7ad' },
  { id: 'fixInsert',    label: 'Formeinsatz fest',          side: 'fix',  color: '#7d8a91' },
  { id: 'sleeve',       label: 'Füllkammer + Gießkolben',   side: 'fix',  color: '#8b979e' },
  { id: 'guidePillars', label: 'Führungssäulen',            side: 'fix',  color: '#8d9aa1' },
  { id: 'ventBlockFix', label: 'Vakuumblock (feste Hälfte)', side: 'fix', color: '#7f8c93' },
  { id: 'coolFixL',     label: 'Kreis links',   side: 'fix', sub: 'Temperierung', color: '#c0392b' },
  { id: 'coolFixR',     label: 'Kreis rechts',  side: 'fix', sub: 'Temperierung', color: '#e07055' },

  { id: 'movHalf',      label: 'Bewegliche Formhälfte',     side: 'mov',  color: '#a7b3b9' },
  { id: 'movInsert',    label: 'Formeinsatz beweglich',     side: 'mov',  color: '#86939a' },
  { id: 'ejBox',        label: 'Auswerferkasten + Aufspannplatte', side: 'mov', color: '#94a1a8' },
  { id: 'ejector',      label: 'Auswerferpaket (Platten + Stifte)', side: 'mov', color: '#6f7c83' },
  { id: 'guideBushings', label: 'Führungsbuchsen',          side: 'mov',  color: '#77848b' },
  { id: 'ventBlockMov', label: 'Vakuumblock (bewegl. Hälfte)', side: 'mov', color: '#7f8c93' },
  { id: 'coolMovL',     label: 'Kreis links',   side: 'mov', sub: 'Temperierung', color: '#2e6da4' },
  { id: 'coolMovR',     label: 'Kreis rechts',  side: 'mov', sub: 'Temperierung', color: '#5a95c9' },

  { id: 'castPart',     label: 'Bauteil',                   side: 'cast', color: '#d4a908' },
  { id: 'castRunner',   label: 'Anguss + Pressrest',        side: 'cast', color: '#dfbc3f' },
  { id: 'castOverflow', label: 'Überläufe + Entlüftungskanal', side: 'cast', color: '#ecd27f' }
];

export const BY_ID = Object.fromEntries(COMPONENTS.map(c => [c.id, c]));
