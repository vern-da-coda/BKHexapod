<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  isCollapsed?: boolean;
}>();

defineEmits<{
  (e: 'toggle-2d'): void;
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
