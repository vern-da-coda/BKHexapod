#!/usr/bin/env bash
# ==============================================================================
# Module: scripts/run_tests.sh
# Purpose & Role:
#   Cross-Package Automated Test Runner. Resolves the active `pytest` / `uv`
#   environment and executes all unit and integration test suites across both
#   `lasius-core/tests` and `lasius-pilot/tests`.
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/scripts/banner.txt" ]; then
    cat "$ROOT_DIR/scripts/banner.txt"
fi

# Determine python/pytest executable
PYTEST_BIN=""
if [ -x "$ROOT_DIR/.venv/bin/pytest" ]; then
    PYTEST_BIN="$ROOT_DIR/.venv/bin/pytest"
elif command -v uv >/dev/null 2>&1; then
    PYTEST_BIN="uv run pytest"
elif command -v pytest >/dev/null 2>&1; then
    PYTEST_BIN="pytest"
else
    echo "❌ Error: pytest could not be found. Please setup virtualenv: python3 -m venv .venv && .venv/bin/pip install -e lasius-core -e lasius-pilot[test]"
    exit 1
fi

echo "=========================================================="
echo "🧪 Running Lasius Hexapod Test Suite..."
echo "=========================================================="

echo "▶ 1. lasius-core tests..."
$PYTEST_BIN lasius-core/tests "$@"

echo ""
echo "▶ 2. lasius-pilot tests..."
$PYTEST_BIN lasius-pilot/tests "$@"

echo ""
echo "✅ All tests passed successfully!"
