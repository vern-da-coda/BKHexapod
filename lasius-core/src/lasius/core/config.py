"""
Module for loading and managing the hexapod configuration.

This module defines the data structures for physical robot geometry and
servo calibration, and provides functions to load the configuration from
YAML files (config.yaml or servos.yaml).
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import yaml


@dataclass
class LimbConfig:
    """
    Length of leg segments in mm (inter-axis distance).
    """
    coxa: float = 60.0
    femur: float = 100.0
    tibia: float = 130.0


@dataclass
class ChassisConfig:
    """
    Physical dimensions of the chassis and coxa mount axes in mm.
    """
    width_front_rear: float = 130.0
    width_middle: float = 150.0
    axis_distance_longitudinal: float = 90.0

    @property
    def mount_points(self) -> Dict[str, Tuple[float, float]]:
        """
        Calculates (x, y) coordinates for all 6 coxa mount points relative to body center.
        """
        half_w_fr = self.width_front_rear / 2.0
        half_w_m = self.width_middle / 2.0
        dy = self.axis_distance_longitudinal
        return {
            "left_front": (-half_w_fr, -dy),
            "left_middle": (-half_w_m, 0.0),
            "left_rear": (-half_w_fr, dy),
            "right_front": (half_w_fr, -dy),
            "right_middle": (half_w_m, 0.0),
            "right_rear": (half_w_fr, dy),
        }


@dataclass
class DefaultStanceConfig:
    """
    Default stance parameters in mm.
    """
    ground_clearance: float = 80.0
    foot_radius_offset: float = 120.0


@dataclass
class GeometryConfig:
    """
    Complete physical geometry configuration for the hexapod.
    """
    limbs: LimbConfig = field(default_factory=LimbConfig)
    chassis: ChassisConfig = field(default_factory=ChassisConfig)
    default_stance: DefaultStanceConfig = field(default_factory=DefaultStanceConfig)


@dataclass
class ServoConfig:
    """
    Data class for the configuration of a single servo.

    This class ensures that all configuration parameters of a servo
    are strongly typed and easily accessible.
    """
    name: str
    board_address: int
    channel: int
    center_offset_pulse: int
    pulse_range: int
    min_angle: float
    max_angle: float
    orientation: int


@dataclass
class HexapodConfig:
    """
    Data class that contains the complete configuration of the hexapod
    including physical geometry and servo calibrations.
    """
    servos: List[ServoConfig]
    geometry: GeometryConfig = field(default_factory=GeometryConfig)


def load_config(config_path: Optional[Path] = None) -> HexapodConfig:
    """
    Loads the hexapod configuration from the specified YAML file.

    If config_path is None, defaults to checking `config.yaml` followed by `servos.yaml`
    in the `lasius` package directory.

    Args:
        config_path: Path to the YAML file, or None for automatic discovery.

    Returns:
        A HexapodConfig object containing geometry and servo configurations.
    """
    if config_path is None:
        package_dir = Path(__file__).parent
        primary = package_dir / "config.yaml"
        fallback = package_dir / "servos.yaml"
        if primary.exists():
            config_path = primary
        elif fallback.exists():
            config_path = fallback
        else:
            raise FileNotFoundError(
                f"Configuration file not found. Looked for {primary} and {fallback}."
            )
    else:
        config_path = Path(config_path)
        if not config_path.exists():
            # If path doesn't exist, check whether the other filename exists in the same folder
            alt_name = "config.yaml" if config_path.name == "servos.yaml" else "servos.yaml"
            alt_path = config_path.parent / alt_name
            if alt_path.exists():
                config_path = alt_path
            else:
                raise FileNotFoundError(f"Configuration file not found at: {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        raw_config = yaml.safe_load(f) or {}

    # Parse geometry section if present, otherwise use defaults
    geom_data = raw_config.get("geometry", {})
    limbs_data = geom_data.get("limbs", {})
    chassis_data = geom_data.get("chassis", {})
    stance_data = geom_data.get("default_stance", {})

    limbs = LimbConfig(
        coxa=float(limbs_data.get("coxa", 60.0)),
        femur=float(limbs_data.get("femur", 100.0)),
        tibia=float(limbs_data.get("tibia", 130.0)),
    )
    chassis = ChassisConfig(
        width_front_rear=float(chassis_data.get("width_front_rear", 130.0)),
        width_middle=float(chassis_data.get("width_middle", 150.0)),
        axis_distance_longitudinal=float(chassis_data.get("axis_distance_longitudinal", 90.0)),
    )
    default_stance = DefaultStanceConfig(
        ground_clearance=float(stance_data.get("ground_clearance", 80.0)),
        foot_radius_offset=float(stance_data.get("foot_radius_offset", 120.0)),
    )
    geometry = GeometryConfig(
        limbs=limbs,
        chassis=chassis,
        default_stance=default_stance,
    )

    # Parse servos list
    servos_data = raw_config.get("servos", [])
    servo_configs = [ServoConfig(**data) for data in servos_data]

    return HexapodConfig(servos=servo_configs, geometry=geometry)


def update_servo_calibration(
    servo_name: str,
    updates: Dict[str, Any],
    config_paths: Optional[List[Path]] = None
) -> bool:
    """
    Updates configuration parameters (such as center_offset_pulse, orientation, min_angle, max_angle)
    for a named servo across YAML configuration files, preserving formatting and comments.

    Args:
        servo_name: Name of the servo to update (e.g. 'left_front_coxa').
        updates: Dictionary of key-value pairs to update.
        config_paths: List of file paths to update, or None for default package config.yaml & servos.yaml.

    Returns:
        True if at least one file was modified, False otherwise.
    """
    import re
    if config_paths is None:
        package_dir = Path(__file__).parent
        config_paths = [
            package_dir / "config.yaml",
            package_dir / "servos.yaml"
        ]

    any_success = False
    for path in config_paths:
        if not path.exists():
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            in_target_servo = False
            modified = False
            new_lines = []

            for line in lines:
                name_match = re.search(r'-\s*name:\s*["\']?([^"\']+)["\']?', line)
                if name_match:
                    in_target_servo = (name_match.group(1).strip() == servo_name)

                if in_target_servo:
                    for key, val in updates.items():
                        pattern = rf'^(\s*{key}\s*:\s*)([^\s#]+)(.*)$'
                        m = re.match(pattern, line)
                        if m:
                            prefix, old_val, suffix = m.groups()
                            line = f"{prefix}{val}{suffix}\n"
                            modified = True
                            break

                new_lines.append(line)

            if modified:
                with open(path, "w", encoding="utf-8") as f:
                    f.writelines(new_lines)
                any_success = True
        except Exception as e:
            print(f"[ERROR] Failed to update {path}: {e}")

    return any_success
