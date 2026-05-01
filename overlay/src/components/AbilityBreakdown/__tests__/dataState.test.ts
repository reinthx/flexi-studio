import { expect, it } from 'vitest'
import {
  evaluateEncounterPayload,
  historicalPullListSignature,
  normalizeBreakdownPayload,
  parseValidBreakdownSnapshot,
  pullEntryStableKey,
  useBreakdownDataState,
} from '../dataState'
import type { PullEntry } from '../types'

const pull = (partial: Partial<PullEntry>): PullEntry => ({
  index: 1,
  encounterName: 'Raid',
  duration: '1:00',
  ...partial,
})

it('builds stable pull keys and historical list signatures', () => {
  const entries = [
    pull({ index: null, encounterName: 'Live' }),
    pull({ index: 1, encounterId: 'a', pullNumber: 1, pullCount: 2, bossPercentLabel: '50%', pullOutcome: 'wipe' }),
  ]
  expect(pullEntryStableKey(entries[0])).toBe('')
  expect(pullEntryStableKey(entries[1])).toBe('a|1:00|1')
  expect(historicalPullListSignature(entries)).toContain('50%')
})

it('evaluates stale, mismatched, and live-history encounter payloads', () => {
  const selected = pull({ index: 2, encounterId: 'a', pullNumber: 2, duration: '2:00' })
  expect(evaluateEncounterPayload({ type: 'other' }, { activePull: null, lastBroadcastTime: 0, currentPullList: [], selectedPullEntry: null }).accept).toBe(false)
  expect(evaluateEncounterPayload({ type: 'encounterData', timestamp: 10 }, { activePull: null, lastBroadcastTime: 20, currentPullList: [], selectedPullEntry: null }).accept).toBe(false)
  expect(evaluateEncounterPayload({ type: 'encounterData', pullIndex: 3 }, { activePull: 2, lastBroadcastTime: 0, currentPullList: [selected], selectedPullEntry: selected }).accept).toBe(false)

  const nextPullList = [pull({ index: 1, pullNumber: 1 }), selected]
  const decision = evaluateEncounterPayload({ type: 'encounterData', pullIndex: null, pullList: nextPullList }, {
    activePull: 2,
    lastBroadcastTime: 0,
    currentPullList: [selected],
    selectedPullEntry: selected,
  })
  expect(decision).toMatchObject({ accept: true, liveHistoryChanged: true, nextActivePull: 2 })
})

it('parses only fresh encounter snapshots', () => {
  expect(parseValidBreakdownSnapshot(null, 1000)).toBeNull()
  expect(parseValidBreakdownSnapshot(JSON.stringify({ type: 'encounterData', timestamp: 900 }), 1000)?.timestamp).toBe(900)
  expect(parseValidBreakdownSnapshot(JSON.stringify({ type: 'encounterData', timestamp: 1 }), 100_000)).toBeNull()
  expect(parseValidBreakdownSnapshot(JSON.stringify({ type: 'other', timestamp: 900 }), 1000)).toBeNull()
  expect(parseValidBreakdownSnapshot(JSON.stringify(['not', 'a', 'payload']), 1000)).toBeNull()
})

it('normalizes unsafe payload containers and caps unbounded lists', () => {
  const normalized = normalizeBreakdownPayload({
    type: 'encounterData',
    abilityData: [] as never,
    dpsTimeline: {
      Alice: [1, Number.NaN, 2],
      Bad: 'nope' as never,
    },
    dpsByCombatant: { Alice: 100, Bad: Number.POSITIVE_INFINITY },
    hitData: { Alice: Array.from({ length: 5005 }, (_, index) => ({ t: index })) as never },
    deaths: Array.from({ length: 505 }, (_, index) => ({ targetName: `Player ${index}` })) as never,
    partyNames: ['Alice', 1, 'Bob'] as never,
    pullList: ['bad', pull({ index: 1 })] as never,
    selfName: 123 as never,
    blurNames: 'true' as never,
    encounterDurationSec: Number.NaN,
  })

  expect(normalized.abilityData).toEqual({})
  expect(normalized.dpsTimeline).toEqual({ Alice: [1, 2] })
  expect(normalized.dpsByCombatant).toEqual({ Alice: 100 })
  expect(normalized.hitData?.Alice).toHaveLength(5000)
  expect(normalized.deaths).toHaveLength(500)
  expect(normalized.partyNames).toEqual(['Alice', 'Bob'])
  expect(normalized.pullList).toHaveLength(1)
  expect(normalized.selfName).toBe('')
  expect(normalized.blurNames).toBe(false)
  expect(normalized.encounterDurationSec).toBe(0)
})

it('assigns encounter payload fields into breakdown state', () => {
  const state = useBreakdownDataState()
  state.assignBreakdownPayload({
    type: 'encounterData',
    abilityData: { Alice: { fire: { abilityId: '1', abilityName: 'Fire', totalDamage: 100, hits: 1, maxHit: 100, minHit: 100 } } },
    dpsTimeline: { Alice: [100] },
    deaths: [{ targetName: 'Alice', targetId: '10', timestamp: 1000, hpSamples: [] }],
    selfName: 'Alice',
    blurNames: true,
    partyNames: ['Alice'],
    partyData: [{ id: 1, name: 'Alice', inParty: true, job: 'BLM' }],
    encounterDurationSec: 10,
    pullList: [pull({ index: null })],
  })

  expect(state.allData.value.Alice.fire.abilityName).toBe('Fire')
  expect(state.dpsTimeline.value.Alice).toEqual([100])
  expect(state.deaths.value).toHaveLength(1)
  expect(state.selfName.value).toBe('Alice')
  expect(state.blurNames.value).toBe(true)
  expect(state.partyNames.value).toEqual(['Alice'])
  expect(state.encounterDurationSec.value).toBe(10)
  expect(state.pullList.value[0].index).toBeNull()
})
