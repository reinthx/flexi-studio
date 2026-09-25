import { describe, expect, it } from 'vitest'
import { buildFlexiBarTokens, buildTokenCacheKey, percentToken, renderBarFieldText, splitMaxHit } from '../barRenderer'
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
    dps: '12.3k',
    enchps: '100',
    rdps: '13.4k',
    rawValue: 12345,
    rawDps: 12345,
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
      dps: '12.3k',
      encdps: '12.3k',
      'crithit%': '18%',
      'directhit%': '22%',
    })
  })
})

describe('buildTokenCacheKey', () => {
  it('is stable across gliding frames (fill/alpha/raw change, text same)', () => {
    const before = buildTokenCacheKey(bar(), true, 'abbreviated')
    const gliding = buildTokenCacheKey(
      bar({ fillFraction: 0.42, alpha: 0.9, rawValue: 9999, rawDps: 8888, rawRdps: 7777 }),
      true,
      'abbreviated',
    )
    expect(gliding).toBe(before)
  })

  it('changes when any visible text input changes', () => {
    const base = buildTokenCacheKey(bar(), true, 'abbreviated')
    expect(buildTokenCacheKey(bar({ displayValue: '9.9k' }), true, 'abbreviated')).not.toBe(base)
    expect(buildTokenCacheKey(bar({ rank: 1 }), true, 'abbreviated')).not.toBe(base)
    expect(buildTokenCacheKey(bar(), false, 'abbreviated')).not.toBe(base)
    expect(buildTokenCacheKey(bar(), true, 'raw')).not.toBe(base)
  })
})

describe('renderBarFieldText', () => {
  it('renders plain templates from the shared token map', () => {
    const tokens = buildFlexiBarTokens(bar(), true)
    expect(renderBarFieldText({ template: '{name} {dps}' }, tokens, bar())).toBe('Player One 12.3k')
  })

  it('resolves gliding {value} metrics from raw inputs', () => {
    const tokens = buildFlexiBarTokens(bar(), true)
    // A bare {value} falls back to the snapped display value…
    expect(renderBarFieldText({ template: '{value}' }, tokens, bar({ rawDps: 15000 }), 'abbreviated'))
      .toBe('12.3k')
    // …while dps/rdps templates track the gliding raw inputs.
    expect(renderBarFieldText({ template: '{value} dps' }, tokens, bar({ rawDps: 15000 }), 'abbreviated'))
      .toBe('15.0k dps')
    expect(renderBarFieldText({ template: '{value} rdps' }, tokens, bar({ rawRdps: 20000 }), 'abbreviated'))
      .toBe('20.0k rdps')
  })

  it('applies per-field valueFormat overrides to the metric tokens', () => {
    const tokens = buildFlexiBarTokens(bar(), true, 'abbreviated')
    expect(renderBarFieldText({ template: '{value}', valueFormat: 'raw' }, tokens, bar(), 'abbreviated'))
      .toBe('12345')
  })
})
