<script setup lang="ts">
/**
 * Reusable Single-Joint Control & Calibration Card (`lasius-dashboard/src/components/sidebar/JointCard.vue`).
 *
 * Purpose & Role:
 *   Encapsulates the UI and interaction logic for a single leg joint (`coxa`,
 *   `femur`, or `tibia`). Adapts dynamically to `store.legControlMode`:
 *     - In `drive` mode: renders a live degree slider clamped to `[min_angle, max_angle]`
 *       with quick-zero and hover highlighting synchronized with the 3D Digital Twin.
 *     - In `calibrate` mode: renders PCA9685 board/channel metadata, microsecond
 *       pulse trim steppers (`-10µs`, `-1µs`, `Zero`, `+1µs`, `+10µs`), orientation
 *       inversion toggle (`+1` / `-1`), min/max angle limit inputs, and a joint sweep button.
 */
import { computed } from 'vue';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { JointName } from '../../types';

const props = defineProps<{
  jointType: JointName;
  title: string;
  subtitle: string;
}>();

const store = useDashboardStore();

const legNames = computed(() => store.getLegServoNames(store.selectedLegKey));
const servoName = computed(() => legNames.value[props.jointType]);

const servoData = computed(() => {
  return store.calibrationData[servoName.value] || {
    name: servoName.value,
    channel: '-',
    board_address: 0x40,
    center_offset_pulse: 0,
    orientation: 1,
    min_angle: props.jointType === 'tibia' ? -60 : -45,
    max_angle: props.jointType === 'tibia' ? 60 : 45,
    is_overridden: false
  };
});

const currentAngle = computed(() => {
  return store.jointAngles[servoName.value] !== undefined ? store.jointAngles[servoName.value] : 0;
});

const minLimit = computed(() => {
  return servoData.value.min_angle !== undefined ? servoData.value.min_angle : (props.jointType === 'tibia' ? -60 : -45);
});

const maxLimit = computed(() => {
  return servoData.value.max_angle !== undefined ? servoData.value.max_angle : (props.jointType === 'tibia' ? 60 : 45);
});

const centerTrim = computed(() => {
  return servoData.value.center_offset_pulse || 0;
});

const orientation = computed(() => {
  return servoData.value.orientation !== undefined ? servoData.value.orientation : 1;
});

const cleanSubtitle = computed(() => props.subtitle.replace(/^\(|\)$/g, '').trim());

const servoMetaText = computed(() => {
  const ch = servoData.value.channel !== undefined ? servoData.value.channel : '-';
  const addr = servoData.value.board_address ? ` @ 0x${servoData.value.board_address.toString(16)}` : '';
  return `${servoName.value} • Ch ${ch}${addr}`;
});

// Dual range percentage calculations
const leftPct = computed(() => {
  const totalMin = -90;
  const totalMax = 90;
  return Math.max(0, Math.min(100, ((minLimit.value - totalMin) / (totalMax - totalMin)) * 100));
});

const widthPct = computed(() => {
  const totalMin = -90;
  const totalMax = 90;
  const right = Math.max(0, Math.min(100, ((maxLimit.value - totalMin) / (totalMax - totalMin)) * 100));
  return Math.max(0, right - leftPct.value);
});

// Trim slider fill
const trimFillStyle = computed(() => {
  const maxBound = 600;
  const clamped = Math.max(-maxBound, Math.min(maxBound, centerTrim.value));
  const pct = (Math.abs(clamped) / maxBound) * 50;
  if (clamped >= 0) {
    return { left: '50%', width: `${pct}%` };
  } else {
    return { left: `${50 - pct}%`, width: `${pct}%` };
  }
});

const trimSign = computed(() => (centerTrim.value > 0 ? '+' : ''));
const degEst = computed(() => (centerTrim.value / 10.0).toFixed(1));

function handleAngleInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const val = parseFloat(target.value);
  store.setJointAngle(servoName.value, val);
}

function handleMinLimitInput(e: Event) {
  const target = e.target as HTMLInputElement;
  let val = parseInt(target.value, 10);
  if (val >= maxLimit.value) {
    val = maxLimit.value - 1;
    target.value = val.toString();
  }
  store.applyLiveLimits(props.jointType, val, maxLimit.value);
}

function handleMaxLimitInput(e: Event) {
  const target = e.target as HTMLInputElement;
  let val = parseInt(target.value, 10);
  if (val <= minLimit.value) {
    val = minLimit.value + 1;
    target.value = val.toString();
  }
  store.applyLiveLimits(props.jointType, minLimit.value, val);
}

function handleTrimInput(e: Event) {
  const target = e.target as HTMLInputElement;
  let val = parseInt(target.value, 10);
  if (Math.abs(val) <= 2) val = 0;
  store.applyLiveTrimAbsolute(props.jointType, val, false);
}

function handleTrimChange(e: Event) {
  const target = e.target as HTMLInputElement;
  let val = parseInt(target.value, 10);
  if (Math.abs(val) <= 2) val = 0;
  store.applyLiveTrimAbsolute(props.jointType, val, true);
}

function nudgeTrim(step: number, e: MouseEvent) {
  const mult = e.shiftKey ? 10 : 1;
  store.applyLiveTrimStep(props.jointType, step * mult);
}

function resetTrim() {
  store.applyLiveTrimAbsolute(props.jointType, 0, true);
}

function handleOrientationToggle(e: Event) {
  const target = e.target as HTMLInputElement;
  store.applyLiveOrientation(props.jointType, target.checked);
}
</script>

