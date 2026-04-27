import { describe, it, expect } from 'vitest'
import { RAID_BUFFS, type RaidBuff } from '../raidBuffs'

describe('RAID_BUFFS', () => {
  it('contains damage multiplier for technical finish', () => {
    const buff = RAID_BUFFS['technical finish']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains damage multiplier for brotherhood', () => {
    const buff = RAID_BUFFS['brotherhood']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains damage multiplier for divination', () => {
    const buff = RAID_BUFFS['divination']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.06)
  })

  it('contains damage multiplier for embolden', () => {
    const buff = RAID_BUFFS['embolden']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains damage multiplier for searing light', () => {
    const buff = RAID_BUFFS['searing light']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains starry muse', () => {
    const buff = RAID_BUFFS['starry muse']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains arcane circle', () => {
    const buff = RAID_BUFFS['arcane circle']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.03)
  })

  it('contains mug', () => {
    const buff = RAID_BUFFS['mug']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains battle litany', () => {
    const buff = RAID_BUFFS['battle litany']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains chain stratagem', () => {
    const buff = RAID_BUFFS['chain stratagem']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains battle voice', () => {
    const buff = RAID_BUFFS['battle voice']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains standard finish', () => {
    const buff = RAID_BUFFS['standard finish']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('contains radiant finale', () => {
    const buff = RAID_BUFFS['radiant finale']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.06)
  })

  it('contains dokumori', () => {
    const buff = RAID_BUFFS['dokumori']
    expect(buff).toBeDefined()
    expect(buff?.multiplier).toBe(1.05)
  })

  it('all multipliers are greater than 1', () => {
    for (const [name, buff] of Object.entries(RAID_BUFFS)) {
      expect(buff.multiplier).toBeGreaterThan(1)
    }
  })

  it('handles known buff names', () => {
    expect(RAID_BUFFS['technical finish']?.multiplier).toBe(1.05)
    expect(RAID_BUFFS['brotherhood']?.multiplier).toBe(1.05)
    expect(RAID_BUFFS['divination']?.multiplier).toBe(1.06)
  })

  it('returns undefined for unknown buff', () => {
    expect(RAID_BUFFS['fake buff name']).toBeUndefined()
  })

  it('has note for variable buffs', () => {
    const standardFinish = RAID_BUFFS['standard finish']
    expect(standardFinish?.note).toBeDefined()
  })
})