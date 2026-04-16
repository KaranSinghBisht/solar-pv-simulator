import type { Preset, SimulationState } from '../types/simulation';
import { DEFAULT_MODULE } from './modules';

type PresetPatch = Partial<SimulationState> & { shading?: SimulationState['shading'] };

export const PRESET_DEFS: Record<Preset, { label: string; description: string; patch: PresetPatch }> = {
  stc: {
    label: 'Standard Test Conditions',
    description: 'G = 1000 W/m², T_cell = 25 °C, no shading.',
    patch: {
      dni: 900,
      dhi: 100,
      ghi: 1000,
      ambientTempC: 25,
      cellTempMode: 'manual',
      cellTempC: 25,
      shading: { enabled: false, preset: 'none', substringShade: [1, 1, 1] },
    },
  },
  hotDay: {
    label: 'Hot Summer Day',
    description: 'High ambient temperature — observe Voc drop.',
    patch: {
      dni: 850,
      dhi: 120,
      ghi: 900,
      ambientTempC: 38,
      cellTempMode: 'estimated',
      shading: { enabled: false, preset: 'none', substringShade: [1, 1, 1] },
    },
  },
  cloudy: {
    label: 'Cloudy / Diffuse Day',
    description: 'Low DNI, diffuse-dominated sky.',
    patch: {
      dni: 200,
      dhi: 350,
      ghi: 500,
      ambientTempC: 22,
      cellTempMode: 'estimated',
      shading: { enabled: false, preset: 'none', substringShade: [1, 1, 1] },
    },
  },
  partialShade: {
    label: 'Partial Shading',
    description: 'One substring shaded — compare bypass diode on/off.',
    patch: {
      dni: 850,
      dhi: 120,
      ghi: 950,
      ambientTempC: 28,
      cellTempMode: 'estimated',
      shading: { enabled: true, preset: 'partial', substringShade: [1, 0.2, 1] },
    },
  },
  sunrise: {
    label: 'Sunrise / Oblique Incidence',
    description: 'Low sun altitude — large incidence angle losses.',
    patch: {
      timeOfDay: 6.5,
      dni: 500,
      dhi: 80,
      ghi: 250,
      ambientTempC: 18,
      cellTempMode: 'estimated',
      shading: { enabled: false, preset: 'none', substringShade: [1, 1, 1] },
    },
  },
};

export const INITIAL_STATE: SimulationState = {
  latitude: 28.6,
  longitude: 77.2,
  locationLabel: 'New Delhi, India',
  dayOfYear: 172,
  timeOfDay: 12,
  panelTiltDeg: 28,
  panelAzimuthDeg: 0,
  ambientTempC: 25,
  cellTempMode: 'manual',
  cellTempC: 25,
  dni: 900,
  dhi: 100,
  ghi: 1000,
  albedo: 0.2,
  shading: { enabled: false, preset: 'none', substringShade: [1, 1, 1] },
  bypassDiodeEnabled: true,
  mpptEnabled: false,
  mpptAlgorithm: 'po',
  mpptStep: 0.15,
  mpptOperatingV: 14,
  panel: DEFAULT_MODULE,
  showPanelNormal: true,
  showSunRay: true,
  obstacleEnabled: false,
  obstaclePos: [2.2, 0, -1.0],
  obstacleSize: [0.4, 2.0, 0.4],
};
