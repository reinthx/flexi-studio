import { describe, expect, it } from 'vitest'
import {
  actionEffectKind,
  actionEffectSeverity,
  combatantNameAliases,
  accumulateTimelineBucket,
  decodeLogDamage,
  decodeTickAmount,
  DEATH_WINDOW_MS,
  isEnemyId,
  isPlayerId,
  isRaiseEffect,
  makeDeathHit,
  normalizeEffectId,
  parseAbilityLine,
  parseActionEffectFlags,
  parseAddCombatantLine,
  parseDeathLine,
  parseDotTickLine,
  parseGainsEffectLine,
  parseLosesEffectLine,
  parseStartsCastingLine,
  resolveTickAbilityName,
  selectBuffWindows,
  sliceDeathWindow,
  splitHeal,
  tickEffectKey,
  timelineBucketIndex,
} from './logLine'

describe('logLine ids', () => {
  it('classifies player and enemy network ids', () => {
    expect(isPlayerId('10001234')).toBe(true)
    expect(isPlayerId('40001234')).toBe(false)
    expect(isEnemyId('40001234')).toBe(true)
    expect(isEnemyId('10001234')).toBe(false)
  })

  it('normalizes effect ids and builds tick keys', () => {
    expect(normalizeEffectId(' ab1 ')).toBe('AB1')
    expect(normalizeEffectId('')).toBe('')
    expect(tickEffectKey('src', 'tgt')).toBe('src|tgt')
    expect(tickEffectKey('', '')).toBe('|')
  })

  it('resolves YOU/self aliases', () => {
    expect(combatantNameAliases('Bob', 'Alice')).toEqual(['Bob'])
    expect(combatantNameAliases('YOU', 'Alice')).toEqual(['YOU', 'Alice'])
    expect(combatantNameAliases('Alice', 'Alice')).toEqual(['Alice', 'YOU'])
    expect(combatantNameAliases('YOU', '')).toEqual(['YOU'])
  })
})

describe('parseActionEffectFlags', () => {
  it('splits kind and severity from one parse', () => {
    expect(parseActionEffectFlags('3')).toEqual({ kind: 0x03, severity: 0 })
    expect(parseActionEffectFlags('4')).toEqual({ kind: 0x04, severity: 0 })
    expect(parseActionEffectFlags('2003')).toEqual({ kind: 0x03, severity: 0x20 })
    expect(parseActionEffectFlags('4003')).toEqual({ kind: 0x03, severity: 0x40 })
    expect(parseActionEffectFlags('6003')).toEqual({ kind: 0x03, severity: 0x60 })
    expect(parseActionEffectFlags('712003')).toEqual({ kind: 0x03, severity: 0x20 })
  })

  it('returns zeros for invalid flags', () => {
    expect(parseActionEffectFlags('')).toEqual({ kind: 0, severity: 0 })
    expect(parseActionEffectFlags('zz')).toEqual({ kind: 0, severity: 0 })
  })

  it('agrees with the single-purpose helpers', () => {
    for (const flags of ['3', '4', '2003', '4003', '6003', '712003', '0', 'zz']) {
      expect(actionEffectKind(flags)).toBe(parseActionEffectFlags(flags).kind)
      expect(actionEffectSeverity(flags)).toBe(parseActionEffectFlags(flags).severity)
    }
  })
})

describe('decodeLogDamage', () => {
  it('rejects empty/zero/garbage', () => {
    expect(decodeLogDamage('')).toBe(0)
    expect(decodeLogDamage('0')).toBe(0)
    expect(decodeLogDamage('xyz')).toBe(0)
  })

  it('decodes both packing branches', () => {
    // lower without 0x4000 bit -> upper word only
    expect(decodeLogDamage('10000')).toBe(1)
    // lower with 0x4000 bit -> upper | ((lower & 0x3FFF) + 1) << 16
    expect(decodeLogDamage('4000')).toBe(0x10000)
  })
})

