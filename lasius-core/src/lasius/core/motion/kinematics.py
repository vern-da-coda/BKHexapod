"""
Closed-Form 3-DOF Inverse Kinematics Solver (`lasius.core.motion.kinematics`).

Purpose & Role:
    Pure mathematical geometry module with zero hardware dependencies. Computes
    the exact joint angles `(coxa_angle, femur_angle, tibia_angle)` in degrees
    required for an insectoid 3-DOF leg (`coxa_len`, `femur_len`, `tibia_len`)
    to place its foot tip at Cartesian coordinate `(x, y, z)` in the leg frame.

Functions:
    - `calculate_leg_ik`: Uses planar projection and the Law of Cosines in the
      vertical reach plane, raising `ValueError` if the target point lies outside
      the physical workspace of the femur + tibia chain.
"""

import math
from typing import Tuple


def calculate_leg_ik(
    x: float,
    y: float,
    z: float,
    coxa_len: float,
    femur_len: float,
    tibia_len: float,
) -> Tuple[float, float, float]:
    """
    Calculates the required angles for coxa, femur, and tibia to reach the target foot tip (x, y, z).

    Uses standard 3-DOF insect-leg kinematics with knee raised above hip:
    - Coxa rotates horizontally around Z (yaw).
    - Femur angle is elevation above horizontal (knee points upwards).
    - Tibia servo angle is relative to a 90° horn mounting (pointing downwards to the floor).

    Args:
        x: Foot tip X-coordinate relative to leg origin (mm).
        y: Foot tip Y-coordinate relative to leg origin (mm).
        z: Foot tip Z-coordinate relative to leg origin (mm, typically negative when touching ground).
        coxa_len: Coxa link length (mm).
        femur_len: Femur link length (mm).
        tibia_len: Tibia link length (mm).

    Returns:
        Tuple of (coxa_angle, femur_angle, tibia_angle) in degrees.

    Raises:
        ValueError: If the target coordinate is outside the reachable workspace.
    """
    # 1. Coxa Angle (Top-down view)
    coxa_angle = math.degrees(math.atan2(y, x))

    # 2. Reduce to 2D planar problem (Side view)
    l_horiz = math.sqrt(x**2 + y**2)
    x_prime = l_horiz - coxa_len
    y_prime = -z  # positive downwards when z is negative

    dist_femur_tip = math.sqrt(x_prime**2 + y_prime**2)

    # Reachability check
    if dist_femur_tip > (femur_len + tibia_len):
        raise ValueError("Target is out of reach.")

    # 3. Knee bend angle (Law of Cosines)
    tibia_angle_arg = (femur_len**2 + tibia_len**2 - dist_femur_tip**2) / (2.0 * femur_len * tibia_len)
    tibia_angle_arg = max(-1.0, min(1.0, tibia_angle_arg))
    alpha_rad = math.acos(tibia_angle_arg)
    knee_bend_deg = math.degrees(math.pi - alpha_rad)

    # Tibia servo angle: relative to a 90° mounting horn (0° servo = 90° knee bend)
    tibia_angle = knee_bend_deg - 90.0

    # 4. Femur angle: knee is above hip-to-foot line, so (beta1 - beta2) gives angle above horizontal
    beta1_arg = (femur_len**2 + dist_femur_tip**2 - tibia_len**2) / (2.0 * femur_len * dist_femur_tip)
    beta1_arg = max(-1.0, min(1.0, beta1_arg))
    beta1_rad = math.acos(beta1_arg)
    beta2_rad = math.atan2(y_prime, x_prime)
    femur_angle_rad = beta1_rad - beta2_rad
    femur_angle = math.degrees(femur_angle_rad)

    return coxa_angle, femur_angle, tibia_angle
