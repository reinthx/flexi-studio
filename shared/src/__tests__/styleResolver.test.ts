import { describe, it, expect } from 'vitest'
import { createBarStyleCache, deepClone, deepMerge, resolveBarStyle } from '../styleResolver'
import { createMockProfile, createMockStyleOverrides } from './helpers'

describe('deepClone', () => {
  it('clones primitive', () => {
    expect(deepClone(42)).toBe(42)
    expect(deepClone('text')).toBe('text')
  })

  it('clones array', () => {
    const arr = [1, 2, 3]
    const cloned = deepClone(arr)
    expect(cloned).toEqual(arr)
    expect(cloned).not.toBe(arr)
  })

  it('deep clones nested object', () => {
    const obj = { a: { b: { c: 1 } } }
    const cloned = deepClone(obj)
    expect(cloned).toEqual(obj)
    expect(cloned).not.toBe(obj)
    expect(cloned.a).not.toBe(obj.a)
  })

  it('handles null', () => {
    expect(deepClone(null)).toBeNull()
  })
})

describe('deepMerge', () => {
  it('merges nested objects', () => {
    const target = { a: { b: 1, c: 2 } }
    const source = { a: { b: 3 } }
    const result = deepMerge(target as any, source)
    expect(result.a.b).toBe(3)
    expect(result.a.c).toBe(2)
  })

  it('replaces arrays', () => {
    const target = { a: [1, 2] }
    const source = { a: [3] }
    const result = deepMerge(target as any, source)
    expect(result.a).toEqual([3])
  })

  it('ignores undefined values', () => {
    const target = { a: 1 }
    const result = deepMerge(target as any, { a: undefined })
    expect(result.a).toBe(1)
  })

  it('adds new keys', () => {
    const target = { a: 1 }
    const result = deepMerge(target as any, { b: 2 })
    expect(result.b).toBe(2)
  })
})

