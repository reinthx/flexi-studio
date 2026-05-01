import { ref } from 'vue'
import type { CastEvent, CombatantAbilityData, DeathRecord, DpsTimeline, HitRecord, ResourceSample } from '@shared/configSchema'
import type { PartyMemberData, PullEntry } from './types'

export type BreakdownPayload = {
  type?: string
  timestamp?: number
  abilityData?: Record<string, CombatantAbilityData>
  dpsTimeline?: DpsTimeline
  hpsTimeline?: DpsTimeline
  dtakenTimeline?: DpsTimeline
  dpsByCombatant?: Record<string, number>
  damageByCombatant?: Record<string, number>
  rdpsByCombatant?: Record<string, number>
  rdpsGiven?: Record<string, number>
  rdpsTaken?: Record<string, number>
  damageTakenData?: Record<string, CombatantAbilityData>
  healingReceivedData?: Record<string, CombatantAbilityData>
  hitData?: Record<string, HitRecord[]>
  deaths?: DeathRecord[]
  combatantIds?: Record<string, string>
  combatantJobs?: Record<string, string>
  castData?: Record<string, CastEvent[]>
  resourceData?: Record<string, ResourceSample[]>
  selfName?: string
  blurNames?: boolean
  partyNames?: string[]
  partyData?: PartyMemberData[]
  encounterDurationSec?: number
  pullIndex?: number | null
  selectedCombatant?: string
  pullList?: PullEntry[]
}

export const BREAKDOWN_SNAPSHOT_KEY = 'flexi-breakdown-snapshot'
export const BREAKDOWN_SNAPSHOT_MAX_AGE_MS = 30_000
export const BREAKDOWN_REQUEST_INTERVAL_MS = 5_000
const MAX_PAYLOAD_RECORD_KEYS = 256
const MAX_TIMELINE_BUCKETS = 7_200
const MAX_EVENTS_PER_ACTOR = 20_000
const MAX_HITS_PER_ACTOR = 5_000
const MAX_RESOURCE_SAMPLES_PER_ACTOR = 7_200
const MAX_DEATHS = 500
const MAX_PULLS = 200
const MAX_PARTY_MEMBERS = 96

export type EncounterPayloadDecision = {
  accept: boolean
  incomingPullIndex: number | null
  liveHistoryChanged: boolean
  nextPullList?: PullEntry[]
  nextActivePull?: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function limitedRecord<T>(
  value: unknown,
  mapValue: (entry: unknown) => T | null,
  maxKeys = MAX_PAYLOAD_RECORD_KEYS,
): Record<string, T> {
  if (!isRecord(value)) return {}
  const entries: Array<[string, T]> = []
  for (const [key, entry] of Object.entries(value)) {
    const mapped = mapValue(entry)
    if (mapped !== null) entries.push([key, mapped])
    if (entries.length >= maxKeys) break
  }
  return Object.fromEntries(entries)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function finiteNumberRecord(value: unknown): Record<string, number> {
  return limitedRecord(value, finiteNumber)
}

function timelineRecord(value: unknown): DpsTimeline {
  return limitedRecord(value, entry => {
    if (!Array.isArray(entry)) return null
    return entry.slice(0, MAX_TIMELINE_BUCKETS).filter((sample): sample is number => Number.isFinite(sample))
  })
}

function objectRecord<T>(value: unknown): Record<string, T> {
  return limitedRecord(value, entry => isRecord(entry) ? entry as T : null)
}

function arrayRecord<T>(value: unknown, maxEntries: number): Record<string, T[]> {
  return limitedRecord(value, entry => Array.isArray(entry) ? entry.slice(0, maxEntries) as T[] : null)
}

function limitedObjectArray<T>(value: unknown, maxEntries: number): T[] {
  return Array.isArray(value)
    ? value.filter(isRecord).slice(0, maxEntries) as T[]
    : []
}

function limitedStringArray(value: unknown, maxEntries: number): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, maxEntries)
    : []
}

export function normalizedPullList(value: unknown): PullEntry[] {
  return limitedObjectArray<PullEntry>(value, MAX_PULLS)
}

