<script setup lang="ts">
/**
 * Root Application Shell & Lifecycle Coordinator (`lasius-dashboard/src/App.vue`).
 *
 * Purpose & Role:
 *   Coordinates the top-level layout (AppHeader, 2D Orthographic Strip, 3D Digital
 *   Twin Viewport, and 4-Tab Control Sidebar), manages the persistent WebSocket
 *   connection to `ws://<host>:8765`, binds global keyboard teleoperation
 *   (`WASD`, `QE`, `Arrows`, `Space` with automatic `keyup` stop), and drives
 *   periodic `/api/v1/system/stats` polling.
 */
import { ref, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue';
import { useDashboardStore } from './stores/dashboardStore';
import { LasiusGraphicsEngine } from './engine/lasiusGraphics';

import AppHeader from './components/AppHeader.vue';
import OrthogonalStrip2D from './components/OrthogonalStrip2D.vue';
import DigitalTwin3D from './components/DigitalTwin3D.vue';
import Sidebar from './components/sidebar/Sidebar.vue';

const store = useDashboardStore();

const strip2dRef = ref<InstanceType<typeof OrthogonalStrip2D> | null>(null);
const twin3dRef = ref<InstanceType<typeof DigitalTwin3D> | null>(null);

// Non-reactive Three.js engine held in shallowRef to prevent Vue proxy overhead
const engineRef = shallowRef<LasiusGraphicsEngine | null>(null);

const showShutdownOverlay = ref(false);

let pollTimer: number | null = null;
let gamepadTimer: number | null = null;
let ws: WebSocket | null = null;

// HTML5 Gamepad API state (driven by declarative YAML profiles in store.gamepadProfiles)
let prevGamepadCmd = { walkX: 0, walkY: 0, turnZ: 0 };
let prevButtons: boolean[] = [];
let prevDpadUp = false;
let prevDpadDown = false;

function applyDeadzone(val: number, deadzone = 0.12): number {
  if (Math.abs(val) < deadzone) return 0.0;
  const sign = val > 0 ? 1.0 : -1.0;
  const scaled = (Math.abs(val) - deadzone) / (1.0 - deadzone);
  return sign * Math.min(1.0, scaled);
}

function handleGamepadConnected(e: GamepadEvent) {
  store.gamepadConnected = true;
  store.gamepadId = e.gamepad.id || 'Gamepad Connected';
  store.setGamepadProfile(store.gamepadProfile);
  const cfg = store.gamepadProfiles[store.resolvedGamepadProfile];
  store.showToast(`Controller connected: ${cfg ? cfg.name : store.resolvedGamepadProfile.toUpperCase()}`, 'success');
}

function handleGamepadDisconnected() {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  if (pads.length === 0) {
    store.gamepadConnected = false;
    store.gamepadId = 'No Controller';
    prevGamepadCmd = { walkX: 0, walkY: 0, turnZ: 0 };
    prevButtons = [];
    store.dpadStop();
  }
}

function pollGamepad() {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  const gp = pads[0] || pads[1] || pads[2] || pads[3];
  if (!gp) {
    if (store.gamepadConnected) {
      store.gamepadConnected = false;
      store.gamepadId = 'No Controller';
    }
    return;
  }

  if (!store.gamepadConnected || store.gamepadId !== gp.id) {
    store.gamepadConnected = true;
    store.gamepadId = gp.id || 'USB / Bluetooth Gamepad';
    store.setGamepadProfile(store.gamepadProfile);
  }

  const cfg = store.gamepadProfiles[store.resolvedGamepadProfile] || Object.values(store.gamepadProfiles)[0];
  if (!cfg) return;

  const dz = cfg.deadzone ?? 0.12;
  const isStandardMapping = gp.mapping === 'standard';
  const axesCfg = cfg.axes;

  // 1. Analog Sticks: Walk X, Walk Y, Turn Z (from YAML profile)
  const rawX = applyDeadzone(gp.axes[axesCfg.walk_x] ?? 0.0, dz);
  const rawWalkYAxis = gp.axes[axesCfg.walk_y] ?? 0.0;
  const rawY = applyDeadzone(axesCfg.invert_walk_y ? -rawWalkYAxis : rawWalkYAxis, dz);

  let rawTurnAxis = 0.0;
  if (isStandardMapping) {
    rawTurnAxis = gp.axes[axesCfg.turn_z_standard] ?? 0.0;
  } else {
    const primaryTurnIdx = axesCfg.turn_z;
    const candidate = gp.axes[primaryTurnIdx] ?? 0.0;
    // Guard against unpressed analog L2 trigger resting at -1.0 on Axis 2
    if (primaryTurnIdx === 2 && Math.abs(candidate + 1.0) < 0.08 && gp.axes.length > 3) {
      rawTurnAxis = gp.axes[3] ?? 0.0;
    } else {
      rawTurnAxis = candidate;
    }
  }
  const scaledTurn = applyDeadzone(rawTurnAxis, dz);
  const rawTurn = axesCfg.invert_turn_z ? -scaledTurn : scaledTurn;

  const wx = Number(rawX.toFixed(2));
  const wy = Number(rawY.toFixed(2));
  const tz = Number((rawTurn === 0 ? 0 : rawTurn).toFixed(2));

  if (wx !== prevGamepadCmd.walkX || wy !== prevGamepadCmd.walkY || tz !== prevGamepadCmd.turnZ) {
    prevGamepadCmd = { walkX: wx, walkY: wy, turnZ: tz };
    if (wx === 0 && wy === 0 && tz === 0) {
      store.dpadStop();
    } else {
      store.dpadWalk(wx, wy, tz);
    }
  }

  // 2. Discrete Buttons (from YAML profile: buttons_standard for W3C, buttons for raw Linux)
  const btns = gp.buttons.map(b => b.pressed);
  const wasPressed = (idx: number | null | undefined) => idx !== null && idx !== undefined && Boolean(btns[idx] && !prevButtons[idx]);
  const btnMap = isStandardMapping ? cfg.buttons_standard : cfg.buttons;

  if (btnMap.emergency_stop.some(idx => wasPressed(idx))) store.estop();
  if (wasPressed(btnMap.gait_tripod)) store.setGait('tripod');
  if (wasPressed(btnMap.gait_ripple)) store.setGait('ripple');
  if (wasPressed(btnMap.gait_wave)) store.setGait('wave');
  if (wasPressed(btnMap.speed_down)) store.setSpeed(Math.max(0.2, Number((store.gaitSpeed - 0.2).toFixed(1))));
  if (wasPressed(btnMap.speed_up)) store.setSpeed(Math.min(3.0, Number((store.gaitSpeed + 0.2).toFixed(1))));
  if (wasPressed(btnMap.reset_pose)) store.resetPose();
  if (wasPressed(btnMap.toggle_pause)) store.togglePause();

  if (isStandardMapping && btnMap.dpad_up !== undefined && btnMap.dpad_down !== undefined) {
    if (wasPressed(btnMap.dpad_up)) store.setHeight(Math.max(-110, store.attitudeHeight - 5));
    if (wasPressed(btnMap.dpad_down)) store.setHeight(Math.min(-50, store.attitudeHeight + 5));
  } else if (gp.axes.length > axesCfg.dpad_y) {
    const dpadY = gp.axes[axesCfg.dpad_y] ?? 0.0;
    const isUp = dpadY < -0.5;
    const isDown = dpadY > 0.5;
    if (isUp && !prevDpadUp) store.setHeight(Math.max(-110, store.attitudeHeight - 5));
    if (isDown && !prevDpadDown) store.setHeight(Math.min(-50, store.attitudeHeight + 5));
    prevDpadUp = isUp;
    prevDpadDown = isDown;
  }

  prevButtons = btns;
}

function toggle2D() {
  store.is2DCollapsed = !store.is2DCollapsed;
  setTimeout(() => {
    engineRef.value?.resize();
  }, 40);
}

function resetCam() {
  engineRef.value?.resetCamera();
}

function toggleFootTrails() {
  store.showFootTrails = !store.showFootTrails;
  engineRef.value?.setShowFootTrails(store.showFootTrails);
}

function toggleGroundLock() {
  store.groundLocked = !store.groundLocked;
  engineRef.value?.setGroundLocked(store.groundLocked);
  store.showToast(
    store.groundLocked
      ? 'Ground Lock ON: Chassis moves & tilts with ground contact'
      : 'Test Stand Mode: Chassis fixed in space',
    'info',
    2200
  );
}

// Keyboard controls (WASD, QE, Arrows, Space)
const MOTION_KEYS = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
]);
const activeKeys = new Set<string>();

