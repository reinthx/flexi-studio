<script setup lang="ts">
/**
 * ShadowEditor — reusable shadow controls (enable, color, X/Y offsets, blur, thickness).
 * Used for bar fill shadow, background shadow, etc.
 */
import type { BarShadow } from '@shared/configSchema'
import ColorPicker from './ColorPicker.vue'
import BarSlider from './BarSlider.vue'
import DragNumber from './DragNumber.vue'

const props = withDefaults(defineProps<{
  modelValue: BarShadow
  enableMode?: 'checkbox' | 'opacity'  // 'opacity' sets color alpha to 0 instead of enabled=false
}>(), {
  enableMode: 'checkbox',
})
const emit = defineEmits<{ 'update:modelValue': [v: BarShadow] }>()

function patch(p: Partial<BarShadow>) {
  emit('update:modelValue', { ...props.modelValue, ...p })
}

function onToggle(checked: boolean) {
  if (props.enableMode === 'opacity') {
    // Keep enabled=true, but set color alpha to 0 when "disabled"
    if (!checked) {
      patch({ color: setAlpha(props.modelValue.color, 0) })
    } else {
      // Restore alpha to 1 if currently 0
      const alpha = getAlpha(props.modelValue.color)
      if (alpha === 0) patch({ color: setAlpha(props.modelValue.color, 1) })
    }
  } else {
    patch({ enabled: checked })
  }
}

function isEnabled(): boolean {
  if (props.enableMode === 'opacity') {
    return getAlpha(props.modelValue.color) > 0
  }
  return props.modelValue.enabled
}

function getAlpha(color: string): number {
  const m = color.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)
  return m ? parseFloat(m[1]) : 1
}

function setAlpha(color: string, a: number): string {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`
  // hex
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
</script>

<template>
  <div class="shadow-editor">
    <div class="row">
      <label class="ctrl-label">
        <input type="checkbox" :checked="isEnabled()" @change="e => onToggle((e.target as HTMLInputElement).checked)" />
        Enable
      </label>
    </div>
    <template v-if="isEnabled()">
      <div class="row">
        <label class="ctrl-label">Color</label>
        <ColorPicker :model-value="modelValue.color" @update:model-value="c => patch({ color: c })" />
      </div>
      <div class="slider-row">
        <span class="corner-lbl">X</span>
        <BarSlider :model-value="modelValue.offsetX" :min="-20" :max="20" :step="1" unit="px"
          track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
          @update:model-value="v => patch({ offsetX: v })" />
        <DragNumber :model-value="modelValue.offsetX" :min="-20" :max="20" :step="1" unit="px" :speed="1"
          @update:model-value="v => patch({ offsetX: v })" />
      </div>
      <div class="slider-row">
        <span class="corner-lbl">Y</span>
        <BarSlider :model-value="modelValue.offsetY" :min="-20" :max="20" :step="1" unit="px"
          track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
          @update:model-value="v => patch({ offsetY: v })" />
        <DragNumber :model-value="modelValue.offsetY" :min="-20" :max="20" :step="1" unit="px" :speed="1"
          @update:model-value="v => patch({ offsetY: v })" />
      </div>
      <div class="slider-row">
        <span class="corner-lbl">Blur</span>
        <BarSlider :model-value="modelValue.blur" :min="0" :max="20" :step="1" unit="px"
          track-color="linear-gradient(to right, #1a1a2e, #666)"
          @update:model-value="v => patch({ blur: v })" />
        <DragNumber :model-value="modelValue.blur" :min="0" :max="20" :step="1" unit="px" :speed="1"
          @update:model-value="v => patch({ blur: v })" />
      </div>
      <div class="slider-row">
        <span class="corner-lbl">Spread</span>
        <BarSlider :model-value="modelValue.thickness ?? 0" :min="0" :max="20" :step="1" unit="px"
          track-color="linear-gradient(to right, #1a1a2e, #666)"
          @update:model-value="v => patch({ thickness: v })" />
        <DragNumber :model-value="modelValue.thickness ?? 0" :min="0" :max="20" :step="1" unit="px" :speed="1"
          @update:model-value="v => patch({ thickness: v })" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.shadow-editor { display: flex; flex-direction: column; gap: var(--control-gap-md); }
.row { display: flex; align-items: center; gap: var(--control-gap-md); }
.ctrl-label {
  font-size: 12px; color: var(--text-muted); display: flex; align-items: center;
  gap: var(--control-gap-sm); flex-shrink: 0; min-width: var(--label-width); justify-content: flex-end;
}
.slider-row { display: flex; align-items: center; gap: var(--control-gap-sm); }
.corner-lbl { font-size: 11px; color: var(--text-muted); min-width: var(--label-width); text-align: right; flex-shrink: 0; }
</style>
