"""Vent channels with friction, the tank model and the valve's closing
options — the physics the dashboard's four vacuum models rest on."""
import numpy as np

from common import build_process, raises
from hpdcsim import (ATMOSPHERE, ConductanceVacuum, TankVacuum, VacuumSystem,
                     VentChannel, channel_mass_flow, choking_ratio,
                     orifice_mass_flow, process_from_dict, slit_friction_factor)

AIR = dict(temperature=293.15, gas_constant=287.05, viscosity=1.82e-5)
CHANNEL = VentChannel(gap=0.5e-3, length=0.08)


def with_vacuum(model, **kwargs):
    return build_process(vacuum=VacuumSystem(0.15, model, valve_area=8e-4,
                                             **kwargs))


# --- flow law ---
def test_choking_ratio_solves_its_equation():
    for loss in (0.5, 1.0, 1.5, 3.9, 25.0):
        r = choking_ratio(loss)
        assert r > 1.0
        assert abs(r*r - 2.0*np.log(r) - 1.0 - loss) < 1e-9
    assert choking_ratio(0.0) == 1.0


def test_slit_friction_factor_regimes():
    # laminar branch of the wide slit: f = 96/Re
    assert abs(slit_friction_factor(100.0)*100.0 - 96.0) < 0.5
    # turbulent smooth: Blasius-like magnitude, decreasing with Re
    f1, f2 = slit_friction_factor(1e4), slit_friction_factor(1e5)
    assert 0.015 < f2 < f1 < 0.04
    # roughness raises the turbulent factor
    assert slit_friction_factor(1e5, 1e-2) > f2


def test_channel_flow_is_zero_without_forward_drop():
    assert channel_mass_flow(CHANNEL, 8e-4, 1e5, 1e5, **AIR)[0] == 0.0
    assert channel_mass_flow(CHANNEL, 8e-4, 1e5, 2e5, **AIR)[0] == 0.0
    assert channel_mass_flow(CHANNEL, 0.0, 1e5, 1e3, **AIR)[0] == 0.0


def test_channel_flow_chokes_and_is_monotone_in_back_pressure():
    choked_a = channel_mass_flow(CHANNEL, 8e-4, 1e5, 1e3, **AIR)[0]
    choked_b = channel_mass_flow(CHANNEL, 8e-4, 1e5, 1e4, **AIR)[0]
    assert abs(choked_a - choked_b) < 1e-9*choked_a   # sink no longer matters
    flows = [channel_mass_flow(CHANNEL, 8e-4, 1e5, p, **AIR)[0]
             for p in np.linspace(1e3, 0.999e5, 300)]
    assert all(b <= a + 1e-12 for a, b in zip(flows, flows[1:]))
    assert flows[-1] > 0.0
    # linear in area
    assert abs(channel_mass_flow(CHANNEL, 16e-4, 1e5, 1e3, **AIR)[0]
               - 2.0*choked_a) < 1e-9*choked_a


def test_short_channel_is_an_isothermal_nozzle():
    # Vanishing length and no entry loss: only the acceleration term
    # remains; choked flux = p/(r sqrt(RT)) with r^2 - 2 ln r = 2.
    nozzle = VentChannel(gap=0.5e-3, length=1e-9, entry_loss=0.0)
    flow = channel_mass_flow(nozzle, 1e-4, 1e5, 1e3, **AIR)[0]
    r = choking_ratio(1.0)
    expected = 1e-4*1e5/(r*np.sqrt(287.05*293.15))
    assert abs(flow - expected) < 1e-3*expected
    # below the isentropic orifice (isothermal sound speed is lower)
    assert flow < orifice_mass_flow(1.0, 1e-4, 1e5, 1e3, 293.15, 287.05, 1.4)
    assert flow > 0.75*orifice_mass_flow(1.0, 1e-4, 1e5, 1e3, 293.15, 287.05, 1.4)


def test_friction_reduces_flow_and_long_channels_reduce_it_more():
    orifice = orifice_mass_flow(0.8, 8e-4, 1e5, 8e3, 293.15, 287.05, 1.4)
    short = channel_mass_flow(VentChannel(0.5e-3, 0.02), 8e-4, 1e5, 8e3, **AIR)[0]
    long = channel_mass_flow(VentChannel(0.5e-3, 0.30), 8e-4, 1e5, 8e3, **AIR)[0]
    assert long < short < orifice
    assert long < 0.6*orifice