describe('resolveBarStyle', () => {
  it('returns base style when no overrides', () => {
    const profile = createMockProfile()
    const style = resolveBarStyle('PLD', 'Player', 0, profile, '')
    expect(style.fill).toBeDefined()
    expect(style.height).toBe(28)
  })

  it('applies role tints when enabled', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        byRole: {
          tank: { fill: { type: 'solid', color: '#4a90d9' } },
          healer: { fill: { type: 'solid', color: '#52b788' } },
          melee: { fill: { type: 'solid', color: '#e63946' } },
          ranged: { fill: { type: 'solid', color: '#f4a261' } },
          caster: { fill: { type: 'solid', color: '#9b5de5' } },
        },
        byRoleEnabled: {
          tank: true, healer: true, melee: true, ranged: true, caster: true
        },
      }),
    })
    const style = resolveBarStyle('PLD', 'Player', 0, profile, '')
    expect(style.fill).toBeDefined()
  })

  it('applies self style when selfEnabled and name matches', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        self: { fill: { type: 'solid', color: '#FFD700' } },
        selfEnabled: true,
      }),
    })
    const style = resolveBarStyle('PLD', 'Player', 0, profile, 'Player')
    expect(style.fill).toBeDefined()
  })

  it('applies self style for YOU marker', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        self: { fill: { type: 'solid', color: '#FFD700' } },
        selfEnabled: true,
      }),
    })
    const style = resolveBarStyle('PLD', 'YOU', 0, profile, 'Player')
    expect(style.fill).toBeDefined()
  })

  it('applies job tints to gradient fills with the override gradient end', () => {
    const profile = createMockProfile({
      default: {
        ...createMockProfile().default,
        fill: {
          type: 'gradient',
          gradient: {
            type: 'linear',
            angle: 90,
            stops: [
              { position: 0, color: '#aaaaaa' },
              { position: 1, color: '#bbbbbb' },
            ],
          },
          applyJobColor: true,
        },
      },
      overrides: createMockStyleOverrides({
        byJob: { PLD: { fill: { type: 'solid', color: '#A6D100' }, gradientColor: '#222222' } },
        byJobEnabled: { PLD: true },
      }),
    })

    const style = resolveBarStyle('PLD', 'Player', 0, profile, '')
    expect(style.fill.type).toBe('gradient')
    if (style.fill.type !== 'gradient') return
    expect(style.fill.gradient.stops).toEqual([
      { position: 0, color: '#A6D100' },
      { position: 1, color: '#222222' },
    ])
  })

  it('applies role tints to solid fills and skips disabled roles', () => {
    const tinted = createMockProfile({
      default: {
        ...createMockProfile().default,
        fill: { type: 'solid', color: '#ffffff', applyRoleColor: true },
      },
      overrides: createMockStyleOverrides({
        byRole: { tank: { fill: { type: 'solid', color: '#4a90d9' }, gradientColor: '#111111' } },
        byRoleEnabled: { tank: true },
      }),
    })
    const style = resolveBarStyle('PLD', 'Player', 0, tinted, '')
    expect(style.fill).toMatchObject({ type: 'solid', color: '#4a90d9' })

    const disabled = createMockProfile({
      default: {
        ...createMockProfile().default,
        fill: { type: 'solid', color: '#ffffff', applyRoleColor: true },
      },
      overrides: createMockStyleOverrides({
        byRole: { tank: { fill: { type: 'solid', color: '#4a90d9' } } },
        byRoleEnabled: { tank: false },
      }),
    })
    expect(resolveBarStyle('PLD', 'Player', 0, disabled, '').fill).toMatchObject({
      type: 'solid',
      color: '#ffffff',
    })
  })

  it('applies job tints to textures as tintColor or tintGradient stops', () => {
    const textureBase = {
      type: 'texture' as const,
      texture: {
        src: 'texture.png',
        repeat: 'paginate' as const,
        opacity: 1,
        blendMode: 'normal' as string,
        pagination: { enabled: true, startOffsetX: 0, startOffsetY: 0 },
      },
      applyJobColor: true,
    }
    const overrides = () =>
      createMockStyleOverrides({
        byJob: { PLD: { fill: { type: 'solid', color: '#A6D100' }, gradientColor: '#333333' } },
        byJobEnabled: { PLD: true },
      })

    const plain = createMockProfile({
      default: { ...createMockProfile().default, fill: textureBase },
      overrides: overrides(),
    })
    const plainStyle = resolveBarStyle('PLD', 'Player', 0, plain, '')
    expect(plainStyle.fill.type).toBe('texture')
    if (plainStyle.fill.type !== 'texture') return
    expect(plainStyle.fill.texture.tintColor).toBe('#A6D100')

    const gradientTinted = createMockProfile({
      default: {
        ...createMockProfile().default,
        fill: {
          ...textureBase,
          texture: {
            ...textureBase.texture,
            tintGradient: {
              type: 'linear',
              angle: 0,
              stops: [
                { position: 0, color: '#000000' },
                { position: 1, color: '#ffffff' },
              ],
            },
          },
        },
      },
      overrides: overrides(),
    })
    const gradientStyle = resolveBarStyle('PLD', 'Player', 0, gradientTinted, '')
    expect(gradientStyle.fill.type).toBe('texture')
    if (gradientStyle.fill.type !== 'texture') return
    expect(gradientStyle.fill.texture.tintGradient?.stops).toEqual([
      { position: 0, color: '#A6D100' },
      { position: 1, color: '#333333' },
    ])
  })

  it('applies rank 1 gradient fill as texture tintGradient', () => {
    const gradient = {
      type: 'linear' as const,
      angle: 45,
      stops: [
        { position: 0, color: '#ff0000' },
        { position: 1, color: '#00ff00' },
      ],
    }
    const profile = createMockProfile({
      default: {
        ...createMockProfile().default,
        fill: {
          type: 'texture',
          texture: {
            src: 'texture.png',
            repeat: 'paginate',
            opacity: 1,
            blendMode: 'normal',
            pagination: { enabled: true, startOffsetX: 0, startOffsetY: 0 },
          },
        },
      },
      global: {
        ...createMockProfile().global,
        rankIndicator: {
          ...createMockProfile().global.rankIndicator,
          rank1Enabled: true,
          rank1StyleEnabled: true,
          rank1Style: { fill: { type: 'gradient', gradient } },
        },
      },
    })

    const style = resolveBarStyle('PLD', 'Player', 1, profile, 'Player')

    expect(style.fill.type).toBe('texture')
    if (style.fill.type !== 'texture') return
    expect(style.fill.texture.src).toBe('texture.png')
    expect(style.fill.texture.tintColor).toBeUndefined()
    expect(style.fill.texture.tintGradient).toEqual(gradient)
  })

  it('scales rank 1 height and skips rank styling off the top bar', () => {
    const ranked = createMockProfile({
      global: {
        ...createMockProfile().global,
        rankIndicator: {
          ...createMockProfile().global.rankIndicator,
          rank1Enabled: true,
          rank1StyleEnabled: true,
          rank1Style: {},
          rank1HeightIncrease: 10,
        },
      },
    })
    const baseHeight = createMockProfile().default.height
    expect(resolveBarStyle('PLD', 'Player', 1, ranked, '').height).toBeCloseTo(baseHeight * 1.1, 5)
    expect(resolveBarStyle('PLD', 'Player', 2, ranked, '').height).toBe(baseHeight)
  })

  it('applies rank 1 solid fill as texture tint without replacing the texture fill', () => {
    const profile = createMockProfile({
      default: {
        ...createMockProfile().default,
        fill: {
          type: 'texture',
          texture: {
            src: 'texture.png',
            repeat: 'paginate',
            opacity: 1,
            blendMode: 'normal',
            pagination: { enabled: true, startOffsetX: 0, startOffsetY: 0 },
          },
        },
      },
      global: {
        ...createMockProfile().global,
        rankIndicator: {
          ...createMockProfile().global.rankIndicator,
          rank1Enabled: true,
          rank1StyleEnabled: true,
          rank1Style: { fill: { type: 'solid', color: '#ff0000' } },
        },
      },
    })

    const style = resolveBarStyle('PLD', 'Player', 1, profile, 'Player')

    expect(style.fill.type).toBe('texture')
    if (style.fill.type !== 'texture') return
    expect(style.fill.texture.src).toBe('texture.png')
    expect(style.fill.texture.tintColor).toBe('#ff0000')
    expect(style.fill.texture.tintGradient).toBeUndefined()
  })
})

