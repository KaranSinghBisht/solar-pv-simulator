# Interactive 3D Solar PV System Simulator

Course-aligned educational web simulator for **Irradiance Estimation and Performance Analysis**
of a solar photovoltaic module. The app combines a live 3D solar scene with the full PV
pipeline — solar geometry, irradiance on a tilted surface, single-diode-inspired I–V / P–V
curves, partial shading with bypass-diode comparison, and an animated MPPT tracker.

Built with **Vite + React + TypeScript + Three.js + Recharts + Zustand**.

---

## Quick start

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production bundle in dist/
npm run preview    # preview the production build
```

Node 18+ is recommended. All computation is local in the browser — no backend required.

---

## Features

### 3D Solar Scene (`src/components/Scene3D.tsx`)
- Sun direction from date/time/latitude
- Tilt + azimuth controls rotate the panel in real time
- Optional obstacle with cast shadow
- Shadow map, ground grid, panel normal arrow, sun ray arrow
- Panel surface color tracks plane-of-array irradiance

### Solar Geometry (`src/modules/solarGeometry.ts`)
- Declination, hour angle, zenith, altitude, azimuth
- Unit sun-vector + unit panel-normal
- Incidence angle from the dot product (clean vector math)

### Irradiance (`src/modules/irradiance.ts`)
- Beam: `DNI · max(0, cos θ_i) · SF`
- Diffuse (isotropic sky): `DHI · (1 + cos β) / 2`
- Ground-reflected: `ρ · GHI · (1 − cos β) / 2`
- Daily profile integrated every 0.5 h (Wh/m²)

### PV Electrical Model (`src/modules/pvModel.ts`)
- Single-diode inspired explicit I(V) with Newton correction for Rs
- Temperature & irradiance coefficients for Isc and Voc
- Series combination of 3 substrings for shaded module
- Bypass diode model clamps reverse-biased substrings at −0.7 V

### MPPT (`src/modules/mppt.ts`)
- Perturb & Observe
- Incremental Conductance
- Live operating-point dot on the I–V and P–V plots

### Shading & Diodes (`src/components/ShadingPanel.tsx`)
- Per-substring irradiance multipliers
- Side-by-side bypass ON vs bypass OFF power comparison

### Theory panel
- Collapsible formula sheet: solar geometry, isotropic POA, single-diode, NOCT,
  bypass/blocking diodes, MPPT algorithms, daily energy.

### Presets
- **STC** — G = 1000 W/m², T = 25 °C
- **Hot summer day** — high ambient, estimated cell temp (NOCT)
- **Cloudy / diffuse** — low DNI, diffuse-dominant
- **Partial shading** — one substring darkened (try bypass ON vs OFF)
- **Sunrise / oblique** — large incidence angle

---

## Architecture

```
src/
  App.tsx                 # tabbed layout + composition
  main.tsx                # React entry point
  state/store.ts          # Zustand simulation store
  types/simulation.ts     # shared TypeScript types
  data/
    modules.ts            # PV module parameter presets
    presets.ts            # scenario presets + initial state
  modules/
    solarGeometry.ts      # sun position + incidence
    irradiance.ts         # POA irradiance + daily integral
    pvModel.ts            # single-diode inspired I-V solver, substring combination
    shading.ts            # shading presets + substring multipliers
    mppt.ts               # P&O + IncCond algorithms
    energy.ts             # efficiency + daily energy
    simulation.ts         # pipeline: state -> full result
  components/
    Scene3D.tsx           # Three.js sun/panel/shadow scene
    ControlPanel.tsx      # left sidebar (sliders + selects)
    MetricsPanel.tsx      # right sidebar (live numbers)
    IVCurveChart.tsx      # I vs V with MPP + operating dot
    PVCurveChart.tsx      # P vs V with MPP + operating dot
    DailyIrradianceChart.tsx
    MPPTPanel.tsx         # animated tracker + live log
    ShadingPanel.tsx      # bypass-on vs bypass-off comparison
    TheoryPanel.tsx       # collapsible formula sheet
  styles/index.css        # dark scientific theme
```

Central state lives in a single Zustand store; every component derives the full simulation
result via `runSimulation(state)` (pure function). This keeps the model deterministic and
easy to test.

---

## Key assumptions & simplifications

- Isotropic diffuse sky model (no Perez/Hay-Davies yet)
- Three logical substrings per module with independent irradiance
- Bypass diode clamps reverse voltage at approximately −0.7 V
- NOCT-based cell temperature: `T_cell = T_amb + (NOCT − 20)/800 · POA`
- Daylight envelope for the 24-hour POA profile uses `sin(altitude)` as a simple scale
- Azimuth convention: 0° = south; positive west in the northern hemisphere

These are standard educational approximations — good enough to show the right trends,
light enough to run smoothly on a laptop, and clearly documented in source.

---

## Course alignment

| Syllabus topic                         | Where it shows up                                     |
|---------------------------------------|-------------------------------------------------------|
| Solar spectrum / insolation           | Theory panel + daily irradiation metric               |
| Irradiance vs irradiation             | Live POA metric + daily profile chart                 |
| Solar geometry (δ, ω, α, θ_z, θ_i)   | Metrics panel + 3D scene                              |
| Tilted-surface irradiance             | `irradiance.ts` (beam + diffuse + reflected)          |
| Solar cell / I–V / P–V                | PV Characteristics tab                                |
| Fill factor                           | Metrics panel                                         |
| Single-diode modeling                 | `pvModel.ts`                                          |
| Temperature effect                    | Slider + estimated mode; watch Voc drop               |
| Irradiance effect                     | DNI/DHI/GHI sliders + presets                         |
| Partial shading                       | Shading & Diodes tab                                  |
| Bypass diode                          | Shading tab compares ON vs OFF                        |
| Blocking diode                        | Theory panel explanation                              |
| MPPT                                  | Dedicated MPPT tab with live tracker                  |
| PV system energy                      | Daily energy metric                                   |

---

## Demo walkthrough

1. Start in the **STC** preset and the **3D Scene** tab.
2. Drag the camera — the sun and shadow respond.
3. Increase the **tilt** slider — incidence angle drops at noon, POA rises.
4. Sweep the **solar time** — watch altitude, azimuth, and shadow animate.
5. Open **PV Characteristics** and raise temperature — Voc and Pmax shrink.
6. Drop DNI — current falls proportionally.
7. Load the **Partial Shading** preset and open **Shading & Diodes**.
8. Toggle the **Bypass diode** — Pmax jumps back up visibly.
9. Open **MPPT**, press **Start MPPT** — the green dot chases the yellow MPP.

---

## Roadmap (not implemented, possible extensions)

- Anisotropic diffuse sky (Hay-Davies or Perez)
- Annual energy summary across 365 days
- CSV export of the current I-V curve
- Side-by-side scenario comparison mode
- Full rooftop mesh shading using `@openpv/simshady`
- Battery / load demo module
