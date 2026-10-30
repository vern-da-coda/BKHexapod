/**
 * Domain Type Definitions & Telemetry Contracts (`lasius-dashboard/src/types/index.ts`).
 *
 * Purpose & Role:
 *   Centralizes all TypeScript interfaces and union types shared between the
 *   Pinia `dashboardStore`, the Three.js/2D `LasiusGraphicsEngine`, and the
 *   Vue 3 UI components. Mirrors the JSON schemas of the Python `LasiusServer`
 *   WebSocket and REST APIs.
 *
 * Key Interfaces:
 *   - `LegKey`, `JointName`, `GaitPattern`: Core anatomical and gait union types.
 *   - `LegDefinition`, `RobotLayout`: Physical chassis & limb geometry payload.
 *   - `ServoCalibrationItem`: Runtime servo trim & Option C calibration overlay entry.
 *   - `SystemStats`: Raspberry Pi CPU, RAM, thermal, power/throttling, Wi-Fi & daemon KPIs.
 */
export type LegKey = 'left_front' | 'left_middle' | 'left_rear' | 'right_front' | 'right_middle' | 'right_rear';
export type JointName = 'coxa' | 'femur' | 'tibia';
export type GaitPattern = 'tripod' | 'ripple' | 'wave';
export type GamepadProfile = string; // 'auto' | 'ps5' | 'stadia' | 'xbox' | custom YAML profile ID

export interface GamepadButtonsSpec {
  gait_tripod: number;
  gait_ripple: number;
  gait_wave: number;
  emergency_stop: number[];
  speed_down: number;
  speed_up: number;
  reset_pose: number;
  toggle_pause: number;
  dpad_up?: number | null;
  dpad_down?: number | null;
}

export interface GamepadProfileDefinition {
  id: string;
  name: string;
  short_label: string;
  deadzone: number;
  match_keywords: string[];
  axes: {
    walk_x: number;
    walk_y: number;
    invert_walk_y: boolean;
    turn_z: number;
    turn_z_standard: number;
    invert_turn_z: boolean;
    dpad_y: number;
  };
  buttons: GamepadButtonsSpec;
  buttons_standard: GamepadButtonsSpec;
  labels: {
    gaits: string;
    estop: string;
    extras: string;
    cli_gait_hint?: string;
    cli_estop_hint?: string;
    cli_pose_hint?: string;
  };
}

export interface LegDefinition {
  mount_point: { x: number; y: number };
  base_angle: number;
  coxa: { name: string; length: number; channel?: number };
  femur: { name: string; length: number; channel?: number };
  tibia: { name: string; length: number; channel?: number };
}

export interface RobotLayout {
  body?: {
    width?: number;
    length?: number;
    width_front_rear?: number;
    width_middle?: number;
    axis_distance_longitudinal?: number;
    vertices?: Array<{ x: number; y: number }>;
  };
  legs?: Record<LegKey, LegDefinition>;
}

export interface JointLimits {
  minAngle: number;
  maxAngle: number;
}

export interface ServoCalibrationItem {
  name: string;
  channel?: number | string;
  board_address?: number;
  center_offset_pulse?: number;
  orientation?: number;
  min_angle?: number;
  max_angle?: number;
  is_overridden?: boolean;
}

export interface CpuStats {
  load_1m: number;
  load_5m: number;
  load_15m: number;
  percent: number;
  count: number;
}

export interface MemoryStats {
  total_mb: number;
  used_mb: number;
  free_mb: number;
  available_mb: number;
  percent: number;
}

export interface ThermalStats {
  temp_c: number;
  status: string;
}

export interface PowerStats {
  throttled_raw: string;
  healthy: boolean;
  under_voltage_active: boolean;
  under_voltage_occurred: boolean;
  arm_freq_capped_active?: boolean;
  arm_freq_capped_occurred?: boolean;
  throttled_active: boolean;
  throttled_occurred?: boolean;
  soft_temp_active?: boolean;
  soft_temp_occurred?: boolean;
  status_text: string;
}

export interface WifiStats {
  interface: string;
  connected: boolean;
  quality: number;
  quality_max: number;
  quality_percent: number;
  signal_dbm: number;
}

export interface DiskStats {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  percent: number;
}

export interface DaemonStats {
  uptime_seconds: number;
  uptime_formatted: string;
  daemon_rss_mb: number;
  connected_clients: number;
}

export interface SystemStats {
  timestamp: number;
  cpu: CpuStats;
  memory: MemoryStats;
  thermal: ThermalStats;
  power: PowerStats;
  wifi: WifiStats;
  disk: DiskStats;
  daemon: DaemonStats;
}
