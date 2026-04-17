# IEEE-Style Project Report

Course-aligned report for **Interactive 3D Solar PV System Simulator for Irradiance Estimation and Performance Analysis**, EE-F70 Wind and Solar Systems, Department of Electrical and Electronics Engineering, NIT Tiruchirappalli.

**Authors**
- Anjesh Singh (107123014)
- Karan Singh Bisht (107123054)
- Vedant Dorlikar (107123133)

## Files

```
docs/report/
  solar_pv_simulator_report.tex   IEEE-conference LaTeX source (IEEEtran class)
  generate_figures.py              Matplotlib script that produces every PNG
  figures/                         12 PNG figures referenced by the .tex
  README.md                        you are here
```

## Building the PDF

**Easiest — Overleaf (recommended):**
1. On [overleaf.com](https://overleaf.com) create a new project → Upload Project → Zip
2. Zip the `docs/report/` directory and upload it
3. Overleaf auto-builds with `pdflatex`

**Local — if you have LaTeX installed:**
```bash
cd docs/report
pdflatex solar_pv_simulator_report.tex
pdflatex solar_pv_simulator_report.tex   # second pass for references
```

## Regenerating figures

The figures are produced by a single Python script that reads the bundled datasets in `public/data/` and reproduces the exact same physics (single-diode I-V, isotropic POA, MPPT P&O) used by the TypeScript simulator.

```bash
# from repo root, using the project venv
python3 -m venv .venv
.venv/bin/pip install matplotlib numpy
.venv/bin/python docs/report/generate_figures.py
```

Output goes to `docs/report/figures/`.

## Figure list

| File | What it shows |
|---|---|
| `fig_architecture.png` | Module graph of the simulator — inputs, state store, physics modules, views |
| `fig_solar_angles.png` | Solar altitude and azimuth at NIT Trichy on four representative days |
| `fig_daily_poa.png` | Daily POA profile at NIT Trichy for two tilts on June and Dec solstices |
| `fig_tilt_sweep.png` | Annual POA irradiation as a function of panel tilt (south-facing) |
| `fig_iv_pv_irradiance.png` | I-V and P-V curves at four irradiance levels (STC temperature) |
| `fig_iv_pv_temperature.png` | I-V and P-V curves at four cell temperatures (STC irradiance) |
| `fig_shading_bypass.png` | Bypass ON vs OFF with one substring at 20 % irradiance |
| `fig_mppt_trajectory.png` | Perturb & Observe MPPT climbing to the maximum power point |
| `fig_nasa_monthly.png` | Monthly GHI/DNI/DHI and air temperature at NIT Trichy from NASA POWER |
| `fig_nasa_daily.png` | 365 days of 2023 daily GHI/DNI/DHI from NASA POWER |
| `fig_rooftop_potential.png` | NIT Trichy rooftop area distribution + top-15 buildings by PV capacity |
| `fig_summary.png` | One-page summary of key numbers |

## Key numbers from the real data

- Annual mean GHI at NIT Trichy: **5.55 kWh/m²/day**
- Annual mean DNI: **3.64 kWh/m²/day**
- Annual mean T₂ₘ: **27.6 °C**
- Optimum south-facing tilt: **≈ 10°** (near-equatorial site)
- Number of OSM building footprints: **308**
- Total gross footprint area: **13.6 ha**
- Estimated usable rooftop area (60 %): **8.1 ha**
- Estimated aggregate roof PV: **≈ 14.6 MW peak** at 180 W/m²
- Estimated annual yield at η_sys = 80 %: **≈ 13.2 GWh/yr**
