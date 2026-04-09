<script setup lang="ts">
import { computed } from 'vue'
import type { BarShape, BorderRadius, CornerCut, EdgeType } from '@shared/configSchema'
import { buildShapeCss } from '@shared/cssBuilder'
import BarSlider from './BarSlider.vue'
import DragNumber from './DragNumber.vue'

const props = defineProps<{ modelValue: BarShape; fillColor?: string }>()
const emit  = defineEmits<{ 'update:modelValue': [v: BarShape] }>()

function patch(p: Partial<BarShape>) {
  emit('update:modelValue', { ...props.modelValue, ...p })
}

function patchRadius(p: Partial<BorderRadius>) {
  const current = props.modelValue.borderRadius ?? { tl: 0, tr: 0, br: 0, bl: 0 }
  patch({ borderRadius: { ...current, ...p } })
}

function patchCut(corner: 'tl'|'tr'|'br'|'bl', p: Partial<CornerCut>) {
  patch({
    cornerCuts: { ...props.modelValue.cornerCuts, [corner]: { ...props.modelValue.cornerCuts[corner], ...p } },
  })
}

function setChamferMode(mode: 'none' | 'left' | 'right' | 'both') {
  patch({ chamferMode: mode })
}

const chamferMode = computed(() => props.modelValue.chamferMode ?? 'none')
const edgeDepthLeft = computed(() => props.modelValue.edgeDepthLeft ?? props.modelValue.edgeDepth ?? 10)
const edgeDepthRight = computed(() => props.modelValue.edgeDepthRight ?? props.modelValue.edgeDepth ?? 10)

const r = computed(() => props.modelValue.borderRadius ?? { tl: 0, tr: 0, br: 0, bl: 0 })
const c = computed(() => props.modelValue.cornerCuts)
const left  = computed(() => props.modelValue.leftEdge  ?? 'flat')
const right = computed(() => props.modelValue.rightEdge ?? 'flat')

const bothFlat = computed(() => left.value === 'flat' && right.value === 'flat')
const anyFlat = computed(() => left.value === 'flat' || right.value === 'flat')
const showLeftDepth = computed(() => left.value !== 'flat')
const showRightDepth = computed(() => right.value !== 'flat')
const showDepth = computed(() => showLeftDepth.value || showRightDepth.value)

const radiusCorners = computed<('tl'|'tr'|'br'|'bl')[]>(() => {
  if (bothFlat.value) return ['tl', 'tr', 'br', 'bl']
  const result: ('tl'|'tr'|'br'|'bl')[] = []
  if (left.value === 'flat') result.push('tl', 'bl')
  if (right.value === 'flat') result.push('tr', 'br')
  return result
})

function isCornerCutActive(corner: 'tl'|'tr'|'br'|'bl') {
  const cut = c.value[corner]
  return cut.x > 0 && cut.y > 0
}

function toggleCornerCut(corner: 'tl'|'tr'|'br'|'bl') {
  const current = c.value[corner]
  const next = current && current.x > 0 && current.y > 0 ? { x: 0, y: 0 } : { x: 10, y: 10 }
  patchCut(corner, next)
}

const previewStyle = computed(() => {
  const shapeCss = buildShapeCss(props.modelValue)
  const s = props.modelValue.shadow
  const shadowFilter = s?.enabled ? `drop-shadow(${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color})` : undefined
  return {
    ...shapeCss,
    background: props.fillColor ?? 'var(--accent)',
    ...(shadowFilter ? { filter: shadowFilter } : {}),
  }
})

function linkRadius() { patchRadius({ tl: r.value.tl, tr: r.value.tl, br: r.value.tl, bl: r.value.tl }) }
function clearCuts() {
  patch({ cornerCuts: { tl: {x:0,y:0}, tr: {x:0,y:0}, br: {x:0,y:0}, bl: {x:0,y:0} } })
}
function clearRadius() { patchRadius({ tl: 0, tr: 0, br: 0, bl: 0 }) }

const CORNERS = ['tl','tr','br','bl'] as const
const CORNER_LABELS: Record<string, string> = { tl:'TL', tr:'TR', br:'BR', bl:'BL' }

// Edge type button definitions
const LEFT_EDGES: { id: EdgeType; icon: string; label: string }[] = [
  { id: 'flat',    icon: '▬', label: 'Flat'      },
  { id: 'point',   icon: '▷', label: 'Chevron ▷' },
  { id: 'slant-a', icon: '╱', label: 'Slant /'   },
  { id: 'slant-b', icon: '╲', label: 'Slant \\'  },
]

