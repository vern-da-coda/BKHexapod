"""
Unit & Integration Tests for `LasiusServer` / `VisualizerServer` (`tests.test_visualizer`).

Purpose & Role:
    Verifies non-blocking server initialization, layout generation, HTTP static
    dashboard hosting, bidirectional WebSocket telemetry/command streaming, and
    idempotent server shutdown.
"""

import asyncio
import json
import socket
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any

import pytest
import websockets

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.append(str(PROJECT_ROOT))

from lasius.core.motion import BodySide, LegRow
from lasius.core.server import VisualizerServer


def get_free_port() -> int:
    """Finds an unused port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


@dataclass
class DummyServoConfig:
    name: str


@dataclass
class DummyServo:
    config: DummyServoConfig


@dataclass
class DummyJoint:
    servo: DummyServo
    length: float


@dataclass
class DummyLeg:
    coxa: DummyJoint
    femur: DummyJoint
    tibia: DummyJoint


class MockHexapod:
    """A minimal mock representing a hexapod with 6 legs."""
    def __init__(self):
        self.legs: Dict[Any, DummyLeg] = {}
        for side in (BodySide.LEFT, BodySide.RIGHT):
            for row in (LegRow.FRONT, LegRow.MIDDLE, LegRow.REAR):
                leg_name = f"{side.value}_{row.value}"
                self.legs[(side, row)] = DummyLeg(
                    coxa=DummyJoint(servo=DummyServo(config=DummyServoConfig(name=f"{leg_name}_coxa")), length=60.0),
                    femur=DummyJoint(servo=DummyServo(config=DummyServoConfig(name=f"{leg_name}_femur")), length=100.0),
                    tibia=DummyJoint(servo=DummyServo(config=DummyServoConfig(name=f"{leg_name}_tibia")), length=130.0),
                )


@pytest.fixture
def mock_hexapod() -> MockHexapod:
    return MockHexapod()


def test_server_initialization():
    """Tests that VisualizerServer does not bind sockets on initialization."""
    http_port = get_free_port()
    ws_port = get_free_port()

    viz = VisualizerServer(host="localhost", http_port=http_port, ws_port=ws_port)
    assert viz.http_server is None
    assert len(viz.clients) == 0
    assert viz.hexapod_layout == {}
    assert viz.is_paused is False
    assert viz.gait_speed == 1.0


def test_server_start_layout_and_http(mock_hexapod: MockHexapod):
    """Tests starting the server, layout generation, and HTTP serving."""
    http_port = get_free_port()
    ws_port = get_free_port()

    viz = VisualizerServer(host="localhost", http_port=http_port, ws_port=ws_port)
    try:
        viz.start(mock_hexapod)
        assert viz.http_server is not None
        assert "body" in viz.hexapod_layout
        assert len(viz.hexapod_layout["body"]["vertices"]) == 6
        assert len(viz.hexapod_layout["legs"]) == 6

        # Check HTTP response
        time.sleep(0.1)
        url = f"http://localhost:{http_port}/"
        with urllib.request.urlopen(url, timeout=2.0) as response:
            assert response.status == 200
            content = response.read().decode("utf-8")
            assert "Digital Twin" in content
    finally:
        viz.stop()
        assert viz.http_server is None


def test_websocket_stream_and_disconnect(mock_hexapod: MockHexapod):
    """Tests WebSocket connection, receiving layout, streaming angle updates, and disconnect."""
    http_port = get_free_port()
    ws_port = get_free_port()

    viz = VisualizerServer(host="localhost", http_port=http_port, ws_port=ws_port)
    try:
        viz.start(mock_hexapod)
        time.sleep(0.1)

        async def run_client_workflow():
            uri = f"ws://localhost:{ws_port}"
            async with websockets.connect(uri) as ws:
                # 1. First message should be the robot layout
                layout_msg_raw = await ws.recv()
                layout_msg = json.loads(layout_msg_raw)
                assert layout_msg["type"] == "layout"
                assert "legs" in layout_msg["data"]

                # 2. Second message is initial control state
                state_msg_raw = await ws.recv()
                state_msg = json.loads(state_msg_raw)
                assert state_msg["type"] == "state"
                assert state_msg["data"]["is_paused"] is False

                # 3. Server sends angles update
                viz.send_angles_update({"left_front_coxa": 25.0, "left_front_femur": -15.0})
                angles_msg_raw = await ws.recv()
                angles_msg = json.loads(angles_msg_raw)
                assert angles_msg["type"] == "angles"
                assert angles_msg["data"]["left_front_coxa"] == 25.0

            # 4. Client disconnected here
            await asyncio.sleep(0.1)

        asyncio.run(run_client_workflow())

        # 5. Sending update when no clients are connected should succeed quietly
        viz.send_angles_update({"left_front_coxa": 0.0})
    finally:
        viz.stop()


def test_websocket_bidirectional_controls(mock_hexapod: MockHexapod):
    """Tests client sending commands to server, modifying gait controls and receiving state broadcasts."""
    http_port = get_free_port()
    ws_port = get_free_port()

    viz = VisualizerServer(host="localhost", http_port=http_port, ws_port=ws_port)
    try:
        viz.start(mock_hexapod)
        time.sleep(0.1)

        async def run_control_test():
            uri = f"ws://localhost:{ws_port}"
            # Retry connection until server thread is listening
            ws = None
            for _ in range(30):
                try:
                    ws = await websockets.connect(uri)
                    break
                except (OSError, ConnectionRefusedError):
                    await asyncio.sleep(0.05)
            assert ws is not None, "Failed to connect to WebSocket server"

            async with ws:
                # 1. Layout message
                msg1 = json.loads(await ws.recv())
                assert msg1["type"] == "layout"

                # 2. Initial state message
                msg2 = json.loads(await ws.recv())
                assert msg2["type"] == "state"
                assert msg2["data"]["is_paused"] is False
                assert msg2["data"]["gait_speed"] == 1.0

                # 3. Send toggle_pause
                await ws.send(json.dumps({"type": "command", "action": "toggle_pause"}))
                state_msg = json.loads(await ws.recv())
                assert state_msg["type"] == "state"
                assert state_msg["data"]["is_paused"] is True
                assert viz.is_paused is True

                # 4. Send set_speed
                await ws.send(json.dumps({"type": "command", "action": "set_speed", "value": 2.5}))
                state_msg = json.loads(await ws.recv())
                assert state_msg["data"]["gait_speed"] == 2.5
                assert viz.gait_speed == 2.5

                # 5. Send set_step_height
                await ws.send(json.dumps({"type": "command", "action": "set_step_height", "value": 45.0}))
                state_msg = json.loads(await ws.recv())
                assert state_msg["data"]["step_height"] == 45.0
                assert viz.step_height == 45.0

                # 6. Send set_step_length
                await ws.send(json.dumps({"type": "command", "action": "set_step_length", "value": 65.0}))
                state_msg = json.loads(await ws.recv())
                assert state_msg["data"]["step_length"] == 65.0
                assert viz.step_length == 65.0

        asyncio.run(run_control_test())
    finally:
        viz.stop()


def test_server_stop_idempotent(mock_hexapod: MockHexapod):
    """Tests that stop() can be called multiple times safely."""
    http_port = get_free_port()
    ws_port = get_free_port()

    viz = VisualizerServer(host="localhost", http_port=http_port, ws_port=ws_port)
    viz.start(mock_hexapod)
    viz.stop()
    viz.stop()
