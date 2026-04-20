<script setup lang="ts">
/**
 * FillEditor — solid / gradient / texture type selector.
 * v-model: BarFill
 */
import { computed, inject } from 'vue'
import type { BarFill, GradientFill, TextureFill } from '@shared/configSchema'
import GradientEditor from './GradientEditor.vue'
import TextureEditor from './TextureEditor.vue'
import ColorPicker from './ColorPicker.vue'
import BarSlider from './BarSlider.vue'
import DragNumber from './DragNumber.vue'

const props = defineProps<{ modelValue: BarFill; label?: string }>()
const emit  = defineEmits<{ 'update:modelValue': [v: BarFill] }>()

const openColorsPanel = inject<(() => void) | null>('openColorsPanel', null)

const activeTab = computed(() => props.modelValue.type)

function switchTab(type: BarFill['type']) {
  if (type === props.modelValue.type) return
  if (type === 'solid')    emit('update:modelValue', { type: 'solid', color: '#4a90d9', override: false, applyJobColor: false, applyRoleColor: false })
  if (type === 'gradient') emit('update:modelValue', { type: 'gradient', gradient: DEFAULT_GRADIENT, override: false, applyJobColor: false, applyRoleColor: false })
  if (type === 'texture')  emit('update:modelValue', { type: 'texture', texture: DEFAULT_TEXTURE, override: false, applyJobColor: false, applyRoleColor: false })
}

const DEFAULT_GRADIENT: GradientFill = {
  type: 'linear', angle: 90,
  stops: [{ position: 0, color: '#4a90d9' }, { position: 1, color: '#1a1a2e' }],
}
const DEFAULT_TEXTURE: TextureFill = {
  src: '', repeat: 'stretch', opacity: 1, blendMode: 'normal',
}

function onGradient(gradient: GradientFill) { emit('update:modelValue', { type: 'gradient', gradient, opacity: props.modelValue.opacity, override: props.modelValue.override, applyJobColor: props.modelValue.applyJobColor, applyRoleColor: props.modelValue.applyRoleColor }) }
function onTexture(texture: TextureFill)    { emit('update:modelValue', { type: 'texture', texture, opacity: props.modelValue.opacity, override: props.modelValue.override, applyJobColor: props.modelValue.applyJobColor, applyRoleColor: props.modelValue.applyRoleColor }) }
function onOpacity(o: number) { emit('update:modelValue', { ...props.modelValue, opacity: o }) }

const override = computed(() => props.modelValue.override ?? false)
const applyJobColor = computed(() => props.modelValue.applyJobColor ?? false)
const applyRoleColor = computed(() => props.modelValue.applyRoleColor ?? false)

function setOverride(v: boolean) { emit('update:modelValue', { ...props.modelValue, override: v }) }
function setApplyJobColor(v: boolean) { emit('update:modelValue', { ...props.modelValue, applyJobColor: v }) }
function setApplyRoleColor(v: boolean) { emit('update:modelValue', { ...props.modelValue, applyRoleColor: v }) }

function getBaseColor(): string {
  if (props.modelValue.type === 'solid') return props.modelValue.color
  if (props.modelValue.type === 'gradient' && props.modelValue.gradient?.stops?.[0]) return props.modelValue.gradient.stops[0].color
  if (props.modelValue.type === 'texture' && props.modelValue.texture) {
    if (props.modelValue.texture.tintGradient?.stops?.[0]) return props.modelValue.texture.tintGradient.stops[0].color
    if (props.modelValue.texture.tintColor) return props.modelValue.texture.tintColor
  }
  return '#4a90d9'
}

function setBaseColor(color: string) {
  if (props.modelValue.type === 'solid') {
    emit('update:modelValue', { ...props.modelValue, color })
  } else if (props.modelValue.type === 'gradient' && props.modelValue.gradient) {
    const newStops = [...props.modelValue.gradient.stops]
    newStops[0] = { ...newStops[0], color }
    emit('update:modelValue', { ...props.modelValue, gradient: { ...props.modelValue.gradient, stops: newStops } })
  } else if (props.modelValue.type === 'texture' && props.modelValue.texture) {
    const tex = props.modelValue.texture
    if (tex.tintGradient) {
      const newStops = [...tex.tintGradient.stops]
      newStops[0] = { ...newStops[0], color }
      emit('update:modelValue', { ...props.modelValue, texture: { ...tex, tintGradient: { ...tex.tintGradient, stops: newStops } } })
    } else {
      emit('update:modelValue', { ...props.modelValue, texture: { ...tex, tintColor: color } })
    }
  }
}