def test_low_pressure_small_drop_is_poiseuille_flow():
    # 100 mbar against 80 mbar: laminar, viscous — mass flux follows
    # gap^2 (p1^2 - p2^2)/(24 mu L R T) within a few percent (the small
    # remainder is the acceleration/entry term).
    p1, p2 = 1e4, 8e3
    flow, f = channel_mass_flow(CHANNEL, 8e-4, p1, p2, **AIR)
    flux = flow/8e-4
    reynolds = flux*CHANNEL.hydraulic_diameter/AIR["viscosity"]
    assert reynolds < 500
    poiseuille = CHANNEL.gap**2*(p1*p1 - p2*p2)/(
        24.0*AIR["viscosity"]*CHANNEL.length*287.05*293.15)
    assert 0.9*poiseuille < flux < poiseuille
    # far below what an orifice would pass at the same conditions
    assert flow < 0.3*orifice_mass_flow(0.8, 8e-4, p1, p2, 293.15, 287.05, 1.4)
    # halving the drop of the squared pressures roughly halves the flow
    # (linear in p1^2 - p2^2, as Poiseuille says — an orifice would scale
    # with the square root of the pressure difference instead)
    half_drop = np.sqrt((p1*p1 + p2*p2)/2.0)
    flow2 = channel_mass_flow(CHANNEL, 8e-4, p1, half_drop, **AIR)[0]
    assert 0.45*flow < flow2 < 0.55*flow


def test_friction_seed_does_not_change_the_result():
    a, f = channel_mass_flow(CHANNEL, 8e-4, 5e4, 3e4, **AIR)
    b, _ = channel_mass_flow(CHANNEL, 8e-4, 5e4, 3e4, **AIR, friction_factor=f)
    c, _ = channel_mass_flow(CHANNEL, 8e-4, 5e4, 3e4, **AIR, friction_factor=0.5)
    assert abs(a - b) < 1e-6*a and abs(a - c) < 1e-6*a


def test_vent_channel_validation():
    raises(ValueError, VentChannel, 0.0, 0.1)
    raises(ValueError, VentChannel, 1e-3, 0.0)
    raises(ValueError, VentChannel, 1e-3, 0.1, entry_loss=-1.0)
    assert VentChannel(1e-3, 0.1).hydraulic_diameter == 2e-3


# --- models ---
def test_channel_valve_vents_slower_than_orifice_valve():
    orifice = with_vacuum(ConductanceVacuum(8e3))
    channel = with_vacuum(ConductanceVacuum(8e3), valve_channel=CHANNEL)
    p_o, p_c = orifice.air_pressure_at_stroke(0.40), channel.air_pressure_at_stroke(0.40)
    assert 8e3 <= p_o < p_c < ATMOSPHERE


def test_tank_pressure_rises_with_the_received_air():
    process = with_vacuum(TankVacuum(0.5, 8e3), valve_channel=CHANNEL)
    solution = process.air_solution()
    tank = solution["tank_pressure"]
    shot = solution["time"] >= process.shot_start_time
    assert np.nanmin(tank) >= 8e3
    assert all(b >= a - 1e-9 for a, b in zip(tank[shot], tank[shot][1:]))
    assert np.nanmax(tank) > 8e3*1.03           # noticeably up ...
    assert np.nanmax(tank) < 8e3*1.5            # ... but a 500 L tank holds
    assert process.air_pressure_at_stroke(0.40) > 8e3


def test_tank_conserves_the_vented_air_mass():
    process = with_vacuum(TankVacuum(0.5, 8e3), valve_channel=CHANNEL)
    env = process.environment
    gas_rt = env.gas_constant*env.ambient_temperature
    solution = process.air_solution()
    times, p_air, p_tank = (solution["time"], solution["pressure"],
                            solution["tank_pressure"])
    t_open = process.time_of("vacuum_start")
    t_close = process.time_of("vacuum_end")
    i0 = int(np.searchsorted(times, t_open))
    i1 = int(np.searchsorted(times, t_close)) - 1
    die = lambda i: p_air[i]*process.air_volume_at_time(times[i])/gas_rt
    lost = die(i0) - die(i1)
    gained = (p_tank[i1] - p_tank[i0])*0.5/gas_rt
    assert lost > 0.0
    assert abs(lost - gained) < 0.02*lost


def test_small_tank_fills_up_and_large_tank_matches_constant_plenum():
    small = with_vacuum(TankVacuum(0.01, 8e3), valve_channel=CHANNEL)
    huge = with_vacuum(TankVacuum(1e4, 8e3), valve_channel=CHANNEL)
    plenum = with_vacuum(ConductanceVacuum(8e3), valve_channel=CHANNEL)
    assert np.nanmax(small.air_solution()["tank_pressure"]) > 2*8e3
    assert small.air_pressure_at_stroke(0.40) > 2*plenum.air_pressure_at_stroke(0.40)
    assert abs(huge.air_pressure_at_stroke(0.40)
               - plenum.air_pressure_at_stroke(0.40)) < 1e-3*8e3


