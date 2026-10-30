#!/usr/bin/env bash
# ==============================================================================
# Module: scripts/backup_calibration.sh
# Purpose & Role:
#   Servo Calibration Snapshot Utility. Queries `/api/v1/calibration` from the
#   live Raspberry Pi daemon (with fallback to `scp` or local `calibration.json`),
#   validates the JSON structure, and saves a timestamped backup in `backups/`.
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
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/calibration_${TIMESTAMP}.json"

mkdir -p "$BACKUP_DIR"

echo "=========================================================="
echo "💾 Backing up Lasius servo calibration from ${PI_TARGET}..."
echo "=========================================================="

# Try fetching via REST API first
if curl -s -f "http://${PI_IP}:8000/api/v1/calibration" >/dev/null 2>&1; then
    echo "▶ Querying active calibration from REST API..."
    curl -s "http://${PI_IP}:8000/api/v1/calibration" | python3 -m json.tool > "$BACKUP_FILE"
    echo "✔ Calibration snapshot saved via REST API: ${BACKUP_FILE}"
else
    # Fallback to SCP / rsync of calibration.json directly
    echo "▶ Fetching calibration.json via scp from ${PI_TARGET}..."
    if scp "${PI_TARGET}:~/lasius/lasius-core/calibration.json" "$BACKUP_FILE" 2>/dev/null; then
        echo "✔ calibration.json copied via scp: ${BACKUP_FILE}"
    elif [ -f "$ROOT_DIR/lasius-core/calibration.json" ]; then
        echo "⚠️ Pi unreachable; copying local lasius-core/calibration.json..."
        cp "$ROOT_DIR/lasius-core/calibration.json" "$BACKUP_FILE"
        echo "✔ Local file backed up: ${BACKUP_FILE}"
    else
        echo "❌ Error: Could not locate calibration.json on Pi or locally."
        exit 1
    fi
fi

# Validate JSON
if python3 -m json.tool "$BACKUP_FILE" >/dev/null 2>&1; then
    echo "✔ Backup JSON syntax validated successfully."
    echo "=========================================================="
    echo "Saved to: ${BACKUP_FILE}"
    echo "=========================================================="
else
    echo "❌ Warning: Saved backup does not appear to be valid JSON."
    exit 1
fi
