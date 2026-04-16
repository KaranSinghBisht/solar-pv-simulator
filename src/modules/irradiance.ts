// Irradiance on a tilted plane using the isotropic sky diffuse model.
// Distinguishes instantaneous irradiance (W/m²) from daily irradiation (Wh/m²).

import { DEG, computeSolarAngles } from './solarGeometry';
import type { IrradianceBreakdown } from '../types/simulation';

export interface IrradianceInputs {
  dni: number; // direct normal irradiance (W/m²)
  dhi: number; // diffuse horizontal irradiance (W/m²)
  ghi: number; // global horizontal irradiance (W/m²)
  albedo: number; // ground reflectance (0-1)
  tiltDeg: number;
  cosIncidence: number;
  shadingFactor: number; // 0-1; 1 = no shading
  isDay: boolean;
}

// Beam component on tilted plane.
// POA_beam = DNI * max(0, cos(theta_i)) * shadingFactor
export function getPOABeam(
  dni: number,
  cosIncidence: number,
  shadingFactor: number,
): number {
  return dni * Math.max(0, cosIncidence) * shadingFactor;
}

// Isotropic-sky diffuse irradiance on tilted plane.
// POA_diffuse = DHI * (1 + cos(beta)) / 2
export function getPOADiffuse(dhi: number, tiltDeg: number): number {
  return dhi * (1 + Math.cos(tiltDeg * DEG)) / 2;
}

// Ground-reflected irradiance on tilted plane.
// POA_ground = rho * GHI * (1 - cos(beta)) / 2
export function getPOAGroundReflected(ghi: number, tiltDeg: number, albedo: number): number {
  return albedo * ghi * (1 - Math.cos(tiltDeg * DEG)) / 2;
}

export function computeIrradiance(i: IrradianceInputs): IrradianceBreakdown {
  const shading = i.isDay ? i.shadingFactor : 0;
  const beam = i.isDay ? getPOABeam(i.dni, i.cosIncidence, shading) : 0;
  const diffuse = i.isDay ? getPOADiffuse(i.dhi, i.tiltDeg) * shading : 0;
  const reflected = i.isDay ? getPOAGroundReflected(i.ghi, i.tiltDeg, i.albedo) : 0;
  const total = beam + diffuse + reflected;
  return { beam, diffuse, reflected, total, shadingFactor: shading };
}

export interface DailyInputs {
  latitude: number;
  dayOfYear: number;
  panelTiltDeg: number;
  panelAzimuthDeg: number;
  dni: number;
  dhi: number;
  ghi: number;
  albedo: number;
}

// Integrate POA over a day with a sin(altitude)-based daylight envelope.
// Returns array of hourly samples + total Wh/m².
export function integrateDailyIrradiation(input: DailyInputs, stepHours = 0.5): {
  samples: { hour: number; poa: number }[];
  totalWhPerM2: number;
} {
  const samples: { hour: number; poa: number }[] = [];
  let total = 0;
  for (let t = 0; t <= 24 - 1e-6; t += stepHours) {
    const angles = computeSolarAngles({
      latitude: input.latitude,
      dayOfYear: input.dayOfYear,
      timeOfDay: t,
      panelTiltDeg: input.panelTiltDeg,
      panelAzimuthDeg: input.panelAzimuthDeg,
    });
    // Scale DNI/DHI/GHI by a smooth daylight curve so sunrise/sunset match altitude.
    const altFactor = Math.max(0, Math.sin(angles.altitudeDeg * DEG));
    const dni = input.dni * altFactor;
    const dhi = input.dhi * altFactor;
    const ghi = input.ghi * altFactor;
    const breakdown = computeIrradiance({
      dni,
      dhi,
      ghi,
      albedo: input.albedo,
      tiltDeg: input.panelTiltDeg,
      cosIncidence: angles.cosIncidence,
      shadingFactor: 1,
      isDay: angles.isDay,
    });
    samples.push({ hour: t, poa: breakdown.total });
    total += breakdown.total * stepHours;
  }
  return { samples, totalWhPerM2: total };
}
