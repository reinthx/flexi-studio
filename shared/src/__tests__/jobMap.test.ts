import { describe, it, expect } from 'vitest'
import { normalizeJob, getJobInfo, getRole, getJobIconSrc } from '../jobMap'
import type { Role } from '../configSchema'

describe('normalizeJob', () => {
  it('returns empty string for null/undefined', () => {
    expect(normalizeJob(null)).toBe('')
    expect(normalizeJob(undefined)).toBe('')
  })

  it('returns empty string for empty/whitespace only', () => {
    expect(normalizeJob('')).toBe('')
    expect(normalizeJob('   ')).toBe('')
  })

  it('returns uppercase abbreviation for valid job strings', () => {
    expect(normalizeJob('pld')).toBe('PLD')
    expect(normalizeJob('WAR')).toBe('WAR')
    expect(normalizeJob('Black Mage')).toBe('BLACK MAGE')
  })

  it('resolves string aliases', () => {
    expect(normalizeJob('LIMIT BREAK')).toBe('LB')
  })

  it('resolves numeric class job IDs', () => {
    expect(normalizeJob('1')).toBe('GLA')
    expect(normalizeJob('19')).toBe('PLD')
    expect(normalizeJob('20')).toBe('MNK')
  })

  it('normalizes whitespace', () => {
    expect(normalizeJob('  pld  ')).toBe('PLD')
  })
})

describe('getJobInfo', () => {
  it('returns correct role for tank jobs', () => {
    expect(getJobInfo('PLD').role).toBe('tank')
    expect(getJobInfo('WAR').role).toBe('tank')
    expect(getJobInfo('DRK').role).toBe('tank')
    expect(getJobInfo('GNB').role).toBe('tank')
  })

  it('returns correct role for healer jobs', () => {
    expect(getJobInfo('WHM').role).toBe('healer')
    expect(getJobInfo('SCH').role).toBe('healer')
    expect(getJobInfo('AST').role).toBe('healer')
    expect(getJobInfo('SGE').role).toBe('healer')
  })

  it('returns correct role for melee DPS', () => {
    expect(getJobInfo('MNK').role).toBe('melee')
    expect(getJobInfo('DRG').role).toBe('melee')
    expect(getJobInfo('NIN').role).toBe('melee')
    expect(getJobInfo('SAM').role).toBe('melee')
  })

  it('returns correct role for ranged DPS', () => {
    expect(getJobInfo('BRD').role).toBe('ranged')
    expect(getJobInfo('MCH').role).toBe('ranged')
    expect(getJobInfo('DNC').role).toBe('ranged')
  })

  it('returns correct role for caster DPS', () => {
    expect(getJobInfo('BLM').role).toBe('caster')
    expect(getJobInfo('SMN').role).toBe('caster')
    expect(getJobInfo('RDM').role).toBe('caster')
  })

  it('returns correct label for known jobs', () => {
    expect(getJobInfo('PLD').label).toBe('Paladin')
    expect(getJobInfo('WHM').label).toBe('White Mage')
    expect(getJobInfo('BLM').label).toBe('Black Mage')
  })

  it('returns unknown role and normalized label for unknown jobs', () => {
    const info = getJobInfo('XYZ')
    expect(info.role).toBe('unknown')
    expect(info.label).toBe('XYZ')
  })

  it('returns adventurer fallback for empty input', () => {
    const info = getJobInfo('')
    expect(info.role).toBe('unknown')
    expect(info.label).toBe('Adventurer')
  })
})

describe('getRole', () => {
  it('returns role for known jobs', () => {
    expect(getRole('PLD')).toBe('tank')
    expect(getRole('WHM')).toBe('healer')
    expect(getRole('BLM')).toBe('caster')
  })

  it('returns unknown for unknown jobs', () => {
    expect(getRole('XYZ')).toBe('unknown')
  })
})

describe('getJobIconSrc', () => {
  it('returns icon data for known jobs', () => {
    expect(getJobIconSrc('PLD')).toContain('data:')
    expect(getJobIconSrc('WHM')).toContain('data:')
  })

  it('returns ADV fallback for unknown', () => {
    expect(getJobIconSrc('XYZ')).toContain('data:')
  })
})