# Codex / Claude Code Build Prompt
## Project: Interactive 3D Solar PV System Simulator for Irradiance Estimation and Performance Analysis

You are building a course-aligned mini project starting from an existing open-source base.

## Base repo to use
Clone and use:

- `open-pv/minimalApp`

Treat this as the starting scaffold only. You are allowed to refactor it heavily.

## Primary goal
Transform the base app into an **educational, interactive, browser-based 3D Solar PV System Simulator** that matches the following learning goals:

- solar geometry and sun position
- irradiance estimation on a tilted PV panel
- PV cell / module performance analysis
- I–V and P–V characteristics
- fill factor
- effect of irradiance and temperature
- partial shading
- bypass diode / blocking diode concept demonstration
- MPPT visualization and simple algorithm demo

This is **not** just a 3D graphics demo. It must be an engineering-learning tool with formulas, plots, and interpretable outputs.

---

## Final app expectations

Build a polished web app where the user can:

1. See a **3D scene** with:
   - sun
   - sky
   - ground plane
   - one PV panel or PV module
   - optional obstacle for shading
   - visible panel tilt and azimuth changes
   - shadow falling on the panel

2. Control:
   - latitude
   - day of year or date
   - time of day
   - panel tilt angle
   - panel azimuth
   - irradiance level
   - cell/module temperature
   - obstacle position / height for shading
   - optional number of cells / modules
   - shading on/off
   - MPPT on/off

3. View computed outputs:
   - declination angle
   - hour angle
   - solar altitude / elevation
   - zenith angle
   - angle of incidence
   - estimated irradiance on panel
   - PV output current, voltage, power
   - I–V curve
   - P–V curve
   - fill factor
   - operating point
   - maximum power point
   - daily energy estimate

4. Interactively observe:
   - how tilt/azimuth changes irradiance
   - how time/date changes sun position
   - how shading reduces output
   - how temperature shifts I–V and P–V curves
   - how irradiance changes mainly affect current
   - how MPPT tracks the maximum power point

---

## Important academic constraint
The simulator must align with a renewable energy / solar PV course. The UI and calculations must feel appropriate for engineering students.

The app should explicitly cover these concepts:

### Solar side
- solar spectrum and insolation context
- irradiance vs irradiation
- solar geometry
- latitude
- declination
- hour angle
- zenith angle
- altitude angle
- incidence angle
- tilted surface irradiance

### PV side
- solar cell and PV module basics
- I–V characteristics
- P–V characteristics
- short-circuit current `Isc`
- open-circuit voltage `Voc`
- maximum power point `Vmpp`, `Impp`, `Pmpp`
- fill factor
- effect of temperature
- effect of irradiance
- bypass diode / blocking diode concept
- partial shading and mismatch
- MPPT

---

## Tech requirements

### Frontend
Use:
- React
- TypeScript if feasible; if the starter is JS, you may migrate gradually
- Vite
- Three.js or React Three Fiber if appropriate
- existing `@openpv/simshady` integration if useful
- Chart.js / Recharts / lightweight plotting library for curves

### Code quality
- clean component structure
- reusable calculation utilities
- comments on equations and assumptions
- no unnecessary overengineering
- avoid giant monolithic files
- modular architecture

### UX requirements
- dark or clean scientific UI
- side control panel
- central 3D view
- right or bottom analysis panel
- responsive enough for laptop screen
- labels and legends must be clear
- units must be shown everywhere

---

## Desired app structure

Implement approximately this structure:

```text
src/
  components/
    Scene3D/
      SolarScene.*
      SunLight.*
      PVPanel.*
      Obstacle.*
      ShadowOverlay.*
    controls/
      ControlPanel.*
      DateTimeControls.*
      PanelControls.*
      EnvironmentControls.*
      MPPTControls.*
    charts/
      IVCurveChart.*
      PVCurveChart.*
      DailyIrradianceChart.*
    panels/
      MetricsPanel.*
      FormulaPanel.*
      NotesPanel.*
  lib/
    solarGeometry.*
    irradianceModel.*
    pvModel.*
    mppt.*
    shading.*
    units.*
  hooks/
    useSolarSimulation.*
    usePVModel.*
    useMPPT.*
  data/
    defaults.*
  types/
    simulation.*
  App.*
```

