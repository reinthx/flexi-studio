<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TextureFill, TexturePagination, Orientation } from '@shared/configSchema'
import { BAR_TEXTURE_PRESETS } from '@shared/texturePresets'
import { processImageFile } from '../../lib/imageProcessor'
import BarSlider from './BarSlider.vue'

const props = defineProps<{ modelValue: TextureFill; orientation?: Orientation }>()
const emit  = defineEmits<{ 'update:modelValue': [v: TextureFill] }>()

const loading = ref(false)
const error   = ref('')

// Ensure repeat value is always defined and matches type
const repeatValue = computed(() => props.modelValue?.repeat ?? 'stretch')
const isHorizontal = computed(() => props.orientation === 'horizontal')

function patch(p: Partial<TextureFill>) {
  emit('update:modelValue', { ...props.modelValue, ...p })
}

function patchPagination(p: Partial<TexturePagination>) {
  const currentPag = props.modelValue.pagination ?? { enabled: false, startOffsetX: 0, startOffsetY: 0 }
  patch({ pagination: { ...currentPag, ...p } })
}

const pag = computed(() => props.modelValue.pagination ?? { enabled: false, startOffsetX: 0, startOffsetY: 0 })

// Which preset is currently selected (matches by src), or '' for custom
const selectedPreset = computed(() => {
  const match = BAR_TEXTURE_PRESETS.find(p => p.src === props.modelValue.src)
  return match?.name ?? ''
})

function onPresetSelect(e: Event) {
  const name = (e.target as HTMLSelectElement).value
  if (!name) return
  const preset = BAR_TEXTURE_PRESETS.find(p => p.name === name)
  if (preset) {
    patch({ src: preset.src, repeat: 'stretch', opacity: 1, blendMode: 'normal' })
  }
}

async function handleFile(file: File) {
  if (!file.type.startsWith('image/')) { error.value = 'Not an image file'; return }
  loading.value = true; error.value = ''
  try {
    const src = await processImageFile(file)
    patch({ src })
  } catch (e) {
    error.value = 'Failed to process image'
  } finally {
    loading.value = false
  }
}

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleFile(file)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

const dragging = ref(false)

const BLEND_MODES = [
  'normal','multiply','screen','overlay','darken','lighten',
  'color-dodge','color-burn','hard-light','soft-light','difference','exclusion',
]

// ── Tint controls ──────────────────────────────────────────────────────────────
const tintMode = computed<'none' | 'solid' | 'gradient'>(() => {
  if (props.modelValue.tintGradient) return 'gradient'
  if (props.modelValue.tintColor) return 'solid'
  return 'none'
})

function setTintMode(mode: 'none' | 'solid' | 'gradient') {
  if (mode === 'none') {
    patch({ tintColor: undefined, tintGradient: undefined })
  } else if (mode === 'solid') {
    patch({ tintColor: props.modelValue.tintColor ?? '#ffffff', tintGradient: undefined })
  } else {
    const existing = props.modelValue.tintGradient
    patch({
      tintColor: undefined,
      tintGradient: existing ?? { type: 'linear', angle: 90, stops: [{ position: 0, color: '#ffffff' }, { position: 1, color: '#000000' }] },
    })
  }
}

</script>

