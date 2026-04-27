<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { useDraggable } from '@vueuse/core'
import type { BarLabel, LabelField } from '@shared/configSchema'
import ColorPicker from './ColorPicker.vue'
import FontSelector from './FontSelector.vue'
import DragNumber from './DragNumber.vue'
import BarSlider from './BarSlider.vue'

// Style override modal state
const styleModalFieldId = ref<string | null>(null)
const modalRef = useTemplateRef<HTMLElement>('modalEl')
const handleRef = useTemplateRef<HTMLElement>('handleEl')
const { x: dragX, y: dragY } = useDraggable(modalRef, {
  handle: handleRef,
  preventDefault: true,
  initialValue: { x: window.innerWidth * 0.1, y: window.innerHeight * 0.35 },
})

function getStyleModalField(): LabelField | null {
  if (!styleModalFieldId.value) return null
  return getFields().find(f => f.id === styleModalFieldId.value) ?? null
}

function openStyleModal(id: string) { styleModalFieldId.value = id }
function closeStyleModal() { styleModalFieldId.value = null }

function patchModalField(p: Partial<LabelField>) {
  if (!styleModalFieldId.value) return
  patchField(styleModalFieldId.value, p)
}

const props = defineProps<{ modelValue: BarLabel }>()
const emit  = defineEmits<{ 'update:modelValue': [v: BarLabel] }>()

function patch(p: Partial<BarLabel>) {
  emit('update:modelValue', { ...props.modelValue, ...p })
}
function patchShadow(p: Partial<BarLabel['shadow']>) {
  patch({ shadow: { ...props.modelValue.shadow, ...p } })
}

const open = ref({ text: true, fields: true, effects: false, deaths: false })

// ── Field management ──────────────────────────────────────────────────────────

const TOKENS = [
  { token: '{name}',       label: 'Name' },
  { token: '{job}',        label: 'Job' },
  { token: '{rank}',       label: 'Rank' },
  { token: '{value}',      label: 'DPS' },
  { token: '{pct}',        label: '% Total' },
  { token: '{crithit%}',   label: 'Crit %' },
  { token: '{directhit%}', label: 'Direct Hit %' },
  { token: '{enchps}',     label: 'HPS' },
  { token: '{rdps}',       label: 'rDPS' },
  { token: '{maxHit}',     label: 'Max Hit' },
  { token: '{maxHitName}', label: 'Max Hit Name' },
  { token: '{maxHitValue}', label: 'Max Hit Value' },
]

const activeFieldId = ref<string | null>(null)
const fieldInputRefs = ref<Record<string, HTMLInputElement | null>>({})

// Drag-to-reorder
const dragSrcIdx = ref<number | null>(null)
const dragOverIdx = ref<number | null>(null)

function onDragStart(e: DragEvent, idx: number) {
  dragSrcIdx.value = idx
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e: DragEvent, idx: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverIdx.value = idx
}

function onDragLeave() {
  dragOverIdx.value = null
}

function onDrop(e: DragEvent, idx: number) {
  e.preventDefault()
  const src = dragSrcIdx.value
  if (src === null || src === idx) { dragSrcIdx.value = null; dragOverIdx.value = null; return }
  const fields = [...getFields()]
  const [moved] = fields.splice(src, 1)
  fields.splice(idx, 0, moved)
  patchFields(fields)
  dragSrcIdx.value = null
  dragOverIdx.value = null
}

function onDragEnd() {
  dragSrcIdx.value = null
  dragOverIdx.value = null
}

function getFields(): LabelField[] {
  return props.modelValue.fields ?? []
}

function patchFields(fields: LabelField[]) {
  patch({ fields })
}

function patchField(id: string, p: Partial<LabelField>) {
  patchFields(getFields().map(f => f.id === id ? { ...f, ...p } : f))
}

function addField() {
  const fields = getFields()
  if (fields.length >= 7) return
  const id = `f${Date.now()}`
  patchFields([...fields, {
    id,
    template: '',
    hAnchor: 'left',
    vAnchor: 'middle',
    offsetX: 0,
    offsetY: 0,
    enabled: true,
  }])
  activeFieldId.value = id
}

function removeField(id: string) {
  patchFields(getFields().filter(f => f.id !== id))
  if (activeFieldId.value === id) activeFieldId.value = null
}

