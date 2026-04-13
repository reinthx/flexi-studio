<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import BarSlider from '../controls/BarSlider.vue'
import DragNumber from '../controls/DragNumber.vue'
import ColorPicker from '../controls/ColorPicker.vue'
import TextureEditor from '../controls/TextureEditor.vue'
import type { GradientFill } from '@shared/configSchema'
import {
  getFontSources, setFontSources, loadFontFromFile,
  storeDirectoryHandle, removeDirectoryHandle, loadFontsFromDirectoryHandle,
} from '@shared/googleFonts'
import type { FontSource } from '@shared/googleFonts'

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

// Custom fonts
const fontsOpen = ref(false)
const fontSources = ref<FontSource[]>(getFontSources())
const scanningId = ref<string | null>(null)
const scanError = ref<string | null>(null)
const scanErrorId = ref<string | null>(null)
let browseTargetId: string | null = null
const browseInputRef = ref<HTMLInputElement | null>(null)

const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2']

function addSource() {
  fontSources.value = [
    ...fontSources.value,
    { id: Math.random().toString(36).slice(2) + Date.now().toString(36), label: '', baseUrl: '', fonts: [] },
  ]
  saveSources()
}

function removeSource(id: string) {
  fontSources.value = fontSources.value.filter(s => s.id !== id)
  saveSources()
  removeDirectoryHandle(id).catch(() => {})
}

function patchSource(id: string, patch: Partial<FontSource>) {
  fontSources.value = fontSources.value.map(s => s.id === id ? { ...s, ...patch } : s)
}

function getFontsText(source: FontSource): string {
  return source.fonts.join('\n')
}

function setFontsText(id: string, text: string) {
  const fonts = text.split('\n').map(f => f.trim()).filter(Boolean)
  patchSource(id, { fonts })
}

function saveSources() {
  setFontSources(fontSources.value)
}

async function scanSource(id: string) {
  const source = fontSources.value.find(s => s.id === id)
  if (!source?.baseUrl) return
  scanningId.value = id
  scanError.value = null
  scanErrorId.value = null
  try {
    const base = source.baseUrl.endsWith('/') ? source.baseUrl : source.baseUrl + '/'
    const res = await fetch(base, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const found: string[] = []
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      // Use raw href attr — avoids browser absolutizing file:// links
      const href = a.getAttribute('href') ?? ''
      const filename = decodeURIComponent(href.split('/').pop() ?? '')
      const ext = FONT_EXTS.find(e => filename.toLowerCase().endsWith(e))
      if (ext) found.push(filename.slice(0, -ext.length))
    }
    if (!found.length) throw new Error('No font files found in directory listing')
    const merged = [...new Set([...source.fonts, ...found])].sort()
    patchSource(id, { fonts: merged })
    saveSources()
  } catch (e: any) {
    scanError.value = e?.message ?? 'Scan failed'
    scanErrorId.value = id
  } finally {
    scanningId.value = null
  }
}

async function browseSource(id: string) {
  // Use File System Access API when available — stores a handle for session restore
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' })
      const source = fontSources.value.find(s => s.id === id)
      if (!source) return
      const names = await loadFontsFromDirectoryHandle(handle)
      await storeDirectoryHandle(id, handle)
      const merged = [...new Set([...source.fonts, ...names])].sort()
      patchSource(id, { fonts: merged, label: source.label || handle.name })
      saveSources()
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.warn('Directory picker failed:', e)
    }
    return
  }
  // Fallback: webkitdirectory input (session-only blob URLs)
  browseTargetId = id
  browseInputRef.value?.click()
}

