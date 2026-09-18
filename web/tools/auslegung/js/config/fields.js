/* Definition aller Eingabefelder (Gruppen, Labels, Einheiten, Defaults).
   Die 'key'-Namen sind die kanonischen Feldnamen — Charts referenzieren sie
   in ihrer inputs-Liste, Maschinen-Presets (config/machines.json) setzen sie. */

/* Preset-Domänen: jede hat ein Select in der Sidebar, einen Zustands-Schlüssel
   (state[stateKey]) und eine Feldgruppe (groups[].preset === id), die bei
   gewähltem Preset ausgeblendet ist. Die Listen kommen aus config/<config>
   (klassisches Script, setzt window[global]). 'def' ist das beim ersten
   Besuch (und nach Reset) vorausgewählte Preset — die Feldgruppen sind
   dadurch standardmäßig eingeklappt, „manuell" zeigt sie wieder. */
export const PRESET_DOMAINS = [
  { id: 'machine', title: 'Maschinen-Preset', stateKey: 'machine', selId: 'machineSel', def: 'hcc1600',
    groupElId: 'preset-group', global: '__MACHINES__', listKey: 'machines', config: '/shared/examples/machines.js' },
  { id: 'alloy', title: 'Legierungs-Preset', stateKey: 'alloy', selId: 'alloySel', def: 'alsi9cu3',
    groupElId: 'alloy-preset-group', global: '__ALLOYS__', listKey: 'alloys', config: '/shared/examples/alloys.js' },
  { id: 'part', title: 'Bauteiltyp-Preset', stateKey: 'part', selId: 'partSel', def: 'gehaeuse',
    groupElId: 'part-preset-group', global: '__PARTS__', listKey: 'parts', config: '/shared/examples/parts.js' }
];

/* Vakuum-Modelle, die überhaupt Vakuum ziehen bzw. die Entlüftung als
   Drossel rechnen — Bedingungen (when) der Vakuum-Felder. */
const VAC_ON = ['ideal', 'conductance', 'tank'];
const VAC_DROSSEL = ['conductance', 'tank'];

