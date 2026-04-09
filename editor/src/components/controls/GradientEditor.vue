<script setup lang="ts">
/**
 * GradientEditor — type + angle only.
 * Colors come from the Colors panel (role/job overrides).
 */
import { computed, inject } from 'vue'
import type { GradientFill, GradientAnimation } from '@shared/configSchema'
import BarSlider from './BarSlider.vue'
import DragNumber from './DragNumber.vue'

const openColorsPanel = inject<(() => void) | null>('openColorsPanel', null)

const props = defineProps<{ modelValue: GradientFill }>()
const emit  = defineEmits<{ 'update:modelValue': [v: GradientFill] }>()

function patch(p: Partial<GradientFill>) {
  emit('update:modelValue', { ...props.modelValue, ...p })
}

function patchAnimation(p: Partial<GradientAnimation>) {
  const currentAnim = props.modelValue.animation ?? { enabled: false, angleRotation: 'none', angleRotationSpeed: 5, angleRotationDirection: 'clockwise', scrollDirection: 'none', scrollSpeed: 5, shimmerEnabled: false, shimmerSpeed: 5, shimmerWidth: 30 }
  patch({ animation: { ...currentAnim, ...p } })
}

const anim = computed(() => props.modelValue.animation ?? { enabled: false, angleRotation: 'none', angleRotationSpeed: 5, angleRotationDirection: 'clockwise', scrollDirection: 'none', scrollSpeed: 5, shimmerEnabled: false, shimmerSpeed: 5, shimmerWidth: 30 })

// Angle indicator — needle rotates with the angle value
// CSS: angle 0 = top, CSS rotate 0 = right, so offset by -90deg
const needleStyle = computed(() => ({
  transform: `rotate(${(props.modelValue.angle ?? 90) - 90}deg)`,
}))

// Build a preview gradient for the dial background
const dialGradient = computed(() => {
  const a = props.modelValue.angle ?? 90
  const stops = (props.modelValue.stops ?? [])
    .map(s => `${s.color} ${(s.position * 100).toFixed(0)}%`).join(', ')
  if (!stops) return 'var(--bg-control)'
  return `linear-gradient(${a}deg, ${stops})`
})
</script>

<template>
  <div class="gradient-editor">
    <!-- Type selector -->
    <div class="row">
      <label class="ctrl-label">Type</label>
      <select class="ctrl-select" :value="modelValue.type"
        @change="e => patch({ type: (e.target as HTMLSelectElement).value as 'linear'|'radial' })">
        <option value="linear">Linear</option>
        <option value="radial">Radial</option>
      </select>
    </div>

    <!-- Angle row (linear only) -->
    <template v-if="modelValue.type === 'linear'">
      <div class="angle-row">
        <label class="ctrl-label">Angle</label>

        <!-- Circular angle dial -->
        <div class="angle-dial" :title="`${modelValue.angle ?? 90}°`"
          @click.prevent="e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const cx = rect.left + rect.width / 2
            const cy = rect.top + rect.height / 2
            const deg = Math.round(Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180 / Math.PI + 180) % 360
            patch({ angle: deg })
          }"
        >
          <div class="dial-bg" :style="{ background: dialGradient }" />
          <div class="dial-needle" :style="needleStyle" />
          <div class="dial-center" />
        </div>

        <BarSlider :model-value="modelValue.angle ?? 90" :min="0" :max="360" :step="1" unit="°"
          @update:model-value="v => patch({ angle: v })" />
        <DragNumber :model-value="modelValue.angle ?? 90" :min="0" :max="360" :step="1" unit="°" :speed="1"
          @update:model-value="v => patch({ angle: v })" />
      </div>
    </template>

    <a v-if="openColorsPanel" class="colors-link" @click="openColorsPanel">
      Go to Colors to set gradient colors &rarr;
    </a>
    <span v-else class="hint">Gradient colors come from the Colors panel (role/job overrides).</span>

    <!-- Animation section -->
    <details class="animation-section">
      <summary class="animation-toggle">Animation</summary>
      <div class="animation-controls">
        <div class="row">
          <label class="ctrl-label">Enable</label>
          <input type="checkbox" :checked="anim.enabled"
            @change="e => patchAnimation({ enabled: (e.target as HTMLInputElement).checked })" />
        </div>

        <template v-if="anim.enabled">
          <div class="row">
            <label class="ctrl-label">Angle Rotate</label>
            <select class="ctrl-select" :value="anim.angleRotation"
              @change="e => patchAnimation({ angleRotation: (e.target as HTMLSelectElement).value as GradientAnimation['angleRotation'] })">
              <option value="none">None</option>
              <option value="continuous">Continuous</option>
              <option value="oscillate">Oscillate</option>
            </select>
          </div>

          <template v-if="anim.angleRotation !== 'none'">
            <div class="row">
              <label class="ctrl-label">Rotation Speed</label>
              <BarSlider :model-value="anim.angleRotationSpeed" :min="1" :max="10" :step="1"
                @update:model-value="v => patchAnimation({ angleRotationSpeed: v })" />
            </div>
            <div class="row">
              <label class="ctrl-label">Direction</label>
              <select class="ctrl-select" :value="anim.angleRotationDirection"
                @change="e => patchAnimation({ angleRotationDirection: (e.target as HTMLSelectElement).value as 'clockwise' | 'counter-clockwise' })">
                <option value="clockwise">Clockwise</option>
                <option value="counter-clockwise">Counter-clockwise</option>
              </select>
            </div>
          </template>

          <div class="row">
            <label class="ctrl-label">Scroll</label>
            <select class="ctrl-select" :value="anim.scrollDirection"
              @change="e => patchAnimation({ scrollDirection: (e.target as HTMLSelectElement).value as GradientAnimation['scrollDirection'] })">
              <option value="none">None</option>
              <option value="left-to-right">Left to Right</option>
              <option value="right-to-left">Right to Left</option>
              <option value="top-to-bottom">Top to Bottom</option>
              <option value="bottom-to-top">Bottom to Top</option>
            </select>
          </div>

          <template v-if="anim.scrollDirection !== 'none'">
            <div class="row">
              <label class="ctrl-label">Scroll Speed</label>
              <BarSlider :model-value="anim.scrollSpeed" :min="1" :max="10" :step="1"
                @update:model-value="v => patchAnimation({ scrollSpeed: v })" />
            </div>
          </template>

          <div class="row">
            <label class="ctrl-label">Shimmer</label>
            <input type="checkbox" :checked="anim.shimmerEnabled"
              @change="e => patchAnimation({ shimmerEnabled: (e.target as HTMLInputElement).checked })" />
          </div>

          <template v-if="anim.shimmerEnabled">
            <div class="row">
              <label class="ctrl-label">Shimmer Speed</label>
              <BarSlider :model-value="anim.shimmerSpeed" :min="1" :max="10" :step="1"
                @update:model-value="v => patchAnimation({ shimmerSpeed: v })" />
            </div>
            <div class="row">
              <label class="ctrl-label">Shimmer Width</label>
              <BarSlider :model-value="anim.shimmerWidth" :min="10" :max="50" :step="1" unit="%"
                @update:model-value="v => patchAnimation({ shimmerWidth: v })" />
            </div>
          </template>
        </template>
      </div>
    </details>
  </div>
