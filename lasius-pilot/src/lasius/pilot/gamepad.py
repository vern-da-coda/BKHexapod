"""
Linux Joystick & Bluetooth Gamepad Driver (`lasius.pilot.gamepad`).

Purpose & Role:
    Communicates with any standard Linux joystick device (`/dev/input/js0`) using
    non-blocking POSIX file descriptors and native kernel struct unpacking (`IhBB`).
    Uses a data-driven YAML profile registry (`profiles/*.yaml`) for controller
    axis, button, and UI label mappings:
      - `profiles/ps5.yaml`: Sony PS5 DualSense / PS4 DualShock (`profile='ps5'`)
      - `profiles/stadia.yaml`: Google Stadia Controller (`profile='stadia'`)
      - `profiles/xbox.yaml`: Xbox / XInput / 8BitDo (`profile='xbox'`)
      - Automatic Detection (`profile='auto'`, matches `match_keywords` against
        `/sys/class/input/jsX/device/name`).

Classes:
    - `GamepadAxesConfig`, `GamepadButtonsConfig`, `GamepadLabelsConfig`, `GamepadProfileConfig`:
      Typed dataclasses representing a loaded `.yaml` controller profile.
    - `GamepadController` (aliased as `LinuxJoystickReader`):
      Reads raw axis/button kernel events, applies smooth radial deadzone scaling,
      and maps sticks/buttons to Lasius WebSocket commands according to the active
      YAML profile.
"""

from dataclasses import dataclass, field
import os
from pathlib import Path
import struct
from typing import Dict, Any, Callable, Optional, List
import yaml


# Standard Linux Joystick Event format:
# unsigned int (time), short (value), unsigned char (type), unsigned char (number)
_EVENT_FORMAT = "IhBB"
_EVENT_SIZE = struct.calcsize(_EVENT_FORMAT)

# Event types
_JS_EVENT_BUTTON = 0x01
_JS_EVENT_AXIS = 0x02
_JS_EVENT_INIT = 0x80

# Directory containing declarative controller YAML profiles
PROFILES_DIR = Path(__file__).resolve().parent / "profiles"

# Backward-compatible button constants for tests and external scripts
STADIA_BTN_A = 0
STADIA_BTN_B = 1
STADIA_BTN_X = 2
STADIA_BTN_Y = 3
STADIA_BTN_L1 = 4
STADIA_BTN_R1 = 5
STADIA_BTN_OPTIONS = 6
STADIA_BTN_MENU = 7
STADIA_BTN_STADIA = 8

PS5_BTN_CROSS = 0
PS5_BTN_CIRCLE = 1
PS5_BTN_TRIANGLE = 2
PS5_BTN_SQUARE = 3
PS5_BTN_L1 = 4
PS5_BTN_R1 = 5
PS5_BTN_CREATE = 8
PS5_BTN_OPTIONS = 9
PS5_BTN_PS = 10


@dataclass(frozen=True)
class GamepadAxesConfig:
    """Declarative axis mapping loaded from `<profile>.yaml`."""
    walk_x: int = 0
    walk_y: int = 1
    invert_walk_y: bool = True
    turn_z: int = 3
    turn_z_standard: int = 2
    invert_turn_z: bool = True
    dpad_y: int = 7


@dataclass(frozen=True)
class GamepadButtonsConfig:
    """Declarative button mapping loaded from `<profile>.yaml`."""
    gait_tripod: int = 0
    gait_ripple: int = 2
    gait_wave: int = 3
    emergency_stop: List[int] = field(default_factory=lambda: [1, 8])
    speed_down: int = 4
    speed_up: int = 5
    reset_pose: int = 6
    toggle_pause: int = 7
    dpad_up: Optional[int] = None
    dpad_down: Optional[int] = None