function handleKeyDown(e: KeyboardEvent) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === 'Space' && !e.repeat) {
    activeKeys.clear();
    store.dpadStop();
    return;
  }
  if (!MOTION_KEYS.has(e.code) || activeKeys.has(e.code)) {
    return;
  }

  activeKeys.add(e.code);
  applyKeyboardMotion();
}

function handleKeyUp(e: KeyboardEvent) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    return;
  }
  if (!activeKeys.delete(e.code)) {
    return;
  }
  applyKeyboardMotion();
}

function applyKeyboardMotion() {
  let wx = 0.0;
  let wy = 0.0;
  let tz = 0.0;

  if (activeKeys.has('KeyW') || activeKeys.has('ArrowUp')) wy += 1.0;
  if (activeKeys.has('KeyS') || activeKeys.has('ArrowDown')) wy -= 1.0;
  if (activeKeys.has('KeyA') || activeKeys.has('ArrowLeft')) wx -= 1.0;
  if (activeKeys.has('KeyD') || activeKeys.has('ArrowRight')) wx += 1.0;
  if (activeKeys.has('KeyQ')) tz += 1.0;
  if (activeKeys.has('KeyE')) tz -= 1.0;

  if (wx !== 0.0 && wy !== 0.0) {
    const inv = 1.0 / Math.hypot(wx, wy);
    wx = Number((wx * inv).toFixed(2));
    wy = Number((wy * inv).toFixed(2));
  }

  if (activeKeys.size === 0 || (wx === 0.0 && wy === 0.0 && tz === 0.0)) {
    store.dpadStop();
    return;
  }

  store.dpadWalk(wx, wy, tz);
}

