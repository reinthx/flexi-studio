<template>
  <div class="scrollable-bars" :style="wrapperStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Orientation } from '../configSchema'
import type { CSSProperties } from 'vue'

const props = defineProps<{ maxHeight?: string; orientation?: Orientation }>()

const wrapperStyle = computed(() => {
  const isHorizontal = props.orientation === 'horizontal'
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: isHorizontal ? 'row' : 'column',
    width: '100%',
    maxHeight: props.maxHeight ?? 'unset',
    overflowX: isHorizontal ? 'auto' : 'hidden',
    overflowY: isHorizontal ? 'hidden' : 'auto',
  }
  if (isHorizontal) style.height = '100%'
  return style
})
</script>

<style scoped>
.scrollable-bars {
  /* no extra styling; this wrapper only controls scrolling boundaries */
}
</style>
