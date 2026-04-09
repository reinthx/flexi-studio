<script setup lang="ts">
import type { HeaderConfig, GlobalConfig } from './configSchema'
import { useHeaderStyles } from './useHeaderStyles'

const props = defineProps<{
  config: HeaderConfig
  global?: GlobalConfig
  isFooter?: boolean
  isHidden?: boolean
}>()

const { style: headerStyle } = useHeaderStyles(
  () => props.config,
  () => props.global,
  () => props.isFooter ?? false,
)
</script>

<template>
  <div class="meter-header" :class="{ 'is-hidden': isHidden }" :style="{ ...headerStyle, overflow: 'hidden' }">
    <div class="header-encounter">
      <slot />
    </div>
    <div class="header-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.header-encounter {
  flex: 1;
  min-width: 0;
  overflow: visible;
  position: relative;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.meter-header.is-hidden {
  opacity: 0;
  transition: opacity 0.2s ease;
}
.meter-header.is-hidden:hover {
  opacity: 1;
}

/* ── Shared action button styles (applied via :slotted) ── */
:slotted(.pill-btn) {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: inherit;
  border-radius: 3px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
  transition: border-color 0.2s, background 0.2s;
  flex-shrink: 0;
}
:slotted(.pill-btn:hover) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.6);
}
:slotted(.pill-btn.active) {
  background: rgba(255, 215, 0, 0.3);
  border-color: #ffd700;
  color: #ffd700;
}
:slotted(.settings-btn) {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: inherit;
  border-radius: 3px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 14px;
  transition: border-color 0.2s, background 0.2s;
  flex-shrink: 0;
}
:slotted(.settings-btn:hover) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.6);
}
:slotted(.filter-btn.filter-all) {
  border-color: rgba(255, 255, 255, 0.4);
}
:slotted(.filter-btn.filter-party) {
  background: rgba(100, 200, 255, 0.2);
  border-color: #64c8ff;
  color: #64c8ff;
}
:slotted(.filter-btn.filter-self) {
  background: rgba(255, 215, 0, 0.3);
  border-color: #ffd700;
  color: #ffd700;
}
:slotted(.merge-btn.active) {
  border-color: #ffd700;
  color: #ffd700;
}
:slotted(.pin-btn.active) {
  background: transparent;
  border-color: #ffd700;
  color: #ffd700;
}
:slotted(.pin-btn.active:hover) {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffd700;
}
:slotted(.pin-btn .rotated) {
  display: inline-block;
  transform: rotate(-45deg);
}
:slotted(.pin-btn .rotated:hover) {
  transform: rotate(-45deg);
}
</style>
