import { describe, it, expect } from 'vitest'
import { castsInDeathWindow, deathEventsFor, deathHealingAbilityCounts, deathHpBars, deathRecapRows, deathRelatedDamage, deathsForActor, deathTimeSecondsForActor, deathWindow, formatHpValue, nearDeathAbilityCounts, overviewDeathEvents, resTimeSecondsForActor, sortPlayerDeaths } from '../deathTransforms'
import type { CastEvent, DeathRecord, HpSample, HitRecord, DeathEvent } from '@shared/configSchema'

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
const createDeathEvent = (partial: Partial<DeathEvent>): DeathEvent => ({
  t: 1000,
  type: 'dmg',
  abilityName: 'Attack',
  sourceName: 'Monster',
  amount: 5000,
  hpBefore: 0.8,
  hpAfter: 0.05,
  hpBeforeRaw: 8000,
  hpAfterRaw: 500,
  maxHp: 10000,
  isDeathBlow: false,
  ...partial,
})
const createCastEvent = (partial: Partial<CastEvent>): CastEvent => ({
  t: 1000,
  abilityId: 'cast',
  abilityName: 'Cast',
  source: 'Player',
  target: 'Boss',
  type: 'instant',
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

describe('death context counts', () => {
  it('filters actor deaths and counts near-death and healing abilities', () => {
    const deaths = [
      createDeathRecord({
        targetName: 'Player',
        events: [
          createDeathEvent({ t: 2000, abilityName: 'Tankbuster', type: 'dmg', hpAfter: 0.05 }),
          createDeathEvent({ t: 20_000, abilityName: 'Late Heal', type: 'heal', hpAfter: 0.4 }),
        ],
      }),
      createDeathRecord({
        targetName: 'Player',
        events: [
          createDeathEvent({ t: 12_000, abilityName: 'Stack Marker', type: 'dmg', hpAfter: 0.08 }),
          createDeathEvent({ t: 12_500, abilityName: 'Benediction', type: 'heal', hpAfter: 1 }),
        ],
      }),
      createDeathRecord({ targetName: 'Other', events: [createDeathEvent({ abilityName: 'Other Hit' })] }),
    ]

    const playerDeaths = deathsForActor(deaths, 'Player')
    expect(playerDeaths).toHaveLength(2)
    expect(deathTimeSecondsForActor(deaths, 'Player')).toBe(10)
    expect(resTimeSecondsForActor([createDeathRecord({ targetName: 'Player', resurrectTime: 12_000 })], 'Player')).toBe(12)
    expect(Array.from(nearDeathAbilityCounts(playerDeaths))).toEqual([['Tankbuster', 1]])
    expect(Array.from(deathHealingAbilityCounts(playerDeaths))).toEqual([['Late Heal', 1], ['Benediction', 1]])
  })
})

describe('death detail transforms', () => {
  it('builds related damage, windows, recap rows, casts, and overview death events', () => {
    const death = createDeathRecord({
      targetName: 'Player',
      timestamp: 10_000,
      resurrectTime: 15_000,
      events: [
        createDeathEvent({ t: 5000, abilityName: 'Raidwide', amount: 1000 }),
        createDeathEvent({ t: 7000, abilityName: 'Raidwide', amount: 2000, isEstimated: true }),
        createDeathEvent({ t: 9000, abilityName: 'Killing Blow', amount: 9000, isDeathBlow: true }),
      ],
    })
    const events = deathEventsFor(death)
    const window = deathWindow(death, events)

    expect(deathRelatedDamage(events)).toEqual([{ ability: 'Raidwide', amount: 3000 }])
    expect(window).toEqual({ start: 5000, end: 10_000 })
    expect(castsInDeathWindow([
      createCastEvent({ t: 4000, abilityName: 'Early' }),
      createCastEvent({ t: 6000, abilityName: 'Inside' }),
      createCastEvent({ t: 12_000, abilityName: 'Late' }),
    ], window).map(event => event.abilityName)).toEqual(['Inside'])
    expect(deathRecapRows(death, window, events, ms => `${ms / 1000}s`)).toEqual([
      ['Time', '10s'],
      ['Raised', '15s'],
      ['Window Length', '5s'],
      ['Estimated', 'Yes'],
    ])
    expect(overviewDeathEvents([death], ms => `${ms / 1000}s`)[0]).toMatchObject({
      key: 'death-0-10000',
      label: 'Player died',
      detail: 'at 10s · raised 15s',
      type: 'death',
    })
  })
})