describe('createBarStyleCache', () => {
  it('returns stable identities for repeated frames', () => {
    const profile = createMockProfile()
    const cache = createBarStyleCache()
    const first = cache.resolve('PLD', 'Alice', 2, profile, '')
    const second = cache.resolve('PLD', 'Alice', 2, profile, '')
    expect(second).toBe(first)
    expect(second).toEqual(resolveBarStyle('PLD', 'Alice', 2, profile, ''))
  })

  it('keys rank-1, job, name, and self separately', () => {
    const profile = createMockProfile()
    const cache = createBarStyleCache()
    const rank1 = cache.resolve('PLD', 'Alice', 1, profile, '')
    const rank2 = cache.resolve('PLD', 'Alice', 2, profile, '')
    expect(rank2).not.toBe(rank1)
    // Non-1 ranks share one entry regardless of exact rank
    expect(cache.resolve('PLD', 'Alice', 5, profile, '')).toBe(rank2)
    expect(cache.resolve('WAR', 'Alice', 2, profile, '')).not.toBe(rank2)
    expect(cache.resolve('PLD', 'Bob', 2, profile, '')).not.toBe(rank2)
  })

  it('busts on profile replacement and on clear() for in-place edits', () => {
    const cache = createBarStyleCache()
    const before = createMockProfile()
    const first = cache.resolve('PLD', 'Alice', 2, before, '')
    // Wholesale replacement (load/preset/apply) is detected by identity
    const replaced = createMockProfile()
    expect(cache.resolve('PLD', 'Alice', 2, replaced, '')).not.toBe(first)
    // In-place mutation needs an explicit clear (call sites deep-watch)
    const same = cache.resolve('PLD', 'Alice', 2, replaced, '')
    replaced.default.height = 99
    expect(cache.resolve('PLD', 'Alice', 2, replaced, '')).toBe(same)
    cache.clear()
    const afterClear = cache.resolve('PLD', 'Alice', 2, replaced, '')
    expect(afterClear).not.toBe(same)
    expect(afterClear.height).toBe(99)
  })
})
