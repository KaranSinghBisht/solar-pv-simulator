// PV electrical model — simplified single-diode inspired.
// Solves I(V) explicitly using a practical approximation: combines the ideal
// single-diode equation with temperature & irradiance scaling and series/shunt
// resistance effects. Fast and stable for interactive use.

import type { IVPoint, PVCurveResult, PVModuleParams } from '../types/simulation';

const K_BOLTZ = 1.380649e-23;
const Q_CHARGE = 1.602176634e-19;
const G_REF = 1000; // W/m²

export interface PVConditions {
  poaIrradiance: number; // W/m²
  cellTempC: number;
}

export function createSeriesSubstringParams(
  params: PVModuleParams,
  substrings = 3,
): PVModuleParams {
  const count = Math.max(1, substrings);
  return {
    ...params,
    name: `${params.name} / ${count} substring`,
    vocRef: params.vocRef / count,
    vmpRef: params.vmpRef / count,
    ns: Math.max(1, Math.round(params.ns / count)),
    rs: params.rs / count,
    rsh: params.rsh / count,
    areaM2: params.areaM2 / count,
  };
}

// Thermal voltage for a module with Ns cells in series and ideality factor n.
function thermalVoltage(nIdeality: number, ns: number, tempC: number): number {
  const T = tempC + 273.15;
  return (nIdeality * ns * K_BOLTZ * T) / Q_CHARGE;
}

// Photocurrent scales with irradiance and slightly with temperature.
function photoCurrent(params: PVModuleParams, G: number, tempC: number): number {
  const deltaT = tempC - 25;
  const isc = params.iscRef * (G / G_REF) * (1 + params.alphaIsc * deltaT);
  return isc;
}

// Open-circuit voltage: decreases with temperature and weakly varies with irradiance.
function openCircuitVoltage(params: PVModuleParams, G: number, tempC: number): number {
  const deltaT = tempC - 25;
  const voc0 = params.vocRef + params.betaVoc * params.vocRef * deltaT;
  const gRatio = Math.max(G / G_REF, 1e-3);
  // Ln-based irradiance scaling gives a modest Voc increase with more light.
  const correction = 1 + 0.06 * Math.log(gRatio);
  return Math.max(voc0 * correction, 0.5);
}

// Saturation current derived from Voc and photocurrent consistency.
function saturationCurrent(iph: number, voc: number, vt: number): number {
  if (voc <= 0 || vt <= 0) return 1e-10;
  return iph / (Math.exp(voc / vt) - 1);
}

// Explicit I(V) approximation with series resistance feedback (Lambert-W free).
// Starts with ideal diode I, then corrects once for Rs drop.
export function currentAtVoltage(
  params: PVModuleParams,
  conditions: PVConditions,
  v: number,
): number {
  const G = Math.max(conditions.poaIrradiance, 0);
  if (G <= 0) return 0;
  const iph = photoCurrent(params, G, conditions.cellTempC);
  const voc = openCircuitVoltage(params, G, conditions.cellTempC);
  const vt = thermalVoltage(params.n, params.ns, conditions.cellTempC);
  const i0 = saturationCurrent(iph, voc, vt);

  // Newton iterations on I = Iph - I0*(exp((V+IRs)/Vt) - 1) - (V+IRs)/Rsh
  let I = iph;
  for (let k = 0; k < 8; k++) {
    const vd = v + I * params.rs;
    const expTerm = Math.exp(Math.min(vd / vt, 60));
    const f = iph - i0 * (expTerm - 1) - vd / params.rsh - I;
    const df = -i0 * (params.rs / vt) * expTerm - params.rs / params.rsh - 1;
    const step = f / df;
    I -= step;
    if (Math.abs(step) < 1e-6) break;
  }
  return Math.max(0, Math.min(I, iph));
}

