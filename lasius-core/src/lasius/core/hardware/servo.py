"""
Servo actuation and configuration representation for Lasius Hexapod HAL.
"""

from dataclasses import dataclass
from typing import Optional

from lasius.core.config import ServoConfig
from .driver import PWMDriverProtocol


@dataclass
class Servo:
    """
    Represents a single servo motor and its hardware control.
    Translates degrees (-90° to +90°) into microsecond pulses
    taking orientation and calibration offset into account.
    """
    config: ServoConfig
    driver: PWMDriverProtocol
    current_angle: Optional[float] = None

    _SERVO_CENTER_PULSE_WIDTH = 1500
    _PWM_FREQUENCY = 50
    _TICK_DURATION_MICROS = (1_000_000 / _PWM_FREQUENCY) / 4096

    def set_angle(self, angle: float) -> None:
        """
        Moves the servo to the specified angle with software limit clamping.
        """
        clamped_angle = max(self.config.min_angle, min(self.config.max_angle, angle))
        final_angle = clamped_angle * self.config.orientation

        pulse_width = (
            self._SERVO_CENTER_PULSE_WIDTH
            + self.config.center_offset_pulse
            + (final_angle / 90.0) * (self.config.pulse_range / 2.0)
        )

        ticks = int(pulse_width / self._TICK_DURATION_MICROS)

        self.driver.set_pwm(
            self.config.channel, 0, ticks,
            angle=clamped_angle,
            servo_name=self.config.name
        )
        self.current_angle = clamped_angle

    def relax(self) -> None:
        """Disables PWM signal to relax this servo."""
        if hasattr(self.driver, "relax_channel"):
            self.driver.relax_channel(self.config.channel)
        self.current_angle = None
