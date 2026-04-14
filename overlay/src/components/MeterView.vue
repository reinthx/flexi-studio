<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useLiveDataStore } from '../stores/liveData'
import MeterBar from './MeterBar.vue'
import MeterHeader from './MeterHeader.vue'
import type { BarStyle, TabConfig } from '@shared/configSchema'
import { resolveBarStyle } from '@shared/styleResolver'
import { buildFillCss } from '@shared/cssBuilder'
import { loadCustomFont } from '@shared/googleFonts'
import { ref, nextTick } from 'vue'
import ScrollableBarsWrapper from '@shared/components/ScrollableBarsWrapper.vue'

const store = useLiveDataStore()
const g = computed(() => store.profile.global)
const frame = computed(() => store.frame)

const activeTabLabelConfig = computed(() => {
  if (!g.value.tabsEnabled) return undefined
  return g.value.tabs?.find((t: TabConfig) => t.id === g.value.activeTab)?.labelConfig
})

const openEditor = () => {
  const url = new URL(window.location.href)
  url.hash = '/editor'
  window.open(url.toString(), 'act-flexi-editor', 'width=1300,height=840')
}

interface ResolvedBar {
  name: string
  job: string
  fillFraction: number
  displayValue: string
  displayPct: string
  deaths: string
  crithit: string
  directhit: string
  tohit: string
  enchps: string
  alpha: number
  rank: number
  barIndex: number
  style: BarStyle & { rank1HeightIncrease?: number }
  isSelf: boolean
  isRank1: boolean
}

const bars = computed<ResolvedBar[]>(() => {
  if (!frame.value) return []
  return frame.value.bars.map((b, i) => ({
    ...b,
    rank: i + 1,
    barIndex: i,
    style: resolveBarStyle(b.job, b.name, i + 1, store.profile, store.selfName),
    isSelf: b.name === store.selfName || b.name === 'YOU',
    isRank1: i === 0,
  }))
})

const isHorizontal = computed(() => g.value.orientation === 'horizontal')
const containerStyle = computed(() => ({
  flexDirection: isHorizontal.value ? 'row' : 'column',
}))

function setCombatantFilter(filter: 'all' | 'party' | 'self') {
  store.setCombatantFilter(filter)
}

function toggleBlurNames() {
  store.toggleBlurNames()
}

function togglePin() {
  const newVal = !g.value.header.pinned
  store.setHeaderPinned(newVal)
}

function toggleMergePets() {
  const newVal = !g.value.mergePets
  store.setMergePets(newVal)
}

const bgStyle = computed(() => {
  const wb = g.value.windowBackground
  const border = g.value.windowBorder
  const style: Record<string, string> = {}
  if (wb) {
    Object.assign(style, buildFillCss(wb))
  } else {
    style.backgroundColor = g.value.windowBg ?? 'transparent'
  }
  const opacity = g.value.windowOpacity
  if (opacity !== undefined && opacity < 1) {
    style.opacity = String(opacity)
  }
  if (border?.enabled && border.radius > 0) {
    style.borderRadius = `${border.radius}px`
  }
  return style
})