def test_tank_pump_holds_the_pressure_down():
    without = with_vacuum(TankVacuum(0.05, 8e3), valve_channel=CHANNEL)
    pumped = with_vacuum(TankVacuum(0.05, 8e3, pump_speed=5.0),
                         valve_channel=CHANNEL)
    assert (np.nanmax(pumped.air_solution()["tank_pressure"])
            < np.nanmax(without.air_solution()["tank_pressure"]))


def test_tank_validation():
    raises(ValueError, TankVacuum, 0.0, 8e3)
    raises(ValueError, TankVacuum, 0.5, 0.0)
    raises(ValueError, TankVacuum, 0.5, 8e3, pump_speed=-1.0)
    raises(ValueError, TankVacuum, 0.5, 8e3, ultimate_pressure=9e3)
    # a plain orifice valve (no channel) is fine
    assert np.isfinite(with_vacuum(TankVacuum(0.5, 8e3)).air_pressure_at_stroke(0.3))
    # no valve_area at all -> the vented models refuse
    process = build_process(vacuum=VacuumSystem(0.15, TankVacuum(0.5, 8e3)))
    raises(ValueError, process.air_pressure_at_stroke, 0.3)


def test_no_vacuum_with_channel_vents_to_ambient_only():
    # chill vents with a channel: air never drops below ambient and does
    # not pile up as in the sealed case
    from common import build_casting
    casting = build_casting(vent_area=8e-4, vent_channel=CHANNEL)
    process = build_process(
        casting=casting,
        vacuum=VacuumSystem(0.15, ConductanceVacuum(8e3), end_position=0.16,
                            valve_area=1e-9))
    sealed = build_process()
    p = process.air_pressure_at_stroke(0.35)
    assert ATMOSPHERE*0.99 <= p < sealed.air_pressure_at_stroke(0.35)


# --- valve closing ---
def test_valve_duration_resolves_along_the_profile():
    process = with_vacuum(ConductanceVacuum(8e3), duration=0.05)
    end = process.vacuum.end_position
    assert 0.15 < end < 0.42
    t_open = process.profile.time_at_position(0.15)
    assert abs(process.profile.time_at_position(end) - (t_open + 0.05)) < 1e-9
    assert process.vacuum.duration is None       # resolved, not kept twice
    assert process.vacuum.active(end - 1e-6) and not process.vacuum.active(end)
    # after closing: sealed compression from the closing state
    p_close = process.air_pressure_at_stroke(end)
    assert process.air_pressure_at_stroke(0.40) > 1.5*p_close


def test_valve_duration_longer_than_the_shot_ends_at_fill():
    process = with_vacuum(ConductanceVacuum(8e3), duration=100.0)
    default = with_vacuum(ConductanceVacuum(8e3))
    assert abs(process.vacuum.end_position - default.vacuum.end_position) < 1e-12


def test_valve_end_position_before_fill_seals_the_rest():
    early = with_vacuum(ConductanceVacuum(8e3), end_position=0.25)
    late = with_vacuum(ConductanceVacuum(8e3))
    assert early.time_of("vacuum_end") < late.time_of("vacuum_end")
    assert early.air_pressure_at_stroke(0.40) > late.air_pressure_at_stroke(0.40)


def test_vacuum_system_duration_validation():
    raises(ValueError, VacuumSystem, 0.15, ConductanceVacuum(8e3), duration=0.0)
    raises(ValueError, VacuumSystem, 0.15, ConductanceVacuum(8e3),
           end_position=0.3, duration=0.1)
    raises(ValueError, VacuumSystem, 0.15, ConductanceVacuum(8e3),
           valve_channel=CHANNEL)                 # channel without area


# --- JSON ---
def test_config_tank_model_and_nested_channels():
    from test_config import full_config
    config = full_config()
    config["casting"]["vent_channel"] = {"gap": 0.3e-3, "length": 0.05}
    config["vacuum"] = {"start_position": 0.15, "valve_area": 8e-4,
                       "valve_channel": {"gap": 0.5e-3, "length": 0.08},
                       "duration": 0.05,
                       "model": {"type": "tank", "tank_volume": 0.5,
                                 "tank_pressure": 8e3}}
    process = process_from_dict(config)
    assert isinstance(process.air_model, TankVacuum)
    assert process.vacuum.valve_channel == CHANNEL
    assert process.casting.vent_channel.gap == 0.3e-3
    assert "tank_pressure" in process.air_solution()
    assert 0.15 < process.vacuum.end_position < process.fill_complete_stroke
    config["vacuum"]["valve_channel"] = {"gap": 0.5e-3, "width": 1.0}
    raises(ValueError, process_from_dict, config)
