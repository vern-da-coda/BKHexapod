"""
Lasius Hexapod Robotics Framework - Core Package (`lasius.core`).

Purpose & Role:
    Top-level facade for the Lasius Hexapod robotics backend. Re-exports the
    public API across the 4-layer architecture so callers can import core
    abstractions directly from `lasius.core`:

    1. Configuration & Orchestration (`config.py`, `robot.py`):
       - `HexapodConfig`, `load_config`: Geometry and 18-servo calibration loader.
       - `Hexapod`: Central robot coordinator managing legs, drivers, and the 50 Hz gait loop.
    2. Hardware Abstraction Layer (`hardware/`):
       - `PWMDriverProtocol`, `MockPWMDriver`, `RealPCA9685Driver`, `Servo`.
    3. Motion & Kinematics Layer (`motion/`):
       - `calculate_leg_ik`, `Leg`, `Joint`, `OmniGait`, `TripodGait`, `RippleGait`, `WaveGait`.
    4. Control & Server Layer (`control/`, `server/`):
       - `Order`, `OrderAction`, `OrderDispatcher`, `LasiusServer`.
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
