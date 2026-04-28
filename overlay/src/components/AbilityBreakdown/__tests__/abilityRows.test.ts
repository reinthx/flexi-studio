import { expect, it } from 'vitest'
import type { AbilityStats } from '@shared/configSchema'
import { buildDoneTargetRows, buildHealingAbilityRows, buildSortedAbilityRows, totalAbilityDamage, totalAbilityOverheal, totalEncounterDamage } from '../abilityRows'

const ability = (partial: Partial<AbilityStats>): AbilityStats => ({
  abilityId: '1', abilityName: 'Hit', totalDamage: 0, hits: 0, maxHit: 0, minHit: 0, ...partial,
})

it('sums damage, overheal, and encounter damage', () => {
  const data = {
    a: ability({ totalDamage: 100, overheal: 25 }),
    b: ability({ totalDamage: 50 }),
  }
  expect(totalAbilityDamage(data)).toBe(150)
  expect(totalAbilityOverheal(data)).toBe(25)
  expect(totalEncounterDamage({ Player: data, Other: { c: ability({ totalDamage: 10 }) } })).toBe(160)
})

it('derives display fields and sorts by numeric columns', () => {
  const rows = buildSortedAbilityRows({
    a: ability({ abilityId: 'a', abilityName: 'Alpha', totalDamage: 200, hits: 4, minHit: Infinity, maxHit: 80, critHits: 1 }),
    b: ability({ abilityId: 'b', abilityName: 'Beta', totalDamage: 100, hits: 2, minHit: 20, maxHit: 60 }),
  }, 300, 10, 'totalDamage', true)
  expect(rows.map(row => row.abilityName)).toEqual(['Alpha', 'Beta'])
  expect(rows[0]).toMatchObject({ pct: '66.7', avg: 50, dps: 20, minHit: 0, critPct: '25.0%' })
})

it('sorts by ability name in either direction', () => {
  const data = { a: ability({ abilityName: 'Alpha', totalDamage: 1 }), b: ability({ abilityName: 'Beta', totalDamage: 1 }) }
  expect(buildSortedAbilityRows(data, 2, 1, 'abilityName', false).map(row => row.abilityName)).toEqual(['Alpha', 'Beta'])
  expect(buildSortedAbilityRows(data, 2, 1, 'abilityName', true).map(row => row.abilityName)).toEqual(['Beta', 'Alpha'])
})

it('sorts healing by effective plus overheal while preserving derived fields', () => {
  const rows = buildHealingAbilityRows({
    a: ability({ abilityName: 'Small', totalDamage: 100, overheal: 0, hits: 1 }),
    b: ability({ abilityName: 'Big Overheal', totalDamage: 80, overheal: 50, hits: 2 }),
  }, 180, 20)
  expect(rows.map(row => row.abilityName)).toEqual(['Big Overheal', 'Small'])
  expect(rows[0]).toMatchObject({ pct: '44.4', avg: 40, dps: 4 })
})

it('combines casts, outgoing target damage, and selected-source healing', () => {
  const rows = buildDoneTargetRows([
    { abilityId: 'cast-1', abilityName: 'Cast One', target: 'Boss' } as any,
  ], {
    hit: ability({ abilityId: 'hit', abilityName: 'Hit', targets: { Boss: { total: 300, hits: 3 } } }),
  }, {
    Ally: {
      heal: ability({ abilityId: 'heal', abilityName: 'Heal', sources: { Player: { total: 100, hits: 1, overheal: 25 } } }),
    },
  }, 'Player')
  expect(rows.map(row => row.target)).toEqual(['Boss', 'Ally'])
  expect(rows[0]).toMatchObject({ casts: 1, damage: 300, damageHits: 3, pct: '70.7' })
  expect(rows[0].abilities.map(row => row.abilityName)).toEqual(['Hit', 'Cast One'])
  expect(rows[1]).toMatchObject({ healing: 100, overheal: 25, healingHits: 1, pct: '29.3' })
  expect(rows[1].abilities).toEqual([expect.objectContaining({ abilityName: 'Heal', healing: 100, overheal: 25, hits: 1 })])
})
