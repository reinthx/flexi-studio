import { describe, expect, it } from 'vitest'
import {
  actionEffectKind,
  actionEffectSeverity,
  combatantNameAliases,
  decodeLogDamage,
  decodeTickAmount,
  isEnemyId,
  isPlayerId,
  normalizeEffectId,
  parseActionEffectFlags,
  tickEffectKey,
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
