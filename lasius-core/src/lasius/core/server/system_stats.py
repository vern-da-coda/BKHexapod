"""
Raspberry Pi & Host System Telemetry Collector (`lasius.core.server.system_stats`).

Purpose & Role:
    Collects real-time CPU utilization, load averages, RAM usage, SoC temperature,
    Raspberry Pi hardware power/under-voltage throttling flags (`vcgencmd get_throttled`),
    Wi-Fi RSSI/link quality (`/proc/net/wireless`), disk usage, and daemon RSS memory
    using pure Linux `/proc` and `/sys` reads with zero external dependencies.

Classes:
    - `CpuStats`, `MemoryStats`, `ThermalStats`, `PowerStats`, `WifiStats`,
      `DiskStats`, `DaemonStats`: Typed telemetry dataclasses.
    - `SystemStatsCollector`: Stateful delta collector computing CPU % between samples.
"""

from dataclasses import asdict, dataclass
import os
from pathlib import Path
import shutil
import subprocess
import time
from typing import Any, Dict, Optional, Tuple


@dataclass
class CpuStats:
    load_1m: float
    load_5m: float
    load_15m: float
    percent: float
    count: int


@dataclass
class MemoryStats:
    total_mb: float
    used_mb: float
    free_mb: float
    available_mb: float
    percent: float


@dataclass
class ThermalStats:
    temp_c: float
    status: str  # "normal", "warm", "hot"


@dataclass
class PowerStats:
    throttled_raw: str
    healthy: bool
    under_voltage_active: bool
    under_voltage_occurred: bool
    arm_freq_capped_active: bool
    arm_freq_capped_occurred: bool
    throttled_active: bool
    throttled_occurred: bool
    soft_temp_active: bool
    soft_temp_occurred: bool
    status_text: str


@dataclass
class WifiStats:
    interface: str
    connected: bool
    quality: int
    quality_max: int
    quality_percent: float
    signal_dbm: int


@dataclass
class DiskStats:
    total_gb: float
    used_gb: float
    free_gb: float
    percent: float


@dataclass
class DaemonStats:
    uptime_seconds: float
    uptime_formatted: str
    daemon_rss_mb: float
    connected_clients: int


