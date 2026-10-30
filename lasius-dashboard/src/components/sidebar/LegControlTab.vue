<script setup lang="ts">
/**
 * Single-Leg Direct Drive & Calibration Panel (`lasius-dashboard/src/components/sidebar/LegControlTab.vue`).
 *
 * Purpose & Role:
 *   Allows selecting any of the 6 legs (`LF`, `LM`, `LR`, `RF`, `RM`, `RR`),
 *   switching between `Direct Drive` mode (live angle sliders for Coxa, Femur,
 *   Tibia) and `Calibration` mode (Option C microsecond pulse offset trimming,
 *   orientation inversion, min/max angle limits, and atomic `calibration.json`
 *   persistence), and rendering three `JointCard` instances for the active leg.
 */
import { ref } from 'vue';
import { useDashboardStore } from '../../stores/dashboardStore';
import type { LegKey } from '../../types';
import JointCard from './JointCard.vue';

const store = useDashboardStore();
const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerImportDialog() {
  fileInputRef.value?.click();
}

function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    store.importCalibrationJson(input.files[0]);
    input.value = '';
  }
}

function onCyclesInput(e: Event) {
  store.testCycles = parseInt((e.target as HTMLInputElement).value, 10);
}

const legKeys: Array<{ key: LegKey; label: string; title: string }> = [
  { key: 'left_front', label: 'LF', title: 'Select Left Front' },
  { key: 'left_middle', label: 'LM', title: 'Select Left Middle' },
  { key: 'left_rear', label: 'LR', title: 'Select Left Rear' },
  { key: 'right_front', label: 'RF', title: 'Select Right Front' },
  { key: 'right_middle', label: 'RM', title: 'Select Right Middle' },
  { key: 'right_rear', label: 'RR', title: 'Select Right Rear' }
];
</script>

