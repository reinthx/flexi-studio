import { describe, expect, it } from 'vitest'
import {
  entryPullLabel,
  fmtSeconds,
  fmtTime,
  formatEntryDelta,
  formatPartyLabel,
  hitRange,
  overhealPct,
  parseEntryDuration,
  pctOf,
  pullOutcomeClass,
  rawHealingAverage,
} from '../formatters'
import type { PullEntry } from '../types'

describe('AbilityBreakdown formatters', () => {
  it('formats alliance and party labels from ACT party data', () => {
    expect(formatPartyLabel('AllianceA', false)).toBe('Alliance A')
    expect(formatPartyLabel('Solo', false, 9, 24)).toBe('Alliance B')
    expect(formatPartyLabel('Solo', true, 0, 24)).toBe('Alliance A (YOU)')
    expect(formatPartyLabel('Solo', false, undefined, 8)).toBe('Party')
  })

  it('formats percentages and hit ranges', () => {
    expect(pctOf(3, 12)).toBe('25.0%')
    expect(pctOf(0, 12)).toBe('-')
    expect(hitRange(1000, 2500, n => `${n / 1000}k`)).toBe('1k - 2.5k')
    expect(hitRange(undefined, 2500, String)).toBe('-')
  })

  it('computes raw healing and overheal percentages', () => {
    expect(rawHealingAverage({ totalDamage: 80, overheal: 20, hits: 4 })).toBe(25)
    expect(rawHealingAverage({ totalDamage: 80, hits: 0 })).toBe(0)
    expect(overhealPct({ totalDamage: 80, overheal: 20 })).toBe('20.0')
    expect(overhealPct({ totalDamage: 0, overheal: 0 })).toBe('0.0')
  })

  it('formats millisecond and second durations', () => {
    expect(fmtTime(65000)).toBe('1:05')
    expect(fmtTime(-1)).toBe('0:00')
    expect(fmtSeconds(125.9)).toBe('2:05')
    expect(fmtSeconds(0)).toBe('0:00')
  })

  it('formats pull entries and deltas', () => {
    const live = { index: null, duration: '0:00' } as PullEntry
    const pull = { index: 1, pullNumber: 4, duration: '01:02:03', pullOutcome: 'clear' } as PullEntry

    expect(entryPullLabel(live)).toBe('Live')
    expect(entryPullLabel(pull)).toBe('Pull 4')
    expect(parseEntryDuration(pull)).toBe(3723)
    expect(parseEntryDuration({ duration: '2:03' } as PullEntry)).toBe(123)
    expect(formatEntryDelta(0, String)).toBe('same')
    expect(formatEntryDelta(-12, n => `${n}s`)).toBe('-12s')
    expect(pullOutcomeClass(pull)).toBe('success')
    expect(pullOutcomeClass({ pullOutcome: 'wipe' } as PullEntry)).toBe('danger')
    expect(pullOutcomeClass(null)).toBe('')
  })
})
