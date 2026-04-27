import { describe, it, expect } from 'vitest'
import { resolvePets } from '../petResolver'
import type { CombatantSnapshot } from '../configSchema'
import { createMockCombatants } from './helpers'

describe('resolvePets', () => {
  it('returns players as-is when show=false and mergeWithOwner=false', () => {
    const combatants = createMockCombatants(3)
    const result = resolvePets(combatants, { show: false, mergeWithOwner: false })

    expect(result.combatants).toHaveLength(3)
    expect(result.petOwnerMap.size).toBe(0)
  })

  it('includes pets when show=true', () => {
    const combatants = createMockCombatants(3, { withPets: true })
    const result = resolvePets(combatants, { show: true, mergeWithOwner: false })

    expect(result.combatants).toHaveLength(4)
  })

  it('excludes pets when show=false', () => {
    const combatants = createMockCombatants(3, { withPets: true })
    const result = resolvePets(combatants, { show: false, mergeWithOwner: false })

    expect(result.combatants).toHaveLength(3)
    expect(result.combatants.every(c => !c.name.includes('('))).toBe(true)
  })

  it('builds petOwnerMap for detected pets', () => {
    const combatants = createMockCombatants(3, { withPets: true })
    const result = resolvePets(combatants, { show: false, mergeWithOwner: false })

    expect(result.petOwnerMap.size).toBe(1)
    expect(result.petOwnerMap.get('Pet(Player0)')).toBe('Player0')
  })

  it('merges pet stats into owner when mergeWithOwner=true', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Player0': { name: 'Player0', job: 'PLD', encdps: '1000', damage: '10000', 'damage%': '80.0', enchps: '0', 'healed%': '0.0', 'crithit%': '0', 'tohit': '0', deaths: '0' },
      'Pet(Player0)': { name: 'Pet(Player0)', job: 'ADV', encdps: '250', damage: '2500', 'damage%': '20.0', enchps: '0', 'healed%': '0.0', 'crithit%': '0', 'tohit': '0', deaths: '0' },
    }
    const result = resolvePets(combatants, { show: false, mergeWithOwner: true })

    const owner = result.combatants.find(c => c.name === 'Player0')
    expect(owner?.encdps).toBe('1250')
    expect(owner?.damage).toBe('12500')
  })

  it('recalculates damage% after merge', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Player0': { name: 'Player0', job: 'PLD', encdps: '1000', damage: '10000', 'damage%': '80.0', enchps: '0', 'healed%': '0.0', 'crithit%': '0', 'tohit': '0', deaths: '0' },
      'Pet(Player0)': { name: 'Pet(Player0)', job: 'ADV', encdps: '250', damage: '2500', 'damage%': '20.0', enchps: '0', 'healed%': '0.0', 'crithit%': '0', 'tohit': '0', deaths: '0' },
    }
    const result = resolvePets(combatants, { show: false, mergeWithOwner: true })

    const owner = result.combatants.find(c => c.name === 'Player0')
    expect(owner?.['damage%']).toBe('100.0')
  })

  it('does not treat player with (Owner) pattern in name as pet if owner not in list', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'SomeEntity(Player1)': { name: 'SomeEntity(Player1)', job: 'ADV', encdps: '100', damage: '1000', 'damage%': '100.0', enchps: '0', 'healed%': '0.0', 'crithit%': '0', 'tohit': '0', deaths: '0' },
    }
    const result = resolvePets(combatants, { show: false, mergeWithOwner: false })

    expect(result.combatants).toHaveLength(1)
    expect(result.petOwnerMap.size).toBe(0)
  })

  it('handles empty combatant map', () => {
    const result = resolvePets({}, { show: false, mergeWithOwner: false })

    expect(result.combatants).toHaveLength(0)
    expect(result.petOwnerMap.size).toBe(0)
  })

  it('handles zero total damage gracefully', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Player0': { name: 'Player0', job: 'PLD', encdps: '0', damage: '0', 'damage%': '0.0', enchps: '0', 'healed%': '0.0', 'crithit%': '0', 'tohit': '0', deaths: '0' },
    }
    const result = resolvePets(combatants, { show: false, mergeWithOwner: false })

    expect(result.combatants[0]?.['damage%']).toBe('0.0')
  })
})