export const groups = [
  {
    id: 'machineFields', title: 'Maschinenwerte', preset: 'machine',
    note: 'Diese Felder setzt das Maschinen-Preset. Bei gewähltem Preset sind sie ausgeblendet; „manuell" wählen, um sie frei einzugeben.',
    fields: [
      { key: 'force',    label: 'Maschinenkraft',          unit: 'kN',   def: 16000 , gt: 0, max: 100000, bound: 'plaus' },
      /* Maschinenkonstante ist der Antriebskolben: Gießkraft bei max.
         Akkumulatordruck und dieser Druck legen A_h = F/P fest; die Gießkraft
         im Betrieb folgt aus dem eingestellten Druck (physics.injForceEff). */
      { key: 'injForce', label: 'Gießkraft bei Akkudruck max.', unit: 'kN', def: 1300 , gt: 0, max: 20000, bound: 'plaus' },
      { key: 'vmax',     label: 'Kolbengeschw. max.',      unit: 'm/s',  def: 8.5 , gt: 0, max: 40, bound: 'plaus' },
      { key: 'amax',     label: 'Beschleunigung max.',     unit: 'm/s²', def: 110 , min: 0, max: 5000, bound: 'plaus' },
      { key: 'dmin',     label: 'Kolben-Ø min.',           unit: 'mm',   def: 90 , gt: 0, max: 500, bound: 'plaus' },
      { key: 'dmax',     label: 'Kolben-Ø max.',           unit: 'mm',   def: 150 , gt: 0, max: 500, bound: 'plaus' },
      { key: 'lmin',     label: 'Kammerlänge min.',        unit: 'mm',   def: 450 , gt: 0, max: 3000, bound: 'plaus' },
      { key: 'lmax',     label: 'Kammerlänge max.',        unit: 'mm',   def: 900 , gt: 0, max: 3000, bound: 'plaus' },
      { key: 'tieX',     label: 'Säulenabstand horizontal', unit: 'mm',  def: 1200 , gt: 0, max: 6000, bound: 'plaus' },
      { key: 'tieY',     label: 'Säulenabstand vertikal',   unit: 'mm',  def: 1200 , gt: 0, max: 6000, bound: 'plaus' },
      { key: 'pAcc',     label: 'Akkumulatordruck max.',    unit: 'bar', def: 190 , gt: 0, max: 500, bound: 'plaus' },
      { key: 'intTime',  label: 'Nachdruckaufbauzeit',      unit: 'ms',  def: 80 , min: 0, max: 5000, bound: 'plaus' }
    ]
  },
  {
    id: 'machine', title: 'Druck und Sprengfläche',
    /* Die Druckachse läuft von 0 bis zum max. spezifischen Gießdruck der
       Maschine (Gießkraft auf Ø dmin) — pmin/pmax sind keine Eingaben mehr. */
    fields: [
      /* Eingestellter Akkumulatordruck: die Betriebsgröße der Maschine —
         höchstens das Maximum des Presets, Gießkraft = P_ein · A_h.
         follows: startet beim Maximum (Preset-Wechsel, ältere Projekte). */
      { key: 'pAccOp', label: 'Akkumulatordruck (eingestellt)', unit: 'bar', def: 190, follows: 'pAcc' , gt: 0, max: 500, bound: 'plaus' },
      { key: 'area',   label: 'Sprengfläche',      unit: 'm²',  def: 0.15 , gt: 0, max: 10, bound: 'plaus' },
      { key: 'psel',   label: 'Nachdruck (metallseitig)', unit: 'bar', def: 600 , gt: 0, max: 3000, bound: 'plaus' },
      /* adv: standardmäßig hinter „Erweiterte Optionen" eingeklappt. */
      { key: 'safety', label: 'Sicherheitsfaktor', unit: '-',   def: 1.3, adv: true , min: 1, max: 5, bound: 'hart', why: 'ein Sicherheitsfaktor unter 1 ist keiner' },
      { key: 'eccX', label: 'Außermittigkeit Schwerpunkt x', unit: 'mm', def: 0, adv: true , min: -3000, max: 3000, bound: 'plaus' },
      { key: 'eccY', label: 'Außermittigkeit Schwerpunkt y', unit: 'mm', def: 0, adv: true , min: -3000, max: 3000, bound: 'plaus' }
    ]
  },
  {
    id: 'mass', title: 'Massenbilanz',
    note: 'Alle Gewichte für den ganzen Schuss, also über alle Kavitäten zusammen. Die Summe der vier ist das Dosiergewicht und muss in die Gießkammer passen (Füllgrad φ). Das Angussgewicht ist ohne Pressrest; der steht im eigenen Feld.',
    fields: [
      { key: 'part',     label: 'Bauteilgewicht',   unit: 'kg', def: 12 , gt: 0, max: 1000, bound: 'plaus' },
      { key: 'runner',   label: 'Angussgewicht',    unit: 'kg', def: 3 , gt: 0, max: 1000, bound: 'hart',
        why: 'ohne Anguss erreicht die Schmelze die Kavität nicht; die Simulation weist es ab' },
      { key: 'overflow', label: 'Überlaufgewicht',  unit: 'kg', def: 2 , min: 0, max: 1000, bound: 'plaus' },
      { key: 'biscuit',  label: 'Pressrestgewicht', unit: 'kg', def: 1.2 , gt: 0, max: 1000, bound: 'hart',
        why: 'ohne Pressrest führte der Kolben bis in die Form; die Simulation weist es ab' }
    ]
  },
  {
    id: 'alloyFields', title: 'Legierungswerte', preset: 'alloy',
    note: 'Diese Felder setzt das Legierungs-Preset (/shared/examples/alloys.js). Bei gewähltem Preset sind sie ausgeblendet; „manuell" wählen, um sie frei einzugeben.',
    fields: [
      { key: 'density', label: 'Dichte flüssig',    unit: 'kg/m³',  def: 2400 , gt: 0, max: 20000, bound: 'plaus' },
      /* Feststoffdichte und Schwindmaß nutzt die Sprengflächenanalyse für
         Massen und die Umrechnung Werkzeugmaß ↔ fertiges Bauteil. */
      { key: 'densitySolid', label: 'Dichte fest',   unit: 'kg/m³', def: 2700, adv: true , gt: 0, max: 20000, bound: 'plaus' },
      { key: 'shrink',       label: 'Schwindmaß',    unit: '%',     def: 0.55, adv: true , gt: 0, max: 5, bound: 'plaus' },
      { key: 'Tcast',   label: 'Gießtemperatur',    unit: '°C',     def: 660 , gt: 0, max: 2000, bound: 'plaus' },
      { key: 'Tflow',   label: 'Min. Fließtemp.',   unit: '°C',     def: 580 , gt: 0, max: 2000, bound: 'plaus' },
      { key: 'Zconst',  label: 'Z-Konstante',       unit: '°C/%',   def: 4.8 , gt: 0, max: 100, bound: 'plaus' },
      { key: 'solK',    label: 'Erstarrungskonstante', unit: 'ms/mm²', def: 10 , gt: 0, max: 1000, bound: 'plaus' },
      /* Thermik für die Wärmebilanz der Zyklusanalyse (Wärmeeintrag des
         Gussstücks von Liquidus bis Entformung) — im Dashboard eingeklappt. */
      { key: 'Tliq',    label: 'Liquidustemperatur',   unit: '°C',       def: 593,  adv: true , gt: 0, max: 2000, bound: 'plaus' },
      { key: 'Tsol',    label: 'Solidustemperatur',    unit: '°C',       def: 521,  adv: true , gt: 0, max: 2000, bound: 'plaus' },
      { key: 'hf',      label: 'Erstarrungswärme',     unit: 'kJ/kg',    def: 403,  adv: true , gt: 0, max: 2000, bound: 'plaus' },
      { key: 'cp20',    label: 'c_p bei 20 °C',        unit: 'J/(kg·K)', def: 846,  adv: true , gt: 0, max: 5000, bound: 'plaus' },
      { key: 'cpS',     label: 'c_p bei Solidus',      unit: 'J/(kg·K)', def: 1034, adv: true , gt: 0, max: 5000, bound: 'plaus' },
      { key: 'cpL',     label: 'c_p bei Liquidus',     unit: 'J/(kg·K)', def: 1056, adv: true , gt: 0, max: 5000, bound: 'plaus' }
    ]
  },
  {
    id: 'chamber', title: 'Füllkammer und Kolben',
    fields: [
      { key: 'diam',   label: 'Gewählter Kolben-Ø',    unit: 'mm', def: 150 , gt: 0, max: 500, bound: 'plaus' },
      /* def passt zur Default-Maschine (HCC-1600, lmax 900) und hält den
         Füllgrad mit der Default-Massenbilanz im Zielband. */
      { key: 'length', label: 'Gewählte Kammerlänge',  unit: 'mm', def: 900 , gt: 0, max: 3000, bound: 'plaus' },
      { key: 'sealStroke', label: 'Einfüllöffnung verschlossen', unit: 'mm', def: 150 , gt: 0, max: 3000, bound: 'plaus' }
    ]
  },
  {
    id: 'gating', title: 'Anschnitt',
    fields: [
      /* auto: optionaler Auto-Schalter (core/autofit.js) — ideale Fläche aus
         Projekt und Schusskurve, Feld wird dann schreibgeschützt. */
      { key: 'gate',   label: 'Anschnittfläche',      unit: 'mm²', def: 1800,
        auto: 'Ideal: Anschnittgeschwindigkeit in der Mitte des Zielbands bei der Kolbengeschwindigkeit „Bauteil gefüllt" der Schusskurve: A_a = A_K·v_p/v_a,Ziel', gt: 0, max: 100000, bound: 'plaus' },
      { key: 'gateTh', label: 'Anschnittdicke',       unit: 'mm',  def: 3 , gt: 0, max: 100, bound: 'plaus' },
      { key: 'Cd',     label: 'Durchflussbeiwert',    unit: '-',   def: 0.5 , gt: 0, max: 1, bound: 'hart', why: 'ein Durchflussbeiwert über 1 hieße mehr Durchfluss als Antrieb' }
    ]
  },
  {
    id: 'vacuum', title: 'Vakuum und Entlüftung',
    note: 'Die Entlüftungsfläche treibt die Entlüftungs-KPIs und -Diagramme. In den Drossel-Modellen der Simulation (Backend) ist sie mit Spalt und Kanallänge der Widerstand, durch den die Luft zur Pumpe bzw. in den Tank muss: bei großem Druckverhältnis chokt der Kanal (Schallgeschwindigkeit am Austritt), dazwischen begrenzt die Wandreibung, bei kleiner Druckdifferenz und niedrigem Druck fließt die Luft zäh (laminar). „Sofort-Enddruck" ignoriert Fläche und Kanal; der Druck springt beim Öffnen auf den Enddruck. Der Tank ist vor dem Schuss auf den Enddruck evakuiert; sein Druck steigt mit jeder abgesaugten Luftmasse. Schließt das Ventil vor dem Füllende, wird die Restluft danach verdichtet.',
    fields: [
      { key: 'vacModel', label: 'Vakuum-Modell', unit: '', def: 'conductance', type: 'select',
        options: [['aus', 'ohne Vakuum'], ['ideal', 'Sofort-Enddruck (ideal, ohne Drossel)'], ['conductance', 'Drossel → Pumpe (Enddruck konstant)'], ['tank', 'Drossel → Vakuumtank (Druck steigt)']] },
      { key: 'vent', label: 'Entlüftungsfläche', unit: 'mm²', def: 800,
        auto: 'Ideal: Entlüftungsbedarf bei der Füllzeit der Schusskurve: A_ent = V_luft/(t_f·v_luft,max), auf 10 mm² aufgerundet', gt: 0, max: 100000, bound: 'plaus' },
      /* Entlüftungskanal als breiter Schlitz: Spalthöhe und Weglänge bis zum
         Ventil bestimmen die Wandreibung (hydraulischer Ø = 2·Spalt). */
      /* when: nur sichtbar (und geprüft), solange das Modell das Feld
         braucht — der Kanal nur in den Drossel-Modellen, der Tank nur beim
         Tankmodell, alles Weitere nur mit Vakuum. */
      { key: 'ventGap', label: 'Entlüftungsspalt', unit: 'mm', def: 10, gt: 0, max: 50, bound: 'plaus', when: { vacModel: VAC_DROSSEL } },
      { key: 'ventLen', label: 'Entlüftungskanal Länge', unit: 'mm', def: 80, gt: 0, max: 5000, bound: 'plaus', when: { vacModel: VAC_DROSSEL } },
      { key: 'vacPump',  label: 'Enddruck Pumpe / Tank vor Schuss', unit: 'mbar', def: 80 , gt: 0, max: 1013, bound: 'hart', why: 'ein Enddruck über dem Umgebungsdruck ist kein Vakuum', when: { vacModel: VAC_ON } },
      { key: 'vacTank',  label: 'Vakuumtank-Volumen', unit: 'L', def: 500, gt: 0, max: 100000, bound: 'plaus', when: { vacModel: ['tank'] } },
      { key: 'vacStart', label: 'Vakuum ab Kolbenweg', unit: 'mm',  def: 150 , min: 0, max: 3000, bound: 'plaus', when: { vacModel: VAC_ON } },
      /* Ventilschluss: am Füllende (Schmelze erreicht das Ventil), bei einem
         Kolbenweg oder nach einer Offenzeit ab Ventilöffnung — nur das
         Zahlenfeld des gewählten Modus ist sichtbar. */
      { key: 'vacEnd', label: 'Ventil schließt', unit: '', def: 'fill', type: 'select',
        options: [['fill', 'am Füllende'], ['stroke', 'bei Kolbenweg'], ['time', 'nach Offenzeit']], when: { vacModel: VAC_ON } },
      { key: 'vacEndStroke', label: 'Ventil zu bei Kolbenweg', unit: 'mm', def: 700, min: 0, max: 3000, bound: 'plaus', when: { vacModel: VAC_ON, vacEnd: ['stroke'] } },
      { key: 'vacEndTime', label: 'Ventil-Offenzeit', unit: 'ms', def: 500, gt: 0, max: 10000, bound: 'plaus', when: { vacModel: VAC_ON, vacEnd: ['time'] } }
    ]
  },
  {
    id: 'process', title: 'Prozessfenster', wide: true,
    /* v1 (max. bis „Kammer voll") und v2 (Mittel nach Anschnitt) sind
       keine Eingaben mehr — computeShot leitet sie aus der Schusskurve ab. */
    fields: [
      { key: 'tmax',    label: 'Füllzeit max.',             unit: 'ms',  def: 100 , gt: 0, max: 10000, bound: 'plaus' },
      { key: 'fillMin', label: 'Füllgrad Ziel min.',        unit: '%',   def: 40 , min: 0, max: 100, bound: 'hart', why: 'ein Füllgrad ist ein Anteil und liegt in 0…100 %' },
      { key: 'fillMax', label: 'Füllgrad Ziel max.',        unit: '%',   def: 60 , min: 0, max: 100, bound: 'hart', why: 'ein Füllgrad ist ein Anteil und liegt in 0…100 %' },
      { key: 'gateMin', label: 'Anschnittgeschw. Ziel min.', unit: 'm/s', def: 30 , min: 0, max: 200, bound: 'plaus' },
      { key: 'gateMax', label: 'Anschnittgeschw. Ziel max.', unit: 'm/s', def: 50 , min: 0, max: 200, bound: 'plaus' },
      { key: 'vAirMax', label: 'Max. Entlüftungsgeschw.',    unit: 'm/s', def: 150 , gt: 0, max: 1000, bound: 'plaus' },
      { key: 'biscuitMin', label: 'Pressrest min.',          unit: 'mm',  def: 25 , min: 0, max: 500, bound: 'plaus' },
      /* Herman-J-Faktor v_a^1,71·e_p·ρ (inch-pound): unter J_min keine
         Zerstäubung, über J_max Erosion/Überzerstäubung. */
      { key: 'JatomMin', label: 'Zerstäubungsfaktor J min.', unit: '-', def: 750 , gt: 0, max: 100000, bound: 'plaus' },
      { key: 'JatomMax', label: 'Zerstäubungsfaktor J max.', unit: '-', def: 6000 , gt: 0, max: 100000, bound: 'plaus' }
    ]
  },
  {
    id: 'partFields', title: 'Bauteilgeometrie und Thermik', preset: 'part', wide: true,
    note: 'Diese Felder setzt das Bauteiltyp-Preset (/shared/examples/parts.js). Bei gewähltem Preset sind sie ausgeblendet; „manuell" wählen, um sie frei einzugeben.',
    fields: [
      { key: 'wall',    label: 'Wandstärke',      unit: 'mm',    def: 3.5 , gt: 0, max: 100, bound: 'plaus' },
      { key: 'wallMin', label: 'Wandstärke min.', unit: 'mm',    def: 1.5 , gt: 0, max: 100, bound: 'plaus' },
      { key: 'wallMax', label: 'Wandstärke max.', unit: 'mm',    def: 8 , gt: 0, max: 100, bound: 'plaus' },
      { key: 'Tdie',    label: 'Formtemperatur',  unit: '°C',    def: 200 , gt: 0, max: 2000, bound: 'plaus' },
      { key: 'Sfrac',   label: 'Zul. Erstarrung', unit: '%',     def: 20 , min: 0, max: 100, bound: 'hart', why: 'ein Erstarrungsanteil ist ein Anteil und liegt in 0…100 %' },
      { key: 'kfill',   label: 'NADCA-Faktor k',  unit: 'ms/mm', def: 35 , gt: 0, max: 1000, bound: 'plaus' }
    ]
  },
];

