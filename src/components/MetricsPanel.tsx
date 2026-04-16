import type { SimulationResult } from '../modules/simulation';

function Metric(props: { label: string; value: string; unit?: string; tooltip?: string }) {
  return (
    <div className="metric" title={props.tooltip}>
      <div className="metric-label">{props.label}</div>
      <div className="metric-value">
        {props.value}
        {props.unit ? <span className="metric-unit"> {props.unit}</span> : null}
      </div>
    </div>
  );
}

export default function MetricsPanel({ sim }: { sim: SimulationResult }) {
  const a = sim.angles;
  const ir = sim.irradiance;
  const m = sim.moduleCurve;
  const e = sim.energy;
  return (
    <section className="panel metrics-panel">
      <h2>Live metrics</h2>
      <div className="metrics-grid">
        <Metric label="Day" value={a.isDay ? 'Yes' : 'No'} tooltip="Sun above horizon?" />
        <Metric label="Declination δ" value={a.declinationDeg.toFixed(2)} unit="°" tooltip="Earth's tilt w.r.t. sun today." />
        <Metric label="Hour angle ω" value={a.hourAngleDeg.toFixed(1)} unit="°" tooltip="Time from solar noon × 15°/hr." />
        <Metric label="Altitude α" value={a.altitudeDeg.toFixed(2)} unit="°" tooltip="Sun elevation above horizon." />
        <Metric label="Zenith θ_z" value={a.zenithDeg.toFixed(2)} unit="°" tooltip="90° − altitude." />
        <Metric label="Incidence θ_i" value={a.incidenceDeg.toFixed(2)} unit="°" tooltip="Between sun and panel normal." />

        <Metric label="POA total" value={ir.total.toFixed(1)} unit="W/m²" tooltip="Plane-of-array irradiance." />
        <Metric label="Beam" value={ir.beam.toFixed(1)} unit="W/m²" />
        <Metric label="Diffuse" value={ir.diffuse.toFixed(1)} unit="W/m²" />
        <Metric label="Ground reflected" value={ir.reflected.toFixed(1)} unit="W/m²" />
        <Metric label="Shading factor" value={(ir.shadingFactor * 100).toFixed(0)} unit="%" />
        <Metric label="Cell T" value={sim.cellTempC.toFixed(1)} unit="°C" />

        <Metric label="Isc" value={m.isc.toFixed(2)} unit="A" tooltip="Short-circuit current at V = 0." />
        <Metric label="Voc" value={m.voc.toFixed(2)} unit="V" tooltip="Open-circuit voltage at I = 0." />
        <Metric label="Imp" value={m.imp.toFixed(2)} unit="A" tooltip="Current at maximum power." />
        <Metric label="Vmp" value={m.vmp.toFixed(2)} unit="V" tooltip="Voltage at maximum power." />
        <Metric label="Pmax" value={m.pmax.toFixed(2)} unit="W" />
        <Metric label="Fill factor" value={m.fillFactor.toFixed(3)} tooltip="FF = (Vmp·Imp)/(Voc·Isc)" />

        <Metric label="Efficiency" value={(e.efficiency * 100).toFixed(1)} unit="%" />
        <Metric label="Daily irradiation" value={(e.dailyIrradiationWhM2 / 1000).toFixed(2)} unit="kWh/m²" />
        <Metric label="Daily energy" value={(e.dailyEnergyWh / 1000).toFixed(2)} unit="kWh" />
      </div>
    </section>
  );
}
