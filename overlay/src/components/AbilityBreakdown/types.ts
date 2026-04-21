import type { CSSProperties } from 'vue'

export interface PullEntry {
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
  bossPercent?: number
  bossPercentLabel?: string
  bossKilled?: boolean
  enemyCount?: number
  defeatedEnemyCount?: number
  pullOutcome?: 'live' | 'clear' | 'wipe' | 'unknown'
  pullOutcomeLabel?: string
}

export type BreakdownView = 'overview' | 'pulls' | 'done' | 'taken' | 'timeline' | 'deaths' | 'casts' | 'events'
export type TimelineOverlay = 'buffs' | 'deaths' | 'raises' | 'casts' | 'spikes'
export type EventFilter = 'damage' | 'healing' | 'casts' | 'deaths' | 'raises'
export type EventActorScope = 'selected' | 'all'
export type CastFilter = 'cooldowns' | 'mitigations' | 'dps' | 'heals'

export interface BreakdownEventRow {
  key: string
  t: number
  actor: string
  eventType: EventFilter
  ability: string
  source: string
  target: string
  amount: number | null
  hpBefore: string
  hpAfter: string
  note: string
}

export interface PartyMemberData { id: number; name: string; inParty: boolean; partyType?: string; job?: string }

export interface CombatantGroup {
  label: string
  names: string[]
  collapsed?: boolean
}

export type NameStyleFn = (name: string) => CSSProperties | undefined

export type ResourceTrackKey = 'hp' | 'mp'
