<script setup lang="ts">
import { useDashboardStore } from '../../stores/dashboardStore';
import GaitTab from './GaitTab.vue';
import LegControlTab from './LegControlTab.vue';
import TestsTab from './TestsTab.vue';
import SystemTab from './SystemTab.vue';

const store = useDashboardStore();
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
          @click="store.activeTab = 'gait'"
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
          @click="store.activeTab = 'legs'"
        >
          Leg Control
        </button>
        <button
          class="tab-btn"
          :class="{ active: store.activeTab === 'tests' }"
          id="tab-btn-tests"
          data-tab="tab-pane-tests"
          role="tab"
          :aria-selected="store.activeTab === 'tests'"
          @click="store.activeTab = 'tests'"
        >
          Tests
        </button>
        <button
          class="tab-btn"
          :class="{ active: store.activeTab === 'system' }"
          id="tab-btn-system"
          data-tab="tab-pane-system"
          role="tab"
          :aria-selected="store.activeTab === 'system'"
          @click="store.activeTab = 'system'"
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

    <!-- TAB 3: Tests -->
    <div
      id="tab-pane-tests"
      class="tab-pane"
      :class="{ active: store.activeTab === 'tests' }"
      role="tabpanel"
    >
      <TestsTab />
    </div>

    <!-- TAB 4: System -->
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