function insertToken(fieldId: string, token: string) {
  const el = fieldInputRefs.value[fieldId]
  if (!el) return
  const field = getFields().find(f => f.id === fieldId)
  if (!field) return
  const start = el.selectionStart ?? el.value.length
  const end   = el.selectionEnd   ?? el.value.length
  const next = field.template.slice(0, start) + token + field.template.slice(end)
  patchField(fieldId, { template: next })
  setTimeout(() => {
    el.setSelectionRange(start + token.length, start + token.length)
    el.focus()
  }, 0)
}
</script>

<template>
  <div class="label-editor">

    <!-- ── Text ──────────────────────────────────────────────────────────── -->
    <div class="sub-section">
      <div class="sub-header" @click="open.text = !open.text">
        <span>Text</span><span class="chevron">{{ open.text ? '▾' : '▸' }}</span>
      </div>
      <div v-if="open.text" class="sub-body">
        <div class="row col">
          <label class="ctrl-label">Font</label>
          <FontSelector :model-value="modelValue.font" @update:model-value="f => patch({ font: f })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Size</label>
          <DragNumber :model-value="modelValue.size" :min="6" :max="48" unit="px" :speed="1"
            @update:model-value="v => patch({ size: v })" />
          <div style="flex:1" />
          <ColorPicker :model-value="modelValue.color" label="Color"
            @update:model-value="c => patch({ color: c })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Transform</label>
          <select class="ctrl-select" :value="modelValue.textTransform ?? 'none'"
            @change="e => patch({ textTransform: (e.target as HTMLSelectElement).value as BarLabel['textTransform'] })">
            <option value="none">None</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
            <option value="capitalize">Capitalize</option>
          </select>
        </div>
        <div class="row">
          <label class="ctrl-label">Padding</label>
          <DragNumber :model-value="modelValue.padding ?? 4" :min="0" :max="20" unit="px" :speed="1"
            @update:model-value="v => patch({ padding: v })" />
          <label class="ctrl-label" style="width:auto">Gap</label>
          <DragNumber :model-value="modelValue.gap ?? 4" :min="0" :max="20" unit="px" :speed="1"
            @update:model-value="v => patch({ gap: v })" />
        </div>
      </div>
    </div>

    <!-- ── Fields ────────────────────────────────────────────────────────── -->
    <div class="sub-section">
      <div class="sub-header" @click="open.fields = !open.fields">
        <span>Fields ({{ getFields().filter(f => f.enabled).length }}/{{ getFields().length }})</span>
        <span class="chevron">{{ open.fields ? '▾' : '▸' }}</span>
      </div>
      <div v-if="open.fields" class="sub-body">

        <div v-for="(field, idx) in getFields()" :key="field.id" class="field-card"
          :class="{ active: activeFieldId === field.id, 'drag-over': dragOverIdx === idx && dragSrcIdx !== idx }"
          draggable="true"
          @dragstart="onDragStart($event, idx)"
          @dragover="onDragOver($event, idx)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, idx)"
          @dragend="onDragEnd">

          <!-- Field header row -->
          <div class="field-header" @click="activeFieldId = activeFieldId === field.id ? null : field.id">
            <span class="drag-handle" title="Drag to reorder">⠿</span>
            <label class="effect-toggle" @click.stop>
              <input type="checkbox" :checked="field.enabled"
                @change="e => patchField(field.id, { enabled: (e.target as HTMLInputElement).checked })" />
            </label>
            <span class="field-title">Field {{ idx + 1 }}</span>
            <span class="field-preview">{{ field.template || '(empty)' }}</span>
            <button class="field-remove" @click.stop="removeField(field.id)" title="Remove field">✕</button>
          </div>

          <!-- Field body (expanded) -->
          <div v-if="activeFieldId === field.id" class="field-body">
            <!-- Template input -->
            <div class="row col">
              <label class="ctrl-label" style="justify-content:flex-start">Template</label>
              <input
                :ref="(el) => { fieldInputRefs[field.id] = el as HTMLInputElement | null }"
                type="text"
                class="template-input"
                :value="field.template"
                placeholder="{name} or {value} ({pct})"
                @input="e => patchField(field.id, { template: (e.target as HTMLInputElement).value })"
                @focus="activeFieldId = field.id"
              />
            </div>

            <!-- Token chips -->
            <div class="token-row">
              <button v-for="t in TOKENS" :key="t.token"
                class="token-chip" type="button"
                @click="insertToken(field.id, t.token)" :title="t.token">
                {{ t.label }}
              </button>
            </div>

            <!-- Anchor -->
            <div class="row">
              <label class="ctrl-label">H Anchor</label>
              <div class="btn-group">
                <button v-for="a in ['left','center','right']" :key="a"
                  class="anchor-btn" :class="{ active: (field.hAnchor ?? 'left') === a }"
                  type="button" @click="patchField(field.id, { hAnchor: a as LabelField['hAnchor'] })">
                  {{ a === 'left' ? '◀' : a === 'right' ? '▶' : '◆' }}
                </button>
              </div>
              <label class="ctrl-label" style="width:auto">V Anchor</label>
              <div class="btn-group">
                <button v-for="a in ['top','middle','bottom']" :key="a"
                  class="anchor-btn" :class="{ active: (field.vAnchor ?? 'middle') === a }"
                  type="button" @click="patchField(field.id, { vAnchor: a as LabelField['vAnchor'] })">
                  {{ a === 'top' ? '▲' : a === 'bottom' ? '▼' : '◆' }}
                </button>
              </div>
            </div>
            <div class="row">
              <label class="ctrl-label">Grows From</label>
              <div class="btn-group">
                <button v-for="a in [{ id: undefined, label: 'Auto', title: 'Match anchor direction' }, { id: 'left', label: '◀|', title: 'Left edge pinned — text grows right' }, { id: 'center', label: '◆', title: 'Center pinned — text grows both ways' }, { id: 'right', label: '|▶', title: 'Right edge pinned — text grows left' }]" :key="String(a.id)"
                  class="anchor-btn" :class="{ active: (field.growsFrom ?? undefined) === a.id }"
                  :title="a.title"
                  type="button" @click="patchField(field.id, { growsFrom: a.id as LabelField['growsFrom'] })">
                  {{ a.label }}
                </button>
              </div>
            </div>

            <!-- Value Format -->
            <div class="row">
              <label class="ctrl-label">Value Fmt</label>
              <select class="ctrl-select" :value="field.valueFormat ?? ''"
                @change="e => patchField(field.id, { valueFormat: ((e.target as HTMLSelectElement).value || undefined) as LabelField['valueFormat'] })">
                <option value="">Global</option>
                <option value="raw">Raw (1234)</option>
                <option value="abbreviated">Short (1.2k)</option>
                <option value="formatted">Formatted (1,234)</option>
              </select>
            </div>

            <!-- Offsets -->
            <div class="row">
              <label class="ctrl-label">X</label>
              <BarSlider :model-value="field.offsetX ?? 0" :min="-60" :max="60" :step="1" unit="px"
                track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
                @update:model-value="v => patchField(field.id, { offsetX: v })" />
              <DragNumber :model-value="field.offsetX ?? 0" :min="-60" :max="60" unit="px" :speed="1"
                @update:model-value="v => patchField(field.id, { offsetX: v })" />
            </div>
            <div class="row">
              <label class="ctrl-label">Y</label>
              <BarSlider :model-value="field.offsetY ?? 0" :min="-60" :max="60" :step="1" unit="px"
                track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
                @update:model-value="v => patchField(field.id, { offsetY: v })" />
              <DragNumber :model-value="field.offsetY ?? 0" :min="-60" :max="60" unit="px" :speed="1"
                @update:model-value="v => patchField(field.id, { offsetY: v })" />
            </div>

            <!-- Opacity -->
            <div class="row">
              <label class="ctrl-label">Opacity</label>
              <BarSlider :model-value="field.opacity ?? 1" :min="0" :max="1" :step="0.01"
                track-color="linear-gradient(to right, transparent, #fff)"
                @update:model-value="v => patchField(field.id, { opacity: v >= 1 ? undefined : v })" />
              <DragNumber :model-value="field.opacity ?? 1" :min="0" :max="1" :step="0.01" :speed="0.005"
                @update:model-value="v => patchField(field.id, { opacity: v >= 1 ? undefined : v })" />
            </div>

            <!-- Style Override button -->
            <button class="field-style-btn" type="button" @click.stop="openStyleModal(field.id)">
              Style Override
              <span v-if="field.font || field.fontSize || field.colorMode || field.selfMode || field.maxWidth || field.growsFrom" class="style-dot" />
            </button>
          </div>
        </div>

        <!-- Add field -->
        <button v-if="getFields().length < 7" class="add-field-btn" type="button" @click="addField">
          + Add Field
        </button>
        <p v-else class="hint">Maximum 7 fields</p>
      </div>
    </div>

    <!-- ── Deaths ────────────────────────────────────────────────────────── -->
    <div class="sub-section">
      <div class="sub-header" @click="open.deaths = !open.deaths">
        <span>Deaths</span><span class="chevron">{{ open.deaths ? '▾' : '▸' }}</span>
      </div>
      <div v-if="open.deaths" class="sub-body">
        <div class="row">
          <label class="ctrl-label">
            <input type="checkbox" :checked="modelValue.separateRowDeaths ?? false"
              @change="e => patch({ separateRowDeaths: (e.target as HTMLInputElement).checked })" />
            Enable
          </label>
        </div>
        <template v-if="modelValue.separateRowDeaths">
          <div class="row">
            <label class="ctrl-label">Size</label>
            <DragNumber :model-value="modelValue.deathSize ?? 12" :min="6" :max="36" unit="px" :speed="1"
              @update:model-value="v => patch({ deathSize: v })" />
            <label class="ctrl-label" style="width:auto">Opacity</label>
            <DragNumber :model-value="modelValue.deathOpacity ?? 1" :min="0" :max="1" :step="0.01" :speed="0.005"
              @update:model-value="v => patch({ deathOpacity: v })" />
          </div>
          <div class="row">
            <label class="ctrl-label">X</label>
            <BarSlider :model-value="modelValue.deathOffsetX ?? 0" :min="-200" :max="200" :step="1" unit="px"
              track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
              @update:model-value="v => patch({ deathOffsetX: v })" />
            <DragNumber :model-value="modelValue.deathOffsetX ?? 0" :min="-200" :max="200" :step="1" unit="px" :speed="1"
              @update:model-value="v => patch({ deathOffsetX: v })" />
          </div>
          <div class="row">
            <label class="ctrl-label">Y</label>
            <BarSlider :model-value="modelValue.deathOffsetY ?? 0" :min="-200" :max="200" :step="1" unit="px"
              track-color="linear-gradient(to right, var(--accent), #1a1a2e, var(--accent))"
              @update:model-value="v => patch({ deathOffsetY: v })" />
            <DragNumber :model-value="modelValue.deathOffsetY ?? 0" :min="-200" :max="200" :step="1" unit="px" :speed="1"
              @update:model-value="v => patch({ deathOffsetY: v })" />
          </div>
        </template>
      </div>
    </div>

    <!-- ── Effects ────────────────────────────────────────────────────────── -->
    <div class="sub-section">
      <div class="sub-header" @click="open.effects = !open.effects">
        <span>Effects</span><span class="chevron">{{ open.effects ? '▾' : '▸' }}</span>
      </div>
      <div v-if="open.effects" class="sub-body">

        <!-- Text Shadow -->
        <div class="effect-group">
          <label class="effect-toggle">
            <input type="checkbox" :checked="modelValue.shadow?.enabled ?? false"
              @change="e => patchShadow({ enabled: (e.target as HTMLInputElement).checked })" />
            <span>Text Shadow</span>
          </label>
          <template v-if="modelValue.shadow?.enabled">
            <div class="row">
              <ColorPicker :model-value="modelValue.shadow?.color ?? '#000000'" label="Color"
                @update:model-value="c => patchShadow({ color: c })" />
            </div>
            <div class="row">
              <label class="ctrl-label">Thickness</label>
              <DragNumber :model-value="modelValue.shadow?.thickness ?? 1" :min="0" :max="10" :step="1" unit="px" :speed="1"
                @update:model-value="v => patchShadow({ thickness: v })" />
              <label class="ctrl-label" style="width:auto">Blur</label>
              <DragNumber :model-value="modelValue.shadow?.blur ?? 2" :min="0" :max="20" unit="px" :speed="1"
                @update:model-value="v => patchShadow({ blur: v })" />
            </div>
            <div class="row">
              <label class="ctrl-label">X</label>
              <DragNumber :model-value="modelValue.shadow?.offsetX ?? 0" :min="-30" :max="30" unit="px" :speed="1"
                @update:model-value="v => patchShadow({ offsetX: v })" />
              <label class="ctrl-label" style="width:auto">Y</label>
              <DragNumber :model-value="modelValue.shadow?.offsetY ?? 0" :min="-30" :max="30" unit="px" :speed="1"
                @update:model-value="v => patchShadow({ offsetY: v })" />
            </div>
          </template>
        </div>

        <!-- Text Outline -->
        <div class="effect-group">
          <label class="effect-toggle">
            <input type="checkbox" :checked="modelValue.outline?.enabled ?? false"
              @change="e => patch({ outline: { ...(modelValue.outline ?? {}), enabled: (e.target as HTMLInputElement).checked } })" />
            <span>Text Outline</span>
          </label>
          <template v-if="modelValue.outline?.enabled">
            <div class="row">
              <ColorPicker :model-value="modelValue.outline?.color ?? '#000000'" label="Color"
                @update:model-value="c => patch({ outline: { ...(modelValue.outline ?? {}), color: c } })" />
              <label class="ctrl-label" style="width:auto">Width</label>
              <DragNumber :model-value="modelValue.outline?.width ?? 1" :min="1" :max="6" unit="px" :speed="1"
                @update:model-value="v => patch({ outline: { ...(modelValue.outline ?? {}), width: v } })" />
            </div>
            <!-- Gradient Outline: hidden until feature is complete -->
            <!-- <div class="row">
              <label class="effect-toggle" style="font-size:11px">
                <input type="checkbox" :checked="!!modelValue.outline?.gradient"
                  @change="e => patch({ outline: { ...(modelValue.outline ?? {}), gradient: (e.target as HTMLInputElement).checked ? { type: 'linear', angle: 90, stops: [{ position: 0, color: modelValue.outline?.color ?? '#000000' }, { position: 1, color: '#444444' }] } : null } })" />
                <span>Gradient Outline</span>
              </label>
            </div>
            <template v-if="modelValue.outline?.gradient">
              <GradientEditor :model-value="modelValue.outline.gradient" @update:model-value="g => patch({ outline: { ...(modelValue.outline ?? {}), gradient: g } })" />
            </template> -->
          </template>
        </div>

      </div>
    </div>

  </div>

  <!-- ── Style Override Modal ──────────────────────────────────────────── -->
  <Teleport to="body">
    <template v-if="styleModalFieldId && getStyleModalField()">
      <div class="style-modal-backdrop" @click="closeStyleModal" />
      <div ref="modalEl" class="style-modal" :style="{ left: `${dragX}px`, top: `${dragY}px` }" @click.stop>
        <!-- Header -->
        <div ref="handleEl" class="style-modal-header">
          <span>Field Style Override</span>
          <button class="style-modal-close" type="button" @click="closeStyleModal">✕</button>
        </div>

        <div class="style-modal-body">
          <!-- Font -->
          <div class="sm-row col">
            <label class="sm-label">Font</label>
            <FontSelector :model-value="getStyleModalField()!.font ?? ''"
              @update:model-value="f => patchModalField({ font: f || undefined })" />
            <span class="sm-hint">Empty = inherit global font</span>
          </div>

          <!-- Size + Rotation -->
          <div class="sm-row">
            <label class="sm-label">Size</label>
            <DragNumber :model-value="getStyleModalField()!.fontSize ?? 0" :min="0" :max="72" unit="px" :speed="1"
              @update:model-value="v => patchModalField({ fontSize: v > 0 ? v : undefined })" />
            <span class="sm-hint-inline">0 = global</span>
          </div>
          <div class="sm-row">
            <label class="sm-label" style="margin-left:12px">Rotation</label>
            <DragNumber :model-value="getStyleModalField()!.rotation ?? 0" :min="0" :max="360" unit="°" :speed="1"
              @update:model-value="v => patchModalField({ rotation: v > 0 ? v : undefined })" />
            <span class="sm-hint-inline">0 = none</span>
          </div>
          <div class="sm-row">
            <label class="sm-label">
              <input type="checkbox" :checked="!!getStyleModalField()!.autoRotation"
                @change="e => patchModalField({ autoRotation: (e.target as HTMLInputElement).checked ? true : undefined })" />
              Match Bar Angle
            </label>
          </div>
          <div v-if="getStyleModalField()!.autoRotation" class="sm-row">
            <label class="sm-label">Width Ratio</label>
            <DragNumber :model-value="getStyleModalField()!.autoRotationRatio ?? 0" :min="10" :max="500" :step="10" unit="" :speed="5"
              @update:model-value="v => patchModalField({ autoRotationRatio: v > 0 ? v : undefined })" />
            <span class="sm-hint-inline">0 = auto</span>
          </div>

          <!-- Color mode -->
          <div class="sm-row col">
            <label class="sm-label">Color</label>
            <div class="sm-color-modes">
              <button v-for="mode in [{id:undefined,label:'None'},{id:'custom',label:'Custom'},{id:'job',label:'Job'},{id:'role',label:'Role'}]"
                :key="String(mode.id)"
                class="sm-mode-btn" :class="{ active: getStyleModalField()!.colorMode === mode.id }"
                type="button"
                @click="patchModalField({ colorMode: mode.id as LabelField['colorMode'], gradient: undefined })">
                {{ mode.label }}
              </button>
              <span class="sm-mode-sep" />
              <button
                class="sm-mode-btn sm-mode-self" :class="{ active: getStyleModalField()!.selfMode }"
                type="button"
                title="Also override with Self color when this is your bar (AND/OR with Color mode above)"
                @click="patchModalField({ selfMode: getStyleModalField()!.selfMode ? undefined : true, selfGradient: undefined })">
                Self
              </button>
            </div>

            <!-- Custom: Color 1 -->
            <div v-if="getStyleModalField()!.colorMode === 'custom'" class="sm-row" style="margin-top:6px">
              <label class="sm-label">Value</label>
              <ColorPicker :model-value="getStyleModalField()!.color ?? modelValue.color" label="Color"
                @update:model-value="c => {
                  const grad = getStyleModalField()!.gradient
                  if (grad) {
                    patchModalField({ color: c, gradient: { ...grad, stops: [{ ...grad.stops[0], color: c }, ...grad.stops.slice(1)] } })
                  } else {
                    patchModalField({ color: c })
                  }
                }" />
            </div>
            <!-- Custom: Gradient -->
            <div v-if="getStyleModalField()!.colorMode === 'custom'" class="sm-row" style="margin-top:6px">
              <label class="sm-label">
                <input type="checkbox" :checked="!!getStyleModalField()!.gradient"
                  @change="e => {
                    const isGrad = (e.target as HTMLInputElement).checked
                    if (isGrad) {
                      patchModalField({ gradient: { type: 'linear', angle: 90, stops: [{ position: 0, color: getStyleModalField()!.color ?? '#ffffff' }, { position: 1, color: '#000000' }] } })
                    } else {
                      patchModalField({ gradient: undefined })
                    }
                  }" />
                Gradient
              </label>
            </div>
            <template v-if="getStyleModalField()!.colorMode === 'custom' && getStyleModalField()!.gradient">
              <div class="sm-row">
                <label class="sm-label">Angle</label>
                <DragNumber :model-value="getStyleModalField()!.gradient?.angle ?? 90" :min="0" :max="360" unit="°" :speed="1"
                  @update:model-value="v => patchModalField({ gradient: { ...getStyleModalField()!.gradient!, angle: v } })" />
              </div>
              <div class="sm-row">
                <label class="sm-label">Color 2</label>
                <ColorPicker :model-value="getStyleModalField()!.gradient?.stops?.[1]?.color ?? '#000000'"
                  @update:model-value="c => patchModalField({ gradient: { ...getStyleModalField()!.gradient!, stops: [{ position: 0, color: getStyleModalField()!.color ?? '#ffffff' }, { position: 1, color: c }] } })" />
              </div>
            </template>

            <!-- Job: Gradient toggle + Angle + Color 2 -->
            <template v-if="getStyleModalField()!.colorMode === 'job'">
              <div class="sm-row" style="margin-top:6px">
                <label class="sm-label">
                  <input type="checkbox" :checked="!!getStyleModalField()!.gradient"
                    @change="e => patchModalField({ gradient: (e.target as HTMLInputElement).checked ? { type: 'linear', angle: 90, stops: [{ position: 0, color: '' }, { position: 1, color: '#000000' }] } : undefined })" />
                  Gradient
                </label>
              </div>
              <template v-if="getStyleModalField()!.gradient">
                <div class="sm-row" style="margin-top:4px">
                  <label class="sm-label">Angle</label>
                  <DragNumber :model-value="getStyleModalField()!.gradient?.angle ?? 90" :min="0" :max="360" unit="°" :speed="1"
                    @update:model-value="v => patchModalField({ gradient: { ...getStyleModalField()!.gradient!, angle: v } })" />
                </div>
                <div class="sm-row" style="margin-top:4px">
                  <label class="sm-label">Color 2</label>
                  <ColorPicker :model-value="getStyleModalField()!.gradient?.stops?.[1]?.color ?? '#000000'"
                    @update:model-value="c => patchModalField({ gradient: { ...getStyleModalField()!.gradient!, stops: [{ position: 0, color: '' }, { position: 1, color: c }] } })" />
                </div>
              </template>
            </template>

            <!-- Role: Gradient toggle + Angle + Color 2 -->
            <template v-if="getStyleModalField()!.colorMode === 'role'">
              <div class="sm-row" style="margin-top:6px">
                <label class="sm-label">
                  <input type="checkbox" :checked="!!getStyleModalField()!.gradient"
                    @change="e => patchModalField({ gradient: (e.target as HTMLInputElement).checked ? { type: 'linear', angle: 90, stops: [{ position: 0, color: '' }, { position: 1, color: '#000000' }] } : undefined })" />
                  Gradient
                </label>
              </div>
              <template v-if="getStyleModalField()!.gradient">
                <div class="sm-row" style="margin-top:4px">
                  <label class="sm-label">Angle</label>
                  <DragNumber :model-value="getStyleModalField()!.gradient?.angle ?? 90" :min="0" :max="360" unit="°" :speed="1"
                    @update:model-value="v => patchModalField({ gradient: { ...getStyleModalField()!.gradient!, angle: v } })" />
                </div>
                <div class="sm-row" style="margin-top:4px">
                  <label class="sm-label">Color 2</label>
                  <ColorPicker :model-value="getStyleModalField()!.gradient?.stops?.[1]?.color ?? '#000000'"
                    @update:model-value="c => patchModalField({ gradient: { ...getStyleModalField()!.gradient!, stops: [{ position: 0, color: '' }, { position: 1, color: c }] } })" />
                </div>
              </template>
            </template>

            <!-- Self gradient controls — shown below a divider when selfMode active -->
            <template v-if="getStyleModalField()!.selfMode">
              <hr class="sm-self-divider" />
              <div class="sm-row" style="margin-top:2px">
                <label class="sm-label">
                  <input type="checkbox" :checked="!!getStyleModalField()!.selfGradient"
                    @change="e => patchModalField({ selfGradient: (e.target as HTMLInputElement).checked ? { type: 'linear', angle: 90, stops: [{ position: 0, color: '' }, { position: 1, color: '#000000' }] } : undefined })" />
                  Self Gradient
                </label>
              </div>
              <template v-if="getStyleModalField()!.selfGradient">
                <div class="sm-row" style="margin-top:4px">
                  <label class="sm-label">Angle</label>
                  <DragNumber :model-value="(getStyleModalField()!.selfGradient as any)?.angle ?? 90" :min="0" :max="360" unit="°" :speed="1"
                    @update:model-value="v => patchModalField({ selfGradient: { ...(getStyleModalField()!.selfGradient as any), angle: v } })" />
                </div>
                <div class="sm-row" style="margin-top:4px">
                  <label class="sm-label">Color 2</label>
                  <ColorPicker :model-value="(getStyleModalField()!.selfGradient as any)?.stops?.[1]?.color ?? '#000000'"
                    @update:model-value="c => patchModalField({ selfGradient: { ...(getStyleModalField()!.selfGradient as any), stops: [{ position: 0, color: '' }, { position: 1, color: c }] } })" />
                </div>
              </template>
            </template>
          </div>

          <!-- Max Width -->
          <div class="sm-row">
            <label class="sm-label">Max Width</label>
            <DragNumber :model-value="getStyleModalField()!.maxWidth ?? 0" :min="0" :max="800" unit="px" :speed="2"
              @update:model-value="v => patchModalField({ maxWidth: v > 0 ? v : undefined })" />
            <span class="sm-hint-inline">0 = auto</span>
          </div>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.label-editor { display: flex; flex-direction: column; min-width: 0; }

