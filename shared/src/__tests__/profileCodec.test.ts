import { describe, it, expect } from 'vitest'
import { encodeShareString, decodeShareString, isShareString } from '../profileCodec'
import { DEFAULT_PROFILE } from '../presets'

describe('profileCodec round-trip', () => {
  it('DEFAULT_PROFILE encode → decode preserves core fields', async () => {
    const encoded = await encodeShareString([{ name: 'default', profile: DEFAULT_PROFILE }])
    expect(isShareString(encoded)).toBe(true)
    expect(encoded.startsWith('FLEXI1:')).toBe(true)

    const decoded = await decodeShareString(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded!).toHaveLength(1)

    const p = decoded![0].profile
    expect(p.global?.dpsType).toBe(DEFAULT_PROFILE.global.dpsType)
    expect(p.global?.maxCombatants).toBe(DEFAULT_PROFILE.global.maxCombatants)
    expect(p.default?.fill?.type).toBe(DEFAULT_PROFILE.default.fill.type)
  })

  it('modified profile survives round-trip', async () => {
    const modified = {
      ...DEFAULT_PROFILE,
      global: { ...DEFAULT_PROFILE.global, maxCombatants: 13, opacity: 0.42, orientation: 'horizontal' as const },
    }
    const encoded = await encodeShareString([{ name: 'test', profile: modified }])
    const decoded = await decodeShareString(encoded)
    expect(decoded![0].profile.global.maxCombatants).toBe(13)
    expect(decoded![0].profile.global.opacity).toBe(0.42)
    expect(decoded![0].profile.global.orientation).toBe('horizontal')
  })

  it('preserves multiple presets in one string', async () => {
    const encoded = await encodeShareString([
      { name: 'a', profile: DEFAULT_PROFILE },
      { name: 'b', profile: DEFAULT_PROFILE },
    ])
    const decoded = await decodeShareString(encoded)
    expect(decoded).toHaveLength(2)
    expect(decoded![0].name).toBe('a')
    expect(decoded![1].name).toBe('b')
  })

  it('rejects garbage strings', async () => {
    expect(await decodeShareString('hello world')).toBeNull()
    expect(await decodeShareString('FLEXI1:notbase64!!!')).toBeNull()
    expect(await decodeShareString('')).toBeNull()
  })

  it('isShareString recognizes headers', () => {
    expect(isShareString('FLEXI1:abc')).toBe(true)
    expect(isShareString('ACTFLEXI1:abc')).toBe(true)
    expect(isShareString('random')).toBe(false)
  })
})

describe('profileCodec edge cases', () => {
  it('handles empty profiles array', async () => {
    const encoded = await encodeShareString([])
    expect(encoded.startsWith('FLEXI1:')).toBe(true)
  })

  it('handles profiles with custom icons', async () => {
    const profile = {
      ...DEFAULT_PROFILE,
      customIcons: { PLD: 'data:image/png;base64,abc123' },
    }
    const encoded = await encodeShareString([{ name: 'custom', profile }])
    const decoded = await decodeShareString(encoded)
    expect(decoded![0].profile.customIcons).toBeDefined()
  })

  it('handles extreme opacity values', async () => {
    const profile = {
      ...DEFAULT_PROFILE,
      global: { ...DEFAULT_PROFILE.global, opacity: 0 },
    }
    const encoded = await encodeShareString([{ name: 'zero', profile }])
    const decoded = await decodeShareString(encoded)
    expect(decoded![0].profile.global.opacity).toBe(0)
  })

  it('handles maximum maxCombatants', async () => {
    const profile = {
      ...DEFAULT_PROFILE,
      global: { ...DEFAULT_PROFILE.global, maxCombatants: 999 },
    }
    const encoded = await encodeShareString([{ name: 'max', profile }])
    const decoded = await decodeShareString(encoded)
    expect(decoded![0].profile.global.maxCombatants).toBe(999)
  })

  it('preserves all GlobalConfig fields', async () => {
    const profile = { ...DEFAULT_PROFILE }
    const encoded = await encodeShareString([{ name: 'full', profile }])
    const decoded = await decodeShareString(encoded)
    const decodedGlobal = decoded![0].profile.global

    expect(decodedGlobal.dpsType).toBe('encdps')
    expect(decodedGlobal.sortBy).toBe('encdps')
    expect(decodedGlobal.maxCombatants).toBe(72)
    expect(decodedGlobal.orientation).toBe('vertical')
    expect(decodedGlobal.outOfCombat).toBe('dim')
    expect(decodedGlobal.valueFormat).toBe('abbreviated')
    expect(decodedGlobal.combatantFilter).toBe('all')
    expect(decodedGlobal.mergePets).toBe(true)
  })

  it('handles various dpsType values', async () => {
    const dpsTypes = ['encdps', 'enchps', 'dtps', 'rdps', 'damage%', 'healed%', 'crithit%'] as const
    for (const dpsType of dpsTypes) {
      const profile = {
        ...DEFAULT_PROFILE,
        global: { ...DEFAULT_PROFILE.global, dpsType },
      }
      const encoded = await encodeShareString([{ name: dpsType, profile }])
      const decoded = await decodeShareString(encoded)
      expect(decoded![0].profile.global.dpsType).toBe(dpsType)
    }
  })
})
