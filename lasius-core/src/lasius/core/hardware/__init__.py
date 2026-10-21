"""
Hardware Abstraction Layer (HAL) for Lasius Hexapod.

Provides unified driver interfaces, PCA9685 I2C communication,
and Servo actuation with hardware safety limits.
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