@dataclass(frozen=True)
class GamepadLabelsConfig:
    """Human-readable CLI & Dashboard hints loaded from `<profile>.yaml`."""
    tripod: str = "A"
    ripple: str = "X"
    wave: str = "Y"
    stop: str = "B / Guide"
    speed: str = "L1 / R1"
    height: str = "D-Pad ↕"
    reset: str = "Options"
    pause: str = "Menu"
    gaits: str = "A Tripod · X Ripple · Y Wave"
    estop: str = "B / Guide E-Stop"
    extras: str = "L1/R1 Speed · D-Pad Height · Options Reset"
    cli_gait_hint: str = "[A / X / Y]   : Gait -> Tripod (A) | Ripple (X) | Wave (Y)"
    cli_estop_hint: str = "[B / Stadia]  : EMERGENCY STOP (Relax all 18 servos)"
    cli_pose_hint: str = "[Options ...] : Reset Body Pose  |  [Menu ≡] : Pause / Resume"


@dataclass(frozen=True)
class GamepadProfileConfig:
    """Complete controller profile parsed from a `.yaml` file in `profiles/`."""
    id: str
    name: str
    short_label: str = ""
    deadzone: float = 0.12
    match_keywords: List[str] = field(default_factory=list)
    axes: GamepadAxesConfig = field(default_factory=GamepadAxesConfig)
    buttons: GamepadButtonsConfig = field(default_factory=GamepadButtonsConfig)
    buttons_standard: GamepadButtonsConfig = field(default_factory=GamepadButtonsConfig)
    labels: GamepadLabelsConfig = field(default_factory=GamepadLabelsConfig)

    def to_dict(self) -> Dict[str, Any]:
        """Serializes the profile for REST API / Dashboard consumption."""
        return {
            "id": self.id,
            "name": self.name,
            "short_label": self.short_label or self.id.upper(),
            "deadzone": self.deadzone,
            "match_keywords": list(self.match_keywords),
            "axes": {
                "walk_x": self.axes.walk_x,
                "walk_y": self.axes.walk_y,
                "invert_walk_y": self.axes.invert_walk_y,
                "turn_z": self.axes.turn_z,
                "turn_z_standard": self.axes.turn_z_standard,
                "invert_turn_z": self.axes.invert_turn_z,
                "dpad_y": self.axes.dpad_y,
            },
            "buttons": {
                "gait_tripod": self.buttons.gait_tripod,
                "gait_ripple": self.buttons.gait_ripple,
                "gait_wave": self.buttons.gait_wave,
                "emergency_stop": list(self.buttons.emergency_stop),
                "speed_down": self.buttons.speed_down,
                "speed_up": self.buttons.speed_up,
                "reset_pose": self.buttons.reset_pose,
                "toggle_pause": self.buttons.toggle_pause,
            },
            "buttons_standard": {
                "gait_tripod": self.buttons_standard.gait_tripod,
                "gait_ripple": self.buttons_standard.gait_ripple,
                "gait_wave": self.buttons_standard.gait_wave,
                "emergency_stop": list(self.buttons_standard.emergency_stop),
                "speed_down": self.buttons_standard.speed_down,
                "speed_up": self.buttons_standard.speed_up,
                "reset_pose": self.buttons_standard.reset_pose,
                "toggle_pause": self.buttons_standard.toggle_pause,
                "dpad_up": self.buttons_standard.dpad_up,
                "dpad_down": self.buttons_standard.dpad_down,
            },
            "labels": {
                "tripod": self.labels.tripod,
                "ripple": self.labels.ripple,
                "wave": self.labels.wave,
                "stop": self.labels.stop,
                "speed": self.labels.speed,
                "height": self.labels.height,
                "reset": self.labels.reset,
                "pause": self.labels.pause,
                "gaits": self.labels.gaits,
                "estop": self.labels.estop,
                "extras": self.labels.extras,
                "cli_gait_hint": self.labels.cli_gait_hint,
                "cli_estop_hint": self.labels.cli_estop_hint,
                "cli_pose_hint": self.labels.cli_pose_hint,
            },
        }


