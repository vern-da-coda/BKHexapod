"""
Unit & Integration Tests for the Order Control Layer and REST API (`tests.test_orders`).

Purpose & Role:
    Tests `Order` serialization, `OrderDispatcher` command arbitration,
    synchronization between `LasiusServer` and `OmniGait`, safe `locomotion_active`
    engagement/disengagement, asynchronous leg test sequences, and all HTTP REST
    endpoints (`/api/v1/...`).
"""

import json
import time
import urllib.request
import urllib.error
import pytest

from lasius.core.config import load_config
from lasius.core.hardware import MockPWMDriver
from lasius.core.control import Order, OrderAction, OrderPriority, OrderStatus, OrderResult, OrderDispatcher
from lasius.core.robot import Hexapod
from lasius.core.server import LasiusServer


@pytest.fixture
def mock_robot(tmp_path):
    from pathlib import Path
    cfg_path = Path(__file__).parent.parent / "src/lasius/core/config.yaml"
    config = load_config(cfg_path)
    drivers = {
        0x40: MockPWMDriver(),
        0x42: MockPWMDriver(),
    }
    return Hexapod(config=config, drivers=drivers)


class TestOrderModels:
    def test_order_creation_and_serialization(self):
        order = Order(
            action=OrderAction.SET_VELOCITY,
            params={"walk_x": 0.5, "walk_y": 1.0, "turn_z": -0.2},
            priority=OrderPriority.HIGH,
            source="test",
        )
        assert order.action == OrderAction.SET_VELOCITY
        assert order.priority == OrderPriority.HIGH

        d = order.to_dict()
        assert d["action"] == "set_velocity"
        assert d["params"]["walk_x"] == 0.5
        assert d["priority"] == 20
        assert d["source"] == "test"

    def test_order_from_dict(self):
        payload = {
            "action": "test_leg",
            "params": {"leg": "left_rear", "cycles": 3},
            "source": "rest_test",
        }
        order = Order.from_dict(payload)
        assert order.action == OrderAction.TEST_LEG
        assert order.params["leg"] == "left_rear"
        assert order.params["cycles"] == 3
        assert order.source == "rest_test"

    def test_order_from_dict_invalid_action(self):
        with pytest.raises(ValueError, match="Unknown or unsupported OrderAction"):
            Order.from_dict({"action": "fly_to_moon"})


