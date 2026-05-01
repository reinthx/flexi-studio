import { expect, it } from 'vitest'
import type { AbilityStats, CastEvent, HitRecord } from '@shared/configSchema'
import {
  buildCastMitigationEffectiveness,
  buildCastEventInspectorRows,
  buildCastInspectorRows,
  buildMitigationInspectorRows,
  buildCastPlayerData,
  buildCastTimeTicks,
  buildCastTimelineContext,
  buildCastTimelineGroups,
  buildCastTimelineRows,
  castCategory,
  castCooldownLabel,
  castEventKey,
  isMitigationAbility,
  mitigationReductionPercent,
  selectedCastEventsForAbility,
  singleSelectedCastEvent,
} from '../castTimeline'

const cast = (partial: Partial<CastEvent>): CastEvent => ({
  t: 0, abilityName: 'Strike', abilityId: '1', source: 'Player', target: 'Boss', type: 'instant', ...partial,
})
const ability = (partial: Partial<AbilityStats>): AbilityStats => ({
  abilityId: '1', abilityName: 'Strike', totalDamage: 0, hits: 0, maxHit: 0, minHit: 0, ...partial,
})
const hit = (partial: Partial<HitRecord>): HitRecord => ({
  t: 0, abilityName: 'Attack', sourceName: 'Boss', amount: 1, type: 'dmg', ...partial,
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

it('builds the cast timeline context from player data and resource samples', () => {
  const playerData = buildCastPlayerData([
    cast({ t: 1000, abilityName: 'Strike', target: 'Boss' }),
    cast({ t: 35_000, abilityName: 'Rampart', target: 'Player' }),
  ], {}, {}, 'Player')
  const context = buildCastTimelineContext(playerData, new Set(['dps', 'mitigations']), new Set(['dps']), [
    { t: 0, currentHp: 1000, maxHp: 1000, hp: 1, currentMp: 5000, maxMp: 10_000, mp: 0.5 },
    { t: 35_000, currentHp: 750, maxHp: 1000, hp: 0.75, currentMp: 4500, maxMp: 10_000, mp: 0.45 },
  ])

  expect(context.duration).toBe(40)
  expect(context.timeTicks).toEqual([0, 30])
  expect(context.pixelWidth).toBe(1100)
  expect(context.rows.map(row => row.name)).toEqual(['Rampart', 'Strike'])
  expect(context.groups.map(group => [group.category, group.collapsed, group.rows.length])).toEqual([['mitigations', false, 1], ['dps', true, 1]])
  expect(context.resourceTracks.map(track => [track.key, track.value])).toEqual([['hp', '75%'], ['mp', '45%']])
  expect(buildCastTimeTicks(65)).toEqual([0, 30, 60])
  expect(castCooldownLabel(60_000)).toBe('60s cooldown')
  expect(castCooldownLabel(0)).toBe('')
})

it('summarizes mitigation effectiveness with selected and stacked windows', () => {
  const rampart = cast({ t: 1000, abilityName: 'Rampart', abilityId: 'rampart', source: 'Alice', target: 'Alice', buffDurationMs: 15_000 })
  const reprisal = cast({ t: 2000, abilityName: 'Reprisal', abilityId: 'reprisal', source: 'Bob', target: 'Boss', targetId: '4001', buffDurationMs: 10_000 })
  const data = buildCastMitigationEffectiveness({
    selectedPlayer: 'Alice',
    selectedAbility: { name: 'Rampart', casts: 1, avgInterval: '0.0', topTargets: [], targets: [], events: [rampart] },
    selectedEvents: [rampart],
    selectedEvent: rampart,
    allCastData: { Alice: [rampart], Bob: [reprisal] },
    hitData: { Alice: [hit({ t: 3000, amount: 800 }), hit({ t: 17_000, amount: 1000 }), hit({ t: 4000, amount: 0 })] },
    combatantJobs: { Alice: 'PLD', Bob: 'WAR' },
    partyNames: ['Alice', 'Bob'],
    combatantIds: { Boss: '4001' },
    formatNumber: value => `${value}`,
    formatTime: ms => `${ms / 1000}s`,
  })

  expect(data).toMatchObject({
    expected: '20%',
    hits: '1',
    stackedHits: '1',
    soloHits: '0',
    mitigated: '200',
    withoutThisMit: '1000',
    scope: 'Selected Cast',
  })
  expect(data?.stackedWith).toEqual([{
    key: castEventKey(reprisal),
    name: 'Reprisal',
    source: 'Bob',
    target: 'Boss',
    time: '2s',
    overlap: '10s',
    expected: '10%',
    overlapMs: 10_000,
  }])
  expect(mitigationReductionPercent('Rampart')).toBe(0.2)
})

it('builds cast inspector rows', () => {
  const event = cast({ t: 2500, abilityName: 'Rampart', target: 'Player', buffDurationMs: 15_000 })
  const abilityRow = { name: 'Rampart', casts: 2, avgInterval: '30.0', topTargets: [], targets: [{ name: 'Player', id: '', label: 'Player', casts: 2, hits: 0, damage: 0, healing: 0, overheal: 0 }], events: [event] }
  expect(buildCastInspectorRows(abilityRow)).toEqual([
    ['Ability', 'Rampart'],
    ['Casts', '2'],
    ['Avg Interval', '30.0s'],
    ['Target(s)', '1'],
  ])
  expect(buildCastEventInspectorRows(event, ms => `${ms}ms`)).toEqual([
    ['Time', '2500ms'],
    ['Target', 'Player'],
    ['Duration', '15.0s'],
  ])
  expect(buildMitigationInspectorRows({
    expected: '20%',
    hits: '3',
    stackedHits: '1',
    soloHits: '2',
    mitigated: '400',
    withoutThisMit: '2000',
    scope: 'All Casts',
    stackedWith: [],
  })).toEqual([
    ['Scope', 'All Casts'],
    ['Expected Reduction', '20%'],
    ['Hits in Duration', '3'],
    ['Solo / Stacked Hits', '2 / 1'],
    ['Reduced Damage Taken By', '400'],
    ['Damage Without This Mit', '2000'],
  ])
})

it('selects cast events by event key', () => {
  const first = cast({ t: 1000, abilityName: 'Rampart', target: 'Player' })
  const second = cast({ t: 2000, abilityName: 'Rampart', target: 'Player' })
  const abilityRow = { name: 'Rampart', casts: 2, avgInterval: '1.0', topTargets: [], targets: [], events: [first, second] }

  expect(selectedCastEventsForAbility(abilityRow, null)).toEqual([first, second])
  expect(selectedCastEventsForAbility(abilityRow, castEventKey(second))).toEqual([second])
  expect(singleSelectedCastEvent([second])).toBe(second)
  expect(singleSelectedCastEvent([first, second])).toBeNull()
})
