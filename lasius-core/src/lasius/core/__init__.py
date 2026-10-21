"""
Lasius Hexapod Robotics Framework - Core Package.

Clean 4-Layer Architecture:
- hardware: HAL, drivers, and servos.
- motion: Kinematics, legs, and omnidirectional gait engine.
- control: Order definitions and central OrderDispatcher.
- server: REST API and WebSocket telemetry server.
"""

from .config import HexapodConfig, load_config
from .robot import Hexapod
from .hardware import PWMDriverProtocol, MockPWMDriver, RealPCA9685Driver, Servo
from .motion import (
    BodySide,
    LegRow,
    LegIdentifier,
    Joint,
    Leg,
    GaitProtocol,
    OmniGait,
    TripodGait,
    RippleGait,
    WaveGait,
    GaitType,
    calculate_leg_ik,
)
from .control import (
    Order,
    OrderAction,
    OrderPriority,
    OrderStatus,
    OrderResult,
    OrderDispatcher,
)
from .server import LasiusServer, VisualizerServer

__all__ = [
    # Core & Configuration
    "HexapodConfig",
    "load_config",
    "Hexapod",
    # Hardware Layer
    "PWMDriverProtocol",
    "MockPWMDriver",
    "RealPCA9685Driver",
    "Servo",
    # Motion Layer
    "BodySide",
    "LegRow",
    "LegIdentifier",
    "Joint",
    "Leg",
    "GaitProtocol",
    "OmniGait",
    "TripodGait",
    "RippleGait",
    "WaveGait",
    "GaitType",
    "calculate_leg_ik",
    # Control Layer
    "Order",
    "OrderAction",
    "OrderPriority",
    "OrderStatus",
    "OrderResult",
    "OrderDispatcher",
    # Server Layer
    "LasiusServer",
    "VisualizerServer",
]
