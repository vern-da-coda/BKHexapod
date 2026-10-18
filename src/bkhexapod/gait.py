"""
Module for defining hexapod gaits (walking patterns).

This module provides a protocol for gait engines and implements specific
gait strategies like the Tripod Gait.
"""

from typing import Protocol, Dict, Tuple
import math

from bkhexapod.leg import LegIdentifier


class GaitProtocol(Protocol):
    """
    Defines the interface for a gait engine (Strategy Pattern).

    A gait engine is responsible for calculating the target foot tip positions
    for all six legs at any given moment in time.
    """
    def tick(self) -> Dict[LegIdentifier, Tuple[float, float, float]]:
        """
        Calculates the next set of target coordinates for each leg.

        Returns:
            A dictionary mapping each leg identifier to its new target
            (x, y, z) coordinate.
        """
        ...


class TripodGait(GaitProtocol):
    """
    Implements the classic, fast, and stable tripod gait.

    The legs are divided into two groups (tripods) that move alternately.
    Group A: Left Front, Left Rear, Right Middle
    Group B: Right Front, Right Rear, Left Middle
    """
    def __init__(self, step_length: float = 50.0, step_height: float = 30.0, gait_speed: float = 1.0):
        self.step_length = step_length
        self.step_height = step_height
        self.gait_speed = gait_speed  # Controls the speed of the animation
        self.phase = 0.0  # Current position in the gait cycle (0.0 to 1.0)

        self.tripod_a = {LegIdentifier.LEFT_FRONT, LegIdentifier.LEFT_REAR, LegIdentifier.RIGHT_MIDDLE}
        self.tripod_b = {LegIdentifier.RIGHT_FRONT, LegIdentifier.RIGHT_REAR, LegIdentifier.LEFT_MIDDLE}

        # Neutral stance position for each leg (x, y, z)
        # These are starting points and should be fine-tuned.
        self.neutral_stances = {
            LegIdentifier.LEFT_FRONT: (120, 60, -80),
            LegIdentifier.LEFT_MIDDLE: (150, 0, -80),
            LegIdentifier.LEFT_REAR: (120, -60, -80),
            LegIdentifier.RIGHT_FRONT: (120, -60, -80),
            LegIdentifier.RIGHT_MIDDLE: (150, 0, -80),
            LegIdentifier.RIGHT_REAR: (120, 60, -80),
        }

    def tick(self) -> Dict[LegIdentifier, Tuple[float, float, float]]:
        """
        Calculates the foot positions for the current phase of the tripod gait.
        """
        # Advance the gait cycle phase
        self.phase = (self.phase + 0.02 * self.gait_speed) % 1.0

        positions = {}

        for leg_id in LegIdentifier:
            neutral_x, neutral_y, neutral_z = self.neutral_stances[leg_id]

            # Determine if the leg is in tripod A or B
            in_tripod_a = leg_id in self.tripod_a

            # Calculate phase offset for each tripod
            # Tripod A is lifted during the first half of the cycle (0.0 to 0.5)
            # Tripod B is lifted during the second half (0.5 to 1.0)
            current_phase = (self.phase + (0.5 if in_tripod_a else 0.0)) % 1.0

            if current_phase < 0.5:  # Leg is in the air (transfer phase)
                phase_2pi = (current_phase * 2) * math.pi  # Scale to 0 -> 2pi
                x = neutral_x - (self.step_length / 2) * math.cos(phase_2pi)
                z = neutral_z + self.step_height * math.sin(phase_2pi)
            else:  # Leg is on the ground (stance phase)
                phase_1 = (current_phase - 0.5) * 2  # Scale to 0 -> 1
                x = neutral_x + self.step_length / 2 - self.step_length * phase_1
                z = neutral_z

            positions[leg_id] = (x, neutral_y, z) # y is kept constant for simple forward walk

        return positions
