export interface PVModuleParams {
  name: string;
  iscRef: number;
  vocRef: number;
  impRef: number;
  vmpRef: number;
  ns: number;
  np: number;
  alphaIsc: number;
  betaVoc: number;
  gammaPmax: number;
  n: number;
  rs: number;
  rsh: number;
  areaM2: number;
  noct: number;
  etaRef: number;
}

export interface ShadingState {
  enabled: boolean;
  preset: 'none' | 'edge' | 'partial' | 'heavy';
  substringShade: [number, number, number];
}

export type MpptAlgorithm = 'po' | 'inccond';

export type CellTempMode = 'manual' | 'estimated';

export interface SimulationState {
  latitude: number;
  longitude: number;
  locationLabel: string;
  dayOfYear: number;
  timeOfDay: number;
  panelTiltDeg: number;
  panelAzimuthDeg: number;
  ambientTempC: number;
  cellTempMode: CellTempMode;
  cellTempC: number;
  dni: number;
  dhi: number;
  ghi: number;
  albedo: number;
  shading: ShadingState;
  bypassDiodeEnabled: boolean;
  mpptEnabled: boolean;
  mpptAlgorithm: MpptAlgorithm;
  mpptStep: number;
  mpptOperatingV: number;
  panel: PVModuleParams;
  showPanelNormal: boolean;
  showSunRay: boolean;
  obstacleEnabled: boolean;
  obstaclePos: [number, number, number];
  obstacleSize: [number, number, number];
}

export interface SolarAngles {
  declinationDeg: number;
  hourAngleDeg: number;
  zenithDeg: number;
  altitudeDeg: number;
  azimuthDeg: number;
  incidenceDeg: number;
  cosIncidence: number;
  sunVector: [number, number, number];
  panelNormal: [number, number, number];
  isDay: boolean;
}

export interface IrradianceBreakdown {
  beam: number;
  diffuse: number;
  reflected: number;
  total: number;
  shadingFactor: number;
}

export interface IVPoint {
  v: number;
  i: number;
  p: number;
}

export interface PVCurveResult {
  iv: IVPoint[];
  isc: number;
  voc: number;
  imp: number;
  vmp: number;
  pmax: number;
  fillFactor: number;
}

export interface EnergySummary {
  instantPowerW: number;
  dailyIrradiationWhM2: number;
  dailyEnergyWh: number;
  efficiency: number;
}

export type Preset = 'stc' | 'hotDay' | 'cloudy' | 'partialShade' | 'sunrise';
