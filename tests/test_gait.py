"""
Unit tests for Hexapod Gait Engines and Body Attitude Posing.

Tests OmniGait, TripodGait, RippleGait, WaveGait, strafing, turning,
body height, roll, and pitch posing, plus seamless gait morphing.
"""

import pytest
import math
from bkhexapod.gait import OmniGait, TripodGait, RippleGait, WaveGait, GaitType
from bkhexapod.leg import LegIdentifier, BodySide
from bkhexapod.visualizer.server import VisualizerServer


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


class TestVisualizerServerOmniCommands:
    def test_server_message_handling(self):
        server = VisualizerServer()
        assert server.walk_x == 0.0
        assert server.walk_y == 1.0
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
