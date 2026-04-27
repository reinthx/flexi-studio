import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createLocalStorageMock(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    clear: vi.fn(() => {
      store.clear()
    }),
  }
}

async function loadAbilityIcons() {
  vi.resetModules()
  return import('../abilityIcons')
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('abilityInitials', () => {
  it('returns ? for empty input', async () => {
    const { abilityInitials } = await loadAbilityIcons()

    expect(abilityInitials('')).toBe('?')
    expect(abilityInitials(null)).toBe('?')
    expect(abilityInitials(undefined)).toBe('?')
  })

  it('returns first two letters for single word', async () => {
    const { abilityInitials } = await loadAbilityIcons()

    expect(abilityInitials('Fire')).toBe('FI')
    expect(abilityInitials('Blizzard')).toBe('BL')
  })

  it('returns initials for two words', async () => {
    const { abilityInitials } = await loadAbilityIcons()

    expect(abilityInitials('Fire II')).toBe('FI')
    expect(abilityInitials('Cure III')).toBe('CU')
    expect(abilityInitials('Blood Weapon')).toBe('BW')
  })

  it('handles three+ words', async () => {
    const { abilityInitials } = await loadAbilityIcons()

    expect(abilityInitials('One Two Three')).toBe('OT')
    expect(abilityInitials('Final Fantasy')).toBe('FF')
  })

  it('strips special characters', async () => {
    const { abilityInitials } = await loadAbilityIcons()

    expect(abilityInitials('Fire.')).toBe('FI')
    expect(abilityInitials("Fire's")).toBe('FI')
    expect(abilityInitials('Fire!')).toBe('FI')
  })

  it('handles hyphens', async () => {
    const { abilityInitials } = await loadAbilityIcons()

    expect(abilityInitials('Fire -')).toBe('F-')
  })

  it('handles leading/trailing spaces', async () => {
    const { abilityInitials } = await loadAbilityIcons()

    expect(abilityInitials('  Fire  ')).toBe('FI')
  })

  it('converts to uppercase', async () => {
    const { abilityInitials } = await loadAbilityIcons()

    expect(abilityInitials('fire')).toBe('FI')
    expect(abilityInitials('FIRE')).toBe('FI')
  })

  it('handles Japanese abilities', async () => {
    const { abilityInitials } = await loadAbilityIcons()

    expect(abilityInitials('かえん')).toBe('かえ')
    expect(abilityInitials('かれい')).toBe('かれ')
  })
})

describe('resolveAbilityInfo', () => {
  it('loads icon and recast data from XIVAPI for valid action IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        fields: {
          'Icon@as(raw)': 25869,
          Recast100ms: 25,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { resolveAbilityInfo } = await loadAbilityIcons()

    const info = await resolveAbilityInfo('64')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toContain('/api/sheet/Action/100?')
    expect(info.iconSrc).toContain('v2.xivapi.com')
    expect(info.iconSrc).toContain('025869_hr1.tex')
    expect(info.recastMs).toBe(2500)
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'flexi-studio-ability-info-cache-v1',
      expect.stringContaining('"64"'),
    )
  })

  it('returns empty info when XIVAPI fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const { resolveAbilityInfo } = await loadAbilityIcons()

    await expect(resolveAbilityInfo('64')).resolves.toEqual({ iconSrc: '' })
  })

  it('does not fetch invalid or dot ability IDs', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { resolveAbilityInfo } = await loadAbilityIcons()

    await expect(resolveAbilityInfo('not-an-id')).resolves.toEqual({ iconSrc: '' })
    await expect(resolveAbilityInfo('dot:64')).resolves.toEqual({ iconSrc: '' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fetch when network icons are disabled', async () => {
    vi.stubGlobal('localStorage', createLocalStorageMock({
      'flexi-studio-disable-xivapi-icons': 'true',
    }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { resolveAbilityInfo } = await loadAbilityIcons()

    await expect(resolveAbilityInfo('64')).resolves.toEqual({ iconSrc: '' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('resolveAbilityIconSrc', () => {
  it('returns only the resolved icon source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        fields: {
          'Icon@as(raw)': '42',
          Recast100ms: '0',
        },
      }),
    }))
    const { resolveAbilityIconSrc } = await loadAbilityIcons()

    const src = await resolveAbilityIconSrc('64')

    expect(src).toContain('000042_hr1.tex')
  })
})
