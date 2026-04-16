# Interactive 3D Solar PV System Simulator for Irradiance Estimation and Performance Analysis

## Purpose of this document

This document is meant to be handed directly to a coding agent such as Codex or Claude Code.

The goal is to take an existing open-source 3D solar/shading base project and transform it into a course-aligned educational simulator that matches the syllabus and notes for a Wind and Solar Systems / Solar PV course.

This should become a browser-based, interactive teaching + analysis tool, not just a pretty 3D animation.

---

## One-line project summary

Build a web-based interactive 3D solar PV simulator where the user can change sun position, date, time, latitude, panel tilt, azimuth, shading objects, irradiance, and temperature, and immediately observe:

- the 3D sun-panel-shadow interaction
- incidence angle and irradiance on a tilted panel
- PV I-V and P-V characteristics
- fill factor, Voc, Isc, Vmp, Imp, and Pmax
- temperature and irradiance effects
- partial shading and bypass diode behavior
- simple MPPT tracking behavior
- daily energy / irradiation estimation

---

## Recommended base repo to clone

### Primary base
Clone **open-pv/minimalApp** as the starting point.

Reason:
- It is small and easier to modify heavily.
- It already showcases `@openpv/simshady`.
- It already gives a browser-based 3D simulation starting point.
- It is much better for fast customization than beginning from scratch.

### Reference repos
Also inspect these while implementing:

1. **open-pv/simshady**
   - Keep this as the 3D shading / mesh / GPU simulation backbone.
   - Useful for shadowing, sunlight interaction, and scene-level solar geometry.

2. **open-pv/website**
   - Use this only as a larger UI/reference example.
   - Do not copy the whole product; just borrow patterns if needed.

3. **pvlib-python**
   - Use only as a modeling reference.
   - Do not make Python a runtime dependency for the main web app.
   - Port only the small formulas/logic needed into TypeScript.

4. **SunPower/PVMismatch**
   - Use as conceptual reference for mismatch, partial shading, string behavior, and bypass diodes.
   - Again, do not make it a runtime dependency unless absolutely necessary.

5. **amosborne/solarcell**
   - Optional reference for simpler IV/PV curve generation under temperature and irradiance variations.

### Important implementation direction
This project should remain a **single frontend web app**, preferably using:
- Vite
- React
- TypeScript
- Three.js
- `@openpv/simshady`

Do not turn this into a Python backend unless absolutely necessary.

---

## Final project identity

### Project title
**Interactive 3D Solar PV System Simulator for Irradiance Estimation and Performance Analysis**

### Internal short name
`solar-pv-simulator`

### Elevator pitch
An educational and analytical web simulator that combines 3D solar geometry, irradiance estimation, PV electrical characteristics, shading effects, and MPPT behavior in one interactive interface.

---

## Why this project exists

The course content is not limited to just “irradiance”. It also includes:

- solar spectrum / sunlight basics
- insolation specifics
- irradiance and irradiation
- solar geometry and incidence angle
- solar PV cell basics
- I-V and P-V characteristics
- fill factor
- solar cell modeling
- maximum power point tracking
- PV module behavior
- blocking and bypass diodes
- composite characteristics of PV modules
- PV array / PV system concepts

Therefore the simulator must cover both:

1. **geometric/solar side**
2. **electrical/PV performance side**

It must feel like a complete course-aligned mini-project.

---

## What the app must do

## High-level features

The app must include these modules:

1. **3D Solar Geometry Module**
2. **Irradiance Estimation Module**
3. **PV Cell / Module Performance Module**
4. **Shading and Diode Effects Module**
5. **MPPT Demonstration Module**
6. **Daily Energy / Irradiation Summary Module**

---

## Course alignment map

Map the simulator to syllabus topics like this:

| Course topic | Simulator feature |
|---|---|
| basic characteristics of sunlight | info panel / short theory section |
| insolation specifics | daily irradiation and incident energy |
| irradiance and irradiation | separate numeric outputs and graphs |
| solar angles | sun path, declination, zenith, altitude, incidence |
| solar PV cell | PV model tab |
| I-V characteristics | live I-V graph |
| PV characteristics | live P-V graph + operating point |
| fill factor | calculate FF and explain |
| modeling of solar cell | single-diode or educational equivalent model |
| maximum power point tracking | MPPT tab with animated operating point |
| PV module / PV array | series/parallel module controls or simplified presets |
| blocking diode and bypass diode | mismatch/partial shading demo |
| composite characteristics | string/module combined curve visualization |
| PV system | output, load, battery/load presets |

---

## Target users

1. **Course faculty/examiners**
   - need a technically sound academic simulator

2. **Students**
   - need an interactive way to understand what equations mean physically

3. **Demo viewers**
   - need a visually attractive 3D interface

---

## Scope rules

## Must have

- 3D sun and panel scene
- panel tilt and azimuth controls
- date, time, latitude controls
- solar angle calculations
- irradiance on tilted surface
- I-V and P-V curves
- Voc, Isc, Vmp, Imp, Pmax, fill factor
- temperature effect
- irradiance effect
- partial shading effect
- bypass diode demonstration
- MPPT animation or simulation
- daily energy estimate

## Nice to have

- multiple panel presets
- roof / ground / balcony scene presets
- annual energy estimate
- CSV export of curves
- comparison mode for two operating conditions

## Out of scope for v1

- highly accurate bankable commercial-grade solar forecasting
- GIS-heavy rooftop mapping from real city data
- complicated atmospheric spectral models
- inverter-grade engineering design tools
- full manufacturing-level PV parameter extraction pipeline

---

## Functional requirements

## 1. 3D solar scene

The app must render a 3D scene with:

- a solar panel mounted on a frame or roof plane
- a visible sun direction / light source
- optional shading objects such as wall, pole, tree-like block, adjacent building block
- real-time shadows
- camera controls for orbit / zoom / pan

### Controls

- latitude
- day of year or date picker
- time of day
- panel tilt angle
- panel azimuth
- surface albedo / ground reflectance
- object position and height for shading

### Visual requirements

- panel color should indicate incident irradiance intensity
- shaded regions should be visibly darker
- sun path or light direction should be obvious
- optionally show normal vector of the panel

---

## 2. Solar geometry module

Implement the core solar-angle calculations.

At minimum compute:

- day number `n`
- declination angle `delta`
- hour angle `omega`
- zenith angle `theta_z`
- altitude angle `alpha_s`
- incidence angle `theta_i`
- panel tilt `beta`
- surface azimuth `gamma`

### Suggested educational formulas

Use standard engineering-level formulas acceptable for a student simulator.

#### Declination
```text
delta = 23.45 * sin( 360 * (284 + n) / 365 )
```

#### Hour angle
```text
omega = 15 * (solar_time - 12)
```

#### Zenith angle
```text
cos(theta_z) = sin(phi)sin(delta) + cos(phi)cos(delta)cos(omega)
```

#### Altitude angle
```text
alpha_s = 90 - theta_z
```

#### Simplified incidence angle on tilted surface
Use the standard tilted-surface expression based on:
- latitude `phi`
- declination `delta`
- hour angle `omega`
- surface tilt `beta`
- surface azimuth `gamma`

Implementation may use a robust vector-based method instead of a long trigonometric closed-form expression.

### Preferred implementation note
Use **vector math** wherever possible:
- compute sun direction vector in world coordinates
- compute panel normal vector
- use dot product to get incidence cosine

This is cleaner and fits 3D rendering naturally.

---

## 3. Irradiance estimation module

The app must clearly distinguish between:

- **irradiance**: instantaneous power per unit area, usually W/m²
- **irradiation / insolation**: energy over time, usually Wh/m² or kWh/m²/day

### Inputs

- direct normal irradiance (DNI) or total solar input preset
- diffuse horizontal irradiance (DHI) or simplified diffuse ratio
- global horizontal irradiance (GHI) if needed
- ground reflectance `rho`
- shading factor

### Output values

- beam irradiance on panel
- diffuse irradiance on panel
- reflected irradiance on panel
- total plane-of-array irradiance
- cumulative daily irradiation