You do not have to follow this exactly, but keep the architecture similarly clean.

---

## Functional modules to implement

# 1. Solar Geometry Module
Implement formulas/functions for:

- declination angle
- hour angle
- solar altitude/elevation angle
- solar zenith angle
- angle of incidence on tilted surface

Use standard engineering approximations. Keep formulas documented in code comments and optionally visible in the UI.

### Inputs
- latitude
- day number `n`
- local solar time
- panel tilt `beta`
- panel azimuth `gamma`

### Outputs
- declination `delta`
- hour angle `omega`
- altitude angle `alpha`
- zenith `theta_z`
- incidence angle `theta_i`

Show these live in the metrics panel.

---

# 2. Irradiance Estimation Module
Implement a reasonable simplified model for irradiance on a tilted surface.

At minimum include:
- direct / beam component
- diffuse component
- ground-reflected component
- total irradiance on tilted plane

A simple isotropic sky diffuse model is acceptable if clearly stated.

### Requirements
- show global horizontal irradiance input
- estimate plane-of-array irradiance
- visibly respond to tilt and sun angle
- if shading covers part of the panel, reduce effective irradiance accordingly

### Nice to have
- small daily irradiance curve across time
- cumulative daily irradiation estimate in Wh/m^2

---

# 3. 3D Visualization Module
The 3D scene should include:

- sun direction changing with time
- panel tilt and azimuth changing visually
- obstacle casting shadow
- shadow intensity or panel shaded fraction visible
- optional heatmap overlay on the panel surface

### Requirements
- camera controls
- reset view
- visually appealing but lightweight
- no laggy giant scene

### Important
Even if precise mesh-level physics is simplified, the shading interaction must be convincing and educational.

---

# 4. PV Electrical Model Module
Implement a practical PV model sufficient for course demonstration.

Minimum requirement:
- simplified single-diode inspired model or well-documented approximation
- generate I–V curve
- generate P–V curve
- compute:
  - `Isc`
  - `Voc`
  - `Vmpp`
  - `Impp`
  - `Pmpp`
  - fill factor

### Behavior expectations
- increasing irradiance should increase current strongly
- increasing temperature should reduce voltage noticeably
- power should vary with both irradiance and temperature
- shaded condition should reduce output

### Notes
Accuracy should be reasonable for teaching purposes. Clear explanation is more important than lab-grade precision.

---

# 5. Temperature and Irradiance Effects Module
Add explicit controls and curve updates for:
- irradiance variation
- temperature variation

### Show clearly
- how I–V changes when irradiance changes
- how I–V changes when temperature changes
- how P–V shifts
- how MPP shifts

Allow users to compare:
- baseline curve
- updated curve

Use different line styles or legends.

---

# 6. Partial Shading and Diode Concept Module
This is a strong differentiator. Add a mode to demonstrate partial shading.

### Must include
- partially shaded panel or cell-group concept
- power drop under shading
- a simple explanatory visualization for bypass diode action

### Acceptable implementation
You do not need a deep semiconductor-level diode simulation. A pedagogical approximation is acceptable:
- split the panel into 2 or 3 submodules
- apply different effective irradiance to each region
- show how the combined I–V / P–V behavior changes
- explain bypass diode effect conceptually and visually

### Also include
- small explanation card:
  - blocking diode prevents reverse current from battery/load into panel
  - bypass diode provides alternate path around shaded cell/string section

---

# 7. MPPT Module
Implement at least one simple MPPT algorithm:
- Perturb and Observe preferred
or
- Incremental Conductance if simple enough

### Requirements
- show current operating point on P–V curve
- animate or step through movement toward MPP
- show duty cycle or control variable if modeled
- show text explaining algorithm steps