def _parse_buttons(raw: Dict[str, Any]) -> GamepadButtonsConfig:
    estop_raw = raw.get("emergency_stop", [1, 8])
    if isinstance(estop_raw, int):
        estop_list = [estop_raw]
    else:
        estop_list = [int(x) for x in estop_raw]
    return GamepadButtonsConfig(
        gait_tripod=int(raw.get("gait_tripod", 0)),
        gait_ripple=int(raw.get("gait_ripple", 2)),
        gait_wave=int(raw.get("gait_wave", 3)),
        emergency_stop=estop_list,
        speed_down=int(raw.get("speed_down", 4)),
        speed_up=int(raw.get("speed_up", 5)),
        reset_pose=int(raw.get("reset_pose", 6)),
        toggle_pause=int(raw.get("toggle_pause", 7)),
        dpad_up=int(raw["dpad_up"]) if "dpad_up" in raw and raw["dpad_up"] is not None else None,
        dpad_down=int(raw["dpad_down"]) if "dpad_down" in raw and raw["dpad_down"] is not None else None,
    )


def load_gamepad_profile(yaml_path: Path) -> GamepadProfileConfig:
    """Loads and validates a single gamepad YAML profile from disk."""
    raw = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    axes_raw = raw.get("axes", {})
    btns_raw = raw.get("buttons", {})
    btns_std_raw = raw.get("buttons_standard", btns_raw)
    labels_raw = raw.get("labels", {})

    profile_id = str(raw.get("id", yaml_path.stem)).lower()
    return GamepadProfileConfig(
        id=profile_id,
        name=str(raw.get("name", profile_id.upper())),
        short_label=str(raw.get("short_label", profile_id.upper())),
        deadzone=float(raw.get("deadzone", 0.12)),
        match_keywords=[str(k).lower() for k in raw.get("match_keywords", [])],
        axes=GamepadAxesConfig(
            walk_x=int(axes_raw.get("walk_x", 0)),
            walk_y=int(axes_raw.get("walk_y", 1)),
            invert_walk_y=bool(axes_raw.get("invert_walk_y", True)),
            turn_z=int(axes_raw.get("turn_z", 3)),
            turn_z_standard=int(axes_raw.get("turn_z_standard", 2)),
            invert_turn_z=bool(axes_raw.get("invert_turn_z", True)),
            dpad_y=int(axes_raw.get("dpad_y", 7)),
        ),
        buttons=_parse_buttons(btns_raw),
        buttons_standard=_parse_buttons(btns_std_raw),
        labels=GamepadLabelsConfig(
            tripod=str(labels_raw.get("tripod", "A")),
            ripple=str(labels_raw.get("ripple", "X")),
            wave=str(labels_raw.get("wave", "Y")),
            stop=str(labels_raw.get("stop", "B / Guide")),
            speed=str(labels_raw.get("speed", "L1 / R1")),
            height=str(labels_raw.get("height", "D-Pad ↕")),
            reset=str(labels_raw.get("reset", "Options")),
            pause=str(labels_raw.get("pause", "Menu")),
            gaits=str(labels_raw.get("gaits", "A Tripod · X Ripple · Y Wave")),
            estop=str(labels_raw.get("estop", "B / Guide E-Stop")),
            extras=str(labels_raw.get("extras", "L1/R1 Speed · D-Pad Height · Options Reset")),
            cli_gait_hint=str(labels_raw.get("cli_gait_hint", "[A / X / Y]   : Gait -> Tripod (A) | Ripple (X) | Wave (Y)")),
            cli_estop_hint=str(labels_raw.get("cli_estop_hint", "[B / Stadia]  : EMERGENCY STOP (Relax all 18 servos)")),
            cli_pose_hint=str(labels_raw.get("cli_pose_hint", "[Options ...] : Reset Body Pose  |  [Menu ≡] : Pause / Resume")),
        ),
    )


def load_all_gamepad_profiles(profiles_dir: Path = PROFILES_DIR) -> Dict[str, GamepadProfileConfig]:
    """Loads all `*.yaml` controller profiles from `profiles_dir`."""
    profiles: Dict[str, GamepadProfileConfig] = {}
    if profiles_dir.is_dir():
        for yaml_file in sorted(profiles_dir.glob("*.yaml")):
            prof = load_gamepad_profile(yaml_file)
            profiles[prof.id] = prof
    return profiles


