import { computed, ref } from 'vue'
import { describe, it, expect } from 'vitest'
import type { BreakdownEventRow } from '../types'
import { deathEventsFor } from '../deathTransforms'
import type { DeathRecord } from '@shared/configSchema'
import { useEventRows } from '../eventRows'

const createDeath = (partial: Partial<DeathRecord> = {}): DeathRecord => ({
  targetId: '10',
  targetName: 'Player',
  timestamp: 10000,
  hpSamples: [
    { t: 0, currentHp: 10000, maxHp: 10000, hp: 1 },
    { t: 5000, currentHp: 0, maxHp: 10000, hp: 0 },
  ],
  lastHits: [{ t: 4000, abilityId: '999', abilityName: 'Fatal', amount: 10000, type: 'dmg', hitType: 'dmg', isDeathBlow: true, sourceName: 'Boss' }],
  resurrectTime: null,
  ...partial,
})

const mockFormat = (v: number): string => String(Math.round(v))

describe('deathEventsFor', () => {
  it('returns events from record when present', () => {
    const death = createDeath()
    const result = deathEventsFor(death)
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns empty for no hpSamples and no lastHits', () => {
    const death = createDeath({ hpSamples: [], lastHits: [] })
    const result = deathEventsFor(death)
    expect(result).toEqual([])
  })
})

describe('BreakdownEventRow', () => {
  it('has expected shape', () => {
    const row: BreakdownEventRow = {
      key: 'test',
      t: 1000,
      actor: 'Player',
      eventType: 'damage',
      ability: 'Attack',
      source: 'Monster',
      target: 'Boss',
      amount: 5000,
      hpBefore: '10000',
      hpAfter: '5000',
      note: '',
    }
    expect(row.key).toBe('test')
    expect(row.eventType).toBe('damage')
    expect(row.amount).toBe(5000)
  })
})

describe('useEventRows', () => {
  it('combines cast, death recap, and raise rows sorted newest first', () => {
    const selectedDeath = createDeath({ resurrectTime: 6500 })
    const rows = useEventRows({
      eventActorScope: ref('selected'),
      visibleCombatants: computed(() => ['Player']),
      resolvedSelected: computed(() => 'Player'),
      castData: ref({
        Player: [{ t: 3000, abilityId: '1', abilityName: 'Fire', target: 'Boss', type: 'cast' }],
      }),
      sortedDeaths: computed(() => [selectedDeath]),
      eventFilters: ref(new Set(['damage', 'healing', 'casts', 'deaths', 'raises'])),
      eventWindowOnly: ref(false),
      selectedDeathWindow: computed(() => null),
      format: mockFormat,
    })

    expect(rows.eventRowCountFor('Player')).toBe(rows.eventRowsRaw.value.length)
    expect(rows.eventRowsRaw.value.map(row => row.t)).toEqual([...rows.eventRowsRaw.value.map(row => row.t)].sort((a, b) => b - a))
    expect(rows.eventRowsRaw.value.map(row => row.eventType)).toEqual(['deaths', 'raises', 'damage', 'casts'])
    expect(rows.eventRowsRaw.value.find(row => row.eventType === 'raises')).toMatchObject({
      t: 6500,
      actor: 'Player',
      eventType: 'raises',
      ability: 'Raise',
      hpBefore: '0%',
      hpAfter: 'raised',
    })
    expect(rows.eventRowsRaw.value.find(row => row.eventType === 'deaths')).toMatchObject({
      eventType: 'deaths',
      ability: 'KO',
      target: 'Player',
      amount: null,
    })
  })

  it('supports all-actor scope, event filters, and selected death windows', () => {
    const rows = useEventRows({
      eventActorScope: ref('all'),
      visibleCombatants: computed(() => ['Player', 'Other', 'Empty']),
      resolvedSelected: computed(() => 'Player'),
      castData: ref({
        Player: [{ t: 1000, abilityId: '1', abilityName: 'Fire', target: 'Boss', type: 'cast' }],
        Other: [{ t: 9000, abilityId: '2', abilityName: 'Regen', target: 'Other', type: 'tick' }],
      }),
      sortedDeaths: computed(() => []),
      eventFilters: ref(new Set(['casts'])),
      eventWindowOnly: ref(true),
      selectedDeathWindow: computed(() => ({ start: 800, end: 2000 })),
      format: mockFormat,
    })

    expect(rows.eventRowCountFor('Empty')).toBe(0)
    expect(rows.eventRowsRaw.value.map(row => row.actor)).toEqual(['Other', 'Player'])
    expect(rows.eventRows.value).toEqual([
      expect.objectContaining({
        actor: 'Player',
        eventType: 'casts',
        note: 'cast',
      }),
    ])
  })

  it('returns no selected-scope rows when no actor is selected', () => {
    const rows = useEventRows({
      eventActorScope: ref('selected'),
      visibleCombatants: computed(() => ['Player']),
      resolvedSelected: computed(() => ''),
      castData: ref({ Player: [{ t: 1000, abilityId: '1', abilityName: 'Fire', type: 'cast' }] }),
      sortedDeaths: computed(() => []),
      eventFilters: ref(new Set(['casts'])),
      eventWindowOnly: ref(false),
      selectedDeathWindow: computed(() => null),
      format: mockFormat,
    })

    expect(rows.eventRowsRaw.value).toEqual([])
    expect(rows.eventRows.value).toEqual([])
  })
})
