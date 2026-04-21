<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useConfigStore } from '../../stores/config'
import FillEditor from '../controls/FillEditor.vue'
import ShapeEditor from '../controls/ShapeEditor.vue'
import LabelEditor from '../controls/LabelEditor.vue'
import IconEditor from '../controls/IconEditor.vue'
import ShadowEditor from '../controls/ShadowEditor.vue'
import BarSlider from '../controls/BarSlider.vue'
import ColorPicker from '../controls/ColorPicker.vue'
import DragNumber from '../controls/DragNumber.vue'
import type { BarFill, BarShape, BarLabel, BarShadow, IconConfig, BarOutline } from '@shared/configSchema'

const config = useConfigStore()
const def = computed(() => config.profile.default)
const isHorizontal = computed(() => config.profile.global.orientation === 'horizontal')
const sizeLabel = computed(() => isHorizontal.value ? 'Width' : 'Height')
const sizeMax = computed(() => isHorizontal.value ? 480 : 200)
const horizontalHeight = computed(() => def.value.horizontalHeight ?? 72)

function setFill(fill: BarFill)    { config.setDefaultFill(fill) }
function setBg(bg: BarFill)        { config.setDefaultBg(bg) }
function setShape(shape: BarShape) { config.patchDefault({ shape }) }
function setLabel(label: BarLabel) { config.patchDefault({ label }) }
function setIcon(icon: IconConfig) { config.patchDefault({ label: { ...def.value.label, iconConfig: icon } }) }
function setHeight(v: number)      { config.patchDefault({ height: v }) }
function setHorizontalHeight(v: number) { config.patchDefault({ horizontalHeight: v }) }
function setGap(v: number)         { config.patchDefault({ gap: v }) }

// Fill shadow
const fillShadow = computed(() => def.value.shape.fillShadow ?? { enabled: false, color: '#000000', blur: 4, thickness: 0, offsetX: 0, offsetY: 1 })
function setFillShadow(s: BarShadow) {
  config.patchDefault({ shape: { ...def.value.shape, fillShadow: s } })
}

const fillOutline = computed<BarOutline>(() => def.value.shape.outline ?? {
  color: 'rgba(255,255,255,0.15)',
  thickness: { top: 0, right: 0, bottom: 1, left: 0 },
  target: 'fill',
})
const fillOutlineEnabled = computed(() => {
  const t = fillOutline.value.thickness
  return (fillOutline.value.target === 'fill' || fillOutline.value.target === 'both')
    && !!(t.top || t.right || t.bottom || t.left)
})
const fillOutlineWidth = computed(() => {
  const t = fillOutline.value.thickness
  return Math.max(t.top ?? 0, t.right ?? 0, t.bottom ?? 0, t.left ?? 0)
})
function patchFillOutline(p: Partial<BarOutline>) {
  config.patchDefault({ shape: { ...def.value.shape, outline: { ...fillOutline.value, target: 'fill', ...p } } })
}
function setFillOutlineEnabled(enabled: boolean) {
  patchFillOutline({
    thickness: enabled
      ? { top: 1, right: 1, bottom: 1, left: 1 }
      : { top: 0, right: 0, bottom: 0, left: 0 },
  })
}
function setFillOutlineWidth(width: number) {
  patchFillOutline({ thickness: { top: width, right: width, bottom: width, left: width } })
}

// Background shadow — uses opacity mode (checkbox sets alpha to 0)
const bgShadow = computed(() => def.value.shape.shadow ?? { enabled: true, color: 'rgba(0,0,0,0.6)', blur: 4, thickness: 0, offsetX: 0, offsetY: 2 })
function setBgShadow(s: BarShadow) {
  config.patchDefault({ shape: { ...def.value.shape, shadow: s } })
}

const bgStroke = computed(() => def.value.shape.bgStroke ?? { enabled: false, color: '#ffffff', width: 1 })
function patchBgStroke(p: Partial<NonNullable<BarShape['bgStroke']>>) {
  config.patchDefault({ shape: { ...def.value.shape, bgStroke: { ...bgStroke.value, ...p } } })
}

// Preview fill color for ShapeEditor
const shapeFillColor = computed(() => {
  const fill = def.value.fill
  if (fill.type === 'solid') return fill.color
  if (fill.type === 'gradient' && fill.gradient?.stops?.length) return fill.gradient.stops[0].color
  return undefined
})

const open = reactive<Record<string, boolean>>({
  fill: false, bg: false, shape: false, label: false, icon: false, size: false,
})

