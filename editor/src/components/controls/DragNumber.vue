<script setup lang="ts">
/**
 * DragNumber — click-drag scrubber (à la Blender/Photoshop).
 * - Click and drag left/right to decrease/increase value
 * - Double-click to enter a typed value
 * - Shows unit label (e.g. "px", "°")
 */
import { ref, computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  unit?: string
  label?: string
  speed?: number   // px of drag per unit change (lower = faster)
}>(), {
  min: -Infinity,
  max: Infinity,
  step: 1,
  unit: '',
  speed: 2,
})

const emit = defineEmits<{ 'update:modelValue': [v: number] }>()

const editing  = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const editVal  = ref('')

const display = computed(() => {
  const v = props.modelValue
  return Number.isInteger(props.step) ? String(v) : v.toFixed(1)
})

// ── Drag ──────────────────────────────────────────────────────────────────────
let dragStartX = 0
let dragStartVal = 0
let didDrag = false

function clamp(v: number) {
  const rounded = Math.round(v / props.step) * props.step
  return Math.max(props.min, Math.min(props.max, rounded))
}

function onMousedown(e: MouseEvent) {
  if (editing.value) return
  didDrag = false
  dragStartX = e.clientX
  dragStartVal = props.modelValue
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onMousemove)
  window.addEventListener('mouseup', onMouseup)
}

function onMousemove(e: MouseEvent) {
  const totalDx = e.clientX - dragStartX
  if (Math.abs(totalDx) > 2) didDrag = true
  const raw = dragStartVal + (totalDx / props.speed) * props.step
  emit('update:modelValue', clamp(raw))
}

function onMouseup() {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('mousemove', onMousemove)
  window.removeEventListener('mouseup', onMouseup)
  if (!didDrag) startEditing()
}

// ── Typing ────────────────────────────────────────────────────────────────────
function startEditing() {
  editVal.value = String(props.modelValue)
  editing.value = true
  setTimeout(() => { inputRef.value?.select() }, 0)
}

function commitEdit() {
  const parsed = parseFloat(editVal.value)
  if (!isNaN(parsed)) emit('update:modelValue', clamp(parsed))
  editing.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter')  commitEdit()
  if (e.key === 'Escape') editing.value = false
}
</script>

<template>
  <div class="drag-number" :title="label ? `${label}: drag or click to edit` : 'Drag or click to edit'">
    <!-- Display mode -->
    <div v-if="!editing" class="display" @mousedown="onMousedown">
      <span class="value">{{ display }}</span>
      <span v-if="unit" class="unit">{{ unit }}</span>
    </div>
    <!-- Edit mode -->
    <input
      v-else
      ref="inputRef"
      class="edit-input"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      v-model="editVal"
      @blur="commitEdit"
      @keydown="onKeydown"
    />
  </div>
</template>

<style scoped>
.drag-number { display: inline-flex; align-items: stretch; min-width: 60px; }

.display {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  padding: 0 8px; cursor: ew-resize; user-select: none;
  width: 100%; min-width: 60px; height: var(--control-height);
  transition: border-color 0.1s;
}
.display:hover { border-color: var(--accent); }

.value { font-size: 12px; color: var(--text); font-variant-numeric: tabular-nums; }
.unit  { font-size: 11px; color: var(--text-muted); }

.edit-input {
  width: 100%; min-width: 60px; height: var(--control-height);
  background: var(--bg-control); border: 1px solid var(--accent); border-radius: 4px;
  color: var(--text); font-size: 12px; padding: 0 8px; outline: none;
  text-align: center;
}
/* Hide browser spin arrows */
.edit-input::-webkit-outer-spin-button,
.edit-input::-webkit-inner-spin-button { -webkit-appearance: none; }
</style>
