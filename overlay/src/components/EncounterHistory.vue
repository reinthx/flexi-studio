<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, useTemplateRef } from 'vue'
import { useLiveDataStore } from '../stores/liveData'

const store = useLiveDataStore()

const showHistory = ref(false)
const triggerRef = useTemplateRef<HTMLElement>('triggerEl')
const popupX = ref(0)
const popupY = ref(0)
const popupMaxHeight = ref('300px')
const popupMode = ref<'vertical' | 'horizontal'>('vertical')

function scrollByWheel(el: HTMLElement, e: WheelEvent): boolean {
  const maxScroll = el.scrollWidth - el.clientWidth
  if (maxScroll <= 0) return false
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!delta) return false
  el.scrollLeft += delta
  return true
}

async function toggle(): Promise<void> {
  showHistory.value = !showHistory.value
  if (showHistory.value) {
    await nextTick()
    positionPopup()
  }
}

function positionPopup(): void {
  const el = triggerRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const margin = 4
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (vh < 180) {
    popupMode.value = 'horizontal'
    popupX.value = margin
    popupY.value = margin
    popupMaxHeight.value = `${Math.max(44, vh - margin * 2)}px`
    return
  }

  popupMode.value = 'vertical'
  popupX.value = Math.min(Math.max(margin, rect.left), Math.max(margin, vw - 404))
  popupY.value = Math.min(rect.bottom + 2, Math.max(margin, vh - 80))
  popupMaxHeight.value = `${Math.max(80, vh - popupY.value - margin)}px`
}

function close(): void {
  showHistory.value = false
}

function selectPull(index: number): void {
  store.viewPull(index)
  close()
}

function backToLive(): void {
  store.viewPull(null)
  close()
}

const encounters = computed(() => {
  const pulls = store.sessionPulls ?? []
  const seen = new Set<string>()
  const result: { pull: ReturnType<typeof useLiveDataStore>['sessionPulls'][number]; sessionIndex: number }[] = []
  for (let i = 0; i < pulls.length; i++) {
    const pull = pulls[i]
    const key = `${pull.encounterName}::${pull.duration}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push({ pull, sessionIndex: i })
      if (result.length >= 15) break
    }
  }
  return result
})
const isViewingHistory = computed(() => store.viewingPull !== null)

function onClickOutside(e: MouseEvent): void {
  if (!showHistory.value) return
  const target = e.target as HTMLElement
  if (!target.closest('.encounter-history-popup') && !target.closest('.encounter-trigger')) {
    close()
  }
}

function onEncounterListWheel(e: WheelEvent): void {
  if (popupMode.value !== 'horizontal') return
  if (scrollByWheel(e.currentTarget as HTMLElement, e)) {
    e.preventDefault()
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  window.addEventListener('resize', positionPopup)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
  window.removeEventListener('resize', positionPopup)
})
</script>

<template>
  <div class="encounter-history-wrapper">
    <span ref="triggerEl" class="encounter-trigger" @click.stop="toggle">
      <slot />
      <span class="chevron" :class="{ open: showHistory }">▼</span>
    </span>

    <Teleport to="body">
      <div
        v-if="showHistory"
        :class="['encounter-history-popup', `is-${popupMode}`]"
        :style="{ left: popupX + 'px', top: popupY + 'px', maxHeight: popupMaxHeight }"
      >
        <div class="popup-header">
          <span>Encounter History</span>
          <button v-if="isViewingHistory" class="back-btn" @click="backToLive">
            Back to Live
          </button>
        </div>

        <div class="encounter-list" @wheel="onEncounterListWheel">
          <div
            v-for="enc in encounters"
            :key="enc.pull.id"
            class="encounter-item"
            :class="{ active: store.viewingPull === enc.sessionIndex }"
            @click="selectPull(enc.sessionIndex)"
          >
            <span class="encounter-name">{{ enc.pull.encounterName }}</span>
            <span class="encounter-meta">
              <span class="duration">{{ enc.pull.duration }}</span>
              <span class="dps">{{ enc.pull.encounter?.ENCDPS ?? '0' }} DPS</span>
            </span>
          </div>

          <div v-if="encounters.length === 0" class="empty-state">
            No encounters yet
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.encounter-history-wrapper {
  position: relative;
}

.encounter-trigger {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.chevron {
  font-size: 8px;
  opacity: 0.5;
  transition: transform 0.15s;
}

.chevron.open {
  transform: rotate(180deg);
}

.encounter-history-popup {
  position: fixed;
  z-index: 10000;
  min-width: 280px;
  max-width: 400px;
  background: rgba(15, 15, 25, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  overflow: hidden;
}

.encounter-history-popup.is-horizontal {
  right: 4px;
  width: auto;
  min-width: 0;
  max-width: none;
  display: flex;
  align-items: stretch;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  font-weight: 600;
  color: #ccc;
}

.encounter-history-popup.is-horizontal .popup-header {
  min-width: 92px;
  padding: 6px 8px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 0;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 3px;
  font-size: 10px;
}

.back-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #aaa;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 10px;
  cursor: pointer;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.encounter-list {
  max-height: 300px;
  overflow-y: auto;
}

.encounter-history-popup.is-horizontal .encounter-list {
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  max-height: none;
  min-width: 0;
  overscroll-behavior-x: contain;
  scrollbar-gutter: stable;
}

.encounter-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.encounter-history-popup.is-horizontal .encounter-item {
  min-width: 180px;
  max-width: 220px;
  padding: 6px 10px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  border-left: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.encounter-history-popup.is-horizontal .encounter-item.active {
  border-left: 0;
  border-bottom: 2px solid #6496ff;
}

.encounter-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.encounter-item.active {
  background: rgba(100, 150, 255, 0.15);
  border-left: 2px solid #6496ff;
}

.encounter-name {
  font-size: 11px;
  color: #ddd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.encounter-history-popup.is-horizontal .encounter-name {
  max-width: 100%;
}

.encounter-meta {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: #888;
  flex-shrink: 0;
}

.duration {
  color: #aaa;
}

.dps {
  color: #6496ff;
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: #666;
  font-size: 11px;
}
</style>