describe('decodeTickAmount', () => {
  it('rejects empty/zero/garbage', () => {
    expect(decodeTickAmount('')).toBe(0)
    expect(decodeTickAmount('0')).toBe(0)
  })

  it('passes through plausible values', () => {
    expect(decodeTickAmount('100')).toBe(0x100)
    expect(decodeTickAmount('100', 100000)).toBe(0x100)
  })

  it('unmasks oversized values against the ceiling', () => {
    expect(decodeTickAmount('FFFFFFFF', 100000)).toBe(0xFFFF)
    expect(decodeTickAmount('FFFFFFFF')).toBe(0xFFFF)
  })
})

function makeParts(overrides: Record<number, string>, length = 50): string[] {
  const parts = new Array<string>(length).fill('')
  for (const [index, value] of Object.entries(overrides)) parts[Number(index)] = value
  return parts
}

describe('parseAddCombatantLine', () => {
  it('maps id/name/job slots', () => {
    expect(parseAddCombatantLine(makeParts({ 2: '40001234', 3: 'Boss', 4: '00' })))
      .toEqual({ id: '40001234', name: 'Boss', jobOrClass: '00' })
  })

  it('rejects short lines', () => {
    expect(parseAddCombatantLine(['03', 'ts'])).toBeNull()
  })
})

describe('parseStartsCastingLine', () => {
  it('maps slots and converts seconds to ms', () => {
    const parsed = parseStartsCastingLine(makeParts({
      2: '10001234', 3: 'Alice', 4: '1D5C', 5: 'Fire IV',
      6: '40001234', 7: 'Boss', 8: '2.5',
    }))
    expect(parsed).toEqual({
      sourceId: '10001234', sourceName: 'Alice', abilityId: '1D5C', abilityName: 'Fire IV',
      targetId: '40001234', targetName: 'Boss', castTimeMs: 2500,
    })
  })

  it('rejects missing source/ability, bad duration, and short lines', () => {
    const base = { 2: '1', 3: 'Alice', 4: '1D5C', 5: 'Fire', 6: '2', 7: 'Boss', 8: '2.5' }
    expect(parseStartsCastingLine(makeParts({ ...base, 3: '' }))).toBeNull()
    expect(parseStartsCastingLine(makeParts({ ...base, 4: '' }))).toBeNull()
    expect(parseStartsCastingLine(makeParts({ ...base, 8: '0' }))).toBeNull()
    expect(parseStartsCastingLine(makeParts({ ...base, 8: 'xx' }))).toBeNull()
    expect(parseStartsCastingLine(['20', 'ts'])).toBeNull()
  })
})

describe('parseAbilityLine', () => {
  const base = {
    2: '10001234', 3: 'Alice', 4: '1D5C', 5: 'Fire IV',
    6: '40001234', 7: 'Boss', 8: '3', 9: '10000',
    24: '900000', 25: '1000000',
  }

  it('parses a damage hit with hp slots', () => {
    const parsed = parseAbilityLine(makeParts(base))!
    expect(parsed.flagByte).toBe(0x03)
    expect(parsed.flagSeverity).toBe(0)
    expect(parsed.amount).toBe(1)
    expect(parsed.tgtCurrentHp).toBe(900000)
    expect(parsed.tgtMaxHp).toBe(1000000)
    expect(parsed.effectiveName).toBe('Alice')
    expect(parsed.additionalHeals).toEqual([])
  })

  it('resolves pet owner as the effective name', () => {
    const parsed = parseAbilityLine(makeParts({ ...base, 47: '10001234', 48: 'Alice' }))!
    expect(parsed.petOwnerName).toBe('Alice')
    expect(parsed.effectiveName).toBe('Alice')
  })

  it('splits crit severity and decodes heals', () => {
    const parsed = parseAbilityLine(makeParts({ ...base, 8: '2003', 9: '20000' }))!
    expect(parsed.flagSeverity).toBe(0x20)
    const heal = parseAbilityLine(makeParts({ ...base, 8: '4' }))!
    expect(heal.flagByte).toBe(0x04)
  })

  it('collects additional-effect heals and skips damage slots', () => {
    const parsed = parseAbilityLine(makeParts({
      ...base, 10: '3', 11: '10000', 12: '4', 13: '20000', 14: '4', 15: '0',
    }))!
    expect(parsed.additionalHeals).toEqual([2])
  })

  it('rejects short lines', () => {
    expect(parseAbilityLine(['21', 'ts'])).toBeNull()
  })
})

