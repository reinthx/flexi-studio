import { expect, it } from 'vitest'
import type { AbilityStats, CastEvent } from '@shared/configSchema'
import { buildCastPlayerData, buildCastTimelineGroups, buildCastTimelineRows, castCategory, isMitigationAbility } from '../castTimeline'

const cast = (partial: Partial<CastEvent>): CastEvent => ({
  t: 0, abilityName: 'Strike', abilityId: '1', source: 'Player', target: 'Boss', type: 'instant', ...partial,
})
const ability = (partial: Partial<AbilityStats>): AbilityStats => ({
  abilityId: '1', abilityName: 'Strike', totalDamage: 0, hits: 0, maxHit: 0, minHit: 0, ...partial,
})

it('builds cast ability rows with targets, healing, labels, and cadence', () => {
  const data = buildCastPlayerData([
    cast({ t: 1000, abilityName: 'Strike', target: 'Boss', targetId: 'a' }),
    cast({ t: 4000, abilityName: 'Strike', target: 'Boss', targetId: 'b' }),
    cast({ t: 9000, abilityName: 'Heal', target: 'Ally' }),
  ], {
    strike: ability({ abilityName: 'Strike', targetInstances: { a: { name: 'Boss', id: 'a', total: 300, hits: 3 }, b: { name: 'Boss', id: 'b', total: 100, hits: 1 } } }),
  }, {
    Ally: { heal: ability({ abilityName: 'Heal', sources: { Player: { total: 200, hits: 2, overheal: 50 } } }) },
  }, 'Player')

  expect(data?.maxDuration).toBe(9000)
  expect(data?.abilities.map(row => row.name)).toEqual(['Strike', 'Heal'])
  expect(data?.abilities[0]).toMatchObject({ casts: 2, avgInterval: '3.0', topTargets: [['Boss #1', 2], ['Boss #2', 1]] })
  expect(data?.abilities[1].targets[0]).toMatchObject({ name: 'Ally', healing: 200, overheal: 50, casts: 1 })
})

it('categorizes and groups cast timeline rows', () => {
  expect([castCategory(cast({ abilityName: 'Rampart' })), castCategory(cast({ abilityName: 'Swiftcast' })), castCategory(cast({ abilityName: 'Cure II' })), castCategory(cast({ abilityName: 'Strike' }))]).toEqual(['mitigations', 'cooldowns', 'heals', 'dps'])
  expect(isMitigationAbility('Rampart')).toBe(true)
  const rows = buildCastTimelineRows([
    { name: 'Strike', casts: 1, avgInterval: '0.0', topTargets: [], targets: [], events: [cast({ abilityName: 'Strike' })] },
    { name: 'Rampart', casts: 1, avgInterval: '0.0', topTargets: [], targets: [], events: [cast({ abilityName: 'Rampart' })] },
  ], new Set(['dps', 'mitigations']))
  expect(buildCastTimelineGroups(rows, new Set(['mitigations'])).map(group => [group.category, group.collapsed, group.rows.length])).toEqual([['mitigations', true, 1], ['dps', false, 1]])
})
