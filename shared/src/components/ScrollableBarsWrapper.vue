<template>
  <div class="scrollable-bars" :style="wrapperStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ maxHeight?: string }>()

const wrapperStyle = computed(() => ({
  display: 'block',
  width: '100%',
  maxHeight: props.maxHeight ?? 'unset',
  overflowY: 'auto' as const,
}))
</script>

<style scoped>
.scrollable-bars {
  /* no extra styling; this wrapper only controls scrolling boundaries */
}
</style>