### Suggested educational model for tilted surface

#### Beam component
```text
POA_beam = DNI * max(0, cos(theta_i)) * shadingFactor
```

#### Diffuse component (isotropic sky approximation)
```text
POA_diffuse = DHI * (1 + cos(beta)) / 2
```

#### Ground-reflected component
```text
POA_ground = rho * GHI * (1 - cos(beta)) / 2
```

#### Total plane-of-array irradiance
```text
POA_total = POA_beam + POA_diffuse + POA_ground
```

### Daily irradiation
Approximate by integrating over time samples:
```text
H_day = sum(POA_total(t) * delta_t)
```
where `delta_t` is in hours for Wh/m².

### Simulation note
For v1, a simplified model is acceptable.
Accuracy should be good enough for learning, not for commercial design certification.

---

## 4. PV electrical model

This part is critical. The simulator must not stop at geometry.

## Required outputs

For current operating conditions, show:

- short-circuit current `Isc`
- open-circuit voltage `Voc`
- current at max power point `Imp`
- voltage at max power point `Vmp`
- maximum power `Pmax`
- fill factor `FF`

### Core equations / approach

Use one of these approaches:

#### Preferred approach
Implement a **single-diode educational model** in TypeScript.

Use the standard form:
```text
I = Iph - Io * ( exp((V + I*Rs)/(n*Ns*Vt)) - 1 ) - (V + I*Rs)/Rsh
```

where:
- `Iph` = photocurrent
- `Io` = diode saturation current
- `Rs` = series resistance
- `Rsh` = shunt resistance
- `n` = diode ideality factor
- `Ns` = number of series cells
- `Vt` = thermal voltage

Since this is implicit in `I`, solve numerically for curve points.

#### Acceptable fallback for v1
If full single-diode solving becomes too heavy, create a calibrated educational approximation for the I-V curve shape that still respects:

- current increases strongly with irradiance
- voltage changes moderately with irradiance
- voltage decreases with temperature
- power has a distinct maximum point

However, if possible, do the proper single-diode implementation.

### Fill factor
```text
FF = (Vmp * Imp) / (Voc * Isc)
```

### Maximum power
```text
Pmax = Vmp * Imp
```

### Curve rendering
The app must render:

- I-V curve
- P-V curve
- a highlighted current operating point
- a highlighted maximum power point

---

## 5. Irradiance and temperature effects

The notes/course expect the simulator to show how operating conditions change PV performance.

## Irradiance effects
When irradiance increases:

- `Isc` should increase significantly
- `Imp` should increase
- `Voc` may increase slightly
- `Pmax` should increase

## Temperature effects
When cell temperature increases:

- `Voc` should decrease noticeably
- `Isc` may increase slightly
- `Pmax` should generally decrease
- curve should shift accordingly

### Simple engineering approximations allowed
Use temperature coefficients if full physics is not implemented:

```text
Isc(T) = Isc_ref * [1 + alpha_Isc * (T - T_ref)]
Voc(T) = Voc_ref + beta_Voc * (T - T_ref)
Pmax(T) = Pmax_ref * [1 + gamma_Pmax * (T - T_ref)]
```

with sensible defaults from a sample module dataset.

### Cell temperature estimate
Allow either:

1. direct manual temperature slider, or
2. simple NOCT-based estimate

Example simple estimate:
```text
T_cell = T_ambient + ((NOCT - 20) / 800) * POA_total
```

Use this only as an educational approximation.

---

## 6. Module, string, and diode behavior

This is one of the strongest ways to align the project to the notes.

## Minimum behavior to model

### Partial shading
Allow the user to shade:
- part of the panel
- one substring/cell group
- or one module in a simple string

This should alter the effective irradiance seen by the affected region.

### Bypass diode demo
The simulator must include a switch:

- bypass diode OFF
- bypass diode ON

Show how the output curve differs.

### Blocking diode mention/demo
Blocking diode can be represented in a simple explanatory section or optional circuit visualization. It does not need to be deeply simulated in v1.

## Educational outcome
When shading occurs:

- explain that mismatch appears
- total output reduces
- multiple local peaks may appear in P-V curve in advanced shading cases
- bypass diode helps prevent severe reverse-bias problems and allows current to bypass the shaded section

### Implementation strategy for v1
Use a simplified segmented panel model.

Example:
- split panel into 3 substrings
- each substring gets its own effective irradiance
- each substring can be shaded independently
- when bypass diode is enabled, substring behavior changes accordingly

This is enough for an academic demo.

---

## 7. MPPT module

A dedicated MPPT view or section must be present.

## Required behavior

- show the PV operating point moving on the P-V curve
- show the maximum power point
- demonstrate at least one MPPT algorithm

## Recommended algorithm for v1
Implement **Perturb and Observe (P&O)**.

### Expected controls

- start / stop MPPT
- step size
- irradiance change event
- temperature change event
- load change event

### Visuals

- plot current operating point on P-V curve
- animate duty cycle or equivalent control variable
- show convergence toward MPP

### Nice to have
Also add **Incremental Conductance** as a second algorithm, but only if time permits.

---

## 8. Energy estimation module

The app should report not just instantaneous quantities but also daily energy-type quantities.

## Outputs

- instantaneous irradiance (W/m²)
- daily irradiation (Wh/m² or kWh/m²/day)
- estimated panel power (W)
- estimated daily energy output (Wh/day)

### Simple estimate
```text
P_panel = eta_panel * A_panel * POA_total
```

or use `Pmax` / modeled operating point from the electrical model.

### Better estimate
Use the electrical model to infer actual power under the chosen operating point / MPPT condition.

---

## UI requirements

## Main layout
Use a dashboard layout with these panels:

### Left sidebar: controls
- date
- time
- latitude
- tilt
- azimuth
- ambient temperature
- irradiance preset / sunlight intensity
- albedo
- shading object controls
- bypass diode toggle
- MPPT controls

### Center: 3D scene
- solar panel
- sun direction
- shadowed objects
- optional rooftop plane / ground plane

### Right side: live metrics + graphs
- incidence angle
- POA irradiance
- Isc, Voc, Imp, Vmp, FF, Pmax
- I-V curve
- P-V curve
- daily irradiation / energy

### Bottom tabs or accordion sections
- Theory / explanations
- MPPT view
- diode/shading view
- assumptions and formulas

---

## UX expectations

- changes should update in real time or near real time
- provide sensible default presets
- include short tooltip explanations for terms like:
  - irradiance
  - irradiation
  - incidence angle
  - fill factor
  - MPPT
  - bypass diode
- keep the interface educational, not just engineering-heavy

---

## Visual design requirements

- modern clean academic dashboard
- dark or neutral theme is acceptable
- high contrast graphs
- color code irradiance intensity on panel surface if possible
- simple professional styling, no overdesigned flashy UI

---

## Suggested app routes / screens

A single-page app with tabs is fine. Recommended tabs:

1. **3D Solar Scene**
2. **PV Characteristics**
3. **Shading and Diodes**
4. **MPPT**
5. **Theory / Equations**

Alternative: one page with left controls and tabbed right-side panels.

---

## Data model

Use a central state store.

### Suggested state shape
```ts
interface SimulationState {
  latitude: number;
  dayOfYear: number;
  timeOfDay: number;
  panelTiltDeg: number;
  panelAzimuthDeg: number;
  ambientTempC: number;
  cellTempMode: 'manual' | 'estimated';
  cellTempC: number;
  dni: number;
  dhi: number;
  ghi: number;
  albedo: number;
  shadingEnabled: boolean;
  shadingPreset: 'none' | 'edge' | 'partial' | 'heavy';
  bypassDiodeEnabled: boolean;
  mpptEnabled: boolean;
  mpptAlgorithm: 'po' | 'inccond';
  panelAreaM2: number;
  panelParams: PVModuleParams;
}
```

### Suggested module parameters
```ts
interface PVModuleParams {
  iscRef: number;
  vocRef: number;
  impRef: number;
  vmpRef: number;
  alphaIsc: number;
  betaVoc: number;
  gammaPmax: number;
  rs: number;
  rsh: number;
  n: number;
  ns: number;
  areaM2: number;
  noct: number;
}
```

