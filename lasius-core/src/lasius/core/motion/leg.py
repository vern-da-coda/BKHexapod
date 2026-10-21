"""
Leg modeling and joint coordination for Lasius Hexapod.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Tuple

from lasius.core.hardware.servo import Servo
from .kinematics import calculate_leg_ik


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
    Type-safe, convenient identifier for a specific leg.
    The value is a tuple `(BodySide, LegRow)`.
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
    Represents a single joint of a leg, driven by a servo with a physical limb length.
    """
    servo: Servo
    length: float  # Length of the limb in mm

    def set_angle(self, angle: float) -> None:
        """Sets the angle on the joint's servo."""
        self.servo.set_angle(angle)

    def relax(self) -> None:
        """Relaxes the joint's servo."""
        self.servo.relax()


@dataclass
class Leg:
    """
    Represents a complete 3-DOF leg of the hexapod (Coxa, Femur, Tibia).
    """
    side: BodySide
    row: LegRow
    coxa: Joint
    femur: Joint
    tibia: Joint

    def move_tip_to(self, x: float, y: float, z: float) -> None:
        """
        Calculates IK and sets joint angles to move the foot tip to (x, y, z).
        """
        try:
            coxa_angle, femur_angle, tibia_angle = self._calculate_inverse_kinematics(x, y, z)
            self.coxa.set_angle(coxa_angle)
            self.femur.set_angle(femur_angle)
            self.tibia.set_angle(tibia_angle)
        except ValueError as e:
            print(f"[IK ERROR] Leg {self.side.value}_{self.row.value}: Could not reach ({x}, {y}, {z}). {e}")

    def _calculate_inverse_kinematics(self, x: float, y: float, z: float) -> Tuple[float, float, float]:
        """Calculates 3-DOF inverse kinematics for this leg's link lengths."""
        return calculate_leg_ik(
            x=x, y=y, z=z,
            coxa_len=self.coxa.length,
            femur_len=self.femur.length,
            tibia_len=self.tibia.length,
        )

    def relax(self) -> None:
        """Relaxes all 3 joints of this leg."""
        self.coxa.relax()
        self.femur.relax()
        self.tibia.relax()
