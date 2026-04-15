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
  LogLineEvent,
  Profile,
  PullRecord,
  Frame,
  BarFrame,
  AbilityStats,
  CombatantAbilityData,
  DpsTimeline,
  HpSample,
  HitRecord,
  DeathRecord,
} from '@shared'
import { TIMELINE_BUCKET_SEC } from '@shared'
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

  // Ability data accumulated from LogLine events for the current pull.
  // Keyed [combatantName][abilityId]. Reset when a new pull is detected.
  const currentAbilityData = ref<Record<string, CombatantAbilityData>>({})

  // Per-combatant timelines (TIMELINE_BUCKET_SEC-second buckets). Reset on new pull.
  const currentTimeline      = ref<DpsTimeline>({})  // damage dealt   (DPS)
  const currentHealTimeline  = ref<DpsTimeline>({})  // heals dealt    (HPS)
  const currentDtakenTimeline = ref<DpsTimeline>({}) // damage received (DTPS)

  // Per-ability damage received by each target (for Summary "Taken" view).
  const currentDtakenData = ref<Record<string, CombatantAbilityData>>({})
  // FFXIV object IDs: name → ID (used to distinguish players vs enemies/pets).
  const currentCombatantIds = ref<Record<string, string>>({})
  // Death events recorded from type-25 lines.
  const currentDeaths = ref<DeathRecord[]>([])
  // Rolling HP% sample buffer per combatant (plain Map — not reactive, large throughput).
  const hpSampleBuffer = new Map<string, HpSample[]>()
  // Rolling hit/heal event buffer per target (max 800 entries; snapshotted on death).
  const hitEventBuffer = new Map<string, HitRecord[]>()

  let pullStartTime = 0

  // BroadcastChannel to push ability data to popout windows.
  let breakdownChannel: BroadcastChannel | null = null
  let broadcastTimer: ReturnType<typeof setTimeout> | null = null

  function buildPullList() {
    const list: { index: number | null; encounterName: string; duration: string }[] = [
      { index: null, encounterName: 'Live', duration: frame.value?.encounterDuration ?? '' },
    ]
    for (let i = 0; i < sessionPulls.value.length; i++) {
      const p = sessionPulls.value[i]
      list.push({ index: i, encounterName: p.encounterName, duration: p.duration })
    }
    return list
  }

  function parseDurationToSec(s: string): number {
    if (!s) return 0
    const parts = s.split(':').map(p => parseInt(p, 10))
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
    if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0)
    return parseInt(s, 10) || 0
  }

  function broadcastEncounterData(selectedCombatant?: string): void {
    const pullIndex = viewingPull.value
    const pull = pullIndex === null ? null : sessionPulls.value[pullIndex]
    const abilityData    = pullIndex === null ? deepClone(currentAbilityData.value)      : deepClone(pull?.abilityData      ?? {})
    const dpsTimeline    = pullIndex === null ? deepClone(currentTimeline.value)          : deepClone(pull?.dpsTimeline      ?? {})
    const hpsTimeline    = pullIndex === null ? deepClone(currentHealTimeline.value)      : deepClone(pull?.hpsTimeline      ?? {})
    const dtakenTimeline = pullIndex === null ? deepClone(currentDtakenTimeline.value)    : deepClone(pull?.dtakenTimeline   ?? {})
    const damageTakenData = pullIndex === null ? deepClone(currentDtakenData.value)       : deepClone(pull?.damageTakenData  ?? {})
    const deaths         = pullIndex === null ? deepClone(currentDeaths.value)            : deepClone(pull?.deaths           ?? [])
    const combatantIds   = pullIndex === null ? deepClone(currentCombatantIds.value)      : deepClone(pull?.combatantIds     ?? {})
    const encounterDurationSec = pullIndex === null
      ? parseDurationToSec(frame.value?.encounterDuration ?? '')
      : parseInt(pull?.encounter?.['DURATION'] ?? '0', 10)
    breakdownChannel?.postMessage({
      type: 'encounterData',
      abilityData,
      dpsTimeline, hpsTimeline, dtakenTimeline,
      damageTakenData, deaths, combatantIds,
      selfName: selfName.value,
      blurNames: profile.value.global.blurNames ?? false,
      partyNames: Array.from(partyNames.value),
      encounterDurationSec,
      pullIndex,
      selectedCombatant,
      pullList: buildPullList(),
    })
  }

  // Debounced — LogLine events fire per-hit; we don't need a broadcast per hit.
  function scheduleBroadcast(): void {
    if (broadcastTimer) return
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null
      broadcastEncounterData()
    }, 250)
  }

  // Called from MeterView on bar click — sends encounter-aware data with combatant hint
  function broadcastForCombatant(name: string): void {
    broadcastEncounterData(name)
  }

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
        rank: i + 1,
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

  // ─── LogLine ability tracking ────────────────────────────────────────────────

  // Decode the packed damage field from lines 21/22.
  // Upper 16 bits = base damage. If lower 16 bits have 0x4000 set, damage extends
  // past 65535: actual = upper | ((lower & 0x3FFF) + 1) << 16.
  // Reference: https://github.com/OverlayPlugin/cactbot/blob/main/docs/LogGuide.md
  function decodeLogDamage(hex: string): number {
    if (!hex || hex === '0') return 0
    const n = parseInt(hex, 16)
    if (isNaN(n)) return 0
    const upper = (n >>> 16) & 0xFFFF
    const lower = n & 0xFFFF
    return lower & 0x4000
      ? upper | (((lower & 0x3FFF) + 1) << 16)
      : upper
  }


  function recordAbilityHit(
    effectiveName: string,
    abilityId: string,
    abilityName: string,
    damage: number,
  ): void {
    if (!currentAbilityData.value[effectiveName]) {
      currentAbilityData.value[effectiveName] = {}
    }
    const combatant = currentAbilityData.value[effectiveName]
    if (!combatant[abilityId]) {
      combatant[abilityId] = {
        abilityId,
        abilityName,
        totalDamage: 0,
        hits: 0,
        maxHit: 0,
        minHit: Infinity,
      }
    }
    const stats: AbilityStats = combatant[abilityId]
    stats.totalDamage += damage
    stats.hits += 1
    if (damage > stats.maxHit) stats.maxHit = damage
    if (damage < stats.minHit) stats.minHit = damage

    recordTimelineBucket(currentTimeline.value, effectiveName, damage)
  }

  // Write damage/heal amount into the correct TIMELINE_BUCKET_SEC-second slot.
  function recordTimelineBucket(timeline: DpsTimeline, name: string, amount: number): void {
    const bucket = pullStartTime > 0
      ? Math.floor((Date.now() - pullStartTime) / (TIMELINE_BUCKET_SEC * 1000))
      : 0
    if (!timeline[name]) timeline[name] = []
    const tl = timeline[name]
    while (tl.length <= bucket) tl.push(0)
    tl[bucket] += amount
  }

  // Record FFXIV object ID for a combatant (first seen wins; IDs are stable per pull).
  function recordCombatantId(name: string, id: string): void {
    if (name && id && !currentCombatantIds.value[name]) {
      currentCombatantIds.value[name] = id
    }
  }

  // Push an HP% sample into the rolling buffer (max 200 entries per combatant).
  function recordHpSample(name: string, currentHp: number, maxHp: number): void {
    if (!name || maxHp <= 0) return
    const hp = Math.max(0, Math.min(1, currentHp / maxHp))
    if (!hpSampleBuffer.has(name)) hpSampleBuffer.set(name, [])
    const samples = hpSampleBuffer.get(name)!
    const t = pullStartTime > 0 ? Date.now() - pullStartTime : 0
    samples.push({ t, hp })
    if (samples.length > 200) samples.splice(0, samples.length - 200)
  }

  // Push a damage/heal event into the rolling hit buffer for a target (max 800 per combatant).
  function recordHitEvent(
    targetName: string,
    type: 'dmg' | 'heal',
    abilityName: string,
    sourceName: string,
    amount: number,
  ): void {
    if (!targetName || amount === 0) return
    const t = pullStartTime > 0 ? Date.now() - pullStartTime : 0
    if (!hitEventBuffer.has(targetName)) hitEventBuffer.set(targetName, [])
    const buf = hitEventBuffer.get(targetName)!
    buf.push({ t, type, abilityName, sourceName, amount })
    if (buf.length > 800) buf.splice(0, buf.length - 800)
  }

  // Record per-ability damage received by a target (for Summary "Taken" view).
  // Does NOT write to currentDtakenTimeline — that's handled separately.
  function recordDamageTaken(
    targetName: string,
    abilityId: string,
    abilityName: string,
    damage: number,
  ): void {
    if (!targetName || !abilityId || damage === 0) return
    if (!currentDtakenData.value[targetName]) {
      currentDtakenData.value[targetName] = {}
    }
    const combatant = currentDtakenData.value[targetName]
    if (!combatant[abilityId]) {
      combatant[abilityId] = {
        abilityId,
        abilityName,
        totalDamage: 0,
        hits: 0,
        maxHit: 0,
        minHit: Infinity,
      }
    }
    const stats: AbilityStats = combatant[abilityId]
    stats.totalDamage += damage
    stats.hits++
    if (damage > stats.maxHit) stats.maxHit = damage
    if (damage < stats.minHit) stats.minHit = damage
  }

  function onLogLine(event: LogLineEvent): void {
    const parts = event.rawLine.split('|')
    const lineType = parts[0]

    if (lineType === '21' || lineType === '22') {
      // NetworkAbility / NetworkAOEAbility
      // parts: [0]=type [1]=ts [2]=srcId [3]=srcName [4]=abilId [5]=abilName
      //        [6]=tgtId [7]=tgtName [8]=flags [9]=damage
      //        [24]=tgtCurrentHP [25]=tgtMaxHP [47]=petOwnerId [48]=petOwnerName
      const sourceId     = parts[2]
      const sourceName   = parts[3]
      const abilityId    = parts[4]
      const abilityName  = parts[5]
      const targetId     = parts[6]
      const targetName   = parts[7]
      const flags        = parts[8]
      const damageHex    = parts[9]
      const tgtCurrentHp = parseInt(parts[24], 10)
      const tgtMaxHp     = parseInt(parts[25], 10)
      const petOwnerName = parts[48]
      const effectiveName = petOwnerName || sourceName
      const flagByte     = parseInt(flags, 16) & 0xFF

      recordCombatantId(sourceName, sourceId)
      recordCombatantId(targetName, targetId)
      if (targetName) recordHpSample(targetName, tgtCurrentHp, tgtMaxHp)

      if (flagByte === 0x03) {
        // Damage hit — attribute to source for DPS, to target for DTPS
        const damage = decodeLogDamage(damageHex)
        if (damage === 0 || !effectiveName || !abilityId) return
        recordAbilityHit(effectiveName, abilityId, abilityName, damage)
        if (targetName) {
          recordDamageTaken(targetName, abilityId, abilityName, damage)
          recordTimelineBucket(currentDtakenTimeline.value, targetName, damage)
          recordHitEvent(targetName, 'dmg', abilityName, effectiveName, damage)
        }
        scheduleBroadcast()
      } else if (flagByte === 0x04) {
        // Heal hit — attribute to source for HPS, to target for incoming heals
        const heal = decodeLogDamage(damageHex)
        if (heal === 0 || !effectiveName) return
        recordTimelineBucket(currentHealTimeline.value, effectiveName, heal)
        if (targetName) recordHitEvent(targetName, 'heal', abilityName, effectiveName, heal)
        scheduleBroadcast()
      }

    } else if (lineType === '24') {
      // NetworkDoT — DoT/HoT tick
      // Verified field positions from real log data:
      // parts: [0]=type [1]=ts [2]=tgtId [3]=tgtName [4]=dotType [5]=effectId
      //        [6]=damage(hex) [7]=tgtCurrentHP [8]=tgtMaxHP
      //        [17]=srcId [18]=srcName
      const targetId   = parts[2]
      const targetName = parts[3]
      const dotType    = parts[4]
      const effectId   = parts[5]
      const damageHex  = parts[6]
      const tgtCurrentHp = parseInt(parts[7], 10)
      const tgtMaxHp     = parseInt(parts[8], 10)
      const sourceId   = parts[17]
      const sourceName = parts[18]  // FIXED: was parts[16] (target heading coordinate)

      recordCombatantId(sourceName, sourceId)
      recordCombatantId(targetName, targetId)
      if (targetName) recordHpSample(targetName, tgtCurrentHp, tgtMaxHp)

      if (dotType === 'DoT') {
        if (!sourceName || !effectId) return
        const damage = decodeLogDamage(damageHex)
        if (damage === 0) return
        recordAbilityHit(sourceName, `dot:${effectId}`, `DoT (${effectId})`, damage)
        if (targetName) {
          recordDamageTaken(targetName, `dot:${effectId}`, `DoT (${effectId})`, damage)
          recordTimelineBucket(currentDtakenTimeline.value, targetName, damage)
          recordHitEvent(targetName, 'dmg', `DoT (${effectId})`, sourceName, damage)
        }
        scheduleBroadcast()
      } else if (dotType === 'HoT') {
        if (!sourceName) return
        const heal = decodeLogDamage(damageHex)
        if (heal === 0) return
        recordTimelineBucket(currentHealTimeline.value, sourceName, heal)
        if (targetName) recordHitEvent(targetName, 'heal', `HoT (${effectId})`, sourceName, heal)
        scheduleBroadcast()
      }

    } else if (lineType === '25') {
      // NetworkDeath
      // parts: [0]=type [1]=ts [2]=targetId [3]=targetName [4]=sourceId [5]=sourceName
      const targetId   = parts[2]
      const targetName = parts[3]
      if (!targetId || !targetName) return
      // Only track player deaths (FFXIV player IDs start with byte 10)
      if (!targetId.startsWith('10')) return
      const t = pullStartTime > 0 ? Date.now() - pullStartTime : 0
      const cutoff = t - 30000
      const samples  = hpSampleBuffer.get(targetName) ?? []
      const hitsBuf  = hitEventBuffer.get(targetName)  ?? []
      currentDeaths.value.push({
        targetName,
        targetId,
        timestamp: t,
        hpSamples: samples.filter(s => s.t >= cutoff),
        lastHits:  hitsBuf.filter(h => h.t >= cutoff),
      })
      scheduleBroadcast()
    }
  }

  function resetAbilityData(): void {
    currentAbilityData.value = {}
    currentTimeline.value = {}
    currentHealTimeline.value = {}
    currentDtakenTimeline.value = {}
    currentDtakenData.value = {}
    currentCombatantIds.value = {}
    currentDeaths.value = []
    hpSampleBuffer.clear()
    hitEventBuffer.clear()
    pullStartTime = Date.now()
    broadcastEncounterData()
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
      resetAbilityData()
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
      abilityData:      deepClone(currentAbilityData.value),
      dpsTimeline:      deepClone(currentTimeline.value),
      hpsTimeline:      deepClone(currentHealTimeline.value),
      dtakenTimeline:   deepClone(currentDtakenTimeline.value),
      damageTakenData:  deepClone(currentDtakenData.value),
      deaths:           deepClone(currentDeaths.value),
      combatantIds:     deepClone(currentCombatantIds.value),
    }

    // Avoid duplicate stashes for same pull
    const last = sessionPulls.value[0]
    if (last?.encounterName === record.encounterName && last?.duration === record.duration) return

    sessionPulls.value = [record, ...sessionPulls.value].slice(0, 60)
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
    const merged = deepMerge(deepClone(DEFAULT_PROFILE), incoming)
    profile.value = merged
    engine.setDuration(merged.global.transitionDuration)
    // Persist to overlay's localStorage (persists across sessions)
    overlayConfig.applyConfig(merged)
    // Also sync to editor's key for compatibility
    try {
      localStorage.setItem('act-flexi-profile', JSON.stringify(merged))
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

    if (typeof BroadcastChannel !== 'undefined') {
      breakdownChannel = new BroadcastChannel('flexi-breakdown')
      breakdownChannel.onmessage = (e) => {
        if (e.data?.type === 'request') {
          broadcastEncounterData()
        } else if (e.data?.type === 'loadPull') {
          const idx: number | null = e.data.index ?? null
          const pull = idx === null ? null : sessionPulls.value[idx]
          const abilityData     = idx === null ? deepClone(currentAbilityData.value)       : deepClone(pull?.abilityData      ?? {})
          const dpsTimeline     = idx === null ? deepClone(currentTimeline.value)           : deepClone(pull?.dpsTimeline      ?? {})
          const hpsTimeline     = idx === null ? deepClone(currentHealTimeline.value)       : deepClone(pull?.hpsTimeline      ?? {})
          const dtakenTimeline  = idx === null ? deepClone(currentDtakenTimeline.value)     : deepClone(pull?.dtakenTimeline   ?? {})
          const damageTakenData = idx === null ? deepClone(currentDtakenData.value)         : deepClone(pull?.damageTakenData  ?? {})
          const deaths          = idx === null ? deepClone(currentDeaths.value)             : deepClone(pull?.deaths           ?? [])
          const combatantIds    = idx === null ? deepClone(currentCombatantIds.value)       : deepClone(pull?.combatantIds     ?? {})
          const encounterDurationSec = idx === null
            ? parseDurationToSec(frame.value?.encounterDuration ?? '')
            : parseInt(pull?.encounter?.['DURATION'] ?? '0', 10)
          breakdownChannel?.postMessage({
            type: 'encounterData',
            abilityData,
            dpsTimeline, hpsTimeline, dtakenTimeline,
            damageTakenData, deaths, combatantIds,
            selfName: selfName.value,
            blurNames: profile.value.global.blurNames ?? false,
            partyNames: Array.from(partyNames.value),
            encounterDurationSec,
            pullIndex: idx,
            pullList: buildPullList(),
          })
        }
      }
    }

    addListener('CombatData', onCombatData)
    addListener('ChangePrimaryPlayer', onChangePrimaryPlayer)
    addListener('ChangeZone', onChangeZone)
    addListener('PartyChanged', onPartyChanged)
    addListener('BroadcastMessage', onBroadcastMessage)
    addListener('LogLine', onLogLine)

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
    breakdownChannel?.close()
    breakdownChannel = null
    if (broadcastTimer) { clearTimeout(broadcastTimer); broadcastTimer = null }

    removeListener('CombatData', onCombatData)
    removeListener('ChangePrimaryPlayer', onChangePrimaryPlayer)
    removeListener('ChangeZone', onChangeZone)
    removeListener('PartyChanged', onPartyChanged)
    removeListener('BroadcastMessage', onBroadcastMessage)
    removeListener('LogLine', onLogLine)

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
        rank: i + 1,
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
    currentAbilityData,
    broadcastForCombatant,
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
  }
})
