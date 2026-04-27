<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, defineAsyncComponent, provide } from 'vue'
import { useLiveDataStore } from './stores/liveData'
import { useConfigStore }   from './stores/config'
import { usePresetsStore }  from './stores/presets'
import { restoreDirectoryFonts } from '@shared/googleFonts'
import PreviewArea from './components/preview/PreviewArea.vue'
import GlobalSettingsPanel from './components/panels/GlobalSettingsPanel.vue'
import BarStylePanel from './components/panels/BarStylePanel.vue'
import ColorEditor from './components/controls/ColorEditor.vue'
import PresetPanel from './components/panels/PresetPanel.vue'

const liveData = useLiveDataStore()
const config   = useConfigStore()
const presets  = usePresetsStore()

type Route = 'overlay' | 'editor' | 'breakdown'

function resolveRoute(): Route {
  const hash = window.location.hash.slice(1).toLowerCase() || '/'
  if (hash === '/editor' || hash === 'editor') return 'editor'
  if (hash === '/breakdown' || hash === 'breakdown') return 'breakdown'
  return 'overlay'
}

const currentRoute = ref<Route>(resolveRoute())

// Keep overlay mode alias for all existing v-if/v-else references
const isOverlayMode = computed(() => currentRoute.value === 'overlay')

const BreakdownPopout = defineAsyncComponent(() => import('../../overlay/src/components/AbilityBreakdownPopout.vue'))

const OverlayMeter = defineAsyncComponent(() => import('../../overlay/src/components/MeterView.vue'))

const applySuccess = ref(false)
let applyTimer: ReturnType<typeof setTimeout> | null = null

async function applyLive() {
  const message = { source: 'act-flexi-editor', msg: config.profile, timestamp: Date.now() }
  localStorage.setItem('act-flexi-github-sync', JSON.stringify(message))
  setTimeout(() => {
    localStorage.removeItem('act-flexi-github-sync')
  }, 2000)
  await config.save()
  applySuccess.value = true
  if (applyTimer) clearTimeout(applyTimer)
  applyTimer = setTimeout(() => { applySuccess.value = false }, 1500)
}

function openBreakdown() {
  const url = new URL(window.location.href)
  url.hash = '/breakdown'
  window.open(url.toString(), 'flexi-breakdown', 'width=1300,height=840,resizable=yes')
}

onMounted(async () => {
  if (currentRoute.value !== 'editor') return
  liveData.setProfileGetter(() => config.profile)
  liveData.start()
  const hasData = await config.load()
  await presets.init()
  if (!hasData) {
    const defaultPreset = presets.builtInPresets.find(p => p.filename === 'default')
    if (defaultPreset) presets.applyBuiltIn(presets.builtInPresets.indexOf(defaultPreset))
  }
  restoreDirectoryFonts().catch(() => {})
})
onUnmounted(() => {
  if (currentRoute.value === 'editor') {
    liveData.stop()
  }
})

// ── Right sidebar sections ────────────────────────────────────────────────────
const rightSections = ref({
  presets: true,
  global: false,
  colors: false,
})

function toggleRightSection(key: string) {
  rightSections.value[key as keyof typeof rightSections.value] = !rightSections.value[key as keyof typeof rightSections.value]
}

// Provide a way for child components to open the Colors panel
provide('openColorsPanel', () => { rightSections.value.colors = true })

// ── Right sidebar badges ──────────────────────────────────────────────────────
const colorsBadge = computed(() => {
  const ov = config.profile.overrides
  const parts: string[] = []
  if (ov?.selfEnabled) parts.push('Self')
  const roleCount = ov?.byRoleEnabled ? Object.values(ov.byRoleEnabled).filter(Boolean).length : 0
  if (roleCount > 0) parts.push(`${roleCount} Role${roleCount === 1 ? '' : 's'}`)
  const jobCount = ov?.byJobEnabled ? Object.values(ov.byJobEnabled).filter(Boolean).length : 0
  if (jobCount > 0) parts.push(`${jobCount} Job${jobCount === 1 ? '' : 's'}`)
  return parts.length > 0 ? parts.join(' · ') : 'Default'
})

const globalBadge = computed(() => {
  const g = config.profile.global
  const orient = g.orientation === 'horizontal' ? 'Horiz' : 'Vert'
  const metric = g.dpsType === 'encdps' ? 'DPS' : g.dpsType === 'enchps' ? 'HPS' : g.dpsType ?? 'DPS'
  return `${orient} · ${metric}`
})

const saveStateLabel = computed(() => applySuccess.value ? 'Live overlay updated' : config.dirty ? 'Unsaved changes' : 'Saved')
</script>

