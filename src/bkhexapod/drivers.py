"""
PWM driver implementations for BKHexapod.

Includes:
- MockPWMDriver: In-memory simulation driver for testing and digital twin streaming.
- RealPCA9685Driver: Direct I2C hardware driver for dual PCA9685 boards (0x40, 0x41).
"""

import time
from typing import Dict, Optional, Any
from bkhexapod.servos import PWMDriverProtocol

try:
    import smbus2
except ImportError:
    smbus2 = None


# PCA9685 Registers
_MODE1 = 0x00
_MODE2 = 0x01
_SUBADR1 = 0x02
_SUBADR2 = 0x03
_SUBADR3 = 0x04
_ALLCALLADR = 0x05
_LED0_ON_L = 0x06
_LED0_ON_H = 0x07
_LED0_OFF_L = 0x08
_LED0_OFF_H = 0x09
_ALL_LED_ON_L = 0xFA
_ALL_LED_ON_H = 0xFB
_ALL_LED_OFF_L = 0xFC
_ALL_LED_OFF_H = 0xFD
_PRESCALE = 0xFE

# PCA9685 MODE1 Bits
_RESTART = 0x80
_SLEEP = 0x10
_ALLCALL = 0x01
_AI = 0x20  # Auto-Increment enable

# PCA9685 MODE2 Bits
_OUTDRV = 0x04  # Totem pole structure


class MockPWMDriver(PWMDriverProtocol):
    """
    A simulated PWM driver that stores the latest angle updates in memory
    and feeds them to the digital twin visualizer.
    """
    def __init__(self, visualizer_server: Optional[Any] = None):
        self.angles: Dict[str, float] = {}
        self.visualizer_server = visualizer_server
        self.frequency: float = 50.0

    def set_pwm(
        self,
        channel: int,
        on: int,
        off: int,
        angle: Optional[float] = None,
        servo_name: Optional[str] = None
    ) -> None:
        if servo_name and angle is not None:
            self.angles[servo_name] = angle

    def set_pwm_freq(self, freq: float) -> None:
        self.frequency = freq

    def get_and_clear_angle_updates(self) -> Dict[str, float]:
        updates = self.angles.copy()
        self.angles.clear()
        return updates