export function normalizeBreakdownPayload(data: BreakdownPayload): BreakdownPayload {
  return {
    ...data,
    abilityData: objectRecord<CombatantAbilityData>(data.abilityData),
    dpsTimeline: timelineRecord(data.dpsTimeline),
    hpsTimeline: timelineRecord(data.hpsTimeline),
    dtakenTimeline: timelineRecord(data.dtakenTimeline),
    dpsByCombatant: finiteNumberRecord(data.dpsByCombatant),
    damageByCombatant: finiteNumberRecord(data.damageByCombatant),
    rdpsByCombatant: finiteNumberRecord(data.rdpsByCombatant),
    rdpsGiven: finiteNumberRecord(data.rdpsGiven),
    rdpsTaken: finiteNumberRecord(data.rdpsTaken),
    damageTakenData: objectRecord<CombatantAbilityData>(data.damageTakenData),
    healingReceivedData: objectRecord<CombatantAbilityData>(data.healingReceivedData),
    hitData: arrayRecord<HitRecord>(data.hitData, MAX_HITS_PER_ACTOR),
    deaths: limitedObjectArray<DeathRecord>(data.deaths, MAX_DEATHS),
    combatantIds: limitedRecord(data.combatantIds, entry => typeof entry === 'string' ? entry : null),
    combatantJobs: limitedRecord(data.combatantJobs, entry => typeof entry === 'string' ? entry : null),
    castData: arrayRecord<CastEvent>(data.castData, MAX_EVENTS_PER_ACTOR),
    resourceData: arrayRecord<ResourceSample>(data.resourceData, MAX_RESOURCE_SAMPLES_PER_ACTOR),
    selfName: typeof data.selfName === 'string' ? data.selfName : '',
    blurNames: data.blurNames === true,
    partyNames: limitedStringArray(data.partyNames, MAX_PARTY_MEMBERS),
    partyData: limitedObjectArray<PartyMemberData>(data.partyData, MAX_PARTY_MEMBERS),
    encounterDurationSec: finiteNumber(data.encounterDurationSec) ?? 0,
    pullList: normalizedPullList(data.pullList),
  }
}

export function pullEntryStableKey(entry: PullEntry | null | undefined): string {
  if (!entry || entry.index === null) return ''
  return [
    entry.encounterId ?? entry.encounterName,
    entry.duration,
    entry.pullNumber ?? 0,
  ].join('|')
}

export function historicalPullListSignature(entries: PullEntry[] | undefined): string {
  if (!Array.isArray(entries)) return ''
  return JSON.stringify(entries
    .filter(entry => entry.index !== null)
    .map(entry => [
      pullEntryStableKey(entry),
      entry.index,
      entry.pullCount ?? 0,
      entry.bossPercentLabel ?? '',
      entry.pullOutcome ?? '',
    ]))
}

export function evaluateEncounterPayload(data: BreakdownPayload, context: {
  activePull: number | null
  lastBroadcastTime: number
  currentPullList: PullEntry[]
  selectedPullEntry: PullEntry | null
}): EncounterPayloadDecision {
  if (data.type !== 'encounterData') return { accept: false, incomingPullIndex: null, liveHistoryChanged: false }

  const incomingPullIndex = 'pullIndex' in data ? data.pullIndex ?? null : null
  if (context.activePull !== null && incomingPullIndex !== context.activePull) {
    const normalizedList = normalizedPullList(data.pullList)
    const nextPullList = normalizedList.length ? normalizedList : context.currentPullList
    const liveHistoryChanged = incomingPullIndex === null &&
      historicalPullListSignature(data.pullList) !== historicalPullListSignature(context.currentPullList)
    if (!liveHistoryChanged) return { accept: false, incomingPullIndex, liveHistoryChanged: false }
    const selectedKey = pullEntryStableKey(context.selectedPullEntry)
    const remappedEntry = nextPullList.find(entry => pullEntryStableKey(entry) === selectedKey)
    return {
      accept: true,
      incomingPullIndex,
      liveHistoryChanged: true,
      nextPullList,
      nextActivePull: remappedEntry?.index,
    }
  }

  const ts = data.timestamp ?? 0
  if (context.activePull === null && context.lastBroadcastTime > 0 && ts <= context.lastBroadcastTime) {
    return { accept: false, incomingPullIndex, liveHistoryChanged: false }
  }
  return { accept: true, incomingPullIndex, liveHistoryChanged: false }
}

