"""
Backward-Compatibility Shims for Legacy `lasius_pilot` Imports (`lasius_pilot.py`).

Purpose & Role:
    Re-exports `GamepadController` and `LinuxJoystickReader` from `lasius.pilot.gamepad`
    so older scripts importing `lasius_pilot` directly continue to work seamlessly.
"""

from lasius.pilot.gamepad import GamepadController, LinuxJoystickReader

__all__ = ["GamepadController", "LinuxJoystickReader"]
