"""
Module for loading and managing the hexapod configuration.

This module defines the data structures for the servo configuration and
provides functions to load this configuration from a YAML file.
"""

import yaml
from dataclasses import dataclass
from typing import List
from pathlib import Path


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
    Data class that contains the entire servo configuration of the hexapod.
    """
    servos: List[ServoConfig]


def load_config(config_path: Path) -> HexapodConfig:
    """
    Loads the servo configuration from the specified YAML file.

    Args:
        config_path: The path to the `servos.yaml` file as a pathlib.Path object.

    Returns:
        A HexapodConfig object containing the complete configuration.
    """
    with open(config_path, 'r', encoding='utf-8') as f:
        raw_config = yaml.safe_load(f)

    # Directly converts the list of dictionaries from the YAML file
    # into a list of ServoConfig objects.
    servo_configs = [ServoConfig(**data) for data in raw_config['servos']]
    return HexapodConfig(servos=servo_configs)
