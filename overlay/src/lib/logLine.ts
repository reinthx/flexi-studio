/**
 * Pure ACT LogLine parsing helpers (no store access).
 *
 * Extracted from overlay/src/stores/liveData.ts so the trickiest
 * packet-decoding logic can be unit-tested directly.
 *
 * Reference: https://github.com/OverlayPlugin/cactbot/blob/main/docs/LogGuide.md
 */
import type { HitRecord } from '@shared'
// NOTE: TIMELINE_BUCKET_SEC comes from '@shared/configSchema' directly —
// importing the '@shared' index pulls in overlayBridge, which touches
// `window` at module scope and breaks node-env unit tests.
import { TIMELINE_BUCKET_SEC } from '@shared/configSchema'

export function isPlayerId(id: string): boolean {
  return id.startsWith('10')
}

export function isEnemyId(id: string): boolean {
  return id.startsWith('40')
}

export interface ActionEffectFlags {
  kind: number
  severity: number
}

/**
 * Parse a 21/22-line action-effect flags hex once.
 * Low byte = effect kind (0x03 damage, 0x04 heal), next byte = severity
 * (0x00 normal, 0x20 crit, 0x40 direct hit, 0x60 crit direct hit).
 */
export function parseActionEffectFlags(flags: string): ActionEffectFlags {
  const parsed = parseInt(flags, 16)
  if (!Number.isFinite(parsed)) return { kind: 0, severity: 0 }
  return { kind: parsed & 0xFF, severity: Math.floor(parsed / 0x100) & 0xFF }
}

export function actionEffectKind(flags: string): number {
  return parseActionEffectFlags(flags).kind
}

export function actionEffectSeverity(flags: string): number {
  return parseActionEffectFlags(flags).severity
}

export function decodeLogDamage(hex: string): number {
  if (!hex || hex === '0') return 0
  const n = parseInt(hex, 16)
  if (isNaN(n)) return 0
  const upper = (n >>> 16) & 0xFFFF
  const lower = n & 0xFFFF
  return lower & 0x4000
    ? upper | (((lower & 0x3FFF) + 1) << 16)
    : upper
}

export function decodeTickAmount(hex: string, targetMaxHp?: number): number {
  if (!hex || hex === '0') return 0
  const n = parseInt(hex, 16)
  if (!Number.isFinite(n)) return 0

  const plausibleCeiling = Number.isFinite(targetMaxHp) && (targetMaxHp ?? 0) > 0
    ? Math.max(targetMaxHp as number * 2, 1_000_000)
    : 1_000_000
  if (n <= plausibleCeiling) return n

  const lower20 = n & 0xFFFFF
  if (lower20 > 0 && lower20 <= plausibleCeiling) return lower20

  const lower16 = n & 0xFFFF
  return lower16 > 0 ? lower16 : n
}

export function normalizeEffectId(effectId: string): string {
  return (effectId || '').trim().toUpperCase()
}

export function tickEffectKey(sourceId: string, targetId: string): string {
  return `${sourceId || ''}|${targetId || ''}`
}

/** YOU/self name aliases without store access. */
export function combatantNameAliases(name: string, selfName: string): string[] {
  const aliases = [name]
  if (name === 'YOU' && selfName) aliases.push(selfName)
  if (selfName && name === selfName) aliases.push('YOU')
  return Array.from(new Set(aliases.filter(Boolean)))
}

// ─── Line-type field parsers ─────────────────────────────────────────────────
// Each parser maps raw `rawLine.split('|')` parts to a typed struct (or null
// for malformed lines) so the store's onLogLine stays free of field-index
// magic. Parsers are intentionally permissive about empty names — the store's
// per-branch guards decide what to record — and strict about structure.

function num(parts: string[], index: number): number {
  return parseInt(parts[index], 10)
}

export interface AddCombatantFields {
  id: string
  name: string
  jobOrClass: string
}

/** 03 AddCombatant: [2]=id [3]=name [4]=job/class. */
export function parseAddCombatantLine(parts: string[]): AddCombatantFields | null {
  if (parts.length < 5) return null
  return { id: parts[2], name: parts[3], jobOrClass: parts[4] }
}

export interface StartsCastingFields {
  sourceId: string
  sourceName: string
  abilityId: string
  abilityName: string
  targetId: string
  targetName: string
  /** Rounded millisecond cast time. */
  castTimeMs: number
}

/**
 * 20 NetworkStartsCasting: [2]=srcId [3]=srcName [4]=abilId [5]=abilName
 * [6]=tgtId [7]=tgtName [8]=castTimeSec. Null when the line cannot describe
 * a real cast (missing source/ability or non-positive duration).
 */
export function parseStartsCastingLine(parts: string[]): StartsCastingFields | null {
  if (parts.length < 9) return null
  const castTimeSec = parseFloat(parts[8])
  if (!parts[3] || !parts[4] || !Number.isFinite(castTimeSec) || castTimeSec <= 0) return null
  return {
    sourceId: parts[2],
    sourceName: parts[3],
    abilityId: parts[4],
    abilityName: parts[5],
    targetId: parts[6],
    targetName: parts[7],
    castTimeMs: Math.round(castTimeSec * 1000),
  }
}