/* Sub-sections */
.sub-section { border-bottom: 1px solid var(--border); }
.sub-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 8px; cursor: pointer; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-muted); user-select: none;
}
.sub-header:hover { background: var(--bg-hover); }
.chevron { font-size: 9px; }
.sub-body {
  padding: 6px 8px 10px;
  display: flex; flex-direction: column; gap: var(--control-gap-md);
}

/* Rows */
.row { display: flex; align-items: center; gap: var(--control-gap-sm); flex-wrap: wrap; min-width: 0; }
.row > * { min-width: 0; }
.col { flex-direction: column; align-items: stretch; }
.ctrl-label {
  font-size: 12px; color: var(--text-muted); display: flex; align-items: center;
  gap: var(--control-gap-sm); flex-shrink: 0; width: var(--label-width); justify-content: flex-end;
}

/* Field cards */
.field-card {
  border: 1px solid var(--border); border-radius: 4px;
  overflow: hidden; cursor: grab;
}
.field-card.active { border-color: var(--accent); }
.field-card.drag-over { border-color: var(--accent); box-shadow: 0 -2px 0 var(--accent); }
.drag-handle {
  font-size: 13px; color: var(--text-muted); cursor: grab; flex-shrink: 0;
  line-height: 1; padding: 0 2px; user-select: none;
}
.drag-handle:hover { color: var(--text); }
.field-header {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; cursor: pointer; background: var(--bg-hover);
  font-size: 12px;
}
.field-header:hover { background: var(--bg-control); }
.field-title { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.field-preview {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; color: var(--text); font-family: 'Consolas', monospace;
}
.field-remove {
  background: none; border: none; color: var(--text-muted); cursor: pointer;
  font-size: 11px; padding: 0 2px; border-radius: 2px; flex-shrink: 0;
}
.field-remove:hover { color: #e63946; background: rgba(230,57,70,0.1); }

.field-body {
  padding: 8px; display: flex; flex-direction: column; gap: 6px;
  background: var(--bg-panel);
}

.template-input {
  height: var(--control-height); background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text); font-size: 12px; padding: 0 8px; outline: none;
  font-family: 'Consolas', 'Courier New', monospace; width: 100%;
}
.template-input:focus { border-color: var(--accent); }

.token-row { display: flex; flex-wrap: wrap; gap: 3px; }
.token-chip {
  height: 20px; background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 3px; color: var(--text-muted); font-size: 10px; padding: 0 6px; cursor: pointer;
}
.token-chip:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

/* Anchor buttons */
.btn-group { display: flex; gap: 2px; }
.anchor-btn {
  width: 26px; height: var(--control-height);
  background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 3px; color: var(--text-muted); font-size: 10px; cursor: pointer;
}
.anchor-btn:hover { border-color: var(--accent); color: var(--text); }
.anchor-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

/* Add field */
.add-field-btn {
  width: 100%; height: var(--control-height);
  background: none; border: 1px dashed var(--border);
  border-radius: 4px; color: var(--text-muted); font-size: 11px; cursor: pointer;
}
.add-field-btn:hover { border-color: var(--accent); color: var(--accent); }

.hint { font-size: 11px; color: var(--text-muted); margin: 0; text-align: center; }

/* Style Override button */
.field-style-btn {
  width: 100%; height: 24px; margin-top: 4px;
  background: var(--bg-hover); border: 1px solid var(--border);
  border-radius: 3px; color: var(--text-muted); font-size: 10px;
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
}
.field-style-btn:hover { border-color: var(--accent); color: var(--accent); }
.style-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent); flex-shrink: 0;
}

