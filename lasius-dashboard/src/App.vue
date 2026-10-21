<script setup lang="ts">
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
let ws: WebSocket | null = null;

function toggle2D() {
  store.is2DCollapsed = !store.is2DCollapsed;
  setTimeout(() => {
    engineRef.value?.resize();
  }, 40);
}

function resetCam() {
  engineRef.value?.resetCamera();
}

// Keyboard controls (WASD, QE, Arrows, Space)
const activeKeys = new Set<string>();

function handleKeyDown(e: KeyboardEvent) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === 'Space' && !e.repeat) {
    store.dpadStop();
    return;
  }

  activeKeys.add(e.code);
  applyKeyboardMotion();
}

function handleKeyUp(e: KeyboardEvent) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    return;
  }
  activeKeys.delete(e.code);
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

  // Load initial layout & calibration from REST API
  try {
    const [robotRes] = await Promise.all([
      fetch('/api/v1/robot'),
      store.fetchCalibrationData()
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
      @toggle-2d="toggle2D"
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
