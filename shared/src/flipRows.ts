/**
 * flipRows.ts
 *
 * FLIP (First, Last, Invert, Play) animation for meter rank swaps.
 *
 * The transition engine re-sorts bars by interpolated fill every rAF frame,
 * so when two combatants cross, their rows teleport while widths glide.
 * This composable watches the rendered row order: when it changes, each
 * moved row is inverted back to its old position and then played home along
 * an arc — swinging out sideways mid-pass (like pulling into the next lane
 * to overtake) with a slight lift, so the passer visibly leapfrogs *over*
 * its neighbor instead of sliding diagonally through it.
 *
 * Playback uses the Web Animations API, which supports multi-keyframe paths
 * (a CSS transition can only interpolate a straight line). Cost control:
 * order is compared as a cheap joined-name string on every update, and
 * getBoundingClientRect is only measured when the order actually changed
 * (rank swaps are rare; steady-state frames skip measuring).
 */
import { onBeforeUpdate, onUpdated } from 'vue'

export interface FlipPoint {
  left: number
  top: number
}

export interface FlipDelta {
  dx: number
  dy: number
}

/** Invert step: displacement of a row from its old rect to its new rect. Null when unmoved. */
export function flipDeltas(oldRect: FlipPoint, newRect: FlipPoint): FlipDelta | null {
  const dx = oldRect.left - newRect.left
  const dy = oldRect.top - newRect.top
  return dx === 0 && dy === 0 ? null : { dx, dy }
}

/** Lateral swing (px) at the arc midpoint, perpendicular to travel. */
export const FLIP_ARC_BULGE_PX = 10
/** Row scale at the arc midpoint — the "lift" off the table. */
export const FLIP_ARC_LIFT_SCALE = 0.97
/** Rows animating past this count in one update teleport instead — a full
 *  raid-plus reshuffle of arcs is visual noise, while party-scale passes
 *  stay smooth. Eight covers a full raid; anything larger is hectic until
 *  numbers normalize anyway. */
export const FLIP_MAX_SWAPS = 8
/** Paint order boost while a row is mid-pass so it travels over neighbors. */
const FLIP_ARC_Z_INDEX = '5'

export interface FlipArc {
  /** transform at flight start (fully inverted to the old position). */
  start: string
  /** transform at the arc midpoint (mostly traveled, swung out, lifted). */
  mid: string
  /** transform at flight end (identity). */
  end: string
}

/**
 * Build the up-and-over arc for a FLIP displacement. The midpoint sits past
 * halfway along travel with a perpendicular swing and a slight shrink, so
 * the row rises out of line, passes over, and slots in.
 */
export function flipArcTransforms(delta: FlipDelta, bulgePx = FLIP_ARC_BULGE_PX): FlipArc {
  const { dx, dy } = delta
  const vertical = Math.abs(dy) >= Math.abs(dx)
  // Swing perpendicular to travel: sideways for vertical lists, upward for
  // horizontal ones. Fixed side per orientation keeps passes consistent.
  const bx = vertical ? -bulgePx : 0
  const by = vertical ? 0 : -bulgePx
  return {
    start: `translate(${dx}px, ${dy}px) scale(1)`,
    mid: `translate(${(dx * 0.35 + bx).toFixed(2)}px, ${(dy * 0.35 + by).toFixed(2)}px) scale(${FLIP_ARC_LIFT_SCALE})`,
    end: 'translate(0px, 0px) scale(1)',
  }
}

export interface FlipRowsOptions {
  /** Glide duration per swap in ms. Defaults to 300. */
  durationMs?: number
  /** Lateral swing (px) at the arc midpoint. Defaults to 10; 0 = straight glide. */
  bulgePx?: number
  /** Max rows animated per update; more than this teleports. Defaults to 8. */
  maxSwaps?: number
  /** Gate for snap modes (e.g. transitionDuration 0) and reduced motion. */
  enabled?: () => boolean
}

export interface FlipRows {
  /** Template-ref sink: `:ref="(el) => flip.setRowEl(bar.name, el)"`. */
  setRowEl(name: string, target: unknown): void
}

function resolveRowEl(target: unknown): HTMLElement | null {
  if (target instanceof HTMLElement) return target
  if (target !== null && typeof target === 'object' && '$el' in target) {
    const el = (target as { $el: unknown }).$el
    return el instanceof HTMLElement ? el : null
  }
  return null
}

/**
 * Track row elements by key and animate rank swaps.
 * @param orderKey reactive getter returning the current row order signature
 *   (e.g. `() => bars.value.map(b => b.name).join('|')`).
 */
export function useFlipRows(orderKey: () => string, options: FlipRowsOptions = {}): FlipRows {
  const duration = options.durationMs ?? 300
  const bulgePx = options.bulgePx ?? FLIP_ARC_BULGE_PX
  const maxSwaps = options.maxSwaps ?? FLIP_MAX_SWAPS
  const els = new Map<string, HTMLElement>()
  const activeFlights = new WeakMap<HTMLElement, Animation>()
  let lastRenderedOrder = ''
  let pendingOldRects: Map<string, FlipPoint> | null = null

  function setRowEl(name: string, target: unknown): void {
    const el = resolveRowEl(target)
    if (el) els.set(name, el)
    else els.delete(name)
  }

  function playFlight(el: HTMLElement, delta: FlipDelta): void {
    // A new swap supersedes any in-flight animation on this row.
    activeFlights.get(el)?.cancel()
    const arc = flipArcTransforms(delta, bulgePx)
    const prevZIndex = el.style.zIndex
    el.style.zIndex = FLIP_ARC_Z_INDEX
    const flight = el.animate(
      [
        { transform: arc.start, offset: 0 },
        { transform: arc.mid, offset: 0.55 },
        { transform: arc.end, offset: 1 },
      ],
      { duration, easing: 'ease-in-out' },
    )
    activeFlights.set(el, flight)
    flight.finished
      .then(() => {
        if (activeFlights.get(el) !== flight) return
        activeFlights.delete(el)
        if (el.style.zIndex === FLIP_ARC_Z_INDEX) el.style.zIndex = prevZIndex
      })
      .catch(() => {
        // Superseded by a newer flight; its cleanup owns the element now.
      })
  }

  onBeforeUpdate(() => {
    if (options.enabled && !options.enabled()) {
      pendingOldRects = null
      return
    }
    if (orderKey() === lastRenderedOrder) {
      pendingOldRects = null
      return
    }
    const rects = new Map<string, FlipPoint>()
    for (const [name, el] of els) {
      if (!el.isConnected) continue
      const r = el.getBoundingClientRect()
      rects.set(name, { left: r.left, top: r.top })
    }
    pendingOldRects = rects
  })

  onUpdated(() => {
    const oldRects = pendingOldRects
    pendingOldRects = null
    lastRenderedOrder = orderKey()
    if (!oldRects || (options.enabled && !options.enabled())) return
    // Collect first: a mass reshuffle (wipes, alliance kills) teleports
    // instead of firing an arc per row.
    const flights: Array<{ el: HTMLElement; delta: FlipDelta }> = []
    for (const [name, el] of els) {
      const old = oldRects.get(name)
      if (!old || !el.isConnected) continue
      const now = el.getBoundingClientRect()
      const delta = flipDeltas(old, now)
      if (!delta) continue
      if (typeof el.animate !== 'function') continue
      flights.push({ el, delta })
    }
    if (flights.length > maxSwaps) return
    for (const { el, delta } of flights) playFlight(el, delta)
  })

  return { setRowEl }
}
