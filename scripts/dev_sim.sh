#!/usr/bin/env bash
# ==============================================================================
# Lasius Local Development & Simulation Launcher
# Starts the Mock Hexapod server & Vite dashboard on your development workstation
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN=""
if [ -x "$ROOT_DIR/.venv/bin/python3" ]; then
    PYTHON_BIN="$ROOT_DIR/.venv/bin/python3"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
else
    echo "❌ Error: python3 not found."
    exit 1
fi

echo "=========================================================="
echo "🤖 Starting Lasius Hexapod Simulation (Mock HAL)..."
echo "=========================================================="
echo "HTTP REST API:    http://127.0.0.1:8000"
echo "WebSocket Stream: ws://127.0.0.1:8765"
echo "Dashboard UI:     http://127.0.0.1:8000 or http://localhost:5173 (Vite dev)"
echo "----------------------------------------------------------"
echo "Press Ctrl+C to stop the simulation server."
echo "=========================================================="

# Check if dashboard dist exists; build if missing
if [ ! -f "$ROOT_DIR/lasius-dashboard/dist/index.html" ]; then
    echo "📦 Building dashboard production assets first..."
    (cd "$ROOT_DIR/lasius-dashboard" && npm run build)
fi

exec $PYTHON_BIN "$ROOT_DIR/lasius-core/run_server.py"
