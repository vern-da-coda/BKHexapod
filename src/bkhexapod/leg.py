"""
Module that defines the leg components of the hexapod.

This module contains the classes for `Joint` and `Leg`,
which are the fundamental building blocks for the robot's kinematics.
"""

import math
from dataclasses import dataclass
from enum import Enum
from typing import Tuple

from bkhexapod.servos import Servo


class BodySide(Enum):
    """Defines the body side (left or right)."""
    LEFT = "left"
    RIGHT = "right"


class LegRow(Enum):
    """Defines the leg row (front, middle, or rear)."""
    FRONT = "front"
    MIDDLE = "middle"
    REAR = "rear"


class LegIdentifier(Enum):
    """
    Provides a type-safe, convenient identifier for a specific leg.

    The value of each member is a tuple `(BodySide, LegRow)`,
    which can be used directly as a key in a dictionary.
    This combines API user-friendliness with an efficient internal data structure.
    """
    LEFT_FRONT = (BodySide.LEFT, LegRow.FRONT)
    LEFT_MIDDLE = (BodySide.LEFT, LegRow.MIDDLE)
    LEFT_REAR = (BodySide.LEFT, LegRow.REAR)
    RIGHT_FRONT = (BodySide.RIGHT, LegRow.FRONT)
    RIGHT_MIDDLE = (BodySide.RIGHT, LegRow.MIDDLE)
    RIGHT_REAR = (BodySide.RIGHT, LegRow.REAR)


@dataclass
class Joint:
    """
    Represents a single joint of a leg, driven by a servo.

    This class connects the pure servo control with the physical
    properties of the limb (e.g., length), which is crucial for kinematics.
    """
    servo: Servo
    length: float  # Length of the limb in mm

    def set_angle(self, angle: float) -> None:
        """Convenience method to set the angle of the joint's servo."""
        self.servo.set_angle(angle)


@dataclass
class Leg:
    """
    Represents a complete leg of the hexapod, consisting of three joints.

    Its main responsibility is to calculate the necessary joint angles
    for a given target position of the foot tip (Inverse Kinematics).
    """
    side: BodySide
    row: LegRow
    coxa: Joint
    femur: Joint
    tibia: Joint

    def move_tip_to(self, x: float, y: float, z: float) -> None:
        """
        Calculates and sets the joint angles to move the foot tip to the
        target XYZ coordinates relative to the leg's origin.

        Args:
            x: Target X-coordinate.
            y: Target Y-coordinate.
            z: Target Z-coordinate.
        """
        try:
            coxa_angle, femur_angle, tibia_angle = self._calculate_inverse_kinematics(x, y, z)

            # Set the calculated angles on the joints
            self.coxa.set_angle(coxa_angle)
            self.femur.set_angle(femur_angle)
            self.tibia.set_angle(tibia_angle)
        except ValueError as e:
            print(f"[IK ERROR] Leg {self.side.value}_{self.row.value}: Could not calculate angles for ({x}, {y}, {z}). {e}")

    def _calculate_inverse_kinematics(self, x: float, y: float, z: float) -> Tuple[float, float, float]:
        """
        Calculates the required angles for coxa, femur, and tibia to reach the target.

        Uses standard 3-DOF insect-leg kinematics with knee raised above hip:
        - Coxa rotates horizontally around Z.
        - Femur angle is elevation above horizontal (knee points upwards).
        - Tibia servo angle is relative to a 90° horn mounting (pointing downwards to the floor).

        Raises:
            ValueError: If the target coordinate is outside the reachable range.
        """
        # --- Step 1: Coxa Angle (Top-down view) ---
        coxa_angle = math.degrees(math.atan2(y, x))

        # --- Step 2: Reduce to 2D problem (Side view) ---
        l_horiz = math.sqrt(x**2 + y**2)
        x_prime = l_horiz - self.coxa.length
        y_prime = -z  # positive downwards when z is negative

        dist_femur_tip = math.sqrt(x_prime**2 + y_prime**2)

        # --- Step 3: Tibia and Femur Angles (Law of Cosines) ---
        femur_len = self.femur.length
        tibia_len = self.tibia.length

        if dist_femur_tip > (femur_len + tibia_len):
            raise ValueError("Target is out of reach.")

        # Knee bend angle: alpha is the interior angle of triangle Femur-Knee-Foot
        tibia_angle_arg = (femur_len**2 + tibia_len**2 - dist_femur_tip**2) / (2 * femur_len * tibia_len)
        tibia_angle_arg = max(-1.0, min(1.0, tibia_angle_arg))
        alpha_rad = math.acos(tibia_angle_arg)
        knee_bend_deg = math.degrees(math.pi - alpha_rad)

        # Tibia servo angle: relative to a 90° mounting horn (0° servo = 90° knee bend)
        tibia_angle = knee_bend_deg - 90.0

        # Femur angle: knee is above hip-to-foot line, so (beta1 - beta2) gives angle above horizontal
        beta1_arg = (femur_len**2 + dist_femur_tip**2 - tibia_len**2) / (2 * femur_len * dist_femur_tip)
        beta1_arg = max(-1.0, min(1.0, beta1_arg))
        beta1_rad = math.acos(beta1_arg)
        beta2_rad = math.atan2(y_prime, x_prime)
        femur_angle_rad = beta1_rad - beta2_rad
        femur_angle = math.degrees(femur_angle_rad)

        return coxa_angle, femur_angle, tibia_angle