<template>
  <aside class="control-card">
    <!-- Leg Selection Bar -->
    <div class="control-section leg-selection-section">
      <div class="leg-selection-header-row">
        <div class="leg-title-wrap">
          <h2>Active Leg</h2>
          <span id="leg-info-badge" class="badge-accent">{{ store.selectedLegKey }}</span>
        </div>
      </div>

      <div class="leg-pills">
        <button
          v-for="l in legKeys"
          :key="l.key"
          type="button"
          class="minimap-leg-btn leg-pill"
          :class="{ active: store.selectedLegKey === l.key }"
          :data-leg="l.key"
          :title="l.title"
          @click="store.selectLeg(l.key)"
        >
          {{ l.label }}
        </button>
      </div>
    </div>

    <!-- Active Leg & Global Hardware Actions Toolbar -->
    <div class="control-section" style="gap: 6px;">
      <div class="leg-actions-toolbar" style="margin-top: 0; grid-template-columns: repeat(3, 1fr);">
        <button
          type="button"
          id="btn-calib-align-ref"
          class="btn btn-primary btn-compact"
          title="Energize this leg at 0° reference pose and relax all other legs for safe alignment"
          @click="store.alignLegRef"
        >
          Align Ref (0&deg;)
        </button>
        <button
          type="button"
          id="btn-leg-stance"
          class="btn btn-secondary btn-compact"
          title="Smoothly move this leg to neutral ground stance position"
          @click="store.stanceLeg"
        >
          Stance Leg
        </button>
        <button
          type="button"
          id="btn-leg-relax"
          class="btn btn-subtle-danger btn-compact"
          title="Disable PWM to relax this leg"
          @click="store.relaxLeg"
        >
          Relax Leg
        </button>
      </div>

      <!-- Global All-Legs Stance & Relax Actions -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding-top: 4px; border-top: 1px dashed #2e2e3e;">
        <button
          type="button"
          id="btn-all-stance"
          class="btn btn-secondary btn-compact"
          title="Move all 6 legs smoothly into neutral ground stance position"
          @click="store.allStance"
        >
          All in Stance
        </button>
        <button
          type="button"
          id="btn-relax-all"
          class="btn btn-subtle-danger btn-compact"
          title="Disable PWM to relax all 18 servos"
          @click="store.relaxAll"
        >
          Relax All Servos
        </button>
      </div>
    </div>

    <!-- Compact 2-Column Section: Joint Collision Sweeps (Left) & Step Cycle (Right) -->
    <div class="control-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: center; padding-bottom: 8px;">
      <!-- Left: Joint Collision Sweeps (3 buttons in 1 row) -->
      <div style="display: flex; flex-direction: column; gap: 5px; border-right: 1px solid #2e2e3e; padding-right: 10px;">
        <h2 style="font-size: 0.76rem;">Collision Sweeps</h2>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
          <button
            id="btn-sweep-coxa"
            class="btn btn-secondary btn-compact"
            style="padding: 5px 4px; font-size: 0.72rem;"
            title="Coxa swivel sweep (-25° to +25°)"
            @click="store.runCollisionSweep('coxa')"
            @mouseenter="store.hoveredJoint = 'coxa'"
            @mouseleave="if (store.hoveredJoint === 'coxa') store.hoveredJoint = null;"
          >
            Coxa
          </button>
          <button
            id="btn-sweep-femur"
            class="btn btn-secondary btn-compact"
            style="padding: 5px 4px; font-size: 0.72rem;"
            title="Femur lift sweep (-45° to +45°)"
            @click="store.runCollisionSweep('femur')"
            @mouseenter="store.hoveredJoint = 'femur'"
            @mouseleave="if (store.hoveredJoint === 'femur') store.hoveredJoint = null;"
          >
            Femur
          </button>
          <button
            id="btn-sweep-tibia"
            class="btn btn-secondary btn-compact"
            style="padding: 5px 4px; font-size: 0.72rem;"
            title="Tibia knee sweep (-45° to +45°)"
            @click="store.runCollisionSweep('tibia')"
            @mouseenter="store.hoveredJoint = 'tibia'"
            @mouseleave="if (store.hoveredJoint === 'tibia') store.hoveredJoint = null;"
          >
            Tibia
          </button>
        </div>
      </div>

      <!-- Right: Step Cycle (Slider + Start button in 1 row) -->
      <div style="display: flex; flex-direction: column; gap: 5px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 style="font-size: 0.76rem;">Step Cycle</h2>
          <span id="val-test-cycles" class="val-badge" style="font-size: 0.70rem; padding: 0 5px;">{{ store.testCycles }}x</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input
            type="range"
            id="slider-test-cycles"
            min="1"
            max="10"
            step="1"
            style="flex: 1; min-width: 65px;"
            :value="store.testCycles"
            title="Number of step cycles (1-10)"
            @input="onCyclesInput"
          />
          <button
            id="btn-run-step-test"
            class="btn btn-primary btn-compact"
            style="padding: 5px 10px; font-size: 0.72rem; flex-shrink: 0;"
            title="Start harmonic step cycle on selected leg"
            @click="store.runStepTest"
          >
            ▶ Start
          </button>
        </div>
      </div>
    </div>

    <!-- Unified Joint Cards: Coxa, Femur, Tibia -->
    <div class="control-section" style="gap: 14px;">
      <JointCard jointType="coxa" title="Coxa" subtitle="(Hip Swivel)" />
      <JointCard jointType="femur" title="Femur" subtitle="(Thigh Lift)" />
      <JointCard jointType="tibia" title="Tibia" subtitle="(Shin / Knee)" />
    </div>

    <!-- Bottom Section: Calibration Profile Reset, Export & Import -->
    <div class="control-section" style="border-bottom: none; padding-bottom: 0;">
      <h2>Calibration Profile (JSON)</h2>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 2px;">
        <button
          type="button"
          id="btn-calib-reset-leg"
          class="btn btn-secondary btn-compact"
          title="Revert this leg's overlay to config.yaml factory settings"
          @click="store.resetLegCalibration"
        >
          ↺ Reset Leg
        </button>
        <button
          type="button"
          id="btn-calib-export"
          class="btn btn-secondary btn-compact"
          title="Download all 18 servo calibration settings as a JSON profile"
          @click="store.exportCalibrationJson"
        >
          ⬇ Export JSON
        </button>
        <button
          type="button"
          id="btn-calib-import"
          class="btn btn-secondary btn-compact"
          title="Restore servo calibration settings from a JSON file"
          @click="triggerImportDialog"
        >
          ⬆ Import JSON
        </button>
      </div>
      <input
        ref="fileInputRef"
        type="file"
        accept=".json,application/json"
        style="display: none;"
        @change="handleFileSelected"
      />
    </div>
  </aside>
</template>
