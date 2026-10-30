#!/usr/bin/env python3
"""
Standalone CLI Launcher for Lasius Pilot Gamepad Teleoperation (`lasius-pilot/cli.py`).

Purpose & Role:
    Convenience wrapper script that adds `lasius-pilot/src` to `sys.path` and
    invokes `lasius.pilot.cli.main()` directly without requiring package installation.
"""
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT / "src"))

from lasius.pilot.cli import main

if __name__ == "__main__":
    main()
