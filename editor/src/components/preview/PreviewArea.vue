<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useLiveDataStore } from '../../stores/liveData'
import PreviewBar from './PreviewBar.vue'
import ScrollableBarsWrapper from '@shared/components/ScrollableBarsWrapper.vue'
import PreviewHeader from './PreviewHeader.vue'
import { useConfigStore } from '../../stores/config'
import { resolveBarStyle } from '@shared/styleResolver'
import { buildFillCss } from '@shared/cssBuilder'

const STORAGE_KEY = 'flexi-editor-meter-height'

const liveData = useLiveDataStore()
const config   = useConfigStore()
const profile  = computed(() => config.profile)
const g        = computed(() => profile.value.global)
const frame    = computed(() => liveData.frame)

const bars = computed(() => {
  if (!frame.value) return []
  const sn = liveData.selfName
  return frame.value.bars.map((b, i) => ({
    ...b,
    rank: i + 1,
    barIndex: i,
    style: resolveBarStyle(b.job, b.name, i + 1, profile.value, sn),
    isRank1: i === 0,
    isSelf: b.name === sn || b.name === 'YOU',
  }))
})

const isHorizontal = computed(() => g.value.orientation === 'horizontal')

const activeTabConfig = computed(() => {
  if (!g.value.tabsEnabled) return undefined
  return g.value.tabs.find(t => t.id === g.value.activeTab)
})

const activeTabLabelConfig = computed(() => activeTabConfig.value?.labelConfig)

// Draggable wrapper refs
const wrapperRef = useTemplateRef<HTMLElement>('wrapperEl')
const previewAreaRef = useTemplateRef<HTMLElement>('previewAreaEl')
const meterRef = useTemplateRef<HTMLElement>('meterEl')

const PREVIEW_MARGIN = 16

// Start inside the preview pane; it is centered once the pane size is known.
const x = ref(PREVIEW_MARGIN)
const y = ref(PREVIEW_MARGIN)
const dragOffset = ref<{ x: number; y: number } | null>(null)

const { height: winH } = useElementSize(meterRef)
const { width: areaW, height: areaH } = useElementSize(previewAreaRef)
const { width: wrapperW, height: wrapperH } = useElementSize(wrapperRef)

const savedHeight = typeof sessionStorage !== 'undefined'
  ? parseInt(sessionStorage.getItem(STORAGE_KEY) || '', 10)
  : 0

function clampPreviewPosition(nextX: number, nextY: number) {
  const maxX = Math.max(PREVIEW_MARGIN, areaW.value - wrapperW.value - PREVIEW_MARGIN)
  const maxY = Math.max(PREVIEW_MARGIN, areaH.value - wrapperH.value - PREVIEW_MARGIN)
  return {
    x: Math.min(Math.max(PREVIEW_MARGIN, nextX), maxX),
    y: Math.min(Math.max(PREVIEW_MARGIN, nextY), maxY),
  }
}

function centerPreviewOnce() {
  if (areaW.value > 0) {
    x.value = Math.max(PREVIEW_MARGIN, Math.round((areaW.value - wrapperW.value) / 2))
    y.value = Math.max(PREVIEW_MARGIN, Math.round((areaH.value - wrapperH.value) / 2))
  }
}

function stopDrag() {
  dragOffset.value = null
  window.removeEventListener('pointermove', movePreview)
  window.removeEventListener('pointerup', stopDrag)
}

function movePreview(event: PointerEvent) {
  if (!dragOffset.value || !previewAreaRef.value) return
  const areaRect = previewAreaRef.value.getBoundingClientRect()
  const next = clampPreviewPosition(
    event.clientX - areaRect.left - dragOffset.value.x,
    event.clientY - areaRect.top - dragOffset.value.y,
  )
  x.value = next.x
  y.value = next.y
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !previewAreaRef.value) return
  event.preventDefault()
  const areaRect = previewAreaRef.value.getBoundingClientRect()
  dragOffset.value = {
    x: event.clientX - areaRect.left - x.value,
    y: event.clientY - areaRect.top - y.value,
  }
  window.addEventListener('pointermove', movePreview)
  window.addEventListener('pointerup', stopDrag)
}

onMounted(() => {
  centerPreviewOnce()
  if (meterRef.value && savedHeight > 0) {
    meterRef.value.style.height = `${savedHeight}px`
  }
})

onUnmounted(stopDrag)

watch(winH, (height) => {
  if (height > 50) {
    sessionStorage.setItem(STORAGE_KEY, String(Math.round(height)))
  }
})

watch([areaW, areaH, wrapperW, wrapperH, isHorizontal], () => {
  const next = clampPreviewPosition(x.value, y.value)
  x.value = next.x
  y.value = next.y
}, { flush: 'post' })

// Window background — from global config (falls back to default)
const windowBg = computed(() => g.value.windowBg ?? 'rgba(0,0,0,0.6)')
const windowFillStyle = computed(() => {
  const fill = g.value.windowBackground ?? { type:'solid', color: windowBg.value }
  return buildFillCss(fill)
})

const windowBgLayer = computed(() => {
  const style: Record<string, string> = { ...windowFillStyle.value }
  const opacity = (g.value as any).windowOpacity
  if (opacity !== undefined && opacity < 1) {
    style.opacity = String(opacity)
  }
  return style
})

const wrapperStyle = computed(() => ({
  left: `${x.value}px`,
  top:  `${y.value}px`,
  width: isHorizontal.value ? 'min(720px, calc(100% - 32px))' : 'min(350px, calc(100% - 32px))',
}))

const meterStyle = computed(() => ({}))

