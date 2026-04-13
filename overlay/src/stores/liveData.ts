/**
 * overlayLiveStore.ts
 *
 * Overlay-specific live data store that handles:
 *  - ACT OverlayPlugin event listeners
 *  - Pull history persistence
 *  - localStorage sync for GitHub Pages config updates
 *
 * Does NOT handle editor preview - that's in editor/src/stores/liveData.ts
 */
import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import {
  addListener,
  removeListener,
  startEvents,
  callHandler,
  resolvePets,
  TransitionEngine,
  DEFAULT_PROFILE,
  deepClone,
  deepMerge,
} from '@shared'
import type {
  CombatDataEvent,
  ChangePrimaryPlayerEvent,
  ChangeZoneEvent,
  PartyChangedEvent,
  BroadcastMessageEvent,
  Profile,
  PullRecord,
  Frame,
  BarFrame,
} from '@shared'
import { formatValue } from '@shared'
import { normalizeJob } from '@shared/jobMap'
import { useOverlayConfig } from './overlayConfig'

export const useLiveDataStore = defineStore('liveData', () => {
  // ─── State ───────────────────────────────────────────────────────────────────
  const overlayConfig = useOverlayConfig()
  const profile = ref<Profile>(deepClone(DEFAULT_PROFILE))
  const selfName = ref('')
  const zone = ref('')
  const partyNames = ref<Set<string>>(new Set())
  const frame = shallowRef<Frame | null>(null)
  const sessionPulls = ref<PullRecord[]>([])
  const viewingPull = ref<number | null>(null)  // null = live

  // Hold buffer
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let lastEncounterTitle = ''
  let lastEncounterStart = ''

  // Polling state for config sync (CEF compatibility)
  let pollCount = 0
  let lastPersistentConfig: string | null = null
  let pollInterval: ReturnType<typeof setInterval> | null = null

  // Transition engine
  const engine = new TransitionEngine((f) => { frame.value = f })

  // ─── Overlay opacity / visibility ────────────────────────────────────────────
  function applyOpacity(active: boolean): void {
    const g = profile.value.global
    if (active) {
      document.documentElement.style.opacity = String(g.opacity)
    } else {
      if (g.outOfCombat === 'hide') {
        document.documentElement.style.opacity = '0'
      } else if (g.outOfCombat === 'dim') {
        document.documentElement.style.opacity = String(g.outOfCombatOpacity)
      } else {
        document.documentElement.style.opacity = String(g.opacity)
      }
    }
  }

  // ─── CombatData handler ──────────────────────────────────────────────────────
  function onCombatData(event: CombatDataEvent): void {

    // If viewing a historical pull, don't update live display
    if (viewingPull.value !== null) return

    const isActive = event.isActive === 'true'

    if (isActive) {
      clearHoldTimer()
      applyOpacity(true)
      pushFrame(event)
      detectNewPull(event)
    } else {
      stashPull(event)
      // Keep the last frame visible — don't hide/dim after combat ends
    }
  }

  function pushFrame(event: CombatDataEvent): void {
    const g = profile.value.global

    const { combatants } = resolvePets(event.Combatant, {
      ...g.pets,
      show: !g.mergePets,
      mergeWithOwner: g.mergePets ?? true,
    })

    // Use combatantFilter if set, otherwise fall back to legacy partyOnly/selfOnly
    const filter = g.combatantFilter ?? (g.selfOnly ? 'self' : g.partyOnly ? 'party' : 'all')

    let filtered = combatants
    if (filter === 'self') {
      filtered = filtered.filter(c => c.name === selfName.value || c.name === 'YOU')
    } else if (filter === 'party' && partyNames.value.size > 0) {
      filtered = filtered.filter(c => partyNames.value.has(c.name) || c.name === 'YOU')
    }

    filtered = [...filtered]
      .sort((a, b) => parseFloat(b[g.sortBy] ?? '0') - parseFloat(a[g.sortBy] ?? '0'))
      .slice(0, g.maxCombatants)

    const maxVal = parseFloat(filtered[0]?.[g.dpsType] ?? '1') || 1

    // For DTPS, we need to calculate from damagetaken / DURATION (integer seconds from ACT)
    const encounterDuration = parseFloat(event.Encounter['DURATION'] ?? '0')
    const getDtpsValue = (c: Record<string, string>) => {
      if (g.dpsType !== 'dtps') return 0
      const dt = parseFloat(c['damagetaken'] ?? '0')
      const dur = parseFloat(c['DURATION'] ?? '0')
      return dur > 0 ? dt / dur : 0
    }

    const bars: BarFrame[] = filtered.map((c, i) => {
      let rawVal: number
      if (g.dpsType === 'dtps') {
        rawVal = getDtpsValue(c)
      } else {
        rawVal = parseFloat(c[g.dpsType] ?? '0')
      }
      return {
        name: c.name,
        job: normalizeJob(c['Job'] ?? ''),
        fillFraction: rawVal / maxVal,
        displayValue: formatValue(rawVal, g.valueFormat),
        displayPct: c['damage%'] ?? '0',
        deaths: c.deaths ?? '0',
        crithit: c['crithit%'] ?? '---',
        directhit: c['DirectHitPct'] ?? '---',
        tohit: c.tohit ?? '---',
        enchps: formatValue(parseFloat(c.enchps ?? '0'), g.valueFormat),
        maxHit: (c.maxhit ?? '---').replace('-', ' '),
        alpha: 1,
      }
    })

    const newFrame: Frame = {
      bars,
      encounterTitle: event.Encounter['title'] ?? '',
      encounterDuration: event.Encounter['duration'] ?? '',
      totalDps: formatValue(parseFloat(event.Encounter['ENCDPS'] ?? '0'), g.valueFormat),
      totalHps: formatValue(parseFloat(event.Encounter['ENCHPS'] ?? '0'), g.valueFormat),
      totalDtps: formatValue(parseFloat(event.Encounter['DTRPS'] ?? event.Encounter['damagetaken'] ?? '0') / (parseFloat(event.Encounter['DURATION'] ?? '0') || 1), g.valueFormat),
      isActive: event.isActive === 'true',
    }

    lastLiveFrame = { ...newFrame }

    engine.setDuration(g.transitionDuration)
    engine.push(newFrame)
  }

  // ─── Pull history ────────────────────────────────────────────────────────────
  function detectNewPull(event: CombatDataEvent): void {
    const title = event.Encounter['title'] ?? ''
    // Use DURATION (integer seconds) for numeric comparison — avoids lexicographic
    // failures on 10+ min fights where "10:00" < "09:59" as strings
    const duration = event.Encounter['DURATION'] ?? '0'

    if (title !== lastEncounterTitle || parseInt(duration) < parseInt(lastEncounterStart)) {
      lastEncounterTitle = title
      lastEncounterStart = duration
    }
  }

  function stashPull(event: CombatDataEvent): void {
    const title = event.Encounter['title'] ?? ''
    if (!title) return

    const { combatants } = resolvePets(event.Combatant, profile.value.global.pets)
    const record: PullRecord = {
      id: `${Date.now()}`,
      timestamp: Date.now(),
      encounterName: title,
      zone: zone.value,
      duration: event.Encounter['duration'] ?? '',
      combatants,
      encounter: event.Encounter as PullRecord['encounter'],
    }

    // Avoid duplicate stashes for same pull
    const last = sessionPulls.value[0]
    if (last?.encounterName === record.encounterName && last?.duration === record.duration) return

    sessionPulls.value = [record, ...sessionPulls.value]
    persistPulls()
  }

  async function persistPulls(): Promise<void> {
    await callHandler({
      call: 'saveData',
      key: 'act-flexi-pulls',
      data: JSON.stringify(sessionPulls.value),
    })
  }

  // ─── Other event handlers ────────────────────────────────────────────────────
  function onChangePrimaryPlayer(event: ChangePrimaryPlayerEvent): void {
    selfName.value = event.charName
  }

  function onChangeZone(event: ChangeZoneEvent): void {
    zone.value = event.zoneName ?? String(event.zoneID)
  }

  function onPartyChanged(event: PartyChangedEvent): void {
    partyNames.value = new Set(event.party.map(p => p.name))
  }

  function onBroadcastMessage(event: BroadcastMessageEvent): void {
    if (event.source !== 'act-flexi-editor') return
    applyConfig(event.msg as Profile)
  }

  // Listen for localStorage events from editor (GitHub Pages)
  function onStorageEvent(event: StorageEvent): void {
    if (event.key === 'act-flexi-github-sync' && event.newValue) {
      try {
        const message = JSON.parse(event.newValue)
        if (message.source === 'act-flexi-editor') {
          applyConfig(message.msg as Profile)
        }
      } catch (e) {
        /* corrupt sync message */
      }
    }
  }

  // Also poll for config changes (fallback for when storage event doesn't fire)
  // Storage events don't fire across same-origin tabs in some browsers/CEF configurations
  let lastConfigTimestamp = 0
  function pollForConfig(): void {
    const item = localStorage.getItem('act-flexi-github-sync')
    if (item) {
      try {
        const message = JSON.parse(item)
        if (message.source === 'act-flexi-editor' && message.timestamp !== lastConfigTimestamp) {
          lastConfigTimestamp = message.timestamp
          applyConfig(message.msg as Profile)
        }
      } catch (e) {
        /* corrupt sync message */
      }
    }
    // Also check for persistent config on first few polls (helps with slow CEF initialization)
    if (pollCount < 10) {
      const persistent = localStorage.getItem('act-flexi-profile') || localStorage.getItem('act-flexi-overlay-config')
      if (persistent && !lastPersistentConfig) {
        lastPersistentConfig = persistent
        try {
          applyConfig(JSON.parse(persistent))
        } catch (e) {
          console.warn('Failed to parse persistent config:', e)
        }
      }
      pollCount++
    }
  }

  function applyConfig(incoming: Profile): void {
    profile.value = incoming
    engine.setDuration(incoming.global.transitionDuration)
    // Persist to overlay's localStorage (persists across sessions)
    overlayConfig.applyConfig(incoming)
    // Also sync to editor's key for compatibility
    try {
      localStorage.setItem('act-flexi-profile', JSON.stringify(incoming))
    } catch { /* storage full or unavailable */ }
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  function start(): void {
    // Sync: pre-load localStorage config before first render to prevent flash of DEFAULT_PROFILE
    try {
      const raw = localStorage.getItem('act-flexi-overlay-config')
      if (raw) {
        const parsed = JSON.parse(raw)
        profile.value = deepMerge(deepClone(DEFAULT_PROFILE), parsed)
        engine.setDuration(profile.value.global.transitionDuration)
      }
    } catch { /* corrupt — DEFAULT_PROFILE stays */ }

    addListener('CombatData', onCombatData)
    addListener('ChangePrimaryPlayer', onChangePrimaryPlayer)
    addListener('ChangeZone', onChangeZone)
    addListener('PartyChanged', onPartyChanged)
    addListener('BroadcastMessage', onBroadcastMessage)

    // Listen for localStorage events from editor (GitHub Pages mode)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorageEvent)
      // Poll as fallback (storage events don't fire on same-origin in some browsers)
      pollInterval = setInterval(pollForConfig, 500)
    }

    startEvents()
    // Load profile - don't await, let it run
    loadProfile()
  }

  function stop(): void {
    removeListener('CombatData', onCombatData)
    removeListener('ChangePrimaryPlayer', onChangePrimaryPlayer)
    removeListener('ChangeZone', onChangeZone)
    removeListener('PartyChanged', onPartyChanged)
    removeListener('BroadcastMessage', onBroadcastMessage)

    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorageEvent)
    }

    if (pollInterval) { clearInterval(pollInterval); pollInterval = null }

    engine.stop()
    clearHoldTimer()
  }

  async function loadProfile(): Promise<void> {
    // Load overlay's localStorage config first (persists across sessions)
    await overlayConfig.load()

    let loadedFromOverlayPlugin = false

    // Try ACT OverlayPlugin first
    try {
      const result = await callHandler({ call: 'loadData', key: 'act-flexi-profile' }) as { data?: string }
      if (result?.data) {
        try {
          applyConfig(JSON.parse(result.data))
          loadedFromOverlayPlugin = true
        } catch { /* corrupt — fall through to localStorage */ }
      }
    } catch { /* OverlayPlugin not available */ }

    // Use overlay's localStorage config if no OverlayPlugin data
    if (!loadedFromOverlayPlugin && overlayConfig.loaded) {
      applyConfig(overlayConfig.profile)
    }

    try {
      const pullResult = await callHandler({ call: 'loadData', key: 'act-flexi-pulls' }) as { data?: string }
      if (pullResult?.data) {
        try { sessionPulls.value = JSON.parse(pullResult.data) } catch { /* corrupt */ }
      }
    } catch { /* OverlayPlugin not available */ }
  }

  function clearHoldTimer(): void {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
  }

  // ─── Pull history navigation ─────────────────────────────────────────────────
  let lastLiveFrame: Frame | null = null

  function viewPull(index: number | null): void {
    if (index === null) {
      // Back to live — restore the last live frame
      viewingPull.value = null
      if (lastLiveFrame) {
        engine.push(lastLiveFrame)
      }
      document.documentElement.style.opacity = String(profile.value.global.opacity)
      return
    }

    viewingPull.value = index

    // Save current live frame before switching to history
    if (frame.value && frame.value.isActive) {
      lastLiveFrame = { ...frame.value }
    }

    // Force full opacity when viewing history — no out-of-combat dimming
    document.documentElement.style.opacity = String(profile.value.global.opacity)

    const pull = sessionPulls.value[index]
    if (!pull) return
    
    const getDtpsValue = (c: Record<string, string>) => {
      const dt = parseFloat(c['damagetaken'] ?? '0')
      const dur = parseFloat(c['DURATION'] ?? '0')
      return dur > 0 ? dt / dur : 0
    }
    const maxVal = profile.value.global.dpsType === 'dtps'
      ? Math.max(...pull.combatants.map(c => getDtpsValue(c)))
      : Math.max(...pull.combatants.map(c => parseFloat(c[profile.value.global.dpsType] ?? '0')))
    
    const bars: BarFrame[] = pull.combatants.map((c, i) => {
      const rawVal = profile.value.global.dpsType === 'dtps'
        ? getDtpsValue(c)
        : parseFloat(c[profile.value.global.dpsType] ?? '0')
      return {
        name: c.name,
        job: normalizeJob(c['Job'] ?? ''),
        fillFraction: rawVal / (maxVal || 1),
        displayValue: formatValue(rawVal, profile.value.global.valueFormat),
        displayPct: c['damage%'] ?? '0',
        deaths: c.deaths ?? '0',
        crithit: c['crithit%'] ?? '---',
        directhit: c['DirectHitPct'] ?? '---',
        tohit: c.tohit ?? '---',
        enchps: formatValue(parseFloat(c.enchps ?? '0'), profile.value.global.valueFormat),
        maxHit: (c.maxhit ?? '---').replace('-', ' '),
        alpha: 1,
      }
    })

    engine.push({
      bars,
      encounterTitle: pull.encounterName,
      encounterDuration: pull.duration,
      totalDps: pull.encounter['ENCDPS'] ?? '',
      totalHps: pull.encounter['ENCHPS'] ?? '',
      totalDtps: formatValue(parseFloat(pull.encounter['damagetaken'] ?? '0') / (parseFloat(pull.encounter['DURATION'] ?? '0') || 1), profile.value.global.valueFormat),
      isActive: true,
    })
  }

  // ─── Store exports ───────────────────────────────────────────────────────────

  // Track last 15 unique encounters (by title+duration combo)
  const recentEncounters = computed(() => {
    const seen = new Set<string>()
    const encounters: PullRecord[] = []
    for (const pull of sessionPulls.value) {
      const key = `${pull.encounterName}::${pull.duration}`
      if (!seen.has(key)) {
        seen.add(key)
        encounters.push(pull)
        if (encounters.length >= 15) break
      }
    }
    return encounters
  })

  return {
    profile,
    selfName,
    zone,
    frame,
    sessionPulls,
    viewingPull,
    recentEncounters,
    start,
    stop,
    viewPull,
    applyConfig,
    setCombatantFilter: (filter: 'all' | 'party' | 'self') => {
      profile.value.global.combatantFilter = filter
      profile.value.global.partyOnly = filter === 'party'
      profile.value.global.selfOnly = filter === 'self'
    },
    toggleBlurNames: () => { profile.value.global.blurNames = !profile.value.global.blurNames },
    setHeaderPinned: (pinned: boolean) => { profile.value.global.header.pinned = pinned },
    setMergePets: (merge: boolean) => { profile.value.global.mergePets = merge },
    setActiveTab: (tabId: string) => { 
      const tab = profile.value.global.tabs.find(t => t.id === tabId)
      if (tab && tab.enabled) {
        profile.value.global.activeTab = tabId
        profile.value.global.dpsType = tab.dpsType
        // Rebuild current frame with new dpsType
        if (frame.value) {
          const g = profile.value.global
          const getDtpsValue = (c: Record<string, string>) => {
            const dt = parseFloat(c['damagetaken'] ?? '0')
            const dur = parseFloat(c['DURATION'] ?? '0')
            return dur > 0 ? dt / dur : 0
          }
          const maxVal = g.dpsType === 'dtps'
            ? Math.max(...frame.value!.bars.map((_, i) => {
                const c = sessionPulls.value[viewingPull.value ?? -1]?.combatants[i]
                return c ? getDtpsValue(c) : 0
              }))
            : Math.max(...frame.value!.bars.map((_, i) => {
                const c = sessionPulls.value[viewingPull.value ?? -1]?.combatants[i]
                return c ? parseFloat(c[g.dpsType] ?? '0') : 0
              }))
          
          const pull = viewingPull.value !== null ? sessionPulls.value[viewingPull.value] : null
          const combatants = pull?.combatants ?? []
          
          const bars: BarFrame[] = frame.value!.bars.map((_, i) => {
            const c = combatants[i]
            const rawVal = c ? (g.dpsType === 'dtps' ? getDtpsValue(c) : parseFloat(c[g.dpsType] ?? '0')) : 0
            return {
              ...frame.value!.bars[i],
              fillFraction: rawVal / (maxVal || 1),
              displayValue: formatValue(rawVal, g.valueFormat),
            }
          })
          
          frame.value = { ...frame.value!, bars }
        }
      }
    },
  }
})