class TestOrderDispatcher:
    def test_immediate_velocity_and_pose(self, mock_robot):
        server = LasiusServer(host="127.0.0.1", http_port=9910, ws_port=9911)
        dispatcher = OrderDispatcher(robot=mock_robot, server=server)

        # Set velocity
        from lasius.core.motion import OmniGait
        mock_robot.set_gait(OmniGait(walk_x=0.0, walk_y=0.0, turn_z=0.0, geometry=mock_robot.config.geometry), engage=False)
        assert mock_robot.locomotion_active is False

        res = dispatcher.dispatch(Order(
            action=OrderAction.SET_VELOCITY,
            params={"walk_x": 0.5, "walk_y": -0.5, "turn_z": 0.3}
        ))
        assert res.status == OrderStatus.COMPLETED
        assert server.walk_x == 0.5
        assert server.walk_y == -0.5
        assert server.turn_z == 0.3
        assert mock_robot.gait_engine.walk_x == 0.5
        assert mock_robot.gait_engine.walk_y == -0.5
        assert mock_robot.gait_engine.turn_z == 0.3
        assert mock_robot.locomotion_active is True

        # Set pose
        res = dispatcher.dispatch(Order(
            action=OrderAction.SET_POSE,
            params={"height": -95.0, "roll": 12.0, "pitch": -8.0}
        ))
        assert res.status == OrderStatus.COMPLETED
        assert server.body_height == -95.0
        assert server.body_roll == 12.0
        assert server.body_pitch == -8.0
        assert mock_robot.gait_engine.body_height == -95.0
        assert mock_robot.gait_engine.body_roll == 12.0
        assert mock_robot.gait_engine.body_pitch == -8.0

        # Stop
        res = dispatcher.dispatch(Order(action=OrderAction.STOP))
        assert res.status == OrderStatus.COMPLETED
        assert server.walk_x == 0.0
        assert server.walk_y == 0.0
        assert server.turn_z == 0.0
        assert mock_robot.gait_engine.walk_x == 0.0
        assert mock_robot.gait_engine.walk_y == 0.0
        assert mock_robot.gait_engine.turn_z == 0.0

        # Set individual joint angle (disengages full-body gait loop so joint angle is not overwritten)
        res = dispatcher.dispatch(Order(
            action=OrderAction.SET_JOINT_ANGLE,
            params={"servo": "left_rear_coxa", "angle": 15.0}
        ))
        assert res.status == OrderStatus.COMPLETED
        assert mock_robot.locomotion_active is False
        from lasius.core.motion.leg import BodySide, LegRow
        lr_leg = mock_robot.legs[(BodySide.LEFT, LegRow.REAR)]
        assert lr_leg.coxa.servo.current_angle == 15.0

        # Set multiple leg joints
        res = dispatcher.dispatch(Order(
            action=OrderAction.SET_LEG_JOINTS,
            params={"leg": "left_rear", "coxa": -10.0, "femur": 25.0, "tibia": -35.0}
        ))
        assert res.status == OrderStatus.COMPLETED
        assert lr_leg.coxa.servo.current_angle == -10.0
        assert lr_leg.femur.servo.current_angle == 25.0
        assert lr_leg.tibia.servo.current_angle == -35.0

        # Show Pose: Crouch
        res = dispatcher.dispatch(Order(
            action=OrderAction.CROUCH,
            params={"height": -48.0, "pitch": -12.0}
        ))
        assert res.status == OrderStatus.COMPLETED
        assert server.body_height == -48.0
        assert server.body_pitch == -12.0
        assert mock_robot.locomotion_active is True

    def test_emergency_stop(self, mock_robot):
        server = LasiusServer(host="127.0.0.1", http_port=9912, ws_port=9913)
        dispatcher = OrderDispatcher(robot=mock_robot, server=server)
        server.walk_x = 1.0

        res = dispatcher.dispatch(Order(
            action=OrderAction.EMERGENCY_STOP,
            priority=OrderPriority.EMERGENCY
        ))
        assert res.status == OrderStatus.COMPLETED
        assert "EMERGENCY STOP" in res.message
        assert server.walk_x == 0.0
        assert server.is_paused is True

    def test_test_leg_sequence(self, mock_robot):
        server = LasiusServer(host="127.0.0.1", http_port=9914, ws_port=9915)
        dispatcher = OrderDispatcher(robot=mock_robot, server=server)

        # Dispatch async test_leg with 1 cycle
        res = dispatcher.dispatch(Order(
            action=OrderAction.TEST_LEG,
            params={"leg": "left_rear", "cycles": 1, "stride": 20.0, "lift": 15.0}
        ))
        assert res.status == OrderStatus.RUNNING

        # Wait for worker thread to complete (up to 3 seconds)
        for _ in range(30):
            if dispatcher.active_order is None and len(dispatcher.order_history) >= 1:
                break
            time.sleep(0.1)

        assert len(dispatcher.order_history) >= 1
        last_res = dispatcher.order_history[-1]
        assert last_res.action == "test_leg"
        assert last_res.status == OrderStatus.COMPLETED

    def test_sweep_joint_sequence(self, mock_robot):
        server = LasiusServer(host="127.0.0.1", http_port=9916, ws_port=9917)
        dispatcher = OrderDispatcher(robot=mock_robot, server=server)

        # Dispatch async sweep_joint with custom calibrated limits
        res = dispatcher.dispatch(Order(
            action=OrderAction.SWEEP_JOINT,
            params={"servo": "left_rear_coxa", "min_angle": -15.0, "max_angle": 15.0}
        ))
        assert res.status == OrderStatus.RUNNING

        for _ in range(60):
            if dispatcher.active_order is None and len(dispatcher.order_history) >= 1:
                break
            time.sleep(0.1)

        assert len(dispatcher.order_history) >= 1
        last_res = dispatcher.order_history[-1]
        assert last_res.action == "sweep_joint"
        assert last_res.status == OrderStatus.COMPLETED