describe('parseDotTickLine', () => {
  const base = {
    2: '40001234', 3: 'Boss', 4: 'DoT', 5: 'ABC', 6: '100',
    7: '900000', 8: '1000000', 17: '10001234', 18: 'Alice',
  }

  it('maps slots including the srcName fix at index 18', () => {
    expect(parseDotTickLine(makeParts(base))).toEqual({
      targetId: '40001234', targetName: 'Boss', dotType: 'DoT', effectId: 'ABC',
      amountHex: '100', tgtCurrentHp: 900000, tgtMaxHp: 1000000,
      sourceId: '10001234', sourceName: 'Alice',
    })
  })

  it('rejects wrong dot types and short lines', () => {
    expect(parseDotTickLine(makeParts({ ...base, 4: 'Hit' }))).toBeNull()
    expect(parseDotTickLine(makeParts({ ...base }).slice(0, 10))).toBeNull()
  })
})

describe('resolveTickAbilityName', () => {
  it('prefers recorded, active, fallback, synthetic in order', () => {
    expect(resolveTickAbilityName('DoT', 'A', { recordedName: 'R', activeName: 'B', jobFallback: 'C' })).toBe('R')
    expect(resolveTickAbilityName('DoT', 'A', { activeName: 'B', jobFallback: 'C' })).toBe('B')
    expect(resolveTickAbilityName('HoT', 'A', { jobFallback: 'C' })).toBe('C')
    expect(resolveTickAbilityName('DoT', 'ABC', {})).toBe('DoT (ABC)')
    expect(resolveTickAbilityName('HoT', '', {})).toBe('HoT (unknown)')
  })
})

describe('parseDeathLine', () => {
  it('maps target slots', () => {
    expect(parseDeathLine(makeParts({ 2: '10001234', 3: 'Alice' }))).toEqual({ targetId: '10001234', targetName: 'Alice' })
  })

  it('rejects missing target fields', () => {
    expect(parseDeathLine(makeParts({ 2: '', 3: 'Alice' }))).toBeNull()
    expect(parseDeathLine(['25', 'ts'])).toBeNull()
  })
})

describe('death window helpers', () => {
  it('slices buffers to the 35s window', () => {
    const events = [{ t: 1000 }, { t: 60000 }, { t: 90000 }]
    expect(sliceDeathWindow(events, 90000)).toEqual([{ t: 60000 }, { t: 90000 }])
    expect(DEATH_WINDOW_MS).toBe(35000)
  })

  it('synthesizes the terminal death hit', () => {
    expect(makeDeathHit(90000, 100000)).toEqual({
      t: 90000, type: 'dmg', abilityName: 'Death', sourceName: '---',
      amount: 0, currentHp: 0, maxHp: 100000, hp: 0,
    })
  })
})

describe('parseGainsEffectLine / parseLosesEffectLine', () => {
  const base = {
    2: 'AB1', 3: 'Battle Litany', 4: '20',
    5: '10001234', 6: 'Alice', 7: '10005678', 8: 'Bob',
  }

  it('maps gains slots', () => {
    expect(parseGainsEffectLine(makeParts(base))).toEqual({
      effectId: 'AB1', effectName: 'Battle Litany', durationSec: 20,
      sourceId: '10001234', sourceName: 'Alice', targetId: '10005678', targetName: 'Bob',
    })
  })

  it('rejects gains lines without a target', () => {
    expect(parseGainsEffectLine(makeParts({ ...base, 8: '' }))).toBeNull()
  })

  it('maps loses slots and rejects blank names', () => {
    expect(parseLosesEffectLine(makeParts(base))?.effectName).toBe('Battle Litany')
    expect(parseLosesEffectLine(makeParts({ ...base, 3: '' }))).toBeNull()
    expect(parseLosesEffectLine(makeParts({ ...base, 6: '' }))).toBeNull()
  })
})

