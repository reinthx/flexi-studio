/**
 * reducedMotion.ts
 *
 * Central `prefers-reduced-motion` check for animation gates (FLIP rank
 * swaps, bar interpolation). Cached with a change listener so per-frame
 * call sites stay cheap; safe to call in node/test environments.
 */

/** OS-level reduced-motion preference. False outside browsers. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  if (cached === null) {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    cached = query.matches
    query.addEventListener?.('change', (event) => {
      cached = event.matches
    })
  }
  return cached
}

let cached: boolean | null = null

/** Reset the cache (unit tests, or after stubbing matchMedia). */
export function resetReducedMotionCache(): void {
  cached = null
}