const RIGHT_EDGES: { id: EdgeType; icon: string; label: string }[] = [
  { id: 'flat',    icon: '▬', label: 'Flat'      },
  { id: 'point',   icon: '◁', label: 'Chevron ◁' },
  { id: 'slant-a', icon: '╲', label: 'Slant \\'  },
  { id: 'slant-b', icon: '╱', label: 'Slant /'   },
]

// Corner cut diagram — visual toggle for each corner
const DIAGRAM_CORNERS = [
  { key: 'tl' as const, style: { top: '0', left: '0' } },
  { key: 'tr' as const, style: { top: '0', right: '0' } },
  { key: 'br' as const, style: { bottom: '0', right: '0' } },
  { key: 'bl' as const, style: { bottom: '0', left: '0' } },
] as const
</script>

<template>
  <div class="shape-editor">

    <!-- Live preview — full width -->
    <div class="shape-preview-wrap">
      <div class="shape-preview" :style="previewStyle" />
    </div>

    <!-- ── Edge selectors ────────────────────────────────── -->
    <div class="edge-row">
      <div class="edge-col">
        <div class="section-label">Left edge</div>
        <div class="edge-btns">
          <button
            v-for="e in LEFT_EDGES" :key="e.id"
            :class="['edge-btn', { active: left === e.id }]"
            :title="e.label" @click="patch({ leftEdge: e.id })"
          >{{ e.icon }}</button>
        </div>
      </div>
      <div class="edge-col">
        <div class="section-label">Right edge</div>
        <div class="edge-btns">
          <button
            v-for="e in RIGHT_EDGES" :key="e.id"
            :class="['edge-btn', { active: right === e.id }]"
            :title="e.label" @click="patch({ rightEdge: e.id })"
          >{{ e.icon }}</button>
        </div>
      </div>
    </div>

    <!-- Chamfer mode -->
    <div class="section-label" style="margin-top:6px">Chamfer</div>
    <div class="pill-group">
      <button :class="['pill', { active: chamferMode === 'none' }]" @click="setChamferMode('none')">None</button>
      <button :class="['pill', { active: chamferMode === 'left' }]" @click="setChamferMode('left')">Left</button>
      <button :class="['pill', { active: chamferMode === 'right' }]" @click="setChamferMode('right')">Right</button>
      <button :class="['pill', { active: chamferMode === 'both' }]" @click="setChamferMode('both')">Both</button>
    </div>

    <!-- Edge depth per side -->
    <template v-if="showDepth">
      <div class="section-label" style="margin-top:6px">Edge depth</div>
      <div v-if="showLeftDepth" class="slider-row">
        <span class="corner-lbl">Left</span>
        <BarSlider :model-value="edgeDepthLeft" :min="0" :max="80" :step="1" unit="px"
          track-color="linear-gradient(to right, #1a1a2e, #9b5de5)"
          @update:model-value="v => patch({ edgeDepthLeft: v })" />
        <DragNumber :model-value="edgeDepthLeft" :min="0" :max="80" :step="1" unit="px" :speed="1"
          @update:model-value="v => patch({ edgeDepthLeft: v })" />
      </div>
      <div v-if="showRightDepth" class="slider-row">
        <span class="corner-lbl">Right</span>
        <BarSlider :model-value="edgeDepthRight" :min="0" :max="80" :step="1" unit="px"
          track-color="linear-gradient(to right, #1a1a2e, #9b5de5)"
          @update:model-value="v => patch({ edgeDepthRight: v })" />
        <DragNumber :model-value="edgeDepthRight" :min="0" :max="80" :step="1" unit="px" :speed="1"
          @update:model-value="v => patch({ edgeDepthRight: v })" />
      </div>
    </template>

    <!-- ── Corner Radius ─────────── -->
    <template v-if="anyFlat">
      <div class="section-label" style="margin-top:6px">
        Corner radius
        <button class="inline-btn" @click="clearRadius" title="Clear">✕</button>
        <button class="inline-btn" @click="linkRadius" title="Link all" :disabled="!bothFlat">⛶</button>
      </div>
      <div class="slider-rows">
        <div v-for="k in radiusCorners" :key="k" class="slider-row">
          <span class="corner-lbl">{{ CORNER_LABELS[k] }}</span>
          <BarSlider :model-value="r[k]" :min="0" :max="80" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="v => patchRadius({ [k]: v })" />
          <DragNumber :model-value="r[k]" :min="0" :max="80" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchRadius({ [k]: v })" />
        </div>
      </div>
    </template>

    <!-- ── Corner Cuts (visual diagram) ─────────────────── -->
    <template v-if="chamferMode !== 'none'">
      <div class="section-label" style="margin-top:8px">
        Corner cuts
        <button class="inline-btn" @click="clearCuts" title="Clear">✕</button>
      </div>

      <!-- Visual corner toggle diagram -->
      <div class="corner-diagram-wrap">
        <div class="corner-diagram">
          <div class="diagram-bar" />
          <button
            v-for="dc in DIAGRAM_CORNERS" :key="dc.key"
            v-show="(chamferMode === 'left' && (dc.key === 'tl' || dc.key === 'bl'))
              || (chamferMode === 'right' && (dc.key === 'tr' || dc.key === 'br'))
              || chamferMode === 'both'"
            :class="['diagram-corner', { active: isCornerCutActive(dc.key) }]"
            :style="dc.style"
            :title="`Toggle ${CORNER_LABELS[dc.key]} cut`"
            @click="toggleCornerCut(dc.key)"
          >{{ CORNER_LABELS[dc.key] }}</button>
        </div>
      </div>

      <!-- Sliders for active cuts -->
      <div class="slider-rows">
        <template v-for="corner in CORNERS" :key="corner">
          <template v-if="isCornerCutActive(corner) && (
            (chamferMode === 'left' && (corner === 'tl' || corner === 'bl'))
            || (chamferMode === 'right' && (corner === 'tr' || corner === 'br'))
            || chamferMode === 'both'
          )">
            <div class="slider-row">
              <span class="corner-lbl">{{ CORNER_LABELS[corner] }} X</span>
              <BarSlider :model-value="c[corner].x" :min="0" :max="60" :step="1" unit="px"
                track-color="linear-gradient(to right, #1a1a2e, #e63946)"
                @update:model-value="v => patchCut(corner, { x: v })" />
              <DragNumber :model-value="c[corner].x" :min="0" :max="60" :step="1" unit="px" :speed="1"
                @update:model-value="v => patchCut(corner, { x: v })" />
            </div>
            <div class="slider-row">
              <span class="corner-lbl">{{ CORNER_LABELS[corner] }} Y</span>
              <BarSlider :model-value="c[corner].y" :min="0" :max="60" :step="1" unit="px"
                track-color="linear-gradient(to right, #1a1a2e, #e63946)"
                @update:model-value="v => patchCut(corner, { y: v })" />
              <DragNumber :model-value="c[corner].y" :min="0" :max="60" :step="1" unit="px" :speed="1"
                @update:model-value="v => patchCut(corner, { y: v })" />
            </div>
          </template>
        </template>
      </div>
    </template>

  </div>
