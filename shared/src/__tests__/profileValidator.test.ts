import { describe, it, expect } from 'vitest'
import { isProfileLike, parseProfileSafe } from '../profileValidator'
import { DEFAULT_PROFILE } from '../presets'

describe('isProfileLike', () => {
  it('accepts DEFAULT_PROFILE', () => {
    expect(isProfileLike(DEFAULT_PROFILE)).toBe(true)
  })

  it('accepts partial profile with any known top-level key', () => {
    expect(isProfileLike({ global: {} })).toBe(true)
    expect(isProfileLike({ default: {} })).toBe(true)
    expect(isProfileLike({ id: 'x' })).toBe(true)
  })

  it('rejects non-objects', () => {
    expect(isProfileLike(null)).toBe(false)
    expect(isProfileLike(undefined)).toBe(false)
    expect(isProfileLike('string')).toBe(false)
    expect(isProfileLike(42)).toBe(false)
    expect(isProfileLike(true)).toBe(false)
    expect(isProfileLike([])).toBe(false)
  })

  it('rejects empty object (no profile keys)', () => {
    expect(isProfileLike({})).toBe(false)
  })

  it('rejects objects with only foreign keys', () => {
    expect(isProfileLike({ foo: 'bar', baz: 42 })).toBe(false)
  })

  it('rejects wrong types on top-level keys', () => {
    expect(isProfileLike({ id: 42 })).toBe(false)
    expect(isProfileLike({ name: { bad: 'object' } })).toBe(false)
    expect(isProfileLike({ global: 'not-an-object' })).toBe(false)
    expect(isProfileLike({ overrides: [] })).toBe(false)
    expect(isProfileLike({ default: null })).toBe(false)
  })

  it('accepts undefined top-level values (missing-key semantics)', () => {
    expect(isProfileLike({ id: undefined, global: {} })).toBe(true)
  })
})

describe('parseProfileSafe', () => {
  it('parses valid profile JSON', () => {
    const json = JSON.stringify(DEFAULT_PROFILE)
    const result = parseProfileSafe(json)
    expect(result).not.toBeNull()
    expect(result?.id).toBe(DEFAULT_PROFILE.id)
  })

  it('returns null for malformed JSON', () => {
    expect(parseProfileSafe('{not json')).toBeNull()
    expect(parseProfileSafe('')).toBeNull()
    expect(parseProfileSafe('undefined')).toBeNull()
  })

  it('returns null for valid JSON that is not a profile', () => {
    expect(parseProfileSafe('"just a string"')).toBeNull()
    expect(parseProfileSafe('42')).toBeNull()
    expect(parseProfileSafe('null')).toBeNull()
    expect(parseProfileSafe('[]')).toBeNull()
    expect(parseProfileSafe('{"foo":"bar"}')).toBeNull()
  })

  it('rejects profiles with wrong-typed top-level fields', () => {
    expect(parseProfileSafe('{"global":"corrupt"}')).toBeNull()
    expect(parseProfileSafe('{"id":123}')).toBeNull()
  })
})
