import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { callHandler } from '@shared/overlayBridge'
import { deepClone, deepMerge } from '@shared/index'
import { DEFAULT_PROFILE } from '@shared/presets'
import { loadFontBatch } from '@shared/googleFonts'
import { parseProfileSafe } from '@shared/profileValidator'
import type { Profile, BarStyle, GlobalConfig, StyleOverrides } from '@shared/configSchema'

export const useConfigStore = defineStore('config', () => {
  const profile = ref<Profile>(deepClone(DEFAULT_PROFILE))
  const dirty = ref(false)
  let suppressNextDirty = false

  // ── Persistence ────────────────────────────────────────────────────────────
  async function load(): Promise<boolean> {
    // Try OverlayPlugin first, fall back to localStorage for dev
    try {
      const res = await callHandler({ call: 'loadData', key: 'act-flexi-profile' }) as { data?: string }
      if (res?.data) {
        const parsed = parseProfileSafe(res.data)
        if (parsed) {
          suppressNextDirty = true
          profile.value = deepMerge(deepClone(DEFAULT_PROFILE), parsed as Profile)
          loadFontBatch(profile.value)
          dirty.value = false
          return true
        }
        console.warn('[config] OverlayPlugin returned malformed profile, trying localStorage')
      }
    } catch { /* OverlayPlugin not available */ }

    // Fallback: localStorage
    const saved = localStorage.getItem('act-flexi-profile')
    if (saved) {
      const parsed = parseProfileSafe(saved)
      if (parsed) {
        suppressNextDirty = true
        profile.value = deepMerge(deepClone(DEFAULT_PROFILE), parsed as Profile)
        loadFontBatch(profile.value)
        dirty.value = false
        return true
      }
      console.warn('[config] corrupt localStorage profile, using default')
    }
    return false
  }

  async function save(): Promise<void> {
    const data = JSON.stringify(profile.value)
    // Try OverlayPlugin first, fall back to localStorage for dev
    try {
      await callHandler({ call: 'saveData', key: 'act-flexi-profile', data })
    } catch { /* OverlayPlugin not available */ }
    localStorage.setItem('act-flexi-profile', data)
    dirty.value = false
  }

  // Broadcast current config to the live overlay whenever it changes
  watch(profile, () => {
    if (suppressNextDirty) {
      suppressNextDirty = false
      dirty.value = false
      return
    }
    dirty.value = true
  }, { deep: true })

  // ── Apply a full profile (used by presets store) ───────────────────────────
  function applyProfile(p: Profile): void {
    profile.value = deepClone(p)
    loadFontBatch(profile.value)
  }

  // ── Mutators — default bar style ───────────────────────────────────────────
  function patchDefault(patch: Partial<BarStyle>): void {
    let current = JSON.parse(JSON.stringify(profile.value.default)) as Record<string, any>
    for (const [key, srcVal] of Object.entries(patch)) {
      if (srcVal !== null && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
        current[key] = { ...current[key], ...srcVal }
      } else if (srcVal !== undefined) {
        current[key] = srcVal
      }
    }
    profile.value.default = current as BarStyle
  }

  function setDefaultFill(fill: BarStyle['fill']): void {
    profile.value.default.fill = fill
  }

  function setDefaultBg(bg: BarStyle['bg']): void {
    profile.value.default.bg = bg
  }

  // ── Mutators — global config ───────────────────────────────────────────────
  function patchGlobal(patch: Partial<GlobalConfig>): void {
    Object.assign(profile.value.global, patch)
  }

  // ── Mutators — overrides ───────────────────────────────────────────────────
  function patchOverrides(patch: Partial<StyleOverrides>): void {
    const current = profile.value.overrides
    if (patch.byJobEnabled) {
      current.byJobEnabled = { ...current.byJobEnabled, ...patch.byJobEnabled }
    }
    if (patch.byRoleEnabled) {
      current.byRoleEnabled = { ...current.byRoleEnabled, ...patch.byRoleEnabled }
    }
    if (patch.byJob) {
      current.byJob = { ...current.byJob, ...patch.byJob }
    }
    if (patch.byRole) {
      current.byRole = { ...current.byRole, ...patch.byRole }
    }
    if (patch.self !== undefined) {
      current.self = patch.self
    }
    if (patch.selfEnabled !== undefined) {
      current.selfEnabled = patch.selfEnabled
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function reset(): void {
    profile.value = deepClone(DEFAULT_PROFILE)
    loadFontBatch(profile.value)
  }

  return {
    profile,
    dirty,
    load,
    save,
    reset,
    applyProfile,
    patchDefault,
    setDefaultFill,
    setDefaultBg,
    patchGlobal,
    patchOverrides,
  }
})
