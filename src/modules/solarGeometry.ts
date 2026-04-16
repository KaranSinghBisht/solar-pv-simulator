// Solar geometry: sun position, panel normal, incidence angle.
// All angles treated as degrees at the public API boundary; radians internally.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (x: number, a: number, b: number): number =>
  Math.min(Math.max(x, a), b);

// Declination angle (degrees). Cooper approximation.
// delta = 23.45 * sin( 360 * (284 + n) / 365 )
export function getDeclination(dayOfYear: number): number {
  const angle = (360 * (284 + dayOfYear)) / 365;
  return 23.45 * Math.sin(angle * DEG);
}

// Hour angle (degrees). 15° per hour from solar noon.
// omega = 15 * (solarTime - 12)
export function getHourAngle(solarTimeHours: number): number {
  return 15 * (solarTimeHours - 12);
}

// Solar zenith angle (degrees).
// cos(theta_z) = sin(phi)sin(delta) + cos(phi)cos(delta)cos(omega)
export function getZenith(latDeg: number, declDeg: number, hourDeg: number): number {
  const phi = latDeg * DEG;
  const d = declDeg * DEG;
  const h = hourDeg * DEG;
  const cos = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h);
  return Math.acos(clamp(cos, -1, 1)) * RAD;
}

// Solar altitude angle (degrees): 90 - zenith.
export function getAltitude(zenithDeg: number): number {
  return 90 - zenithDeg;
}

// Solar azimuth (degrees). 0° = south, positive west in northern hemisphere convention.
// Uses arctan2 variant for numerical stability.
export function getSolarAzimuth(
  latDeg: number,
  declDeg: number,
  hourDeg: number,
  zenithDeg: number,
): number {
  const phi = latDeg * DEG;
  const d = declDeg * DEG;
  const z = zenithDeg * DEG;
  const sinZ = Math.sin(z);
  if (sinZ < 1e-6) return 0;
  const cosA = (Math.sin(phi) * Math.cos(z) - Math.sin(d)) / (Math.cos(phi) * sinZ);
  const azMag = Math.acos(clamp(cosA, -1, 1)) * RAD;
  return hourDeg >= 0 ? azMag : -azMag;
}

// Sun direction vector in ENU-style coordinates (x = east, y = up, z = south).
// We use y-up because Three.js conventions are y-up.
export function getSunVector(altDeg: number, azDeg: number): [number, number, number] {
  const a = altDeg * DEG;
  const g = azDeg * DEG;
  const cosAlt = Math.cos(a);
  const x = cosAlt * Math.sin(g); // east component
  const y = Math.sin(a); // up
  const z = cosAlt * Math.cos(g); // south; +z toward south when azimuth = 0
  return [x, y, z];
}

// Panel normal vector in same frame. Tilt from horizontal; azimuth: 0 = south-facing.
export function getPanelNormal(tiltDeg: number, azDeg: number): [number, number, number] {
  const b = tiltDeg * DEG;
  const g = azDeg * DEG;
  const sinB = Math.sin(b);
  const cosB = Math.cos(b);
  return [sinB * Math.sin(g), cosB, sinB * Math.cos(g)];
}

// Incidence angle from dot product of sun and panel normal (both unit vectors).
export function getIncidenceFromVectors(
  sun: [number, number, number],
  normal: [number, number, number],
): { incidenceDeg: number; cosIncidence: number } {
  const dot = sun[0] * normal[0] + sun[1] * normal[1] + sun[2] * normal[2];
  const cosInc = clamp(dot, -1, 1);
  return { incidenceDeg: Math.acos(cosInc) * RAD, cosIncidence: cosInc };
}

export interface SolarInputs {
  latitude: number;
  dayOfYear: number;
  timeOfDay: number;
  panelTiltDeg: number;
  panelAzimuthDeg: number;
}

export interface SolarAnglesOut {
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

export function computeSolarAngles(input: SolarInputs): SolarAnglesOut {
  const declinationDeg = getDeclination(input.dayOfYear);
  const hourAngleDeg = getHourAngle(input.timeOfDay);
  const zenithDeg = getZenith(input.latitude, declinationDeg, hourAngleDeg);
  const altitudeDeg = getAltitude(zenithDeg);
  const azimuthDeg = getSolarAzimuth(input.latitude, declinationDeg, hourAngleDeg, zenithDeg);
  const isDay = altitudeDeg > 0;
  const sunVector = getSunVector(Math.max(altitudeDeg, 0), azimuthDeg);
  const panelNormal = getPanelNormal(input.panelTiltDeg, input.panelAzimuthDeg);
  const { incidenceDeg, cosIncidence } = getIncidenceFromVectors(sunVector, panelNormal);
  return {
    declinationDeg,
    hourAngleDeg,
    zenithDeg,
    altitudeDeg,
    azimuthDeg,
    incidenceDeg,
    cosIncidence: isDay ? cosIncidence : 0,
    sunVector,
    panelNormal,
    isDay,
  };
}
