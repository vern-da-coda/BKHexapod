<script setup lang="ts">
import { computed } from 'vue';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { GaitPattern } from '../../types';

const store = useDashboardStore();

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
      <div class="control-section">
        <h2>Gait &amp; Direction</h2>

        <div class="control-group">
          <label>Gait Pattern</label>
          <div class="btn-group" id="gait-selector">
            <button
              class="btn-group-btn"
              :class="{ active: store.currentGait === 'tripod' }"
              data-gait="tripod"
              @click="setGait('tripod')"
            >
              Tripod
            </button>
            <button
              class="btn-group-btn"
              :class="{ active: store.currentGait === 'ripple' }"
              data-gait="ripple"
              @click="setGait('ripple')"
            >
              Ripple
            </button>
            <button
              class="btn-group-btn"
              :class="{ active: store.currentGait === 'wave' }"
              data-gait="wave"
              @click="setGait('wave')"
            >
              Wave
            </button>
          </div>
        </div>

        <div class="control-group">
          <label>Direction Pad <span class="key-hint">(WASD / QE)</span></label>
          <div class="dpad-grid">
            <button
              class="dpad-btn"
              id="dpad-fl"
              :class="{ active: isDpadFLActive }"
              title="Forward-Left (Q+W)"
              @click="store.dpadWalk(-0.71, 0.71, 0)"
            >
              FL
            </button>
            <button
              class="dpad-btn"
              id="dpad-fwd"
              :class="{ active: isDpadFwdActive }"
              title="Forward (W / Up)"
              @click="store.dpadWalk(0, 1, 0)"
            >
              Fwd
            </button>
            <button
              class="dpad-btn"
              id="dpad-fr"
              :class="{ active: isDpadFRActive }"
              title="Forward-Right (E+W)"
              @click="store.dpadWalk(0.71, 0.71, 0)"
            >
              FR
            </button>

            <button
              class="dpad-btn"
              id="dpad-left"
              :class="{ active: isDpadLeftActive }"
              title="Strafe Left (A / Left)"
              @click="store.dpadWalk(-1, 0, 0)"
            >
              Left
            </button>
            <button
              class="dpad-btn dpad-btn-stop"
              id="dpad-stop"
              :class="{ active: isStopped }"
              title="Stop Motion (Space)"
              @click="store.dpadStop"
            >
              Stop
            </button>
            <button
              class="dpad-btn"
              id="dpad-right"
              :class="{ active: isDpadRightActive }"
              title="Strafe Right (D / Right)"
              @click="store.dpadWalk(1, 0, 0)"
            >
              Right
            </button>

            <button
              class="dpad-btn"
              id="dpad-rot-l"
              :class="{ active: isDpadRotLActive }"
              title="Turn Left (Q)"
              @click="store.dpadWalk(0, 0, 1.0)"
            >
              Turn L
            </button>
            <button
              class="dpad-btn"
              id="dpad-back"
              :class="{ active: isDpadBackActive }"
              title="Backward (S / Down)"
              @click="store.dpadWalk(0, -1, 0)"
            >
              Back
            </button>
            <button
              class="dpad-btn"
              id="dpad-rot-r"
              :class="{ active: isDpadRotRActive }"
              title="Turn Right (E)"
              @click="store.dpadWalk(0, 0, -1.0)"
            >
              Turn R
            </button>
          </div>
        </div>

        <div class="control-group" style="margin-top: 6px;">
          <button
            id="btn-toggle-pause"
            class="btn"
            :class="store.isPaused ? 'btn-secondary' : 'btn-primary'"
            @click="store.togglePause"
          >
            <span id="btn-pause-text">{{ store.isPaused ? 'Resume Animation' : 'Pause Animation' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Right Column: Gait Sliders & Body Attitude Posing -->
    <div class="panel-column">
      <!-- Gait Parameters -->
      <div class="control-section">
        <h2>Gait Parameters</h2>

        <div class="joint-control-card">
          <div class="control-group">
            <label for="slider-speed">Speed: <span id="val-speed" class="val-badge">{{ store.gaitSpeed.toFixed(1) }}x</span></label>
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
          <button id="btn-reset-pose" class="btn-subtle" title="Reset Height, Roll & Pitch" @click="store.resetPose">
            Reset
          </button>
        </div>

        <div class="joint-control-card">
          <div class="control-group">
            <label for="slider-height">Chassis Height: <span id="val-height" class="val-badge">{{ Math.round(store.attitudeHeight) }} mm</span></label>
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
  </aside>
</template>
