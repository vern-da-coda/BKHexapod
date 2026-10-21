"""
Order Dispatcher and Task Execution Pipeline for Lasius Hexapod Control Layer.
"""

from collections import deque
import math
import threading
import time
from typing import Any, Deque, Dict, Optional, TYPE_CHECKING

from lasius.core.config import update_servo_calibration
from lasius.core.motion.leg import BodySide, LegRow
from .orders import Order, OrderAction, OrderPriority, OrderResult, OrderStatus

if TYPE_CHECKING:
    from lasius.core.robot import Hexapod
    from lasius.core.server.app import LasiusServer


class OrderDispatcher:
    """
    Central command dispatcher for Lasius Hexapod.
    Validates, arbitrates, and executes incoming orders from REST, WebSocket, or local controllers.
    """
    def __init__(self, robot: Optional["Hexapod"] = None, server: Optional["LasiusServer"] = None):
        self.robot = robot
        self.server = server
        self.active_order: Optional[Order] = None
        self.order_history: Deque[OrderResult] = deque(maxlen=50)
        self._cancel_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def set_robot(self, robot: "Hexapod") -> None:
        """Attaches the robot instance."""
        self.robot = robot

    def set_server(self, server: "LasiusServer") -> None:
        """Attaches the server instance."""
        self.server = server

    def dispatch(self, order: Order) -> OrderResult:
        """
        Main entry point for handling an Order.
        """
        start_t = time.perf_counter()

        # 1. Emergency Stop (Priority 99 - Immediate Bypass)
        if order.action == OrderAction.EMERGENCY_STOP:
            return self._handle_emergency_stop(order, start_t)

        # 2. Relax All (Immediate Hardware Safe State)
        if order.action == OrderAction.RELAX_ALL:
            return self._handle_relax_all(order, start_t)

        # 3. Synchronous / Immediate Commands
        if order.action in [
            OrderAction.SET_VELOCITY,
            OrderAction.SET_WALK,
            OrderAction.SET_TURN,
            OrderAction.STOP,
            OrderAction.STOP_MOTION,
            OrderAction.PAUSE,
            OrderAction.RESUME,
            OrderAction.TOGGLE_PAUSE,
            OrderAction.SET_GAIT,
            OrderAction.SET_GAIT_TYPE,
            OrderAction.SET_SPEED,
            OrderAction.SET_STEP_HEIGHT,
            OrderAction.SET_STEP_LENGTH,
            OrderAction.SET_POSE,
            OrderAction.SET_HEIGHT,
            OrderAction.SET_ROLL,
            OrderAction.SET_PITCH,
            OrderAction.RESET_POSE,
            OrderAction.CALIBRATE_TRIM,
            OrderAction.CALIBRATE_SAVE,
            OrderAction.RELAX_LEG,
            OrderAction.SET_JOINT_ANGLE,
            OrderAction.SET_SERVO_ANGLE,
            OrderAction.SET_LEG_JOINTS,
        ]:
            return self._handle_immediate_command(order, start_t)

        # 4. Asynchronous Sequential Tasks (Test Leg, Stance Leg, Sweep)
        if order.action in [
            OrderAction.TEST_LEG,
            OrderAction.STANCE_LEG,
            OrderAction.SWEEP_JOINT,
        ]:
            return self._handle_async_sequence(order, start_t)

        return OrderResult(
            order_id=order.order_id,
            action=order.action.value,
            status=OrderStatus.FAILED,
            error=f"Unhandled OrderAction: '{order.action.value}'",
            duration_ms=(time.perf_counter() - start_t) * 1000.0,
        )

    def _handle_emergency_stop(self, order: Order, start_t: float) -> OrderResult:
        """Cancels any running sequence and immediately relaxes all 18 servos."""
        self._cancel_event.set()
        with self._lock:
            self.active_order = None

        # Stop locomotion vectors
        if self.server:
            self.server.walk_x = 0.0
            self.server.walk_y = 0.0
            self.server.turn_z = 0.0
            self.server.is_paused = True
            self.server.broadcast_control_state()

        # Hardware full relaxation
        if self.robot:
            for d in self.robot.drivers.values():
                if hasattr(d, "relax_all"):
                    d.relax_all()

        res = OrderResult(
            order_id=order.order_id,
            action=order.action.value,
            status=OrderStatus.COMPLETED,
            message="EMERGENCY STOP ACTIVATED: All motions halted and all servos relaxed.",
            duration_ms=(time.perf_counter() - start_t) * 1000.0,
        )
        self.order_history.append(res)
        if self.server and hasattr(self.server, "broadcast_order_result"):
            self.server.broadcast_order_result(res)
        return res

    def _handle_relax_all(self, order: Order, start_t: float) -> OrderResult:
        """Relaxes all servos across all boards."""
        self._cancel_event.set()
        if self.robot:
            for d in self.robot.drivers.values():
                if hasattr(d, "relax_all"):
                    d.relax_all()

        res = OrderResult(
            order_id=order.order_id,
            action=order.action.value,
            status=OrderStatus.COMPLETED,
            message="All 18 servos relaxed (PWM disabled).",
            duration_ms=(time.perf_counter() - start_t) * 1000.0,
        )
        self.order_history.append(res)
        if self.server and hasattr(self.server, "broadcast_order_result"):
            self.server.broadcast_order_result(res)
        return res

    def _handle_immediate_command(self, order: Order, start_t: float) -> OrderResult:
        """Applies state changes immediately to server & robot locomotion."""
        p = order.params
        srv = self.server

        if order.action in (OrderAction.STOP, OrderAction.STOP_MOTION):
            if srv:
                srv.walk_x = 0.0
                srv.walk_y = 0.0
                srv.turn_z = 0.0
        elif order.action == OrderAction.SET_VELOCITY:
            if srv:
                srv.walk_x = float(p.get("walk_x", p.get("x", srv.walk_x)))
                srv.walk_y = float(p.get("walk_y", p.get("y", srv.walk_y)))
                srv.turn_z = float(p.get("turn_z", p.get("z", srv.turn_z)))
        elif order.action == OrderAction.SET_WALK:
            if srv:
                srv.walk_x = float(p.get("x", srv.walk_x))
                srv.walk_y = float(p.get("y", srv.walk_y))
        elif order.action == OrderAction.SET_TURN:
            if srv:
                srv.turn_z = float(p.get("z", srv.turn_z))
        elif order.action == OrderAction.PAUSE:
            if srv:
                srv.is_paused = True
        elif order.action == OrderAction.RESUME:
            if srv:
                srv.is_paused = False
        elif order.action == OrderAction.TOGGLE_PAUSE:
            if srv:
                srv.is_paused = not srv.is_paused
        elif order.action in (OrderAction.SET_GAIT, OrderAction.SET_GAIT_TYPE):
            val = str(p.get("value", p.get("gait", "tripod"))).lower()
            if srv and val in ["tripod", "ripple", "wave"]:
                srv.gait_type = val
        elif order.action == OrderAction.SET_SPEED:
            if srv:
                srv.gait_speed = max(0.1, min(5.0, round(float(p.get("value", 1.0)), 2)))
        elif order.action == OrderAction.SET_STEP_HEIGHT:
            if srv:
                srv.step_height = max(5.0, min(80.0, round(float(p.get("value", 30.0)), 1)))
        elif order.action == OrderAction.SET_STEP_LENGTH:
            if srv:
                srv.step_length = max(10.0, min(100.0, round(float(p.get("value", 50.0)), 1)))
        elif order.action == OrderAction.SET_POSE:
            if srv:
                srv.body_height = float(p.get("height", srv.body_height))
                srv.body_roll = float(p.get("roll", srv.body_roll))
                srv.body_pitch = float(p.get("pitch", srv.body_pitch))
        elif order.action == OrderAction.SET_HEIGHT:
            if srv:
                srv.body_height = max(-120.0, min(-40.0, round(float(p.get("value", -80.0)), 1)))
        elif order.action == OrderAction.SET_ROLL:
            if srv:
                srv.body_roll = max(-25.0, min(25.0, round(float(p.get("value", 0.0)), 1)))
        elif order.action == OrderAction.SET_PITCH:
            if srv:
                srv.body_pitch = max(-25.0, min(25.0, round(float(p.get("value", 0.0)), 1)))
        elif order.action == OrderAction.RESET_POSE:
            if srv:
                srv.body_height = -80.0
                srv.body_roll = 0.0
                srv.body_pitch = 0.0
        elif order.action == OrderAction.RELAX_LEG:
            leg_name = str(p.get("leg", ""))
            self._relax_single_leg(leg_name)
        elif order.action in (OrderAction.SET_JOINT_ANGLE, OrderAction.SET_SERVO_ANGLE):
            servo_name = str(p.get("servo", ""))
            try:
                angle = float(p.get("angle", 0.0))
            except (ValueError, TypeError):
                angle = 0.0
            if self.robot and servo_name:
                for leg in self.robot.legs.values():
                    for joint in [leg.coxa, leg.femur, leg.tibia]:
                        if joint.servo.config.name == servo_name:
                            joint.servo.set_angle(angle)
                            if self.server:
                                self.server.send_angles_update({servo_name: angle})
                            break
        elif order.action == OrderAction.SET_LEG_JOINTS:
            leg_name = str(p.get("leg", ""))
            leg = self._get_leg(leg_name)
            if leg:
                angles_update = {}
                for j_name, joint in [("coxa", leg.coxa), ("femur", leg.femur), ("tibia", leg.tibia)]:
                    if j_name in p:
                        try:
                            a = float(p[j_name])
                            joint.servo.set_angle(a)
                            angles_update[joint.servo.config.name] = a
                        except (ValueError, TypeError):
                            pass
                if self.server and angles_update:
                    self.server.send_angles_update(angles_update)
        elif order.action == OrderAction.CALIBRATE_TRIM:
            self._apply_trim(p)
        elif order.action == OrderAction.CALIBRATE_SAVE:
            self._save_trim(p)

        if srv:
            srv.broadcast_control_state()

        res = OrderResult(
            order_id=order.order_id,
            action=order.action.value,
            status=OrderStatus.COMPLETED,
            message="Command applied successfully.",
            duration_ms=(time.perf_counter() - start_t) * 1000.0,
        )
        self.order_history.append(res)
        return res

    def _handle_async_sequence(self, order: Order, start_t: float) -> OrderResult:
        """Launches an isolated leg routine in a worker thread."""
        with self._lock:
            if self.active_order is not None and self._worker_thread and self._worker_thread.is_alive():
                return OrderResult(
                    order_id=order.order_id,
                    action=order.action.value,
                    status=OrderStatus.FAILED,
                    error=f"Robot is busy executing order '{self.active_order.action.value}' (ID: {self.active_order.order_id}).",
                    duration_ms=(time.perf_counter() - start_t) * 1000.0,
                )
            self._cancel_event.clear()
            self.active_order = order

        if self.server and hasattr(self.server, "broadcast_order_status"):
            self.server.broadcast_order_status(order.order_id, order.action.value, OrderStatus.RUNNING)

        def _worker():
            res_status = OrderStatus.COMPLETED
            res_msg = "Sequence completed successfully."
            res_err = None
            seq_start = time.perf_counter()

            try:
                if order.action == OrderAction.TEST_LEG:
                    self._execute_test_leg(order)
                elif order.action == OrderAction.STANCE_LEG:
                    self._execute_stance_leg(order)
                elif order.action == OrderAction.SWEEP_JOINT:
                    self._execute_sweep_joint(order)
            except Exception as e:
                res_status = OrderStatus.FAILED
                res_err = str(e)
                res_msg = f"Exception during sequence: {e}"

            if self._cancel_event.is_set():
                res_status = OrderStatus.CANCELLED
                res_msg = "Sequence was cancelled early."

            with self._lock:
                self.active_order = None

            result = OrderResult(
                order_id=order.order_id,
                action=order.action.value,
                status=res_status,
                message=res_msg,
                error=res_err,
                duration_ms=(time.perf_counter() - seq_start) * 1000.0,
            )
            self.order_history.append(result)
            if self.server and hasattr(self.server, "broadcast_order_result"):
                self.server.broadcast_order_result(result)

        self._worker_thread = threading.Thread(
            target=_worker,
            name=f"OrderWorker-{order.action.value}",
            daemon=True
        )
        self._worker_thread.start()

        return OrderResult(
            order_id=order.order_id,
            action=order.action.value,
            status=OrderStatus.RUNNING,
            message=f"Order '{order.action.value}' started.",
            duration_ms=(time.perf_counter() - start_t) * 1000.0,
        )

    def _execute_test_leg(self, order: Order) -> None:
        """Executes smooth harmonic test cycles on an isolated leg."""
        if not self.robot:
            raise RuntimeError("Hexapod robot instance not available.")

        p = order.params
        leg_name = str(p.get("leg", "left_rear"))
        cycles = int(p.get("cycles", 5))
        stride = float(p.get("stride", 36.0))
        lift = float(p.get("lift", 30.0))

        leg = self._get_leg(leg_name)
        if not leg:
            raise ValueError(f"Leg '{leg_name}' not found on hexapod.")

        # Safety: Relax all servos on all boards first
        for d in self.robot.drivers.values():
            if hasattr(d, "relax_all"):
                d.relax_all()

        stride_half = stride / 2.0
        z_ground = -80.0
        x_rad = 160.0
        steps_per_cycle = 50
        dt = 0.020

        c_name = leg.coxa.servo.config.name
        f_name = leg.femur.servo.config.name
        t_name = leg.tibia.servo.config.name

        # Calculate target stance angles
        tgt_c, tgt_f, tgt_t = leg._calculate_inverse_kinematics(x_rad, 0.0, z_ground)

        # 1. Smooth cosine entry to stance
        entry_steps = 35
        for s in range(1, entry_steps + 1):
            if self._cancel_event.is_set():
                return
            alpha = 0.5 * (1.0 - math.cos(math.pi * (s / entry_steps)))
            cur_c = alpha * tgt_c
            cur_f = alpha * tgt_f
            cur_t = alpha * tgt_t
            leg.coxa.servo.set_angle(cur_c)
            leg.femur.servo.set_angle(cur_f)
            leg.tibia.servo.set_angle(cur_t)
            if self.server:
                self.server.send_angles_update({c_name: cur_c, f_name: cur_f, t_name: cur_t})
            time.sleep(dt)

        time.sleep(0.2)

        # 2. Execute harmonic step cycles
        for cycle in range(1, cycles + 1):
            for s in range(steps_per_cycle):
                if self._cancel_event.is_set():
                    return
                phase = s / float(steps_per_cycle)
                if phase < 0.5:
                    p_norm = phase / 0.5
                    y = -stride_half * math.cos(p_norm * math.pi)
                    z = z_ground + lift * math.sin(p_norm * math.pi)
                else:
                    p_norm = (phase - 0.5) / 0.5
                    y = stride_half * math.cos(p_norm * math.pi)
                    z = z_ground

                c_deg, f_deg, t_deg = leg._calculate_inverse_kinematics(x_rad, y, z)
                leg.coxa.servo.set_angle(c_deg)
                leg.femur.servo.set_angle(f_deg)
                leg.tibia.servo.set_angle(t_deg)
                if self.server:
                    self.server.send_angles_update({c_name: c_deg, f_name: f_deg, t_name: t_deg})
                time.sleep(dt)

        # 3. Brief hold at stance
        for _ in range(20):
            if self._cancel_event.is_set():
                return
            time.sleep(dt)

        # 4. Safely relax this leg
        leg.relax()

    def _execute_stance_leg(self, order: Order) -> None:
        """Moves an isolated leg smoothly to its neutral stance position."""
        if not self.robot:
            raise RuntimeError("Hexapod robot instance not available.")

        leg_name = str(order.params.get("leg", "left_rear"))
        hold = float(order.params.get("hold", 5.0))
        leg = self._get_leg(leg_name)
        if not leg:
            raise ValueError(f"Leg '{leg_name}' not found.")

        # Relax all first
        for d in self.robot.drivers.values():
            if hasattr(d, "relax_all"):
                d.relax_all()

        x_rad, z_ground = 160.0, -80.0
        tgt_c, tgt_f, tgt_t = leg._calculate_inverse_kinematics(x_rad, 0.0, z_ground)
        c_name = leg.coxa.servo.config.name
        f_name = leg.femur.servo.config.name
        t_name = leg.tibia.servo.config.name

        steps = 40
        dt = 0.020
        for s in range(1, steps + 1):
            if self._cancel_event.is_set():
                return
            alpha = 0.5 * (1.0 - math.cos(math.pi * (s / steps)))
            leg.coxa.servo.set_angle(alpha * tgt_c)
            leg.femur.servo.set_angle(alpha * tgt_f)
            leg.tibia.servo.set_angle(alpha * tgt_t)
            if self.server:
                self.server.send_angles_update({c_name: alpha * tgt_c, f_name: alpha * tgt_f, t_name: alpha * tgt_t})
            time.sleep(dt)

        # Hold position
        hold_steps = int(hold / dt)
        for _ in range(hold_steps):
            if self._cancel_event.is_set():
                return
            time.sleep(dt)

        leg.relax()

    def _execute_sweep_joint(self, order: Order) -> None:
        """Sweeps a single joint from min to max angle for mechanical collision testing."""
        if not self.robot:
            raise RuntimeError("Hexapod robot instance not available.")

        servo_name = str(order.params.get("servo", ""))
        target_servo = None
        for leg in self.robot.legs.values():
            for joint in [leg.coxa, leg.femur, leg.tibia]:
                if joint.servo.config.name == servo_name:
                    target_servo = joint.servo
                    break
            if target_servo:
                break

        if not target_servo:
            raise ValueError(f"Servo '{servo_name}' not found.")

        min_a = target_servo.config.min_angle
        max_a = target_servo.config.max_angle
        steps = 40
        dt = 0.025

        # Sweep 0 to min
        for s in range(steps + 1):
            if self._cancel_event.is_set():
                return
            a = (s / steps) * min_a
            target_servo.set_angle(a)
            if self.server:
                self.server.send_angles_update({servo_name: a})
            time.sleep(dt)

        # Sweep min to max
        for s in range(steps * 2 + 1):
            if self._cancel_event.is_set():
                return
            a = min_a + (s / (steps * 2)) * (max_a - min_a)
            target_servo.set_angle(a)
            if self.server:
                self.server.send_angles_update({servo_name: a})
            time.sleep(dt)

        # Sweep max back to 0
        for s in range(steps + 1):
            if self._cancel_event.is_set():
                return
            a = max_a + (s / steps) * (0.0 - max_a)
            target_servo.set_angle(a)
            if self.server:
                self.server.send_angles_update({servo_name: a})
            time.sleep(dt)

        target_servo.relax()

    def _get_leg(self, leg_name: str) -> Optional[Any]:
        """Resolves string like 'left_rear' to Leg instance."""
        if not self.robot:
            return None
        parts = leg_name.split("_")
        if len(parts) != 2:
            return None
        try:
            side = BodySide(parts[0])
            row = LegRow(parts[1])
            return self.robot.legs.get((side, row))
        except ValueError:
            return None

    def _relax_single_leg(self, leg_name: str) -> None:
        """Relaxes a single leg."""
        leg = self._get_leg(leg_name)
        if leg:
            leg.relax()

    def _apply_trim(self, p: Dict[str, Any]) -> None:
        servo_name = str(p.get("servo", ""))
        offset = int(p["offset"]) if "offset" in p and p["offset"] is not None else None
        orient = int(p["orientation"]) if "orientation" in p and p["orientation"] is not None else None
        angle = float(p["angle"]) if "angle" in p and p["angle"] is not None else None
        if self.robot and servo_name:
            for leg in self.robot.legs.values():
                for joint in [leg.coxa, leg.femur, leg.tibia]:
                    if joint.servo.config.name == servo_name:
                        if offset is not None:
                            joint.servo.config.center_offset_pulse = offset
                        if orient is not None:
                            joint.servo.config.orientation = orient
                        if angle is not None:
                            joint.servo.set_angle(angle)

    def _save_trim(self, p: Dict[str, Any]) -> None:
        servo_name = str(p.get("servo", ""))
        offset = int(p.get("offset", 0))
        orient = int(p.get("orientation", 1))
        if servo_name:
            update_servo_calibration(
                servo_name=servo_name,
                updates={"center_offset_pulse": offset, "orientation": orient}
            )
