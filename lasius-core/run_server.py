#!/usr/bin/env python3
"""
Lasius Daemon & Telemetry Server Launcher.

Starts the persistent background robot service on Raspberry Pi:
- Hosts the 3D Digital Twin web dashboard at http://<pi-ip>:8000
- Opens the WebSocket API at ws://<pi-ip>:8765
- Connects to physical dual PCA9685 boards (0x40 and 0x42)
- Safely manages all 18 servos and relaxes them on exit.
"""

import argparse
import sys
import threading
import time
from pathlib import Path

# Add src to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT / "src"))

from lasius.core.config import load_config
from lasius.core.hardware import MockPWMDriver, RealPCA9685Driver
from lasius.core.robot import Hexapod
from lasius.core.server import LasiusServer

try:
    import smbus2
    HAS_SMBUS = True
except ImportError:
    smbus2 = None
    HAS_SMBUS = False


def main():
    parser = argparse.ArgumentParser(description="Lasius Persistent Server Daemon")
    parser.add_argument("--hardware", action="store_true", help="Connect to real I2C PCA9685 boards (0x40 & 0x42).")
    parser.add_argument("--i2c-bus", type=int, default=1, help="I2C bus number (default: 1).")
    parser.add_argument("--port", type=int, default=8000, help="HTTP Port for Dashboard (default: 8000).")
    parser.add_argument("--ws-port", type=int, default=8765, help="WebSocket Port for Telemetry (default: 8765).")
    parser.add_argument("--test-leg", type=str, default=None, help="Optional leg to test upon startup (e.g. left_rear).")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  LASIUS ROBOT DAEMON & TELEMETRY SERVER")
    print("=" * 60)

    # 1. Load config
    cfg_path = PROJECT_ROOT / "src/lasius/core/config.yaml"
    if not cfg_path.exists():
        cfg_path = PROJECT_ROOT / "src/lasius/core/servos.yaml"
    config = load_config(cfg_path)
    print(f"Config loaded: {len(config.servos)} servos configured.")

    # 2. Initialize visualizer / telemetry server
    dash_base = PROJECT_ROOT.parent / "lasius-dashboard"
    dashboard_dir = (dash_base / "dist") if (dash_base / "dist").is_dir() else dash_base
    server = LasiusServer(host="0.0.0.0", http_port=args.port, ws_port=args.ws_port, dashboard_dir=dashboard_dir)

    # 3. Initialize drivers
    drivers = {}
    if args.hardware:
        if not HAS_SMBUS:
            print("[ERROR] smbus2 is required for --hardware. Run 'pip install smbus2'.")
            sys.exit(1)
        try:
            bus = smbus2.SMBus(args.i2c_bus)
            drivers = {
                0x40: RealPCA9685Driver(address=0x40, bus_instance=bus, visualizer_server=server),
                0x42: RealPCA9685Driver(address=0x42, bus_instance=bus, visualizer_server=server),
            }
            print(f"[Hardware] Dual PCA9685 drivers connected at 0x40 & 0x42 (Bus {args.i2c_bus}).")
        except Exception as e:
            print(f"[ERROR] Failed to initialize hardware I2C: {e}")
            sys.exit(1)
    else:
        drivers = {
            0x40: MockPWMDriver(visualizer_server=server),
            0x42: MockPWMDriver(visualizer_server=server),
        }
        print("[Simulation] Running with MockPWMDriver (Virtual mode).")

    # 4. Initialize Robot and start server
    robot = Hexapod(config=config, drivers=drivers)
    # Hexapod.__init__ automatically calls server.start(robot)

    # Initial safety relax: ensure uncalibrated channels are not powered
    for d in drivers.values():
        if hasattr(d, "relax_all"):
            d.relax_all()

    if args.test_leg:
        print(f"\n[Auto-Test] Starte automatischen Testlauf für Bein '{args.test_leg}' in 2 Sekunden...")
        def _delayed_test():
            time.sleep(2.0)
            server.test_leg(leg_name=args.test_leg, cycles=5)
        threading.Thread(target=_delayed_test, name="DelayedAutoTest", daemon=True).start()

    print("\n" + "-" * 60)
    print(f"  ✔ Dashboard running:  http://0.0.0.0:{args.port}")
    print(f"  ✔ Telemetry API:      ws://0.0.0.0:{args.ws_port}")
    print("  Daemon is active and waiting for commands (Press Ctrl+C to stop).")
    print("-" * 60 + "\n")

    try:
        # Keep daemon alive and tick robot when moving
        while True:
            robot.tick()
            time.sleep(0.020)  # 50 Hz loop
    except KeyboardInterrupt:
        print("\nStopping Lasius Server Daemon...")
    finally:
        for d in drivers.values():
            if hasattr(d, "relax_all"):
                d.relax_all()
        server.stop()
        print("All servos relaxed. Goodbye!")


if __name__ == "__main__":
    main()
