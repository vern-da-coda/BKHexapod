"""
Unit Tests for Lasius Gamepad Controller (`lasius-pilot/tests/test_gamepad.py`).

Purpose & Role:
    Validates `GamepadController` axis initialization, radial deadzone filtering
    and rescaling, Google Stadia Controller profile (`Axis 2` = Right Stick X,
    ignoring `Axis 3` vertical deflection), and Stadia button/D-Pad action mapping.
"""

from lasius.pilot.gamepad import (
    GamepadController,
    load_all_gamepad_profiles,
    STADIA_BTN_A,
    STADIA_BTN_B,
    STADIA_BTN_X,
    STADIA_BTN_Y,
    STADIA_BTN_L1,
    STADIA_BTN_R1,
    STADIA_BTN_STADIA,
    PS5_BTN_CROSS,
    PS5_BTN_CIRCLE,
    PS5_BTN_SQUARE,
    PS5_BTN_TRIANGLE,
    PS5_BTN_OPTIONS,
    PS5_BTN_CREATE,
    PS5_BTN_PS,
)


def test_yaml_gamepad_profiles_loaded():
    profiles = load_all_gamepad_profiles()
    assert set(profiles.keys()) >= {"ps5", "stadia", "xbox"}

    ps5 = profiles["ps5"]
    assert ps5.name == "Sony PS5 DualSense"
    assert ps5.axes.turn_z == 3
    assert ps5.buttons.gait_ripple == 3
    assert ps5.buttons.gait_wave == 2

    stadia = profiles["stadia"]
    assert stadia.name == "Google Stadia Controller"
    assert stadia.axes.turn_z == 2
    assert stadia.buttons.gait_ripple == 2
    assert stadia.buttons.gait_wave == 3


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
    controller.axes[3] = 0.25  # Turn (fallback in auto mode)

    cmd = controller.get_locomotion_command()
    assert cmd["walk_x"] == 0.5
    assert cmd["walk_y"] == 0.8  # Inverted to +0.8 forward
    assert cmd["turn_z"] == -0.25


def test_stadia_controller_profile_and_buttons():
    controller = GamepadController(device_path="/dev/null", deadzone=0.10, profile="stadia")
    assert controller.active_profile == "stadia"

    # On Stadia, Axis 2 is Right Stick X and Axis 3 is Right Stick Y (which must not trigger turn_z)
    controller.axes[0] = -0.4
    controller.axes[1] = -1.0
    controller.axes[2] = 0.6   # Stadia Right Stick X
    controller.axes[3] = 0.9   # Stadia Right Stick Y (should be ignored for turn_z)

    cmd = controller.get_locomotion_command()
    assert cmd["walk_x"] == -0.4
    assert cmd["walk_y"] == 1.0
    assert cmd["turn_z"] == -0.6

    # Verify Stadia button & D-Pad action translation
    events = [
        {"type": "button", "button": STADIA_BTN_A, "pressed": True},
        {"type": "button", "button": STADIA_BTN_X, "pressed": True},
        {"type": "button", "button": STADIA_BTN_Y, "pressed": True},
        {"type": "button", "button": STADIA_BTN_R1, "pressed": True},
        {"type": "button", "button": STADIA_BTN_L1, "pressed": True},
        {"type": "button", "button": STADIA_BTN_B, "pressed": True},
        {"type": "button", "button": STADIA_BTN_STADIA, "pressed": True},
        {"type": "axis", "axis": 7, "value": -1.0, "prev_value": 0.0},
    ]
    actions = controller.translate_events_to_actions(events)
    assert {"type": "command", "action": "set_gait_type", "value": "tripod"} in actions
    assert {"type": "command", "action": "set_gait_type", "value": "ripple"} in actions
    assert {"type": "command", "action": "set_gait_type", "value": "wave"} in actions
    assert {"type": "command", "action": "emergency_stop"} in actions
    assert {"type": "command", "action": "set_height", "value": -85.0} in actions


def test_ps5_dualsense_profile_and_buttons():
    controller = GamepadController(device_path="/dev/null", deadzone=0.10, profile="auto")
    # Simulate Sony DualSense device name auto-detection
    controller.device_name = "Sony Interactive Entertainment DualSense Wireless Controller"
    assert controller.active_profile == "ps5"

    # On PS5 DualSense (/dev/input/js0), Axis 2 is L2 Trigger (-1.0 at rest) and Axis 3 is Right Stick X
    controller.axes[0] = 0.3
    controller.axes[1] = -0.75
    controller.axes[2] = -1.0   # Unpressed L2 trigger (must NOT cause constant turning!)
    controller.axes[3] = -0.5   # Right Stick X deflected left

    cmd = controller.get_locomotion_command()
    assert cmd["walk_x"] == 0.3
    assert cmd["walk_y"] == 0.75
    assert cmd["turn_z"] == 0.5

    # Verify PS5 button translation (Cross=0, Circle=1, Triangle=2, Square=3, Create=8, Options=9, PS=10)
    events = [
        {"type": "button", "button": PS5_BTN_CROSS, "pressed": True},
        {"type": "button", "button": PS5_BTN_SQUARE, "pressed": True},
        {"type": "button", "button": PS5_BTN_TRIANGLE, "pressed": True},
        {"type": "button", "button": PS5_BTN_CIRCLE, "pressed": True},
        {"type": "button", "button": PS5_BTN_PS, "pressed": True},
        {"type": "button", "button": PS5_BTN_OPTIONS, "pressed": True},
        {"type": "button", "button": PS5_BTN_CREATE, "pressed": True},
    ]
    actions = controller.translate_events_to_actions(events)
    assert {"type": "command", "action": "set_gait_type", "value": "tripod"} in actions
    assert {"type": "command", "action": "set_gait_type", "value": "ripple"} in actions
    assert {"type": "command", "action": "set_gait_type", "value": "wave"} in actions
    assert {"type": "command", "action": "emergency_stop"} in actions
    assert {"type": "command", "action": "reset_pose"} in actions
    assert {"type": "command", "action": "toggle_pause"} in actions