/* Felder, die von einem Preset gesetzt werden: key → Domänen-id. Handänderung
   eines dieser Felder setzt die jeweilige Preset-Auswahl auf „manuell" zurück.
   Abgeleitet aus den Feldgruppen mit preset-Domäne. */
/* Felder mit Auto-Schalter: { key: Erklärung } */
export const AUTO_KEYS = {};
for (const f of allFields()) if (f.auto) AUTO_KEYS[f.key] = f.auto;

/* Felder, die einem anderen Feld folgen (Vorgabe = dessen Wert): { key: source } */
export const FOLLOWS = {};
for (const f of allFields()) if (f.follows) FOLLOWS[f.key] = f.follows;

export const PRESET_KEYS = {};
for (const g of groups) {
  if (g.preset) for (const f of g.fields) PRESET_KEYS[f.key] = g.preset;
}

/* Standard-Schusskurve: Wegpunkte [s in mm, v in m/s] — abgestimmt auf die
   Default-Geometrie (Ø 150 × L 1000: „Kammer voll" ≈ 574 mm, Gesamthub ≈ 972 mm). */
/* Startkurve für den frischen Zustand mit den Default-Presets (HCC-1600,
   AlSi9Cu3): Plateau 0,4 m/s bis „Kammer voll" (474,4 mm), Rampe ≤ a_max,
   Ende hinter dem Füllende beider Default-Welten (Preset 830 mm, Feld-Defaults 833 mm). */
