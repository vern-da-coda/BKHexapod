#!/usr/bin/env python3
"""
Lasius Hexapod - Interaktive Test-, Setup- und Kalibrierungs-Routine.

Dieses Tool ermöglicht:
- Sichere Einzelbein-Isolation: Nur das ausgewählte Bein wird bestromt,
  alle anderen 15 Servos bleiben stromlos (Schutz vor Blockaden & Getriebeschäden).
- Live-Synchronisation mit dem 3D Digital Twin im Browser (Port 8000).
- Trockenlauf (Dry-Run): Bewegungen erst im 3D-Modell prüfen, bevor Servostrom fließt.
- Interaktiver Gelenk-Trimm (Offsets per Tastendruck in 1°- oder 5°-Schritten anpassen).
- Direktes Speichern der Kalibrierwerte in config.yaml & servos.yaml.
- Testen des neuen butterweichen 50-Hz-Harmonic-Schrittzyklus (C1-stetig).
- Kollisionsprüfung durch langsamen Sweep von min_angle bis max_angle.
"""

import argparse
import math
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

# Add project root and src to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT))
sys.path.append(str(PROJECT_ROOT / "src"))

from lasius.core.config import (
    HexapodConfig,
    ServoConfig,
    load_config,
    update_servo_calibration,
)
from lasius.core.hardware import MockPWMDriver, RealPCA9685Driver, PWMDriverProtocol, Servo
from lasius.core.motion import BodySide, Leg, LegIdentifier, LegRow, Joint
from lasius.core.server import VisualizerServer

try:
    import smbus2
    HAS_SMBUS = True
except ImportError:
    smbus2 = None
    HAS_SMBUS = False


# ANSI Color Codes
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


LEG_CHOICES = [
    ("left_rear", "Hinten Links (left_rear)", LegIdentifier.LEFT_REAR, 0x40, [9, 10, 11]),
    ("left_middle", "Mitte Links  (left_middle)", LegIdentifier.LEFT_MIDDLE, 0x40, [4, 5, 6]),
    ("left_front", "Vorne Links  (left_front)", LegIdentifier.LEFT_FRONT, 0x40, [0, 1, 2]),
    ("right_rear", "Hinten Rechts(right_rear)", LegIdentifier.RIGHT_REAR, 0x42, [8, 9, 10]),
    ("right_middle", "Mitte Rechts (right_middle)", LegIdentifier.RIGHT_MIDDLE, 0x42, [4, 5, 6]),
    ("right_front", "Vorne Rechts (right_front)", LegIdentifier.RIGHT_FRONT, 0x42, [0, 1, 2]),
]