</template>

<style scoped>
.gradient-editor { display: flex; flex-direction: column; gap: 8px; min-width: 0; }

.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.angle-row { display: flex; align-items: center; gap: 6px; min-width: 0; }

.ctrl-label { font-size: 11px; color: var(--text-muted); min-width: var(--label-width); flex-shrink: 0; text-align: right; }
.ctrl-select {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text); font: 12px inherit; padding: 0 8px; outline: none;
  height: var(--control-height); flex: 1;
}
.ctrl-select:focus { border-color: var(--accent); }

/* Circular angle dial */
.angle-dial {
  width: 32px; height: 32px; border-radius: 50%;
  border: 1px solid var(--border); flex-shrink: 0;
  position: relative; cursor: crosshair; overflow: hidden;
}
.angle-dial:hover { border-color: var(--accent); }
.dial-bg {
  position: absolute; inset: 0; border-radius: 50%;
  opacity: 0.4;
}
.dial-needle {
  position: absolute;
  width: 2px; height: 50%;
  background: #fff;
  left: calc(50% - 1px); top: 0;
  transform-origin: bottom center;
  border-radius: 1px 1px 0 0;
  box-shadow: 0 0 2px rgba(0,0,0,0.8);
}
.dial-center {
  position: absolute;
  width: 6px; height: 6px;
  background: #fff; border-radius: 50%;
  left: calc(50% - 3px); top: calc(50% - 3px);
  box-shadow: 0 0 2px rgba(0,0,0,0.8);
}

.hint { font-size: 11px; color: var(--text-muted); margin: 10px 0 0 0; line-height: 1.4; }
.colors-link {
  font-size: 11px; color: var(--accent); cursor: pointer;
  text-decoration: none; transition: opacity 0.15s; display: block; margin: 10px 0 0 0;
}
.colors-link:hover { opacity: 0.8; text-decoration: underline; }

.animation-section {
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-top: 10px;
}
.animation-toggle {
  font-size: 11px;
  color: var(--text);
  padding: 6px 8px;
  cursor: pointer;
  background: var(--bg-control);
  border-radius: 3px 3px 0 0;
  user-select: none;
}
.animation-toggle:hover {
  background: var(--bg-hover);
}
.animation-controls {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-panel);
  border-radius: 0 0 3px 3px;
}
</style>
