import { describe, expect, it } from 'vitest'
import {
  effectiveDpsTypeFor,
  jobRoleFor,
  resolveCombatantFilter,
  sortCombatantsForMeter,
} from '../frameBuilder'

const combatant = (name: string, job: string, encdps?: string) =>
  (encdps === undefined ? { name, Job: job } : { name, Job: job, encdps }) as Record<string, string>

describe('jobRoleFor', () => {
  it('maps jobs to roles and unknowns to unknown', () => {
    expect(jobRoleFor('PLD')).toBe('tank')
    expect(jobRoleFor('WHM')).toBe('healer')
    expect(jobRoleFor('DRG')).toBe('melee')
    expect(jobRoleFor('BRD')).toBe('ranged')
    expect(jobRoleFor('BLM')).toBe('caster')
    expect(jobRoleFor('CRP')).toBe('unknown')
    expect(jobRoleFor('')).toBe('unknown')
  })
})

describe('resolveCombatantFilter', () => {
  it('prefers combatantFilter and falls back to legacy flags', () => {
    expect(resolveCombatantFilter({ combatantFilter: 'party', selfOnly: false, partyOnly: false })).toBe('party')
    expect(resolveCombatantFilter({ combatantFilter: undefined as any, selfOnly: true, partyOnly: false })).toBe('self')
    expect(resolveCombatantFilter({ combatantFilter: undefined as any, selfOnly: false, partyOnly: true })).toBe('party')
    expect(resolveCombatantFilter({ combatantFilter: undefined as any, selfOnly: false, partyOnly: false })).toBe('all')
  })
})

describe('sortCombatantsForMeter', () => {
  it('sorts metrics descending without mutating the input', () => {
    const input = [combatant('B', 'DRG', '1000'), combatant('A', 'WAR', '2000')]
    const sorted = sortCombatantsForMeter(input, 'encdps')
    expect(sorted.map(c => c.name)).toEqual(['A', 'B'])
    expect(input.map(c => c.name)).toEqual(['B', 'A'])
  })

  it('orders roles by descending role number like the meter does', () => {
    const input = [
      combatant('Caster', 'BLM', '9999'),
      combatant('Crafter', 'CRP', '9999'),
      combatant('Tank', 'WAR', '1'),
    ]
    expect(sortCombatantsForMeter(input, 'role').map(c => c.name)).toEqual([
      'Crafter',
      'Caster',
      'Tank',
    ])
  })

  it('treats missing metrics as zero', () => {
    const input = [combatant('NoData', 'WAR'), combatant('Some', 'WAR', '10')]
    expect(sortCombatantsForMeter(input, 'encdps').map(c => c.name)).toEqual(['Some', 'NoData'])
  })
})

describe('effectiveDpsTypeFor', () => {
  it('maps the role sort mode to encdps values', () => {
    expect(effectiveDpsTypeFor('role')).toBe('encdps')
    expect(effectiveDpsTypeFor('encdps')).toBe('encdps')
    expect(effectiveDpsTypeFor('rdps')).toBe('rdps')
  })
})