<template>
  <div
    class="joint-control-card"
    :class="`joint-${jointType}`"
    @mouseenter="store.hoveredJoint = jointType"
    @mouseleave="if (store.hoveredJoint === jointType) store.hoveredJoint = null;"
  >
    <div class="joint-header">
      <div class="joint-title">
        <span>
          {{ title }}
          <span class="joint-sub" :id="`id-joint-${jointType}`">
            ({{ cleanSubtitle }} - {{ servoMetaText }})
          </span>
        </span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span :id="`val-joint-${jointType}`" class="val-badge joint-badge">
          {{ Math.round(currentAngle) }}&deg;
        </span>
      </div>
    </div>

    <!-- Live Angle Direct Drive Slider -->
    <div class="joint-slider-wrap">
      <div class="slider-label-row">
        <span class="param-sublabel">Live Angle</span>
      </div>
      <input
        type="range"
        :id="`slider-joint-${jointType}`"
        :min="minLimit"
        :max="maxLimit"
        step="1"
        :value="Math.round(currentAngle)"
        @input="handleAngleInput"
      />
      <div class="slider-ticks">
        <span :id="`tick-min-${jointType}`">{{ minLimit }}&deg;</span>
        <span>0&deg;</span>
        <span :id="`tick-max-${jointType}`">{{ maxLimit > 0 ? '+' : '' }}{{ maxLimit }}&deg;</span>
      </div>
    </div>

    <!-- Dual-Thumb Angle Limits Slider -->
    <div class="dual-range-container">
      <div class="dual-range-labels">
        <span class="range-label-title">Angle Limits (Min / Max)</span>
        <div class="range-readout-wrap">
          <span class="range-label-val" :id="`lbl-min-${jointType}`">{{ minLimit }}&deg;</span>
          <span class="range-label-sep">to</span>
          <span class="range-label-val" :id="`lbl-max-${jointType}`">{{ maxLimit > 0 ? '+' : '' }}{{ maxLimit }}&deg;</span>
        </div>
      </div>
      <div class="dual-range-wrapper">
        <div class="dual-range-track"></div>
        <div class="dual-range-highlight" :id="`highlight-${jointType}`" :style="{ left: `${leftPct}%`, width: `${widthPct}%` }"></div>
        <input
          type="range"
          class="dual-range-input dual-range-min"
          :id="`range-min-${jointType}`"
          min="-90"
          max="90"
          step="1"
          :value="minLimit"
          @input="handleMinLimitInput"
          :aria-label="`${title} Min Angle Limit`"
        />
        <input
          type="range"
          class="dual-range-input dual-range-max"
          :id="`range-max-${jointType}`"
          min="-90"
          max="90"
          step="1"
          :value="maxLimit"
          @input="handleMaxLimitInput"
          :aria-label="`${title} Max Angle Limit`"
        />
      </div>
    </div>

    <!-- Center Trim Offset Slider & Fine Nudge -->
    <div class="calib-param-group">
      <div class="calib-param-label">
        <span>Center Trim</span>
        <button
          type="button"
          class="calib-val-readout trim-readout-btn"
          :id="`calib-val-trim-${jointType}`"
          @click="resetTrim"
          title="Click to reset trim to 0 µs"
        >
          {{ trimSign }}{{ centerTrim }} µs (~ {{ trimSign }}{{ degEst }}°)
        </button>
      </div>
      <div class="trim-slider-row">
        <button
          type="button"
          class="btn-trim-nudge"
          :data-joint="jointType"
          data-step="-1"
          @click="nudgeTrim(-1, $event)"
          title="Nudge -1 µs (Shift+Click: -10 µs)"
        >-1µs</button>
        <div class="trim-slider-track-wrap">
          <div class="trim-slider-track"></div>
          <div class="trim-slider-center-line"></div>
          <div class="trim-slider-fill" :id="`trim-fill-${jointType}`" :style="trimFillStyle"></div>
          <input
            type="range"
            class="trim-slider-input"
            :id="`slider-trim-${jointType}`"
            :data-joint="jointType"
            min="-600"
            max="600"
            step="5"
            :value="centerTrim"
            @input="handleTrimInput"
            @change="handleTrimChange"
            @dblclick="resetTrim"
            :aria-label="`Center Trim Offset ${title}`"
          />
        </div>
        <button
          type="button"
          class="btn-trim-nudge"
          :data-joint="jointType"
          data-step="+1"
          @click="nudgeTrim(1, $event)"
          title="Nudge +1 µs (Shift+Click: +10 µs)"
        >+1µs</button>
      </div>
    </div>

    <!-- Card Bottom Row: Invert & Sweep Test -->
    <div class="joint-card-footer">
      <label class="calib-toggle-label">
        <input
          type="checkbox"
          :id="`calib-invert-${jointType}`"
          class="calib-invert-chk"
          :data-joint="jointType"
          :checked="orientation === -1"
          @change="handleOrientationToggle"
        />
        <span class="calib-chk-custom"></span>
        <span class="calib-toggle-text" :id="`calib-invert-text-${jointType}`">
          {{ orientation === -1 ? 'Inverted (-1)' : 'Normal (+1)' }}
        </span>
      </label>
      <button
        type="button"
        class="btn btn-secondary btn-calib-sweep"
        :data-joint="jointType"
        @click="store.testJointRange(jointType)"
        title="Test motion range between calibrated limits"
      >
        Test Range
      </button>
    </div>
  </div>
</template>
