<script setup lang="ts">
import { useDashboardStore } from '../../stores/dashboardStore';
import type { LegKey } from '../../types';
import JointCard from './JointCard.vue';

const store = useDashboardStore();

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

    <!-- Global Leg Actions Toolbar -->
    <div class="leg-actions-toolbar">
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
        Stance Position
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
      <button
        type="button"
        id="btn-calib-reset-leg"
        class="btn btn-secondary btn-compact"
        title="Revert this leg's overlay to config.yaml factory settings"
        @click="store.resetLegCalibration"
      >
        Reset Leg
      </button>
    </div>

    <!-- Unified Joint Cards: Coxa, Femur, Tibia -->
    <div class="control-section" style="gap: 14px; border-bottom: none; padding-bottom: 0;">
      <JointCard jointType="coxa" title="Coxa" subtitle="(Hip Swivel)" />
      <JointCard jointType="femur" title="Femur" subtitle="(Thigh Lift)" />
      <JointCard jointType="tibia" title="Tibia" subtitle="(Shin / Knee)" />
    </div>
  </aside>
</template>
