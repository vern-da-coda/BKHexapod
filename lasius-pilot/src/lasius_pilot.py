"""
Backward-compatibility alias for lasius.pilot.
"""

from lasius.pilot.gamepad import GamepadController, LinuxJoystickReader

__all__ = ["GamepadController", "LinuxJoystickReader"]
