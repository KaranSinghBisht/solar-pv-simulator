import { useEffect, useRef, useState } from 'react';
import { useSimStore } from '../state/store';
import type { SimulationResult } from '../modules/simulation';
import { stepPerturbAndObserve, stepIncrementalConductance, findOperatingPoint, type MpptState } from '../modules/mppt';
import IVCurveChart from './IVCurveChart';
import PVCurveChart from './PVCurveChart';

interface Props {
  sim: SimulationResult;
}

export default function MPPTPanel({ sim }: Props) {
  const s = useSimStore();
  const [running, setRunning] = useState(false);
  const mpptRef = useRef<MpptState>({ v: s.mpptOperatingV, prevV: 0, prevP: 0, direction: 1 });
  const [operating, setOperating] = useState<{ v: number; i: number; p: number }>({ v: s.mpptOperatingV, i: 0, p: 0 });
  const [log, setLog] = useState<{ step: number; v: number; p: number }[]>([]);

  // Reset the MPPT starting point when the user disables the algorithm.
  useEffect(() => {
    if (!running) {
      mpptRef.current = { v: s.mpptOperatingV, prevV: 0, prevP: 0, direction: 1 };
    }
  }, [s.mpptOperatingV, running]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const stepper = s.mpptAlgorithm === 'po' ? stepPerturbAndObserve : stepIncrementalConductance;
      const next = stepper(mpptRef.current, sim.moduleCurve, s.mpptStep);
      mpptRef.current = next;
      const pt = findOperatingPoint(sim.moduleCurve, next.v);
      setOperating({ v: pt.v, i: pt.i, p: pt.p });
      s.setMpptOperatingV(next.v);
      setLog((prev) => {
        const arr = prev.slice(-24);
        arr.push({ step: prev.length, v: next.v, p: pt.p });
        return arr;
      });
    }, 240);
    return () => window.clearInterval(id);
  }, [running, s, sim]);

  return (
    <section className="panel mppt-panel">
      <h2>MPPT</h2>
      <div className="mppt-controls">
        <label className="toggle">
          <span>Algorithm</span>
          <select
            value={s.mpptAlgorithm}
            onChange={(e) => s.set('mpptAlgorithm', e.target.value as 'po' | 'inccond')}
          >
            <option value="po">Perturb and Observe</option>
            <option value="inccond">Incremental Conductance</option>
          </select>
        </label>
        <label className="toggle">
          <span>Step size (ΔV)</span>
          <input
            type="number"
            value={s.mpptStep}
            min={0.01}
            max={1}
            step={0.01}
            onChange={(e) => s.set('mpptStep', Number(e.target.value))}
          />
        </label>
        <label className="toggle">
          <span>Starting V</span>
          <input
            type="number"
            value={s.mpptOperatingV}
            min={0}
            max={Math.max(sim.moduleCurve.voc, 1)}
            step={0.1}
            onChange={(e) => s.setMpptOperatingV(Number(e.target.value))}
            disabled={running}
          />
        </label>
        <button className="preset-btn" onClick={() => setRunning((r) => !r)}>
          {running ? 'Stop MPPT' : 'Start MPPT'}
        </button>
        <button className="reset-btn" onClick={() => {
          mpptRef.current = { v: 0.5, prevV: 0, prevP: 0, direction: 1 };
          s.setMpptOperatingV(0.5);
          setLog([]);
        }}>
          Reset tracker
        </button>
      </div>
      <div className="mppt-status">
        <span>V = {operating.v.toFixed(2)} V</span>
        <span>I = {operating.i.toFixed(2)} A</span>
        <span>P = {operating.p.toFixed(2)} W</span>
        <span>Pmax = {sim.moduleCurve.pmax.toFixed(2)} W</span>
      </div>
      <div className="mppt-grid">
        <IVCurveChart curve={sim.moduleCurve} operating={{ v: operating.v, i: operating.i }} title="Tracker on I–V" />
        <PVCurveChart curve={sim.moduleCurve} operating={{ v: operating.v, p: operating.p }} title="Tracker on P–V" />
      </div>
      {log.length > 0 && (
        <div className="mppt-log">
          <strong>Recent steps:</strong>
          <ol>
            {log.slice(-8).map((entry, idx) => (
              <li key={`${entry.step}-${idx}`}>
                V = {entry.v.toFixed(2)} V → P = {entry.p.toFixed(2)} W
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