function toggleHeaderPin() {
  config.profile.global.header.pinned = !(config.profile.global.header.pinned ?? true)
}
</script>

<template>
  <div ref="previewAreaEl" class="preview-area">
    <div class="preview-condition-grid" aria-hidden="true">
      <div class="condition-tile condition-tile--stone" />
      <div class="condition-tile condition-tile--grass" />
      <div class="condition-tile condition-tile--ice" />
      <div class="condition-tile condition-tile--fire" />
      <div class="condition-tile condition-tile--dark" />
    </div>
    <!-- Outer wrapper: positioned + draggable -->
    <div ref="wrapperEl" class="preview-wrapper" :style="wrapperStyle">
      <!-- Drag handle — sits ABOVE the meter window -->
      <div class="preview-titlebar" @pointerdown="startDrag">
        <span class="titlebar-text">Layout Preview</span>
      </div>

      <!-- Header — outside meter frame -->
      <PreviewHeader
        v-if="g.header.show"
        class="header-outside"
        :config="g.header" :frame="frame" :global="g"
        :on-toggle-pin="toggleHeaderPin"
      />

      <!-- Meter window — matches the overlay 1:1 from this point down -->
      <div ref="meterEl" class="preview-meter" :style="meterStyle">
        <div class="meter-frame" :style="{ flexDirection: isHorizontal ? 'row' : 'column' }">
          <div class="preview-meter-bg" :style="windowBgLayer" />
        <ScrollableBarsWrapper :maxHeight="`${winH}px`" :orientation="g.orientation">
          <PreviewBar
            v-for="bar in bars" :key="bar.name"
            :bar="bar" :style-config="bar.style"
            :orientation="g.orientation" :show-rank="g.rankIndicator.showNumbers"
            :container-height="winH"
            :value-format="g.valueFormat"
            :bar-index="bar.barIndex"
            :tab-label-config="activeTabLabelConfig"
            :rank1-config="bar.isRank1 && g.rankIndicator?.rank1Enabled ? g.rankIndicator : undefined"
            :color-overrides="profile.overrides"
          />
        </ScrollableBarsWrapper>
        <div v-if="!bars.length" class="no-data">Waiting for combat data…</div>

          <PreviewHeader v-if="g.footer.show" :config="g.footer" :frame="frame" :global="g" :is-footer="true" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-area {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-conic-gradient(#1a1a2e 0% 25%, #0a0a14 0% 50%) 50% / 20px 20px;
}

.preview-condition-grid {
  position: absolute;
  inset: 10%;
  display: grid;
  grid-template-columns: repeat(5, minmax(92px, 1fr));
  gap: 10px;
  pointer-events: none;
  opacity: 0.82;
}

.condition-tile {
  min-height: 100%;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.22), 0 10px 28px rgba(0,0,0,0.18);
}

.condition-tile--stone {
  background:
    linear-gradient(135deg, rgba(255,255,255,0.12), transparent 42%),
    repeating-linear-gradient(28deg, #3c4147 0 18px, #2a2f35 18px 34px, #4b5156 34px 46px);
}
.condition-tile--grass {
  background:
    radial-gradient(circle at 30% 20%, rgba(255,255,255,0.16), transparent 24%),
    linear-gradient(135deg, #304c36, #102816 52%, #577046);
}
.condition-tile--ice {
  background:
    linear-gradient(160deg, rgba(255,255,255,0.35), transparent 32%),
    linear-gradient(45deg, #8fb8c7, #263b4a 54%, #d3e5e9);
}
.condition-tile--fire {
  background:
    radial-gradient(circle at 70% 76%, rgba(255,222,120,0.4), transparent 34%),
    linear-gradient(145deg, #5a1f22, #261217 48%, #876235);
}
.condition-tile--dark {
  background:
    linear-gradient(135deg, rgba(255,255,255,0.08), transparent 38%),
    linear-gradient(45deg, #07090c, #1d1a28 48%, #10151f);
}

/* Outer draggable wrapper — holds titlebar + meter */
.preview-wrapper {
  position: absolute;
  width: 350px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  max-width: calc(100% - 32px);
}

/* Drag handle — outside the meter window */
.preview-titlebar {
  height: 22px; flex-shrink: 0;
  background: rgba(255,255,255,0.18);
  cursor: grab;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-radius: 4px 4px 0 0;
  border: 1px solid var(--border);
  border-bottom: none;
}
.titlebar-text {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  pointer-events: none;
  letter-spacing: 0.04em;
}
.preview-titlebar:active { cursor: grabbing; }

/* Meter window — pixel-identical to the overlay from here down */
.preview-meter {
  position: relative;
  height: 300px;
  resize: both;
  overflow: auto;
  min-width: 150px;
  border: 1px solid var(--border);
  border-radius: 0 0 4px 4px;
  display: flex;
  flex-direction: column;
}

.meter-frame {
  display: flex; flex-direction: column;
  width: 100%;
  flex: 1;
  min-height: 0;
  z-index: 2;
  position: relative;
}
.preview-meter-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  border-radius: inherit;
}
.bars-area {
  display: flex;
  padding: 4px;
  flex: 1;
  min-height: 0;
  align-items: flex-start;
  overflow: auto;
}
.no-data {
  padding: 16px; text-align: center;
  color: var(--text-muted); font-size: 12px; width: 100%;
}

/* Reveal pinned-off header when hovering the meter */
.preview-wrapper:hover :deep(.meter-header.is-hidden) {
  opacity: 1;
}
.header-outside {
  position: relative;
  z-index: 200;
  flex-shrink: 0;
}
</style>