class CalibrationTool:
    def __init__(
        self,
        config: HexapodConfig,
        drivers: Dict[int, PWMDriverProtocol],
        visualizer: Optional[VisualizerServer] = None,
        dry_run: bool = False,
    ):
        self.config = config
        self.drivers = drivers
        self.visualizer = visualizer
        self.dry_run = dry_run

        # Build servos dictionary
        self.servos: Dict[str, Servo] = {}
        for sc in self.config.servos:
            drv = self.drivers.get(sc.board_address)
            if drv is not None:
                self.servos[sc.name] = Servo(config=sc, driver=drv)

        # Build legs dictionary
        coxa_len = self.config.geometry.limbs.coxa
        femur_len = self.config.geometry.limbs.femur
        tibia_len = self.config.geometry.limbs.tibia

        self.legs: Dict[str, Leg] = {}
        for leg_key, label, leg_id, board, channels in LEG_CHOICES:
            c_name = f"{leg_key}_coxa"
            f_name = f"{leg_key}_femur"
            t_name = f"{leg_key}_tibia"
            if c_name in self.servos and f_name in self.servos and t_name in self.servos:
                self.legs[leg_key] = Leg(
                    side=leg_id.value[0],
                    row=leg_id.value[1],
                    coxa=Joint(servo=self.servos[c_name], length=coxa_len),
                    femur=Joint(servo=self.servos[f_name], length=femur_len),
                    tibia=Joint(servo=self.servos[t_name], length=tibia_len),
                )

        # Current live angles for Digital Twin streaming
        self.live_angles: Dict[str, float] = {}
        for sname, s in self.servos.items():
            self.live_angles[sname] = 0.0

    def sync_visualizer(self, partial_angles: Optional[Dict[str, float]] = None) -> None:
        """Streams angle updates to the 3D Digital Twin web interface."""
        if self.visualizer is None:
            return
        if partial_angles:
            self.live_angles.update(partial_angles)
        self.visualizer.send_angles_update(self.live_angles)

    def relax_all_servos(self) -> None:
        """Relaxes all 18 servos across all boards (no holding current)."""
        if self.dry_run:
            return
        for drv in self.drivers.values():
            if hasattr(drv, "relax_all"):
                drv.relax_all()

    def relax_leg(self, leg_key: str) -> None:
        """Relaxes only the 3 servos of a specific leg."""
        if self.dry_run:
            return
        for joint_type in ["coxa", "femur", "tibia"]:
            sname = f"{leg_key}_{joint_type}"
            if sname in self.servos:
                servo = self.servos[sname]
                drv = servo.driver
                if hasattr(drv, "relax_channel"):
                    drv.relax_channel(servo.config.channel)

    def set_servo_angle_safe(self, servo_name: str, angle: float) -> None:
        """Applies angle to servo (if not in dry-run) and streams to Digital Twin."""
        if servo_name not in self.servos:
            return
        servo = self.servos[servo_name]
        clamped_angle = max(servo.config.min_angle, min(servo.config.max_angle, float(angle)))
        if not self.dry_run:
            servo.set_angle(clamped_angle)
        self.live_angles[servo_name] = clamped_angle
        self.sync_visualizer({servo_name: clamped_angle})

    def move_leg_tip_safe(self, leg_key: str, x: float, y: float, z: float) -> Tuple[float, float, float]:
        """Calculates IK, moves physical joints and streams to Digital Twin."""
        if leg_key not in self.legs:
            return 0.0, 0.0, 0.0
        leg = self.legs[leg_key]
        c_deg, f_deg, t_deg = leg._calculate_inverse_kinematics(x, y, z)
        c_name = f"{leg_key}_coxa"
        f_name = f"{leg_key}_femur"
        t_name = f"{leg_key}_tibia"

        self.set_servo_angle_safe(c_name, c_deg)
        self.set_servo_angle_safe(f_name, f_deg)
        self.set_servo_angle_safe(t_name, t_deg)
        return c_deg, f_deg, t_deg

    def run_smooth_stance(self, leg_key: str, duration: float = 1.0) -> None:
        """Gently moves leg to its calibrated neutral stance over a smooth trajectory."""
        print(f"\n{CYAN}Fahre Bein '{leg_key}' sanft in Neutralstellung...{RESET}")
        x_target = 160.0
        y_target = 0.0
        z_target = -80.0

        # Start from current angles or 0
        c_name = f"{leg_key}_coxa"
        f_name = f"{leg_key}_femur"
        t_name = f"{leg_key}_tibia"

        start_c = self.live_angles.get(c_name, 0.0)
        start_f = self.live_angles.get(f_name, 0.0)
        start_t = self.live_angles.get(t_name, 0.0)

        leg = self.legs[leg_key]
        tgt_c, tgt_f, tgt_t = leg._calculate_inverse_kinematics(x_target, y_target, z_target)

        steps = int(duration * 50)  # 50 Hz
        for s in range(1, steps + 1):
            alpha = 0.5 * (1.0 - math.cos(math.pi * (s / steps)))  # Cosine S-curve
            cur_c = start_c + alpha * (tgt_c - start_c)
            cur_f = start_f + alpha * (tgt_f - start_f)
            cur_t = start_t + alpha * (tgt_t - start_t)

            self.set_servo_angle_safe(c_name, cur_c)
            self.set_servo_angle_safe(f_name, cur_f)
            self.set_servo_angle_safe(t_name, cur_t)
            time.sleep(0.020)

        print(f"{GREEN}✔ Neutralstellung erreicht:{RESET} Coxa={tgt_c:.1f}°, Femur={tgt_f:.1f}°, Tibia={tgt_t:.1f}°")

    def run_harmonic_cycles(self, leg_key: str, cycles: int = 5, stride: float = 36.0, lift: float = 30.0) -> None:
        """Executes smooth 50 Hz harmonic step cycles on the chosen leg."""
        print(f"\n{CYAN}Starte {cycles} butterweiche 50-Hz-Harmonic-Zyklen für '{leg_key}'...{RESET}")
        stride_half = stride / 2.0
        z_ground = -80.0
        x_rad = 160.0
        steps_per_cycle = 50  # 1.0 second per cycle at 50 Hz
        dt = 0.020

        # Ensure starting at neutral
        self.run_smooth_stance(leg_key, duration=0.6)
        time.sleep(0.2)

        try:
            for cycle in range(1, cycles + 1):
                print(f"  >>> Zyklus {cycle}/{cycles}...", flush=True)
                for s in range(steps_per_cycle):
                    phase = s / float(steps_per_cycle)
                    if phase < 0.5:
                        # Swing: Lift & swing forward with cosine velocity
                        p = phase / 0.5
                        y = -stride_half * math.cos(p * math.pi)
                        z = z_ground + lift * math.sin(p * math.pi)
                    else:
                        # Stance: Ground contact, smooth backward push with cosine velocity
                        p = (phase - 0.5) / 0.5
                        y = stride_half * math.cos(p * math.pi)
                        z = z_ground

                    self.move_leg_tip_safe(leg_key, x_rad, y, z)
                    time.sleep(dt)

            print(f"\n{GREEN}✔ Alle {cycles} Zyklen erfolgreich beendet!{RESET}")
            self.run_smooth_stance(leg_key, duration=0.5)
        except KeyboardInterrupt:
            print(f"\n{YELLOW}Abbruch durch Benutzer.{RESET}")
            self.relax_leg(leg_key)

    def run_joint_sweep(self, servo_name: str) -> None:
        """Gently sweeps a single joint from min_angle to max_angle for collision check."""
        servo = self.servos[servo_name]
        min_a = servo.config.min_angle
        max_a = servo.config.max_angle
        print(f"\n{CYAN}Prüfe Kollisionsfreiheit für '{servo_name}' ({min_a}° bis {max_a}°)...{RESET}")

        orig_angle = self.live_angles.get(servo_name, 0.0)
        steps = 40
        dt = 0.030

        try:
            # 1. Drive to min
            for s in range(steps + 1):
                a = orig_angle + (s / steps) * (min_a - orig_angle)
                self.set_servo_angle_safe(servo_name, a)
                time.sleep(dt)
            time.sleep(0.3)

            # 2. Drive to max
            for s in range(steps * 2 + 1):
                a = min_a + (s / (steps * 2)) * (max_a - min_a)
                self.set_servo_angle_safe(servo_name, a)
                time.sleep(dt)
            time.sleep(0.3)

            # 3. Return to orig
            for s in range(steps + 1):
                a = max_a + (s / steps) * (orig_angle - max_a)
                self.set_servo_angle_safe(servo_name, a)
                time.sleep(dt)

            print(f"{GREEN}✔ Sweep abgeschlossen. Kein mechanischer Anschlag festgestellt?{RESET}")
        except KeyboardInterrupt:
            print(f"\n{YELLOW}Sweep abgebrochen.{RESET}")

    def interactive_joint_trim(self, servo_name: str) -> None:
        """Interactive live trim for a single joint's center_offset_pulse and orientation."""
        servo = self.servos[servo_name]
        cfg = servo.config

        print(f"\n{'=' * 60}")
        print(f"  {BOLD}Gelenk-Trimm:{RESET} {CYAN}{cfg.name}{RESET}")
        print(f"  Board: 0x{cfg.board_address:02X} | Kanal: {cfg.channel}")
        print(f"  Soft-Limits: [{cfg.min_angle}°, {cfg.max_angle}°]")
        print(f"{'=' * 60}")

        curr_offset = cfg.center_offset_pulse
        curr_orient = cfg.orientation
        test_angle = 0.0

        # Move to 0° angle with current offset
        self.set_servo_angle_safe(servo_name, test_angle)

        while True:
            pulse_us = 1500.0 + curr_offset + (curr_orient * test_angle / 90.0) * (cfg.pulse_range / 2.0)
            approx_deg = curr_offset / (cfg.pulse_range / 180.0)

            print(f"\n[Status] Offset: {BOLD}{curr_offset:+d} µs{RESET} (~{approx_deg:+.1f}°) | Orient: {curr_orient:+d} | Winkel: {test_angle:.1f}° | Puls: {pulse_us:.0f} µs")
            print("  Befehle:")
            print("    [+] / [-]    : Offset ±50 µs (~±4.5°)")
            print("    [++] / [--]  : Offset ±10 µs (~±0.9°)")
            print("    [a <Winkel>] : Winkel anfahren (z.B. 'a 20' oder 'a -15')")
            print("    [o]          : Orientierung invertieren (+1 <-> -1)")
            print("    [0]          : Offset auf 0 zurücksetzen")
            print("    [s]          : Wert sofort in config.yaml & servos.yaml speichern")
            print("    [r]          : Servo stromlos (relax)")
            print("    [Enter]      : Fertig / Zurück zum Bein-Menü")

            try:
                cmd = input(f"{YELLOW}Trimm-Befehl > {RESET}").strip()
            except (KeyboardInterrupt, EOFError):
                break

            if cmd == "":
                break
            elif cmd == "+":
                curr_offset += 50
            elif cmd == "-":
                curr_offset -= 50
            elif cmd in ("++", "+10"):
                curr_offset += 10
            elif cmd in ("--", "-10"):
                curr_offset -= 10
            elif cmd == "0":
                curr_offset = 0
            elif cmd == "o":
                curr_orient = -1 if curr_orient == 1 else 1
                cfg.orientation = curr_orient
                servo.config.orientation = curr_orient
                print(f"  Orientierung geändert auf: {curr_orient}")
            elif cmd.startswith("a "):
                try:
                    val = float(cmd.split()[1])
                    test_angle = max(cfg.min_angle, min(cfg.max_angle, val))
                except ValueError:
                    print(f"  {RED}Ungültiger Winkelwert.{RESET}")
            elif cmd == "s":
                cfg.center_offset_pulse = curr_offset
                cfg.orientation = curr_orient
                success = update_servo_calibration(
                    servo_name=servo_name,
                    updates={
                        "center_offset_pulse": curr_offset,
                        "orientation": curr_orient,
                    }
                )
                if success:
                    print(f"  {GREEN}✔ Erfolgreich in config.yaml und servos.yaml gespeichert!{RESET}")
                else:
                    print(f"  {RED}✘ Fehler beim Schreiben der Konfigurationsdatei.{RESET}")
            elif cmd == "r":
                if hasattr(servo.driver, "relax_channel"):
                    servo.driver.relax_channel(cfg.channel)
                print("  Servo entspannt (PWM off).")
                continue
            else:
                print(f"  {RED}Unbekannter Befehl.{RESET}")

            # Update live configuration on servo object
            cfg.center_offset_pulse = curr_offset
            servo.config.center_offset_pulse = curr_offset
            self.set_servo_angle_safe(servo_name, test_angle)

    def leg_calibration_menu(self, leg_key: str, label: str) -> None:
        """Submenu for testing and calibrating a specific leg."""
        while True:
            c_name = f"{leg_key}_coxa"
            f_name = f"{leg_key}_femur"
            t_name = f"{leg_key}_tibia"

            c_cfg = self.servos[c_name].config
            f_cfg = self.servos[f_name].config
            t_cfg = self.servos[t_name].config

            dry_badge = f"{YELLOW}[TROCKENLAUF / NUR TWIN]{RESET} " if self.dry_run else f"{GREEN}[ECHTE HARDWARE AKTIV]{RESET} "

            print(f"\n{'=' * 65}")
            print(f"  {BOLD}Bein-Kalibrierung:{RESET} {CYAN}{label}{RESET} {dry_badge}")
            print(f"{'=' * 65}")
            print(f"  1. Hüfte (Coxa):       Ch {c_cfg.channel:2d} | Offset: {c_cfg.center_offset_pulse:+5d} µs | Orient: {c_cfg.orientation:+d} | Limits: [{c_cfg.min_angle}°, {c_cfg.max_angle}°]")
            print(f"  2. Oberschenkel (Femur):Ch {f_cfg.channel:2d} | Offset: {f_cfg.center_offset_pulse:+5d} µs | Orient: {f_cfg.orientation:+d} | Limits: [{f_cfg.min_angle}°, {f_cfg.max_angle}°]")
            print(f"  3. Unterschenkel (Tibia):Ch {t_cfg.channel:2d} | Offset: {t_cfg.center_offset_pulse:+5d} µs | Orient: {t_cfg.orientation:+d} | Limits: [{t_cfg.min_angle}°, {t_cfg.max_angle}°]")
            print(f"{'-' * 65}")
            print("  [1] Coxa trimmmen (Hüftschwenk)")
            print("  [2] Femur trimmen (Oberschenkel Hub)")
            print("  [3] Tibia trimmen (Unterschenkel Knie)")
            print("  [4] Sanfte Neutralstellung anfahren (IK-Stance)")
            print("  [5] 50-Hz-Harmonic-Schrittzyklus testen (5 Zyklen)")
            print("  [6] Sanfter Min-Max-Sweep (Kollisionstest für ein Gelenk)")
            print("  [d] Trockenlauf umschalten (Dry-Run an/aus)")
            print("  [s] Alle Offsets dieses Beins fest in config.yaml sichern")
            print("  [r] Dieses Bein stromlos schalten (relax)")
            print("  [b] Zurück zum Hauptmenü")

            try:
                choice = input(f"{YELLOW}Wähle Option [1-6/d/s/r/b] > {RESET}").strip().lower()
            except (KeyboardInterrupt, EOFError):
                break

            if choice == "b":
                break
            elif choice == "1":
                self.interactive_joint_trim(c_name)
            elif choice == "2":
                self.interactive_joint_trim(f_name)
            elif choice == "3":
                self.interactive_joint_trim(t_name)
            elif choice == "4":
                self.run_smooth_stance(leg_key, duration=1.0)
            elif choice == "5":
                self.run_harmonic_cycles(leg_key, cycles=5)
            elif choice == "6":
                print("\nWelches Gelenk soll gesweept werden?")
                print("  [1] Coxa (Hüfte)")
                print("  [2] Femur (Oberschenkel)")
                print("  [3] Tibia (Unterschenkel)")
                sub = input("Auswahl [1-3] > ").strip()
                if sub == "1":
                    self.run_joint_sweep(c_name)
                elif sub == "2":
                    self.run_joint_sweep(f_name)
                elif sub == "3":
                    self.run_joint_sweep(t_name)
            elif choice == "d":
                self.dry_run = not self.dry_run
                state = "AKTIVIERT (Nur Twin)" if self.dry_run else "DEAKTIVIERT (Echte Servos)"
                print(f"  Trockenlauf ist nun {BOLD}{state}{RESET}.")
                if self.dry_run:
                    self.relax_leg(leg_key)
            elif choice == "s":
                for sname in [c_name, f_name, t_name]:
                    s = self.servos[sname]
                    update_servo_calibration(
                        servo_name=sname,
                        updates={
                            "center_offset_pulse": s.config.center_offset_pulse,
                            "orientation": s.config.orientation,
                        }
                    )
                print(f"  {GREEN}✔ Alle Offsets für '{leg_key}' gespeichert!{RESET}")
            elif choice == "r":
                self.relax_leg(leg_key)
                print(f"  {GREEN}Bein '{leg_key}' ist stromlos.{RESET}")

    def main_menu(self) -> None:
        """Main interaction loop."""
        while True:
            dry_badge = f"{YELLOW}[TROCKENLAUF / NUR TWIN]{RESET}" if self.dry_run else f"{GREEN}[ECHTE HARDWARE AKTIV]{RESET}"

            print(f"\n{'=' * 65}")
            print(f"  {BOLD}Lasius Hexapod - Interaktive Setup- & Kalibrier-Routine{RESET}")
            print(f"  Status: {dry_badge}")
            if self.visualizer:
                print(f"  {GREEN}🌐 3D Digital Twin live erreichbar:{RESET} http://0.0.0.0:{self.visualizer.http_port} (oder Pi-IP:8000)")
            print(f"{'=' * 65}")
            print("  Wähle das zu testende / kalibrierende Bein:")
            for idx, (leg_key, label, _, board, chs) in enumerate(LEG_CHOICES, start=1):
                cal_note = " [Kalibriert]" if leg_key == "left_rear" else ""
                print(f"  [{idx}] {label:28s} (Board 0x{board:02X}, Ch {chs[0]},{chs[1]},{chs[2]}){cal_note}")
            print(f"{'-' * 65}")
            print("  [d] Trockenlauf umschalten (Dry-Run an/aus)")
            print("  [r] Alle Servos aller Beine sofort stromlos (relax all)")
            print("  [q] Beenden")

            try:
                choice = input(f"{YELLOW}Auswahl [1-6/d/r/q] > {RESET}").strip().lower()
            except (KeyboardInterrupt, EOFError):
                break

            if choice == "q":
                break
            elif choice == "d":
                self.dry_run = not self.dry_run
                state = "AKTIVIERT (Nur Twin)" if self.dry_run else "DEAKTIVIERT (Echte Servos)"
                print(f"  Trockenlauf ist nun {BOLD}{state}{RESET}.")
                if self.dry_run:
                    self.relax_all_servos()
            elif choice == "r":
                self.relax_all_servos()
                print(f"  {GREEN}Alle Servos entspannt.{RESET}")
            elif choice in [str(i) for i in range(1, len(LEG_CHOICES) + 1)]:
                idx = int(choice) - 1
                leg_key, label, _, _, _ = LEG_CHOICES[idx]
                self.leg_calibration_menu(leg_key, label)