export interface AbilityLineFields {
  sourceId: string
  sourceName: string
  abilityId: string
  abilityName: string
  targetId: string
  targetName: string
  /** Low byte of the action-effect flags (0x03 damage, 0x04 heal). */
  flagByte: number
  flagSeverity: number
  /** Decoded primary amount (damage or heal depending on flagByte). */
  amount: number
  tgtCurrentHp: number
  tgtMaxHp: number
  /** Source HP (only meaningful for self-healing-proc attribution). */
  srcCurrentHp: number
  srcMaxHp: number
  petOwnerId: string
  petOwnerName: string
  /** Pet owner when present, otherwise the source. */
  effectiveName: string
  /** Decoded heal amounts (>0) from additional-effect slots 1..7. */
  additionalHeals: number[]
}

/**
 * 21/22 NetworkAbility/NetworkAOEAbility: [2..9] source/ability/target/flags/
 * amount, [24]=tgtCurrentHP [25]=tgtMaxHP, [34]=srcCurrentHP [35]=srcMaxHP,
 * [47]=petOwnerId [48]=petOwnerName. Additional-effect pairs live at
 * [8+i*2] (flags) / [9+i*2] (amount) for i in 1..7.
 */
export function parseAbilityLine(parts: string[]): AbilityLineFields | null {
  if (parts.length < 10) return null
  const { kind: flagByte, severity: flagSeverity } = parseActionEffectFlags(parts[8] ?? '')
  const petOwnerName = parts[48] ?? ''
  const additionalHeals: number[] = []
  for (let i = 1; i < 8; i++) {
    if (actionEffectKind(parts[8 + i * 2] ?? '') !== 0x04) continue
    const heal = decodeLogDamage(parts[9 + i * 2] ?? '')
    if (heal > 0) additionalHeals.push(heal)
  }
  return {
    sourceId: parts[2],
    sourceName: parts[3],
    abilityId: parts[4],
    abilityName: parts[5],
    targetId: parts[6],
    targetName: parts[7],
    flagByte,
    flagSeverity,
    amount: decodeLogDamage(parts[9] ?? ''),
    tgtCurrentHp: num(parts, 24),
    tgtMaxHp: num(parts, 25),
    srcCurrentHp: num(parts, 34),
    srcMaxHp: num(parts, 35),
    petOwnerId: parts[47] ?? '',
    petOwnerName,
    effectiveName: petOwnerName || parts[3],
    additionalHeals,
  }
}

export interface DotTickFields {
  targetId: string
  targetName: string
  dotType: string
  effectId: string
  amountHex: string
  tgtCurrentHp: number
  tgtMaxHp: number
  sourceId: string
  sourceName: string
}

/**
 * 24 NetworkDoT: [2]=tgtId [3]=tgtName [4]=DoT|HoT [5]=effectId
 * [6]=amount(hex) [7]=tgtCurrentHP [8]=tgtMaxHP [17]=srcId [18]=srcName.
 * (srcName was historically misread from parts[16], the heading coordinate.)
 */
export function parseDotTickLine(parts: string[]): DotTickFields | null {
  if (parts.length < 19) return null
  if (parts[4] !== 'DoT' && parts[4] !== 'HoT') return null
  return {
    targetId: parts[2],
    targetName: parts[3],
    dotType: parts[4],
    effectId: parts[5],
    amountHex: parts[6],
    tgtCurrentHp: num(parts, 7),
    tgtMaxHp: num(parts, 8),
    sourceId: parts[17],
    sourceName: parts[18],
  }
}

/**
 * Three-way tick name resolution: recorded GainsEffect name, then the active
 * tick effect for the source→target pair, then a job fallback, then a
 * synthetic `DoT (id)` label so ticks are never silently mislabeled.
 */
export function resolveTickAbilityName(
  kind: 'DoT' | 'HoT',
  effectId: string,
  lookup: { recordedName?: string; activeName?: string; jobFallback?: string },
): string {
  return lookup.recordedName
    ?? lookup.activeName
    ?? lookup.jobFallback
    ?? `${kind} (${effectId || 'unknown'})`
}

export interface DeathLineFields {
  targetId: string
  targetName: string
}

/** 25 NetworkDeath: [2]=targetId [3]=targetName. */
export function parseDeathLine(parts: string[]): DeathLineFields | null {
  if (parts.length < 4 || !parts[2] || !parts[3]) return null
  return { targetId: parts[2], targetName: parts[3] }
}

/** How far back from a death the recap buffers are sampled. */
export const DEATH_WINDOW_MS = 35000

