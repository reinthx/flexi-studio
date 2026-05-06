import { expect, it } from 'vitest'
import type { PullEntry } from '../types'
import { bestProgressPullEntry, bestPullEntry, buildPullDashboardContext, buildPullDamageRows, enemyProgressDetail, enemyProgressHeadline, enemyProgressMeta, partyHasRaidBuffJobs, previousPullEntry, pullBuffWarnings, pullDashboardNotes, pullEnemyHpDetail, pullHasRaidBuffCast, pullHasRaidBuffCredit } from '../pullInsights'

const pull = (partial: Partial<PullEntry>): PullEntry => ({ index: 1, encounterName: 'Raid', duration: '1:00', ...partial })
const f = (value: number) => `${value}`

it('formats enemy progress and HP details', () => {
  const clear = pull({ pullOutcome: 'clear', primaryEnemyName: 'Boss', primaryEnemyMaxHp: 1000 })
  const wipe = pull({ pullOutcome: 'wipe', bossPercent: 12.3, primaryEnemyName: 'Boss', primaryEnemyCurrentHp: 123 })
  expect([enemyProgressHeadline(clear), enemyProgressHeadline(wipe)]).toEqual(['Cleared Boss', '12.3% Boss'])
  expect([enemyProgressMeta(wipe), pullEnemyHpDetail(clear, f), enemyProgressDetail(wipe, wipe, f)]).toEqual(['No enemy progress captured', 'Max HP 1000', 'best progress · HP Remaining 123'])
})

it('selects previous, longest, best progress, and dashboard notes', () => {
  const entries = [
    pull({ index: 1, pullNumber: 1, duration: '1:00', deaths: 3, dps: 1000, bossPercent: 30 }),
    pull({ index: 2, pullNumber: 2, duration: '2:30', deaths: 1, dps: 3000, bossPercent: 20, pullOutcome: 'wipe', bossPercentLabel: '20%' }),
  ]
  const current = entries[1]
  expect(previousPullEntry(current, entries)).toBe(entries[0])
  expect(bestPullEntry(entries)).toBe(current)
  expect(bestProgressPullEntry(entries)).toBe(current)
  expect(pullDashboardNotes(current, entries, entries[0], current, current, [{ start: 1000, end: 12000, count: 2 }], f, f, ms => `${ms}`)).toContain('Best enemy progress for this encounter.')
})

it('builds pull dashboard context for selected encounter', () => {
  const entries = [
    pull({ index: null, encounterId: 'live', encounterName: 'Live' }),
    pull({ index: 1, encounterId: 'a', pullNumber: 1, duration: '1:00', bossPercent: 40, deaths: 2 }),
    pull({ index: 2, encounterId: 'a', pullNumber: 2, duration: '2:00', bossPercent: 20, deaths: 1, pullOutcome: 'wipe', bossPercentLabel: '20%' }),
    pull({ index: 3, encounterId: 'b', pullNumber: 1, duration: '3:00', bossPercent: 10 }),
  ]

  const context = buildPullDashboardContext(entries, 2, [{ start: 3000, end: 8000, count: 2 }], f, f, ms => `${ms}`)

  expect(context.historicalPullEntries.map(entry => entry.index)).toEqual([1, 2, 3])
  expect(context.selectedPullEntry?.index).toBe(2)
  expect(context.selectedEncounterPullEntries.map(entry => entry.index)).toEqual([1, 2])
  expect(context.previousPullEntry?.index).toBe(1)
  expect(context.bestPullEntry?.index).toBe(2)
  expect(context.bestProgressPullEntry?.index).toBe(2)
  expect(context.enemyProgressHeadline).toBe('20%')
  expect(context.pullDashboardNotes).toContain('Best enemy progress for this encounter.')
})

it('builds sorted pull damage attribution rows', () => {
  const rows = buildPullDamageRows(['A', 'B'], {
    attributionDamageFor: name => name === 'A' ? 100 : 300,
    dpsFor: () => 1,
    rdpsFor: () => 2,
    rdpsGivenFor: () => 3,
    rdpsTakenFor: () => 4,
    deathCountFor: name => name === 'A' ? 1 : 0,
  })
  expect(rows.map(row => [row.name, row.pct, row.width])).toEqual([['B', '75.0', '75.0%'], ['A', '25.0', '25.0%']])
})

it('builds pull buff warnings from casts, jobs, and raid buff credit', () => {
  const cast = { t: 1000, abilityId: '1', abilityName: 'Technical Finish', source: 'Dancer', target: 'Party', type: 'instant' as const }
  expect(pullHasRaidBuffCredit({ Dancer: 1 })).toBe(true)
  expect(pullHasRaidBuffCast({ Dancer: [cast] })).toBe(true)
  expect(partyHasRaidBuffJobs([{ id: 1, name: 'Dancer', worldId: 1, job: 'DNC', inParty: true }], [], () => 'DNC')).toBe(true)
  expect(pullBuffWarnings({
    activeView: 'pulls',
    selectedName: 'Healer',
    castData: { Healer: [{ ...cast, abilityName: 'Glare', source: 'Healer' }] },
    jobFor: () => 'WHM',
    hasRaidBuffJobs: true,
    hasRaidBuffCast: false,
    hasRaidBuffCredit: false,
  })).toEqual(['No direct heals cast', 'No raid buffs detected'])
  expect(pullBuffWarnings({
    activeView: 'events',
    selectedName: 'Healer',
    castData: {},
    jobFor: () => 'WHM',
    hasRaidBuffJobs: true,
    hasRaidBuffCast: false,
    hasRaidBuffCredit: false,
  })).toEqual([])
})
