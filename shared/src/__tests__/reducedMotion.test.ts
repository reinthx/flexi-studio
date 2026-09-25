import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, resetReducedMotionCache } from '../reducedMotion'

afterEach(() => {
  vi.unstubAllGlobals()
  resetReducedMotionCache()
})

describe('prefersReducedMotion', () => {
  it('is false outside browsers', () => {
    expect(prefersReducedMotion()).toBe(false)
  })

  it('reflects the media query and caches the result', () => {
    const matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn() }))
    vi.stubGlobal('window', { matchMedia })
    expect(prefersReducedMotion()).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    // Second call reuses the cache without re-querying.
    expect(prefersReducedMotion()).toBe(true)
    expect(matchMedia).toHaveBeenCalledTimes(1)
  })

  it('follows change events without re-querying', () => {
    const listeners = new Map<string, (event: { matches: boolean }) => void>()
    vi.stubGlobal('window', {
      matchMedia: () => ({
        matches: true,
        addEventListener: (type: string, cb: (event: { matches: boolean }) => void) => {
          listeners.set(type, cb)
        },
      }),
    })
    expect(prefersReducedMotion()).toBe(true)
    listeners.get('change')!({ matches: false })
    expect(prefersReducedMotion()).toBe(false)
  })

  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('window', {})
    expect(prefersReducedMotion()).toBe(false)
  })
})
