#!/usr/bin/env bash
# ==============================================================================
# Module: scripts/status_pi.sh
# Purpose & Role:
#   Remote Robot Telemetry & Health Inspector. Queries `/api/v1/status` and
#   `/api/v1/system/stats` from the Raspberry Pi daemon and prints a formatted
#   CLI report of active orders, locomotion/pose vectors, CPU/RAM utilization,
#   SoC temperature, under-voltage throttling status, and Wi-Fi signal strength.
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_IP="${1:-${PI_IP:-192.168.0.123}}"

if [ -f "$ROOT_DIR/scripts/banner.txt" ]; then
    cat "$ROOT_DIR/scripts/banner.txt"
fi

echo "=========================================================="
echo "📡 Querying Lasius Robot Status at http://${PI_IP}:8000..."
echo "=========================================================="

if ! curl -s -f "http://${PI_IP}:8000/api/v1/status" >/dev/null 2>&1; then
    echo "❌ Robot daemon is offline or unreachable at ${PI_IP}:8000."
    exit 1
fi

STATUS_JSON=$(curl -s "http://${PI_IP}:8000/api/v1/status")
SYSTEM_JSON=$(curl -s "http://${PI_IP}:8000/api/v1/system/stats" 2>/dev/null || echo "{}")

python3 - <<EOF
import json

status = json.loads('''$STATUS_JSON''')
system = json.loads('''$SYSTEM_JSON''')

ctrl = status.get("control", {})
print(f"Robot Status:       {status.get('status', 'unknown').upper()}")
print(f"Connected Clients:  {status.get('connected_clients', 0)}")
print(f"Active Order:       {status.get('active_order') or 'None (idle)'}")
print("----------------------------------------------------------")
print("🕹 Control Vectors:")
print(f"  Gait:             {ctrl.get('gait_type', 'tripod')} (Speed: {ctrl.get('gait_speed', 1.0)}x, Stride: {ctrl.get('step_length', 50)}mm)")
print(f"  Walk Vector:      X={ctrl.get('walk_x', 0.0)}, Y={ctrl.get('walk_y', 0.0)}, TurnZ={ctrl.get('turn_z', 0.0)}")
print(f"  Body Height:      {ctrl.get('body_height', -80.0)} mm")
print(f"  Roll / Pitch:     {ctrl.get('body_roll', 0.0)}° / {ctrl.get('body_pitch', 0.0)}°")

if "cpu" in system:
    print("----------------------------------------------------------")
    print("⚡ System Health (Raspberry Pi):")
    cpu = system.get("cpu", {})
    mem = system.get("memory", {})
    therm = system.get("thermal", {})
    pwr = system.get("power", {})
    wifi = system.get("wifi", {})
    pwr_label = "healthy" if pwr.get("healthy", True) else "WARNING (throttled/under-voltage)"
    print(f"  CPU Utilization:  {cpu.get('percent', 0.0)}% (Load: {cpu.get('load_1m', 0.0)}, {cpu.get('load_5m', 0.0)})")
    print(f"  Memory (RAM):     {mem.get('used_mb', 0)} / {mem.get('total_mb', 0)} MB ({mem.get('percent', 0.0)}%)")
    print(f"  SoC Temperature:  {therm.get('temp_c', 'N/A')} °C ({therm.get('status', 'unknown')})")
    print(f"  Power Health:     {pwr_label} (Throttled: {pwr.get('throttled_hex', '0x0')})")
    print(f"  Wi-Fi Signal:     {wifi.get('signal_dbm', 'N/A')} dBm ({wifi.get('quality_percent', 'N/A')}%)")

print("==========================================================")
EOF