---

## Recommended implementation architecture

## Frontend stack
- React
- TypeScript
- Vite
- Three.js
- `@openpv/simshady`
- a lightweight charting library such as Recharts or Chart.js
- Zustand or React context for state

## Suggested folders
```text
src/
  app/
  components/
    controls/
    scene/
    charts/
    metrics/
    theory/
  modules/
    solarGeometry/
    irradiance/
    pvModel/
    shading/
    mppt/
  data/
    sampleModules.ts
    presets.ts
  utils/
  styles/
```

### Core modules to create

#### `modules/solarGeometry`
Should expose functions like:
- `getDeclination(dayOfYear)`
- `getHourAngle(solarTime)`
- `getSunVector(...)`
- `getPanelNormal(...)`
- `getIncidenceAngle(...)`

#### `modules/irradiance`
Should expose:
- `getPOABeam(...)`
- `getPOADiffuse(...)`
- `getPOAGroundReflected(...)`
- `getTotalPOA(...)`
- `integrateDailyIrradiation(...)`

#### `modules/pvModel`
Should expose:
- `generateIVCurve(...)`
- `generatePVCurve(...)`
- `getIscVocImpVmpFF(...)`
- `estimateCellTemperature(...)`

#### `modules/shading`
Should expose:
- `getShadingFactorFromScene(...)`
- `getSubstringIrradiances(...)`
- `applyBypassDiodeModel(...)`

#### `modules/mppt`
Should expose:
- `stepPerturbAndObserve(...)`
- `stepIncrementalConductance(...)`

---

## Numerical fidelity strategy

This project should aim for **educational correctness**, not industrial certification.

### Priority order
1. physically sensible behavior
2. clean visuals
3. stable interactive performance
4. reasonable formulas
5. advanced precision only where affordable

### Explicit instruction
Avoid overengineering. Build a simulator that is:
- believable
- explainable
- smooth in browser
- aligned to textbook concepts

---

## Default presets to include

## Preset 1: Standard Test Conditions (STC)
- irradiance = 1000 W/m²
- cell temperature = 25°C
- no shading

## Preset 2: Hot Day
- irradiance = 900 W/m²
- ambient temperature = 38°C
- estimated cell temperature high

## Preset 3: Cloudy Diffuse Day
- lower DNI
- relatively higher diffuse share

## Preset 4: Partial Shading
- one section shaded
- compare bypass diode OFF vs ON

## Preset 5: Sunrise/Sunset Oblique Incidence
- low sun altitude
- high incidence losses

---

## Theory/help content to include in app

The app should include a short educational panel that explains:

- difference between irradiance and irradiation
- what incidence angle means
- why tilt and azimuth matter
- why I-V and P-V curves change with temperature and irradiance
- what fill factor means
- what MPPT does
- why bypass diodes are used

Keep these explanations short and student-friendly.

---

## Acceptance criteria

The build is considered successful when all of the following are true:

1. User can open a browser page and see a 3D solar panel scene.
2. Changing date/time/latitude changes sun direction and incidence angle.
3. Changing tilt/azimuth changes incident irradiance on the panel.
4. The simulator displays beam, diffuse, reflected, and total irradiance.
5. The simulator renders live I-V and P-V curves.
6. The simulator displays `Isc`, `Voc`, `Imp`, `Vmp`, `Pmax`, and `FF`.
7. Temperature increase visibly lowers `Voc` and typically lowers `Pmax`.
8. Irradiance increase visibly raises current and power.
9. Partial shading reduces output and changes the curve.
10. Bypass diode ON/OFF visibly changes shaded-case behavior.
11. MPPT mode converges toward the maximum power region.
12. Daily irradiation / daily energy estimate is displayed.
13. UI is understandable without reading source code.

---

## Non-functional requirements

- Runs locally with a simple `npm install` and `npm run dev`
- Reasonably smooth in modern desktop browser
- No backend required for core functionality
- Clean TypeScript code
- Modular code structure
- Clear comments for physics/math sections
- Avoid unnecessary dependencies

