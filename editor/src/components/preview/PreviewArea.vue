<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useDraggable, useElementSize } from '@vueuse/core'
import { useLiveDataStore } from '../../stores/liveData'
import PreviewBar from './PreviewBar.vue'
import ScrollableBarsWrapper from '@shared/components/ScrollableBarsWrapper.vue'
import PreviewHeader from './PreviewHeader.vue'
import { useConfigStore } from '../../stores/config'
import { resolveBarStyle } from '@shared/styleResolver'
import { buildFillCss } from '@shared/cssBuilder'

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
  }))
})

const isHorizontal = computed(() => g.value.orientation === 'horizontal')

// Draggable wrapper refs
const wrapperRef = useTemplateRef<HTMLElement>('wrapperEl')
const titlebarRef = useTemplateRef<HTMLElement>('titlebarEl')
const meterRef = useTemplateRef<HTMLElement>('meterEl')

// Start centered in the viewport
const initX = ref(Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 1280) / 2 - 175))
const initY = ref(Math.max(0, (typeof window !== 'undefined' ? window.innerHeight : 800) / 2 - 150))

const { x, y } = useDraggable(wrapperRef, {
  handle: titlebarRef,
  initialValue: { x: initX.value, y: initY.value },
})

const { width: winW, height: winH } = useElementSize(meterRef)

// Window background — from global config (falls back to default)
const windowBg = computed(() => g.value.windowBg ?? 'rgba(0,0,0,0.6)')
const barHeight = computed(() => profile.value.default.height)
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
}))

const meterStyle = computed(() => ({
  minHeight: isHorizontal.value ? '0' : `${barHeight.value}px`,
}))

function toggleHeaderPin() {
  config.profile.global.header.pinned = !(config.profile.global.header.pinned ?? true)
}
</script>

<template>
  <div class="preview-area">
    <!-- Outer wrapper: positioned + draggable -->
    <div ref="wrapperEl" class="preview-wrapper" :style="wrapperStyle">
      <!-- Drag handle — sits ABOVE the meter window -->
      <div ref="titlebarEl" class="preview-titlebar">
        <span class="titlebar-text">PREVIEW {{ winW }}×{{ winH }} ☼ bar {{ profile.default.height }}px</span>
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
        <ScrollableBarsWrapper :maxHeight="`${winH}px`">
          <PreviewBar
            v-for="bar in bars" :key="bar.name"
            :bar="bar" :style-config="bar.style"
            :orientation="g.orientation" :show-rank="g.rankIndicator.showNumbers"
            :container-height="winH"
            :auto-scale="g.autoScale"
            :bar-index="bar.barIndex"
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

/* Outer draggable wrapper — holds titlebar + meter */
.preview-wrapper {
  position: fixed;
  width: 350px;
  z-index: 200;
  display: flex;
  flex-direction: column;
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
  min-height: 300px;
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
