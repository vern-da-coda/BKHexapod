/**
 * Central Pinia Telemetry, Control & Calibration Store (`lasius-dashboard/src/stores/dashboardStore.ts`).
 *
 * Purpose & Role:
 *   Acts as the single source of truth (`useDashboardStore`) for the Lasius
 *   Dashboard SPA. Manages the WebSocket connection state, incoming 50 Hz joint
 *   angle streams, locomotion/pose vectors, Option C servo calibration state,
 *   order execution history, and Raspberry Pi system telemetry.
 *
 * Responsibilities:
 *   - Dispatches real-time WebSocket commands (`set_velocity`, `set_joint_angle`,
 *     `set_pose`, `set_gait_type`, etc.) and REST API calls (`/api/v1/calibration/...`).
 *   - Synchronizes bidirectional state updates broadcast by `LasiusServer`.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type {
  LegKey,
  JointName,
  GaitPattern,
  GamepadProfile,
  GamepadProfileDefinition,
  SystemStats,
  RobotLayout,
  ServoCalibrationItem
} from '../types';
import { DEFAULT_ROBOT_LAYOUT } from '../engine/constants';

const DEFAULT_GAMEPAD_PROFILES: Record<string, GamepadProfileDefinition> = {
  ps5: {
    id: 'ps5',
    name: 'Sony PS5 DualSense',
    short_label: 'PS5',
    deadzone: 0.12,
    match_keywords: ['dualsense', 'dualshock', 'wireless controller', 'sony', 'playstation', '054c', 'ps5', 'ps4'],
    axes: { walk_x: 0, walk_y: 1, invert_walk_y: true, turn_z: 3, turn_z_standard: 2, invert_turn_z: true, dpad_y: 7 },
    buttons: { gait_tripod: 0, gait_ripple: 3, gait_wave: 2, emergency_stop: [1, 10], speed_down: 4, speed_up: 5, reset_pose: 9, toggle_pause: 8 },
    buttons_standard: { gait_tripod: 0, gait_ripple: 2, gait_wave: 3, emergency_stop: [1, 16], speed_down: 4, speed_up: 5, reset_pose: 8, toggle_pause: 9, dpad_up: 12, dpad_down: 13 },
    labels: { gaits: '✕ Tripod · □ Ripple · △ Wave', estop: '○ / PS E-Stop', extras: 'L1/R1 Speed · D-Pad Height · Options Reset' }
  },
  stadia: {
    id: 'stadia',
    name: 'Google Stadia Controller',
    short_label: 'Stadia',
    deadzone: 0.12,
    match_keywords: ['stadia', '18d1', '9400', 'google llc'],
    axes: { walk_x: 0, walk_y: 1, invert_walk_y: true, turn_z: 2, turn_z_standard: 2, invert_turn_z: true, dpad_y: 7 },
    buttons: { gait_tripod: 0, gait_ripple: 2, gait_wave: 3, emergency_stop: [1, 8], speed_down: 4, speed_up: 5, reset_pose: 6, toggle_pause: 7 },
    buttons_standard: { gait_tripod: 0, gait_ripple: 2, gait_wave: 3, emergency_stop: [1, 16], speed_down: 4, speed_up: 5, reset_pose: 8, toggle_pause: 9, dpad_up: 12, dpad_down: 13 },
    labels: { gaits: 'A Tripod · X Ripple · Y Wave', estop: 'B / Stadia E-Stop', extras: 'L1/R1 Speed · D-Pad Height · Options Reset' }
  },
  xbox: {
    id: 'xbox',
    name: 'Xbox / XInput Controller',
    short_label: 'Xbox',
    deadzone: 0.12,
    match_keywords: ['xbox', 'x-box', 'microsoft', '8bitdo', 'xinput', '045e'],
    axes: { walk_x: 0, walk_y: 1, invert_walk_y: true, turn_z: 3, turn_z_standard: 2, invert_turn_z: true, dpad_y: 7 },
    buttons: { gait_tripod: 0, gait_ripple: 2, gait_wave: 3, emergency_stop: [1, 8], speed_down: 4, speed_up: 5, reset_pose: 6, toggle_pause: 7 },
    buttons_standard: { gait_tripod: 0, gait_ripple: 2, gait_wave: 3, emergency_stop: [1, 16], speed_down: 4, speed_up: 5, reset_pose: 8, toggle_pause: 9, dpad_up: 12, dpad_down: 13 },
    labels: { gaits: 'A Tripod · X Ripple · Y Wave', estop: 'B / Guide E-Stop', extras: 'LB/RB Speed · D-Pad Height · View Reset' }
  }
};

export const useDashboardStore = defineStore('dashboard', () => {
  // Navigation & Viewport State
  const activeTab = ref<'gait' | 'legs' | 'tests' | 'system'>('gait');
  const is2DCollapsed = ref(false);
  const showFootTrails = ref(true);
  const groundLocked = ref(true);
  const connectionStatus = ref<'Connected' | 'Live' | 'Connecting...' | 'Disconnected'>('Connecting...');
  const isPaused = ref(false);

  // Active Leg & Joints
  const selectedLegKey = ref<LegKey>('left_rear');
  const hoveredJoint = ref<JointName | null>(null);

  // Robot Layout & Geometry
  const robotLayout = ref<RobotLayout>(DEFAULT_ROBOT_LAYOUT);

  // Live Joint Angles (in degrees)
  const jointAngles = ref<Record<string, number>>({});

  // Initialize joint angles to 0
  if (DEFAULT_ROBOT_LAYOUT.legs) {
    for (const leg of Object.values(DEFAULT_ROBOT_LAYOUT.legs)) {
      jointAngles.value[leg.coxa.name] = 0;
      jointAngles.value[leg.femur.name] = 0;
      jointAngles.value[leg.tibia.name] = 0;
    }
  }

  // Gait & Locomotion State
  const currentGait = ref<GaitPattern>('tripod');
  const gaitSpeed = ref(1.0);
  const gaitStepHeight = ref(30);
  const gaitStepLength = ref(50);
  const walkX = ref(0.0);
  const walkY = ref(0.0);
  const turnZ = ref(0.0);

  // Body Attitude
  const attitudeHeight = ref(-80);
  const attitudeRoll = ref(0);
  const attitudePitch = ref(0);

  // Calibration Overlay
  const calibrationData = ref<Record<string, ServoCalibrationItem>>({});

  // System Telemetry
  const systemStats = ref<SystemStats | null>(null);

  // Order Log
  const orderLog = ref<Array<{ id: string; time: string; text: string; status?: string }>>([
    { id: '1', time: new Date().toLocaleTimeString(), text: 'Dashboard initialized' }
  ]);
  const orderStatusBadge = ref('Ready');
  const orderStatusBadgeClass = ref('badge-status-idle');

  // Test Cycles
  const testCycles = ref(5);

  // Gamepad Teleoperation State (HTML5 Gamepad API + YAML Profiles)
  const gamepadProfiles = ref<Record<string, GamepadProfileDefinition>>(DEFAULT_GAMEPAD_PROFILES);
  const gamepadProfile = ref<GamepadProfile>('auto');
  const gamepadConnected = ref(false);
  const gamepadId = ref<string>('No Controller');
  const resolvedGamepadProfile = ref<string>('ps5');

  // Toast Notifications
  const toasts = ref<Array<{ id: string; text: string; type: string }>>([]);

  // WebSocket reference (set by App.vue)
  let activeWs: WebSocket | null = null;

  function setWebSocket(ws: WebSocket | null) {
    activeWs = ws;
  }

  function showToast(text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration = 3000) {
    const id = Math.random().toString(36).substring(2, 7);
    toasts.value.push({ id, text, type });
    if (duration > 0) {
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id);
      }, duration);
    }
  }

  function appendOrderLog(text: string, status?: string) {
    orderLog.value.unshift({
      id: Math.random().toString(36).substring(2, 7),
      time: new Date().toLocaleTimeString(),
      text,
      status
    });
    if (orderLog.value.length > 25) {
      orderLog.value.pop();
    }
  }

  // Unified Command Sender: prefers active WebSocket, falls back to REST API
  function sendCommand(cmd: Record<string, any>) {
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({ type: 'command', ...cmd }));
    } else {
      fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd)
      }).catch(err => {
        console.warn('[Command Fallback] REST order failed:', err);
      });
    }
  }

  // Handle incoming messages from WebSocket
  function handleIncomingMessage(msg: { type: string; data?: any }) {
    if (!msg || !msg.type) return;

    if (msg.type === 'layout' && msg.data) {
      robotLayout.value = msg.data;
      connectionStatus.value = 'Live';
    } else if (msg.type === 'angles' && msg.data) {
      Object.assign(jointAngles.value, msg.data);
    } else if (msg.type === 'state' && msg.data) {
      const s = msg.data;
      if (s.is_paused !== undefined) isPaused.value = s.is_paused;
      if (s.gait_speed !== undefined) gaitSpeed.value = Number(s.gait_speed);
      if (s.step_height !== undefined) gaitStepHeight.value = Number(s.step_height);
      if (s.step_length !== undefined) gaitStepLength.value = Number(s.step_length);
      if (s.gait_type !== undefined) currentGait.value = s.gait_type;
      if (s.walk_x !== undefined) walkX.value = Number(s.walk_x);
      if (s.walk_y !== undefined) walkY.value = Number(s.walk_y);
      if (s.turn_z !== undefined) turnZ.value = Number(s.turn_z);
      if (s.body_height !== undefined) attitudeHeight.value = Number(s.body_height);
      if (s.body_roll !== undefined) attitudeRoll.value = Number(s.body_roll);
      if (s.body_pitch !== undefined) attitudePitch.value = Number(s.body_pitch);
    } else if (msg.type === 'order_status' && msg.data) {
      orderStatusBadge.value = `${msg.data.status.toUpperCase()}: ${msg.data.action}`;
      orderStatusBadgeClass.value = 'badge-status-running';
      appendOrderLog(`Order ${msg.data.order_id} (${msg.data.action}): ${msg.data.status}`, 'running');
    } else if (msg.type === 'order_result' && msg.data) {
      const isOk = msg.data.status === 'completed';
      orderStatusBadge.value = isOk ? 'Ready' : 'Failed';
      orderStatusBadgeClass.value = isOk ? 'badge-status-idle' : 'badge-status-running';
      const duration = msg.data.duration_ms ? ` (${Math.round(msg.data.duration_ms)}ms)` : '';
      appendOrderLog(`Order ${msg.data.order_id} (${msg.data.action}): ${msg.data.message || msg.data.status}${duration}`, isOk ? 'success' : 'error');
    } else if (msg.type === 'system_stats' && msg.data) {
      systemStats.value = msg.data;
    }
  }

  // Active Leg selection
  function selectLeg(legKey: LegKey) {
    selectedLegKey.value = legKey;
  }

  function getLegServoNames(legKey: LegKey) {
    if (robotLayout.value.legs && robotLayout.value.legs[legKey]) {
      return {
        coxa: robotLayout.value.legs[legKey].coxa.name,
        femur: robotLayout.value.legs[legKey].femur.name,
        tibia: robotLayout.value.legs[legKey].tibia.name
      };
    }
    return {
      coxa: `${legKey}_coxa`,
      femur: `${legKey}_femur`,
      tibia: `${legKey}_tibia`
    };
  }

  // Locomotion & Gait Actions
  function setGait(pattern: GaitPattern) {
    currentGait.value = pattern;
    sendCommand({ action: 'set_gait', value: pattern });
  }

  function dpadWalk(x: number, y: number, turn = 0) {
    walkX.value = x;
    walkY.value = y;
    turnZ.value = turn;
    sendCommand({ action: 'set_velocity', walk_x: x, walk_y: y, turn_z: turn });
  }

  function setGamepadProfile(profile: GamepadProfile) {
    gamepadProfile.value = profile;
    if (profile !== 'auto' && gamepadProfiles.value[profile]) {
      resolvedGamepadProfile.value = profile;
      return;
    }
    const idLower = gamepadId.value.toLowerCase();
    for (const [profId, profCfg] of Object.entries(gamepadProfiles.value)) {
      if (profCfg.match_keywords.some(kw => idLower.includes(kw.toLowerCase()))) {
        resolvedGamepadProfile.value = profId;
        return;
      }
    }
    resolvedGamepadProfile.value = gamepadProfiles.value['ps5'] ? 'ps5' : Object.keys(gamepadProfiles.value)[0] || 'ps5';
  }

  async function fetchGamepadProfiles() {
    try {
      const resp = await fetch('/api/v1/gamepads');
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.profiles && Object.keys(data.profiles).length > 0) {
          gamepadProfiles.value = data.profiles;
          setGamepadProfile(gamepadProfile.value);
        }
      }
    } catch {
      // Fallback to built-in profiles
    }
  }

  function dpadStop() {
    walkX.value = 0;
    walkY.value = 0;
    turnZ.value = 0;
    sendCommand({ action: 'stop_motion' });
  }

  function togglePause() {
    sendCommand({ action: 'toggle_pause' });
  }

  function setSpeed(val: number) {
    gaitSpeed.value = val;
    sendCommand({ action: 'set_speed', value: val });
  }

  function setStepHeight(val: number) {
    gaitStepHeight.value = val;
    sendCommand({ action: 'set_step_height', value: val });
  }

  function setStepLength(val: number) {
    gaitStepLength.value = val;
    sendCommand({ action: 'set_step_length', value: val });
  }

  // Body Attitude
  function setHeight(val: number) {
    attitudeHeight.value = val;
    sendCommand({ action: 'set_height', value: val });
  }

  function setRoll(val: number) {
    attitudeRoll.value = val;
    sendCommand({ action: 'set_roll', value: val });
  }

  function setPitch(val: number) {
    attitudePitch.value = val;
    sendCommand({ action: 'set_pitch', value: val });
  }

  function resetPose() {
    attitudeHeight.value = -80;
    attitudeRoll.value = 0;
    attitudePitch.value = 0;
    sendCommand({ action: 'reset_pose' });
  }

  // Leg Actions
  function setJointAngle(servo: string, angle: number) {
    jointAngles.value[servo] = angle;
    sendCommand({ action: 'set_joint_angle', servo, angle });
  }

  function alignLegRef() {
    const legKey = selectedLegKey.value;
    const names = getLegServoNames(legKey);
    jointAngles.value[names.coxa] = 0;
    jointAngles.value[names.femur] = 0;
    jointAngles.value[names.tibia] = 0;
    sendCommand({
      action: 'set_leg_joints',
      leg: legKey,
      coxa: 0.0,
      femur: 0.0,
      tibia: 0.0,
      isolate: true
    });
    showToast(`${legKey} aligned to 0° reference pose. Other legs relaxed.`, 'success');
  }

  function stanceLeg() {
    sendCommand({ action: 'stance_leg', leg: selectedLegKey.value });
    showToast(`Adopted stance position for ${selectedLegKey.value}`, 'info');
  }

  function relaxLeg() {
    sendCommand({ action: 'relax_leg', leg: selectedLegKey.value });
    showToast(`Relaxed ${selectedLegKey.value} (PWM disabled)`, 'warning');
  }

  async function resetLegCalibration() {
    const legKey = selectedLegKey.value;
    if (!confirm(`Revert calibration overrides for ${legKey} to factory defaults?`)) return;
    try {
      const resp = await fetch('/api/v1/calibration/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leg: legKey })
      });
      if (resp.ok) {
        showToast(`Reverted ${legKey} to factory settings.`, 'success');
        await fetchCalibrationData();
      } else {
        showToast(`Reset error: ${resp.statusText}`, 'error');
      }
    } catch (e: any) {
      showToast(`Network error: ${e.message}`, 'error');
    }
  }

  // Calibration API
  async function fetchCalibrationData() {
    try {
      const resp = await fetch('/api/v1/calibration');
      if (resp.ok) {
        const data = await resp.json();
        calibrationData.value = data.servos || {};
      }
    } catch (e) {
      console.warn('[Calibration] Failed to fetch:', e);
    }
  }

  function applyLiveLimits(jointType: JointName, minAngle: number, maxAngle: number) {
    const names = getLegServoNames(selectedLegKey.value);
    const sName = names[jointType];
    const sData = calibrationData.value[sName] || {
      name: sName,
      center_offset_pulse: 0,
      orientation: 1,
      min_angle: minAngle,
      max_angle: maxAngle,
      is_overridden: true
    };
    sData.min_angle = minAngle;
    sData.max_angle = maxAngle;
    sData.is_overridden = true;
    calibrationData.value[sName] = sData;

    sendCommand({
      action: 'calibrate_trim',
      servo: sName,
      min_angle: minAngle,
      max_angle: maxAngle,
      offset: sData.center_offset_pulse || 0,
      orientation: sData.orientation || 1
    });
    showToast(`Auto-saved ${sName} limits: [${minAngle}°, ${maxAngle}°]`, 'success');
  }

  function applyLiveTrimAbsolute(jointType: JointName, targetOffset: number, notify = true) {
    const names = getLegServoNames(selectedLegKey.value);
    const sName = names[jointType];
    const clamped = Math.max(-1000, Math.min(1000, targetOffset));
    const sData = calibrationData.value[sName] || {
      name: sName,
      center_offset_pulse: 0,
      orientation: 1,
      min_angle: jointType === 'tibia' ? -60 : -45,
      max_angle: jointType === 'tibia' ? 60 : 45,
      is_overridden: true
    };
    sData.center_offset_pulse = clamped;
    sData.is_overridden = true;
    calibrationData.value[sName] = sData;

    sendCommand({
      action: 'calibrate_trim',
      servo: sName,
      offset: clamped,
      orientation: sData.orientation || 1,
      min_angle: sData.min_angle,
      max_angle: sData.max_angle,
      angle: 0.0
    });

    if (notify) {
      const sign = clamped > 0 ? '+' : '';
      showToast(`Auto-saved ${sName} trim: ${sign}${clamped} µs`, 'success');
    }
  }

  function applyLiveTrimStep(jointType: JointName, delta: number) {
    const names = getLegServoNames(selectedLegKey.value);
    const sName = names[jointType];
    const cur = (calibrationData.value[sName]?.center_offset_pulse) ?? 0;
    const newOffset = delta === 0 ? 0 : cur + delta;
    applyLiveTrimAbsolute(jointType, newOffset, true);
  }

  function applyLiveOrientation(jointType: JointName, isInverted: boolean) {
    const names = getLegServoNames(selectedLegKey.value);
    const sName = names[jointType];
    const newOrient = isInverted ? -1 : 1;
    const sData = calibrationData.value[sName] || {
      name: sName,
      center_offset_pulse: 0,
      orientation: 1,
      min_angle: jointType === 'tibia' ? -60 : -45,
      max_angle: jointType === 'tibia' ? 60 : 45,
      is_overridden: true
    };
    sData.orientation = newOrient;
    sData.is_overridden = true;
    calibrationData.value[sName] = sData;

    sendCommand({
      action: 'calibrate_trim',
      servo: sName,
      orientation: newOrient,
      offset: sData.center_offset_pulse || 0,
      min_angle: sData.min_angle,
      max_angle: sData.max_angle,
      angle: 0.0
    });
    showToast(`Auto-saved ${sName} orientation: ${isInverted ? 'Inverted (-1)' : 'Normal (+1)'}`, 'success');
  }

  function testJointRange(jointType: JointName) {
    const names = getLegServoNames(selectedLegKey.value);
    const sName = names[jointType];
    const sData = calibrationData.value[sName] || {};
    const minVal = sData.min_angle !== undefined ? sData.min_angle : (jointType === 'tibia' ? -60 : -45);
    const maxVal = sData.max_angle !== undefined ? sData.max_angle : (jointType === 'tibia' ? 60 : 45);

    sendCommand({
      action: 'sweep_joint',
      servo: sName,
      min_angle: minVal,
      max_angle: maxVal
    });
    showToast(`Sweeping ${sName} range [${minVal}°, ${maxVal}°]...`, 'success');
  }

  function runCollisionSweep(jointType: JointName) {
    const names = getLegServoNames(selectedLegKey.value);
    const sName = names[jointType];
    const sData = calibrationData.value[sName] || {};
    const minVal = sData.min_angle !== undefined ? sData.min_angle : (jointType === 'coxa' ? -45 : -90);
    const maxVal = sData.max_angle !== undefined ? sData.max_angle : (jointType === 'coxa' ? 45 : 90);

    sendCommand({
      action: 'sweep_joint',
      servo: sName,
      min_angle: minVal,
      max_angle: maxVal
    });
    appendOrderLog(`Collision Sweep ${jointType.toUpperCase()}: ${sName} [${minVal}°, ${maxVal}°]`, 'running');
  }

  // Tests, Show Choreographies & Safety
  function runStepTest() {
    const leg = selectedLegKey.value;
    const cycles = testCycles.value || 5;
    sendCommand({ action: 'test_leg', leg, cycles, stride: 36.0, lift: 30.0 });
    appendOrderLog(`Test run: ${leg} (${cycles} cycles)`, 'running');
  }

  function runWaveHello() {
    const leg = selectedLegKey.value.endsWith('front') ? selectedLegKey.value : 'right_front';
    sendCommand({ action: 'wave_hello', leg, cycles: 3 });
    appendOrderLog(`Show Pose: Wave Hello (${leg})`, 'running');
    showToast(`Waving Hello with ${leg}!`, 'info');
  }

  function runPushUps() {
    sendCommand({ action: 'push_ups', cycles: 4, min_z: -50.0, max_z: -108.0 });
    appendOrderLog('Show Pose: Chassis Push-Ups (4 cycles)', 'running');
    showToast('Executing Chassis Push-Ups...', 'info');
  }

  function runBodyCircle() {
    sendCommand({ action: 'body_circle', cycles: 3, amplitude_deg: 14.0 });
    appendOrderLog('Show Pose: 6-DOF Body Circle (3 cycles)', 'running');
    showToast('Executing 6-DOF Body Circle...', 'info');
  }

  function runCrouch() {
    attitudeHeight.value = -48;
    attitudePitch.value = -12;
    attitudeRoll.value = 0;
    sendCommand({ action: 'crouch', height: -48.0, pitch: -12.0, roll: 0.0 });
    appendOrderLog('Show Pose: Stealth Crouch (-48mm, -12° pitch)', 'success');
    showToast('Adopted Stealth Crouch Pose', 'info');
  }

  // Calibration Export & Import (Option C Overlay)
  function exportCalibrationJson() {
    const payload = {
      exported_at: new Date().toISOString(),
      servos: calibrationData.value
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `lasius_calibration_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported calibration JSON profile.', 'success');
  }

  async function importCalibrationJson(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const servosMap = parsed.servos || parsed;
      if (!servosMap || typeof servosMap !== 'object') {
        showToast('Invalid calibration JSON format.', 'error');
        return;
      }

      const batch: Record<string, any> = {};
      for (const [sName, item] of Object.entries(servosMap)) {
        if (item && typeof item === 'object') {
          const entry = item as Record<string, any>;
          batch[sName] = {
            center_offset_pulse: Number(entry.center_offset_pulse ?? 0),
            orientation: Number(entry.orientation ?? 1),
            min_angle: Number(entry.min_angle ?? -45),
            max_angle: Number(entry.max_angle ?? 45)
          };
        }
      }

      const resp = await fetch('/api/v1/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch })
      });
      if (resp.ok) {
        await fetchCalibrationData();
        showToast(`Imported calibration for ${Object.keys(batch).length} servos.`, 'success');
        appendOrderLog(`Imported calibration profile (${file.name})`, 'success');
      } else {
        showToast(`Failed to import calibration: ${resp.statusText}`, 'error');
      }
    } catch (e: any) {
      showToast(`Import error: ${e.message || e}`, 'error');
    }
  }

  function allStance() {
    sendCommand({ action: 'set_pose', height: -80, roll: 0, pitch: 0 });
    appendOrderLog('All legs -> Neutral Stance', 'success');
  }

  function relaxAll() {
    sendCommand({ action: 'relax_all' });
    appendOrderLog('All 18 servos relaxed (Relax All)', 'success');
  }

  function estop() {
    sendCommand({ action: 'emergency_stop', priority: 99 });
    appendOrderLog('EMERGENCY STOP EXECUTED', 'error');
  }

  return {
    activeTab,
    is2DCollapsed,
    showFootTrails,
    groundLocked,
    connectionStatus,
    isPaused,
    selectedLegKey,
    hoveredJoint,
    robotLayout,
    jointAngles,
    currentGait,
    gaitSpeed,
    gaitStepHeight,
    gaitStepLength,
    walkX,
    walkY,
    turnZ,
    attitudeHeight,
    attitudeRoll,
    attitudePitch,
    calibrationData,
    systemStats,
    orderLog,
    orderStatusBadge,
    orderStatusBadgeClass,
    testCycles,
    gamepadProfiles,
    gamepadProfile,
    gamepadConnected,
    gamepadId,
    resolvedGamepadProfile,
    toasts,
    setWebSocket,
    showToast,
    appendOrderLog,
    sendCommand,
    handleIncomingMessage,
    selectLeg,
    getLegServoNames,
    setGait,
    dpadWalk,
    setGamepadProfile,
    fetchGamepadProfiles,
    dpadStop,
    togglePause,
    setSpeed,
    setStepHeight,
    setStepLength,
    setHeight,
    setRoll,
    setPitch,
    resetPose,
    setJointAngle,
    alignLegRef,
    stanceLeg,
    relaxLeg,
    resetLegCalibration,
    fetchCalibrationData,
    applyLiveLimits,
    applyLiveTrimAbsolute,
    applyLiveTrimStep,
    applyLiveOrientation,
    testJointRange,
    runCollisionSweep,
    runStepTest,
    runWaveHello,
    runPushUps,
    runBodyCircle,
    runCrouch,
    exportCalibrationJson,
    importCalibrationJson,
    allStance,
    relaxAll,
    estop
  };
});
