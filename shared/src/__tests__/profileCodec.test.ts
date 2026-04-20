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
      global: { ...DEFAULT_PROFILE.global, maxCombatants: 13, opacity: 0.42 },
    }
    const encoded = await encodeShareString([{ name: 'test', profile: modified }])
    const decoded = await decodeShareString(encoded)
    expect(decoded![0].profile.global.maxCombatants).toBe(13)
    expect(decoded![0].profile.global.opacity).toBe(0.42)
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
