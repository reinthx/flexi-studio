import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { deepClone } from '@shared/index'
import { decodeShareString, encodeShareString, isShareString } from '@shared/profileCodec'
import type { Profile } from '@shared/configSchema'
import { useConfigStore } from './config'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CustomPreset {
  name: string
  profile: Profile
  category: string // '' = Uncategorized
}

export interface BuiltInPreset {
  name: string
  profile: Profile
  filename: string
}

export interface PresetCategory {
  name: string
  collapsed: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PRESETS_KEY = 'act-flexi-custom-presets'
const CATEGORIES_KEY = 'act-flexi-preset-categories'
const COLLAPSE_KEY = 'act-flexi-category-collapse'

// ── Store ──────────────────────────────────────────────────────────────────────

export const usePresetsStore = defineStore('presets', () => {
  const builtInPresets = ref<BuiltInPreset[]>([])
  const builtInLoading = ref(true)
  const builtInCollapsed = ref(false)
  const customPresets = ref<CustomPreset[]>([])
  const categories = ref<PresetCategory[]>([])
  const activePresetKey = ref('')  // 'builtin:name' or 'custom:name'

  const isDevMode = computed(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev'),
  )

  // ── Initialization ─────────────────────────────────────────────────────────

  async function init() {
    loadCustomPresets()
    loadCategories()
    loadCollapseState()
    await loadBuiltInPresets()
  }

  async function loadBuiltInPresets() {
    builtInLoading.value = true
    try {
      const modules = import.meta.glob('../../../presets/*.flexi', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
      const results = await Promise.all(
        Object.entries(modules).map(async ([path, raw]) => {
          const filename = path.split('/').pop()!.replace('.flexi', '')
          try {
            const decoded = await decodeShareString(raw)
            if (decoded && decoded.length > 0) {
              return { name: decoded[0].name || filename, profile: decoded[0].profile, filename }
            }
          } catch { /* skip corrupted files */ }
          return null
        }),
      )
      builtInPresets.value = results.filter((r): r is BuiltInPreset => r !== null)
    } finally {
      builtInLoading.value = false
    }
  }

  // ── Custom presets persistence ──────────────────────────────────────────────

  function loadCustomPresets() {
    const saved = localStorage.getItem(PRESETS_KEY)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved)
      customPresets.value = parsed.map((p: any) => ({
        ...p,
        category: p.category ?? '',
      }))
    } catch { customPresets.value = [] }
  }

  function saveCustomPresets() {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(customPresets.value))
  }

  // ── Category persistence ───────────────────────────────────────────────────

  function loadCategories() {
    const saved = localStorage.getItem(CATEGORIES_KEY)
    if (!saved) return
    try { categories.value = JSON.parse(saved) } catch { categories.value = [] }
  }

