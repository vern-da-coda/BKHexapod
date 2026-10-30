"""
Order, Action, and Telemetry Result Models (`lasius.core.control.orders`).

Purpose & Role:
    Defines the immutable/serializable command envelope (`Order`) and execution
    outcome (`OrderResult`) shared across the HTTP REST API, WebSocket command
    stream, and internal Python callers.

Classes:
    - `OrderAction`: Enum of all supported robot commands (locomotion, gait, pose,
      joint actuation, calibration overlay, and async test sequences).
    - `OrderPriority`: Priority levels (`LOW=0`, `NORMAL=10`, `HIGH=20`, `EMERGENCY=99`).
    - `OrderStatus`: Lifecycle states (`PENDING`, `RUNNING`, `COMPLETED`, `CANCELLED`, `FAILED`).
    - `Order`: Validated command object with `from_dict()` normalization for legacy/flat payloads.
    - `OrderResult`: Execution receipt recording status, duration in ms, message, and error details.
"""

from dataclasses import dataclass, field
from enum import Enum
import time
from typing import Any, Dict, Optional
import uuid


class OrderAction(str, Enum):
    """Supported robot actions and orders."""
    # Locomotion & Velocities
    SET_VELOCITY = "set_velocity"     # walk_x, walk_y, turn_z
    SET_WALK = "set_walk"             # x, y
    SET_TURN = "set_turn"             # z
    STOP = "stop"                     # velocity to 0
    STOP_MOTION = "stop_motion"       # alias for STOP
    PAUSE = "pause"
    RESUME = "resume"
    TOGGLE_PAUSE = "toggle_pause"

    # Gait & Parameters
    SET_GAIT = "set_gait"             # value: tripod | ripple | wave
    SET_GAIT_TYPE = "set_gait_type"   # alias for SET_GAIT
    SET_SPEED = "set_speed"           # value: float
    SET_STEP_HEIGHT = "set_step_height"
    SET_STEP_LENGTH = "set_step_length"

    # Body Attitude / Posing
    SET_POSE = "set_pose"             # height, roll, pitch
    SET_HEIGHT = "set_height"
    SET_ROLL = "set_roll"
    SET_PITCH = "set_pitch"
    RESET_POSE = "reset_pose"

    # Diagnostics & Isolated Leg Routines
    TEST_LEG = "test_leg"             # leg, cycles, stride, lift
    STANCE_LEG = "stance_leg"         # leg, duration
    SWEEP_JOINT = "sweep_joint"       # servo, min_angle, max_angle

    # Show Poses & Choreographies
    WAVE_HELLO = "wave_hello"         # leg (default: right_front), cycles
    PUSH_UPS = "push_ups"             # cycles, min_z, max_z
    BODY_CIRCLE = "body_circle"       # cycles, amplitude_deg
    CROUCH = "crouch"                 # height, pitch

    # Joint & Servo Actuation
    SET_JOINT_ANGLE = "set_joint_angle"  # servo, angle
    SET_SERVO_ANGLE = "set_servo_angle"  # alias for SET_JOINT_ANGLE
    SET_LEG_JOINTS = "set_leg_joints"    # leg, coxa, femur, tibia

    # Actuation & Safety
    RELAX_ALL = "relax_all"
    RELAX_LEG = "relax_leg"           # leg
    EMERGENCY_STOP = "emergency_stop"

    # Calibration
    CALIBRATE_TRIM = "calibrate_trim"   # servo, offset, orientation, angle
    CALIBRATE_SAVE = "calibrate_save"   # servo, offset, orientation, batch
    CALIBRATE_RESET = "calibrate_reset" # servo, leg, or all


class OrderStatus(str, Enum):
    """Execution status of an order."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class OrderPriority(int, Enum):
    """Execution priority for arbitration."""
    LOW = 0
    NORMAL = 10
    HIGH = 20
    EMERGENCY = 99


@dataclass
class Order:
    """
    Unified representation of a command to the robot.
    Transport-agnostic: Can be created via REST, WebSocket, Gamepad, or local scripts.
    """
    action: OrderAction
    params: Dict[str, Any] = field(default_factory=dict)
    priority: OrderPriority = OrderPriority.NORMAL
    order_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    timestamp: float = field(default_factory=time.time)
    source: str = "api"  # "rest", "ws", "pilot", "internal"

    def to_dict(self) -> Dict[str, Any]:
        """Serializes the order into a JSON-compatible dictionary."""
        return {
            "order_id": self.order_id,
            "action": self.action.value,
            "params": self.params,
            "priority": self.priority.value,
            "source": self.source,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], default_source: str = "api") -> "Order":
        """Constructs an Order instance from a JSON payload."""
        action_raw = data.get("action", "")
        try:
            action = OrderAction(action_raw)
        except ValueError:
            # Fallback check for case-insensitive matching
            found = next((a for a in OrderAction if a.value.lower() == str(action_raw).lower()), None)
            if found:
                action = found
            else:
                raise ValueError(f"Unknown or unsupported OrderAction: '{action_raw}'")

        params = data.get("params") or {}
        # Also copy top-level keys if params is empty and keys are provided directly
        if not params:
            params = {k: v for k, v in data.items() if k not in ["type", "action", "order_id", "priority", "source"]}

        priority_raw = data.get("priority", OrderPriority.NORMAL.value)
        try:
            priority = OrderPriority(priority_raw)
        except ValueError:
            priority = OrderPriority.NORMAL

        order_id = str(data.get("order_id") or uuid.uuid4().hex[:8])
        source = str(data.get("source") or default_source)

        return cls(
            action=action,
            params=params,
            priority=priority,
            order_id=order_id,
            source=source,
        )


@dataclass
class OrderResult:
    """
    Result and feedback from executing an Order.
    """
    order_id: str
    action: str
    status: OrderStatus
    message: str = ""
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Serializes the result into a JSON-compatible dictionary."""
        res: Dict[str, Any] = {
            "order_id": self.order_id,
            "action": self.action,
            "status": self.status.value,
            "message": self.message,
            "duration_ms": round(self.duration_ms, 2),
        }
        if self.data is not None:
            res["data"] = self.data
        if self.error is not None:
            res["error"] = self.error
        return res
