"""
Lasius Daemon & Telemetry Server Application (`lasius.core.server.app`).

Purpose & Role:
    Implements `LasiusServer` (aliased as `VisualizerServer`), the persistent
    network daemon that bridges the `Hexapod` hardware/simulation instance with
    browser-based 3D Digital Twin clients and REST/WebSocket controllers.

Classes & Functions:
    - `LasiusServer`:
        * Hosts compiled `lasius-dashboard/dist` assets and `/api/v1/...` REST endpoints on HTTP port 8000.
        * Runs an asyncio WebSocket server on port 8765 streaming 50 Hz joint angle updates,
          robot layout geometry, order execution states, and Raspberry Pi system telemetry.
        * Routes incoming WebSocket commands directly into `OrderDispatcher`.
    - `main()`: CLI entry point registered as `lasius-server` in `pyproject.toml`.
"""

import asyncio
from http.server import ThreadingHTTPServer
import json
import math
from pathlib import Path
import threading
import time
from typing import Any, Dict, Optional, Set, TYPE_CHECKING

try:
    import websockets
    try:
        from websockets.asyncio.server import ServerConnection
    except ImportError:
        from websockets.server import WebSocketServerProtocol as ServerConnection  # type: ignore
    from websockets.exceptions import ConnectionClosed
    HAS_WEBSOCKETS = True
except ImportError:
    websockets = None
    ServerConnection = Any  # type: ignore
    ConnectionClosed = Exception  # type: ignore
    HAS_WEBSOCKETS = False

from lasius.core.control.orders import Order, OrderAction, OrderPriority
from lasius.core.control.dispatcher import OrderDispatcher
from .handlers import LasiusRestHandler

if TYPE_CHECKING:
    from lasius.core.robot import Hexapod


