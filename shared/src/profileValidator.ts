/**
 * Lightweight shape check for untrusted Profile JSON (localStorage, OverlayPlugin data,
 * cross-tab sync messages). Guards deepMerge from garbage without enumerating every
 * field in the schema.
 *
 * Intentional: lenient. Missing nested keys are fine — deepMerge fills from DEFAULT_PROFILE.
 * We only reject shapes that would corrupt the result (non-object top level, wrong type
 * on top-level required keys).
 */

import type { Profile } from './configSchema'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Returns true if `raw` has the top-level shape of a Profile. Does not validate
 * deeply — deepMerge with DEFAULT_PROFILE fills gaps for any missing sub-keys.
 */
export function isProfileLike(raw: unknown): raw is Partial<Profile> {
  if (!isPlainObject(raw)) return false

  // Top-level keys, when present, must be the right kind of thing.
  if ('id' in raw && raw.id !== undefined && typeof raw.id !== 'string') return false
  if ('name' in raw && raw.name !== undefined && typeof raw.name !== 'string') return false
  if ('default' in raw && raw.default !== undefined && !isPlainObject(raw.default)) return false
  if ('overrides' in raw && raw.overrides !== undefined && !isPlainObject(raw.overrides)) return false
  if ('global' in raw && raw.global !== undefined && !isPlainObject(raw.global)) return false
  if ('customIcons' in raw && raw.customIcons !== undefined && !isPlainObject(raw.customIcons)) return false

  // Reject if none of the expected top-level keys are present — string, number, empty object all fail here.
  const hasAnyProfileKey = ['id', 'name', 'default', 'overrides', 'global', 'customIcons'].some(k => k in raw)
  if (!hasAnyProfileKey) return false

  return true
}

/**
 * Safe JSON.parse + shape check. Returns parsed value on success, null on any failure
 * (parse error, wrong shape). Callers should fall back to DEFAULT_PROFILE on null.
 */
export function parseProfileSafe(json: string): Partial<Profile> | null {
  try {
    const parsed = JSON.parse(json)
    return isProfileLike(parsed) ? parsed : null
  } catch {
    return null
  }
}