// Value badges
const fillBadge = computed(() => {
  const f = def.value.fill
  const type = f.type[0].toUpperCase() + f.type.slice(1)
  const opStr = (f.opacity !== undefined && f.opacity < 1) ? ` · ${Math.round(f.opacity * 100)}%` : ''
  return type + opStr
})

const bgBadge = computed(() => {
  const f = def.value.bg
  const type = f.type[0].toUpperCase() + f.type.slice(1)
  const opStr = (f.opacity !== undefined && f.opacity < 1) ? ` · ${Math.round(f.opacity * 100)}%` : ''
  return type + opStr
})

const shapeBadge = computed(() => {
  const s = def.value.shape
  const chamfer = s.chamferMode ?? 'none'
  if (chamfer !== 'none') return 'Chamfer'
  const left = s.leftEdge ?? 'flat'
  const right = s.rightEdge ?? 'flat'
  if (left === 'flat' && right === 'flat') {
    const r = s.borderRadius
    if (r && (r.tl || r.tr || r.br || r.bl)) return 'Rounded'
    return 'Flat'
  }
  const fmt = (e: string) => e === 'flat' ? 'Flat' : e === 'point' ? 'Point' : e === 'slant-a' ? 'Slant /' : 'Slant \\'
  return `${fmt(left)} · ${fmt(right)}`
})

