"""Melt temperature models. SI units only (temperatures unit-agnostic).

Models are overlays: `solve(process, count)` integrates over the process
timeline and returns (times, temperatures). The process exposes wetted areas
split by contact partner, melt volume/mass, dosing flow rate and time — which
is everything a lumped model needs. Attach a model to the process
(`ShotProcess(..., thermal=...)`) to get `ProcessState.melt_temperature` and
`process.temperature_at_time(t)`; during a model's own solve, states carry
nan temperatures so models never recurse into themselves.

Energy bookkeeping includes the dosing inflow: fresh melt arrives at pouring
temperature into a pool that has already cooled, adding
Q_dose*(T_pour - T)/V to dT/dt (volumetric form; density and cp cancel).
"""
from abc import ABC, abstractmethod

import numpy as np


class ThermalModel(ABC):
    @abstractmethod
    def solve(self, process, count=2000):
        """Temperature history over the whole process.
        Returns (times, temperatures) arrays."""
        ...

    def temperature_at_time(self, process, time, count=2000):
        t, temp = self.solve(process, count)
        return float(np.interp(float(time), t, temp))


def _require_melt(process):
    if process.melt is None:
        raise ValueError("this thermal model needs a Melt material on the "
                         "process (ShotProcess(..., melt=Melt(...))).")
    return process.melt


class ConstantTemperature(ThermalModel):
    """No heat loss; placeholder default. Without an explicit temperature it
    holds the melt's pouring temperature."""

    def __init__(self, temperature=None):
        self.temperature = None if temperature is None else float(temperature)

    def solve(self, process, count=2000):
        temperature = (self.temperature if self.temperature is not None
                       else _require_melt(process).pouring_temperature)
        t = np.linspace(0.0, process.total_time, count)
        return t, np.full_like(t, temperature)


class _EulerLumped(ThermalModel):
    """Shared explicit-Euler integration over the process timeline."""

    def __init__(self, initial_temperature=None, dosing_enthalpy=True):
        self.initial_temperature = (None if initial_temperature is None
                                    else float(initial_temperature))
        self.dosing_enthalpy = bool(dosing_enthalpy)

    def _loss_rate(self, state, temperature, melt):
        """Cooling rate contribution in temperature units per second."""
        raise NotImplementedError

    def solve(self, process, count=2000):
        melt = _require_melt(process)
        start = (self.initial_temperature if self.initial_temperature is not None
                 else melt.pouring_temperature)
        times = np.linspace(0.0, process.total_time, count)
        temps = np.empty_like(times)
        temps[0] = start
        for i in range(1, len(times)):
            state = process.state_at_time(times[i-1])
            dt = times[i] - times[i-1]
            if state.melt_volume <= 0.0:
                temps[i] = temps[i-1]
                continue
            rate = -self._loss_rate(state, temps[i-1], melt)
            if self.dosing_enthalpy and state.dosing_flow_rate > 0.0:
                rate += (state.dosing_flow_rate
                         * (melt.pouring_temperature - temps[i-1])
                         / state.melt_volume)
            temps[i] = temps[i-1] + rate*dt
        return times, temps


class LumpedCapacitance(_EulerLumped):
    """Single-surface lumped model: dT/dt = -h*A*(T - T_wall)/(rho*cp*V)
    with A the total melt-metal contact area (sleeve plus fill-scaled
    downstream surfaces, where defined) plus the dosing enthalpy inflow."""

    def __init__(self, htc, wall_temperature, initial_temperature=None,
                 dosing_enthalpy=True):
        super().__init__(initial_temperature, dosing_enthalpy)
        if htc < 0.0:
            raise ValueError("htc must not be negative.")
        self.htc = float(htc)
        self.wall_temperature = float(wall_temperature)

    def _loss_rate(self, state, temperature, melt):
        return (self.htc * state.total_wetted_area
                * (temperature - self.wall_temperature)
                / (melt.density * melt.specific_heat * state.melt_volume))


class MultiSurfaceLumped(_EulerLumped):
    """Lumped melt with per-surface boundary conditions:
    dT/dt = -sum_i h_i*A_i(t)*(T - T_wall_i)/(rho*cp*V) + dosing enthalpy.

    `surfaces` maps surface names to (htc, wall_temperature) pairs. Valid
    names: shell, plunger_face, die_face, downstream, free_surface. Surfaces
    not listed lose no heat.
    """

    AREAS = {
        "shell": "shell_wetted_area",
        "plunger_face": "plunger_face_area",
        "die_face": "die_face_area",
        "downstream": "downstream_wetted_area",
        "free_surface": "free_surface_area",
    }

    def __init__(self, surfaces, initial_temperature=None,
                 dosing_enthalpy=True):
        super().__init__(initial_temperature, dosing_enthalpy)
        if not surfaces:
            raise ValueError("surfaces must not be empty.")
        cleaned = {}
        for name, pair in surfaces.items():
            if name not in self.AREAS:
                raise ValueError(f"unknown surface '{name}'; valid: "
                                 f"{sorted(self.AREAS)}.")
            htc, wall = pair
            if htc < 0.0:
                raise ValueError(f"surface '{name}': htc must not be negative.")
            cleaned[name] = (float(htc), float(wall))
        self.surfaces = cleaned

    def _loss_rate(self, state, temperature, melt):
        total = 0.0
        for name, (htc, wall) in self.surfaces.items():
            total += (htc * getattr(state, self.AREAS[name])
                      * (temperature - wall))
        return total / (melt.density * melt.specific_heat * state.melt_volume)
