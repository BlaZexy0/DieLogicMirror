# hpdcsim

Quasi-static simulation of a cold-chamber HPDC (high pressure die casting)
shot: **dosing → dwell → shot**, with the melt pushed from a partially filled
shot sleeve through runner, part cavity and overflows — plus pluggable
plunger-motion laws, vacuum/air-pressure models and melt-temperature models.

**SI units everywhere** (m, s, kg, Pa). Melt/model temperatures may use any
consistent unit (only differences enter the equations);
`Environment.ambient_temperature` is Kelvin because gas-law models use it
absolutely.

## Quickstart

```python
from hpdcsim import load_process

process = load_process("examples/demo.json")

for event in process.events().values():          # dosing_end ... fill_complete
    print(event.name, event.time, event.stroke)

state = process.state_at_time(6.0)               # or state_at_stroke(0.25)
state.plunger_velocity, state.critical_velocity  # slow-shot wave safety
state.air_pressure, state.melt_temperature       # model overlays
state.gate_velocity, state.part_fill             # cavity filling

process.critical_crossing()                      # first supercritical stroke
process.export_csv("shot.csv", count=1000)       # full timeline
```

Or build in code — see `examples/basic_usage.py`:

```python
process = ShotProcess(sleeve, casting, TwoStageLaw(a1=2, v1=0.3, a2=15, v2=2.5),
                      dosing_time=4.0, dwell_time=1.5, melt=melt,
                      vacuum=VacuumSystem(0.15, IdealVacuum(8e3)),
                      thermal=MultiSurfaceLumped({"shell": (2000, 180)}))
```

Run the test suite with `pytest` or, without it, `python3 tests/run_tests.py`.

## JSON configuration

`load_process()` accepts a dict, a JSON string, or a file path. Sections
`sleeve`, `casting`, `motion`, `process` are required; `melt`, `environment`,
`vacuum`, `thermal` optional. See `examples/demo.json` for the full shape.
Model sections select an implementation via `"type"`:

| section | types |
|---|---|
| `motion` | `two_stage` (a1,v1,a2,v2 — s_u/s_end default to the volume-derived strokes), `profile` (explicit positions/velocities) |
| `vacuum.model` | `sealed`, `ideal` (pump_pressure), `pumped` (pump_speed, ultimate_pressure), `conductance` (pump_pressure, discharge_coefficient), `tank` (tank_volume, tank_pressure, pump_speed, ultimate_pressure, discharge_coefficient) |
| `thermal` | `constant`, `lumped` (htc, wall_temperature), `multi_surface` (surfaces: name → htc/wall_temperature) |
| `process.critical_velocity_model` | `garber_lopez` (default), `nogowizin`, `segment_fit` |

Custom implementations plug into the same JSON via
`register_motion_type` / `register_vacuum_model` / `register_thermal_model` /
`register_critical_velocity_model` — see `examples/custom_models.py`.

## Physical model

- **Dosing**: melt volume grows linearly to the target fill fraction over
  `dosing_time`; plunger at rest; pour hole open.
- **Shot**: plunger follows the motion profile; melt volume is conserved.
  Quasi-static bookkeeping: melt stays in the sleeve until the remaining
  chamber equals the melt volume, then fills runner → part → overflow. Fill
  completes at `L − biscuit`; profiles pushing past that are rejected.
- **Slow-shot wave safety**: selectable critical-velocity criterion —
  `garber_lopez` (`2(√(gD) − √(gh))`, default), `nogowizin`
  (`√(gD)·(1.386 − 1.915φ + 0.615φ²)`) or `segment_fit` (DieLogic fit of the
  exact shallow-water ceiling criterion, ≤ 0.25 % deviation; mirrors the
  dashboard) — evaluated **once at the dosed fill
  state** (the fill fraction the classic limits are quoted at) and constant
  over the shot. `ProcessState.critical_velocity` turns `nan` as soon as the
  sleeve cross-section is full, and `critical_crossing()` searches only
  while a free surface exists — a fast second phase after chamber-full is
  never flagged. The Froude number stays instantaneous (informational).