### Nice to have
- start from non-optimal operating point
- step button + auto-run mode

---

# 8. Metrics and Explanation Panel
Create an educational output panel with:
- current simulation inputs
- computed solar angles
- irradiance values
- PV electrical outputs
- MPP values
- fill factor
- efficiency estimate if used
- shaded fraction

Also include a “Concept Notes” or “Formula Notes” section with short explanations.

Keep language concise and engineering-friendly.

---

## Suggested equations and assumptions

Implement standard, simple engineering approximations. Use them consistently.

### Declination
Use a standard approximation such as:
```text
delta = 23.45 * sin(360 * (284 + n) / 365)
```

### Hour angle
```text
omega = 15 * (solar_time - 12)
```

### Zenith / altitude
Use standard geometry relationships.

### Incidence angle
Use a standard tilted-surface incidence relation.

### Fill factor
```text
FF = (Vmpp * Impp) / (Voc * Isc)
```

### Power
```text
P = V * I
```

### Daily energy estimate
Approximate through time-step integration:
```text
Energy ≈ sum(P(t) * delta_t)
```

### Temperature / irradiance response
Use reasonable coefficient-based approximations if full physical modeling is too heavy.

Document assumptions in code and in a small notes panel.

---

## Visual design expectations
Build something that looks like a serious simulation dashboard.

### Layout suggestion
- left sidebar: controls
- center: 3D scene
- bottom/right: charts and metrics

### Style
- modern engineering dashboard
- readable fonts
- subtle color usage
- curves and annotations easy to interpret
- avoid clutter

---

## Deliverables expected in code
By the end, the repo should contain:

1. Working app with all main modules
2. Clean README with:
   - setup steps
   - features
   - formulas used
   - assumptions
   - screenshots
3. Comments in key math utility files
4. Sensible default parameters
5. No broken placeholder controls

---

## README requirements
Rewrite the README so that it presents the final project as:

**Interactive 3D Solar PV System Simulator for Irradiance Estimation and Performance Analysis**

README should include:
- project overview
- features
- screenshots / UI sections
- formulas used
- assumptions and limitations
- tech stack
- how to run locally
- possible future improvements

---

## Development plan
Follow this approximate implementation sequence:

### Phase 1
- set up project
- understand base repo
- clean structure
- ensure 3D panel + sun scene works

### Phase 2
- add solar geometry calculations
- connect time/date/latitude controls
- update sun position visually

### Phase 3
- add irradiance estimation on tilted surface
- display metrics panel

### Phase 4
- add PV electrical model
- generate I–V and P–V curves

### Phase 5
- add irradiance and temperature sensitivity controls
- compare curves

### Phase 6
- add partial shading and diode concept mode

### Phase 7
- add MPPT demo mode

### Phase 8
- polish UI
- improve labels
- write README
- remove dead code

---

## Constraints
- keep everything browser-based if possible
- do not introduce unnecessary backend unless absolutely needed
- prefer deterministic calculations over API dependency
- keep code understandable for students
- use mock/sample values where needed, but label them clearly
- no fake physics without explanation

---

## Non-goals
Do not turn this into:
- a giant GIS rooftop platform
- a weather API product
- an enterprise solar finance tool
- an overly advanced semiconductor simulator

This is a **course-aligned educational engineering simulator**.

---

## Priority order
If time is limited, prioritize in this order:

1. 3D solar scene
2. solar geometry
3. irradiance on tilted panel
4. I–V / P–V curves
5. temperature + irradiance effects
6. partial shading
7. bypass diode concept
8. MPPT animation

---

## Final quality bar
The final app should make a professor say:

> This is not just a visualization. It actually demonstrates the solar and PV concepts from the syllabus in an interactive way.

---

## Task
Now inspect the base repo and start implementing the project.

Be proactive:
- refactor where needed
- create missing utility files
- improve naming
- remove starter code that does not fit
- keep commits/changes logically grouped if using git

When in doubt, choose:
- clarity
- educational value
- engineering correctness
- interactive usefulness

Build the project end-to-end.
