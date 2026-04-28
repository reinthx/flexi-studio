import { expect, it } from 'vitest'
import { buildOverviewTimelineBars, buildPullGroupDpsBars, deathClusters, topTimelineSpikes } from '../timelineSummary'

const fmtTime = (ms: number) => `${ms / 1000}s`
const fmt = (value: number) => value.toFixed(0)

it('builds timeline bars and top spikes from bucket totals', () => {
  expect(topTimelineSpikes([3, 30, 6]).map(item => item.index)).toEqual([1, 2, 0])
  const bars = buildOverviewTimelineBars([3, 6, 9], fmtTime, fmt)
  expect(bars).toHaveLength(3)
  expect(bars[0]).toMatchObject({ key: 'overview-timeline-0', label: '0s', value: '1' })
  expect(bars[2].height).toBe('100.0%')
})

it('groups pull dps bars with death and raise counts', () => {
  const bars = buildPullGroupDpsBars({ A: [3, 6], B: [9, 12] }, ['A', 'B'], [
    { targetName: 'A', targetId: '1', timestamp: 0, hpSamples: [] },
    { targetName: 'B', targetId: '2', timestamp: 4000, resurrectTime: 5000, hpSamples: [] },
  ], fmtTime)
  expect(bars.map(bar => [bar.value, bar.deathCount, bar.raiseCount])).toEqual([[4, 1, 0], [6, 1, 1]])
})

it('clusters deaths within fifteen seconds', () => {
  expect(deathClusters([
    { targetName: 'A', targetId: '1', timestamp: 1000, hpSamples: [] },
    { targetName: 'B', targetId: '2', timestamp: 12000, hpSamples: [] },
    { targetName: 'C', targetId: '3', timestamp: 40000, hpSamples: [] },
  ])).toEqual([{ start: 1000, end: 12000, count: 2 }])
})
