"""
Web server for the Hexapod Digital Twin.

This module runs an HTTP server to serve the frontend files and a WebSocket
server to stream servo data to the browser and receive control commands.
"""

import asyncio
import json
import math
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Set, Any, Dict, Optional, TYPE_CHECKING

import websockets
try:
    from websockets.asyncio.server import ServerConnection
except ImportError:
    from websockets.server import WebSocketServerProtocol as ServerConnection  # type: ignore
from websockets.exceptions import ConnectionClosed

from ..leg import BodySide, LegRow

if TYPE_CHECKING:
    from ..robot import Hexapod


class VisualizerServer:
    """
    Manages the web and WebSocket servers for the visualizer.
    """
    def __init__(self, host: str = "0.0.0.0", http_port: int = 8000, ws_port: int = 8765):
        self.host = host
        self.http_port = http_port
        self.ws_port = ws_port
        self.clients: Set[ServerConnection] = set()
        self.loop = asyncio.new_event_loop()
        self.hexapod_layout: Dict[str, Any] = {}
        self.http_server: Optional[ThreadingHTTPServer] = None
        self._stop_event: Optional[asyncio.Event] = None
        self._http_thread: Optional[threading.Thread] = None
        self._ws_thread: Optional[threading.Thread] = None

        # Interactive control states
        self.is_paused: bool = False
        self.gait_speed: float = 1.0
        self.step_height: float = 30.0
        self.step_length: float = 50.0

        # Locomotion states (-1.0 to +1.0)
        self.walk_x: float = 0.0
        self.walk_y: float = 1.0
        self.turn_z: float = 0.0

        # Body attitude / pose states
        self.body_height: float = -80.0
        self.body_roll: float = 0.0
        self.body_pitch: float = 0.0

        # Gait selection
        self.gait_type: str = "tripod"

    def get_control_state(self) -> Dict[str, Any]:
        """Returns the current control state."""
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
        """Broadcasts current control state to all connected clients."""
        if not self.loop.is_running() or not self.clients:
            return
        msg = json.dumps({"type": "state", "data": self.get_control_state()})
        for client in self.clients.copy():
            asyncio.run_coroutine_threadsafe(self._send_to_client(client, msg), self.loop)

    def _handle_client_message(self, data: Dict[str, Any]) -> None:
        """Processes incoming command messages from WebSocket clients."""
        msg_type = data.get("type")
        if msg_type == "command":
            action = data.get("action")
            if action == "pause":
                self.is_paused = True
            elif action == "resume":
                self.is_paused = False
            elif action == "toggle_pause":
                self.is_paused = not self.is_paused
            elif action == "set_speed":
                val = float(data.get("value", 1.0))
                self.gait_speed = max(0.1, min(5.0, round(val, 2)))
            elif action == "set_step_height":
                val = float(data.get("value", 30.0))
                self.step_height = max(5.0, min(80.0, round(val, 1)))
            elif action == "set_step_length":
                val = float(data.get("value", 50.0))
                self.step_length = max(10.0, min(100.0, round(val, 1)))
            elif action == "set_walk":
                self.walk_x = max(-1.0, min(1.0, round(float(data.get("x", 0.0)), 2)))
                self.walk_y = max(-1.0, min(1.0, round(float(data.get("y", 0.0)), 2)))
            elif action == "set_turn":
                self.turn_z = max(-1.0, min(1.0, round(float(data.get("z", 0.0)), 2)))
            elif action == "stop_motion":
                self.walk_x = 0.0
                self.walk_y = 0.0
                self.turn_z = 0.0
            elif action == "set_height":
                val = float(data.get("value", -80.0))
                self.body_height = max(-120.0, min(-40.0, round(val, 1)))
            elif action == "set_roll":
                val = float(data.get("value", 0.0))
                self.body_roll = max(-25.0, min(25.0, round(val, 1)))
            elif action == "set_pitch":
                val = float(data.get("value", 0.0))
                self.body_pitch = max(-25.0, min(25.0, round(val, 1)))
            elif action == "reset_pose":
                self.body_height = -80.0
                self.body_roll = 0.0
                self.body_pitch = 0.0
            elif action == "set_gait_type":
                val = str(data.get("value", "tripod")).lower()
                if val in ["tripod", "ripple", "wave"]:
                    self.gait_type = val

            self.broadcast_control_state()

    async def _websocket_handler(self, websocket: ServerConnection):
        self.clients.add(websocket)
        print(f"[Visualizer] Client connected: {websocket.remote_address}")
        try:
            # Send initial layout and current control state
            await websocket.send(json.dumps({"type": "layout", "data": self.hexapod_layout}))
            await websocket.send(json.dumps({"type": "state", "data": self.get_control_state()}))

            async for raw_msg in websocket:
                try:
                    data = json.loads(raw_msg)
                    self._handle_client_message(data)
                except Exception as e:
                    print(f"[Visualizer] Error handling client message: {e}")
        except ConnectionClosed:
            pass
        finally:
            print(f"[Visualizer] Client disconnected: {websocket.remote_address}")
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
        """Starts servers and generates the layout from the hexapod instance."""
        self._generate_layout(hexapod)

        web_dir = Path(__file__).parent / 'template'
        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(web_dir), **kwargs)

        self.http_server = ThreadingHTTPServer((self.host, self.http_port), Handler)
        print(f"[Visualizer] Starting HTTP server at http://{self.host}:{self.http_port}")
        self._http_thread = threading.Thread(target=self.http_server.serve_forever, daemon=True)
        self._http_thread.start()

        print(f"[Visualizer] Starting WebSocket server at ws://{self.host}:{self.ws_port}")
        self._ws_thread = threading.Thread(target=self._run_loop, daemon=True)
        self._ws_thread.start()

    def stop(self):
        """Stops HTTP and WebSocket servers cleanly."""
        if self.http_server is not None:
            self.http_server.shutdown()
            self.http_server.server_close()
            self.http_server = None
            if self._http_thread is not None and self._http_thread.is_alive():
                self._http_thread.join(timeout=2.0)

        if self._stop_event is not None and self.loop.is_running():
            self.loop.call_soon_threadsafe(self._stop_event.set)
            if self._ws_thread is not None and self._ws_thread.is_alive():
                self._ws_thread.join(timeout=2.0)

    def _generate_layout(self, hexapod: "Hexapod"):
        """Creates a serializable dictionary of the robot's physical layout."""
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

        # Chassis mount point vertices (mm) dynamically derived from chassis config
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
                "width_front": w_fr,
                "width_middle": w_m,
                "width_rear": w_fr,
                "length": dy * 2.0,
                "vertices": body_vertices,
            },
            "legs": {}
        }

        for leg_id, leg in hexapod.legs.items():
            leg_name = f"{leg_id[0].value}_{leg_id[1].value}"
            geom = leg_geometry.get(leg_id, {"vertex_idx": 0, "base_angle": 0.0})
            mount_point = body_vertices[geom["vertex_idx"]]

            layout["legs"][leg_name] = {
                "mount_point": mount_point,
                "base_angle": geom["base_angle"],
                "coxa": {"length": leg.coxa.length, "name": leg.coxa.servo.config.name},
                "femur": {"length": leg.femur.length, "name": leg.femur.servo.config.name},
                "tibia": {"length": leg.tibia.length, "name": leg.tibia.servo.config.name},
            }
        self.hexapod_layout = layout

    async def _send_to_client(self, client: ServerConnection, message: str):
        try:
            await client.send(message)
        except ConnectionClosed:
            pass
        except Exception as e:
            print(f"[Visualizer] Error sending to client: {e}")

    def send_angles_update(self, angles: Dict[str, float]):
        """
        Sends a complete dictionary of all current servo angles.
        """
        if not self.loop.is_running() or not self.clients:
            return
        message = json.dumps({"type": "angles", "data": angles})
        for client in self.clients.copy():
            asyncio.run_coroutine_threadsafe(self._send_to_client(client, message), self.loop)
