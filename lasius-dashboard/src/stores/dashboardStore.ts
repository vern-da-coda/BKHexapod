import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { LegKey, JointName, GaitPattern, SystemStats, RobotLayout, ServoCalibrationItem } from '../types';
import { DEFAULT_ROBOT_LAYOUT } from '../engine/constants';

export const useDashboardStore = defineStore('dashboard', () => {
  // Navigation & Viewport State
  const activeTab = ref<'gait' | 'legs' | 'tests' | 'system'>('gait');
  const is2DCollapsed = ref(false);
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
    sendCommand({ action: 'set_walk', x, y });
    sendCommand({ action: 'set_turn', z: turn });
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

  // Tests & Safety
  function runStepTest() {
    const leg = selectedLegKey.value;
    const cycles = testCycles.value || 5;
    sendCommand({ action: 'test_leg', leg, cycles, stride: 36.0, lift: 30.0 });
    appendOrderLog(`Test run: ${leg} (${cycles} cycles)`, 'running');
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
    allStance,
    relaxAll,
    estop
  };
});
