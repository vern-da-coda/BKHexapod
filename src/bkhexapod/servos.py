"""
Module for controlling individual servos.

Defines the Servo class, which abstracts a single servo motor and
handles the conversion of angles to PWM signals based on calibration data.
"""

from typing import Protocol
from dataclasses import dataclass

from bkhexapod.config import ServoConfig


class PWMDriverProtocol(Protocol):
    """
    Defines the interface for a PWM driver (Strategy Pattern).

    Any driver, whether real (PCA9685) or simulated (Mock), must implement
    this method. This decouples the servo logic from the concrete
    hardware control.
    """
    def set_pwm(self, channel: int, on: int, off: int) -> None:
        """Sets the PWM value for a specific channel."""
        ...

    def set_pwm_freq(self, freq: float) -> None:
        """Sets the PWM frequency for all channels."""
        ...

@dataclass
class Servo:
    """
    Represents a single servo motor and its control.

    The class receives its configuration and the driver from the outside (Dependency Injection).
    Its main responsibility is the correct conversion of an angle into a
    PWM value, taking into account the individual calibration of the servo.
    """
    config: ServoConfig
    driver: PWMDriverProtocol

    _SERVO_CENTER_PULSE_WIDTH = 1500  # Standard center position in µs
    _PWM_FREQUENCY = 50  # Standard frequency for most analog servos in Hz
    _TICK_DURATION_MICROS = (1_000_000 / _PWM_FREQUENCY) / 4096  # Duration of one tick in µs

    def set_angle(self, angle: float) -> None:
        """
        Moves the servo to the specified angle.

        Args:
            angle: The target angle in degrees.
        """
        # Clamp angle to prevent mechanical damage
        clamped_angle = max(self.config.min_angle, min(self.config.max_angle, angle))

        # Invert angle if the orientation is reversed
        final_angle = clamped_angle * self.config.orientation

        # Convert the angle to the corresponding pulse width
        pulse_width = self._SERVO_CENTER_PULSE_WIDTH \
                      + self.config.center_offset_pulse \
                      + (final_angle / 90.0) * (self.config.pulse_range / 2.0)

        # Convert the pulse width to PCA9685 ticks (0-4095)
        ticks = int(pulse_width / self._TICK_DURATION_MICROS)

        self.driver.set_pwm(self.config.channel, 0, ticks)
