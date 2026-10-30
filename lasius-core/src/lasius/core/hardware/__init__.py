"""
Hardware Abstraction Layer (HAL) Package (`lasius.core.hardware`).

Purpose & Role:
    Isolates direct I2C hardware register communication and PWM pulse width
    math from high-level kinematics and gait control.

Exports:
    - `PWMDriverProtocol`: Strategy interface implemented by both mock and physical drivers.
    - `MockPWMDriver`: Thread-safe in-memory PWM simulator for unit tests and Digital Twin streaming.
    - `RealPCA9685Driver`: Thread-safe SMBus driver for the dual PCA9685 boards (`0x40` & `0x42`).
    - `Servo`: Logical actuator translating angles in degrees into clamped 12-bit PCA9685 ticks.
"""

from .driver import (
    PWMDriverProtocol,
    MockPWMDriver,
    RealPCA9685Driver,
    _MODE1,
    _MODE2,
    _PRESCALE,
    _LED0_ON_L,
    _ALL_LED_ON_L,
)
from .servo import Servo

__all__ = [
    "PWMDriverProtocol",
    "MockPWMDriver",
    "RealPCA9685Driver",
    "Servo",
    "_MODE1",
    "_MODE2",
    "_PRESCALE",
    "_LED0_ON_L",
    "_ALL_LED_ON_L",
]
