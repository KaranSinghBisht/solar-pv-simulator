// Minimal MPPT algorithms operating on a precomputed module I-V curve.
// Treats V as the decision variable and advances toward the maximum power point.

import type { PVCurveResult } from '../types/simulation';

export interface MpptState {
  v: number;
  prevV: number;
  prevP: number;
  direction: 1 | -1;
}

const EPS = 1e-6;

// Perturb and Observe: step V in the direction that increased power last time.
export function stepPerturbAndObserve(
  state: MpptState,
  curve: PVCurveResult,
  step: number,
): MpptState {
  const point = interpolateCurveAtVoltage(curve, state.v);
  const p = point.p;
  let direction = state.direction;
  if (state.prevV !== state.v) {
    const dP = p - state.prevP;
    const dV = state.v - state.prevV;
    direction = dP * dV >= 0 ? direction : (direction === 1 ? -1 : 1);
  }
  const nextV = clampVoltage(state.v + direction * step, curve.voc);
  return { v: nextV, prevV: state.v, prevP: p, direction };
}

// Incremental Conductance: uses dI/dV vs -I/V to know optimum direction.
export function stepIncrementalConductance(
  state: MpptState,
  curve: PVCurveResult,
  step: number,
): MpptState {
  const vNow = state.v;
  const point = interpolateCurveAtVoltage(curve, vNow);
  const probeV = clampVoltage(vNow + Math.max(step * 0.25, 1e-3), curve.voc);
  const probe = interpolateCurveAtVoltage(curve, probeV);
  const dI = probe.i - point.i;
  const dV = Math.max(probe.v - point.v, EPS);
  const cond = point.i / Math.max(point.v, EPS);
  const incCond = dI / dV;
  const slope = incCond + cond;
  let direction: 1 | -1 = state.direction;
  if (Math.abs(slope) > 1e-4) {
    direction = slope > 0 ? 1 : -1;
  }
  const nextV = clampVoltage(vNow + direction * step, curve.voc);
  return { v: nextV, prevV: vNow, prevP: point.p, direction };
}

// Locate max-power operating point on a precomputed curve (lookup for visualization).
export function findOperatingPoint(curve: PVCurveResult, targetV: number) {
  return interpolateCurveAtVoltage(curve, targetV);
}

function interpolateCurveAtVoltage(curve: PVCurveResult, targetV: number) {
  if (!curve.iv.length) return { v: 0, i: 0, p: 0 };
  if (targetV <= curve.iv[0].v) return curve.iv[0];
  if (targetV >= curve.iv[curve.iv.length - 1].v) return curve.iv[curve.iv.length - 1];

  for (let k = 0; k < curve.iv.length - 1; k++) {
    const a = curve.iv[k];
    const b = curve.iv[k + 1];
    if (targetV >= a.v && targetV <= b.v) {
      const span = Math.max(b.v - a.v, EPS);
      const t = (targetV - a.v) / span;
      const i = a.i + t * (b.i - a.i);
      const p = targetV * i;
      return { v: targetV, i, p };
    }
  }

  return curve.iv[curve.iv.length - 1];
}

function clampVoltage(v: number, voc: number) {
  const upper = Math.max(voc * 0.98, 0.05);
  return Math.min(Math.max(v, 0.05), upper);
}
