"""
Central Hexapod Robot Coordinator (`lasius.core.robot`).

Purpose & Role:
    Provides the `Hexapod` aggregate root class that binds physical configuration
    (`HexapodConfig`), I2C/mock PWM drivers (`PWMDriverProtocol`), the six 3-DOF
    legs (`Leg`), the 50 Hz walking gait engine (`GaitProtocol`), and the
    telemetry/control server (`LasiusServer` / `OrderDispatcher`).

Classes:
    - `Hexapod`:
        * Instantiates all 18 `Servo` objects and groups them into 6 `Leg` instances.
        * Executes the 50 Hz locomotion step in `tick()` when `locomotion_active` is True,
          computing inverse kinematics for all 6 legs and streaming live joint angles
          to connected WebSocket clients.
        * Arbitrates safe disengagement (`relax_all()`, `locomotion_active = False`)
          so isolated single-leg calibration and test routines are never overwritten.
"""

import time
from typing import List, Dict, Type, Tuple, Optional, Any

from lasius.core.config import HexapodConfig, load_config
from lasius.core.hardware import Servo, PWMDriverProtocol, MockPWMDriver, RealPCA9685Driver
from lasius.core.motion import Leg, Joint, BodySide, LegRow, LegIdentifier, GaitProtocol, TripodGait, OmniGait
from lasius.core.control import OrderDispatcher
from lasius.core.server import VisualizerServer


class Hexapod:
    """
    The central control class for the hexapod robot.
    """
    def __init__(self, config: HexapodConfig, drivers: Dict[int, PWMDriverProtocol]):
        print("Initializing Hexapod...")
        self.config = config
        self.gait_engine: Optional[GaitProtocol] = None
        self.locomotion_active: bool = False
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
            self.dispatcher = self.visualizer.dispatcher
            self.dispatcher.set_robot(self)
            self.visualizer.start(self)
        else:
            self.dispatcher = OrderDispatcher(robot=self)

    def _get_visualizer_from_drivers(self) -> Optional[VisualizerServer]:
        for driver in self.drivers.values():
            if hasattr(driver, 'visualizer_server') and driver.visualizer_server:
                return driver.visualizer_server
        return None

    def set_gait(self, gait: GaitProtocol, engage: bool = True) -> None:
        print(f"Switching to gait: {gait.__class__.__name__}")
        if hasattr(gait, "apply_geometry"):
            gait.apply_geometry(self.config.geometry)
        self.gait_engine = gait
        self.locomotion_active = engage

    def tick(self) -> None:
        if not self.gait_engine or not self.locomotion_active:
            return
        if self.visualizer and self.visualizer.is_paused:
            return
        if self.dispatcher and self.dispatcher.active_order is not None:
            if self.dispatcher.active_order.action.value in (
                "test_leg",
                "stance_leg",
                "sweep_joint",
                "wave_hello",
            ):
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

    def relax_all(self) -> None:
        """Relaxes all servos across all drivers and disengages locomotion."""
        self.locomotion_active = False
        for d in self.drivers.values():
            if hasattr(d, "relax_all"):
                d.relax_all()

    def get_servo(self, servo_name: str) -> Optional[Servo]:
        """Finds and returns the Servo instance by its configured name."""
        for leg in self.legs.values():
            for joint in (leg.coxa, leg.femur, leg.tibia):
                if joint.servo.config.name == servo_name:
                    return joint.servo
        return None

    def get_calibration(self) -> Dict[str, Dict[str, Any]]:
        """Returns the current runtime calibration settings for all 18 servos."""
        res = {}
        for leg in self.legs.values():
            for joint in (leg.coxa, leg.femur, leg.tibia):
                sc = joint.servo.config
                res[sc.name] = {
                    "name": sc.name,
                    "channel": sc.channel,
                    "board_address": sc.board_address,
                    "center_offset_pulse": sc.center_offset_pulse,
                    "orientation": sc.orientation,
                    "min_angle": sc.min_angle,
                    "max_angle": sc.max_angle,
                    "pulse_range": sc.pulse_range,
                    "current_angle": joint.servo.current_angle,
                }
        return res

    def apply_servo_calibration(
        self,
        servo_name: str,
        updates: Dict[str, Any],
        live_angle: Optional[float] = None
    ) -> bool:
        """
        Updates calibration parameters on an active servo in memory and immediately re-actuates it.
        """
        servo = self.get_servo(servo_name)
        if not servo:
            return False

        if "center_offset_pulse" in updates and updates["center_offset_pulse"] is not None:
            servo.config.center_offset_pulse = int(updates["center_offset_pulse"])
        elif "offset" in updates and updates["offset"] is not None:
            servo.config.center_offset_pulse = int(updates["offset"])

        if "orientation" in updates and updates["orientation"] is not None:
            servo.config.orientation = int(updates["orientation"])

        if "min_angle" in updates and updates["min_angle"] is not None:
            servo.config.min_angle = float(updates["min_angle"])

        if "max_angle" in updates and updates["max_angle"] is not None:
            servo.config.max_angle = float(updates["max_angle"])

        if "pulse_range" in updates and updates["pulse_range"] is not None:
            servo.config.pulse_range = int(updates["pulse_range"])

        # Re-actuate servo so user sees immediate physical movement
        target_angle = live_angle if live_angle is not None else servo.current_angle
        if target_angle is not None:
            servo.set_angle(target_angle)
            if self.visualizer:
                self.visualizer.send_angles_update({servo_name: target_angle})

        return True

    def reset_servo_to_factory(self, servo_name: Optional[str] = None) -> bool:
        """
        Reverts in-memory servo configurations back to factory config.yaml defaults.
        If servo_name is None, reverts all servos.
        """
        base_cfg = load_config(apply_overlay=False)
        base_by_name = {sc.name: sc for sc in base_cfg.servos}
        targets = [servo_name] if servo_name else list(base_by_name.keys())

        for name in targets:
            servo = self.get_servo(name)
            if servo and name in base_by_name:
                orig = base_by_name[name]
                servo.config.center_offset_pulse = orig.center_offset_pulse
                servo.config.orientation = orig.orientation
                servo.config.min_angle = orig.min_angle
                servo.config.max_angle = orig.max_angle
                servo.config.pulse_range = orig.pulse_range
                if servo.current_angle is not None:
                    servo.set_angle(servo.current_angle)
                    if self.visualizer:
                        self.visualizer.send_angles_update({name: servo.current_angle})
        return True
