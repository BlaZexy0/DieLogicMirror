"""Matplotlib plots for a ShotProcess. Optional dependency:
install matplotlib (pip install hpdcsim[plot]) to use this module.

Each plot_* function draws one panel onto a provided (or fresh) Axes and
returns it; shot_overview() composes the full six-panel figure. One measure
per axis — related measures get separate panels, never a second y-scale.
"""
import numpy as np

try:
    import matplotlib.pyplot as plt
except ImportError as _error:  # pragma: no cover
    raise ImportError(
        "hpdcsim.plotting needs matplotlib (pip install matplotlib)."
    ) from _error

# Validated categorical palette (light mode), fixed slot order; red is
# reserved for the supercritical status shading, never a data series.
BLUE, ORANGE, AQUA, YELLOW = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"
STATUS_RED = "#e34948"
TEXT, TEXT_MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#d9d8d4", "#fcfcfb"


def _style(ax, title, xlabel, ylabel):
    ax.set_facecolor(SURFACE)
    ax.set_title(title, color=TEXT, fontsize=11, loc="left")
    ax.set_xlabel(xlabel, color=TEXT_MUTED, fontsize=9)
    ax.set_ylabel(ylabel, color=TEXT_MUTED, fontsize=9)
    ax.grid(True, color=GRID, linewidth=0.5)
    ax.tick_params(colors=TEXT_MUTED, labelsize=8)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    return ax


def _legend(ax):
    ax.legend(loc="best", fontsize=8, frameon=False, labelcolor=TEXT)


def _finite(values):
    values = np.asarray(values, float)
    return np.where(np.isfinite(values), values, np.nan)


def plot_velocity(process, ax=None, count=500):
    """Plunger vs critical velocity over the stroke; supercritical shaded."""
    ax = ax or plt.subplots()[1]
    data = process.arrays(count, spacing="distance")
    stroke_mm = data["stroke"]*1000.0
    ax.plot(stroke_mm, data["velocity"], color=BLUE, linewidth=1.8,
            label="plunger")
    ax.plot(stroke_mm, _finite(data["critical_velocity"]), color=ORANGE,
            linewidth=1.8, label="critical")
    supercritical = data["velocity_margin"] < 0.0
    if np.any(supercritical):
        ax.fill_between(stroke_mm, 0.0, data["velocity"],
                        where=supercritical, color=STATUS_RED, alpha=0.10,
                        linewidth=0)
        crossing = process.critical_crossing()
        if crossing is not None:
            ax.plot([crossing.stroke_mm], [crossing.plunger_velocity], "o",
                    color=STATUS_RED, markersize=5)
            ax.annotate("supercritical", (crossing.stroke_mm,
                                          crossing.plunger_velocity),
                        textcoords="offset points", xytext=(6, 8),
                        fontsize=8, color=TEXT_MUTED)
    _style(ax, "Plunger velocity vs critical velocity", "stroke [mm]",
           "velocity [m/s]")
    _legend(ax)
    return ax


def plot_fills(process, ax=None, count=700, events=True):
    """Fill fractions of sleeve, runner, part and overflow over time."""
    ax = ax or plt.subplots()[1]
    data = process.arrays(count)
    series = [("sleeve", data["sleeve_fill"], BLUE),
              ("runner", data["runner_fill"], ORANGE),
              ("part", data["part_fill"], AQUA),
              ("overflow", data["overflow_fill"], YELLOW)]
    for name, values, color in series:
        ax.plot(data["time"], values, color=color, linewidth=1.8, label=name)
    if events:
        for event in process.events().values():
            if event.name in ("pour_hole_sealed", "sleeve_full",
                              "runner_full", "part_full", "fill_complete"):
                ax.axvline(event.time, color=GRID, linewidth=0.8,
                           linestyle="--", zorder=0)
    ax.set_xlim(0.0, process.total_time)
    _style(ax, "Fill fractions", "time [s]", "fill [-]")
    _legend(ax)
    return ax


