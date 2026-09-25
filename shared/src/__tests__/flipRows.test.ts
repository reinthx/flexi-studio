/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { flipArcTransforms, flipDeltas, FLIP_ARC_BULGE_PX, useFlipRows } from '../flipRows'

describe('flipDeltas', () => {
  it('returns null when the row did not move', () => {
    expect(flipDeltas({ left: 10, top: 20 }, { left: 10, top: 20 })).toBeNull()
  })

  it('inverts vertical rank swaps', () => {
    // Row moved down 40px: invert with translate(0, -40px).
    expect(flipDeltas({ left: 0, top: 100 }, { left: 0, top: 140 })).toEqual({ dx: 0, dy: -40 })
    // Row moved up: positive dy.
    expect(flipDeltas({ left: 0, top: 140 }, { left: 0, top: 100 })).toEqual({ dx: 0, dy: 40 })
  })

  it('covers horizontal orientation with dx', () => {
    expect(flipDeltas({ left: 100, top: 0 }, { left: 160, top: 0 })).toEqual({ dx: -60, dy: 0 })
  })
})

describe('flipArcTransforms', () => {
  it('starts inverted and lands on identity', () => {
    const arc = flipArcTransforms({ dx: 0, dy: -48 })
    expect(arc.start).toBe('translate(0px, -48px) scale(1)')
    expect(arc.end).toBe('translate(0px, 0px) scale(1)')
  })

  it('swings sideways at the midpoint for vertical travel', () => {
    const arc = flipArcTransforms({ dx: 0, dy: -48 })
    // 35% along travel (-16.8) plus the default leftward swing.
    expect(arc.mid).toContain(`translate(${(-FLIP_ARC_BULGE_PX).toFixed(2)}px, -16.80px)`)
    expect(arc.mid).toContain('scale(0.97)')
  })

  it('swings upward at the midpoint for horizontal travel', () => {
    const arc = flipArcTransforms({ dx: 60, dy: 0 })
    expect(arc.mid).toContain(`translate(21.00px, ${(-FLIP_ARC_BULGE_PX).toFixed(2)}px)`)
  })

  it('glides straight when the bulge is zero', () => {
    const arc = flipArcTransforms({ dx: 0, dy: -48 }, 0)
    expect(arc.mid).toContain('translate(0.00px, -16.80px)')
  })
})

describe('useFlipRows swap cap', () => {
  let animate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Rows report positions by sibling order so reorders produce real deltas.
    vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const siblings = this.parentNode ? Array.from(this.parentNode.children) : []
        const index = siblings.indexOf(this)
        return {
          left: 0, top: index * 40, width: 300, height: 36,
          right: 300, bottom: index * 40 + 36, x: 0, y: index * 40,
          toJSON: () => ({}),
        } as DOMRect
      },
    )
    animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }))
    // jsdom has no Element.animate — install the stub directly.
    Object.defineProperty(window.HTMLElement.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: animate,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error jsdom stub cleanup
    delete window.HTMLElement.prototype.animate
    document.body.innerHTML = ''
  })

  function mountRows(names: Ref<string[]>, maxSwaps: number) {
    return mount(
      defineComponent({
        setup() {
          const flip = useFlipRows(() => names.value.join('|'), { maxSwaps })
          return () =>
            h('div', names.value.map(n => h('div', { key: n, ref: (el: unknown) => flip.setRowEl(n, el) }, n)))
        },
      }),
      { attachTo: document.body },
    )
  }

  it('animates raid-scale passes and teleports larger reshuffles', async () => {
    const names = ref(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])
    const wrapper = mountRows(names, 8)
    await nextTick()
    expect(animate).not.toHaveBeenCalled()

    // One crossing: two rows move → two arcs.
    names.value = ['a', 'c', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    await nextTick()
    expect(animate).toHaveBeenCalledTimes(2)

    // Full reversal: ten rows move past the cap of eight → no arcs.
    animate.mockClear()
    names.value = ['j', 'i', 'h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']
    await nextTick()
    expect(animate).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