/** Slice time-stamped buffers (hp samples, hit events) to the death window. */
export function sliceDeathWindow<T extends { t: number }>(events: T[], nowMs: number, windowMs = DEATH_WINDOW_MS): T[] {
  const cutoff = nowMs - windowMs
  return events.filter(e => e.t >= cutoff)
}

/** Synthesize the terminal zero-HP hit appended to the recap hit list. */
export function makeDeathHit(t: number, lastMaxHp: number | undefined): HitRecord {
  return { t, type: 'dmg', abilityName: 'Death', sourceName: '---', amount: 0, currentHp: 0, maxHp: lastMaxHp, hp: 0 }
}

export interface GainsEffectFields {
  effectId: string
  effectName: string
  durationSec: number
  sourceId: string
  sourceName: string
  targetId: string
  targetName: string
}

/**
 * 26 NetworkGainsEffect: [2]=effectId [3]=effectName [4]=durationSec
 * [5]=sourceId [6]=sourceName [7]=targetId [8]=targetName.
 */
export function parseGainsEffectLine(parts: string[]): GainsEffectFields | null {
  if (parts.length < 9 || !parts[7] || !parts[8]) return null
  return {
    effectId: parts[2],
    effectName: parts[3],
    durationSec: parseFloat(parts[4]),
    sourceId: parts[5],
    sourceName: parts[6],
    targetId: parts[7],
    targetName: parts[8],
  }
}

export interface LosesEffectFields {
  effectId: string
  effectName: string
  sourceId: string
  sourceName: string
  targetId: string
  targetName: string
}

/**
 * 30 NetworkLosesEffect: same slots as 26. Null when any of
 * effect/source/target name is missing (mirrors the store guard).
 */
export function parseLosesEffectLine(parts: string[]): LosesEffectFields | null {
  if (parts.length < 9 || !parts[3] || !parts[6] || !parts[8]) return null
  return {
    effectId: parts[2],
    effectName: parts[3],
    sourceId: parts[5],
    sourceName: parts[6],
    targetId: parts[7],
    targetName: parts[8],
  }
}

const RAISE_EFFECT_NAMES = new Set(['raise', 'angel whisper', 'resurrection', 'life ascension', 'reraise iii'])

/** Exact-match resurrection check so unrelated buffs never count as raises. */
export function isRaiseEffect(effectName: string | undefined): boolean {
  const normalized = effectName?.trim().toLowerCase()
  return normalized ? RAISE_EFFECT_NAMES.has(normalized) : false
}

export interface HealSplit {
  effective: number
  overheal: number
}

/**
 * Split a raw heal into effective + overheal using the last known HP for the
 * target. Falls back to zero-effective when the target is already full and
 * no previous sample exists. Pure core of the store's healingAmounts.
 */
export function splitHeal(
  rawHeal: number,
  previous: { currentHp: number; maxHp: number } | undefined,
  currentHp: number,
  maxHp: number,
): HealSplit {
  if (rawHeal <= 0) return { effective: 0, overheal: 0 }
  if (!Number.isFinite(currentHp) || !Number.isFinite(maxHp) || maxHp <= 0) {
    return { effective: rawHeal, overheal: 0 }
  }
  const safeCurrentHp = Math.max(0, Math.min(currentHp, maxHp))
  let effective = rawHeal
  if (previous && previous.maxHp > 0) {
    effective = Math.max(0, Math.min(rawHeal, safeCurrentHp - previous.currentHp))
  } else if (safeCurrentHp >= maxHp) {
    effective = 0
  }
  return { effective, overheal: Math.max(0, rawHeal - effective) }
}

/**
 * Select the raid-buff windows a hit can attribute to: windows on the dealer
 * (by any YOU/self alias) plus windows on the target, excluding buffs the
 * dealer applied themselves. `windowsFor` wraps the store's time-filtered
 * lookup so this stays pure and unit-testable.
 */
export function selectBuffWindows<T extends { sourceName: string }>(
  dealerName: string,
  targetName: string,
  selfName: string,
  windowsFor: (name: string) => T[],
): T[] {
  return [
    ...combatantNameAliases(dealerName, selfName).flatMap(windowsFor),
    ...combatantNameAliases(targetName, selfName).flatMap(windowsFor),
  ].filter(window => window.sourceName !== dealerName)
}

/** Which TIMELINE_BUCKET_SEC-second slot a pull-offset timestamp falls into. */
export function timelineBucketIndex(nowMs: number): number {
  return Math.floor(nowMs / (TIMELINE_BUCKET_SEC * 1000))
}

/**
 * Write an amount into the correct timeline slot, zero-filling skipped
 * buckets. Pure core of the store's recordTimelineBucket.
 */
export function accumulateTimelineBucket(
  timeline: Record<string, number[]>,
  name: string,
  amount: number,
  nowMs: number,
): void {
  const bucket = timelineBucketIndex(nowMs)
  if (!timeline[name]) timeline[name] = []
  const tl = timeline[name]
  while (tl.length <= bucket) tl.push(0)
  tl[bucket] += amount
}
