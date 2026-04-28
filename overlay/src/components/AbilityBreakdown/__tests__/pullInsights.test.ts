import { expect, it } from 'vitest'
import type { PullEntry } from '../types'
import { bestProgressPullEntry, bestPullEntry, buildPullDamageRows, enemyProgressDetail, enemyProgressHeadline, enemyProgressMeta, previousPullEntry, pullDashboardNotes, pullEnemyHpDetail } from '../pullInsights'

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
