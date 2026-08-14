/* Definition aller Eingabefelder (Gruppen, Labels, Einheiten, Defaults).
   Die 'key'-Namen sind die kanonischen Feldnamen — Charts referenzieren sie
   in ihrer inputs-Liste, Maschinen-Presets (config/machines.json) setzen sie. */

/* Preset-Domänen: jede hat ein Select in der Sidebar, einen Zustands-Schlüssel
   (state[stateKey]) und eine Feldgruppe (groups[].preset === id), die bei
   gewähltem Preset ausgeblendet ist. Die Listen kommen aus config/<config>
   (klassisches Script, setzt window[global]). */
export const PRESET_DOMAINS = [
  { id: 'machine', title: 'Maschinen-Preset', stateKey: 'machine', selId: 'machineSel',
    groupElId: 'preset-group', global: '__MACHINES__', listKey: 'machines', config: 'config/machines.js' },
  { id: 'alloy', title: 'Legierungs-Preset', stateKey: 'alloy', selId: 'alloySel',
    groupElId: 'alloy-preset-group', global: '__ALLOYS__', listKey: 'alloys', config: 'config/alloys.js' },
  { id: 'part', title: 'Bauteiltyp-Preset', stateKey: 'part', selId: 'partSel',
    groupElId: 'part-preset-group', global: '__PARTS__', listKey: 'parts', config: 'config/parts.js' }
];

