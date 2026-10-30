<script setup lang="ts">
/**
 * 4-Tab Control Sidebar Container (`lasius-dashboard/src/components/sidebar/Sidebar.vue`).
 *
 * Purpose & Role:
 *   Renders the sticky tab navigation bar and switches between the four primary
 *   control panels of the Lasius Dashboard:
 *     1. `GaitTab`: Omnidirectional D-Pad, gait pattern morphing, and 6-DOF body attitude.
 *     2. `LegControlTab`: Direct single-leg joint sliders and Option C pulse trim calibration.
 *     3. `TestsTab`: Isolated harmonic step cycles, joint collision sweeps, and order log.
 *     4. `SystemTab`: Real-time Raspberry Pi hardware telemetry and KPI monitoring.
 */
import { onMounted, nextTick } from 'vue';
import { useDashboardStore } from '../../stores/dashboardStore';
import GaitTab from './GaitTab.vue';
import LegControlTab from './LegControlTab.vue';
import SystemTab from './SystemTab.vue';

const store = useDashboardStore();

function focusActiveTabButton(tab: 'gait' | 'legs' | 'system') {
  nextTick(() => {
    const btn = document.getElementById(`tab-btn-${tab}`) as HTMLButtonElement | null;
    btn?.focus();
  });
}

function selectTab(tab: 'gait' | 'legs' | 'system') {
  store.activeTab = tab;
  focusActiveTabButton(tab);
}

onMounted(() => {
  focusActiveTabButton(store.activeTab);
});
</script>

<template>
  <div class="sidebar-wrapper">
    <!-- Sticky Tab Navigation Wrapper -->
    <div class="tab-nav-wrapper">
      <nav class="tab-navigation" role="tablist" aria-label="Control Panels">
        <button
          class="tab-btn"
          :class="{ active: store.activeTab === 'gait' }"
          id="tab-btn-gait"
          data-tab="tab-pane-gait"
          role="tab"
          :aria-selected="store.activeTab === 'gait'"
          @click="selectTab('gait')"
        >
          Gait &amp; Directions
        </button>
        <button
          class="tab-btn"
          :class="{ active: store.activeTab === 'legs' }"
          id="tab-btn-legs"
          data-tab="tab-pane-legs"
          role="tab"
          :aria-selected="store.activeTab === 'legs'"
          @click="selectTab('legs')"
        >
          Leg Control
        </button>
        <button
          class="tab-btn"
          :class="{ active: store.activeTab === 'system' }"
          id="tab-btn-system"
          data-tab="tab-pane-system"
          role="tab"
          :aria-selected="store.activeTab === 'system'"
          @click="selectTab('system')"
        >
          System
        </button>
      </nav>
    </div>

    <!-- TAB 1: Gait & Directions -->
    <div
      id="tab-pane-gait"
      class="tab-pane"
      :class="{ active: store.activeTab === 'gait' }"
      role="tabpanel"
    >
      <GaitTab />
    </div>

    <!-- TAB 2: Leg Control -->
    <div
      id="tab-pane-legs"
      class="tab-pane"
      :class="{ active: store.activeTab === 'legs' }"
      role="tabpanel"
    >
      <LegControlTab />
    </div>

    <!-- TAB 3: System -->
    <div
      id="tab-pane-system"
      class="tab-pane"
      :class="{ active: store.activeTab === 'system' }"
      role="tabpanel"
    >
      <SystemTab />
    </div>
  </div>
</template>
