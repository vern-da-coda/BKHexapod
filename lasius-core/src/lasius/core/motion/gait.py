"""
Module for defining hexapod gaits (walking patterns) and body attitude posing.

This module provides a protocol for gait engines and implements omnidirectional
walking strategies (Tripod, Ripple, Wave) with seamless gait morphing,
fluid velocity ramping, and 6-DOF body attitude control (Height, Roll, Pitch).
"""

from enum import Enum
import math
from typing import Any, Dict, Optional, Protocol, Tuple, Union

from .leg import BodySide, LegIdentifier


class GaitType(str, Enum):
    """Supported hexapod gait types."""
    TRIPOD = "tripod"
    RIPPLE = "ripple"
    WAVE = "wave"


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


class OmniGait(GaitProtocol):
    """
    Omnidirectional Gait Engine with multi-gait coordination, seamless gait morphing,
    and dynamic body posing.

    Features:
    - Seamless gait transitions (Gait Morphing): Smooth S-curve interpolation of
      duty cycle and phase offsets across circular trajectories.
    - Motion & Velocity Ramping: Inertial smoothing of translation/rotation inputs
      prevents jerky stops and reversals.
    - Trajectory Slew-Rate Limiting: Prevents mechanical shocks by capping maximum
      foot displacement per tick.
    - Omnidirectional translation (forward/backward, strafe left/right, arbitrary vectors).
    - Yaw rotation (turn in place or curved walking).
    - Multiple gaits:
        * Tripod: 3 legs stance, 3 swing (fast, dynamic, duty factor 0.5).
        * Ripple: 4 legs stance, 2 swing (smooth, insect-like, duty factor 0.67).
        * Wave: 5 legs stance, 1 swing (maximum static stability, duty factor 0.83).
    - Body attitude / pose adjustments:
        * Height (stance ground clearance).
        * Roll (tilt body left / right).
        * Pitch (tilt nose up / down).
    """

    # Default robot chassis mount points (mm)
    # Width: front/rear 13 cm (x = ±65 mm), middle 15 cm (x = ±75 mm)
    # Longitude: 9 cm distance between leg axes (y = -90 mm front, 0 mm middle, +90 mm rear)
    MOUNT_POINTS: Dict[LegIdentifier, Tuple[float, float]] = {
        LegIdentifier.LEFT_FRONT: (-65.0, -90.0),
        LegIdentifier.LEFT_MIDDLE: (-75.0, 0.0),
        LegIdentifier.LEFT_REAR: (-65.0, 90.0),
        LegIdentifier.RIGHT_FRONT: (65.0, -90.0),
        LegIdentifier.RIGHT_MIDDLE: (75.0, 0.0),
        LegIdentifier.RIGHT_REAR: (65.0, 90.0),
    }

    # Natural neutral stances tailored to 6cm Coxa, 10cm Femur, 13cm Tibia
    NEUTRAL_STANCES: Dict[LegIdentifier, Tuple[float, float, float]] = {
        LegIdentifier.LEFT_FRONT: (140.0, 70.0, -80.0),
        LegIdentifier.LEFT_MIDDLE: (160.0, 0.0, -80.0),
        LegIdentifier.LEFT_REAR: (160.0, 0.0, -80.0),
        LegIdentifier.RIGHT_FRONT: (140.0, -70.0, -80.0),
        LegIdentifier.RIGHT_MIDDLE: (160.0, 0.0, -80.0),
        LegIdentifier.RIGHT_REAR: (160.0, 0.0, -80.0),
    }

    # Gait timing configurations: (swing_duration_fraction, phase_offsets_per_leg)
    GAIT_CONFIGS = {
        GaitType.TRIPOD: (
            0.5,
            {
                LegIdentifier.LEFT_FRONT: 0.0,
                LegIdentifier.RIGHT_MIDDLE: 0.0,
                LegIdentifier.LEFT_REAR: 0.0,
                LegIdentifier.RIGHT_FRONT: 0.5,
                LegIdentifier.LEFT_MIDDLE: 0.5,
                LegIdentifier.RIGHT_REAR: 0.5,
            }
        ),
        GaitType.RIPPLE: (
            1.0 / 3.0,
            {
                LegIdentifier.LEFT_REAR: 0.0 / 6.0,
                LegIdentifier.RIGHT_FRONT: 1.0 / 6.0,
                LegIdentifier.LEFT_MIDDLE: 2.0 / 6.0,
                LegIdentifier.RIGHT_REAR: 3.0 / 6.0,
                LegIdentifier.LEFT_FRONT: 4.0 / 6.0,
                LegIdentifier.RIGHT_MIDDLE: 5.0 / 6.0,
            }
        ),
        GaitType.WAVE: (
            1.0 / 6.0,
            {
                LegIdentifier.LEFT_REAR: 0.0 / 6.0,
                LegIdentifier.LEFT_MIDDLE: 1.0 / 6.0,
                LegIdentifier.LEFT_FRONT: 2.0 / 6.0,
                LegIdentifier.RIGHT_REAR: 3.0 / 6.0,
                LegIdentifier.RIGHT_MIDDLE: 4.0 / 6.0,
                LegIdentifier.RIGHT_FRONT: 5.0 / 6.0,
            }
        ),
    }

    def __init__(
        self,
        gait_type: Union[GaitType, str] = GaitType.TRIPOD,
        step_length: float = 50.0,
        step_height: float = 30.0,
        gait_speed: float = 1.0,
        walk_x: float = 0.0,
        walk_y: float = 1.0,
        turn_z: float = 0.0,
        body_height: float = -80.0,
        body_roll: float = 0.0,
        body_pitch: float = 0.0,
        smooth_transitions: bool = True,
        harmonic_stance: bool = True,
        neutral_stances: Optional[Dict[LegIdentifier, Tuple[float, float, float]]] = None,
        geometry: Optional[Any] = None,
    ):
        initial_gait = GaitType(gait_type) if isinstance(gait_type, str) else gait_type
        self._target_gait_type: GaitType = initial_gait
        self._source_gait_type: GaitType = initial_gait
        self._transition_progress: float = 1.0  # 1.0 = not transitioning

        self.step_length = step_length
        self.step_height = step_height
        self.gait_speed = gait_speed
        self.phase = 0.0
        self.smooth_transitions = smooth_transitions
        self.harmonic_stance = harmonic_stance

        # Locomotion command inputs (-1.0 to +1.0)
        self.walk_x = walk_x  # Strafe (+1.0 = Right, -1.0 = Left)
        self.walk_y = walk_y  # Forward (+1.0 = Forward, -1.0 = Backward)
        self.turn_z = turn_z  # Yaw (+1.0 = Turn Left, -1.0 = Turn Right)

        # Filtered / smoothed motion states
        self._curr_walk_x = float(walk_x)
        self._curr_walk_y = float(walk_y)
        self._curr_turn_z = float(turn_z)

        # Body attitude / pose targets (mm and degrees)
        self.body_height = body_height
        self.body_roll = body_roll    # Degrees (+: roll right, -: roll left)
        self.body_pitch = body_pitch  # Degrees (+: nose up, -: nose down)

        # Dynamic physical geometry mapping
        self.mount_points: Dict[LegIdentifier, Tuple[float, float]] = dict(self.MOUNT_POINTS)
        self.neutral_stances: Dict[LegIdentifier, Tuple[float, float, float]] = (
            dict(neutral_stances) if neutral_stances is not None else dict(self.NEUTRAL_STANCES)
        )
        if neutral_stances is not None and body_height == -80.0:
            first_z = next(iter(self.neutral_stances.values()))[2]
            if first_z != -80.0:
                self.body_height = first_z
        if geometry is not None:
            self.apply_geometry(geometry)

        # Filtered / smoothed attitude states
        self._curr_body_height = float(self.body_height)
        self._curr_body_roll = float(body_roll)
        self._curr_body_pitch = float(body_pitch)

        # Output position history for slew-rate limiting
        self._current_positions: Dict[LegIdentifier, Tuple[float, float, float]] = {
            leg_id: (self.neutral_stances[leg_id][0], self.neutral_stances[leg_id][1], self.body_height)
            for leg_id in LegIdentifier
        }

        # Retain backward compatibility attributes
        self.tripod_a = {LegIdentifier.LEFT_FRONT, LegIdentifier.LEFT_REAR, LegIdentifier.RIGHT_MIDDLE}
        self.tripod_b = {LegIdentifier.RIGHT_FRONT, LegIdentifier.RIGHT_REAR, LegIdentifier.LEFT_MIDDLE}

    def apply_geometry(self, geometry: Any) -> None:
        """
        Configures chassis mounting points and neutral stance from a GeometryConfig.
        """
        if hasattr(geometry, "chassis") and geometry.chassis:
            chassis = geometry.chassis
            half_w_fr = chassis.width_front_rear / 2.0
            half_w_m = chassis.width_middle / 2.0
            dy = chassis.axis_distance_longitudinal

            self.mount_points = {
                LegIdentifier.LEFT_FRONT: (-half_w_fr, -dy),
                LegIdentifier.LEFT_MIDDLE: (-half_w_m, 0.0),
                LegIdentifier.LEFT_REAR: (-half_w_fr, dy),
                LegIdentifier.RIGHT_FRONT: (half_w_fr, -dy),
                LegIdentifier.RIGHT_MIDDLE: (half_w_m, 0.0),
                LegIdentifier.RIGHT_REAR: (half_w_fr, dy),
            }

        if hasattr(geometry, "default_stance") and geometry.default_stance:
            clearance = getattr(geometry.default_stance, "ground_clearance", 80.0)
            self.body_height = -abs(float(clearance))
            self._curr_body_height = self.body_height

    @property
    def gait_type(self) -> GaitType:
        """Returns the active or target gait type."""
        return self._target_gait_type

    @gait_type.setter
    def gait_type(self, value: Union[GaitType, str]) -> None:
        self.set_gait_type(value)

    @property
    def is_transitioning(self) -> bool:
        """Returns True if a seamless gait morph is currently underway."""
        return self._transition_progress < 1.0

    @property
    def transition_progress(self) -> float:
        """Returns transition progress from 0.0 (just started) to 1.0 (completed)."""
        return self._transition_progress

    def set_velocity(self, walk_x: float = 0.0, walk_y: float = 0.0, turn_z: float = 0.0, immediate: bool = False) -> None:
        """Sets the normalized velocity vectors."""
        self.walk_x = max(-1.0, min(1.0, float(walk_x)))
        self.walk_y = max(-1.0, min(1.0, float(walk_y)))
        self.turn_z = max(-1.0, min(1.0, float(turn_z)))
        if immediate or not self.smooth_transitions:
            self._curr_walk_x = self.walk_x
            self._curr_walk_y = self.walk_y
            self._curr_turn_z = self.turn_z

    def set_pose(self, height: float = -80.0, roll: float = 0.0, pitch: float = 0.0, immediate: bool = False) -> None:
        """Sets the chassis pose (height in mm, roll and pitch in degrees)."""
        self.body_height = max(-120.0, min(-40.0, float(height)))
        self.body_roll = max(-25.0, min(25.0, float(roll)))
        self.body_pitch = max(-25.0, min(25.0, float(pitch)))
        if immediate or not self.smooth_transitions:
            self._curr_body_height = self.body_height
            self._curr_body_roll = self.body_roll
            self._curr_body_pitch = self.body_pitch
            for leg_id in LegIdentifier:
                nx, ny, _ = self.neutral_stances[leg_id]
                sz = self._get_leg_stance_z(leg_id, self._curr_body_roll, self._curr_body_pitch, self._curr_body_height)
                self._current_positions[leg_id] = (nx, ny, sz)

    def set_gait_type(self, gait_type: Union[GaitType, str], smooth: bool = True) -> None:
        """
        Switches the gait pattern. If smooth is True, morphs smoothly without jumps.
        """
        new_gait = GaitType(gait_type) if isinstance(gait_type, str) else gait_type
        if new_gait == self._target_gait_type and self._transition_progress >= 1.0:
            return

        if not smooth or not self.smooth_transitions:
            self._source_gait_type = new_gait
            self._target_gait_type = new_gait
            self._transition_progress = 1.0
        else:
            # Begin seamless transition from current interpolated state to target
            self._source_gait_type = self._target_gait_type
            self._target_gait_type = new_gait
            self._transition_progress = 0.0

    def _get_interpolated_gait_parameters(self) -> Tuple[float, Dict[LegIdentifier, float]]:
        """
        Computes the current swing fraction and phase offsets, smoothly morphing
        between source and target gaits using an S-curve and circular phase shortest-arc.
        """
        if self._transition_progress >= 1.0:
            return self.GAIT_CONFIGS[self._target_gait_type]

        # S-Curve easing: smooth start and smooth stop (zero jerk at boundaries)
        s = 0.5 * (1.0 - math.cos(math.pi * self._transition_progress))

        src_swing, src_offsets = self.GAIT_CONFIGS[self._source_gait_type]
        tgt_swing, tgt_offsets = self.GAIT_CONFIGS[self._target_gait_type]

        # Blend swing fraction
        blended_swing = src_swing + s * (tgt_swing - src_swing)

        # Blend phase offsets along the shortest circular arc
        blended_offsets = {}
        for leg_id in LegIdentifier:
            src_off = src_offsets[leg_id]
            tgt_off = tgt_offsets[leg_id]
            # Shortest difference on unit circle [-0.5, +0.5]
            diff = ((tgt_off - src_off + 0.5) % 1.0) - 0.5
            blended_offsets[leg_id] = (src_off + s * diff) % 1.0

        return blended_swing, blended_offsets

    def _get_leg_stance_z(self, leg_id: LegIdentifier, roll: float, pitch: float, height: float) -> float:
        """Calculates stance height for a leg taking roll and pitch into account."""
        mx, my = self.mount_points[leg_id]
        roll_rad = math.radians(roll)
        pitch_rad = math.radians(pitch)

        # Roll right (+roll): Right chassis mount (mx > 0) is lower -> leg contracts (z increases)
        # Pitch up (+pitch): Front chassis mount (my < 0) is higher -> leg extends (z decreases)
        z_offset = mx * math.sin(roll_rad) + my * math.sin(pitch_rad)
        return height + z_offset

    def tick(self) -> Dict[LegIdentifier, Tuple[float, float, float]]:
        """
        Calculates the target (x, y, z) foot positions for all six legs with
        smooth transitions across gaits, velocity ramping, and posture changes.
        """
        # 1. Update smooth velocity and attitude states
        if self.smooth_transitions:
            rate = 0.20  # Fast but smooth response (approx. 150-250ms convergence)
            self._curr_walk_x += (self.walk_x - self._curr_walk_x) * rate
            self._curr_walk_y += (self.walk_y - self._curr_walk_y) * rate
            self._curr_turn_z += (self.turn_z - self._curr_turn_z) * rate

            self._curr_body_height += (self.body_height - self._curr_body_height) * rate
            self._curr_body_roll += (self.body_roll - self._curr_body_roll) * rate
            self._curr_body_pitch += (self.body_pitch - self._curr_body_pitch) * rate

            # Advance gait morph progress
            if self._transition_progress < 1.0:
                # Transition takes approx 1.0-1.5 gait cycles
                step = 0.02 * self.gait_speed
                self._transition_progress = min(1.0, self._transition_progress + step)
        else:
            self._curr_walk_x = float(self.walk_x)
            self._curr_walk_y = float(self.walk_y)
            self._curr_turn_z = float(self.turn_z)
            self._curr_body_height = float(self.body_height)
            self._curr_body_roll = float(self.body_roll)
            self._curr_body_pitch = float(self.body_pitch)
            self._transition_progress = 1.0

        swing_frac, phase_offsets = self._get_interpolated_gait_parameters()

        # Motion activity based on smoothed input
        effective_speed = math.sqrt(
            self._curr_walk_x**2 + self._curr_walk_y**2 + (self._curr_turn_z * 0.75)**2
        )
        is_moving = effective_speed > 0.01

        if is_moving:
            self.phase = (self.phase + 0.02 * self.gait_speed) % 1.0

        # World displacement components
        dx_walk_w = self._curr_walk_x * self.step_length
        dy_walk_w = -self._curr_walk_y * self.step_length
        turn_stride = self.step_length * 0.75

        new_positions = {}

        for leg_id in LegIdentifier:
            neutral_x, neutral_y, _ = self.neutral_stances[leg_id]
            stance_z = self._get_leg_stance_z(
                leg_id, self._curr_body_roll, self._curr_body_pitch, self._curr_body_height
            )

            if not is_moving:
                # Stationary pose: feet firmly on the ground with body attitude
                raw_x, raw_y, raw_z = neutral_x, neutral_y, stance_z
            else:
                mx, my = self.mount_points[leg_id]
                dx_turn_w = self._curr_turn_z * turn_stride * (my / 100.0)
                dy_turn_w = -self._curr_turn_z * turn_stride * (mx / 100.0)

                total_dx_w = dx_walk_w + dx_turn_w
                total_dy_w = dy_walk_w + dy_turn_w

                is_left = (leg_id.value[0] == BodySide.LEFT)
                stride_x_leg = -total_dx_w if is_left else total_dx_w
                stride_y_leg = -total_dy_w if is_left else total_dy_w

                offset = phase_offsets[leg_id]
                leg_phase = (self.phase + offset) % 1.0

                if leg_phase < swing_frac:
                    norm = leg_phase / swing_frac  # 0.0 to 1.0
                    stride_norm = -0.5 * math.cos(norm * math.pi)
                    raw_z = stance_z + self.step_height * math.sin(norm * math.pi)
                else:
                    norm = (leg_phase - swing_frac) / (1.0 - swing_frac)  # 0.0 to 1.0
                    if self.harmonic_stance:
                        # Ultra-smooth harmonic cosine stance: zero velocity at touchdown and liftoff (C1 continuous)
                        stride_norm = 0.5 * math.cos(norm * math.pi)
                    else:
                        stride_norm = 0.5 - norm
                    raw_z = stance_z

                raw_x = neutral_x + stride_norm * stride_x_leg
                raw_y = neutral_y + stride_norm * stride_y_leg

            # Slew-rate limiting: cap maximal coordinate jump per tick to ensure butter-smooth motion
            if self.smooth_transitions and leg_id in self._current_positions:
                prev_x, prev_y, prev_z = self._current_positions[leg_id]
                dx = raw_x - prev_x
                dy = raw_y - prev_y
                dz = raw_z - prev_z
                dist = math.sqrt(dx * dx + dy * dy + dz * dz)
                max_jump = 18.0 * max(0.5, self.gait_speed)
                if dist > max_jump and dist > 0.001:
                    scale = max_jump / dist
                    out_x = prev_x + dx * scale
                    out_y = prev_y + dy * scale
                    out_z = prev_z + dz * scale
                else:
                    out_x, out_y, out_z = raw_x, raw_y, raw_z
            else:
                out_x, out_y, out_z = raw_x, raw_y, raw_z

            self._current_positions[leg_id] = (out_x, out_y, out_z)
            new_positions[leg_id] = (out_x, out_y, out_z)

        return new_positions


