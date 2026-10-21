#!/usr/bin/env python3
"""
Launcher for Lasius Pilot Gamepad Teleoperation.
"""
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT / "src"))

from lasius.pilot.cli import main

if __name__ == "__main__":
    main()
