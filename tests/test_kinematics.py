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

from bkhexapod.leg import Leg, Joint, BodySide, LegRow, LegIdentifier
from bkhexapod.servos import Servo, PWMDriverProtocol
from bkhexapod.config import ServoConfig

# A mock driver that does nothing, just to satisfy the protocol.
class MinimalMockDriver(PWMDriverProtocol):
    def set_pwm(self, channel: int, on: int, off: int) -> None:
        pass
    def set_pwm_freq(self, freq: float) -> None:
        pass

@pytest.fixture
def sample_leg() -> Leg:
    """Provides a standard Leg object for testing."""
    # 1. Create mock configurations for the three servos of a leg
    coxa_config = ServoConfig(name="test_coxa", board_address=0x40, channel=0, center_offset_pulse=0, pulse_range=2000, min_angle=-45, max_angle=45, orientation=1)
    femur_config = ServoConfig(name="test_femur", board_address=0x40, channel=1, center_offset_pulse=0, pulse_range=2000, min_angle=-90, max_angle=90, orientation=1)
    tibia_config = ServoConfig(name="test_tibia", board_address=0x40, channel=2, center_offset_pulse=0, pulse_range=2000, min_angle=-90, max_angle=90, orientation=1)

    # 2. Create mock Servo objects
    mock_driver = MinimalMockDriver()
    coxa_servo = Servo(config=coxa_config, driver=mock_driver)
    femur_servo = Servo(config=femur_config, driver=mock_driver)
    tibia_servo = Servo(config=tibia_config, driver=mock_driver)

    # 3. Create Joint objects with known physical lengths
    coxa_joint = Joint(servo=coxa_servo, length=52.0)
    femur_joint = Joint(servo=femur_servo, length=70.0)
    tibia_joint = Joint(servo=tibia_servo, length=135.0)

    # 4. Assemble and return the Leg object
    return Leg(
        side=BodySide.LEFT,
        row=LegRow.FRONT,
        coxa=coxa_joint,
        femur=femur_joint,
        tibia=tibia_joint
    )

def test_ik_straight_forward(sample_leg: Leg):
    """Tests the IK for a simple target straight ahead."""
    # Target is 150mm straight ahead from the coxa joint, and 50mm down.
    x, y, z = 150.0, 0.0, -50.0

    coxa_angle, femur_angle, tibia_angle = sample_leg._calculate_inverse_kinematics(x, y, z)

    # For a target with y=0, the coxa angle must be 0.
    assert coxa_angle == pytest.approx(0.0)

    # Expected angles for this 2D case (can be pre-calculated)
    # These values depend on the exact IK math, let's test against reasonable approximations.
    # A full extension would be ~90 degrees for femur, so this should be less.
    # A bent tibia will have a positive angle.
    assert femur_angle == pytest.approx(62.3, abs=0.1)
    assert tibia_angle == pytest.approx(100.3, abs=0.1)

def test_ik_unreachable(sample_leg: Leg):
    """Tests that the IK correctly identifies an unreachable target."""
    # This target is far outside the combined length of femur and tibia (70 + 135 = 205).
    x, y, z = 500.0, 0.0, 0.0

    with pytest.raises(ValueError, match="Target is out of reach."):
        sample_leg._calculate_inverse_kinematics(x, y, z)

def test_ik_at_max_reach(sample_leg: Leg):
    """Tests the IK at the maximum possible reach of the leg."""
    # Target is exactly at the sum of coxa, femur, and tibia lengths horizontally.
    max_reach = sample_leg.coxa.length + sample_leg.femur.length + sample_leg.tibia.length
    x, y, z = max_reach, 0.0, 0.0

    coxa_angle, femur_angle, tibia_angle = sample_leg._calculate_inverse_kinematics(x, y, z)

    # Expected angles for a fully stretched leg.
    assert coxa_angle == pytest.approx(0.0)
    assert femur_angle == pytest.approx(0.0)
    assert tibia_angle == pytest.approx(180.0, abs=0.1)
