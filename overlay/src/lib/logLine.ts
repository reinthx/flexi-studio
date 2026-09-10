/**
 * Pure ACT LogLine parsing helpers (no store access).
 *
 * Extracted from overlay/src/stores/liveData.ts so the trickiest
 * packet-decoding logic can be unit-tested directly.
 *
 * Reference: https://github.com/OverlayPlugin/cactbot/blob/main/docs/LogGuide.md
 */

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
