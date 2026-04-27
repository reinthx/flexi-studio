import { describe, expect, it } from 'vitest'
import { buildFlexiBarTokens, percentToken, splitMaxHit } from '../barRenderer'
import type { BarData } from '../useBarStyles'

function bar(overrides: Partial<BarData & { tohit?: string }> = {}): BarData & { tohit?: string } {
  return {
    name: 'Player One',
    job: 'DRG',
    fillFraction: 1,
    displayValue: '12.3k',
    displayPct: '42.1',
    deaths: '0',
    crithit: '18%',
    directhit: '22',
    enchps: '100',
    rdps: '13.4k',
    rawValue: 12345,
    rawEnchps: 100,
    rawRdps: 13400,
    maxHit: 'High Jump 23740',
    alpha: 1,
    rank: 3,
    ...overrides,
  }
}

describe('barRenderer labels', () => {
  it('normalizes percent tokens to exactly one percent sign', () => {
    expect(percentToken('18')).toBe('18%')
    expect(percentToken('18%')).toBe('18%')
    expect(percentToken('18%%')).toBe('18%')
    expect(percentToken('---')).toBe('---')
  })

  it('splits max hit into name, value, and combined aliases', () => {
    expect(splitMaxHit('High Jump 23740')).toEqual({
      name: 'High Jump',
      value: '23.7k',
      combined: 'High Jump 23.7k',
    })
  })

  it('provides legacy and camel-case label tokens', () => {
    expect(buildFlexiBarTokens(bar(), true)).toMatchObject({
      rank: '3',
      Rank: '3',
      maxhit: 'High Jump 23.7k',
      maxHit: 'High Jump 23.7k',
      maxHitName: 'High Jump',
      maxHitValue: '23.7k',
      'crithit%': '18%',
      'directhit%': '22%',
    })
  })
})