const showColorsLink = computed(() => !override.value && !applyJobColor.value && !applyRoleColor.value)

const tintMode = computed<'none' | 'solid' | 'gradient'>(() => {
  if (props.modelValue.type !== 'texture') return 'none'
  const tex = props.modelValue.texture
  if (tex?.tintGradient) return 'gradient'
  if (tex?.tintColor) return 'solid'
  return 'none'
})

function setTintMode(mode: 'none' | 'solid' | 'gradient') {
  if (props.modelValue.type !== 'texture') return
  const tex = props.modelValue.texture
  if (mode === 'none') {
    onTexture({ ...tex, tintColor: undefined, tintGradient: undefined })
  } else if (mode === 'solid') {
    onTexture({ ...tex, tintColor: tex.tintColor ?? '#ffffff', tintGradient: undefined })
  } else {
    const existing = tex.tintGradient
    onTexture({
      ...tex,
      tintColor: undefined,
      tintGradient: existing ?? { type: 'linear', angle: 90, stops: [{ position: 0, color: '#ffffff' }, { position: 1, color: '#000000' }] },
    })
  }
}

const textureFill = computed<TextureFill | undefined>(() =>
  props.modelValue.type === 'texture' ? props.modelValue.texture : undefined
)

const tintGradient = computed<GradientFill>(() =>
  textureFill.value?.tintGradient ?? { type: 'linear', angle: 90, stops: [{ position: 0, color: '#ffffff' }, { position: 1, color: '#000000' }] }
)

function patchTintGradient(p: Partial<GradientFill>) {
  const tex = textureFill.value
  if (!tex) return
  onTexture({ ...tex, tintGradient: { ...tintGradient.value, ...p } })
}

function setTintGradientColor(stopIndex: number, color: string) {
  const tex = textureFill.value
  if (!tex) return
  const stops = tintGradient.value.stops.map((s, i) => i === stopIndex ? { ...s, color } : s)
  patchTintGradient({ stops })
}
</script>

