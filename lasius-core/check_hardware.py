#!/usr/bin/env python3
"""
Hardware diagnostic and test utility for Lasius Hexapod.

Features:
- Scans I2C bus for the dual PCA9685 boards (0x40 and 0x42).
- Interactive and CLI testing of individual servo channels.
- Gentle centering and servo relaxing to protect the power supply and mechanics.
- Automatic fallback or explicit --mock mode for testing on laptops.
"""

import argparse
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Any

# Add project root and src to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT))
sys.path.append(str(PROJECT_ROOT / "src"))

from lasius.core.config import load_config, ServoConfig
from lasius.core.hardware import RealPCA9685Driver, MockPWMDriver, Servo

try:
    import smbus2
    HAS_SMBUS = True
except ImportError:
    HAS_SMBUS = False


def scan_i2c_bus(bus_num: int = 1) -> List[int]:
    """Scans I2C bus for active device addresses (0x03 to 0x77)."""
    if not HAS_SMBUS:
        print("[WARN] smbus2 is not installed. Run 'pip install smbus2'.")
        return []

    active_addresses = []
    try:
        with smbus2.SMBus(bus_num) as bus:
            for addr in range(0x03, 0x78):
                try:
                    bus.write_quick(addr)
                    active_addresses.append(addr)
                except OSError:
                    pass
    except FileNotFoundError:
        print(f"[ERROR] /dev/i2c-{bus_num} not found. Is I2C enabled in raspi-config?")
    except PermissionError:
        print(f"[ERROR] Permission denied on /dev/i2c-{bus_num}. Add user to i2c group: 'sudo usermod -aG i2c $USER'.")
    except Exception as e:
        print(f"[ERROR] I2C scan failed: {e}")

    return active_addresses


def print_i2c_diagnosis(bus_num: int = 1) -> bool:
    """Prints a detailed diagnosis of the I2C bus and the two PCA9685 boards."""
    print("\n" + "=" * 55)
    print(f"  I2C BUS DIAGNOSIS (Bus {bus_num})")
    print("=" * 55)

    detected = scan_i2c_bus(bus_num)

    board1_found = 0x40 in detected
    board2_addr = 0x42 if 0x42 in detected else (0x41 if 0x41 in detected else None)
    board2_found = board2_addr is not None

    status_1 = "✔ DETECTED (Board 1 / Left Side)" if board1_found else "✘ NOT FOUND"
    status_2 = f"✔ DETECTED (Board 2 / Right Side at 0x{board2_addr:02X})" if board2_found else "✘ NOT FOUND (0x42 or 0x41)"

    print(f"  Address 0x40: {status_1}")
    print(f"  Board 2:      {status_2}")

    other_addrs = [f"0x{a:02X}" for a in detected if a not in (0x40, 0x41, 0x42)]
    if other_addrs:
        print(f"  Other detected devices: {', '.join(other_addrs)}")

    print("-" * 55)
    if board1_found and board2_found:
        print("  [STATUS] Both PCA9685 boards are ready for operation!")
        print("=" * 55 + "\n")
        return True
    else:
        print("  [TROUBLESHOOTING]:")
        if not board1_found:
            print("  - Check 3.3V logic VCC, GND, SDA (Pin 3), SCL (Pin 5) on Board 1 (0x40).")
        if not board2_found:
            print("  - Check solder bridge A1 (0x42) or A0 (0x41) on Board 2.")
            print("  - Check daisy-chain wiring from Board 1 to Board 2.")
        print("=" * 55 + "\n")
        return False


def get_driver(address: int, i2c_bus: int, use_mock: bool, bus_instances: Dict[int, Any]):
    """Returns a RealPCA9685Driver or MockPWMDriver."""
    if use_mock:
        return MockPWMDriver()

    if address in bus_instances:
        return bus_instances[address]

    # Shared SMBus for same bus number
    shared_smbus = bus_instances.get(f"bus_{i2c_bus}")
    if shared_smbus is None:
        try:
            shared_smbus = smbus2.SMBus(i2c_bus)
            bus_instances[f"bus_{i2c_bus}"] = shared_smbus
        except Exception as e:
            print(f"[WARN] Failed to open real I2C bus: {e}. Falling back to MockPWMDriver.")
            mock = MockPWMDriver()
            bus_instances[address] = mock
            return mock

    try:
        driver = RealPCA9685Driver(address=address, i2c_bus=i2c_bus, bus_instance=shared_smbus)
        bus_instances[address] = driver
        return driver
    except Exception as e:
        print(f"[WARN] Failed to init RealPCA9685Driver at 0x{address:02X}: {e}. Using MockPWMDriver.")
        mock = MockPWMDriver()
        bus_instances[address] = mock
        return mock


