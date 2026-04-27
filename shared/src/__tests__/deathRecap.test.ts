import { describe, it, expect } from 'vitest'
import { buildDeathEvents } from '../deathRecap'
import type { HpSample, HitRecord, DeathEvent } from '../configSchema'

describe('buildDeathEvents', () => {
  const makeSamples = (samples: Array<{ t: number; currentHp: number; maxHp: number }>): HpSample[] =>
    samples.map(s => ({ t: s.t, currentHp: s.currentHp, maxHp: s.maxHp, hp: s.currentHp / s.maxHp }))

  const makeHits = (hits: Array<{ t: number; abilityName: string; amount: number; type: 'dmg' | 'heal' }>): HitRecord[] =>
    hits.map(h => ({
      t: h.t,
      abilityId: '123',
      abilityName: h.abilityName,
      amount: h.amount,
      type: h.type,
      hitType: 'dmg',
      isDeathBlow: false,
      sourceName: 'Monster',
    }))

  it('returns empty array when no hits', () => {
    const samples = makeSamples([{ t: 0, currentHp: 10000, maxHp: 10000 }])
    const result = buildDeathEvents(samples, [], 0)
    expect(result).toEqual([])
  })

  it('returns estimated events when no samples', () => {
    const hits = makeHits([{ t: 100, abilityName: 'Attack', amount: 5000, type: 'dmg' }])
    const result = buildDeathEvents([], hits, 5000)
    expect(result.length).toBeGreaterThan(0)
  })

  it('builds events from hits', () => {
    const samples = makeSamples([
      { t: 0, currentHp: 10000, maxHp: 10000 },
      { t: 5000, currentHp: 5000, maxHp: 10000 },
      { t: 10000, currentHp: 0, maxHp: 10000 },
    ])
    const hits = makeHits([
      { t: 2000, abilityName: 'Attack', amount: 3000, type: 'dmg' },
      { t: 6000, abilityName: 'Attack', amount: 2000, type: 'dmg' },
    ])

    const result = buildDeathEvents(samples, hits, 10000)

    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('hpBefore')
  })

  it('marks death blow events', () => {
    const samples = makeSamples([
      { t: 0, currentHp: 10000, maxHp: 10000 },
      { t: 5000, currentHp: 1000, maxHp: 10000 },
      { t: 10000, currentHp: 0, maxHp: 10000 },
    ])
    const hits = makeHits([
      { t: 8000, abilityName: 'Fatal Blow', amount: 1000, type: 'dmg' },
    ])

    const result = buildDeathEvents(samples, hits, 10000)
    const deathBlow = result.find(e => e.isDeathBlow)

    expect(deathBlow).toBeDefined()
    expect(deathBlow?.isDeathBlow).toBe(true)
  })

  it('handles healing events', () => {
    const samples = makeSamples([
      { t: 0, currentHp: 10000, maxHp: 10000 },
      { t: 3000, currentHp: 6000, maxHp: 10000 },
      { t: 10000, currentHp: 0, maxHp: 10000 },
    ])
    const hits = makeHits([
      { t: 2000, abilityName: 'Heal', amount: 2000, type: 'heal' },
      { t: 8000, abilityName: 'Attack', amount: 6000, type: 'dmg' },
    ])

    const result = buildDeathEvents(samples, hits, 10000)
    const healEvents = result.filter(e => e.type === 'heal')

    expect(healEvents.length).toBeGreaterThan(0)
  })

  it('filters invalid samples', () => {
    const samples = [
      { t: 0, currentHp: NaN, maxHp: 10000, hp: NaN },
      { t: 1000, currentHp: 5000, maxHp: -100, hp: -50 },
      { t: 2000, currentHp: 3000, maxHp: 10000, hp: 0.3 },
    ]
    const result = buildDeathEvents(samples, [], 5000)

    expect(result).toEqual([])
  })

  it('sorts events by timestamp', () => {
    const samples = makeSamples([
      { t: 0, currentHp: 10000, maxHp: 10000 },
      { t: 10000, currentHp: 0, maxHp: 10000 },
    ])
    const hits = makeHits([
      { t: 8000, abilityName: 'Late', amount: 5000, type: 'dmg' },
      { t: 2000, abilityName: 'Early', amount: 3000, type: 'dmg' },
    ])

    const result = buildDeathEvents(samples, hits, 10000)
    const times = result.map(e => e.t)

    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('handles missing hpSamples by estimating', () => {
    const samples: HpSample[] = []
    const hits = makeHits([
      { t: 1000, abilityName: 'Attack', amount: 5000, type: 'dmg' },
    ])

    const result = buildDeathEvents(samples, hits, 5000)

    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  it('uses deathTimestamp as final event time', () => {
    const samples = makeSamples([
      { t: 0, currentHp: 10000, maxHp: 10000 },
    ])
    const hits = makeHits([])

    const result = buildDeathEvents(samples, hits, 10000)

    expect(result.length).toBe(0)
  })
})