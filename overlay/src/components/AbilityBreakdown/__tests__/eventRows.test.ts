import { describe, it, expect } from 'vitest'
import type { BreakdownEventRow } from '../types'
import { deathEventsFor } from '../deathTransforms'
import type { DeathRecord } from '@shared/configSchema'

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