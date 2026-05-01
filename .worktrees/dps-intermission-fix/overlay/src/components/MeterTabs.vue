<script setup lang="ts">
import { computed } from 'vue'
import type { TabConfig, GlobalConfig } from '@shared/configSchema'

const props = defineProps<{
  tabs: TabConfig[]
  activeTab: string
  global: GlobalConfig
  isFooter?: boolean
}>()

const emit = defineEmits<{
  setTab: [tabId: string]
}>()

const enabledTabs = computed(() => (props.tabs ?? []).filter(t => t && t.enabled))

const isPinned = computed(() => props.global.tabsPinned ?? true)
const showHover = computed(() => !isPinned.value)
</script>

<template>
  <div 
    class="meter-tabs" 
    :class="{ 'is-footer': isFooter, 'is-hidden': showHover }"
    v-if="enabledTabs.length > 0"
  >
    <button
      v-for="tab in enabledTabs"
      :key="tab.id"
      class="tab-btn"
      :class="{ active: activeTab === tab.id }"
      @click="emit('setTab', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.meter-tabs {
  display: flex;
  gap: 2px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.meter-tabs.is-footer {
  border-bottom: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.meter-tabs.is-hidden {
  opacity: 0;
  transition: opacity 0.2s ease;
}
.meter-tabs.is-hidden:hover {
  opacity: 1;
}
.tab-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.6);
  padding: 4px 12px;
  font-size: 11px;
  font-family: 'Segoe UI', sans-serif;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.2s ease;
}
.tab-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}
.tab-btn.active {
  background: rgba(255, 215, 0, 0.2);
  border-color: rgba(255, 215, 0, 0.5);
  color: #ffd700;
}
</style>