"""
Unit tests for the inverse kinematics calculations.
"""

import sys
from pathlib import Path

# Add the project root to the Python path to allow absolute imports
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.append(str(PROJECT_ROOT))

import pytest
import math

from lasius.core.motion import Leg, Joint, BodySide, LegRow, LegIdentifier
from lasius.core.hardware import Servo, PWMDriverProtocol
from lasius.core.config import ServoConfig

# A mock driver that does nothing, just to satisfy the protocol.
class MinimalMockDriver(PWMDriverProtocol):
    def set_pwm(self, channel: int, on: int, off: int) -> None:
        pass
    def set_pwm_freq(self, freq: float) -> None:
        pass

@pytest.fixture
def sample_leg() -> Leg:
    """Provides a standard Leg object with physical dimensions for testing."""
    # 1. Create mock configurations for the three servos of a leg
    coxa_config = ServoConfig(name="test_coxa", board_address=0x40, channel=0, center_offset_pulse=0, pulse_range=2000, min_angle=-45, max_angle=45, orientation=1)
    femur_config = ServoConfig(name="test_femur", board_address=0x40, channel=1, center_offset_pulse=0, pulse_range=2000, min_angle=-90, max_angle=90, orientation=1)
    tibia_config = ServoConfig(name="test_tibia", board_address=0x40, channel=2, center_offset_pulse=0, pulse_range=2000, min_angle=-90, max_angle=90, orientation=1)

    # 2. Create mock Servo objects
    mock_driver = MinimalMockDriver()
    coxa_servo = Servo(config=coxa_config, driver=mock_driver)
    femur_servo = Servo(config=femur_config, driver=mock_driver)
    tibia_servo = Servo(config=tibia_config, driver=mock_driver)

    # 3. Create Joint objects with physical lengths (6cm Coxa, 10cm Femur, 13cm Tibia)
    coxa_joint = Joint(servo=coxa_servo, length=60.0)
    femur_joint = Joint(servo=femur_servo, length=100.0)
    tibia_joint = Joint(servo=tibia_servo, length=130.0)

    # 4. Assemble and return the Leg object
    return Leg(
        side=BodySide.LEFT,
        row=LegRow.FRONT,
        coxa=coxa_joint,
        femur=femur_joint,
        tibia=tibia_joint
    )

def test_ik_straight_forward(sample_leg: Leg):
    """Tests the IK for a target straight ahead in natural knee-up posture."""
    # Target is 150mm straight ahead from the coxa joint, and 50mm down.
    x, y, z = 150.0, 0.0, -50.0

    coxa_angle, femur_angle, tibia_angle = sample_leg._calculate_inverse_kinematics(x, y, z)

    # For a target with y=0, the coxa angle must be 0.
    assert coxa_angle == pytest.approx(0.0)

    # Natural insect posture:
    # Femur rises above horizontal (femur_angle > 0)
    # Tibia servo angle is relative to 90° horn mounting (0° servo = 90° knee bend)
    assert femur_angle == pytest.approx(50.59, abs=0.1)
    assert tibia_angle == pytest.approx(38.82, abs=0.1)

def test_ik_unreachable(sample_leg: Leg):
    """Tests that the IK correctly identifies an unreachable target."""
    # Target is far outside the combined length of femur and tibia (100 + 130 = 230).
    x, y, z = 500.0, 0.0, 0.0

    with pytest.raises(ValueError, match="Target is out of reach."):
        sample_leg._calculate_inverse_kinematics(x, y, z)

def test_ik_at_max_reach(sample_leg: Leg):
    """Tests the IK at the maximum possible reach of the leg."""
    # Target is exactly at the sum of coxa, femur, and tibia lengths horizontally (60 + 100 + 130 = 290).
    max_reach = sample_leg.coxa.length + sample_leg.femur.length + sample_leg.tibia.length
    x, y, z = max_reach, 0.0, 0.0

    coxa_angle, femur_angle, tibia_angle = sample_leg._calculate_inverse_kinematics(x, y, z)

    # Expected angles for a fully stretched leg:
    # Femur is horizontal (0.0°), Tibia is straight out (knee bend 0°, so servo angle = -90.0°)
    assert coxa_angle == pytest.approx(0.0)
    assert femur_angle == pytest.approx(0.0)
    assert tibia_angle == pytest.approx(-90.0, abs=0.1)