- **Air**: one lumped volume (sleeve headspace + unfilled cavity). Pressure
  is delegated to a `VacuumModel` — closed-form models implement
  `pressure_at(process, air)`; path-dependent models override
  `solve(process, count)` and integrate over `process.air_state_at_time(t)`
  (pressure-free by construction, so models cannot recurse). Solutions are
  cached on the process. Provided models (all isothermal at ambient T):
  - `NoVacuum` — ambient until the pour hole seals, then p·V = const.
  - `IdealVacuum` — instantaneous: clamps to the pump pressure while the
    valve is active; no opening area enters.
  - `PumpedVacuum` — finite volumetric pump speed, dq/dt = −S·q/V.
  - `ConductanceVacuum` — vented air mass: flows through the vacuum valve
    (`VacuumSystem.valve_area`) into a plenum held at `pump_pressure`,
    through chill vents (`CastingSystem.vent_area`, outflow to ambient
    only) and the pour hole (`ShotSleeve.pour_hole_area`; ideal vent when
    unset).
  - `TankVacuum` — like `ConductanceVacuum`, but the valve drains into a
    finite tank (`tank_volume`, evacuated to `tank_pressure`) whose
    pressure rises with every kilogram it receives; optional `pump_speed`
    keeps evacuating it. `solve_channels()` / `ShotProcess.air_solution()`
    publish the tank pressure as `"tank_pressure"`.

  Openings are isentropic orifices (choked/subsonic, discharge
  coefficient) unless the component carries a `VentChannel` (`gap`,
  `length`, `entry_loss`, `roughness`; JSON: `casting.vent_channel`,
  `vacuum.valve_channel`): then `channel_mass_flow` treats them as wide
  slits with wall friction — isothermal duct flow choking at M = 1/√γ,
  friction factor over all regimes (laminar 96/Re, turbulent Churchill),
  which reduces to Poiseuille's viscous slit flow at low Reynolds numbers.

  The valve closes at `VacuumSystem.end_position`, or after
  `VacuumSystem.duration` seconds of being open (resolved along the motion
  profile), or by default when the melt reaches it (fill-complete stroke).
- **Temperature**: delegated to a `ThermalModel` overlay; attach it to the
  process to populate `ProcessState.melt_temperature`. Provided:
  - `ConstantTemperature`
  - `LumpedCapacitance` — dT/dt = −h·A·(T−T_wall)/(ρ·c_p·V) over the total
    melt-metal contact area.
  - `MultiSurfaceLumped` — per-surface (htc, wall temperature) pairs for
    shell / plunger_face / die_face / downstream / free_surface.
  Both lumped models include the dosing enthalpy inflow
  Q_dose·(T_pour − T)/V.
- **Coupling order is one-way**: kinematics → air pressure → temperature.
  Nothing feeds back; each overlay solves once against the kinematic
  timeline and is cached.

### Known limitations

- No pre-flow through the gate: melt enters the runner only once the sleeve
  cross-section is full; no wave dynamics or backflow.
- Air pressure diverges (`→ inf`) as the air volume vanishes at complete
  fill — real vents/solubility are not modeled at that limit.
- Downstream wetted areas scale linearly with fill fraction.
- Air is isothermal at ambient temperature in all provided models.

## Package layout

| module | contents |
|---|---|
| `geometry` | circular-segment math, wave speeds, critical velocity (fast table-based fill↔height inversion) |
| `motion` | piecewise constant-acceleration `MotionProfile`, `shot_curve`, `from_velocity_law` |
| `laws` | `ShotPlan` (volume-derived stroke targets), `PlungerLaw`, `TwoStageLaw`, `VelocityFunctionLaw` |
| `components` | `ShotSleeve`, `Melt`, `Runner`, `Part`, `Overflow`, `CastingSystem`, `VacuumSystem`, `Environment` |
| `vacuum` | `AirState`, `VacuumModel` + the five models, `VentChannel`, `orifice_mass_flow`, `channel_mass_flow` |
| `thermal` | `ThermalModel` + the three models |
| `process` | `ShotProcess` timeline, `ProcessState`, events, query API, sampling/CSV |
| `config` | JSON/dict loading, model registries |

## Roadmap

- Machine coupling: PQ² diagram, plunger force, intensification phase.
- Garber-style wave model for the slow shot (replacing the quasi-static
  free surface).
- Solidified-layer growth in the sleeve (the `Melt` liquidus/solidus/latent
  heat fields are already in place).
- Non-isothermal air (adiabatic compression of trapped gas).
- Air entrainment metrics from the supercritical portion of the stroke.
