// Orchestrates the full simulation pipeline from state -> results.

import type { SimulationState } from '../types/simulation';
import { computeSolarAngles } from './solarGeometry';
import { computeIrradiance, integrateDailyIrradiation } from './irradiance';
import {
  generateIVCurve,
  combineSubstrings,
  createSeriesSubstringParams,
  estimateCellTemperature,
} from './pvModel';
import {
  getObstacleSubstringShade,
  shadingFactorFromPreset,
} from './shading';
import { computeEnergy } from './energy';

export function runSimulation(state: SimulationState) {
  const angles = computeSolarAngles({
    latitude: state.latitude,
    dayOfYear: state.dayOfYear,
    timeOfDay: state.timeOfDay,
    panelTiltDeg: state.panelTiltDeg,
    panelAzimuthDeg: state.panelAzimuthDeg,
  });

  const globalShadingFactor = shadingFactorFromPreset(state.shading);
  const irradiance = computeIrradiance({
    dni: state.dni,
    dhi: state.dhi,
    ghi: state.ghi,
    albedo: state.albedo,
    tiltDeg: state.panelTiltDeg,
    cosIncidence: angles.cosIncidence,
    shadingFactor: globalShadingFactor,
    isDay: angles.isDay,
  });

  const obstacleSubstringShade = getObstacleSubstringShade({
    enabled: state.obstacleEnabled,
    obstaclePos: state.obstaclePos,
    obstacleSize: state.obstacleSize,
    sunVector: angles.sunVector,
    isDay: angles.isDay,
    panelTiltDeg: state.panelTiltDeg,
    panelAzimuthDeg: state.panelAzimuthDeg,
  });
  const effectiveSubstringShade = state.shading.substringShade.map(
    (multiplier, idx) => multiplier * obstacleSubstringShade[idx],
  ) as [number, number, number];
  const averageAreaShade =
    effectiveSubstringShade.reduce((sum, value) => sum + value, 0) / effectiveSubstringShade.length;
  const effectiveIrradiance = {
    ...irradiance,
    beam: irradiance.beam * averageAreaShade,
    diffuse: irradiance.diffuse * averageAreaShade,
    reflected: irradiance.reflected * averageAreaShade,
    total: irradiance.total * averageAreaShade,
    shadingFactor: irradiance.shadingFactor * averageAreaShade,
  };

  const cellTempC =
    state.cellTempMode === 'manual'
      ? state.cellTempC
      : estimateCellTemperature(state.ambientTempC, state.panel.noct, effectiveIrradiance.total);

  const substringPOA = effectiveSubstringShade.map(
    (multiplier) => irradiance.total * multiplier,
  ) as [number, number, number];
  const substringParams = createSeriesSubstringParams(state.panel, 3);
  const substringCurves = substringPOA.map((poa) =>
    generateIVCurve(substringParams, { poaIrradiance: poa, cellTempC }, 60),
  );
  const hasSubstringMismatch = effectiveSubstringShade.some(
    (value, idx, values) => Math.abs(value - values[0]) > 1e-6,
  );

  const moduleCurve =
    state.shading.enabled || hasSubstringMismatch
      ? combineSubstrings(substringCurves, state.bypassDiodeEnabled)
      : generateIVCurve(state.panel, { poaIrradiance: effectiveIrradiance.total, cellTempC }, 80);

  const daily = integrateDailyIrradiation({
    latitude: state.latitude,
    dayOfYear: state.dayOfYear,
    panelTiltDeg: state.panelTiltDeg,
    panelAzimuthDeg: state.panelAzimuthDeg,
    dni: state.dni,
    dhi: state.dhi,
    ghi: state.ghi,
    albedo: state.albedo,
  });

  const energy = computeEnergy(
    moduleCurve.pmax,
    state.panel,
    daily.totalWhPerM2,
    effectiveIrradiance.total,
  );

  return {
    angles,
    irradiance: effectiveIrradiance,
    cellTempC,
    substringCurves,
    moduleCurve,
    daily,
    energy,
  };
}

export type SimulationResult = ReturnType<typeof runSimulation>;
