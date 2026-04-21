import { describe, it, expect } from 'vitest'
import type { Frame } from '../transitions'
import { TransitionEngine } from '../transitions'

const createFrame = (names: string[]): Frame => ({
  bars: names.map((name, i) => ({
    name,
    job: 'PLD',
    partyGroup: '1',
    fillFraction: 1 - i * 0.2,
    displayValue: '1000',
    displayPct: '10%',
    deaths: '0',
    crithit: '0',
    directhit: '0',
    tohit: '0',
    enchps: '0',
    rdps: '0',
    rawValue: 1000 - i * 200,
    rawEnchps: 0,
    rawRdps: 0,
    maxHit: '0',
    alpha: 1,
    rank: i + 1,
  })),
  encounterTitle: 'Test Encounter',
  encounterDuration: '00:30',
  totalDps: '10000',
  totalHps: '0',
  totalDtps: '0',
  totalRdps: '0',
  isActive: true,
})

const easeInOutQuad = (t: number): number => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

describe('easeInOutQuad', () => {
  it('starts at 0', () => {
    expect(easeInOutQuad(0)).toBe(0)
  })

  it('ends at 1', () => {
    expect(easeInOutQuad(1)).toBe(1)
  })

  it('is 0.5 at t=0.5 (midpoint)', () => {
    expect(easeInOutQuad(0.5)).toBe(0.5)
  })

  it('eases in (start slower than linear)', () => {
    const linear = 0.2
    const eased = easeInOutQuad(0.2)
    expect(eased).toBeLessThan(linear)
  })

  it('eases differently at end', () => {
    const linear = 0.8
    const eased = easeInOutQuad(0.8)
    expect(eased).not.toBe(linear)
  })
})

describe('lerp', () => {
  it('returns start at t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10)
  })

  it('returns end at t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20)
  })

  it('returns midpoint at t=0.5', () => {
    expect(lerp(10, 20, 0.5)).toBe(15)
  })

  it('extrapolates below range', () => {
    expect(lerp(10, 20, -0.5)).toBe(5)
  })

  it('extrapolates above range', () => {
    expect(lerp(10, 20, 1.5)).toBe(25)
  })
})