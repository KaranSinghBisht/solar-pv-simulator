// Shading presets and substring irradiance helpers.

import type { ShadingState } from '../types/simulation';
import { DEG } from './solarGeometry';

const PANEL_PIVOT_Y = 1.6;
const PANEL_SURFACE_Y = 0.03;
const SUBSTRING_SAMPLE_X: [number, number, number] = [-0.72, 0, 0.72];
const OBSTACLE_BLOCKED_MULTIPLIER = 0.2;

export const SHADING_PRESET_MULTIPLIERS: Record<
  ShadingState['preset'],
  [number, number, number]
> = {
  none: [1, 1, 1],
  edge: [0.65, 0.88, 1],
  partial: [1, 0.2, 1],
  heavy: [0.2, 0.08, 0.18],
};

export function shadingFactorFromPreset(shading: ShadingState): number {
  if (!shading.enabled) return 1;
  switch (shading.preset) {
    case 'none':
      return 1;
    case 'edge':
      return 0.85;
    case 'partial':
      return 0.6;
    case 'heavy':
      return 0.25;
    default:
      return 1;
  }
}

export function getPresetSubstringShade(
  preset: ShadingState['preset'],
): [number, number, number] {
  return [...SHADING_PRESET_MULTIPLIERS[preset]] as [number, number, number];
}

interface ObstacleShadeInput {
  enabled: boolean;
  obstaclePos: [number, number, number];
  obstacleSize: [number, number, number];
  sunVector: [number, number, number];
  isDay: boolean;
  panelTiltDeg: number;
  panelAzimuthDeg: number;
}

export function getObstacleSubstringShade(input: ObstacleShadeInput): [number, number, number] {
  if (!input.enabled || !input.isDay || input.sunVector[1] <= 0) {
    return [1, 1, 1];
  }

  const boxMin: [number, number, number] = [
    input.obstaclePos[0] - input.obstacleSize[0] / 2,
    input.obstaclePos[1],
    input.obstaclePos[2] - input.obstacleSize[2] / 2,
  ];
  const boxMax: [number, number, number] = [
    input.obstaclePos[0] + input.obstacleSize[0] / 2,
    input.obstaclePos[1] + input.obstacleSize[1],
    input.obstaclePos[2] + input.obstacleSize[2] / 2,
  ];

  return SUBSTRING_SAMPLE_X.map((x) => {
    const origin = panelLocalToWorld(
      [x, PANEL_SURFACE_Y, 0],
      input.panelTiltDeg,
      input.panelAzimuthDeg,
    );
    return rayIntersectsAabb(origin, input.sunVector, boxMin, boxMax)
      ? OBSTACLE_BLOCKED_MULTIPLIER
      : 1;
  }) as [number, number, number];
}

// Split uniform POA into three substrings with the user-configured multipliers.
export function substringIrradiances(poa: number, shading: ShadingState): [number, number, number] {
  const [a, b, c] = shading.substringShade;
  return [poa * a, poa * b, poa * c];
}

export const SHADING_PRESET_LABEL: Record<ShadingState['preset'], string> = {
  none: 'No shading',
  edge: 'Edge shadow',
  partial: 'Partial shade (1 substring)',
  heavy: 'Heavy shade',
};

function panelLocalToWorld(
  local: [number, number, number],
  tiltDeg: number,
  azimuthDeg: number,
): [number, number, number] {
  const az = -azimuthDeg * DEG;
  const tilt = -tiltDeg * DEG;

  const cosAz = Math.cos(az);
  const sinAz = Math.sin(az);
  const x1 = local[0] * cosAz + local[2] * sinAz;
  const y1 = local[1];
  const z1 = -local[0] * sinAz + local[2] * cosAz;

  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const x2 = x1;
  const y2 = y1 * cosTilt - z1 * sinTilt;
  const z2 = y1 * sinTilt + z1 * cosTilt;

  return [x2, y2 + PANEL_PIVOT_Y, z2];
}

function rayIntersectsAabb(
  origin: [number, number, number],
  direction: [number, number, number],
  boxMin: [number, number, number],
  boxMax: [number, number, number],
): boolean {
  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;

  for (let axis = 0; axis < 3; axis++) {
    const dir = direction[axis];
    const from = origin[axis];
    if (Math.abs(dir) < 1e-6) {
      if (from < boxMin[axis] || from > boxMax[axis]) {
        return false;
      }
      continue;
    }

    let t1 = (boxMin[axis] - from) / dir;
    let t2 = (boxMax[axis] - from) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return false;
    }
  }

  return tMax >= Math.max(tMin, 0);
}
