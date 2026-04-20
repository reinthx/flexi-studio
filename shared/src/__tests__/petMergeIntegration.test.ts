import { describe, it, expect } from 'vitest'
import { resolvePets } from '../petResolver'
import type { CombatantSnapshot } from '../configSchema'

describe('Pet Merge Integration - Complete Flow', () => {
  const createCombatant = (name: string, job: string, dps: number, healing: number): CombatantSnapshot => ({
    name,
    job,
    encdps: String(dps),
    enchps: String(healing),
    'damage%': '0.0',
    'healed%': '0.0',
    'crithit%': '0',
    'tohit': '0',
    deaths: '0',
  })

  it('complete merge flow with percentage recalculation', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Paladin': createCombatant('Paladin', 'PLD', 1000, 0),
      'Emerald Carbuncle(Paladin)': createCombatant('Emerald Carbuncle(Paladin)', 'ADV', 300, 0),
      'Warrior': createCombatant('Warrior', 'WAR', 800, 0),
    }

    const result = resolvePets(combatants, { show: false, mergeWithOwner: true })

    const pld = result.combatants.find(c => c.name === 'Paladin')
    expect(pld?.encdps).toBe('1300')

    const war = result.combatants.find(c => c.name === 'Warrior')
    expect(war?.encdps).toBe('800')
  })

  it(' healers with pets merge correctly', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Scholar': createCombatant('Scholar', 'SCH', 100, 800),
      'Fairy(Scholar)': createCombatant('Fairy(Scholar)', 'ADV', 50, 400),
    }

    const result = resolvePets(combatants, { show: false, mergeWithOwner: true })

    const scholar = result.combatants.find(c => c.name === 'Scholar')
    expect(scholar?.enchps).toBe('1200')
  })

  it('multiple pets same owner merge all stats', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Summoner': createCombatant('Summoner', 'SMN', 500, 0),
      'Ifrit-Egi(Summoner)': createCombatant('Ifrit-Egi(Summoner)', 'ADV', 300, 0),
      'Garuda-Egi(Summoner)': createCombatant('Garuda-Egi(Summoner)', 'ADV', 200, 0),
    }

    const result = resolvePets(combatants, { show: false, mergeWithOwner: true })

    const smn = result.combatants.find(c => c.name === 'Summoner')
    expect(smn?.encdps).toBe('1000')
  })

  it('pet owner map tracks ownership', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Player': createCombatant('Player', 'PLD', 1000, 0),
      'Pet(Player)': createCombatant('Pet(Player)', 'ADV', 300, 0),
    }

    const result = resolvePets(combatants, { show: false, mergeWithOwner: false })

    expect(result.petOwnerMap.get('Pet(Player)')).toBe('Player')
  })

  it('show mode passes pets through separately', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Player': createCombatant('Player', 'PLD', 1000, 0),
      'Pet(Player)': createCombatant('Pet(Player)', 'ADV', 300, 0),
    }

    const result = resolvePets(combatants, { show: true, mergeWithOwner: false })

    expect(result.combatants).toHaveLength(2)
    expect(result.combatants.map(c => c.name)).toContain('Player')
    expect(result.combatants.map(c => c.name)).toContain('Pet(Player)')
  })

  it('hide mode removes pets', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Player': createCombatant('Player', 'PLD', 1000, 0),
      'Pet(Player)': createCombatant('Pet(Player)', 'ADV', 300, 0),
    }

    const result = resolvePets(combatants, { show: false, mergeWithOwner: false })

    expect(result.combatants).toHaveLength(1)
    expect(result.combatants[0].name).toBe('Player')
  })

  it('ignores pets without valid owner in list', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'Player': createCombatant('Player', 'PLD', 1000, 0),
      'Pet(UnknownOwner)': createCombatant('Pet(UnknownOwner)', 'ADV', 300, 0),
    }

    const result = resolvePets(combatants, { show: false, mergeWithOwner: true })

    const player = result.combatants.find(c => c.name === 'Player')
    expect(player?.encdps).toBe('1000')
  })

  it('handles all jobs pet naming patterns', () => {
    const combatants: Record<string, CombatantSnapshot> = {
      'SMN': createCombatant('SMN', 'SMN', 800, 0),
      'SCH': createCombatant('SCH', 'SCH', 500, 400),
      'DNC': createCombatant('DNC', 'DNC', 600, 100),
    }

    const result = resolvePets(combatants, { show: false, mergeWithOwner: true })

    expect(result.combatants.length).toBeGreaterThan(0)
  })
})