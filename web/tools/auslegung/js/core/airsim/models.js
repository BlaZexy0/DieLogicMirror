/* Luftdruck-Modelle für das zusammengefasste Luftvolumen der Form.
   SI-Einheiten.

   Der Prozess behandelt alles Gas — Kammerraum über der Schmelze plus die
   ungefüllten Teile von Anguss, Bauteil und Überlauf — als EIN Volumen.
   Zwei Sorten Modelle:

   · geschlossene Form: der Druck ist eine reine Funktion des aktuellen
     Luftzustands (`sealed`, `ideal`).
   · wegabhängig: Luftmasse entweicht durch Öffnungen, die Vorgeschichte
     zählt (`conductance`, `tank`); solver.js integriert sie über die
     Zeitachse.

   Modelle ({ type, … }):
     sealed        Umgebungsdruck bei offener Einfüllöffnung, danach dichte
                   isotherme Verdichtung. Kennt keine Entlüftung.
     ideal         pumpPressure — der Druck springt beim Öffnen des Ventils
                   auf den Pumpendruck und bleibt dort, solange es aktiv
                   ist: unendlich schnelle Pumpe hinter unendlich weiter
                   Entlüftung, keine Fläche geht ein. Obergrenze dessen, was
                   ein Vakuumsystem kann.
     conductance   pumpPressure, dischargeCoefficient? — das Ventil mündet
                   in einen Raum, der auf pumpPressure gehalten wird. Den
                   Verlauf bestimmen allein die Öffnungen.
     tank          tankVolume, tankPressure, pumpSpeed?, ultimatePressure?,
                   dischargeCoefficient? — endlicher Tank, vor dem Schuss
                   auf tankPressure evakuiert. Jedes Kilogramm aus der Form
                   hebt den Tankdruck um R·T/V_tank; das treibende Gefälle
                   schrumpft im Schuss, je kleiner der Tank, desto früher.

   Ein Modell liest den Prozess nur über dessen druckfreie Seite
   (airStateAtTime, airVolumeAtStroke, valve, vent …) — es kann nie in sich
   selbst zurückrufen. */

export const ATMOSPHERE = 101325;   // Pa

/* Umgebung und Lufteigenschaften. */
export const STANDARD_ENVIRONMENT = {
  ambientPressure: ATMOSPHERE,
  ambientTemperature: 293.15,   // K
  gasConstant: 287.05,          // J/(kg·K)
  heatCapacityRatio: 1.4,
  viscosity: 1.82e-5            // Pa·s, Luft bei 20 °C
};

export const isVented = model => model.type === 'conductance' || model.type === 'tank';
export const DEFAULT_DISCHARGE_COEFFICIENT = 0.8;

/* Jenseits dieses Verdichtungsverhältnisses beschreibt das isotherme
   Gasgesetz nichts Reales mehr: die eingeschlossene Luft stünde bei
   hunderten bar, wo sie sich in der Schmelze löst, durch die Form entweicht
   oder sich weitab von isotherm erwärmt. Das Modell hat dort nichts zu
   sagen. */
export const MAX_COMPRESSION = 1000;

/* p·V = const ab einem Bezugszustand. Infinity, sobald das Luftvolumen
   verschwindet ODER die Verdichtung den Bereich verlässt, in dem das Gesetz
   etwas bedeutet — ohne die zweite Bedingung lieferte das Füllende eine
   riesige, aber ENDLICHE Zahl, die jede Endlichkeitsprüfung bestand und
   gezeichnet wurde. */
export function isothermal(pRef, vRef, airVolume) {
  if (airVolume <= 0) return Infinity;
  const ratio = vRef / airVolume;
  if (!Number.isFinite(ratio) || ratio > MAX_COMPRESSION) return Infinity;
  return (pRef * vRef) / airVolume;
}

function sealedPressure(process, air) {
  const ambient = process.environment.ambientPressure;
  if (air.pourHoleOpen) return ambient;
  return isothermal(ambient, process.airVolumeAtStroke(process.pourHolePosition), air.airVolume);
}

/* Druck eines Modells geschlossener Form bei einem Luftzustand, in Pa. */
export function closedFormPressure(model, process, air) {
  if (model.type === 'sealed') return sealedPressure(process, air);
  const valve = process.valve;
  if (valve === null || air.stroke < valve.startPosition) return sealedPressure(process, air);
  if (air.vacuumActive) return model.pumpPressure;
  return isothermal(model.pumpPressure, process.airVolumeAtStroke(valve.endPosition), air.airVolume);
}

/* ── die Senke hinter dem Ventil (entlüftete Modelle) ──
   Wohin das Ventil mündet: ihr Druck, und was ankommende Luftmasse mit ihm
   macht. `publishes`: zeigt die Senke ihren Druck als eigenen Kanal neben
   dem Luftdruck? */
export function sinkOf(model) {
  if (model.type === 'conductance') {
    return { startPressure: model.pumpPressure, publishes: false, step: pressure => pressure };
  }
  const { tankVolume, tankPressure } = model;
  const pumpSpeed = model.pumpSpeed ?? 0;
  const ultimate = model.ultimatePressure ?? tankPressure;
  return {
    /* Der Zustand ist der Tankdruck selbst: isotherm, die Luftmasse im Tank
       ist also p·V/(R·T) und muss nie eigens mitgeführt werden. */
    startPressure: tankPressure,
    publishes: true,
    step(pressure, massIn, dt, gasRt) {
      let p = pressure + (massIn * gasRt) / tankVolume;
      /* dp/dt = −(S/V)(p − p_ult): exakte Exponentialfunktion je Schritt */
      if (pumpSpeed > 0 && p > ultimate) p = ultimate + (p - ultimate) * Math.exp((-pumpSpeed * dt) / tankVolume);
      return p;
    }
  };
}

/* Die physikalischen Grenzen der Modellparameter. Liefert den Namen des
   ersten verletzten Parameters oder null. */
export function invalidModelParameter(model) {
  if (model.type === 'sealed') return null;
  if (isVented(model)) {
    const cd = model.dischargeCoefficient ?? DEFAULT_DISCHARGE_COEFFICIENT;
    if (!(cd > 0 && cd <= 1)) return 'dischargeCoefficient';
  }
  if (model.type === 'tank') {
    if (!(model.tankVolume > 0)) return 'tankVolume';
    if (!(model.tankPressure > 0)) return 'tankPressure';
    if (!((model.pumpSpeed ?? 0) >= 0)) return 'pumpSpeed';
    const ultimate = model.ultimatePressure ?? model.tankPressure;
    if (!(ultimate > 0 && ultimate <= model.tankPressure)) return 'ultimatePressure';
    return null;
  }
  return model.pumpPressure > 0 ? null : 'pumpPressure';
}
