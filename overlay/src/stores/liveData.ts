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
  RAID_BUFFS,
  allocatePercentageBuffDamage,
  isProfileLike,
  parseProfileSafe,
} from '@shared'
import type {
  CombatDataEvent,
  ChangePrimaryPlayerEvent,
  ChangeZoneEvent,
  PartyChangedEvent,
  PartyMember,
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
  CastEvent,
  ResourceSample,
} from '@shared'
import { TIMELINE_BUCKET_SEC } from '@shared'
import { formatValue } from '@shared'
import { buildDeathEvents } from '@shared/deathRecap'
import { buildMetricFractions, createMetricFractionContext } from '@shared/metricFractions'
import { normalizeJob } from '@shared/jobMap'
import { useOverlayConfig } from './overlayConfig'

// Poll config from localStorage every 500ms as fallback
// (storage events don't fire on same-origin in some browsers)
const CONFIG_POLL_INTERVAL_MS = 500

export const useLiveDataStore = defineStore('liveData', () => {
  // ─── State ───────────────────────────────────────────────────────────────────
  const overlayConfig = useOverlayConfig()
  const profile = ref<Profile>(deepClone(DEFAULT_PROFILE))
  const selfName = ref('')
  const zone = ref('')
  const partyNames = ref<Set<string>>(new Set())
  const partyData = ref<PartyMember[]>([])
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
  const currentDamageByCombatant = ref<Record<string, number>>({})
  const currentDpsByCombatant = ref<Record<string, number>>({})

  // Per-ability damage received by each target (for Summary "Taken" view).
  const currentDtakenData = ref<Record<string, CombatantAbilityData>>({})
  // Per-ability healing received by each target (for Breakdown "Healing Received" view).
  const currentHealingReceivedData = ref<Record<string, CombatantAbilityData>>({})
  const currentRdpsByCombatant = ref<Record<string, number>>({})
  // FFXIV object IDs: name → ID (used to distinguish players vs enemies/pets).
  const currentCombatantIds = ref<Record<string, string>>({})
  // ACT job abbreviations: name → normalized job (used by Breakdown UI).
  const currentCombatantJobs = ref<Record<string, string>>({})
  // Death events recorded from type-25 lines.
  const currentDeaths = ref<DeathRecord[]>([])
  const currentEnemyDeaths = ref<Record<string, number>>({})
  // Rolling HP% sample buffer per combatant (plain Map — not reactive, large throughput).
  const hpSampleBuffer = new Map<string, HpSample[]>()
  // Rolling hit/heal event buffer per target (max 800 entries; snapshotted on death).
  const hitEventBuffer = new Map<string, HitRecord[]>()
  // Rolling cast event buffer per combatant (includes pets, excludes player's chocobo).
  const currentCastData = ref<Record<string, CastEvent[]>>({})
  // HP/MP samples used by Breakdown Casts resource graphs.
  const currentResourceData = ref<Record<string, ResourceSample[]>>({})
  // Status effect id -> latest human-readable effect name from GainsEffect lines.
  const currentEffectNames = new Map<string, string>()
  interface ActiveTickEffect { effectId: string; effectName: string; expiresAt: number }
  const activeTickEffects = new Map<string, ActiveTickEffect[]>()
  const activeSelfHealingEffects = new Map<string, ActiveTickEffect[]>()

  const JOB_TICK_FALLBACKS: Record<string, Partial<Record<'DoT' | 'HoT', string>>> = {
    CNJ: { DoT: 'Aero II', HoT: 'Regen' },
    WHM: { DoT: 'Dia', HoT: 'Regen' },
    SCH: { DoT: 'Biolysis' },
    AST: { DoT: 'Combust III' },
    SGE: { DoT: 'Eukrasian Dosis' },
    BLM: { DoT: 'Thunder' },
    THM: { DoT: 'Thunder' },
    MNK: { DoT: 'Demolish' },
    DRG: { DoT: 'Chaotic Spring' },
    SAM: { DoT: 'Higanbana' },
    GNB: { DoT: 'Sonic Break' },
  }

  // Track resurrection events: player name -> resurrection timestamp (ms since pull start)
  const resurrectTimes = ref<Record<string, number>>({})
  // Track pending deaths awaiting resurrection (keyed by targetName for quick lookup)
  const pendingDeathUpdates = new Map<string, number>()  // targetName -> death index in currentDeaths

  // rDPS tracking — raid buff windows and damage contribution accumulators
  interface ActiveRaidBuff { sourceName: string; effectName: string; multiplier: number; expiresAt: number }
  const activeRaidBuffs  = new Map<string, ActiveRaidBuff[]>()  // buffed player/debuffed enemy name → active windows
  const rDpsContributed  = new Map<string, number>()  // sourceName → raw damage contributed via buffs
  const rDpsReceived     = new Map<string, number>()  // dealerName → raw damage boosted by others' buffs

  let pullStartTime = 0
  let pullStartLogTime = 0
  let currentLogTime: number | null = null
  const networkEnemyInstances = new Map<string, { id: string; lastSeen: number; maxHp: number }>()
  const NETWORK_PULL_BOUNDARY_GAP_MS = 20_000
  const NETWORK_PULL_BOUNDARY_MIN_HP = 500_000
  const lastKnownHp = new Map<string, { currentHp: number; maxHp: number }>()

  // BroadcastChannel to push ability data to popout windows.
  const BREAKDOWN_SNAPSHOT_KEY = 'flexi-breakdown-snapshot'
  let breakdownChannel: BroadcastChannel | null = null
  let broadcastTimer: ReturnType<typeof setTimeout> | null = null
  type PullListEntry = {
    index: number | null
    encounterId?: string
    encounterName: string
    duration: string
    pullNumber?: number
    pullCount?: number
    isFirstInEncounter?: boolean
    dps?: number
    rdps?: number
    hps?: number
    dtps?: number
    deaths?: number
    damageTaken?: number
    primaryEnemyName?: string
    primaryEnemyCurrentHp?: number
    primaryEnemyMaxHp?: number
    bossPercent?: number
    bossPercentLabel?: string
    bossKilled?: boolean
    enemyCount?: number
    defeatedEnemyCount?: number
    pullOutcome?: 'live' | 'clear' | 'wipe' | 'unknown'
    pullOutcomeLabel?: string
  }
  let cachedPullListKey = ''
  let cachedHistoricalPullEntries: PullListEntry[] = []

  function isMeterActorName(name: string): boolean {
    const id = currentCombatantIds.value[name]
    if (!id) return true
    if (id.startsWith('40')) return false
    if (!id.startsWith('10') && !id.startsWith('40') && !id.startsWith('00')) return false
    return true
  }

  function timelineRateTotal(timeline: DpsTimeline, durationSec: number): number {
    const duration = Math.max(1, durationSec)
    return Object.entries(timeline)
      .filter(([name]) => isMeterActorName(name))
      .reduce((sum, [, buckets]) => sum + buckets.reduce((s, value) => s + value, 0), 0) / duration
  }

  function liveRdpsTotal(): number {
    return Object.entries(currentRdpsByCombatant.value)
      .filter(([name]) => isMeterActorName(name))
      .reduce((sum, [, value]) => sum + value, 0)
  }

  function liveDpsTotal(): number {
    return Object.entries(currentDpsByCombatant.value)
      .filter(([name]) => isMeterActorName(name))
      .reduce((sum, [, value]) => sum + value, 0)
  }

  function partyGroupFor(name: string, members: PartyMember[]): string {
    const member = members.find(p => p.name === name)
    const partyType = member?.partyType
    if ((!partyType || partyType === 'Solo' || partyType === 'Party') && members.length > 8) {
      const partyIdx = members.findIndex(p => p.name === name)
      return partyIdx >= 0 ? (['Alliance A', 'Alliance B', 'Alliance C'][Math.floor(partyIdx / 8)] ?? 'Party') : 'Party'
    }
    return partyType ? partyType.replace(/^Alliance/, 'Alliance ') : 'Party'
  }

  function buildPullList() {
    const liveDuration = parseDurationToSec(frame.value?.encounterDuration ?? '')
    const list: PullListEntry[] = [
      {
        index: null,
        encounterId: frame.value?.encounterTitle ?? 'Live',
        encounterName: 'Live',
        duration: frame.value?.encounterDuration ?? '',
        pullNumber: 0,
        pullCount: 0,
        isFirstInEncounter: true,
        dps: liveDpsTotal() || timelineRateTotal(currentTimeline.value, liveDuration),
        rdps: liveRdpsTotal(),
        hps: timelineRateTotal(currentHealTimeline.value, liveDuration),
        dtps: timelineRateTotal(currentDtakenTimeline.value, liveDuration),
        deaths: currentDeaths.value.length,
        damageTaken: Object.values(currentDtakenData.value).reduce((sum, abilities) =>
          sum + Object.values(abilities).reduce((s, ability) => s + ability.totalDamage, 0), 0),
        ...estimateBossPercent(currentResourceData.value, currentCombatantIds.value, currentEnemyDeaths.value, false, currentAbilityData.value),
      },
    ]
    return [...list, ...buildHistoricalPullList()]
  }

  function buildHistoricalPullList(): PullListEntry[] {
    const cacheKey = sessionPulls.value.map(p => p.id).join('|')
    if (cacheKey === cachedPullListKey) return cachedHistoricalPullEntries

    cachedHistoricalPullEntries = []
    const totalsByEncounter = new Map<string, number>()
    for (const p of sessionPulls.value) {
      const key = p.encounterName || 'Unknown'
      totalsByEncounter.set(key, (totalsByEncounter.get(key) ?? 0) + 1)
    }
    const seenByEncounter = new Map<string, number>()
    let previousEncounter = ''
    for (let i = 0; i < sessionPulls.value.length; i++) {
      const p = sessionPulls.value[i]
      const encounterId = p.encounterName || 'Unknown'
      const seen = (seenByEncounter.get(encounterId) ?? 0) + 1
      seenByEncounter.set(encounterId, seen)
      const total = totalsByEncounter.get(encounterId) ?? seen
      const duration = parseFloat(p.encounter?.DURATION ?? '0') || 1
      const damageTaken = p.combatants.reduce((sum, c) => sum + parseFloat(c.damagetaken ?? '0'), 0)
      const rdps = p.combatants.reduce((sum, c) => sum + parseFloat(c.rdps ?? '0'), 0)
      cachedHistoricalPullEntries.push({
        index: i,
        encounterId,
        encounterName: p.encounterName,
        duration: p.duration,
        pullNumber: total - seen + 1,
        pullCount: total,
        isFirstInEncounter: encounterId !== previousEncounter,
        dps: parseFloat(p.encounter?.ENCDPS ?? '0'),
        rdps,
        hps: parseFloat(p.encounter?.ENCHPS ?? '0'),
        dtps: parseFloat(p.encounter?.DTRPS ?? '0') || damageTaken / duration,
        deaths: p.deaths?.length ?? p.combatants.reduce((sum, c) => sum + parseFloat(c.deaths ?? '0'), 0),
        damageTaken,
        ...estimateBossPercent(p.resourceData ?? {}, p.combatantIds ?? {}, p.enemyDeaths ?? {}, true, p.abilityData ?? {}),
      })
      previousEncounter = encounterId
    }
    cachedPullListKey = cacheKey
    return cachedHistoricalPullEntries
  }

  function mapToRateRecord(map: Map<string, number>, durationSec: number): Record<string, number> {
    const result: Record<string, number> = {}
    const duration = Math.max(1, durationSec)
    for (const [name, amount] of map) {
      result[name] = amount / duration
    }
    return result
  }

  function estimateBossPercent(
    resources: Record<string, ResourceSample[]>,
    ids: Record<string, string>,
    enemyDeaths: Record<string, number>,
    ended: boolean,
    abilityData: Record<string, CombatantAbilityData> = {},
  ): {
    bossPercent?: number
    bossPercentLabel?: string
    primaryEnemyName?: string
    primaryEnemyCurrentHp?: number
    primaryEnemyMaxHp?: number
    bossKilled?: boolean
    enemyCount?: number
    defeatedEnemyCount?: number
    pullOutcome?: PullListEntry['pullOutcome']
    pullOutcomeLabel?: string
  } {
    const enemyCandidates = new Map<string, { name: string; id: string }>()
    const addEnemyCandidate = (name: string, id = '') => {
      if (!name) return
      if (id && !id.startsWith('40')) return
      const knownId = id || ids[name] || ''
      if (knownId && !knownId.startsWith('40')) return
      if (!knownId && ids[name] && !ids[name].startsWith('40')) return
      const key = knownId ? `${name}|${knownId}` : name
      enemyCandidates.set(key, { name, id: knownId })
    }
    const parseEnemyKey = (key: string) => {
      const [name, id = ''] = key.split('|')
      return { name, id }
    }
    const exactEnemyDeathKeys = new Set(Object.keys(enemyDeaths).filter(key => key.includes('|')))
    const exactEnemyDeathNames = new Set(
      Array.from(exactEnemyDeathKeys).map(key => parseEnemyKey(key).name),
    )
    const hasLiveNameSample = (name: string) => {
      const latest = resources[name]?.at(-1)
      return latest !== undefined && latest.maxHp > 0 && latest.currentHp > 0 && latest.hp > 0
    }
    const shouldAddEvidencedCandidate = (name: string, id = '') => {
      if (!id) return true
      if (!exactEnemyDeathNames.has(name)) return true
      if (exactEnemyDeathKeys.has(`${name}|${id}`)) return true
      return hasLiveNameSample(name)
    }
    for (const [name, samples] of Object.entries(resources)) {
      const id = ids[name]
      if (!id?.startsWith('40')) continue
      const latest = samples.at(-1)
      const latestHasHp = latest !== undefined && latest.maxHp > 0 && latest.currentHp > 0 && latest.hp > 0
      if (!shouldAddEvidencedCandidate(name, id) && !latestHasHp) continue
      addEnemyCandidate(name, id)
    }
    for (const key of Object.keys(enemyDeaths)) {
      const { name, id } = parseEnemyKey(key)
      if (!id && exactEnemyDeathNames.has(name)) continue
      addEnemyCandidate(name, id)
    }
    const evidencedEnemyNames = new Set(Array.from(enemyCandidates.values()).map(candidate => candidate.name))
    for (const abilities of Object.values(abilityData)) {
      for (const ability of Object.values(abilities)) {
        for (const instance of Object.values(ability.targetInstances ?? {})) {
          if (!evidencedEnemyNames.has(instance.name)) continue
          if (!shouldAddEvidencedCandidate(instance.name, instance.id)) continue
          addEnemyCandidate(instance.name, instance.id)
        }
      }
    }

    const candidateNameCounts = new Map<string, number>()
    for (const candidate of enemyCandidates.values()) {
      candidateNameCounts.set(candidate.name, (candidateNameCounts.get(candidate.name) ?? 0) + 1)
    }

    const enemies = Array.from(enemyCandidates.entries())
      .map(([key, candidate]) => {
        const { name, id } = candidate
        const samples = resources[name] ?? []
        const latest = samples.at(-1)
        const duplicateName = (candidateNameCounts.get(name) ?? 0) > 1
        const killed = enemyDeaths[key] !== undefined ||
          (!duplicateName && (enemyDeaths[name] !== undefined || samples.some(sample => sample.currentHp <= 0 || sample.hp <= 0)))
        const maxHp = latest?.maxHp ?? 0
        const currentHp = latest && maxHp > 0
          ? (killed ? 0 : Math.max(0, Math.min(latest.currentHp, maxHp)))
          : undefined
        const percent = latest && maxHp > 0
          ? (killed ? 0 : Math.max(0, Math.min(100, latest.hp * 100)))
          : undefined
        return { key, name, id, percent, currentHp, maxHp, killed }
      })
      .sort((a, b) => b.maxHp - a.maxHp || a.name.localeCompare(b.name))

    if (enemies.length === 0) {
      return {
        pullOutcome: ended ? 'unknown' : 'live',
        pullOutcomeLabel: ended ? 'Unknown' : 'Live',
      }
    }
    const objectiveEnemies = enemies
    const defeatedEnemyCount = objectiveEnemies.filter(enemy => enemy.killed).length
    const allDefeated = defeatedEnemyCount === objectiveEnemies.length
    const primary = allDefeated
      ? objectiveEnemies.find(enemy => enemy.percent !== undefined) ?? objectiveEnemies[0] ?? enemies[0]
      : objectiveEnemies.find(enemy => !enemy.killed && enemy.percent !== undefined)
        ?? objectiveEnemies.find(enemy => !enemy.killed)
        ?? objectiveEnemies.find(enemy => enemy.percent !== undefined)
        ?? objectiveEnemies[0]
        ?? enemies[0]
    const pullOutcome: PullListEntry['pullOutcome'] = !ended ? 'live' : allDefeated ? 'clear' : 'wipe'
    const defeatedLabel = objectiveEnemies.length > 1 ? `${defeatedEnemyCount}/${objectiveEnemies.length} defeated` : ''
    const progressLabel = primary.percent !== undefined
      ? objectiveEnemies.length > 1
        ? `${primary.percent.toFixed(1)}% ${primary.name}${defeatedEnemyCount > 0 ? ` · ${defeatedLabel}` : ''}`
        : `${primary.percent.toFixed(1)}%`
      : defeatedLabel
    return {
      bossPercent: primary.percent,
      bossPercentLabel: ended && allDefeated
        ? (objectiveEnemies.length > 1 ? `Cleared · ${defeatedLabel}` : 'Defeated')
        : progressLabel,
      primaryEnemyName: primary.name,
      primaryEnemyCurrentHp: primary.currentHp,
      primaryEnemyMaxHp: primary.maxHp > 0 ? primary.maxHp : undefined,
      bossKilled: ended && allDefeated,
      enemyCount: objectiveEnemies.length,
      defeatedEnemyCount,
      pullOutcome,
      pullOutcomeLabel: pullOutcome === 'clear' ? 'Clear' : pullOutcome === 'wipe' ? 'Wipe' : 'Live',
    }
  }

  function parseDurationToSec(s: string): number {
    if (!s) return 0
    const parts = s.split(':').map(p => parseInt(p, 10))
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
    if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0)
    return parseInt(s, 10) || 0
  }

  function snapshotHitData(): Record<string, HitRecord[]> {
    return deepClone(Object.fromEntries(hitEventBuffer.entries()))
  }

  function buildBreakdownPayload(selectedCombatant?: string, requestedPullIndex = viewingPull.value) {
    const pullIndex = requestedPullIndex
    const pull = pullIndex === null ? null : sessionPulls.value[pullIndex]
    const abilityData    = pullIndex === null ? deepClone(currentAbilityData.value)      : deepClone(pull?.abilityData      ?? {})
    const dpsTimeline    = pullIndex === null ? deepClone(currentTimeline.value)          : deepClone(pull?.dpsTimeline      ?? {})
    const hpsTimeline    = pullIndex === null ? deepClone(currentHealTimeline.value)      : deepClone(pull?.hpsTimeline      ?? {})
    const dtakenTimeline = pullIndex === null ? deepClone(currentDtakenTimeline.value)    : deepClone(pull?.dtakenTimeline   ?? {})
    const damageTakenData = pullIndex === null ? deepClone(currentDtakenData.value)       : deepClone(pull?.damageTakenData  ?? {})
    const healingReceivedData = pullIndex === null ? deepClone(currentHealingReceivedData.value) : deepClone(pull?.healingReceivedData ?? {})
    const hitData = pullIndex === null ? snapshotHitData() : deepClone(pull?.hitData ?? {})
    const rdpsByCombatant = pullIndex === null
      ? deepClone(currentRdpsByCombatant.value)
      : Object.fromEntries((pull?.combatants ?? []).map(c => [c.name, parseFloat(c.rdps ?? '0') || 0]))
    const dpsByCombatant = pullIndex === null
      ? deepClone(currentDpsByCombatant.value)
      : Object.fromEntries((pull?.combatants ?? []).map(c => [c.name, parseFloat(c.encdps ?? '0') || 0]))
    const damageByCombatant = pullIndex === null
      ? deepClone(currentDamageByCombatant.value)
      : Object.fromEntries((pull?.combatants ?? []).map(c => [c.name, parseFloat(c.damage ?? '0') || 0]))
    const liveDuration = parseDurationToSec(frame.value?.encounterDuration ?? '')
    const rdpsGiven = pullIndex === null
      ? mapToRateRecord(rDpsContributed, liveDuration)
      : deepClone(pull?.rdpsGiven ?? {})
    const rdpsTaken = pullIndex === null
      ? mapToRateRecord(rDpsReceived, liveDuration)
      : deepClone(pull?.rdpsTaken ?? {})
    const deaths         = pullIndex === null ? deepClone(currentDeaths.value)            : deepClone(pull?.deaths           ?? [])
    const combatantIds   = pullIndex === null ? deepClone(currentCombatantIds.value)      : deepClone(pull?.combatantIds     ?? {})
    const combatantJobs  = pullIndex === null ? deepClone(currentCombatantJobs.value)     : deepClone(pull?.combatantJobs    ?? {})
    const castData       = pullIndex === null ? deepClone(currentCastData.value)         : deepClone(pull?.castData         ?? {})
    const resourceData   = pullIndex === null ? deepClone(currentResourceData.value)     : deepClone(pull?.resourceData     ?? {})
    const partyDataHistorical = pullIndex === null ? partyData.value : (pull?.partyData ?? [])
    const partyNamesHistorical = pullIndex === null ? partyNames.value : new Set((pull?.partyData ?? []).map(p => p.name))
    const encounterDurationSec = pullIndex === null
      ? parseDurationToSec(frame.value?.encounterDuration ?? '')
      : parseInt(pull?.encounter?.['DURATION'] ?? '0', 10)
    const timestamp = Date.now()
    return {
      type: 'encounterData',
      timestamp,
      abilityData,
      dpsTimeline, hpsTimeline, dtakenTimeline,
      damageTakenData, healingReceivedData, hitData, dpsByCombatant, damageByCombatant, rdpsByCombatant, rdpsGiven, rdpsTaken, deaths, combatantIds, combatantJobs, castData, resourceData,
      selfName: selfName.value,
      blurNames: profile.value.global.blurNames ?? false,
      partyNames: Array.from(partyNamesHistorical),
      partyData: partyDataHistorical.map(p => ({ id: p.id, name: p.name, inParty: p.inParty, partyType: p.partyType, job: p.job })),
      encounterDurationSec,
      pullIndex,
      selectedCombatant,
      pullList: buildPullList(),
    }
  }

  function persistBreakdownPayload(payload: ReturnType<typeof buildBreakdownPayload>): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(BREAKDOWN_SNAPSHOT_KEY, JSON.stringify(payload))
    } catch {
      // Best-effort handoff for new popout windows; BroadcastChannel remains primary.
    }
  }

  function broadcastEncounterData(selectedCombatant?: string): void {
    const payload = buildBreakdownPayload(selectedCombatant)
    persistBreakdownPayload(payload)
    breakdownChannel?.postMessage(payload)
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
      detectNewPull(event)
      pushFrame(event)
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

    for (const c of combatants) {
      const job = normalizeJob(c['Job'] ?? '')
      if (c.name && job) currentCombatantJobs.value[c.name] = job
      recordResourceSample(c)
    }

    // Inject synthetic rdps field: (personal damage + contributions given − boosts received) / duration
    const rDpsDuration = parseFloat(event.Encounter['DURATION'] ?? '0') || 1
    const nextDamageByCombatant: Record<string, number> = {}
    const nextDpsByCombatant: Record<string, number> = {}
    const nextRdpsByCombatant: Record<string, number> = {}
    for (const c of combatants) {
      const baseDamage  = parseFloat(c['damage'] ?? '0')
      const dps = parseFloat(c['encdps'] ?? '0') || 0
      const contributed = rDpsContributed.get(c.name) ?? 0
      const received    = rDpsReceived.get(c.name) ?? 0
      const rdps = Math.max(0, (baseDamage + contributed - received) / rDpsDuration)
      nextDamageByCombatant[c.name] = baseDamage
      nextDpsByCombatant[c.name] = dps
      c['rdps'] = String(Math.round(rdps))
      nextRdpsByCombatant[c.name] = Math.round(rdps)
    }
    currentDamageByCombatant.value = nextDamageByCombatant
    currentDpsByCombatant.value = nextDpsByCombatant
    currentRdpsByCombatant.value = nextRdpsByCombatant

    // Use combatantFilter if set, otherwise fall back to legacy selfOnly/partyOnly
    const filter = g.combatantFilter ?? (g.selfOnly ? 'self' : g.partyOnly ? 'party' : 'all')

    let filtered = combatants

    // Helper to identify enemies/NPCs using FFXIV object IDs (if available)
    const isEnemyOrNpc = (name: string): boolean => {
      const id = currentCombatantIds.value[name]
      if (!id) return false
      // Enemy IDs start with 40, NPCs don't start with 10 (players) or 40
      if (id.startsWith('40')) return true
      if (!id.startsWith('10') && !id.startsWith('40') && !id.startsWith('00')) return true
      return false
    }

    // Remove enemies and NPCs from meters (always filter them out)
    filtered = filtered.filter(c => !isEnemyOrNpc(c.name))

    if (filter === 'self') {
      filtered = filtered.filter(c => c.name === selfName.value || c.name === 'YOU')
    } else if (filter === 'alliance' && partyData.value.length > 0) {
      // Show entire alliance (all combatants with inParty: true)
      const allianceSet = new Set(partyData.value.filter(p => p.inParty).map(p => p.name))
      filtered = filtered.filter(c => allianceSet.has(c.name) || c.name === 'YOU')
    } else if (filter === 'party' && partyData.value.length > 0) {
      // For party filter: show only your actual party group (8 people in your party)
      const isAlliance = partyData.value.length > 8
      if (isAlliance) {
        // Alliance: find self's party group and show only that party
        const selfIdx = partyData.value.findIndex(p => p.name === selfName.value)
        if (selfIdx >= 0) {
          const selfPartyNum = Math.floor(selfIdx / 8)
          const partyStart = selfPartyNum * 8
          const partyEnd = partyStart + 8
          const partySet = new Set(partyData.value.slice(partyStart, partyEnd).map(p => p.name))
          filtered = filtered.filter(c => partySet.has(c.name) || c.name === 'YOU')
        }
      } else {
        // Normal party: show all with inParty: true
        const partySet = new Set(partyData.value.filter(p => p.inParty).map(p => p.name))
        filtered = filtered.filter(c => partySet.has(c.name) || c.name === 'YOU')
      }
    }

    filtered = [...filtered]
      .sort((a, b) => {
        if (g.sortBy === 'role') {
          const roleOrder: Record<string, number> = { tank: 0, healer: 1, melee: 2, ranged: 3, caster: 4, unknown: 5 }
          const getJobRole = (job: string) => {
            const JOB_ROLES: Record<string, string> = { PLD: 'tank', WAR: 'tank', DRK: 'tank', GNB: 'tank', WHM: 'healer', SCH: 'healer', AST: 'healer', SGE: 'healer', MNK: 'melee', DRG: 'melee', NIN: 'melee', SAM: 'melee', RPR: 'melee', VPR: 'melee', BRD: 'ranged', MCH: 'ranged', DNC: 'ranged', BLM: 'caster', SMN: 'caster', RDM: 'caster', PCT: 'caster', BLU: 'caster' }
            return JOB_ROLES[normalizeJob(job)] ?? 'unknown'
          }
          return (roleOrder[getJobRole(b['Job'] ?? '')] ?? 5) - (roleOrder[getJobRole(a['Job'] ?? '')] ?? 5)
        }
        return parseFloat(b[g.sortBy] ?? '0') - parseFloat(a[g.sortBy] ?? '0')
      })
      .slice(0, g.maxCombatants)

    const effectiveDpsType = ((g.dpsType as any) === 'role' ? 'encdps' : g.dpsType)
    const maxVal = parseFloat(filtered[0]?.[effectiveDpsType] ?? '1') || 1
    const metricFractionContext = createMetricFractionContext(filtered)

    // For DTPS, we need to calculate from damagetaken / DURATION (integer seconds from ACT)
    const getDtpsValue = (c: Record<string, string>) => {
      if (effectiveDpsType !== 'dtps') return 0
      const dt = parseFloat(c['damagetaken'] ?? '0')
      const dur = parseFloat(c['DURATION'] ?? '0')
      return dur > 0 ? dt / dur : 0
    }

    const bars: BarFrame[] = filtered.map((c, i) => {
      let rawVal: number
      if (effectiveDpsType === 'dtps') {
        rawVal = getDtpsValue(c)
      } else {
        rawVal = parseFloat(c[effectiveDpsType] ?? '0')
      }
      return {
        name: c.name,
        job: normalizeJob(c['Job'] ?? ''),
        partyGroup: partyGroupFor(c.name, partyData.value),
        fillFraction: rawVal / maxVal,
        displayValue: formatValue(rawVal, g.valueFormat),
        displayPct: c['damage%'] ?? '0',
        deaths: c.deaths ?? '0',
        crithit: c['crithit%'] ?? '---',
        directhit: c['DirectHitPct'] ?? '---',
        tohit: c.tohit ?? '---',
        enchps: formatValue(parseFloat(c.enchps ?? '0'), g.valueFormat),
        rdps: formatValue(parseFloat(c['rdps'] ?? '0'), g.valueFormat),
        rawValue: rawVal,
        rawEnchps: parseFloat(c.enchps ?? '0'),
        rawRdps: parseFloat(c['rdps'] ?? '0'),
        maxHit: (c.maxhit ?? '---').replace('-', ' '),
        metricFractions: buildMetricFractions(metricFractionContext, c),
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
      totalRdps: formatValue(
        filtered.reduce((s: number, c: Record<string, string>) => s + parseFloat(c['rdps'] ?? '0'), 0),
        g.valueFormat,
      ),
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
  // Attribute player damage against enemies to buffs on the dealer and debuffs on the target.
  // Logged damage already includes active buffs, so allocation removes the combined
  // multiplier first and distributes the gained damage by log-weighted share.
  function isPlayerId(id: string): boolean {
    return id.startsWith('10')
  }

  function isEnemyId(id: string): boolean {
    return id.startsWith('40')
  }

  function currentPullOffsetMs(): number {
    if (currentLogTime !== null) {
      if (pullStartLogTime <= 0) pullStartLogTime = currentLogTime
      return Math.max(0, currentLogTime - pullStartLogTime)
    }
    return pullStartTime > 0 ? Date.now() - pullStartTime : 0
  }

  function maybeResetForNetworkEnemyInstance(name: string, id: string, maxHp: number): void {
    if (!name || !isEnemyId(id) || currentLogTime === null) return
    if (!Number.isFinite(maxHp) || maxHp < NETWORK_PULL_BOUNDARY_MIN_HP) return

    const previous = networkEnemyInstances.get(name)
    if (previous && previous.id !== id && currentLogTime - previous.lastSeen > NETWORK_PULL_BOUNDARY_GAP_MS) {
      resetAbilityData()
    }

    networkEnemyInstances.set(name, { id, lastSeen: currentLogTime, maxHp })
  }

  function activeBuffWindowsFor(name: string, nowMs: number): ActiveRaidBuff[] {
    const windows = activeRaidBuffs.get(name)
    if (!windows || windows.length === 0) return []
    const active = windows.filter(window => window.expiresAt > nowMs)
    if (active.length !== windows.length) {
      if (active.length > 0) activeRaidBuffs.set(name, active)
      else activeRaidBuffs.delete(name)
    }
    return active
  }

  function attributeRaidBuffContribution(
    dealerName: string,
    dealerId: string,
    targetName: string,
    targetId: string,
    damage: number,
  ): void {
    if (!dealerName || !targetName || damage <= 0) return
    if (!isPlayerId(dealerId) || !isEnemyId(targetId)) return

    const nowMs = currentPullOffsetMs()
    const windows = [
      ...activeBuffWindowsFor(dealerName, nowMs),
      ...activeBuffWindowsFor(targetName, nowMs),
    ].filter(window => window.sourceName !== dealerName)
    const allocations = allocatePercentageBuffDamage(damage, windows)
    for (const allocation of allocations) {
      rDpsContributed.set(
        allocation.sourceName,
        (rDpsContributed.get(allocation.sourceName) ?? 0) + allocation.amount,
      )
      rDpsReceived.set(dealerName, (rDpsReceived.get(dealerName) ?? 0) + allocation.amount)
    }
  }

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

  function decodeTickAmount(hex: string, targetMaxHp?: number): number {
    if (!hex || hex === '0') return 0
    const n = parseInt(hex, 16)
    if (!Number.isFinite(n)) return 0

    const plausibleCeiling = Number.isFinite(targetMaxHp) && (targetMaxHp ?? 0) > 0
      ? Math.max(targetMaxHp as number * 2, 1_000_000)
      : 1_000_000
    if (n <= plausibleCeiling) return n

    const lower20 = n & 0xFFFFF
    if (lower20 > 0 && lower20 <= plausibleCeiling) return lower20

    const lower16 = n & 0xFFFF
    return lower16 > 0 ? lower16 : n
  }

  function normalizeEffectId(effectId: string): string {
    return (effectId || '').trim().toUpperCase()
  }

  function recordEffectName(effectId: string, effectName: string): void {
    const key = normalizeEffectId(effectId)
    const name = effectName?.trim()
    if (!key || key === '0' || !name) return
    currentEffectNames.set(key, name)
  }

  function tickEffectKey(sourceId: string, targetId: string): string {
    return `${sourceId || ''}|${targetId || ''}`
  }

  function setActiveEffects(map: Map<string, ActiveTickEffect[]>, key: string, effects: ActiveTickEffect[]): void {
    if (effects.length > 0) map.set(key, effects)
    else map.delete(key)
  }

  function activeEffectsFor(map: Map<string, ActiveTickEffect[]>, key: string): ActiveTickEffect[] {
    const active = (map.get(key) ?? []).filter(effect => effect.expiresAt > currentPullOffsetMs())
    setActiveEffects(map, key, active)
    return active
  }

  function recordActiveTickEffect(sourceId: string, targetId: string, effectId: string, effectName: string, durationSec: number): void {
    const name = effectName?.trim()
    if (!sourceId || !targetId || !name || !Number.isFinite(durationSec) || durationSec <= 0) return
    const key = tickEffectKey(sourceId, targetId)
    const nowMs = currentPullOffsetMs()
    const effects = activeEffectsFor(activeTickEffects, key)
    effects.push({
      effectId: normalizeEffectId(effectId),
      effectName: name,
      expiresAt: nowMs + durationSec * 1000,
    })
    activeTickEffects.set(key, effects)
  }

  function activeTickEffectName(sourceId: string, targetId: string): string | undefined {
    const key = tickEffectKey(sourceId, targetId)
    const active = activeEffectsFor(activeTickEffects, key)
    if (active.length === 0) return undefined
    const names = [...new Set(active.map(effect => effect.effectName))]
    return names.length === 1 ? names[0] : undefined
  }

  function jobTickFallbackName(kind: 'DoT' | 'HoT', sourceName: string, targetId: string): string | undefined {
    if (kind === 'HoT' && !isPlayerId(targetId)) return undefined
    const job = normalizeJob(currentCombatantJobs.value[sourceName] ?? '')
    return job ? JOB_TICK_FALLBACKS[job]?.[kind] : undefined
  }

  function removeActiveTickEffect(sourceId: string, targetId: string, effectId: string, effectName: string): void {
    const key = tickEffectKey(sourceId, targetId)
    const effects = activeTickEffects.get(key)
    if (!effects) return
    const normalizedId = normalizeEffectId(effectId)
    const next = effects.filter(effect =>
      effect.effectId !== normalizedId || effect.effectName !== effectName,
    )
    setActiveEffects(activeTickEffects, key, next)
  }

  function tickAbilityName(kind: 'DoT' | 'HoT', effectId: string, sourceId: string, sourceName: string, targetId: string): string {
    const key = normalizeEffectId(effectId)
    return currentEffectNames.get(key)
      ?? activeTickEffectName(sourceId, targetId)
      ?? jobTickFallbackName(kind, sourceName, targetId)
      ?? `${kind} (${effectId || 'unknown'})`
  }

  function ensureAbilityStats(combatant: CombatantAbilityData, abilityId: string, abilityName: string): AbilityStats {
    return combatant[abilityId] ??= { abilityId, abilityName, totalDamage: 0, hits: 0, maxHit: 0, minHit: Infinity }
  }

  function recordAbilityHit(
    effectiveName: string,
    abilityId: string,
    abilityName: string,
    damage: number,
    targetName: string,
    targetId = '',
    hitSeverity = 0,
  ): void {
    if (!currentAbilityData.value[effectiveName]) {
      currentAbilityData.value[effectiveName] = {}
    }
    const combatant = currentAbilityData.value[effectiveName]
    const stats = ensureAbilityStats(combatant, abilityId, abilityName)
    stats.totalDamage += damage
    stats.hits += 1
    if (damage > stats.maxHit) stats.maxHit = damage
    if (damage < stats.minHit) stats.minHit = damage
    if (hitSeverity === 0x20 || hitSeverity === 0x60) {
      stats.critHits = (stats.critHits ?? 0) + 1
      stats.critMinHit = Math.min(stats.critMinHit ?? Infinity, damage)
      stats.critMaxHit = Math.max(stats.critMaxHit ?? 0, damage)
    }
    if (hitSeverity === 0x40 || hitSeverity === 0x60) {
      stats.directHits = (stats.directHits ?? 0) + 1
      stats.directMinHit = Math.min(stats.directMinHit ?? Infinity, damage)
      stats.directMaxHit = Math.max(stats.directMaxHit ?? 0, damage)
    }
    if (hitSeverity === 0x60) {
      stats.critDirectHits = (stats.critDirectHits ?? 0) + 1
      stats.critDirectMinHit = Math.min(stats.critDirectMinHit ?? Infinity, damage)
      stats.critDirectMaxHit = Math.max(stats.critDirectMaxHit ?? 0, damage)
    }
    if (targetName) {
      stats.targets ??= {}
      const targetStats = stats.targets[targetName] ?? { total: 0, hits: 0 }
      targetStats.total += damage
      targetStats.hits += 1
      stats.targets[targetName] = targetStats
      if (targetId) {
        stats.targetInstances ??= {}
        const instanceKey = `${targetName}|${targetId}`
        const targetInstance = stats.targetInstances[instanceKey] ?? { name: targetName, id: targetId, total: 0, hits: 0 }
        targetInstance.total += damage
        targetInstance.hits += 1
        stats.targetInstances[instanceKey] = targetInstance
      }
    }

    recordTimelineBucket(currentTimeline.value, effectiveName, damage)
  }

  function actionEffectSeverity(flags: string): number {
    const parsed = parseInt(flags, 16)
    if (!Number.isFinite(parsed)) return 0
    return Math.floor(parsed / 0x100) & 0xFF
  }

  function actionEffectKind(flags: string): number {
    const parsed = parseInt(flags, 16)
    return Number.isFinite(parsed) ? parsed & 0xFF : 0
  }

  function recordActiveSelfHealingEffect(sourceId: string, targetId: string, effectId: string, effectName: string, durationSec: number): void {
    const name = effectName?.trim()
    if (!sourceId || !targetId || sourceId !== targetId || !name || !Number.isFinite(durationSec) || durationSec <= 0) return
    if (name.toLowerCase() !== 'bloodwhetting') return

    const nowMs = currentPullOffsetMs()
    const effects = activeEffectsFor(activeSelfHealingEffects, targetId)
    effects.push({
      effectId: normalizeEffectId(effectId),
      effectName: name,
      expiresAt: nowMs + durationSec * 1000,
    })
    activeSelfHealingEffects.set(targetId, effects)
  }

  function removeActiveSelfHealingEffect(sourceId: string, targetId: string, effectId: string, effectName: string): void {
    const name = effectName?.trim()
    if (!sourceId || !targetId || sourceId !== targetId || !name) return
    if (name.toLowerCase() !== 'bloodwhetting') return

    const key = normalizeEffectId(effectId)
    const effects = (activeSelfHealingEffects.get(targetId) ?? []).filter(effect => {
      if (key && effect.effectId) return effect.effectId !== key
      return effect.effectName !== name
    })
    setActiveEffects(activeSelfHealingEffects, targetId, effects)
  }

  function activeSelfHealingEffect(targetId: string): ActiveTickEffect | undefined {
    if (!targetId) return undefined
    return activeEffectsFor(activeSelfHealingEffects, targetId).at(-1)
  }

  // Check if combatant is the player's own chocobo (should exclude from casts)
  function isOwnChocobo(name: string): boolean {
    if (!name) return false
    // Chocobo named "Chocobo" or "Chocobo <PlayerName>"
    if (name === 'Chocobo') return true
    const playerName = selfName.value
    if (playerName && name.startsWith('Chocobo ') && name.includes(playerName)) return true
    return false
  }

  // Record cast event for ability usage tracking
  function recordCastEvent(
    sourceName: string,
    abilityId: string,
    abilityName: string,
    targetName: string,
    targetId: string,
    castType: 'instant' | 'cast' | 'tick',
    durationMs?: number,
  ): void {
    if (!sourceName || isOwnChocobo(sourceName)) return
    const offsetMs = currentPullOffsetMs()
    if (!currentCastData.value[sourceName]) {
      currentCastData.value[sourceName] = []
    }
    if (castType === 'instant' && hasRecentMatchingCast(sourceName, abilityId, targetName, offsetMs)) {
      return
    }
    currentCastData.value[sourceName].push({
      t: offsetMs,
      abilityId,
      abilityName,
      source: sourceName,
      target: targetName || '',
      targetId: targetId || undefined,
      type: castType,
      durationMs,
      endT: durationMs !== undefined ? offsetMs + durationMs : undefined,
    })

    const casts = currentCastData.value[sourceName]
    if (casts.length > 3000) casts.splice(0, casts.length - 3000)
  }

  function hasRecentMatchingCast(sourceName: string, abilityId: string, targetName: string, nowMs: number): boolean {
    const casts = currentCastData.value[sourceName] ?? []
    for (let i = casts.length - 1; i >= Math.max(0, casts.length - 12); i--) {
      const cast = casts[i]
      if (cast.abilityId !== abilityId) continue
      if (cast.type === 'instant' && Math.abs(nowMs - cast.t) <= 750) return true
      if (cast.type !== 'cast') continue
      if ((cast.target || '') !== (targetName || '')) continue
      const expectedEnd = cast.endT ?? cast.t
      if (Math.abs(nowMs - expectedEnd) <= 2500) return true
    }
    return false
  }

  function attachBuffDuration(sourceName: string, targetName: string, effectName: string, durationMs: number): void {
    if (!sourceName || !effectName || !Number.isFinite(durationMs) || durationMs <= 0) return
    const t = currentPullOffsetMs()
    const normalizedEffect = effectName.trim().toLowerCase()
    const sourceCasts = currentCastData.value[sourceName] ?? []
    const candidateSources = sourceName === targetName
      ? [sourceCasts]
      : [sourceCasts, currentCastData.value[targetName] ?? []]

    for (const casts of candidateSources) {
      for (let i = casts.length - 1; i >= Math.max(0, casts.length - 20); i--) {
        const cast = casts[i]
        const castName = cast.abilityName.trim().toLowerCase()
        const sameName = castName === normalizedEffect || castName.includes(normalizedEffect) || normalizedEffect.includes(castName)
        if (!sameName) continue
        if (Math.abs(t - cast.t) > 5000) continue
        cast.buffDurationMs = durationMs
        cast.effectName = effectName
        if (!cast.target && targetName) cast.target = targetName
        return
      }
    }
  }

  // Write damage/heal amount into the correct TIMELINE_BUCKET_SEC-second slot.
  function recordTimelineBucket(timeline: DpsTimeline, name: string, amount: number): void {
    const bucket = Math.floor(currentPullOffsetMs() / (TIMELINE_BUCKET_SEC * 1000))
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
  // Records at most once per second to avoid noise from frequent updates.
  let lastHpSampleTime = new Map<string, number>()
  function recordHpSample(name: string, currentHp: number, maxHp: number): void {
    if (!name || maxHp <= 0) return
    const t = currentPullOffsetMs()
    const lastT = lastHpSampleTime.get(name) ?? 0
    if (t - lastT < 1000) return
    lastHpSampleTime.set(name, t)
    const safeCurrentHp = Math.max(0, Math.min(currentHp, maxHp))
    const hp = Math.max(0, Math.min(1, safeCurrentHp / maxHp))
    if (!hpSampleBuffer.has(name)) hpSampleBuffer.set(name, [])
    const samples = hpSampleBuffer.get(name)!
    samples.push({ t, currentHp: safeCurrentHp, maxHp, hp })
    if (samples.length > 200) samples.splice(0, samples.length - 200)
  }

  function recordKnownHp(name: string, currentHp: number, maxHp: number): void {
    if (!name || !Number.isFinite(currentHp) || !Number.isFinite(maxHp) || maxHp <= 0) return
    lastKnownHp.set(name, {
      currentHp: Math.max(0, Math.min(currentHp, maxHp)),
      maxHp,
    })
  }

  function healingAmounts(targetName: string, rawHeal: number, currentHp: number, maxHp: number): { effective: number; overheal: number } {
    if (rawHeal <= 0) return { effective: 0, overheal: 0 }
    if (!targetName || !Number.isFinite(currentHp) || !Number.isFinite(maxHp) || maxHp <= 0) {
      return { effective: rawHeal, overheal: 0 }
    }

    const safeCurrentHp = Math.max(0, Math.min(currentHp, maxHp))
    const previous = lastKnownHp.get(targetName)
    let effective = rawHeal
    if (previous && previous.maxHp > 0) {
      effective = Math.max(0, Math.min(rawHeal, safeCurrentHp - previous.currentHp))
    } else if (safeCurrentHp >= maxHp) {
      effective = 0
    }

    return {
      effective,
      overheal: Math.max(0, rawHeal - effective),
    }
  }

  let lastResourceSampleTime = new Map<string, number>()

  function readCombatantNumber(c: Record<string, string>, keys: string[]): number {
    for (const key of keys) {
      const raw = c[key]
      if (raw === undefined || raw === '') continue
      const parsed = parseFloat(String(raw).replace(/,/g, ''))
      if (Number.isFinite(parsed)) return parsed
    }
    return 0
  }

  function appendResourceSample(name: string, currentHp: number, maxHp: number, throttle: boolean): ResourceSample | null {
    if (!name || !Number.isFinite(currentHp) || !Number.isFinite(maxHp) || maxHp <= 0) return null
    const t = currentPullOffsetMs()
    if (throttle) {
      const lastT = lastResourceSampleTime.get(name) ?? -Infinity
      if (t - lastT < 1000) return null
      lastResourceSampleTime.set(name, t)
    }
    const safeCurrentHp = Math.max(0, Math.min(currentHp, maxHp))
    const sample: ResourceSample = {
      t,
      currentHp: safeCurrentHp,
      maxHp,
      hp: Math.max(0, Math.min(1, safeCurrentHp / maxHp)),
    }

    if (!currentResourceData.value[name]) currentResourceData.value[name] = []
    const samples = currentResourceData.value[name]
    samples.push(sample)
    if (samples.length > 900) samples.splice(0, samples.length - 900)
    return sample
  }

  function recordResourceSample(c: Record<string, string>): void {
    const name = c.name
    if (!name) return
    const maxHp = readCombatantNumber(c, ['maxhp', 'MaxHP', 'MAXHP', 'maxHp'])
    const currentHp = readCombatantNumber(c, ['currenthp', 'CurrentHP', 'CURRENTHP', 'hp', 'HP'])
    if (maxHp <= 0) return

    const sample = appendResourceSample(name, currentHp, maxHp, true)

    const maxMp = readCombatantNumber(c, ['maxmp', 'MaxMP', 'MAXMP', 'maxMp'])
    const currentMp = readCombatantNumber(c, ['currentmp', 'CurrentMP', 'CURRENTMP', 'mp', 'MP'])
    if (sample && maxMp > 0) {
      const safeCurrentMp = Math.max(0, Math.min(currentMp, maxMp))
      sample.currentMp = safeCurrentMp
      sample.maxMp = maxMp
      sample.mp = Math.max(0, Math.min(1, safeCurrentMp / maxMp))
    }
  }

  function recordEnemyResourceSample(name: string, id: string, currentHp: number, maxHp: number): void {
    if (!isEnemyId(id)) return
    appendResourceSample(name, currentHp, maxHp, false)
  }

  // Push a damage/heal event into the rolling hit buffer for a target (max 800 per combatant).
  function recordHitEvent(
    targetName: string,
    type: 'dmg' | 'heal',
    abilityName: string,
    sourceName: string,
    amount: number,
    currentHp?: number,
    maxHp?: number,
  ): void {
    if (!targetName || amount === 0) return
    const t = currentPullOffsetMs()
    if (!hitEventBuffer.has(targetName)) hitEventBuffer.set(targetName, [])
    const buf = hitEventBuffer.get(targetName)!
    const safeMaxHp = Number.isFinite(maxHp) && (maxHp ?? 0) > 0 ? maxHp : undefined
    const safeCurrentHp = safeMaxHp !== undefined && Number.isFinite(currentHp)
      ? Math.max(0, Math.min(currentHp ?? 0, safeMaxHp))
      : undefined
    buf.push({
      t,
      type,
      abilityName,
      sourceName,
      amount,
      currentHp: safeCurrentHp,
      maxHp: safeMaxHp,
      hp: safeCurrentHp !== undefined && safeMaxHp !== undefined ? Math.max(0, Math.min(1, safeCurrentHp / safeMaxHp)) : undefined,
    })
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
    const stats = ensureAbilityStats(combatant, abilityId, abilityName)
    stats.totalDamage += damage
    stats.hits++
    if (damage > stats.maxHit) stats.maxHit = damage
    if (damage < stats.minHit) stats.minHit = damage
  }

  // Record per-ability healing received by a target (for Breakdown "Healing Received" view).
  function recordHealingReceived(
    targetName: string,
    abilityId: string,
    abilityName: string,
    healing: number,
    sourceName: string,
    overheal = 0,
  ): void {
    if (!targetName || !abilityId || (healing === 0 && overheal === 0)) return
    if (!currentHealingReceivedData.value[targetName]) {
      currentHealingReceivedData.value[targetName] = {}
    }
    const combatant = currentHealingReceivedData.value[targetName]
    const stats = ensureAbilityStats(combatant, abilityId, abilityName)
    stats.totalDamage += healing
    stats.overheal = (stats.overheal ?? 0) + overheal
    stats.hits++
    const rawHealing = healing + overheal
    if (rawHealing > stats.maxHit) stats.maxHit = rawHealing
    if (rawHealing < stats.minHit) stats.minHit = rawHealing
    if (sourceName) {
      stats.sources ??= {}
      const sourceStats = stats.sources[sourceName] ?? { total: 0, hits: 0 }
      sourceStats.total += healing
      sourceStats.overheal = (sourceStats.overheal ?? 0) + overheal
      sourceStats.hits += 1
      stats.sources[sourceName] = sourceStats
    }
  }

  function onLogLine(event: LogLineEvent): void {
    const parts = event.rawLine.split('|')
    const lineType = parts[0]
    const parsedLogTime = Date.parse(parts[1] ?? '')
    currentLogTime = Number.isFinite(parsedLogTime) ? parsedLogTime : null

    if (lineType === '20') {
      // NetworkStartsCasting
      // parts: [0]=type [1]=ts [2]=srcId [3]=srcName [4]=abilId [5]=abilName
      //        [6]=tgtId [7]=tgtName [8]=castTimeSec
      const sourceId    = parts[2]
      const sourceName  = parts[3]
      const abilityId   = parts[4]
      const abilityName = parts[5]
      const targetId    = parts[6]
      const targetName  = parts[7]
      const castTimeSec = parseFloat(parts[8])
      if (!sourceName || !abilityId || !Number.isFinite(castTimeSec) || castTimeSec <= 0) return
      recordCombatantId(sourceName, sourceId)
      recordCombatantId(targetName, targetId)
      recordCastEvent(sourceName, abilityId, abilityName, targetName, targetId, 'cast', Math.round(castTimeSec * 1000))
      scheduleBroadcast()

    } else if (lineType === '21' || lineType === '22') {
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
      const srcCurrentHp = parseInt(parts[34], 10)
      const srcMaxHp     = parseInt(parts[35], 10)
      const petOwnerName = parts[48]
      const effectiveName = petOwnerName || sourceName
      const flagByte     = actionEffectKind(flags)

      maybeResetForNetworkEnemyInstance(sourceName, sourceId, srcMaxHp)
      maybeResetForNetworkEnemyInstance(targetName, targetId, tgtMaxHp)
      recordCombatantId(sourceName, sourceId)
      recordCombatantId(targetName, targetId)
      if (effectiveName && abilityId) {
        recordCastEvent(effectiveName, abilityId, abilityName, targetName, targetId, 'instant')
      }

      let didRecord = false
      if (flagByte === 0x03) {
        // Damage hit — attribute to source for DPS, to target for DTPS
        const damage = decodeLogDamage(damageHex)
        if (damage > 0 && effectiveName && abilityId) {
          recordAbilityHit(effectiveName, abilityId, abilityName, damage, targetName, targetId, actionEffectSeverity(flags))
          didRecord = true
        }
        if (damage > 0 && targetName) {
          recordDamageTaken(targetName, abilityId, abilityName, damage)
          recordTimelineBucket(currentDtakenTimeline.value, targetName, damage)
          recordEnemyResourceSample(targetName, targetId, tgtCurrentHp, tgtMaxHp)
          recordHitEvent(targetName, 'dmg', abilityName, effectiveName, damage, tgtCurrentHp, tgtMaxHp)
          attributeRaidBuffContribution(effectiveName, petOwnerName ? parts[47] : sourceId, targetName, targetId, damage)
          recordHpSample(targetName, tgtCurrentHp, tgtMaxHp)
          recordKnownHp(targetName, tgtCurrentHp, tgtMaxHp)
        }
      } else if (flagByte === 0x04) {
        // Heal hit — attribute to source for HPS, to target for incoming heals
        const heal = decodeLogDamage(damageHex)
        if (heal > 0 && effectiveName) {
          const { effective: appliedHeal, overheal } = healingAmounts(targetName, heal, tgtCurrentHp, tgtMaxHp)
          if (appliedHeal > 0) recordTimelineBucket(currentHealTimeline.value, effectiveName, appliedHeal)
          if (targetName) {
            if (abilityId && (appliedHeal > 0 || overheal > 0)) recordHealingReceived(targetName, abilityId, abilityName, appliedHeal, effectiveName, overheal)
            if (appliedHeal > 0) recordHitEvent(targetName, 'heal', abilityName, effectiveName, appliedHeal, tgtCurrentHp, tgtMaxHp)
          }
          didRecord = didRecord || appliedHeal > 0 || overheal > 0
        }
        if (targetName) {
          recordHpSample(targetName, tgtCurrentHp, tgtMaxHp)
          recordKnownHp(targetName, tgtCurrentHp, tgtMaxHp)
        }
      }

      for (let i = 1; i < 8; i++) {
        const effectFlags = parts[8 + i * 2]
        const effectAmountHex = parts[9 + i * 2]
        if (actionEffectKind(effectFlags) !== 0x04) continue
        const heal = decodeLogDamage(effectAmountHex)
        if (heal <= 0 || !effectiveName) continue

        const selfHealingEffect = isEnemyId(targetId) && isPlayerId(sourceId) ? activeSelfHealingEffect(sourceId) : undefined
        const healTargetName = selfHealingEffect ? sourceName : targetName
        const healTargetCurrentHp = selfHealingEffect ? srcCurrentHp : tgtCurrentHp
        const healTargetMaxHp = selfHealingEffect ? srcMaxHp : tgtMaxHp
        const healAbilityId = selfHealingEffect ? `effect:${selfHealingEffect.effectId}` : abilityId
        const healAbilityName = selfHealingEffect ? selfHealingEffect.effectName : abilityName
        if (!healTargetName || !healAbilityId) continue

        const { effective: appliedHeal, overheal } = healingAmounts(healTargetName, heal, healTargetCurrentHp, healTargetMaxHp)
        if (appliedHeal <= 0 && overheal <= 0) continue

        if (appliedHeal > 0) recordTimelineBucket(currentHealTimeline.value, effectiveName, appliedHeal)
        recordHealingReceived(healTargetName, healAbilityId, healAbilityName, appliedHeal, effectiveName, overheal)
        if (appliedHeal > 0) recordHitEvent(healTargetName, 'heal', healAbilityName, effectiveName, appliedHeal, healTargetCurrentHp, healTargetMaxHp)
        recordHpSample(healTargetName, healTargetCurrentHp, healTargetMaxHp)
        recordKnownHp(healTargetName, healTargetCurrentHp, healTargetMaxHp)
        didRecord = true
      }

      if (didRecord) scheduleBroadcast()

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

      if (dotType === 'DoT') {
        if (!sourceName || !effectId) return
        const abilityName = tickAbilityName('DoT', effectId, sourceId, sourceName, targetId)
        const damage = decodeTickAmount(damageHex, tgtMaxHp)
        if (damage === 0) return
        recordAbilityHit(sourceName, `dot:${effectId}`, abilityName, damage, targetName, targetId)
        recordCastEvent(sourceName, `dot:${effectId}`, abilityName, targetName, targetId, 'tick')
        if (targetName) {
          recordDamageTaken(targetName, `dot:${effectId}`, abilityName, damage)
          recordTimelineBucket(currentDtakenTimeline.value, targetName, damage)
          recordEnemyResourceSample(targetName, targetId, tgtCurrentHp, tgtMaxHp)
          recordHitEvent(targetName, 'dmg', abilityName, sourceName, damage, tgtCurrentHp, tgtMaxHp)
          attributeRaidBuffContribution(sourceName, sourceId, targetName, targetId, damage)
          recordHpSample(targetName, tgtCurrentHp, tgtMaxHp)
          recordKnownHp(targetName, tgtCurrentHp, tgtMaxHp)
        }
        scheduleBroadcast()
      } else if (dotType === 'HoT') {
        if (!sourceName) return
        const abilityName = tickAbilityName('HoT', effectId, sourceId, sourceName, targetId)
        const heal = decodeTickAmount(damageHex, tgtMaxHp)
        if (heal === 0) return
        const { effective: appliedHeal, overheal } = healingAmounts(targetName, heal, tgtCurrentHp, tgtMaxHp)
        if (appliedHeal > 0) recordTimelineBucket(currentHealTimeline.value, sourceName, appliedHeal)
        recordCastEvent(sourceName, `hot:${effectId}`, abilityName, targetName, targetId, 'tick')
        if (targetName) {
          if (appliedHeal > 0 || overheal > 0) recordHealingReceived(targetName, `hot:${effectId}`, abilityName, appliedHeal, sourceName, overheal)
          if (appliedHeal > 0) recordHitEvent(targetName, 'heal', abilityName, sourceName, appliedHeal, tgtCurrentHp, tgtMaxHp)
          recordHpSample(targetName, tgtCurrentHp, tgtMaxHp)
          recordKnownHp(targetName, tgtCurrentHp, tgtMaxHp)
        }
        scheduleBroadcast()
      }

    } else if (lineType === '25') {
      // NetworkDeath
      // parts: [0]=type [1]=ts [2]=targetId [3]=targetName [4]=sourceId [5]=sourceName
      const targetId   = parts[2]
      const targetName = parts[3]
      if (!targetId || !targetName) return
      const t = currentPullOffsetMs()
      if (targetId.startsWith('40')) {
        recordCombatantId(targetName, targetId)
        currentEnemyDeaths.value[targetId ? `${targetName}|${targetId}` : targetName] = t
        currentEnemyDeaths.value[targetName] = t
        const latest = currentResourceData.value[targetName]?.at(-1)
        if (latest) appendResourceSample(targetName, 0, latest.maxHp, false)
        scheduleBroadcast()
        return
      }
      // Only track player deaths (FFXIV player IDs start with byte 10)
      if (!targetId.startsWith('10')) return
      const cutoff = t - 35000  // 35 seconds before death to capture more
      const samples  = hpSampleBuffer.get(targetName) ?? []
      const hitsBuf  = hitEventBuffer.get(targetName)  ?? []
      // Include the death event as the final hit
      const deathHit = { t, type: 'dmg' as const, abilityName: 'Death', sourceName: '---', amount: 0, currentHp: 0, maxHp: samples[samples.length - 1]?.maxHp, hp: 0 }
      const allHits = [...hitsBuf.filter(h => h.t >= cutoff), deathHit]
      const recentSamples = samples.filter(s => s.t >= cutoff)
      const deathIndex = currentDeaths.value.length
      currentDeaths.value.push({
        targetName,
        targetId,
        timestamp: t,
        hpSamples: recentSamples,
        lastHits: allHits,
        events: buildDeathEvents(recentSamples, allHits, t),
      })
      // Track this death for later resurrection update
      pendingDeathUpdates.set(targetName, deathIndex)
      scheduleBroadcast()
    } else if (lineType === '26') {
      // NetworkGainsEffect
      // parts: [0]=type [1]=ts [2]=effectId [3]=effectName [4]=durationSec
      //        [5]=sourceId [6]=sourceName [7]=targetId [8]=targetName
      const effectId = parts[2]
      const effectName = parts[3]
      const durationSec = parseFloat(parts[4])
      const sourceId = parts[5]
      const sourceName = parts[6]
      const targetId = parts[7]
      const targetName = parts[8]
      if (!targetId || !targetName) return
      recordEffectName(effectId, effectName)
      recordActiveTickEffect(sourceId, targetId, effectId, effectName, durationSec)
      recordActiveSelfHealingEffect(sourceId, targetId, effectId, effectName, durationSec)
      attachBuffDuration(sourceName, targetName, effectName, Math.round(durationSec * 1000))

      // rDPS: track raid buff windows (source must differ from target)
      if (isPlayerId(sourceId) && sourceName && targetName && sourceName !== targetName) {
        const buffKey = effectName?.trim().toLowerCase()
        const buff = buffKey ? RAID_BUFFS[buffKey] : undefined
        if (buff) {
          const windows = activeRaidBuffs.get(targetName) ?? []
          const durationMs = Number.isFinite(durationSec) ? Math.max(0, durationSec * 1000) : 0
          const nextWindow = {
            sourceName,
            effectName,
            multiplier: buff.multiplier,
            expiresAt: currentPullOffsetMs() + durationMs,
          }
          const existingIndex = windows.findIndex(window =>
            window.sourceName === sourceName && window.effectName === effectName,
          )
          if (existingIndex === -1) windows.push(nextWindow)
          else windows[existingIndex] = nextWindow
          activeRaidBuffs.set(targetName, windows)
        }
      }

      // Only track player resurrections
      if (!targetId.startsWith('10')) return
      // Match known resurrection effects exactly so unrelated buffs don't count as raises.
      const normalizedEffectName = effectName?.trim().toLowerCase()
      const raiseEffects = new Set(['raise', 'angel whisper', 'resurrection', 'life ascension', 'reraise iii'])
      const isRaise = normalizedEffectName ? raiseEffects.has(normalizedEffectName) : false
      if (isRaise) {
        const rTime = currentPullOffsetMs()
        resurrectTimes.value[targetName] = rTime
        // Update the death record if we have a pending one
        const deathIdx = pendingDeathUpdates.get(targetName)
        if (deathIdx !== undefined && currentDeaths.value[deathIdx]) {
          currentDeaths.value[deathIdx].resurrectTime = rTime
          currentDeaths.value[deathIdx].resurrectSourceName = sourceName
        }
        pendingDeathUpdates.delete(targetName)
        scheduleBroadcast()
      }
    } else if (lineType === '30') {
      // NetworkLosesEffect
      // parts: [0]=type [1]=ts [2]=effectId [3]=effectName [4]=duration
      //        [5]=sourceId [6]=sourceName [7]=targetId [8]=targetName
      const effectName = parts[3]
      const effectId = parts[2]
      const sourceId = parts[5]
      const sourceName = parts[6]
      const targetId = parts[7]
      const targetName = parts[8]
      if (!effectName || !sourceName || !targetName) return
      removeActiveTickEffect(sourceId, targetId, effectId, effectName)
      removeActiveSelfHealingEffect(sourceId, targetId, effectId, effectName)
      const buffKey = effectName.trim().toLowerCase()
      if (!RAID_BUFFS[buffKey]) return
      const windows = activeRaidBuffs.get(targetName)
      if (!windows) return
      let idx = -1
      for (let i = windows.length - 1; i >= 0; i--) {
        if (windows[i].sourceName === sourceName && windows[i].effectName === effectName) { idx = i; break }
      }
      if (idx !== -1) windows.splice(idx, 1)
    }
  }

  function resetAbilityData(): void {
    currentAbilityData.value = {}
    currentTimeline.value = {}
    currentHealTimeline.value = {}
    currentDtakenTimeline.value = {}
    currentDamageByCombatant.value = {}
    currentDpsByCombatant.value = {}
    currentDtakenData.value = {}
    currentHealingReceivedData.value = {}
    currentRdpsByCombatant.value = {}
    currentCombatantIds.value = {}
    currentCombatantJobs.value = {}
    currentDeaths.value = []
    currentEnemyDeaths.value = {}
    hpSampleBuffer.clear()
    hitEventBuffer.clear()
    lastKnownHp.clear()
    currentCastData.value = {}
    currentResourceData.value = {}
    currentEffectNames.clear()
    activeTickEffects.clear()
    activeSelfHealingEffects.clear()
    resurrectTimes.value = {}
    pendingDeathUpdates.clear()
    lastResourceSampleTime.clear()
    activeRaidBuffs.clear()
    rDpsContributed.clear()
    rDpsReceived.clear()
    networkEnemyInstances.clear()
    pullStartTime = Date.now()
    pullStartLogTime = 0
    broadcastEncounterData()
  }

  // ─── Pull history ────────────────────────────────────────────────────────────
  function detectNewPull(event: CombatDataEvent): void {
    const title = event.Encounter['title'] ?? ''
    // Use DURATION (integer seconds) for numeric comparison — avoids lexicographic
    // failures on 10+ min fights where "10:00" < "09:59" as strings
    const duration = parseInt(event.Encounter['DURATION'] ?? '0', 10) || 0
    const lastDuration = parseInt(lastEncounterStart || '0', 10) || 0
    const titleChanged = !!title && title !== lastEncounterTitle
    const durationRewound = !!title && title === lastEncounterTitle && lastDuration > 0 && duration + 2 < lastDuration

    if (titleChanged || durationRewound) {
      resetAbilityData()
    }

    if (title) lastEncounterTitle = title
    lastEncounterStart = String(duration)
  }

  function stashPull(event: CombatDataEvent): void {
    const title = event.Encounter['title'] ?? ''
    if (!title) return

    const { combatants } = resolvePets(event.Combatant, profile.value.global.pets)
    const stashDuration = parseFloat(event.Encounter['DURATION'] ?? '0') || 1
    for (const c of combatants) {
      const baseDamage  = parseFloat(c['damage'] ?? '0')
      const contributed = rDpsContributed.get(c.name) ?? 0
      const received    = rDpsReceived.get(c.name) ?? 0
      const rdps = Math.max(0, (baseDamage + contributed - received) / stashDuration)
      c['rdps'] = String(Math.round(rdps))
    }
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
      healingReceivedData: deepClone(currentHealingReceivedData.value),
      hitData:          snapshotHitData(),
      rdpsGiven:        mapToRateRecord(rDpsContributed, stashDuration),
      rdpsTaken:        mapToRateRecord(rDpsReceived, stashDuration),
      deaths:           deepClone(currentDeaths.value),
      enemyDeaths:      deepClone(currentEnemyDeaths.value),
      combatantIds:     deepClone(currentCombatantIds.value),
      combatantJobs:    deepClone(currentCombatantJobs.value),
      castData:         deepClone(currentCastData.value),
      resourceData:     deepClone(currentResourceData.value),
      partyData:        deepClone(partyData.value),
    }

    // Avoid duplicate stashes for same pull
    const last = sessionPulls.value[0]
    if (last?.encounterName === record.encounterName && last?.duration === record.duration) return

    sessionPulls.value = [record, ...sessionPulls.value].slice(0, 15)
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
    partyData.value = event.party.map(p => ({ id: p.id, name: p.name, worldId: p.worldId, inParty: p.inParty, partyType: p.partyType, job: normalizeJob(p.job ?? '') }))
    for (const member of event.party) {
      const job = normalizeJob(member.job ?? '')
      if (member.name && job) currentCombatantJobs.value[member.name] = job
    }
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
        if (message?.source === 'act-flexi-editor' && isProfileLike(message.msg)) {
          applyConfig(message.msg as Profile)
        }
      } catch {
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
        if (message?.source === 'act-flexi-editor' && message.timestamp !== lastConfigTimestamp && isProfileLike(message.msg)) {
          lastConfigTimestamp = message.timestamp
          applyConfig(message.msg as Profile)
        }
      } catch {
        /* corrupt sync message */
      }
    }
    // Also check for persistent config on first few polls (helps with slow CEF initialization)
    if (pollCount < 10) {
      const persistent = localStorage.getItem('act-flexi-profile') || localStorage.getItem('act-flexi-overlay-config')
      if (persistent && !lastPersistentConfig) {
        lastPersistentConfig = persistent
        const parsed = parseProfileSafe(persistent)
        if (parsed) {
          applyConfig(parsed as Profile)
        } else {
          console.warn('[liveData] persistent config is malformed, skipping')
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
          const payload = buildBreakdownPayload(undefined, idx)
          persistBreakdownPayload(payload)
          breakdownChannel?.postMessage(payload)
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
      pollInterval = setInterval(pollForConfig, CONFIG_POLL_INTERVAL_MS)
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
      scheduleBroadcast()
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

    const historicalParty = pull.partyData ?? []
    const metricFractionContext = createMetricFractionContext(pull.combatants)

    const bars: BarFrame[] = pull.combatants.map((c, i) => {
      const rawVal = profile.value.global.dpsType === 'dtps'
        ? getDtpsValue(c)
        : parseFloat(c[profile.value.global.dpsType] ?? '0')
      return {
        name: c.name,
        job: normalizeJob(c['Job'] ?? ''),
        partyGroup: partyGroupFor(c.name, historicalParty),
        fillFraction: rawVal / (maxVal || 1),
        displayValue: formatValue(rawVal, profile.value.global.valueFormat),
        displayPct: c['damage%'] ?? '0',
        deaths: c.deaths ?? '0',
        crithit: c['crithit%'] ?? '---',
        directhit: c['DirectHitPct'] ?? '---',
        tohit: c.tohit ?? '---',
        enchps: formatValue(parseFloat(c.enchps ?? '0'), profile.value.global.valueFormat),
        rdps: formatValue(parseFloat(c['rdps'] ?? '0'), profile.value.global.valueFormat),
        rawValue: rawVal,
        rawEnchps: parseFloat(c.enchps ?? '0'),
        rawRdps: parseFloat(c['rdps'] ?? '0'),
        maxHit: (c.maxhit ?? '---').replace('-', ' '),
        metricFractions: buildMetricFractions(metricFractionContext, c),
        alpha: 1,
        rank: i + 1,
      }
    })

    engine.push({
      bars,
      encounterTitle: pull.encounterName,
      encounterDuration: pull.duration,
      totalDps: formatValue(parseFloat(pull.encounter['ENCDPS'] ?? '0'), profile.value.global.valueFormat),
      totalHps: formatValue(parseFloat(pull.encounter['ENCHPS'] ?? '0'), profile.value.global.valueFormat),
      totalDtps: formatValue(parseFloat(pull.encounter['damagetaken'] ?? '0') / (parseFloat(pull.encounter['DURATION'] ?? '0') || 1), profile.value.global.valueFormat),
      totalRdps: formatValue(
        bars.reduce((s, b) => s + parseFloat(b.rdps ?? '0'), 0),
        profile.value.global.valueFormat,
      ),
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
    setCombatantFilter: (filter: 'all' | 'alliance' | 'party' | 'self') => {
      profile.value.global.combatantFilter = filter
      profile.value.global.partyOnly = filter === 'party' || filter === 'alliance'
      profile.value.global.selfOnly = filter === 'self'
    },
    toggleBlurNames: () => { profile.value.global.blurNames = !profile.value.global.blurNames },
    setHeaderPinned: (pinned: boolean) => { profile.value.global.header.pinned = pinned },
    setMergePets: (merge: boolean) => { profile.value.global.mergePets = merge },
  }
})
