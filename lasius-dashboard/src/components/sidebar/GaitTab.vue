<script setup lang="ts">
/**
 * Gait, Locomotion & Body Attitude Control Panel (`lasius-dashboard/src/components/sidebar/GaitTab.vue`).
 *
 * Purpose & Role:
 *   Provides interactive controls for omnidirectional walking (`walkX`, `walkY`, `turnZ`)
 *   via a 3x3 D-Pad, gait pattern selection (`Tripod`, `Ripple`, `Wave`), cycle
 *   parameters (`gaitSpeed`, `stepHeight`, `stepLength`), and 6-DOF chassis
 *   attitude posing (`bodyHeight`, `bodyRoll`, `bodyPitch`).
 */
import { computed } from 'vue';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { GaitPattern, GamepadProfile } from '../../types';

const store = useDashboardStore();

function onProfileChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value as GamepadProfile;
  store.setGamepadProfile(val);
}

const padLabels = computed(() => {
  const cfg = store.gamepadProfiles[store.resolvedGamepadProfile] || Object.values(store.gamepadProfiles)[0];
  const lbl = cfg?.labels;
  return {
    tripod: lbl?.tripod || 'A',
    ripple: lbl?.ripple || 'X',
    wave: lbl?.wave || 'Y',
    stop: lbl?.stop || 'B / Stadia',
    speed: lbl?.speed || 'L1 / R1',
    height: lbl?.height || 'D-Pad ↕',
    reset: lbl?.reset || 'Options',
    pause: lbl?.pause || 'Menu'
  };
});

const isStopped = computed(() => {
  return Math.abs(store.walkX) < 0.05 && Math.abs(store.walkY) < 0.05 && Math.abs(store.turnZ) < 0.05;
});

const isDpadFLActive = computed(() => store.walkY > 0.4 && store.walkX < -0.3);
const isDpadFRActive = computed(() => store.walkY > 0.4 && store.walkX > 0.3);
const isDpadFwdActive = computed(() => store.walkY > 0.4 && Math.abs(store.walkX) <= 0.3);
const isDpadBackActive = computed(() => store.walkY < -0.4);
const isDpadLeftActive = computed(() => store.walkX < -0.4 && Math.abs(store.walkY) <= 0.4);
const isDpadRightActive = computed(() => store.walkX > 0.4 && Math.abs(store.walkY) <= 0.4);
const isDpadRotLActive = computed(() => store.turnZ > 0.3);
const isDpadRotRActive = computed(() => store.turnZ < -0.3);

function setGait(pattern: GaitPattern) {
  store.setGait(pattern);
}

function onSpeedInput(e: Event) {
  store.setSpeed(parseFloat((e.target as HTMLInputElement).value));
}

function onStepHeightInput(e: Event) {
  store.setStepHeight(parseFloat((e.target as HTMLInputElement).value));
}

function onStepLengthInput(e: Event) {
  store.setStepLength(parseFloat((e.target as HTMLInputElement).value));
}

function onHeightInput(e: Event) {
  store.setHeight(parseFloat((e.target as HTMLInputElement).value));
}

function onRollInput(e: Event) {
  store.setRoll(parseFloat((e.target as HTMLInputElement).value));
}

function onPitchInput(e: Event) {
  store.setPitch(parseFloat((e.target as HTMLInputElement).value));
}
</script>

