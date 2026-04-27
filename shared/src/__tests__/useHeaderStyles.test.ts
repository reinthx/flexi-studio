import { describe, expect, it } from 'vitest'
import type { GlobalConfig, HeaderConfig } from '../configSchema'
import { useHeaderStyles } from '../useHeaderStyles'

function header(overrides: Partial<HeaderConfig> = {}): HeaderConfig {
  return {
    show: true,
    size: 14,
    font: 'Inter',
    color: '#ffffff',
    background: { type: 'solid', color: '#111111' },
    borderRadius: 6,
    pinned: false,
    ...overrides,
  }
}

function global(overrides: Partial<GlobalConfig> = {}): GlobalConfig {
  return {
    opacity: 1,
    scale: 1,
    maxCombatants: 8,
    sortBy: 'encdps',
    dpsType: 'encdps',
    valueFormat: 'raw',
    orientation: 'vertical',
    transitionDuration: 250,
    outOfCombat: 'show',
    outOfCombatOpacity: 0.35,
    blurNames: false,
    selfOnly: false,
    partyOnly: false,
    mergePets: true,
    pets: { show: true, mergeWithOwner: true, ownerFormat: '{owner} pets' },
    header: header(),
    combatantFilter: 'all',
    windowBorder: { enabled: false, color: '#ffffff', width: 1, radius: 0 },
    ...overrides,
  }
}

describe('useHeaderStyles', () => {
  it('builds the vertical header style from header config and fill CSS', () => {
    const { style } = useHeaderStyles(
      () => header({ size: 16, background: { type: 'solid', color: '#222222' } }),
      () => global(),
    )

    expect(style.value).toMatchObject({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 6px',
      height: '32px',
      fontFamily: 'Inter',
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#222222',
      borderRadius: '6px 6px 0 0',
      userSelect: 'none',
    })
  })

  it('uses horizontal sizing when the global orientation is horizontal', () => {
    const { style } = useHeaderStyles(
      () => header({ size: 12 }),
      () => global({ orientation: 'horizontal' }),
    )

    expect(style.value.padding).toBe('0 4px')
    expect(style.value.height).toBe('22px')
  })

  it('caps header radius to the window border radius', () => {
    const { style } = useHeaderStyles(
      () => header({ borderRadius: 12 }),
      () => global({ windowBorder: { enabled: true, color: '#fff', width: 1, radius: 4 } }),
    )

    expect(style.value.borderRadius).toBe('4px 4px 0 0')
  })

  it('uses bottom corner radius for footer headers', () => {
    const { style } = useHeaderStyles(
      () => header({ borderRadius: 5 }),
      () => global(),
      () => true,
    )

    expect(style.value.borderRadius).toBe('0 0 5px 5px')
  })
})