const labelBadge = computed(() => {
  const l = def.value.label
  const font = l.font?.split(',')[0]?.trim().replace(/['"]/g, '') ?? 'Default'
  return font
})

const iconBadge = computed(() => {
  return def.value.label.iconConfig?.show ? 'Visible' : 'Hidden'
})

const sizeBadge = computed(() => {
  return `${sizeLabel.value} ${def.value.height}px · ${def.value.gap}px gap`
})
</script>

<template>
  <div class="bar-style-panel">

    <!-- Bar Fill -->
    <div class="section section--fill">
      <div class="section-header" @click="open.fill = !open.fill">
        <span class="section-title">Bar Fill</span>
        <span class="badge">{{ fillBadge }}</span>
        <span class="chevron" :class="{ open: open.fill }">›</span>
      </div>
      <div v-if="open.fill" class="section-body">
        <FillEditor :model-value="def.fill" :orientation="config.profile.global.orientation" @update:model-value="setFill" />
        <div class="sub-divider">Position</div>
        <div class="row">
          <label class="ctrl-label">Offset Y</label>
          <BarSlider :model-value="def.shape.fillInsetTop ?? 0" :min="0" :max="60" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="v => config.patchDefault({ shape: { ...def.shape, fillInsetTop: v || undefined } })" />
          <DragNumber :model-value="def.shape.fillInsetTop ?? 0" :min="0" :max="60" :step="1" unit="px" :speed="1"
            @update:model-value="v => config.patchDefault({ shape: { ...def.shape, fillInsetTop: v || undefined } })" />
        </div>
        <div class="sub-divider">Segments</div>
        <div class="row">
          <label class="ctrl-label">Enabled</label>
          <input type="checkbox" :checked="def.shape.segmentFill?.enabled ?? false"
            @change="e => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { segmentWidth: 8, gap: 2, angle: 90 }), enabled: (e.target as HTMLInputElement).checked } } })" />
        </div>
        <template v-if="def.shape.segmentFill?.enabled">
          <div class="row">
            <label class="ctrl-label">Width</label>
            <BarSlider :model-value="def.shape.segmentFill?.segmentWidth ?? 8" :min="2" :max="80" :step="1" unit="px"
              track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, gap: 2, angle: 90 }), segmentWidth: v } } })" />
            <DragNumber :model-value="def.shape.segmentFill?.segmentWidth ?? 8" :min="2" :max="80" :step="1" unit="px" :speed="1"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, gap: 2, angle: 90 }), segmentWidth: v } } })" />
          </div>
          <div class="row">
            <label class="ctrl-label">Gap</label>
            <BarSlider :model-value="def.shape.segmentFill?.gap ?? 2" :min="1" :max="20" :step="1" unit="px"
              track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, segmentWidth: 8, angle: 90 }), gap: v } } })" />
            <DragNumber :model-value="def.shape.segmentFill?.gap ?? 2" :min="1" :max="20" :step="1" unit="px" :speed="1"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, segmentWidth: 8, angle: 90 }), gap: v } } })" />
          </div>
          <div class="row">
            <label class="ctrl-label">Angle</label>
            <BarSlider :model-value="def.shape.segmentFill?.angle ?? 90" :min="0" :max="180" :step="1" unit="°"
              track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, segmentWidth: 8, gap: 2 }), angle: v } } })" />
            <DragNumber :model-value="def.shape.segmentFill?.angle ?? 90" :min="0" :max="180" :step="1" unit="°" :speed="1"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, segmentWidth: 8, gap: 2 }), angle: v } } })" />
          </div>
          <p class="hint">Set Start + End Height for growing segments. Overrides Angle when both &gt; 0.</p>
          <div class="row">
            <label class="ctrl-label">Start H</label>
            <BarSlider :model-value="def.shape.segmentFill?.startHeight ?? 0" :min="0" :max="def.height" :step="1" unit="px"
              track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, segmentWidth: 8, gap: 2 }), startHeight: v || undefined } } })" />
            <DragNumber :model-value="def.shape.segmentFill?.startHeight ?? 0" :min="0" :max="def.height" :step="1" unit="px" :speed="1"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, segmentWidth: 8, gap: 2 }), startHeight: v || undefined } } })" />
          </div>
          <div class="row">
            <label class="ctrl-label">End H</label>
            <BarSlider :model-value="def.shape.segmentFill?.endHeight ?? 0" :min="0" :max="def.height" :step="1" unit="px"
              track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, segmentWidth: 8, gap: 2 }), endHeight: v || undefined } } })" />
            <DragNumber :model-value="def.shape.segmentFill?.endHeight ?? 0" :min="0" :max="def.height" :step="1" unit="px" :speed="1"
              @update:model-value="v => config.patchDefault({ shape: { ...def.shape, segmentFill: { ...(def.shape.segmentFill ?? { enabled: true, segmentWidth: 8, gap: 2 }), endHeight: v || undefined } } })" />
          </div>
        </template>
        <div class="sub-divider">Outline</div>
        <div class="row">
          <label class="ctrl-label">Enabled</label>
          <input
            type="checkbox"
            :checked="fillOutlineEnabled"
            @change="e => setFillOutlineEnabled((e.target as HTMLInputElement).checked)"
          />
          <template v-if="fillOutlineEnabled">
            <ColorPicker
              :model-value="fillOutline.color"
              label="Outline"
              @update:model-value="c => patchFillOutline({ color: c })"
            />
            <DragNumber
              :model-value="fillOutlineWidth"
              :min="0"
              :max="12"
              :step="1"
              unit="px"
              :speed="1"
              @update:model-value="setFillOutlineWidth"
            />
          </template>
        </div>
        <div class="sub-divider">Shadow</div>
        <ShadowEditor :model-value="fillShadow" @update:model-value="setFillShadow" />
      </div>
    </div>

    <!-- Background -->
    <div class="section section--bg">
      <div class="section-header" @click="open.bg = !open.bg">
        <span class="section-title">Background</span>
        <span class="badge">{{ bgBadge }}</span>
        <span class="chevron" :class="{ open: open.bg }">›</span>
      </div>
      <div v-if="open.bg" class="section-body">
        <FillEditor :model-value="def.bg" :orientation="config.profile.global.orientation" @update:model-value="setBg" />
        <div class="sub-divider">Effects</div>
        <div class="row">
          <label class="ctrl-label">Outline</label>
          <input
            type="checkbox"
            :checked="bgStroke.enabled"
            @change="e => patchBgStroke({ enabled: (e.target as HTMLInputElement).checked })"
          />
          <template v-if="bgStroke.enabled">
            <ColorPicker
              :model-value="bgStroke.color"
              label="Outline"
              @update:model-value="c => patchBgStroke({ color: c })"
            />
            <DragNumber
              :model-value="bgStroke.width"
              :min="0"
              :max="12"
              :step="1"
              unit="px"
              :speed="1"
              @update:model-value="v => patchBgStroke({ width: v })"
            />
          </template>
        </div>
        <div class="sub-divider">Shadow</div>
        <ShadowEditor :model-value="bgShadow" enable-mode="opacity" @update:model-value="setBgShadow" />
      </div>
    </div>

    <!-- Shape -->
    <div class="section section--shape">
      <div class="section-header" @click="open.shape = !open.shape">
        <span class="section-title">Shape</span>
        <span class="badge">{{ shapeBadge }}</span>
        <span class="chevron" :class="{ open: open.shape }">›</span>
      </div>
      <div v-if="open.shape" class="section-body">
        <ShapeEditor :model-value="def.shape" :fill-color="shapeFillColor" @update:model-value="setShape" />
      </div>
    </div>

    <!-- Label -->
    <div class="section section--label">
      <div class="section-header" @click="open.label = !open.label">
        <span class="section-title">Label</span>
        <span class="badge">{{ labelBadge }}</span>
        <span class="chevron" :class="{ open: open.label }">›</span>
      </div>
      <div v-if="open.label" class="section-body no-pad">
        <LabelEditor :model-value="def.label" @update:model-value="setLabel" />
      </div>
    </div>

    <!-- Icon -->
    <div class="section section--icon">
      <div class="section-header" @click="open.icon = !open.icon">
        <span class="section-title">Icon</span>
        <span class="badge">{{ iconBadge }}</span>
        <span class="chevron" :class="{ open: open.icon }">›</span>
      </div>
      <div v-if="open.icon" class="section-body">
        <IconEditor :model-value="def.label.iconConfig" @update:model-value="setIcon" />
      </div>
    </div>

    <!-- Size -->
    <div class="section section--size">
      <div class="section-header" @click="open.size = !open.size">
        <span class="section-title">Size</span>
        <span class="badge">{{ sizeBadge }}</span>
        <span class="chevron" :class="{ open: open.size }">›</span>
      </div>
      <div v-if="open.size" class="section-body">
        <div class="row">
          <label class="ctrl-label">{{ sizeLabel }}</label>
          <BarSlider :model-value="def.height" :min="1" :max="sizeMax" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="setHeight" />
          <DragNumber :model-value="def.height" :min="1" :max="sizeMax" :step="1" unit="px" :speed="1"
            @update:model-value="setHeight" />
        </div>
        <div v-if="isHorizontal" class="row">
          <label class="ctrl-label">Height</label>
          <BarSlider :model-value="horizontalHeight" :min="16" :max="240" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="setHorizontalHeight" />
          <DragNumber :model-value="horizontalHeight" :min="16" :max="240" :step="1" unit="px" :speed="1"
            @update:model-value="setHorizontalHeight" />
        </div>
        <div class="row">
          <label class="ctrl-label">Gap</label>
          <BarSlider :model-value="def.gap" :min="-20" :max="20" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="setGap" />
          <DragNumber :model-value="def.gap" :min="-20" :max="20" :step="1" unit="px" :speed="1"
            @update:model-value="setGap" />
        </div>
        <p class="hint">{{ isHorizontal ? 'Width controls each column. Height controls the bar length inside the overlay window.' : 'Resize the live overlay window to set bar length.' }}</p>
      </div>
    </div>

  </div>