@dataclass
class SystemStats:
    timestamp: float
    cpu: CpuStats
    memory: MemoryStats
    thermal: ThermalStats
    power: PowerStats
    wifi: WifiStats
    disk: DiskStats
    daemon: DaemonStats

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SystemStatsCollector:
    """
    Non-blocking, cached hardware and system metrics collector.
    """
    _instance: Optional["SystemStatsCollector"] = None

    def __init__(self, cache_ttl_seconds: float = 0.8):
        self.cache_ttl = cache_ttl_seconds
        self._last_cached_time: float = 0.0
        self._cached_stats: Optional[SystemStats] = None

        # State tracking for delta CPU%
        self._last_cpu_times: Optional[Tuple[float, float]] = None
        self._daemon_start_time = time.time()
        self._vcgencmd_bin = shutil.which("vcgencmd")

    @classmethod
    def get_instance(cls) -> "SystemStatsCollector":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_stats(self, connected_clients: int = 0) -> SystemStats:
        """Returns current system metrics, using cache if within TTL."""
        now = time.time()
        if self._cached_stats is not None and (now - self._last_cached_time) < self.cache_ttl:
            # Update dynamic connected_clients count even on cache hit
            self._cached_stats.daemon.connected_clients = connected_clients
            return self._cached_stats

        stats = self._collect_fresh_stats(connected_clients)
        self._cached_stats = stats
        self._last_cached_time = now
        return stats

    def _collect_fresh_stats(self, connected_clients: int) -> SystemStats:
        now = time.time()
        cpu = self._collect_cpu()
        memory = self._collect_memory()
        thermal = self._collect_thermal()
        power = self._collect_power()
        wifi = self._collect_wifi()
        disk = self._collect_disk()
        daemon = self._collect_daemon(connected_clients)

        return SystemStats(
            timestamp=now,
            cpu=cpu,
            memory=memory,
            thermal=thermal,
            power=power,
            wifi=wifi,
            disk=disk,
            daemon=daemon,
        )

    def _collect_cpu(self) -> CpuStats:
        load_1m, load_5m, load_15m = 0.0, 0.0, 0.0
        cpu_count = os.cpu_count() or 1

        if Path("/proc/loadavg").exists():
            try:
                with open("/proc/loadavg", "r", encoding="ascii") as f:
                    parts = f.read().split()
                    load_1m = float(parts[0])
                    load_5m = float(parts[1])
                    load_15m = float(parts[2])
            except Exception:
                pass

        # Calculate CPU% via /proc/stat delta if available
        cpu_pct = None
        if Path("/proc/stat").exists():
            try:
                with open("/proc/stat", "r", encoding="ascii") as f:
                    first_line = f.readline()
                if first_line.startswith("cpu "):
                    fields = [float(x) for x in first_line.split()[1:8]]
                    # fields: [user, nice, system, idle, iowait, irq, softirq]
                    idle = fields[3] + (fields[4] if len(fields) > 4 else 0.0)
                    total = sum(fields)

                    if self._last_cpu_times is not None:
                        last_idle, last_total = self._last_cpu_times
                        d_idle = idle - last_idle
                        d_total = total - last_total
                        if d_total > 0:
                            usage = 100.0 * (1.0 - (d_idle / d_total))
                            cpu_pct = round(max(0.0, min(100.0, usage)), 1)
                    self._last_cpu_times = (idle, total)
            except Exception:
                pass

        if cpu_pct is None:
            # Fallback estimation based on 1-min load average normalized to core count
            cpu_pct = round(min(100.0, (load_1m / cpu_count) * 100.0), 1)

        return CpuStats(
            load_1m=load_1m,
            load_5m=load_5m,
            load_15m=load_15m,
            percent=cpu_pct,
            count=cpu_count,
        )

    def _collect_memory(self) -> MemoryStats:
        total_mb = 1024.0
        avail_mb = 768.0
        free_mb = 512.0

        if Path("/proc/meminfo").exists():
            try:
                mem: Dict[str, str] = {}
                with open("/proc/meminfo", "r", encoding="ascii") as f:
                    for line in f:
                        if ":" in line:
                            k, v = line.split(":", 1)
                            mem[k.strip()] = v.strip()

                if "MemTotal" in mem:
                    total_mb = round(float(mem["MemTotal"].split()[0]) / 1024.0, 1)
                if "MemAvailable" in mem:
                    avail_mb = round(float(mem["MemAvailable"].split()[0]) / 1024.0, 1)
                elif "MemFree" in mem:
                    free_k = float(mem.get("MemFree", "0").split()[0])
                    buffers_k = float(mem.get("Buffers", "0").split()[0])
                    cached_k = float(mem.get("Cached", "0").split()[0])
                    avail_mb = round((free_k + buffers_k + cached_k) / 1024.0, 1)
                if "MemFree" in mem:
                    free_mb = round(float(mem["MemFree"].split()[0]) / 1024.0, 1)
            except Exception:
                pass

        used_mb = max(0.0, round(total_mb - avail_mb, 1))
        percent = round((used_mb / total_mb) * 100.0, 1) if total_mb > 0 else 0.0

        return MemoryStats(
            total_mb=total_mb,
            used_mb=used_mb,
            free_mb=free_mb,
            available_mb=avail_mb,
            percent=percent,
        )

    def _collect_thermal(self) -> ThermalStats:
        temp_c = 42.0

        for path in [
            "/sys/class/thermal/thermal_zone0/temp",
            "/sys/class/thermal/thermal_zone1/temp",
        ]:
            if Path(path).exists():
                try:
                    with open(path, "r", encoding="ascii") as f:
                        raw = float(f.read().strip())
                        temp_c = round(raw / 1000.0, 1)
                        break
                except Exception:
                    pass

        status = "normal"
        if temp_c >= 75.0:
            status = "hot"
        elif temp_c >= 60.0:
            status = "warm"

        return ThermalStats(temp_c=temp_c, status=status)

    def _collect_power(self) -> PowerStats:
        throttled_hex = "0x0"
        if self._vcgencmd_bin:
            try:
                out = subprocess.check_output(
                    [self._vcgencmd_bin, "get_throttled"],
                    text=True,
                    timeout=0.6,
                    stderr=subprocess.DEVNULL,
                ).strip()
                if "=" in out:
                    throttled_hex = out.split("=")[-1]
                else:
                    throttled_hex = out
            except Exception:
                pass

        try:
            val = int(throttled_hex, 16)
        except ValueError:
            val = 0

        under_voltage_active = bool(val & 0x1)
        arm_freq_capped_active = bool(val & 0x2)
        throttled_active = bool(val & 0x4)
        soft_temp_active = bool(val & 0x8)

        under_voltage_occurred = bool(val & 0x10000)
        arm_freq_capped_occurred = bool(val & 0x20000)
        throttled_occurred = bool(val & 0x40000)
        soft_temp_occurred = bool(val & 0x80000)

        status_text = "Healthy"
        if under_voltage_active:
            status_text = "Under-voltage detected!"
        elif throttled_active:
            status_text = "Thermal throttling active!"
        elif arm_freq_capped_active:
            status_text = "ARM frequency capped!"
        elif under_voltage_occurred:
            status_text = "Under-voltage occurred previously"
        elif throttled_occurred:
            status_text = "Throttling occurred previously"

        return PowerStats(
            throttled_raw=f"0x{val:X}",
            healthy=(val == 0),
            under_voltage_active=under_voltage_active,
            under_voltage_occurred=under_voltage_occurred,
            arm_freq_capped_active=arm_freq_capped_active,
            arm_freq_capped_occurred=arm_freq_capped_occurred,
            throttled_active=throttled_active,
            throttled_occurred=throttled_occurred,
            soft_temp_active=soft_temp_active,
            soft_temp_occurred=soft_temp_occurred,
            status_text=status_text,
        )

    def _collect_wifi(self) -> WifiStats:
        wifi_path = Path("/proc/net/wireless")
        if wifi_path.exists():
            try:
                with open(wifi_path, "r", encoding="ascii") as f:
                    for line in f:
                        if ":" in line and not line.strip().startswith("Inter-"):
                            parts = line.split(":", 1)
                            ifname = parts[0].strip()
                            cols = parts[1].split()
                            if len(cols) >= 3:
                                q_str = cols[1].rstrip(".")
                                lvl_str = cols[2].rstrip(".")
                                q = int(float(q_str))
                                lvl = int(float(lvl_str))
                                q_pct = round((q / 70.0) * 100.0, 1)
                                return WifiStats(
                                    interface=ifname,
                                    connected=True,
                                    quality=q,
                                    quality_max=70,
                                    quality_percent=q_pct,
                                    signal_dbm=lvl,
                                )
            except Exception:
                pass

        return WifiStats(
            interface="none",
            connected=False,
            quality=0,
            quality_max=70,
            quality_percent=0.0,
            signal_dbm=-100,
        )

    def _collect_disk(self) -> DiskStats:
        total_gb = 16.0
        used_gb = 4.0
        free_gb = 12.0
        percent = 25.0

        try:
            st = os.statvfs("/")
            total_gb = round((st.f_blocks * st.f_frsize) / (1024**3), 1)
            free_gb = round((st.f_bavail * st.f_frsize) / (1024**3), 1)
            used_gb = round(max(0.0, total_gb - free_gb), 1)
            percent = round((used_gb / total_gb) * 100.0, 1) if total_gb > 0 else 0.0
        except Exception:
            pass

        return DiskStats(
            total_gb=total_gb,
            used_gb=used_gb,
            free_gb=free_gb,
            percent=percent,
        )

    def _collect_daemon(self, connected_clients: int) -> DaemonStats:
        uptime_sec = 0.0
        if Path("/proc/uptime").exists():
            try:
                with open("/proc/uptime", "r", encoding="ascii") as f:
                    uptime_sec = float(f.read().split()[0])
            except Exception:
                uptime_sec = time.time() - self._daemon_start_time
        else:
            uptime_sec = time.time() - self._daemon_start_time

        hours = int(uptime_sec // 3600)
        minutes = int((uptime_sec % 3600) // 60)
        uptime_fmt = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"

        rss_mb = 0.0
        if Path("/proc/self/status").exists():
            try:
                with open("/proc/self/status", "r", encoding="ascii") as f:
                    for line in f:
                        if line.startswith("VmRSS:"):
                            parts = line.split(":", 1)[1].strip().split()
                            rss_mb = round(float(parts[0]) / 1024.0, 1)
                            break
            except Exception:
                pass

        return DaemonStats(
            uptime_seconds=round(uptime_sec, 1),
            uptime_formatted=uptime_fmt,
            daemon_rss_mb=rss_mb,
            connected_clients=connected_clients,
        )


def get_system_stats(connected_clients: int = 0) -> Dict[str, Any]:
    """Helper function returning current system metrics as a serializable dict."""
    return SystemStatsCollector.get_instance().get_stats(connected_clients).to_dict()
