"""
Web server for the Hexapod Digital Twin.

This module runs an HTTP server to serve the frontend files and a WebSocket
server to stream servo data to the browser.
"""

import asyncio
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Set

import websockets
from websockets.server import WebSocketServerProtocol


class VisualizerServer:
    """
    Manages the web and WebSocket servers for the visualizer.
    """
    def __init__(self, host: str = "localhost", http_port: int = 8000, ws_port: int = 8765):
        self.host = host
        self.http_port = http_port
        self.ws_port = ws_port
        self.clients: Set[WebSocketServerProtocol] = set()

        # Set up the HTTP server to serve files from the 'template' directory
        web_dir = Path(__file__).parent / 'template'
        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(web_dir), **kwargs)

        self.http_server = ThreadingHTTPServer((host, http_port), Handler)

    async def _websocket_handler(self, websocket: WebSocketServerProtocol):
        """Handles new WebSocket connections."""
        self.clients.add(websocket)
        print(f"[Visualizer] Client connected: {websocket.remote_address}")
        try:
            await websocket.wait_closed()
        finally:
            print(f"[Visualizer] Client disconnected: {websocket.remote_address}")
            self.clients.remove(websocket)

    async def _run_websocket_server(self):
        """Starts the WebSocket server."""
        async with websockets.serve(self._websocket_handler, self.host, self.ws_port):
            await asyncio.Future()  # Run forever

    def start(self):
        """Starts both the HTTP and WebSocket servers in separate threads."""
        print(f"[Visualizer] Starting HTTP server at http://{self.host}:{self.http_port}")
        http_thread = threading.Thread(target=self.http_server.serve_forever, daemon=True)
        http_thread.start()

        print(f"[Visualizer] Starting WebSocket server at ws://{self.host}:{self.ws_port}")
        ws_thread = threading.Thread(target=lambda: asyncio.run(self._run_websocket_server()), daemon=True)
        ws_thread.start()

    def send_update(self, channel: int, angle: float):
        """
        Sends a servo update to all connected WebSocket clients.

        Args:
            channel: The servo channel that was updated.
            angle: The new angle of the servo.
        """
        message = json.dumps({"type": "servo_update", "channel": channel, "angle": angle})
        # Create a copy of the clients set to safely iterate over it
        clients_copy = self.clients.copy()
        for client in clients_copy:
            # Use create_task to send messages without blocking the main loop
            asyncio.run_coroutine_threadsafe(client.send(message), asyncio.get_event_loop())