</template>

<style scoped>
.shape-editor { display: flex; flex-direction: column; gap: 6px; }
.section-label {
  font-size: 10px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 0.08em; display: flex; align-items: center; gap: 4px;
}
.inline-btn {
  background: none; border: none; color: var(--text-muted); font-size: 10px;
  cursor: pointer; padding: 0 2px; line-height: 1;
}
.inline-btn:hover { color: #e63946; }

/* Left/right edge selectors side by side */
.edge-row { display: flex; gap: 8px; }
.edge-col { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.edge-btns { display: flex; gap: 3px; }
.edge-btn {
  flex: 1; background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text-muted); font-size: 13px;
  padding: 5px 2px; cursor: pointer; line-height: 1;
}
.edge-btn:hover { background: var(--bg-hover); color: var(--text); }
.edge-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* Pill buttons for toggles */
.pill-group { display: flex; gap: 4px; flex-wrap: wrap; }
.pill {
  background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 16px; color: var(--text-muted); font-size: 11px;
  padding: 3px 10px; cursor: pointer; line-height: 1; transition: all 0.1s;
}
.pill:hover { background: var(--bg-hover); color: var(--text); }
.pill.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* Shape preview — full available width */
.shape-preview-wrap { display: flex; justify-content: center; padding: 4px 0; }
.shape-preview {
  width: 100%; height: 28px;
  transition: clip-path 0.12s, border-radius 0.12s, box-shadow 0.12s;
  overflow: hidden;
}

/* Slider rows */
.slider-rows { display: flex; flex-direction: column; gap: 5px; }
.slider-row { display: flex; align-items: center; gap: var(--control-gap-sm); }
.corner-lbl { font-size: 10px; color: var(--text-muted); min-width: var(--label-width); text-align: right; flex-shrink: 0; }

/* Corner cut diagram */
.corner-diagram-wrap { display: flex; justify-content: center; padding: 4px 0; }
.corner-diagram {
  position: relative;
  width: 180px; height: 44px;
}
.diagram-bar {
  position: absolute; inset: 6px 6px;
  background: var(--bg-control);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.diagram-corner {
  position: absolute;
  width: 28px; height: 28px;
  background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; cursor: pointer;
  font-size: 9px; color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; z-index: 1;
}
.diagram-corner:hover { border-color: var(--accent); color: var(--text); }
.diagram-corner.active { background: #e63946; border-color: #e63946; color: #fff; }
</style>