class RealPCA9685Driver(PWMDriverProtocol):
    """
    Hardware driver communicating directly with a PCA9685 board over I2C (via smbus2).
    Also supports streaming angle updates to the digital twin visualizer in parallel.
    """
    def __init__(
        self,
        address: int = 0x40,
        i2c_bus: int = 1,
        bus_instance: Optional[Any] = None,
        visualizer_server: Optional[Any] = None,
        reference_clock_speed: int = 25_000_000
    ):
        """
        Initializes the PCA9685 board at the specified I2C address.

        Args:
            address: I2C address (default 0x40 for Board 1, 0x41 for Board 2).
            i2c_bus: I2C bus number (typically 1 on Raspberry Pi).
            bus_instance: Optional existing smbus2.SMBus instance to share bus.
            visualizer_server: Optional visualizer server for simultaneous 3D streaming.
            reference_clock_speed: Internal oscillator frequency (25 MHz nominal).
        """
        if smbus2 is None and bus_instance is None:
            raise ImportError(
                "smbus2 is required for RealPCA9685Driver. "
                "Install it with 'pip install smbus2'."
            )

        self.address = address
        self.i2c_bus_num = i2c_bus
        self.reference_clock_speed = reference_clock_speed
        self.visualizer_server = visualizer_server
        self.angles: Dict[str, float] = {}

        if bus_instance is not None:
            self.bus = bus_instance
            self._owns_bus = False
        else:
            try:
                self.bus = smbus2.SMBus(self.i2c_bus_num)
                self._owns_bus = True
            except (FileNotFoundError, PermissionError) as e:
                raise RuntimeError(
                    f"Could not open I2C bus {self.i2c_bus_num}: {e}. "
                    "Ensure I2C is enabled (raspi-config) and permissions are granted."
                ) from e

        self._init_device()

    def _init_device(self) -> None:
        """Configures PCA9685 with auto-increment and default totem pole mode."""
        # Reset all PWM channels to 0
        self.set_all_pwm(0, 0)
        # Configure MODE2: Totem pole output
        self._write_byte(_MODE2, _OUTDRV)
        # Configure MODE1: Enable Auto-Increment & wake up
        self._write_byte(_MODE1, _AI | _ALLCALL)
        time.sleep(0.005)
        # Set standard 50 Hz PWM frequency for servo control
        self.set_pwm_freq(50.0)

    def _write_byte(self, register: int, value: int) -> None:
        self.bus.write_byte_data(self.address, register, value & 0xFF)

    def _read_byte(self, register: int) -> int:
        return self.bus.read_byte_data(self.address, register)

    def set_pwm_freq(self, freq: float) -> None:
        """
        Sets the PWM frequency for all 16 channels on the board (e.g. 50 Hz).
        """
        prescaleval = self.reference_clock_speed / (4096.0 * freq) - 1.0
        prescale = int(round(prescaleval))
        prescale = max(3, min(255, prescale))

        oldmode = self._read_byte(_MODE1)
        # Oscillator must be asleep to write PRESCALE register
        newmode = (oldmode & ~_RESTART) | _SLEEP
        self._write_byte(_MODE1, newmode)
        self._write_byte(_PRESCALE, prescale)
        self._write_byte(_MODE1, oldmode)
        time.sleep(0.005)
        # Re-enable auto-increment and restart
        self._write_byte(_MODE1, oldmode | _RESTART | _AI)

    def set_pwm(
        self,
        channel: int,
        on: int,
        off: int,
        angle: Optional[float] = None,
        servo_name: Optional[str] = None
    ) -> None:
        """
        Sets the on and off ticks for a single channel (0-15).
        Also stores angle for visualizer live-streaming.
        """
        if not 0 <= channel <= 15:
            raise ValueError(f"Channel must be 0-15, got {channel}")

        if servo_name and angle is not None:
            self.angles[servo_name] = angle

        reg = _LED0_ON_L + 4 * channel
        data = [
            on & 0xFF,
            (on >> 8) & 0x0F,
            off & 0xFF,
            (off >> 8) & 0x0F
        ]
        self.bus.write_i2c_block_data(self.address, reg, data)

    def set_all_pwm(self, on: int, off: int) -> None:
        """Sets the PWM output for all 16 channels at once."""
        data = [
            on & 0xFF,
            (on >> 8) & 0x0F,
            off & 0xFF,
            (off >> 8) & 0x0F
        ]
        self.bus.write_i2c_block_data(self.address, _ALL_LED_ON_L, data)

    def relax_channel(self, channel: int) -> None:
        """
        Turns off PWM output completely on a specific channel to relax the servo
        and prevent holding current draw.
        """
        if not 0 <= channel <= 15:
            raise ValueError(f"Channel must be 0-15, got {channel}")
        reg = _LED0_ON_L + 4 * channel
        # Setting bit 4 of OFF_H (0x10) activates full-off mode in PCA9685
        data = [0, 0, 0, 0x10]
        self.bus.write_i2c_block_data(self.address, reg, data)

    def relax_all(self) -> None:
        """Relaxes all 16 channels on this board (all PWM signals disabled)."""
        data = [0, 0, 0, 0x10]
        self.bus.write_i2c_block_data(self.address, _ALL_LED_ON_L, data)

    def get_and_clear_angle_updates(self) -> Dict[str, float]:
        """Returns and clears buffered angle updates for the visualizer."""
        updates = self.angles.copy()
        self.angles.clear()
        return updates

    def close(self) -> None:
        """Releases the I2C bus if owned."""
        if self._owns_bus and hasattr(self, 'bus'):
            try:
                self.relax_all()
                self.bus.close()
            except Exception:
                pass
