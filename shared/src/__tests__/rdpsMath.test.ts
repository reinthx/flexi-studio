import { describe, expect, it } from 'vitest'
import { allocatePercentageBuffDamage } from '../rdpsMath'

describe('allocatePercentageBuffDamage', () => {
  it('allocates a single buff as the removed buffed portion', () => {
    const result = allocatePercentageBuffDamage(110, [
      { sourceName: 'Alice', multiplier: 1.1 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.sourceName).toBe('Alice')
    expect(result[0]?.amount).toBeCloseTo(10)
  })

  it('uses FF Logs log weighting for stacked equal buffs', () => {
    const result = allocatePercentageBuffDamage(121, [
      { sourceName: 'Mary', multiplier: 1.1 },
      { sourceName: 'Alice', multiplier: 1.1 },
    ])

    expect(result).toHaveLength(2)
    expect(result.find(entry => entry.sourceName === 'Mary')?.amount).toBeCloseTo(10.5)
    expect(result.find(entry => entry.sourceName === 'Alice')?.amount).toBeCloseTo(10.5)
    expect(result.reduce((sum, entry) => sum + entry.amount, 0)).toBeCloseTo(21)
  })

  it('weights unequal buffs by their log multiplier share', () => {
    const damage = 115.5
    const result = allocatePercentageBuffDamage(damage, [
      { sourceName: 'Five', multiplier: 1.05 },
      { sourceName: 'Ten', multiplier: 1.1 },
    ])
    const totalMultiplier = 1.05 * 1.1
    const buffDamage = damage - damage / totalMultiplier

    expect(result.find(entry => entry.sourceName === 'Five')?.amount)
      .toBeCloseTo(buffDamage * Math.log(1.05) / Math.log(totalMultiplier))
    expect(result.find(entry => entry.sourceName === 'Ten')?.amount)
      .toBeCloseTo(buffDamage * Math.log(1.1) / Math.log(totalMultiplier))
  })

  it('combines multiple windows from the same source', () => {
    const result = allocatePercentageBuffDamage(121, [
      { sourceName: 'Alice', multiplier: 1.1 },
      { sourceName: 'Alice', multiplier: 1.1 },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.sourceName).toBe('Alice')
    expect(result[0]?.amount).toBeCloseTo(21)
  })

  it('ignores non-positive damage and invalid multipliers', () => {
    expect(allocatePercentageBuffDamage(0, [{ sourceName: 'Alice', multiplier: 1.1 }])).toEqual([])
    expect(allocatePercentageBuffDamage(100, [{ sourceName: 'Alice', multiplier: 1 }])).toEqual([])
    expect(allocatePercentageBuffDamage(100, [{ sourceName: '', multiplier: 1.1 }])).toEqual([])
  })

  it('rejects non-finite damage and multipliers', () => {
    const buff = [{ sourceName: 'Alice', multiplier: 1.1 }]
    expect(allocatePercentageBuffDamage(NaN, buff)).toEqual([])
    expect(allocatePercentageBuffDamage(Infinity, buff)).toEqual([])
    expect(allocatePercentageBuffDamage(-100, buff)).toEqual([])
    expect(allocatePercentageBuffDamage(100, [])).toEqual([])
    expect(allocatePercentageBuffDamage(100, [{ sourceName: 'Alice', multiplier: NaN }])).toEqual([])
    expect(allocatePercentageBuffDamage(100, [{ sourceName: 'Alice', multiplier: Infinity }])).toEqual([])
    expect(allocatePercentageBuffDamage(100, [{ sourceName: 'Alice', multiplier: 0.5 }])).toEqual([])
  })

  it('bails out when stacked multipliers overflow', () => {
    expect(allocatePercentageBuffDamage(100, [
      { sourceName: 'A', multiplier: 1e308 },
      { sourceName: 'B', multiplier: 1e308 },
    ])).toEqual([])
  })

  it('conserves total buff damage across three unequal buffs', () => {
    const damage = 100000
    const windows = [
      { sourceName: 'Five', multiplier: 1.05 },
      { sourceName: 'Ten', multiplier: 1.1 },
      { sourceName: 'Fifteen', multiplier: 1.15 },
    ]
    const result = allocatePercentageBuffDamage(damage, windows)
    const totalMultiplier = 1.05 * 1.1 * 1.15
    const buffDamage = damage - damage / totalMultiplier

    expect(result).toHaveLength(3)
    expect(result.reduce((sum, entry) => sum + entry.amount, 0)).toBeCloseTo(buffDamage, 6)
    for (const window of windows) {
      const expected = buffDamage * Math.log(window.multiplier) / Math.log(totalMultiplier)
      expect(result.find(entry => entry.sourceName === window.sourceName)?.amount).toBeCloseTo(expected, 6)
    }
  })

  it('credits hairline multipliers instead of dropping them', () => {
    const result = allocatePercentageBuffDamage(1000000, [{ sourceName: 'Alice', multiplier: 1 + 1e-9 }])
    expect(result).toHaveLength(1)
    expect(result[0]?.amount).toBeGreaterThan(0)
  })
})