// WebSocket Connection
function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = window.location.hostname || 'localhost';
  const wsUrl = `${wsProtocol}//${wsHost}:8765`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      store.connectionStatus = 'Connected';
      store.setWebSocket(ws);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        store.handleIncomingMessage(msg);

        if (msg.type === 'layout' && msg.data) {
          engineRef.value?.buildThreeJSRobot(msg.data);
        } else if (msg.type === 'angles' && msg.data) {
          engineRef.value?.setJointAngles(msg.data);
        }
      } catch (err) {
        console.error('Error processing websocket message:', err);
      }
    };

    ws.onclose = () => {
      ws = null;
      store.setWebSocket(null);
      store.connectionStatus = 'Disconnected';
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      store.connectionStatus = 'Disconnected';
    };
  } catch (e) {
    setTimeout(connectWebSocket, 3000);
  }
}

// Polling Fallback for system stats and initial state
async function pollBackend() {
  try {
    const res = await fetch('/api/v1/system/stats');
    if (res.ok) {
      store.systemStats = await res.json();
    }
  } catch {
    // ignore
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('gamepadconnected', handleGamepadConnected);
  window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
  gamepadTimer = window.setInterval(pollGamepad, 30);

  // Initialize Graphics Engine
  if (
    twin3dRef.value?.threeContainerRef &&
    strip2dRef.value?.topCanvasRef &&
    strip2dRef.value?.frontCanvasRef &&
    strip2dRef.value?.sideCanvasRef
  ) {
    const engine = new LasiusGraphicsEngine(
      {
        threeContainer: twin3dRef.value.threeContainerRef,
        topCanvas: strip2dRef.value.topCanvasRef,
        frontCanvas: strip2dRef.value.frontCanvasRef,
        sideCanvas: strip2dRef.value.sideCanvasRef
      },
      {
        onSelectLeg: (legKey) => {
          store.selectLeg(legKey as any);
        },
        onHoverJoint: (joint) => {
          store.hoveredJoint = joint;
        }
      }
    );

    engine.buildThreeJSRobot(store.robotLayout);
    engine.setSelectedLegKey(store.selectedLegKey);
    engine.setJointAngles(store.jointAngles);
    engineRef.value = engine;
  }

  // Load initial layout, calibration & YAML gamepad profiles from REST API
  try {
    const [robotRes] = await Promise.all([
      fetch('/api/v1/robot'),
      store.fetchCalibrationData(),
      store.fetchGamepadProfiles()
    ]);
    if (robotRes.ok) {
      const data = await robotRes.json();
      if (data && data.legs) {
        store.robotLayout = data;
        engineRef.value?.buildThreeJSRobot(data);
      }
    }
  } catch {
    // defaults
  }

  connectWebSocket();
  pollBackend();
  pollTimer = window.setInterval(pollBackend, 2000);
});

