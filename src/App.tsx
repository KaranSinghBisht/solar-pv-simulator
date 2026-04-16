import { useMemo, useState } from 'react';
import ControlPanel from './components/ControlPanel';
import Scene3D from './components/Scene3D';
import WorldView from './components/WorldView';
import CampusTerrainView from './components/CampusTerrainView';
import NITTrichyCampus from './components/NITTrichyCampus';
import MetricsPanel from './components/MetricsPanel';
import IVCurveChart from './components/IVCurveChart';
import PVCurveChart from './components/PVCurveChart';
import DailyIrradianceChart from './components/DailyIrradianceChart';
import MPPTPanel from './components/MPPTPanel';
import ShadingPanel from './components/ShadingPanel';
import TheoryPanel from './components/TheoryPanel';
import { useSimStore } from './state/store';
import { runSimulation } from './modules/simulation';

type Tab = 'world' | 'nit' | 'terrain' | 'scene' | 'pv' | 'shading' | 'mppt' | 'theory';

const TABS: { key: Tab; label: string }[] = [
  { key: 'world', label: 'World' },
  { key: 'nit', label: 'NIT Trichy' },
  { key: 'terrain', label: 'Campus Terrain' },
  { key: 'scene', label: 'Panel Scene' },
  { key: 'pv', label: 'PV Characteristics' },
  { key: 'shading', label: 'Shading & Diodes' },
  { key: 'mppt', label: 'MPPT' },
  { key: 'theory', label: 'Theory & Equations' },
];

export default function App() {
  const state = useSimStore();
  const sim = useMemo(() => runSimulation(state), [state]);
  const [tab, setTab] = useState<Tab>('scene');
  const isWideTab = tab === 'world' || tab === 'terrain' || tab === 'nit';
  const operatingI = state.mpptEnabled ? undefined : { v: sim.moduleCurve.vmp, i: sim.moduleCurve.imp };
  const operatingP = state.mpptEnabled ? undefined : { v: sim.moduleCurve.vmp, p: sim.moduleCurve.pmax };

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1>Interactive 3D Solar PV Simulator</h1>
          <p className="app-subtitle">
            Course-aligned tool for irradiance estimation, PV characteristics, shading & MPPT.
          </p>
        </div>
        <nav className="tab-nav">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? 'tab-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className={`app-main ${isWideTab ? 'app-main-world' : ''}`}>
        {isWideTab ? (
          <section className="app-canvas app-canvas-world">
            {tab === 'world' && <WorldView />}
            {tab === 'nit' && <NITTrichyCampus />}
            {tab === 'terrain' && <CampusTerrainView />}
          </section>
        ) : (
          <>
            <ControlPanel />
            <section className="app-canvas">
              {tab === 'scene' && (
                <div className="scene-layout">
                  <div className="scene-box">
                    <Scene3D />
                    <div className="scene-overlay">
                      <div>Incidence θ<sub>i</sub>: {sim.angles.incidenceDeg.toFixed(1)}°</div>
                      <div>POA: {sim.irradiance.total.toFixed(0)} W/m²</div>
                      <div>Pmax: {sim.moduleCurve.pmax.toFixed(1)} W</div>
                    </div>
                  </div>
                  <DailyIrradianceChart samples={sim.daily.samples} currentHour={state.timeOfDay} />
                </div>
              )}

              {tab === 'pv' && (
                <div className="chart-layout">
                  <IVCurveChart curve={sim.moduleCurve} operating={operatingI} />
                  <PVCurveChart curve={sim.moduleCurve} operating={operatingP} />
                </div>
              )}

              {tab === 'shading' && <ShadingPanel />}
              {tab === 'mppt' && <MPPTPanel sim={sim} />}
              {tab === 'theory' && <TheoryPanel />}
            </section>
            <MetricsPanel sim={sim} />
          </>
        )}
      </main>

      <footer className="app-footer">
        Educational simulator · isotropic-sky diffuse model · simplified single-diode PV model
      </footer>
    </div>
  );
}
