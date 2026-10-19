"""
Main entry point for the hexapod robot control software.

This script initializes the robot and can be used to run tests,
start a specific gait, or launch a control interface.
"""

import time
import argparse
from pathlib import Path
import sys

# Add the project root to the Python path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT))

from bkhexapod.robot import Hexapod
from bkhexapod.drivers import MockPWMDriver, RealPCA9685Driver
from bkhexapod.config import load_config
from bkhexapod.gait import TripodGait, OmniGait
from bkhexapod.visualizer.server import VisualizerServer

try:
    import smbus2
except ImportError:
    smbus2 = None


def main():
    """Main function to initialize and run the hexapod."""
    parser = argparse.ArgumentParser(description="Hexapod Control Software")
    parser.add_argument("--visualize", action="store_true", help="Enable the web visualizer.")
    parser.add_argument("--hardware", action="store_true", help="Use real PCA9685 hardware drivers over I2C.")
    parser.add_argument("--i2c-bus", type=int, default=1, help="I2C bus number (default: 1).")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Web visualizer binding host (default: 0.0.0.0).")
    parser.add_argument("--port", type=int, default=8000, help="Web visualizer HTTP port (default: 8000).")
    parser.add_argument("--ws-port", type=int, default=8765, help="Web visualizer WebSocket port (default: 8765).")
    args = parser.parse_args()

    print("--- Hexapod Control Software ---\n")

    visualizer = None
    drivers = {}

    try:
        if args.visualize:
            visualizer = VisualizerServer(host=args.host, http_port=args.port, ws_port=args.ws_port)

        if args.hardware:
            if smbus2 is None:
                print("[ERROR] smbus2 is required for --hardware. Install via 'pip install smbus2'.")
                sys.exit(1)
            try:
                shared_bus = smbus2.SMBus(args.i2c_bus)
                drivers = {
                    0x40: RealPCA9685Driver(address=0x40, bus_instance=shared_bus, visualizer_server=visualizer),
                    0x41: RealPCA9685Driver(address=0x41, bus_instance=shared_bus, visualizer_server=visualizer),
                }
                print(f"[Hardware] Initialized RealPCA9685Driver on I2C bus {args.i2c_bus} (0x40 & 0x41).")
            except Exception as e:
                print(f"[ERROR] Could not initialize real I2C hardware: {e}")
                sys.exit(1)
        else:
            drivers = {
                0x40: MockPWMDriver(visualizer_server=visualizer),
                0x41: MockPWMDriver(visualizer_server=visualizer)
            }
            print("[Simulation] Using MockPWMDriver (in-memory simulation).")

        config_file_path = PROJECT_ROOT / 'src/bkhexapod/config.yaml'
        if not config_file_path.exists():
            config_file_path = PROJECT_ROOT / 'src/bkhexapod/servos.yaml'
        print(f"Loading configuration from: {config_file_path}")
        hexapod_config = load_config(config_file_path)

        my_hexapod = Hexapod(config=hexapod_config, drivers=drivers)

        my_hexapod.set_gait(OmniGait(geometry=hexapod_config.geometry))

        print("\n--- Running Hexapod Gait Animation (Press Ctrl+C to stop) ---")
        while True:
            if visualizer is not None:
                if visualizer.is_paused:
                    time.sleep(0.05)
                    continue

                if my_hexapod.gait_engine is not None:
                    ge = my_hexapod.gait_engine
                    if hasattr(ge, 'gait_speed'):
                        ge.gait_speed = visualizer.gait_speed
                    if hasattr(ge, 'step_height'):
                        ge.step_height = visualizer.step_height
                    if hasattr(ge, 'step_length'):
                        ge.step_length = visualizer.step_length
                    if hasattr(ge, 'walk_x'):
                        ge.walk_x = visualizer.walk_x
                    if hasattr(ge, 'walk_y'):
                        ge.walk_y = visualizer.walk_y
                    if hasattr(ge, 'turn_z'):
                        ge.turn_z = visualizer.turn_z
                    if hasattr(ge, 'body_height'):
                        ge.body_height = visualizer.body_height
                    if hasattr(ge, 'body_roll'):
                        ge.body_roll = visualizer.body_roll
                    if hasattr(ge, 'body_pitch'):
                        ge.body_pitch = visualizer.body_pitch
                    if hasattr(ge, 'set_gait_type'):
                        ge.set_gait_type(visualizer.gait_type)

            my_hexapod.tick()
            time.sleep(0.05)

    except FileNotFoundError:
        print("[ERROR] Configuration file not found. Make sure 'config.yaml' (or 'servos.yaml') is in the 'src/bkhexapod' directory.")
    except KeyboardInterrupt:
        print("\nAnimation stopped by user.")
    except Exception as e:
        print(f"[ERROR] An unexpected error occurred: {e}")
    finally:
        # Relax servos on physical hardware to eliminate holding current
        for d in drivers.values():
            if hasattr(d, "relax_all"):
                d.relax_all()
        if visualizer is not None:
            print("[Visualizer] Stopping servers...")
            visualizer.stop()
            print("[Visualizer] Stopped cleanly.")


if __name__ == "__main__":
    main()
