import { useSimStore } from '../state/store';
import { PRESET_DEFS } from '../data/presets';
import { MODULE_PRESETS } from '../data/modules';
import type { Preset } from '../types/simulation';

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step, unit, onChange } = props;
  return (
    <label className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <span className="slider-val">
          {value.toFixed(step < 1 ? 2 : 0)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function dateFromDayOfYear(day: number): string {
  const d = new Date(Date.UTC(2025, 0, 1));
  d.setUTCDate(day);
  return d.toISOString().slice(5, 10);
}

export default function ControlPanel() {
  const s = useSimStore();

  return (
    <aside className="panel control-panel">
      <h2>Controls</h2>

      <section>
        <h3>Presets</h3>
        <div className="preset-grid">
          {(Object.keys(PRESET_DEFS) as Preset[]).map((k) => (
            <button
              key={k}
              className="preset-btn"
              onClick={() => s.applyPreset(k)}
              title={PRESET_DEFS[k].description}
            >
              {PRESET_DEFS[k].label}
            </button>
          ))}
        </div>
        <button className="reset-btn" onClick={() => s.reset()}>
          Reset all
        </button>
      </section>

      <section>
        <h3>Time & location</h3>
        <Slider
          label="Latitude"
          value={s.latitude}
          min={-66}
          max={66}
          step={0.5}
          unit="°"
          onChange={(v) => s.set('latitude', v)}
        />
        <Slider
          label={`Day of year (${dateFromDayOfYear(s.dayOfYear)})`}
          value={s.dayOfYear}
          min={1}
          max={365}
          step={1}
          onChange={(v) => s.set('dayOfYear', v)}
        />
        <Slider
          label="Solar time"
          value={s.timeOfDay}
          min={0}
          max={24}
          step={0.25}
          unit="h"
          onChange={(v) => s.set('timeOfDay', v)}
        />
      </section>

      <section>
        <h3>Panel orientation</h3>
        <Slider
          label="Tilt (β)"
          value={s.panelTiltDeg}
          min={0}
          max={90}
          step={1}
          unit="°"
          onChange={(v) => s.set('panelTiltDeg', v)}
        />
        <Slider
          label="Azimuth (γ, 0 = south)"
          value={s.panelAzimuthDeg}
          min={-180}
          max={180}
          step={1}
          unit="°"
          onChange={(v) => s.set('panelAzimuthDeg', v)}
        />
      </section>

      <section>
        <h3>Irradiance inputs</h3>
        <Slider label="DNI" value={s.dni} min={0} max={1100} step={10} unit="W/m²" onChange={(v) => s.set('dni', v)} />
        <Slider label="DHI" value={s.dhi} min={0} max={500} step={10} unit="W/m²" onChange={(v) => s.set('dhi', v)} />
        <Slider label="GHI" value={s.ghi} min={0} max={1200} step={10} unit="W/m²" onChange={(v) => s.set('ghi', v)} />
        <Slider label="Albedo (ρ)" value={s.albedo} min={0} max={0.9} step={0.01} onChange={(v) => s.set('albedo', v)} />
      </section>

      <section>
        <h3>Temperature</h3>
        <label className="toggle">
          <span>Cell temp mode</span>
          <select
            value={s.cellTempMode}
            onChange={(e) => s.set('cellTempMode', e.target.value as 'manual' | 'estimated')}
          >
            <option value="manual">Manual</option>
            <option value="estimated">NOCT estimate</option>
          </select>
        </label>
        <Slider
          label="Ambient T"
          value={s.ambientTempC}
          min={-10}
          max={50}
          step={1}
          unit="°C"
          onChange={(v) => s.set('ambientTempC', v)}
        />
        {s.cellTempMode === 'manual' && (
          <Slider
            label="Cell T"
            value={s.cellTempC}
            min={-10}
            max={85}
            step={1}
            unit="°C"
            onChange={(v) => s.set('cellTempC', v)}
          />
        )}
      </section>

      <section>
        <h3>Module</h3>
        <label className="toggle">
          <span>Preset</span>
          <select
            value={s.panel.name}
            onChange={(e) => {
              const next = MODULE_PRESETS.find((m) => m.name === e.target.value);
              if (next) s.set('panel', next);
            }}
          >
            {MODULE_PRESETS.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h3>Shading & diodes</h3>
        <label className="toggle">
          <span>Shading enabled</span>
          <input
            type="checkbox"
            checked={s.shading.enabled}
            onChange={(e) => s.updateShading({ enabled: e.target.checked })}
          />
        </label>
        <label className="toggle">
          <span>Shading preset</span>
          <select
            value={s.shading.preset}
            onChange={(e) =>
              s.updateShading({ preset: e.target.value as 'none' | 'edge' | 'partial' | 'heavy' })
            }
            disabled={!s.shading.enabled}
          >
            <option value="none">None</option>
            <option value="edge">Edge</option>
            <option value="partial">Partial (1 substring)</option>
            <option value="heavy">Heavy</option>
          </select>
        </label>
        {s.shading.enabled && (
          <div className="substring-block">
            <div className="substring-head">Substring irradiance multipliers</div>
            {[0, 1, 2].map((idx) => (
              <Slider
                key={idx}
                label={`Substring ${idx + 1}`}
                value={s.shading.substringShade[idx as 0 | 1 | 2]}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => s.setSubstringShade(idx as 0 | 1 | 2, v)}
              />
            ))}
          </div>
        )}
        <label className="toggle">
          <span>Bypass diode</span>
          <input
            type="checkbox"
            checked={s.bypassDiodeEnabled}
            onChange={(e) => s.set('bypassDiodeEnabled', e.target.checked)}
          />
        </label>
      </section>

      <section>
        <h3>Scene helpers</h3>
        <label className="toggle">
          <span>Obstacle</span>
          <input
            type="checkbox"
            checked={s.obstacleEnabled}
            onChange={(e) => s.set('obstacleEnabled', e.target.checked)}
          />
        </label>
        {s.obstacleEnabled && (
          <div className="substring-block">
            <div className="substring-head">Obstacle placement</div>
            <Slider
              label="East-West position"
              value={s.obstaclePos[0]}
              min={-5}
              max={5}
              step={0.1}
              unit="m"
              onChange={(v) => s.set('obstaclePos', [v, s.obstaclePos[1], s.obstaclePos[2]])}
            />
            <Slider
              label="South-North position"
              value={s.obstaclePos[2]}
              min={-5}
              max={5}
              step={0.1}
              unit="m"
              onChange={(v) => s.set('obstaclePos', [s.obstaclePos[0], s.obstaclePos[1], v])}
            />
            <Slider
              label="Obstacle height"
              value={s.obstacleSize[1]}
              min={0.5}
              max={4}
              step={0.1}
              unit="m"
              onChange={(v) => s.set('obstacleSize', [s.obstacleSize[0], v, s.obstacleSize[2]])}
            />
            <Slider
              label="Obstacle width"
              value={s.obstacleSize[0]}
              min={0.2}
              max={2}
              step={0.1}
              unit="m"
              onChange={(v) => s.set('obstacleSize', [v, s.obstacleSize[1], s.obstacleSize[2]])}
            />
          </div>
        )}
        <label className="toggle">
          <span>Show panel normal</span>
          <input
            type="checkbox"
            checked={s.showPanelNormal}
            onChange={(e) => s.set('showPanelNormal', e.target.checked)}
          />
        </label>
        <label className="toggle">
          <span>Show sun ray</span>
          <input
            type="checkbox"
            checked={s.showSunRay}
            onChange={(e) => s.set('showSunRay', e.target.checked)}
          />
        </label>
      </section>
    </aside>
  );
}
