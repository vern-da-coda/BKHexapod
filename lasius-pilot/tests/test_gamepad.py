"""
Unit tests for Lasius Gamepad controller logic.
"""

from lasius.pilot.gamepad import GamepadController


def test_gamepad_initialization():
    controller = GamepadController(device_path="/dev/null", deadzone=0.15)
    assert controller.deadzone == 0.15
    assert controller.axes[0] == 0.0
    assert controller.axes[1] == 0.0


def test_gamepad_deadzone():
    controller = GamepadController(device_path="/dev/null", deadzone=0.10)
    # Below deadzone -> 0.0
    assert controller.apply_deadzone(0.05) == 0.0
    assert controller.apply_deadzone(-0.08) == 0.0

    # Above deadzone -> smoothly scaled
    res = controller.apply_deadzone(0.55)
    assert res > 0.0
    assert res <= 1.0


def test_gamepad_locomotion_mapping():
    controller = GamepadController(device_path="/dev/null", deadzone=0.10)
    controller.axes[0] = 0.5   # Strafe right
    controller.axes[1] = -0.8  # Forward (inverted in Linux js)
    controller.axes[3] = 0.25  # Turn

    cmd = controller.get_locomotion_command()
    assert cmd["walk_x"] == 0.5
    assert cmd["walk_y"] == 0.8  # Inverted to +0.8 forward
    assert cmd["turn_z"] == -0.25