const rootStyle = computed(() => {
  const style: Record<string, string> = {}
  const border = g.value.windowBorder
  if (border?.enabled) {
    style.border = `${border.width}px solid ${border.color}`
    style.borderRadius = `${border.radius}px`
  }
  const shadow = g.value.windowShadow
  if (shadow?.enabled) {
    style.boxShadow = `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
  }
  return style
})

// Dynamic border-radius on the content layer so overflow clips rounded corners
const contentStyle = computed(() => {
  const style: Record<string, string> = {}
  const border = g.value.windowBorder
  if (border?.enabled && border.radius > 0) {
    style.borderRadius = `${border.radius}px`
  }
  return style
})

// Bars container max-height driven by viewport (shared wrapper will handle scrolling)
const barsMaxHeight = ref<string>('unset')
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  store.start()
  loadCustomFont('redacted-script-bold')
  ;(window as any).actFlexiDebug = () => {
    const root = document.querySelector('.meter-root') as HTMLElement
    const app = document.getElementById('app')
    const barsCont = document.querySelector('.bars-container') as HTMLElement
    return {
      appRect: app?.getBoundingClientRect(),
      meterRootRect: root?.getBoundingClientRect(),
      barsContainerRect: barsCont?.getBoundingClientRect(),
      documentOpacity: document.documentElement.style.opacity,
      frameBars: store.frame?.bars.length ?? 0,
      profileGlobal: store.profile.global,
    }
  }
  // Compute available height for the bars area (header height taken into account)
  const updateBarsHeight = () => {
    const root = document.querySelector('.meter-root') as HTMLElement | null
    const header = root?.querySelector('.header-outside') as HTMLElement | null
    const headerHeight = header?.offsetHeight ?? 0
    const vh = root?.offsetHeight ?? window.innerHeight
    const available = Math.max(0, vh - headerHeight)
    barsMaxHeight.value = `${available}px`
  }
  updateBarsHeight()
  const root = document.querySelector('.meter-root') as HTMLElement | null
  if (root) {
    resizeObserver = new ResizeObserver(updateBarsHeight)
    resizeObserver.observe(root)
  }
})

onUnmounted(() => {
  store.stop()
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div class="meter-root">
    <div class="meter-border" :style="rootStyle" />

    <MeterHeader
      v-if="g.header.show"
      class="header-outside"
      :config="g.header"
      :encounter-title="frame?.encounterTitle ?? ''"
      :encounter-duration="frame?.encounterDuration ?? ''"
      :total-d-p-s="frame?.totalDps ?? ''"
      :total-h-p-s="frame?.totalHps ?? ''"
      :total-d-t-p-s="frame?.totalDtps ?? ''"
      :pull-number="store.sessionPulls.length"
      :pull-count="store.sessionPulls.length"
      :global="g"
      :show-settings="true"
      :on-settings="openEditor"
      :on-set-combatant-filter="setCombatantFilter"
      :on-toggle-blur-names="toggleBlurNames"
      :on-toggle-pin="togglePin"
      :on-toggle-merge-pets="toggleMergePets"
    />

    <div class="meter-content" :style="contentStyle">
      <div class="meter-bg" :style="bgStyle" />
      <div v-if="g.header?.pinned" class="resize-corner" />

    <div class="bars-container" :style="containerStyle">
      <div v-if="bars.length === 0" class="empty-state">Waiting for combat data...</div>
      <ScrollableBarsWrapper :maxHeight="barsMaxHeight">
        <MeterBar
          v-for="bar in bars"
          :key="bar.name"
          :bar="bar"
          :style-config="bar.style"
          :orientation="g.orientation"
          :show-rank="g.rankIndicator.showNumbers"
          :blur-name="g.blurNames && bar.name !== store.selfName && bar.name !== 'YOU'"
          :value-format="g.valueFormat"
          :bar-index="bar.barIndex"
          :rank1-config="bar.isRank1 && g.rankIndicator?.rank1Enabled ? g.rankIndicator : undefined"
        />
      </ScrollableBarsWrapper>
    </div>

      <MeterHeader
        v-if="g.footer.show"
        :config="g.footer"
        :encounter-title="frame?.encounterTitle ?? ''"
        :encounter-duration="frame?.encounterDuration ?? ''"
        :total-d-p-s="frame?.totalDps ?? ''"
        :total-h-p-s="frame?.totalHps ?? ''"
        :total-d-t-p-s="frame?.totalDtps ?? ''"
        :pull-number="store.sessionPulls.length"
        :pull-count="store.sessionPulls.length"
        :global="g"
        :is-footer="true"
      />
    </div>

  </div>
</template>

<style scoped>
.meter-root {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: auto;
  position: relative;
}
.meter-border {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 100;
}
.meter-content {
  position: relative;
  z-index: 1;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: inherit;
  clip-path: inset(0 round inherit);
}
.meter-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  border-radius: inherit;
}
.bars-container {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  padding: 4px;
}
.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  pointer-events: none;
  user-select: none;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.7);
}
.header-outside {
  position: relative;
  z-index: 200;
  flex-shrink: 0;
  overflow: hidden;
}
.meter-root:hover .header-outside.is-hidden {
  opacity: 1;
}
.resize-corner {
  position: absolute;
  bottom: 15px;
  right: 15px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  pointer-events: auto;
}
.resize-corner::after {
  content: '';
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 8px;
  height: 8px;
  border-right: 2px solid rgba(255,255,255,0.5);
  border-bottom: 2px solid rgba(255,255,255,0.5);
}
</style>