function onBrowseChange(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? [])
  const id = browseTargetId
  browseTargetId = null
  ;(e.target as HTMLInputElement).value = ''
  if (!files.length || !id) return

  const source = fontSources.value.find(s => s.id === id)
  if (!source) return

  // Load each font file directly via blob URL — no server or file:// URL needed
  const names: string[] = []
  for (const file of files) {
    const ext = FONT_EXTS.find(ex => file.name.toLowerCase().endsWith(ex))
    if (!ext) continue
    const family = file.name.slice(0, -ext.length)
    names.push(family)
    loadFontFromFile(file, family)
  }

  const merged = [...new Set([...source.fonts, ...names])].sort()
  patchSource(id, { fonts: merged })
  saveSources()
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
          <option value="dtps">DTPS</option>
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

    <!-- Custom Fonts — hidden until rework branch -->
    <template v-if="false">
    <div class="section-header" @click="fontsOpen = !fontsOpen">
      <span class="section-title">Custom Fonts</span>
      <span class="section-badge" :class="fontSources.length ? 'badge-on' : 'badge-off'">
        {{ fontSources.length || 'off' }}
      </span>
      <span class="chevron" :class="{ open: fontsOpen }">›</span>
    </div>
    <div v-if="fontsOpen" class="section-body">
      <!-- Hidden directory picker — populated by browseSource() -->
      <input
        ref="browseInputRef"
        type="file"
        style="display:none"
        webkitdirectory
        multiple
        @change="onBrowseChange"
      />

      <div class="setting-note">
        Add font sources pointing to folders with your licensed fonts (.ttf, .woff2, .otf).
        Use <strong>Browse</strong> to pick a local folder, or paste a <code>file:///</code> / <code>https://</code> URL and click <strong>Scan</strong>.
      </div>

      <div class="font-sources-list">
        <div
          v-for="source in fontSources"
          :key="source.id"
          class="font-source-card"
        >
          <!-- Source header: name + remove -->
          <div class="font-source-header">
            <input
              class="ctrl-input source-label-input"
              type="text"
              placeholder="Source name (e.g. My Fonts)"
              :value="source.label"
              @input="patchSource(source.id, { label: ($event.target as HTMLInputElement).value })"
              @change="saveSources"
            />
            <button class="remove-source" @click="removeSource(source.id)" title="Remove">✕</button>
          </div>

          <!-- URL row with Browse + Scan -->
          <div class="row">
            <span class="ctrl-label">URL / Path</span>
            <input
              class="ctrl-input font-url-input"
              type="text"
              placeholder="https://... (for overlay use; Browse loads fonts without this)"
              :value="source.baseUrl"
              @input="patchSource(source.id, { baseUrl: ($event.target as HTMLInputElement).value })"
              @change="saveSources"
            />
            <button class="btn-source-action" @click="browseSource(source.id)" title="Browse for local folder">
              📁
            </button>
            <button
              class="btn-source-action"
              :disabled="!source.baseUrl || scanningId === source.id"
              @click="scanSource(source.id)"
              title="Scan URL for font files"
            >
              {{ scanningId === source.id ? '…' : '⟳' }}
            </button>
          </div>

          <!-- Scan error -->
          <div v-if="scanError && scanErrorId === source.id && scanningId !== source.id" class="scan-error">
            {{ scanError }}
          </div>

          <!-- Discovered fonts list -->
          <div class="fonts-found-row">
            <span class="ctrl-label">Fonts</span>
            <div class="fonts-textarea-wrap">
              <textarea
                class="fonts-textarea"
                placeholder="Scan or Browse to discover fonts&#10;— or type names manually (one per line)"
                :value="getFontsText(source)"
                @input="setFontsText(source.id, ($event.target as HTMLTextAreaElement).value)"
                @change="saveSources"
                rows="3"
              />
              <span class="fonts-count" v-if="source.fonts.length">{{ source.fonts.length }} font{{ source.fonts.length !== 1 ? 's' : '' }}</span>
            </div>
          </div>
        </div>
      </div>

      <button class="add-source" @click="addSource">+ Add Font Source</button>
    </div>
    </template>

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

.tabs-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.tab-row { display: flex; align-items: center; gap: 6px; }
.tab-label-btn {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text); font-size: 11px; padding: 4px 10px; cursor: pointer; min-width: 60px;
}
.tab-label-btn:hover { background: var(--bg-hover); }
.tab-label-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.tab-name-input {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text); font-size: 11px; padding: 2px 6px; width: 70px; outline: none;
}
.tab-name-input:focus { border-color: var(--accent); }
.tab-dps-select {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text); font-size: 11px; padding: 2px 4px; outline: none; width: 70px;
}
.remove-tab {
  background: transparent; border: none; color: var(--text-muted); font-size: 14px; cursor: pointer; padding: 2px 6px;
}
.remove-tab:hover { color: #e63946; }
.tab-edit-btn {
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text); font-size: 10px; padding: 2px 6px; cursor: pointer;
}
.tab-edit-btn:hover { background: var(--bg-hover); }
.tab-label-config {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-section);
  border-radius: 4px;
  border: 1px solid var(--border);
}
.add-tab {
  background: var(--bg-control); border: 1px dashed var(--border); border-radius: 4px;
  color: var(--text-muted); font-size: 11px; padding: 6px 10px; cursor: pointer; margin-top: 8px;
  align-self: flex-start;
}
.add-tab:hover { background: var(--bg-hover); color: var(--text); }

.setting-note {
  font-size: 10px; color: var(--text-muted); line-height: 1.5;
  padding: 4px 0 8px;
}
.setting-note code {
  font-family: monospace; font-size: 10px;
  background: var(--bg-control); border-radius: 2px; padding: 1px 3px;
}
.ctrl-input {
  flex: 1; background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text); font-size: 12px; padding: 0 8px;
  outline: none; height: var(--control-height);
}
.ctrl-input:focus { border-color: var(--accent); }
.font-url-input { font-family: monospace; font-size: 11px; }

/* Font source cards */
.font-sources-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.font-source-card {
  display: flex; flex-direction: column; gap: 6px;
  background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px; padding: 8px;
}
.font-source-header { display: flex; align-items: center; gap: 6px; }
.source-label-input { font-weight: 600; }
.remove-source {
  background: transparent; border: none; color: var(--text-muted);
  font-size: 12px; cursor: pointer; padding: 2px 6px; flex-shrink: 0;
}
.remove-source:hover { color: #e63946; }
.fonts-textarea-row { display: flex; align-items: flex-start; gap: var(--control-gap-md); }
.fonts-textarea-wrap { flex: 1; position: relative; }
.fonts-textarea {
  width: 100%; background: var(--bg-control); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text); font-size: 11px; font-family: monospace;
  padding: 6px 8px; outline: none; resize: vertical; box-sizing: border-box;
  line-height: 1.5;
}
.fonts-textarea:focus { border-color: var(--accent); }
.fonts-count {
  position: absolute; bottom: 4px; right: 6px;
  font-size: 9px; color: var(--text-muted); pointer-events: none;
}
.add-source {
  background: var(--bg-control); border: 1px dashed var(--border); border-radius: 4px;
  color: var(--text-muted); font-size: 11px; padding: 6px 10px; cursor: pointer;
  align-self: flex-start;
}
.add-source:hover { background: var(--bg-hover); color: var(--text); }
</style>
