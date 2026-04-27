<script setup lang="ts">
import { computed } from 'vue'
import type { HeaderConfig, GlobalConfig } from '@shared/configSchema'
import type { Frame } from '@shared'
import { renderTemplate } from '@shared/templateRenderer'
import HeaderBar from '@shared/HeaderBar.vue'

const props = defineProps<{
  config: HeaderConfig
  frame: Frame | null
  global?: GlobalConfig
  isFooter?: boolean
  onTogglePin?: () => void
}>()

const tokens = computed(() => ({
  zone:        props.frame?.encounterTitle ?? 'The Omega Protocol (Ultimate)',
  encounter:   props.frame?.encounterTitle ?? 'The Omega Protocol (Ultimate)',
  duration:    props.frame?.encounterDuration ?? '04:32',
  totalDPS:    props.frame?.totalDps ?? '184.2k',
  totalHPS:    props.frame?.totalHps ?? '42.1k',
  totalDTPS:   props.frame?.totalDtps ?? '0',
  totalRDPS:   props.frame?.totalRdps ?? '184.2k',
  pullNumber:  '1',
  pullCount:   '1',
}))

const text = computed(() => renderTemplate(props.config.template, tokens.value))

const isPinned = computed(() => {
  if (props.isFooter) return true
  return props.config.pinned ?? true
})
</script>

<template>
  <HeaderBar :config="config" :global="global" :is-footer="isFooter" :is-hidden="!isPinned">
    <span>{{ text }}</span>
    <template #actions>
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