class GamepadController:
    """
    Reads inputs from `/dev/input/js0` and maps them to Lasius walking, posing,
    and safety commands using declarative YAML profiles (`profiles/*.yaml`).
    """
    def __init__(
        self,
        device_path: str = "/dev/input/js0",
        deadzone: Optional[float] = None,
        profile: str = "auto",
        profiles_dir: Path = PROFILES_DIR,
        on_command: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.device_path = device_path
        self.profiles: Dict[str, GamepadProfileConfig] = load_all_gamepad_profiles(profiles_dir)
        self.profile = profile.lower()
        self.device_name: str = "Unknown Gamepad"
        self.on_command = on_command

        # Use explicit deadzone if passed, otherwise use profile default (0.12)
        default_dz = self.active_profile_config.deadzone if self.profiles else 0.12
        self.deadzone: float = deadzone if deadzone is not None else default_dz

        # Axis states normalized -1.0 to +1.0 (0..5: sticks/triggers, 6..7: D-Pad HAT)
        self.axes: Dict[int, float] = {i: 0.0 for i in range(8)}
        # Button states (0 or 1)
        self.buttons: Dict[int, int] = {}

        # Runtime state for incremental D-Pad / shoulder adjustments
        self.current_speed: float = 1.0
        self.current_height: float = -80.0

        self.fd: Optional[int] = None

    def _detect_device_name(self) -> str:
        """Reads the human-readable controller name from sysfs if available."""
        try:
            js_name = Path(self.device_path).name
            sysfs_path = Path(f"/sys/class/input/{js_name}/device/name")
            if sysfs_path.is_file():
                return sysfs_path.read_text(encoding="utf-8").strip()
        except Exception:
            pass
        return "Generic Linux Joystick"

    @property
    def active_profile(self) -> str:
        """
        Resolves the active controller profile ID by checking explicit selection first,
        then matching `device_name` against `match_keywords` in the YAML profiles.
        """
        if self.profile in self.profiles:
            return self.profile
        name_lower = self.device_name.lower()
        for prof_id, prof_cfg in self.profiles.items():
            if any(kw in name_lower for kw in prof_cfg.match_keywords):
                return prof_id
        return "auto"

    @property
    def active_profile_config(self) -> GamepadProfileConfig:
        """Returns the resolved `GamepadProfileConfig` dataclass (defaults to `xbox` if `'auto'`)."""
        resolved = self.active_profile
        if resolved in self.profiles:
            return self.profiles[resolved]
        return self.profiles.get("xbox") or next(iter(self.profiles.values()))

    def connect(self) -> bool:
        """Opens the joystick device file in non-blocking mode and detects its model."""
        if not os.path.exists(self.device_path):
            return False
        try:
            self.fd = os.open(self.device_path, os.O_RDONLY | os.O_NONBLOCK)
            self.device_name = self._detect_device_name()
            return True
        except Exception:
            return False

    def close(self) -> None:
        """Closes the device file descriptor."""
        if self.fd is not None:
            try:
                os.close(self.fd)
            except Exception:
                pass
            self.fd = None

    def apply_deadzone(self, raw_val: float) -> float:
        """Applies radial deadzone to analog axes and rescales smoothly to [-1.0, +1.0]."""
        if abs(raw_val) < self.deadzone:
            return 0.0
        sign = 1.0 if raw_val > 0 else -1.0
        scaled = (abs(raw_val) - self.deadzone) / (1.0 - self.deadzone)
        return sign * min(1.0, scaled)

    def read_events(self) -> List[Dict[str, Any]]:
        """Reads and processes all pending kernel events from the joystick."""
        if self.fd is None:
            return []

        events = []
        while True:
            try:
                data = os.read(self.fd, _EVENT_SIZE)
                if len(data) < _EVENT_SIZE:
                    break
                ev_time, ev_val, ev_type, ev_num = struct.unpack(_EVENT_FORMAT, data)
                is_init = bool(ev_type & _JS_EVENT_INIT)
                clean_type = ev_type & ~_JS_EVENT_INIT

                if clean_type == _JS_EVENT_AXIS:
                    norm_val = self.apply_deadzone(ev_val / 32767.0)
                    prev_val = self.axes.get(ev_num, 0.0)
                    self.axes[ev_num] = norm_val
                    if not is_init:
                        events.append({
                            "type": "axis",
                            "axis": ev_num,
                            "value": norm_val,
                            "prev_value": prev_val,
                        })
                elif clean_type == _JS_EVENT_BUTTON:
                    self.buttons[ev_num] = ev_val
                    if not is_init:
                        events.append({
                            "type": "button",
                            "button": ev_num,
                            "pressed": bool(ev_val),
                        })
            except (BlockingIOError, OSError):
                break

        return events

    def get_locomotion_command(self) -> Dict[str, float]:
        """
        Translates current gamepad stick axes into Lasius locomotion commands
        using the active YAML profile's `axes` configuration.
        """
        prof_id = self.active_profile
        cfg = self.active_profile_config.axes

        walk_x = self.axes.get(cfg.walk_x, 0.0)
        raw_walk_y = self.axes.get(cfg.walk_y, 0.0)
        walk_y = -raw_walk_y if cfg.invert_walk_y else raw_walk_y

        if prof_id in self.profiles:
            raw_turn = self.axes.get(cfg.turn_z, 0.0)
        else:
            # Generic fallback ('auto' with unknown controller name):
            # If Axis 2 rests at -1.0 (unpressed L2 analog trigger), read Axis 3.
            ax2 = self.axes.get(2, 0.0)
            ax3 = self.axes.get(3, 0.0)
            raw_turn = ax3 if abs(ax2 + 1.0) < 0.05 else (ax2 if abs(ax2) > 0.0 else ax3)

        turn_z = -raw_turn if cfg.invert_turn_z else raw_turn
        if turn_z == 0.0:
            turn_z = 0.0  # Normalize -0.0 to 0.0

        return {
            "walk_x": round(walk_x, 2),
            "walk_y": round(walk_y, 2),
            "turn_z": round(turn_z, 2),
        }

    def translate_events_to_actions(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Translates discrete button presses and D-Pad HAT transitions into Lasius
        WebSocket command payloads using the active YAML profile's `buttons` mapping.
        """
        actions: List[Dict[str, Any]] = []
        cfg = self.active_profile_config
        btns = cfg.buttons
        dpad_axis = cfg.axes.dpad_y

        for ev in events:
            if ev.get("type") == "button" and ev.get("pressed"):
                btn = ev.get("button")
                if btn in btns.emergency_stop:
                    actions.append({"type": "command", "action": "emergency_stop"})
                elif btn == btns.gait_tripod:
                    actions.append({"type": "command", "action": "set_gait_type", "value": "tripod"})
                elif btn == btns.gait_ripple:
                    actions.append({"type": "command", "action": "set_gait_type", "value": "ripple"})
                elif btn == btns.gait_wave:
                    actions.append({"type": "command", "action": "set_gait_type", "value": "wave"})
                elif btn == btns.speed_down:
                    self.current_speed = max(0.25, round(self.current_speed - 0.25, 2))
                    actions.append({"type": "command", "action": "set_speed", "value": self.current_speed})
                elif btn == btns.speed_up:
                    self.current_speed = min(3.0, round(self.current_speed + 0.25, 2))
                    actions.append({"type": "command", "action": "set_speed", "value": self.current_speed})
                elif btn == btns.reset_pose:
                    self.current_height = -80.0
                    actions.append({"type": "command", "action": "reset_pose"})
                elif btn == btns.toggle_pause:
                    actions.append({"type": "command", "action": "toggle_pause"})
            elif ev.get("type") == "axis" and ev.get("axis") == dpad_axis:
                # D-Pad Vertical (HAT0Y): -1.0 is Up (taller body -> more negative Z), +1.0 is Down
                val = ev.get("value", 0.0)
                prev = ev.get("prev_value", 0.0)
                if abs(val) > 0.5 and abs(prev) <= 0.5:
                    delta = -5.0 if val < 0 else 5.0
                    self.current_height = max(-120.0, min(-40.0, self.current_height + delta))
                    actions.append({"type": "command", "action": "set_height", "value": self.current_height})

        return actions


# Backward-compatibility alias
LinuxJoystickReader = GamepadController