export const DEFAULT_CURVE = [[60, 0.4], [475, 0.4], [640, 4.5], [834, 4.5]];

export function allFields() {
  const a = [];
  for (const g of groups) {
    if (g.columns) g.columns.forEach(c => a.push(...c.fields));
    else a.push(...g.fields);
  }
  return a;
}

/* ---------------------------------------------------------------------------
   Paarregeln: Bedingungen zwischen zwei Feldern, die eine Einzelgrenze nicht
   ausdrücken kann. Zusammen mit min/gt/max an den Feldern oben ist das die
   VOLLSTÄNDIGE Eingabedomäne — es gibt keine zweite Liste mehr.

   op:   '<' echt kleiner · '<=' höchstens · 'in' liegt zwischen zwei Feldern
   zieh: Beim Wechsel eines Presets darf dieser Wert in den neuen Bereich
         nachgeführt werden ('a' = das linke Feld, 'key' = das gewählte).
         Nur für Werte, die der Maschine FOLGEN — Zielbänder des Anwenders
         (fillMin/fillMax, gateMin/gateMax) werden nie verschoben.
   Wer hier etwas ergänzt, ergänzt damit zugleich die Sidebar-Markierung, die
   Sperre in render(), die HTML-Attribute und docs/eingabegrenzen.md.  */
