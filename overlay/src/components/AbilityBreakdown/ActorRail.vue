<script setup lang="ts">
import type { CombatantGroup, NameStyleFn } from './types'

withDefaults(defineProps<{
  title?: string
  groups: CombatantGroup[]
  collapsedGroups: Set<string>
  selectedName: string
  fillClass?: string
  valueFor: (name: string) => string
  fillWidthFor: (name: string) => string
  actorJob: (name: string) => string
  actorJobIcon: (name: string) => string
  nameStyle: NameStyleFn
  tabLabel?: (name: string) => string
}>(), {
  title: 'Actors',
  fillClass: '',
  tabLabel: (name: string) => name,
})

defineEmits<{
  toggleGroup: [label: string]
  selectActor: [name: string]
}>()
</script>

<template>
  <aside class="bp-rail">
    <div class="bp-rail-title">{{ title }}</div>
    <slot name="before-groups" />
    <template v-for="group in groups" :key="group.label">
      <div class="bp-group-header" @click="$emit('toggleGroup', group.label)">
        <span class="bp-group-toggle">{{ collapsedGroups.has(group.label) ? '▶' : '▼' }}</span>
        <span class="bp-group-label">{{ group.label }}</span>
      </div>
      <template v-if="!collapsedGroups.has(group.label)">
        <button v-for="name in group.names" :key="name" class="bp-rail-item" :class="{ active: selectedName === name }" @click="$emit('selectActor', name)">
          <div class="bp-rail-fill" :class="fillClass" :style="{ width: fillWidthFor(name) }" />
          <img v-if="actorJobIcon(name)" class="bp-job-icon" :src="actorJobIcon(name)" :alt="actorJob(name)" />
          <span class="bp-rail-name" :style="nameStyle(name)">{{ tabLabel(name) }}</span>
          <span class="bp-rail-meta">{{ valueFor(name) }}</span>
        </button>
      </template>
    </template>
  </aside>
</template>

<style scoped>
.bp-rail {
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255,255,255,0.02);
  border-right: 1px solid rgba(255,255,255,0.07);
}
.bp-rail-title {
  padding: 10px 12px 8px;
  color: rgba(255,255,255,0.35);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.bp-group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}
.bp-group-header:hover {
  background: rgba(255,255,255,0.12);
}
.bp-group-toggle {
  font-size: 8px;
  color: rgba(255,255,255,0.4);
}
.bp-group-label {
  font-weight: 600;
}
.bp-rail-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.bp-rail-item:hover { background: rgba(255,255,255,0.04); }
.bp-rail-item.active { background: rgba(255,210,80,0.08); }
.bp-rail-fill {
  position: absolute;
  inset: 0;
  right: auto;
  min-width: 2px;
  background: rgba(116,185,255,0.12);
  pointer-events: none;
}
.bp-rail-fill--taken { background: rgba(220,70,70,0.14); }
.bp-rail-fill--timeline { background: rgba(255,210,80,0.12); }
.bp-rail-fill--casts { background: rgba(162,155,254,0.14); }
.bp-rail-fill--events { background: rgba(0,230,118,0.12); }
.bp-rail-name,
.bp-rail-meta,
.bp-job-icon {
  position: relative;
  z-index: 1;
}
.bp-job-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.65));
}
.bp-rail-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255,255,255,0.82);
}
.bp-rail-meta {
  font-size: 10px;
  color: rgba(255,255,255,0.42);
  white-space: nowrap;
}
</style>