def main():
    parser = argparse.ArgumentParser(description="Lasius Hexapod Interaktive Setup- & Kalibrier-Routine")
    parser.add_argument("--hardware", action="store_true", help="Echte PCA9685 I2C-Treiber ansteuern.")
    parser.add_argument("--dry-run", action="store_true", help="Startet im Trockenlauf (nur Digital Twin, keine Servobewegung).")
    parser.add_argument("--no-visualize", action="store_true", help="Digital Twin Webserver nicht starten.")
    parser.add_argument("--i2c-bus", type=int, default=1, help="I2C Busnummer (Standard: 1).")
    parser.add_argument("--port", type=int, default=8000, help="HTTP Port für 3D-Visualizer (Standard: 8000).")
    parser.add_argument("--ws-port", type=int, default=8765, help="WebSocket Port für 3D-Visualizer (Standard: 8765).")
    parser.add_argument("--leg", type=str, choices=[l[0] for l in LEG_CHOICES], help="Gezielt ein Bein auswählen (z.B. left_rear).")
    parser.add_argument("--action", type=str, choices=["stance", "step", "sweep", "relax"], help="Direkte Aktion ausführen.")
    parser.add_argument("--cycles", type=int, default=5, help="Anzahl der Zyklen für --action step (Standard: 5).")
    parser.add_argument("--hold", type=float, default=5.0, help="Haltezeit in Sekunden für --action stance (Standard: 5.0).")
    args = parser.parse_args()

    # Load configuration
    cfg_path = PROJECT_ROOT / "src/lasius/core/config.yaml"
    config = load_config(cfg_path)

    # Initialize Visualizer
    visualizer = None
    if not args.no_visualize:
        try:
            visualizer = VisualizerServer(host="0.0.0.0", http_port=args.port, ws_port=args.ws_port)
            print(f"[Visualizer] Gestartet auf http://0.0.0.0:{args.port} (WebSocket: {args.ws_port})")
        except Exception as e:
            print(f"[WARN] Visualizer konnte nicht gestartet werden: {e}")

    # Initialize Drivers
    drivers: Dict[int, PWMDriverProtocol] = {}
    if args.hardware:
        if not HAS_SMBUS:
            print(f"{RED}[ERROR] smbus2 ist nicht installiert. Nutze 'pip install smbus2'.{RESET}")
            sys.exit(1)
        try:
            shared_bus = smbus2.SMBus(args.i2c_bus)
            drivers = {
                0x40: RealPCA9685Driver(address=0x40, bus_instance=shared_bus, visualizer_server=visualizer),
                0x42: RealPCA9685Driver(address=0x42, bus_instance=shared_bus, visualizer_server=visualizer),
            }
            print(f"[Hardware] RealPCA9685Driver initialisiert an I2C Bus {args.i2c_bus} (0x40 & 0x42).")
        except Exception as e:
            print(f"{RED}[ERROR] I2C Hardware-Initialisierung fehlgeschlagen: {e}{RESET}")
            sys.exit(1)
    else:
        drivers = {
            0x40: MockPWMDriver(visualizer_server=visualizer),
            0x42: MockPWMDriver(visualizer_server=visualizer),
        }
        print(f"[Simulation] Verwende MockPWMDriver (Trockenlauf / Simulation).")

    # Start Visualizer thread with robot layout
    if visualizer is not None:
        from lasius.core.robot import Hexapod
        dummy_bot = Hexapod(config=config, drivers=drivers)

    tool = CalibrationTool(
        config=config,
        drivers=drivers,
        visualizer=visualizer,
        dry_run=args.dry_run,
    )

    try:
        # Ensure all servos start relaxed
        tool.relax_all_servos()

        if args.leg and args.action:
            label = next(l[1] for l in LEG_CHOICES if l[0] == args.leg)
            print(f"\n{BOLD}Führe direkte Aktion '{args.action}' für '{label}' aus...{RESET}")
            if args.action == "stance":
                tool.run_smooth_stance(args.leg, duration=1.0)
                print(f"Halte Position für {args.hold} Sekunden (3D-Visualizer aktiv auf Port {args.port})...")
                time.sleep(args.hold)
            elif args.action == "step":
                tool.run_harmonic_cycles(args.leg, cycles=args.cycles)
            elif args.action == "sweep":
                for j in ["coxa", "femur", "tibia"]:
                    tool.run_joint_sweep(f"{args.leg}_{j}")
            elif args.action == "relax":
                tool.relax_leg(args.leg)
        else:
            tool.main_menu()
    finally:
        print("\nBeende Kalibrierungs-Tool...")
        tool.relax_all_servos()
        if visualizer is not None:
            visualizer.stop()
        print("Alle Servos stromlos geschaltet. Auf Wiedersehen!")


if __name__ == "__main__":
    main()
