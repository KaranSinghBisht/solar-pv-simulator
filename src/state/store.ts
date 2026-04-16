import { create } from 'zustand';
import type { Preset, SimulationState, ShadingState } from '../types/simulation';
import { INITIAL_STATE, PRESET_DEFS } from '../data/presets';
import { getPresetSubstringShade } from '../modules/shading';

interface Store extends SimulationState {
  set<K extends keyof SimulationState>(key: K, value: SimulationState[K]): void;
  patch(partial: Partial<SimulationState>): void;
  applyPreset(preset: Preset): void;
  updateShading(next: Partial<ShadingState>): void;
  setSubstringShade(idx: 0 | 1 | 2, value: number): void;
  setMpptOperatingV(v: number): void;
  reset(): void;
}

export const useSimStore = create<Store>((setState) => ({
  ...INITIAL_STATE,
  set: (key, value) => setState({ [key]: value } as Partial<SimulationState>),
  patch: (partial) => setState(partial),
  applyPreset: (preset) => {
    const def = PRESET_DEFS[preset];
    if (!def) return;
    setState((prev) => ({ ...prev, ...def.patch }));
  },
  updateShading: (next) =>
    setState((prev) => {
      const derivedSubstringShade =
        next.preset && !next.substringShade ? getPresetSubstringShade(next.preset) : undefined;
      return {
        shading: {
          ...prev.shading,
          ...next,
          ...(derivedSubstringShade ? { substringShade: derivedSubstringShade } : {}),
        },
      };
    }),
  setSubstringShade: (idx, value) =>
    setState((prev) => {
      const arr: [number, number, number] = [...prev.shading.substringShade];
      arr[idx] = value;
      return { shading: { ...prev.shading, substringShade: arr, enabled: true } };
    }),
  setMpptOperatingV: (v) => setState({ mpptOperatingV: v }),
  reset: () => setState({ ...INITIAL_STATE }),
}));
