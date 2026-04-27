import { describe, it, expect } from 'vitest'
import { sortPlayerDeaths, deathEventsFor, formatHpValue, deathHpBars } from '../deathTransforms'
import type { DeathRecord, HpSample, HitRecord, DeathEvent } from '@shared/configSchema'

const createDeathRecord = (partial: Partial<DeathRecord> = {}): DeathRecord => ({
  targetId: '10',
  targetName: 'Player',
  timestamp: 10000,
  hpSamples: [],
  lastHits: [],
  resurrectTime: null,
  ...partial,
})

const createHpSample = (partial: Partial<HpSample>): HpSample => ({
  t: 0,
  currentHp: 10000,
  maxHp: 10000,
  hp: 1,
  ...partial,
})

const createHit = (partial: Partial<HitRecord>): HitRecord => ({
  t: 1000,
  abilityId: '123',
  abilityName: 'Attack',
  amount: 5000,
  type: 'dmg',
  hitType: 'dmg',
  isDeathBlow: false,
  sourceName: 'Monster',
  ...partial,
})

describe('sortPlayerDeaths', () => {
  it('returns empty array for non-array input', () => {
    expect(sortPlayerDeaths(null as any)).toEqual([])
    expect(sortPlayerDeaths(undefined as any)).toEqual([])
  })

  it('filters to only player deaths (targetId starts with 10)', () => {
    const deaths = [
      createDeathRecord({ targetId: '10', targetName: 'Player1', timestamp: 5000 }),
      createDeathRecord({ targetId: '4', targetName: 'Monster', timestamp: 3000 }),
      createDeathRecord({ targetId: '10', targetName: 'Player2', timestamp: 2000 }),
    ]

    const result = sortPlayerDeaths(deaths)
    expect(result).toHaveLength(2)
    expect(result.map(d => d.targetName)).toEqual(['Player2', 'Player1'])
  })

  it('sorts by timestamp ascending', () => {
    const deaths = [
      createDeathRecord({ targetId: '10', targetName: 'A', timestamp: 5000 }),
      createDeathRecord({ targetId: '10', targetName: 'B', timestamp: 1000 }),
      createDeathRecord({ targetId: '10', targetName: 'C', timestamp: 3000 }),
    ]

    const result = sortPlayerDeaths(deaths)
    expect(result[0].targetName).toBe('B')
    expect(result[1].targetName).toBe('C')
    expect(result[2].targetName).toBe('A')
  })
})

describe('deathEventsFor', () => {
  it('returns events from record when present', () => {
    const events: DeathEvent[] = [
      { t: 500, hpBefore: 0.5, hpAfter: 0.3, hpBeforeRaw: 5000, hpAfterRaw: 3000, maxHp: 10000, type: 'dmg', isDeathBlow: false, abilityName: 'Hit', isEstimated: false },
    ]
    const death = createDeathRecord({ events })

    expect(deathEventsFor(death)).toBe(events)
  })

  it('builds events from hpSamples and lastHits when events missing', () => {
    const death = createDeathRecord({
      hpSamples: [
        createHpSample({ t: 0, currentHp: 10000, maxHp: 10000, hp: 1 }),
        createHpSample({ t: 2000, currentHp: 5000, maxHp: 10000, hp: 0.5 }),
        createHpSample({ t: 5000, currentHp: 0, maxHp: 10000, hp: 0 }),
      ],
      lastHits: [
        createHit({ t: 4000, amount: 5000 }),
      ],
    })

    const result = deathEventsFor(death)
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns empty array for empty hpSamples', () => {
    const death = createDeathRecord({ hpSamples: [] })

    expect(deathEventsFor(death)).toEqual([])
  })
})

describe('formatHpValue', () => {
  it('formats positive values', () => {
    expect(formatHpValue(10000, v => String(v))).toBe('10000')
  })

  it('clamps negative to 0', () => {
    expect(formatHpValue(-500, v => String(v))).toBe('0')
  })

  it('rounds values', () => {
    expect(formatHpValue(12345.67, v => String(Math.round(v)))).toBe('12346')
  })
})

describe('deathHpBars', () => {
  it('returns empty for no events', () => {
    const death = createDeathRecord({ hpSamples: [] })
    expect(deathHpBars(death)).toEqual([])
  })

  it('returns bar data for events', () => {
    const death = createDeathRecord({
      hpSamples: [
        createHpSample({ t: 0, currentHp: 10000, maxHp: 10000, hp: 1 }),
        createHpSample({ t: 2000, currentHp: 5000, maxHp: 10000, hp: 0.5 }),
        createHpSample({ t: 4000, currentHp: 0, maxHp: 10000, hp: 0 }),
      ],
      lastHits: [
        createHit({ t: 3000, amount: 5000 }),
      ],
    })

    const bars = deathHpBars(death)
    expect(bars.length).toBeGreaterThan(0)
    expect(bars[0]).toHaveProperty('x')
    expect(bars[0]).toHaveProperty('width')
    expect(bars[0]).toHaveProperty('hpBefore')
    expect(bars[0]).toHaveProperty('hpAfter')
  })

  it('marks damage and healing events correctly', () => {
    const death = createDeathRecord({
      hpSamples: [
        createHpSample({ t: 0, currentHp: 5000, maxHp: 10000, hp: 0.5 }),
        createHpSample({ t: 2000, currentHp: 8000, maxHp: 10000, hp: 0.8 }),
        createHpSample({ t: 4000, currentHp: 0, maxHp: 10000, hp: 0 }),
      ],
      lastHits: [
        createHit({ t: 1000, amount: 2000, type: 'heal' }),
        createHit({ t: 3000, amount: 8000 }),
        createHit({ t: 4000, amount: 10000, isDeathBlow: true }),
      ],
    })

    const bars = deathHpBars(death)
    const dmgBars = bars.filter(b => b.type === 'dmg')
    const healBars = bars.filter(b => b.type === 'heal')

    expect(dmgBars.length).toBeGreaterThan(0)
    expect(healBars.length).toBeGreaterThan(0)
  })
})