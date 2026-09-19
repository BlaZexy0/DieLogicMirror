/* Luftmassenstrom durch die Öffnungen der Form: Einfüllöffnung,
   Entlüftungen, Vakuumventil. SI-Einheiten.

   Eine Öffnung ist entweder eine schlichte Blende (isentrope Düsen-
   strömung) oder — wenn sie einen Kanal trägt — ein breiter Schlitz mit
   Wandreibung: verblockt bei großem Druckverhältnis, reibungsbegrenzt
   dazwischen, viskos (Poiseuille), sobald die Strömung bei niedrigem Druck
   und kleiner Druckdifferenz laminar wird. Alle Luft ist isotherm bei
   Umgebungstemperatur.

   Öffnung: { area, channel } — area in m² (null oder ≤ 0: geschlossen),
   channel null oder { gap, length, entryLoss?, roughness? } in m. Die
   Schlitzbreite folgt aus der Fläche (area/gap), der hydraulische
   Durchmesser ist damit 2·gap. */

export const DEFAULT_ENTRY_LOSS = 0.5;    // Einlaufverlust: scharfkantig
export const DEFAULT_ROUGHNESS = 5e-6;    // m: bearbeiteter Stahl
export const CLOSED = { area: null, channel: null };

/* Kompressibler Blendenstrom in kg/s: isentrop, verblockt, sobald das
   Druckverhältnis unter das kritische fällt (0,528 für Luft). Null ohne
   Druckgefälle in Strömungsrichtung. */
export function orificeMassFlow(dischargeCoefficient, area, pUp, pDown, temperature, gasConstant, heatCapacityRatio) {
  if (area <= 0 || pUp <= 0 || pUp <= pDown) return 0;
  const g = heatCapacityRatio;
  const critical = Math.pow(2 / (g + 1), g / (g - 1));
  const ratio = Math.max(pDown / pUp, critical);
  const term = Math.pow(ratio, 2 / g) - Math.pow(ratio, (g + 1) / g);
  return dischargeCoefficient * area * pUp * Math.sqrt(((2 * g) / ((g - 1) * gasConstant * temperature)) * term);
}

/* Darcy-Reibungszahl eines breiten Schlitzes über alle Bereiche:
   Churchills Korrelation mit dem laminaren Ast paralleler Platten
   (f = 96/Re) anstelle der 64/Re des Rohrs. */
export function slitFrictionFactor(reynolds, relativeRoughness = 0) {
  const re = Math.max(reynolds, 1e-3);
  const a = Math.pow(2.457 * Math.log(1 / (Math.pow(7 / re, 0.9) + 0.27 * relativeRoughness)), 16);
  const b = Math.pow(37530 / re, 16);
  return 8 * Math.pow(Math.pow(12 / re, 12) + 1 / Math.pow(a + b, 1.5), 1 / 12);
}

/* Druckverhältnis r Kessel/Austritt, bei dem isotherme Kanalströmung mit
   dem Gesamtverlustbeiwert K verblockt: r² − 2 ln r − 1 = K. Die linke
   Seite ist für r ≥ 1 konvex und steigend — Newton von r = 1 + √K (auf
   oder über der Wurzel) konvergiert monoton. */
export function chokingRatio(loss) {
  if (loss <= 0) return 1;
  let r = 1 + Math.sqrt(loss);
  for (let i = 0; i < 60; i++) {
    const step = (r * r - 2 * Math.log(r) - 1 - loss) / (2 * r - 2 / r);
    r -= step;
    if (Math.abs(step) <= 1e-13 * r) break;
  }
  return r;
}

/* Isotherme kompressible Strömung eines idealen Gases aus einem ruhenden
   Kessel (pUp) durch einen breiten Schlitz mit Wandreibung in eine Senke
   (pDown). Impulsbilanz längs des Kanals bei konstanter Massenstromdichte G:

       pUp² − pAus² = G²·R·T·(K + 2 ln(pUp/pAus)),   K = 1 + ζ_ein + f·L/D_h

   Die 1 beschleunigt das Gas aus der Ruhe; f ist die Reibungszahl des
   Schlitzes, und Re = G·D_h/µ hängt selbst von G ab — aufgelöst per
   Fixpunktiteration. Der Austritt kann die isotherme Schallgeschwindigkeit
   nicht überschreiten: fällt pDown unter pUp/r mit r = chokingRatio(K),
   ist die Strömung bei G = pAus/√(R·T) verblockt, und der Senkendruck
   spielt keine Rolle mehr.

   Liefert { massFlow, frictionFactor } — die Reibungszahl beim nächsten
   Aufruf unter ähnlichen Bedingungen wieder hineinreichen, sie ist der
   Startwert der Iteration. */
export function channelMassFlow(channel, area, pUp, pDown, temperature, gasConstant, viscosity, frictionFactor = 0) {
  if (area <= 0 || pUp <= 0 || pUp <= pDown) return { massFlow: 0, frictionFactor: frictionFactor || 0 };
  const entryLoss = channel.entryLoss ?? DEFAULT_ENTRY_LOSS;
  const gasRt = gasConstant * temperature;
  const dH = 2 * channel.gap;
  const relRough = (channel.roughness ?? DEFAULT_ROUGHNESS) / dH;
  const lnRatio = Math.log(pUp / Math.max(pDown, 1e-12));
  let f = frictionFactor > 0 ? frictionFactor : 0.03;
  let flux = 0;
  for (let i = 0; i < 40; i++) {
    const loss = 1 + entryLoss + (f * channel.length) / dH;
    const pExit = pUp / chokingRatio(loss);
    const newFlux = pDown <= pExit
      ? pExit / Math.sqrt(gasRt)                                                    // verblockt
      : Math.sqrt((pUp * pUp - pDown * pDown) / (gasRt * (loss + 2 * lnRatio)));    // unterkritisch
    f = slitFrictionFactor((newFlux * dH) / viscosity, relRough);
    const done = Math.abs(newFlux - flux) <= 1e-7 * newFlux;
    flux = newFlux;
    if (done) break;
  }
  return { massFlow: flux * area, frictionFactor: f };
}

/* Massenstrom durch EINE Öffnung: Kanalströmung, wenn sie einen Kanal hat,
   sonst die Blende mit dem Ausflussbeiwert des Modells. `gas` sind die
   Lufteigenschaften der Umgebung (models.js). Bei der Blende wird die
   Reibungszahl unverändert durchgereicht. */
export function openingFlow(opening, dischargeCoefficient, pUp, pDown, gas, frictionFactor) {
  if (opening.area === null || opening.area <= 0) return { massFlow: 0, frictionFactor };
  if (opening.channel === null) {
    return {
      massFlow: orificeMassFlow(dischargeCoefficient, opening.area, pUp, pDown,
        gas.ambientTemperature, gas.gasConstant, gas.heatCapacityRatio),
      frictionFactor
    };
  }
  return channelMassFlow(opening.channel, opening.area, pUp, pDown,
    gas.ambientTemperature, gas.gasConstant, gas.viscosity, frictionFactor);
}
