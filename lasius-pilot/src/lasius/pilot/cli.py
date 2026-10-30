"""
CLI Client for Lasius Gamepad Teleoperation (`lasius.pilot.cli`).

Purpose & Role:
    Connects `GamepadController` (`/dev/input/js0`) to the `LasiusServer`
    WebSocket API (`ws://<host>:8765`) and streams atomic `set_velocity`
    commands as well as discrete button actions (Google Stadia Controller
    layout: E-Stop, Gait Switch, Speed, Body Height, Pose Reset, Pause).

Functions:
    - `run_teleop(host, port, device, profile)`: Async 33 Hz event loop reading
      joystick axes and buttons and transmitting commands over WebSocket.
    - `main()`: CLI entry point registered as `lasius-pilot` in `pyproject.toml`.
"""

import argparse
import asyncio
import json
import sys

try:
    import websockets
except ImportError:
    websockets = None

try:
    from lasius.pilot.gamepad import GamepadController, load_all_gamepad_profiles
except ImportError:
    from .gamepad import GamepadController, load_all_gamepad_profiles


async def run_teleop(host: str, port: int, device: str, profile: str = "auto"):
    print(
        r"""
 _              _                      
| |    __ _ ___(_)_   _ ___            
| |   / _` / __| | | | / __|           
| |__| (_| \__ \ | |_| \__ \           
|_____\__,_|___/_|\__,_|___/         _ 
| | | | _____  ____ _|  _ \ ___   __| |
| |_| |/ _ \ \/ / _` | |_) / _ \ / _` |
|  _  |  __/>  < (_| |  __/ (_) | (_| |
|_| |_|\___/_/\_\__,_|_|   \___/ \__,_|
"""
    )
    controller = GamepadController(device_path=device, profile=profile)
    if not controller.connect():
        print(f"[ERROR] Could not open joystick device at '{device}'. Is the controller connected?")
        print("Tip (Google Stadia Bluetooth): Hold [Y + Stadia] for 2s to pair via 'bluetoothctl'.")
        print("Tip (BlueZ BLE): Ensure 'UserspaceHID=true' is set in /etc/bluetooth/input.conf.")
        sys.exit(1)

    print(
        f"✔ Controller connected at {device}: {controller.device_name} "
        f"(Profile: {controller.active_profile_config.name} [{controller.active_profile}])"
    )
    uri = f"ws://{host}:{port}"
    print(f"Connecting to Lasius-Server at {uri}...")

    try:
        async with websockets.connect(uri) as ws:
            labels = controller.active_profile_config.labels
            print("✔ Connected to Lasius Telemetry & Command API!")
            print("-" * 68)
            print("  [Left Stick]  : Walk Forward/Back & Strafe Left/Right")
            print("  [Right Stick] : Turn Left/Right in place")
            print(f"  {labels.cli_gait_hint}")
            print(f"  {labels.cli_estop_hint}")
            print("  [L1 / R1]     : Speed -0.25x / +0.25x")
            print("  [D-Pad Up/Dn] : Body Height +/- 5 mm")
            print(f"  {labels.cli_pose_hint}")
            print("-" * 68)

            last_cmd = {}
            while True:
                events = controller.read_events()

                # 1. Dispatch discrete button / D-Pad actions immediately
                for action_msg in controller.translate_events_to_actions(events):
                    await ws.send(json.dumps(action_msg))

                # 2. Dispatch continuous stick velocity on change
                cmd = controller.get_locomotion_command()
                if cmd != last_cmd:
                    last_cmd = cmd.copy()
                    msg = {
                        "type": "command",
                        "action": "set_velocity",
                        "walk_x": cmd["walk_x"],
                        "walk_y": cmd["walk_y"],
                        "turn_z": cmd["turn_z"],
                    }
                    await ws.send(json.dumps(msg))

                await asyncio.sleep(0.030)  # ~33 Hz update rate
    except Exception as e:
        print(f"[ERROR] Connection to Lasius-Server failed: {e}")
    finally:
        controller.close()


def main():
    available_profiles = ["auto"] + list(load_all_gamepad_profiles().keys())
    parser = argparse.ArgumentParser(description="Lasius Gamepad Teleoperation Client (YAML-configured profiles)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Lasius Server host (default: 127.0.0.1).")
    parser.add_argument("--port", type=int, default=8765, help="Lasius WebSocket port (default: 8765).")
    parser.add_argument("--device", type=str, default="/dev/input/js0", help="Linux joystick device (default: /dev/input/js0).")
    parser.add_argument(
        "--profile",
        type=str,
        choices=available_profiles,
        default="auto",
        help=f"Controller YAML profile from lasius.pilot/profiles/*.yaml ({', '.join(available_profiles)}).",
    )
    args = parser.parse_args()

    if websockets is None:
        print("[ERROR] 'websockets' package is required. Install via 'pip install websockets'.")
        sys.exit(1)

    try:
        asyncio.run(run_teleop(args.host, args.port, args.device, args.profile))
    except KeyboardInterrupt:
        print("\nGamepad teleoperation stopped.")


if __name__ == "__main__":
    main()
