#!/usr/bin/env bash
# ==============================================================================
# Module: scripts/deploy_pi.sh
# Purpose & Role:
#   Automated Raspberry Pi Deployment Pipeline. Verifies network reachability,
#   type-checks and builds the production `lasius-dashboard/dist/` bundle locally,
#   synchronizes `lasius-dashboard/dist`, `lasius-core` (preserving the robot's
#   on-device `calibration.json`), and `lasius-pilot` via `rsync`, and triggers
#   a graceful daemon restart via `/api/v1/server/restart` or `systemctl`.
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/scripts/banner.txt" ]; then
    cat "$ROOT_DIR/scripts/banner.txt"
fi

PI_USER="${PI_USER:-hexapod}"
PI_IP="${1:-${PI_IP:-192.168.0.123}}"
PI_TARGET="${PI_USER}@${PI_IP}"
REMOTE_DIR="~/lasius"

echo "=========================================================="
echo "🚀 Deploying Lasius Hexapod to ${PI_TARGET}..."
echo "=========================================================="

# 1. Connectivity Check
echo "🔍 Checking network connectivity to ${PI_IP}..."
if ! ping -c 1 -W 2 "${PI_IP}" >/dev/null 2>&1; then
    echo "❌ Error: Cannot ping ${PI_IP}. Is the Raspberry Pi powered on and on Wi-Fi?"
    exit 1
fi
echo "✔ Network connectivity confirmed."

# 2. Build Dashboard (Vue 3 + Vite)
echo "📦 Building dashboard production bundle (Vite + TypeScript)..."
(cd "$ROOT_DIR/lasius-dashboard" && npx vue-tsc --noEmit && npm run build)
echo "✔ Dashboard bundle compiled in lasius-dashboard/dist/."

# 3. Synchronize Dashboard dist
echo "🔄 Synchronizing dashboard dist to Pi..."
rsync -avz --delete \
    "$ROOT_DIR/lasius-dashboard/dist/" \
    "${PI_TARGET}:${REMOTE_DIR}/lasius-dashboard/dist/"

# 4. Synchronize lasius-core
echo "🔄 Synchronizing lasius-core to Pi..."
rsync -avz \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.pytest_cache' \
    --exclude '.venv' \
    --exclude 'calibration.json' \
    "$ROOT_DIR/lasius-core/" \
    "${PI_TARGET}:${REMOTE_DIR}/lasius-core/"

# 5. Synchronize lasius-pilot
echo "🔄 Synchronizing lasius-pilot to Pi..."
rsync -avz \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.pytest_cache' \
    --exclude '.venv' \
    "$ROOT_DIR/lasius-pilot/" \
    "${PI_TARGET}:${REMOTE_DIR}/lasius-pilot/"

# 6. Trigger graceful daemon restart on Pi
echo "🔄 Triggering graceful server restart on Pi..."
if curl -s -X POST "http://${PI_IP}:8000/api/v1/server/restart" >/dev/null 2>&1; then
    echo "✔ Restart signal dispatched via REST API."
    sleep 2
else
    echo "⚠️ REST API restart endpoint did not respond (server may be offline). Restarting via systemctl..."
    ssh "${PI_TARGET}" "sudo systemctl restart lasius 2>/dev/null || true"
fi

# 7. Check server health
echo "🔍 Verifying robot server status..."
sleep 2
STATUS=$(curl -s "http://${PI_IP}:8000/api/v1/status" 2>/dev/null || echo "offline")
if echo "$STATUS" | grep -q '"status": "online"'; then
    echo "=========================================================="
    echo "🎉 Deployment successful! Lasius robot server is ONLINE."
    echo "Dashboard URL: http://${PI_IP}:8000"
    echo "=========================================================="
else
    echo "⚠️ Note: Server status check returned: ${STATUS}"
    echo "Check logs on Pi: ssh ${PI_TARGET} 'journalctl -u lasius -n 25 --no-pager'"
fi
