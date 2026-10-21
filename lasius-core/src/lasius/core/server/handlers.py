"""
HTTP and REST Request Handlers for Lasius Hexapod Server.
"""

from http.server import SimpleHTTPRequestHandler
import json
from pathlib import Path
import urllib.parse
from typing import Any, Dict, Optional, TYPE_CHECKING
import yaml

from lasius.core.control.orders import Order, OrderAction, OrderPriority

if TYPE_CHECKING:
    from .app import LasiusServer


class LasiusRestHandler(SimpleHTTPRequestHandler):
    """
    HTTP Request Handler combining static web dashboard serving
    with a JSON REST API (/api/v1/...).
    """
    server_instance: Optional["LasiusServer"] = None

    def do_GET(self) -> None:
        """Handles HTTP GET requests."""
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip("/")

        if path in ("/api/v1/openapi.yaml", "/openapi.yaml"):
            self._handle_get_openapi_yaml()
            return

        if path in ("/api/v1/openapi.json", "/openapi.json"):
            self._handle_get_openapi_json()
            return

        if path == "/api/v1/status":
            self._handle_get_status()
            return

        if path in ("/api/v1/system/stats", "/api/v1/system", "/api/v1/stats"):
            self._handle_get_system_stats()
            return

        if path == "/api/v1/orders":
            self._handle_get_orders()
            return

        if path.startswith("/api/v1/orders/"):
            order_id = path.split("/")[-1]
            self._handle_get_order_by_id(order_id)
            return

        if path == "/api/v1/robot":
            self._handle_get_robot_layout()
            return

        # Fallback to static file server (lasius-dashboard)
        super().do_GET()

    def do_POST(self) -> None:
        """Handles HTTP POST requests."""
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip("/")

        if path in ("/api/v1/server/restart", "/api/v1/restart"):
            self._handle_post_server_restart()
            return

        if path == "/api/v1/orders":
            self._handle_post_order()
            return

        if path == "/api/v1/emergency_stop":
            self._handle_post_emergency_stop()
            return

        if path == "/api/v1/relax":
            self._handle_post_relax_all()
            return

        if path.startswith("/api/v1/legs/") and path.endswith("/test"):
            parts = path.split("/")
            leg_name = parts[-2]
            self._handle_post_leg_test(leg_name)
            return

        if path.startswith("/api/v1/legs/") and path.endswith("/stance"):
            parts = path.split("/")
            leg_name = parts[-2]
            self._handle_post_leg_stance(leg_name)
            return

        self._send_json(404, {"error": "Not Found", "path": self.path})

    def _read_json_body(self) -> Optional[Dict[str, Any]]:
        """Reads and parses the JSON request body."""
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        try:
            raw_body = self.rfile.read(content_length).decode("utf-8")
            return json.loads(raw_body)
        except Exception as e:
            self._send_json(400, {"error": "Invalid JSON payload", "details": str(e)})
            return None

    def _send_json(self, status_code: int, data: Dict[str, Any]) -> None:
        """Serializes and sends a JSON response with proper headers."""
        response_bytes = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_OPTIONS(self) -> None:
        """Handles CORS preflight requests."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # --- API Handlers ---

    def _handle_get_status(self) -> None:
        srv = self.server_instance
        if not srv:
            self._send_json(500, {"error": "Server instance uninitialized"})
            return

        disp = srv.dispatcher
        active_ord = disp.active_order.to_dict() if (disp and disp.active_order) else None

        data = {
            "status": "online",
            "control": srv.get_control_state(),
            "active_order": active_ord,
            "connected_clients": len(srv.clients),
            "recent_orders_count": len(disp.order_history) if disp else 0,
        }
        self._send_json(200, data)

    def _handle_get_system_stats(self) -> None:
        """Returns Raspberry Pi / system telemetry metrics (CPU, RAM, temp, power health, WiFi)."""
        from .system_stats import get_system_stats
        srv = self.server_instance
        connected_clients = len(srv.clients) if srv else 0
        stats = get_system_stats(connected_clients=connected_clients)
        self._send_json(200, stats)

    def _handle_get_orders(self) -> None:
        srv = self.server_instance
        if not srv or not srv.dispatcher:
            self._send_json(200, {"orders": []})
            return
        orders = [res.to_dict() for res in list(srv.dispatcher.order_history)]
        self._send_json(200, {"orders": orders})

    def _handle_get_order_by_id(self, order_id: str) -> None:
        srv = self.server_instance
        if not srv or not srv.dispatcher:
            self._send_json(404, {"error": "Order not found", "order_id": order_id})
            return
        disp = srv.dispatcher
        if disp.active_order and disp.active_order.order_id == order_id:
            self._send_json(200, {
                "order_id": order_id,
                "status": "running",
                "action": disp.active_order.action.value,
            })
            return
        found = next((res for res in disp.order_history if res.order_id == order_id), None)
        if found:
            self._send_json(200, found.to_dict())
        else:
            self._send_json(404, {"error": "Order not found", "order_id": order_id})

    def _handle_get_robot_layout(self) -> None:
        srv = self.server_instance
        if not srv:
            self._send_json(500, {"error": "Server instance uninitialized"})
            return
        self._send_json(200, srv.hexapod_layout)

    def _handle_post_order(self) -> None:
        srv = self.server_instance
        if not srv or not srv.dispatcher:
            self._send_json(500, {"error": "OrderDispatcher uninitialized"})
            return

        body = self._read_json_body()
        if body is None:
            return

        try:
            order = Order.from_dict(body, default_source="rest")
        except ValueError as e:
            self._send_json(400, {"error": "Invalid order", "message": str(e)})
            return

        result = srv.dispatcher.dispatch(order)
        status_code = 200 if result.status.value != "failed" else 400
        self._send_json(status_code, result.to_dict())

    def _handle_post_emergency_stop(self) -> None:
        srv = self.server_instance
        if not srv or not srv.dispatcher:
            self._send_json(500, {"error": "OrderDispatcher uninitialized"})
            return
        order = Order(action=OrderAction.EMERGENCY_STOP, priority=OrderPriority.EMERGENCY, source="rest")
        res = srv.dispatcher.dispatch(order)
        self._send_json(200, res.to_dict())

    def _handle_post_relax_all(self) -> None:
        srv = self.server_instance
        if not srv or not srv.dispatcher:
            self._send_json(500, {"error": "OrderDispatcher uninitialized"})
            return
        order = Order(action=OrderAction.RELAX_ALL, source="rest")
        res = srv.dispatcher.dispatch(order)
        self._send_json(200, res.to_dict())

    def _handle_post_leg_test(self, leg_name: str) -> None:
        srv = self.server_instance
        if not srv or not srv.dispatcher:
            self._send_json(500, {"error": "OrderDispatcher uninitialized"})
            return
        body = self._read_json_body() or {}
        cycles = int(body.get("cycles", 5))
        stride = float(body.get("stride", 36.0))
        lift = float(body.get("lift", 30.0))

        order = Order(
            action=OrderAction.TEST_LEG,
            params={"leg": leg_name, "cycles": cycles, "stride": stride, "lift": lift},
            source="rest"
        )
        res = srv.dispatcher.dispatch(order)
        self._send_json(200, res.to_dict())

    def _handle_post_leg_stance(self, leg_name: str) -> None:
        srv = self.server_instance
        if not srv or not srv.dispatcher:
            self._send_json(500, {"error": "OrderDispatcher uninitialized"})
            return
        body = self._read_json_body() or {}
        hold = float(body.get("hold", 5.0))
        order = Order(
            action=OrderAction.STANCE_LEG,
            params={"leg": leg_name, "hold": hold},
            source="rest"
        )
        res = srv.dispatcher.dispatch(order)
        self._send_json(200, res.to_dict())

    def _handle_post_server_restart(self) -> None:
        """Safely stops motion and restarts the robot daemon process in the background."""
        srv = self.server_instance
        self._send_json(200, {
            "status": "restarting",
            "message": "Lasius server is restarting in the background..."
        })

        def _do_restart():
            import os
            import sys
            import threading
            import time
            time.sleep(0.5)
            try:
                if srv and srv.dispatcher:
                    from lasius.core.control.orders import Order, OrderAction, OrderPriority
                    srv.dispatcher.dispatch(Order(
                        action=OrderAction.EMERGENCY_STOP,
                        priority=OrderPriority.EMERGENCY,
                        source="restart"
                    ))
                if srv:
                    srv.stop()
            except Exception as e:
                print(f"[Lasius-Server] Pre-restart stop error: {e}")
            time.sleep(0.4)
            if "pytest" not in sys.modules:
                os.execv(sys.executable, [sys.executable] + sys.argv)
            else:
                print("[Lasius-Server] Restart requested (pytest mode, skipping os.execv).")

        import threading
        threading.Thread(target=_do_restart, name="ServerRestartWorker", daemon=True).start()

    def _handle_get_openapi_yaml(self) -> None:
        """Returns the OpenAPI 3.1 specification file in YAML format."""
        candidates = [
            Path(__file__).resolve().parents[3] / "openapi.yaml",
            Path(__file__).resolve().parents[4] / "openapi.yaml",
            Path("openapi.yaml").resolve(),
        ]
        spec_path = next((p for p in candidates if p.is_file()), None)
        if not spec_path:
            self._send_json(404, {"error": "openapi.yaml not found"})
            return

        try:
            content = spec_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/yaml; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self._send_json(500, {"error": "Failed to read openapi.yaml", "details": str(e)})

    def _handle_get_openapi_json(self) -> None:
        """Returns the OpenAPI 3.1 specification converted to JSON format."""
        candidates = [
            Path(__file__).resolve().parents[3] / "openapi.yaml",
            Path(__file__).resolve().parents[4] / "openapi.yaml",
            Path("openapi.yaml").resolve(),
        ]
        spec_path = next((p for p in candidates if p.is_file()), None)
        if not spec_path:
            self._send_json(404, {"error": "openapi.yaml not found"})
            return

        try:
            data = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
            self._send_json(200, data)
        except Exception as e:
            self._send_json(500, {"error": "Failed to parse openapi spec as JSON", "details": str(e)})
