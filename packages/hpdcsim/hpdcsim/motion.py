"""Piecewise constant-acceleration plunger motion profiles. SI units only.

Unlike the older top-level motion.py, positions here are meters throughout.
"""
from dataclasses import dataclass
from typing import Iterator

import numpy as np


@dataclass(frozen=True)
class MotionSample:
    time: float
    velocity: float
    position: float
    acceleration: float
    @property
    def position_mm(self): return self.position*1000.0


class MotionProfile:
    def __init__(self, positions, velocities, *, add_origin=True):
        s, v = np.asarray(positions, float), np.asarray(velocities, float)
        if s.ndim != 1 or v.ndim != 1 or len(s) != len(v) or len(s) == 0:
            raise ValueError("positions and velocities must be equal nonempty 1D arrays.")
        if add_origin and s[0] > 0.0:
            s, v = np.insert(s, 0, 0.0), np.insert(v, 0, 0.0)
        if np.any(~np.isfinite(s)) or np.any(~np.isfinite(v)):
            raise ValueError("curve values must be finite.")
        if np.any(np.diff(s) <= 0.0) or np.any(v < 0.0):
            raise ValueError("positions must increase and velocities must be non-negative.")
        self.positions, self.velocities = s, v
        ds, v0, v1 = np.diff(s), v[:-1], v[1:]
        if np.any(v0+v1 <= 0.0):
            raise ValueError("No segment may have zero velocity at both endpoints.")
        self.accelerations = (v1**2-v0**2)/(2.0*ds)
        self.durations = 2.0*ds/(v0+v1)
        self.times = np.r_[0.0, np.cumsum(self.durations)]

    @classmethod
    def shot_curve(cls, a1, v1, s_u, a2, v2, s_end):
        """Two-stage shot profile: from rest accelerate with a1 towards v1 and
        hold it until s_u, then accelerate with a2 towards v2 and hold until
        s_end. If v1 is not reached by s_u, the a1 ramp simply ends there and
        the second stage starts from the velocity actually reached. If v2 is
        below the switch velocity, a2 acts as a deceleration.
        """
        s_u, s_end = float(s_u), float(s_end)
        a1, v1, a2, v2 = float(a1), float(v1), float(a2), float(v2)
        if a1 <= 0.0 or a2 <= 0.0:
            raise ValueError("accelerations must be positive magnitudes.")
        if v1 <= 0.0 or v2 <= 0.0:
            raise ValueError("velocities must be positive.")
        if not 0.0 < s_u < s_end:
            raise ValueError("required: 0 < s_u < s_end.")

        points = [(0.0, 0.0)]
        def add(s, v):
            if not np.isclose(s, points[-1][0]):
                points.append((s, v))

        s_ramp1 = v1**2/(2.0*a1)
        if s_ramp1 < s_u and not np.isclose(s_ramp1, s_u):
            add(s_ramp1, v1)
            add(s_u, v1)
            v_switch = v1
        else:  # v1 not reached: still on the a1 ramp when hitting s_u
            v_switch = min(v1, np.sqrt(2.0*a1*s_u))
            add(s_u, v_switch)

        if np.isclose(v2, v_switch):
            add(s_end, v_switch)
        else:
            a = a2 if v2 > v_switch else -a2
            s_ramp2_end = s_u + (v2**2 - v_switch**2)/(2.0*a)
            if s_ramp2_end < s_end and not np.isclose(s_ramp2_end, s_end):
                add(s_ramp2_end, v2)
                add(s_end, v2)
            else:  # v2 not reached: still ramping at s_end
                v_end2 = v_switch**2 + 2.0*a*(s_end - s_u)
                add(s_end, np.sqrt(max(0.0, v_end2)))

        s, v = zip(*points)
        return cls(s, v, add_origin=False)

    @classmethod
    def from_velocity_law(cls, velocity, s_end, *, count=400):
        """Discretize an arbitrary plunger law v(s) on [0, s_end] into a
        piecewise constant-acceleration profile. Only v(0) may be zero: a law
        that stays at zero over a finite stroke can never traverse it."""
        s_end = float(s_end)
        if s_end <= 0.0:
            raise ValueError("s_end must be greater than zero.")
        if count < 2:
            raise ValueError("count must be at least 2.")
        s = np.linspace(0.0, s_end, count)
        v = np.array([float(velocity(x)) for x in s])
        if np.any(~np.isfinite(v)) or np.any(v < 0.0):
            raise ValueError("velocity law must return finite non-negative values.")
        if np.any(v[1:] <= 0.0):
            raise ValueError("velocity law must be positive for all strokes > 0.")
        return cls(s, v, add_origin=False)

    @property
    def start_time(self): return float(self.times[0])
    @property
    def end_time(self): return float(self.times[-1])
    @property
    def start_position(self): return float(self.positions[0])
    @property
    def end_position(self): return float(self.positions[-1])
    @property
    def travel(self): return self.end_position-self.start_position

    def _time_index(self, t):
        if not self.start_time <= t <= self.end_time: raise ValueError("time outside profile.")
        return len(self.durations)-1 if np.isclose(t, self.end_time) else int(np.searchsorted(self.times, t, side="right")-1)

    def _position_index(self, s):
        if not self.start_position <= s <= self.end_position: raise ValueError("position outside profile.")
        return len(self.durations)-1 if np.isclose(s, self.end_position) else int(np.searchsorted(self.positions, s, side="right")-1)

    def sample_at_time(self, time):
        t = float(time); i = self._time_index(t); dt = t-self.times[i]
        s0, v0, a = self.positions[i], self.velocities[i], self.accelerations[i]
        return MotionSample(t, float(v0+a*dt), float(s0+v0*dt+0.5*a*dt**2), float(a))

    def sample_at_position(self, position):
        s = float(position); i = self._position_index(s)
        s0, v0, a = self.positions[i], self.velocities[i], self.accelerations[i]
        v2 = v0**2+2.0*a*(s-s0)
        if v2 < -1e-12: raise ValueError("negative velocity squared during interpolation.")
        v = np.sqrt(max(0.0, v2))
        dt = (v-v0)/a if abs(a) > 1e-12 else (s-s0)/v0 if v0 > 0 else 0.0
        return MotionSample(float(self.times[i]+dt), float(v), s, float(a))

    def velocity_at_time(self, t): return self.sample_at_time(t).velocity
    def position_at_time(self, t): return self.sample_at_time(t).position
    def acceleration_at_time(self, t): return self.sample_at_time(t).acceleration
    def time_at_position(self, s): return self.sample_at_position(s).time
    def velocity_at_position(self, s): return self.sample_at_position(s).velocity
    def acceleration_at_position(self, s): return self.sample_at_position(s).acceleration
    def maximum_velocity(self): return float(np.max(self.velocities))
    def maximum_acceleration(self): return float(np.max(self.accelerations))

    def iter_samples(self, count=1000, *, spacing="time") -> Iterator[MotionSample]:
        if count < 2: raise ValueError("count must be at least 2.")
        if spacing == "time":
            for t in np.linspace(self.start_time, self.end_time, count):
                yield self.sample_at_time(t)
        elif spacing == "distance":
            for s in np.linspace(self.start_position, self.end_position, count):
                yield self.sample_at_position(s)
        else:
            raise ValueError("spacing must be 'time' or 'distance'.")

    def samples(self, count=1000, *, spacing="time"):
        """Arrays (time, velocity, position, acceleration), evenly spaced in
        time or in travel distance."""
        states = list(self.iter_samples(count, spacing=spacing))
        return (np.array([x.time for x in states]),
                np.array([x.velocity for x in states]),
                np.array([x.position for x in states]),
                np.array([x.acceleration for x in states]))
