"""
Lasius Pilot - Teleoperation & Gamepad Client Package (`lasius.pilot`).

Purpose & Role:
    Provides low-latency Linux joystick / Bluetooth gamepad teleoperation
    for the Lasius Hexapod over WebSocket.

Exports:
    - `GamepadController` (`LinuxJoystickReader`): Native `/dev/input/js0` reader.
"""

from .gamepad import GamepadController, LinuxJoystickReader

__version__ = "0.1.0"
__all__ = ["GamepadController", "LinuxJoystickReader"]