<template>
  <aside class="control-panel-2col">
    <!-- Left Column: Locomotion, Gait Patterns & D-Pad -->
    <div class="panel-column">
      <div class="control-section" style="border-bottom: none; padding-bottom: 0;">
        <h2>Gait &amp; Direction</h2>

        <div class="control-group">
          <label>Gait Pattern</label>
          <div class="btn-group" id="gait-selector">
            <button
              class="btn-group-btn btn-stacked"
              :class="{ active: store.currentGait === 'tripod' }"
              data-gait="tripod"
              @click="setGait('tripod')"
            >
              <span class="btn-main-label">⚡ Tripod</span>
              <span class="btn-sub-hint">Pad: {{ padLabels.tripod }}</span>
            </button>
            <button
              class="btn-group-btn btn-stacked"
              :class="{ active: store.currentGait === 'ripple' }"
              data-gait="ripple"
              @click="setGait('ripple')"
            >
              <span class="btn-main-label">〰 Ripple</span>
              <span class="btn-sub-hint">Pad: {{ padLabels.ripple }}</span>
            </button>
            <button
              class="btn-group-btn btn-stacked"
              :class="{ active: store.currentGait === 'wave' }"
              data-gait="wave"
              @click="setGait('wave')"
            >
              <span class="btn-main-label">🌊 Wave</span>
              <span class="btn-sub-hint">Pad: {{ padLabels.wave }}</span>
            </button>
          </div>
        </div>

        <div class="control-group">
          <label>Direction Pad</label>
          <div class="dpad-grid">
            <button
              class="dpad-btn"
              id="dpad-fl"
              :class="{ active: isDpadFLActive }"
              title="Forward-Left (W+A / L-Stick)"
              @click="store.dpadWalk(-0.71, 0.71, 0)"
            >
              <span class="dpad-icon">↖</span>
              <span class="dpad-hint">W+A · L-Stick</span>
            </button>
            <button
              class="dpad-btn"
              id="dpad-fwd"
              :class="{ active: isDpadFwdActive }"
              title="Forward (W / Up / L-Stick)"
              @click="store.dpadWalk(0, 1, 0)"
            >
              <span class="dpad-icon">↑</span>
              <span class="dpad-hint">W / ↑ · L-Stick</span>
            </button>
            <button
              class="dpad-btn"
              id="dpad-fr"
              :class="{ active: isDpadFRActive }"
              title="Forward-Right (W+D / L-Stick)"
              @click="store.dpadWalk(0.71, 0.71, 0)"
            >
              <span class="dpad-icon">↗</span>
              <span class="dpad-hint">W+D · L-Stick</span>
            </button>

            <button
              class="dpad-btn"
              id="dpad-left"
              :class="{ active: isDpadLeftActive }"
              title="Strafe Left (A / Left / L-Stick)"
              @click="store.dpadWalk(-1, 0, 0)"
            >
              <span class="dpad-icon">←</span>
              <span class="dpad-hint">A / ← · L-Stick</span>
            </button>
            <button
              class="dpad-btn dpad-btn-stop"
              id="dpad-stop"
              :class="{ active: isStopped }"
              title="Stop Motion (Space / Pad Stop)"
              @click="store.dpadStop"
            >
              <span class="dpad-icon">⏹</span>
              <span class="dpad-hint">Space · {{ padLabels.stop }}</span>
            </button>
            <button
              class="dpad-btn"
              id="dpad-right"
              :class="{ active: isDpadRightActive }"
              title="Strafe Right (D / Right / L-Stick)"
              @click="store.dpadWalk(1, 0, 0)"
            >
              <span class="dpad-icon">→</span>
              <span class="dpad-hint">D / → · L-Stick</span>
            </button>

            <button
              class="dpad-btn"
              id="dpad-rot-l"
              :class="{ active: isDpadRotLActive }"
              title="Turn Left (Q / R-Stick)"
              @click="store.dpadWalk(0, 0, 1.0)"
            >
              <span class="dpad-icon">↺</span>
              <span class="dpad-hint">Q · R-Stick</span>
            </button>
            <button
              class="dpad-btn"
              id="dpad-back"
              :class="{ active: isDpadBackActive }"
              title="Backward (S / Down / L-Stick)"
              @click="store.dpadWalk(0, -1, 0)"
            >
              <span class="dpad-icon">↓</span>
              <span class="dpad-hint">S / ↓ · L-Stick</span>
            </button>
            <button
              class="dpad-btn"
              id="dpad-rot-r"
              :class="{ active: isDpadRotRActive }"
              title="Turn Right (E / R-Stick)"
              @click="store.dpadWalk(0, 0, -1.0)"
            >
              <span class="dpad-icon">↻</span>
              <span class="dpad-hint">E · R-Stick</span>
            </button>
          </div>
        </div>

        <div class="control-group" style="margin-top: 6px;">
          <button
            id="btn-toggle-pause"
            class="btn btn-stacked"
            :class="store.isPaused ? 'btn-secondary' : 'btn-primary'"
            @click="store.togglePause"
          >
            <span id="btn-pause-text" class="btn-main-label">{{ store.isPaused ? '▶ Resume Animation' : '⏸ Pause Animation' }}</span>
            <span class="btn-sub-hint">Pad: {{ padLabels.pause }}</span>
          </button>
        </div>

        <!-- Show Poses & Choreographies -->
        <div class="control-group" style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #282a3c;">
          <label>Show Poses &amp; Choreographies</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px;">
            <button
              id="btn-pose-wave"
              class="btn btn-primary btn-compact"
              title="Raise front leg and wave hello (uses selected front leg or RF)"
              @click="store.runWaveHello"
            >
              Wave Hello
            </button>
            <button
              id="btn-pose-pushups"
              class="btn btn-secondary btn-compact"
              title="Execute 4 harmonic chassis push-up cycles (-50mm to -108mm)"
              @click="store.runPushUps"
            >
              Push-Ups
            </button>
            <button
              id="btn-pose-circle"
              class="btn btn-secondary btn-compact"
              title="Circular 6-DOF body swirl combining Roll and Pitch"
              @click="store.runBodyCircle"
            >
              Body Circle
            </button>
            <button
              id="btn-pose-crouch"
              class="btn btn-secondary btn-compact"
              title="Low stealth crouch stance (-48mm height, -12° nose pitch)"
              @click="store.runCrouch"
            >
              Stealth Crouch
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column: Controller Profile, Gait Sliders & Body Attitude Posing -->
    <div class="panel-column">
      <!-- Controller Profile Dropdown & Live Status -->
      <div class="control-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <h2>Controller Profile</h2>
          <span
            class="val-badge"
            :style="{
              color: store.gamepadConnected ? '#2ecc71' : '#8e92a4',
              borderColor: store.gamepadConnected ? 'rgba(46, 204, 113, 0.4)' : '#2c2f46'
            }"
            :title="store.gamepadId"
          >
            {{ store.gamepadConnected ? `● ${store.resolvedGamepadProfile.toUpperCase()}` : '○ Standby' }}
          </span>
        </div>

        <select
          id="gamepad-profile-select"
          class="controller-select"
          style="width: 100%;"
          :value="store.gamepadProfile"
          @change="onProfileChange"
        >
          <option value="auto">
            Auto-Detect ({{ (store.gamepadProfiles[store.resolvedGamepadProfile]?.short_label || store.resolvedGamepadProfile).toUpperCase() }})
          </option>
          <option
            v-for="prof in Object.values(store.gamepadProfiles)"
            :key="prof.id"
            :value="prof.id"
          >
            {{ prof.name }} ({{ prof.short_label || prof.id.toUpperCase() }})
          </option>
        </select>
      </div>

      <!-- Gait Parameters -->
      <div class="control-section">
        <h2>Gait Parameters</h2>

        <div class="joint-control-card">
          <div class="control-group">
            <label for="slider-speed">Speed <span class="key-hint">({{ padLabels.speed }})</span>: <span id="val-speed" class="val-badge">{{ store.gaitSpeed.toFixed(1) }}x</span></label>
            <input
              type="range"
              id="slider-speed"
              min="0.1"
              max="3.0"
              step="0.1"
              :value="store.gaitSpeed"
              @input="onSpeedInput"
            />
          </div>

          <div class="control-group">
            <label for="slider-step-height">Step Height: <span id="val-step-height" class="val-badge">{{ Math.round(store.gaitStepHeight) }} mm</span></label>
            <input
              type="range"
              id="slider-step-height"
              min="10"
              max="60"
              step="1"
              :value="store.gaitStepHeight"
              @input="onStepHeightInput"
            />
          </div>

          <div class="control-group">
            <label for="slider-step-length">Step Length: <span id="val-step-length" class="val-badge">{{ Math.round(store.gaitStepLength) }} mm</span></label>
            <input
              type="range"
              id="slider-step-length"
              min="10"
              max="80"
              step="1"
              :value="store.gaitStepLength"
              @input="onStepLengthInput"
            />
          </div>
        </div>
      </div>

      <!-- Body Attitude / Posing -->
      <div class="control-section" style="border-bottom:none; padding-bottom:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <h2>Body Attitude</h2>
          <button id="btn-reset-pose" class="btn-subtle btn-stacked" title="Reset Height, Roll & Pitch" @click="store.resetPose">
            <span class="btn-main-label">↺ Reset</span>
            <span class="btn-sub-hint">Pad: {{ padLabels.reset }}</span>
          </button>
        </div>

        <div class="joint-control-card">
          <div class="control-group">
            <label for="slider-height">Chassis Height <span class="key-hint">({{ padLabels.height }})</span>: <span id="val-height" class="val-badge">{{ Math.round(store.attitudeHeight) }} mm</span></label>
            <input
              type="range"
              id="slider-height"
              min="-110"
              max="-50"
              step="1"
              :value="store.attitudeHeight"
              @input="onHeightInput"
            />
          </div>

          <div class="control-group">
            <label for="slider-roll">Body Roll: <span id="val-roll" class="val-badge">{{ Math.round(store.attitudeRoll) }}&deg;</span></label>
            <input
              type="range"
              id="slider-roll"
              min="-20"
              max="20"
              step="1"
              :value="store.attitudeRoll"
              @input="onRollInput"
            />
          </div>

          <div class="control-group">
            <label for="slider-pitch">Body Pitch: <span id="val-pitch" class="val-badge">{{ Math.round(store.attitudePitch) }}&deg;</span></label>
            <input
              type="range"
              id="slider-pitch"
              min="-20"
              max="20"
              step="1"
              :value="store.attitudePitch"
              @input="onPitchInput"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Full-Width Bottom Row: Live Order Status & Feedback -->
    <div class="control-section" style="grid-column: 1 / -1; border-top: 1px solid #2e2e3e; padding-top: 12px; border-bottom: none; padding-bottom: 0;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>Order Monitor</h2>
        <span id="order-status-badge" :class="store.orderStatusBadgeClass">{{ store.orderStatusBadge }}</span>
      </div>
      <div id="order-log" class="order-log-box">
        <div
          v-for="entry in store.orderLog"
          :key="entry.id"
          class="order-log-entry"
          :class="entry.status || ''"
        >
          <span>[{{ entry.time }}] {{ entry.text }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>
