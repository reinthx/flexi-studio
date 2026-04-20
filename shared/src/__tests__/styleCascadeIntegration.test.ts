import { describe, it, expect } from 'vitest'
import { resolveBarStyle } from '../styleResolver'
import { createMockProfile, createMockStyleOverrides, createMockRoleOverrides, createMockJobOverrides } from './helpers'

describe('Style Cascade Integration - Priority Order', () => {
  it('rank 1 has highest priority and applies fill color', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        self: { fill: { type: 'solid', color: '#00FF00' } },
        selfEnabled: true,
      }),
      global: {
        ...createMockProfile().global,
        rankIndicator: {
          rank1Enabled: true,
          rank1Style: { fill: { type: 'solid', color: '#FFD700' } },
          showNumbers: true,
          rank1HeightIncrease: 4,
          rank1ShowCrown: false,
          rank1Crown: { enabled: false, icon: '', imageUrl: '', size: 0, offsetX: 0, offsetY: 0, rotation: 0, hAnchor: 'left', vAnchor: 'top' },
          rank1Glow: { enabled: false, color: '', blur: 0 },
        },
      } as any,
    })

    const style = resolveBarStyle('PLD', 'Player', 1, profile, '')

    expect((style as any).rank1HeightIncrease).toBe(4)
  })

  it('self override applies to self player', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        self: { fill: { type: 'solid', color: '#FFD700' } },
        selfEnabled: true,
      }),
    })

    const style = resolveBarStyle('PLD', 'Player', 5, profile, 'Player')

    expect(style.fill).toBeDefined()
  })

  it('self does not apply to other players', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        self: { fill: { type: 'solid', color: '#FFD700' } },
        selfEnabled: true,
      }),
    })

    const style = resolveBarStyle('PLD', 'OtherPlayer', 5, profile, 'Player')

    expect(style.fill).toBeDefined()
  })

  it('job override applies to specific job', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        byJob: createMockJobOverrides() as any,
        byJobEnabled: { PLD: true, WAR: true, BLM: true } as any,
      }),
    })

    const style = resolveBarStyle('PLD', 'Player', 3, profile, '')

    expect(style.fill).toBeDefined()
  })

  it('role override applies to role group', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        byRole: createMockRoleOverrides() as any,
        byRoleEnabled: { tank: true, healer: true, melee: true, ranged: true, caster: true } as any,
      }),
    })

    const style = resolveBarStyle('PLD', 'Player', 3, profile, '')

    expect(style.fill).toBeDefined()
  })

  it('uses default when no overrides match', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides(),
    })

    const style = resolveBarStyle('XYZ', 'Player', 5, profile, '')

    expect(style.fill).toBeDefined()
    expect(style.height).toBe(28)
  })

  it('job overrides take priority over role overrides', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        byRole: { tank: { fill: { type: 'solid', color: '#0000FF' } } } as any,
        byRoleEnabled: { tank: true, healer: true, melee: true, ranged: true, caster: true } as any,
        byJob: { PLD: { fill: { type: 'solid', color: '#FF0000' } } } as any,
        byJobEnabled: { PLD: true } as any,
      }),
    })

    const style = resolveBarStyle('PLD', 'Player', 3, profile, '')

    expect(style.fill).toBeDefined()
  })

  it('self overrides take priority over job overrides', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        byJob: { PLD: { fill: { type: 'solid', color: '#0000FF' } } } as any,
        byJobEnabled: { PLD: true } as any,
        self: { fill: { type: 'solid', color: '#00FF00' } },
        selfEnabled: true,
      }),
    })

    const style = resolveBarStyle('PLD', 'Player', 3, profile, 'Player')

    expect(style.fill).toBeDefined()
  })

  it('YOU marker triggers self override', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        self: { fill: { type: 'solid', color: '#FFD700' } },
        selfEnabled: true,
      }),
    })

    const style = resolveBarStyle('PLD', 'YOU', 5, profile, 'Player')

    expect(style.fill).toBeDefined()
  })

  it('disabled role override does not apply', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        byRole: createMockRoleOverrides() as any,
        byRoleEnabled: { tank: false, healer: true, melee: true, ranged: true, caster: true } as any,
      }),
    })

    const style = resolveBarStyle('PLD', 'Player', 5, profile, '')

    expect(style.fill).toBeDefined()
  })

  it('disabled job override does not apply', () => {
    const profile = createMockProfile({
      overrides: createMockStyleOverrides({
        byJob: createMockJobOverrides() as any,
        byJobEnabled: { PLD: false } as any,
      }),
    })

    const style = resolveBarStyle('PLD', 'Player', 5, profile, '')

    expect(style.fill).toBeDefined()
  })
})