<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { IconConfig } from '@shared/configSchema'
import ColorPicker from './ColorPicker.vue'
import BarSlider from './BarSlider.vue'
import DragNumber from './DragNumber.vue'

const props = defineProps<{ modelValue: IconConfig }>()
const emit = defineEmits<{ 'update:modelValue': [v: IconConfig] }>()

function patch(p: Partial<IconConfig>) {
  emit('update:modelValue', { ...props.modelValue, ...p })
}

const DEFAULT_BG_SHAPE = { enabled: false, shape: 'circle' as const, color: '#000000', size: 24, opacity: 0.5 }
const DEFAULT_SHADOW = { enabled: false, color: '#000000', blur: 4, offsetX: 0, offsetY: 1, thickness: 1 }

const bgShape = computed(() => ({ ...DEFAULT_BG_SHAPE, ...props.modelValue.bgShape }))
const shadow = computed(() => ({ ...DEFAULT_SHADOW, ...props.modelValue.shadow }))

function patchShadow(p: Partial<IconConfig['shadow']>) {
  patch({ shadow: { ...shadow.value, ...p } })
}

function patchBgShape(p: Partial<IconConfig['bgShape']>) {
  patch({ bgShape: { ...bgShape.value, ...p } })
}

const BG_SHAPES: { id: IconConfig['bgShape']['shape']; label: string }[] = [
  { id: 'circle', label: '●' },
  { id: 'square', label: '■' },
  { id: 'rounded', label: '▢' },
  { id: 'diamond', label: '◆' },
]

const open = reactive({ bgShape: false, shadow: false, outline: false, classOutline: false })
</script>

