<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { formatValue } from '@shared/formatValue'
import type { CombatantAbilityData, DpsTimeline, DeathRecord, DeathEvent, CastEvent, ResourceSample } from '@shared/configSchema'
import { TIMELINE_BUCKET_SEC } from '@shared/configSchema'
import { getJobIconSrc, normalizeJob } from '@shared/jobMap'
import { abilityInitials, resolveAbilityInfo } from '@shared/abilityIcons'
import ActorRail from './AbilityBreakdown/ActorRail.vue'
import AbilityCell from './AbilityBreakdown/AbilityCell.vue'
import type { BreakdownView, CastFilter, CombatantGroup, EventActorScope, EventFilter, PartyMemberData, PullEntry, ResourceTrackKey, TimelineOverlay } from './AbilityBreakdown/types'
import { deathEventsFor, deathHpBars as buildDeathHpBars, formatHpBefore as formatDeathHpBefore, formatHpValue as formatDeathHpValue, sortPlayerDeaths } from './AbilityBreakdown/deathTransforms'
import { useEventRows } from './AbilityBreakdown/eventRows'
import { useBreakdownViewState } from './AbilityBreakdown/viewState'

// ── State from main window ────────────────────────────────────────────────────
const allData             = ref<Record<string, CombatantAbilityData>>({})
const dpsTimeline         = ref<DpsTimeline>({})
const hpsTimeline         = ref<DpsTimeline>({})
const dtakenTimeline      = ref<DpsTimeline>({})
const rdpsByCombatant     = ref<Record<string, number>>({})
const rdpsGiven           = ref<Record<string, number>>({})
const rdpsTaken           = ref<Record<string, number>>({})
const selfName            = ref('')
const blurNames           = ref(false)
const partyNames          = ref<string[]>([])
const selected            = ref('')
const pullList            = ref<PullEntry[]>([])
const activePull          = ref<number | null>(null)
const encounterDurationSec = ref(0)
const hiddenSeries        = ref<Set<string>>(new Set())
const damageTakenData     = ref<Record<string, CombatantAbilityData>>({})
const healingReceivedData = ref<Record<string, CombatantAbilityData>>({})
const deaths              = ref<DeathRecord[]>([])
const combatantIds        = ref<Record<string, string>>({})
const combatantJobs       = ref<Record<string, string>>({})
const showEnemies         = ref(false)
const summaryMode         = ref<'done' | 'taken'>('done')
const lastBroadcastTime   = ref(0)
const castData            = ref<Record<string, CastEvent[]>>({})
const resourceData        = ref<Record<string, ResourceSample[]>>({})

const {
  activeView,
  chartMetric,
  selectedAbility,
  doneDimension,
  takenMode,
  deathInspectorTab,
  eventWindowOnly,
  eventActorScope,
  eventFilters,
  timelineOverlays,
  timelineFocusBucket,
  castFilters,
  viewTabs,
  toggleTimelineOverlay,
  toggleEventFilter,
  toggleCastFilter,
  openTimelineAtBucket,
} = useBreakdownViewState()

const initialView = localStorage.getItem('flexi-breakdown-view')
if (initialView === 'pulls') {
  activeView.value = 'pulls'
  localStorage.removeItem('flexi-breakdown-view')
}

// Cast timeline hover state
const castHoverData = ref<{ time: number; ability: string; target: string; x: number; y: number } | null>(null)
const abilityIconSrcs = ref<Record<string, string>>({})
const abilityCooldownMs = ref<Record<string, number>>({})
const abilityIconRequested = new Set<string>()

const partyData = ref<PartyMemberData[]>([])

// Helper to format partyType with space (AllianceA -> "Alliance A")
function formatPartyLabel(pt: string | undefined, isSelf: boolean, partyIdx?: number, totalPartySize?: number): string {
  // If ACT says Solo/Party but we have >8 members (alliance), use position-based
  // Only if player IS in partyData (partyIdx !== undefined) - else use ACT's partyType as-is
  if (totalPartySize !== undefined && totalPartySize > 8 && partyIdx !== undefined && (!pt || pt === 'Solo' || pt === 'Party')) {
    const allianceParty = Math.floor(partyIdx / 8)
    const label = ['Alliance A', 'Alliance B', 'Alliance C'][allianceParty] ?? 'Party'
    return isSelf ? `${label} (YOU)` : label
  }
  // If solo-queued in 8-man (total 8), treat 'Solo' as 'Party' to keep everyone together
  if (totalPartySize !== undefined && totalPartySize <= 8) {
    if (!pt || pt === 'Solo') return 'Party'
    return pt.replace(/^Alliance/, 'Alliance ')
  }
  // For alliance >8 without partyType, fallback
  if (!pt) return 'Party'
  const label = pt.replace(/^Alliance/, 'Alliance ')
  return label
}

// Toggle to show friendly NPCs (Non-player companions, minions that deal damage, etc.)
const showFriendlyNPCs = ref(false)

// Track last pull index so we can reset hiddenSeries on pull change
let lastAutoHidePull: number | null | undefined = undefined

const initName = localStorage.getItem('flexi-breakdown-init') ?? ''

// ── Combatants / blur ─────────────────────────────────────────────────────────
const combatants = computed(() => Object.keys(allData.value))

function isEnemy(name: string): boolean {
  const id = combatantIds.value[name]
  return !!id && id.startsWith('40')
}

function isNPC(name: string): boolean {
  const id = combatantIds.value[name]
  if (!id) return false
  // NPC IDs typically start with 00 or E (friendly NPCs, minions, companions)
  // Player IDs start with 10, Enemy IDs start with 40
  return !id.startsWith('10') && !id.startsWith('40') && !id.startsWith('00')
}

const visibleCombatants = computed(() =>
  combatants.value.filter(n => (showEnemies.value || !isEnemy(n)) && (showFriendlyNPCs.value || !isNPC(n)))
)

const combatantGroups = computed<CombatantGroup[]>(() => {
  const all = visibleCombatants.value
  if (all.length === 0) return []

  const nameToPartyType = new Map<string, { pt: string | undefined; idx: number }>()
  for (let i = 0; i < partyData.value.length; i++) {
    const p = partyData.value[i]
    nameToPartyType.set(p.name, { pt: p.partyType, idx: i })
  }

  const selfPartyInfo = nameToPartyType.get(selfName.value)
  const selfPartyType = selfPartyInfo?.pt
  const selfIdx = selfPartyInfo?.idx ?? 0
  const isAlliance = partyData.value.length > 8

  const partyMap = new Map<string, string[]>()

  for (const name of all) {
    const info = nameToPartyType.get(name)
    const isSelf = name === selfName.value
    const label = formatPartyLabel(info?.pt, isSelf, info?.idx, partyData.value.length)

    if (!partyMap.has(label)) partyMap.set(label, [])
    partyMap.get(label)!.push(name)
  }

  const groups: CombatantGroup[] = []

  if (isAlliance && (selfPartyType || selfIdx >= 8)) {
    const selfLabel = formatPartyLabel(selfPartyType, true, selfIdx, partyData.value.length)
    const selfParty = partyMap.get(selfLabel)
    if (selfParty) {
      groups.push({ label: selfLabel, names: selfParty, collapsed: false })
    }

    for (const [label, names] of partyMap) {
      if (label !== selfLabel) {
        groups.push({ label, names, collapsed: true })
      }
    }
  } else {
    const selfLabel = formatPartyLabel(selfPartyType, true, selfIdx, partyData.value.length)
    for (const [label, names] of partyMap) {
      groups.push({ label, names, collapsed: label !== selfLabel })
    }
  }

  if (groups.length === 0) groups.push({ label: 'All', names: all, collapsed: false })

  return groups
})

// Track collapsed state for groups
const groupCollapsed = ref<Set<string>>(new Set())

function toggleGroup(label: string) {
  if (groupCollapsed.value.has(label)) {
    groupCollapsed.value.delete(label)
  } else {
    groupCollapsed.value.add(label)
  }
}

const resolvedSelected = computed(() => {
  const visible = visibleCombatants.value
  if (selected.value && allData.value[selected.value] && visible.includes(selected.value)) return selected.value
  if (initName && allData.value[initName] && visible.includes(initName)) return initName
  if (selfName.value && allData.value[selfName.value]) return selfName.value
  return visible[0] ?? ''
})

function tabLabel(name: string): string {
  return name
}

function actorJob(name: string): string {
  const direct = combatantJobs.value[name]
  if (direct) return normalizeJob(direct)
  const partyJob = partyData.value.find(member => member.name === name)?.job
  return partyJob ? normalizeJob(partyJob) : ''
}

function actorJobIcon(name: string): string {
  const job = actorJob(name)
  return job ? getJobIconSrc(job) : ''
}

const blurTextStyle = {
  fontFamily: "'redacted-script-bold', monospace",
  filter: 'blur(1px)',
  userSelect: 'none' as const,
  letterSpacing: '-0.04em',
}

function nameStyle(name: string) {
  return blurNames.value && name !== selfName.value && name !== 'YOU'
    ? blurTextStyle : undefined
}

// ── Summary ───────────────────────────────────────────────────────────────────
const rawData = computed(() => allData.value[resolvedSelected.value] ?? {})

const playerTotal = computed(() =>
  Object.values(rawData.value).reduce((s, a) => s + a.totalDamage, 0)
)

const encounterTotal = computed(() =>
  Object.values(allData.value).reduce((sum, c) =>
    sum + Object.values(c).reduce((s, a) => s + a.totalDamage, 0), 0)
)

const abilities = computed(() =>
  Object.values(rawData.value)
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .map(a => ({
      ...a,
      pct:    playerTotal.value > 0 ? ((a.totalDamage / playerTotal.value) * 100).toFixed(1) : '0.0',
      avg:    a.hits > 0 ? Math.round(a.totalDamage / a.hits) : 0,
      dps:    encounterDurationSec.value > 0 ? Math.round(a.totalDamage / encounterDurationSec.value) : 0,
      minHit: a.minHit === Infinity ? 0 : a.minHit,
    }))
)

// ── Damage Taken (Summary "Taken" mode) ──────────────────────────────────────
const takenRawData = computed(() => damageTakenData.value[resolvedSelected.value] ?? {})

const takenTotal = computed(() =>
  Object.values(takenRawData.value).reduce((s, a) => s + a.totalDamage, 0)
)

const takenAbilities = computed(() =>
  Object.values(takenRawData.value)
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .map(a => ({
      ...a,
      pct:    takenTotal.value > 0 ? ((a.totalDamage / takenTotal.value) * 100).toFixed(1) : '0.0',
      avg:    a.hits > 0 ? Math.round(a.totalDamage / a.hits) : 0,
      dps:    encounterDurationSec.value > 0 ? Math.round(a.totalDamage / encounterDurationSec.value) : 0,
      minHit: a.minHit === Infinity ? 0 : a.minHit,
    }))
)

const healingRawData = computed(() => healingReceivedData.value[resolvedSelected.value] ?? {})

const healingTotal = computed(() =>
  Object.values(healingRawData.value).reduce((s, a) => s + a.totalDamage, 0)
)

const healingAbilities = computed(() =>
  Object.values(healingRawData.value)
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .map(a => ({
      ...a,
      pct:    healingTotal.value > 0 ? ((a.totalDamage / healingTotal.value) * 100).toFixed(1) : '0.0',
      avg:    a.hits > 0 ? Math.round(a.totalDamage / a.hits) : 0,
      dps:    encounterDurationSec.value > 0 ? Math.round(a.totalDamage / encounterDurationSec.value) : 0,
      minHit: a.minHit === Infinity ? 0 : a.minHit,
    }))
)

const incomingAbilities = computed(() => takenMode.value === 'healing' ? healingAbilities.value : takenAbilities.value)

const activeTableRows  = computed(() => summaryMode.value === 'taken' ? takenAbilities.value  : abilities.value)
const activeTableTotal = computed(() => summaryMode.value === 'taken' ? takenTotal.value      : playerTotal.value)

const currentPullEntry = computed(() =>
  pullList.value.find(entry => entry.index === activePull.value) ?? null
)

const currentEncounterName = computed(() =>
  currentPullEntry.value?.encounterName ?? ''
)

const currentEncounterDuration = computed(() =>
  currentPullEntry.value?.duration ?? ''
)

const pullStatusLabel = computed(() => activePull.value === null ? 'Live' : 'Historical')
const encounterDurationLabel = computed(() =>
  currentEncounterDuration.value || fmtTime(encounterDurationSec.value * 1000)
)

const selectedActorDeaths = computed(() =>
  sortedDeaths.value.filter(death => death.targetName === resolvedSelected.value)
)

const selectedActorDeathAbilitySet = computed(() => {
  const set = new Set<string>()
  for (const death of selectedActorDeaths.value) {
    for (const event of deathEventsFor(death)) {
      if (event.type === 'dmg' && event.abilityName) set.add(event.abilityName)
    }
  }
  return set
})

const selectedActorDeathHealingAbilitySet = computed(() => {
  const set = new Set<string>()
  for (const death of selectedActorDeaths.value) {
    for (const event of deathEventsFor(death)) {
      if (event.type === 'heal' && event.abilityName) set.add(event.abilityName)
    }
  }
  return set
})

const selectedActorCastEvents = computed(() =>
  castData.value[resolvedSelected.value] ?? []
)

const selectedActorCastCount = computed(() => selectedActorCastEvents.value.length)

const selectedActorOverviewCards = computed(() => ([
  {
    label: 'Done',
    value: f(playerTotal.value),
    detail: `${abilities.value.length} abilities`,
    tone: 'done',
    view: 'done' as BreakdownView,
  },
  {
    label: 'Taken',
    value: f(takenTotal.value),
    detail: `${takenAbilities.value.length} sources`,
    tone: 'taken',
    view: 'taken' as BreakdownView,
  },
  {
    label: 'Deaths',
    value: String(selectedActorDeaths.value.length),
    detail: selectedActorDeaths.value.length > 0 ? `Last @ ${fmtTime(selectedActorDeaths.value.at(-1)?.timestamp ?? 0)}` : 'No deaths',
    tone: 'deaths',
    view: 'deaths' as BreakdownView,
  },
  {
    label: 'Casts',
    value: f(selectedActorCastCount.value),
    detail: `${castPlayerData.value?.abilities.length ?? 0} tracked abilities`,
    tone: 'casts',
    view: 'casts' as BreakdownView,
  },
]))

function totalOutgoingFor(name: string): number {
  return Object.values(allData.value[name] ?? {}).reduce((sum, ability) => sum + ability.totalDamage, 0)
}

function rdpsFor(name: string): number {
  return rdpsByCombatant.value[name] ?? (totalOutgoingFor(name) / Math.max(encounterDurationSec.value, 1))
}

function rdpsGivenFor(name: string): number {
  return rdpsGiven.value[name] ?? 0
}

function rdpsTakenFor(name: string): number {
  return rdpsTaken.value[name] ?? 0
}

function rdpsDeltaLabel(name: string): string {
  const given = rdpsGivenFor(name)
  const taken = rdpsTakenFor(name)
  if (given === 0 && taken === 0) return 'no buff adj.'
  return `+${f(given)} given / -${f(taken)} taken`
}

function totalTakenFor(name: string): number {
  return Object.values(damageTakenData.value[name] ?? {}).reduce((sum, ability) => sum + ability.totalDamage, 0)
}

function totalHealingReceivedFor(name: string): number {
  return Object.values(healingReceivedData.value[name] ?? {}).reduce((sum, ability) => sum + ability.totalDamage, 0)
}

function totalIncomingFor(name: string): number {
  return takenMode.value === 'healing' ? totalHealingReceivedFor(name) : totalTakenFor(name)
}

function deathCountFor(name: string): number {
  return sortedDeaths.value.filter(death => death.targetName === name).length
}

function castCountFor(name: string): number {
  return (castData.value[name] ?? []).length
}

function selectorValueFor(name: string): number {
  if (activeView.value === 'taken') return totalIncomingFor(name)
  if (activeView.value === 'deaths') return deathCountFor(name)
  if (activeView.value === 'casts') return castCountFor(name)
  if (activeView.value === 'timeline') {
    if (chartMetric.value === 'rdps') return rdpsFor(name)
    const buckets = activeTimeline.value[name] ?? []
    return buckets.reduce((sum, value) => sum + value, 0)
  }
  return totalOutgoingFor(name)
}

function selectorBadgeFor(name: string): string {
  if (activeView.value === 'deaths') return `${deathCountFor(name)} deaths`
  if (activeView.value === 'casts') return `${castCountFor(name)} casts`
  if (activeView.value === 'timeline' && chartMetric.value === 'rdps') return `${f(rdpsFor(name))} rDPS`
  if (activeView.value === 'timeline') return `${metricLabel.value}`
  if (activeView.value === 'taken') return `${f(totalIncomingFor(name))} in`
  return `${f(totalOutgoingFor(name))} out`
}

function takenSelectorBadgeFor(name: string): string {
  return f(totalIncomingFor(name))
}

function castSelectorBadgeFor(name: string): string {
  return `${castCountFor(name)} casts`
}

function eventSelectorBadgeFor(name: string): string {
  return `${eventRowCountFor(name)} rows`
}

const selectorMax = computed(() =>
  Math.max(1, ...visibleCombatants.value.map(name => selectorValueFor(name)))
)

function selectorFillWidth(name: string): string {
  return `${((selectorValueFor(name) / selectorMax.value) * 100).toFixed(1)}%`
}

function selectActor(name: string): void {
  selected.value = name
  castSelectedPlayer.value = name
  encounterSelectedPlayer.value = name
  const nextHidden = new Set(hiddenSeries.value)
  nextHidden.delete(name)
  hiddenSeries.value = nextHidden
}

function selectAbility(name: string): void {
  selectedAbility.value = name
}

// ── Deaths ────────────────────────────────────────────────────────────────────
const sortedDeaths = computed(() => sortPlayerDeaths(deaths.value))

// ── Casts tab ─────────────────────────────────────────────────────────────────
const castSelectedPlayer = ref('')
const castSelectedAbility = ref<string | null>(null)

watch(activePull, () => { castSelectedPlayer.value = ''; castSelectedAbility.value = null })
watch(resolvedSelected, (name) => {
  if (!name) return
  castSelectedPlayer.value = name
  encounterSelectedPlayer.value = name
})
watch(resolvedSelected, () => {
  selectedAbility.value = ''
})

interface CastGroup {
  label: string
  names: string[]
}

const castGroups = computed<CastGroup[]>(() => {
  const allCastNames = Object.keys(castData.value)
  if (allCastNames.length === 0) return []

  const nameToPartyType = new Map<string, { pt: string | undefined; idx: number }>()
  for (let i = 0; i < partyData.value.length; i++) {
    const p = partyData.value[i]
    nameToPartyType.set(p.name, { pt: p.partyType, idx: i })
  }

  const selfPartyInfo = nameToPartyType.get(selfName.value)
  const selfPartyType = selfPartyInfo?.pt
  const selfIdx = selfPartyInfo?.idx ?? 0
  const isAlliance = partyData.value.length > 8

  const partyMap = new Map<string, string[]>()

  for (const name of allCastNames) {
    if (isEnemy(name) && !showEnemies.value) continue
    if (isNPC(name) && !showFriendlyNPCs.value) continue

    const info = nameToPartyType.get(name)
    const isSelf = name === selfName.value || name === 'YOU'
    const label = formatPartyLabel(info?.pt, isSelf, info?.idx, partyData.value.length)

    if (!partyMap.has(label)) partyMap.set(label, [])
    partyMap.get(label)!.push(name)
  }

  const groups: CastGroup[] = []

  if (isAlliance && (selfPartyType || selfIdx >= 8)) {
    const selfLabel = formatPartyLabel(selfPartyType, true, selfIdx, partyData.value.length)
    const selfParty = partyMap.get(selfLabel)
    if (selfParty) {
      groups.push({ label: selfLabel, names: selfParty })
    }

    for (const [label, names] of partyMap) {
      if (label !== selfLabel) {
        groups.push({ label, names })
      }
    }
  } else {
    for (const [label, names] of partyMap) {
      groups.push({ label, names })
    }
  }

  return groups
})

