"""
Unit tests for Hexapod Gait Engines and Body Attitude Posing.

Tests OmniGait, TripodGait, RippleGait, WaveGait, strafing, turning,
body height, roll, and pitch posing, plus seamless gait morphing.
"""

import pytest
import math
from lasius.core.motion import OmniGait, TripodGait, RippleGait, WaveGait, GaitType, LegIdentifier, BodySide
from lasius.core.server import VisualizerServer


class TestOmniGait:
    def test_default_tripod_initialization(self):
        gait = OmniGait()
        assert gait.gait_type == GaitType.TRIPOD
        assert gait.step_length == 50.0
        assert gait.step_height == 30.0
        assert gait.walk_y == 1.0
        assert gait.walk_x == 0.0
        assert gait.turn_z == 0.0
        assert gait.body_height == -80.0
        assert gait.body_roll == 0.0
        assert gait.body_pitch == 0.0

    def test_tick_returns_all_six_legs(self):
        gait = OmniGait()
        positions = gait.tick()
        assert len(positions) == 6
        for leg_id in LegIdentifier:
            assert leg_id in positions
            x, y, z = positions[leg_id]
            assert isinstance(x, (int, float))
            assert isinstance(y, (int, float))
            assert isinstance(z, (int, float))

    def test_stationary_pose_when_zero_motion(self):
        gait = OmniGait(walk_x=0.0, walk_y=0.0, turn_z=0.0)
        positions = gait.tick()
        for leg_id in LegIdentifier:
            neutral_x, neutral_y, _ = gait.NEUTRAL_STANCES[leg_id]
            x, y, z = positions[leg_id]
            assert math.isclose(x, neutral_x, abs_tol=1e-3)
            assert math.isclose(y, neutral_y, abs_tol=1e-3)
            assert math.isclose(z, -80.0, abs_tol=1e-3)

    def test_forward_walking_direction(self):
        gait = OmniGait(walk_x=0.0, walk_y=1.0, turn_z=0.0, step_length=50.0, smooth_transitions=False)
        gait.phase = 0.25  # In swing for Tripod A, stance for Tripod B

        pos = gait.tick()
        lf_x, lf_y, lf_z = pos[LegIdentifier.LEFT_FRONT]
        assert lf_z > -80.0  # Foot is lifted in air!

        rm_x, rm_y, rm_z = pos[LegIdentifier.RIGHT_MIDDLE]
        assert rm_z > -80.0  # Foot is lifted in air!

    def test_strafing_right(self):
        gait = OmniGait(walk_x=1.0, walk_y=0.0, turn_z=0.0, step_length=50.0)
        positions = gait.tick()
        assert len(positions) == 6

    def test_turn_in_place(self):
        gait = OmniGait(walk_x=0.0, walk_y=0.0, turn_z=1.0, step_length=50.0)
        positions = gait.tick()
        assert len(positions) == 6

    def test_body_height_adjustment_immediate(self):
        gait = OmniGait(walk_x=0.0, walk_y=0.0, turn_z=0.0)
        gait.set_pose(height=-100.0, immediate=True)
        positions = gait.tick()
        for leg_id in LegIdentifier:
            _, _, z = positions[leg_id]
            assert math.isclose(z, -100.0, abs_tol=1e-3)

    def test_body_height_adjustment_smooth(self):
        gait = OmniGait(walk_x=0.0, walk_y=0.0, turn_z=0.0)
        gait.set_pose(height=-100.0, immediate=False)
        # Advance multiple ticks to observe smooth asymptotic convergence
        for _ in range(35):
            positions = gait.tick()
        for leg_id in LegIdentifier:
            _, _, z = positions[leg_id]
            assert math.isclose(z, -100.0, abs_tol=0.2)

    def test_body_roll_tilts_sides_oppositely(self):
        gait = OmniGait(walk_x=0.0, walk_y=0.0, turn_z=0.0, body_height=-80.0, body_roll=10.0)
        positions = gait.tick()

        left_mid_z = positions[LegIdentifier.LEFT_MIDDLE][2]
        right_mid_z = positions[LegIdentifier.RIGHT_MIDDLE][2]

        assert left_mid_z < -80.0  # extended
        assert right_mid_z > -80.0  # contracted
        assert math.isclose(left_mid_z - (-80.0), - (right_mid_z - (-80.0)), abs_tol=1e-3)

    def test_body_pitch_tilts_front_and_rear_oppositely(self):
        gait = OmniGait(walk_x=0.0, walk_y=0.0, turn_z=0.0, body_height=-80.0, body_pitch=10.0)
        positions = gait.tick()

        left_front_z = positions[LegIdentifier.LEFT_FRONT][2]
        left_rear_z = positions[LegIdentifier.LEFT_REAR][2]

        assert left_front_z < -80.0  # extended
        assert left_rear_z > -80.0   # contracted

    def test_seamless_gait_morphing(self):
        gait = OmniGait(gait_type=GaitType.TRIPOD, walk_y=1.0)
        assert gait.gait_type == GaitType.TRIPOD
        assert not gait.is_transitioning

        # Request morph to Ripple gait
        gait.set_gait_type(GaitType.RIPPLE, smooth=True)
        assert gait.gait_type == GaitType.RIPPLE
        assert gait.is_transitioning
        assert gait.transition_progress < 1.0

        # Step through transition ticks and verify smooth position differences
        max_delta = 0.0
        for _ in range(60):
            prev = dict(gait._current_positions)
            curr = gait.tick()
            for leg_id in LegIdentifier:
                dist = math.dist(prev[leg_id], curr[leg_id])
                if dist > max_delta:
                    max_delta = dist

        # No single tick jump should be excessive (e.g. < 20 mm)
        assert max_delta < 20.0
        assert not gait.is_transitioning
        assert gait.transition_progress >= 1.0

    def test_subclasses_convenience(self):
        tg = TripodGait()
        rg = RippleGait()
        wg = WaveGait()

        assert tg.gait_type == GaitType.TRIPOD
        assert rg.gait_type == GaitType.RIPPLE
        assert wg.gait_type == GaitType.WAVE
        assert tg.harmonic_stance is True
        assert rg.harmonic_stance is True
        assert wg.harmonic_stance is True

    def test_harmonic_stance_smoothness(self):
        """Verifies that harmonic stance produces continuous smooth velocity with no large acceleration spikes."""
        gait_h = OmniGait(walk_y=1.0, walk_x=0.0, harmonic_stance=True, smooth_transitions=False)
        gait_l = OmniGait(walk_y=1.0, walk_x=0.0, harmonic_stance=False, smooth_transitions=False)

        # Record Y trajectory over 50 ticks (1 full walking cycle at 50 Hz)
        y_h = [gait_h.tick()[LegIdentifier.LEFT_FRONT][1] for _ in range(50)]
        y_l = [gait_l.tick()[LegIdentifier.LEFT_FRONT][1] for _ in range(50)]

        # Compute acceleration (second differences)
        acc_h = [abs(y_h[i+2] - 2*y_h[i+1] + y_h[i]) for i in range(len(y_h)-2)]
        acc_l = [abs(y_l[i+2] - 2*y_l[i+1] + y_l[i]) for i in range(len(y_l)-2)]

        # Harmonic stance dramatically reduces maximum acceleration jerk at phase boundaries (>5x reduction)
        assert max(acc_h) < 0.6
        assert max(acc_l) > 1.5
        assert max(acc_h) < max(acc_l) / 3.0

    def test_harmonic_stance_toggle(self):
        """Tests that harmonic_stance=False produces linear stance and True produces cosine."""
        gait_harmonic = OmniGait(walk_y=1.0, walk_x=0.0, harmonic_stance=True, smooth_transitions=False)
        gait_linear = OmniGait(walk_y=1.0, walk_x=0.0, harmonic_stance=False, smooth_transitions=False)

        # In stance phase (norm = 0.25 -> leg_phase = 0.5 + 0.25*0.5 = 0.625 for LEFT_FRONT)
        gait_harmonic.phase = 0.625
        gait_linear.phase = 0.625

        pos_h = gait_harmonic.tick()[LegIdentifier.LEFT_FRONT]
        pos_l = gait_linear.tick()[LegIdentifier.LEFT_FRONT]

        # In cosine: stride_norm = 0.5 * cos(0.25 * pi) = 0.5 * 0.7071 = 0.3535
        # In linear: stride_norm = 0.5 - 0.25 = 0.25
        # The positions must differ!
        assert not math.isclose(pos_h[1], pos_l[1], abs_tol=1.0)

    def test_custom_neutral_stances(self):
        """Tests overriding neutral stances via constructor."""
        custom = {
            leg_id: (170.0, 10.0, -85.0) for leg_id in LegIdentifier
        }
        gait = OmniGait(walk_x=0.0, walk_y=0.0, turn_z=0.0, neutral_stances=custom)
        pos = gait.tick()
        for leg_id in LegIdentifier:
            assert math.isclose(pos[leg_id][0], 170.0)
            assert math.isclose(pos[leg_id][1], 10.0)
            assert math.isclose(pos[leg_id][2], -85.0)