def test_single_servo(
    servo: Servo,
    angle: float,
    hold_duration: float = 1.0,
    relax_after: bool = True
) -> None:
    """Moves a servo to the target angle and optionally relaxes it afterwards."""
    cfg = servo.config
    print(f"\n[TEST] Servo: '{cfg.name}' (Board: 0x{cfg.board_address:02X}, Channel: {cfg.channel})")
    print(f"       Moving to angle: {angle:+.1f}° (Config range: [{cfg.min_angle}°, {cfg.max_angle}°])")

    servo.set_angle(angle)
    time.sleep(hold_duration)

    if relax_after:
        print(f"       Relaxing channel {cfg.channel} (PWM disabled)...")
        if hasattr(servo.driver, "relax_channel"):
            servo.driver.relax_channel(cfg.channel)


def interactive_menu(config_file: Path, i2c_bus: int = 1, use_mock: bool = False) -> None:
    """Runs the interactive console menu for hardware testing."""
    config = load_config(config_file)
    bus_instances: Dict[str, Any] = {}

    board_addrs = sorted({sc.board_address for sc in config.servos} | {0x40, 0x42})
    drivers = {
        addr: get_driver(addr, i2c_bus, use_mock, bus_instances)
        for addr in board_addrs
    }

    servos_by_name: Dict[str, Servo] = {
        sc.name: Servo(config=sc, driver=drivers[sc.board_address])
        for sc in config.servos
    }

    while True:
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
|_| |_|\___/_/\_\__,_|_|   \___/ \__,_|"""
        )
        print("=" * 45)
        print("  LASIUS HARDWARE TEST & DIAGNOSTICS")
        print("=" * 45)
        print("  1. I2C Bus Scan & Diagnosis")
        print("  2. Test Single Servo (by name)")
        print("  3. Center All Servos (0° Sequence)")
        print("  4. Sweep Single Servo (-30° -> 0° -> +30°)")
        print("  5. Relax All Servos (Turn off all PWM)")
        print("  0. Exit")
        print("=" * 45)

        choice = input("Enter choice (0-5): ").strip()

        if choice == "1":
            print_i2c_diagnosis(i2c_bus)

        elif choice == "2":
            print("\nAvailable Servos:")
            names = list(servos_by_name.keys())
            for i, name in enumerate(names, 1):
                print(f"  {i:2d}. {name}")
            sel = input("\nEnter servo name or number: ").strip()
            servo = None
            if sel.isdigit() and 1 <= int(sel) <= len(names):
                servo = servos_by_name[names[int(sel) - 1]]
            elif sel in servos_by_name:
                servo = servos_by_name[sel]

            if servo:
                angle_str = input(f"Enter target angle in degrees [{servo.config.min_angle} to {servo.config.max_angle}] (default 0.0): ").strip()
                target_angle = float(angle_str) if angle_str else 0.0
                relax_str = input("Relax servo after 1.5 seconds? [Y/n]: ").strip().lower()
                relax = relax_str != "n"
                test_single_servo(servo, target_angle, hold_duration=1.5, relax_after=relax)
            else:
                print("[ERROR] Invalid servo selection.")

        elif choice == "3":
            print("\n[INFO] Centering all 18 servos in sequence...")
            confirm = input("Ensure hexapod is placed safely on stand/box. Proceed? [Y/n]: ").strip().lower()
            if confirm != "n":
                for name, s in servos_by_name.items():
                    print(f"  -> Centering '{name}' (0.0°)...")
                    s.set_angle(0.0)
                    time.sleep(0.3)
                print("[OK] All servos centered.")
                relax_str = input("Relax all servos now to avoid current draw? [Y/n]: ").strip().lower()
                if relax_str != "n":
                    for d in drivers.values():
                        if hasattr(d, "relax_all"):
                            d.relax_all()
                    print("[OK] All servos relaxed.")

        elif choice == "4":
            print("\nSelect Servo to Sweep:")
            names = list(servos_by_name.keys())
            for i, name in enumerate(names, 1):
                print(f"  {i:2d}. {name}")
            sel = input("\nEnter servo name or number: ").strip()
            servo = None
            if sel.isdigit() and 1 <= int(sel) <= len(names):
                servo = servos_by_name[names[int(sel) - 1]]
            elif sel in servos_by_name:
                servo = servos_by_name[sel]

            if servo:
                print(f"[TEST] Sweeping '{servo.config.name}': 0° -> -30° -> 0° -> +30° -> 0°")
                for ang in [0.0, -30.0, 0.0, 30.0, 0.0]:
                    print(f"  Position: {ang:+.1f}°")
                    servo.set_angle(ang)
                    time.sleep(0.5)
                if hasattr(servo.driver, "relax_channel"):
                    servo.driver.relax_channel(servo.config.channel)
                print("[OK] Sweep complete, servo relaxed.")
            else:
                print("[ERROR] Invalid servo selection.")

        elif choice == "5":
            for d in drivers.values():
                if hasattr(d, "relax_all"):
                    d.relax_all()
            print("[OK] All PWM channels shut down on both boards.")

        elif choice == "0":
            for d in drivers.values():
                if hasattr(d, "relax_all"):
                    d.relax_all()
            print("Exiting.")
            break
        else:
            print("[WARN] Invalid option.")


def main():
    parser = argparse.ArgumentParser(description="Lasius Hexapod Hardware Test & Diagnostics Utility")
    parser.add_argument("--scan", action="store_true", help="Scan I2C bus for 0x40 and 0x42 and exit.")
    parser.add_argument("--bus", type=int, default=1, help="I2C bus number (default: 1).")
    parser.add_argument("--mock", action="store_true", help="Force software simulation mode without I2C hardware.")
    parser.add_argument("--servo", type=str, help="Target specific servo by name (e.g. left_front_coxa).")
    parser.add_argument("--angle", type=float, default=0.0, help="Target angle for servo test (default: 0.0).")
    parser.add_argument("--relax", action="store_true", help="Turn off PWM output after test to relax servos.")
    parser.add_argument("--center-all", action="store_true", help="Sequentially center all 18 servos to 0°.")
    parser.add_argument("--relax-all", action="store_true", help="Turn off PWM output on all channels of both boards.")
    args = parser.parse_args()

    config_path = PROJECT_ROOT / "src/lasius/core/config.yaml"

    if args.scan:
        success = print_i2c_diagnosis(args.bus)
        sys.exit(0 if success else 1)

    if args.relax_all:
        config = load_config(config_path)
        board_addrs = sorted({sc.board_address for sc in config.servos} | {0x40, 0x42})
        bus_instances: Dict[str, Any] = {}
        for addr in board_addrs:
            d = get_driver(addr, args.bus, args.mock, bus_instances)
            if hasattr(d, "relax_all"):
                d.relax_all()
        print("[OK] Relaxed all channels on both boards.")
        sys.exit(0)

    if args.center_all:
        config = load_config(config_path)
        board_addrs = sorted({sc.board_address for sc in config.servos} | {0x40, 0x42})
        bus_instances = {}
        drivers = {
            addr: get_driver(addr, args.bus, args.mock, bus_instances)
            for addr in board_addrs
        }
        for sc in config.servos:
            s = Servo(config=sc, driver=drivers[sc.board_address])
            print(f"Centering '{sc.name}' -> 0.0°")
            s.set_angle(0.0)
            time.sleep(0.15)
        print("[OK] All servos centered.")
        sys.exit(0)

    if args.servo:
        config = load_config(config_path)
        matching = [sc for sc in config.servos if sc.name == args.servo]
        if not matching:
            print(f"[ERROR] Servo '{args.servo}' not found in configuration.")
            sys.exit(1)
        sc = matching[0]
        bus_instances = {}
        d = get_driver(sc.board_address, args.bus, args.mock, bus_instances)
        s = Servo(config=sc, driver=d)
        test_single_servo(s, args.angle, hold_duration=1.5, relax_after=args.relax)
        sys.exit(0)

    # If no flags passed, launch interactive menu
    interactive_menu(config_path, i2c_bus=args.bus, use_mock=args.mock)


if __name__ == "__main__":
    main()