class TestRestApi:
    @staticmethod
    def _free_port() -> int:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    @pytest.fixture
    def running_server(self):
        from pathlib import Path
        cfg_path = Path(__file__).parent.parent / "src/lasius/core/config.yaml"
        config = load_config(cfg_path)
        http_port = self._free_port()
        ws_port = self._free_port()
        server = LasiusServer(host="127.0.0.1", http_port=http_port, ws_port=ws_port)
        drivers = {
            0x40: MockPWMDriver(visualizer_server=server),
            0x42: MockPWMDriver(visualizer_server=server),
        }
        robot = Hexapod(config=config, drivers=drivers)
        time.sleep(0.05)
        yield server
        server.stop()

    def test_get_status(self, running_server):
        req = urllib.request.Request(f"http://127.0.0.1:{running_server.http_port}/api/v1/status")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "online"
            assert "control" in data
            assert data["control"]["gait_type"] == "tripod"

    def test_post_orders_valid(self, running_server):
        url = f"http://127.0.0.1:{running_server.http_port}/api/v1/orders"
        payload = json.dumps({
            "action": "set_velocity",
            "params": {"walk_x": 0.25, "walk_y": 0.75, "turn_z": 0.0}
        }).encode()

        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "completed"
            assert data["action"] == "set_velocity"

        assert running_server.walk_x == 0.25
        assert running_server.walk_y == 0.75

    def test_post_orders_invalid_action(self, running_server):
        url = f"http://127.0.0.1:{running_server.http_port}/api/v1/orders"
        payload = json.dumps({"action": "nonexistent_action"}).encode()
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req)
        assert exc_info.value.code == 400

    def test_post_emergency_stop_and_relax(self, running_server):
        # Trigger E-Stop
        req = urllib.request.Request(f"http://127.0.0.1:{running_server.http_port}/api/v1/emergency_stop", data=b"{}")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "completed"
            assert "EMERGENCY STOP" in data["message"]

        # Trigger Relax
        req = urllib.request.Request(f"http://127.0.0.1:{running_server.http_port}/api/v1/relax", data=b"{}")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "completed"

    def test_get_openapi_yaml(self, running_server):
        req = urllib.request.Request(f"http://127.0.0.1:{running_server.http_port}/api/v1/openapi.yaml")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            assert "yaml" in resp.headers.get("Content-Type", "")
            raw = resp.read().decode()
            assert "openapi: 3.1.0" in raw
            assert "Lasius Hexapod REST Control API" in raw

    def test_get_openapi_json(self, running_server):
        req = urllib.request.Request(f"http://127.0.0.1:{running_server.http_port}/api/v1/openapi.json")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["openapi"] == "3.1.0"
            assert data["info"]["title"] == "Lasius Hexapod REST Control API"
            assert "/api/v1/status" in data["paths"]
            assert "/api/v1/orders" in data["paths"]

    def test_post_server_restart(self, running_server):
        req = urllib.request.Request(f"http://127.0.0.1:{running_server.http_port}/api/v1/server/restart", data=b"{}")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "restarting"

    def test_post_server_shutdown(self, running_server):
        req = urllib.request.Request(f"http://127.0.0.1:{running_server.http_port}/api/v1/server/shutdown", data=b"{}")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "shutting_down"

    def test_get_system_stats(self, running_server):
        req = urllib.request.Request(f"http://127.0.0.1:{running_server.http_port}/api/v1/system/stats")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert "cpu" in data
            assert "memory" in data
            assert "thermal" in data
            assert "power" in data
            assert "wifi" in data
            assert "disk" in data
            assert "daemon" in data
            assert "percent" in data["cpu"]
            assert "percent" in data["memory"]
            assert "temp_c" in data["thermal"]
            assert "healthy" in data["power"]

    def test_calibration_rest_endpoints(self, running_server):
        # 1. GET /api/v1/calibration
        req = urllib.request.Request(f"http://127.0.0.1:{running_server.http_port}/api/v1/calibration")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "ok"
            assert "servos" in data
            assert "left_rear_coxa" in data["servos"]
            assert "center_offset_pulse" in data["servos"]["left_rear_coxa"]

        # 2. POST /api/v1/calibration/trim (live trim)
        payload = json.dumps({"servo": "left_rear_coxa", "offset": 15, "angle": 0.0}).encode()
        req = urllib.request.Request(
            f"http://127.0.0.1:{running_server.http_port}/api/v1/calibration/trim",
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "completed"

        # 3. POST /api/v1/calibration (save overlay)
        save_payload = json.dumps({"servo": "left_rear_coxa", "offset": 20, "orientation": 1}).encode()
        req = urllib.request.Request(
            f"http://127.0.0.1:{running_server.http_port}/api/v1/calibration",
            data=save_payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "saved"
            assert "left_rear_coxa" in data["updated_servos"]

        # 4. POST /api/v1/calibration/reset
        reset_payload = json.dumps({"servo": "left_rear_coxa"}).encode()
        req = urllib.request.Request(
            f"http://127.0.0.1:{running_server.http_port}/api/v1/calibration/reset",
            data=reset_payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "completed"

        # Cleanup test overlay
        from lasius.core.config import get_default_calibration_path
        cal_f = get_default_calibration_path()
        if cal_f.exists():
            cal_f.unlink()
