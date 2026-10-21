<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  isCollapsed: boolean;
}>();

const topCanvasRef = ref<HTMLCanvasElement | null>(null);
const frontCanvasRef = ref<HTMLCanvasElement | null>(null);
const sideCanvasRef = ref<HTMLCanvasElement | null>(null);

defineExpose({
  topCanvasRef,
  frontCanvasRef,
  sideCanvasRef
});
</script>

<template>
  <aside class="strip-2d-wrapper" id="strip-2d-wrapper" :class="{ collapsed: isCollapsed }">
    <div class="strip-2d-body">
      <!-- Top View Card -->
      <div class="canvas-card" id="card-top">
        <div class="canvas-body">
          <canvas ref="topCanvasRef" id="robotCanvas"></canvas>
        </div>
      </div>

      <!-- Front View Card (XZ) -->
      <div class="canvas-card" id="card-front">
        <div class="canvas-body">
          <canvas ref="frontCanvasRef" id="frontCanvas"></canvas>
        </div>
      </div>

      <!-- Side View Card (YZ) -->
      <div class="canvas-card" id="card-side">
        <div class="canvas-body">
          <canvas ref="sideCanvasRef" id="sideCanvas"></canvas>
        </div>
      </div>
    </div>
  </aside>
</template>
