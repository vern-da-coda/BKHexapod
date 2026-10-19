"""
The main module for controlling the entire hexapod robot.
"""

import time
from typing import List, Dict, Type, Tuple, Optional

from bkhexapod.config import HexapodConfig, load_config
from bkhexapod.servos import Servo, PWMDriverProtocol
from bkhexapod.drivers import MockPWMDriver, RealPCA9685Driver
from bkhexapod.leg import Leg, Joint, BodySide, LegRow, LegIdentifier
from bkhexapod.gait import GaitProtocol, TripodGait, OmniGait
from bkhexapod.visualizer.server import VisualizerServer


class Hexapod:
    """
    The central control class for the hexapod robot.
    """
    def __init__(self, config: HexapodConfig, drivers: Dict[int, PWMDriverProtocol]):
        print("Initializing Hexapod...")
        self.config = config
        self.gait_engine: Optional[GaitProtocol] = None
        self.drivers = drivers
        self.visualizer: Optional[VisualizerServer] = self._get_visualizer_from_drivers()

        all_servos = [Servo(config=sc, driver=self.drivers[sc.board_address]) for sc in self.config.servos]
        servos_by_leg = self._group_servos_by_leg(all_servos)

        # Physical leg dimensions loaded from config
        coxa_len = self.config.geometry.limbs.coxa
        femur_len = self.config.geometry.limbs.femur
        tibia_len = self.config.geometry.limbs.tibia

        self.legs: Dict[Tuple[BodySide, LegRow], Leg] = {}
        for name, servos in servos_by_leg.items():
            side_str, row_str = name.split("_")
            side = BodySide(side_str)
            row = LegRow(row_str)

            coxa_joint = Joint(servo=servos['coxa'], length=coxa_len)
            femur_joint = Joint(servo=servos['femur'], length=femur_len)
            tibia_joint = Joint(servo=servos['tibia'], length=tibia_len)

            self.legs[(side, row)] = Leg(
                side=side, row=row, coxa=coxa_joint, femur=femur_joint, tibia=tibia_joint
            )
        print(f"Hexapod initialized with {len(self.legs)} legs (Coxa: {coxa_len}mm, Femur: {femur_len}mm, Tibia: {tibia_len}mm).")
        
        if self.visualizer:
            self.visualizer.start(self)

    def _get_visualizer_from_drivers(self) -> Optional[VisualizerServer]:
        for driver in self.drivers.values():
            if hasattr(driver, 'visualizer_server') and driver.visualizer_server:
                return driver.visualizer_server
        return None

    def set_gait(self, gait: GaitProtocol) -> None:
        print(f"Switching to gait: {gait.__class__.__name__}")
        if hasattr(gait, "apply_geometry"):
            gait.apply_geometry(self.config.geometry)
        self.gait_engine = gait

    def tick(self) -> None:
        if not self.gait_engine:
            return
        leg_positions = self.gait_engine.tick()
        
        for leg_id, coords in leg_positions.items():
            self.move_leg_tip(leg_id, *coords)

        if self.visualizer:
            all_updates = {}
            for driver in self.drivers.values():
                if hasattr(driver, 'get_and_clear_angle_updates'):
                    all_updates.update(driver.get_and_clear_angle_updates())
            
            if all_updates:
                self.visualizer.send_angles_update(all_updates)

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
