/**
 * transitions.ts
 *
 * rAF-based interpolation engine. Receives CombatData frames once per second
 * and smoothly animates bar values between them using easeInOutQuad.
 *
 * Usage:
 *   const engine = new TransitionEngine(onFrame)
 *   engine.push(combatData)   // call on each CombatData event
 *   engine.stop()             // cleanup
 */

export interface BarFrame {
  name: string
  job: string
  partyGroup: string
  /** 0–1 representing fill fraction (value / max value in list) */
  fillFraction: number
  /** Raw display value (already formatted by caller) */
  displayValue: string
  displayPct: string
  deaths: string
  crithit: string
  directhit: string
  tohit: string
  enchps: string
  rdps: string
  rawValue: number
  rawEnchps: number
  rawRdps: number
  maxHit: string
  metricFractions?: Record<string, number>
  /** 0–1 for enter/exit fade */
  alpha: number
  /** Rank in the list (1 = top) */
  rank?: number
}

export interface Frame {
  bars: BarFrame[]
  encounterTitle: string
  encounterDuration: string
  totalDps: string
  totalHps: string
  totalDtps: string
  totalRdps: string
  isActive: boolean
}

type OnFrameCallback = (frame: Frame) => void

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpRecord(a: Record<string, number> | undefined, b: Record<string, number> | undefined, t: number): Record<string, number> | undefined {
  if (!a && !b) return undefined
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  return Object.fromEntries([...keys].map(key => [key, lerp(a?.[key] ?? 0, b?.[key] ?? 0, t)]))
}

export class TransitionEngine {
  private prev: Frame | null = null
  private next: Frame | null = null
  private t = 1       // starts at 1 so first frame renders immediately
  private lastTime = 0
  private rafId = 0
  private duration = 800  // ms, overridden by profile config

  constructor(private readonly onFrame: OnFrameCallback) {}

  setDuration(ms: number): void {
    this.duration = ms
  }

  push(next: Frame): void {
    if (this.next === null) {
      // Very first frame — render immediately with no transition
      this.prev = next
      this.next = next
      this.t = 1
      this.onFrame(next)
      return
    }

    // Snapshot current interpolated state as the new start point
    // so we never snap back when a new frame arrives mid-transition
    this.prev = this.t < 1 ? this.interpolate(this.t) : this.next
    this.next = next
    this.t = 0
    this.lastTime = performance.now()
    this.scheduleRaf()
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  private scheduleRaf(): void {
    if (this.rafId) return
    this.rafId = requestAnimationFrame(this.tick)
  }

  private tick = (now: number): void => {
    const dt = now - this.lastTime
    this.lastTime = now
    this.t = Math.min(1, this.t + dt / this.duration)

    const frame = this.interpolate(easeInOutQuad(this.t))
    this.onFrame(frame)

    if (this.t < 1) {
      this.rafId = requestAnimationFrame(this.tick)
    } else {
      this.rafId = 0
    }
  }

  private interpolate(et: number): Frame {
    const prev = this.prev!
    const next = this.next!

    // Build a unified bar list: union of names from prev and next
    const allNames = new Set([
      ...prev.bars.map(b => b.name),
      ...next.bars.map(b => b.name),
    ])

    const bars: BarFrame[] = []

    for (const name of allNames) {
      const p = prev.bars.find(b => b.name === name)
      const n = next.bars.find(b => b.name === name)

      if (p && n) {
        // Bar present in both — interpolate
        bars.push({
          name,
          job: n.job,
          partyGroup: n.partyGroup,
          fillFraction: lerp(p.fillFraction, n.fillFraction, et),
          displayValue: n.displayValue,
          displayPct: n.displayPct,
          deaths: n.deaths,
          crithit: n.crithit,
          directhit: n.directhit,
          tohit: n.tohit,
          enchps: n.enchps,
          rdps: n.rdps,
          rawValue: lerp(p.rawValue, n.rawValue, et),
          rawEnchps: lerp(p.rawEnchps, n.rawEnchps, et),
          rawRdps: lerp(p.rawRdps, n.rawRdps, et),
          maxHit: n.maxHit,
          metricFractions: lerpRecord(p.metricFractions, n.metricFractions, et),
          alpha: lerp(p.alpha, n.alpha, et),
        })
      } else if (n) {
        // New bar — fade in
        bars.push({ ...n, fillFraction: lerp(0, n.fillFraction, et), metricFractions: lerpRecord(undefined, n.metricFractions, et), alpha: et })
      } else if (p) {
        // Removed bar — fade out
        bars.push({ ...p, fillFraction: lerp(p.fillFraction, 0, et), metricFractions: lerpRecord(p.metricFractions, undefined, et), alpha: 1 - et })
      }
    }

    // Sort by fill fraction descending (highest DPS first)
    bars.sort((a, b) => b.fillFraction - a.fillFraction)

    return {
      bars,
      encounterTitle: next.encounterTitle,
      encounterDuration: next.encounterDuration,
      totalDps: next.totalDps,
      totalHps: next.totalHps,
      totalDtps: next.totalDtps,
      totalRdps: next.totalRdps,
      isActive: next.isActive,
    }
  }
}