  function saveCategories() {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories.value))
  }

  function loadCollapseState() {
    const saved = localStorage.getItem(COLLAPSE_KEY)
    if (!saved) return
    try {
      const state = JSON.parse(saved) as Record<string, boolean>
      builtInCollapsed.value = state.__builtin ?? false
      for (const cat of categories.value) {
        if (state[cat.name] !== undefined) cat.collapsed = state[cat.name]
      }
    } catch { /* ignore */ }
  }

  function saveCollapseState() {
    const state: Record<string, boolean> = { __builtin: builtInCollapsed.value }
    for (const cat of categories.value) state[cat.name] = cat.collapsed
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state))
  }

  // ── Apply ──────────────────────────────────────────────────────────────────

  function applyBuiltIn(index: number) {
    const preset = builtInPresets.value[index]
    if (!preset) return
    const config = useConfigStore()
    config.applyProfile(preset.profile)
    config.profile.name = preset.name
    activePresetKey.value = `builtin:${preset.name}`
  }

  function applyCustom(index: number) {
    const preset = customPresets.value[index]
    if (!preset) return
    const config = useConfigStore()
    config.applyProfile(preset.profile)
    config.profile.name = preset.name
    activePresetKey.value = `custom:${preset.name}`
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  function addCustomPreset(name: string, category = '') {
    const config = useConfigStore()
    customPresets.value.push({ name, profile: deepClone(config.profile), category })
    saveCustomPresets()
  }

  function updateCustomPreset(index: number) {
    const preset = customPresets.value[index]
    if (!preset) return
    const config = useConfigStore()
    preset.profile = deepClone(config.profile)
    saveCustomPresets()
  }

  function removeCustomPreset(index: number) {
    customPresets.value.splice(index, 1)
    saveCustomPresets()
  }

  function renameCustomPreset(index: number, newName: string) {
    const preset = customPresets.value[index]
    if (preset) { preset.name = newName; saveCustomPresets() }
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  function addCategory(name: string) {
    if (categories.value.some(c => c.name === name)) return
    categories.value.push({ name, collapsed: false })
    saveCategories()
  }

  function renameCategory(oldName: string, newName: string) {
    if (!newName.trim() || categories.value.some(c => c.name === newName)) return
    const cat = categories.value.find(c => c.name === oldName)
    if (cat) {
      cat.name = newName
      for (const p of customPresets.value) {
        if (p.category === oldName) p.category = newName
      }
      saveCategories()
      saveCustomPresets()
    }
  }

  function deleteCategory(name: string) {
    const idx = categories.value.findIndex(c => c.name === name)
    if (idx === -1) return
    categories.value.splice(idx, 1)
    for (const p of customPresets.value) {
      if (p.category === name) p.category = ''
    }
    saveCategories()
    saveCustomPresets()
    saveCollapseState()
  }

  function toggleCategoryCollapse(name: string) {
    if (name === '__builtin') {
      builtInCollapsed.value = !builtInCollapsed.value
    } else {
      const cat = categories.value.find(c => c.name === name)
      if (cat) cat.collapsed = !cat.collapsed
    }
    saveCollapseState()
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────

  function movePresetToCategory(presetIndex: number, targetCategory: string) {
    const preset = customPresets.value[presetIndex]
    if (preset) {
      preset.category = targetCategory
      saveCustomPresets()
    }
  }

  // ── Helpers for grouped view ───────────────────────────────────────────────

  function presetsInCategory(categoryName: string): { preset: CustomPreset; globalIndex: number }[] {
    return customPresets.value
      .map((preset, globalIndex) => ({ preset, globalIndex }))
      .filter(({ preset }) => preset.category === categoryName)
  }

  const uncategorizedPresets = computed(() => presetsInCategory(''))

  // ── Import / Export ────────────────────────────────────────────────────────

  async function exportPreset(index: number): Promise<string> {
    const p = customPresets.value[index]
    if (!p) return ''
    return encodeShareString([{ name: p.name, profile: p.profile }])
  }

  async function exportAll(): Promise<string> {
    const list = customPresets.value.map(p => ({ name: p.name, profile: p.profile }))
    return list.length ? encodeShareString(list) : ''
  }

  async function importFromString(input: string): Promise<{ imported: CustomPreset[]; conflicts: string[] }> {
    let parsed: Array<{ name: string; profile: any }>
    if (isShareString(input)) {
      const decoded = await decodeShareString(input)
      if (!decoded) return { imported: [], conflicts: [] }
      parsed = decoded
    } else {
      try { parsed = JSON.parse(input) } catch { return { imported: [], conflicts: [] } }
    }
    if (!Array.isArray(parsed)) return { imported: [], conflicts: [] }

    const conflicts = parsed.filter(p => customPresets.value.some(cp => cp.name === p.name)).map(p => p.name)
    const imported = parsed.map(p => ({ name: p.name, profile: p.profile, category: '' }))
    return { imported, conflicts }
  }

  function addImportedPresets(presets: CustomPreset[]) {
    customPresets.value.push(...presets)
    saveCustomPresets()
  }

  function handleConflictOverwrite(pending: CustomPreset[]) {
    for (const p of pending) {
      const idx = customPresets.value.findIndex(cp => cp.name === p.name)
      if (idx !== -1) customPresets.value[idx] = p
    }
    saveCustomPresets()
  }

  function handleConflictCopy(pending: CustomPreset[]) {
    for (const p of pending) {
      let newName = p.name
      let counter = 2
      while (customPresets.value.some(cp => cp.name === newName)) {
        newName = `${p.name}${counter}`
        counter++
      }
      customPresets.value.push({ ...p, name: newName })
    }
    saveCustomPresets()
  }

  // ── Badge ──────────────────────────────────────────────────────────────────

  const badge = computed(() => {
    const config = useConfigStore()
    const saved = config.profile.name
    if (saved && saved !== 'Default') return saved
    const n = customPresets.value.length
    return n > 0 ? `${n} saved` : 'None'
  })

  return {
    // State
    builtInPresets, builtInLoading, builtInCollapsed,
    customPresets, categories,
    activePresetKey, isDevMode,
    // Init
    init,
    // Apply
    applyBuiltIn, applyCustom,
    // CRUD
    addCustomPreset, updateCustomPreset, removeCustomPreset, renameCustomPreset,
    // Categories
    addCategory, renameCategory, deleteCategory, toggleCategoryCollapse,
    // Drag
    movePresetToCategory,
    // Grouped view
    presetsInCategory, uncategorizedPresets,
    // Import/export
    exportPreset, exportAll, importFromString,
    addImportedPresets, handleConflictOverwrite, handleConflictCopy,
    // Badge
    badge,
    // Persistence (exposed for edge cases)
    saveCustomPresets,
  }
})