</template>

<style scoped>
.bar-style-panel { display: flex; flex-direction: column; min-width: 0; }

.section { border-bottom: 1px solid var(--border); min-width: 0; border-left: 3px solid transparent; }
.section--fill  { border-left-color: #9b5de5; }
.section--bg    { border-left-color: #3a86ff; }
.section--shape { border-left-color: #06d6a0; }
.section--label { border-left-color: #ffd166; }
.section--icon  { border-left-color: #ef476f; }
.section--size  { border-left-color: #8ecae6; }

.section-header {
  display: flex; align-items: center; gap: 6px;
  padding: var(--control-gap-md) var(--control-gap-lg); cursor: pointer;
  user-select: none; background: var(--bg-panel); transition: background 0.1s;
}
.section-header:hover { background: var(--bg-hover); }
.section-title { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; }
.badge {
  font-size: 10px; color: var(--text-muted); background: var(--bg-control);
  padding: 1px 6px; border-radius: 10px; white-space: nowrap; max-width: 120px;
  overflow: hidden; text-overflow: ellipsis;
}
.chevron { font-size: 14px; color: var(--text-muted); transform: rotate(0deg); transition: transform 0.15s; line-height: 1; flex-shrink: 0; }
.chevron.open { transform: rotate(90deg); }

.section-body {
  padding: var(--control-gap-md) var(--control-gap-lg);
  display: flex; flex-direction: column; gap: var(--control-gap-md); min-width: 0;
}
.section-body.no-pad { padding: 0; }
.sub-divider {
  font-size: 10px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 0.08em; padding-top: var(--control-gap-md);
  border-top: 1px solid var(--border); margin-top: var(--control-gap-sm);
}
.row { display: flex; align-items: center; gap: var(--control-gap-sm); min-width: 0; }
.ctrl-label { font-size: 12px; color: var(--text-muted); min-width: var(--label-width); flex-shrink: 0; text-align: right; }
.hint { font-size: 11px; color: var(--text-muted); margin-top: var(--control-gap-sm); line-height: 1.4; }
</style>
