"""
Unit tests for MockPWMDriver and RealPCA9685Driver.
"""

import sys
from pathlib import Path
from typing import Dict, List, Tuple
from unittest.mock import MagicMock

import pytest

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.append(str(PROJECT_ROOT))

from lasius.core.hardware.driver import (
    MockPWMDriver,
    RealPCA9685Driver,
    _MODE1,
    _MODE2,
    _PRESCALE,
    _LED0_ON_L,
    _ALL_LED_ON_L,
)


class MockSMBus:
    """Simulates an I2C SMBus for testing RealPCA9685Driver without hardware."""
    def __init__(self):
        self.registers: Dict[int, int] = {_MODE1: 0x01, _MODE2: 0x00, _PRESCALE: 0x00}
        self.block_writes: List[Tuple[int, int, List[int]]] = []
        self.byte_writes: List[Tuple[int, int, int]] = []
        self.is_closed = False

    def write_byte_data(self, addr: int, register: int, value: int) -> None:
        self.registers[register] = value & 0xFF
        self.byte_writes.append((addr, register, value & 0xFF))

    def read_byte_data(self, addr: int, register: int) -> int:
        return self.registers.get(register, 0x00)

    def write_i2c_block_data(self, addr: int, register: int, data: List[int]) -> None:
        self.block_writes.append((addr, register, list(data)))

    def close(self) -> None:
        self.is_closed = True


def test_mock_pwm_driver():
    """Tests the in-memory MockPWMDriver."""
    mock = MockPWMDriver()
    assert mock.frequency == 50.0
    assert len(mock.angles) == 0

    mock.set_pwm(0, 0, 300, angle=15.5, servo_name="test_servo")
    assert mock.angles["test_servo"] == 15.5

    updates = mock.get_and_clear_angle_updates()
    assert updates == {"test_servo": 15.5}
    assert len(mock.angles) == 0

    mock.set_pwm_freq(60.0)
    assert mock.frequency == 60.0


def test_real_pca9685_driver_initialization():
    """Tests PCA9685 hardware initialization and prescale calculation for 50 Hz."""
    mock_bus = MockSMBus()
    driver = RealPCA9685Driver(address=0x40, bus_instance=mock_bus)

    # Check that MODE2 was configured with Totem Pole (0x04)
    assert mock_bus.registers[_MODE2] == 0x04

    # Check that 50 Hz prescale was written: round(25e6 / (4096 * 50)) - 1 = 121 (0x79)
    assert mock_bus.registers[_PRESCALE] == 121


def test_real_pca9685_driver_set_pwm():
    """Tests setting PWM ticks on individual channels."""
    mock_bus = MockSMBus()
    driver = RealPCA9685Driver(address=0x40, bus_instance=mock_bus)

    # Set channel 2 to on=0, off=307 (approx 1500us / center position)
    driver.set_pwm(2, 0, 307, angle=0.0, servo_name="left_front_coxa")

    # Target register for channel 2: _LED0_ON_L + 4 * 2 = 0x06 + 8 = 0x0E (14)
    expected_reg = _LED0_ON_L + 4 * 2
    matching_writes = [bw for bw in mock_bus.block_writes if bw[1] == expected_reg]
    assert len(matching_writes) >= 1

    last_write = matching_writes[-1]
    addr, reg, data = last_write
    assert addr == 0x40
    assert reg == expected_reg
    # data: [on_l, on_h, off_l, off_h] -> [0, 0, 307 & 0xFF, (307 >> 8) & 0x0F]
    assert data == [0, 0, 307 & 0xFF, (307 >> 8) & 0x0F]

    # Verify visualizer buffer
    assert driver.get_and_clear_angle_updates() == {"left_front_coxa": 0.0}


def test_real_pca9685_driver_channel_validation():
    """Tests that out-of-range channel raises ValueError."""
    mock_bus = MockSMBus()
    driver = RealPCA9685Driver(address=0x40, bus_instance=mock_bus)

    with pytest.raises(ValueError, match="Channel must be 0-15"):
        driver.set_pwm(16, 0, 300)

    with pytest.raises(ValueError, match="Channel must be 0-15"):
        driver.set_pwm(-1, 0, 300)


def test_real_pca9685_driver_relax_channel():
    """Tests relaxing a channel by setting full-off bit (0x10 on OFF_H)."""
    mock_bus = MockSMBus()
    driver = RealPCA9685Driver(address=0x41, bus_instance=mock_bus)

    driver.relax_channel(5)
    expected_reg = _LED0_ON_L + 4 * 5
    relax_writes = [bw for bw in mock_bus.block_writes if bw[1] == expected_reg]
    assert len(relax_writes) >= 1
    # Full off data: [0, 0, 0, 0x10]
    assert relax_writes[-1][2] == [0, 0, 0, 0x10]


def test_real_pca9685_driver_relax_all():
    """Tests relaxing all channels on the board."""
    mock_bus = MockSMBus()
    driver = RealPCA9685Driver(address=0x40, bus_instance=mock_bus)

    driver.relax_all()
    all_writes = [bw for bw in mock_bus.block_writes if bw[1] == _ALL_LED_ON_L]
    assert len(all_writes) >= 1
    assert all_writes[-1][2] == [0, 0, 0, 0x10]
