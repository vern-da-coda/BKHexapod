"""
The main module for controlling the entire hexapod robot.

This module contains the `Hexapod` class, which serves as the central API for
controlling the robot, as well as mock implementations for testing
without real hardware.
"""

import time
from typing import List, Dict, Type, Tuple, Optional

from bkhexapod.config import HexapodConfig, load_config
from bkhexapod.servos import Servo, PWMDriverProtocol
from bkhexapod.leg import Leg, Joint, BodySide, LegRow, LegIdentifier
from bkhexapod.gait import GaitProtocol, TripodGait
from bkhexapod.visualizer.server import VisualizerServer

class MockPWMDriver(PWMDriverProtocol):
    """
    A simulated PWM driver used for tests without real hardware.

    Optionally, it can send updates to a visualizer server.
    """
    def __init__(self, num_channels: int = 16, visualizer_server: Optional[VisualizerServer] = None):
        self.channels = [0] * num_channels
        self.visualizer_server = visualizer_server
        print(f"MockPWMDriver with {num_channels} channels initialized.")

    def set_pwm(self, channel: int, on: int, off: int) -> None:
        self.channels[channel] = off
        if self.visualizer_server:
            try:
                pulse_width = off * (1_000_000 / 50) / 4096
                angle = (pulse_width - 1500) / (2000 / 2.0) * 90.0
                self.visualizer_server.send_update(channel, angle)
            except Exception:
                pass # Ignore errors during visualization updates

    def set_pwm_freq(self, freq: float) -> None:
        print(f"[MockPWMDriver] Setting PWM frequency to {freq} Hz")


class Hexapod:
    """
    The central control class for the hexapod robot.
    """
    def __init__(self, config: HexapodConfig, drivers: Dict[int, PWMDriverProtocol]):
        print("Initializing Hexapod...")
        self.config = config
        self.gait_engine: Optional[GaitProtocol] = None
        self.drivers = drivers

        all_servos = [Servo(config=sc, driver=self.drivers[sc.board_address]) for sc in self.config.servos]
        servos_by_leg = self._group_servos_by_leg(all_servos)

        self.legs: Dict[Tuple[BodySide, LegRow], Leg] = {}
        for name, servos in servos_by_leg.items():
            side_str, row_str = name.split("_")
            side = BodySide(side_str)
            row = LegRow(row_str)

            coxa_joint = Joint(servo=servos['coxa'], length=52.0)
            femur_joint = Joint(servo=servos['femur'], length=70.0)
            tibia_joint = Joint(servo=servos['tibia'], length=135.0)

            self.legs[(side, row)] = Leg(
                side=side, row=row, coxa=coxa_joint, femur=femur_joint, tibia=tibia_joint
            )
        print(f"Hexapod initialized with {len(self.legs)} legs.")

    def set_gait(self, gait: GaitProtocol) -> None:
        print(f"Switching to gait: {gait.__class__.__name__}")
        self.gait_engine = gait

    def tick(self) -> None:
        if not self.gait_engine:
            return
        leg_positions = self.gait_engine.tick()
        for leg_id, coords in leg_positions.items():
            self.move_leg_tip(leg_id, *coords)

    @staticmethod
    def _group_servos_by_leg(servos: List[Servo]) -> Dict[str, Dict[str, Servo]]:
        grouped = {}
        for servo in servos:
            parts = servo.config.name.split("_")
            leg_name = f"{parts[0]}_{parts[1]}"
            joint_type = parts[2]
            if leg_name not in grouped:
                grouped[leg_name] = {}
            grouped[leg_name][joint_type] = servo
        return grouped

    def move_leg_tip(self, leg_id: LegIdentifier, x: float, y: float, z: float) -> None:
        key = leg_id.value
        if key in self.legs:
            self.legs[key].move_tip_to(x, y, z)