class LasiusServer:
    """
    Persistent server daemon for Lasius telemetry, REST API, and dashboard streaming.
    """
    def __init__(
        self,
        host: str = "0.0.0.0",
        http_port: int = 8000,
        ws_port: int = 8765,
        dashboard_dir: Optional[Path] = None,
        dispatcher: Optional[OrderDispatcher] = None,
    ):
        self.host = host
        self.http_port = http_port
        self.ws_port = ws_port
        self.clients: Set[ServerConnection] = set()
        self.loop = asyncio.new_event_loop()
        self.hexapod_layout: Dict[str, Any] = {}
        self.hexapod: Optional["Hexapod"] = None
        self.http_server: Optional[ThreadingHTTPServer] = None
        self._stop_event: Optional[asyncio.Event] = None
        self._http_thread: Optional[threading.Thread] = None
        self._ws_thread: Optional[threading.Thread] = None

        # Resolve or create OrderDispatcher
        self.dispatcher = dispatcher if dispatcher is not None else OrderDispatcher(server=self)
        self.dispatcher.set_server(self)

        # Resolve lasius-dashboard directory (prefer Vite dist/, fallback to root)
        if dashboard_dir is not None:
            cand = Path(dashboard_dir)
            if (cand / "dist").is_dir():
                self.dashboard_dir = cand / "dist"
            elif cand.is_dir():
                self.dashboard_dir = cand
            else:
                self.dashboard_dir = None
        else:
            candidates = []
            # 1. Search parent directories of current file
            for parent in Path(__file__).resolve().parents:
                dash_dir = parent / "lasius-dashboard"
                if (dash_dir / "dist").is_dir():
                    candidates.append(dash_dir / "dist")
                if dash_dir.is_dir():
                    candidates.append(dash_dir)

            # 2. Search from current working directory
            cwd_dash = Path.cwd() / "lasius-dashboard"
            if (cwd_dash / "dist").is_dir():
                candidates.append(cwd_dash / "dist")
            if cwd_dash.is_dir():
                candidates.append(cwd_dash)

            # 3. Standard user home locations for lasius
            home_dash = Path.home() / "lasius" / "lasius-dashboard"
            if (home_dash / "dist").is_dir():
                candidates.append(home_dash / "dist")
            if home_dash.is_dir():
                candidates.append(home_dash)

            # 4. Standard robot daemon path on Raspberry Pi
            pi_dash = Path("/home/hexapod/lasius/lasius-dashboard")
            if (pi_dash / "dist").is_dir():
                candidates.append(pi_dash / "dist")
            if pi_dash.is_dir():
                candidates.append(pi_dash)

            self.dashboard_dir = next((c for c in candidates if c.is_dir()), None)

        # Interactive locomotion and pose states
        self.is_paused: bool = False
        self.gait_speed: float = 1.0
        self.step_height: float = 30.0
        self.step_length: float = 50.0

        self.walk_x: float = 0.0
        self.walk_y: float = 0.0
        self.turn_z: float = 0.0

        self.body_height: float = -80.0
        self.body_roll: float = 0.0
        self.body_pitch: float = 0.0

        self.gait_type: str = "tripod"

    def get_control_state(self) -> Dict[str, Any]:
        """Returns the current locomotion and pose control state."""
        return {
            "is_paused": self.is_paused,
            "gait_speed": self.gait_speed,
            "step_height": self.step_height,
            "step_length": self.step_length,
            "walk_x": self.walk_x,
            "walk_y": self.walk_y,
            "turn_z": self.turn_z,
            "body_height": self.body_height,
            "body_roll": self.body_roll,
            "body_pitch": self.body_pitch,
            "gait_type": self.gait_type,
        }

    def broadcast_control_state(self) -> None:
        """Broadcasts current control state to all connected WebSocket clients."""
        if not self.loop.is_running() or not self.clients:
            return
        msg = json.dumps({"type": "state", "data": self.get_control_state()})
        for client in self.clients.copy():
            asyncio.run_coroutine_threadsafe(self._send_to_client(client, msg), self.loop)

    def broadcast_order_result(self, result: Any) -> None:
        """Broadcasts completed or failed order results to clients."""
        if not self.loop.is_running() or not self.clients:
            return
        data = result.to_dict() if hasattr(result, "to_dict") else result
        msg = json.dumps({"type": "order_result", "data": data})
        for client in self.clients.copy():
            asyncio.run_coroutine_threadsafe(self._send_to_client(client, msg), self.loop)

    def broadcast_order_status(self, order_id: str, action: str, status: Any) -> None:
        """Broadcasts running/queued order status to clients."""
        if not self.loop.is_running() or not self.clients:
            return
        status_val = status.value if hasattr(status, "value") else str(status)
        msg = json.dumps({"type": "order_status", "data": {"order_id": order_id, "action": action, "status": status_val}})
        for client in self.clients.copy():
            asyncio.run_coroutine_threadsafe(self._send_to_client(client, msg), self.loop)

    def broadcast_system_stats(self) -> None:
        """Broadcasts current system and hardware telemetry to all connected clients."""
        if not self.loop.is_running() or not self.clients:
            return
        from .system_stats import get_system_stats
        stats = get_system_stats(connected_clients=len(self.clients))
        msg = json.dumps({"type": "system_stats", "data": stats})
        for client in self.clients.copy():
            asyncio.run_coroutine_threadsafe(self._send_to_client(client, msg), self.loop)

    def _handle_client_message(self, data: Dict[str, Any]) -> None:
        """Processes incoming messages from WebSocket clients through OrderDispatcher."""
        msg_type = data.get("type")
        if msg_type in ["command", "order"]:
            try:
                order = Order.from_dict(data, default_source="ws")
                self.dispatcher.dispatch(order)
            except Exception as e:
                print(f"[Lasius-Server] Error executing order via WebSocket: {e}")
        elif msg_type == "get_system_stats":
            self.broadcast_system_stats()

    async def _websocket_handler(self, websocket: ServerConnection):
        self.clients.add(websocket)
        try:
            # Send initial layout and status to new client
            await websocket.send(json.dumps({"type": "layout", "data": self.hexapod_layout}))
            await websocket.send(json.dumps({"type": "state", "data": self.get_control_state()}))

            async for raw_msg in websocket:
                try:
                    data = json.loads(raw_msg)
                    self._handle_client_message(data)
                except Exception as e:
                    print(f"[Lasius-Server] WebSocket message parse error: {e}")
        except ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)

    async def _run_websocket_server(self):
        async with websockets.serve(self._websocket_handler, self.host, self.ws_port):
            if self._stop_event is not None:
                await self._stop_event.wait()
            else:
                await asyncio.Future()

    def _run_loop(self):
        asyncio.set_event_loop(self.loop)
        self._stop_event = asyncio.Event()
        try:
            self.loop.run_until_complete(self._run_websocket_server())
        finally:
            self.loop.close()

    def start(self, hexapod: "Hexapod"):
        """Starts HTTP and WebSocket servers and attaches the hexapod instance."""
        self.hexapod = hexapod
        self.dispatcher.set_robot(hexapod)
        self._generate_layout(hexapod)

        if self.http_server is not None:
            return

        if self.dashboard_dir and self.dashboard_dir.is_dir():
            web_dir = self.dashboard_dir
            srv_self = self

            class Handler(LasiusRestHandler):
                server_instance = srv_self
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, directory=str(web_dir), **kwargs)

            ThreadingHTTPServer.allow_reuse_address = True
            self.http_server = ThreadingHTTPServer((self.host, self.http_port), Handler)
            print(f"[Lasius-Server] HTTP REST & Dashboard running on http://{self.host}:{self.http_port}")
            self._http_thread = threading.Thread(target=self.http_server.serve_forever, daemon=True)
            self._http_thread.start()
        else:
            print("[Lasius-Server] No dashboard directory found. HTTP server skipped.")

        if HAS_WEBSOCKETS:
            print(f"[Lasius-Server] WebSocket Telemetry running on ws://{self.host}:{self.ws_port}")
            self._ws_thread = threading.Thread(target=self._run_loop, daemon=True)
            self._ws_thread.start()

    def stop(self):
        """Stops HTTP and WebSocket servers cleanly."""
        http_srv = self.http_server
        self.http_server = None
        if http_srv is not None:
            try:
                http_srv.shutdown()
                http_srv.server_close()
            except Exception:
                pass
            if self._http_thread is not None and self._http_thread.is_alive():
                self._http_thread.join(timeout=2.0)
            self._http_thread = None

        if self.loop.is_running() and self._stop_event is not None:
            self.loop.call_soon_threadsafe(self._stop_event.set)
            if self._ws_thread is not None and self._ws_thread.is_alive():
                self._ws_thread.join(timeout=2.0)
            self._ws_thread = None

    def send_angles_update(self, angles: Dict[str, float]) -> None:
        """Sends updated servo angles to all connected dashboard clients."""
        if not self.clients or not angles:
            return
        msg = json.dumps({"type": "angles", "data": angles})
        for client in self.clients.copy():
            asyncio.run_coroutine_threadsafe(self._send_to_client(client, msg), self.loop)

    async def _send_to_client(self, client: ServerConnection, message: str) -> None:
        try:
            await client.send(message)
        except ConnectionClosed:
            self.clients.discard(client)

    def test_leg(
        self,
        leg_name: str = "left_rear",
        cycles: int = 5,
        stride: float = 36.0,
        lift: float = 30.0,
    ) -> None:
        """Convenience wrapper delegating to OrderDispatcher."""
        order = Order(
            action=OrderAction.TEST_LEG,
            params={"leg": leg_name, "cycles": cycles, "stride": stride, "lift": lift},
            source="internal",
        )
        self.dispatcher.dispatch(order)

    def _generate_layout(self, hexapod: "Hexapod"):
        """Creates a serializable dictionary of the robot's physical layout."""
        from lasius.core.motion.leg import BodySide, LegRow

        if hasattr(hexapod, "config") and hasattr(hexapod.config, "geometry") and hexapod.config.geometry:
            chassis = hexapod.config.geometry.chassis
            half_w_fr = chassis.width_front_rear / 2.0
            half_w_m = chassis.width_middle / 2.0
            dy = chassis.axis_distance_longitudinal
            w_fr = chassis.width_front_rear
            w_m = chassis.width_middle
        else:
            half_w_fr = 65.0
            half_w_m = 75.0
            dy = 90.0
            w_fr = 130.0
            w_m = 150.0

        body_vertices = [
            {"x": half_w_m, "y": 0.0},     # Index 0: Right Middle
            {"x": half_w_fr, "y": dy},     # Index 1: Right Rear
            {"x": -half_w_fr, "y": dy},    # Index 2: Left Rear
            {"x": -half_w_m, "y": 0.0},    # Index 3: Left Middle
            {"x": -half_w_fr, "y": -dy},   # Index 4: Left Front
            {"x": half_w_fr, "y": -dy},    # Index 5: Right Front
        ]

        leg_geometry = {
            (BodySide.RIGHT, LegRow.MIDDLE): {"vertex_idx": 0, "base_angle": 0.0},
            (BodySide.RIGHT, LegRow.REAR):   {"vertex_idx": 1, "base_angle": 0.0},
            (BodySide.LEFT, LegRow.REAR):    {"vertex_idx": 2, "base_angle": math.pi},
            (BodySide.LEFT, LegRow.MIDDLE):  {"vertex_idx": 3, "base_angle": math.pi},
            (BodySide.LEFT, LegRow.FRONT):   {"vertex_idx": 4, "base_angle": math.pi},
            (BodySide.RIGHT, LegRow.FRONT):  {"vertex_idx": 5, "base_angle": 0.0},
        }

        layout = {
            "body": {
                "width_front_rear": w_fr,
                "width_middle": w_m,
                "axis_distance_longitudinal": dy,
                "vertices": body_vertices
            },
            "legs": {}
        }

        for (side, row), geom in leg_geometry.items():
            leg_name = f"{side.value}_{row.value}"
            if hasattr(hexapod, "legs") and (side, row) in hexapod.legs:
                leg = hexapod.legs[(side, row)]
                layout["legs"][leg_name] = {
                    "mount_point": body_vertices[geom["vertex_idx"]],
                    "base_angle": geom["base_angle"],
                    "coxa": {"name": leg.coxa.servo.config.name, "length": leg.coxa.length},
                    "femur": {"name": leg.femur.servo.config.name, "length": leg.femur.length},
                    "tibia": {"name": leg.tibia.servo.config.name, "length": leg.tibia.length},
                }

        self.hexapod_layout = layout