<template>
  <div class="icon-editor">

    <!-- Visibility -->
    <div class="block">
      <div class="check-row">
        <label class="check-label">
          <input type="checkbox" :checked="modelValue.show"
            @change="e => patch({ show: (e.target as HTMLInputElement).checked })" />
          Show Icon
        </label>
        <label class="check-label">
          <input type="checkbox" :checked="modelValue.separateRow"
            @change="e => patch({ separateRow: (e.target as HTMLInputElement).checked })" />
          Separate Row
        </label>
      </div>
    </div>

    <!-- Size & Position -->
    <div class="block">
      <div class="block-title">Size &amp; Position</div>
      <div class="row">
        <label class="ctrl-label">Size</label>
        <BarSlider :model-value="modelValue.sizeOverride ?? 0" :min="0" :max="64" :step="1" unit="px"
          track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
          @update:model-value="v => patch({ sizeOverride: v })" />
        <DragNumber :model-value="modelValue.sizeOverride ?? 0" :min="0" :max="64" :step="1" unit="px" :speed="1"
          @update:model-value="v => patch({ sizeOverride: v })" />
      </div>
      <div class="row">
        <label class="ctrl-label">Opacity</label>
        <BarSlider :model-value="modelValue.opacity ?? 1" :min="0" :max="1" :step="0.01"
          track-color="linear-gradient(to right, transparent, #fff)"
          @update:model-value="v => patch({ opacity: v })" />
        <DragNumber :model-value="modelValue.opacity ?? 1" :min="0" :max="1" :step="0.01" :speed="0.005"
          @update:model-value="v => patch({ opacity: v })" />
      </div>
      <div class="row">
        <label class="ctrl-label">Offset X</label>
        <BarSlider :model-value="modelValue.offsetX ?? 0" :min="-200" :max="200" :step="1" unit="px"
          track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
          @update:model-value="v => patch({ offsetX: v })" />
        <DragNumber :model-value="modelValue.offsetX ?? 0" :min="-200" :max="200" :step="1" unit="px" :speed="1"
          @update:model-value="v => patch({ offsetX: v })" />
      </div>
      <div class="row">
        <label class="ctrl-label">Offset Y</label>
        <BarSlider :model-value="modelValue.offsetY ?? 0" :min="-200" :max="200" :step="1" unit="px"
          track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
          @update:model-value="v => patch({ offsetY: v })" />
        <DragNumber :model-value="modelValue.offsetY ?? 0" :min="-200" :max="200" :step="1" unit="px" :speed="1"
          @update:model-value="v => patch({ offsetY: v })" />
      </div>
      <div class="row">
        <label class="ctrl-label">Angle</label>
        <BarSlider :model-value="modelValue.rotation ?? 0" :min="-180" :max="180" :step="1" unit="°"
          track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
          @update:model-value="v => patch({ rotation: v })" />
        <DragNumber :model-value="modelValue.rotation ?? 0" :min="-180" :max="180" :step="1" unit="°" :speed="1"
          @update:model-value="v => patch({ rotation: v })" />
      </div>
    </div>

    <!-- Background Shape -->
    <div class="block">
      <div class="collapsible-header" @click="open.bgShape = !open.bgShape">
        <label class="check-label" @click.stop>
          <input type="checkbox" :checked="bgShape.enabled"
            @change="e => patchBgShape({ enabled: (e.target as HTMLInputElement).checked })" />
          Background Shape
        </label>
        <span class="chevron" :class="{ open: open.bgShape }">›</span>
      </div>
      <div v-if="open.bgShape && bgShape.enabled" class="collapsible-body">
        <div class="row">
          <label class="ctrl-label">Shape</label>
          <div class="pill-group">
            <button v-for="s in BG_SHAPES" :key="s.id"
              class="pill" :class="{ active: bgShape.shape === s.id }"
              @click="patchBgShape({ shape: s.id })">{{ s.label }}</button>
          </div>
        </div>
        <div class="row">
          <label class="ctrl-label">Color</label>
          <ColorPicker :model-value="bgShape.color" label="Color"
            @update:model-value="c => patchBgShape({ color: c })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Size</label>
          <BarSlider :model-value="bgShape.size" :min="10" :max="64" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="v => patchBgShape({ size: v })" />
          <DragNumber :model-value="bgShape.size" :min="10" :max="64" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchBgShape({ size: v })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Opacity</label>
          <BarSlider :model-value="bgShape.opacity" :min="0" :max="1" :step="0.01"
            track-color="linear-gradient(to right, transparent, #fff)"
            @update:model-value="v => patchBgShape({ opacity: v })" />
          <DragNumber :model-value="bgShape.opacity" :min="0" :max="1" :step="0.01" :speed="0.005"
            @update:model-value="v => patchBgShape({ opacity: v })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Offset X</label>
          <BarSlider :model-value="bgShape.offsetX ?? 0" :min="-50" :max="50" :step="1" unit="px"
            track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
            @update:model-value="v => patchBgShape({ offsetX: v })" />
          <DragNumber :model-value="bgShape.offsetX ?? 0" :min="-50" :max="50" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchBgShape({ offsetX: v })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Offset Y</label>
          <BarSlider :model-value="bgShape.offsetY ?? 0" :min="-50" :max="50" :step="1" unit="px"
            track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
            @update:model-value="v => patchBgShape({ offsetY: v })" />
          <DragNumber :model-value="bgShape.offsetY ?? 0" :min="-50" :max="50" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchBgShape({ offsetY: v })" />
        </div>
      </div>
      <div v-else-if="open.bgShape && !bgShape.enabled" class="collapsible-body">
        <p class="hint">Enable Background Shape to configure.</p>
      </div>
    </div>

    <!-- Icon Shadow -->
    <div class="block">
      <div class="collapsible-header" @click="open.shadow = !open.shadow">
        <label class="check-label" @click.stop>
          <input type="checkbox" :checked="shadow.enabled"
            @change="e => patchShadow({ enabled: (e.target as HTMLInputElement).checked })" />
          Shadow
        </label>
        <span class="chevron" :class="{ open: open.shadow }">›</span>
      </div>
      <div v-if="open.shadow && shadow.enabled" class="collapsible-body">
        <div class="row">
          <label class="ctrl-label">Color</label>
          <ColorPicker :model-value="shadow.color" label="Color"
            @update:model-value="c => patchShadow({ color: c })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Thickness</label>
          <BarSlider :model-value="shadow.thickness ?? 1" :min="0" :max="10" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="v => patchShadow({ thickness: v })" />
          <DragNumber :model-value="shadow.thickness ?? 1" :min="0" :max="10" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchShadow({ thickness: v })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Blur</label>
          <BarSlider :model-value="shadow.blur" :min="0" :max="20" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="v => patchShadow({ blur: v })" />
          <DragNumber :model-value="shadow.blur" :min="0" :max="20" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchShadow({ blur: v })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Offset X</label>
          <BarSlider :model-value="shadow.offsetX" :min="-10" :max="10" :step="1" unit="px"
            track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
            @update:model-value="v => patchShadow({ offsetX: v })" />
          <DragNumber :model-value="shadow.offsetX" :min="-10" :max="10" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchShadow({ offsetX: v })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Offset Y</label>
          <BarSlider :model-value="shadow.offsetY" :min="-10" :max="10" :step="1" unit="px"
            track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
            @update:model-value="v => patchShadow({ offsetY: v })" />
          <DragNumber :model-value="shadow.offsetY" :min="-10" :max="10" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchShadow({ offsetY: v })" />
        </div>
      </div>
    </div>

    <!-- Icon Outline -->
    <div class="block">
      <div class="collapsible-header" @click="open.outline = !open.outline">
        <label class="check-label" @click.stop>
          <input type="checkbox" :checked="modelValue.outline?.enabled"
            @change="e => patch({ outline: { enabled: (e.target as HTMLInputElement).checked, color: modelValue.outline?.color ?? '#ffffff', width: modelValue.outline?.width ?? 1 } })" />
          Icon Outline
        </label>
        <span class="chevron" :class="{ open: open.outline }">›</span>
      </div>
      <div v-if="open.outline && modelValue.outline?.enabled" class="collapsible-body">
        <div class="row">
          <label class="ctrl-label">Color</label>
          <ColorPicker :model-value="modelValue.outline?.color ?? '#000000'" label="Color"
            @update:model-value="c => patch({ outline: { ...(modelValue.outline ?? {}), color: c } })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Width</label>
          <DragNumber :model-value="modelValue.outline?.width ?? 1" :min="0" :max="8" :step="1" unit="px" :speed="1"
            @update:model-value="v => patch({ outline: { ...(modelValue.outline ?? {}), width: v } })" />
        </div>
      </div>
    </div>

    <!-- Class Outline -->
    <div class="block">
      <div class="collapsible-header" @click="open.classOutline = !open.classOutline">
        <label class="check-label" @click.stop>
          <input type="checkbox" :checked="modelValue.classOutline?.enabled"
            @change="e => patch({ classOutline: { enabled: (e.target as HTMLInputElement).checked, color: modelValue.classOutline?.color, width: modelValue.classOutline?.width ?? 1 } })" />
          Class Outline
        </label>
        <span class="chevron" :class="{ open: open.classOutline }">›</span>
      </div>
      <div v-if="open.classOutline && modelValue.classOutline?.enabled" class="collapsible-body">
        <div class="row">
          <label class="check-label">
            <input type="checkbox" :checked="!!modelValue.classOutline?.color"
              @change="e => {
                const checked = (e.target as HTMLInputElement).checked
                patch({ classOutline: { ...modelValue.classOutline!, color: checked ? '#ffffff' : undefined } })
              }" />
            Override Color
          </label>
        </div>
        <div v-if="modelValue.classOutline?.color" class="row">
          <label class="ctrl-label">Color</label>
          <ColorPicker :model-value="modelValue.classOutline.color" label="Color"
            @update:model-value="c => patch({ classOutline: { ...modelValue.classOutline!, color: c } })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Width</label>
          <DragNumber :model-value="modelValue.classOutline.width" :min="0" :max="8" :step="1" unit="px" :speed="1"
            @update:model-value="v => patch({ classOutline: { ...modelValue.classOutline!, width: v } })" />
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.icon-editor { display: flex; flex-direction: column; gap: 1px; min-width: 0; }