---

## Development plan for the coding agent

## Phase 1: Understand and preserve the base repo

- Clone `open-pv/minimalApp`
- Run it locally
- Understand how `simshady` is wired into the scene
- Preserve the working 3D setup and build system

## Phase 2: Refactor into modules

- convert to TypeScript if not already
- separate scene, state, formulas, and charts
- establish reusable simulation state

## Phase 3: Add solar geometry and irradiance calculations

- add date/time/latitude controls
- compute solar angles
- compute incidence angle using vector math
- compute POA irradiance

## Phase 4: Add PV electrical model

- create module parameter presets
- generate I-V and P-V curves
- compute FF and MPP

## Phase 5: Add shading + bypass diode educational logic

- allow partial shading presets
- split panel or substring irradiance
- compare with and without bypass diode

## Phase 6: Add MPPT

- implement P&O
- animate operating point
- add controls and visual explanation

## Phase 7: Polish and educational content

- add formulas/help tab
- add metric cards
- improve graph readability
- add presets and example scenarios

---

## Coding style instructions for the agent

- Prefer clarity over cleverness.
- Keep formulas in isolated utility files.
- Add comments before every important equation.
- Use descriptive variable names.
- Avoid massive components.
- Keep charts and calculations separated.
- Keep the project easy for a student to present and explain.

---

## Presentation-friendly features

The project should be easy to demo live.

### Demo sequence should work like this

1. Open app in STC preset.
2. Show 3D panel and sun.
3. Change tilt and azimuth and show irradiance change.
4. Change time and show incidence angle + shadow movement.
5. Open I-V and P-V tabs and show output metrics.
6. Increase temperature and show `Voc` drop.
7. Lower irradiance and show current drop.
8. Apply partial shading and show output distortion.
9. Toggle bypass diode and explain effect.
10. Run MPPT and show operating point move toward MPP.

---

## Suggested sample numbers for a default panel

Use sensible educational defaults such as:

- `Voc_ref = 22 V`
- `Isc_ref = 5 A`
- `Vmp_ref = 17.6 V`
- `Imp_ref = 4.55 A`
- `Pmax_ref ≈ 80 W`
- `FF ≈ 0.70 to 0.80`
- `NOCT ≈ 45°C`

These do not need to match a commercial module exactly, but should be internally consistent.

---

## Simplifications that are allowed

The agent is allowed to simplify the following for v1:

- isotropic sky diffuse model instead of advanced diffuse sky model
- educational cell temperature estimate instead of a full thermal model
- segmented substring shading model instead of a full cell-level electrothermal model
- simple MPPT loop instead of inverter-grade controller
- a single panel or simple panel string instead of a full rooftop layout optimizer

These are acceptable as long as behavior remains physically meaningful.

---

## What must not happen

Do **not** turn this into:

- only a 3D sunlight animation
- only a graphing app without 3D interaction
- only a rooftop GIS viewer
- only a static dashboard
- a backend-heavy system requiring cloud services for core simulation

The project must remain an integrated **3D + irradiance + PV performance** simulator.

---

## Deliverables expected from the coding agent

1. Working local app
2. Clean source code
3. Readable math/formula modules
4. 3D scene with shadows
5. I-V and P-V charts
6. MPPT demo
7. Shading / bypass diode demo
8. concise README explaining setup and features

---

## Stretch goals

If time remains, add any of these:

- annual simulation mode
- module preset selector
- compare two operating conditions side by side
- export graphs as PNG
- save/load scenarios
- rooftop vs ground-mount presets
- simple battery/load demo

---

## Final instruction to the coding agent

Use `open-pv/minimalApp` as the base, preserve its 3D/shading strengths, and extend it into a course-aligned educational simulator.

The final app must clearly demonstrate:

- solar geometry
- irradiance estimation
- PV electrical behavior
- effect of temperature and sunlight
- effect of shading and bypass diode
- MPPT behavior
- energy/performance interpretation

The end result should feel like a strong academic mini-project that is also visually impressive.