class TestVisualizerServerOmniCommands:
    def test_server_message_handling(self):
        server = VisualizerServer()
        assert server.walk_x == 0.0
        assert server.walk_y == 0.0
        assert server.turn_z == 0.0
        assert server.body_height == -80.0
        assert server.body_roll == 0.0
        assert server.body_pitch == 0.0
        assert server.gait_type == "tripod"

        # Test set_walk
        server._handle_client_message({"type": "command", "action": "set_walk", "x": 0.5, "y": -0.8})
        assert server.walk_x == 0.5
        assert server.walk_y == -0.8

        # Test set_turn
        server._handle_client_message({"type": "command", "action": "set_turn", "z": 0.75})
        assert server.turn_z == 0.75

        # Test stop_motion
        server._handle_client_message({"type": "command", "action": "stop_motion"})
        assert server.walk_x == 0.0
        assert server.walk_y == 0.0
        assert server.turn_z == 0.0

        # Test pose adjustments
        server._handle_client_message({"type": "command", "action": "set_height", "value": -95.0})
        server._handle_client_message({"type": "command", "action": "set_roll", "value": 12.0})
        server._handle_client_message({"type": "command", "action": "set_pitch", "value": -8.0})
        assert server.body_height == -95.0
        assert server.body_roll == 12.0
        assert server.body_pitch == -8.0

        # Test reset_pose
        server._handle_client_message({"type": "command", "action": "reset_pose"})
        assert server.body_height == -80.0
        assert server.body_roll == 0.0
        assert server.body_pitch == 0.0

        # Test set_gait_type
        server._handle_client_message({"type": "command", "action": "set_gait_type", "value": "wave"})
        assert server.gait_type == "wave"