describe('isRaiseEffect', () => {
  it('matches known resurrection effects case-insensitively', () => {
    expect(isRaiseEffect('Raise')).toBe(true)
    expect(isRaiseEffect('  Angel Whisper ')).toBe(true)
    expect(isRaiseEffect('Resurrection')).toBe(true)
    expect(isRaiseEffect(undefined)).toBe(false)
    expect(isRaiseEffect('Battle Litany')).toBe(false)
  })
})

describe('splitHeal', () => {
  it('rejects non-positive heals', () => {
    expect(splitHeal(0, undefined, 100, 200)).toEqual({ effective: 0, overheal: 0 })
  })

  it('passes raw through when hp is unknown', () => {
    expect(splitHeal(500, undefined, NaN, 1000)).toEqual({ effective: 500, overheal: 0 })
    expect(splitHeal(500, undefined, 100, 0)).toEqual({ effective: 500, overheal: 0 })
  })

  it('uses the previous-sample delta', () => {
    expect(splitHeal(500, { currentHp: 100, maxHp: 1000 }, 400, 1000))
      .toEqual({ effective: 300, overheal: 200 })
  })

  it('clamps negative deltas and full-hp no-sample heals to zero', () => {
    expect(splitHeal(500, { currentHp: 400, maxHp: 1000 }, 300, 1000))
      .toEqual({ effective: 0, overheal: 500 })
    expect(splitHeal(500, undefined, 1000, 1000)).toEqual({ effective: 0, overheal: 500 })
  })
})

describe('selectBuffWindows', () => {
  const windows = [
    { sourceName: 'Alice', effectName: 'Litany' },
    { sourceName: 'Bob', effectName: 'Chain' },
  ]
  const windowsFor = (name: string) => name === 'Alice' ? [windows[0]] : name === 'Boss' ? [windows[1]] : []

  it('fans out over YOU/self aliases and excludes self-applied buffs', () => {
    // Dealer Alice (real name): her own Litany is dropped, Bob's Chain on the
    // target is kept.
    expect(selectBuffWindows('Alice', 'Boss', 'Alice', windowsFor)).toEqual([windows[1]])
    // Dealer recorded as YOU: alias fan-out still finds Alice's windows, and
    // the self-applied exclusion compares exact strings (store behavior).
    expect(selectBuffWindows('YOU', 'Boss', 'Alice', windowsFor)).toEqual(windows)
  })

  it('returns empty when nothing is active', () => {
    expect(selectBuffWindows('Alice', 'Boss', 'Alice', () => [])).toEqual([])
  })
})

describe('timelineBucketIndex / accumulateTimelineBucket', () => {
  it('maps pull offsets to 3s buckets', () => {
    expect(timelineBucketIndex(0)).toBe(0)
    expect(timelineBucketIndex(2999)).toBe(0)
    expect(timelineBucketIndex(3000)).toBe(1)
    expect(timelineBucketIndex(9000)).toBe(3)
  })

  it('accumulates into the current bucket', () => {
    const timeline: Record<string, number[]> = {}
    accumulateTimelineBucket(timeline, 'Alice', 100, 1000)
    accumulateTimelineBucket(timeline, 'Alice', 50, 2000)
    expect(timeline.Alice).toEqual([150])
  })

  it('zero-fills skipped buckets and tracks combatants separately', () => {
    const timeline: Record<string, number[]> = {}
    accumulateTimelineBucket(timeline, 'Alice', 100, 0)
    accumulateTimelineBucket(timeline, 'Alice', 25, 7000)
    accumulateTimelineBucket(timeline, 'Bob', 10, 1000)
    expect(timeline.Alice).toEqual([100, 0, 25])
    expect(timeline.Bob).toEqual([10])
  })
})
