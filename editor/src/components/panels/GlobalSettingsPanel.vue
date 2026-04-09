<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import BarSlider from '../controls/BarSlider.vue'
import DragNumber from '../controls/DragNumber.vue'
import ColorPicker from '../controls/ColorPicker.vue'
import TextureEditor from '../controls/TextureEditor.vue'
import type { GradientFill } from '@shared/configSchema'

const config = useConfigStore()
const g = computed(() => config.profile.global)

const open = ref({ window: true, layout: false, values: false, animation: false, rank1: false })
function toggle(k: keyof typeof open.value) { open.value[k] = !open.value[k] }

const windowTexture = computed(() => {
  const wb = g.value.windowBackground
  if (wb?.type === 'texture' && wb?.texture) return wb.texture
  return { src: '', repeat: 'repeat', opacity: 1, blendMode: 'normal' }
})

function updateTexture(t: { src: string; repeat: 'repeat' | 'no-repeat' | 'stretch'; opacity: number; blendMode: string; tintColor?: string }) {
  patch({ windowBackground: { type: 'texture', texture: t } })
}

function patch(p: Partial<typeof g.value>) {
  config.patchGlobal(p)
}

// Parse rgba(r,g,b,a) → alpha
function bgAlpha(css: string): number {
  const m = css.match(/rgba?\([^)]+,\s*([\d.]+)\)/)
  return m ? parseFloat(m[1]) : 1
}

// Get the effective window bg color (from windowBackground if solid, else windowBg)
function effectiveBgColor(): string {
  const wb = g.value.windowBackground
  if (wb?.type === 'solid') return wb.color || 'transparent'
  return g.value.windowBg || 'transparent'
}

