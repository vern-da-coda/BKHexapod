"""
CLI tool for Lasius Gamepad Teleoperation.
"""

import argparse
import asyncio
import json
import sys
import time

try:
    import websockets
except ImportError:
    websockets = None

try:
    from lasius.pilot.gamepad import GamepadController
except ImportError:
    from .gamepad import GamepadController


async def run_teleop(host: str, port: int, device: str):
    controller = GamepadController(device_path=device)
    if not controller.connect():
        print(f"[ERROR] Could not open joystick device at '{device}'. Is Bluetooth gamepad connected?")
        print("Tip: Run 'bluetoothctl' and pair your controller (e.g. DualShock, Xbox, 8BitDo).")
        sys.exit(1)

    print(f"✔ Gamepad connected at {device}!")
    uri = f"ws://{host}:{port}"
    print(f"Connecting to Lasius-Server at {uri}...")

    try:
        async with websockets.connect(uri) as ws:
            print("✔ Connected to Lasius Telemetry & Command API!")
            print("Steering active: Left Stick = Walk/Strafe | Right Stick = Turn | Ctrl+C = Stop")

            last_cmd = {}
            while True:
                controller.read_events()
                cmd = controller.get_locomotion_command()

                # Send only on change or periodically
                if cmd != last_cmd:
                    last_cmd = cmd.copy()
                    msg = {
                        "type": "command",
                        "action": "set_walk",
                        "x": cmd["walk_x"],
                        "y": cmd["walk_y"],
                    }
                    await ws.send(json.dumps(msg))
                    if cmd["turn_z"] != 0.0:
                        rot_msg = {
                            "type": "command",
                            "action": "set_turn",
                            "z": cmd["turn_z"],
                        }
                        await ws.send(json.dumps(rot_msg))

                await asyncio.sleep(0.030)  # ~33 Hz update rate
    except Exception as e:
        print(f"[ERROR] Connection to Lasius-Server failed: {e}")
    finally:
        controller.close()


def main():
    parser = argparse.ArgumentParser(description="Lasius Gamepad Teleoperation Client")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Lasius Server host (default: 127.0.0.1).")
    parser.add_argument("--port", type=int, default=8765, help="Lasius WebSocket port (default: 8765).")
    parser.add_argument("--device", type=str, default="/dev/input/js0", help="Linux joystick device (default: /dev/input/js0).")
    args = parser.parse_args()

    if websockets is None:
        print("[ERROR] 'websockets' package is required. Install via 'pip install websockets'.")
        sys.exit(1)

    try:
        asyncio.run(run_teleop(args.host, args.port, args.device))
    except KeyboardInterrupt:
        print("\nGamepad teleoperation stopped.")


if __name__ == "__main__":
    main()
