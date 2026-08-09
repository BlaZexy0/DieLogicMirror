from common import build_casting, build_sleeve, raises
from hpdcsim import (CastingSystem, Environment, IdealVacuum, Melt, Overflow,
                     Part, Runner, ShotSleeve, VacuumSystem)


def test_sleeve_properties_and_validation():
    sleeve = build_sleeve()
    assert abs(sleeve.melt_volume - 0.35*sleeve.volume) < 1e-15
    assert abs(sleeve.stroke_to_fill - 0.5*0.65) < 1e-12
    raises(ValueError, ShotSleeve, -0.09, 0.5, 0.35, 0.12)
    raises(ValueError, ShotSleeve, 0.09, 0.5, 1.0, 0.12)
    raises(ValueError, ShotSleeve, 0.09, 0.5, 0.35, 0.6)
    raises(ValueError, ShotSleeve, 0.09, 0.5, 0.35, 0.12, pour_hole_area=0.0)


def test_melt_validation():
    raises(ValueError, Melt, -1.0, 1050.0, 680.0)
    raises(ValueError, Melt, 2400.0, 1050.0, 680.0, liquidus=540.0, solidus=595.0)
    raises(ValueError, Melt, 2400.0, 1050.0, 680.0, latent_heat=-1.0)


def test_casting_distribute_order_and_regions():
    casting = build_casting()
    vr, vp, vo, region = casting.distribute(100e-6)
    assert (vr, vp, vo, region) == (100e-6, 0.0, 0.0, "runner")
    vr, vp, vo, region = casting.distribute(400e-6)
    assert abs(vr - 250e-6) < 1e-15 and abs(vp - 150e-6) < 1e-15
    assert region == "part"
    vr, vp, vo, region = casting.distribute(950e-6)
    assert region == "overflow" and abs(vo - 20e-6) < 1e-15
    assert casting.distribute(2000e-6)[3] == "complete"


def test_casting_wetted_area_skips_missing_surfaces():
    casting = CastingSystem(Runner(volume=250e-6, surface_area=0.03),
                            Part(volume=680e-6), Overflow(90e-6))
    assert abs(casting.wetted_area(0.5, 1.0, 1.0) - 0.015) < 1e-15


def test_component_validation():
    raises(ValueError, Runner, -1e-6)
    raises(ValueError, Runner, 250e-6, gate_area=0.0)
    raises(ValueError, Part, 0.0)
    raises(ValueError, Overflow, -1e-6)
    raises(ValueError, CastingSystem, Runner(1e-6), Part(1e-6),
           Overflow(0.0), 0.0)


def test_environment_defaults_and_validation():
    env = Environment()
    assert env.ambient_pressure == 101325.0
    assert env.heat_capacity_ratio == 1.4
    raises(ValueError, Environment, ambient_temperature=-1.0)
    raises(ValueError, Environment, heat_capacity_ratio=1.0)


def test_vacuum_system_optional_end():
    vacuum = VacuumSystem(start_position=0.15, model=IdealVacuum(8e3))
    assert vacuum.end_position is None
    raises(ValueError, vacuum.active, 0.2)  # unresolved until process build
    raises(ValueError, VacuumSystem, 0.3, IdealVacuum(8e3), 0.2)
    raises(ValueError, VacuumSystem, 0.15, IdealVacuum(8e3), 0.42, 0.0)
