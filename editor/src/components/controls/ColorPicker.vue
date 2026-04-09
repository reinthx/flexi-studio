<script setup lang="ts">
/**
 * ColorPicker — hex + alpha input with a native color swatch.
 * Emits the full rgba() string or hex on change.
 *
 * v-model: string (CSS hex '#rrggbb' or 'rgba(r,g,b,a)')
 */
import { computed, ref, watch } from 'vue'

const props = defineProps<{ modelValue: string; label?: string }>()
const emit  = defineEmits<{ 'update:modelValue': [v: string] }>()

// Parse incoming value into hex + alpha
function parseColor(val: string): { hex: string; alpha: number } {
  if (!val) return { hex: '#ffffff', alpha: 1 }
  const rgba = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (rgba) {
    const r = parseInt(rgba[1]), g = parseInt(rgba[2]), b = parseInt(rgba[3])
    const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1
    return { hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`, alpha: a }
  }
  // hex or named color fallback
  return { hex: val.startsWith('#') ? val.slice(0,7) : '#ffffff', alpha: 1 }
}

const hex   = ref('#ffffff')
const alpha = ref(1)

// Initialize from prop before first render to avoid "rgba()" reaching native input[type=color]
const _init = (() => { const p = parseColor(props.modelValue ?? '#ffffff'); hex.value = p.hex; alpha.value = p.alpha })()

function syncFromProp() {
  const parsed = parseColor(props.modelValue ?? '#ffffff')
  hex.value   = parsed.hex
  alpha.value = parsed.alpha
}
watch(() => props.modelValue, syncFromProp)

function emitCurrent() {
  if (alpha.value >= 1) {
    emit('update:modelValue', hex.value)
  } else {
    const r = parseInt(hex.value.slice(1,3),16)
    const g = parseInt(hex.value.slice(3,5),16)
    const b = parseInt(hex.value.slice(5,7),16)
    emit('update:modelValue', `rgba(${r},${g},${b},${alpha.value.toFixed(2)})`)
  }
}

const hexInput = computed({
  get: () => hex.value,
  set: (v: string) => {
    // Accept partial input while typing
    if (/^#[0-9a-fA-F]{6}$/.test(v)) { hex.value = v; emitCurrent() }
    else hex.value = v
  }
})
</script>

<template>
  <div class="color-picker" @pointerdown.stop>
    <span v-if="label" class="cp-label">{{ label }}</span>
    <div class="cp-row">
      <!-- Native color input as swatch -->
      <input
        type="color"
        class="cp-swatch"
        :value="hex"
        @input="e => { hex = (e.target as HTMLInputElement).value; emitCurrent() }"
        @pointerdown.stop
      />
      <!-- Hex text input -->
      <input
        type="text"
        class="cp-hex"
        v-model="hexInput"
        maxlength="7"
        spellcheck="false"
        @pointerdown.stop
      />
      <!-- Alpha as % input -->
      <div class="cp-alpha-wrap" title="Opacity">
        <input
          type="text" 
          class="cp-alpha-input"
          :value="Math.round(alpha * 100)"
          placeholder="100"
          @input="e => { alpha = Math.min(100, Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0)) / 100; emitCurrent() }"
          @pointerdown.stop
        />
        <span class="cp-alpha-val">%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.color-picker { display: flex; flex-direction: column; gap: var(--control-gap-sm); }
.cp-label { font-size: 12px; color: var(--text-muted); }
.cp-row { display: flex; align-items: center; gap: var(--control-gap-sm); min-width: 0; }
.cp-swatch {
  width: var(--control-height); height: var(--control-height); padding: 0; border: 1px solid var(--border);
  border-radius: 4px; cursor: pointer; background: none; flex-shrink: 0;
}
.cp-hex {
  width: 70px; height: var(--control-height); background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text); font-size: 12px; font-family: monospace;
  padding: 0 8px; outline: none;
}
.cp-hex:focus { border-color: var(--accent); }
.cp-alpha-wrap { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.cp-alpha-input {
  width: 48px; height: var(--control-height); background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text); font-size: 12px; font-family: monospace;
  padding: 0 6px; outline: none; text-align: right;
}
.cp-alpha-input:focus { border-color: var(--accent); }
.cp-alpha-val { font-size: 11px; color: var(--text-muted); }
</style>