export function generateIVCurve(
  params: PVModuleParams,
  conditions: PVConditions,
  points = 80,
): PVCurveResult {
  const G = Math.max(conditions.poaIrradiance, 0);
  const voc = openCircuitVoltage(params, Math.max(G, 1), conditions.cellTempC);
  const vocUse = G <= 0 ? 0 : voc;
  const iv: IVPoint[] = [];
  let pmax = 0;
  let vmp = 0;
  let imp = 0;
  for (let k = 0; k < points; k++) {
    const v = (vocUse * k) / (points - 1);
    const i = currentAtVoltage(params, conditions, v);
    const p = v * i;
    iv.push({ v, i, p });
    if (p > pmax) {
      pmax = p;
      vmp = v;
      imp = i;
    }
  }
  const isc = iv.length ? iv[0].i : 0;
  const ff = voc > 0 && isc > 0 ? pmax / (voc * isc) : 0;
  return { iv, isc, voc: vocUse, imp, vmp, pmax, fillFactor: ff };
}

// Combine multiple substring curves into a string/module curve.
// Series combination: at each current level, sum voltages.
// Bypass diode: below 0 V (reverse biased) a substring clamps to ~-0.7 V.
export function combineSubstrings(
  curves: PVCurveResult[],
  bypassEnabled: boolean,
  points = 120,
): PVCurveResult {
  if (!curves.length) {
    return { iv: [], isc: 0, voc: 0, imp: 0, vmp: 0, pmax: 0, fillFactor: 0 };
  }
  const iscMin = Math.min(...curves.map((c) => c.isc));
  const iscMax = Math.max(...curves.map((c) => c.isc));
  const currentCeiling = bypassEnabled ? iscMax : iscMin;
  if (currentCeiling <= 0) {
    return { iv: [{ v: 0, i: 0, p: 0 }], isc: 0, voc: 0, imp: 0, vmp: 0, pmax: 0, fillFactor: 0 };
  }
  const iv: IVPoint[] = [];
  let pmax = 0;
  let vmp = 0;
  let imp = 0;
  const stringVoc = curves.reduce((acc, c) => acc + c.voc, 0);
  for (let k = 0; k < points; k++) {
    const frac = k / (points - 1);
    const I = frac * currentCeiling;
    let Vtotal = 0;
    for (const c of curves) {
      // Voltage at current I for this substring; find via linear search over its iv.
      const voltage = voltageAtCurrent(c, I, bypassEnabled);
      Vtotal += voltage;
    }
    Vtotal = Math.max(0, Math.min(Vtotal, stringVoc));
    const P = Vtotal * I;
    iv.push({ v: Vtotal, i: I, p: P });
    if (P > pmax) {
      pmax = P;
      vmp = Vtotal;
      imp = I;
    }
  }
  // Without bypass, the series string short-circuit current is set by the worst substring.
  if (!bypassEnabled) {
    iv.push({ v: 0, i: currentCeiling, p: 0 });
  }
  iv.sort((a, b) => a.v - b.v);
  const voc = iv.length ? iv[iv.length - 1].v : 0;
  const iscCombined = getShortCircuitCurrent(iv, currentCeiling);
  const ff = voc > 0 && iscCombined > 0 ? pmax / (voc * iscCombined) : 0;
  return { iv, isc: iscCombined, voc, imp, vmp, pmax, fillFactor: ff };
}

function voltageAtCurrent(curve: PVCurveResult, I: number, bypassEnabled: boolean): number {
  if (I <= 0) return curve.voc;
  if (I >= curve.isc) {
    return bypassEnabled ? -0.7 : 0;
  }
  // iv stored V-ascending; current decreases with V. Binary search for I.
  const pts = curve.iv;
  for (let k = 0; k < pts.length - 1; k++) {
    if (pts[k].i >= I && pts[k + 1].i <= I) {
      const di = pts[k].i - pts[k + 1].i;
      if (di <= 0) return pts[k].v;
      const t = (pts[k].i - I) / di;
      return pts[k].v + t * (pts[k + 1].v - pts[k].v);
    }
  }
  return pts[0].v;
}

function getShortCircuitCurrent(iv: IVPoint[], fallback: number): number {
  const zeroVoltCurrents = iv.filter((pt) => pt.v <= 1e-6).map((pt) => pt.i);
  return zeroVoltCurrents.length ? Math.max(...zeroVoltCurrents) : fallback;
}

// Cell temperature estimate via NOCT model.
// T_cell = T_amb + ((NOCT - 20) / 800) * POA
export function estimateCellTemperature(
  ambientC: number,
  noctC: number,
  poa: number,
): number {
  return ambientC + ((noctC - 20) / 800) * Math.max(0, poa);
}
