<script setup lang="ts">
import { computed } from 'vue'
import type { HeaderConfig, GlobalConfig, CombatantFilter } from '@shared/configSchema'
import { renderTemplate } from '@shared/templateRenderer'
import EncounterHistory from './EncounterHistory.vue'
import HeaderBar from '@shared/HeaderBar.vue'

const props = defineProps<{
  config: HeaderConfig
  encounterTitle: string
  encounterDuration: string
  totalDPS: string
  totalHPS: string
  totalDTPS?: string
  totalRDPS?: string
  pullNumber: number
  pullCount: number
  global: GlobalConfig
  showSettings?: boolean
  onSettings?: () => void
  onBreakdown?: () => void
  onSetCombatantFilter?: (filter: CombatantFilter) => void
  onToggleBlurNames?: () => void
  onTogglePin?: () => void
  onToggleMergePets?: () => void
  isFooter?: boolean
}>()

const tokens = computed(() => ({
  zone:       props.encounterTitle,
  encounter:  props.encounterTitle,
  duration:   props.encounterDuration,
  totalDPS:   props.totalDPS,
  totalHPS:   props.totalHPS,
  totalDTPS:  props.totalDTPS ?? '',
  totalRDPS:  props.totalRDPS ?? '',
  pullNumber: String(props.pullNumber),
  pullCount:  String(props.pullCount),
}))

const text = computed(() => renderTemplate(props.config.template, tokens.value))

const currentFilter = computed((): CombatantFilter => {
  return props.global?.combatantFilter ?? (props.global?.selfOnly ? 'self' : props.global?.partyOnly ? 'alliance' : 'all')
})

const filterLabel = computed(() => {
  switch (currentFilter.value) {
    case 'self': return 'SELF'
    case 'alliance': return 'ALLIANCE'
    case 'party': return 'PARTY'
    default: return 'ALL'
  }
})

function cycleFilter() {
  if (!props.onSetCombatantFilter) return
  const next = currentFilter.value === 'all' ? 'alliance' : currentFilter.value === 'alliance' ? 'party' : currentFilter.value === 'party' ? 'self' : 'all'
  props.onSetCombatantFilter(next)
}

const isPinned = computed(() => {
  if (props.isFooter) return true
  return props.config.pinned ?? true
})

const isMergePets = computed(() => props.global?.mergePets ?? true)
</script>

<template>
  <HeaderBar :config="config" :global="global" :is-footer="isFooter" :is-hidden="!isPinned">
    <EncounterHistory>
      <span>{{ text }}</span>
    </EncounterHistory>
    <template #actions>
      <button
        class="pill-btn merge-btn"
        :class="{ active: isMergePets }"
        @click="onToggleMergePets"
        :title="isMergePets ? 'Merge Pets' : 'Unmerge Pets'"
      >
        <span :style="isMergePets ? {} : { textDecoration: 'line-through' }">Merge</span>
      </button>
      <button
        class="pill-btn filter-btn"
        :class="{ 'filter-all': currentFilter === 'all', 'filter-alliance': currentFilter === 'alliance', 'filter-party': currentFilter === 'party', 'filter-self': currentFilter === 'self' }"
        @click="cycleFilter"
        title="Cycle: All → Alliance → Party → Self"
      >
        {{ filterLabel }}
      </button>
      <button
        class="pill-btn"
        :class="{ active: global?.blurNames }"
        @click="onToggleBlurNames"
        title="Blur all names but self"
      >
        🔒
      </button>
      <button
        v-if="showSettings && onSettings"
        class="pill-btn"
        @click="onSettings"
        title="Open Editor"
      >
        Editor
      </button>
      <button
        v-if="showSettings && onBreakdown"
        class="pill-btn"
        @click="onBreakdown"
        title="Open Pull Dashboard"
      >
        Pulls
      </button>
      <button
        class="pill-btn pin-btn"
        :class="{ active: isPinned }"
        @click="onTogglePin"
        title="Pin Header"
      >
        <span :class="{ rotated: isPinned }">📌</span>
      </button>
    </template>
  </HeaderBar>
</template>
