import type { AbilityStats, CastEvent, CombatantAbilityData } from '@shared/configSchema'
import { pctOf } from './formatters'

export type AbilitySortColumn = 'totalDamage' | 'dps' | 'hits' | 'maxHit' | 'critPct' | 'abilityName'
export type TakenSortColumn = 'totalDamage' | 'hits' | 'maxHit' | 'abilityName'
export type AbilityBreakdownRow = AbilityStats & { pct: string; avg: number; dps: number; minHit: number; critPct: string; abilityName: string }
export type DoneTargetAbilityRow = { abilityId: string; abilityName: string; casts: number; damage: number; healing: number; overheal: number; hits: number }
export type DoneTargetRow = { target: string; casts: number; damage: number; damageHits: number; healing: number; overheal: number; healingHits: number; abilityCount: number; abilities: DoneTargetAbilityRow[]; pct: string }

export function totalAbilityDamage(data: CombatantAbilityData): number {
  return Object.values(data).reduce((sum, ability) => sum + ability.totalDamage, 0)
}

export function totalAbilityOverheal(data: CombatantAbilityData): number {
  return Object.values(data).reduce((sum, ability) => sum + (ability.overheal ?? 0), 0)
}

export function totalEncounterDamage(data: Record<string, CombatantAbilityData>): number {
  return Object.values(data).reduce((sum, combatantData) => sum + totalAbilityDamage(combatantData), 0)
}

export function buildAbilityRows(
  data: CombatantAbilityData,
  total: number,
  durationSec: number,
): AbilityBreakdownRow[] {
  return Object.values(data).map(ability => ({
    ...ability,
    pct: total > 0 ? ((ability.totalDamage / total) * 100).toFixed(1) : '0.0',
    avg: ability.hits > 0 ? Math.round(ability.totalDamage / ability.hits) : 0,
    dps: durationSec > 0 ? Math.round(ability.totalDamage / durationSec) : 0,
    minHit: ability.minHit === Infinity ? 0 : ability.minHit,
    critPct: pctOf(ability.critHits, ability.hits),
    abilityName: ability.abilityName,
  }))
}

export function sortAbilityRows<T extends object>(
  rows: T[],
  column: AbilitySortColumn | TakenSortColumn,
  desc: boolean,
): T[] {
  return [...rows].sort((a, b) => {
    const aRow = a as Record<string, unknown>
    const bRow = b as Record<string, unknown>
    if (column === 'abilityName') {
      const cmp = String(aRow.abilityName ?? '').localeCompare(String(bRow.abilityName ?? ''))
      return desc ? -cmp : cmp
    }
    const av = Number(aRow[column] ?? 0)
    const bv = Number(bRow[column] ?? 0)
    return desc ? bv - av : av - bv
  })
}

export function buildSortedAbilityRows(
  data: CombatantAbilityData,
  total: number,
  durationSec: number,
  sortColumn: AbilitySortColumn | TakenSortColumn,
  sortDesc: boolean,
): AbilityBreakdownRow[] {
  return sortAbilityRows(buildAbilityRows(data, total, durationSec), sortColumn, sortDesc)
}

export function buildHealingAbilityRows(
  data: CombatantAbilityData,
  total: number,
  durationSec: number,
): AbilityBreakdownRow[] {
  return buildAbilityRows(data, total, durationSec)
    .sort((a, b) => (b.totalDamage + (b.overheal ?? 0)) - (a.totalDamage + (a.overheal ?? 0)))
}

export function buildDoneTargetRows(
  selectedActorCastEvents: CastEvent[],
  rawData: CombatantAbilityData,
  healingReceivedData: Record<string, CombatantAbilityData>,
  selectedName: string,
): DoneTargetRow[] {
  type TargetAccumulator = Omit<DoneTargetRow, 'abilityCount' | 'abilities' | 'pct'> & { abilities: Map<string, DoneTargetAbilityRow> }
  const score = ({ damage, healing, overheal, casts }: Pick<DoneTargetRow, 'damage' | 'healing' | 'overheal' | 'casts'>) => damage + healing + overheal + casts
  const counts = new Map<string, TargetAccumulator>()
  const ensure = (target: string) => {
    const key = target || 'Unknown'
    const row = counts.get(key) ?? {
      target: key,
      casts: 0,
      damage: 0,
      damageHits: 0,
      healing: 0,
      overheal: 0,
      healingHits: 0,
      abilities: new Map<string, DoneTargetAbilityRow>(),
    }
    counts.set(key, row)
    return row
  }
  const ensureAbility = (row: { abilities: Map<string, DoneTargetAbilityRow> }, abilityId: string, abilityName: string) => {
    const key = abilityId || abilityName || 'unknown'
    const ability = row.abilities.get(key) ?? {
      abilityId,
      abilityName: abilityName || 'Unknown',
      casts: 0,
      damage: 0,
      healing: 0,
      overheal: 0,
      hits: 0,
    }
    if (!ability.abilityId && abilityId) ability.abilityId = abilityId
    if (ability.abilityName === 'Unknown' && abilityName) ability.abilityName = abilityName
    row.abilities.set(key, ability)
    return ability
  }

  for (const event of selectedActorCastEvents) {
    const row = ensure(event.target || 'Unknown')
    row.casts += 1
    if (event.abilityName) {
      ensureAbility(row, event.abilityId, event.abilityName).casts += 1
    }
  }
  for (const ability of Object.values(rawData)) {
    for (const [target, stats] of Object.entries(ability.targets ?? {})) {
      const row = ensure(target)
      row.damage += stats.total
      row.damageHits += stats.hits
      const abilityRow = ensureAbility(row, ability.abilityId, ability.abilityName)
      abilityRow.damage += stats.total
      abilityRow.hits += stats.hits
    }
  }
  for (const [target, abilities] of Object.entries(healingReceivedData)) {
    for (const ability of Object.values(abilities)) {
      const sourceStats = ability.sources?.[selectedName]
      if (!sourceStats) continue
      const row = ensure(target)
      row.healing += sourceStats.total
      row.overheal += sourceStats.overheal ?? 0
      row.healingHits += sourceStats.hits
      const abilityRow = ensureAbility(row, ability.abilityId, ability.abilityName)
      abilityRow.healing += sourceStats.total
      abilityRow.overheal += sourceStats.overheal ?? 0
      abilityRow.hits += sourceStats.hits
    }
  }
  const total = Array.from(counts.values()).reduce((sum, row) => sum + score(row), 0)
  return Array.from(counts.values())
    .map(row => {
      const abilityRows = Array.from(row.abilities.values())
        .sort((a, b) =>
          score(b) - score(a) ||
          a.abilityName.localeCompare(b.abilityName),
        )
      return {
        ...row,
        abilityCount: abilityRows.length,
        abilities: abilityRows,
        pct: total > 0 ? ((score(row) / total) * 100).toFixed(1) : '0.0',
      }
    })
    .sort((a, b) => score(b) - score(a) || a.target.localeCompare(b.target))
}
