<script setup lang="ts">
/**
 * Alpha-bar style horizontal slider.
 * Renders a gradient track with a draggable thumb — same look as a color picker's
 * alpha/hue channel slider.
 */
import { ref, computed, useTemplateRef } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  trackColor?: string   // CSS gradient or solid for the track background
  unit?: string
}>(), {
  min: 0,
  max: 100,
  step: 1,
  trackColor: 'linear-gradient(to right, #1a1a2e, var(--accent))',
  unit: '',
})

const emit = defineEmits<{ 'update:modelValue': [v: number] }>()

const trackRef = useTemplateRef<HTMLElement>('trackEl')
const dragging = ref(false)

const pct = computed(() => {
  const range = props.max - props.min
  return range === 0 ? 0 : ((props.modelValue - props.min) / range) * 100
})

const displayVal = computed(() => {
  const v = props.modelValue ?? 0
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
})

function clamp(v: number) {
  return Math.min(props.max, Math.max(props.min, v))
}

function posToValue(clientX: number): number {
  const el = trackRef.value
  if (!el) return props.modelValue
  const rect = el.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  const range = props.max - props.min
  const raw = props.min + ratio * range
  // snap to step
  const stepped = Math.round(raw / props.step) * props.step
  return clamp(parseFloat(stepped.toFixed(10)))
}

function onTrackClick(e: MouseEvent) {
  e.stopPropagation()
  emit('update:modelValue', posToValue(e.clientX))
}

function onThumbDown(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  dragging.value = true

  function onMove(ev: MouseEvent) {
    emit('update:modelValue', posToValue(ev.clientX))
  }
  function onUp() {
    dragging.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<template>
  <div class="bar-slider">
    <div
      ref="trackEl"
      class="slider-track"
      :style="{ background: trackColor }"
      @click="onTrackClick"
    >
      <div
        class="slider-thumb"
        :style="{ left: `${pct}%` }"
        :class="{ dragging }"
        @mousedown.stop="onThumbDown"
      />
    </div>
    <span class="slider-val">{{ displayVal }}{{ unit }}</span>
  </div>
</template>

<style scoped>
.bar-slider {
  display: flex; align-items: center; gap: var(--control-gap-sm); flex: 1;
}
.slider-track {
  position: relative;
  flex: 1; height: var(--control-height);
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--border);
}
.slider-thumb {
  position: absolute;
  top: 50%; transform: translate(-50%, -50%);
  width: 8px; height: var(--control-height);
  background: #d0d0d8;
  border: 1px solid rgba(0,0,0,0.5);
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.6);
  cursor: grab;
  transition: box-shadow 0.1s;
}
.slider-thumb.dragging,
.slider-thumb:active { cursor: grabbing; box-shadow: 0 0 0 2px var(--accent); }
.slider-val {
  font-size: 12px; color: var(--text-muted);
  min-width: 40px; text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