export const groups = [
  {
    id: 'machineFields', title: 'Maschinenwerte', preset: 'machine',
    note: 'Diese Felder setzt das Maschinen-Preset. Bei gewähltem Preset sind sie ausgeblendet — „manuell" wählen, um sie frei einzugeben.',
    fields: [
      { key: 'force',    label: 'Maschinenkraft',          unit: 'kN',   def: 13500 },
      { key: 'injForce', label: 'Gießkraft (Schuss)',      unit: 'kN',   def: 2000 },
      { key: 'vmax',     label: 'Kolbengeschw. max.',      unit: 'm/s',  def: 7 },
      { key: 'amax',     label: 'Beschleunigung max.',     unit: 'm/s²', def: 60 },
      { key: 'dmin',     label: 'Kolben-Ø min.',           unit: 'mm',   def: 120 },
      { key: 'dmax',     label: 'Kolben-Ø max.',           unit: 'mm',   def: 200 },
      { key: 'lmin',     label: 'Kammerlänge min.',        unit: 'mm',   def: 500 },
      { key: 'lmax',     label: 'Kammerlänge max.',        unit: 'mm',   def: 900 },
      { key: 'tieX',     label: 'Säulenabstand horizontal', unit: 'mm',  def: 1100 },
      { key: 'tieY',     label: 'Säulenabstand vertikal',   unit: 'mm',  def: 1100 }
    ]
  },
  {
    id: 'machine', title: 'Druck und Sprengfläche',
    fields: [
      { key: 'area',   label: 'Sprengfläche',      unit: 'm²',  def: 0.15 },
      { key: 'pmin',   label: 'Druck min.',        unit: 'bar', def: 100 },
      { key: 'pmax',   label: 'Druck max.',        unit: 'bar', def: 1200 },
      { key: 'psel',   label: 'Auslegungsdruck',   unit: 'bar', def: 600 },
      { key: 'safety', label: 'Sicherheitsfaktor', unit: '-',   def: 1.3 },
      /* adv: standardmäßig hinter „Erweiterte Optionen" eingeklappt. */
      { key: 'eccX', label: 'Außermittigkeit Schwerpunkt x', unit: 'mm', def: 0, adv: true },
      { key: 'eccY', label: 'Außermittigkeit Schwerpunkt y', unit: 'mm', def: 0, adv: true }
    ]
  },
  {
    id: 'mass', title: 'Massenbilanz',
    fields: [
      { key: 'part',     label: 'Bauteilgewicht',   unit: 'kg', def: 12 },
      { key: 'runner',   label: 'Angussgewicht',    unit: 'kg', def: 3 },
      { key: 'overflow', label: 'Überlaufgewicht',  unit: 'kg', def: 2 },
      { key: 'biscuit',  label: 'Pressrestgewicht', unit: 'kg', def: 1.2 }
    ]
  },
  {
    id: 'alloyFields', title: 'Legierungswerte', preset: 'alloy',
    note: 'Diese Felder setzt das Legierungs-Preset (config/alloys.js). Bei gewähltem Preset sind sie ausgeblendet — „manuell" wählen, um sie frei einzugeben.',
    fields: [
      { key: 'density', label: 'Dichte flüssig',    unit: 'kg/m³',  def: 2400 },
      { key: 'Tcast',   label: 'Gießtemperatur',    unit: '°C',     def: 660 },
      { key: 'Tflow',   label: 'Min. Fließtemp.',   unit: '°C',     def: 580 },
      { key: 'Zconst',  label: 'Z-Konstante',       unit: '°C/%',   def: 4.8 },
      { key: 'solK',    label: 'Erstarrungskonstante', unit: 'ms/mm²', def: 10 }
    ]
  },
  {
    id: 'chamber', title: 'Füllkammer und Kolben',
    fields: [
      { key: 'diam',   label: 'Gewählter Kolben-Ø',    unit: 'mm', def: 150 },
      { key: 'length', label: 'Gewählte Kammerlänge',  unit: 'mm', def: 700 },
      { key: 'sealStroke', label: 'Einfüllöffnung verschlossen', unit: 'mm', def: 150 }
    ]
  },
  {
    id: 'gating', title: 'Anschnitt und Entlüftung',
    fields: [
      { key: 'gate', label: 'Anschnittfläche',   unit: 'mm²', def: 1800 },
      { key: 'vent', label: 'Entlüftungsfläche', unit: 'mm²', def: 800 }
    ]
  },
  {
    id: 'vacuum', title: 'Vakuum (Simulation)',
    note: 'Wirkt auf die simulierte Luftdruck-Kurve in der Schusskurve (Backend). „Ventil + Entlüftung" rechnet zusätzlich mit der Entlüftungsfläche und dem Eingussquerschnitt.',
    fields: [
      { key: 'vacModel', label: 'Vakuum-Modell', unit: '', def: 'aus', type: 'select',
        options: [['aus', 'ohne Vakuum'], ['ideal', 'Idealpumpe (Enddruck)'], ['conductance', 'Ventil + Entlüftung (Drossel)']] },
      { key: 'vacPump',  label: 'Pumpen-Enddruck',    unit: 'mbar', def: 80 },
      { key: 'vacValve', label: 'Ventilquerschnitt',  unit: 'mm²',  def: 100 },
      { key: 'vacStart', label: 'Vakuum ab Kolbenweg', unit: 'mm',  def: 150 }
    ]
  },
  {
    id: 'process', title: 'Prozessfenster', wide: true,
    /* v1 (max. bis „Kammer voll") und v2 (Mittel nach Anschnitt) sind
       keine Eingaben mehr — computeShot leitet sie aus der Schusskurve ab. */
    fields: [
      { key: 'tmax',    label: 'Füllzeit max.',             unit: 'ms',  def: 100 },
      { key: 'fillMin', label: 'Füllgrad Ziel min.',        unit: '%',   def: 40 },
      { key: 'fillMax', label: 'Füllgrad Ziel max.',        unit: '%',   def: 60 },
      { key: 'gateMin', label: 'Anschnittgeschw. Ziel min.', unit: 'm/s', def: 30 },
      { key: 'gateMax', label: 'Anschnittgeschw. Ziel max.', unit: 'm/s', def: 50 }
    ]
  },
  {
    id: 'partFields', title: 'Bauteilgeometrie und Thermik', preset: 'part', wide: true,
    note: 'Diese Felder setzt das Bauteiltyp-Preset (config/parts.js). Bei gewähltem Preset sind sie ausgeblendet — „manuell" wählen, um sie frei einzugeben.',
    fields: [
      { key: 'wall',    label: 'Wandstärke',      unit: 'mm',    def: 3.5 },
      { key: 'wallMin', label: 'Wandstärke min.', unit: 'mm',    def: 1.5 },
      { key: 'wallMax', label: 'Wandstärke max.', unit: 'mm',    def: 8 },
      { key: 'Tdie',    label: 'Formtemperatur',  unit: '°C',    def: 200 },
      { key: 'Sfrac',   label: 'Zul. Erstarrung', unit: '%',     def: 20 },
      { key: 'kfill',   label: 'NADCA-Faktor k',  unit: 'ms/mm', def: 35 }
    ]
  },
  {
    id: 'hydraulics', title: 'Hydraulik und Ausbringung', wide: true,
    fields: [
      { key: 'Cd',         label: 'Durchflussbeiwert',        unit: '-',   def: 0.5 },
      { key: 'pAcc',       label: 'Akkumulatordruck',         unit: 'bar', def: 160 },
      { key: 'pSpecMin',   label: 'Ziel-Gießdruck min.',      unit: 'bar', def: 800 },
      { key: 'pSpecMax',   label: 'Ziel-Gießdruck max.',      unit: 'bar', def: 1200 },
      { key: 'vAirMax',    label: 'Max. Entlüftungsgeschw.',  unit: 'm/s', def: 150 },
      { key: 'biscuitMin', label: 'Pressrest min.',           unit: 'mm',  def: 25 },
      { key: 'gateTh',     label: 'Anschnittdicke',           unit: 'mm',  def: 3 },
      { key: 'Jatom',      label: 'Zerstäubungsfaktor J',     unit: '-',   def: 750 },
      { key: 'intTime',    label: 'Nachdruckzeit',            unit: 'ms',  def: 60 }
    ]
  }
];

/* Felder, die von einem Preset gesetzt werden: key → Domänen-id. Handänderung
   eines dieser Felder setzt die jeweilige Preset-Auswahl auf „manuell" zurück.
   Abgeleitet aus den Feldgruppen mit preset-Domäne. */
export const PRESET_KEYS = {};
for (const g of groups) {
  if (g.preset) for (const f of g.fields) PRESET_KEYS[f.key] = g.preset;
}

/* Standard-Schusskurve: Wegpunkte [s in mm, v in m/s]. */
export const DEFAULT_CURVE = [[60, 0.4], [318, 0.4], [470, 4], [675, 4]];

export function allFields() {
  const a = [];
  for (const g of groups) {
    if (g.columns) g.columns.forEach(c => a.push(...c.fields));
    else a.push(...g.fields);
  }
  return a;
}
