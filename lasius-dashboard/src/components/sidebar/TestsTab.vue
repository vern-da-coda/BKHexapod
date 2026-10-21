<script setup lang="ts">
import { useDashboardStore } from '../../stores/dashboardStore';
import type { LegKey } from '../../types';

const store = useDashboardStore();

const legKeys: Array<{ key: LegKey; label: string; title: string }> = [
  { key: 'left_front', label: 'LF', title: 'Select Left Front' },
  { key: 'left_middle', label: 'LM', title: 'Select Left Middle' },
  { key: 'left_rear', label: 'LR', title: 'Select Left Rear' },
  { key: 'right_front', label: 'RF', title: 'Select Right Front' },
  { key: 'right_middle', label: 'RM', title: 'Select Right Middle' },
  { key: 'right_rear', label: 'RR', title: 'Select Right Rear' }
];

function onCyclesInput(e: Event) {
  store.testCycles = parseInt((e.target as HTMLInputElement).value, 10);
}
</script>

<template>
  <aside class="control-card">
    <!-- Active Target Leg & Test Mode -->
    <div class="control-section">
      <div class="leg-selection-header-row">
        <div class="leg-title-wrap">
          <h2>Target Leg</h2>
          <span id="test-leg-info-badge" class="badge-accent">{{ store.selectedLegKey }}</span>
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

      <div class="control-group" style="margin-top: 10px;">
        <label for="slider-test-cycles">Cycles: <span id="val-test-cycles" class="val-badge">{{ store.testCycles }}</span></label>
        <input
          type="range"
          id="slider-test-cycles"
          min="1"
          max="10"
          step="1"
          :value="store.testCycles"
          @input="onCyclesInput"
        />
      </div>

      <div style="margin-top:6px;">
        <button id="btn-run-step-test" class="btn btn-primary" style="width:100%;" @click="store.runStepTest">
          Start Step Cycle
        </button>
      </div>
    </div>

    <!-- Joint Collision Sweep Tests -->
    <div class="control-section">
      <h2>Joint Collision Sweeps</h2>
      <p class="section-desc">Tests mechanical range of motion and checks for joint collisions.</p>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px;">
        <button
          id="btn-sweep-coxa"
          class="btn btn-secondary btn-compact"
          title="Coxa swivel sweep (-25° to +25°)"
          @click="store.runCollisionSweep('coxa')"
          @mouseenter="store.hoveredJoint = 'coxa'"
          @mouseleave="if (store.hoveredJoint === 'coxa') store.hoveredJoint = null;"
        >
          Sweep Coxa
        </button>
        <button
          id="btn-sweep-femur"
          class="btn btn-secondary btn-compact"
          title="Femur lift sweep (-45° to +45°)"
          @click="store.runCollisionSweep('femur')"
          @mouseenter="store.hoveredJoint = 'femur'"
          @mouseleave="if (store.hoveredJoint === 'femur') store.hoveredJoint = null;"
        >
          Sweep Femur
        </button>
        <button
          id="btn-sweep-tibia"
          class="btn btn-secondary btn-compact"
          title="Tibia knee sweep (-45° to +45°)"
          @click="store.runCollisionSweep('tibia')"
          @mouseenter="store.hoveredJoint = 'tibia'"
          @mouseleave="if (store.hoveredJoint === 'tibia') store.hoveredJoint = null;"
        >
          Sweep Tibia
        </button>
      </div>
    </div>

    <!-- System Diagnostics & Safety -->
    <div class="control-section">
      <h2>Hardware &amp; Safety Actions</h2>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
        <button
          id="btn-all-stance"
          class="btn btn-secondary"
          title="Move all legs smoothly into neutral ground stance position"
          @click="store.allStance"
        >
          All in Stance
        </button>
        <button
          id="btn-relax-all"
          class="btn btn-subtle-danger"
          title="Disable PWM to relax all 18 servos"
          @click="store.relaxAll"
        >
          Relax All Servos
        </button>
      </div>
    </div>

    <!-- Live Order Status & Feedback -->
    <div class="control-section" style="border-bottom:none; padding-bottom:0;">
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
