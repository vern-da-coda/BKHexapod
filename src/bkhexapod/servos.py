"""
Module for controlling individual servos.
"""

from typing import Protocol, Optional, Dict
from dataclasses import dataclass

from bkhexapod.config import ServoConfig

class PWMDriverProtocol(Protocol):
    """
    Defines the interface for a PWM driver (Strategy Pattern).
    """
    def set_pwm(self, channel: int, on: int, off: int, angle: Optional[float] = None, servo_name: Optional[str] = None) -> None:
        """Sets the PWM value for a specific channel."""
        ...

    def set_pwm_freq(self, freq: float) -> None:
        """Sets the PWM frequency for all channels."""
        ...

@dataclass
class Servo:
    """
    Represents a single servo motor and its control.
    """
    config: ServoConfig
    driver: PWMDriverProtocol

    _SERVO_CENTER_PULSE_WIDTH = 1500
    _PWM_FREQUENCY = 50
    _TICK_DURATION_MICROS = (1_000_000 / _PWM_FREQUENCY) / 4096

    def set_angle(self, angle: float) -> None:
        """
        Moves the servo to the specified angle.
        """
        clamped_angle = max(self.config.min_angle, min(self.config.max_angle, angle))
        final_angle = clamped_angle * self.config.orientation

        pulse_width = self._SERVO_CENTER_PULSE_WIDTH \
                      + self.config.center_offset_pulse \
                      + (final_angle / 90.0) * (self.config.pulse_range / 2.0)

        ticks = int(pulse_width / self._TICK_DURATION_MICROS)

        self.driver.set_pwm(
            self.config.channel, 0, ticks, 
            angle=clamped_angle, 
            servo_name=self.config.name
        )