// Safe hex conversion - always returns a valid #rrggbb string
function toHex(css: string): string {
  if (!css || css === 'transparent') return '#000000'
  if (/^#[0-9a-fA-F]{6}$/.test(css)) return css
  if (/^#[0-9a-fA-F]{3}$/.test(css)) {
    return '#' + css[1] + css[1] + css[2] + css[2] + css[3] + css[3]
  }
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return '#000000'
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('')
}

function setWindowBgColor(hex: string) {
  const wb = g.value.windowBackground
  if (wb?.type === 'solid') {
    patch({ windowBackground: { ...wb, color: hex } })
  } else {
    const alpha = bgAlpha(g.value.windowBg)
    const r = parseInt(hex.slice(1,3), 16)
    const g_ = parseInt(hex.slice(3,5), 16)
    const b = parseInt(hex.slice(5,7), 16)
    patch({ windowBg: `rgba(${r},${g_},${b},${alpha})` })
  }
}

function setWindowBgAlpha(a: number) {
  const wb = g.value.windowBackground
  if (wb?.type === 'solid') {
    const current = wb.color || '#000000'
    const m = current.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (m) {
      patch({ windowBackground: { ...wb, color: `rgba(${m[1]},${m[2]},${m[3]},${a.toFixed(2)})` } })
    } else if (current.startsWith('#')) {
      const r = parseInt(current.slice(1,3), 16)
      const g_ = parseInt(current.slice(3,5), 16)
      const b = parseInt(current.slice(5,7), 16)
      patch({ windowBackground: { ...wb, color: `rgba(${r},${g_},${b},${a.toFixed(2)})` } })
    } else {
      patch({ windowBackground: { ...wb, color: `rgba(0,0,0,${a.toFixed(2)})` } })
    }
  } else {
    const hex = toHex(g.value.windowBg)
    const r = parseInt(hex.slice(1,3), 16)
    const g_ = parseInt(hex.slice(3,5), 16)
    const b = parseInt(hex.slice(5,7), 16)
    patch({ windowBg: `rgba(${r},${g_},${b},${a.toFixed(2)})` })
  }
}

const wbType = computed(() => g.value.windowBackground?.type ?? 'solid')
const windowOpacity = computed(() => g.value.windowOpacity ?? 1)
function setWindowOpacity(v: number) { patch({ windowOpacity: v }) }

function setWbType(t: string) {
  const base = g.value.windowBackground ?? { type: 'solid' as const, color: g.value.windowBg }
  if (t === 'solid') {
    patch({ windowBackground: { ...base, type: 'solid' as const } })
  } else if (t === 'gradient') {
    patch({ windowBackground: { type: 'gradient', gradient: { type: 'linear' as const, angle: 180, stops: [
      { position: 0, color: '#0d0d1a' },
      { position: 1, color: '#1a1a2e' },
    ]} } })
  } else if (t === 'texture') {
    patch({ windowBackground: { ...base, type: 'texture' as const } })
  }
}

const wbGradient = computed<GradientFill | null>(() => {
  const wb = g.value.windowBackground
  return wb?.type === 'gradient' ? wb.gradient : null
})

function patchGradient(p: Partial<GradientFill>) {
  const wb = g.value.windowBackground
  if (wb?.type !== 'gradient') return
  patch({ windowBackground: { ...wb, gradient: { ...wb.gradient, ...p } } })
}

function setStopColor(idx: number, color: string) {
  const wb = g.value.windowBackground
  if (wb?.type !== 'gradient') return
  const stops = [...wb.gradient.stops]
  stops[idx] = { ...stops[idx], color }
  patch({ windowBackground: { ...wb, gradient: { ...wb.gradient, stops } } })
}

function addStop() {
  const wb = g.value.windowBackground
  if (wb?.type !== 'gradient') return
  const stops = [...wb.gradient.stops]
  if (stops.length >= 2) {
    const last = stops[stops.length - 1]
    const secondLast = stops[stops.length - 2]
    const diff = last.position - secondLast.position
    stops[stops.length - 1] = { ...last, position: secondLast.position + diff / 2 }
  }
  stops.push({ position: 1, color: '#1a1a2e' })
  patch({ windowBackground: { ...wb, gradient: { ...wb.gradient, stops } } })
}

function removeStop(idx: number) {
  const wb = g.value.windowBackground
  if (wb?.type !== 'gradient' || wb.gradient.stops.length <= 2) return
  const stops = wb.gradient.stops.filter((_, i) => i !== idx)
  patch({ windowBackground: { ...wb, gradient: { ...wb.gradient, stops } } })
}

// Window border
const windowBorder = computed(() => ({
  enabled: g.value.windowBorder?.enabled ?? false,
  color: g.value.windowBorder?.color ?? '#2a2a3e',
  width: g.value.windowBorder?.width ?? 1,
  radius: g.value.windowBorder?.radius ?? 4,
}))

function patchBorder(p: Partial<typeof windowBorder.value>) {
  patch({ windowBorder: { ...windowBorder.value, ...p } })
}

// Window shadow
const windowShadow = computed(() => ({
  enabled: g.value.windowShadow?.enabled ?? false,
  color: g.value.windowShadow?.color ?? 'rgba(0,0,0,0.5)',
  blur: g.value.windowShadow?.blur ?? 8,
  offsetX: g.value.windowShadow?.offsetX ?? 0,
  offsetY: g.value.windowShadow?.offsetY ?? 2,
}))

function patchShadow(p: Partial<typeof windowShadow.value>) {
  patch({ windowShadow: { ...windowShadow.value, ...p } })
}
</script>

<template>
  <div class="global-panel">

    <!-- Window -->
    <div class="section-header" @click="toggle('window')">
      <span class="section-title">Window</span>
      <span class="chevron" :class="{ open: open.window }">›</span>
    </div>
    <div v-if="open.window" class="section-body">
      <div class="row">
        <label class="ctrl-label">Transparency</label>
        <BarSlider :model-value="windowOpacity" :min="0" :max="1" :step="0.01"
          track-color="linear-gradient(to right, transparent, #fff)"
          @update:model-value="setWindowOpacity" />
        <DragNumber :model-value="windowOpacity" :min="0" :max="1" :step="0.01" :speed="0.005"
          @update:model-value="setWindowOpacity" />
      </div>
      <div class="row">
        <label class="ctrl-label">Type</label>
        <select class="ctrl-select" :value="wbType" @change="e => setWbType((e.target as HTMLSelectElement).value)">
          <option value="solid">Solid</option>
          <option value="gradient">Gradient</option>
          <option value="texture">Texture</option>
        </select>
      </div>

      <!-- Solid color -->
      <div v-if="wbType === 'solid'" class="row">
        <label class="ctrl-label">Color</label>
        <ColorPicker :model-value="effectiveBgColor()" @update:model-value="setWindowBgColor" />
        <BarSlider :model-value="bgAlpha(effectiveBgColor())" :min="0" :max="1" :step="0.01"
          track-color="linear-gradient(to right, transparent, #000)"
          @update:model-value="setWindowBgAlpha" />
      </div>

      <!-- Gradient -->
      <div v-if="wbType === 'gradient' && wbGradient">
        <div class="gradient-stops">
          <div v-for="(stop, idx) in wbGradient.stops" :key="idx" class="stop-block">
            <div class="stop-color-row">
              <span class="stop-label">Color {{ idx + 1 }}</span>
              <ColorPicker :model-value="stop.color" @update:model-value="c => setStopColor(idx, c)" />
            </div>
            <div class="stop-pos-row">
              <span class="stop-label">Pos {{ idx + 1 }}</span>
              <BarSlider :model-value="stop.position" :min="0" :max="1" :step="0.01"
                track-color="linear-gradient(to right, transparent, #fff)"
                @update:model-value="v => {
                  const stops = [...wbGradient!.stops]
                  stops[idx] = { ...stops[idx], position: v }
                  patchGradient({ stops })
                }" />
              <button v-if="wbGradient.stops.length > 2" class="remove-stop" @click="removeStop(idx)">×</button>
            </div>
          </div>
          <button class="add-stop" @click="addStop">+ Color</button>
        </div>
        <div class="row" style="margin-top:6px">
          <label class="ctrl-label">Angle</label>
          <BarSlider :model-value="wbGradient.angle" :min="0" :max="360" :step="1" unit="°"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="v => patchGradient({ angle: v })" />
          <DragNumber :model-value="wbGradient.angle" :min="0" :max="360" :step="1" unit="°" :speed="1"
            @update:model-value="v => patchGradient({ angle: v })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Type</label>
          <select class="ctrl-select" :value="wbGradient.type" @change="e => patchGradient({ type: (e.target as HTMLSelectElement).value as 'linear' | 'radial' })">
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
        </div>
      </div>

      <!-- Texture -->
      <div v-if="wbType === 'texture'" class="texture-section">
        <TextureEditor :model-value="windowTexture" @update:model-value="updateTexture" />
      </div>

      <div class="sub-label">Border</div>
      <div class="row">
        <label class="ctrl-label">
          <input type="checkbox" :checked="windowBorder.enabled"
            @change="e => patchBorder({ enabled: (e.target as HTMLInputElement).checked })" />
          Enable
        </label>
      </div>
      <template v-if="windowBorder.enabled">
        <div class="row">
          <label class="ctrl-label">Color</label>
          <ColorPicker :model-value="windowBorder.color" label="Color"
            @update:model-value="c => patchBorder({ color: c })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Width</label>
          <BarSlider :model-value="windowBorder.width" :min="0" :max="8" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="v => patchBorder({ width: v })" />
          <DragNumber :model-value="windowBorder.width" :min="0" :max="8" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchBorder({ width: v })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Radius</label>
          <BarSlider :model-value="windowBorder.radius" :min="0" :max="20" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="v => patchBorder({ radius: v })" />
          <DragNumber :model-value="windowBorder.radius" :min="0" :max="20" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchBorder({ radius: v })" />
        </div>
      </template>

      <div class="sub-label">Shadow</div>
      <div class="row">
        <label class="ctrl-label">
          <input type="checkbox" :checked="windowShadow.enabled"
            @change="e => patchShadow({ enabled: (e.target as HTMLInputElement).checked })" />
          Enable
        </label>
      </div>
      <template v-if="windowShadow.enabled">
        <div class="row">
          <label class="ctrl-label">Color</label>
          <ColorPicker :model-value="windowShadow.color" label="Color"
            @update:model-value="c => patchShadow({ color: c })" />
        </div>
        <div class="row">
          <label class="ctrl-label">Blur</label>
          <BarSlider :model-value="windowShadow.blur" :min="0" :max="30" :step="1" unit="px"
            track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
            @update:model-value="v => patchShadow({ blur: v })" />
          <DragNumber :model-value="windowShadow.blur" :min="0" :max="30" :step="1" unit="px" :speed="1"
            @update:model-value="v => patchShadow({ blur: v })" />
        </div>
        <div class="row">
          <label class="ctrl-label">X / Y</label>
          <DragNumber :model-value="windowShadow.offsetX" :min="-20" :max="20" unit="px" :speed="1"
            @update:model-value="v => patchShadow({ offsetX: v })" />
          <DragNumber :model-value="windowShadow.offsetY" :min="-20" :max="20" unit="px" :speed="1"
            @update:model-value="v => patchShadow({ offsetY: v })" />
        </div>
      </template>

      <div class="sub-label">Overlay</div>
      <div class="row">
        <label class="ctrl-label">Opacity</label>
        <BarSlider :model-value="g.opacity" :min="0" :max="1" :step="0.01"
          track-color="linear-gradient(to right, transparent, #fff)"
          @update:model-value="v => patch({ opacity: v })" />
        <DragNumber :model-value="g.opacity" :min="0" :max="1" :step="0.01" :speed="0.005"
          @update:model-value="v => patch({ opacity: v })" />
      </div>
      <div class="row">
        <label class="ctrl-label">Out-of-combat</label>
        <select class="ctrl-select" :value="g.outOfCombat" @change="e => patch({ outOfCombat: (e.target as HTMLSelectElement).value as any })">
          <option value="show">Show</option>
          <option value="dim">Dim</option>
          <option value="hide">Hide</option>
        </select>
      </div>
      <div v-if="g.outOfCombat === 'dim'" class="row">
        <label class="ctrl-label">Dim to</label>
        <BarSlider :model-value="g.outOfCombatOpacity" :min="0" :max="1" :step="0.01"
          track-color="linear-gradient(to right, transparent, #fff)"
          @update:model-value="v => patch({ outOfCombatOpacity: v })" />
        <DragNumber :model-value="g.outOfCombatOpacity" :min="0" :max="1" :step="0.01" :speed="0.005"
          @update:model-value="v => patch({ outOfCombatOpacity: v })" />
      </div>
    </div>

    <!-- Layout -->
    <div class="section-header" @click="toggle('layout')">
      <span class="section-title">Layout</span>
      <span class="chevron" :class="{ open: open.layout }">›</span>
    </div>
    <div v-if="open.layout" class="section-body">
      <div class="row">
        <label class="ctrl-label">Orientation</label>
        <div class="btn-group">
          <button :class="['tog', { active: g.orientation === 'vertical' }]"
            @click="patch({ orientation: 'vertical' })">Vertical</button>
          <button :class="['tog', { active: g.orientation === 'horizontal' }]"
            @click="patch({ orientation: 'horizontal' })">Horizontal</button>
        </div>
      </div>
      <div class="row">
        <label class="ctrl-label">Window pos</label>
        <div style="display:flex;gap:4px;">
          <button class="tog" :class="{ active: g.windowX===20 && g.windowY===80 }" @click="patch({ windowX:20, windowY:80 })">TL</button>
          <button class="tog" :class="{ active: g.windowX===300 && g.windowY===80 }" @click="patch({ windowX:300, windowY:80 })">TR</button>
          <button class="tog" :class="{ active: g.windowX===20 && g.windowY===300 }" @click="patch({ windowX:20, windowY:300 })">BL</button>
          <button class="tog" :class="{ active: g.windowX===300 && g.windowY===300 }" @click="patch({ windowX:300, windowY:300 })">BR</button>
        </div>
      </div>
      <div class="row">
        <label class="ctrl-label">Auto scale</label>
        <label style="display: flex; align-items: center; gap: 6px; flex: 1;">
          <input type="checkbox" :checked="g.autoScale" @change="e => patch({ autoScale: (e.target as HTMLInputElement).checked })" />
          <span style="font-size: 11px; color: var(--text);">Resize bars with window</span>
        </label>
      </div>
    </div>

    <!-- Values -->
    <div class="section-header" @click="toggle('values')">
      <span class="section-title">Values</span>
      <span class="chevron" :class="{ open: open.values }">›</span>
    </div>
    <div v-if="open.values" class="section-body">
      <div class="row">
        <label class="ctrl-label">Sort by</label>
        <select class="ctrl-select" :value="g.dpsType" @change="e => patch({ dpsType: (e.target as HTMLSelectElement).value as any, sortBy: (e.target as HTMLSelectElement).value })">
          <option value="encdps">DPS</option>
          <option value="enchps">HPS</option>
          <option value="damage%">DMG%</option>
          <option value="crithit%">Crit%</option>
        </select>
      </div>
      <div class="row">
        <label class="ctrl-label">Format</label>
        <select class="ctrl-select" :value="g.valueFormat" @change="e => patch({ valueFormat: (e.target as HTMLSelectElement).value as any })">
          <option value="raw">Raw (12345)</option>
          <option value="abbreviated">Short (12.3k)</option>
          <option value="formatted">Comma (12,345)</option>
        </select>
      </div>
    </div>

    <!-- Animation -->
    <div class="section-header" @click="toggle('animation')">
      <span class="section-title">Animation</span>
      <span class="chevron" :class="{ open: open.animation }">›</span>
    </div>
    <div v-if="open.animation" class="section-body">
      <div class="row">
        <label class="ctrl-label">Transition</label>
        <BarSlider :model-value="g.transitionDuration" :min="0" :max="2000" :step="50" unit="ms"
          track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
          @update:model-value="v => patch({ transitionDuration: v })" />
        <DragNumber :model-value="g.transitionDuration" :min="0" :max="2000" :step="50" unit="ms" :speed="10"
          @update:model-value="v => patch({ transitionDuration: v })" />
      </div>
      <div class="row">
        <label class="ctrl-label">Hold</label>
        <BarSlider :model-value="g.holdDuration / 1000" :min="0" :max="30" :step="1" unit="s"
          track-color="linear-gradient(to right, #1a1a2e, var(--accent))"
          @update:model-value="v => patch({ holdDuration: v * 1000 })" />
        <DragNumber :model-value="g.holdDuration / 1000" :min="0" :max="30" :step="1" unit="s" :speed="0.5"
          @update:model-value="v => patch({ holdDuration: v * 1000 })" />
      </div>
    </div>

    <!-- Rank #1 -->
    <div class="section-header" @click="toggle('rank1')">
      <span class="section-title">Rank #1</span>
      <span class="section-badge" :class="g.rankIndicator?.rank1Enabled ? 'badge-on' : 'badge-off'">
        {{ g.rankIndicator?.rank1Enabled ? 'On' : 'Off' }}
      </span>
      <span class="chevron" :class="{ open: open.rank1 }">›</span>
    </div>
    <div v-if="open.rank1" class="section-body">
      <div class="row">
        <label class="ctrl-label">Enable</label>
        <div class="btn-group">
          <button :class="['tog', { active: g.rankIndicator?.rank1Enabled }]"
            @click="patch({ rankIndicator: { ...g.rankIndicator, rank1Enabled: true,
              rank1Style: g.rankIndicator?.rank1Style && Object.keys(g.rankIndicator.rank1Style).length
                ? g.rankIndicator.rank1Style
                : { fill: { type: 'solid', color: '#FFD700' } }
            } })">On</button>
          <button :class="['tog', { active: !g.rankIndicator?.rank1Enabled }]"
            @click="patch({ rankIndicator: { ...g.rankIndicator, rank1Enabled: false } })">Off</button>
        </div>
      </div>
      <template v-if="g.rankIndicator?.rank1Enabled">
        <div class="row">
          <label class="ctrl-label">Color</label>
          <ColorPicker
            :model-value="(g.rankIndicator?.rank1Style?.fill as any)?.color ?? '#FFD700'"
            @update:model-value="c => patch({ rankIndicator: { ...g.rankIndicator, rank1Style: { ...g.rankIndicator?.rank1Style, fill: { type: 'solid', color: c } } } })"
          />
          <button class="tog" style="font-size:10px;padding:0 8px" title="Reset to gold"
            @click="patch({ rankIndicator: { ...g.rankIndicator, rank1Style: { fill: { type: 'solid', color: '#FFD700' } } } })">
            Reset
          </button>
        </div>
      </template>
    </div>

  </div>
