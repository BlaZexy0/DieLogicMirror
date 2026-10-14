/* Werkstoffe für dieLogicSolFoam: die Einträge der Materialbibliothek von
   dieLogicSol (materials/alloys, materials/dies), Temperaturen in K. Die
   Kurven fs(T) sind Näherungen (Scheil-artig); für eine echte Legierung
   gehört eine CALPHAD-Tabelle hinein. Daneben jede Legierung der
   Auslegung (shared/examples/alloys.js) mit einer linearen Kurve zwischen
   Liquidus und Solidus aus ihren Feldern. */

const K = 273.15;

export const ALLOYS = [
  {
    id: 'AlSi9Cu3', name: 'AlSi9Cu3(Fe), EN AC-46000', Tcast: 680,
    rho: 2650, rhoLiquid: 2500, rhoSolid: 2620, L: 4.3e5,
    cp: [[293, 880], [573, 960], [763, 1030], [868, 1100], [1000, 1100]],
    kappa: [[293, 110], [573, 125], [763, 130], [848, 100], [868, 70], [1000, 72]],
    fs: [[868, 0], [860, 0.10], [853, 0.22], [848, 0.35], [846, 0.55], [844, 0.75], [840, 0.85], [820, 0.90], [800, 0.94], [783, 0.97], [778, 0.99], [763, 1]],
    sdas: [10.5, 0.333]
  },
  {
    id: 'AlSi10MnMg', name: 'AlSi10MnMg, EN AC-43500 (Strukturguss)', Tcast: 690,
    rho: 2640, rhoLiquid: 2450, rhoSolid: 2570, L: 4.6e5,
    cp: [[293, 890], [573, 970], [823, 1040], [869, 1150], [1000, 1150]],
    kappa: [[293, 150], [573, 160], [823, 160], [850, 110], [869, 75], [1000, 77]],
    fs: [[869, 0], [862, 0.10], [856, 0.20], [851, 0.30], [849, 0.55], [847, 0.80], [843, 0.90], [835, 0.95], [830, 0.98], [826, 1]],
    sdas: [10.5, 0.333]
  },
  {
    id: 'AlSi12', name: 'AlSi12(Fe), EN AC-44300', Tcast: 660,
    rho: 2650, rhoLiquid: 2450, rhoSolid: 2540, L: 4.9e5,
    cp: [[293, 890], [573, 970], [845, 1050], [855, 1170], [1000, 1170]],
    kappa: [[293, 130], [573, 140], [845, 140], [850, 105], [855, 75], [1000, 77]],
    fs: [[855, 0], [852, 0.15], [850, 0.45], [848, 0.75], [846, 0.92], [845, 1]],
    sdas: [10.5, 0.333]
  },
  {
    id: 'AM50', name: 'AM50, Magnesium', Tcast: 680,
    rho: 1770, rhoLiquid: 1650, rhoSolid: 1770, L: 3.7e5,
    cp: [[293, 1000], [573, 1100], [819, 1180], [893, 1300], [1000, 1300]],
    kappa: [[293, 62], [573, 70], [819, 75], [893, 80], [1000, 82]],
    fs: [[893, 0], [885, 0.25], [870, 0.50], [850, 0.72], [830, 0.88], [819, 0.95], [760, 0.97], [712, 0.98], [708, 1]],
    sdas: [10, 0.333]
  }
];

export const DIE_STEEL = {
  id: 'H13', name: 'Warmarbeitsstahl 1.2343 (H11/H13)', rho: 7800,
  cp: [[293, 460], [473, 500], [673, 550], [873, 600]],
  kappa: [[293, 24.5], [473, 26.5], [673, 28], [873, 28.5]]
};
export const PLUNGER = {
  id: 'CuCoBe', name: 'Kupferlegierung CuCoBe', rho: 8800,
  cp: [[293, 400], [673, 440]],
  kappa: [[293, 230], [673, 250]]
};

/** Eine Legierung der Auslegung (Felder wie shared/examples/alloys.js) als
    Eintrag mit linearer Kurve: Dichten flüssig/fest, cp fest/flüssig, die
    Leitfähigkeit eines Aluminium- oder Magnesiumgusses (nach Dichte). */
export function alloyFromFields(id, name, f) {
  const Tl = f.Tliq + K, Ts = f.Tsol + K;
  const rl = f.density, rs = f.densitySolid > rl ? f.densitySolid : rl * 1.05;
  const mg = rl < 2000, zn = rl > 5000;
  const kS = zn ? 105 : mg ? 75 : 130, kL = zn ? 60 : mg ? 80 : 70;
  return {
    id, name: name + ' (linear zwischen Liquidus und Solidus)', Tcast: f.Tcast, linear: true,
    rho: Math.round((rl + rs) / 2), rhoLiquid: rl, rhoSolid: Math.round(rs), L: f.hf * 1000,
    cp: [[293, f.cp20 || f.cpS], [Ts, f.cpS], [Tl, f.cpL], [Tl + 150, f.cpL]],
    kappa: [[293, kS], [Ts, kS], [Tl, kL], [Tl + 150, kL]],
    fs: [[Tl, 0], [Ts, 1]],
    sdas: [10.5, 0.333]
  };
}

/** Liquidus und Solidus [°C] einer Legierung. */
export const liquidus = a => a.fs[0][0] - K;
export const solidus = a => a.fs[a.fs.length - 1][0] - K;
