import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Frame } from '../transitions'
import { TransitionEngine, easeOutCubic } from '../transitions'
import { resetReducedMotionCache } from '../reducedMotion'

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
    dps: '1000',
    enchps: '0',
    rdps: '0',
    rawValue: 1000 - i * 200,
    rawDps: 1000 - i * 200,
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

describe('easeOutCubic', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('moves fast early (no mid-transition pause like easeInOutQuad)', () => {
    expect(easeOutCubic(0.2)).toBeGreaterThan(0.2)
    expect(easeOutCubic(0.2)).toBeGreaterThan(easeInOutQuad(0.2))
  })

  it('lands gently at the end', () => {
    expect(easeOutCubic(0.8)).toBeGreaterThan(0.8)
    expect(easeOutCubic(0.9)).toBeLessThan(1)
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

describe('TransitionEngine', () => {
  let rafCallback: ((now: number) => void) | null
  let emitted: Frame[]
  let nowMs: number

  beforeEach(() => {
    rafCallback = null
    emitted = []
    nowMs = 1000
    vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
      rafCallback = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      rafCallback = null
    })
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
    resetReducedMotionCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetReducedMotionCache()
  })

  function drive(ms: number): Frame {
    nowMs += ms
    const cb = rafCallback
    expect(cb).not.toBeNull()
    // Clear first: the engine re-registers mid-callback iff the transition continues.
    rafCallback = null
    cb!(nowMs)
    return emitted[emitted.length - 1]
  }

  it('renders the first frame immediately with no transition', () => {
    const engine = new TransitionEngine(f => emitted.push(f))
    engine.push(createFrame(['Alice', 'Bob']))
    expect(emitted).toHaveLength(1)
    expect(emitted[0].bars.map(b => b.name)).toEqual(['Alice', 'Bob'])
    expect(rafCallback).toBeNull()
    engine.stop()
  })

  it('interpolates fill fractions with easeOutCubic timing', () => {
    const engine = new TransitionEngine(f => emitted.push(f))
    engine.setDuration(1000)
    engine.push(createFrame(['Alice']))
    const next = createFrame(['Alice'])
    next.bars[0].fillFraction = 0
    next.bars[0].rawValue = 0
    engine.push(next)

    // Halfway through: eased t = easeOutCubic(0.5) = 0.875
    const mid = drive(500)
    expect(mid.bars[0].fillFraction).toBeCloseTo(lerp(1, 0, easeOutCubic(0.5)), 10)

    // Text fields snap to the target immediately while numbers glide
    expect(mid.bars[0].displayValue).toBe('1000')

    const end = drive(500)
    expect(end.bars[0].fillFraction).toBeCloseTo(0, 10)
    expect(rafCallback).toBeNull()
    engine.stop()
  })

  it('re-bases from the mid-flight state when a frame lands early', () => {
    const engine = new TransitionEngine(f => emitted.push(f))
    engine.setDuration(1000)
    engine.push(createFrame(['Alice']))
    const falling = createFrame(['Alice'])
    falling.bars[0].fillFraction = 0
    engine.push(falling)
    const mid = drive(500)
    expect(mid.bars[0].fillFraction).toBeLessThan(1)
    expect(mid.bars[0].fillFraction).toBeGreaterThan(0)

    // New frame arrives mid-transition: must continue from the
    // interpolated value, never snap back to 1 or jump to the target.
    const rising = createFrame(['Alice'])
    rising.bars[0].fillFraction = 1
    engine.push(rising)
    const after = drive(100)
    expect(after.bars[0].fillFraction).toBeGreaterThan(mid.bars[0].fillFraction)
    expect(after.bars[0].fillFraction).toBeLessThan(1)
    engine.stop()
  })

  it('fades bars in and out across the name union', () => {
    const engine = new TransitionEngine(f => emitted.push(f))
    engine.setDuration(1000)
    engine.push(createFrame(['Alice']))
    const next = createFrame(['Bob'])
    engine.push(next)

    const mid = drive(500)
    const alice = mid.bars.find(b => b.name === 'Alice')!
    const bob = mid.bars.find(b => b.name === 'Bob')!
    expect(alice.alpha).toBeLessThan(1)
    expect(bob.alpha).toBeGreaterThan(0)

    const end = drive(500)
    expect(end.bars.map(b => b.name)).toEqual(['Bob'])
    engine.stop()
  })

  it('drops fully-exited bars instead of lingering as zero-alpha rows', () => {
    const engine = new TransitionEngine(f => emitted.push(f))
    engine.setDuration(1000)
    engine.push(createFrame(['Alice', 'Bob']))
    engine.push(createFrame(['Bob']))
    const end = drive(1000)
    expect(end.bars.map(b => b.name)).toEqual(['Bob'])
    expect(end.bars.every(b => b.alpha > 0)).toBe(true)
    engine.stop()
  })

  it('keeps rank order sorted by interpolated fill every frame', () => {
    const engine = new TransitionEngine(f => emitted.push(f))
    engine.setDuration(1000)
    const first = createFrame(['Alice', 'Bob'])
    engine.push(first)
    const swapped = createFrame(['Bob', 'Alice'])
    swapped.bars[0].fillFraction = 1
    swapped.bars[0].rawValue = 1000
    swapped.bars[1].fillFraction = 0.8
    swapped.bars[1].rawValue = 800
    engine.push(swapped)

    const end = drive(1000)
    expect(end.bars.map(b => b.name)).toEqual(['Bob', 'Alice'])
    engine.stop()
  })

  it('snaps to the target in one frame when duration is zero', () => {
    const engine = new TransitionEngine(f => emitted.push(f))
    engine.setDuration(0)
    engine.push(createFrame(['Alice']))
    const next = createFrame(['Alice'])
    next.bars[0].fillFraction = 0
    engine.push(next)

    const end = drive(16)
    expect(end.bars[0].fillFraction).toBe(0)
    expect(rafCallback).toBeNull()
    engine.stop()
  })

  it('honors OS reduced-motion by snapping instead of gliding', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true, addEventListener: () => {} }),
    })
    const engine = new TransitionEngine(f => emitted.push(f))
    engine.setDuration(1000)
    engine.push(createFrame(['Alice']))
    const next = createFrame(['Alice'])
    next.bars[0].fillFraction = 0
    engine.push(next)

    const end = drive(16)
    expect(end.bars[0].fillFraction).toBe(0)
    expect(rafCallback).toBeNull()
    engine.stop()
  })
})
