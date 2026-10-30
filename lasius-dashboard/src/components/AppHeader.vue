<script setup lang="ts">
/**
 * Global Application Header & Safety Action Bar (`lasius-dashboard/src/components/AppHeader.vue`).
 *
 * Purpose & Role:
 *   Renders the top navigation bar featuring brand identity, live WebSocket
 *   connection status badge (`Connected`, `Live`, `Disconnected`), and critical
 *   system-wide safety controls:
 *     - `Restart`: Triggers `/api/v1/server/restart` and polls until the daemon is back online.
 *     - `Shutdown`: Opens the confirmation modal for `/api/v1/server/shutdown`.
 *     - `E-Stop`: Dispatches a Priority-99 Emergency Stop (`store.triggerEmergencyStop()`).
 */
import { ref } from 'vue';
import { useDashboardStore } from '../stores/dashboardStore';

const emit = defineEmits<{
  (e: 'show-shutdown-dialog'): void;
}>();

const store = useDashboardStore();

const isRestarting = ref(false);
const restartText = ref('Restart');
const isShuttingDown = ref(false);
const shutdownText = ref('Shutdown');
const estopText = ref('E-Stop');

async function handleRestart() {
  if (isRestarting.value) return;
  isRestarting.value = true;
  restartText.value = 'Restarting...';
  store.appendOrderLog('Server restart initiated...', 'running');

  try {
    await fetch('/api/v1/server/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    store.appendOrderLog('Restart command accepted. Reconnecting...', 'running');
  } catch (e) {
    console.warn('Restart request sent (server shutting down):', e);
  }

  // Poll until back online
  let attempts = 0;
  const maxAttempts = 25;
  const pollInterval = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch('/api/v1/status');
      if (res.ok) {
        clearInterval(pollInterval);
        isRestarting.value = false;
        restartText.value = 'Restarted';
        store.appendOrderLog('Server back online!', 'success');
        store.showToast('Server back online!', 'success');

        try {
          const r = await fetch('/api/v1/robot');
          if (r.ok) {
            const data = await r.json();
            if (data && data.legs) {
              store.robotLayout = data;
            }
          }
        } catch {
          // ignore
        }

        setTimeout(() => {
          restartText.value = 'Restart';
        }, 2500);
      }
    } catch {
      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        isRestarting.value = false;
        restartText.value = 'Restart';
        store.appendOrderLog('Restart poll timeout. Check connection.', 'error');
        store.showToast('Restart timed out', 'error');
      }
    }
  }, 800);
}

async function handleShutdown() {
  if (isShuttingDown.value) return;

  const confirmed = window.confirm(
    'Shutdown Lasius Robot?\n\n' +
    'This will safely relax all 18 servos and power off the Raspberry Pi.\n' +
    'You will need to power-cycle the hardware switch to start it again.'
  );
  if (!confirmed) return;

  isShuttingDown.value = true;
  shutdownText.value = 'Shutting down...';
  store.appendOrderLog('Robot shutdown initiated. Servos relaxing & Pi powering off...', 'warning');

  try {
    await fetch('/api/v1/server/shutdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
  } catch (e) {
    console.warn('Shutdown request sent (server powering down):', e);
  }

  setTimeout(() => {
    emit('show-shutdown-dialog');
  }, 1500);
}

function handleEstop() {
  store.estop();
  estopText.value = 'STOPPED';
  setTimeout(() => {
    estopText.value = 'E-Stop';
  }, 3000);
}
</script>

<template>
  <header>
    <div class="header-left">
      <h1>Lasius Dashboard</h1>
    </div>
    <div class="header-right">
      <div class="server-toolbar">
        <div id="status-container" title="Robot Server Telemetry Connection">
          <span
            class="status-dot"
            id="status-dot"
            :class="{ connected: store.connectionStatus === 'Connected' || store.connectionStatus === 'Live' }"
          ></span>
          <span id="status">{{ store.connectionStatus }}</span>
        </div>
        <button
          id="btn-restart-server"
          class="btn-restart"
          :class="{ restarting: isRestarting }"
          title="Restart the Lasius robot server daemon"
          @click="handleRestart"
        >
          <span id="restart-text">{{ restartText }}</span>
        </button>
        <button
          id="btn-shutdown-robot"
          class="btn-shutdown"
          :class="{ 'shutting-down': isShuttingDown }"
          title="Safely relax all servos and power down the robot"
          @click="handleShutdown"
        >
          <span id="shutdown-text">{{ shutdownText }}</span>
        </button>
      </div>
      <button
        id="btn-estop"
        class="btn-estop"
        title="Immediate Emergency Stop: Relax all servos"
        @click="handleEstop"
      >
        {{ estopText }}
      </button>
    </div>
  </header>
</template>
