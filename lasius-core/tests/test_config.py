"""
Unit tests for Hexapod configuration and geometry loading.
"""

from pathlib import Path
import sys
import tempfile
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.append(str(PROJECT_ROOT))

from lasius.core.config import (
    load_config,
    HexapodConfig,
    GeometryConfig,
    LimbConfig,
    ChassisConfig,
    DefaultStanceConfig,
    ServoConfig,
    update_servo_calibration,
)
from lasius.core.motion import LegIdentifier, BodySide, LegRow, OmniGait
from lasius.core.robot import Hexapod
from lasius.core.hardware import MockPWMDriver


def test_load_default_config():
    """Tests loading the default config.yaml / servos.yaml from package."""
    config = load_config()
    assert isinstance(config, HexapodConfig)
    assert len(config.servos) == 18

    # Verify physical limbs geometry
    geom = config.geometry
    assert geom.limbs.coxa == 60.0
    assert geom.limbs.femur == 100.0
    assert geom.limbs.tibia == 130.0

    # Verify chassis dimensions
    assert geom.chassis.width_front_rear == 130.0
    assert geom.chassis.width_middle == 150.0
    assert geom.chassis.axis_distance_longitudinal == 90.0

    # Verify default stance
    assert geom.default_stance.ground_clearance == 80.0
    assert geom.default_stance.foot_radius_offset == 120.0


def test_chassis_mount_points_calculation():
    """Tests chassis mount point coordinate generation."""
    chassis = ChassisConfig(
        width_front_rear=130.0,
        width_middle=150.0,
        axis_distance_longitudinal=90.0,
    )
    mounts = chassis.mount_points
    assert mounts["left_front"] == (-65.0, -90.0)
    assert mounts["left_middle"] == (-75.0, 0.0)
    assert mounts["left_rear"] == (-65.0, 90.0)
    assert mounts["right_front"] == (65.0, -90.0)
    assert mounts["right_middle"] == (75.0, 0.0)
    assert mounts["right_rear"] == (65.0, 90.0)


def test_custom_yaml_loading():
    """Tests loading a custom YAML configuration with customized dimensions."""
    custom_yaml = """
geometry:
  limbs:
    coxa: 50.0
    femur: 90.0
    tibia: 120.0
  chassis:
    width_front_rear: 120.0
    width_middle: 140.0
    axis_distance_longitudinal: 80.0
  default_stance:
    ground_clearance: 75.0
    foot_radius_offset: 110.0
servos:
  - name: "left_front_coxa"
    board_address: 0x40
    channel: 0
    center_offset_pulse: 10
    pulse_range: 2000
    min_angle: -45.0
    max_angle: 45.0
    orientation: 1
"""
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
        f.write(custom_yaml)
        f_path = Path(f.name)

    try:
        cfg = load_config(f_path)
        assert cfg.geometry.limbs.coxa == 50.0
        assert cfg.geometry.limbs.femur == 90.0
        assert cfg.geometry.limbs.tibia == 120.0
        assert cfg.geometry.chassis.width_front_rear == 120.0
        assert cfg.geometry.chassis.width_middle == 140.0
        assert cfg.geometry.chassis.axis_distance_longitudinal == 80.0
        assert cfg.geometry.default_stance.ground_clearance == 75.0
        assert len(cfg.servos) == 1
        assert cfg.servos[0].name == "left_front_coxa"
        assert cfg.servos[0].center_offset_pulse == 10
    finally:
        f_path.unlink()


def test_hexapod_uses_configured_limb_lengths():
    """Tests that Hexapod leg joints are built with limb lengths from config."""
    config = load_config()
    drivers = {sc.board_address: MockPWMDriver() for sc in config.servos}
    hexapod = Hexapod(config=config, drivers=drivers)
    for (side, row), leg in hexapod.legs.items():
        assert leg.coxa.length == config.geometry.limbs.coxa
        assert leg.femur.length == config.geometry.limbs.femur
        assert leg.tibia.length == config.geometry.limbs.tibia


def test_omnigait_applies_geometry():
    """Tests that OmniGait correctly inherits mount points and stance height from GeometryConfig."""
    custom_geom = GeometryConfig(
        limbs=LimbConfig(coxa=70.0, femur=110.0, tibia=140.0),
        chassis=ChassisConfig(width_front_rear=160.0, width_middle=180.0, axis_distance_longitudinal=100.0),
        default_stance=DefaultStanceConfig(ground_clearance=95.0, foot_radius_offset=130.0),
    )
    gait = OmniGait(geometry=custom_geom)
    assert gait.mount_points[LegIdentifier.LEFT_FRONT] == (-80.0, -100.0)
    assert gait.mount_points[LegIdentifier.RIGHT_MIDDLE] == (90.0, 0.0)
    assert gait.body_height == -95.0


def test_update_servo_calibration():
    """Tests updating servo calibration parameters in YAML files while preserving comments."""
    from lasius.core.config import update_servo_calibration
    content = """
servos:
  - name: "test_joint"
    board_address: 0x40
    channel: 5
    center_offset_pulse: 100  # Initial offset
    pulse_range: 2000
    min_angle: -45
    max_angle: 45
    orientation: 1
"""
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
        f.write(content)
        f_path = Path(f.name)

    try:
        success = update_servo_calibration(
            servo_name="test_joint",
            updates={"center_offset_pulse": -250, "orientation": -1},
            config_paths=[f_path]
        )
        assert success is True

        with open(f_path) as f:
            updated_text = f.read()

        assert "center_offset_pulse: -250  # Initial offset" in updated_text
        assert "orientation: -1" in updated_text
    finally:
        f_path.unlink()

