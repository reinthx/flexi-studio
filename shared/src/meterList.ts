/**
 * meterList.ts
 *
 * Shared meter-list wiring for the overlay (`MeterView`) and the editor
 * preview (`PreviewArea`): per-frame bar resolution with memoized styles,
 * FLIP rank-swap animation, and single-observer list width measurement.
 *
 * Centralizing this keeps the two meters from drifting apart — they must
 * stay pixel-identical by design.
 */
import { computed, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { BarStyle, Profile } from './configSchema'
import type { BarFrame, Frame } from './transitions'
import { createBarStyleCache } from './styleResolver'
import { clearFillCssCache } from './cssBuilder'
import { useFlipRows, type FlipRows } from './flipRows'
import { useListWidth } from './listWidth'
import { prefersReducedMotion } from './reducedMotion'

export interface ResolvedListBar extends BarFrame {
  rank: number
  barIndex: number
  style: BarStyle
  isSelf: boolean
  isRank1: boolean
}

export interface MeterListOptions {
  /** Current profile (replaced wholesale on load/preset, mutated in place by panels). */
  profile: () => Profile
  /** Self name for YOU/self resolution. */
  selfName: () => string
  /** Latest interpolated frame (null = no data). */
  frame: () => Frame | null
}

export interface MeterList {
  bars: ComputedRef<ResolvedListBar[]>
  flip: FlipRows
  listWidth: Ref<number>
  measureBars: (el: unknown) => void
}

export interface FlipGate {
  transitionDuration?: number
  rankSwapAnimation?: boolean
}

/**
 * Whether rank-swap arcs may play. Off by profile toggle, snap durations,
 * or OS reduced-motion. `rankSwapAnimation !== false` keeps saved profiles
 * from before the toggle animated.
 */
export function meterFlipEnabled(global: FlipGate): boolean {
  if (global.rankSwapAnimation === false) return false
  if ((global.transitionDuration ?? 0) <= 0) return false
  return !prefersReducedMotion()
}

export function useMeterList(options: MeterListOptions): MeterList {
  // resolveBarStyle JSON-clones per call; at 60fps interpolated frames that
  // defeats every downstream computed cache. Memoize by (job, name, rank1,
  // self) and bust on profile edits (mutated in place by config broadcast).
  const styleCache = createBarStyleCache()
  watch(() => options.profile(), () => {
    styleCache.clear()
    clearFillCssCache()
  }, { deep: true })

  const bars = computed<ResolvedListBar[]>(() => {
    const frame = options.frame()
    if (!frame) return []
    const profile = options.profile()
    const selfName = options.selfName()
    return frame.bars.map((b, i): ResolvedListBar => ({
      ...b,
      rank: i + 1,
      barIndex: i,
      style: styleCache.resolve(b.job, b.name, i + 1, profile, selfName),
      isSelf: b.name === selfName || b.name === 'YOU',
      isRank1: i === 0,
    }))
  })

  // FLIP rank-swap animation: when interpolated re-sorts move rows, glide
  // them past each other instead of teleporting. Disabled by profile toggle,
  // snap (0ms) durations, and OS reduced-motion.
  const flip = useFlipRows(() => bars.value.map(b => b.name).join('|'), {
    enabled: () => meterFlipEnabled(options.profile().global),
  })

  // One width measurement per list (exact row width via contentRect) instead
  // of one ResizeObserver per bar.
  const { listWidth, measureRef: measureBars } = useListWidth()

  return { bars, flip, listWidth, measureBars }
}
