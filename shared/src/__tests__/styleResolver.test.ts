import { describe, it, expect } from 'vitest'
import { deepClone, deepMerge, resolveBarStyle } from '../styleResolver'
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
