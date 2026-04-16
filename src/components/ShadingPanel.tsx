import { useMemo } from 'react';
import { useSimStore } from '../state/store';
import { runSimulation } from '../modules/simulation';
import { combineSubstrings } from '../modules/pvModel';
import IVCurveChart from './IVCurveChart';
import PVCurveChart from './PVCurveChart';

export default function ShadingPanel() {
  const s = useSimStore();
  const sim = useMemo(() => runSimulation(s), [s]);
  // Compare bypass on/off for the current shading configuration.
  const withBypass = combineSubstrings(sim.substringCurves, true);
  const withoutBypass = combineSubstrings(sim.substringCurves, false);

  return (
    <section className="panel shading-panel">
      <h2>Shading & bypass diode comparison</h2>
      <p className="theory-p">
        Each substring gets its own effective irradiance (see the control panel sliders).
        With a <strong>bypass diode</strong>, a strongly shaded substring is allowed to be
        short-circuited at about −0.7 V, so the remaining substrings keep delivering current.
        Without bypass, the string current is capped by the worst-shaded substring.
      </p>
      <div className="mppt-status">
        <span>Bypass ON — Pmax = {withBypass.pmax.toFixed(2)} W</span>
        <span>Bypass OFF — Pmax = {withoutBypass.pmax.toFixed(2)} W</span>
        <span>Active model: {s.bypassDiodeEnabled ? 'Bypass ON' : 'Bypass OFF'}</span>
      </div>
      <div className="mppt-grid">
        <IVCurveChart curve={s.bypassDiodeEnabled ? withBypass : withoutBypass} title="Active string I–V" />
        <PVCurveChart curve={s.bypassDiodeEnabled ? withBypass : withoutBypass} title="Active string P–V" />
      </div>
      <div className="substring-summary">
        <h3>Substring breakdown</h3>
        <ul>
          {sim.substringCurves.map((c, idx) => (
            <li key={idx}>
              Substring {idx + 1}: Isc = {c.isc.toFixed(2)} A, Voc = {c.voc.toFixed(2)} V,
              Pmax = {c.pmax.toFixed(2)} W
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