// Reactivity bridges to Three.js & 2D Engine
watch(
  () => store.jointAngles,
  (angles) => {
    engineRef.value?.setJointAngles(angles);
  },
  { deep: true }
);

watch(
  () => store.selectedLegKey,
  (legKey) => {
    engineRef.value?.setSelectedLegKey(legKey);
  }
);

watch(
  () => store.hoveredJoint,
  (joint) => {
    engineRef.value?.setCurrentHoveredJoint(joint);
  }
);

watch(
  () => store.calibrationData,
  (data) => {
    engineRef.value?.setCalibrationData(data);
  },
  { deep: true }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('gamepadconnected', handleGamepadConnected);
  window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
  if (gamepadTimer) {
    clearInterval(gamepadTimer);
    gamepadTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  engineRef.value?.destroy();
  engineRef.value = null;
});
</script>

<template>
  <AppHeader @show-shutdown-dialog="showShutdownOverlay = true" />

  <main class="container">
    <!-- COLUMN 1: 2D Orthogonal Strip (Top XY, Front XZ, Side YZ) -->
    <OrthogonalStrip2D
      ref="strip2dRef"
      :is-collapsed="store.is2DCollapsed"
    />

    <!-- COLUMN 2: 3D Digital Twin (Center Stage) -->
    <DigitalTwin3D
      ref="twin3dRef"
      :is-collapsed="store.is2DCollapsed"
      :show-foot-trails="store.showFootTrails"
      :ground-locked="store.groundLocked"
      @toggle-2d="toggle2D"
      @toggle-trails="toggleFootTrails"
      @toggle-ground-lock="toggleGroundLock"
      @reset-cam="resetCam"
    />

    <!-- COLUMN 3: Right Sidebar with Tabs -->
    <Sidebar />
  </main>

  <!-- Persistent Shutdown Modal Overlay -->
  <div v-if="showShutdownOverlay" class="shutdown-overlay">
    <div class="shutdown-dialog">
      <div class="shutdown-icon">⏻</div>
      <h2>Robot Powered Down</h2>
      <p>All 18 servos are relaxed and Raspberry Pi is shut down safely.</p>
      <p class="shutdown-hint">You may now safely turn off the main battery switch.</p>
      <button class="btn btn-secondary" style="margin-top: 14px;" @click="showShutdownOverlay = false">
        Close Overlay
      </button>
    </div>
  </div>

  <!-- Floating Toast Notifications Container -->
  <div id="toast-container" class="toast-container">
    <div
      v-for="t in store.toasts"
      :key="t.id"
      class="floating-toast show"
      :class="t.type"
      @click="store.toasts = store.toasts.filter(item => item.id !== t.id)"
      title="Click to dismiss"
    >
      {{ t.text }}
    </div>
  </div>
</template>