class TripodGait(OmniGait):
    """Convenience class for Tripod Gait (backward compatible)."""
    def __init__(
        self,
        step_length: float = 50.0,
        step_height: float = 30.0,
        gait_speed: float = 1.0,
        harmonic_stance: bool = True,
        geometry: Optional[Any] = None
    ):
        super().__init__(
            gait_type=GaitType.TRIPOD,
            step_length=step_length,
            step_height=step_height,
            gait_speed=gait_speed,
            walk_x=0.0,
            walk_y=1.0,
            turn_z=0.0,
            harmonic_stance=harmonic_stance,
            geometry=geometry,
        )

class RippleGait(OmniGait):
    """Convenience class for Ripple Gait."""
    def __init__(
        self,
        step_length: float = 50.0,
        step_height: float = 30.0,
        gait_speed: float = 1.0,
        harmonic_stance: bool = True,
        geometry: Optional[Any] = None
    ):
        super().__init__(
            gait_type=GaitType.RIPPLE,
            step_length=step_length,
            step_height=step_height,
            gait_speed=gait_speed,
            walk_x=0.0,
            walk_y=1.0,
            turn_z=0.0,
            harmonic_stance=harmonic_stance,
            geometry=geometry,
        )


class WaveGait(OmniGait):
    """Convenience class for Wave Gait."""
    def __init__(
        self,
        step_length: float = 50.0,
        step_height: float = 30.0,
        gait_speed: float = 1.0,
        harmonic_stance: bool = True,
        geometry: Optional[Any] = None
    ):
        super().__init__(
            gait_type=GaitType.WAVE,
            step_length=step_length,
            step_height=step_height,
            gait_speed=gait_speed,
            walk_x=0.0,
            walk_y=1.0,
            turn_z=0.0,
            harmonic_stance=harmonic_stance,
            geometry=geometry,
        )

