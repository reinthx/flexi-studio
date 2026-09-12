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
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  }
  if (isHorizontal) style.height = '100%'
  return style
})
</script>

<style scoped>
.scrollable-bars {
  /* Inner scroller: outer .bars-container stays hidden so only one
     scroll context exists. Scrollbars are hidden for overlay use. */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scrollable-bars::-webkit-scrollbar {
  display: none;
}
</style>