export function parseValidBreakdownSnapshot(raw: string | null, now: number): BreakdownPayload | null {
  if (!raw) return null
  const parsed = JSON.parse(raw)
  if (!isRecord(parsed)) return null
  const data = parsed as BreakdownPayload
  const ts = data.timestamp ?? 0
  if (data.type !== 'encounterData' || !ts || now - ts > BREAKDOWN_SNAPSHOT_MAX_AGE_MS) return null
  return normalizeBreakdownPayload(data)
}

export function useBreakdownDataState() {
  const state = {
    allData: ref<Record<string, CombatantAbilityData>>({}),
    dpsTimeline: ref<DpsTimeline>({}),
    hpsTimeline: ref<DpsTimeline>({}),
    dtakenTimeline: ref<DpsTimeline>({}),
    dpsByCombatant: ref<Record<string, number>>({}),
    damageByCombatant: ref<Record<string, number>>({}),
    rdpsByCombatant: ref<Record<string, number>>({}),
    rdpsGiven: ref<Record<string, number>>({}),
    rdpsTaken: ref<Record<string, number>>({}),
    selfName: ref(''),
    blurNames: ref(false),
    partyNames: ref<string[]>([]),
    selected: ref(''),
    pullList: ref<PullEntry[]>([]),
    activePull: ref<number | null>(null),
    encounterDurationSec: ref(0),
    hiddenSeries: ref<Set<string>>(new Set()),
    damageTakenData: ref<Record<string, CombatantAbilityData>>({}),
    healingReceivedData: ref<Record<string, CombatantAbilityData>>({}),
    hitData: ref<Record<string, HitRecord[]>>({}),
    deaths: ref<DeathRecord[]>([]),
    combatantIds: ref<Record<string, string>>({}),
    combatantJobs: ref<Record<string, string>>({}),
    showEnemies: ref(false),
    lastBroadcastTime: ref(0),
    castData: ref<Record<string, CastEvent[]>>({}),
    resourceData: ref<Record<string, ResourceSample[]>>({}),
    partyData: ref<PartyMemberData[]>([]),
  }

  function clearBreakdownData() {
    for (const key of ['allData', 'dpsTimeline', 'hpsTimeline', 'dtakenTimeline', 'dpsByCombatant', 'damageByCombatant', 'rdpsByCombatant', 'rdpsGiven', 'rdpsTaken', 'damageTakenData', 'healingReceivedData', 'hitData', 'combatantIds', 'combatantJobs', 'castData', 'resourceData'] as const) {
      state[key].value = {}
    }
    state.deaths.value = []
  }

  function assignBreakdownPayload(data: BreakdownPayload) {
    const normalized = normalizeBreakdownPayload(data)
    state.allData.value              = normalized.abilityData      ?? {}
    state.dpsTimeline.value          = normalized.dpsTimeline      ?? {}
    state.hpsTimeline.value          = normalized.hpsTimeline      ?? {}
    state.dtakenTimeline.value       = normalized.dtakenTimeline   ?? {}
    state.dpsByCombatant.value       = normalized.dpsByCombatant   ?? {}
    state.damageByCombatant.value    = normalized.damageByCombatant ?? {}
    state.rdpsByCombatant.value      = normalized.rdpsByCombatant  ?? {}
    state.rdpsGiven.value            = normalized.rdpsGiven        ?? {}
    state.rdpsTaken.value            = normalized.rdpsTaken        ?? {}
    state.damageTakenData.value      = normalized.damageTakenData  ?? {}
    state.healingReceivedData.value  = normalized.healingReceivedData ?? {}
    state.hitData.value              = normalized.hitData          ?? {}
    state.deaths.value               = normalized.deaths           ?? []
    state.combatantIds.value         = normalized.combatantIds     ?? {}
    state.combatantJobs.value        = normalized.combatantJobs    ?? {}
    state.castData.value             = normalized.castData         ?? {}
    state.resourceData.value         = normalized.resourceData     ?? {}
    state.selfName.value             = normalized.selfName         ?? ''
    state.blurNames.value            = normalized.blurNames        ?? false
    state.partyNames.value           = normalized.partyNames       ?? []
    state.partyData.value            = normalized.partyData        ?? []
    state.encounterDurationSec.value = normalized.encounterDurationSec ?? 0
    state.pullList.value             = normalized.pullList         ?? []
  }

  return { ...state, clearBreakdownData, assignBreakdownPayload }
}
