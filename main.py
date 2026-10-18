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

from bkhexapod.robot import Hexapod, MockPWMDriver
from bkhexapod.config import load_config
from bkhexapod.gait import TripodGait
from bkhexapod.visualizer.server import VisualizerServer


def main():
    """Main function to initialize and run the hexapod."""
    parser = argparse.ArgumentParser(description="Hexapod Control Software")
    parser.add_argument("--visualize", action="store_true", help="Enable the web visualizer.")
    args = parser.parse_args()

    print("--- Hexapod Control Software ---\n")

    visualizer = None
    drivers = {}

    try:
        if args.visualize:
            visualizer = VisualizerServer()
            visualizer.start()
            # When visualizing, we create drivers that are linked to the server
            drivers = {
                0x40: MockPWMDriver(visualizer_server=visualizer),
                0x41: MockPWMDriver(visualizer_server=visualizer)
            }
        else:
            # Without visualization, create standard mock drivers
            drivers = {
                0x40: MockPWMDriver(),
                0x41: MockPWMDriver()
            }

        # 1. Load Configuration
        config_file_path = PROJECT_ROOT / 'src/bkhexapod/servos.yaml'
        print(f"Loading configuration from: {config_file_path}")
        hexapod_config = load_config(config_file_path)

        # 2. Initialize Hexapod by passing the pre-built drivers
        my_hexapod = Hexapod(config=hexapod_config, drivers=drivers)

        # 3. Set the active gait
        my_hexapod.set_gait(TripodGait())

        # 4. Run the gait animation loop
        print("\n--- Running Tripod Gait Animation (Press Ctrl+C to stop) ---")
        while True:
            my_hexapod.tick()
            time.sleep(0.05)

    except FileNotFoundError:
        print(f"[ERROR] Configuration file not found. Make sure 'servos.yaml' is in the 'bkhexapod' directory.")
    except KeyboardInterrupt:
        print("\nAnimation stopped by user.")
    except Exception as e:
        print(f"[ERROR] An unexpected error occurred: {e}")


if __name__ == '__main__':
    main()
