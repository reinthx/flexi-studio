<script setup lang="ts">
/**
 * FontSelector — dropdown of system fonts + curated Google Fonts + custom fonts.
 * Uses Font Access API (window.queryLocalFonts) with graceful fallback.
 * Font lists and loading are delegated to @shared/googleFonts.
 */
import { ref, onMounted, computed, watch } from 'vue'
import {
  getGoogleFontsList,
  getCustomFontsList,
  getUserCustomFontNames,
  loadGoogleFont,
  loadCustomFont,
} from '@shared/googleFonts'

const props = defineProps<{ modelValue: string }>()
const emit  = defineEmits<{ 'update:modelValue': [v: string] }>()

// Curated list of fonts reliably present on Windows (ACT is Windows-only)
const FALLBACK_FONTS = [
  'Segoe UI', 'Segoe UI Semibold', 'Segoe UI Light',
  'Arial', 'Arial Narrow', 'Arial Black',
  'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia', 'Corbel',
  'Comic Sans MS', 'Courier New',
  'Franklin Gothic Medium',
  'Georgia',
  'Impact',
  'Lucida Console', 'Lucida Sans Unicode',
  'Microsoft Sans Serif',
  'Palatino Linotype',
  'Tahoma', 'Times New Roman', 'Trebuchet MS',
  'Verdana',
]

const GOOGLE_FONTS = getGoogleFontsList().map(f => f.name)
// Build-time custom fonts (from /fonts dir)
const BUILT_IN_CUSTOM = getCustomFontsList().map(f => f.name)

const systemFonts = ref<string[]>([])
// User-configured runtime fonts — refreshed each time the dropdown opens
const userCustomFonts = ref<string[]>(getUserCustomFontNames())
const loaded = ref(false)
const searchQuery = ref('')
const isOpen = ref(false)

// Refresh user fonts from localStorage whenever dropdown opens
watch(isOpen, (open) => {
  if (open) userCustomFonts.value = getUserCustomFontNames()
})

onMounted(async () => {
  try {
    // Font Access API — available in ACT's Chromium webview
    if ('queryLocalFonts' in window) {
      const fonts = await (window as any).queryLocalFonts()
      const families = [...new Set<string>(fonts.map((f: any) => f.family as string))].sort()
      systemFonts.value = families
    } else {
      systemFonts.value = FALLBACK_FONTS
    }
  } catch {
    // Permission denied or API unavailable
    systemFonts.value = FALLBACK_FONTS
  }
  loaded.value = true
})

// All custom fonts = build-time + user-configured (deduped, sorted)
const allCustomFonts = computed(() => {
  const combined = new Set([...BUILT_IN_CUSTOM, ...userCustomFonts.value])
  return Array.from(combined).sort((a, b) => a.localeCompare(b))
})

const allFonts = computed(() => {
  const base = systemFonts.value.length ? systemFonts.value : FALLBACK_FONTS
  const q = searchQuery.value.toLowerCase()
  if (!q) return base
  return base.filter(f => f.toLowerCase().includes(q))
})

const googleFontsFiltered = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return GOOGLE_FONTS
  return GOOGLE_FONTS.filter(f => f.toLowerCase().includes(q))
})

const customFontsFiltered = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return allCustomFonts.value
  return allCustomFonts.value.filter(f => f.toLowerCase().includes(q))
})

const showGoogleSection = computed(() => googleFontsFiltered.value.length > 0)
const showCustomSection = computed(() => customFontsFiltered.value.length > 0)

function select(font: string): void {
  if (GOOGLE_FONTS.includes(font)) {
    loadGoogleFont(font)
  } else if (allCustomFonts.value.includes(font)) {
    loadCustomFont(font)
  }
  emit('update:modelValue', font)
  isOpen.value = false
  searchQuery.value = ''
}

function onBlur(e: FocusEvent): void {
  // Close if focus leaves the component entirely
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
    isOpen.value = false
  }
}
</script>

<template>
  <div class="font-selector" @focusout="onBlur" tabindex="-1">
    <!-- Trigger button -->
    <button type="button" class="trigger" @click="isOpen = !isOpen">
      <span class="preview-text" :style="{ fontFamily: modelValue }">{{ modelValue || 'Select font…' }}</span>
      <span class="chevron">{{ isOpen ? '▲' : '▼' }}</span>
    </button>

    <!-- Dropdown -->
    <div v-if="isOpen" class="dropdown">
      <input
        type="text"
        class="search"
        v-model="searchQuery"
        placeholder="Search fonts…"
        autofocus
        @keydown.escape="isOpen = false"
      />
      <div v-if="!loaded" class="loading">Loading fonts…</div>
      <div v-else class="list">
        <!-- Custom fonts section (build-time + user-configured) -->
        <div v-if="showCustomSection" class="section-header">Custom Fonts</div>
        <button
          v-for="font in customFontsFiltered"
          :key="font"
          type="button"
          class="font-item custom"
          :class="{ selected: font === modelValue }"
          :style="{ fontFamily: font }"
          @click="select(font)"
        >
          {{ font }}
        </button>
        <!-- Google Fonts section -->
        <div v-if="showGoogleSection" class="section-header">Web Fonts (Google)</div>
        <button
          v-for="font in googleFontsFiltered"
          :key="font"
          type="button"
          class="font-item google"
          :class="{ selected: font === modelValue }"
          :style="{ fontFamily: font }"
          @click="select(font)"
        >
          {{ font }}
        </button>
        <!-- System fonts section -->
        <div class="section-header">System Fonts</div>
        <button
          v-for="font in allFonts"
          :key="font"
          type="button"
          class="font-item"
          :class="{ selected: font === modelValue }"
          :style="{ fontFamily: font }"
          @click="select(font)"
        >
          {{ font }}
        </button>
        <div v-if="allFonts.length === 0" class="no-results">No fonts match</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-selector { position: relative; width: 100%; }
.trigger {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text); padding: 0 8px; cursor: pointer; font-size: 12px; text-align: left; height: var(--control-height);
}
.trigger:hover { border-color: var(--accent); }
.preview-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.chevron { font-size: 8px; color: var(--text-muted); margin-left: 6px; }
.dropdown {
  position: absolute; top: calc(100% + 2px); left: 0; right: 0; z-index: 1000;
  background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5); display: flex; flex-direction: column;
}
.search {
  margin: var(--control-gap-sm); padding: 0 8px;
  background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px;
  color: var(--text); font-size: 12px; outline: none; height: var(--control-height);
}
.search:focus { border-color: var(--accent); }
.list { overflow-y: auto; max-height: 220px; }
.section-header {
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-muted); padding: 8px 12px 4px; background: var(--bg-hover);
}
.font-item {
  display: block; width: 100%; text-align: left;
  background: none; border: none; color: var(--text);
  padding: 6px 12px; cursor: pointer; font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.font-item:hover   { background: var(--bg-hover); }
.font-item.selected { background: var(--accent); color: #fff; }
.font-item.google { border-left: 2px solid var(--accent); padding-left: 10px; }
.font-item.custom { border-left: 2px solid #e63946; padding-left: 10px; }
.loading, .no-results { padding: var(--control-gap-md); font-size: 11px; color: var(--text-muted); }
</style>
