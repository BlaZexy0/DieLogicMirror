import os
import tempfile

try:
    import matplotlib
    matplotlib.use("Agg")
    HAVE_MATPLOTLIB = True
except ImportError:
    HAVE_MATPLOTLIB = False

from common import build_process
from hpdcsim import IdealVacuum, LumpedCapacitance, VacuumSystem


def make_process():
    return build_process(
        vacuum=VacuumSystem(0.15, IdealVacuum(8e3), end_position=0.42),
        thermal=LumpedCapacitance(1500.0, 200.0))


def test_single_panels_return_axes_with_lines():
    if not HAVE_MATPLOTLIB:
        return
    import matplotlib.pyplot as plt
    from hpdcsim import plotting
    process = make_process()
    for plot in (plotting.plot_velocity, plotting.plot_fills,
                 plotting.plot_air_pressure, plotting.plot_temperature,
                 plotting.plot_flow_rates, plotting.plot_wetted_areas):
        ax = plot(process, count=60)
        assert len(ax.get_lines()) >= 1
        plt.close(ax.figure)


def test_temperature_panel_without_thermal_model():
    if not HAVE_MATPLOTLIB:
        return
    import matplotlib.pyplot as plt
    from hpdcsim import plotting
    ax = plotting.plot_temperature(build_process(), count=40)
    assert len(ax.get_lines()) == 0 and len(ax.texts) == 1
    plt.close(ax.figure)


def test_overview_figure_and_file_export():
    if not HAVE_MATPLOTLIB:
        return
    import matplotlib.pyplot as plt
    from hpdcsim import plotting
    path = os.path.join(tempfile.gettempdir(), "hpdcsim_overview.png")
    fig = plotting.shot_overview(make_process(), filename=path, count=80)
    assert len(fig.axes) == 6
    assert os.path.getsize(path) > 10_000
    os.remove(path)
    plt.close(fig)