/* Effect groups */
.effect-group {
  display: flex; flex-direction: column; gap: var(--control-gap-md);
  padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.effect-group:last-child { border-bottom: none; padding-bottom: 0; }
.effect-toggle {
  font-size: 12px; color: var(--text); display: flex; align-items: center;
  gap: var(--control-gap-sm); cursor: pointer; user-select: none;
}

/* Controls */
.ctrl-select {
  height: var(--control-height); background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text); font-size: 12px; padding: 0 8px; outline: none; flex: 1;
}
.ctrl-select:focus { border-color: var(--accent); }
</style>

<style>
/* Style Override Modal — teleported to body, must be global (not scoped) */
.style-modal-backdrop {
  position: fixed; inset: 0; z-index: 9998;
  background: rgba(0,0,0,0.5);
}
.style-modal {
  position: fixed; z-index: 9999;
  width: 320px;
  height: 390px;
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  display: flex; flex-direction: column; overflow: hidden;
}
.style-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; background: var(--bg-hover);
  border-bottom: 1px solid var(--border);
  font-size: 12px; font-weight: 600; color: var(--text);
  cursor: move; user-select: none;
}
.style-modal-close {
  background: none; border: none; color: var(--text-muted); font-size: 12px;
  cursor: pointer; padding: 2px 4px; border-radius: 2px;
}
.style-modal-close:hover { color: #e63946; background: rgba(230,57,70,0.1); }
.style-modal-body {
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.sm-row {
  display: flex; align-items: center; gap: 6px; min-width: 0;
}
.sm-row.col { flex-direction: column; align-items: stretch; gap: 4px; }
.sm-label {
  font-size: 11px; color: var(--text-muted); min-width: 68px; flex-shrink: 0;
  text-align: right;
}
.sm-row.col > .sm-label { text-align: left; }
.sm-hint { font-size: 10px; color: var(--text-muted); font-style: italic; }
.sm-hint-inline { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.sm-color-modes {
  display: flex; gap: 3px; flex-wrap: wrap;
}
.sm-mode-btn {
  height: 24px; padding: 0 10px;
  background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 3px; color: var(--text-muted); font-size: 11px; cursor: pointer;
}
.sm-mode-btn:hover { border-color: var(--accent); color: var(--text); }
.sm-mode-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.sm-mode-sep {
  width: 1px; background: var(--border); align-self: stretch; margin: 2px 3px; flex-shrink: 0;
}
.sm-mode-self.active { background: #7c3aed; border-color: #7c3aed; color: #fff; }
.sm-self-divider {
  border: none; border-top: 1px solid var(--border); margin: 6px 0 2px; width: 100%;
}
</style>
