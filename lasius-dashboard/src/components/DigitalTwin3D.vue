<script setup lang="ts">
/**
 * 3D WebGL Digital Twin Viewport Container (`lasius-dashboard/src/components/DigitalTwin3D.vue`).
 *
 * Purpose & Role:
 *   Provides the DOM host container (`threeContainerRef`) for the Three.js
 *   `LasiusGraphicsEngine` along with floating overlay controls to toggle the
 *   2D orthographic projection strip (`toggle-2d`) and reset the OrbitControls
 *   camera perspective (`reset-cam`).
 */
import { ref } from 'vue';

defineProps<{
  isCollapsed?: boolean;
  showFootTrails?: boolean;
  groundLocked?: boolean;
}>();

defineEmits<{
  (e: 'toggle-2d'): void;
  (e: 'toggle-trails'): void;
  (e: 'toggle-ground-lock'): void;
  (e: 'reset-cam'): void;
}>();

const threeContainerRef = ref<HTMLDivElement | null>(null);

defineExpose({
  threeContainerRef
});
</script>

<template>
  <div class="viewport-3d-wrapper" id="viewport-3d-wrapper">
    <div class="canvas-card" id="card-3d">
      <div ref="threeContainerRef" id="threejs-container"></div>
      <!-- Floating Viewport Controls -->
      <button
        id="btn-toggle-2d"
        class="btn-subtle btn-3d-floating btn-3d-bottom-left"
        :class="{ active: isCollapsed }"
        title="Toggle 2D Projection Strip"
        @click="$emit('toggle-2d')"
      >
        {{ isCollapsed ? '+ 2D Strip' : '2D Strip' }}
      </button>
      <button
        id="btn-toggle-ground-lock"
        class="btn-subtle btn-3d-floating"
        style="bottom: 14px; right: 208px;"
        :class="{ active: groundLocked }"
        title="Toggle Kinematic Ground Contact Anchoring vs. Fixed Test Stand Mode"
        @click="$emit('toggle-ground-lock')"
      >
        {{ groundLocked ? 'Ground: ON' : 'Test Stand' }}
      </button>
      <button
        id="btn-toggle-trails"
        class="btn-subtle btn-3d-floating"
        style="bottom: 14px; right: 112px;"
        :class="{ active: showFootTrails }"
        title="Toggle 3D Foot Trajectory Trails & Ground Contact Rings"
        @click="$emit('toggle-trails')"
      >
        {{ showFootTrails ? 'Trails: ON' : 'Trails: OFF' }}
      </button>
      <button
        id="btn-reset-cam"
        class="btn-subtle btn-3d-floating btn-3d-bottom-right"
        title="Reset Camera View"
        @click="$emit('reset-cam')"
      >
        Reset Cam
      </button>
    </div>
  </div>
</template>