/* Top-level blocks */
.block {
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}

.block-title {
  font-size: 10px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 0.08em; padding: 8px 0 4px;
}

.block > .block-title,
.block > .row,
.block > .check-row {
  padding-left: var(--control-gap-lg);
  padding-right: var(--control-gap-lg);
}

.block > .block-title { padding-top: 8px; padding-bottom: 4px; }
.block > .check-row,
.block > .row { padding-top: 2px; padding-bottom: 2px; }

/* Inline rows within a block */
.row { display: flex; align-items: center; gap: var(--control-gap-sm); min-width: 0; padding: 3px 12px; }
.ctrl-label { font-size: 12px; color: var(--text-muted); min-width: var(--label-width); flex-shrink: 0; text-align: right; }

/* Checkbox rows */
.check-row { display: flex; align-items: center; gap: 16px; padding: 8px 12px; }
.check-label { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; cursor: pointer; flex-shrink: 0; }
.check-label:hover { color: var(--text); }
.check-label input[type="checkbox"] { accent-color: var(--accent); }

/* Collapsible headers (enable checkbox + expand arrow) */
.collapsible-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; cursor: pointer; transition: background 0.1s;
}
.collapsible-header:hover { background: var(--bg-hover); }
.chevron {
  font-size: 14px; color: var(--text-muted);
  transform: rotate(0deg); transition: transform 0.15s; line-height: 1; flex-shrink: 0;
}
.chevron.open { transform: rotate(90deg); }

/* Collapsible body */
.collapsible-body {
  display: flex; flex-direction: column; gap: 0;
  background: var(--bg-section);
  border-top: 1px solid var(--border);
  padding: var(--control-gap-sm) 0;
}

.hint { font-size: 11px; color: var(--text-muted); margin: 0; padding: 4px 12px; font-style: italic; }

/* Shape pills */
.pill-group { display: flex; gap: 4px; }
.pill {
  background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text-muted); font-size: 14px;
  width: 32px; height: 28px; cursor: pointer; transition: all 0.1s;
  display: flex; align-items: center; justify-content: center;
}
.pill:hover { background: var(--bg-hover); color: var(--text); }
.pill.active { background: var(--accent); border-color: var(--accent); color: #fff; }
</style>
