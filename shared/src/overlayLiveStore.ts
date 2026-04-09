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
import { ref, shallowRef } from 'vue'
import {
  addListener,
  removeListener,
  startEvents,
  callHandler,
  resolvePets,
  TransitionEngine,
  DEFAULT_PROFILE,
  deepClone,
} from './index'
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
} from './configSchema'
import { formatValue } from './formatValue'
import { resolveBarStyle } from './styleResolver'
import { normalizeJob } from './jobMap'

export const useLiveDataStore = defineStore('liveData', () => {
  // ── State ───────────────────────────────────────────────────────────────────
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

  // Transition engine
  const engine = new TransitionEngine((f) => { frame.value = f })

  // ── Overlay opacity / visibility ────────────────────────────────────────────
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

  // ── CombatData handler ──────────────────────────────────────────────────────
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
      // Still push the final frame so completed encounters are visible
      pushFrame(event)
      stashPull(event)
      if (!holdTimer) {
        holdTimer = setTimeout(() => {
          holdTimer = null
          applyOpacity(false)
        }, profile.value.global.holdDuration)
      }
    }
  }

  function pushFrame(event: CombatDataEvent): void {
    const g = profile.value.global

    // Resolve combatants (pet merge, party filter, self-only)
    const petOpts = {
      show: !g.mergePets, // show pets when not merging
      mergeWithOwner: g.mergePets ?? true,
    }
    const { combatants } = resolvePets(event.Combatant, petOpts)

    // Use combatantFilter if set, otherwise fall back to legacy partyOnly/selfOnly
    const filter = g.combatantFilter ?? (g.selfOnly ? 'self' : g.partyOnly ? 'party' : 'all')

    let filtered = combatants
    if (filter === 'self') {
      filtered = filtered.filter(c => c.name === selfName.value || c.name === 'YOU')
    } else if (filter === 'party' && partyNames.value.size > 0) {
      filtered = filtered.filter(c => partyNames.value.has(c.name) || c.name === 'YOU')
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      const av = parseFloat(a[g.sortBy] ?? '0')
      const bv = parseFloat(b[g.sortBy] ?? '0')
      return bv - av
    })

    // Limit
    filtered = filtered.slice(0, g.maxCombatants)

    const maxVal = parseFloat(filtered[0]?.[g.dpsType] ?? '1') || 1

    const bars: BarFrame[] = filtered.map((c, i) => {
      const rawVal = parseFloat(c[g.dpsType] ?? '0')
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
        alpha: 1,
        rank: i + 1,
        resolvedStyle: resolveBarStyle(normalizeJob(c['Job'] ?? ''), c.name, i + 1, profile.value, selfName.value),
      } as BarFrame & { rank: number; resolvedStyle: ReturnType<typeof resolveBarStyle> }
    })

    engine.setDuration(g.transitionDuration)
    engine.push({
      bars,
      encounterTitle: event.Encounter['title'] ?? '',
      encounterDuration: event.Encounter['duration'] ?? '',
      totalDps: formatValue(parseFloat(event.Encounter['ENCDPS'] ?? '0'), g.valueFormat),
      totalHps: formatValue(parseFloat(event.Encounter['ENCHPS'] ?? '0'), g.valueFormat),
      isActive: true,
    })
  }

  // ── Pull history ────────────────────────────────────────────────────────────
  function detectNewPull(event: CombatDataEvent): void {
    const title = event.Encounter['title'] ?? ''
    const duration = event.Encounter['duration'] ?? ''

    // A new pull starts when duration resets (goes back below a threshold)
    // or encounter title changes
    if (title !== lastEncounterTitle || duration < lastEncounterStart) {
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

  // ── Other event handlers ────────────────────────────────────────────────────
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
        console.warn('Failed to parse sync message:', e)
      }
    }
  }

  function applyConfig(incoming: Profile): void {
    // Preserve overlay runtime-only state so "Apply Changes" from the editor
    // doesn't overwrite what the user toggled live (merge pets, filter, blur, pin).
    const prev = profile.value.global
    const runtimeState = {
      mergePets:        prev.mergePets,
      combatantFilter:  prev.combatantFilter,
      partyOnly:        prev.partyOnly,
      selfOnly:         prev.selfOnly,
      blurNames:        prev.blurNames,
      header:           { pinned: prev.header?.pinned },
    }

    const merged = deepClone(DEFAULT_PROFILE)
    deepMergeProfile(merged, incoming)

    // Restore runtime state after merge
    merged.global.mergePets       = runtimeState.mergePets
    merged.global.combatantFilter = runtimeState.combatantFilter
    merged.global.partyOnly       = runtimeState.partyOnly
    merged.global.selfOnly        = runtimeState.selfOnly
    merged.global.blurNames       = runtimeState.blurNames
    if (merged.global.header && runtimeState.header.pinned !== undefined) {
      merged.global.header.pinned = runtimeState.header.pinned
    }

    profile.value = merged
    engine.setDuration(merged.global.transitionDuration)
    try {
      localStorage.setItem('act-flexi-profile', JSON.stringify(merged))
    } catch { /* storage full */ }
  }

  function deepMergeProfile(target: Profile, source: Partial<Profile>): void {
    if (source.default) {
      deepMergeObject(target.default, source.default)
    }
    if (source.overrides) {
      target.overrides = {
        byRole: { ...target.overrides.byRole, ...(source.overrides.byRole || {}) },
        byRoleEnabled: { ...target.overrides.byRoleEnabled, ...(source.overrides.byRoleEnabled || {}) },
        byJob: { ...target.overrides.byJob, ...(source.overrides.byJob || {}) },
        byJobEnabled: { ...target.overrides.byJobEnabled, ...(source.overrides.byJobEnabled || {}) },
        self: source.overrides.self ?? target.overrides.self,
        selfEnabled: source.overrides.selfEnabled ?? target.overrides.selfEnabled,
      }
    }
    if (source.global) {
      deepMergeObject(target.global, source.global)
    }
    if (source.customIcons) {
      Object.assign(target.customIcons, source.customIcons)
    }
    if (source.id) target.id = source.id
    if (source.name) target.name = source.name
  }

  function deepMergeObject(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(source)) {
      const srcVal = source[key]
      const tgtVal = target[key]
      if (
        srcVal !== null &&
        typeof srcVal === 'object' &&
        !Array.isArray(srcVal) &&
        tgtVal !== null &&
        typeof tgtVal === 'object' &&
        !Array.isArray(tgtVal)
      ) {
        deepMergeObject(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>)
      } else if (srcVal !== undefined) {
        target[key] = srcVal
      }
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  function start(): void {
    addListener('CombatData', onCombatData)
    addListener('ChangePrimaryPlayer', onChangePrimaryPlayer)
    addListener('ChangeZone', onChangeZone)
    addListener('PartyChanged', onPartyChanged)
    addListener('BroadcastMessage', onBroadcastMessage)

    // Listen for localStorage events (GitHub Pages mode)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorageEvent)
    }

    startEvents()
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

    engine.stop()
    clearHoldTimer()
  }

  async function loadProfile(): Promise<void> {
    // Try OverlayPlugin first
    const result = await callHandler({ call: 'loadData', key: 'act-flexi-profile' }) as { data?: string }
    if (result?.data) {
      try { applyConfig(JSON.parse(result.data)) } catch { /* corrupt data — keep default */ }
    } else {
      // Fallback: localStorage for browser/development
      const saved = localStorage.getItem('act-flexi-profile')
      if (saved) {
        try { applyConfig(JSON.parse(saved)) } catch { /* corrupt — keep default */ }
      }
    }
    
    // Load pulls
    const pullResult = await callHandler({ call: 'loadData', key: 'act-flexi-pulls' }) as { data?: string }
    if (pullResult?.data) {
      try { sessionPulls.value = JSON.parse(pullResult.data) } catch { /* ignore */ }
    }
  }

  function clearHoldTimer(): void {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
  }

  // ── Pull history navigation ─────────────────────────────────────────────────
  function viewPull(index: number | null): void {
    viewingPull.value = index
    clearHoldTimer()
    if (index === null) return  // back to live — next CombatData will update
    const pull = sessionPulls.value[index]
    if (!pull) return
    // Ensure full opacity when viewing history
    document.documentElement.style.opacity = String(profile.value.global.opacity)
    // Render the historical pull as a static frame
    const maxVal = Math.max(...pull.combatants.map(c => parseFloat(c[profile.value.global.dpsType] ?? '0')))
    const bars: BarFrame[] = pull.combatants.map((c, i) => ({
      name: c.name,
      job: normalizeJob(c['Job'] ?? ''),
      fillFraction: (parseFloat(c[profile.value.global.dpsType] ?? '0')) / (maxVal || 1),
      displayValue: formatValue(parseFloat(c[profile.value.global.dpsType] ?? '0'), profile.value.global.valueFormat),
      displayPct: c['damage%'] ?? '0',
      deaths: c.deaths ?? '0',
      crithit: c['crithit%'] ?? '---',
      directhit: c['DirectHitPct'] ?? '---',
      tohit: c.tohit ?? '---',
      enchps: formatValue(parseFloat(c.enchps ?? '0'), profile.value.global.valueFormat),
      alpha: 1,
    }))
    engine.push({
      bars,
      encounterTitle: pull.encounterName,
      encounterDuration: pull.duration,
      totalDps: pull.encounter['ENCDPS'] ?? '',
      totalHps: pull.encounter['ENCHPS'] ?? '',
      isActive: false,
    })
  }

  // ── Store exports ───────────────────────────────────────────────────────────
  function setCombatantFilter(filter: 'all' | 'party' | 'self') {
    profile.value.global.combatantFilter = filter
    // Also update legacy fields for backwards compatibility
    profile.value.global.partyOnly = filter === 'party'
    profile.value.global.selfOnly = filter === 'self'
  }

  function toggleBlurNames() {
    profile.value.global.blurNames = !profile.value.global.blurNames
  }

  function setHeaderPinned(pinned: boolean) {
    profile.value.global.header.pinned = pinned
  }

  function setMergePets(merge: boolean) {
    profile.value.global.mergePets = merge
  }

  return {
    profile,
    selfName,
    zone,
    frame,
    sessionPulls,
    viewingPull,
    start,
    stop,
    viewPull,
    applyConfig,
    setCombatantFilter,
    toggleBlurNames,
    setHeaderPinned,
    setMergePets,
  }
})
