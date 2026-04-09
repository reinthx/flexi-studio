<script setup lang="ts">
import { useConfigStore } from '../stores/config'

const props = defineProps<{
  panels: Record<string, { visible: boolean; label: string }>
}>()

const config = useConfigStore()

function applyLive() {
  // Use localStorage to broadcast config to overlay (works across tabs/windows)
  const message = { source: 'act-flexi-editor', msg: config.profile, timestamp: Date.now() }
  localStorage.setItem('act-flexi-github-sync', JSON.stringify(message))
  // Keep the item around for 2 seconds so polling can pick it up
  setTimeout(() => {
    localStorage.removeItem('act-flexi-github-sync')
  }, 2000)
  // Also persist so overlay picks it up on next load
  config.save()
}

function openOverlay() {
  const currentUrl = new URL(window.location.href)
  currentUrl.hash = '/overlay'
  window.open(currentUrl.toString(), 'act-flexi-overlay')
}

function goToEditor() {
  window.location.hash = '/editor'
}

function toggleOverrides() {
  props.panels.overrides.visible = !props.panels.overrides.visible
}
</script>

<template>
  <div class="menu-bar">
    <span class="logo">act-flexi</span>
    <nav class="menu-items">
      <button class="menu-btn">File</button>
      <button class="menu-btn" @click="toggleOverrides">Overrides</button>
      <button class="menu-btn">Presets</button>
      <button class="menu-btn">Export</button>
      <button class="menu-btn" @click="openOverlay">Open Overlay</button>
      <button class="menu-btn" @click="goToEditor">Editor</button>
    </nav>
    <button class="apply-btn" @click="applyLive">Apply to Live Overlay</button>
  </div>
</template>

<style scoped>
.menu-bar {
  height: 32px;
  background: #0d0d1a;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
}
.logo {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin-right: 8px;
}
.menu-items { display: flex; gap: 2px; flex: 1; }
.menu-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
}
.menu-btn:hover { background: var(--bg-hover); color: var(--text); }
.apply-btn {
  background: var(--accent);
  border: none;
  color: #fff;
  font: inherit;
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 3px;
  cursor: pointer;
}
.apply-btn:hover { opacity: 0.85; }
</style>
