/**
 * Shared meter-frame building blocks.
 *
 * The editor preview store and the overlay live store each assemble their own
 * frames (mock vs ACT data), but the filter resolution, sort order, and metric
 * selection must stay identical or the preview drifts from the overlay.
 * Those pieces live here, covered directly by frameBuilder.test.ts.
 */
import type { GlobalConfig } from './configSchema'
import { normalizeJob } from './jobMap'

export const JOB_ROLES: Record<string, string> = {
  PLD: 'tank', WAR: 'tank', DRK: 'tank', GNB: 'tank',
  WHM: 'healer', SCH: 'healer', AST: 'healer', SGE: 'healer',
  MNK: 'melee', DRG: 'melee', NIN: 'melee', SAM: 'melee', RPR: 'melee', VPR: 'melee',
  BRD: 'ranged', MCH: 'ranged', DNC: 'ranged',
  BLM: 'caster', SMN: 'caster', RDM: 'caster', PCT: 'caster', BLU: 'caster',
}

export function jobRoleFor(job: string): string {
  return JOB_ROLES[normalizeJob(job)] ?? 'unknown'
}

/** combatantFilter with legacy selfOnly/partyOnly fallback. */
export function resolveCombatantFilter(
  g: Pick<GlobalConfig, 'combatantFilter' | 'selfOnly' | 'partyOnly'>,
): string {
  return g.combatantFilter ?? (g.selfOnly ? 'self' : g.partyOnly ? 'party' : 'all')
}

const ROLE_ORDER: Record<string, number> = {
  tank: 0, healer: 1, melee: 2, ranged: 3, caster: 4, unknown: 5,
}

/**
 * Meter sort order shared by editor preview and overlay: role order when
 * sortBy is 'role', otherwise descending numeric metric. Returns a copy.
 */
export function sortCombatantsForMeter<T extends Record<string, string>>(
  combatants: T[],
  sortBy: string,
): T[] {
  return [...combatants].sort((a, b) => {
    if (sortBy === 'role') {
      return (ROLE_ORDER[jobRoleFor(b['Job'] ?? '')] ?? 5) - (ROLE_ORDER[jobRoleFor(a['Job'] ?? '')] ?? 5)
    }
    return parseFloat(b[sortBy] ?? '0') - parseFloat(a[sortBy] ?? '0')
  })
}

/** 'role' is a sort mode, not a metric — fall back to encdps for values. */
export function effectiveDpsTypeFor(dpsType: string): string {
  return (dpsType as unknown) === 'role' ? 'encdps' : dpsType
}