<template>
  <div class="fill-editor">
    <div v-if="label" class="fill-label">{{ label }}</div>

    <!-- Tab bar -->
    <div class="tabs">
      <button v-for="t in ['solid','gradient','texture']" :key="t"
        class="tab" :class="{ active: activeTab === t }" @click="switchTab(t as BarFill['type'])">
        {{ t[0].toUpperCase() + t.slice(1) }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="tab-body">
      <!-- Color picker row -->
      <div class="color-row">
        <span class="ctrl-label">Color</span>
        <ColorPicker :model-value="getBaseColor()" @update:model-value="setBaseColor" />
      </div>

      <!-- Override checkbox -->
      <div class="checkbox-row">
        <input type="checkbox" class="cb" :checked="override" @change="e => setOverride((e.target as HTMLInputElement).checked)" />
        <label class="cb-label">Override</label>
        <span class="cb-hint">(use explicit color instead of Colors panel)</span>
      </div>

      <!-- Apply Job Color checkbox -->
      <div class="checkbox-row">
        <input type="checkbox" class="cb" :checked="applyJobColor" @change="e => setApplyJobColor((e.target as HTMLInputElement).checked)" />
        <label class="cb-label">Apply Job Color</label>
        <span class="cb-hint">(add job tint on top)</span>
      </div>

      <!-- Apply Role Color checkbox -->
      <div class="checkbox-row">
        <input type="checkbox" class="cb" :checked="applyRoleColor" @change="e => setApplyRoleColor((e.target as HTMLInputElement).checked)" />
        <label class="cb-label">Apply Role Color</label>
        <span class="cb-hint">(add role tint on top)</span>
      </div>

      <!-- Colors link (when no override and no tints) -->
      <div class="solid-info-wrap">
        <a v-if="showColorsLink && openColorsPanel" class="colors-link" @click="openColorsPanel">
          Go to Colors to modify bar color &rarr;
        </a>
        <span v-if="showColorsLink && !openColorsPanel" class="solid-info">Bar color is set per role/job in Colors panel</span>
      </div>

      <!-- Gradient tint controls (texture tab only) -->
      <template v-if="activeTab === 'texture'">
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
            <ColorPicker :model-value="textureFill?.tintColor ?? '#ffffff'" @update:model-value="c => textureFill && onTexture({ ...textureFill, tintColor: c })" />
          </div>
        </template>

        <template v-if="tintMode === 'gradient'">
          <div class="row">
            <label class="ctrl-label">Type</label>
            <select class="ctrl-select" :value="tintGradient.type" @change="e => patchTintGradient({ type: (e.target as HTMLSelectElement).value as 'linear' | 'radial' })">
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </select>
          </div>
          <div v-if="tintGradient.type === 'linear'" class="row">
            <label class="ctrl-label">Angle</label>
            <BarSlider
              :model-value="tintGradient.angle ?? 90"
              :min="0"
              :max="360"
              :step="1"
              unit="°"
              @update:model-value="v => patchTintGradient({ angle: v })"
            />
          </div>
          <div class="row">
            <label class="ctrl-label">Color 2</label>
            <ColorPicker :model-value="tintGradient.stops[1]?.color ?? '#000000'" @update:model-value="c => setTintGradientColor(1, c)" />
          </div>
          <div class="gradient-info-wrap">
            <a v-if="!override && openColorsPanel" class="colors-link" @click="openColorsPanel">
              Go to Colors to set gradient colors &rarr;
            </a>
            <span v-else-if="!override" class="solid-info">Gradient color is set per role/job in Colors panel</span>
          </div>
        </template>
      </template>

      <template v-if="activeTab === 'gradient'">
        <GradientEditor
          :model-value="(modelValue as Extract<BarFill, {type:'gradient'}>).gradient"
          @update:model-value="onGradient"
        />
      </template>

      <template v-if="activeTab === 'texture'">
        <TextureEditor
          :model-value="(modelValue as Extract<BarFill, {type:'texture'}>).texture"
          @update:model-value="onTexture"
        />
      </template>

      <template v-if="activeTab !== 'texture'">
        <div class="row">
          <label class="ctrl-label">Opacity</label>
          <BarSlider
            :model-value="modelValue.opacity ?? 1"
            :min="0"
            :max="1"
            :step="0.01"
            unit=""
            track-color="linear-gradient(to right, transparent, #fff)"
            @update:model-value="onOpacity"
          />
          <DragNumber
            :model-value="modelValue.opacity ?? 1"
            :min="0"
            :max="1"
            :step="0.01"
            :speed="0.005"
            @update:model-value="onOpacity"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fill-editor { display: flex; flex-direction: column; gap: var(--control-gap-md); min-width: 0; }
.fill-label { font-size: 12px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
.tabs { display: flex; gap: 2px; }
.tab {
  flex: 1; background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text-muted); font-size: 12px;
  padding: 0; cursor: pointer; transition: all 0.1s; height: var(--control-height);
}
.tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.tab:hover:not(.active) { background: var(--bg-hover); color: var(--text); }
.tab-body { padding: var(--control-gap-sm) 0; }
.color-row { display: flex; align-items: center; gap: var(--control-gap-sm); }
.checkbox-row { display: flex; align-items: center; gap: 6px; }
.cb { width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }
.cb-label { font-size: 12px; color: var(--text); cursor: pointer; }
.cb-hint { font-size: 10px; color: var(--text-muted); }
.solid-info-wrap { margin-top: 6px; }
.gradient-info-wrap { margin-top: 6px; }
.solid-info { font-size: 11px; color: var(--text-muted); font-style: italic; }
.colors-link {
  font-size: 11px; color: var(--accent); cursor: pointer;
  text-decoration: none; transition: opacity 0.15s;
}
.colors-link:hover { opacity: 0.8; text-decoration: underline; }
.row { display: flex; align-items: center; gap: var(--control-gap-sm); }
.ctrl-label { font-size: 12px; color: var(--text-muted); min-width: var(--label-width); flex-shrink: 0; text-align: right; }
</style>