</template>

<style scoped>
.global-panel { display: flex; flex-direction: column; gap: 1px; }

.section-header {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; cursor: pointer; user-select: none;
  background: var(--bg-panel); border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}
.section-header:hover { background: var(--bg-hover); }
.section-title { font-size: 11px; font-weight: 600; color: var(--text); text-transform: uppercase; letter-spacing: 0.06em; flex: 1; }
.chevron { font-size: 14px; color: var(--text-muted); transform: rotate(0deg); transition: transform 0.15s; line-height: 1; }
.chevron.open { transform: rotate(90deg); }
.section-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 10px; font-weight: 600;
}
.badge-on { background: rgba(80,200,80,0.15); color: #5cc85c; }
.badge-off { background: var(--bg-control); color: var(--text-muted); }

.section-body {
  display: flex; flex-direction: column; gap: var(--control-gap-md);
  padding: var(--control-gap-md) var(--control-gap-lg);
  background: var(--bg-section);
  border-bottom: 1px solid var(--border);
}

.sub-label {
  font-size: 10px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 0.08em; margin-top: 4px; padding-top: 8px;
  border-top: 1px solid var(--border);
}

.row { display: flex; align-items: center; gap: var(--control-gap-md); }
.ctrl-label { font-size: 12px; color: var(--text-muted); min-width: var(--label-width); flex-shrink: 0; text-align: right; }

.ctrl-select {
  flex: 1; background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text); font-size: 12px; padding: 0 8px; outline: none; height: var(--control-height);
}
.ctrl-select:focus { border-color: var(--accent); }
.btn-group { display: flex; gap: 2px; }
.tog {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text-muted); font-size: 12px; padding: 0 12px; cursor: pointer; height: var(--control-height);
}
.tog:hover { background: var(--bg-hover); color: var(--text); }
.tog.active { background: var(--accent); border-color: var(--accent); color: #fff; }

.gradient-stops { display: flex; flex-direction: column; gap: var(--control-gap-md); padding-left: var(--label-width); }
.stop-block { display: flex; flex-direction: column; gap: var(--control-gap-sm); }
.stop-color-row { display: flex; align-items: center; gap: var(--control-gap-md); }
.stop-pos-row { display: flex; align-items: center; gap: var(--control-gap-sm); }
.stop-label { font-size: 11px; color: var(--text-muted); min-width: 50px; flex-shrink: 0; }
.remove-stop {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text-muted); width: var(--control-height); height: var(--control-height); cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
}
.remove-stop:hover { background: #e63946; color: #fff; border-color: #e63946; }
.add-stop {
  background: var(--bg-control); border: 1px dashed var(--border); border-radius: 4px;
  color: var(--text-muted); font-size: 11px; padding: 0 8px; cursor: pointer;
  align-self: flex-start; height: var(--control-height); display: flex; align-items: center;
}
.add-stop:hover { background: var(--bg-hover); color: var(--text); }
.texture-section { display: flex; flex-direction: column; gap: var(--control-gap-md); padding-left: var(--label-width); }
</style>
