/**
 * petResolver.ts
 *
 * Detects pets in CombatData and either:
 *  - Merges them into their owner's stats (recalculating all percentages), or
 *  - Filters them out, or
 *  - Passes them through for separate display.
 *
 * Pet name format in FFXIV: "PetName(OwnerName)"
 * Examples: "Emerald Carbuncle(Stabby McStab)", "Ifrit-Egi(Stabby McStab)"
 */

import type { CombatantSnapshot } from './configSchema'

const PET_NAME_RE = /^.+\((.+)\)$/

interface RawCombatant {
  name: string
  [key: string]: string
}

export interface ResolvedCombatants {
  combatants: CombatantSnapshot[]
  petOwnerMap: Map<string, string>  // petName → ownerName (for styling)
}

export function resolvePets(
  raw: Record<string, Record<string, string>>,
  opts: { show: boolean; mergeWithOwner: boolean },
): ResolvedCombatants {
  const all: RawCombatant[] = Object.values(raw).map(c => ({ ...c, name: c['name'] ?? '' }))
  const allNames = new Set(all.map(c => c.name))
  const petOwnerMap = new Map<string, string>()

  const pets: RawCombatant[] = []
  const players: RawCombatant[] = []

  for (const c of all) {
    const match = c.name.match(PET_NAME_RE)
    if (match && allNames.has(match[1])) {
      petOwnerMap.set(c.name, match[1])
      pets.push(c)
    } else {
      players.push(c)
    }
  }

  let result: RawCombatant[]

  if (opts.mergeWithOwner) {
    result = mergePets(players, pets)
  } else if (opts.show) {
    result = [...players, ...pets]
  } else {
    result = players
  }

  // Recalculate percentage columns from current totals
  const withPct = recalcPercentages(result)

  return {
    combatants: withPct as CombatantSnapshot[],
    petOwnerMap,
  }
}

function mergePets(
  players: RawCombatant[],
  pets: RawCombatant[],
): RawCombatant[] {
  // Clone players so we don't mutate originals
  const merged = players.map(p => ({ ...p }))

  for (const pet of pets) {
    const ownerName = getPetOwner(pet.name)
    if (!ownerName) continue
    const owner = merged.find(p => p.name === ownerName)
    if (!owner) continue

    // Sum all numeric fields into owner
    for (const [key, val] of Object.entries(pet)) {
      if (key === 'name' || key === 'Job') continue
      const num = parseFloat(val)
      if (!isNaN(num)) {
        const ownerNum = parseFloat(owner[key] ?? '0')
        if (!isNaN(ownerNum)) {
          owner[key] = String(ownerNum + num)
        }
      }
    }
  }

  return merged
}

function getPetOwner(petName: string): string | null {
  return petName.match(PET_NAME_RE)?.[1] ?? null
}

/** Recalculate damage% and healed% from current raw totals */
function recalcPercentages(combatants: RawCombatant[]): RawCombatant[] {
  const totalDamage = combatants.reduce((s, c) => s + parseFloat(c['damage'] ?? c['encdps'] ?? '0'), 0)
  const totalHealing = combatants.reduce((s, c) => s + parseFloat(c['healed'] ?? c['enchps'] ?? '0'), 0)

  return combatants.map(c => {
    const dmg = parseFloat(c['damage'] ?? c['encdps'] ?? '0')
    const heal = parseFloat(c['healed'] ?? c['enchps'] ?? '0')
    return {
      ...c,
      'damage%': totalDamage > 0 ? ((dmg / totalDamage) * 100).toFixed(1) : '0.0',
      'healed%': totalHealing > 0 ? ((heal / totalHealing) * 100).toFixed(1) : '0.0',
    }
  })
}
