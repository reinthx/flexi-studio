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

  return { ...state, clearBreakdownData }
}
