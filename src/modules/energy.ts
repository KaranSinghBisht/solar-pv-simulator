// Energy and efficiency helpers.

import type { PVModuleParams, EnergySummary } from '../types/simulation';

export function computeEnergy(
  pmax: number,
  panel: PVModuleParams,
  dailyIrradiationWhM2: number,
  poa: number,
): EnergySummary {
  const instantPowerW = pmax;
  const efficiency =
    poa > 0 && panel.areaM2 > 0 ? instantPowerW / (poa * panel.areaM2) : 0;
  const dailyEnergyWh = dailyIrradiationWhM2 * panel.areaM2 * (efficiency || panel.etaRef);
  return {
    instantPowerW,
    dailyIrradiationWhM2,
    dailyEnergyWh,
    efficiency,
  };
}