<template>
  <!-- Overlay Mode -->
  <div v-if="isOverlayMode" class="overlay-mode">
    <OverlayMeter />
  </div>

  <!-- Breakdown Popout -->
  <BreakdownPopout v-else-if="currentRoute === 'breakdown'" />

  <!-- Editor Mode -->
  <div v-else class="editor-root">
    <!-- Top bar -->
    <div class="top-bar">
      <div class="top-bar-left">
        <span class="logo">Flexi Studio</span>
        <span class="divider">|</span>
        <span class="subtitle">A modern overlay for ACT</span>
        <span class="save-state" :class="{ dirty: config.dirty, success: applySuccess }">{{ saveStateLabel }}</span>
      </div>
      <div class="top-bar-right">
        <button class="utility-btn" @click="openBreakdown">Open Breakdown</button>
        <button class="apply-btn" :class="{ success: applySuccess }" @click="applyLive">
          {{ applySuccess ? '✓ Applied' : 'Apply Changes' }}
        </button>
      </div>
    </div>

    <div class="editor-body">
      <!-- Left sidebar — bar style -->
      <div class="sidebar">
        <BarStylePanel />
      </div>

      <!-- Preview area -->
      <div class="preview-area">
        <PreviewArea />
      </div>

      <!-- Right sidebar -->
      <div class="right-sidebar">
        <!-- Colors -->
        <div class="rs-section rs-section--colors">
          <div class="rs-header" @click="toggleRightSection('colors')">
            <span class="rs-title">Colors</span>
            <span class="rs-badge">{{ colorsBadge }}</span>
            <span class="rs-chevron" :class="{ open: rightSections.colors }">›</span>
          </div>
          <div v-if="rightSections.colors" class="rs-body">
            <ColorEditor />
          </div>
        </div>

        <!-- Presets -->
        <div class="rs-section rs-section--presets">
          <div class="rs-header" @click="toggleRightSection('presets')">
            <span class="rs-title">Presets</span>
            <span class="rs-badge">{{ presets.badge }}</span>
            <span class="rs-chevron" :class="{ open: rightSections.presets }">›</span>
          </div>
          <div v-if="rightSections.presets" class="rs-body">
            <PresetPanel />
          </div>
        </div>

        <!-- Global Settings -->
        <div class="rs-section rs-section--global">
          <div class="rs-header" @click="toggleRightSection('global')">
            <span class="rs-title">Global</span>
            <span class="rs-badge">{{ globalBadge }}</span>
            <span class="rs-chevron" :class="{ open: rightSections.global }">›</span>
          </div>
          <div v-if="rightSections.global" class="rs-body rs-body--flush">
            <GlobalSettingsPanel />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-root {
  width: 100vw;
  height: 100vh;
  min-width: 980px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}

/* Top bar */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 40px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.02em;
}

.divider {
  color: #333;
  font-size: 12px;
}

.subtitle {
  font-size: 11px;
  color: #666;
}

.save-state {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg-control);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 2px 7px;
  white-space: nowrap;
}

.save-state.dirty {
  color: #ffd166;
  border-color: rgba(255, 209, 102, 0.28);
  background: rgba(255, 209, 102, 0.09);
}

.save-state.success {
  color: #9ff0c0;
  border-color: rgba(58, 158, 95, 0.35);
  background: rgba(58, 158, 95, 0.14);
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.apply-btn {
  background: var(--accent, #9b5de5);
  border: none;
  color: #fff;
  font-size: 11px;
  padding: 4px 14px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  min-width: 110px;
}

.utility-btn {
  background: var(--bg-control);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.utility-btn:hover {
  background: var(--bg-hover);
  border-color: rgba(155, 93, 229, 0.45);
}

.apply-btn:hover {
  opacity: 0.85;
}

.apply-btn.success {
  background: #3a9e5f;
  transform: scale(1.02);
}

/* Editor body */
.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  width: 300px;
  min-width: 300px;
  height: 100%;
  overflow-y: auto;
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}

/* Right sidebar */
.right-sidebar {
  width: 340px;
  min-width: 340px;
  height: 100%;
  overflow-y: auto;
  background: var(--bg-panel);
  border-left: 1px solid var(--border);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

/* Preview area */
.preview-area {
  flex: 1;
  min-width: 360px;
  position: relative;
  overflow: hidden;
  background: var(--bg-base);
}
.overlay-mode {
  width: 100vw;
  height: 100vh;
  background: transparent;
}
.overlay-mode :deep(body) {
  background: transparent !important;
}

/* Scrollbar */
.sidebar::-webkit-scrollbar,
.right-sidebar::-webkit-scrollbar {
  width: 6px;
}

.sidebar::-webkit-scrollbar-track,
.right-sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar::-webkit-scrollbar-thumb,
.right-sidebar::-webkit-scrollbar-thumb {
  background: #2a2a3e;
  border-radius: 3px;
}

.sidebar::-webkit-scrollbar-thumb:hover,
.right-sidebar::-webkit-scrollbar-thumb:hover {
  background: #3a3a4e;
}

/* Right sidebar sections */
.rs-section {
  border-bottom: 1px solid var(--border);
  border-left: 3px solid transparent;
}
.rs-section--colors  { border-left-color: #06d6a0; }
.rs-section--presets { border-left-color: #ffd166; }
.rs-section--global  { border-left-color: #8ecae6; }

.rs-header {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 12px; cursor: pointer; user-select: none;
  background: var(--bg-panel); transition: background 0.1s;
}
.rs-header:hover { background: var(--bg-hover); }
.rs-title {
  flex: 1; font-size: 11px; font-weight: 600;
  color: var(--text); text-transform: uppercase; letter-spacing: 0.06em;
}
.rs-badge {
  font-size: 10px; color: var(--text-muted); background: var(--bg-control);
  padding: 1px 6px; border-radius: 10px; white-space: nowrap;
  max-width: 110px; overflow: hidden; text-overflow: ellipsis;
}
.rs-chevron {
  font-size: 14px; color: var(--text-muted);
  transform: rotate(0deg); transition: transform 0.15s; line-height: 1;
}
.rs-chevron.open { transform: rotate(90deg); }

.rs-body { padding: 8px 10px 12px; }
.rs-body--flush { padding: 0; }
</style>