def plot_air_pressure(process, ax=None, count=700, log=True):
    """Lumped air pressure over time; vacuum window shaded."""
    ax = ax or plt.subplots()[1]
    data = process.arrays(count)
    ax.plot(data["time"], _finite(data["air_pressure"])/1e3, color=BLUE,
            linewidth=1.8)
    if process.vacuum is not None:
        start = process.time_of("vacuum_start")
        end = process.time_of("vacuum_end")
        ax.axvspan(start, end, color=BLUE, alpha=0.06, linewidth=0)
        ax.annotate("vacuum active", (start, ax.get_ylim()[1]),
                    textcoords="offset points", xytext=(4, -12),
                    fontsize=8, color=TEXT_MUTED)
    if log:
        ax.set_yscale("log")
    _style(ax, "Air pressure", "time [s]", "pressure [kPa]")
    return ax


def plot_temperature(process, ax=None, count=700):
    """Melt temperature over time (needs an attached ThermalModel)."""
    ax = ax or plt.subplots()[1]
    data = process.arrays(count)
    temps = _finite(data["melt_temperature"])
    if np.all(np.isnan(temps)):
        ax.text(0.5, 0.5, "no thermal model attached",
                transform=ax.transAxes, ha="center", va="center",
                fontsize=9, color=TEXT_MUTED)
    else:
        ax.plot(data["time"], temps, color=BLUE, linewidth=1.8)
        for name in ("dosing_end", "shot_start"):
            ax.axvline(process.time_of(name), color=GRID, linewidth=0.8,
                       linestyle="--", zorder=0)
    _style(ax, "Melt temperature", "time [s]", "temperature")
    return ax


def plot_flow_rates(process, ax=None, count=700):
    """Plunger sweep and gate flow rates over time."""
    ax = ax or plt.subplots()[1]
    data = process.arrays(count)
    ax.plot(data["time"], data["plunger_flow_rate"]*1e3, color=BLUE,
            linewidth=1.8, label="plunger")
    ax.plot(data["time"], data["gate_flow_rate"]*1e3, color=ORANGE,
            linewidth=1.8, label="gate")
    _style(ax, "Flow rates", "time [s]", "flow [l/s]")
    _legend(ax)
    return ax


def plot_wetted_areas(process, ax=None, count=700):
    """Sleeve and downstream melt-contact areas over time."""
    ax = ax or plt.subplots()[1]
    data = process.arrays(count)
    ax.plot(data["time"], data["wetted_area"]*1e4, color=BLUE,
            linewidth=1.8, label="sleeve")
    ax.plot(data["time"], data["downstream_wetted_area"]*1e4, color=ORANGE,
            linewidth=1.8, label="downstream")
    _style(ax, "Wetted areas", "time [s]", "area [cm²]")
    _legend(ax)
    return ax


def shot_overview(process, filename=None, count=700):
    """Six-panel overview figure; optionally saved to `filename`."""
    fig, axes = plt.subplots(3, 2, figsize=(11.5, 10.5), layout="constrained")
    fig.patch.set_facecolor(SURFACE)
    plot_velocity(process, axes[0][0], count=count)
    plot_fills(process, axes[0][1], count=count)
    plot_air_pressure(process, axes[1][0], count=count)
    plot_temperature(process, axes[1][1], count=count)
    plot_flow_rates(process, axes[2][0], count=count)
    plot_wetted_areas(process, axes[2][1], count=count)
    sleeve = process.sleeve
    fig.suptitle(
        f"HPDC shot — D {sleeve.diameter*1000:.0f} mm, "
        f"L {sleeve.length*1000:.0f} mm, "
        f"fill {sleeve.fill_fraction:.0%}, "
        f"biscuit {process.biscuit_length*1000:.1f} mm",
        color=TEXT, fontsize=13)
    if filename is not None:
        fig.savefig(filename, dpi=150)
    return fig