# Backward compatibility alias
VisualizerServer = LasiusServer


def main() -> None:
    """CLI entry point for starting the Lasius Server Daemon (`lasius-server`)."""
    import argparse
    import sys
    from lasius.core.config import load_config
    from lasius.core.hardware import MockPWMDriver, RealPCA9685Driver
    from lasius.core.motion import OmniGait
    from lasius.core.robot import Hexapod

    parser = argparse.ArgumentParser(description="Lasius Persistent Server Daemon")
    parser.add_argument("--hardware", action="store_true", help="Connect to real I2C PCA9685 boards (0x40 & 0x42).")
    parser.add_argument("--i2c-bus", type=int, default=1, help="I2C bus number (default: 1).")
    parser.add_argument("--port", type=int, default=8000, help="HTTP Port for Dashboard (default: 8000).")
    parser.add_argument("--ws-port", type=int, default=8765, help="WebSocket Port for Telemetry (default: 8765).")
    parser.add_argument("--test-leg", type=str, default=None, help="Optional leg to test upon startup (e.g. left_rear).")
    args = parser.parse_args()

    config = load_config()
    server = LasiusServer(host="0.0.0.0", http_port=args.port, ws_port=args.ws_port)

    if args.hardware:
        try:
            import smbus2
        except ImportError:
            print("[ERROR] smbus2 is required for --hardware. Run 'pip install smbus2'.")
            sys.exit(1)
        bus = smbus2.SMBus(args.i2c_bus)
        drivers = {
            0x40: RealPCA9685Driver(address=0x40, bus_instance=bus, visualizer_server=server),
            0x42: RealPCA9685Driver(address=0x42, bus_instance=bus, visualizer_server=server),
        }
    else:
        drivers = {
            0x40: MockPWMDriver(visualizer_server=server),
            0x42: MockPWMDriver(visualizer_server=server),
        }

    robot = Hexapod(config=config, drivers=drivers)
    robot.set_gait(
        OmniGait(walk_x=0.0, walk_y=0.0, turn_z=0.0, geometry=config.geometry),
        engage=False,
    )
    robot.relax_all()

    if args.test_leg:
        def _delayed_test():
            time.sleep(2.0)
            server.test_leg(leg_name=args.test_leg, cycles=5)
        threading.Thread(target=_delayed_test, name="DelayedAutoTest", daemon=True).start()

    try:
        while True:
            robot.tick()
            time.sleep(0.020)
    except KeyboardInterrupt:
        pass
    finally:
        robot.relax_all()
        server.stop()