const castGroupedMembers = computed(() => castGroups.value.flatMap(g => g.names))

const partyMembers = computed(() => castGroupedMembers.value)

// Get death time for selected player (if they died)
const castPlayerDeathTime = computed(() => {
  if (!castSelectedPlayer.value) return null
  const death = deaths.value.find(d => d.targetName === castSelectedPlayer.value)
  return death ? death.timestamp / 1000 : null // convert to seconds
})

// Get resurrection time for selected player (if they were raised)
const castPlayerResTime = computed(() => {
  if (!castSelectedPlayer.value) return null
  const death = deaths.value.find(d => d.targetName === castSelectedPlayer.value)
  return death && death.resurrectTime ? death.resurrectTime / 1000 : null
})

const castPlayerData = computed(() => {
  if (!castSelectedPlayer.value) return null
  const events = castData.value[castSelectedPlayer.value] ?? []
  if (events.length === 0) return null

  const abilityMap = new Map<string, CastEvent[]>()
  for (const ev of events) {
    const arr = abilityMap.get(ev.abilityName) ?? []
    arr.push(ev)
    abilityMap.set(ev.abilityName, arr)
  }

  const abilities = Array.from(abilityMap.entries()).map(([name, evts]) => {
    const targetCounts = new Map<string, number>()
    for (const ev of evts) {
      if (ev.target) {
        targetCounts.set(ev.target, (targetCounts.get(ev.target) ?? 0) + 1)
      }
    }
    const topTargets = Array.from(targetCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    const intervals: number[] = []
    const sorted = [...evts].sort((a, b) => a.t - b.t)
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i].t - sorted[i-1].t)
    }
    const avgInterval = intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length / 1000
      : 0

    return {
      name,
      casts: evts.length,
      avgInterval: avgInterval.toFixed(1),
      topTargets,
      events: evts,
    }
  }).sort((a, b) => b.casts - a.casts)

  const maxDuration = events.length > 0 ? Math.max(...events.map(e => e.t)) : 0

  return { abilities, maxDuration, events }
})

const CAST_BUCKET_SEC = 5

const castTimelineDuration = computed(() => {
  if (!castPlayerData.value) return 0
  return Math.ceil((castPlayerData.value.maxDuration / 1000) / 10) * 10
})

const castTimeTicks = computed(() => {
  const dur = castTimelineDuration.value
  if (dur <= 0) return []
  const ticks: number[] = []
  for (let t = 0; t <= dur; t += 30) ticks.push(t)
  return ticks
})

function onCastTimelineHover(event: MouseEvent, abilityName: string, events: CastEvent[]) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const pct = x / rect.width
  const timeSec = pct * castTimelineDuration.value

  // Find closest cast event to this time
  const abilityEvents = events.filter(e => e.abilityName === abilityName)
  if (abilityEvents.length === 0) return

  const closest = abilityEvents.reduce((best, ev) => {
    const evTime = (ev.t ?? 0) / 1000
    return Math.abs(evTime - timeSec) < Math.abs(best.t / 1000 - timeSec) ? ev : best
  })

  if (closest) {
    castHoverData.value = {
      time: (closest.t ?? 0) / 1000,
      ability: closest.abilityName,
      target: closest.target ?? '',
      x: event.clientX,
      y: event.clientY,
    }
  }
}

const castTimelineBuckets = computed(() => {
  if (!castPlayerData.value) return []
  const events = castSelectedAbility.value
    ? castPlayerData.value.events.filter(e => e.abilityName === castSelectedAbility.value)
    : castPlayerData.value.events
  const duration = castPlayerData.value.maxDuration / 1000
  const numBuckets = Math.ceil(duration / CAST_BUCKET_SEC)
  const buckets: { start: number; end: number; casts: { ability: string; target: string; time: number; type: string }[] }[] = []

  for (let i = 0; i < numBuckets; i++) {
    const start = i * CAST_BUCKET_SEC
    const end = start + CAST_BUCKET_SEC
    const castsInBucket = events
      .filter(e => {
        const t = e.t / 1000
        return t >= start && t < end
      })
      .map(e => ({ ability: e.abilityName, target: e.target, time: e.t / 1000 - start, type: e.type }))
    buckets.push({ start, end, casts: castsInBucket })
  }

  return buckets
})

const MITIGATION_PATTERNS = [
  /reprisal/, /rampart/, /arms length/, /arm's length/, /feint/, /addle/, /bloodbath/, /second wind/,
  /sentinel/, /guardian/, /hallowed ground/, /bulwark/, /sheltron/, /holy sheltron/, /intervention/, /divine veil/, /passage of arms/, /cover/,
  /vengeance/, /damnation/, /bloodwhetting/, /raw intuition/, /nascent flash/, /shake it off/, /thrill of battle/, /holmgang/, /equilibrium/,
  /shadow wall/, /the blackest night/, /oblation/, /dark mind/, /dark missionary/, /living dead/, /living shadow/,
  /nebula/, /camouflage/, /heart of stone/, /heart of corundum/, /heart of light/, /superbolide/, /great nebula/, /aurora/,
  /temperance/, /aquaveil/, /liturgy of the bell/, /divine benison/, /divine caress/, /asylum/, /plenary indulgence/, /benediction/, /tetragrammaton/,
  /sacred soil/, /expedient/, /seraphism/, /seraph/, /protraction/, /recitation/, /deployment tactics/, /emergency tactics/, /dissipation/, /fey illumination/, /excogitation/,
  /collective unconscious/, /exaltation/, /celestial intersection/, /neutral sect/, /macrocosmos/, /horoscope/, /synastry/,
  /kerachole/, /taurochole/, /haima/, /panhaima/, /holos/, /krasis/, /zoe/, /soteria/, /physis/, /rhizomata/, /pepsis/, /philosophia/, /eukrasian diagnosis/, /eukrasian prognosis/,
  /mantra/, /riddle of earth/, /shade shift/, /arcane crest/, /crest of time borrowed/, /third eye/, /perfect defense/,
  /troubadour/, /tactician/, /dismantle/, /shield samba/, /improvisation/, /improvised finish/, /curing waltz/,
  /manaward/, /magick barrier/, /radiant aegis/, /everlasting flight/,
  /barrier/, /mitig/,
]

const COOLDOWN_PATTERNS = [
  /sprint/, /swiftcast/, /lucid dreaming/, /surecast/, /true north/, /leg sweep/, /interject/, /low blow/, /provoke/, /shirk/,
  /fight or flight/, /requiescat/, /imperator/, /expiacion/, /circle of scorn/, /intervene/, /atonement/, /confiteor/,
  /berserk/, /inner release/, /infuriate/, /primal rend/, /primal wrath/, /onslaught/, /upheaval/, /orogeny/,
  /delirium/, /blood weapon/, /salted earth/, /salt and darkness/, /carve and spit/, /abyssal drain/, /shadowbringer/, /edge of shadow/, /flood of shadow/,
  /no mercy/, /bloodfest/, /sonic break/, /double down/, /rough divide/, /danger zone/, /blasting zone/, /bow shock/, /continuation/, /reign of beasts/,
  /presence of mind/, /thin air/, /assize/, /afflatus misery/, /temperance/, /liturgy of the bell/,
  /aetherflow/, /chain stratagem/, /energy drain/, /recitation/, /deployment tactics/, /dissipation/, /summon seraph/, /seraphism/,
  /draw/, /divination/, /lightspeed/, /earthly star/, /minor arcana/, /lord of crowns/, /lady of crowns/, /sleeve draw/, /astrodyne/,
  /rhizomata/, /soteria/, /phlegma/, /toxikon/, /psyche/, /pneuma/, /zoe/, /philosophia/,
  /ley lines/, /triplecast/, /amplifier/, /manafont/, /transpose/, /sharpcast/, /enochian/, /paradox/, /xenoglossy/, /foul/,
  /acceleration/, /embolden/, /manafication/, /fleche/, /contre sixte/, /corps-a-corps/, /engagement/, /displacement/, /magick barrier/, /resolution/,
  /searing light/, /summon bahamut/, /summon phoenix/, /summon solar bahamut/, /energy drain/, /energy siphon/, /enkindle/, /aethercharge/, /fester/, /painflare/,
  /battle litany/, /life surge/, /lance charge/, /dragon sight/, /geirskogul/, /nastrond/, /wyrmwind thrust/, /stardiver/, /dragonfire dive/, /mirage dive/,
  /brotherhood/, /riddle of fire/, /riddle of wind/, /perfect balance/, /form shift/, /thunderclap/, /enlightenment/, /six-sided star/,
  /mug/, /trick attack/, /dokumori/, /bunshin/, /kassatsu/, /ten chi jin/, /dream within a dream/, /assassinate/, /bhavacakra/, /hellfrog medium/,
  /meikyo shisui/, /ikishoten/, /hissatsu/, /tsubame-gaeshi/, /hagakure/, /meditate/, /senei/, /guren/, /shoha/, /kaeshi/,
  /arcane circle/, /gluttony/, /plentiful harvest/, /enshroud/, /soul sow/, /harvest moon/, /lemure/, /communio/,
  /serpent's ire/, /reawaken/, /vicewinder/, /slither/, /uncoiled fury/, /twinfang/, /twinblood/,
  /battle voice/, /raging strikes/, /barrage/, /radiant finale/, /wanderer's minuet/, /mage's ballad/, /army's paeon/, /sidewinder/, /apex arrow/, /blast arrow/, /pitch perfect/,
  /wildfire/, /reassemble/, /barrel stabilizer/, /hypercharge/, /chainsaw/, /air anchor/, /drill/, /bio blaster/, /automaton queen/, /rook autoturret/, /queen overdrive/,
  /technical step/, /technical finish/, /devilment/, /flourish/, /standard step/, /standard finish/, /fan dance/, /starfall dance/, /tillana/, /saber dance/,
  /starry muse/, /subtractive palette/, /creature motif/, /weapon motif/, /landscape motif/, /muse/, /hammer stamp/, /mog of the ages/, /retribution of the madeen/,
]

const HEAL_PATTERNS = [
  /cure/, /heal/, /medica/, /regen/, /benefic/, /succor/, /adlo/, /physick/, /lustrate/,
  /essential dignity/, /afflatus/, /tetra/, /excog/, /indom/, /aspected/, /pneuma/,
]

