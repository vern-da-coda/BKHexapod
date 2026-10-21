"""
Linux Joystick & Bluetooth Gamepad driver for Lasius Hexapod.

Communicates with any standard Linux gamepad (/dev/input/js0) using native
kernel struct unpacking, supporting PS4/PS5, Xbox, and 8BitDo Bluetooth controllers.
Translates analog stick axes and button presses into Lasius locomotion commands.
"""

import os
import struct
import time
import math
from typing import Dict, Any, Callable, Optional, List


# Standard Linux Joystick Event format:
# unsigned int (time), short (value), unsigned char (type), unsigned char (number)
_EVENT_FORMAT = "IhBB"
_EVENT_SIZE = struct.calcsize(_EVENT_FORMAT)

# Event types
_JS_EVENT_BUTTON = 0x01
_JS_EVENT_AXIS = 0x02
_JS_EVENT_INIT = 0x80


class GamepadController:
    """
    Reads inputs from /dev/input/js0 and maps them to Lasius walking & posing vectors.
    """
    def __init__(
        self,
        device_path: str = "/dev/input/js0",
        deadzone: float = 0.12,
        on_command: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.device_path = device_path
        self.deadzone = deadzone
        self.on_command = on_command

        # Axis states normalized -1.0 to +1.0
        self.axes: Dict[int, float] = {0: 0.0, 1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0}
        # Button states (0 or 1)
        self.buttons: Dict[int, int] = {}

        self.fd: Optional[int] = None

    def connect(self) -> bool:
        """Opens the joystick device file."""
        if not os.path.exists(self.device_path):
            return False
        try:
            self.fd = os.open(self.device_path, os.O_RDONLY | os.O_NONBLOCK)
            return True
        except Exception:
            return False

    def close(self) -> None:
        """Closes the device file descriptor."""
        if self.fd is not None:
            try:
                os.close(self.fd)
            except Exception:
                pass
            self.fd = None

    def apply_deadzone(self, raw_val: float) -> float:
        """Applies radial deadzone to analog axes."""
        if abs(raw_val) < self.deadzone:
            return 0.0
        # Rescale smoothly past deadzone
        sign = 1.0 if raw_val > 0 else -1.0
        scaled = (abs(raw_val) - self.deadzone) / (1.0 - self.deadzone)
        return sign * min(1.0, scaled)

    def read_events(self) -> List[Dict[str, Any]]:
        """Reads and processes pending events from the joystick."""
        if self.fd is None:
            return []

        events = []
        while True:
            try:
                data = os.read(self.fd, _EVENT_SIZE)
                if len(data) < _EVENT_SIZE:
                    break
                ev_time, ev_val, ev_type, ev_num = struct.unpack(_EVENT_FORMAT, data)
                clean_type = ev_type & ~_JS_EVENT_INIT

                if clean_type == _JS_EVENT_AXIS:
                    # Normalize -32767..32767 to -1.0..1.0
                    norm_val = self.apply_deadzone(ev_val / 32767.0)
                    self.axes[ev_num] = norm_val
                    events.append({"type": "axis", "axis": ev_num, "value": norm_val})
                elif clean_type == _JS_EVENT_BUTTON:
                    self.buttons[ev_num] = ev_val
                    events.append({"type": "button", "button": ev_num, "pressed": bool(ev_val)})
            except (BlockingIOError, OSError):
                break

        return events

    def get_locomotion_command(self) -> Dict[str, float]:
        """
        Translates current gamepad axes to Lasius locomotion commands:
        - Axis 0 (Left Stick X): Strafe Left/Right (walk_x)
        - Axis 1 (Left Stick Y): Walk Forward/Backward (walk_y, inverted in Linux js)
        - Axis 2/3 (Right Stick X): Turn in place (turn_z)
        """
        walk_x = self.axes.get(0, 0.0)
        walk_y = -self.axes.get(1, 0.0)  # Invert Y so up is positive
        turn_z = -self.axes.get(3, self.axes.get(2, 0.0))  # Right stick X

        return {
            "walk_x": round(walk_x, 2),
            "walk_y": round(walk_y, 2),
            "turn_z": round(turn_z, 2),
        }