<template>
  <div class="texture-editor">
    <!-- Texture preset dropdown -->
    <div class="row">
      <label class="ctrl-label">Texture</label>
      <select class="ctrl-select" :value="selectedPreset" @change="onPresetSelect">
        <option value="" disabled>Select texture…</option>
        <option v-for="p in BAR_TEXTURE_PRESETS" :key="p.name" :value="p.name">{{ p.name }}</option>
      </select>
    </div>

    <!-- Preview + custom upload -->
    <div
      class="drop-zone"
      :class="{ active: dragging, 'has-image': !!modelValue.src }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop="onDrop"
    >
      <img v-if="modelValue.src" :src="modelValue.src" class="preview-img" alt="texture" />
      <div v-else class="drop-hint">
        <span>Drop image or select preset</span>
      </div>
      <div v-if="loading" class="loading-overlay">Converting…</div>
    </div>

    <!-- Custom image upload -->
    <label class="file-btn small">
      {{ modelValue.src ? 'Custom image…' : 'Browse…' }}
      <input type="file" accept="image/*" style="display:none" @change="onFileInput" />
    </label>

    <span v-if="error" class="error-msg">{{ error }}</span>

    <!-- Options dropdown -->
    <details class="options-section">
      <summary class="options-toggle">Options</summary>
      <div class="options-controls">
        <div class="row">
          <label class="ctrl-label">Repeat</label>
          <select class="ctrl-select" :value="repeatValue"
            @change="e => {
              if (!props.modelValue) return
              const val = (e.target as HTMLInputElement).value
              const currentPag = props.modelValue.pagination ?? { enabled: false, startOffsetX: 0, startOffsetY: 0 }
              if (val === 'paginate') {
                if (isHorizontal) return
                patch({ repeat: 'paginate', pagination: { ...currentPag, enabled: true } })
              } else {
                patch({ repeat: val as 'repeat' | 'no-repeat' | 'stretch', pagination: { ...currentPag, enabled: false } })
              }
            }">
            <option value="repeat">Tile</option>
            <option value="no-repeat">No repeat</option>
            <option value="stretch">Stretch</option>
            <option value="paginate" :disabled="isHorizontal">Paginate{{ isHorizontal ? ' (Vertical only)' : '' }}</option>
          </select>
        </div>
        <p v-if="isHorizontal && repeatValue === 'paginate'" class="hint">
          Paginated textures use Vertical row offsets, so Horizontal previews and overlays fall back to stretch.
        </p>

        <div class="options-spacer" />

        <div class="row">
          <label class="ctrl-label">Opacity</label>
          <BarSlider
            :model-value="modelValue.opacity"
            :min="0"
            :max="1"
            :step="0.01"
            unit=""
            @update:model-value="v => patch({ opacity: v })"
          />
        </div>

        <div class="row">
          <label class="ctrl-label">Blend Mode</label>
          <select class="ctrl-select" :value="modelValue.blendMode"
            @change="e => patch({ blendMode: (e.target as HTMLInputElement).value })">
            <option v-for="m in BLEND_MODES" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>

        <div class="options-spacer" />

        <!-- Tint controls -->
        <div class="row">
          <label class="ctrl-label">Tint</label>
          <select class="ctrl-select" :value="tintMode" @change="e => setTintMode((e.target as HTMLSelectElement).value as 'none' | 'solid' | 'gradient')">
            <option value="none">None</option>
            <option value="solid">Solid</option>
            <option value="gradient">Gradient</option>
          </select>
        </div>

        <template v-if="tintMode === 'solid'">
          <div class="row">
            <label class="ctrl-label">Color</label>
            <input type="color" :value="modelValue.tintColor ?? '#ffffff'" @input="e => patch({ tintColor: (e.target as HTMLInputElement).value })" />
          </div>
        </template>

        <div class="options-spacer" />

        <div class="row">
          <label class="ctrl-label">Start Offset X</label>
          <BarSlider
            :model-value="pag.startOffsetX ?? 0"
            :min="-100"
            :max="100"
            :step="1"
            unit="px"
            @update:model-value="v => patchPagination({ startOffsetX: v })"
          />
        </div>

        <div class="row">
          <label class="ctrl-label">Start Offset Y</label>
          <BarSlider
            :model-value="pag.startOffsetY ?? 0"
            :min="-100"
            :max="100"
            :step="1"
            unit="px"
            @update:model-value="v => patchPagination({ startOffsetY: v })"
          />
        </div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.texture-editor { display: flex; flex-direction: column; gap: 8px; }
.drop-zone {
  border: 2px dashed var(--border); border-radius: 4px;
  min-height: 80px; display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden; transition: border-color 0.15s;
}
.drop-zone.active  { border-color: var(--accent); }
.drop-zone.has-image { border-style: solid; }
.drop-hint { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--text-muted); font-size: 12px; }
.or { font-size: 10px; }
.preview-img { max-width: 100%; max-height: 120px; object-fit: contain; }
.loading-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: #fff;
}
.file-btn {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 3px;
  color: var(--text); font: 11px inherit; padding: 3px 10px; cursor: pointer;
  display: inline-block; text-align: center;
}
.file-btn.small { font-size: 11px; }
.file-btn:hover { background: var(--bg-hover); }
.error-msg { font-size: 11px; color: #e63946; }
.row { display: flex; align-items: center; gap: var(--control-gap-sm); }
.ctrl-label { font-size: 12px; color: var(--text-muted); min-width: var(--label-width); flex-shrink: 0; text-align: right; }
.ctrl-select {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text); font: 12px inherit; padding: 0 8px; outline: none;
  height: var(--control-height); flex: 1;
}
.small-btn {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 3px;
  color: var(--text); font: 10px inherit; padding: 2px 6px; cursor: pointer;
}
.small-btn:hover { background: var(--bg-hover); }

.options-section {
  border: 1px solid var(--border);
  border-radius: 4px;
}
.options-toggle {
  font-size: 11px;
  color: var(--text);
  padding: 6px 8px;
  cursor: pointer;
  background: var(--bg-control);
  border-radius: 3px 3px 0 0;
  user-select: none;
}
.options-toggle:hover {
  background: var(--bg-hover);
}
.options-controls {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-panel);
  border-radius: 0 0 3px 3px;
}
.options-spacer {
  height: 8px;
}

.checkbox-row { display: flex; align-items: center; gap: 6px; }
.cb { width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }
.cb-label { font-size: 12px; color: var(--text); cursor: pointer; }
.cb-hint { font-size: 10px; color: var(--text-muted); }

input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}
</style>