function castCategory(event: CastEvent): CastFilter {
  const name = event.abilityName.toLowerCase().replace(/[’']/g, "'")
  if (MITIGATION_PATTERNS.some(pattern => pattern.test(name))) return 'mitigations'
  if (COOLDOWN_PATTERNS.some(pattern => pattern.test(name))) return 'cooldowns'
  if (HEAL_PATTERNS.some(pattern => pattern.test(name))) return 'heals'
  return 'dps'
}

const filteredCastTimelineEvents = computed(() => {
  if (!castPlayerData.value) return []
  return castPlayerData.value.events
    .map(event => ({ ...event, category: castCategory(event) }))
    .filter(event => castFilters.value.has(event.category))
    .sort((a, b) => a.t - b.t)
})

const castTimelineRows = computed(() => {
  if (!castPlayerData.value) return []
  return castPlayerData.value.abilities
    .map(ability => {
      const category = castCategory(ability.events[0] ?? { abilityName: ability.name, t: 0, target: '', type: 'cast' })
      return {
        ...ability,
        category,
        events: ability.events
          .slice()
          .sort((a, b) => a.t - b.t),
      }
    })
    .filter(row => castFilters.value.has(row.category))
    .sort((a, b) => {
      const order: Record<CastFilter, number> = { cooldowns: 0, mitigations: 1, dps: 2, heals: 3 }
      return order[a.category] - order[b.category] || b.casts - a.casts || a.name.localeCompare(b.name)
    })
})

const castTimelineGroups = computed(() => {
  const labels: Record<CastFilter, string> = {
    cooldowns: 'Cooldowns',
    mitigations: 'Mitigations',
    dps: 'DPS / GCD',
    heals: 'Heals',
  }
  return (['cooldowns', 'mitigations', 'dps', 'heals'] as CastFilter[])
    .map(category => ({
      category,
      label: labels[category],
      rows: castTimelineRows.value.filter(row => row.category === category),
    }))
    .filter(group => group.rows.length > 0)
})

const castTimelinePixelWidth = computed(() =>
  Math.max(1100, Math.ceil(castTimelineDuration.value * 14))
)

const selectedResourceSamples = computed(() => {
  if (!castSelectedPlayer.value) return []
  return resourceData.value[castSelectedPlayer.value] ?? []
})

const castResourceTracks = computed(() => {
  const samples = selectedResourceSamples.value
  if (samples.length === 0 || castTimelineDuration.value <= 0) return []
  const latest = samples[samples.length - 1]
  const rows: Array<{ key: ResourceTrackKey; label: string; value: string; color: string; fill: string }> = [{
    key: 'hp',
    label: 'HP',
    value: `${Math.round((latest.hp ?? 0) * 100)}%`,
    color: '#22c55e',
    fill: 'rgba(34,197,94,0.16)',
  }]
  if (samples.some(sample => sample.mp !== undefined && (sample.maxMp ?? 0) > 0)) {
    rows.push({
      key: 'mp',
      label: 'MP',
      value: `${Math.round((latest.mp ?? 0) * 100)}%`,
      color: '#38bdf8',
      fill: 'rgba(56,189,248,0.14)',
    })
  }
  return rows
})

function resourcePoint(sample: ResourceSample, key: ResourceTrackKey): { x: number; y: number } {
  const durationMs = Math.max(1, castTimelineDuration.value * 1000)
  const value = key === 'hp' ? sample.hp : (sample.mp ?? 0)
  return {
    x: Math.max(0, Math.min(100, (sample.t / durationMs) * 100)),
    y: Math.max(0, Math.min(100, (1 - value) * 100)),
  }
}

function resourcePolyline(key: ResourceTrackKey): string {
  return selectedResourceSamples.value
    .filter(sample => key === 'hp' || sample.mp !== undefined)
    .map(sample => {
      const point = resourcePoint(sample, key)
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`
    })
    .join(' ')
}

function resourceAreaPath(key: ResourceTrackKey): string {
  const points = selectedResourceSamples.value
    .filter(sample => key === 'hp' || sample.mp !== undefined)
    .map(sample => resourcePoint(sample, key))
  if (points.length === 0) return ''
  const start = points[0]
  const end = points[points.length - 1]
  const line = points.map(point => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  return `M ${start.x.toFixed(2)} 100 L ${start.x.toFixed(2)} ${start.y.toFixed(2)} ${line} L ${end.x.toFixed(2)} 100 Z`
}

function castEventLeft(event: CastEvent): string {
  if (castTimelineDuration.value <= 0) return '0%'
  const markerT = event.type === 'cast' && !event.buffDurationMs && event.endT ? event.endT : event.t
  return `${Math.min(100, Math.max(0, ((markerT / 1000) / castTimelineDuration.value) * 100))}%`
}

function castEventWidth(event: CastEvent): string {
  if (event.buffDurationMs && castTimelineDuration.value > 0) {
    const pct = (event.buffDurationMs / 1000) / castTimelineDuration.value * 100
    return `${Math.max(22, pct)}%`
  }
  return '22px'
}

function castCastWindowLeft(event: CastEvent): string {
  if (castTimelineDuration.value <= 0) return '0%'
  return `${Math.min(100, Math.max(0, ((event.t / 1000) / castTimelineDuration.value) * 100))}%`
}

function castCastWindowWidth(event: CastEvent): string {
  if (event.type !== 'cast' || !event.durationMs || castTimelineDuration.value <= 0) return '0%'
  const pct = (event.durationMs / 1000) / castTimelineDuration.value * 100
  return `${Math.max(4, pct)}%`
}

function castCooldownWidth(event: CastEvent): string {
  const cooldownMs = event.cooldownMs ?? abilityRecastMs(event.abilityId, event.abilityName)
  if (!cooldownMs || castTimelineDuration.value <= 0) return '0%'
  const pct = (cooldownMs / 1000) / castTimelineDuration.value * 100
  const startPct = ((event.t / 1000) / castTimelineDuration.value) * 100
  return `${Math.max(0, Math.min(pct, 100 - startPct))}%`
}

function castCooldownLabel(event: CastEvent): string {
  const cooldownMs = event.cooldownMs ?? abilityRecastMs(event.abilityId, event.abilityName)
  return cooldownMs ? `${Math.round(cooldownMs / 1000)}s cooldown` : ''
}

function getAbilityBuckets(abilityName: string) {
  if (!castPlayerData.value) return []
  const events = castPlayerData.value.events.filter(e => e.abilityName === abilityName)
  const duration = castPlayerData.value.maxDuration / 1000
  const numBuckets = Math.ceil(duration / CAST_BUCKET_SEC)
  const buckets: { start: number; end: number; casts: { ability: string; target: string; time: number; type: string }[] }[] = []

  for (let i = 0; i < numBuckets; i++) {
    const start = i * CAST_BUCKET_SEC
    const end = start + CAST_BUCKET_SEC
    const castsInBucket = events
      .filter(e => {
        const t = e.t / 1000
        return t >= start && t < end
      })
      .map(e => ({ ability: e.abilityName, target: e.target, time: e.t / 1000 - start, type: e.type }))
    buckets.push({ start, end, casts: castsInBucket })
  }

  return buckets
}

function abilityIconKey(abilityId: string, abilityName: string): string {
  return `${abilityId || 'unknown'}:${abilityName}`
}

function abilityIconSrc(abilityId: string, abilityName: string): string {
  return abilityIconSrcs.value[abilityIconKey(abilityId, abilityName)] ?? ''
}

function abilityRecastMs(abilityId: string, abilityName: string): number {
  return abilityCooldownMs.value[abilityIconKey(abilityId, abilityName)] ?? 0
}

function queueAbilityIcon(abilityId: string, abilityName: string): void {
  const key = abilityIconKey(abilityId, abilityName)
  if (abilityIconRequested.has(key)) return
  abilityIconRequested.add(key)
  resolveAbilityInfo(abilityId).then(info => {
    if (info.iconSrc) abilityIconSrcs.value = { ...abilityIconSrcs.value, [key]: info.iconSrc }
    if (info.recastMs) abilityCooldownMs.value = { ...abilityCooldownMs.value, [key]: info.recastMs }
  })
}

function clearAbilityIcon(abilityId: string, abilityName: string): void {
  const key = abilityIconKey(abilityId, abilityName)
  if (!abilityIconSrcs.value[key]) return
  const next = { ...abilityIconSrcs.value }
  delete next[key]
  abilityIconSrcs.value = next
}

watch(castTimelineRows, rows => {
  for (const row of rows) {
    const first = row.events[0]
    if (first?.abilityId) queueAbilityIcon(first.abilityId, row.name)
  }
}, { immediate: true })

function abilityIdForName(abilityName: string): string {
  for (const source of [allData.value, damageTakenData.value, healingReceivedData.value]) {
    for (const actorData of Object.values(source)) {
      for (const ability of Object.values(actorData)) {
        if (ability.abilityName === abilityName) return ability.abilityId
      }
    }
  }
  for (const events of Object.values(castData.value)) {
    const match = events.find(event => event.abilityName === abilityName)
    if (match?.abilityId) return match.abilityId
  }
  return ''
}

function queueVisibleAbilityIcons(): void {
  for (const row of [...abilities.value, ...takenAbilities.value, ...healingAbilities.value]) {
    queueAbilityIcon(row.abilityId, row.abilityName)
  }
  for (const row of eventRows.value.slice(0, 80)) {
    const id = abilityIdForName(row.ability)
    if (id) queueAbilityIcon(id, row.ability)
  }
  for (const hit of deathHitLog.value) {
    const id = abilityIdForName(hit.abilityName)
    if (id) queueAbilityIcon(id, hit.abilityName)
  }
}

// ── Encounter tab ─────────────────────────────────────────────────────────────
const encounterSelectedPlayer = ref('')

watch(activePull, () => { encounterSelectedPlayer.value = '' })
watch(activePull, () => {
  selectedAbility.value = ''
  eventWindowOnly.value = false
  deathInspectorTab.value = 'recap'
})

const dtakenPlayers = computed(() =>
  Object.keys(damageTakenData.value)
    .filter(n => !isEnemy(n))
    .map(n => ({
      name: n,
      total: Object.values(damageTakenData.value[n] ?? {}).reduce((s, a) => s + a.totalDamage, 0),
    }))
    .filter(p => p.total > 0)
    .sort((a, b) => b.total - a.total)
)

const dtakenPlayersMax = computed(() => dtakenPlayers.value[0]?.total ?? 1)

const dtakenEnemies = computed(() => {
  if (!showEnemies.value) return []
  return Object.keys(damageTakenData.value)
    .filter(n => isEnemy(n))
    .map(n => ({
      name: n,
      total: Object.values(damageTakenData.value[n] ?? {}).reduce((s, a) => s + a.totalDamage, 0),
    }))
    .filter(e => e.total > 0)
    .sort((a, b) => b.total - a.total)
})

const hasMultipleEnemies = computed(() => {
  const ids = Object.values(combatantIds.value).filter(id => id.startsWith('40'))
  return new Set(ids).size >= 2
})

const encSelectedResolved = computed(() =>
  encounterSelectedPlayer.value && damageTakenData.value[encounterSelectedPlayer.value]
    ? encounterSelectedPlayer.value
    : ''
)

const encTakenRaw = computed(() => damageTakenData.value[encSelectedResolved.value] ?? {})
const encTakenTotal = computed(() =>
  Object.values(encTakenRaw.value).reduce((s, a) => s + a.totalDamage, 0)
)
const encTakenAbilities = computed(() =>
  Object.values(encTakenRaw.value)
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .map(a => ({
      ...a,
      pct:    encTakenTotal.value > 0 ? ((a.totalDamage / encTakenTotal.value) * 100).toFixed(1) : '0.0',
      avg:    a.hits > 0 ? Math.round(a.totalDamage / a.hits) : 0,
      minHit: a.minHit === Infinity ? 0 : a.minHit,
    }))
)

const selectedDeathIndex = ref<number | null>(null)

watch([activePull, deaths], () => { selectedDeathIndex.value = null })

const selectedDeath = computed<DeathRecord | null>(() =>
  selectedDeathIndex.value !== null ? (sortedDeaths.value[selectedDeathIndex.value] ?? null) : null
)

const deathHitLog = computed(() => selectedDeath.value ? deathEventsFor(selectedDeath.value) : [])

const selectedDoneAbility = computed(() =>
  abilities.value.find(row => row.abilityName === selectedAbility.value) ?? abilities.value[0] ?? null
)

const selectedDoneHighestHitAbility = computed(() =>
  abilities.value.reduce((best, row) =>
    !best || row.maxHit > best.maxHit ? row : best, null as (typeof abilities.value)[number] | null)
)

const partyHighestHit = computed(() => {
  let best: { actor: string; ability: string; amount: number } | null = null
  for (const name of visibleCombatants.value) {
    if (isEnemy(name)) continue
    for (const ability of Object.values(allData.value[name] ?? {})) {
      if (!best || ability.maxHit > best.amount) {
        best = { actor: name, ability: ability.abilityName, amount: ability.maxHit }
      }
    }
  }
  return best
})

const selectedTakenAbility = computed(() =>
  incomingAbilities.value.find(row => row.abilityName === selectedAbility.value) ?? incomingAbilities.value[0] ?? null
)

const selectedCastAbility = computed(() =>
  castPlayerData.value?.abilities.find(ability => ability.name === selectedAbility.value || ability.name === castSelectedAbility.value)
    ?? castPlayerData.value?.abilities[0]
    ?? null
)

const selectedDeathRelatedDamage = computed(() => {
  if (!selectedDeath.value) return []
  const totals = new Map<string, number>()
  for (const event of deathEventsFor(selectedDeath.value)) {
    if (event.type !== 'dmg' || event.isDeathBlow) continue
    totals.set(event.abilityName, (totals.get(event.abilityName) ?? 0) + event.amount)
  }
  return Array.from(totals.entries())
    .map(([ability, amount]) => ({ ability, amount }))
    .sort((a, b) => b.amount - a.amount)
})

const selectedDeathWindow = computed(() => {
  if (!selectedDeath.value) return null
  const events = deathEventsFor(selectedDeath.value)
  if (events.length === 0) return null
  return {
    start: Math.min(...events.map(event => event.t)),
    end: Math.max(selectedDeath.value.timestamp, ...events.map(event => event.t)),
  }
})

const overviewNotableEvents = computed(() => {
  const items = sortedDeaths.value
    .slice()
    .reverse()
    .slice(0, 6)
    .map((death, index) => ({
      key: `death-${index}-${death.timestamp}`,
      label: `${death.targetName} died`,
      detail: `at ${fmtTime(death.timestamp)}${death.resurrectTime ? ` · raised ${fmtTime(death.resurrectTime)}` : ''}`,
      type: 'death' as const,
      death,
    }))
  return items
})

function hitRowStyle(_: DeathEvent): string {
  return ''
}

function fmtTime(ms: number): string {
  if (!ms || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function fmtSeconds(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

const formatHpValue = (value: number) => formatDeathHpValue(value, f)
const formatHpBefore = (event: DeathEvent) => formatDeathHpBefore(event, f)
const deathHpBars = (death: DeathRecord) => buildDeathHpBars(death)

// ── Pull selector ─────────────────────────────────────────────────────────────
function onPullSelect(e: Event): void {
  const val = (e.target as HTMLSelectElement).value
  const idx = val === 'null' ? null : parseInt(val, 10)
  activePull.value = idx
  channel?.postMessage({ type: 'loadPull', index: idx })
  if (idx !== null) {
    scheduleBroadcast()
  }
}

let broadcastTimer: ReturnType<typeof setTimeout> | null = null
function scheduleBroadcast() {
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    channel?.postMessage({ type: 'loadPull', index: activePull.value })
  }, 250)
}

// ── Chart ─────────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  '#ff7675','#74b9ff','#55efc4','#fdcb6e',
  '#a29bfe','#fd79a8','#00cec9','#e17055',
]
const GROUP_NAME  = '__group__'
const GROUP_COLOR = 'rgba(255,255,255,0.7)'

// Auto-hide non-party members when pull changes (skip enemies — handled by showEnemies toggle)
function applyAutoHide(pullIdx: number | null | undefined, timeline: DpsTimeline): void {
  if (pullIdx === lastAutoHidePull) return
  lastAutoHidePull = pullIdx
  if (partyNames.value.length === 0) return
  const party = new Set([...partyNames.value, selfName.value, 'YOU'])
  const toHide = new Set<string>()
  for (const name of Object.keys(timeline)) {
    if (!party.has(name) && !isEnemy(name)) toHide.add(name)
  }
  hiddenSeries.value = toHide
}

function toggleSeries(name: string): void {
  const next = new Set(hiddenSeries.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  hiddenSeries.value = next
}

function smoothBuckets(buckets: number[], win = 4): number[] {
  return buckets.map((_, i) => {
    const start = Math.max(0, i - win + 1)
    const slice = buckets.slice(start, i + 1)
    return slice.reduce((s, v) => s + v, 0) / slice.length
  })
}

const PL = 52, PR = 16, PT = 12, PB = 28
const SVG_W = 500, SVG_H = 240
const CW = SVG_W - PL - PR
const CH = SVG_H - PT - PB

const activeTimeline = computed<DpsTimeline>(() => {
  if (chartMetric.value === 'hps')  return hpsTimeline.value
  if (chartMetric.value === 'dtps') return dtakenTimeline.value
  if (chartMetric.value === 'rdps') return rdpsTimeline.value
  return dpsTimeline.value
})

const metricLabel = computed(() =>
  chartMetric.value === 'hps' ? 'HPS' : chartMetric.value === 'dtps' ? 'DTPS' : chartMetric.value === 'rdps' ? 'rDPS' : 'DPS'
)

const rdpsTimeline = computed<DpsTimeline>(() => {
  const result: DpsTimeline = {}
  for (const [name, buckets] of Object.entries(dpsTimeline.value)) {
    const personalRate = buckets.reduce((sum, value) => sum + value, 0) / Math.max(encounterDurationSec.value, 1)
    const rdpsRate = rdpsByCombatant.value[name] ?? personalRate
    const scale = personalRate > 0 ? rdpsRate / personalRate : 1
    result[name] = buckets.map(value => value * scale)
  }
  return result
})

const chartLines = computed(() => {
  const timeline = activeTimeline.value
  const names = Object.keys(timeline)
  if (names.length === 0) return null

  const maxBuckets = Math.max(...names.map(n => (timeline[n] ?? []).length))
  if (maxBuckets < 2) return null

  const series = names
    .filter(n => showEnemies.value || !isEnemy(n))
    .sort((a, b) => {
      if (a === resolvedSelected.value) return -1
      if (b === resolvedSelected.value) return 1
      return a.localeCompare(b)
    })
    .map((name, i) => ({
      name,
      color: CHART_COLORS[i % CHART_COLORS.length],
      values: smoothBuckets(timeline[name] ?? []).map(v => v / TIMELINE_BUCKET_SEC),
      isGroup: false,
      isFocused: name === resolvedSelected.value,
    }))

  // Group line = sum of all individual series per bucket
  const groupBuckets: number[] = Array(maxBuckets).fill(0)
  for (const s of series) {
    for (let i = 0; i < s.values.length; i++) groupBuckets[i] += s.values[i] ?? 0
  }
  const allSeries = [
    ...series,
    { name: GROUP_NAME, color: GROUP_COLOR, values: groupBuckets, isGroup: true, isFocused: false },
  ]

  // Y max: highest visible value (individual or group)
  const visibleVals = allSeries
    .filter(s => !hiddenSeries.value.has(s.name))
    .flatMap(s => s.values)
  const maxDps = Math.max(...visibleVals, 1)

  function points(values: number[]): string {
    return values.map((v, i) => {
      const x = PL + (i / (maxBuckets - 1)) * CW
      const y = PT + CH - Math.min(v / maxDps, 1) * CH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  const yTicks = Array.from({ length: 5 }, (_, i) => ({
    y: PT + CH - (i / 4) * CH,
    label: formatValue(maxDps * (i / 4), 'abbreviated'),
  }))

  const xStep = Math.ceil(60 / TIMELINE_BUCKET_SEC)
  const xTicks: { x: number; label: string }[] = []
  for (let b = 0; b < maxBuckets; b += xStep) {
    const secs = b * TIMELINE_BUCKET_SEC
    const m = Math.floor(secs / 60), s = secs % 60
    xTicks.push({ x: PL + (b / (maxBuckets - 1)) * CW, label: `${m}:${String(s).padStart(2, '0')}` })
  }

  return { series: allSeries, maxBuckets, maxDps, points, yTicks, xTicks }
})

// ── Hover tooltip ─────────────────────────────────────────────────────────────
const svgRef      = ref<SVGSVGElement | null>(null)
const chartAreaRef = ref<HTMLDivElement | null>(null)
const hoverVisible = ref(false)
const hoverSvgX   = ref(0)
const hoverClientX = ref(0)
const hoverClientY = ref(0)

function onSvgMouseMove(e: MouseEvent): void {
  const svg  = svgRef.value
  const area = chartAreaRef.value
  if (!svg || !area) return
  const sr = svg.getBoundingClientRect()
  const ar = area.getBoundingClientRect()
  hoverSvgX.value   = ((e.clientX - sr.left) / sr.width) * SVG_W
  hoverClientX.value = e.clientX - ar.left
  hoverClientY.value = e.clientY - ar.top
  hoverVisible.value = hoverSvgX.value >= PL && hoverSvgX.value <= PL + CW
}

const hoverBucket = computed(() => {
  if (!hoverVisible.value && timelineFocusBucket.value !== null && chartLines.value) {
    return Math.max(0, Math.min(chartLines.value.maxBuckets - 1, timelineFocusBucket.value))
  }
  if (!hoverVisible.value || !chartLines.value) return -1
  const { maxBuckets } = chartLines.value
  if (maxBuckets < 2) return -1
  return Math.round(Math.max(0, Math.min(1, (hoverSvgX.value - PL) / CW)) * (maxBuckets - 1))
})

const hoverLineX = computed(() => {
  if (!chartLines.value || hoverBucket.value < 0) return 0
  return PL + (hoverBucket.value / (chartLines.value.maxBuckets - 1)) * CW
})

const hoverTooltip = computed(() => {
  if (!chartLines.value || hoverBucket.value < 0) return null
  const b = hoverBucket.value
  const secs = b * TIMELINE_BUCKET_SEC
  const m = Math.floor(secs / 60), s = secs % 60
  const timeLabel = `${m}:${String(s).padStart(2, '0')}`
  const entries = chartLines.value.series
    .filter(s => !s.isGroup && !hiddenSeries.value.has(s.name))
    .map(s => ({
      name: s.name,
      label: tabLabel(s.name),
      color: s.color,
      value: s.values[b] ?? 0,
      rdpsGiven: rdpsGivenFor(s.name),
      rdpsTaken: rdpsTakenFor(s.name),
    }))
    .sort((a, b) => b.value - a.value)
  const groupVal = entries.reduce((sum, e) => sum + e.value, 0)
  return { timeLabel, entries, groupVal }
})

const timelineDeathMarkers = computed(() =>
  sortedDeaths.value
    .filter(death => death.targetName === resolvedSelected.value)
    .map(death => death.timestamp / 1000)
    .filter(time => time >= 0)
)

const timelineRaiseMarkers = computed(() =>
  sortedDeaths.value
    .filter(death => death.targetName === resolvedSelected.value && death.resurrectTime)
    .map(death => (death.resurrectTime ?? 0) / 1000)
    .filter(time => time >= 0)
)

const timelineCastMarkers = computed(() =>
  selectedActorCastEvents.value
    .map(event => event.t / 1000)
    .filter(time => time >= 0)
)

const timelineSpikeMarkers = computed(() => {
  const values = (activeTimeline.value[resolvedSelected.value] ?? []).map(value => value / TIMELINE_BUCKET_SEC)
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
})

const overviewTimelineBars = computed(() => {
  const values = (activeTimeline.value[resolvedSelected.value] ?? []).map(value => value / TIMELINE_BUCKET_SEC)
  if (values.length === 0) return []
  const bucketCount = Math.min(28, values.length)
  const groupSize = Math.ceil(values.length / bucketCount)
  const grouped: Array<{ key: string; height: string; label: string; value: string; bucket: number }> = []

  for (let i = 0; i < values.length; i += groupSize) {
    const slice = values.slice(i, i + groupSize)
    const value = slice.reduce((sum, item) => sum + item, 0) / Math.max(slice.length, 1)
    grouped.push({
      key: `overview-timeline-${i}`,
      height: '0%',
      label: fmtTime(i * TIMELINE_BUCKET_SEC * 1000),
      value: f(value),
      bucket: i,
    })
  }

  const max = Math.max(1, ...grouped.map(item => Number(item.value.replace(/[^0-9.]/g, '')) || 0), ...values)
  return grouped.map(item => {
    const raw = values.slice(item.bucket, item.bucket + groupSize)
    const value = raw.reduce((sum, next) => sum + next, 0) / Math.max(raw.length, 1)
    return {
      ...item,
      height: `${Math.max(8, Math.min(100, (value / max) * 100)).toFixed(1)}%`,
      value: f(value),
    }
  })
})

function openOverviewCard(view: BreakdownView): void {
  activeView.value = view
}

function openSelectedTimeline(): void {
  const firstSpike = timelineSpikeMarkers.value[0]
  if (firstSpike) timelineFocusBucket.value = firstSpike.index
  activeView.value = 'timeline'
}

function openLatestDeath(): void {
  if (selectedActorDeaths.value.length > 0) {
    const latest = selectedActorDeaths.value[selectedActorDeaths.value.length - 1]
    selectedDeathIndex.value = sortedDeaths.value.findIndex(death => death === latest)
  }
  activeView.value = 'deaths'
}

function markerXForTime(timeSec: number, maxBuckets: number): number {
  const bucket = Math.max(0, Math.min(maxBuckets - 1, timeSec / TIMELINE_BUCKET_SEC))
  return PL + (bucket / Math.max(maxBuckets - 1, 1)) * CW
}

const hoverWindow = computed(() => {
  if (hoverBucket.value < 0) return null
  const start = hoverBucket.value * TIMELINE_BUCKET_SEC * 1000
  const end = start + TIMELINE_BUCKET_SEC * 1000
  return { start, end }
})

const timelineInspectorCasts = computed(() => {
  if (!hoverWindow.value) return []
  return selectedActorCastEvents.value
    .filter(event => event.t >= hoverWindow.value!.start && event.t < hoverWindow.value!.end)
    .slice(0, 6)
})

const timelineInspectorDeaths = computed(() => {
  if (!hoverWindow.value) return []
  return sortedDeaths.value.filter(death => death.timestamp >= hoverWindow.value!.start && death.timestamp < hoverWindow.value!.end)
})

const tooltipStyle = computed(() => {
  if (!hoverVisible.value || !hoverTooltip.value || !chartAreaRef.value) return { display: 'none' }
  const areaW = chartAreaRef.value.clientWidth
  const W = 160
  const left = hoverClientX.value + 14 + W > areaW
    ? hoverClientX.value - W - 6
    : hoverClientX.value + 14
  const top = Math.max(4, Math.min(hoverClientY.value - 20, 60))
  return { display: 'block', left: `${left}px`, top: `${top}px` }
})

const f = (n: number) => formatValue(n, 'abbreviated')

function entryPullLabel(entry: PullEntry): string {
  if (entry.index === null) return 'Live'
  return `Pull ${entry.pullNumber ?? 1}`
}

function parseEntryDuration(entry: PullEntry | null): number {
  if (!entry?.duration) return 0
  const parts = entry.duration.split(':').map(part => parseInt(part, 10))
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0)
  return parseInt(entry.duration, 10) || 0
}

function formatEntryDelta(value: number, formatter: (n: number) => string): string {
  if (!value) return 'same'
  return `${value > 0 ? '+' : '-'}${formatter(Math.abs(value))}`
}

const historicalPullEntries = computed(() =>
  pullList.value.filter(entry => entry.index !== null)
)

const selectedEncounterPullEntries = computed(() => {
  const selectedEncounter = selectedPullEntry.value?.encounterId
  if (!selectedEncounter) return historicalPullEntries.value
  return historicalPullEntries.value.filter(entry => entry.encounterId === selectedEncounter)
})

const selectedPullEntry = computed(() =>
  pullList.value.find(entry => entry.index === activePull.value) ?? pullList.value[0] ?? null
)

const previousPullEntry = computed(() => {
  const current = selectedPullEntry.value
  if (!current || current.index === null) return null
  return selectedEncounterPullEntries.value.find(entry => (entry.pullNumber ?? 0) === (current.pullNumber ?? 0) - 1) ?? null
})

const bestPullEntry = computed(() =>
  selectedEncounterPullEntries.value.reduce((best, entry) =>
    !best || parseEntryDuration(entry) > parseEntryDuration(best) ? entry : best, null as PullEntry | null)
)

const bestProgressPullEntry = computed(() =>
  selectedEncounterPullEntries.value
    .filter(entry => entry.bossPercent !== undefined)
    .reduce((best, entry) =>
      !best || (entry.bossPercent ?? 100) < (best.bossPercent ?? 100) ? entry : best, null as PullEntry | null)
)

const pullDashboardNotes = computed(() => {
  const current = selectedPullEntry.value
  if (!current) return ['No pull selected yet.']
  const notes: string[] = []
  const previous = previousPullEntry.value

  if (bestPullEntry.value && current.index === bestPullEntry.value.index && selectedEncounterPullEntries.value.length > 1) {
    notes.push('Longest pull for this encounter.')
  } else if (bestPullEntry.value && current.index !== null) {
    const delta = parseEntryDuration(current) - parseEntryDuration(bestPullEntry.value)
    notes.push(`${formatEntryDelta(delta, seconds => fmtSeconds(Math.abs(seconds)))} from best pull duration.`)
  }

  if (bestProgressPullEntry.value && current.index === bestProgressPullEntry.value.index && selectedEncounterPullEntries.value.length > 1) {
    notes.push('Best boss progress for this encounter.')
  } else if (bestProgressPullEntry.value && current.bossPercent !== undefined) {
    const delta = current.bossPercent - (bestProgressPullEntry.value.bossPercent ?? current.bossPercent)
    notes.push(`${delta > 0 ? '+' : ''}${delta.toFixed(1)} boss HP points from best progress.`)
  }

  if (previous) {
    const deathDelta = (current.deaths ?? 0) - (previous.deaths ?? 0)
    if (deathDelta < 0) notes.push(`${Math.abs(deathDelta)} fewer deaths than previous pull.`)
    if (deathDelta > 0) notes.push(`${deathDelta} more deaths than previous pull.`)

    const dpsDelta = (current.dps ?? 0) - (previous.dps ?? 0)
    if (Math.abs(dpsDelta) >= Math.max(1500, (previous.dps ?? 0) * 0.03)) {
      notes.push(`${dpsDelta > 0 ? '+' : ''}${f(dpsDelta)} party DPS vs previous.`)
    }
  }

  const firstCluster = deathClustersForCurrent.value[0]
  if (firstCluster) {
    notes.push(`${firstCluster.count} deaths clustered around ${fmtTime(firstCluster.start)}-${fmtTime(firstCluster.end)}.`)
  }

  if (notes.length === 0) notes.push('No obvious swing yet; use the drilldown tabs for details.')
  return notes.slice(0, 5)
})

const deathClustersForCurrent = computed(() => {
  const sorted = sortedDeaths.value.slice().sort((a, b) => a.timestamp - b.timestamp)
  const clusters: Array<{ start: number; end: number; count: number }> = []
  for (const death of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && death.timestamp - last.end <= 15000) {
      last.end = death.timestamp
      last.count++
    } else {
      clusters.push({ start: death.timestamp, end: death.timestamp, count: 1 })
    }
  }
  return clusters.filter(cluster => cluster.count >= 2)
})

function selectPullEntry(entry: PullEntry): void {
  activePull.value = entry.index
  channel?.postMessage({ type: 'loadPull', index: entry.index })
}

const { eventRowCountFor, eventRows } = useEventRows({
  eventActorScope,
  visibleCombatants,
  resolvedSelected,
  castData,
  sortedDeaths,
  eventFilters,
  eventWindowOnly,
  selectedDeathWindow,
  format: f,
})

watch([abilities, takenAbilities, eventRows, deathHitLog], queueVisibleAbilityIcons, { immediate: true })

const activeFilterChips = computed(() => {
  const chips = [
    `Pull=${pullStatusLabel.value}`,
    `Player=${resolvedSelected.value || 'None'}`,
    `Metric=${metricLabel.value}`,
  ]
  if (showEnemies.value) chips.push('Show Enemies')
  if (showFriendlyNPCs.value) chips.push('Show NPCs')
  if (selectedAbility.value) chips.push(`Ability=${selectedAbility.value}`)
  if (eventWindowOnly.value && selectedDeathWindow.value) chips.push(`Window=Death #${(selectedDeathIndex.value ?? 0) + 1}`)
  return chips
})

// ── BroadcastChannel ──────────────────────────────────────────────────────────
let channel: BroadcastChannel | null = null

onMounted(() => {
  document.title = 'Flexi Breakdown'
  if (typeof BroadcastChannel === 'undefined') return
  channel = new BroadcastChannel('flexi-breakdown')
  channel.onmessage = (e) => {
    if (e.data?.type === 'encounterData') {
      const ts = e.data.timestamp ?? 0

      // When viewing historical pull, validate by pullIndex, not timestamp
      // Historical data has pullIndex >= 0, live data has pullIndex === null
      const incomingPullIndex = 'pullIndex' in e.data ? e.data.pullIndex : null

      // If viewing historical pull, accept only data for that specific pull
      if (activePull.value !== null) {
        if (incomingPullIndex !== activePull.value) return
      } else {
        // For live view, skip if timestamp is not newer
        if (lastBroadcastTime.value > 0 && ts <= lastBroadcastTime.value) return
      }

      // Clear data if pull changed (before updating with new data)
      if (incomingPullIndex !== activePull.value) {
        allData.value = {}
        dpsTimeline.value = {}
        hpsTimeline.value = {}
        dtakenTimeline.value = {}
        rdpsByCombatant.value = {}
        rdpsGiven.value = {}
        rdpsTaken.value = {}
        damageTakenData.value = {}
        healingReceivedData.value = {}
        deaths.value = []
        combatantIds.value = {}
        combatantJobs.value = {}
        castData.value = {}
        resourceData.value = {}
      }

      lastBroadcastTime.value = ts
      allData.value              = e.data.abilityData      ?? {}
      dpsTimeline.value          = e.data.dpsTimeline      ?? {}
      hpsTimeline.value          = e.data.hpsTimeline      ?? {}
      dtakenTimeline.value       = e.data.dtakenTimeline   ?? {}
      rdpsByCombatant.value      = e.data.rdpsByCombatant  ?? {}
      rdpsGiven.value            = e.data.rdpsGiven        ?? {}
      rdpsTaken.value            = e.data.rdpsTaken        ?? {}
      damageTakenData.value      = e.data.damageTakenData  ?? {}
      healingReceivedData.value  = e.data.healingReceivedData ?? {}
      deaths.value               = e.data.deaths           ?? []
      combatantIds.value         = e.data.combatantIds     ?? {}
      combatantJobs.value        = e.data.combatantJobs    ?? {}
      castData.value             = e.data.castData         ?? {}
      resourceData.value         = e.data.resourceData     ?? {}
      selfName.value             = e.data.selfName         ?? ''
      blurNames.value            = e.data.blurNames        ?? false
      partyNames.value           = Array.isArray(e.data.partyNames) ? e.data.partyNames : []
      partyData.value             = Array.isArray(e.data.partyData) ? e.data.partyData : []
      encounterDurationSec.value = e.data.encounterDurationSec ?? 0
      pullList.value             = Array.isArray(e.data.pullList) ? e.data.pullList : []
      if ('pullIndex' in e.data) {
        activePull.value = e.data.pullIndex ?? null
        applyAutoHide(e.data.pullIndex ?? null, e.data.dpsTimeline ?? {})
      }
      if (e.data.selectedCombatant) {
        selected.value = e.data.selectedCombatant
      } else if (!selected.value && initName && allData.value[initName]) {
        selected.value = initName
      }
    } else if (e.data?.type === 'selectCombatant') {
      selected.value = e.data.name ?? ''
    } else if (e.data?.type === 'setView' && (e.data.view === 'overview' || e.data.view === 'pulls')) {
      activeView.value = e.data.view
    }
  }
  channel.postMessage({ type: 'request' })
})

onUnmounted(() => { channel?.close(); channel = null })
</script>

<template>
  <div class="bp-root">
    <div class="bp-topbar">
      <span class="bp-app-title">Flexi Breakdown</span>
      <span v-if="encounterTotal > 0" class="bp-total">{{ f(encounterTotal) }} tracked</span>
    </div>

    <div class="bp-analysis-header">
      <div class="bp-analysis-main">
        <div class="bp-report-select-row">
          <div class="bp-analysis-kicker">Encounter</div>
          <select v-if="pullList.length > 0" class="bp-pull-select bp-pull-select--header"
            :value="String(activePull)" @change="onPullSelect">
            <option v-for="entry in pullList" :key="String(entry.index)" :value="String(entry.index)">
              {{ entry.index === null ? 'Live' : `${entry.encounterName}  ${entry.duration}` }}
            </option>
          </select>
        </div>
        <div class="bp-analysis-title">{{ currentEncounterName || 'Current Encounter' }}</div>
      </div>
      <div class="bp-analysis-stats">
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Pull</span>
          <span class="bp-analysis-value">{{ currentPullEntry?.index === null || !currentPullEntry ? 'Live' : `#${currentPullEntry.index}` }}</span>
        </div>
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Encounter</span>
          <span class="bp-analysis-value">{{ currentEncounterName || 'Unknown' }}</span>
        </div>
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Duration</span>
          <span class="bp-analysis-value">{{ encounterDurationLabel }}</span>
        </div>
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Status</span>
          <span class="bp-analysis-value">{{ pullStatusLabel }}</span>
        </div>
        <div class="bp-analysis-stat">
          <span class="bp-analysis-label">Selected Target</span>
          <span class="bp-analysis-value" :style="nameStyle(resolvedSelected)">{{ resolvedSelected || 'None' }}</span>
        </div>
      </div>
    </div>

    <div class="bp-filter-strip">
      <div class="bp-filter-groups">
        <button class="bp-filter-btn" :class="{ active: !showEnemies }" @click="showEnemies = false">Party</button>
        <button class="bp-filter-btn" :class="{ active: showEnemies }" @click="showEnemies = true">Show Enemies</button>
        <button class="bp-filter-btn" :class="{ active: showFriendlyNPCs }" @click="showFriendlyNPCs = !showFriendlyNPCs">NPCs</button>
        <button
          v-if="activeView === 'timeline'"
          v-for="overlay in ['deaths', 'raises', 'casts', 'spikes']"
          :key="overlay"
          class="bp-filter-btn"
          :class="{ active: timelineOverlays.has(overlay as TimelineOverlay) }"
          @click="toggleTimelineOverlay(overlay as TimelineOverlay)"
        >
          {{ overlay }}
        </button>
        <button
          v-if="activeView === 'events'"
          class="bp-filter-btn"
          :class="{ active: eventWindowOnly }"
          @click="eventWindowOnly = !eventWindowOnly"
        >
          Selected Window
        </button>
      </div>
      <div class="bp-chip-row">
        <span v-for="chip in activeFilterChips" :key="chip" class="bp-chip">{{ chip }}</span>
      </div>
    </div>

    <div class="bp-view-tabs">
      <button
        v-for="tab in viewTabs"
        :key="tab.id"
        class="bp-view-tab"
        :class="{ active: activeView === tab.id }"
        @click="activeView = tab.id"
      >
        {{ tab.label }}
        <span v-if="tab.id === 'deaths' && sortedDeaths.length > 0" class="bp-death-badge">{{ sortedDeaths.length }}</span>
      </button>
    </div>

    <div v-if="combatants.length === 0" class="bp-waiting">Waiting for combat data…</div>
    <template v-else-if="activeView === 'overview'">
      <div class="bp-workspace">
        <ActorRail
          :groups="combatantGroups"
          :collapsed-groups="groupCollapsed"
          :selected-name="resolvedSelected"
          :value-for="selectorBadgeFor"
          :fill-width-for="selectorFillWidth"
          :actor-job="actorJob"
          :actor-job-icon="actorJobIcon"
          :name-style="nameStyle"
          :tab-label="tabLabel"
          @toggle-group="toggleGroup"
          @select-actor="selectActor"
        />

        <main class="bp-main">
          <div class="bp-card-grid">
            <button
              v-for="card in selectedActorOverviewCards"
              :key="card.label"
              class="bp-card bp-card--button"
              :class="`bp-card--${card.tone}`"
              @click="openOverviewCard(card.view)"
            >
              <div class="bp-card-label">{{ card.label }}</div>
              <div class="bp-card-value">{{ card.value }}</div>
              <div class="bp-card-detail">{{ card.detail }}</div>
            </button>
          </div>

          <div class="bp-overview-grid">
            <section class="bp-panel">
              <div class="bp-panel-title">Top Abilities Done</div>
              <table class="bp-table">
                <thead><tr><th class="col-name">Ability</th><th class="col-num">Total</th><th class="col-pct">%</th><th class="col-num">Rate</th></tr></thead>
                <tbody>
                  <tr v-for="row in abilities.slice(0, 6)" :key="`ov-done-${row.abilityId}`" @click="selectAbility(row.abilityName)">
                    <td class="col-name"><div class="row-fill" :style="{ width: row.pct + '%' }" /><span class="aname"><AbilityCell :ability-id="row.abilityId" :ability-name="row.abilityName" :icon-src="abilityIconSrc(row.abilityId, row.abilityName)" @icon-error="clearAbilityIcon(row.abilityId, row.abilityName)" /></span></td>
                    <td class="col-num">{{ f(row.totalDamage) }}</td>
                    <td class="col-pct">{{ row.pct }}%</td>
                    <td class="col-num">{{ encounterDurationSec > 0 ? f(row.dps) : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="bp-panel">
              <div class="bp-panel-title">Top Abilities Taken</div>
              <table class="bp-table">
                <thead><tr><th class="col-name">Source Ability</th><th class="col-num">Total</th><th class="col-pct">%</th><th class="col-num">Near Deaths</th></tr></thead>
                <tbody>
                  <tr v-for="row in takenAbilities.slice(0, 6)" :key="`ov-taken-${row.abilityId}`" @click="selectAbility(row.abilityName)">
                    <td class="col-name"><div class="row-fill enc-row-fill" :style="{ width: row.pct + '%' }" /><span class="aname"><AbilityCell :ability-id="row.abilityId" :ability-name="row.abilityName" :icon-src="abilityIconSrc(row.abilityId, row.abilityName)" @icon-error="clearAbilityIcon(row.abilityId, row.abilityName)" /></span></td>
                    <td class="col-num">{{ f(row.totalDamage) }}</td>
                    <td class="col-pct">{{ row.pct }}%</td>
                    <td class="col-num">{{ selectedActorDeathAbilitySet.has(row.abilityName) ? 'Yes' : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="bp-panel">
              <div class="bp-panel-title">Timeline Snapshot</div>
              <div class="bp-mini-chart-shell">
                <div class="bp-mini-chart" :class="{ empty: overviewTimelineBars.length === 0 }">
                  <button
                    v-for="bar in overviewTimelineBars"
                    :key="bar.key"
                    class="bp-mini-chart-bar"
                    :style="{ height: bar.height }"
                    :title="`${bar.label} · ${bar.value}/s`"
                    @click="openTimelineAtBucket(bar.bucket)"
                  />
                  <span v-if="overviewTimelineBars.length === 0">No timeline samples yet.</span>
                </div>
                <div class="bp-mini-chart-values">
                  <span class="bp-mini-pill">{{ metricLabel }}</span>
                  <span class="bp-mini-pill">{{ f((activeTimeline[resolvedSelected] ?? []).reduce((sum, value) => sum + value, 0) / Math.max(encounterDurationSec, 1)) }}/s avg</span>
                  <button
                    v-for="spike in timelineSpikeMarkers"
                    :key="`overview-spike-${spike.index}`"
                    class="bp-mini-pill bp-mini-pill--button"
                    @click="openTimelineAtBucket(spike.index)"
                  >
                    Spike @ {{ fmtTime(spike.index * TIMELINE_BUCKET_SEC * 1000) }} · {{ f(spike.value) }}/s
                  </button>
                </div>
              </div>
            </section>

            <section class="bp-panel">
              <div class="bp-panel-title">Notable Events</div>
              <div v-if="overviewNotableEvents.length === 0" class="bp-empty-panel">No deaths or raise windows yet.</div>
              <button
                v-for="item in overviewNotableEvents"
                :key="item.key"
                class="bp-event-item"
                @click="selectActor(item.death.targetName); selectedDeathIndex = sortedDeaths.findIndex(d => d === item.death); activeView = 'deaths'"
              >
                <span class="bp-event-name" :style="nameStyle(item.death.targetName)">{{ item.label }}</span>
                <span class="bp-event-detail">{{ item.detail }}</span>
              </button>
            </section>
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Overview Inspector</div>
            <div class="bp-inspector-block">
              <div class="bp-kv"><span>Player</span><strong :style="nameStyle(resolvedSelected)">{{ resolvedSelected || 'None' }}</strong></div>
              <div class="bp-kv"><span>rDPS</span><strong :title="rdpsDeltaLabel(resolvedSelected)">{{ f(rdpsFor(resolvedSelected)) }}</strong></div>
              <div class="bp-kv"><span>DPS Given</span><strong>{{ f(rdpsGivenFor(resolvedSelected)) }}</strong></div>
              <div class="bp-kv"><span>DPS Taken</span><strong>{{ f(rdpsTakenFor(resolvedSelected)) }}</strong></div>
              <div class="bp-kv"><span>Biggest Hit</span><strong>{{ selectedDoneHighestHitAbility ? `${selectedDoneHighestHitAbility.abilityName} · ${f(selectedDoneHighestHitAbility.maxHit)}` : '—' }}</strong></div>
            <div class="bp-kv"><span>Biggest Taken</span><strong>{{ selectedTakenAbility?.abilityName ?? '—' }}</strong></div>
            <div class="bp-kv"><span>Deaths</span><strong>{{ selectedActorDeaths.length }}</strong></div>
            <div class="bp-kv"><span>Casts</span><strong>{{ selectedActorCastCount }}</strong></div>
          </div>
          <div class="bp-inspector-block">
            <div class="bp-section-heading">Quick Actions</div>
            <button class="bp-action-btn" @click="activeView = 'pulls'">Open pull summary</button>
            <button class="bp-action-btn" @click="openOverviewCard('done')">Open outgoing breakdown</button>
            <button class="bp-action-btn" @click="openOverviewCard('taken')">Open incoming breakdown</button>
            <button class="bp-action-btn" @click="openSelectedTimeline">Open timeline at spike</button>
            <button class="bp-action-btn" :disabled="selectedActorDeaths.length === 0" @click="openLatestDeath">Open latest death</button>
            <div v-if="partyHighestHit" class="bp-party-highlight">
              <span class="bp-party-label">Party highest hit</span>
              <strong>{{ partyHighestHit.ability }} · {{ f(partyHighestHit.amount) }}</strong>
              <span :style="nameStyle(partyHighestHit.actor)">{{ partyHighestHit.actor }}</span>
            </div>
          </div>
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'pulls'">
      <div class="bp-pulls-workspace">
        <aside class="bp-pull-list-panel">
          <div class="bp-panel-title">Session Pulls</div>
          <button
            v-for="entry in pullList"
            :key="String(entry.index)"
            class="bp-pull-row"
            :class="{ active: activePull === entry.index }"
            @click="selectPullEntry(entry)"
          >
            <span v-if="entry.index !== null && entry.isFirstInEncounter" class="bp-pull-encounter-header">
              {{ entry.encounterName }} · {{ entry.pullCount ?? 1 }} pull{{ (entry.pullCount ?? 1) === 1 ? '' : 's' }}
            </span>
            <span class="bp-pull-row-main">
              <strong>{{ entryPullLabel(entry) }}</strong>
              <span>{{ entry.encounterName }}</span>
            </span>
            <span class="bp-pull-row-stats">
              <span>{{ entry.duration || '0:00' }}</span>
              <span v-if="entry.bossPercentLabel">{{ entry.bossPercentLabel }} boss</span>
              <span>{{ f(entry.dps ?? 0) }} DPS</span>
              <span title="Raid-contributing DPS: raw DPS adjusted by buff credit">{{ f(entry.rdps ?? entry.dps ?? 0) }} rDPS</span>
              <span :class="{ danger: (entry.deaths ?? 0) > 0 }">{{ entry.deaths ?? 0 }} deaths</span>
            </span>
          </button>
        </aside>

        <main class="bp-main">
          <div class="bp-card-grid">
            <div class="bp-card">
              <div class="bp-card-label">Duration</div>
              <div class="bp-card-value">{{ selectedPullEntry?.duration || encounterDurationLabel }}</div>
              <div class="bp-card-detail">
                <template v-if="previousPullEntry">
                  {{ formatEntryDelta(parseEntryDuration(selectedPullEntry) - parseEntryDuration(previousPullEntry), fmtSeconds) }} vs previous
                </template>
                <template v-else>current pull context</template>
              </div>
            </div>
            <div class="bp-card bp-card--taken">
              <div class="bp-card-label">Boss HP</div>
              <div class="bp-card-value">{{ selectedPullEntry?.bossPercentLabel ?? '—' }}</div>
              <div class="bp-card-detail">
                <template v-if="bestProgressPullEntry && selectedPullEntry?.bossPercent !== undefined">
                  {{ selectedPullEntry.index === bestProgressPullEntry.index ? 'best progress' : `${((selectedPullEntry.bossPercent ?? 0) - (bestProgressPullEntry.bossPercent ?? 0)).toFixed(1)} pts from best` }}
                </template>
                <template v-else>needs enemy HP samples</template>
              </div>
            </div>
            <div class="bp-card bp-card--done">
              <div class="bp-card-label">Party rDPS</div>
              <div class="bp-card-value">{{ f(selectedPullEntry?.rdps ?? selectedPullEntry?.dps ?? 0) }}</div>
              <div class="bp-card-detail">
                <template v-if="previousPullEntry">
                  {{ formatEntryDelta((selectedPullEntry?.rdps ?? selectedPullEntry?.dps ?? 0) - (previousPullEntry.rdps ?? previousPullEntry.dps ?? 0), f) }} vs previous
                </template>
                <template v-else>{{ f(selectedPullEntry?.dps ?? 0) }} raw DPS</template>
              </div>
            </div>
            <div class="bp-card bp-card--deaths">
              <div class="bp-card-label">Deaths</div>
              <div class="bp-card-value">{{ selectedPullEntry?.deaths ?? sortedDeaths.length }}</div>
              <div class="bp-card-detail">{{ deathClustersForCurrent.length > 0 ? `${deathClustersForCurrent.length} death cluster${deathClustersForCurrent.length === 1 ? '' : 's'}` : 'no clustered deaths' }}</div>
            </div>
            <div class="bp-card bp-card--taken">
              <div class="bp-card-label">Damage Taken</div>
              <div class="bp-card-value">{{ f(selectedPullEntry?.damageTaken ?? 0) }}</div>
              <div class="bp-card-detail">{{ f(selectedPullEntry?.dtps ?? 0) }} DTPS</div>
            </div>
          </div>

          <div class="bp-pulls-grid">
            <section class="bp-panel">
              <div class="bp-panel-title">Quick Read</div>
              <div class="bp-pull-note-list">
                <div v-for="note in pullDashboardNotes" :key="note" class="bp-pull-note">{{ note }}</div>
              </div>
            </section>

            <section class="bp-panel">
              <div class="bp-panel-title">Death Windows</div>
              <div v-if="sortedDeaths.length === 0" class="bp-empty-panel">No deaths recorded for this pull.</div>
              <button
                v-for="death in sortedDeaths.slice(0, 8)"
                :key="`${death.targetName}-${death.timestamp}`"
                class="bp-event-item"
                @click="selectActor(death.targetName); selectedDeathIndex = sortedDeaths.findIndex(d => d === death); activeView = 'deaths'"
              >
                <span class="bp-event-name" :style="nameStyle(death.targetName)">{{ death.targetName }}</span>
                <span class="bp-event-detail">
                  {{ fmtTime(death.timestamp) }}{{ death.resurrectTime ? ` · raised ${fmtTime(death.resurrectTime)}` : ' · no raise seen' }}
                </span>
              </button>
            </section>

            <section class="bp-panel">
              <div class="bp-panel-title">Top Incoming Sources</div>
              <table class="bp-table">
                <thead><tr><th class="col-name">Ability</th><th class="col-num">Total</th><th class="col-num">Hits</th></tr></thead>
                <tbody>
                  <tr v-for="row in takenAbilities.slice(0, 8)" :key="`pull-taken-${row.abilityId}`" @click="selectAbility(row.abilityName); activeView = 'taken'">
                    <td class="col-name"><div class="row-fill enc-row-fill" :style="{ width: row.pct + '%' }" /><span class="aname"><AbilityCell :ability-id="row.abilityId" :ability-name="row.abilityName" :icon-src="abilityIconSrc(row.abilityId, row.abilityName)" @icon-error="clearAbilityIcon(row.abilityId, row.abilityName)" /></span></td>
                    <td class="col-num">{{ f(row.totalDamage) }}</td>
                    <td class="col-num">{{ row.hits }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="bp-panel">
              <div class="bp-panel-title">Next Drilldowns</div>
              <button class="bp-action-btn" @click="activeView = 'overview'">Open overview</button>
              <button class="bp-action-btn" @click="activeView = 'timeline'">Open timeline</button>
              <button class="bp-action-btn" :disabled="sortedDeaths.length === 0" @click="activeView = 'deaths'">Open deaths</button>
              <button class="bp-action-btn" @click="activeView = 'events'">Open event rows</button>
            </section>
          </div>
        </main>
      </div>
    </template>

    <template v-else-if="activeView === 'done'">
      <div class="bp-workspace">
        <ActorRail
          :groups="combatantGroups"
          :collapsed-groups="groupCollapsed"
          :selected-name="resolvedSelected"
          :value-for="selectorBadgeFor"
          :fill-width-for="selectorFillWidth"
          :actor-job="actorJob"
          :actor-job-icon="actorJobIcon"
          :name-style="nameStyle"
          :tab-label="tabLabel"
          @toggle-group="toggleGroup"
          @select-actor="selectActor"
        />

        <main class="bp-main">
          <div class="bp-panel-toolbar">
            <div class="bp-panel-title">Outgoing Breakdown</div>
            <div class="bp-toolbar-group">
              <button class="bp-mode-btn" :class="{ active: doneDimension === 'ability' }" @click="doneDimension = 'ability'">Ability</button>
              <button class="bp-mode-btn" :class="{ active: doneDimension === 'targets' }" @click="doneDimension = 'targets'">Targets</button>
              <button class="bp-mode-btn" :class="{ active: doneDimension === 'sources' }" @click="doneDimension = 'sources'">Sources</button>
            </div>
          </div>
          <div v-if="doneDimension !== 'ability'" class="bp-empty-panel">Target and source pivots are reserved for the shared event stream layer. The ability view is live now and keeps the selected ability pinned across views.</div>
          <div v-else-if="abilities.length === 0" class="bp-waiting">No outgoing ability data for this pull.</div>
          <div v-else class="bp-scroll">
            <table class="bp-table">
              <thead><tr>
                <th class="col-name">Ability</th>
                <th class="col-num">Total</th>
                <th class="col-pct">%</th>
                <th class="col-num">Rate</th>
                <th class="col-num">Hits/Casts</th>
                <th class="col-num">Avg</th>
                <th class="col-num">Max</th>
              </tr></thead>
              <tbody>
                <tr v-for="row in abilities" :key="row.abilityId" :class="{ 'bp-row-active': selectedDoneAbility?.abilityName === row.abilityName }" @click="selectAbility(row.abilityName)">
                  <td class="col-name"><div class="row-fill" :style="{ width: row.pct + '%' }" /><span class="aname"><AbilityCell :ability-id="row.abilityId" :ability-name="row.abilityName" :icon-src="abilityIconSrc(row.abilityId, row.abilityName)" @icon-error="clearAbilityIcon(row.abilityId, row.abilityName)" /></span></td>
                  <td class="col-num">{{ f(row.totalDamage) }}</td>
                  <td class="col-pct">{{ row.pct }}%</td>
                  <td class="col-num">{{ encounterDurationSec > 0 ? f(row.dps) : '—' }}</td>
                  <td class="col-num">{{ row.hits }}</td>
                  <td class="col-num">{{ f(row.avg) }}</td>
                  <td class="col-num">{{ f(row.maxHit) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Ability Inspector</div>
          <div v-if="!selectedDoneAbility" class="bp-empty-panel">Select an ability to inspect it.</div>
          <template v-else>
            <div class="bp-inspector-block">
              <div class="bp-kv"><span>Ability</span><strong>{{ selectedDoneAbility.abilityName }}</strong></div>
              <div class="bp-kv"><span>Total</span><strong>{{ f(selectedDoneAbility.totalDamage) }}</strong></div>
              <div class="bp-kv"><span>Share</span><strong>{{ selectedDoneAbility.pct }}%</strong></div>
              <div class="bp-kv"><span>Rate</span><strong>{{ encounterDurationSec > 0 ? f(selectedDoneAbility.dps) : '—' }}</strong></div>
              <div class="bp-kv"><span>Hits</span><strong>{{ selectedDoneAbility.hits }}</strong></div>
              <div class="bp-kv"><span>Range</span><strong>{{ f(selectedDoneAbility.minHit) }} → {{ f(selectedDoneAbility.maxHit) }}</strong></div>
              <div class="bp-kv"><span>Crit Avg</span><strong>Not captured yet</strong></div>
              <div class="bp-kv"><span>Direct Hit Avg</span><strong>Not captured yet</strong></div>
            </div>
          </template>
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'taken'">
      <div class="bp-workspace">
        <ActorRail
          :groups="combatantGroups"
          :collapsed-groups="groupCollapsed"
          :selected-name="resolvedSelected"
          fill-class="bp-rail-fill--taken"
          :value-for="takenSelectorBadgeFor"
          :fill-width-for="selectorFillWidth"
          :actor-job="actorJob"
          :actor-job-icon="actorJobIcon"
          :name-style="nameStyle"
          :tab-label="tabLabel"
          @toggle-group="toggleGroup"
          @select-actor="selectActor"
        />

        <main class="bp-main">
          <div class="bp-panel-toolbar">
            <div class="bp-panel-title">Incoming Breakdown</div>
            <div class="bp-toolbar-group">
              <button class="bp-mode-btn" :class="{ active: takenMode === 'damage' }" @click="takenMode = 'damage'">Damage Taken</button>
              <button class="bp-mode-btn" :class="{ active: takenMode === 'healing' }" @click="takenMode = 'healing'">Healing Received</button>
            </div>
          </div>
          <div v-if="incomingAbilities.length === 0" class="bp-waiting">No incoming {{ takenMode === 'healing' ? 'healing' : 'damage' }} data for this pull.</div>
          <div v-else class="bp-scroll">
            <table class="bp-table">
              <thead><tr>
                <th class="col-name">Source Ability</th>
                <th class="col-num">Total</th>
                <th class="col-pct">%</th>
                <th class="col-num">{{ takenMode === 'healing' ? 'Heals' : 'Hits' }}</th>
                <th class="col-num">Avg</th>
                <th class="col-num">Max</th>
                <th class="col-num">Near Deaths</th>
              </tr></thead>
              <tbody>
                <tr v-for="row in incomingAbilities" :key="`${takenMode}-${row.abilityId}`" :class="{ 'bp-row-active': selectedTakenAbility?.abilityName === row.abilityName }" @click="selectAbility(row.abilityName)">
                  <td class="col-name"><div class="row-fill enc-row-fill" :style="{ width: row.pct + '%' }" /><span class="aname"><AbilityCell :ability-id="row.abilityId" :ability-name="row.abilityName" :icon-src="abilityIconSrc(row.abilityId, row.abilityName)" @icon-error="clearAbilityIcon(row.abilityId, row.abilityName)" /></span></td>
                  <td class="col-num">{{ f(row.totalDamage) }}</td>
                  <td class="col-pct">{{ row.pct }}%</td>
                  <td class="col-num">{{ row.hits }}</td>
                  <td class="col-num">{{ f(row.avg) }}</td>
                  <td class="col-num">{{ f(row.maxHit) }}</td>
                  <td class="col-num">{{ (takenMode === 'healing' ? selectedActorDeathHealingAbilitySet : selectedActorDeathAbilitySet).has(row.abilityName) ? 'Yes' : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">{{ takenMode === 'healing' ? 'Healing Inspector' : 'Taken Inspector' }}</div>
          <div v-if="!selectedTakenAbility" class="bp-empty-panel">Select an incoming ability to inspect it.</div>
          <template v-else>
            <div class="bp-inspector-block">
              <div class="bp-kv"><span>Ability</span><strong>{{ selectedTakenAbility.abilityName }}</strong></div>
              <div class="bp-kv"><span>Total</span><strong>{{ f(selectedTakenAbility.totalDamage) }}</strong></div>
              <div class="bp-kv"><span>Share</span><strong>{{ selectedTakenAbility.pct }}%</strong></div>
              <div class="bp-kv"><span>{{ takenMode === 'healing' ? 'Heals' : 'Hits' }}</span><strong>{{ selectedTakenAbility.hits }}</strong></div>
              <div class="bp-kv"><span>Average</span><strong>{{ f(selectedTakenAbility.avg) }}</strong></div>
              <div class="bp-kv"><span>Near Deaths</span><strong>{{ (takenMode === 'healing' ? selectedActorDeathHealingAbilitySet : selectedActorDeathAbilitySet).has(selectedTakenAbility.abilityName) ? 'Correlated' : 'None tracked' }}</strong></div>
            </div>
          </template>
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'timeline'">
      <div class="bp-workspace">
        <ActorRail
          :groups="combatantGroups"
          :collapsed-groups="groupCollapsed"
          :selected-name="resolvedSelected"
          fill-class="bp-rail-fill--timeline"
          :value-for="selectorBadgeFor"
          :fill-width-for="selectorFillWidth"
          :actor-job="actorJob"
          :actor-job-icon="actorJobIcon"
          :name-style="nameStyle"
          :tab-label="tabLabel"
          @toggle-group="toggleGroup"
          @select-actor="selectActor"
        >
          <template #before-groups>
            <div class="bp-metric-tabs">
              <button class="bp-metric-tab" :class="{ active: chartMetric === 'dps' }"  @click="chartMetric = 'dps'">DPS</button>
              <button class="bp-metric-tab" :class="{ active: chartMetric === 'rdps' }" @click="chartMetric = 'rdps'">rDPS</button>
              <button class="bp-metric-tab" :class="{ active: chartMetric === 'hps' }"  @click="chartMetric = 'hps'">HPS</button>
              <button class="bp-metric-tab" :class="{ active: chartMetric === 'dtps' }" @click="chartMetric = 'dtps'">DTPS</button>
            </div>
          </template>
        </ActorRail>

        <main class="bp-main">
          <div v-if="!chartLines" class="bp-waiting">No {{ metricLabel }} data for this encounter.</div>
          <div v-else ref="chartAreaRef" class="bp-chart-area">
            <svg ref="svgRef" class="bp-chart-svg"
              :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
              preserveAspectRatio="xMidYMid meet"
              @mousemove="onSvgMouseMove"
              @mouseleave="hoverVisible = false">
              <g v-for="tick in chartLines.yTicks" :key="tick.y">
                <line :x1="PL" :y1="tick.y" :x2="PL + CW" :y2="tick.y" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
                <text :x="PL - 5" :y="tick.y + 4" text-anchor="end" class="axis-label">{{ tick.label }}</text>
              </g>
              <g v-for="tick in chartLines.xTicks" :key="tick.x">
                <line :x1="tick.x" :y1="PT" :x2="tick.x" :y2="PT + CH" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
                <text :x="tick.x" :y="PT + CH + 14" text-anchor="middle" class="axis-label">{{ tick.label }}</text>
              </g>
              <rect :x="PL" :y="PT" :width="CW" :height="CH" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />

              <polyline
                v-for="s in chartLines.series"
                v-show="!hiddenSeries.has(s.name)"
                :key="s.name"
                :points="chartLines.points(s.values)"
                fill="none"
                :stroke="s.color"
                :stroke-width="1.5"
                :stroke-dasharray="s.isGroup ? '5,3' : undefined"
                stroke-linejoin="round"
                stroke-linecap="round"
                :opacity="s.isGroup ? 0.45 : (s.isFocused ? 1 : 0.28)"
              />

              <line v-show="hoverVisible && hoverBucket >= 0"
                :x1="hoverLineX" :y1="PT" :x2="hoverLineX" :y2="PT + CH"
                stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="3,3" />

              <circle
                v-for="s in chartLines.series.filter(s => !s.isGroup && !hiddenSeries.has(s.name))"
                v-show="hoverVisible && hoverBucket >= 0"
                :key="`dot-${s.name}`"
                :cx="hoverLineX"
                :cy="PT + CH - Math.min((s.values[hoverBucket] ?? 0) / chartLines.maxDps, 1) * CH"
                r="3" :fill="s.color" stroke="#0d0d10" stroke-width="1.5"
              />

              <line
                v-if="timelineOverlays.has('deaths')"
                v-for="time in timelineDeathMarkers"
                :key="`death-marker-${time}`"
                :x1="markerXForTime(time, chartLines.maxBuckets)"
                :y1="PT"
                :x2="markerXForTime(time, chartLines.maxBuckets)"
                :y2="PT + CH"
                stroke="rgba(255,70,70,0.55)"
                stroke-width="1.5"
              />

              <line
                v-if="timelineOverlays.has('raises')"
                v-for="time in timelineRaiseMarkers"
                :key="`raise-marker-${time}`"
                :x1="markerXForTime(time, chartLines.maxBuckets)"
                :y1="PT"
                :x2="markerXForTime(time, chartLines.maxBuckets)"
                :y2="PT + CH"
                stroke="rgba(90,220,120,0.55)"
                stroke-width="1.5"
              />

              <circle
                v-if="timelineOverlays.has('casts')"
                v-for="time in timelineCastMarkers"
                :key="`cast-marker-${time}`"
                :cx="markerXForTime(time, chartLines.maxBuckets)"
                :cy="PT + CH + 6"
                r="2"
                fill="#74b9ff"
              />

              <rect
                v-if="timelineOverlays.has('spikes')"
                v-for="spike in timelineSpikeMarkers"
                :key="`spike-${spike.index}`"
                :x="markerXForTime(spike.index * TIMELINE_BUCKET_SEC, chartLines.maxBuckets) - 4"
                :y="PT"
                width="8"
                :height="CH"
                fill="rgba(255,210,80,0.08)"
              />
            </svg>

            <div class="bp-tooltip" :style="tooltipStyle" v-if="hoverTooltip">
              <div class="bp-tooltip-time">{{ hoverTooltip.timeLabel }}</div>
              <div v-for="entry in hoverTooltip.entries" :key="entry.name" class="bp-tooltip-row">
                <span class="bp-tooltip-dot" :style="{ background: entry.color }" />
                <span class="bp-tooltip-name" :style="nameStyle(entry.name)">{{ entry.label }}</span>
                <span class="bp-tooltip-val">{{ f(entry.value) }}</span>
                <span v-if="chartMetric === 'rdps'" class="bp-tooltip-adj">+{{ f(entry.rdpsGiven) }} / -{{ f(entry.rdpsTaken) }}</span>
              </div>
              <div v-if="hoverTooltip.entries.length > 1" class="bp-tooltip-group">
                <span class="bp-tooltip-name">Group</span>
                <span class="bp-tooltip-val">{{ f(hoverTooltip.groupVal) }}</span>
              </div>
            </div>

            <div class="bp-chart-legend">
              <div v-for="s in chartLines.series" :key="s.name" class="bp-legend-item" :class="{ hidden: hiddenSeries.has(s.name) }" @click="toggleSeries(s.name)">
                <span class="bp-legend-dot"
                  :style="{ background: s.isGroup ? 'transparent' : s.color, border: s.isGroup ? `1px dashed ${GROUP_COLOR}` : 'none' }" />
                <span class="bp-legend-name" :class="{ 'bp-legend-name--focused': s.isFocused }" :style="s.isGroup ? undefined : nameStyle(s.name)">{{ s.isGroup ? 'Group' : tabLabel(s.name) }}</span>
              </div>
            </div>
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Timeline Inspector</div>
            <div class="bp-inspector-block">
              <div class="bp-kv"><span>Metric</span><strong>{{ metricLabel }}</strong></div>
              <div class="bp-kv"><span>Selected Actor</span><strong :style="nameStyle(resolvedSelected)">{{ resolvedSelected }}</strong></div>
              <div v-if="chartMetric === 'rdps'" class="bp-kv"><span>DPS Given</span><strong>{{ f(rdpsGivenFor(resolvedSelected)) }}</strong></div>
              <div v-if="chartMetric === 'rdps'" class="bp-kv"><span>DPS Taken</span><strong>{{ f(rdpsTakenFor(resolvedSelected)) }}</strong></div>
              <div class="bp-kv"><span>Hover Window</span><strong>{{ hoverTooltip?.timeLabel ?? '—' }}</strong></div>
            <div class="bp-kv"><span>Deaths</span><strong>{{ timelineInspectorDeaths.length }}</strong></div>
            <div class="bp-kv"><span>Casts</span><strong>{{ timelineInspectorCasts.length }}</strong></div>
          </div>
          <div class="bp-inspector-block">
            <div class="bp-section-heading">Window Events</div>
            <div v-if="timelineInspectorDeaths.length === 0 && timelineInspectorCasts.length === 0" class="bp-empty-panel">Hover the chart to correlate deaths, raises, and casts in the same time bucket.</div>
            <div v-for="death in timelineInspectorDeaths" :key="`ins-death-${death.timestamp}`" class="bp-inspector-list-item">
              <strong :style="nameStyle(death.targetName)">{{ death.targetName }}</strong>
              <span>Death @ {{ fmtTime(death.timestamp) }}</span>
            </div>
            <div v-for="cast in timelineInspectorCasts" :key="`ins-cast-${cast.t}-${cast.abilityName}`" class="bp-inspector-list-item">
              <strong>{{ cast.abilityName }}</strong>
              <span>{{ cast.target ? `→ ${cast.target}` : 'cast' }}</span>
            </div>
          </div>
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'deaths'">
      <div v-if="sortedDeaths.length === 0" class="bp-waiting">No deaths recorded this pull.</div>
      <div v-else class="bp-workspace">
        <aside class="bp-rail bp-rail--deaths">
          <div class="bp-rail-title">Deaths</div>
          <div
            v-for="(death, i) in sortedDeaths" :key="i"
            class="dl-death-row"
            :class="{ active: selectedDeathIndex === i }"
            @click="selectedDeathIndex = selectedDeathIndex === i ? null : i; selectActor(death.targetName)"
          >
            <div class="dl-death-info">
              <span class="dl-death-name" :style="nameStyle(death?.targetName ?? '')">{{ death?.targetName ?? 'Unknown' }}</span>
              <span class="dl-death-time">{{ fmtTime(death?.timestamp ?? 0) }}</span>
            </div>
            <div class="dl-spark">
              <svg viewBox="0 0 120 28" preserveAspectRatio="none" width="120" height="28" class="bp-spark-svg">
                <line x1="0" y1="28" x2="120" y2="28" stroke="rgba(255,255,255,0.07)" stroke-width="1" />
                <line x1="0" y1="14" x2="120" y2="14" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
                <template v-for="(bar, bi) in deathHpBars(death)" :key="'b-' + bi">
                  <rect :x="bar.x" :y="28 - (bar.hpBefore * 28)" :width="bar.width - 1" :height="bar.hpBefore * 28" :fill="bar.hpBefore > 0.5 ? 'rgba(5,136,55,0.5)' : (bar.hpBefore > 0.25 ? 'rgba(180,150,50,0.5)' : 'rgba(180,50,50,0.5)')" opacity="0.7" />
                  <rect v-if="bar.type === 'heal' || bar.type === 'dmg'" :x="bar.x" :y="bar.type === 'heal' ? (28 - (bar.hpAfter * 28)) : (28 - (bar.hpBefore * 28))" :width="bar.width - 1" :height="Math.abs((bar.hpAfter - bar.hpBefore) * 28)" :fill="bar.type === 'heal' ? '#ffffff' : '#000000'" opacity="0.35" />
                  <rect v-if="bar.type === 'death'" :x="bar.x" y="0" :width="Math.max(1, bar.width - 1)" height="28" fill="rgba(255,0,0,0.18)" />
                </template>
                <line x1="120" y1="0" x2="120" y2="28" stroke="#ff0000" stroke-width="2" />
                <text x="115" y="8" fill="#ff0000" font-size="6">X</text>
              </svg>
              <span v-if="!deathHpBars(death).length" class="bp-spark-none">no HP data</span>
            </div>
          </div>
        </aside>

        <main class="bp-main">
          <div v-if="!selectedDeath" class="dl-detail-empty">Select a death to review</div>
          <template v-else>
            <div class="dl-detail-header">
              <span class="dl-detail-name" :style="nameStyle(selectedDeath.targetName)">{{ selectedDeath.targetName }}</span>
              <span class="dl-detail-time">died @ {{ fmtTime(selectedDeath?.timestamp ?? 0) }}</span>
              <span class="dl-detail-sub">window {{ selectedDeathWindow ? `${fmtTime(selectedDeathWindow.start)} → ${fmtTime(selectedDeathWindow.end)}` : '—' }}</span>
            </div>
            <div v-if="deathHitLog.length === 0" class="dl-detail-empty">No hit data recorded.</div>
            <div v-else class="dl-hit-scroll">
              <table class="dl-hit-table">
                <thead><tr>
                  <th class="dl-col-time">Time</th>
                  <th class="dl-col-type"></th>
                  <th class="dl-col-ability">Ability</th>
                  <th class="dl-col-source">Source</th>
                  <th class="dl-col-hpbefore">HP Before</th>
                  <th class="dl-col-hpbar">Trend</th>
                  <th class="dl-col-amount">Amount</th>
                </tr></thead>
                <tbody>
                  <tr
                    v-for="(hit, hi) in deathHitLog" :key="hi"
                    :class="[hit.type === 'heal' ? 'dl-row-heal' : 'dl-row-dmg', hit.isDeathBlow ? 'dl-row-death' : '', selectedAbility === hit.abilityName ? 'bp-row-active' : '']"
                    :style="!hit.isDeathBlow ? hitRowStyle(hit) : {}"
                    @click="selectAbility(hit.abilityName)"
                  >
                    <td class="dl-col-time">{{ fmtTime(hit?.t ?? 0) }}</td>
                    <td class="dl-col-type">
                      <span v-if="hit.isDeathBlow" class="dl-badge-death">X</span>
                      <span v-else :class="hit.type === 'heal' ? 'dl-badge-heal' : 'dl-badge-dmg'">{{ hit.type === 'heal' ? 'H' : 'D' }}</span>
                    </td>
                    <td class="dl-col-ability"><AbilityCell :ability-id="abilityIdForName(hit.abilityName)" :ability-name="hit.abilityName" :icon-src="abilityIconSrc(abilityIdForName(hit.abilityName), hit.abilityName)" small @icon-error="clearAbilityIcon(abilityIdForName(hit.abilityName), hit.abilityName)" /></td>
                    <td class="dl-col-source">{{ hit.sourceName }}</td>
                    <td class="dl-col-hpbefore">
                      <span>{{ formatHpBefore(hit) }}</span>
                      <span v-if="hit.isEstimated" class="dl-hp-estimate">est.</span>
                    </td>
                    <td class="dl-col-hpbar">
                      <div class="dl-hpbar-container">
                        <div class="dl-hpbar-bg" :style="`width: ${hit.hpBefore * 100}%`"></div>
                        <div
                          v-if="Math.abs(hit.hpAfter - hit.hpBefore) > 0.001"
                          class="dl-hpbar-change"
                          :class="hit.type === 'heal' ? 'dl-hpbar-heal' : 'dl-hpbar-dmg'"
                          :style="hit.type === 'heal' ? `left: ${hit.hpBefore * 100}%; width: ${(hit.hpAfter - hit.hpBefore) * 100}%` : `left: ${hit.hpAfter * 100}%; width: ${(hit.hpBefore - hit.hpAfter) * 100}%`"
                        ></div>
                      </div>
                    </td>
                    <td class="dl-col-amount" :class="hit.type === 'heal' ? 'dl-amount-heal-bold' : (hit.isDeathBlow ? 'dl-amount-death' : 'dl-amount-dmg-bold')">
                      {{ hit.isDeathBlow ? 'KO' : (hit.type === 'heal' ? '+' : '-') + f(hit.amount) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Death Inspector</div>
          <div class="bp-toolbar-group bp-toolbar-group--full">
            <button class="bp-mode-btn" :class="{ active: deathInspectorTab === 'recap' }" @click="deathInspectorTab = 'recap'">Recap</button>
            <button class="bp-mode-btn" :class="{ active: deathInspectorTab === 'context' }" @click="deathInspectorTab = 'context'">Context</button>
            <button class="bp-mode-btn" :class="{ active: deathInspectorTab === 'related' }" @click="deathInspectorTab = 'related'">Related Damage</button>
          </div>
          <div v-if="!selectedDeath" class="bp-empty-panel">Pick a death to inspect it.</div>
          <template v-else-if="deathInspectorTab === 'recap'">
            <div class="bp-inspector-block">
              <div class="bp-kv"><span>Target</span><strong :style="nameStyle(selectedDeath.targetName)">{{ selectedDeath.targetName }}</strong></div>
              <div class="bp-kv"><span>Time</span><strong>{{ fmtTime(selectedDeath.timestamp) }}</strong></div>
              <div class="bp-kv"><span>Raised</span><strong>{{ selectedDeath.resurrectTime ? fmtTime(selectedDeath.resurrectTime) : 'No' }}</strong></div>
              <div class="bp-kv"><span>Window Length</span><strong>{{ selectedDeathWindow ? fmtTime(selectedDeathWindow.end - selectedDeathWindow.start) : '—' }}</strong></div>
              <div class="bp-kv"><span>Estimated</span><strong>{{ deathHitLog.some(hit => hit.isEstimated) ? 'Yes' : 'No' }}</strong></div>
            </div>
          </template>
          <template v-else-if="deathInspectorTab === 'context'">
            <div class="bp-inspector-block">
              <div class="bp-section-heading">Nearby casts</div>
              <div v-if="selectedActorCastEvents.filter(event => selectedDeathWindow && event.t >= selectedDeathWindow.start && event.t <= selectedDeathWindow.end).length === 0" class="bp-empty-panel">No casts for this player inside the selected death window.</div>
              <div
                v-for="cast in selectedActorCastEvents.filter(event => selectedDeathWindow && event.t >= selectedDeathWindow.start && event.t <= selectedDeathWindow.end).slice(0, 8)"
                :key="`death-cast-${cast.t}-${cast.abilityName}`"
                class="bp-inspector-list-item"
              >
                <strong>{{ cast.abilityName }}</strong>
                <span>{{ fmtTime(cast.t) }}</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="bp-inspector-block">
              <div class="bp-section-heading">Related damage</div>
              <div v-if="selectedDeathRelatedDamage.length === 0" class="bp-empty-panel">No incoming damage rows were captured in this recap.</div>
              <div v-for="row in selectedDeathRelatedDamage" :key="row.ability" class="bp-inspector-list-item">
                <strong>{{ row.ability }}</strong>
                <span>{{ f(row.amount) }}</span>
              </div>
            </div>
          </template>
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'casts'">
      <div class="bp-workspace">
        <ActorRail
          :groups="castGroups"
          :collapsed-groups="groupCollapsed"
          :selected-name="castSelectedPlayer"
          fill-class="bp-rail-fill--casts"
          :value-for="castSelectorBadgeFor"
          :fill-width-for="selectorFillWidth"
          :actor-job="actorJob"
          :actor-job-icon="actorJobIcon"
          :name-style="nameStyle"
          :tab-label="tabLabel"
          @toggle-group="toggleGroup"
          @select-actor="selectActor"
        />

        <main class="bp-main">
          <div v-if="!castPlayerData" class="bp-waiting">Select a party member to view casts.</div>
          <template v-else>
            <div v-if="castHoverData" class="cast-hover-tooltip" :style="{ left: castHoverData.x + 'px', top: castHoverData.y + 'px' }">
              <div class="cast-tooltip-time">{{ fmtTime(castHoverData.time * 1000) }}</div>
              <div class="cast-tooltip-ability">{{ castHoverData.ability }}</div>
              <div class="cast-tooltip-target" v-if="castHoverData.target">→ {{ castHoverData.target }}</div>
            </div>

            <div class="cast-list-header">
              <span>{{ castPlayerData.abilities.length }} abilities · {{ castPlayerData.events.length }} total casts</span>
              <div class="bp-toolbar-group">
                <button
                  v-for="filter in ['cooldowns', 'mitigations', 'dps', 'heals']"
                  :key="filter"
                  class="bp-mode-btn"
                  :class="{ active: castFilters.has(filter as CastFilter) }"
                  @click="toggleCastFilter(filter as CastFilter)"
                >
                  {{ filter }}
                </button>
              </div>
            </div>
            <div class="cast-analysis-shell">
              <div class="cast-analysis-scroll">
                <div class="cast-analysis-table" :style="{ width: (castTimelinePixelWidth + 170) + 'px' }">
                  <div class="cast-analysis-label-head">
                    <span>Timeline</span>
                    <small>Wheel or drag horizontally</small>
                  </div>
                  <div class="cast-analysis-grid cast-analysis-grid--head">
                    <div class="cast-analysis-axis">
                      <span v-for="tick in castTimeTicks" :key="`axis-${tick}`" class="cast-xiv-tick" :style="{ left: (tick / castTimelineDuration * 100) + '%' }">{{ fmtSeconds(tick) }}</span>
                    </div>
                    <div
                      v-for="tick in castTimeTicks"
                      :key="`grid-${tick}`"
                      class="cast-analysis-gridline"
                      :style="{ left: (tick / castTimelineDuration * 100) + '%' }"
                    />
                    <div v-if="castPlayerDeathTime !== null" class="cast-analysis-death-line" :style="{ left: (castPlayerDeathTime / castTimelineDuration * 100) + '%' }" />
                    <div v-if="castPlayerResTime !== null" class="cast-analysis-raise-line" :style="{ left: (castPlayerResTime / castTimelineDuration * 100) + '%' }" />
                  </div>

                  <template v-if="castResourceTracks.length > 0">
                    <div class="cast-analysis-section">Resources</div>
                    <div class="cast-analysis-section cast-analysis-section--timeline"></div>
                    <template v-for="track in castResourceTracks" :key="track.key">
                      <div class="cast-analysis-label cast-resource-label">
                        <span class="cast-analysis-name">{{ track.label }}</span>
                        <span class="cast-analysis-meta">{{ track.value }}</span>
                      </div>
                      <div class="cast-analysis-grid cast-analysis-grid--resource">
                        <div
                          v-for="tick in castTimeTicks"
                          :key="`resource-grid-${track.key}-${tick}`"
                          class="cast-analysis-gridline"
                          :style="{ left: (tick / castTimelineDuration * 100) + '%' }"
                        />
                        <svg class="cast-resource-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                          <path :d="resourceAreaPath(track.key)" :fill="track.fill" />
                          <polyline :points="resourcePolyline(track.key)" fill="none" :stroke="track.color" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                        </svg>
                        <div v-if="castPlayerDeathTime !== null" class="cast-analysis-death-line" :style="{ left: (castPlayerDeathTime / castTimelineDuration * 100) + '%' }" />
                        <div v-if="castPlayerResTime !== null" class="cast-analysis-raise-line" :style="{ left: (castPlayerResTime / castTimelineDuration * 100) + '%' }" />
                      </div>
                    </template>
                  </template>

                  <template v-for="group in castTimelineGroups" :key="group.category">
                    <div class="cast-analysis-section">{{ group.label }}</div>
                    <div class="cast-analysis-section cast-analysis-section--timeline"></div>
                    <template v-for="row in group.rows" :key="row.name">
                      <div
                        class="cast-analysis-label"
                        :class="{ active: castSelectedAbility === row.name || selectedAbility === row.name }"
                        @click="castSelectedAbility = row.name; selectAbility(row.name)"
                      >
                        <span class="cast-ability-icon">
                          <img v-if="abilityIconSrc(row.events[0]?.abilityId ?? '', row.name)" :src="abilityIconSrc(row.events[0]?.abilityId ?? '', row.name)" :alt="row.name" @error="clearAbilityIcon(row.events[0]?.abilityId ?? '', row.name)" />
                          <span v-else>{{ abilityInitials(row.name) }}</span>
                        </span>
                        <span class="cast-analysis-name">{{ row.name }}</span>
                        <span class="cast-analysis-meta">{{ row.casts }} · avg {{ row.avgInterval }}s</span>
                      </div>
                      <div
                        class="cast-analysis-grid cast-analysis-grid--row"
                        :class="{ active: castSelectedAbility === row.name || selectedAbility === row.name }"
                        @click="castSelectedAbility = row.name; selectAbility(row.name)"
                      >
                      <div
                        v-for="tick in castTimeTicks"
                        :key="`row-grid-${row.name}-${tick}`"
                        class="cast-analysis-gridline"
                        :style="{ left: (tick / castTimelineDuration * 100) + '%' }"
                      />
                      <template v-if="row.category === 'cooldowns' || row.category === 'mitigations'">
                        <div
                          v-for="event in row.events"
                          :key="`row-cooldown-${event.t}-${event.abilityName}-${event.target}`"
                          class="cast-cooldown-window"
                          :style="{ left: castEventLeft(event), width: castCooldownWidth(event) }"
                          :title="castCooldownLabel(event)"
                        />
                      </template>
                      <div
                        v-for="event in row.events.filter(e => e.type === 'cast' && e.durationMs && !e.buffDurationMs)"
                        :key="`row-cast-window-${event.t}-${event.abilityName}-${event.target}`"
                        class="cast-cast-window"
                        :style="{ left: castCastWindowLeft(event), width: castCastWindowWidth(event) }"
                        :title="`${event.abilityName} · ${(event.durationMs! / 1000).toFixed(1)}s cast`"
                      />
                      <button
                        v-for="event in row.events"
                        :key="`row-event-${event.t}-${event.abilityName}-${event.target}`"
                        class="cast-analysis-event"
                        :class="[`cast-analysis-event--${row.category}`, event.buffDurationMs ? 'cast-analysis-event--buff-window' : '']"
                        :style="{ left: castEventLeft(event), width: castEventWidth(event) }"
                        :title="`${fmtTime(event.t)} · ${event.abilityName}${event.durationMs ? ` · ${(event.durationMs / 1000).toFixed(1)}s cast` : ''}${event.buffDurationMs ? ` · ${(event.buffDurationMs / 1000).toFixed(0)}s active` : ''}${castCooldownLabel(event) ? ` · ${castCooldownLabel(event)}` : ''}${event.target ? ` → ${event.target}` : ''}`"
                        @click.stop="castSelectedAbility = row.name; selectAbility(row.name)"
                      >
                        <img v-if="!event.buffDurationMs && abilityIconSrc(event.abilityId, event.abilityName)" class="cast-event-icon" :src="abilityIconSrc(event.abilityId, event.abilityName)" :alt="event.abilityName" @error="clearAbilityIcon(event.abilityId, event.abilityName)" />
                        <span v-else>{{ event.buffDurationMs ? row.name : abilityInitials(row.name) }}</span>
                      </button>
                      <div v-if="castPlayerDeathTime !== null" class="cast-analysis-death-line" :style="{ left: (castPlayerDeathTime / castTimelineDuration * 100) + '%' }" />
                      <div v-if="castPlayerResTime !== null" class="cast-analysis-raise-line" :style="{ left: (castPlayerResTime / castTimelineDuration * 100) + '%' }" />
                    </div>
                    </template>
                  </template>
                  <div v-if="castTimelineGroups.length === 0" class="bp-empty-panel">
                    No casts match the active filters.
                  </div>
                </div>
              </div>
            </div>
          </template>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Cast Inspector</div>
          <div v-if="!selectedCastAbility" class="bp-empty-panel">Select an ability to inspect its cadence and targets.</div>
          <template v-else>
            <div class="bp-inspector-block">
              <div class="bp-kv"><span>Ability</span><strong>{{ selectedCastAbility.name }}</strong></div>
              <div class="bp-kv"><span>Casts</span><strong>{{ selectedCastAbility.casts }}</strong></div>
              <div class="bp-kv"><span>Avg Interval</span><strong>{{ selectedCastAbility.avgInterval }}s</strong></div>
              <div class="bp-kv"><span>Top Targets</span><strong>{{ selectedCastAbility.topTargets.length }}</strong></div>
            </div>
          </template>
        </aside>
      </div>
    </template>

    <template v-else-if="activeView === 'events'">
      <div class="bp-workspace">
        <ActorRail
          :groups="combatantGroups"
          :collapsed-groups="groupCollapsed"
          :selected-name="resolvedSelected"
          fill-class="bp-rail-fill--events"
          :value-for="eventSelectorBadgeFor"
          :fill-width-for="selectorFillWidth"
          :actor-job="actorJob"
          :actor-job-icon="actorJobIcon"
          :name-style="nameStyle"
          :tab-label="tabLabel"
          @toggle-group="toggleGroup"
          @select-actor="selectActor"
        />

        <main class="bp-main">
          <div class="bp-panel-toolbar">
            <div class="bp-panel-title">Unified Events</div>
            <div class="bp-toolbar-group">
              <button class="bp-mode-btn" :class="{ active: eventActorScope === 'selected' }" @click="eventActorScope = 'selected'">Selected Actor</button>
              <button class="bp-mode-btn" :class="{ active: eventActorScope === 'all' }" @click="eventActorScope = 'all'">All Actors</button>
              <button v-for="filter in ['damage', 'healing', 'casts', 'deaths', 'raises']" :key="filter" class="bp-mode-btn" :class="{ active: eventFilters.has(filter as EventFilter) }" @click="toggleEventFilter(filter as EventFilter)">{{ filter }}</button>
            </div>
          </div>
          <div v-if="eventRows.length === 0" class="bp-waiting">No event rows match the current filters. This v1 view combines casts and death-recap events until the full shared event stream lands.</div>
          <div v-else class="bp-scroll">
            <table class="bp-table">
              <thead><tr>
                <th class="col-num">Time</th>
                <th class="col-name">Actor</th>
                <th class="col-name">Event Type</th>
                <th class="col-name">Ability</th>
                <th class="col-name">Source</th>
                <th class="col-name">Target</th>
                <th class="col-num">Amount</th>
                <th class="col-name">HP Before</th>
                <th class="col-name">HP After</th>
                <th class="col-name">Notes</th>
              </tr></thead>
              <tbody>
                <tr v-for="row in eventRows" :key="row.key" :class="{ 'bp-row-active': selectedAbility === row.ability }" @click="selectAbility(row.ability)">
                  <td class="col-num">{{ fmtTime(row.t) }}</td>
                  <td class="col-name"><span class="aname" :style="nameStyle(row.actor)">{{ row.actor }}</span></td>
                  <td class="col-name">{{ row.eventType }}</td>
                  <td class="col-name"><AbilityCell :ability-id="abilityIdForName(row.ability)" :ability-name="row.ability" :icon-src="abilityIconSrc(abilityIdForName(row.ability), row.ability)" small @icon-error="clearAbilityIcon(abilityIdForName(row.ability), row.ability)" /></td>
                  <td class="col-name">{{ row.source || '—' }}</td>
                  <td class="col-name">{{ row.target || '—' }}</td>
                  <td class="col-num">{{ row.amount === null ? '—' : f(row.amount) }}</td>
                  <td class="col-name">{{ row.hpBefore }}</td>
                  <td class="col-name">{{ row.hpAfter }}</td>
                  <td class="col-name">{{ row.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </main>

        <aside class="bp-inspector">
          <div class="bp-inspector-title">Event Inspector</div>
          <div class="bp-inspector-block">
            <div class="bp-kv"><span>Rows</span><strong>{{ eventRows.length }}</strong></div>
            <div class="bp-kv"><span>Actor Scope</span><strong>{{ eventActorScope === 'all' ? 'All actors' : 'Selected actor' }}</strong></div>
            <div class="bp-kv"><span>Selected Ability</span><strong>{{ selectedAbility || 'None' }}</strong></div>
            <div class="bp-kv"><span>Window</span><strong>{{ eventWindowOnly && selectedDeathWindow ? 'Selected death' : 'Whole pull' }}</strong></div>
          </div>
          <div class="bp-inspector-block">
            <div class="bp-section-heading">Scope</div>
            <p class="bp-inspector-copy">This first pass merges cast rows, death recap rows, and raise detection into one table so we can keep cross-view continuity today while the shared event stream grows underneath it.</p>
          </div>
        </aside>
      </div>
    </template>

  </div>
</template>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }
.bp-root {
  width: 100vw; height: 100vh;
  --flexi-bg-base: #0f0f17;
  --flexi-bg-panel: #16161f;
  --flexi-bg-control: #1e1e2e;
  --flexi-bg-hover: #252538;
  --flexi-border: rgba(255,255,255,0.08);
  --flexi-accent: #9b5de5;
  --flexi-accent-soft: rgba(155,93,229,0.16);
  --flexi-accent-border: rgba(155,93,229,0.42);
  --flexi-info: #8ecae6;
  --flexi-success: #06d6a0;
  --flexi-warning: #ffd166;
  --flexi-danger: #ef476f;
  background: var(--flexi-bg-base);
  color: rgba(255,255,255,0.85);
  font-family: 'Segoe UI', monospace, sans-serif;
  font-size: 12px;
  display: flex; flex-direction: column; overflow: hidden;
}

/* ── Top bar ── */
.bp-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px;
  background: var(--flexi-bg-panel);
  border-bottom: 1px solid var(--flexi-border);
  flex-shrink: 0;
}
.bp-app-title { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5); letter-spacing: 0.03em; white-space: nowrap; }
.bp-total { font-size: 11px; color: rgba(255,255,255,0.3); margin-left: auto; white-space: nowrap; }
.bp-pull-select {
  flex: 1; min-width: 0;
  background: #1a1a24;
  border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.8);
  font-family: inherit; font-size: 11px;
  padding: 2px 6px; border-radius: 3px;
  cursor: pointer; outline: none; color-scheme: dark;
}
.bp-pull-select option { background: #1a1a24; color: rgba(255,255,255,0.85); }
.bp-pull-select:focus { border-color: var(--flexi-accent-border); }
.bp-pull-select--header {
  flex: 0 1 340px;
  min-width: 220px;
  padding: 3px 8px;
}

/* ── View tabs ── */
.bp-view-tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
.bp-view-tab {
  background: transparent; border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255,255,255,0.35);
  padding: 5px 14px; cursor: pointer;
  font-size: 11px; font-family: inherit;
  letter-spacing: 0.04em;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.bp-view-tab:hover { color: rgba(255,255,255,0.65); }
.bp-view-tab.active { color: var(--flexi-accent); border-bottom-color: var(--flexi-accent); }

/* ── Combatant tabs ── */
.bp-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
.bp-group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}
.bp-group-header:hover {
  background: rgba(255,255,255,0.12);
}
.bp-group-toggle {
  font-size: 8px;
  color: rgba(255,255,255,0.4);
}
.bp-group-label {
  font-weight: 600;
}
.bp-tab { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); padding: 3px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; font-family: inherit; transition: all 0.15s; }
.bp-tab:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
.bp-tab.active { background: var(--flexi-accent-soft); border-color: var(--flexi-accent-border); color: #d9bcff; }

.cast-group-label {
  font-size: 9px;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
  padding: 3px 6px 3px 8px;
  border-right: 1px solid rgba(255,255,255,0.1);
  margin-right: 4px;
}

/* ── Metric tabs ── */
.bp-metric-tabs { display: flex; gap: 0; padding: 4px 10px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
.bp-metric-tab {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.4);
  padding: 2px 12px; border-radius: 3px;
  cursor: pointer; font-size: 10px; font-family: inherit;
  letter-spacing: 0.06em;
  transition: all 0.15s; margin-right: 3px;
}
.bp-metric-tab:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
.bp-metric-tab.active { background: rgba(100,180,255,0.15); border-color: rgba(100,180,255,0.4); color: #64b4ff; }

/* ── Waiting ── */
.bp-waiting { flex: 1; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.25); font-size: 13px; }

/* ── Summary table ── */
.bp-scroll { flex: 1; overflow-y: auto; }
.bp-table { width: 100%; border-collapse: collapse; }
.bp-table thead tr { border-bottom: 1px solid rgba(255,255,255,0.08); position: sticky; top: 0; background: #0d0d10; z-index: 1; }
.bp-table th { padding: 5px 8px; font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.05em; text-align: right; white-space: nowrap; }
.bp-table th.col-name { text-align: left; }
.bp-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.04); }
.bp-table tbody tr:hover { background: rgba(255,255,255,0.04); }
td { padding: 4px 8px; text-align: right; font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.75); }
td.col-name { text-align: left; position: relative; max-width: 160px; }
.row-fill { position: absolute; inset: 0; right: auto; background: rgba(255,255,255,0.05); pointer-events: none; min-width: 2px; }
.aname { position: relative; z-index: 1; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ability-cell {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 100%;
  vertical-align: middle;
}
.aname.ability-cell { display: inline-flex; }
.breakdown-ability-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.16);
  background: linear-gradient(135deg, rgba(255,255,255,0.13), rgba(255,255,255,0.035));
  color: rgba(255,255,255,0.74);
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
}
.breakdown-ability-icon--small {
  width: 18px;
  height: 18px;
  flex-basis: 18px;
  font-size: 7px;
}
.breakdown-ability-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.col-pct { color: rgba(255,210,80,0.9); }
.col-dim { color: rgba(255,255,255,0.3); }

/* ── Chart area ── */
.bp-chart-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 8px 10px 4px; gap: 4px; position: relative; }
.bp-chart-svg { width: 100%; flex: 1; min-height: 0; overflow: visible; }
.axis-label { font-size: 9px; fill: rgba(255,255,255,0.3); font-family: 'Segoe UI', monospace, sans-serif; }

/* ── Tooltip ── */
.bp-tooltip {
  position: absolute;
  background: rgba(10,10,16,0.92);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  padding: 6px 9px;
  pointer-events: none;
  z-index: 10;
  min-width: 140px;
}
.bp-tooltip-time { font-size: 11px; font-weight: 600; color: #d9bcff; margin-bottom: 4px; }
.bp-tooltip-row { display: flex; align-items: center; gap: 5px; margin-bottom: 2px; }
.bp-tooltip-group {
  display: flex; align-items: center; gap: 5px;
  margin-top: 4px; padding-top: 4px;
  border-top: 1px solid rgba(255,255,255,0.1);
}
.bp-tooltip-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.bp-tooltip-name { flex: 1; font-size: 10px; color: rgba(255,255,255,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bp-tooltip-val { font-size: 10px; font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.85); margin-left: auto; }
.bp-tooltip-adj {
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  color: rgba(116,240,195,0.78);
  white-space: nowrap;
}

/* ── Legend ── */
.bp-chart-legend { display: flex; flex-wrap: wrap; gap: 3px 10px; flex-shrink: 0; padding-bottom: 2px; }
.bp-legend-item { display: flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; transition: opacity 0.15s; }
.bp-legend-item:hover { opacity: 0.75; }
.bp-legend-item.hidden { opacity: 0.3; }
.bp-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.bp-legend-name { font-size: 11px; color: rgba(255,255,255,0.65); white-space: nowrap; }
.bp-legend-name--focused { color: #ffd250; font-weight: 700; }

/* ── Show Enemies toggle ── */
.bp-toggle-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.35);
  font-size: 10px; font-family: inherit;
  padding: 2px 8px; border-radius: 3px; cursor: pointer;
  white-space: nowrap; letter-spacing: 0.04em;
  transition: all 0.15s;
}
.bp-toggle-btn:hover { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.09); }
.bp-toggle-btn.active { background: rgba(255,160,60,0.15); border-color: rgba(255,160,60,0.4); color: #ffb347; }

/* ── Deaths tab badge ── */
.bp-death-badge {
  display: inline-block;
  background: rgba(255,100,100,0.3);
  color: #ff8080;
  font-size: 9px; line-height: 1;
  padding: 1px 4px; border-radius: 8px;
  margin-left: 4px; vertical-align: middle;
}

/* ── Summary mode bar ── */
.bp-summary-mode-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.bp-mode-btn {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.4);
  font-size: 10px; font-family: inherit;
  padding: 2px 10px; border-radius: 3px; cursor: pointer;
  letter-spacing: 0.05em; transition: all 0.15s;
}
.bp-mode-btn:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
.bp-mode-btn.active { background: rgba(100,180,255,0.15); border-color: rgba(100,180,255,0.4); color: #64b4ff; }
.bp-mode-total { margin-left: auto; font-size: 11px; color: rgba(255,255,255,0.3); font-variant-numeric: tabular-nums; }

/* ── Encounter tab ── */
.enc-header {
  display: flex; align-items: baseline; gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.enc-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.enc-dur  { font-size: 10px; color: rgba(255,255,255,0.35); font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }

.enc-main {
  flex: 1; min-height: 0;
  display: flex; overflow: hidden;
}

.enc-left {
  width: 195px; flex-shrink: 0;
  display: flex; flex-direction: column; overflow: hidden;
  border-right: 1px solid rgba(255,255,255,0.07);
}

.enc-right {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; overflow: hidden;
}

.enc-section-label {
  padding: 3px 8px;
  font-size: 9px; font-weight: 600;
  color: rgba(255,255,255,0.25);
  text-transform: uppercase; letter-spacing: 0.08em;
  background: rgba(255,255,255,0.025);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
  display: flex; align-items: center; gap: 5px;
}
.enc-section-label--adds {
  color: rgba(255,160,60,0.45);
  background: rgba(255,160,60,0.03);
  border-top: 1px solid rgba(255,255,255,0.05);
}
.enc-section-label--death {
  border-top: none;
}

.enc-player-list { flex: 1; overflow-y: auto; }

.enc-player-row {
  position: relative;
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  min-height: 26px;
  transition: background 0.1s;
}
.enc-player-row:hover   { background: rgba(255,255,255,0.04); }
.enc-player-row.active  { background: rgba(255,210,80,0.07); }

.enc-fill {
  position: absolute; inset: 0; right: auto;
  background: rgba(220,70,70,0.14);
  pointer-events: none;
  min-width: 2px;
  transition: width 0.25s ease;
}
.enc-fill--enemy { background: rgba(255,160,60,0.10); }

.enc-player-name {
  position: relative; z-index: 1;
  font-size: 11px; color: rgba(255,255,255,0.8);
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.enc-player-val {
  position: relative; z-index: 1;
  font-size: 10px; color: rgba(255,255,255,0.4);
  font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0;
}
.enc-player-row.active .enc-player-name { color: #ffd250; }
.enc-player-row.active .enc-player-val  { color: rgba(255,210,80,0.55); }

.enc-select-prompt {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.2); font-size: 12px; text-align: center; padding: 16px;
}

.enc-ability-header {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.enc-ability-player {
  font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.8);
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.enc-ability-total {
  font-size: 10px; color: rgba(255,255,255,0.35);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}

.enc-ability-scroll { flex: 1; overflow-y: auto; }

/* Ability fill in the right panel — red-tinted instead of white */
.enc-row-fill { background: rgba(220,70,70,0.10); }

.enc-empty-small {
  padding: 14px 8px; font-size: 10px;
  color: rgba(255,255,255,0.2); text-align: center;
}

/* Death section pinned at bottom of encounter tab */
.enc-death-section {
  flex-shrink: 0;
  max-height: 33%;
  display: flex; flex-direction: column; overflow: hidden;
  border-top: 1px solid rgba(255,255,255,0.07);
}
.enc-death-empty {
  padding: 8px 10px; font-size: 10px; color: rgba(255,255,255,0.2);
}
.enc-death-list { overflow-y: auto; flex: 1; }

/* ── Deaths tab (dedicated) ── */
.dl-root {
  flex: 1; min-height: 0;
  display: flex; overflow: hidden;
}

/* Left: death list */
.dl-list {
  width: 210px; flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid rgba(255,255,255,0.07);
}
.dl-death-row {
  display: flex; flex-direction: column; gap: 4px;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  transition: background 0.1s;
}
.dl-death-row:hover  { background: rgba(255,255,255,0.04); }
.dl-death-row.active { background: rgba(255,100,100,0.08); }
.dl-death-info { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.dl-death-name { font-size: 12px; color: rgba(255,255,255,0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-death-time { font-size: 10px; color: rgba(255,100,100,0.7); font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
.dl-spark { display: flex; align-items: center; }

/* Right: hit log detail */
.dl-detail {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; overflow: hidden;
}
.dl-detail-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.2); font-size: 12px; text-align: center; padding: 16px;
}
.dl-detail-header {
  display: flex; align-items: baseline; gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.dl-detail-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-detail-time { font-size: 10px; color: rgba(255,100,100,0.65); font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
.dl-detail-sub  { font-size: 10px; color: rgba(255,255,255,0.25); margin-left: auto; white-space: nowrap; }

.dl-hit-scroll { flex: 1; overflow-y: auto; }
.dl-hit-table {
  width: 100%; border-collapse: collapse;
  font-size: 11px;
}
.dl-hit-table thead tr { border-bottom: 1px solid rgba(255,255,255,0.08); position: sticky; top: 0; background: #0d0d10; z-index: 1; }
.dl-hit-table th {
  padding: 4px 7px; font-size: 9px; font-weight: 500;
  color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.05em;
  text-align: left; white-space: nowrap;
}
.dl-col-amount { }
.dl-hit-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.03); }
.dl-hit-table td {
  padding: 3px 7px; white-space: nowrap;
  font-variant-numeric: tabular-nums; color: rgba(255,255,255,0.7);
}
.dl-row-dmg:hover  { background: rgba(255,255,255,0.03); }
.dl-row-heal:hover { background: rgba(255,255,255,0.03); }

.dl-badge-dmg  { display: inline-block; width: 14px; height: 14px; border-radius: 3px; background: #ff1744; color: #fff; font-size: 9px; font-weight: 700; text-align: center; line-height: 14px; }
.dl-badge-heal { display: inline-block; width: 14px; height: 14px; border-radius: 3px; background: #00e676; color: #000; font-size: 9px; font-weight: 700; text-align: center; line-height: 14px; }
.dl-badge-death { display: inline-block; width: 14px; height: 14px; border-radius: 3px; background: #ff1744; color: #fff; font-size: 9px; font-weight: 700; text-align: center; line-height: 14px; }

.dl-row-death { background: rgba(255,0,0,0.15) !important; }

.dl-amount-dmg  { color: rgba(255,130,130,0.9); text-align: right; }
.dl-amount-dmg-bold { color: #ff1744 !important; font-weight: 700 !important; text-align: right; }
.dl-amount-heal { color: rgba(110,232,122,0.9); text-align: right; }
.dl-amount-heal-bold { color: #00e676 !important; font-weight: 700 !important; text-align: right; }
.dl-amount-death { color: #ff1744 !important; font-weight: 700 !important; text-align: right; }

.dl-col-time    { width: 36px; color: rgba(255,255,255,0.35) !important; }
.dl-col-type    { width: 20px; }
.dl-col-ability { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.dl-col-source  { max-width: 100px; overflow: hidden; text-overflow: ellipsis; color: rgba(255,255,255,0.45) !important; }
.dl-col-hpbefore { width: 138px; color: rgba(255,255,255,0.72) !important; white-space: nowrap; }
.dl-col-hpbar   { width: 80px; padding: 0 4px !important; }
.dl-hp-estimate { margin-left: 6px; font-size: 9px; color: rgba(255,215,128,0.85); text-transform: uppercase; letter-spacing: 0.04em; }

.dl-hpbar-container { height: 12px; background: rgba(255,255,255,0.1); border-radius: 2px; position: relative; overflow: hidden; }
.dl-hpbar-bg { position: absolute; left: 0; top: 0; height: 100%; background: rgba(100,200,100,0.25); border-radius: 2px; }
.dl-hpbar-change.dl-hpbar-heal { position: absolute; top: 0; height: 100%; background: #00e676; opacity: 0.6; border-radius: 2px; }
.dl-hpbar-change.dl-hpbar-dmg { position: absolute; top: 0; height: 100%; background: #ff1744; opacity: 0.6; border-radius: 2px; }

/* Legacy death row (used in encounter tab's death section if restored) */
.bp-death-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.bp-death-row:hover { background: rgba(255,255,255,0.03); }
.bp-death-left { display: flex; flex-direction: column; gap: 2px; }
.bp-death-name { font-size: 12px; color: rgba(255,255,255,0.8); }
.bp-death-time { font-size: 10px; color: rgba(255,100,100,0.7); font-variant-numeric: tabular-nums; }
.bp-death-spark { display: flex; align-items: center; }
.bp-spark-svg { display: block; }
.bp-spark-none { font-size: 10px; color: rgba(255,255,255,0.2); }

/* ── Casts tab ── */
.cast-list-header {
  padding: 6px 10px;
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.cast-scroll {
  flex: 1;
  overflow-y: auto;
}
.cast-row {
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.cast-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.1s;
}
.cast-row-summary {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  color: rgba(255,255,255,0.45);
  font-size: 10px;
  min-width: 0;
}
.cast-xiv-tick {
  position: absolute;
  top: 5px;
  transform: translateX(-50%);
  color: rgba(255,255,255,0.58);
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: #0d0d10;
  padding: 0 4px;
  border-radius: 3px;
}
.cast-analysis-shell {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: rgba(0,0,0,0.12);
}
.cast-analysis-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
}
.cast-analysis-table {
  min-width: 100%;
  display: grid;
  grid-template-columns: 170px 1fr;
  align-content: start;
}
.cast-analysis-label-head {
  position: sticky;
  left: 0;
  top: 0;
  z-index: 6;
  height: 34px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 10px;
  background: #11141b;
  border-right: 1px solid rgba(255,255,255,0.08);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.cast-analysis-label-head span {
  color: rgba(255,255,255,0.82);
  font-weight: 600;
}
.cast-analysis-label-head small {
  color: rgba(255,255,255,0.34);
  font-size: 9px;
  font-style: italic;
}
.cast-analysis-grid {
  position: relative;
  min-width: 100%;
  height: 100%;
}
.cast-analysis-grid--head {
  position: sticky;
  top: 0;
  z-index: 5;
  height: 34px;
  background: #0d0d10;
}
.cast-analysis-axis {
  position: absolute;
  inset: 0;
  height: 34px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.015);
}
.cast-analysis-gridline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255,255,255,0.13);
}
.cast-analysis-section {
  position: sticky;
  left: 0;
  z-index: 4;
  padding: 5px 10px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.48);
  background: rgba(255,255,255,0.04);
  border-top: 1px solid rgba(255,255,255,0.07);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.cast-analysis-section--timeline {
  position: relative;
  left: auto;
  z-index: 1;
  padding: 0;
  min-height: 24px;
  background: rgba(255,255,255,0.025);
  border-left: 1px solid rgba(255,255,255,0.04);
}
.cast-resource-label {
  cursor: default;
  background: #10141a;
}
.cast-analysis-grid--resource {
  min-height: 34px;
  border-bottom: 1px solid rgba(255,255,255,0.055);
  background:
    linear-gradient(to bottom, rgba(255,255,255,0.045) 0 1px, transparent 1px 50%, rgba(255,255,255,0.035) 50% calc(50% + 1px), transparent calc(50% + 1px)),
    rgba(255,255,255,0.014);
}
.cast-resource-svg {
  position: absolute;
  inset: 4px 0;
  width: 100%;
  height: calc(100% - 8px);
  overflow: visible;
  pointer-events: none;
}
.cast-analysis-label {
  position: sticky;
  left: 0;
  z-index: 3;
  min-height: 31px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: #0f1117;
  border-right: 1px solid rgba(255,255,255,0.08);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  cursor: pointer;
}
.cast-analysis-label.active {
  background: rgba(116,185,255,0.14);
}
.cast-analysis-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255,255,255,0.86);
}
.cast-ability-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.16);
  background: linear-gradient(135deg, rgba(255,255,255,0.13), rgba(255,255,255,0.035));
  color: rgba(255,255,255,0.78);
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
}
.cast-ability-icon img,
.cast-event-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cast-analysis-meta {
  color: rgba(255,255,255,0.36);
  font-size: 10px;
  white-space: nowrap;
}
.cast-analysis-grid--row {
  min-height: 31px;
  border-bottom: 1px solid rgba(255,255,255,0.055);
  background: rgba(255,255,255,0.018);
  cursor: pointer;
}
.cast-analysis-grid--row.active {
  background: rgba(116,185,255,0.06);
}
.cast-analysis-event {
  position: absolute;
  top: 4px;
  width: 22px;
  height: 22px;
  transform: translateX(-50%);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 4px;
  color: rgba(255,255,255,0.92);
  font-size: 8px;
  font-weight: 700;
  line-height: 18px;
  cursor: pointer;
  box-shadow: 0 3px 8px rgba(0,0,0,0.35);
  overflow: hidden;
  padding: 0;
}
.cast-analysis-event > span {
  display: block;
  padding: 0 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cast-analysis-event--castbar {
  min-width: 38px;
  height: 18px;
  top: 6px;
  transform: none;
  border-radius: 4px;
  background: linear-gradient(90deg, rgba(48,120,255,0.42), rgba(116,185,255,0.78)) !important;
  border-color: rgba(116,185,255,0.72) !important;
  color: rgba(255,255,255,0.95) !important;
  text-align: left;
  padding: 0 6px;
  font-size: 9px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cast-analysis-event:hover {
  z-index: 6;
  filter: brightness(1.25);
}
.cast-cooldown-window {
  position: absolute;
  top: 8px;
  height: 14px;
  transform: translateX(-1px);
  border-radius: 3px;
  background: repeating-linear-gradient(
    90deg,
    rgba(255,255,255,0.045) 0,
    rgba(255,255,255,0.045) 5px,
    rgba(255,255,255,0.015) 5px,
    rgba(255,255,255,0.015) 10px
  );
  border: 1px solid rgba(255,255,255,0.055);
  pointer-events: none;
}
.cast-cast-window {
  position: absolute;
  top: 12px;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(116,185,255,0.08), rgba(116,185,255,0.38));
  border: 1px solid rgba(116,185,255,0.18);
  pointer-events: none;
}
.cast-analysis-event--cooldowns { background: linear-gradient(135deg, #326ea8, #74b9ff); }
.cast-analysis-event--mitigations { background: linear-gradient(135deg, #027a45, #00e676); color: #05100a; }
.cast-analysis-event--dps { background: linear-gradient(135deg, #9a7422, #ffd250); color: #1b1300; }
.cast-analysis-event--heals { background: linear-gradient(135deg, #a83464, #fd79a8); }
.cast-analysis-event--buff-window {
  height: 18px;
  top: 6px;
  min-width: 30px;
  transform: none;
  text-align: left;
  padding: 0 6px;
  border-radius: 4px;
  opacity: 0.9;
}
.cast-analysis-death-line,
.cast-analysis-raise-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  pointer-events: none;
}
.cast-analysis-death-line { background: rgba(255,23,68,0.65); }
.cast-analysis-raise-line { background: rgba(0,230,118,0.65); }
.cast-row-main:hover {
  background: rgba(255,255,255,0.03);
}
.cast-row.expanded {
  background: rgba(116,185,255,0.08);
}
.cast-ability-info {
  width: 140px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cast-ability-name {
  flex: 1;
  font-size: 11px;
  color: rgba(255,255,255,0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cast-ability-casts {
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  font-variant-numeric: tabular-nums;
}
.cast-row-timeline {
  flex: 1;
  height: 18px;
  position: relative;
  display: flex;
}
.cast-mini-bucket {
  flex: 1;
  position: relative;
  border-left: 1px solid rgba(255,255,255,0.03);
}
.cast-mini-segment {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: #74b9ff;
  border-radius: 1px;
}
.cast-mini-segment.cast-bar-tick {
  background: #a29bfe;
}
.cast-timeline-ticks {
  position: absolute;
  bottom: -14px;
  left: 0;
  right: 0;
  height: 12px;
  pointer-events: none;
}
.cast-tick-mark {
  position: absolute;
  font-size: 8px;
  color: rgba(255,255,255,0.25);
  transform: translateX(-50%);
  font-variant-numeric: tabular-nums;
}

.cast-death-range {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(255, 0, 0, 0.15);
  pointer-events: none;
}

.cast-death-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
}
.cast-death-line {
  width: 2px;
  height: 100%;
  background: #ff0000;
  opacity: 0.7;
}
.cast-death-label {
  position: absolute;
  top: -14px;
  left: -16px;
  font-size: 7px;
  color: #ff0000;
  font-weight: 700;
}

.cast-ress-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
}
.cast-ress-line {
  width: 2px;
  height: 100%;
  background: #00ff00;
  opacity: 0.7;
}
.cast-ress-label {
  position: absolute;
  top: -14px;
  left: -20px;
  font-size: 7px;
  color: #00ff00;
  font-weight: 700;
}

.cast-hover-tooltip {
  position: fixed;
  z-index: 100;
  background: rgba(0,0,0,0.9);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  padding: 6px 8px;
  pointer-events: none;
}
.cast-tooltip-time {
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  font-variant-numeric: tabular-nums;
}
.cast-tooltip-ability {
  font-size: 11px;
  color: #74b9ff;
}
.cast-tooltip-target {
  font-size: 10px;
  color: rgba(255,255,255,0.6);
}

.cast-row-details {
  padding: 8px 10px 10px 150px;
  background: rgba(0,0,0,0.15);
}
.cast-detail-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.cast-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cast-stat-label {
  font-size: 9px;
  color: rgba(255,255,255,0.35);
  text-transform: uppercase;
}
.cast-stat-value {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
  font-variant-numeric: tabular-nums;
}
.cast-target-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.cast-target-chip {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  color: rgba(255,255,255,0.6);
}

.bp-analysis-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
}
.bp-analysis-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bp-report-select-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.bp-analysis-kicker {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(255,255,255,0.35);
}
.bp-analysis-title {
  font-size: 18px;
  color: rgba(255,255,255,0.92);
  font-weight: 600;
}
.bp-analysis-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(90px, 1fr));
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.bp-analysis-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px;
  min-width: 0;
}
.bp-analysis-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.35);
}
.bp-analysis-value {
  font-size: 11px;
  color: rgba(255,255,255,0.82);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bp-filter-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.015);
}
.bp-filter-groups,
.bp-chip-row,
.bp-toolbar-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.bp-filter-btn,
.bp-chip {
  font-size: 10px;
  border-radius: 999px;
  padding: 4px 9px;
  letter-spacing: 0.04em;
}
.bp-filter-btn {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.45);
  cursor: pointer;
}
.bp-filter-btn.active {
  color: #d9bcff;
  border-color: var(--flexi-accent-border);
  background: var(--flexi-accent-soft);
}
.bp-chip {
  background: rgba(155,93,229,0.1);
  border: 1px solid rgba(155,93,229,0.22);
  color: #d9bcff;
}
.bp-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 280px;
  overflow: hidden;
}
.bp-pulls-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  overflow: hidden;
}
.bp-pull-list-panel {
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  border-right: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.015);
}
.bp-pull-row {
  width: 100%;
  min-height: 70px;
  display: grid;
  gap: 8px;
  margin-top: 8px;
  padding: 10px;
  color: rgba(255,255,255,0.78);
  text-align: left;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
}
.bp-pull-row:hover { background: rgba(255,255,255,0.07); }
.bp-pull-row.active {
  background: var(--flexi-accent-soft);
  border-color: var(--flexi-accent-border);
}
.bp-pull-encounter-header {
  margin: -3px -2px 2px;
  padding-bottom: 6px;
  color: rgba(255,255,255,0.42);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
}
.bp-pull-row-main,
.bp-pull-row-stats {
  display: flex;
  gap: 6px;
}
.bp-pull-row-main {
  min-width: 0;
  flex-direction: column;
}
.bp-pull-row-main strong {
  font-size: 12px;
  color: rgba(255,255,255,0.9);
}
.bp-pull-row-main span {
  overflow: hidden;
  color: rgba(255,255,255,0.56);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bp-pull-row-stats {
  flex-wrap: wrap;
  color: rgba(255,255,255,0.48);
  font-size: 10px;
}
.bp-pull-row-stats span {
  padding: 2px 6px;
  background: rgba(255,255,255,0.055);
  border-radius: 4px;
}
.bp-pull-row-stats .danger { color: rgba(255,150,150,0.95); }
.bp-pulls-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}
.bp-pull-note-list {
  display: grid;
  gap: 7px;
  padding: 10px;
}
.bp-pull-note {
  padding: 8px 10px;
  color: rgba(255,255,255,0.76);
  background: rgba(255,255,255,0.045);
  border-left: 3px solid var(--flexi-accent);
  border-radius: 5px;
  font-size: 12px;
}
.bp-rail,
.bp-inspector {
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255,255,255,0.02);
}
.bp-rail {
  border-right: 1px solid rgba(255,255,255,0.07);
}
.bp-inspector {
  border-left: 1px solid rgba(255,255,255,0.07);
}
.bp-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.bp-rail-title,
.bp-inspector-title,
.bp-panel-title,
.bp-section-heading {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.bp-rail-title,
.bp-inspector-title {
  padding: 10px 12px 8px;
  color: rgba(255,255,255,0.35);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.bp-rail-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.bp-rail-item:hover { background: rgba(255,255,255,0.04); }
.bp-rail-item.active { background: rgba(255,210,80,0.08); }
.bp-rail-fill {
  position: absolute;
  inset: 0;
  right: auto;
  min-width: 2px;
  background: rgba(116,185,255,0.12);
  pointer-events: none;
}
.bp-rail-fill--taken { background: rgba(220,70,70,0.14); }
.bp-rail-fill--timeline { background: rgba(255,210,80,0.12); }
.bp-rail-fill--casts { background: rgba(162,155,254,0.14); }
.bp-rail-fill--events { background: rgba(0,230,118,0.12); }
.bp-rail-name,
.bp-rail-meta,
.bp-job-icon {
  position: relative;
  z-index: 1;
}
.bp-job-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.65));
}
.bp-rail-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255,255,255,0.82);
}
.bp-rail-meta {
  font-size: 10px;
  color: rgba(255,255,255,0.42);
  white-space: nowrap;
}
.bp-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.bp-card {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.03);
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  font-family: inherit;
  color: inherit;
}
.bp-card--button {
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.bp-card--button:hover {
  border-color: var(--flexi-accent-border);
  background: rgba(155,93,229,0.1);
  transform: translateY(-1px);
}
.bp-card--done { box-shadow: inset 0 0 0 1px rgba(155,93,229,0.12); }
.bp-card--taken { box-shadow: inset 0 0 0 1px rgba(220,70,70,0.08); }
.bp-card--deaths { box-shadow: inset 0 0 0 1px rgba(255,80,80,0.08); }
.bp-card--casts { box-shadow: inset 0 0 0 1px rgba(162,155,254,0.08); }
.bp-card-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.4);
}
.bp-card-value {
  font-size: 22px;
  color: rgba(255,255,255,0.92);
  font-weight: 600;
}
.bp-card-detail {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
}
.bp-overview-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
  overflow: auto;
}
.bp-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
}
.bp-panel-title {
  padding: 10px 12px;
  color: rgba(255,255,255,0.38);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.bp-panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.bp-empty-panel,
.bp-inspector-copy {
  padding: 12px;
  color: rgba(255,255,255,0.45);
  line-height: 1.4;
}
.bp-mini-chart-shell {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bp-mini-chart {
  height: 120px;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  padding: 10px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px;
  background: rgba(0,0,0,0.16);
}
.bp-mini-chart.empty {
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.36);
}
.bp-mini-chart-bar {
  flex: 1;
  min-width: 3px;
  border: none;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(180deg, rgba(217,188,255,0.92), rgba(155,93,229,0.34));
  cursor: pointer;
  transition: filter 0.15s, transform 0.15s;
}
.bp-mini-chart-bar:hover {
  filter: brightness(1.18);
  transform: scaleY(1.03);
}
.bp-mini-chart-label {
  color: rgba(255,255,255,0.5);
  line-height: 1.4;
}
.bp-mini-chart-values {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.bp-mini-pill {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.68);
}
.bp-mini-pill--button {
  cursor: pointer;
  font-family: inherit;
}
.bp-mini-pill--button:hover {
  color: #d9bcff;
  border-color: var(--flexi-accent-border);
  background: var(--flexi-accent-soft);
}
.bp-event-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-top: 1px solid rgba(255,255,255,0.05);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bp-event-item:hover { background: rgba(255,255,255,0.03); }
.bp-event-name { color: rgba(255,255,255,0.82); }
.bp-event-detail { color: rgba(255,255,255,0.48); font-size: 10px; }
.bp-inspector-block {
  padding: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bp-kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.bp-kv span {
  color: rgba(255,255,255,0.42);
}
.bp-kv strong {
  color: rgba(255,255,255,0.88);
  text-align: right;
}
.bp-inspector-list-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 0;
  border-top: 1px solid rgba(255,255,255,0.05);
}
.bp-inspector-list-item:first-of-type { border-top: none; }
.bp-row-active { background: var(--flexi-accent-soft) !important; }
.bp-toolbar-group--full {
  padding: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.bp-party-highlight {
  margin: 0 12px 12px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(255,210,80,0.18);
  background: rgba(255,210,80,0.08);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bp-action-btn {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.72);
  font-family: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}
.bp-action-btn:hover:not(:disabled) {
  color: #d9bcff;
  border-color: var(--flexi-accent-border);
  background: var(--flexi-accent-soft);
}
.bp-action-btn:disabled {
  cursor: default;
  opacity: 0.45;
}
.bp-party-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,220,140,0.7);
}
.bp-party-highlight strong {
  color: rgba(255,255,255,0.9);
}

@media (max-width: 1180px) {
  .bp-workspace {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .bp-inspector {
    display: none;
  }
  .bp-analysis-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .bp-analysis-header,
  .bp-filter-strip {
    flex-direction: column;
    align-items: stretch;
  }
  .bp-card-grid,
  .bp-overview-grid,
  .bp-workspace {
    grid-template-columns: 1fr;
  }
  .bp-rail {
    max-height: 220px;
  }
}
</style>