export const PAIRS = [
  { a: 'dmin', b: 'dmax', op: '<',  text: 'Kolben-Ø min. muss unter dem Maximum liegen' },
  { a: 'lmin', b: 'lmax', op: '<',  text: 'Kammerlänge min. muss unter dem Maximum liegen' },
  { a: 'wallMin', b: 'wallMax', op: '<', text: 'Wandstärke min. muss unter dem Maximum liegen' },
  { a: 'fillMin', b: 'fillMax', op: '<=', text: 'Füllgrad-Ziel min. darf das Maximum nicht überschreiten' },
  { a: 'gateMin', b: 'gateMax', op: '<=', text: 'Anschnittgeschw.-Ziel min. darf das Maximum nicht überschreiten' },
  { a: 'JatomMin', b: 'JatomMax', op: '<', text: 'Zerstäubungsfaktor min. muss unter dem Maximum liegen' },
  { a: 'pAccOp', b: 'pAcc', op: '<=', text: 'Eingestellter Akkumulatordruck über dem Maximum der Maschine', zieh: 'a' },
  { a: 'sealStroke', b: 'length', op: '<=', text: 'Verschluss-Hub muss in der Kammer liegen', zieh: 'a' },
  /* Temperaturgefälle — ohne sie liefern Erstarrung und Blasenmodell keine
     Aussage. Standen bisher nur als Guard in ftwall.js und bubble.js. */
  { a: 'Tdie', b: 'Tflow', op: '<', text: 'Min. Fließtemperatur muss über der Formtemperatur liegen' },
  { a: 'Tdie', b: 'Tliq',  op: '<', text: 'Liquidustemperatur muss über der Formtemperatur liegen' },
  { a: 'Tsol', b: 'Tliq',  op: '<', text: 'Liquidus- muss über der Solidustemperatur liegen' },
  { a: 'Tliq', b: 'Tcast', op: '<=', text: 'Gießtemperatur darf nicht unter der Liquidustemperatur liegen' },
  /* Gewählte Werte in den Maschinengrenzen. */
  { key: 'diam',   lo: 'dmin', hi: 'dmax', op: 'in', text: 'Gewählter Kolben-Ø außerhalb der Maschinengrenzen', zieh: 'key' },
  { key: 'length', lo: 'lmin', hi: 'lmax', op: 'in', text: 'Gewählte Kammerlänge außerhalb der Maschinengrenzen', zieh: 'key' },
];

/* Alle numerischen Felder mit ihrer Domäne, flach — Grundlage von validate(),
   den HTML-Attributen und dem Generator scripts/gen-domain-doc.mjs. */
export function domainFields() {
  return allFields().filter(f => f.type !== 'select');
}

/* Felder, die zum aktuellen Zustand nicht gehören: `when` nennt je
   Select-Feld die Werte, bei denen das Feld gilt; alle Bedingungen müssen
   zutreffen. Solche Felder sind in der Seitenleiste ausgeblendet und
   zählen nicht in der Domänenprüfung — ihr Wert bleibt im Zustand und ist
   beim Zurückschalten wieder da. */
export function hiddenFields(v) {
  const out = new Set();
  for (const f of allFields()) {
    if (f.when && !Object.entries(f.when).every(([k, vals]) => vals.includes(v[k]))) out.add(f.key);
  }
  return out;
}
