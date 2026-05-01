import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { deepClone, deepMerge } from '@shared/index'
import { DEFAULT_PROFILE } from '@shared/presets'
import { loadAllConfiguredFonts } from '@shared/googleFonts'
import { parseProfileSafe } from '@shared/profileValidator'
import type { Profile } from '@shared/configSchema'

const STORAGE_KEY = 'act-flexi-overlay-config'

export const useOverlayConfig = defineStore('overlayConfig', () => {
  const profile = ref<Profile>(deepClone(DEFAULT_PROFILE))
  const loaded = ref(false)

  async function load(): Promise<void> {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = parseProfileSafe(saved)
      if (parsed) {
        profile.value = deepMerge(deepClone(DEFAULT_PROFILE), parsed as Profile)
        loaded.value = true
      } else {
        console.warn('[overlayConfig] corrupt saved profile, using default')
      }
    }
    loadAllConfiguredFonts(profile.value)
  }

  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile.value))
    } catch { /* storage full or unavailable */ }
  }

  function applyConfig(incoming: Profile): void {
    profile.value = incoming
    loadAllConfiguredFonts(incoming)
    save()
  }

  // Debounced auto-save on profile changes
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(profile, () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 1000)
  }, { deep: true })

  return {
    profile,
    loaded,
    load,
    save,
    applyConfig,
  }
})
