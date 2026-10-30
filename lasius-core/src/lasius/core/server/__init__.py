"""
Server, Digital Twin Streaming, and REST API Layer (`lasius.core.server`).

Purpose & Role:
    Exposes the HTTP REST API (`/api/v1/...`), static Vite dashboard hosting
    (Port 8000), high-frequency WebSocket telemetry/command server (Port 8765),
    and Raspberry Pi hardware health collector.

Exports:
    - `LasiusServer` (`VisualizerServer`): Dual-thread HTTP + asyncio WebSocket daemon.
    - `LasiusRestHandler`: HTTP request handler implementing `/api/v1/...` endpoints.
    - `SystemStatsCollector`, `get_system_stats`: Zero-dependency Raspberry Pi KPI collector.
"""

from .app import LasiusServer, VisualizerServer
from .handlers import LasiusRestHandler
from .system_stats import SystemStatsCollector, get_system_stats

__all__ = [
    "LasiusServer",
    "VisualizerServer",
    "LasiusRestHandler",
    "SystemStatsCollector",
    "get_system_stats",
]
